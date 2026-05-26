from datetime import date, timedelta

from django.conf import settings
from django.core.mail import send_mail
from django.core.management.base import BaseCommand
from django.db.models import Sum
from django.utils import timezone

from core.models import ConsumableRequest, ConsumableReturn


REMINDER_PHASES = {
    "before": {
        "offset": 1,
        "field": "return_reminder_before_sent_at",
        "subject": "Asset return reminder for tomorrow",
        "intro": "This is a reminder that your borrowed asset is due for return tomorrow.",
    },
    "due": {
        "offset": 0,
        "field": "return_reminder_due_sent_at",
        "subject": "Asset return reminder for today",
        "intro": "This is a reminder that your borrowed asset is due for return today.",
    },
    "after": {
        "offset": -1,
        "field": "return_reminder_after_sent_at",
        "subject": "Asset return overdue reminder",
        "intro": "This is a reminder that your borrowed asset was due for return yesterday.",
    },
}


class Command(BaseCommand):
    help = "Send loan asset return reminders one day before, on, and one day after the expected return date."

    def add_arguments(self, parser):
        parser.add_argument(
            "--date",
            dest="run_date",
            help="Run reminders as if today is this YYYY-MM-DD date. Defaults to the server local date.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show which reminders would be sent without sending emails or updating sent markers.",
        )

    def handle(self, *args, **options):
        run_date = self._parse_run_date(options.get("run_date"))
        dry_run = bool(options.get("dry_run"))
        sent_count = 0
        skipped_count = 0

        for phase, config in REMINDER_PHASES.items():
            target_date = run_date + timedelta(days=config["offset"])
            marker_field = str(config["field"])
            requests = (
                ConsumableRequest.objects.select_related("consumable", "employee")
                .filter(
                    status=ConsumableRequest.STATUS_APPROVED,
                    assignment_type=ConsumableRequest.ASSIGNMENT_TYPE_LOAN,
                    expected_return_date=target_date,
                    **{f"{marker_field}__isnull": True},
                )
                .order_by("id")
            )

            for request_item in requests:
                if self._remaining_quantity(request_item) <= 0:
                    skipped_count += 1
                    continue

                if not request_item.employee.email:
                    skipped_count += 1
                    self.stderr.write(
                        self.style.WARNING(
                            f"CR-{request_item.id}: skipped {phase} reminder because employee has no email."
                        )
                    )
                    continue

                if dry_run:
                    sent_count += 1
                    self.stdout.write(
                        f"DRY RUN: would send {phase} reminder for CR-{request_item.id} to {request_item.employee.email}"
                    )
                    continue

                self._send_reminder(request_item, phase, config)
                setattr(request_item, marker_field, timezone.now())
                request_item.save(update_fields=[marker_field, "updated_at"])
                sent_count += 1
                self.stdout.write(
                    self.style.SUCCESS(
                        f"Sent {phase} reminder for CR-{request_item.id} to {request_item.employee.email}"
                    )
                )

        self.stdout.write(
            self.style.SUCCESS(
                f"Asset return reminders complete. sent={sent_count}, skipped={skipped_count}, date={run_date.isoformat()}"
            )
        )

    def _parse_run_date(self, value: str | None) -> date:
        if not value:
            return timezone.localdate()
        try:
            return date.fromisoformat(value)
        except ValueError as error:
            raise SystemExit("--date must use YYYY-MM-DD format.") from error

    def _remaining_quantity(self, request_item: ConsumableRequest) -> int:
        returned_quantity = (
            ConsumableReturn.objects.filter(
                consumable_request=request_item,
                status__in=[ConsumableReturn.STATUS_PENDING, ConsumableReturn.STATUS_RECEIVED],
            ).aggregate(total=Sum("quantity"))["total"]
            or 0
        )
        return max(request_item.quantity - returned_quantity, 0)

    def _send_reminder(self, request_item: ConsumableRequest, phase: str, config: dict) -> None:
        item_name = request_item.consumable.item_name
        due_date = request_item.expected_return_date.isoformat() if request_item.expected_return_date else "the agreed date"
        subject = f"LEC IntelliSupport: {config['subject']}"
        message = "\n".join(
            [
                f"Hello {request_item.employee.name},",
                "",
                str(config["intro"]),
                "",
                f"Request: CR-{request_item.id}",
                f"Asset: {item_name}",
                f"Quantity: {request_item.quantity}",
                f"Expected return date: {due_date}",
                "",
                "Please return the asset to the consumables team or submit the return request in IntelliSupport.",
                "",
                "Thank you,",
                "LEC IntelliSupport",
            ]
        )
        send_mail(
            subject,
            message,
            settings.DEFAULT_FROM_EMAIL,
            [request_item.employee.email],
            fail_silently=False,
        )
