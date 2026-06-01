from unittest.mock import patch

from django.contrib.auth.hashers import make_password
from django.core import mail
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from .authentication import issue_auth_token
from .asset_return_reminders import send_due_asset_return_reminders
from .models import (
    BusinessHours,
    Consumable,
    ConsumableRequest,
    Notification,
    Technician,
    Ticket,
    TicketAssignmentHistory,
    User,
    WhatsAppInboundMessage,
)


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
        notification_email: str = "",
        password: str = "Password123!",
    ) -> Technician:
        user = self._create_user(name=name, email=email, role=User.ROLE_TECHNICIAN, password=password)
        return Technician.objects.create(
            user=user,
            skillset=Technician.SKILL_SOFTWARE,
            notification_email=notification_email,
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

    def test_new_ticket_uses_least_loaded_fallback_when_only_busy_technician_exists(self):
        technician = self._create_technician(
            name="Busy Technician",
            email="busy-tech@example.com",
            is_available=True,
        )
        for index in range(2):
            Ticket.objects.create(
                title=f"Existing outage {index + 1}",
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
        self.assertEqual(response.data["technician_id"], technician.id)
        self.assertIn("auto-assigned", response.data["routing_note"].lower())

    def test_new_ticket_auto_assigns_when_technician_has_capacity_for_second_ticket(self):
        technician = self._create_technician(
            name="Available Technician",
            email="available-tech@example.com",
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

        response = self.client.post("/api/tickets", self._create_ticket_payload(title="Email issue"), format="json")

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["technician_id"], technician.id)
        self.assertIn("auto-assigned", response.data["routing_note"].lower())
        self.assertNotIn("currently busy", response.data["routing_note"].lower())

    def test_new_ticket_assigns_active_fallback_when_none_are_checked_in(self):
        technician = self._create_technician(
            name="Checked Out Technician",
            email="checked-out-tech@example.com",
            is_available=False,
        )

        response = self.client.post("/api/tickets", self._create_ticket_payload(title="Monitor fault"), format="json")

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["technician_id"], technician.id)
        self.assertIn("auto-assigned", str(response.data.get("routing_note", "")).lower())

    def test_new_ticket_assigns_even_when_submitted_outside_schedule_if_active_technician_exists(self):
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
        self.assertIsNotNone(response.data["technician_id"])
        self.assertIn("auto-assigned", str(response.data.get("routing_note", "")).lower())

    def test_new_ticket_assigns_when_all_technicians_are_checked_out(self):
        self._create_technician(
            name="Checked Out One",
            email="checked-out-one@example.com",
            is_available=False,
        )
        self._create_technician(
            name="Checked Out Two",
            email="checked-out-two@example.com",
            is_available=False,
        )

        response = self.client.post("/api/tickets", self._create_ticket_payload(title="Scanner issue"), format="json")

        self.assertEqual(response.status_code, 201)
        self.assertIsNotNone(response.data["technician_id"])
        assigned_technician = Technician.objects.select_related("user").get(id=response.data["technician_id"])
        self.assertTrue(assigned_technician.user.is_active)

    def test_check_in_auto_assigns_waiting_ticket_and_notifies_employee(self):
        create_response = self.client.post("/api/tickets", self._create_ticket_payload(title="Printer offline"), format="json")
        self.assertEqual(create_response.status_code, 201)
        self.assertIsNone(create_response.data["technician_id"])

        technician = self._create_technician(
            name="Checked In Technician",
            email="checked-in-tech@example.com",
            is_available=False,
            password="SafePassword123!",
        )

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

    @override_settings(
        EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
        EMAIL_HOST_USER="noreply@example.com",
        EMAIL_HOST_PASSWORD="app-password",
        DEFAULT_FROM_EMAIL="noreply@example.com",
    )
    def test_check_in_assignment_email_uses_notification_email(self):
        technician = self._create_technician(
            name="Remote Technician",
            email="remote-tech@example.com",
            notification_email="remote-alerts@example.com",
            is_available=False,
            password="SafePassword123!",
        )

        create_response = self.client.post("/api/tickets", self._create_ticket_payload(title="Router down"), format="json")
        self.assertEqual(create_response.status_code, 201)

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
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["remote-alerts@example.com"])
        self.assertIn("Ticket #", mail.outbox[0].subject)
        self.assertIn("Router down", mail.outbox[0].body)
        self.assertIn("/login", mail.outbox[0].body)

    @override_settings(
        EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
        EMAIL_HOST_USER="noreply@example.com",
        EMAIL_HOST_PASSWORD="app-password",
        DEFAULT_FROM_EMAIL="noreply@example.com",
    )
    def test_due_asset_return_reminder_sends_for_approved_loan(self):
        requester = self._create_user(
            name="Loan User",
            email="loan-user@example.com",
            role=User.ROLE_EMPLOYEE,
        )
        request_item = ConsumableRequest.objects.create(
            consumable=Consumable.objects.create(item_name="laptops", quantity=1),
            employee=requester,
            quantity=1,
            assignment_type=ConsumableRequest.ASSIGNMENT_TYPE_LOAN,
            status=ConsumableRequest.STATUS_APPROVED,
            expected_return_date=timezone.localdate(),
        )

        result = send_due_asset_return_reminders(run_date=timezone.localdate())

        self.assertEqual(result["sent"], 1)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["loan-user@example.com"])
        self.assertIn(f"CR-{request_item.id}", mail.outbox[0].body)
        request_item.refresh_from_db()
        self.assertIsNotNone(request_item.return_reminder_due_sent_at)

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

    def test_signed_in_technician_can_check_in_without_resubmitting_password(self):
        technician = self._create_technician(
            name="Dashboard Technician",
            email="dashboard-tech@example.com",
            is_available=False,
            password="SafePassword123!",
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {issue_auth_token(technician.user)}")

        checkpoint_response = self.client.post(
            "/api/auth/technician-checkpoint",
            {
                "action": "check_in",
            },
            format="json",
        )

        self.assertEqual(checkpoint_response.status_code, 200)
        self.assertEqual(checkpoint_response.data["action"], "check_in")
        self.assertIn("checked in successfully", checkpoint_response.data["message"].lower())

        technician.refresh_from_db()
        self.assertTrue(technician.is_available)
        self.assertIsNotNone(technician.last_check_in_at)

    def test_technician_solved_status_auto_assigns_next_waiting_ticket(self):
        technician = self._create_technician(
            name="Queue Technician",
            email="queue-tech@example.com",
            is_available=True,
            password="SafePassword123!",
        )
        active_ticket = Ticket.objects.create(
            title="Current fault",
            description="Actively being handled.",
            category="Software",
            location="HQ",
            priority=Ticket.PRIORITY_HIGH,
            status=Ticket.STATUS_IN_PROCESS,
            employee=self.employee,
            caller_name=self.employee.name,
            technician=technician,
            reporter_reviewed_problem=True,
        )
        Ticket.objects.create(
            title="Second active fault",
            description="Second active issue.",
            category="Software",
            location="HQ",
            priority=Ticket.PRIORITY_MEDIUM,
            status=Ticket.STATUS_IN_PROCESS,
            employee=self.employee,
            caller_name=self.employee.name,
            technician=technician,
            reporter_reviewed_problem=True,
        )

        waiting_response = self.client.post(
            "/api/tickets",
            self._create_ticket_payload(title="Queued fault"),
            format="json",
        )
        self.assertEqual(waiting_response.status_code, 201)
        self.assertEqual(waiting_response.data["technician_id"], technician.id)

        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {issue_auth_token(technician.user)}")
        status_response = self.client.put(
            f"/api/tickets/{active_ticket.id}/status",
            {
                "status": "Solved",
                "technician_user_id": technician.user.id,
            },
            format="json",
        )

        self.assertEqual(status_response.status_code, 200)

        active_ticket.refresh_from_db()
        queued_ticket = Ticket.objects.get(id=waiting_response.data["id"])
        self.assertEqual(active_ticket.status, Ticket.STATUS_PENDING_REVIEW)
        self.assertEqual(queued_ticket.technician_id, technician.id)
        self.assertEqual(queued_ticket.status, Ticket.STATUS_PENDING)


class WhatsAppIntakeTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.employee = User.objects.create(
            name="WhatsApp Employee",
            email="whatsapp.employee@example.com",
            phone_number="+26662220000",
            branch="Maseru HQ",
            role=User.ROLE_EMPLOYEE,
            password_hash=make_password("Password123!"),
            is_active=True,
        )
        self.technician_user = User.objects.create(
            name="Network Technician",
            email="network.tech@example.com",
            role=User.ROLE_TECHNICIAN,
            password_hash=make_password("Password123!"),
            is_active=True,
        )
        self.technician = Technician.objects.create(
            user=self.technician_user,
            skillset=Technician.SKILL_NETWORK,
            is_available=True,
        )
        BusinessHours.objects.create(
            name="Default Business Hours",
            description="Test schedule",
            timezone_name="Africa/Maseru",
            groups=[BusinessHours.GROUP_ALL],
            weekly_schedule=open_all_day_schedule(),
            is_default=True,
        )

    def test_whatsapp_webhook_verification_uses_development_default_token(self):
        response = self.client.get(
            "/api/whatsapp/incoming",
            {
                "hub.mode": "subscribe",
                "hub.verify_token": "lec-whatsapp-verify-token",
                "hub.challenge": "meta-challenge-ok",
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content.decode(), "meta-challenge-ok")

    def _ai_draft(self, message: str, context: dict | None = None) -> dict:
        return {
            "title": "Internet outage in finance",
            "description": message,
            "category": "Network",
            "priority": "High",
            "asset": "Wi-Fi",
            "impact": "Finance team is blocked.",
            "confidence": 0.91,
        }

    @patch("core.views._call_ai_service_json")
    def test_twilio_whatsapp_message_creates_ticket_for_registered_employee(self, mock_ai):
        mock_ai.side_effect = lambda _path, payload: self._ai_draft(payload["message"], payload.get("context"))

        response = self.client.post(
            "/api/whatsapp/incoming",
            {
                "From": "whatsapp:+266 6222 0000",
                "Body": "Internet is down in finance and payroll cannot work.",
                "MessageSid": "SM-WA-001",
                "ProfileName": "WhatsApp Employee",
            },
            format="multipart",
            HTTP_ACCEPT="application/json",
        )

        self.assertEqual(response.status_code, 200)
        ticket = Ticket.objects.get(employee=self.employee)
        self.assertEqual(ticket.title, "Internet outage in finance")
        self.assertEqual(ticket.category, "Network")
        self.assertIn("Intake Channel: WhatsApp", ticket.description)
        self.assertIn("WhatsApp Sender: +26662220000", ticket.description)
        self.assertNotIn("Confidence", ticket.description)
        inbound = WhatsAppInboundMessage.objects.get(provider_message_id="SM-WA-001")
        self.assertEqual(inbound.status, WhatsAppInboundMessage.STATUS_TICKET_CREATED)
        self.assertEqual(inbound.ticket_id, ticket.id)

    @patch("core.views._call_ai_service_json")
    def test_meta_whatsapp_message_creates_ticket_for_registered_employee(self, mock_ai):
        mock_ai.side_effect = lambda _path, payload: self._ai_draft(payload["message"], payload.get("context"))

        response = self.client.post(
            "/api/whatsapp/incoming",
            {
                "object": "whatsapp_business_account",
                "entry": [
                    {
                        "id": "WHATSAPP-BUSINESS-ID",
                        "changes": [
                            {
                                "field": "messages",
                                "value": {
                                    "contacts": [
                                        {
                                            "wa_id": "26662220000",
                                            "profile": {"name": "WhatsApp Employee"},
                                        }
                                    ],
                                    "messages": [
                                        {
                                            "from": "26662220000",
                                            "id": "wamid.meta-001",
                                            "timestamp": "1710000000",
                                            "type": "text",
                                            "text": {"body": "Internet is down in finance."},
                                        }
                                    ],
                                },
                            }
                        ],
                    }
                ],
            },
            format="json",
            HTTP_ACCEPT="application/json",
        )

        self.assertEqual(response.status_code, 200)
        ticket = Ticket.objects.get(employee=self.employee)
        self.assertEqual(ticket.title, "Internet outage in finance")
        self.assertEqual(ticket.category, "Network")
        self.assertIn("Intake Channel: WhatsApp", ticket.description)
        self.assertIn("WhatsApp Sender Name: WhatsApp Employee", ticket.description)
        inbound = WhatsAppInboundMessage.objects.get(provider="meta", provider_message_id="wamid.meta-001")
        self.assertEqual(inbound.status, WhatsAppInboundMessage.STATUS_TICKET_CREATED)
        self.assertEqual(inbound.ticket_id, ticket.id)

    @patch("core.views._call_ai_service_json")
    def test_twilio_whatsapp_message_without_json_accept_returns_twiml_ack(self, mock_ai):
        mock_ai.side_effect = lambda _path, payload: self._ai_draft(payload["message"], payload.get("context"))

        response = self.client.post(
            "/api/whatsapp/incoming",
            {
                "From": "whatsapp:+26662220000",
                "Body": "Internet is down in finance.",
                "MessageSid": "SM-WA-TWIML",
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/xml")
        self.assertEqual(response.content.decode(), "<Response></Response>")
        self.assertTrue(
            WhatsAppInboundMessage.objects.filter(
                provider_message_id="SM-WA-TWIML",
                status=WhatsAppInboundMessage.STATUS_TICKET_CREATED,
            ).exists()
        )

    @patch("core.views._call_ai_service_json")
    def test_whatsapp_ticket_uses_manual_ticket_routing_and_notifications(self, mock_ai):
        message = "Internet is down in finance and payroll cannot work."
        mock_ai.side_effect = lambda _path, payload: self._ai_draft(payload["message"], payload.get("context"))

        manual_response = self.client.post(
            "/api/tickets",
            {
                "title": "Internet outage in finance",
                "description": message,
                "category": "Network",
                "priority": "High",
                "location": self.employee.branch,
                "department": "",
                "asset": "Wi-Fi",
                "impact": "Finance team is blocked.",
                "employee_id": self.employee.id,
                "reporter_reviewed_problem": True,
            },
            format="json",
        )
        whatsapp_response = self.client.post(
            "/api/whatsapp/incoming",
            {
                "From": "whatsapp:+26662220000",
                "Body": message,
                "MessageSid": "SM-WA-PARITY",
            },
            format="multipart",
            HTTP_ACCEPT="application/json",
        )

        self.assertEqual(manual_response.status_code, 201)
        self.assertEqual(whatsapp_response.status_code, 200)

        manual_ticket = Ticket.objects.get(id=manual_response.data["id"])
        whatsapp_ticket = WhatsAppInboundMessage.objects.select_related("ticket").get(
            provider_message_id="SM-WA-PARITY"
        ).ticket
        self.assertIsNotNone(whatsapp_ticket)

        for ticket in (manual_ticket, whatsapp_ticket):
            self.assertEqual(ticket.employee_id, self.employee.id)
            self.assertEqual(ticket.caller_name, self.employee.name)
            self.assertEqual(ticket.category, "Network")
            self.assertEqual(ticket.priority, "High")
            self.assertEqual(ticket.location, self.employee.branch)
            self.assertEqual(ticket.status, Ticket.STATUS_PENDING)
            self.assertEqual(ticket.technician_id, self.technician.id)
            self.assertTrue(ticket.reporter_reviewed_problem)
            self.assertTrue(
                TicketAssignmentHistory.objects.filter(
                    ticket=ticket,
                    technician=self.technician,
                    reason=TicketAssignmentHistory.REASON_AUTO_ASSIGN,
                ).exists()
            )
            self.assertTrue(Notification.objects.filter(user=self.employee, ticket=ticket).exists())
            self.assertTrue(Notification.objects.filter(user=self.technician_user, ticket=ticket).exists())

    @patch("core.views._call_ai_service_json")
    def test_duplicate_whatsapp_provider_message_does_not_create_second_ticket(self, mock_ai):
        mock_ai.side_effect = lambda _path, payload: self._ai_draft(payload["message"], payload.get("context"))
        payload = {
            "From": "whatsapp:+26662220000",
            "Body": "Internet is down in finance.",
            "MessageSid": "SM-WA-DUPLICATE",
        }

        first_response = self.client.post("/api/whatsapp/incoming", payload, format="multipart", HTTP_ACCEPT="application/json")
        second_response = self.client.post("/api/whatsapp/incoming", payload, format="multipart", HTTP_ACCEPT="application/json")

        self.assertEqual(first_response.status_code, 200)
        self.assertEqual(second_response.status_code, 200)
        self.assertEqual(Ticket.objects.filter(employee=self.employee).count(), 1)

    def test_unregistered_whatsapp_sender_is_captured_without_ticket(self):
        response = self.client.post(
            "/api/whatsapp/incoming",
            {
                "From": "whatsapp:+26669990000",
                "Body": "Printer is offline.",
                "MessageSid": "SM-WA-UNKNOWN",
            },
            format="multipart",
            HTTP_ACCEPT="application/json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(Ticket.objects.count(), 0)
        inbound = WhatsAppInboundMessage.objects.get(provider_message_id="SM-WA-UNKNOWN")
        self.assertEqual(inbound.status, WhatsAppInboundMessage.STATUS_NEEDS_REGISTRATION)
        self.assertEqual(inbound.sender_phone, "+26669990000")

    @patch("core.views._call_ai_service_json")
    def test_whatsapp_message_matches_employee_with_formatted_saved_phone(self, mock_ai):
        mock_ai.side_effect = lambda _path, payload: self._ai_draft(payload["message"], payload.get("context"))
        self.employee.phone_number = "+266 6222 0000"
        self.employee.save(update_fields=["phone_number"])

        response = self.client.post(
            "/api/whatsapp/incoming",
            {
                "From": "whatsapp:+26662220000",
                "Body": "Internet is down in finance.",
                "MessageSid": "SM-WA-FORMATTED-PHONE",
            },
            format="multipart",
            HTTP_ACCEPT="application/json",
        )

        self.assertEqual(response.status_code, 200)
        inbound = WhatsAppInboundMessage.objects.get(provider_message_id="SM-WA-FORMATTED-PHONE")
        self.assertEqual(inbound.status, WhatsAppInboundMessage.STATUS_TICKET_CREATED)
        self.assertEqual(inbound.employee_id, self.employee.id)

    @patch("core.views._call_ai_service_json")
    def test_twilio_whatsapp_message_uses_fallback_when_ai_response_is_invalid(self, mock_ai):
        mock_ai.side_effect = ValueError("AI service returned non-JSON HTML.")

        response = self.client.post(
            "/api/whatsapp/incoming",
            {
                "From": "whatsapp:+26662220000",
                "Body": "Internet is down in finance.",
                "MessageSid": "SM-WA-AI-FALLBACK",
            },
            format="multipart",
            HTTP_ACCEPT="application/json",
        )

        self.assertEqual(response.status_code, 200)
        ticket = Ticket.objects.get(employee=self.employee)
        self.assertEqual(ticket.title, "Internet is down in finance.")
        self.assertEqual(ticket.category, "Network")
        inbound = WhatsAppInboundMessage.objects.get(provider_message_id="SM-WA-AI-FALLBACK")
        self.assertEqual(inbound.status, WhatsAppInboundMessage.STATUS_TICKET_CREATED)
        self.assertEqual(inbound.ticket_id, ticket.id)
        self.assertEqual(response.data["results"][0]["result"]["whatsapp_draft_source"], "fallback")


class AiIntakeDraftTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.employee = User.objects.create(
            name="Draft Employee",
            email="draft.employee@example.com",
            branch="Maseru HQ",
            department="Finance",
            role=User.ROLE_EMPLOYEE,
            password_hash=make_password("Password123!"),
            is_active=True,
        )

    @patch("core.views._call_ai_service_json")
    def test_text_intake_returns_fallback_draft_when_ai_service_is_unavailable(self, mock_ai):
        mock_ai.side_effect = ConnectionError("AI service is unreachable.")

        response = self.client.post(
            "/api/ai-intake/draft",
            {
                "message": "My laptop cannot connect to email.",
                "user_id": self.employee.id,
                "channel": "employee_text",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["intake_mode"], "manual")
        self.assertEqual(response.data["confidence"], 0)
        self.assertEqual(response.data["draft"]["branch"], self.employee.branch)
        self.assertEqual(response.data["draft"]["department"], self.employee.department)
        follow_up_text = " ".join(response.data["follow_up_questions"]).lower()
        self.assertNotIn("business impact", follow_up_text)
        self.assertNotIn("category", follow_up_text)
        self.assertNotIn("priority", follow_up_text)


class NotificationListTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create(
            name="Notification User",
            email="notify@example.com",
            role=User.ROLE_EMPLOYEE,
            password_hash=make_password("Password123!"),
            is_active=True,
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {issue_auth_token(self.user)}")

    def test_notifications_endpoint_returns_only_unread_items(self):
        read_notification = Notification.objects.create(
            user=self.user,
            message="Already opened",
            type=Notification.TYPE_SYSTEM,
            is_read=True,
            read_at=timezone.now(),
        )
        unread_notification = Notification.objects.create(
            user=self.user,
            message="Still unread",
            type=Notification.TYPE_SYSTEM,
            is_read=False,
        )

        response = self.client.get("/api/notifications")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["unread_count"], 1)
        returned_ids = [item["id"] for item in response.data["notifications"]]
        self.assertIn(unread_notification.id, returned_ids)
        self.assertNotIn(read_notification.id, returned_ids)
