from dataclasses import dataclass

from django.core.cache import cache
from django.utils import timezone

from .models import Ticket, TicketAssignmentHistory, TicketComment, User
from .sla_config import (
    ACCEPTANCE_SLA_MINUTES,
    ESCALATION_THRESHOLD_MINUTES,
    REASSIGN_THRESHOLD_MINUTES,
    REASSIGNMENT_MIN_SELECTION_SCORE,
    REASSIGNMENT_SCORE_MARGIN,
    SLA_WARNING_RATIO,
)


@dataclass(frozen=True)
class SlaActionResult:
    action: str = "none"
    message: str = ""


def _minutes_since(moment) -> float:
    if not moment:
        return 0.0
    return max((timezone.now() - moment).total_seconds() / 60.0, 0.0)


def _warning_cache_key(ticket: Ticket, stage: str, reference_value: str) -> str:
    return f"lec-intellisupport:sla:{stage}:{ticket.id}:{reference_value}"


def _warning_threshold_minutes() -> int:
    return max(1, int(round(ESCALATION_THRESHOLD_MINUTES * SLA_WARNING_RATIO)))


def _notify_role_users(role: str, message: str, ticket: Ticket) -> None:
    from .views import _notify_user

    for user in User.objects.filter(role=role, is_active=True):
        _notify_user(user, message, ticket=ticket)


def _send_sla_warning(ticket: Ticket, *, elapsed_minutes: float, reference_moment) -> SlaActionResult:
    if ticket.priority not in {Ticket.PRIORITY_HIGH, Ticket.PRIORITY_CRITICAL}:
        return SlaActionResult()

    warning_threshold = _warning_threshold_minutes()
    if elapsed_minutes < warning_threshold:
        return SlaActionResult()

    reference_value = reference_moment.isoformat() if reference_moment else "no-reference"
    cache_key = _warning_cache_key(ticket, "warning", reference_value)
    if not cache.add(cache_key, "1", timeout=max(ESCALATION_THRESHOLD_MINUTES * 60, 60)):
        return SlaActionResult()

    from .views import _notify_user

    warning_message = (
        f"Ticket #{ticket.id} is nearing the SLA threshold for inactivity "
        f"({int(round(elapsed_minutes))} minutes without progress)."
    )
    if ticket.technician_id:
        _notify_user(ticket.technician.user, warning_message, ticket=ticket)
    _notify_role_users(User.ROLE_ADMIN_FAULT, warning_message, ticket)
    return SlaActionResult(action="warning", message=warning_message)


def auto_accept_ticket(ticket: Ticket, *, reason: str | None = None) -> SlaActionResult:
    if not ticket.technician_id:
        return SlaActionResult(action="none", message="Ticket has no assigned technician to auto-accept.")

    from .views import _add_internal_ticket_message, _notify_user, _resolve_system_actor_for_ticket

    now = timezone.now()
    acceptance_reason = (reason or "no alternate technician was available within the SLA window.").strip()
    update_fields = ["accepted_at", "last_activity_at", "updated_at"]
    ticket.accepted_at = now
    ticket.last_activity_at = now
    if ticket.status == Ticket.STATUS_PENDING:
        ticket.status = Ticket.STATUS_IN_PROCESS
        update_fields.append("status")
    ticket.save(update_fields=update_fields)

    actor = _resolve_system_actor_for_ticket(ticket)
    TicketComment.objects.create(
        ticket=ticket,
        author=actor or ticket.technician.user,
        comment=f"System auto-accepted the ticket because {acceptance_reason}",
    )
    _add_internal_ticket_message(
        ticket,
        f"System auto-accepted the ticket because {acceptance_reason}",
        actor=actor,
    )

    _notify_user(
        ticket.technician.user,
        f"Ticket #{ticket.id} was auto-accepted by the SLA engine because {acceptance_reason}",
        ticket=ticket,
    )
    _notify_user(
        ticket.employee,
        f"Ticket #{ticket.id} automatically moved to In Progress after an SLA review.",
        ticket=ticket,
    )
    _notify_role_users(
        User.ROLE_ADMIN_FAULT,
        f"Ticket #{ticket.id} was auto-accepted because {acceptance_reason}",
        ticket,
    )
    return SlaActionResult(action="auto_accepted", message="Ticket auto-accepted after the acceptance SLA expired.")


def _should_keep_current_assignment(
    ticket: Ticket,
    *,
    current_profile: dict[str, object] | None,
    next_profile: dict[str, object] | None,
) -> tuple[bool, str]:
    if not next_profile:
        return True, "no alternate technician was available within the SLA window."

    next_score = float(next_profile.get("selection_score", 0.0))
    next_pending = int(next_profile.get("pending_acceptance_count", 0))
    next_overdue = int(next_profile.get("overdue_acceptance_count", 0))

    if next_score < REASSIGNMENT_MIN_SELECTION_SCORE:
        return True, "no materially stronger alternate technician was available within the SLA window."

    if current_profile is None:
        return False, ""

    current_score = float(current_profile.get("selection_score", 0.0))
    current_pending = int(current_profile.get("pending_acceptance_count", 0))
    current_overdue = int(current_profile.get("overdue_acceptance_count", 0))
    current_available = bool(current_profile.get("is_available", False))

    if not current_available or current_overdue > 0:
        return False, ""

    if next_score >= current_score + REASSIGNMENT_SCORE_MARGIN:
        return False, ""

    if next_overdue == 0 and next_pending + 1 < current_pending:
        return False, ""

    if (
        ticket.priority in {Ticket.PRIORITY_HIGH, Ticket.PRIORITY_CRITICAL}
        and next_overdue == 0
        and next_pending < current_pending
        and next_score >= current_score
    ):
        return False, ""

    return True, "the current technician remained the strongest practical owner after live queue balancing."


def auto_reassign(ticket: Ticket) -> SlaActionResult:
    if not ticket.technician_id:
        return SlaActionResult(action="none", message="Ticket has no current technician to reassign.")

    from .views import (
        _assign_ticket_to_technician,
        _notify_user,
        _previously_assigned_technician_ids,
        _rank_technicians_for_ticket,
        _resolve_system_actor_for_ticket,
    )

    previous_technician = ticket.technician
    excluded_technician_ids = _previously_assigned_technician_ids(ticket)
    next_profiles, inferred_domain = _rank_technicians_for_ticket(
        category=ticket.category,
        title=ticket.title,
        description=ticket.description,
        exclude_technician_ids=excluded_technician_ids,
        allow_unavailable_fallback=False,
        routing_context="reassignment",
    )
    current_profiles, _ = _rank_technicians_for_ticket(
        category=ticket.category,
        title=ticket.title,
        description=ticket.description,
        allow_unavailable_fallback=True,
        routing_context="reassignment",
        candidate_technicians=[previous_technician],
    )

    next_profile = next_profiles[0] if next_profiles else None
    current_profile = current_profiles[0] if current_profiles else None
    keep_current_assignment, keep_reason = _should_keep_current_assignment(
        ticket,
        current_profile=current_profile,
        next_profile=next_profile,
    )
    if keep_current_assignment:
        return auto_accept_ticket(ticket, reason=keep_reason)

    next_technician = next_profile["technician"]
    has_exact_skill_match = bool(next_profile.get("exact_match", False))

    reassignment_time = timezone.now()
    _assign_ticket_to_technician(
        ticket,
        next_technician,
        assigned_at=reassignment_time,
        status_value=Ticket.STATUS_PENDING,
        increment_reassign=True,
        history_reason=TicketAssignmentHistory.REASON_AUTO_REASSIGN,
        history_note="Automatic reassignment triggered by the acceptance SLA engine.",
    )

    actor = _resolve_system_actor_for_ticket(ticket)
    TicketComment.objects.create(
        ticket=ticket,
        author=actor or next_technician.user,
        comment=(
            f"System auto-reassigned the ticket to {next_technician.user.name} "
            "after the acceptance SLA elapsed without technician acceptance."
        ),
    )

    if previous_technician.user_id != next_technician.user_id:
        _notify_user(
            previous_technician.user,
            f"Ticket #{ticket.id} was auto-reassigned to {next_technician.user.name} after the acceptance SLA elapsed.",
            ticket=ticket,
        )
    _notify_user(
        next_technician.user,
        f"Ticket #{ticket.id} was auto-reassigned to you and is awaiting acceptance.",
        ticket=ticket,
    )

    if has_exact_skill_match:
        routing_note = "skill-match routing"
    elif inferred_domain:
        routing_note = f"workload fallback for {inferred_domain} queue"
    else:
        routing_note = "workload balancing"
    routing_note = (
        f"{routing_note}; readiness score {float(next_profile.get('reassignment_readiness_score', 0.5)):.2f}"
    )

    _notify_role_users(
        User.ROLE_ADMIN_FAULT,
        f"Ticket #{ticket.id} was auto-reassigned to {next_technician.user.name} by the SLA engine ({routing_note}).",
        ticket,
    )
    return SlaActionResult(action="reassigned", message=f"Ticket auto-reassigned to {next_technician.user.name}.")


def escalate_ticket(ticket: Ticket, *, reason: str = "", force_admin_fault: bool = False) -> SlaActionResult:
    from .views import _add_internal_ticket_message, _extract_ticket_business_impact, _notify_user

    business_impact = _extract_ticket_business_impact(ticket)
    target_roles = [User.ROLE_ADMIN_FAULT]
    target_label = "Admin Fault"

    if not force_admin_fault and (
        ("multiple" in business_impact and "user" in business_impact)
        or "branch" in business_impact
    ):
        target_roles = [User.ROLE_MANAGER, User.ROLE_ADMIN_FAULT]
        target_label = "Manager"
    elif ticket.reassign_count >= 2:
        target_roles = [User.ROLE_ADMIN_FAULT]
        target_label = "Admin Fault"
    elif ticket.priority in {Ticket.PRIORITY_HIGH, Ticket.PRIORITY_CRITICAL}:
        target_roles = [User.ROLE_ADMIN_FAULT]
        target_label = "Admin Fault"

    escalation_reason = reason or "Ticket escalated due to SLA risk."
    escalation_time = timezone.now()
    ticket.escalation_level += 1
    ticket.last_activity_at = escalation_time
    ticket.save(update_fields=["escalation_level", "last_activity_at", "updated_at"])

    _add_internal_ticket_message(
        ticket,
        (
            f"Ticket escalated due to SLA risk. Target: {target_label}. "
            f"Reason: {escalation_reason}"
        ),
    )

    for role in target_roles:
        _notify_role_users(
            role,
            f"Ticket #{ticket.id} escalated to {target_label} due to SLA risk. {escalation_reason}",
            ticket,
        )

    if ticket.technician_id:
        _notify_user(
            ticket.technician.user,
            f"Ticket #{ticket.id} was escalated to {target_label} due to SLA risk.",
            ticket=ticket,
        )

    return SlaActionResult(action="escalated", message=f"Ticket escalated to {target_label}.")


def check_ticket_sla(ticket: Ticket) -> SlaActionResult:
    normalized_status = ticket.status.strip()
    inactive_statuses = {
        Ticket.STATUS_PENDING_REVIEW,
        Ticket.STATUS_SOLVED,
        Ticket.LEGACY_STATUS_RESOLVED,
    }
    if normalized_status in inactive_statuses:
        return SlaActionResult()

    if not ticket.technician_id:
        return SlaActionResult(action="none", message="Ticket is in the admin queue and has no technician SLA to enforce.")

    acceptance_reference = ticket.assigned_at or ticket.created_at
    acceptance_threshold = max(ACCEPTANCE_SLA_MINUTES, REASSIGN_THRESHOLD_MINUTES)
    if ticket.accepted_at is None and _minutes_since(acceptance_reference) > acceptance_threshold:
        return auto_reassign(ticket)

    activity_reference = ticket.last_activity_at or ticket.accepted_at
    if not activity_reference:
        return SlaActionResult()

    elapsed_minutes = _minutes_since(activity_reference)
    warning_result = _send_sla_warning(ticket, elapsed_minutes=elapsed_minutes, reference_moment=activity_reference)
    if ticket.priority in {Ticket.PRIORITY_HIGH, Ticket.PRIORITY_CRITICAL} and elapsed_minutes >= _warning_threshold_minutes():
        return escalate_ticket(
            ticket,
            reason="High-priority ticket is nearing the inactivity SLA threshold.",
            force_admin_fault=True,
        )

    if elapsed_minutes > ESCALATION_THRESHOLD_MINUTES:
        return escalate_ticket(ticket, reason="Ticket exceeded the inactivity SLA threshold.")

    return warning_result
