from django.contrib.auth.hashers import make_password
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from .models import BusinessHours, Notification, Technician, Ticket, User


DAY_KEYS = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
]


def open_all_day_schedule() -> dict[str, dict[str, str | bool]]:
    return {
        day: {"enabled": True, "start": "00:00", "end": "23:59"}
        for day in DAY_KEYS
    }


def default_working_hours_schedule() -> dict[str, dict[str, str | bool]]:
    return {
        "monday": {"enabled": True, "start": "08:00", "end": "16:30"},
        "tuesday": {"enabled": True, "start": "08:00", "end": "16:30"},
        "wednesday": {"enabled": True, "start": "08:00", "end": "16:30"},
        "thursday": {"enabled": True, "start": "08:00", "end": "16:30"},
        "friday": {"enabled": True, "start": "08:00", "end": "16:30"},
        "saturday": {"enabled": False, "start": "08:00", "end": "16:30"},
        "sunday": {"enabled": False, "start": "08:00", "end": "16:30"},
    }


class TicketAutoAssignmentTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.employee = self._create_user(
            name="Employee One",
            email="employee@example.com",
            role=User.ROLE_EMPLOYEE,
        )
        self.business_hours = BusinessHours.objects.create(
            name="Default Business Hours",
            description="Test schedule",
            timezone_name="Africa/Maseru",
            groups=[BusinessHours.GROUP_ALL],
            weekly_schedule=open_all_day_schedule(),
            is_default=True,
        )

    def _create_user(self, *, name: str, email: str, role: str, password: str = "Password123!") -> User:
        return User.objects.create(
            name=name,
            email=email,
            role=role,
            password_hash=make_password(password),
            is_active=True,
        )

    def _create_technician(
        self,
        *,
        name: str,
        email: str,
        is_available: bool,
        password: str = "Password123!",
    ) -> Technician:
        user = self._create_user(name=name, email=email, role=User.ROLE_TECHNICIAN, password=password)
        return Technician.objects.create(
            user=user,
            skillset=Technician.SKILL_SOFTWARE,
            is_available=is_available,
        )

    def _create_ticket_payload(self, *, title: str = "Laptop not connecting") -> dict:
        return {
            "title": title,
            "description": "Device cannot connect to the office systems.",
            "location": "HQ",
            "employee_id": self.employee.id,
            "reporter_reviewed_problem": True,
        }

    def test_new_ticket_waits_in_queue_when_only_available_technician_is_already_busy(self):
        technician = self._create_technician(
            name="Busy Technician",
            email="busy-tech@example.com",
            is_available=True,
        )
        Ticket.objects.create(
            title="Existing outage",
            description="Already working on another issue.",
            category="Software",
            location="HQ",
            priority=Ticket.PRIORITY_HIGH,
            status=Ticket.STATUS_IN_PROCESS,
            employee=self.employee,
            caller_name=self.employee.name,
            technician=technician,
            reporter_reviewed_problem=True,
        )

        response = self.client.post("/api/tickets", self._create_ticket_payload(), format="json")

        self.assertEqual(response.status_code, 201)
        self.assertIsNone(response.data["technician_id"])
        self.assertIn("Technicians are currently busy", response.data["routing_note"])

    def test_new_ticket_mentions_working_hours_when_submitted_outside_schedule(self):
        schedule = default_working_hours_schedule()
        current_day_key = DAY_KEYS[timezone.localtime().weekday()]
        schedule[current_day_key]["enabled"] = False
        self.business_hours.weekly_schedule = schedule
        self.business_hours.save(update_fields=["weekly_schedule", "updated_at"])

        self._create_technician(
            name="Available Technician",
            email="after-hours-tech@example.com",
            is_available=True,
        )

        response = self.client.post("/api/tickets", self._create_ticket_payload(title="Projector fault"), format="json")

        self.assertEqual(response.status_code, 201)
        self.assertIsNone(response.data["technician_id"])
        self.assertIn("08:00 to 16:30", response.data["routing_note"])
        self.assertIn("working hours", response.data["routing_note"].lower())

    def test_check_in_auto_assigns_waiting_ticket_and_notifies_employee(self):
        technician = self._create_technician(
            name="Checked In Technician",
            email="checked-in-tech@example.com",
            is_available=False,
            password="SafePassword123!",
        )

        create_response = self.client.post("/api/tickets", self._create_ticket_payload(title="Printer offline"), format="json")
        self.assertEqual(create_response.status_code, 201)
        self.assertIsNone(create_response.data["technician_id"])

        checkpoint_response = self.client.post(
            "/api/auth/technician-checkpoint",
            {
                "email": technician.user.email,
                "password": "SafePassword123!",
                "action": "check_in",
            },
            format="json",
        )

        self.assertEqual(checkpoint_response.status_code, 200)

        queued_ticket = Ticket.objects.get(id=create_response.data["id"])
        self.assertEqual(queued_ticket.technician_id, technician.id)
        self.assertEqual(queued_ticket.status, Ticket.STATUS_PENDING)
        self.assertIn(f"Ticket #{queued_ticket.id}", checkpoint_response.data["assignment_note"])

        self.assertTrue(
            Notification.objects.filter(
                user=self.employee,
                ticket=queued_ticket,
                message__icontains=technician.user.name,
            ).exists()
        )

    def test_check_out_returns_confirmation_feedback(self):
        technician = self._create_technician(
            name="Checked Out Technician",
            email="checked-out-tech@example.com",
            is_available=True,
            password="SafePassword123!",
        )

        checkpoint_response = self.client.post(
            "/api/auth/technician-checkpoint",
            {
                "email": technician.user.email,
                "password": "SafePassword123!",
                "action": "check_out",
            },
            format="json",
        )

        self.assertEqual(checkpoint_response.status_code, 200)
        self.assertEqual(checkpoint_response.data["action"], "check_out")
        self.assertIn("checked out successfully", checkpoint_response.data["message"].lower())
        self.assertIn("check-out has been recorded", checkpoint_response.data["assignment_note"].lower())

        technician.refresh_from_db()
        self.assertFalse(technician.is_available)
        self.assertIsNotNone(technician.last_check_out_at)
