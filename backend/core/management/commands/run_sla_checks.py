from collections import Counter
from time import sleep

from django.core.management.base import BaseCommand

from core.models import Ticket
from core.sla_engine import check_ticket_sla


ACTIVE_TICKET_STATUSES = {
    Ticket.STATUS_PENDING,
    Ticket.STATUS_IN_PROCESS,
    Ticket.LEGACY_STATUS_OPEN,
    Ticket.LEGACY_STATUS_IN_PROGRESS,
    Ticket.LEGACY_STATUS_PENDING_VENDOR,
}


class Command(BaseCommand):
    help = "Run SLA checks for active tickets and trigger reassignment, warnings, or escalations."

    def add_arguments(self, parser):
        parser.add_argument(
            "--loop",
            action="store_true",
            help="Keep running the SLA checks on an interval instead of exiting after one pass.",
        )
        parser.add_argument(
            "--sleep-seconds",
            type=int,
            default=300,
            help="Seconds to wait between SLA passes when --loop is used. Defaults to 300 seconds.",
        )

    def handle(self, *args, **options):
        loop = bool(options["loop"])
        sleep_seconds = max(int(options["sleep_seconds"]), 30)

        while True:
            counters = self._run_once()
            processed = sum(counters.values())
            self.stdout.write(
                self.style.SUCCESS(
                    "SLA checks complete. "
                    f"processed={processed}, "
                    f"reassigned={counters.get('reassigned', 0)}, "
                    f"auto_accepted={counters.get('auto_accepted', 0)}, "
                    f"escalated={counters.get('escalated', 0)}, "
                    f"warnings={counters.get('warning', 0)}, "
                    f"unchanged={counters.get('none', 0)}"
                )
            )

            if not loop:
                break

            sleep(sleep_seconds)

    def _run_once(self) -> Counter:
        counters: Counter = Counter()
        tickets = (
            Ticket.objects.select_related("employee", "technician__user", "logged_by_admin")
            .filter(status__in=ACTIVE_TICKET_STATUSES)
            .order_by("id")
        )

        for ticket in tickets:
            try:
                result = check_ticket_sla(ticket)
            except Exception as error:  # pragma: no cover - keep the worker resilient
                counters["error"] += 1
                self.stderr.write(
                    self.style.ERROR(f"Ticket #{ticket.id}: SLA evaluation failed with error: {error}")
                )
                continue

            counters[result.action or "none"] += 1

        return counters
