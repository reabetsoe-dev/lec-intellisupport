from datetime import date, timedelta

from django.conf import settings
from django.core.mail import send_mail
from django.db.models import Sum
from django.utils import timezone

from .models import ConsumableRequest, ConsumableReturn


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


def remaining_return_quantity(request_item: ConsumableRequest) -> int:
    returned_quantity = (
        ConsumableReturn.objects.filter(
            consumable_request=request_item,
            status__in=[ConsumableReturn.STATUS_PENDING, ConsumableReturn.STATUS_RECEIVED],
        ).aggregate(total=Sum("quantity"))["total"]
        or 0
    )
    return max(request_item.quantity - returned_quantity, 0)


def send_asset_return_reminder(request_item: ConsumableRequest, config: dict) -> None:
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


def send_due_asset_return_reminders(run_date: date | None = None, *, dry_run: bool = False) -> dict[str, int | str]:
    today = run_date or timezone.localdate()
    sent_count = 0
    skipped_count = 0

    for config in REMINDER_PHASES.values():
        target_date = today + timedelta(days=config["offset"])
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
            if remaining_return_quantity(request_item) <= 0 or not request_item.employee.email:
                skipped_count += 1
                continue

            if not dry_run:
                send_asset_return_reminder(request_item, config)
                setattr(request_item, marker_field, timezone.now())
                request_item.save(update_fields=[marker_field, "updated_at"])

            sent_count += 1

    return {
        "sent": sent_count,
        "skipped": skipped_count,
        "date": today.isoformat(),
    }
