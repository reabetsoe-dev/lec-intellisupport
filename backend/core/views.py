import logging
import secrets
import os
import json
import hashlib
import re
from datetime import date, datetime, time, timedelta
from decimal import Decimal, InvalidOperation
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from urllib import request as urllib_request
from urllib.error import URLError, HTTPError
from smtplib import SMTPException
from django.utils import timezone

from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.contrib.auth.password_validation import validate_password
from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.core.mail import send_mail
from django.db import IntegrityError, transaction
from django.db.utils import OperationalError
from django.db.models.deletion import ProtectedError
from django.db.models import Count, Q, Sum
from rest_framework import status
from rest_framework.decorators import api_view, parser_classes
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from .authentication import issue_auth_token
from .models import (
    BusinessHoliday,
    BusinessHours,
    BusinessLeave,
    Consumable,
    ConsumableReturn,
    ConsumableRequest,
    InventoryAssignment,
    Notification,
    PasswordResetToken,
    Technician,
    TechnicianActivityLog,
    Ticket,
    TicketAssignmentHistory,
    TicketComment,
    TicketMessage,
    TicketMaterialRequest,
    User,
    UserInvite,
)
from .sla_config import (
    ACCEPTANCE_SLA_MINUTES,
    ESCALATION_THRESHOLD_MINUTES,
    REASSIGN_THRESHOLD_MINUTES,
    REASSIGNMENT_RECENT_ASSIGNMENTS_WINDOW_MINUTES,
)

logger = logging.getLogger(__name__)

AI_INTAKE_CONFIDENCE_DIRECT = 0.8
AI_INTAKE_CONFIDENCE_FOLLOW_UP = 0.5
DEPARTMENT_LINE_PATTERN = re.compile(r"(?:^|\n)\s*Department:\s*([^\n\r]+)", re.IGNORECASE)
BUSINESS_IMPACT_LINE_PATTERN = re.compile(r"(?:^|\n)\s*Business Impact:\s*([^\n\r]+)", re.IGNORECASE)
CORE_AI_CATEGORIES = {
    Technician.SKILL_HARDWARE,
    Technician.SKILL_SOFTWARE,
    Technician.SKILL_NETWORK,
    Technician.SKILL_SECURITY,
}
CORE_AI_PRIORITIES = {choice for choice, _label in Ticket.PRIORITY_CHOICES}


def _to_optional_bool(value):
    if value in (None, ""):
        return None
    if isinstance(value, bool):
        return value
    text = str(value).strip().lower()
    if text in ("1", "true", "yes", "y"):
        return True
    if text in ("0", "false", "no", "n"):
        return False
    return None


def _to_optional_date(value):
    if value in (None, ""):
        return None
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value).strip())
    except ValueError:
        return None


def _to_optional_decimal(value):
    if value in (None, ""):
        return None
    text = str(value).replace(",", "").strip()
    if text.startswith("M"):
        text = text[1:].strip()
    try:
        return Decimal(text)
    except (InvalidOperation, ValueError):
        return None


def _normalize_ai_ticket_category(value: str | None) -> str | None:
    normalized = str(value or "").strip().lower()
    if normalized == Technician.SKILL_HARDWARE.lower():
        return Technician.SKILL_HARDWARE
    if normalized == Technician.SKILL_SOFTWARE.lower():
        return Technician.SKILL_SOFTWARE
    if normalized == Technician.SKILL_NETWORK.lower():
        return Technician.SKILL_NETWORK
    if normalized == Technician.SKILL_SECURITY.lower():
        return Technician.SKILL_SECURITY
    return None


def _normalize_ai_ticket_priority(value: str | None) -> str | None:
    normalized = str(value or "").strip().lower()
    if normalized == "critical" or normalized == "urgent":
        return Ticket.PRIORITY_CRITICAL
    if normalized == "high":
        return Ticket.PRIORITY_HIGH
    if normalized == "medium":
        return Ticket.PRIORITY_MEDIUM
    if normalized == "low":
        return Ticket.PRIORITY_LOW
    return None


def _extract_department_from_text(text: str) -> str:
    if not text:
        return ""
    match = DEPARTMENT_LINE_PATTERN.search(text)
    if not match:
        return ""
    return match.group(1).strip()


def _infer_user_department(user: User) -> str:
    if not user:
        return ""

    latest_request = (
        ConsumableRequest.objects.filter(employee=user)
        .exclude(department="")
        .order_by("-created_at")
        .first()
    )
    if latest_request and latest_request.department:
        return latest_request.department.strip()

    recent_descriptions = (
        Ticket.objects.filter(employee=user)
        .exclude(description="")
        .order_by("-created_at")
        .values_list("description", flat=True)[:5]
    )
    for description in recent_descriptions:
        department = _extract_department_from_text(str(description or ""))
        if department:
            return department

    return ""


def _recent_tickets_for_user(user: User, limit: int = 5) -> list[dict]:
    recent_tickets = (
        Ticket.objects.filter(employee=user)
        .order_by("-created_at")[:limit]
    )
    return [
        {
            "id": ticket.id,
            "title": ticket.title,
            "category": ticket.category,
            "priority": ticket.priority,
            "status": ticket.status,
            "location": ticket.location,
            "created_at": ticket.created_at.isoformat(),
        }
        for ticket in recent_tickets
    ]


def _possible_asset_match_for_user(user: User, narrative: str) -> dict | None:
    normalized_narrative = str(narrative or "").strip().lower()
    if not normalized_narrative:
        return None

    assignments = (
        InventoryAssignment.objects.select_related("consumable")
        .filter(employee=user)
        .order_by("-assigned_at")[:5]
    )
    for assignment in assignments:
        consumable = assignment.consumable
        searchable_terms = [
            consumable.item_name,
            consumable.asset_tag,
            consumable.serial_number,
            consumable.brand,
            consumable.model_number,
        ]
        if any(term and term.strip().lower() in normalized_narrative for term in searchable_terms):
            display_name = consumable.item_name
            if consumable.asset_tag:
                display_name = f"{display_name} ({consumable.asset_tag})"
            return {
                "id": consumable.id,
                "display_name": display_name,
                "item_name": consumable.item_name,
            }

    generic_keyword_map = {
        "laptop": ("laptop", "notebook", "computer"),
        "printer": ("printer", "toner", "paper jam"),
        "monitor": ("monitor", "display", "screen"),
        "mouse": ("mouse",),
        "keyboard": ("keyboard",),
    }
    for assignment in assignments:
        item_name = assignment.consumable.item_name.strip()
        if not item_name:
            continue
        for keyword, aliases in generic_keyword_map.items():
            if keyword in item_name.lower() and any(alias in normalized_narrative for alias in aliases):
                display_name = item_name
                if assignment.consumable.asset_tag:
                    display_name = f"{display_name} ({assignment.consumable.asset_tag})"
                return {
                    "id": assignment.consumable.id,
                    "display_name": display_name,
                    "item_name": item_name,
                }

    return None


def enrich_context(data: dict, user: User) -> dict:
    department = str(data.get("department", "")).strip() or _infer_user_department(user)
    branch = str(data.get("branch", "")).strip() or user.branch.strip()
    message = str(data.get("message", "")).strip()
    possible_asset_match = _possible_asset_match_for_user(user, message)

    return {
        "branch": branch,
        "department": department,
        "recent_tickets": _recent_tickets_for_user(user),
        "possible_asset_match": possible_asset_match,
        "channel": str(data.get("channel", "")).strip(),
        "caller_name": str(data.get("caller_name", "")).strip(),
        "reporter_name": user.name,
        "reporter_email": user.email,
    }


def _build_follow_up_questions(draft: dict, confidence: float) -> list[str]:
    questions: list[str] = []

    if not str(draft.get("asset", "")).strip():
        questions.append("Which device, application, or service is affected?")
    if not str(draft.get("impact", "")).strip():
        questions.append("What business impact is this causing, and how many users are affected?")
    if not str(draft.get("branch", "")).strip():
        questions.append("Which branch or location should we attach to this ticket?")
    if not str(draft.get("department", "")).strip():
        questions.append("Which department is the reporter calling from?")

    if confidence < AI_INTAKE_CONFIDENCE_FOLLOW_UP and not questions:
        questions.append("Please review the draft carefully and correct the title, description, category, and priority before submitting.")

    return questions[:3]


def _compose_ticket_description(
    description: str,
    *,
    location: str = "",
    department: str = "",
    asset: str = "",
    impact: str = "",
) -> str:
    cleaned_description = str(description or "").strip()
    if not cleaned_description:
        return ""

    metadata_lines: list[str] = []
    normalized_description = cleaned_description.lower()
    metadata_candidates = [
        ("Branch", location),
        ("Department", department),
        ("Affected Asset", asset),
        ("Business Impact", impact),
    ]
    for label, raw_value in metadata_candidates:
        value = str(raw_value or "").strip()
        if not value:
            continue
        line = f"{label}: {value}"
        if line.lower() not in normalized_description:
            metadata_lines.append(line)

    if not metadata_lines:
        return cleaned_description
    return f"{cleaned_description}\n\n" + "\n".join(metadata_lines)


def _call_ai_service_json(path: str, payload: dict, *, timeout: int = 10) -> dict:
    ai_base_url = os.getenv("AI_SERVICE_URL", "http://127.0.0.1:8001").rstrip("/")
    ai_service_url = f"{ai_base_url}{path}"
    request_body = json.dumps(payload).encode("utf-8")
    request_object = urllib_request.Request(
        ai_service_url,
        data=request_body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib_request.urlopen(request_object, timeout=timeout) as response:
            raw_body = response.read().decode("utf-8")
            data = json.loads(raw_body) if raw_body else {}
            if isinstance(data, dict):
                return data
            raise RuntimeError("AI service returned an invalid response payload.")
    except HTTPError as error:
        error_body = error.read().decode("utf-8", errors="ignore") if hasattr(error, "read") else ""
        raise RuntimeError(f"AI service error: {error.code} {error_body}".strip()) from error
    except URLError as error:
        raise ConnectionError("AI service is unreachable. Ensure ai_services is running on port 8001.") from error


def _build_ai_intake_response(message: str, user: User, *, extra_context: dict | None = None) -> dict:
    context_payload = {"message": message}
    if extra_context:
        context_payload.update(extra_context)

    context = enrich_context(context_payload, user)
    ai_draft = _call_ai_service_json(
        "/ticket-draft",
        {"message": message, "context": context},
    )
    if ai_draft.get("error"):
        raise RuntimeError(str(ai_draft["error"]))

    possible_asset_match = context.get("possible_asset_match") or {}
    draft = {
        "title": str(ai_draft.get("title", "")).strip() or "IT Support Request",
        "description": str(ai_draft.get("description", message)).strip() or message.strip(),
        "category": _normalize_ai_ticket_category(ai_draft.get("category")) or Technician.SKILL_SOFTWARE,
        "priority": _normalize_ai_ticket_priority(ai_draft.get("priority")) or Ticket.PRIORITY_MEDIUM,
        "asset": str(ai_draft.get("asset", "")).strip() or str(possible_asset_match.get("display_name", "")).strip(),
        "impact": str(ai_draft.get("impact", "")).strip(),
        "branch": context.get("branch", ""),
        "department": context.get("department", ""),
    }

    confidence = float(ai_draft.get("confidence", 0.0) or 0.0)
    if extra_context and extra_context.get("transcription_source") == "placeholder":
        confidence = min(confidence, 0.35)

    follow_up_questions = _build_follow_up_questions(draft, confidence)
    if confidence > AI_INTAKE_CONFIDENCE_DIRECT:
        intake_mode = "direct"
    elif confidence >= AI_INTAKE_CONFIDENCE_FOLLOW_UP:
        intake_mode = "follow_up"
    else:
        intake_mode = "manual"

    return {
        "draft": draft,
        "confidence": round(confidence, 4),
        "follow_up_questions": follow_up_questions,
        "intake_mode": intake_mode,
    }


def _resolve_intake_user(request) -> User | None:
    raw_user_id = request.data.get("employee_id", request.data.get("user_id"))
    if raw_user_id in (None, "", "null"):
        return None
    try:
        user_id = int(raw_user_id)
    except (TypeError, ValueError):
        return None
    return User.objects.filter(id=user_id, is_active=True).first()


def _transcribe_uploaded_audio(audio_file, transcript_hint: str = "") -> tuple[str, str]:
    transcript = str(transcript_hint or "").strip()
    if transcript:
        return transcript, "browser"

    file_name = getattr(audio_file, "name", "call-audio")
    placeholder = (
        f"Voice transcription placeholder for {file_name}. "
        "Please review and complete the draft before submission."
    )
    return placeholder, "placeholder"


def _normalize_ticket_status(value: str | None) -> str:
    raw = str(value or "").strip()
    if not raw:
        return Ticket.STATUS_PENDING
    normalized = raw.lower()
    status_aliases = {
        "open": Ticket.STATUS_PENDING,
        "pending vendor": Ticket.STATUS_PENDING,
        "pending": Ticket.STATUS_PENDING,
        "escalated": Ticket.STATUS_IN_PROCESS,
        "in progress": Ticket.STATUS_IN_PROCESS,
        "in process": Ticket.STATUS_IN_PROCESS,
        "pending review": Ticket.STATUS_PENDING_REVIEW,
        "awaiting review": Ticket.STATUS_PENDING_REVIEW,
        "resolved": Ticket.STATUS_SOLVED,
        "solved": Ticket.STATUS_SOLVED,
    }
    return status_aliases.get(normalized, raw)


def _is_valid_admin_ticket_transition(previous_status: str, next_status: str) -> bool:
    if previous_status == next_status:
        return True

    allowed_transitions: dict[str, set[str]] = {
        Ticket.STATUS_PENDING: {Ticket.STATUS_IN_PROCESS},
        Ticket.STATUS_IN_PROCESS: {Ticket.STATUS_PENDING_REVIEW},
        Ticket.STATUS_PENDING_REVIEW: {Ticket.STATUS_IN_PROCESS},
        Ticket.STATUS_SOLVED: set(),
    }
    return next_status in allowed_transitions.get(previous_status, set())


def _parse_iso_date(value) -> date | None:
    if value in (None, ""):
        return None
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value).strip())
    except ValueError:
        return None


def _resolve_performance_window(request):
    range_value = str(request.query_params.get("range", "30d")).strip().lower() or "30d"
    today = timezone.localdate()

    if range_value == "all":
        return "all", None, None

    if range_value == "today":
        return "today", today, today

    if range_value == "7d":
        return "7d", today - timedelta(days=6), today

    if range_value == "90d":
        return "90d", today - timedelta(days=89), today

    if range_value == "365d":
        return "365d", today - timedelta(days=364), today

    if range_value == "custom":
        start_date = _parse_iso_date(request.query_params.get("start_date"))
        end_date = _parse_iso_date(request.query_params.get("end_date"))
        if start_date and end_date:
            if start_date > end_date:
                start_date, end_date = end_date, start_date
            return "custom", start_date, end_date
        # Fall back to default rolling window when custom is incomplete.
        return "30d", today - timedelta(days=29), today

    # Default range.
    return "30d", today - timedelta(days=29), today


def _month_start(day: date) -> date:
    return date(day.year, day.month, 1)


def _next_month(day: date) -> date:
    if day.month == 12:
        return date(day.year + 1, 1, 1)
    return date(day.year, day.month + 1, 1)


def _to_local_date(value) -> date:
    if isinstance(value, datetime):
        if timezone.is_aware(value):
            return timezone.localtime(value).date()
        return value.date()
    if isinstance(value, date):
        return value
    return timezone.localdate()


def _bucket_key_for_day(day: date, mode: str) -> str:
    if mode == "day":
        return day.isoformat()
    return f"{day.year:04d}-{day.month:02d}"


def _bucket_label(bucket_key: str, mode: str) -> str:
    if mode == "day":
        try:
            day = date.fromisoformat(bucket_key)
            return day.strftime("%d %b")
        except ValueError:
            return bucket_key
    try:
        month = datetime.strptime(bucket_key, "%Y-%m")
        return month.strftime("%b %Y")
    except ValueError:
        return bucket_key


SEASON_ORDER = ["Summer", "Autumn", "Winter", "Spring"]


def _season_for_month(month: int) -> str:
    # Southern hemisphere season mapping (Lesotho/South Africa context).
    if month in (12, 1, 2):
        return "Summer"
    if month in (3, 4, 5):
        return "Autumn"
    if month in (6, 7, 8):
        return "Winter"
    return "Spring"


def _sla_target_hours(priority: str) -> float:
    normalized = str(priority or "").strip().lower()
    if normalized == "critical":
        return 2.0
    if normalized == "high":
        return 8.0
    if normalized == "medium":
        return 24.0
    return 48.0


def _extract_escalation_target(comment_text: str) -> str | None:
    if comment_text.startswith("Escalated to Admin Fault"):
        return "Admin Fault Queue"
    prefix = "Escalated to technician "
    if comment_text.startswith(prefix):
        target = comment_text[len(prefix):].split(":", 1)[0].strip()
        return target or None
    return None


BUSINESS_DAY_KEYS = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
]
BUSINESS_GROUP_LABELS = {
    BusinessHours.GROUP_ALL: "All Technicians",
    Technician.SKILL_NETWORK: Technician.SKILL_NETWORK,
    Technician.SKILL_SOFTWARE: Technician.SKILL_SOFTWARE,
    Technician.SKILL_HARDWARE: Technician.SKILL_HARDWARE,
    Technician.SKILL_SECURITY: Technician.SKILL_SECURITY,
}
BUSINESS_LEAVE_TYPE_LABELS = {value: label for value, label in BusinessLeave.TYPE_CHOICES}
BUSINESS_TIMEZONE = "Africa/Maseru"


def _default_business_schedule() -> dict[str, dict[str, str | bool]]:
    return {
        "monday": {"enabled": True, "start": "08:00", "end": "16:30"},
        "tuesday": {"enabled": True, "start": "08:00", "end": "16:30"},
        "wednesday": {"enabled": True, "start": "08:00", "end": "16:30"},
        "thursday": {"enabled": True, "start": "08:00", "end": "16:30"},
        "friday": {"enabled": True, "start": "08:00", "end": "16:30"},
        "saturday": {"enabled": False, "start": "08:00", "end": "16:30"},
        "sunday": {"enabled": False, "start": "08:00", "end": "16:30"},
    }


def _legacy_business_schedule() -> dict[str, dict[str, str | bool]]:
    return {
        "monday": {"enabled": True, "start": "08:00", "end": "17:00"},
        "tuesday": {"enabled": True, "start": "08:00", "end": "17:00"},
        "wednesday": {"enabled": True, "start": "08:00", "end": "17:00"},
        "thursday": {"enabled": True, "start": "08:00", "end": "17:00"},
        "friday": {"enabled": True, "start": "08:00", "end": "17:00"},
        "saturday": {"enabled": False, "start": "08:00", "end": "17:00"},
        "sunday": {"enabled": False, "start": "08:00", "end": "17:00"},
    }


def _safe_zoneinfo(timezone_name: str | None) -> ZoneInfo | None:
    candidate = str(timezone_name or "").strip() or BUSINESS_TIMEZONE
    try:
        return ZoneInfo(candidate)
    except ZoneInfoNotFoundError:
        return None


def _normalize_business_group_value(value: str) -> str:
    normalized = str(value or "").strip()
    if not normalized:
        return ""
    lowered = normalized.lower()
    if lowered == BusinessHours.GROUP_ALL:
        return BusinessHours.GROUP_ALL
    if lowered == Technician.SKILL_NETWORK.lower():
        return Technician.SKILL_NETWORK
    if lowered == Technician.SKILL_SOFTWARE.lower():
        return Technician.SKILL_SOFTWARE
    if lowered == Technician.SKILL_HARDWARE.lower():
        return Technician.SKILL_HARDWARE
    if lowered == Technician.SKILL_SECURITY.lower():
        return Technician.SKILL_SECURITY
    return ""


def _normalize_business_groups(raw_groups) -> tuple[list[str], str | None]:
    if raw_groups in (None, ""):
        return [BusinessHours.GROUP_ALL], None
    if not isinstance(raw_groups, list):
        return [], "groups must be an array."

    normalized: list[str] = []
    for raw_value in raw_groups:
        group_value = _normalize_business_group_value(raw_value)
        if not group_value:
            return [], "groups contains an invalid value."
        if group_value == BusinessHours.GROUP_ALL:
            return [BusinessHours.GROUP_ALL], None
        if group_value not in normalized:
            normalized.append(group_value)

    if not normalized:
        return [BusinessHours.GROUP_ALL], None
    return normalized, None


def _normalize_business_schedule(raw_schedule) -> tuple[dict[str, dict[str, str | bool]], str | None]:
    defaults = _default_business_schedule()

    if raw_schedule in (None, ""):
        return defaults, None
    if not isinstance(raw_schedule, dict):
        return defaults, "schedule must be an object keyed by weekday."

    normalized: dict[str, dict[str, str | bool]] = {}
    for day in BUSINESS_DAY_KEYS:
        default_window = defaults[day]
        day_value = raw_schedule.get(day, default_window)
        if not isinstance(day_value, dict):
            return defaults, f"schedule.{day} must be an object."

        enabled = bool(day_value.get("enabled", default_window["enabled"]))
        start_text = str(day_value.get("start", default_window["start"])).strip()
        end_text = str(day_value.get("end", default_window["end"])).strip()

        try:
            start_time = datetime.strptime(start_text, "%H:%M").time()
            end_time = datetime.strptime(end_text, "%H:%M").time()
        except ValueError:
            return defaults, f"schedule.{day} times must use HH:MM format."

        if enabled and start_time >= end_time:
            return defaults, f"schedule.{day} start time must be before end time."

        normalized[day] = {
            "enabled": enabled,
            "start": start_time.strftime("%H:%M"),
            "end": end_time.strftime("%H:%M"),
        }

    return normalized, None


def _business_schedule_matches(raw_schedule, expected_schedule: dict[str, dict[str, str | bool]]) -> bool:
    normalized_schedule, _ = _normalize_business_schedule(raw_schedule)
    expected_normalized, _ = _normalize_business_schedule(expected_schedule)
    return normalized_schedule == expected_normalized


def _normalize_business_holidays(raw_holidays) -> tuple[list[dict], str | None]:
    if raw_holidays in (None, ""):
        return [], None
    if not isinstance(raw_holidays, list):
        return [], "holidays must be an array."

    normalized: list[dict] = []
    seen_dates: set[date] = set()
    for index, raw_value in enumerate(raw_holidays):
        if not isinstance(raw_value, dict):
            return [], f"holidays[{index}] must be an object."

        name = str(raw_value.get("name", "")).strip()
        parsed_date = _parse_iso_date(raw_value.get("date"))

        if not name or not parsed_date:
            return [], f"holidays[{index}] requires valid name and date."
        if parsed_date in seen_dates:
            return [], "Duplicate holiday dates are not allowed."
        seen_dates.add(parsed_date)

        holiday_id = raw_value.get("id")
        holiday_id_int = None
        if holiday_id not in (None, "", "null"):
            try:
                holiday_id_int = int(holiday_id)
            except (TypeError, ValueError):
                return [], f"holidays[{index}].id must be a number when provided."

        normalized.append(
            {
                "id": holiday_id_int,
                "name": name[:120],
                "date": parsed_date,
            }
        )

    return normalized, None


def _normalize_leave_type(value: str | None) -> str:
    lowered = str(value or "").strip().lower()
    if lowered in BUSINESS_LEAVE_TYPE_LABELS:
        return lowered
    return ""


def _normalize_business_leaves(raw_leaves, *, business_hours: BusinessHours) -> tuple[list[dict], str | None]:
    if raw_leaves in (None, ""):
        return [], None
    if not isinstance(raw_leaves, list):
        return [], "leaves must be an array."

    normalized: list[dict] = []
    seen_ranges: set[tuple[int, date, date, str]] = set()
    for index, raw_value in enumerate(raw_leaves):
        if not isinstance(raw_value, dict):
            return [], f"leaves[{index}] must be an object."

        leave_id = raw_value.get("id")
        leave_id_int = None
        if leave_id not in (None, "", "null"):
            try:
                leave_id_int = int(leave_id)
            except (TypeError, ValueError):
                return [], f"leaves[{index}].id must be a number when provided."

        technician_id = raw_value.get("technician_id")
        try:
            technician_id_int = int(technician_id)
        except (TypeError, ValueError):
            return [], f"leaves[{index}].technician_id must be a number."

        technician = Technician.objects.select_related("user").filter(id=technician_id_int, user__is_active=True).first()
        if not technician:
            return [], f"leaves[{index}] references an unknown technician."

        leave_type = _normalize_leave_type(raw_value.get("leave_type"))
        if not leave_type:
            return [], f"leaves[{index}].leave_type is invalid."

        start_date = _parse_iso_date(raw_value.get("start_date"))
        end_date = _parse_iso_date(raw_value.get("end_date"))
        if not start_date or not end_date:
            return [], f"leaves[{index}] requires valid start_date and end_date."
        if start_date > end_date:
            return [], f"leaves[{index}] start_date cannot be after end_date."

        signature = (technician.id, start_date, end_date, leave_type)
        if signature in seen_ranges:
            return [], "Duplicate leave entries are not allowed."
        seen_ranges.add(signature)

        normalized.append(
            {
                "id": leave_id_int,
                "technician_id": technician.id,
                "technician_name": technician.user.name,
                "leave_type": leave_type,
                "start_date": start_date,
                "end_date": end_date,
                "business_hours_id": business_hours.id,
            }
        )

    return normalized, None


def _ensure_default_business_hours() -> BusinessHours | None:
    """
    Returns the default BusinessHours row, creating it if needed.

    Safety: if migrations haven't been applied yet (missing table), we return None
    so ticket submission doesn't hard-crash with a 500 in dev environments.
    """
    try:
        existing = BusinessHours.objects.filter(is_default=True).order_by("id").first()
        if existing:
            update_fields: list[str] = []
            if existing.timezone_name != BUSINESS_TIMEZONE:
                existing.timezone_name = BUSINESS_TIMEZONE
                update_fields.append("timezone_name")
            if _business_schedule_matches(existing.weekly_schedule, _legacy_business_schedule()):
                existing.weekly_schedule = _default_business_schedule()
                update_fields.append("weekly_schedule")
            if update_fields:
                existing.save(update_fields=[*update_fields, "updated_at"])
            return existing
        return BusinessHours.objects.create(
            name="Default Business Hours",
            description="Default support desk hours for automated routing.",
            timezone_name=BUSINESS_TIMEZONE,
            groups=[BusinessHours.GROUP_ALL],
            weekly_schedule=_default_business_schedule(),
            is_default=True,
    )
    except OperationalError:
        logger.error("BusinessHours table missing; skipping business-hours routing checks.")
        return None


def _business_hours_window_label(business_hours: BusinessHours) -> str:
    schedule, schedule_error = _normalize_business_schedule(business_hours.weekly_schedule)
    if schedule_error:
        schedule = _default_business_schedule()

    active_windows = [
        (str(day_config.get("start", "08:00")), str(day_config.get("end", "16:30")))
        for day_config in schedule.values()
        if bool(day_config.get("enabled"))
    ]
    if not active_windows:
        default_window = _default_business_schedule()["monday"]
        return f"{default_window['start']} to {default_window['end']}"

    first_window = active_windows[0]
    if all(window == first_window for window in active_windows):
        return f"{first_window[0]} to {first_window[1]}"

    return f"{first_window[0]} to {first_window[1]}"


def _current_business_datetime(timezone_name: str) -> datetime:
    reference = timezone.now()
    zone = _safe_zoneinfo(timezone_name)
    if zone:
        return reference.astimezone(zone)
    return timezone.localtime(reference)


def _is_business_hours_open_now(business_hours: BusinessHours) -> bool:
    local_now = _current_business_datetime(business_hours.timezone_name)
    if BusinessHoliday.objects.filter(business_hours=business_hours, date=local_now.date()).exists():
        return False

    schedule, schedule_error = _normalize_business_schedule(business_hours.weekly_schedule)
    if schedule_error:
        schedule = _default_business_schedule()

    day_key = BUSINESS_DAY_KEYS[local_now.weekday()]
    day_config = schedule.get(day_key, {"enabled": False, "start": "08:00", "end": "16:30"})
    if not bool(day_config.get("enabled")):
        return False

    try:
        start_time = datetime.strptime(str(day_config.get("start", "08:00")), "%H:%M").time()
        end_time = datetime.strptime(str(day_config.get("end", "16:30")), "%H:%M").time()
    except ValueError:
        return False

    now_time = time(hour=local_now.hour, minute=local_now.minute)
    return start_time <= now_time < end_time


def _is_technician_targeted_by_business_hours(technician: Technician, business_hours: BusinessHours) -> bool:
    groups, groups_error = _normalize_business_groups(business_hours.groups)
    if groups_error:
        return True
    if BusinessHours.GROUP_ALL in groups:
        return True
    return technician.skillset in groups


def _is_technician_within_business_hours(
    technician: Technician,
    business_hours: BusinessHours,
    hours_open_now: bool,
    technicians_on_leave: set[int] | None = None,
) -> bool:
    if technicians_on_leave and technician.id in technicians_on_leave:
        return False
    if not _is_technician_targeted_by_business_hours(technician, business_hours):
        return True
    return hours_open_now


def _technician_has_active_ticket(technician: Technician, *, exclude_ticket_id: int | None = None) -> bool:
    queryset = Ticket.objects.filter(technician=technician).exclude(
        status__in=[Ticket.STATUS_SOLVED, Ticket.LEGACY_STATUS_RESOLVED]
    )
    if exclude_ticket_id is not None:
        queryset = queryset.exclude(id=exclude_ticket_id)
    return queryset.exists()


def _business_hours_to_dict(config: BusinessHours) -> dict:
    schedule, schedule_error = _normalize_business_schedule(config.weekly_schedule)
    if schedule_error:
        schedule = _default_business_schedule()

    groups, groups_error = _normalize_business_groups(config.groups)
    if groups_error:
        groups = [BusinessHours.GROUP_ALL]

    leaves_payload = [
        {
            "id": leave.id,
            "technician_id": leave.technician_id,
            "technician_name": leave.technician.user.name,
            "leave_type": leave.leave_type,
            "leave_type_label": BUSINESS_LEAVE_TYPE_LABELS.get(leave.leave_type, leave.leave_type.title()),
            "start_date": leave.start_date.isoformat(),
            "end_date": leave.end_date.isoformat(),
        }
        for leave in config.leaves.select_related("technician__user").order_by("start_date", "end_date", "id")
    ]

    return {
        "id": config.id,
        "name": config.name,
        "description": config.description,
        "timezone": config.timezone_name,
        "groups": groups,
        "group_options": [
            {"value": value, "label": label}
            for value, label in BUSINESS_GROUP_LABELS.items()
        ],
        "leave_type_options": [
            {"value": value, "label": label}
            for value, label in BUSINESS_LEAVE_TYPE_LABELS.items()
        ],
        "schedule": schedule,
        "holidays": [
            {
                "id": holiday.id,
                "name": holiday.name,
                "date": holiday.date.isoformat(),
            }
            for holiday in config.holidays.order_by("date", "id")
        ],
        "leaves": leaves_payload,
        "is_open_now": _is_business_hours_open_now(config),
        "updated_at": config.updated_at.isoformat(),
    }


SKILL_DOMAIN_NETWORK = "network"
SKILL_DOMAIN_HARDWARE = "hardware"
SKILL_DOMAIN_SOFTWARE = "software"
SKILL_DOMAIN_SECURITY = "security"
DEFAULT_TICKET_CATEGORY = "General IT Support"
SKILL_DOMAIN_TO_CATEGORY = {
    SKILL_DOMAIN_NETWORK: Technician.SKILL_NETWORK,
    SKILL_DOMAIN_SOFTWARE: Technician.SKILL_SOFTWARE,
    SKILL_DOMAIN_HARDWARE: Technician.SKILL_HARDWARE,
    SKILL_DOMAIN_SECURITY: Technician.SKILL_SECURITY,
}
ALLOWED_TECHNICIAN_SKILLSETS = {
    Technician.SKILL_NETWORK,
    Technician.SKILL_SOFTWARE,
    Technician.SKILL_HARDWARE,
    Technician.SKILL_SECURITY,
}
TECHNICIAN_FIXED_BRANCH = "Maseru HQ"
TECHNICIAN_FIXED_DEPARTMENT = Technician.DEPARTMENT_IT

# These categories should route by lowest workload across all technician profiles.
WORKLOAD_ONLY_ROUTING_KEYWORDS = {"account", "email", "printer"}

SKILL_DOMAIN_KEYWORDS = {
    SKILL_DOMAIN_NETWORK: {
        "network",
        "internet",
        "wifi",
        "wi-fi",
        "vpn",
        "dns",
        "router",
        "switch",
        "connectivity",
        "scada",
    },
    SKILL_DOMAIN_HARDWARE: {
        "hardware",
        "laptop",
        "desktop",
        "device",
        "field",
        "metering",
        "distribution",
        "line",
        "substation",
        "power systems",
        "keyboard",
        "mouse",
        "monitor",
    },
    SKILL_DOMAIN_SOFTWARE: {
        "software",
        "application",
        "systems",
        "system",
        "access",
        "password",
        "outlook",
    },
    SKILL_DOMAIN_SECURITY: {
        "security",
        "cybersecurity",
        "breach",
        "incident",
        "malware",
        "virus",
        "phishing",
        "ransomware",
        "unauthorized",
        "compromised",
        "threat",
        "attack",
    },
}

CRITICAL_PRIORITY_PHRASES = {
    "critical",
    "urgent",
    "outage",
    "service down",
    "system down",
    "entire branch",
    "all users",
    "no connectivity",
    "complete failure",
    "production down",
    "site down",
}

HIGH_PRIORITY_PHRASES = {
    "high priority",
    "unable to work",
    "cannot work",
    "can't work",
    "blocked",
    "cannot login",
    "can't login",
    "stopped working",
    "offline",
    "security incident",
    "breach",
}

MEDIUM_PRIORITY_PHRASES = {
    "slow",
    "intermittent",
    "degraded",
    "delay",
    "latency",
    "unstable",
    "flaky",
    "occasionally",
}


def _normalize_skill_text(value: str) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip().lower())


def _infer_ticket_skill_domain(category: str, title: str, description: str) -> str | None:
    searchable_text = _normalize_skill_text(f"{category} {title} {description}")
    if not searchable_text:
        return None

    padded_text = f" {searchable_text} "
    if any(f" {keyword} " in padded_text for keyword in WORKLOAD_ONLY_ROUTING_KEYWORDS):
        return None

    domain_scores: dict[str, int] = {}
    for domain, keywords in SKILL_DOMAIN_KEYWORDS.items():
        score = sum(1 for keyword in keywords if keyword in searchable_text)
        if score > 0:
            domain_scores[domain] = score

    if not domain_scores:
        return None

    return sorted(domain_scores.items(), key=lambda item: (-item[1], item[0]))[0][0]


def _auto_ticket_category(title: str, description: str, category_hint: str = "") -> tuple[str, str | None]:
    inferred_domain = _infer_ticket_skill_domain(category_hint, title, description)
    if inferred_domain in SKILL_DOMAIN_TO_CATEGORY:
        return SKILL_DOMAIN_TO_CATEGORY[inferred_domain], inferred_domain

    normalized_hint = _normalize_skill_text(category_hint)
    if normalized_hint in WORKLOAD_ONLY_ROUTING_KEYWORDS:
        return DEFAULT_TICKET_CATEGORY, None
    if normalized_hint == Technician.SKILL_NETWORK.lower():
        return Technician.SKILL_NETWORK, SKILL_DOMAIN_NETWORK
    if normalized_hint == Technician.SKILL_SOFTWARE.lower():
        return Technician.SKILL_SOFTWARE, SKILL_DOMAIN_SOFTWARE
    if normalized_hint == Technician.SKILL_HARDWARE.lower():
        return Technician.SKILL_HARDWARE, SKILL_DOMAIN_HARDWARE
    if normalized_hint == Technician.SKILL_SECURITY.lower():
        return Technician.SKILL_SECURITY, SKILL_DOMAIN_SECURITY

    return DEFAULT_TICKET_CATEGORY, None


def _auto_ticket_priority(title: str, description: str) -> str:
    searchable_text = _normalize_skill_text(f"{title} {description}")
    if not searchable_text:
        return Ticket.PRIORITY_LOW

    if any(phrase in searchable_text for phrase in CRITICAL_PRIORITY_PHRASES):
        return Ticket.PRIORITY_CRITICAL
    if any(phrase in searchable_text for phrase in HIGH_PRIORITY_PHRASES):
        return Ticket.PRIORITY_HIGH
    if any(phrase in searchable_text for phrase in MEDIUM_PRIORITY_PHRASES):
        return Ticket.PRIORITY_MEDIUM
    return Ticket.PRIORITY_LOW


def _normalize_technician_skill_domain(skillset: str) -> str | None:
    searchable_skillset = _normalize_skill_text(skillset)
    if not searchable_skillset:
        return None

    if searchable_skillset == Technician.SKILL_NETWORK.lower():
        return SKILL_DOMAIN_NETWORK
    if searchable_skillset == Technician.SKILL_SOFTWARE.lower():
        return SKILL_DOMAIN_SOFTWARE
    if searchable_skillset == Technician.SKILL_HARDWARE.lower():
        return SKILL_DOMAIN_HARDWARE
    if searchable_skillset == Technician.SKILL_SECURITY.lower():
        return SKILL_DOMAIN_SECURITY

    # Backward compatibility for legacy records before strict choices.
    for domain, keywords in SKILL_DOMAIN_KEYWORDS.items():
        if any(keyword in searchable_skillset for keyword in keywords):
            return domain

    return None


def _normalize_skillset_value(raw_value: str) -> str:
    normalized = _normalize_skill_text(raw_value)
    if normalized == Technician.SKILL_NETWORK.lower():
        return Technician.SKILL_NETWORK
    if normalized == Technician.SKILL_SOFTWARE.lower():
        return Technician.SKILL_SOFTWARE
    if normalized == Technician.SKILL_HARDWARE.lower():
        return Technician.SKILL_HARDWARE
    if normalized == Technician.SKILL_SECURITY.lower():
        return Technician.SKILL_SECURITY
    return ""


def _normalized_inverse_score(value: float, minimum: float, maximum: float) -> float:
    if maximum <= minimum:
        return 1.0
    return max(0.0, min(1.0, (maximum - value) / (maximum - minimum)))


def _ticket_resolution_seconds(ticket: Ticket) -> float | None:
    resolved_statuses = {
        Ticket.STATUS_PENDING_REVIEW,
        Ticket.STATUS_SOLVED,
        Ticket.LEGACY_STATUS_RESOLVED,
    }
    if _normalize_ticket_status(ticket.status) not in resolved_statuses and ticket.status not in resolved_statuses:
        return None

    started_at = ticket.accepted_at or ticket.assigned_at or ticket.created_at
    if not started_at or not ticket.updated_at:
        return None

    return max((ticket.updated_at - started_at).total_seconds(), 0.0)


def _technician_performance_metrics(technicians: list[Technician]) -> dict[int, dict[str, float | int]]:
    technician_ids = [technician.id for technician in technicians]
    stats_by_technician = {
        technician.id: {
            "total_assigned": 0,
            "completed": 0,
            "resolution_total": 0.0,
            "resolution_samples": 0,
        }
        for technician in technicians
    }

    historical_tickets = Ticket.objects.filter(technician_id__in=technician_ids).only(
        "technician_id",
        "status",
        "assigned_at",
        "accepted_at",
        "created_at",
        "updated_at",
    )

    for historical_ticket in historical_tickets:
        stats = stats_by_technician.get(historical_ticket.technician_id)
        if not stats:
            continue

        stats["total_assigned"] += 1
        resolution_seconds = _ticket_resolution_seconds(historical_ticket)
        if resolution_seconds is None:
            continue

        stats["completed"] += 1
        stats["resolution_total"] += resolution_seconds
        stats["resolution_samples"] += 1

    average_resolution_by_technician: dict[int, float] = {}
    for technician_id, stats in stats_by_technician.items():
        if stats["resolution_samples"] <= 0:
            continue
        average_resolution_by_technician[technician_id] = stats["resolution_total"] / stats["resolution_samples"]

    resolution_values = list(average_resolution_by_technician.values())
    min_resolution = min(resolution_values) if resolution_values else 0.0
    max_resolution = max(resolution_values) if resolution_values else 0.0

    performance_metrics: dict[int, dict[str, float | int]] = {}
    for technician in technicians:
        stats = stats_by_technician[technician.id]
        if stats["total_assigned"] == 0:
            success_rate = 0.5
        else:
            success_rate = stats["completed"] / stats["total_assigned"]

        if technician.id in average_resolution_by_technician:
            resolution_score = _normalized_inverse_score(
                average_resolution_by_technician[technician.id],
                min_resolution,
                max_resolution,
            )
        else:
            resolution_score = 0.5

        average_resolution_hours = (
            round((stats["resolution_total"] / stats["resolution_samples"]) / 3600.0, 2)
            if stats["resolution_samples"] > 0
            else 0.0
        )
        performance_score = round((success_rate * 0.5) + (resolution_score * 0.5), 6)
        performance_metrics[technician.id] = {
            "total_assigned": stats["total_assigned"],
            "completed": stats["completed"],
            "success_rate": round(success_rate, 6),
            "success_rate_percent": round(success_rate * 100.0, 2),
            "resolution_score": round(resolution_score, 6),
            "resolution_score_percent": round(resolution_score * 100.0, 2),
            "avg_resolution_hours": average_resolution_hours,
            "performance_score": performance_score,
            "performance_score_percent": round(performance_score * 100.0, 2),
        }

    return performance_metrics


def _technician_performance_scores(technicians: list[Technician]) -> dict[int, float]:
    return {
        technician_id: float(metrics["performance_score"])
        for technician_id, metrics in _technician_performance_metrics(technicians).items()
    }


def _technician_reassignment_metrics(technicians: list[Technician]) -> dict[int, dict[str, float | int]]:
    if not technicians:
        return {}

    technician_ids = [technician.id for technician in technicians]
    stats_by_technician = {
        technician.id: {
            "pending_acceptance_count": 0,
            "overdue_acceptance_count": 0,
            "recent_assignment_count": 0,
        }
        for technician in technicians
    }

    now = timezone.now()
    acceptance_cutoff = now - timedelta(minutes=max(ACCEPTANCE_SLA_MINUTES, REASSIGN_THRESHOLD_MINUTES))
    active_tickets = Ticket.objects.filter(technician_id__in=technician_ids).exclude(
        status__in=[Ticket.STATUS_SOLVED, Ticket.LEGACY_STATUS_RESOLVED]
    ).only("technician_id", "status", "accepted_at", "assigned_at", "created_at")

    for active_ticket in active_tickets:
        stats = stats_by_technician.get(active_ticket.technician_id)
        if not stats:
            continue

        if _normalize_ticket_status(active_ticket.status) != Ticket.STATUS_PENDING or active_ticket.accepted_at is not None:
            continue

        stats["pending_acceptance_count"] += 1
        assigned_reference = active_ticket.assigned_at or active_ticket.created_at
        if assigned_reference and assigned_reference <= acceptance_cutoff:
            stats["overdue_acceptance_count"] += 1

    recent_window_start = now - timedelta(
        minutes=max(REASSIGNMENT_RECENT_ASSIGNMENTS_WINDOW_MINUTES, 1)
    )
    recent_assignment_rows = (
        TicketAssignmentHistory.objects.filter(
            technician_id__in=technician_ids,
            assigned_at__gte=recent_window_start,
        )
        .values("technician_id")
        .annotate(recent_assignment_count=Count("id"))
    )
    for row in recent_assignment_rows:
        stats = stats_by_technician.get(row["technician_id"])
        if not stats:
            continue
        stats["recent_assignment_count"] = int(row["recent_assignment_count"])

    pending_values = [stats["pending_acceptance_count"] for stats in stats_by_technician.values()]
    overdue_values = [stats["overdue_acceptance_count"] for stats in stats_by_technician.values()]
    recent_values = [stats["recent_assignment_count"] for stats in stats_by_technician.values()]
    min_pending = min(pending_values) if pending_values else 0
    max_pending = max(pending_values) if pending_values else 0
    min_overdue = min(overdue_values) if overdue_values else 0
    max_overdue = max(overdue_values) if overdue_values else 0
    min_recent = min(recent_values) if recent_values else 0
    max_recent = max(recent_values) if recent_values else 0

    reassignment_metrics: dict[int, dict[str, float | int]] = {}
    for technician in technicians:
        stats = stats_by_technician[technician.id]
        pending_acceptance_score = _normalized_inverse_score(
            float(stats["pending_acceptance_count"]),
            float(min_pending),
            float(max_pending),
        )
        overdue_acceptance_score = _normalized_inverse_score(
            float(stats["overdue_acceptance_count"]),
            float(min_overdue),
            float(max_overdue),
        )
        recent_assignment_score = _normalized_inverse_score(
            float(stats["recent_assignment_count"]),
            float(min_recent),
            float(max_recent),
        )
        reassignment_readiness_score = round(
            (pending_acceptance_score * 0.35)
            + (overdue_acceptance_score * 0.45)
            + (recent_assignment_score * 0.20),
            6,
        )
        reassignment_metrics[technician.id] = {
            "pending_acceptance_count": int(stats["pending_acceptance_count"]),
            "overdue_acceptance_count": int(stats["overdue_acceptance_count"]),
            "recent_assignment_count": int(stats["recent_assignment_count"]),
            "pending_acceptance_score": round(pending_acceptance_score, 6),
            "overdue_acceptance_score": round(overdue_acceptance_score, 6),
            "recent_assignment_score": round(recent_assignment_score, 6),
            "reassignment_readiness_score": reassignment_readiness_score,
            "reassignment_readiness_score_percent": round(reassignment_readiness_score * 100.0, 2),
        }

    return reassignment_metrics


def _rank_technicians_for_ticket(
    category: str,
    title: str,
    description: str,
    exclude_technician_ids: set[int] | None = None,
    restrict_to_technician_ids: set[int] | None = None,
    allow_unavailable_fallback: bool = False,
    routing_context: str = "assignment",
    candidate_technicians: list[Technician] | None = None,
) -> tuple[list[dict[str, object]], str | None]:
    excluded_ids = {item for item in (exclude_technician_ids or set()) if isinstance(item, int)}
    restricted_ids = {item for item in (restrict_to_technician_ids or set()) if isinstance(item, int)}
    if candidate_technicians is None:
        all_active_technicians = list(
            Technician.objects.select_related("user")
            .filter(
                user__is_active=True,
                user__role=User.ROLE_TECHNICIAN,
            )
            .order_by("user__name")
        )
    else:
        all_active_technicians = [
            item
            for item in candidate_technicians
            if item.user_id and item.user.is_active and item.user.role == User.ROLE_TECHNICIAN
        ]
    if restricted_ids:
        all_active_technicians = [item for item in all_active_technicians if item.id in restricted_ids]
    if excluded_ids:
        all_active_technicians = [item for item in all_active_technicians if item.id not in excluded_ids]
    if not all_active_technicians:
        return [], None

    business_hours = _ensure_default_business_hours()
    technicians_on_leave: set[int] = set()
    if business_hours is None:
        # If business-hours tables don't exist yet (unmigrated dev DB), don't block routing.
        technicians_within_business_hours = list(all_active_technicians)
    else:
        business_hours_open_now = _is_business_hours_open_now(business_hours)
        local_business_day = _current_business_datetime(business_hours.timezone_name).date()
        try:
            technicians_on_leave = set(
                BusinessLeave.objects.filter(
                    business_hours=business_hours,
                    start_date__lte=local_business_day,
                    end_date__gte=local_business_day,
                ).values_list("technician_id", flat=True)
            )
        except OperationalError:
            logger.error("BusinessLeave table missing; skipping leave checks for routing.")
            technicians_on_leave = set()
        technicians_within_business_hours = [
            item
            for item in all_active_technicians
            if _is_technician_within_business_hours(
                item,
                business_hours,
                business_hours_open_now,
                technicians_on_leave=technicians_on_leave,
            )
        ]

    fallback_not_on_leave = [item for item in all_active_technicians if item.id not in technicians_on_leave]
    candidate_pool = (
        technicians_within_business_hours
        if technicians_within_business_hours
        else (fallback_not_on_leave if allow_unavailable_fallback else [])
    )
    if not candidate_pool:
        return [], None

    available_technicians = [
        item
        for item in candidate_pool
        if item.is_available and not _technician_has_active_ticket(item)
    ]
    technicians = (
        available_technicians
        if available_technicians
        else (
            [item for item in candidate_pool if not _technician_has_active_ticket(item)]
            if allow_unavailable_fallback
            else []
        )
    )
    if not technicians:
        return [], None

    workload_rows = (
        Ticket.objects.filter(technician_id__in=[item.id for item in technicians])
        .exclude(status__in=[Ticket.STATUS_SOLVED, Ticket.LEGACY_STATUS_RESOLVED])
        .values("technician_id")
        .annotate(open_count=Count("id"))
    )
    workload_by_technician = {row["technician_id"]: row["open_count"] for row in workload_rows}
    performance_metrics = _technician_performance_metrics(technicians)
    reassignment_metrics = _technician_reassignment_metrics(technicians)
    workload_values = [workload_by_technician.get(technician.id, 0) for technician in technicians]
    min_workload = min(workload_values) if workload_values else 0
    max_workload = max(workload_values) if workload_values else 0

    ticket_domain = _infer_ticket_skill_domain(category, title, description)
    ranked_profiles: list[dict[str, object]] = []

    for technician in technicians:
        skill_domain = _normalize_technician_skill_domain(technician.skillset)
        exact_match = bool(ticket_domain) and ticket_domain == skill_domain

        if not ticket_domain:
            skill_score = 0.7
        elif exact_match:
            skill_score = 1.0
        elif not skill_domain:
            skill_score = 0.35
        else:
            skill_score = 0.1

        workload = workload_by_technician.get(technician.id, 0)
        workload_score = _normalized_inverse_score(float(workload), float(min_workload), float(max_workload))
        availability_score = 1.0 if technician.is_available else 0.2
        performance_score = float(performance_metrics.get(technician.id, {}).get("performance_score", 0.5))
        base_weighted_score = round(
            (skill_score * 0.4)
            + (workload_score * 0.2)
            + (availability_score * 0.2)
            + (performance_score * 0.2),
            6,
        )
        reassignment_readiness_score = float(
            reassignment_metrics.get(technician.id, {}).get("reassignment_readiness_score", 0.5)
        )
        selection_score = (
            round((base_weighted_score * 0.75) + (reassignment_readiness_score * 0.25), 6)
            if routing_context == "reassignment"
            else base_weighted_score
        )
        ranked_profiles.append(
            {
                "technician": technician,
                "exact_match": exact_match,
                "ticket_domain": ticket_domain,
                "skill_score": round(skill_score, 6),
                "workload": workload,
                "workload_score": round(workload_score, 6),
                "availability_score": round(availability_score, 6),
                "performance_score": round(performance_score, 6),
                "base_weighted_score": base_weighted_score,
                "selection_score": selection_score,
                "pending_acceptance_count": int(
                    reassignment_metrics.get(technician.id, {}).get("pending_acceptance_count", 0)
                ),
                "overdue_acceptance_count": int(
                    reassignment_metrics.get(technician.id, {}).get("overdue_acceptance_count", 0)
                ),
                "recent_assignment_count": int(
                    reassignment_metrics.get(technician.id, {}).get("recent_assignment_count", 0)
                ),
                "reassignment_readiness_score": round(reassignment_readiness_score, 6),
                "is_available": technician.is_available,
            }
        )

    ranked_profiles.sort(
        key=lambda item: (
            -float(item["selection_score"]),
            0 if bool(item["exact_match"]) else 1,
            int(item["overdue_acceptance_count"]),
            int(item["pending_acceptance_count"]),
            int(item["workload"]),
            str(item["technician"].user.name).lower(),
            int(item["technician"].id),
        )
    )
    return ranked_profiles, ticket_domain


def _pick_best_technician_for_ticket(
    category: str,
    title: str,
    description: str,
    exclude_technician_ids: set[int] | None = None,
    restrict_to_technician_ids: set[int] | None = None,
    allow_unavailable_fallback: bool = False,
    routing_context: str = "assignment",
) -> tuple[Technician | None, bool, str | None]:
    ranked_profiles, ticket_domain = _rank_technicians_for_ticket(
        category=category,
        title=title,
        description=description,
        exclude_technician_ids=exclude_technician_ids,
        restrict_to_technician_ids=restrict_to_technician_ids,
        allow_unavailable_fallback=allow_unavailable_fallback,
        routing_context=routing_context,
    )
    if not ranked_profiles:
        return None, False, ticket_domain

    top_profile = ranked_profiles[0]
    return (
        top_profile["technician"],
        bool(top_profile["exact_match"]),
        ticket_domain,
    )


def _find_matching_consumable_for_restock(
    *,
    asset_tag: str,
    serial_number: str,
    item_name: str,
    brand: str,
    model_number: str,
    category: str,
    subcategory: str,
):
    if asset_tag:
        by_asset_tag = Consumable.objects.filter(asset_tag__iexact=asset_tag).first()
        if by_asset_tag:
            return by_asset_tag

    if serial_number:
        by_serial = Consumable.objects.filter(serial_number__iexact=serial_number).first()
        if by_serial:
            return by_serial

    if item_name and brand and model_number:
        queryset = Consumable.objects.filter(
            item_name__iexact=item_name,
            brand__iexact=brand,
            model_number__iexact=model_number,
        )
        if category:
            queryset = queryset.filter(category__iexact=category)
        if subcategory:
            queryset = queryset.filter(subcategory__iexact=subcategory)
        by_signature = queryset.first()
        if by_signature:
            return by_signature

    if item_name:
        return Consumable.objects.filter(item_name__iexact=item_name).order_by("-quantity").first()

    return None


def _is_blank_text(value):
    return value in (None, "")


def _populate_missing_consumable_details(consumable: Consumable, payload: dict) -> bool:
    updated = False

    text_fields = [
        "asset_tag",
        "item_name",
        "manufacturer",
        "brand",
        "model_number",
        "serial_number",
        "category",
        "subcategory",
        "processor",
        "ram",
        "storage_type",
        "storage_capacity",
        "graphics_card",
        "printer_type",
        "print_speed",
        "connectivity",
        "paper_capacity",
        "device_type",
        "operating_system",
        "battery_capacity",
        "imei_number",
        "supplier",
        "condition",
        "status",
        "department",
        "assigned_employee",
    ]

    for field_name in text_fields:
        incoming = payload.get(field_name)
        if _is_blank_text(getattr(consumable, field_name)) and not _is_blank_text(incoming):
            setattr(consumable, field_name, incoming)
            updated = True

    optional_fields = [
        "charger_included",
        "monitor_included",
        "keyboard_included",
        "mouse_included",
        "duplex_printing",
        "color_printing",
        "purchase_cost",
        "warranty_expiry",
        "purchase_date",
    ]
    for field_name in optional_fields:
        incoming = payload.get(field_name)
        if getattr(consumable, field_name) is None and incoming is not None:
            setattr(consumable, field_name, incoming)
            updated = True

    return updated


def _consume_inventory_assignments(*, consumable_id: int, employee_id: int, quantity: int) -> None:
    remaining = max(int(quantity), 0)
    if remaining == 0:
        return

    assignments = (
        InventoryAssignment.objects.select_for_update()
        .filter(consumable_id=consumable_id, employee_id=employee_id)
        .order_by("assigned_at", "id")
    )
    for assignment in assignments:
        if remaining <= 0:
            break

        if assignment.quantity_assigned <= remaining:
            remaining -= assignment.quantity_assigned
            assignment.delete()
        else:
            assignment.quantity_assigned = assignment.quantity_assigned - remaining
            assignment.save(update_fields=["quantity_assigned"])
            remaining = 0


def _ticket_to_dict(ticket: Ticket, include_escalation_context: bool = False) -> dict:
    payload = {
        "id": ticket.id,
        "title": ticket.title,
        "description": ticket.description,
        "category": ticket.category,
        "location": ticket.location,
        "priority": ticket.priority,
        "status": _normalize_ticket_status(ticket.status),
        "employee_id": ticket.employee_id,
        "employee_name": ticket.employee.name,
        "caller_name": ticket.caller_name,
        "logged_by_admin_id": ticket.logged_by_admin_id,
        "logged_by_admin_name": ticket.logged_by_admin.name if ticket.logged_by_admin_id else None,
        "technician_id": ticket.technician_id,
        "technician_name": ticket.technician.user.name if ticket.technician_id else None,
        "routed_to_role": User.ROLE_TECHNICIAN if ticket.technician_id else User.ROLE_ADMIN_FAULT,
        "reporter_reviewed_problem": ticket.reporter_reviewed_problem,
        "assigned_at": ticket.assigned_at.isoformat() if ticket.assigned_at else None,
        "accepted_at": ticket.accepted_at.isoformat() if ticket.accepted_at else None,
        "last_activity_at": ticket.last_activity_at.isoformat() if ticket.last_activity_at else None,
        "escalation_level": ticket.escalation_level,
        "reassign_count": ticket.reassign_count,
        "created_at": ticket.created_at.isoformat(),
        "updated_at": ticket.updated_at.isoformat(),
    }
    if include_escalation_context:
        latest_escalation = (
            TicketComment.objects.select_related("author")
            .filter(ticket=ticket, comment__startswith="Escalated")
            .order_by("-created_at")
            .first()
        )
        payload["latest_escalation_comment"] = latest_escalation.comment if latest_escalation else None
        payload["latest_escalation_by"] = latest_escalation.author.name if latest_escalation else None
        payload["latest_escalation_at"] = latest_escalation.created_at.isoformat() if latest_escalation else None
        payload["latest_escalation_target"] = (
            _extract_escalation_target(latest_escalation.comment) if latest_escalation else None
        )
    return payload


def _ticket_comment_to_dict(item: TicketComment) -> dict:
    return {
        "id": item.id,
        "author_id": item.author_id,
        "author_name": item.author.name,
        "comment": item.comment,
        "created_at": item.created_at.isoformat(),
    }


def _ticket_material_request_to_dict(item: TicketMaterialRequest) -> dict:
    return {
        "id": item.id,
        "ticket_id": item.ticket_id,
        "requested_by_id": item.requested_by_id,
        "requested_by_name": item.requested_by.name,
        "item_name": item.item_name,
        "quantity": item.quantity,
        "notes": item.notes,
        "status": item.status,
        "created_at": item.created_at.isoformat(),
        "updated_at": item.updated_at.isoformat(),
    }


def _ticket_detail_to_dict(ticket: Ticket) -> dict:
    payload = _ticket_to_dict(ticket)
    comments = (
        TicketComment.objects.select_related("author")
        .filter(ticket=ticket)
        .order_by("-created_at")
    )
    payload["comments"] = [_ticket_comment_to_dict(item) for item in comments]
    return payload


def _technician_to_dict(technician: Technician) -> dict:
    return {
        "id": technician.id,
        "user_id": technician.user_id,
        "name": technician.user.name,
        "email": technician.user.email,
        "branch": TECHNICIAN_FIXED_BRANCH,
        "department": TECHNICIAN_FIXED_DEPARTMENT,
        "skillset": technician.skillset,
        "is_active": technician.user.is_active,
        "is_available": technician.is_available,
        "availability_updated_at": technician.availability_updated_at.isoformat() if technician.availability_updated_at else None,
        "last_check_in_at": technician.last_check_in_at.isoformat() if technician.last_check_in_at else None,
        "last_check_out_at": technician.last_check_out_at.isoformat() if technician.last_check_out_at else None,
    }


def _normalize_technician_checkpoint_action(value: str | None) -> str:
    normalized = str(value or "").strip().lower().replace("-", "_").replace(" ", "_")
    if normalized in {"checkin", "check_in"}:
        return "check_in"
    if normalized in {"checkout", "check_out"}:
        return "check_out"
    return ""


TECHNICIAN_ACTIVITY_LABELS = {
    TechnicianActivityLog.ACTION_CHECK_IN: "Checked In",
    TechnicianActivityLog.ACTION_CHECK_OUT: "Checked Out",
    TechnicianActivityLog.ACTION_TICKET_ACCEPTED: "Accepted Ticket",
    TechnicianActivityLog.ACTION_TICKET_SOLVED: "Solved Ticket",
    TechnicianActivityLog.ACTION_TICKET_ESCALATED: "Escalated Ticket",
    TechnicianActivityLog.ACTION_ASSET_REQUEST_SUBMITTED: "Submitted Asset Request",
}


def _activity_action_label(action_type: str) -> str:
    return TECHNICIAN_ACTIVITY_LABELS.get(action_type, action_type.replace("_", " ").title())


def _duration_minutes_between(started_at: datetime | None, ended_at: datetime | None) -> int | None:
    if not started_at or not ended_at:
        return None
    duration_seconds = max((ended_at - started_at).total_seconds(), 0.0)
    return int(round(duration_seconds / 60.0))


def _create_technician_activity_log(
    technician: Technician,
    *,
    action_type: str,
    description: str = "",
    occurred_at: datetime | None = None,
    ended_at: datetime | None = None,
    duration_minutes: int | None = None,
    ticket: Ticket | None = None,
    consumable_request: ConsumableRequest | None = None,
    metadata: dict | None = None,
) -> TechnicianActivityLog:
    return TechnicianActivityLog.objects.create(
        technician=technician,
        action_type=action_type,
        description=description,
        occurred_at=occurred_at or timezone.now(),
        ended_at=ended_at,
        duration_minutes=duration_minutes,
        ticket=ticket,
        consumable_request=consumable_request,
        metadata=metadata or {},
    )


def _latest_open_technician_session_log(technician: Technician) -> TechnicianActivityLog | None:
    return (
        TechnicianActivityLog.objects.filter(
            technician=technician,
            action_type=TechnicianActivityLog.ACTION_CHECK_IN,
            ended_at__isnull=True,
        )
        .order_by("-occurred_at", "-id")
        .first()
    )


def _latest_open_ticket_work_log(technician: Technician, ticket: Ticket) -> TechnicianActivityLog | None:
    return (
        TechnicianActivityLog.objects.filter(
            technician=technician,
            ticket=ticket,
            action_type=TechnicianActivityLog.ACTION_TICKET_ACCEPTED,
            ended_at__isnull=True,
        )
        .order_by("-occurred_at", "-id")
        .first()
    )


def _close_technician_activity_log(activity_log: TechnicianActivityLog | None, ended_at: datetime) -> int | None:
    if not activity_log:
        return None

    duration_minutes = _duration_minutes_between(activity_log.occurred_at, ended_at)
    activity_log.ended_at = ended_at
    activity_log.duration_minutes = duration_minutes
    activity_log.save(update_fields=["ended_at", "duration_minutes"])
    return duration_minutes


def _record_technician_availability(technician: Technician, *, is_available: bool) -> datetime:
    recorded_at = timezone.now()
    technician.is_available = is_available
    technician.availability_updated_at = recorded_at
    update_fields = ["is_available", "availability_updated_at"]
    if is_available:
        if _latest_open_technician_session_log(technician) is None:
            _create_technician_activity_log(
                technician,
                action_type=TechnicianActivityLog.ACTION_CHECK_IN,
                description="Technician checked in through the QR checkpoint.",
                occurred_at=recorded_at,
            )
        technician.last_check_in_at = recorded_at
        update_fields.append("last_check_in_at")
    else:
        session_duration_minutes = _close_technician_activity_log(
            _latest_open_technician_session_log(technician),
            recorded_at,
        )
        _create_technician_activity_log(
            technician,
            action_type=TechnicianActivityLog.ACTION_CHECK_OUT,
            description="Technician checked out through the QR checkpoint.",
            occurred_at=recorded_at,
            duration_minutes=session_duration_minutes,
        )
        technician.last_check_out_at = recorded_at
        update_fields.append("last_check_out_at")
    technician.save(update_fields=update_fields)
    return recorded_at


def _user_to_dict(user: User) -> dict:
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "branch": user.branch,
        "role": user.role,
        "is_active": user.is_active,
        "must_change_password": user.must_change_password,
        "created_at": user.created_at.isoformat(),
        "updated_at": user.updated_at.isoformat(),
    }


def _notification_to_dict(item: Notification) -> dict:
    return {
        "id": item.id,
        "message": item.message,
        "type": item.type,
        "is_read": item.is_read,
        "ticket_id": item.ticket_id,
        "ticket_message_id": item.ticket_message_id,
        "created_at": item.created_at.isoformat(),
        "read_at": item.read_at.isoformat() if item.read_at else None,
    }


def _notify_user(recipient: User, message: str, ticket: Ticket | None = None) -> None:
    Notification.objects.create(
        user=recipient,
        message=message,
        type=Notification.TYPE_SYSTEM,
        ticket=ticket,
    )


def _mark_ticket_activity(ticket: Ticket, *, at_time: datetime | None = None) -> None:
    activity_at = at_time or timezone.now()
    ticket.last_activity_at = activity_at
    ticket.save(update_fields=["last_activity_at", "updated_at"])


def _record_assignment_history(
    ticket: Ticket,
    technician: Technician | None,
    *,
    reason: str,
    note: str = "",
    assigned_at: datetime | None = None,
) -> None:
    if not technician:
        return

    TicketAssignmentHistory.objects.create(
        ticket=ticket,
        technician=technician,
        reason=reason,
        note=note,
        assigned_at=assigned_at or timezone.now(),
    )


def _previously_assigned_technician_ids(ticket: Ticket) -> set[int]:
    previous_ids = set(ticket.assignment_history.values_list("technician_id", flat=True))
    if ticket.technician_id:
        previous_ids.add(ticket.technician_id)
    return previous_ids


def _resolve_system_actor_for_ticket(ticket: Ticket) -> User | None:
    candidate_user_ids: list[int] = []
    if ticket.logged_by_admin_id:
        candidate_user_ids.append(ticket.logged_by_admin_id)
    if ticket.technician_id and ticket.technician.user_id:
        candidate_user_ids.append(ticket.technician.user_id)

    for candidate_user_id in candidate_user_ids:
        candidate_user = User.objects.filter(id=candidate_user_id, is_active=True).first()
        if candidate_user and candidate_user.role != User.ROLE_EMPLOYEE:
            return candidate_user

    for role in (User.ROLE_ADMIN_FAULT, User.ROLE_MANAGER, User.ROLE_ADMIN_CONSUMABLES, User.ROLE_TECHNICIAN):
        candidate_user = User.objects.filter(role=role, is_active=True).order_by("id").first()
        if candidate_user:
            return candidate_user
    return None


def _add_internal_ticket_message(ticket: Ticket, content: str, *, actor: User | None = None) -> TicketMessage | None:
    resolved_actor = actor or _resolve_system_actor_for_ticket(ticket)
    if not resolved_actor:
        return None

    return TicketMessage.objects.create(
        ticket=ticket,
        sender=resolved_actor,
        message_type=TicketMessage.TYPE_INTERNAL_NOTE,
        content=content.strip(),
    )


def _assign_ticket_to_technician(
    ticket: Ticket,
    technician: Technician,
    *,
    assigned_at: datetime | None = None,
    status_value: str = Ticket.STATUS_PENDING,
    reset_acceptance: bool = True,
    increment_reassign: bool = False,
    history_reason: str = TicketAssignmentHistory.REASON_AUTO_ASSIGN,
    history_note: str = "",
) -> None:
    assignment_time = assigned_at or timezone.now()
    update_fields = ["technician", "assigned_at", "last_activity_at", "status", "updated_at"]

    ticket.technician = technician
    ticket.assigned_at = assignment_time
    ticket.last_activity_at = assignment_time
    ticket.status = status_value

    if reset_acceptance:
        ticket.accepted_at = None
        update_fields.append("accepted_at")

    if increment_reassign:
        ticket.reassign_count += 1
        update_fields.append("reassign_count")

    ticket.save(update_fields=update_fields)
    _record_assignment_history(
        ticket,
        technician,
        reason=history_reason,
        note=history_note,
        assigned_at=assignment_time,
    )


def _extract_ticket_business_impact(ticket: Ticket) -> str:
    match = BUSINESS_IMPACT_LINE_PATTERN.search(ticket.description or "")
    if not match:
        return ""
    return match.group(1).strip().lower()


AUTO_ASSIGNMENT_PRIORITY_ORDER = {
    Ticket.PRIORITY_CRITICAL: 0,
    Ticket.PRIORITY_HIGH: 1,
    Ticket.PRIORITY_MEDIUM: 2,
    Ticket.PRIORITY_LOW: 3,
}


def _waiting_ticket_candidates() -> list[Ticket]:
    tickets = list(
        Ticket.objects.select_related("employee", "technician__user", "logged_by_admin")
        .filter(technician__isnull=True)
        .exclude(status__in=[Ticket.STATUS_SOLVED, Ticket.LEGACY_STATUS_RESOLVED])
    )
    tickets.sort(
        key=lambda item: (
            AUTO_ASSIGNMENT_PRIORITY_ORDER.get(item.priority, 99),
            item.created_at,
            item.id,
        )
    )
    return tickets


def _assign_ticket_to_technician_from_waiting_queue(ticket: Ticket, technician: Technician) -> Ticket:
    assignment_time = timezone.now()
    _assign_ticket_to_technician(
        ticket,
        technician,
        assigned_at=assignment_time,
        status_value=Ticket.STATUS_PENDING,
        history_reason=TicketAssignmentHistory.REASON_AUTO_ASSIGN,
        history_note="Auto-assigned from waiting queue.",
    )

    _notify_user(
        technician.user,
        f"Ticket #{ticket.id} was assigned to you automatically from the waiting queue.",
        ticket=ticket,
    )
    _notify_user(
        ticket.employee,
        f"Ticket #{ticket.id} has been assigned to technician {technician.user.name}.",
        ticket=ticket,
    )
    for admin_user in User.objects.filter(role=User.ROLE_ADMIN_FAULT, is_active=True):
        _notify_user(
            admin_user,
            f"Waiting ticket #{ticket.id} auto-assigned to {technician.user.name}.",
            ticket=ticket,
        )

    ticket.refresh_from_db()
    return ticket


def _auto_assign_next_waiting_ticket(*, preferred_technician: Technician | None = None) -> Ticket | None:
    waiting_tickets = _waiting_ticket_candidates()
    if not waiting_tickets:
        return None

    restricted_ids = {preferred_technician.id} if preferred_technician is not None else None
    for waiting_ticket in waiting_tickets:
        auto_target, _, _ = _pick_best_technician_for_ticket(
            category=waiting_ticket.category,
            title=waiting_ticket.title,
            description=waiting_ticket.description,
            restrict_to_technician_ids=restricted_ids,
            allow_unavailable_fallback=False,
        )
        if auto_target is None:
            continue
        return _assign_ticket_to_technician_from_waiting_queue(waiting_ticket, auto_target)
    return None
FORGOT_PASSWORD_GENERIC_MESSAGE = (
    "If an account with that email exists, a password reset link has been sent."
)


def _env_int(name: str, default: int, *, minimum: int) -> int:
    try:
        value = int(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        value = default
    return max(value, minimum)


def _hash_one_time_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def _hash_invite_token(raw_token: str) -> str:
    return _hash_one_time_token(raw_token)


def _resolve_frontend_base_url() -> str:
    return (
        os.getenv("FRONTEND_APP_URL")
        or os.getenv("FRONTEND_BASE_URL")
        or os.getenv("APP_BASE_URL")
        or "http://127.0.0.1:3000"
    ).rstrip("/")


def _extract_client_ip(request) -> str:
    forwarded_for = str(request.META.get("HTTP_X_FORWARDED_FOR", "")).strip()
    if forwarded_for:
        first_ip = forwarded_for.split(",")[0].strip()
        if first_ip:
            return first_ip[:64]
    return str(request.META.get("REMOTE_ADDR", "")).strip()[:64]


def _increment_rate_limit_counter(key: str, window_seconds: int) -> int:
    current = cache.get(key, 0)
    try:
        current_value = int(current)
    except (TypeError, ValueError):
        current_value = 0
    next_value = current_value + 1
    cache.set(key, next_value, timeout=window_seconds)
    return next_value


def _forgot_password_is_rate_limited(request, email: str) -> bool:
    window_seconds = _env_int("PASSWORD_RESET_RATE_LIMIT_WINDOW_SECONDS", 900, minimum=60)
    max_requests_per_ip = _env_int("PASSWORD_RESET_RATE_LIMIT_MAX_IP", 20, minimum=1)
    max_requests_per_email = _env_int("PASSWORD_RESET_RATE_LIMIT_MAX_EMAIL", 5, minimum=1)

    client_ip = _extract_client_ip(request) or "unknown"
    ip_key_hash = hashlib.sha256(client_ip.encode("utf-8")).hexdigest()
    ip_key = f"auth:forgot-password:ip:{ip_key_hash}"
    if _increment_rate_limit_counter(ip_key, window_seconds) > max_requests_per_ip:
        return True

    if email:
        email_key_hash = hashlib.sha256(email.encode("utf-8")).hexdigest()
        email_key = f"auth:forgot-password:email:{email_key_hash}"
        if _increment_rate_limit_counter(email_key, window_seconds) > max_requests_per_email:
            return True
    return False


def _validate_new_password(candidate_password: str, *, user: User | None = None) -> str | None:
    try:
        validate_password(candidate_password, user=user)
        return None
    except ValidationError as exc:
        messages = [str(message).strip() for message in exc.messages if str(message).strip()]
        if messages:
            return " ".join(messages)
        return "Password does not meet security requirements."


def _send_password_setup_invite_email(
    *,
    recipient_name: str,
    recipient_email: str,
    role_label: str,
    invite_url: str,
    expires_in_hours: int,
) -> None:
    if not settings.EMAIL_HOST_USER or not settings.EMAIL_HOST_PASSWORD:
        raise RuntimeError(
            "Email service is not configured. Set EMAIL_HOST_USER and EMAIL_HOST_PASSWORD to send invites."
        )

    subject = f"Set up your LEC IntelliSupport {role_label} account"
    message = (
        f"Hello {recipient_name},\n\n"
        f"Your {role_label} account has been created by Admin Fault.\n"
        "Use this secure one-time link to set your password:\n"
        f"{invite_url}\n\n"
        f"This link expires in {expires_in_hours} hours.\n"
        f"Account email: {recipient_email}\n\n"
        "If you did not expect this, contact IT support immediately.\n\n"
        "Regards,\n"
        "LEC IntelliSupport"
    )
    send_mail(
        subject=subject,
        message=message,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[recipient_email],
        fail_silently=False,
    )


def _send_password_reset_email(
    *,
    recipient_name: str,
    recipient_email: str,
    reset_url: str,
    expires_in_minutes: int,
) -> None:
    if not settings.EMAIL_HOST_USER or not settings.EMAIL_HOST_PASSWORD:
        raise RuntimeError(
            "Email service is not configured. Set EMAIL_HOST_USER and EMAIL_HOST_PASSWORD to send reset emails."
        )

    subject = "Reset your LEC IntelliSupport password"
    message = (
        f"Hello {recipient_name},\n\n"
        "We received a request to reset your LEC IntelliSupport password.\n"
        "Use this secure one-time link:\n"
        f"{reset_url}\n\n"
        f"This link expires in {expires_in_minutes} minutes.\n"
        "If you did not request this, you can ignore this email.\n\n"
        "Regards,\n"
        "LEC IntelliSupport"
    )
    send_mail(
        subject=subject,
        message=message,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[recipient_email],
        fail_silently=False,
    )


def _create_password_setup_invite(user: User, role_label: str) -> None:
    now = timezone.now()
    invite_ttl_hours = _env_int("PASSWORD_SETUP_INVITE_TTL_HOURS", 24, minimum=1)
    raw_token = secrets.token_urlsafe(32)
    token_hash = _hash_one_time_token(raw_token)

    UserInvite.objects.filter(user=user, used_at__isnull=True, expires_at__gt=now).update(expires_at=now)
    UserInvite.objects.create(
        user=user,
        token_hash=token_hash,
        expires_at=now + timedelta(hours=invite_ttl_hours),
    )

    app_base_url = _resolve_frontend_base_url()
    invite_url = f"{app_base_url}/set-password?token={raw_token}"
    _send_password_setup_invite_email(
        recipient_name=user.name,
        recipient_email=user.email,
        role_label=role_label,
        invite_url=invite_url,
        expires_in_hours=invite_ttl_hours,
    )


def _create_password_reset_token(user: User, request) -> None:
    now = timezone.now()
    reset_ttl_minutes = _env_int("PASSWORD_RESET_TTL_MINUTES", 30, minimum=5)
    raw_token = secrets.token_urlsafe(32)
    token_hash = _hash_one_time_token(raw_token)

    PasswordResetToken.objects.filter(user=user, used_at__isnull=True, expires_at__gt=now).update(expires_at=now)
    PasswordResetToken.objects.create(
        user=user,
        token_hash=token_hash,
        expires_at=now + timedelta(minutes=reset_ttl_minutes),
        requested_ip=_extract_client_ip(request),
        requested_user_agent=str(request.META.get("HTTP_USER_AGENT", "")).strip()[:255],
    )

    app_base_url = _resolve_frontend_base_url()
    reset_url = f"{app_base_url}/reset-password?token={raw_token}"
    _send_password_reset_email(
        recipient_name=user.name,
        recipient_email=user.email,
        reset_url=reset_url,
        expires_in_minutes=reset_ttl_minutes,
    )


@api_view(["POST"])
def login_view(request):
    email = str(request.data.get("email", "")).strip().lower()
    password = str(request.data.get("password", ""))

    if not email or not password:
        return Response({"message": "Email and password are required."}, status=status.HTTP_400_BAD_REQUEST)

    user = User.objects.filter(email=email, is_active=True).first()
    if not user:
        return Response({"message": "Invalid credentials."}, status=status.HTTP_401_UNAUTHORIZED)

    if not check_password(password, user.password_hash):
        return Response({"message": "Invalid credentials."}, status=status.HTTP_401_UNAUTHORIZED)

    return Response(
        {
            "id": user.id,
            "name": user.name,
            "role": user.role,
            "must_change_password": user.must_change_password,
            "token": issue_auth_token(user),
        },
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
def technician_checkpoint_view(request):
    email = str(request.data.get("email", "")).strip().lower()
    password = str(request.data.get("password", ""))
    action = _normalize_technician_checkpoint_action(request.data.get("action"))

    if not email or not password or not action:
        return Response(
            {"message": "email, password, and a valid action are required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user = User.objects.filter(email=email, role=User.ROLE_TECHNICIAN, is_active=True).first()
    if not user or not check_password(password, user.password_hash):
        return Response({"message": "Invalid credentials."}, status=status.HTTP_401_UNAUTHORIZED)

    technician = Technician.objects.select_related("user").filter(user=user).first()
    if not technician:
        return Response({"message": "Technician profile not found."}, status=status.HTTP_404_NOT_FOUND)

    is_available = action == "check_in"
    recorded_at = _record_technician_availability(technician, is_available=is_available)
    technician.refresh_from_db()

    if is_available:
        assigned_ticket = _auto_assign_next_waiting_ticket(preferred_technician=technician)
        message = f"{technician.user.name} checked in successfully."
        if assigned_ticket is not None:
            assignment_note = (
                f"Ticket #{assigned_ticket.id} has been assigned to you automatically from the waiting queue."
            )
        else:
            assignment_note = "You are now available for new automatic ticket assignments."
    else:
        message = f"{technician.user.name} checked out successfully."
        assignment_note = (
            "Your check-out has been recorded. You will not receive new automatic ticket assignments "
            "until you check in again."
        )

    return Response(
        {
            "message": message,
            "action": action,
            "recorded_at": recorded_at.isoformat(),
            "timezone": BUSINESS_TIMEZONE,
            "assignment_note": assignment_note,
            "technician": _technician_to_dict(technician),
        },
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
def forgot_password_view(request):
    email = str(request.data.get("email", "")).strip().lower()
    if _forgot_password_is_rate_limited(request, email):
        return Response({"message": FORGOT_PASSWORD_GENERIC_MESSAGE}, status=status.HTTP_200_OK)

    if email:
        user = User.objects.filter(email=email, is_active=True).first()
        if user:
            try:
                _create_password_reset_token(user, request)
            except (RuntimeError, SMTPException):
                # Never expose delivery failures to avoid leaking account state.
                pass

    return Response({"message": FORGOT_PASSWORD_GENERIC_MESSAGE}, status=status.HTTP_200_OK)


@api_view(["PUT"])
def change_password_view(request):
    user_id = request.data.get("user_id")
    current_password = str(request.data.get("current_password", ""))
    new_password = str(request.data.get("new_password", ""))

    if not user_id or not current_password or not new_password:
        return Response(
            {"message": "user_id, current_password, and new_password are required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user = User.objects.filter(id=user_id, is_active=True).first()
    if not user:
        return Response({"message": "User not found."}, status=status.HTTP_404_NOT_FOUND)

    if not check_password(current_password, user.password_hash):
        return Response({"message": "Current password is incorrect."}, status=status.HTTP_400_BAD_REQUEST)

    password_validation_error = _validate_new_password(new_password, user=user)
    if password_validation_error:
        return Response({"message": password_validation_error}, status=status.HTTP_400_BAD_REQUEST)

    user.password_hash = make_password(new_password)
    user.must_change_password = False
    user.save(update_fields=["password_hash", "must_change_password", "updated_at"])
    return Response({"message": "Password changed successfully."}, status=status.HTTP_200_OK)


@api_view(["POST"])
def setup_password_view(request):
    token = str(request.data.get("token", "")).strip()
    new_password = str(request.data.get("new_password", ""))

    if not token or not new_password:
        return Response(
            {"message": "token and new_password are required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    token_hash = _hash_invite_token(token)
    invite = UserInvite.objects.select_related("user").filter(token_hash=token_hash).first()
    if not invite:
        return Response({"message": "Invalid or expired invite link."}, status=status.HTTP_400_BAD_REQUEST)

    password_validation_error = _validate_new_password(new_password, user=invite.user)
    if password_validation_error:
        return Response({"message": password_validation_error}, status=status.HTTP_400_BAD_REQUEST)

    now = timezone.now()
    if invite.used_at is not None or invite.expires_at <= now:
        return Response({"message": "Invalid or expired invite link."}, status=status.HTTP_400_BAD_REQUEST)

    user = invite.user
    if not user.is_active:
        return Response({"message": "Account is inactive. Contact admin."}, status=status.HTTP_400_BAD_REQUEST)

    with transaction.atomic():
        user.password_hash = make_password(new_password)
        user.must_change_password = False
        user.save(update_fields=["password_hash", "must_change_password", "updated_at"])
        invite.used_at = now
        invite.save(update_fields=["used_at"])

    return Response({"message": "Password set successfully. You can now login."}, status=status.HTTP_200_OK)


@api_view(["POST"])
def reset_password_view(request):
    token = str(request.data.get("token", "")).strip()
    new_password = str(request.data.get("new_password", ""))

    if not token or not new_password:
        return Response(
            {"message": "token and new_password are required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    token_hash = _hash_one_time_token(token)
    reset_token = PasswordResetToken.objects.select_related("user").filter(token_hash=token_hash).first()
    if not reset_token:
        return Response({"message": "Invalid or expired reset link."}, status=status.HTTP_400_BAD_REQUEST)

    password_validation_error = _validate_new_password(new_password, user=reset_token.user)
    if password_validation_error:
        return Response({"message": password_validation_error}, status=status.HTTP_400_BAD_REQUEST)

    now = timezone.now()
    if reset_token.used_at is not None or reset_token.expires_at <= now:
        return Response({"message": "Invalid or expired reset link."}, status=status.HTTP_400_BAD_REQUEST)

    user = reset_token.user
    if not user.is_active:
        return Response({"message": "Account is inactive. Contact admin."}, status=status.HTTP_400_BAD_REQUEST)

    with transaction.atomic():
        locked_token = (
            PasswordResetToken.objects.select_related("user")
            .select_for_update()
            .filter(id=reset_token.id)
            .first()
        )
        if not locked_token or locked_token.used_at is not None or locked_token.expires_at <= now:
            return Response({"message": "Invalid or expired reset link."}, status=status.HTTP_400_BAD_REQUEST)

        user.password_hash = make_password(new_password)
        user.must_change_password = False
        user.save(update_fields=["password_hash", "must_change_password", "updated_at"])

        locked_token.used_at = now
        locked_token.save(update_fields=["used_at"])
        PasswordResetToken.objects.filter(user=user, used_at__isnull=True).exclude(id=locked_token.id).update(used_at=now)

    return Response({"message": "Password reset successfully. You can now login."}, status=status.HTTP_200_OK)


@api_view(["GET", "PUT"])
def business_hours_default_view(request):
    config = _ensure_default_business_hours()
    if request.method == "GET":
        return Response(_business_hours_to_dict(config), status=status.HTTP_200_OK)

    name = str(request.data.get("name", config.name)).strip() or "Default Business Hours"
    description = str(request.data.get("description", config.description)).strip()
    timezone_name = BUSINESS_TIMEZONE

    groups, groups_error = _normalize_business_groups(request.data.get("groups", config.groups))
    if groups_error:
        return Response({"message": groups_error}, status=status.HTTP_400_BAD_REQUEST)

    schedule, schedule_error = _normalize_business_schedule(request.data.get("schedule", config.weekly_schedule))
    if schedule_error:
        return Response({"message": schedule_error}, status=status.HTTP_400_BAD_REQUEST)

    if "holidays" in request.data:
        holidays, holidays_error = _normalize_business_holidays(request.data.get("holidays"))
        if holidays_error:
            return Response({"message": holidays_error}, status=status.HTTP_400_BAD_REQUEST)
    else:
        holidays = [
            {
                "id": holiday.id,
                "name": holiday.name,
                "date": holiday.date,
            }
            for holiday in config.holidays.all()
        ]

    if "leaves" in request.data:
        leaves, leaves_error = _normalize_business_leaves(request.data.get("leaves"), business_hours=config)
        if leaves_error:
            return Response({"message": leaves_error}, status=status.HTTP_400_BAD_REQUEST)
    else:
        leaves = [
            {
                "id": leave.id,
                "technician_id": leave.technician_id,
                "leave_type": leave.leave_type,
                "start_date": leave.start_date,
                "end_date": leave.end_date,
            }
            for leave in config.leaves.all()
        ]

    existing_holiday_ids = set(config.holidays.values_list("id", flat=True))
    for item in holidays:
        holiday_id = item.get("id")
        if holiday_id and holiday_id not in existing_holiday_ids:
            return Response(
                {"message": "One or more holidays do not belong to the default business hours profile."},
                status=status.HTTP_400_BAD_REQUEST,
            )
    existing_leave_ids = set(config.leaves.values_list("id", flat=True))
    for item in leaves:
        leave_id = item.get("id")
        if leave_id and leave_id not in existing_leave_ids:
            return Response(
                {"message": "One or more leave records do not belong to the default business hours profile."},
                status=status.HTTP_400_BAD_REQUEST,
            )

    try:
        with transaction.atomic():
            locked_config = BusinessHours.objects.select_for_update().filter(id=config.id).first()
            if not locked_config:
                return Response({"message": "Business hours profile not found."}, status=status.HTTP_404_NOT_FOUND)

            locked_config.name = name
            locked_config.description = description
            locked_config.timezone_name = timezone_name
            locked_config.groups = groups
            locked_config.weekly_schedule = schedule
            locked_config.save(
                update_fields=[
                    "name",
                    "description",
                    "timezone_name",
                    "groups",
                    "weekly_schedule",
                    "updated_at",
                ]
            )

            locked_holidays = {
                holiday.id: holiday
                for holiday in BusinessHoliday.objects.select_for_update().filter(business_hours=locked_config)
            }
            retained_holiday_ids: set[int] = set()
            for item in holidays:
                holiday_id = item["id"]
                if holiday_id and holiday_id in locked_holidays:
                    holiday = locked_holidays[holiday_id]
                    holiday.name = item["name"]
                    holiday.date = item["date"]
                    holiday.save(update_fields=["name", "date"])
                    retained_holiday_ids.add(holiday.id)
                else:
                    holiday, _ = BusinessHoliday.objects.update_or_create(
                        business_hours=locked_config,
                        date=item["date"],
                        defaults={"name": item["name"]},
                    )
                    retained_holiday_ids.add(holiday.id)

            BusinessHoliday.objects.filter(business_hours=locked_config).exclude(id__in=retained_holiday_ids).delete()

            locked_leaves = {
                leave.id: leave
                for leave in BusinessLeave.objects.select_for_update().filter(business_hours=locked_config)
            }
            retained_leave_ids: set[int] = set()
            for item in leaves:
                leave_id = item.get("id")
                if leave_id and leave_id in locked_leaves:
                    leave = locked_leaves[leave_id]
                    leave.technician_id = item["technician_id"]
                    leave.leave_type = item["leave_type"]
                    leave.start_date = item["start_date"]
                    leave.end_date = item["end_date"]
                    leave.save(update_fields=["technician", "leave_type", "start_date", "end_date"])
                    retained_leave_ids.add(leave.id)
                else:
                    leave = BusinessLeave.objects.create(
                        business_hours=locked_config,
                        technician_id=item["technician_id"],
                        leave_type=item["leave_type"],
                        start_date=item["start_date"],
                        end_date=item["end_date"],
                    )
                    retained_leave_ids.add(leave.id)

            BusinessLeave.objects.filter(business_hours=locked_config).exclude(id__in=retained_leave_ids).delete()
    except IntegrityError:
        return Response(
            {"message": "Duplicate holiday dates are not allowed."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    refreshed = BusinessHours.objects.filter(id=config.id).first()
    if not refreshed:
        return Response({"message": "Business hours profile not found."}, status=status.HTTP_404_NOT_FOUND)
    return Response(_business_hours_to_dict(refreshed), status=status.HTTP_200_OK)


@api_view(["GET", "POST"])
def tickets_collection_view(request):
    if request.method == "GET":
        employee_id = request.query_params.get("employee_id")
        queryset = Ticket.objects.select_related("employee", "technician__user", "logged_by_admin").all().order_by("-created_at")
        if employee_id:
            queryset = queryset.filter(employee_id=employee_id)
        return Response(
            [_ticket_to_dict(ticket, include_escalation_context=True) for ticket in queryset],
            status=status.HTTP_200_OK,
        )

    title = str(request.data.get("title", "")).strip()
    description = str(request.data.get("description", "")).strip()
    category_hint = str(request.data.get("category", "")).strip()
    priority_hint = str(request.data.get("priority", "")).strip()
    location = str(request.data.get("location", "")).strip()
    department = str(request.data.get("department", "")).strip()
    asset = str(request.data.get("asset", "")).strip()
    impact = str(request.data.get("impact", "")).strip()
    employee_id = request.data.get("employee_id")
    caller_name = str(request.data.get("caller_name", "")).strip()
    logged_by_admin_id = request.data.get("logged_by_admin_id")
    reporter_reviewed_problem = _to_optional_bool(request.data.get("reporter_reviewed_problem"))

    if not title or not description or not employee_id:
        return Response(
            {"message": "title, description, and employee_id are required."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if reporter_reviewed_problem is not True:
        return Response(
            {"message": "Reporter must review the problem details before submitting."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    employee = User.objects.filter(id=employee_id, role=User.ROLE_EMPLOYEE).first()
    if not employee:
        return Response({"message": "Employee not found."}, status=status.HTTP_404_NOT_FOUND)

    logged_by_admin = None
    if logged_by_admin_id not in (None, ""):
        logged_by_admin = User.objects.filter(id=logged_by_admin_id, role=User.ROLE_ADMIN_FAULT, is_active=True).first()
        if not logged_by_admin:
            return Response({"message": "Admin Fault user not found."}, status=status.HTTP_404_NOT_FOUND)
        if not caller_name:
            return Response({"message": "caller_name is required when admin logs a call."}, status=status.HTTP_400_BAD_REQUEST)

    provided_category = _normalize_ai_ticket_category(category_hint)
    auto_category, triage_skill_domain = _auto_ticket_category(
        title=title,
        description=description,
        category_hint=category_hint,
    )
    resolved_category = provided_category or auto_category

    provided_priority = _normalize_ai_ticket_priority(priority_hint)
    auto_priority = _auto_ticket_priority(
        title=title,
        description=description,
    )
    resolved_priority = provided_priority or auto_priority

    composed_description = _compose_ticket_description(
        description,
        location=location,
        department=department,
        asset=asset,
        impact=impact,
    )

    auto_assigned_technician, has_exact_skill_match, inferred_assignment_skill_domain = _pick_best_technician_for_ticket(
        category=resolved_category,
        title=title,
        description=composed_description,
        allow_unavailable_fallback=False,
    )

    assignment_time = timezone.now()
    ticket = Ticket.objects.create(
        title=title,
        description=composed_description,
        category=resolved_category,
        location=location,
        priority=resolved_priority,
        status=Ticket.STATUS_PENDING,
        employee=employee,
        caller_name=caller_name or employee.name,
        logged_by_admin=logged_by_admin,
        technician=auto_assigned_technician,
        assigned_at=assignment_time,
        last_activity_at=assignment_time,
        reporter_reviewed_problem=True,
    )
    submission_actor = caller_name or employee.name

    if auto_assigned_technician:
        _record_assignment_history(
            ticket,
            auto_assigned_technician,
            reason=TicketAssignmentHistory.REASON_AUTO_ASSIGN,
            note="Initial auto-assignment during ticket intake.",
            assigned_at=assignment_time,
        )
        _notify_user(
            auto_assigned_technician.user,
            f"Ticket #{ticket.id} auto-assigned to you based on skill/workload routing.",
            ticket=ticket,
        )
        _notify_user(
            ticket.employee,
            f"Ticket #{ticket.id} has been assigned to technician {auto_assigned_technician.user.name}.",
            ticket=ticket,
        )

    for admin_user in User.objects.filter(role=User.ROLE_ADMIN_FAULT, is_active=True):
        if auto_assigned_technician:
            _notify_user(
                admin_user,
                f"New ticket #{ticket.id} submitted by {submission_actor} and auto-assigned to {auto_assigned_technician.user.name}.",
                ticket=ticket,
            )
        else:
            _notify_user(admin_user, f"New ticket #{ticket.id} submitted by {submission_actor}.", ticket=ticket)

    payload = _ticket_to_dict(ticket)
    if provided_category or provided_priority:
        triage_note = (
            f"AI intake suggested category {resolved_category} and priority {resolved_priority}."
        )
    else:
        triage_note = f"Auto-triage set category to {resolved_category} and priority to {resolved_priority}."
    if auto_assigned_technician and has_exact_skill_match:
        payload["routing_note"] = (
            f"{triage_note} Ticket auto-assigned to {auto_assigned_technician.user.name} based on skill match and awaits technician acceptance."
        )
    elif auto_assigned_technician:
        if inferred_assignment_skill_domain:
            payload["routing_note"] = (
                f"{triage_note} No exact {inferred_assignment_skill_domain} skill match found. "
                f"Ticket auto-assigned to {auto_assigned_technician.user.name} using lowest workload and awaits technician acceptance."
            )
        elif triage_skill_domain:
            payload["routing_note"] = (
                f"{triage_note} Ticket auto-assigned to {auto_assigned_technician.user.name} "
                "using availability/workload balancing and awaits technician acceptance."
            )
        else:
            payload["routing_note"] = (
                f"{triage_note} Ticket auto-assigned to {auto_assigned_technician.user.name} "
                "using availability/workload balancing and awaits technician acceptance."
            )
    else:
        current_business_hours = _ensure_default_business_hours()
        if current_business_hours is None or not _is_business_hours_open_now(current_business_hours):
            payload["routing_note"] = (
                f"{triage_note} Support desk is currently outside working hours. "
                f"Technicians will receive your report during working hours from {_business_hours_window_label(current_business_hours)}."
            )
        elif Technician.objects.filter(user__is_active=True, user__role=User.ROLE_TECHNICIAN).exists():
            payload["routing_note"] = (
                f"{triage_note} Technicians are currently busy. "
                "Your report is waiting in the queue and will be assigned automatically as soon as a technician becomes available."
            )
        else:
            payload["routing_note"] = (
                f"{triage_note} No technicians are currently available. "
                "Your report will be assigned automatically once a technician becomes available."
            )
    return Response(payload, status=status.HTTP_201_CREATED)


@api_view(["GET"])
def assigned_tickets_view(request, technician_id: int):
    technician = (
        Technician.objects.select_related("user")
        .filter(Q(user_id=technician_id) | Q(id=technician_id))
        .first()
    )
    if not technician:
        return Response([], status=status.HTTP_200_OK)

    queryset = (
        Ticket.objects.select_related("employee", "technician__user", "logged_by_admin")
        .filter(technician_id=technician.id)
        .order_by("-updated_at", "-created_at")
    )
    payload = []
    for ticket in queryset:
        item = _ticket_to_dict(ticket, include_escalation_context=True)
        item["is_currently_assigned_to_me"] = True
        item["escalated_by_me"] = False
        item["current_owner"] = technician.user.name
        payload.append(item)
    return Response(payload, status=status.HTTP_200_OK)


@api_view(["GET"])
def ticket_detail_view(request, ticket_id: int):
    ticket = Ticket.objects.select_related("employee", "technician__user", "logged_by_admin").filter(id=ticket_id).first()
    if not ticket:
        return Response({"message": "Ticket not found."}, status=status.HTTP_404_NOT_FOUND)

    technician_user_id = request.query_params.get("technician_user_id")
    if technician_user_id not in (None, ""):
        try:
            technician_user_id_int = int(technician_user_id)
        except (TypeError, ValueError):
            return Response({"message": "technician_user_id must be a number."}, status=status.HTTP_400_BAD_REQUEST)

        if not ticket.technician_id or ticket.technician.user_id != technician_user_id_int:
            return Response(
                {"message": "You can only view tickets currently assigned to you."},
                status=status.HTTP_403_FORBIDDEN,
            )

    return Response(_ticket_detail_to_dict(ticket), status=status.HTTP_200_OK)


@api_view(["POST"])
def ticket_comments_view(request, ticket_id: int):
    ticket = Ticket.objects.select_related("employee", "technician__user", "logged_by_admin").filter(id=ticket_id).first()
    if not ticket:
        return Response({"message": "Ticket not found."}, status=status.HTTP_404_NOT_FOUND)

    author_id = request.data.get("author_id")
    comment_text = str(request.data.get("comment", "")).strip()

    if not author_id or not comment_text:
        return Response(
            {"message": "author_id and comment are required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        author_id_int = int(author_id)
    except (TypeError, ValueError):
        return Response({"message": "author_id must be a number."}, status=status.HTTP_400_BAD_REQUEST)

    author = User.objects.filter(id=author_id_int, is_active=True).first()
    if not author:
        return Response({"message": "Author not found."}, status=status.HTTP_404_NOT_FOUND)

    if author.role == User.ROLE_TECHNICIAN:
        return Response(
            {"message": "Technicians are not allowed to perform manual ticket comments."},
            status=status.HTTP_403_FORBIDDEN,
        )
    if author.role != User.ROLE_ADMIN_FAULT:
        return Response({"message": "Only Admin Fault can add comments."}, status=status.HTTP_403_FORBIDDEN)

    comment = TicketComment.objects.create(
        ticket=ticket,
        author=author,
        comment=comment_text,
    )
    _mark_ticket_activity(ticket)

    _notify_user(
        ticket.employee,
        f"New comment on Ticket #{ticket.id} from {author.name}.",
        ticket=ticket,
    )

    return Response(_ticket_comment_to_dict(comment), status=status.HTTP_201_CREATED)


@api_view(["GET", "POST"])
def ticket_material_requests_view(request, ticket_id: int):
    ticket = Ticket.objects.select_related("employee", "technician__user", "logged_by_admin").filter(id=ticket_id).first()
    if not ticket:
        return Response({"message": "Ticket not found."}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "GET":
        items = (
            TicketMaterialRequest.objects.select_related("requested_by")
            .filter(ticket=ticket)
            .order_by("-created_at")
        )
        return Response([_ticket_material_request_to_dict(item) for item in items], status=status.HTTP_200_OK)

    requested_by_id = request.data.get("requested_by_id")
    item_name = str(request.data.get("item_name", "")).strip()
    quantity = request.data.get("quantity")
    notes = str(request.data.get("notes", "")).strip()

    if not requested_by_id or not item_name or quantity in (None, ""):
        return Response(
            {"message": "requested_by_id, item_name, and quantity are required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        quantity_value = int(quantity)
    except (TypeError, ValueError):
        return Response({"message": "quantity must be a number."}, status=status.HTTP_400_BAD_REQUEST)

    if quantity_value <= 0:
        return Response({"message": "quantity must be greater than 0."}, status=status.HTTP_400_BAD_REQUEST)

    requester = User.objects.filter(id=requested_by_id, is_active=True).first()
    if not requester:
        return Response({"message": "Requester not found."}, status=status.HTTP_404_NOT_FOUND)
    if requester.role == User.ROLE_TECHNICIAN:
        return Response(
            {"message": "Technicians are not allowed to perform manual material requests."},
            status=status.HTTP_403_FORBIDDEN,
        )

    material_request = TicketMaterialRequest.objects.create(
        ticket=ticket,
        requested_by=requester,
        item_name=item_name,
        quantity=quantity_value,
        notes=notes,
    )

    TicketComment.objects.create(
        ticket=ticket,
        author=requester,
        comment=f"Requested material '{item_name}' x{quantity_value}. Note: {notes or 'N/A'}",
    )
    _mark_ticket_activity(ticket)

    for admin_user in User.objects.filter(Q(role=User.ROLE_ADMIN_FAULT) | Q(role=User.ROLE_ADMIN_CONSUMABLES), is_active=True):
        _notify_user(
            admin_user,
            f"Material request on Ticket #{ticket.id}: {item_name} x{quantity_value} by {requester.name}.",
            ticket=ticket,
        )

    return Response(_ticket_material_request_to_dict(material_request), status=status.HTTP_201_CREATED)


@api_view(["PUT"])
def assign_technician_view(request, ticket_id: int):
    ticket = Ticket.objects.select_related("employee", "technician__user", "logged_by_admin").filter(id=ticket_id).first()
    if not ticket:
        return Response({"message": "Ticket not found."}, status=status.HTTP_404_NOT_FOUND)

    return Response(
        {
            "message": (
                "Manual assignment is disabled. Technicians are assigned automatically by the system."
            )
        },
        status=status.HTTP_403_FORBIDDEN,
    )


@api_view(["PUT"])
def escalate_ticket_view(request, ticket_id: int):
    ticket = Ticket.objects.select_related("employee", "technician__user", "logged_by_admin").filter(id=ticket_id).first()
    if not ticket:
        return Response({"message": "Ticket not found."}, status=status.HTTP_404_NOT_FOUND)

    escalation_comment = str(request.data.get("comment", "")).strip()
    if not escalation_comment:
        return Response({"message": "comment is required when escalating."}, status=status.HTTP_400_BAD_REQUEST)

    target_technician_id = request.data.get("target_technician_id")
    from_admin_fault_user_id = request.data.get("from_admin_fault_user_id")
    from_technician_user_id = request.data.get("from_technician_user_id")

    # Admin Fault escalation path: admin reviews and escalates ticket to technician.
    if from_admin_fault_user_id not in (None, "", "null"):
        try:
            from_admin_fault_user_id_int = int(from_admin_fault_user_id)
        except (TypeError, ValueError):
            return Response({"message": "from_admin_fault_user_id must be a number."}, status=status.HTTP_400_BAD_REQUEST)

        actor_user = User.objects.filter(id=from_admin_fault_user_id_int, role=User.ROLE_ADMIN_FAULT, is_active=True).first()
        if not actor_user:
            return Response({"message": "Admin Fault user not found."}, status=status.HTTP_404_NOT_FOUND)

        if target_technician_id not in (None, "", "null"):
            return Response(
                {"message": "Manual escalation target selection is disabled. Escalation routing is automatic."},
                status=status.HTTP_403_FORBIDDEN,
            )

        auto_target_technician, has_exact_skill_match, inferred_domain = _pick_best_technician_for_ticket(
            category=ticket.category,
            title=ticket.title,
            description=ticket.description,
            exclude_technician_ids={ticket.technician_id} if ticket.technician_id else None,
            routing_context="reassignment",
        )
        if not auto_target_technician:
            return Response(
                {"message": "No alternative technician available for automatic escalation."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        previous_technician_user = ticket.technician.user if ticket.technician_id else None
        previous_technician = ticket.technician if ticket.technician_id else None
        _assign_ticket_to_technician(
            ticket,
            auto_target_technician,
            assigned_at=timezone.now(),
            status_value=Ticket.STATUS_PENDING,
            history_reason=TicketAssignmentHistory.REASON_ADMIN_ESCALATION,
            history_note=f"Admin Fault escalation by {actor_user.name}.",
        )

        if previous_technician is not None:
            work_duration_minutes = _close_technician_activity_log(
                _latest_open_ticket_work_log(previous_technician, ticket),
                timezone.now(),
            )
            _create_technician_activity_log(
                previous_technician,
                action_type=TechnicianActivityLog.ACTION_TICKET_ESCALATED,
                description=f"Escalated Ticket #{ticket.id} to {auto_target_technician.user.name}",
                ticket=ticket,
                duration_minutes=work_duration_minutes,
                metadata={"target_technician_id": auto_target_technician.id},
            )

        TicketComment.objects.create(
            ticket=ticket,
            author=actor_user,
            comment=f"Escalated to technician {auto_target_technician.user.name} by Admin Fault: {escalation_comment}",
        )
        if previous_technician_user and previous_technician_user.id != auto_target_technician.user_id:
            _notify_user(
                previous_technician_user,
                f"Ticket #{ticket.id} was auto-reassigned by Admin Fault to {auto_target_technician.user.name}.",
                ticket=ticket,
            )
        _notify_user(
            auto_target_technician.user,
            f"Ticket #{ticket.id} was auto-escalated to you by Admin Fault and awaits your acceptance.",
            ticket=ticket,
        )
        for admin_user in User.objects.filter(role=User.ROLE_ADMIN_FAULT, is_active=True):
            if has_exact_skill_match:
                escalation_note = "skill-match routing"
            elif inferred_domain:
                escalation_note = f"workload fallback for {inferred_domain} queue"
            else:
                escalation_note = "workload balancing"
            _notify_user(
                admin_user,
                f"Ticket #{ticket.id} auto-escalated to {auto_target_technician.user.name} by {actor_user.name} ({escalation_note}).",
                ticket=ticket,
            )
        if previous_technician is not None and previous_technician.id != auto_target_technician.id:
            _auto_assign_next_waiting_ticket(preferred_technician=previous_technician)
        return Response(_ticket_to_dict(ticket), status=status.HTTP_200_OK)

    if from_technician_user_id not in (None, "", "null"):
        try:
            from_technician_user_id_int = int(from_technician_user_id)
        except (TypeError, ValueError):
            return Response({"message": "from_technician_user_id must be a number."}, status=status.HTTP_400_BAD_REQUEST)

        actor_user = User.objects.filter(
            id=from_technician_user_id_int,
            role=User.ROLE_TECHNICIAN,
            is_active=True,
        ).first()
        if not actor_user:
            return Response({"message": "Technician user not found."}, status=status.HTTP_404_NOT_FOUND)
        if not ticket.technician_id or ticket.technician.user_id != actor_user.id:
            return Response(
                {"message": "You can only escalate tickets currently assigned to you."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if target_technician_id in (None, "", "null"):
            return Response({"message": "target_technician_id is required for technician escalation."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            target_technician_id_int = int(target_technician_id)
        except (TypeError, ValueError):
            return Response({"message": "target_technician_id must be a number."}, status=status.HTTP_400_BAD_REQUEST)

        target_technician = Technician.objects.filter(id=target_technician_id_int).select_related("user").first()
        if not target_technician:
            target_technician = Technician.objects.filter(user_id=target_technician_id_int).select_related("user").first()
        if not target_technician:
            return Response({"message": "Target technician not found."}, status=status.HTTP_404_NOT_FOUND)
        if not target_technician.is_available or not target_technician.user.is_active:
            return Response(
                {"message": "Target technician is not currently available for escalation."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if ticket.technician_id == target_technician.id:
            return Response({"message": "Ticket is already assigned to this technician."}, status=status.HTTP_400_BAD_REQUEST)

        previous_technician_user = ticket.technician.user if ticket.technician_id else None
        previous_technician = ticket.technician if ticket.technician_id else None
        _assign_ticket_to_technician(
            ticket,
            target_technician,
            assigned_at=timezone.now(),
            status_value=Ticket.STATUS_PENDING,
            history_reason=TicketAssignmentHistory.REASON_TECHNICIAN_ESCALATION,
            history_note=f"Technician escalation by {actor_user.name}.",
        )

        if previous_technician is not None:
            work_duration_minutes = _close_technician_activity_log(
                _latest_open_ticket_work_log(previous_technician, ticket),
                timezone.now(),
            )
            _create_technician_activity_log(
                previous_technician,
                action_type=TechnicianActivityLog.ACTION_TICKET_ESCALATED,
                description=f"Escalated Ticket #{ticket.id} to {target_technician.user.name}",
                ticket=ticket,
                duration_minutes=work_duration_minutes,
                metadata={"target_technician_id": target_technician.id},
            )

        TicketComment.objects.create(
            ticket=ticket,
            author=actor_user,
            comment=f"Escalated to technician {target_technician.user.name} by {actor_user.name}: {escalation_comment}",
        )

        if previous_technician_user and previous_technician_user.id != target_technician.user_id:
            _notify_user(
                previous_technician_user,
                f"Ticket #{ticket.id} was escalated by you to {target_technician.user.name}.",
                ticket=ticket,
            )
        _notify_user(
            target_technician.user,
            f"Ticket #{ticket.id} escalated to you by {actor_user.name} and awaits your acceptance.",
            ticket=ticket,
        )
        _notify_user(
            ticket.employee,
            f"Ticket #{ticket.id} was escalated from {actor_user.name} to {target_technician.user.name} and is awaiting acceptance.",
            ticket=ticket,
        )
        for admin_user in User.objects.filter(role=User.ROLE_ADMIN_FAULT, is_active=True):
            _notify_user(
                admin_user,
                f"Technician {actor_user.name} escalated Ticket #{ticket.id} to {target_technician.user.name}.",
                ticket=ticket,
            )
        if previous_technician is not None and previous_technician.id != target_technician.id:
            _auto_assign_next_waiting_ticket(preferred_technician=previous_technician)
        return Response(_ticket_to_dict(ticket), status=status.HTTP_200_OK)

    return Response(
        {"message": "Provide from_admin_fault_user_id or from_technician_user_id to escalate."},
        status=status.HTTP_400_BAD_REQUEST,
    )


@api_view(["GET", "POST"])
def technicians_collection_view(request):
    if request.method == "GET":
        technicians = Technician.objects.select_related("user").all().order_by("user__name")
        return Response([_technician_to_dict(item) for item in technicians], status=status.HTTP_200_OK)

    name = str(request.data.get("name", "")).strip()
    email = str(request.data.get("email", "")).strip().lower()
    skillset = _normalize_skillset_value(str(request.data.get("skillset", "")))
    raw_is_available = request.data.get("is_available", False)
    if isinstance(raw_is_available, str):
        is_available = raw_is_available.strip().lower() not in ("0", "false", "no")
    else:
        is_available = bool(raw_is_available)

    if not name or not email or not skillset:
        return Response(
            {"message": "name, email, and skillset are required."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if skillset not in ALLOWED_TECHNICIAN_SKILLSETS:
        return Response(
            {"message": "skillset must be one of: Network, Software, Hardware, Security."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if User.objects.filter(email=email).exists():
        return Response({"message": "A user with this email already exists."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        with transaction.atomic():
            user = User.objects.create(
                name=name,
                email=email,
                branch=TECHNICIAN_FIXED_BRANCH,
                password_hash=make_password(secrets.token_urlsafe(24)),
                must_change_password=True,
                role=User.ROLE_TECHNICIAN,
                is_active=True,
            )
            technician = Technician.objects.create(
                user=user,
                skillset=skillset,
                department=TECHNICIAN_FIXED_DEPARTMENT,
                is_available=is_available,
            )
            _create_password_setup_invite(user, "Technician")
    except IntegrityError:
        return Response({"message": "Failed to create technician."}, status=status.HTTP_400_BAD_REQUEST)
    except RuntimeError as email_config_error:
        return Response({"message": str(email_config_error)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    except (SMTPException, OSError):
        return Response(
            {"message": "Failed to send technician setup invite email. Account was not created."},
            status=status.HTTP_502_BAD_GATEWAY,
        )

    return Response(_technician_to_dict(technician), status=status.HTTP_201_CREATED)


@api_view(["PATCH", "DELETE"])
def technician_detail_view(request, technician_id: int):
    technician = Technician.objects.select_related("user").filter(id=technician_id).first()
    if not technician:
        return Response({"message": "Technician not found."}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "PATCH":
        updated_user_fields: list[str] = []
        updated_technician_fields: list[str] = []

        if "name" in request.data:
            name = str(request.data.get("name", "")).strip()
            if not name:
                return Response({"message": "name is required."}, status=status.HTTP_400_BAD_REQUEST)
            technician.user.name = name
            updated_user_fields.append("name")

        if "email" in request.data:
            email = str(request.data.get("email", "")).strip().lower()
            if not email:
                return Response({"message": "email is required."}, status=status.HTTP_400_BAD_REQUEST)
            if User.objects.exclude(id=technician.user_id).filter(email=email).exists():
                return Response({"message": "A user with this email already exists."}, status=status.HTTP_400_BAD_REQUEST)
            technician.user.email = email
            updated_user_fields.append("email")

        if "skillset" in request.data:
            skillset = _normalize_skillset_value(str(request.data.get("skillset", "")))
            if not skillset:
                return Response(
                    {"message": "skillset must be one of: Network, Software, Hardware, Security."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if skillset not in ALLOWED_TECHNICIAN_SKILLSETS:
                return Response(
                    {"message": "skillset must be one of: Network, Software, Hardware, Security."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            technician.skillset = skillset
            updated_technician_fields.append("skillset")

        if "is_active" in request.data:
            raw_is_active = request.data.get("is_active")
            if isinstance(raw_is_active, str):
                is_active = raw_is_active.strip().lower() not in ("0", "false", "no")
            else:
                is_active = bool(raw_is_active)
            technician.user.is_active = is_active
            updated_user_fields.append("is_active")

        if not updated_user_fields and not updated_technician_fields:
            return Response(
                {"message": "Provide at least one field to update."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if updated_user_fields:
            technician.user.save(update_fields=[*updated_user_fields, "updated_at"])
        if updated_technician_fields:
            technician.save(update_fields=updated_technician_fields)
        return Response(_technician_to_dict(technician), status=status.HTTP_200_OK)

    user = technician.user
    user.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["GET", "POST"])
def employees_collection_view(request):
    if request.method == "GET":
        employees = User.objects.filter(role=User.ROLE_EMPLOYEE).order_by("name")
        return Response([_user_to_dict(item) for item in employees], status=status.HTTP_200_OK)

    name = str(request.data.get("name", "")).strip()
    email = str(request.data.get("email", "")).strip().lower()
    branch = str(request.data.get("branch", "")).strip()
    raw_is_active = request.data.get("is_active", True)
    if isinstance(raw_is_active, str):
        is_active = raw_is_active.strip().lower() not in ("0", "false", "no")
    else:
        is_active = bool(raw_is_active)

    if not name or not email:
        return Response(
            {"message": "name and email are required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if User.objects.filter(email=email).exists():
        return Response({"message": "A user with this email already exists."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        with transaction.atomic():
            user = User.objects.create(
                name=name,
                email=email,
                branch=branch,
                password_hash=make_password(secrets.token_urlsafe(24)),
                must_change_password=True,
                role=User.ROLE_EMPLOYEE,
                is_active=is_active,
            )
            _create_password_setup_invite(user, "Employee")
    except IntegrityError:
        return Response({"message": "Failed to create employee."}, status=status.HTTP_400_BAD_REQUEST)
    except RuntimeError as email_config_error:
        return Response({"message": str(email_config_error)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    except (SMTPException, OSError):
        return Response(
            {"message": "Failed to send employee setup invite email. Account was not created."},
            status=status.HTTP_502_BAD_GATEWAY,
        )

    return Response(_user_to_dict(user), status=status.HTTP_201_CREATED)


@api_view(["PATCH", "DELETE"])
def employee_detail_view(request, employee_id: int):
    if request.method == "PATCH":
        employee = User.objects.filter(id=employee_id, role=User.ROLE_EMPLOYEE).first()
        if not employee:
            return Response({"message": "Employee not found."}, status=status.HTTP_404_NOT_FOUND)

        updated_fields: list[str] = []

        if "name" in request.data:
            name = str(request.data.get("name", "")).strip()
            if not name:
                return Response({"message": "name is required."}, status=status.HTTP_400_BAD_REQUEST)
            employee.name = name
            updated_fields.append("name")

        if "email" in request.data:
            email = str(request.data.get("email", "")).strip().lower()
            if not email:
                return Response({"message": "email is required."}, status=status.HTTP_400_BAD_REQUEST)
            if User.objects.exclude(id=employee.id).filter(email=email).exists():
                return Response({"message": "A user with this email already exists."}, status=status.HTTP_400_BAD_REQUEST)
            employee.email = email
            updated_fields.append("email")

        if "branch" in request.data:
            employee.branch = str(request.data.get("branch", "")).strip()
            updated_fields.append("branch")

        if "is_active" in request.data:
            raw_is_active = request.data.get("is_active")
            if isinstance(raw_is_active, str):
                is_active = raw_is_active.strip().lower() not in ("0", "false", "no")
            else:
                is_active = bool(raw_is_active)
            employee.is_active = is_active
            updated_fields.append("is_active")

        if not updated_fields:
            return Response(
                {"message": "Provide at least one field to update."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        employee.save(update_fields=[*updated_fields, "updated_at"])
        return Response(_user_to_dict(employee), status=status.HTTP_200_OK)

    employee = User.objects.filter(
        id=employee_id,
        role__in=[User.ROLE_EMPLOYEE, User.ROLE_TECHNICIAN],
    ).first()
    if not employee:
        return Response({"message": "Requester not found."}, status=status.HTTP_404_NOT_FOUND)

    try:
        with transaction.atomic():
            # Hard-delete dependent records so employee deletion is not blocked by PROTECT FKs.
            TicketComment.objects.filter(author=employee).delete()
            TicketMaterialRequest.objects.filter(requested_by=employee).delete()
            InventoryAssignment.objects.filter(employee=employee).delete()
            ConsumableRequest.objects.filter(employee=employee).delete()
            Ticket.objects.filter(employee=employee).delete()
            employee.delete()
    except ProtectedError:
        return Response(
            {"message": "Cannot delete employee because additional protected records still exist."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["GET"])
def notifications_view(request):
    user_id = request.query_params.get("user_id")
    if not user_id:
        return Response({"message": "user_id is required."}, status=status.HTTP_400_BAD_REQUEST)

    user = User.objects.filter(id=user_id, is_active=True).first()
    if not user:
        return Response({"message": "User not found."}, status=status.HTTP_404_NOT_FOUND)

    queryset = Notification.objects.filter(user=user).order_by("-created_at")
    unread_count = queryset.filter(is_read=False).count()
    recent = queryset[:25]
    return Response(
        {
            "unread_count": unread_count,
            "notifications": [_notification_to_dict(item) for item in recent],
        },
        status=status.HTTP_200_OK,
    )


@api_view(["PUT"])
def notifications_mark_read_view(request):
    user_id = request.data.get("user_id")
    if not user_id:
        return Response({"message": "user_id is required."}, status=status.HTTP_400_BAD_REQUEST)

    user = User.objects.filter(id=user_id, is_active=True).first()
    if not user:
        return Response({"message": "User not found."}, status=status.HTTP_404_NOT_FOUND)

    ids = request.data.get("notification_ids")
    queryset = Notification.objects.filter(user=user, is_read=False)
    if isinstance(ids, list) and ids:
        queryset = queryset.filter(id__in=ids)

    queryset.update(is_read=True, read_at=timezone.now())
    unread_count = Notification.objects.filter(user=user, is_read=False).count()
    return Response({"unread_count": unread_count}, status=status.HTTP_200_OK)


@api_view(["PUT"])
def ticket_priority_view(request, ticket_id: int):
    ticket = Ticket.objects.select_related("employee", "technician__user", "logged_by_admin").filter(id=ticket_id).first()
    if not ticket:
        return Response({"message": "Ticket not found."}, status=status.HTTP_404_NOT_FOUND)

    priority = str(request.data.get("priority", "")).strip()
    if priority not in dict(Ticket.PRIORITY_CHOICES):
        return Response({"message": "Invalid priority value."}, status=status.HTTP_400_BAD_REQUEST)

    ticket.priority = priority
    ticket.save(update_fields=["priority", "updated_at"])
    return Response(_ticket_to_dict(ticket), status=status.HTTP_200_OK)


@api_view(["PUT"])
def ticket_status_view(request, ticket_id: int):
    ticket = Ticket.objects.select_related("employee", "technician__user", "logged_by_admin").filter(id=ticket_id).first()
    if not ticket:
        return Response({"message": "Ticket not found."}, status=status.HTTP_404_NOT_FOUND)

    input_status = request.data.get("status")
    if input_status in (None, ""):
        return Response({"message": "status is required."}, status=status.HTTP_400_BAD_REQUEST)

    status_value = _normalize_ticket_status(str(input_status))
    if status_value not in dict(Ticket.STATUS_CHOICES):
        return Response({"message": "Invalid status value."}, status=status.HTTP_400_BAD_REQUEST)

    previous_status = _normalize_ticket_status(ticket.status)
    technician_user_id = request.data.get("technician_user_id")
    if technician_user_id not in (None, "", "null"):
        try:
            technician_user_id_int = int(technician_user_id)
        except (TypeError, ValueError):
            return Response({"message": "technician_user_id must be a number."}, status=status.HTTP_400_BAD_REQUEST)

        technician_user = User.objects.filter(
            id=technician_user_id_int,
            role=User.ROLE_TECHNICIAN,
            is_active=True,
        ).first()
        if not technician_user:
            return Response({"message": "Technician user not found."}, status=status.HTTP_404_NOT_FOUND)

        from .sla_engine import check_ticket_sla

        check_ticket_sla(ticket)
        ticket.refresh_from_db()
        previous_status = _normalize_ticket_status(ticket.status)

        if not ticket.technician_id or ticket.technician.user_id != technician_user_id_int:
            return Response(
                {"message": "You can only update status on tickets currently assigned to you."},
                status=status.HTTP_403_FORBIDDEN,
            )

        requested_status = status_value
        if requested_status == Ticket.STATUS_SOLVED:
            # Technician "Solved" action routes to final reporter review stage.
            requested_status = Ticket.STATUS_PENDING_REVIEW

        if previous_status == Ticket.STATUS_IN_PROCESS and requested_status == Ticket.STATUS_IN_PROCESS:
            return Response(_ticket_to_dict(ticket), status=status.HTTP_200_OK)

        allowed_technician_transitions: dict[str, set[str]] = {
            Ticket.STATUS_PENDING: {Ticket.STATUS_IN_PROCESS},
            Ticket.STATUS_IN_PROCESS: {Ticket.STATUS_PENDING_REVIEW},
            Ticket.STATUS_PENDING_REVIEW: set(),
            Ticket.STATUS_SOLVED: set(),
        }
        if requested_status not in allowed_technician_transitions.get(previous_status, set()):
            return Response(
                {
                    "message": (
                        f"Invalid technician status transition from '{previous_status}' to '{requested_status}'. "
                        "Use Accept (Pending -> In Progress) then Solved (In Progress -> Pending Review)."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        status_change_time = timezone.now()
        ticket.status = requested_status
        update_fields = ["status", "last_activity_at", "updated_at"]
        ticket.last_activity_at = status_change_time
        if requested_status == Ticket.STATUS_IN_PROCESS and ticket.accepted_at is None:
            ticket.accepted_at = status_change_time
            update_fields.append("accepted_at")
        ticket.save(update_fields=update_fields)

        if previous_status != Ticket.STATUS_IN_PROCESS and requested_status == Ticket.STATUS_IN_PROCESS:
            if ticket.technician_id:
                _create_technician_activity_log(
                    ticket.technician,
                    action_type=TechnicianActivityLog.ACTION_TICKET_ACCEPTED,
                    description=f"Accepted Ticket #{ticket.id}: {ticket.title}",
                    ticket=ticket,
                )
            TicketComment.objects.create(
                ticket=ticket,
                author=technician_user,
                comment="Technician accepted the ticket and started work.",
            )
            _notify_user(
                ticket.employee,
                f"Technician {technician_user.name} accepted Ticket #{ticket.id}. Issue is now in progress.",
                ticket=ticket,
            )
            for admin_user in User.objects.filter(role=User.ROLE_ADMIN_FAULT, is_active=True):
                _notify_user(
                    admin_user,
                    f"Technician {technician_user.name} accepted Ticket #{ticket.id}.",
                    ticket=ticket,
                )
        elif previous_status != Ticket.STATUS_PENDING_REVIEW and requested_status == Ticket.STATUS_PENDING_REVIEW:
            work_duration_minutes = _close_technician_activity_log(
                _latest_open_ticket_work_log(ticket.technician, ticket) if ticket.technician_id else None,
                timezone.now(),
            )
            if ticket.technician_id:
                _create_technician_activity_log(
                    ticket.technician,
                    action_type=TechnicianActivityLog.ACTION_TICKET_SOLVED,
                    description=f"Solved Ticket #{ticket.id}: {ticket.title}",
                    ticket=ticket,
                    duration_minutes=work_duration_minutes,
                )
            TicketComment.objects.create(
                ticket=ticket,
                author=technician_user,
                comment="Technician marked issue as solved and requested reporter final review.",
            )
            _notify_user(
                ticket.employee,
                f"Ticket #{ticket.id} was marked solved by {technician_user.name}. Please complete your review and rating.",
                ticket=ticket,
            )
            for admin_user in User.objects.filter(role=User.ROLE_ADMIN_FAULT, is_active=True):
                _notify_user(
                    admin_user,
                    f"Technician {technician_user.name} marked Ticket #{ticket.id} as solved (pending reporter review).",
                    ticket=ticket,
                )

        return Response(_ticket_to_dict(ticket), status=status.HTTP_200_OK)

    accepted_by_admin_id = request.data.get("accepted_by_admin_id")
    if accepted_by_admin_id in (None, "", "null"):
        return Response(
            {"message": "Only Admin Fault can manually update ticket status."},
            status=status.HTTP_403_FORBIDDEN,
        )

    try:
        accepted_by_admin_id_int = int(accepted_by_admin_id)
    except (TypeError, ValueError):
        return Response({"message": "accepted_by_admin_id must be a number."}, status=status.HTTP_400_BAD_REQUEST)

    accepted_by_admin = User.objects.filter(
        id=accepted_by_admin_id_int,
        role=User.ROLE_ADMIN_FAULT,
        is_active=True,
    ).first()
    if not accepted_by_admin:
        return Response({"message": "Admin Fault user not found."}, status=status.HTTP_404_NOT_FOUND)

    if status_value == Ticket.STATUS_SOLVED:
        return Response(
            {"message": "Solved status requires reporter problem review approval."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not _is_valid_admin_ticket_transition(previous_status, status_value):
        return Response(
            {
                "message": (
                    f"Invalid status transition from '{previous_status}' to '{status_value}'. "
                    "Use Pending -> In Progress -> Pending Review, then reporter review to close."
                )
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    if status_value == Ticket.STATUS_PENDING_REVIEW and not ticket.technician_id:
        return Response(
            {"message": "Ticket must be assigned to a technician before moving to Pending Review."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    status_change_time = timezone.now()
    ticket.status = status_value
    update_fields = ["status", "last_activity_at", "updated_at"]
    ticket.last_activity_at = status_change_time
    if status_value == Ticket.STATUS_IN_PROCESS and ticket.accepted_at is None:
        ticket.accepted_at = status_change_time
        update_fields.append("accepted_at")
    ticket.save(update_fields=update_fields)

    if (
        accepted_by_admin is not None
        and status_value == Ticket.STATUS_IN_PROCESS
        and previous_status != Ticket.STATUS_IN_PROCESS
    ):
        _notify_user(
            ticket.employee,
            f"Your ticket #{ticket.id} has been accepted by {accepted_by_admin.name} (Admin Fault).",
            ticket=ticket,
        )
    elif status_value == Ticket.STATUS_PENDING_REVIEW and previous_status != Ticket.STATUS_PENDING_REVIEW:
        _notify_user(
            ticket.employee,
            f"Your ticket #{ticket.id} is ready for your problem review before final closure.",
            ticket=ticket,
        )

    return Response(_ticket_to_dict(ticket), status=status.HTTP_200_OK)


@api_view(["PUT"])
def ticket_problem_review_view(request, ticket_id: int):
    ticket = Ticket.objects.select_related("employee", "technician__user", "logged_by_admin").filter(id=ticket_id).first()
    if not ticket:
        return Response({"message": "Ticket not found."}, status=status.HTTP_404_NOT_FOUND)

    reporter_id = request.data.get("reporter_id")
    approved = _to_optional_bool(request.data.get("approved"))
    review_comment = str(request.data.get("review_comment", "")).strip()
    rating = request.data.get("rating")

    if reporter_id in (None, "", "null"):
        return Response({"message": "reporter_id is required."}, status=status.HTTP_400_BAD_REQUEST)
    if approved is None:
        return Response({"message": "approved must be true or false."}, status=status.HTTP_400_BAD_REQUEST)
    if rating in (None, "", "null"):
        return Response({"message": "rating is required for final problem review."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        reporter_id_int = int(reporter_id)
    except (TypeError, ValueError):
        return Response({"message": "reporter_id must be a number."}, status=status.HTTP_400_BAD_REQUEST)
    try:
        rating_int = int(rating)
    except (TypeError, ValueError):
        return Response({"message": "rating must be a number between 1 and 5."}, status=status.HTTP_400_BAD_REQUEST)
    if rating_int < 1 or rating_int > 5:
        return Response({"message": "rating must be between 1 and 5."}, status=status.HTTP_400_BAD_REQUEST)

    reporter = User.objects.filter(
        id=reporter_id_int,
        role=User.ROLE_EMPLOYEE,
        is_active=True,
    ).first()
    if not reporter:
        return Response({"message": "Reporter not found."}, status=status.HTTP_404_NOT_FOUND)
    if reporter.id != ticket.employee_id:
        return Response(
            {"message": "Only the ticket reporter can complete the final problem review."},
            status=status.HTTP_403_FORBIDDEN,
        )

    current_status = _normalize_ticket_status(ticket.status)
    if current_status != Ticket.STATUS_PENDING_REVIEW:
        return Response(
            {"message": "Ticket is not waiting for final problem review."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if approved:
        ticket.status = Ticket.STATUS_SOLVED
        comment_prefix = f"Reporter problem review approved (rating {rating_int}/5)"
        default_comment = "Reporter approved the fix and confirmed resolution."
        employee_message = f"You approved final review for Ticket #{ticket.id} with rating {rating_int}/5. It is now solved."
        admin_message = f"Reporter approved Ticket #{ticket.id} with rating {rating_int}/5. Ticket is now solved."
        technician_message = f"Reporter approved Ticket #{ticket.id} with rating {rating_int}/5. Ticket is now solved."
    else:
        if not review_comment:
            return Response(
                {"message": "review_comment is required when review is rejected."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        ticket.status = Ticket.STATUS_IN_PROCESS
        comment_prefix = f"Reporter problem review rejected (rating {rating_int}/5)"
        default_comment = "Reporter requested additional work before closure."
        employee_message = f"You requested additional work for Ticket #{ticket.id} with rating {rating_int}/5. It has been reopened."
        admin_message = f"Reporter rated Ticket #{ticket.id} at {rating_int}/5 and requested more work. Ticket moved back to In Progress."
        technician_message = f"Reporter rated Ticket #{ticket.id} at {rating_int}/5 and requested more work. Ticket moved back to In Progress."

    review_time = timezone.now()
    update_fields = ["status", "last_activity_at", "updated_at"]
    ticket.last_activity_at = review_time
    if ticket.status == Ticket.STATUS_IN_PROCESS and ticket.accepted_at is None:
        ticket.accepted_at = review_time
        update_fields.append("accepted_at")
    ticket.save(update_fields=update_fields)

    TicketComment.objects.create(
        ticket=ticket,
        author=reporter,
        comment=f"{comment_prefix}: {review_comment or default_comment}",
    )

    _notify_user(ticket.employee, employee_message, ticket=ticket)

    for admin_user in User.objects.filter(role=User.ROLE_ADMIN_FAULT, is_active=True):
        _notify_user(admin_user, admin_message, ticket=ticket)

    if ticket.technician_id:
        _notify_user(ticket.technician.user, technician_message, ticket=ticket)
        if approved:
            _auto_assign_next_waiting_ticket(preferred_technician=ticket.technician)

    return Response(_ticket_to_dict(ticket), status=status.HTTP_200_OK)


def _performance_window_bounds(start_date: date | None, end_date: date | None) -> tuple[datetime | None, datetime | None]:
    if start_date is None or end_date is None:
        return None, None

    tz = timezone.get_current_timezone()
    start_dt = timezone.make_aware(datetime.combine(start_date, time.min), tz)
    end_dt = timezone.make_aware(datetime.combine(end_date + timedelta(days=1), time.min), tz)
    return start_dt, end_dt


def _interval_overlap_minutes(
    started_at: datetime | None,
    ended_at: datetime | None,
    window_start: datetime | None,
    window_end: datetime | None,
    *,
    fallback_end: datetime,
) -> int:
    if started_at is None:
        return 0

    effective_end = ended_at or fallback_end
    if effective_end <= started_at:
        return 0

    if window_start is None or window_end is None:
        overlap_start = started_at
        overlap_end = effective_end
    else:
        overlap_start = max(started_at, window_start)
        overlap_end = min(effective_end, window_end)

    if overlap_end <= overlap_start:
        return 0

    return int(round((overlap_end - overlap_start).total_seconds() / 60.0))


def _technician_activity_log_to_dict(item: TechnicianActivityLog) -> dict:
    return {
        "id": item.id,
        "technician_id": item.technician_id,
        "technician_name": item.technician.user.name,
        "action_type": item.action_type,
        "action_label": _activity_action_label(item.action_type),
        "description": item.description,
        "occurred_at": item.occurred_at.isoformat(),
        "ended_at": item.ended_at.isoformat() if item.ended_at else None,
        "duration_minutes": item.duration_minutes,
        "ticket_id": item.ticket_id,
        "consumable_request_id": item.consumable_request_id,
        "metadata": item.metadata or {},
    }


@api_view(["GET"])
def performance_metrics_view(request):
    range_value, start_date, end_date = _resolve_performance_window(request)
    window_start_dt, window_end_dt = _performance_window_bounds(start_date, end_date)

    queryset = Ticket.objects.select_related("technician__user").all()
    if start_date is not None:
        queryset = queryset.filter(created_at__date__gte=start_date)
    if end_date is not None:
        queryset = queryset.filter(created_at__date__lte=end_date)
    tickets = list(queryset)

    now = timezone.now()
    total_tickets = len(tickets)
    resolved_tickets = sum(1 for item in tickets if _normalize_ticket_status(item.status) == Ticket.STATUS_SOLVED)
    open_tickets = sum(1 for item in tickets if _normalize_ticket_status(item.status) != Ticket.STATUS_SOLVED)
    critical_tickets = sum(1 for item in tickets if item.priority == Ticket.PRIORITY_CRITICAL)
    unassigned_tickets = sum(1 for item in tickets if item.technician_id is None)
    resolved_rate = round((resolved_tickets / total_tickets) * 100, 2) if total_tickets else 0.0

    by_status: dict[str, int] = {}
    by_priority: dict[str, int] = {}
    by_category: dict[str, int] = {}
    by_technician: dict[str, int] = {}
    technician_breakdown_map: dict[str, dict[str, int]] = {}
    by_month: dict[str, int] = {}
    by_season: dict[str, int] = {season: 0 for season in SEASON_ORDER}
    created_counts: dict[str, int] = {}
    resolved_counts: dict[str, int] = {}
    backlog_aging = {
        "0-4h": 0,
        "4-24h": 0,
        "1-3d": 0,
        "3-7d": 0,
        ">7d": 0,
    }

    bucket_mode = "month"
    if start_date and end_date:
        day_span = (end_date - start_date).days
        bucket_mode = "day" if day_span <= 62 else "month"

    solved_durations_hours: list[float] = []
    acceptance_durations_minutes: list[float] = []
    sla_within_target = 0
    sla_at_risk = 0
    sla_breached = 0
    stale_open_tickets = 0
    escalated_ticket_ids: set[int] = set()
    sla_operational = {
        "awaiting_acceptance": 0,
        "acceptance_overdue": 0,
        "inactivity_breached": 0,
        "auto_reassigned": 0,
        "escalated_tickets": 0,
    }
    sla_by_technician_map: dict[str, dict[str, float]] = {}

    technicians = list(Technician.objects.select_related("user").all().order_by("user__name"))
    technician_activity_summary_map: dict[int, dict[str, object]] = {}
    for technician in technicians:
        technician_breakdown_map[technician.user.name] = {
            "assigned": 0,
            "solved": 0,
            "pending": 0,
            "escalated": 0,
        }
        sla_by_technician_map[technician.user.name] = {
            "assigned": 0,
            "awaiting_acceptance": 0,
            "at_risk": 0,
            "breached": 0,
            "auto_reassigned": 0,
            "escalated": 0,
            "acceptance_total": 0.0,
            "acceptance_samples": 0,
        }
        technician_activity_summary_map[technician.id] = {
            "technician_id": technician.id,
            "user_id": technician.user_id,
            "name": technician.user.name,
            "email": technician.user.email,
            "skillset": technician.skillset,
            "is_currently_available": technician.is_available,
            "check_ins": 0,
            "check_outs": 0,
            "tickets_accepted": 0,
            "tickets_solved": 0,
            "tickets_escalated": 0,
            "asset_requests_submitted": 0,
            "session_minutes": 0,
            "ticket_work_minutes": 0,
            "tracked_ticket_work_sessions": 0,
            "last_activity_at": None,
        }

    ticket_ids = [item.id for item in tickets]
    if ticket_ids:
        escalated_ticket_ids = set(
            TicketComment.objects.filter(
                ticket_id__in=ticket_ids,
                comment__istartswith="Escalated",
            )
            .values_list("ticket_id", flat=True)
            .distinct()
        )

    for item in tickets:
        normalized_status = _normalize_ticket_status(item.status)
        technician_breakdown = None
        technician_sla_breakdown = None

        created_day = _to_local_date(item.created_at)
        created_bucket_key = _bucket_key_for_day(created_day, bucket_mode)
        created_counts[created_bucket_key] = created_counts.get(created_bucket_key, 0) + 1

        month_key = _bucket_key_for_day(created_day, "month")
        by_month[month_key] = by_month.get(month_key, 0) + 1
        season_key = _season_for_month(created_day.month)
        by_season[season_key] = by_season.get(season_key, 0) + 1

        by_status[normalized_status] = by_status.get(normalized_status, 0) + 1
        by_priority[item.priority] = by_priority.get(item.priority, 0) + 1
        by_category[item.category] = by_category.get(item.category, 0) + 1

        if item.technician_id:
            technician_name = item.technician.user.name
            technician_breakdown = technician_breakdown_map.setdefault(
                technician_name,
                {
                    "assigned": 0,
                    "solved": 0,
                    "pending": 0,
                    "escalated": 0,
                },
            )
            technician_breakdown["assigned"] += 1
            technician_sla_breakdown = sla_by_technician_map.setdefault(
                technician_name,
                {
                    "assigned": 0,
                    "awaiting_acceptance": 0,
                    "at_risk": 0,
                    "breached": 0,
                    "auto_reassigned": 0,
                    "escalated": 0,
                    "acceptance_total": 0.0,
                    "acceptance_samples": 0,
                },
            )
            technician_sla_breakdown["assigned"] += 1

        age_hours = max((now - item.created_at).total_seconds() / 3600.0, 0.0)
        sla_limit_hours = _sla_target_hours(item.priority)
        status_is_solved = normalized_status == Ticket.STATUS_SOLVED
        status_is_terminal = normalized_status in {Ticket.STATUS_PENDING_REVIEW, Ticket.STATUS_SOLVED}
        assigned_reference = item.assigned_at or item.created_at
        acceptance_minutes = None
        if item.accepted_at and assigned_reference:
            acceptance_minutes = max((item.accepted_at - assigned_reference).total_seconds() / 60.0, 0.0)
            acceptance_durations_minutes.append(acceptance_minutes)
            if technician_sla_breakdown is not None:
                technician_sla_breakdown["acceptance_total"] += acceptance_minutes
                technician_sla_breakdown["acceptance_samples"] += 1

        if status_is_solved:
            resolution_hours = max((item.updated_at - item.created_at).total_seconds() / 3600.0, 0.0)
            solved_durations_hours.append(resolution_hours)
            effective_hours = resolution_hours

            resolved_day = _to_local_date(item.updated_at)
            if (not start_date or not end_date) or (start_date <= resolved_day <= end_date):
                resolved_bucket_key = _bucket_key_for_day(resolved_day, bucket_mode)
                resolved_counts[resolved_bucket_key] = resolved_counts.get(resolved_bucket_key, 0) + 1
        else:
            effective_hours = age_hours
            if age_hours > 48:
                stale_open_tickets += 1

            if age_hours <= 4:
                backlog_aging["0-4h"] += 1
            elif age_hours <= 24:
                backlog_aging["4-24h"] += 1
            elif age_hours <= 72:
                backlog_aging["1-3d"] += 1
            elif age_hours <= 168:
                backlog_aging["3-7d"] += 1
            else:
                backlog_aging[">7d"] += 1

            technician_label = item.technician.user.name if item.technician_id else "Unassigned"
            by_technician[technician_label] = by_technician.get(technician_label, 0) + 1

        if technician_breakdown is not None:
            if status_is_solved:
                technician_breakdown["solved"] += 1
            elif normalized_status == Ticket.STATUS_PENDING:
                technician_breakdown["pending"] += 1

            raw_status = str(item.status or "").strip().lower()
            if raw_status == "escalated" or item.id in escalated_ticket_ids:
                technician_breakdown["escalated"] += 1

        if not status_is_terminal and item.technician_id:
            if item.accepted_at is None:
                sla_operational["awaiting_acceptance"] += 1
                if technician_sla_breakdown is not None:
                    technician_sla_breakdown["awaiting_acceptance"] += 1

                acceptance_wait_minutes = max((now - assigned_reference).total_seconds() / 60.0, 0.0)
                if acceptance_wait_minutes > ACCEPTANCE_SLA_MINUTES:
                    sla_operational["acceptance_overdue"] += 1
                    if technician_sla_breakdown is not None:
                        technician_sla_breakdown["breached"] += 1
            else:
                activity_reference = item.last_activity_at or item.accepted_at
                inactivity_minutes = max((now - activity_reference).total_seconds() / 60.0, 0.0)
                if inactivity_minutes > ESCALATION_THRESHOLD_MINUTES:
                    sla_operational["inactivity_breached"] += 1
                    if technician_sla_breakdown is not None:
                        technician_sla_breakdown["breached"] += 1
                elif ESCALATION_THRESHOLD_MINUTES > 0 and (
                    inactivity_minutes / ESCALATION_THRESHOLD_MINUTES
                ) >= 0.8:
                    if technician_sla_breakdown is not None:
                        technician_sla_breakdown["at_risk"] += 1

        if item.reassign_count > 0:
            sla_operational["auto_reassigned"] += item.reassign_count
            if technician_sla_breakdown is not None:
                technician_sla_breakdown["auto_reassigned"] += item.reassign_count

        if item.escalation_level > 0:
            sla_operational["escalated_tickets"] += 1
            if technician_sla_breakdown is not None:
                technician_sla_breakdown["escalated"] += item.escalation_level

        if effective_hours > sla_limit_hours:
            sla_breached += 1
        elif not status_is_solved and sla_limit_hours > 0 and (effective_hours / sla_limit_hours) >= 0.8:
            sla_at_risk += 1
        else:
            sla_within_target += 1

    activity_logs = list(
        TechnicianActivityLog.objects.select_related("technician__user", "ticket", "consumable_request")
        .filter(
            Q(occurred_at__date__gte=start_date) if start_date is not None else Q(),
            Q(occurred_at__date__lte=end_date) if end_date is not None else Q(),
        )
        .order_by("-occurred_at", "-id")
    )
    session_logs = list(
        TechnicianActivityLog.objects.select_related("technician__user")
        .filter(action_type=TechnicianActivityLog.ACTION_CHECK_IN)
        .order_by("-occurred_at", "-id")
    )
    ticket_work_logs = list(
        TechnicianActivityLog.objects.select_related("technician__user", "ticket")
        .filter(action_type=TechnicianActivityLog.ACTION_TICKET_ACCEPTED)
        .order_by("-occurred_at", "-id")
    )

    for item in activity_logs:
        summary = technician_activity_summary_map.get(item.technician_id)
        if summary is None:
            continue

        summary["last_activity_at"] = item.occurred_at.isoformat()

        if item.action_type == TechnicianActivityLog.ACTION_CHECK_IN:
            summary["check_ins"] = int(summary["check_ins"]) + 1
        elif item.action_type == TechnicianActivityLog.ACTION_CHECK_OUT:
            summary["check_outs"] = int(summary["check_outs"]) + 1
        elif item.action_type == TechnicianActivityLog.ACTION_TICKET_ACCEPTED:
            summary["tickets_accepted"] = int(summary["tickets_accepted"]) + 1
        elif item.action_type == TechnicianActivityLog.ACTION_TICKET_SOLVED:
            summary["tickets_solved"] = int(summary["tickets_solved"]) + 1
        elif item.action_type == TechnicianActivityLog.ACTION_TICKET_ESCALATED:
            summary["tickets_escalated"] = int(summary["tickets_escalated"]) + 1
        elif item.action_type == TechnicianActivityLog.ACTION_ASSET_REQUEST_SUBMITTED:
            summary["asset_requests_submitted"] = int(summary["asset_requests_submitted"]) + 1

    for session_log in session_logs:
        summary = technician_activity_summary_map.get(session_log.technician_id)
        if summary is None:
            continue

        overlap_minutes = _interval_overlap_minutes(
            session_log.occurred_at,
            session_log.ended_at,
            window_start_dt,
            window_end_dt,
            fallback_end=now,
        )
        summary["session_minutes"] = int(summary["session_minutes"]) + overlap_minutes

    for work_log in ticket_work_logs:
        summary = technician_activity_summary_map.get(work_log.technician_id)
        if summary is None:
            continue

        overlap_minutes = _interval_overlap_minutes(
            work_log.occurred_at,
            work_log.ended_at,
            window_start_dt,
            window_end_dt,
            fallback_end=now,
        )
        summary["ticket_work_minutes"] = int(summary["ticket_work_minutes"]) + overlap_minutes
        if overlap_minutes > 0:
            summary["tracked_ticket_work_sessions"] = int(summary["tracked_ticket_work_sessions"]) + 1

    trend_keys: list[str]
    if start_date and end_date:
        if bucket_mode == "day":
            trend_keys = []
            cursor = start_date
            while cursor <= end_date:
                trend_keys.append(_bucket_key_for_day(cursor, "day"))
                cursor = cursor + timedelta(days=1)
        else:
            trend_keys = []
            cursor = _month_start(start_date)
            end_month = _month_start(end_date)
            while cursor <= end_month:
                trend_keys.append(_bucket_key_for_day(cursor, "month"))
                cursor = _next_month(cursor)
    else:
        trend_keys = sorted(set(created_counts.keys()) | set(resolved_counts.keys()))

    created_vs_resolved = [
        {
            "name": _bucket_label(key, bucket_mode),
            "created": created_counts.get(key, 0),
            "resolved": resolved_counts.get(key, 0),
        }
        for key in trend_keys
    ]

    avg_resolution_hours = (
        round(sum(solved_durations_hours) / len(solved_durations_hours), 2)
        if solved_durations_hours
        else 0.0
    )
    avg_acceptance_minutes = (
        round(sum(acceptance_durations_minutes) / len(acceptance_durations_minutes), 2)
        if acceptance_durations_minutes
        else 0.0
    )
    technician_performance_metrics = _technician_performance_metrics(technicians)
    technician_reassignment_metrics = _technician_reassignment_metrics(technicians)
    total_sla_records = sla_within_target + sla_at_risk + sla_breached
    sla_breach_rate = round((sla_breached / total_sla_records) * 100, 2) if total_sla_records else 0.0

    technician_activity_summary = []
    technician_check_ins = 0
    technician_check_outs = 0
    for summary in technician_activity_summary_map.values():
        session_minutes = int(summary["session_minutes"])
        ticket_work_minutes = int(summary["ticket_work_minutes"])
        tracked_ticket_work_sessions = int(summary["tracked_ticket_work_sessions"])
        check_ins = int(summary["check_ins"])
        check_outs = int(summary["check_outs"])
        technician_check_ins += check_ins
        technician_check_outs += check_outs

        technician_activity_summary.append(
            {
                "technician_id": summary["technician_id"],
                "user_id": summary["user_id"],
                "name": summary["name"],
                "email": summary["email"],
                "skillset": summary["skillset"],
                "is_currently_available": summary["is_currently_available"],
                "check_ins": check_ins,
                "check_outs": check_outs,
                "tickets_accepted": int(summary["tickets_accepted"]),
                "tickets_solved": int(summary["tickets_solved"]),
                "tickets_escalated": int(summary["tickets_escalated"]),
                "asset_requests_submitted": int(summary["asset_requests_submitted"]),
                "total_session_hours": round(session_minutes / 60.0, 2),
                "total_ticket_work_hours": round(ticket_work_minutes / 60.0, 2),
                "avg_ticket_work_hours": (
                    round((ticket_work_minutes / 60.0) / tracked_ticket_work_sessions, 2)
                    if tracked_ticket_work_sessions
                    else 0.0
                ),
                "last_activity_at": summary["last_activity_at"],
            }
        )

    technician_activity_summary.sort(
        key=lambda item: (
            -(
                item["tickets_solved"]
                + item["tickets_escalated"]
                + item["tickets_accepted"]
                + item["check_ins"]
                + item["check_outs"]
                + item["asset_requests_submitted"]
            ),
            item["name"],
        )
    )

    payload = {
        "kpis": {
            "total_tickets": total_tickets,
            "open_tickets": open_tickets,
            "resolved_tickets": resolved_tickets,
            "critical_tickets": critical_tickets,
            "unassigned_tickets": unassigned_tickets,
            "resolved_rate": resolved_rate,
            "avg_resolution_hours": avg_resolution_hours,
            "sla_breach_rate": sla_breach_rate,
            "stale_open_tickets": stale_open_tickets,
            "technician_check_ins": technician_check_ins,
            "technician_check_outs": technician_check_outs,
            "currently_checked_in_technicians": sum(1 for item in technicians if item.is_available),
            "technician_activity_events": len(activity_logs),
        },
        "by_status": [{"name": key, "count": value} for key, value in sorted(by_status.items())],
        "by_priority": [{"name": key, "count": value} for key, value in sorted(by_priority.items())],
        "by_category": [{"name": key, "count": value} for key, value in sorted(by_category.items())],
        "by_month": [{"name": _bucket_label(key, "month"), "count": value} for key, value in sorted(by_month.items())],
        "by_season": [{"name": season, "count": by_season.get(season, 0)} for season in SEASON_ORDER],
        "by_technician": [{"name": key, "count": value} for key, value in sorted(by_technician.items())],
        "technician_breakdown": [
            {
                "name": name,
                "assigned": values["assigned"],
                "solved": values["solved"],
                "pending": values["pending"],
                "escalated": values["escalated"],
            }
            for name, values in sorted(technician_breakdown_map.items())
        ],
        "created_vs_resolved": created_vs_resolved,
        "backlog_aging": [{"name": key, "count": value} for key, value in backlog_aging.items()],
        "sla_summary": {
            "within_target": sla_within_target,
            "at_risk": sla_at_risk,
            "breached": sla_breached,
        },
        "sla_config": {
            "acceptance_sla_minutes": ACCEPTANCE_SLA_MINUTES,
            "reassign_threshold_minutes": REASSIGN_THRESHOLD_MINUTES,
            "escalation_threshold_minutes": ESCALATION_THRESHOLD_MINUTES,
        },
        "sla_operational": {
            **sla_operational,
            "avg_acceptance_minutes": avg_acceptance_minutes,
        },
        "sla_by_technician": [
            {
                "name": name,
                "assigned": int(values["assigned"]),
                "awaiting_acceptance": int(values["awaiting_acceptance"]),
                "at_risk": int(values["at_risk"]),
                "breached": int(values["breached"]),
                "auto_reassigned": int(values["auto_reassigned"]),
                "escalated": int(values["escalated"]),
                "avg_acceptance_minutes": round(
                    values["acceptance_total"] / values["acceptance_samples"],
                    2,
                )
                if values["acceptance_samples"]
                else 0.0,
            }
            for name, values in sorted(sla_by_technician_map.items())
        ],
        "technician_performance_scores": [
            {
                "name": technician.user.name,
                "skillset": technician.skillset,
                "total_assigned": int(technician_performance_metrics.get(technician.id, {}).get("total_assigned", 0)),
                "completed": int(technician_performance_metrics.get(technician.id, {}).get("completed", 0)),
                "success_rate": float(technician_performance_metrics.get(technician.id, {}).get("success_rate", 0.5)),
                "success_rate_percent": float(
                    technician_performance_metrics.get(technician.id, {}).get("success_rate_percent", 50.0)
                ),
                "resolution_score": float(
                    technician_performance_metrics.get(technician.id, {}).get("resolution_score", 0.5)
                ),
                "resolution_score_percent": float(
                    technician_performance_metrics.get(technician.id, {}).get("resolution_score_percent", 50.0)
                ),
                "avg_resolution_hours": float(
                    technician_performance_metrics.get(technician.id, {}).get("avg_resolution_hours", 0.0)
                ),
                "performance_score": float(
                    technician_performance_metrics.get(technician.id, {}).get("performance_score", 0.5)
                ),
                "performance_score_percent": float(
                    technician_performance_metrics.get(technician.id, {}).get("performance_score_percent", 50.0)
                ),
                "pending_acceptance_count": int(
                    technician_reassignment_metrics.get(technician.id, {}).get("pending_acceptance_count", 0)
                ),
                "overdue_acceptance_count": int(
                    technician_reassignment_metrics.get(technician.id, {}).get("overdue_acceptance_count", 0)
                ),
                "recent_assignment_count": int(
                    technician_reassignment_metrics.get(technician.id, {}).get("recent_assignment_count", 0)
                ),
                "reassignment_readiness_score": float(
                    technician_reassignment_metrics.get(technician.id, {}).get("reassignment_readiness_score", 0.5)
                ),
                "reassignment_readiness_score_percent": float(
                    technician_reassignment_metrics.get(technician.id, {}).get(
                        "reassignment_readiness_score_percent",
                        50.0,
                    )
                ),
            }
            for technician in sorted(
                technicians,
                key=lambda item: (
                    -float(
                        technician_performance_metrics.get(item.id, {}).get("performance_score", 0.5)
                    ),
                    item.user.name.lower(),
                ),
            )
        ],
        "filters": {
            "range": range_value,
            "start_date": start_date.isoformat() if start_date else None,
            "end_date": end_date.isoformat() if end_date else None,
            "bucket_mode": bucket_mode,
        },
        "technician_activity_summary": technician_activity_summary,
        "technician_recent_activity": [_technician_activity_log_to_dict(item) for item in activity_logs[:40]],
        "generated_at": timezone.now().isoformat(),
    }
    return Response(payload, status=status.HTTP_200_OK)


def _consumable_to_dict(consumable: Consumable) -> dict:
    purchase_cost = float(consumable.purchase_cost) if consumable.purchase_cost is not None else None
    asset_type = (
        consumable.subcategory
        or consumable.device_type
        or consumable.printer_type
        or consumable.item_name
    )
    brand_model = f"{consumable.brand} {consumable.model_number}".strip() or consumable.item_name

    return {
        "id": consumable.id,
        "asset_tag": consumable.asset_tag,
        "item_name": consumable.item_name,
        # Backward-compatible aliases used by admin consumables UI.
        "type": asset_type,
        "brand_model": brand_model,
        "manufacturer": consumable.manufacturer,
        "brand": consumable.brand,
        "model_number": consumable.model_number,
        "serial_number": consumable.serial_number,
        "category": consumable.category,
        "subcategory": consumable.subcategory,
        "processor": consumable.processor,
        "ram": consumable.ram,
        "storage_type": consumable.storage_type,
        "storage_capacity": consumable.storage_capacity,
        "graphics_card": consumable.graphics_card,
        "charger_included": consumable.charger_included,
        "monitor_included": consumable.monitor_included,
        "keyboard_included": consumable.keyboard_included,
        "mouse_included": consumable.mouse_included,
        "printer_type": consumable.printer_type,
        "print_speed": consumable.print_speed,
        "connectivity": consumable.connectivity,
        "duplex_printing": consumable.duplex_printing,
        "paper_capacity": consumable.paper_capacity,
        "color_printing": consumable.color_printing,
        "device_type": consumable.device_type,
        "operating_system": consumable.operating_system,
        "battery_capacity": consumable.battery_capacity,
        "imei_number": consumable.imei_number,
        "quantity": consumable.quantity,
        "available_quantity": consumable.quantity,
        "total_quantity": consumable.quantity,
        "purchase_cost": purchase_cost,
        "cost": purchase_cost,
        "supplier": consumable.supplier,
        "warranty_expiry": consumable.warranty_expiry.isoformat() if consumable.warranty_expiry else None,
        "purchase_date": consumable.purchase_date.isoformat() if consumable.purchase_date else None,
        "condition": consumable.condition,
        "status": consumable.status,
        "department": consumable.department,
        "assigned_employee": consumable.assigned_employee,
        "created_at": consumable.created_at.isoformat(),
        "updated_at": consumable.updated_at.isoformat(),
    }


@api_view(["GET", "POST"])
def consumables_collection_view(request):
    if request.method == "GET":
        queryset = Consumable.objects.all().order_by("item_name")
        return Response([_consumable_to_dict(item) for item in queryset], status=status.HTTP_200_OK)

    asset_tag = str(request.data.get("asset_tag", "")).strip()
    item_name = str(request.data.get("item_name", "")).strip()
    manufacturer = str(request.data.get("manufacturer", "")).strip()
    brand = str(request.data.get("brand", "")).strip()
    model_number = str(request.data.get("model_number", "")).strip()
    serial_number = str(request.data.get("serial_number", "")).strip()
    category = str(request.data.get("category", "")).strip()
    subcategory = str(request.data.get("subcategory", "")).strip()
    processor = str(request.data.get("processor", "")).strip()
    ram = str(request.data.get("ram", "")).strip()
    storage_type = str(request.data.get("storage_type", "")).strip()
    storage_capacity = str(request.data.get("storage_capacity", "")).strip()
    graphics_card = str(request.data.get("graphics_card", "")).strip()
    charger_included = _to_optional_bool(request.data.get("charger_included"))
    monitor_included = _to_optional_bool(request.data.get("monitor_included"))
    keyboard_included = _to_optional_bool(request.data.get("keyboard_included"))
    mouse_included = _to_optional_bool(request.data.get("mouse_included"))
    printer_type = str(request.data.get("printer_type", "")).strip()
    print_speed = str(request.data.get("print_speed", "")).strip()
    connectivity = str(request.data.get("connectivity", "")).strip()
    duplex_printing = _to_optional_bool(request.data.get("duplex_printing"))
    paper_capacity = str(request.data.get("paper_capacity", "")).strip()
    color_printing = _to_optional_bool(request.data.get("color_printing"))
    device_type = str(request.data.get("device_type", "")).strip()
    operating_system = str(request.data.get("operating_system", "")).strip()
    battery_capacity = str(request.data.get("battery_capacity", "")).strip()
    imei_number = str(request.data.get("imei_number", "")).strip()
    quantity = request.data.get("quantity", 0)
    purchase_cost = _to_optional_decimal(request.data.get("purchase_cost"))
    supplier = str(request.data.get("supplier", "")).strip()
    warranty_expiry = _to_optional_date(request.data.get("warranty_expiry"))
    purchase_date = _to_optional_date(request.data.get("purchase_date"))
    condition = str(request.data.get("condition", "")).strip()
    status_value = str(request.data.get("status", "")).strip()
    department = str(request.data.get("department", "")).strip()
    assigned_employee = str(request.data.get("assigned_employee", "")).strip()

    if not item_name:
        return Response({"message": "item_name is required."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        quantity_value = int(quantity)
    except (TypeError, ValueError):
        return Response({"message": "quantity must be a number."}, status=status.HTTP_400_BAD_REQUEST)
    if quantity_value <= 0:
        return Response({"message": "quantity must be greater than 0."}, status=status.HTTP_400_BAD_REQUEST)

    with transaction.atomic():
        existing = _find_matching_consumable_for_restock(
            asset_tag=asset_tag,
            serial_number=serial_number,
            item_name=item_name,
            brand=brand,
            model_number=model_number,
            category=category,
            subcategory=subcategory,
        )
        if existing:
            existing = Consumable.objects.select_for_update().filter(id=existing.id).first()
            if not existing:
                return Response({"message": "Consumable not found."}, status=status.HTTP_404_NOT_FOUND)

            existing.quantity = existing.quantity + quantity_value
            details_updated = _populate_missing_consumable_details(
                existing,
                {
                    "asset_tag": asset_tag,
                    "item_name": item_name,
                    "manufacturer": manufacturer,
                    "brand": brand,
                    "model_number": model_number,
                    "serial_number": serial_number,
                    "category": category,
                    "subcategory": subcategory,
                    "processor": processor,
                    "ram": ram,
                    "storage_type": storage_type,
                    "storage_capacity": storage_capacity,
                    "graphics_card": graphics_card,
                    "charger_included": charger_included,
                    "monitor_included": monitor_included,
                    "keyboard_included": keyboard_included,
                    "mouse_included": mouse_included,
                    "printer_type": printer_type,
                    "print_speed": print_speed,
                    "connectivity": connectivity,
                    "duplex_printing": duplex_printing,
                    "paper_capacity": paper_capacity,
                    "color_printing": color_printing,
                    "device_type": device_type,
                    "operating_system": operating_system,
                    "battery_capacity": battery_capacity,
                    "imei_number": imei_number,
                    "purchase_cost": purchase_cost,
                    "supplier": supplier,
                    "warranty_expiry": warranty_expiry,
                    "purchase_date": purchase_date,
                    "condition": condition,
                    "status": status_value,
                    "department": department,
                    "assigned_employee": assigned_employee,
                },
            )
            if _is_blank_text(existing.status):
                existing.status = status_value or "In Stock"
                details_updated = True
            update_fields = ["quantity", "updated_at"]
            if details_updated:
                update_fields.extend(
                    [
                        "asset_tag",
                        "item_name",
                        "manufacturer",
                        "brand",
                        "model_number",
                        "serial_number",
                        "category",
                        "subcategory",
                        "processor",
                        "ram",
                        "storage_type",
                        "storage_capacity",
                        "graphics_card",
                        "charger_included",
                        "monitor_included",
                        "keyboard_included",
                        "mouse_included",
                        "printer_type",
                        "print_speed",
                        "connectivity",
                        "duplex_printing",
                        "paper_capacity",
                        "color_printing",
                        "device_type",
                        "operating_system",
                        "battery_capacity",
                        "imei_number",
                        "purchase_cost",
                        "supplier",
                        "warranty_expiry",
                        "purchase_date",
                        "condition",
                        "status",
                        "department",
                        "assigned_employee",
                    ]
                )
            existing.save(update_fields=update_fields)
            existing.refresh_from_db()
            return Response(_consumable_to_dict(existing), status=status.HTTP_200_OK)

    required_fields = {
        "asset_tag": asset_tag,
        "brand": brand,
        "model_number": model_number,
        "serial_number": serial_number,
        "category": category,
        "subcategory": subcategory,
        "purchase_date": purchase_date,
        "supplier": supplier,
        "condition": condition,
    }
    missing = [key for key, value in required_fields.items() if _is_blank_text(value)]
    if missing:
        return Response(
            {
                "message": (
                    "Missing required fields for a new asset: "
                    + ", ".join(missing)
                )
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    with transaction.atomic():
        consumable = Consumable.objects.create(
            asset_tag=asset_tag,
            item_name=item_name,
            manufacturer=manufacturer,
            brand=brand,
            model_number=model_number,
            serial_number=serial_number,
            category=category,
            subcategory=subcategory,
            processor=processor,
            ram=ram,
            storage_type=storage_type,
            storage_capacity=storage_capacity,
            graphics_card=graphics_card,
            charger_included=charger_included,
            monitor_included=monitor_included,
            keyboard_included=keyboard_included,
            mouse_included=mouse_included,
            printer_type=printer_type,
            print_speed=print_speed,
            connectivity=connectivity,
            duplex_printing=duplex_printing,
            paper_capacity=paper_capacity,
            color_printing=color_printing,
            device_type=device_type,
            operating_system=operating_system,
            battery_capacity=battery_capacity,
            imei_number=imei_number,
            quantity=quantity_value,
            purchase_cost=purchase_cost,
            supplier=supplier,
            warranty_expiry=warranty_expiry,
            purchase_date=purchase_date,
            condition=condition,
            status=status_value or "In Stock",
            department=department,
            assigned_employee=assigned_employee,
        )
    return Response(_consumable_to_dict(consumable), status=status.HTTP_201_CREATED)


@api_view(["GET", "PUT"])
def consumable_detail_view(request, consumable_id: int):
    if request.method == "GET":
        consumable = Consumable.objects.filter(id=consumable_id).first()
        if not consumable:
            return Response({"message": "Consumable not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(_consumable_to_dict(consumable), status=status.HTTP_200_OK)

    with transaction.atomic():
        consumable = Consumable.objects.select_for_update().filter(id=consumable_id).first()
        if not consumable:
            return Response({"message": "Consumable not found."}, status=status.HTTP_404_NOT_FOUND)

        if "asset_tag" in request.data:
            consumable.asset_tag = str(request.data.get("asset_tag", "")).strip()

        if "item_name" in request.data:
            consumable.item_name = str(request.data.get("item_name", consumable.item_name)).strip() or consumable.item_name

        if "manufacturer" in request.data:
            consumable.manufacturer = str(request.data.get("manufacturer", "")).strip()

        if "brand" in request.data:
            consumable.brand = str(request.data.get("brand", "")).strip()

        if "model_number" in request.data:
            consumable.model_number = str(request.data.get("model_number", "")).strip()

        if "serial_number" in request.data:
            consumable.serial_number = str(request.data.get("serial_number", "")).strip()

        if "category" in request.data:
            consumable.category = str(request.data.get("category", "")).strip()

        if "subcategory" in request.data:
            consumable.subcategory = str(request.data.get("subcategory", "")).strip()

        if "processor" in request.data:
            consumable.processor = str(request.data.get("processor", "")).strip()

        if "ram" in request.data:
            consumable.ram = str(request.data.get("ram", "")).strip()

        if "storage_type" in request.data:
            consumable.storage_type = str(request.data.get("storage_type", "")).strip()

        if "storage_capacity" in request.data:
            consumable.storage_capacity = str(request.data.get("storage_capacity", "")).strip()

        if "graphics_card" in request.data:
            consumable.graphics_card = str(request.data.get("graphics_card", "")).strip()

        if "charger_included" in request.data:
            consumable.charger_included = _to_optional_bool(request.data.get("charger_included"))

        if "monitor_included" in request.data:
            consumable.monitor_included = _to_optional_bool(request.data.get("monitor_included"))

        if "keyboard_included" in request.data:
            consumable.keyboard_included = _to_optional_bool(request.data.get("keyboard_included"))

        if "mouse_included" in request.data:
            consumable.mouse_included = _to_optional_bool(request.data.get("mouse_included"))

        if "printer_type" in request.data:
            consumable.printer_type = str(request.data.get("printer_type", "")).strip()

        if "print_speed" in request.data:
            consumable.print_speed = str(request.data.get("print_speed", "")).strip()

        if "connectivity" in request.data:
            consumable.connectivity = str(request.data.get("connectivity", "")).strip()

        if "duplex_printing" in request.data:
            consumable.duplex_printing = _to_optional_bool(request.data.get("duplex_printing"))

        if "paper_capacity" in request.data:
            consumable.paper_capacity = str(request.data.get("paper_capacity", "")).strip()

        if "color_printing" in request.data:
            consumable.color_printing = _to_optional_bool(request.data.get("color_printing"))

        if "device_type" in request.data:
            consumable.device_type = str(request.data.get("device_type", "")).strip()

        if "operating_system" in request.data:
            consumable.operating_system = str(request.data.get("operating_system", "")).strip()

        if "battery_capacity" in request.data:
            consumable.battery_capacity = str(request.data.get("battery_capacity", "")).strip()

        if "imei_number" in request.data:
            consumable.imei_number = str(request.data.get("imei_number", "")).strip()

        if "quantity" in request.data:
            try:
                consumable.quantity = int(request.data.get("quantity"))
            except (TypeError, ValueError):
                return Response({"message": "quantity must be a number."}, status=status.HTTP_400_BAD_REQUEST)
            if consumable.quantity < 0:
                return Response({"message": "quantity cannot be negative."}, status=status.HTTP_400_BAD_REQUEST)

        if "purchase_cost" in request.data:
            consumable.purchase_cost = _to_optional_decimal(request.data.get("purchase_cost"))

        if "supplier" in request.data:
            consumable.supplier = str(request.data.get("supplier", "")).strip()

        if "warranty_expiry" in request.data:
            consumable.warranty_expiry = _to_optional_date(request.data.get("warranty_expiry"))

        if "purchase_date" in request.data:
            consumable.purchase_date = _to_optional_date(request.data.get("purchase_date"))

        if "condition" in request.data:
            consumable.condition = str(request.data.get("condition", "")).strip()

        if "status" in request.data:
            consumable.status = str(request.data.get("status", "")).strip()

        if "department" in request.data:
            consumable.department = str(request.data.get("department", "")).strip()

        if "assigned_employee" in request.data:
            consumable.assigned_employee = str(request.data.get("assigned_employee", "")).strip()

        consumable.save()
        consumable.refresh_from_db()
        return Response(_consumable_to_dict(consumable), status=status.HTTP_200_OK)


@api_view(["PATCH"])
def consumable_quantity_adjust_view(request, consumable_id: int):
    delta = request.data.get("delta")
    try:
        delta_value = int(delta)
    except (TypeError, ValueError):
        return Response({"message": "delta must be a number."}, status=status.HTTP_400_BAD_REQUEST)

    if delta_value == 0:
        return Response({"message": "delta cannot be zero."}, status=status.HTTP_400_BAD_REQUEST)

    with transaction.atomic():
        consumable = Consumable.objects.select_for_update().filter(id=consumable_id).first()
        if not consumable:
            return Response({"message": "Consumable not found."}, status=status.HTTP_404_NOT_FOUND)

        next_quantity = consumable.quantity + delta_value
        if next_quantity < 0:
            return Response(
                {"message": f"Insufficient stock. Available: {consumable.quantity}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        consumable.quantity = next_quantity
        consumable.save(update_fields=["quantity", "updated_at"])
        consumable.refresh_from_db()
        return Response(_consumable_to_dict(consumable), status=status.HTTP_200_OK)


def _consumable_request_to_dict(item: ConsumableRequest) -> dict:
    return {
        "id": f"CR-{item.id}",
        "db_id": item.id,
        "itemName": item.consumable.item_name,
        "quantity": item.quantity,
        "assignmentType": item.assignment_type,
        "department": item.department,
        "notes": item.notes,
        "requestedBy": item.employee.name,
        "requestedAt": item.created_at.isoformat(),
        "status": item.status,
        "approvedBy": item.approved_by.name if item.approved_by else None,
        "approvedAt": item.approved_at.isoformat() if item.approved_at else None,
        "rejectedBy": item.rejected_by.name if item.rejected_by else None,
        "rejectedAt": item.rejected_at.isoformat() if item.rejected_at else None,
        "rejectionReason": item.rejection_reason or None,
    }


def _consumable_return_to_dict(item: ConsumableReturn) -> dict:
    return {
        "id": item.id,
        "consumableRequestId": item.consumable_request_id,
        "consumableId": item.consumable_id,
        "itemName": item.consumable.item_name,
        "assignmentType": item.consumable_request.assignment_type,
        "employeeId": item.employee_id,
        "employeeName": item.employee.name,
        "quantity": item.quantity,
        "reason": item.reason,
        "status": item.status,
        "receivedBy": item.received_by.name if item.received_by else None,
        "receivedAt": item.received_at.isoformat() if item.received_at else None,
        "rejectedBy": item.rejected_by.name if item.rejected_by else None,
        "rejectedAt": item.rejected_at.isoformat() if item.rejected_at else None,
        "rejectionReason": item.rejection_reason or None,
        "createdAt": item.created_at.isoformat(),
        "updatedAt": item.updated_at.isoformat(),
    }


@api_view(["GET", "POST"])
def consumable_requests_collection_view(request):
    if request.method == "GET":
        employee_id = request.query_params.get("employee_id")
        queryset = ConsumableRequest.objects.select_related("consumable", "employee", "approved_by", "rejected_by").all()
        if employee_id:
            queryset = queryset.filter(employee_id=employee_id)
        queryset = queryset.order_by("-created_at")
        return Response([_consumable_request_to_dict(item) for item in queryset], status=status.HTTP_200_OK)

    item_name = str(request.data.get("itemName", "")).strip().lower()
    quantity = request.data.get("quantity")
    assignment_type = str(
        request.data.get("assignment_type", ConsumableRequest.ASSIGNMENT_TYPE_NEW)
    ).strip().lower()
    department = str(request.data.get("department", "")).strip()
    notes = str(request.data.get("notes", "")).strip()
    employee_id = request.data.get("employee_id")
    if not item_name or not quantity or not employee_id:
        return Response(
            {"message": "itemName, quantity, and employee_id are required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        quantity_value = int(quantity)
    except (TypeError, ValueError):
        return Response({"message": "quantity must be a number."}, status=status.HTTP_400_BAD_REQUEST)

    if quantity_value <= 0:
        return Response({"message": "quantity must be greater than 0."}, status=status.HTTP_400_BAD_REQUEST)
    if assignment_type not in {
        ConsumableRequest.ASSIGNMENT_TYPE_NEW,
        ConsumableRequest.ASSIGNMENT_TYPE_LOAN,
        ConsumableRequest.ASSIGNMENT_TYPE_EXCHANGE,
    }:
        return Response(
            {"message": "assignment_type must be one of: new, loan, exchange."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    requester = User.objects.filter(
        id=employee_id,
        role__in=[User.ROLE_EMPLOYEE, User.ROLE_TECHNICIAN],
    ).first()
    if not requester:
        return Response({"message": "Requester not found."}, status=status.HTTP_404_NOT_FOUND)

    consumable = Consumable.objects.filter(item_name__iexact=item_name).first()
    if not consumable:
        return Response({"message": f"Consumable '{item_name}' not found."}, status=status.HTTP_404_NOT_FOUND)
    if consumable.quantity <= 0:
        return Response(
            {"message": "This asset is currently out of stock. Please choose another asset."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if quantity_value > consumable.quantity:
        return Response(
            {"message": "Requested quantity exceeds available stock for this asset."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    request_item = ConsumableRequest.objects.create(
        consumable=consumable,
        employee=requester,
        quantity=quantity_value,
        assignment_type=assignment_type,
        department=department,
        notes=notes,
    )
    request_item.refresh_from_db()
    if requester.role == User.ROLE_TECHNICIAN:
        technician = Technician.objects.select_related("user").filter(user=requester).first()
        if technician is not None:
            _create_technician_activity_log(
                technician,
                action_type=TechnicianActivityLog.ACTION_ASSET_REQUEST_SUBMITTED,
                description=f"Submitted asset request #{request_item.id} for {request_item.consumable.item_name}",
                consumable_request=request_item,
                metadata={
                    "assignment_type": request_item.assignment_type,
                    "quantity": request_item.quantity,
                    "department": request_item.department,
                },
            )
    return Response(_consumable_request_to_dict(request_item), status=status.HTTP_201_CREATED)


@api_view(["PUT"])
def consumable_request_approve_view(request, request_id: int):
    approved_by_id = request.data.get("approved_by_id")
    approved_by_user = User.objects.filter(id=approved_by_id).first() if approved_by_id else None
    with transaction.atomic():
        item = (
            ConsumableRequest.objects.select_for_update()
            .select_related("consumable", "employee", "approved_by", "rejected_by")
            .filter(id=request_id)
            .first()
        )
        if not item:
            return Response({"message": "Consumable request not found."}, status=status.HTTP_404_NOT_FOUND)

        if item.status != ConsumableRequest.STATUS_PENDING:
            return Response({"message": "Only pending requests can be approved."}, status=status.HTTP_400_BAD_REQUEST)

        assignment_type = str(request.data.get("assignment_type", item.assignment_type)).strip().lower()
        if assignment_type not in {
            ConsumableRequest.ASSIGNMENT_TYPE_NEW,
            ConsumableRequest.ASSIGNMENT_TYPE_LOAN,
            ConsumableRequest.ASSIGNMENT_TYPE_EXCHANGE,
        }:
            return Response(
                {"message": "assignment_type must be one of: new, loan, exchange."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        consumable = Consumable.objects.select_for_update().filter(id=item.consumable_id).first()
        if not consumable:
            return Response({"message": "Consumable not found."}, status=status.HTTP_404_NOT_FOUND)

        if item.quantity > consumable.quantity:
            return Response(
                {"message": f"Insufficient stock. Available: {consumable.quantity}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        consumable.quantity = consumable.quantity - item.quantity
        consumable.save(update_fields=["quantity", "updated_at"])

        item.status = ConsumableRequest.STATUS_APPROVED
        item.assignment_type = assignment_type
        item.approved_by = approved_by_user
        item.approved_at = timezone.now()
        item.save(update_fields=["status", "assignment_type", "approved_by", "approved_at", "updated_at"])

        InventoryAssignment.objects.create(
            consumable=consumable,
            employee=item.employee,
            quantity_assigned=item.quantity,
            assigned_by=approved_by_user,
            notes=f"Approved request CR-{item.id} ({assignment_type})",
        )

    item.refresh_from_db()
    return Response(_consumable_request_to_dict(item), status=status.HTTP_200_OK)


@api_view(["PUT"])
def consumable_request_reject_view(request, request_id: int):
    reason = str(request.data.get("reason", "")).strip()
    if not reason:
        return Response({"message": "reason is required."}, status=status.HTTP_400_BAD_REQUEST)

    rejected_by_id = request.data.get("rejected_by_id")
    rejected_by_user = User.objects.filter(id=rejected_by_id).first() if rejected_by_id else None

    with transaction.atomic():
        item = (
            ConsumableRequest.objects.select_for_update()
            .select_related("consumable", "employee", "approved_by", "rejected_by")
            .filter(id=request_id)
            .first()
        )
        if not item:
            return Response({"message": "Consumable request not found."}, status=status.HTTP_404_NOT_FOUND)

        if item.status != ConsumableRequest.STATUS_PENDING:
            return Response({"message": "Only pending requests can be rejected."}, status=status.HTTP_400_BAD_REQUEST)

        item.status = ConsumableRequest.STATUS_REJECTED
        item.rejection_reason = reason
        item.rejected_by = rejected_by_user
        item.rejected_at = timezone.now()
        item.save(update_fields=["status", "rejection_reason", "rejected_by", "rejected_at", "updated_at"])
    item.refresh_from_db()
    return Response(_consumable_request_to_dict(item), status=status.HTTP_200_OK)


@api_view(["GET", "POST"])
def consumable_returns_collection_view(request):
    if request.method == "GET":
        employee_id = request.query_params.get("employee_id")
        queryset = ConsumableReturn.objects.select_related(
            "consumable_request",
            "consumable",
            "employee",
            "received_by",
            "rejected_by",
        ).all()
        if employee_id:
            queryset = queryset.filter(employee_id=employee_id)
        queryset = queryset.order_by("-created_at")
        return Response([_consumable_return_to_dict(item) for item in queryset], status=status.HTTP_200_OK)

    consumable_request_id = request.data.get("consumable_request_id")
    employee_id = request.data.get("employee_id")
    quantity = request.data.get("quantity")
    reason = str(request.data.get("reason", "")).strip()

    if not consumable_request_id or not employee_id or quantity in (None, ""):
        return Response(
            {"message": "consumable_request_id, employee_id, and quantity are required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        quantity_value = int(quantity)
    except (TypeError, ValueError):
        return Response({"message": "quantity must be a number."}, status=status.HTTP_400_BAD_REQUEST)

    if quantity_value <= 0:
        return Response({"message": "quantity must be greater than 0."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        employee_id_int = int(employee_id)
    except (TypeError, ValueError):
        return Response({"message": "employee_id must be a number."}, status=status.HTTP_400_BAD_REQUEST)

    with transaction.atomic():
        request_item = (
            ConsumableRequest.objects.select_for_update()
            .select_related("consumable", "employee")
            .filter(id=consumable_request_id)
            .first()
        )
        if not request_item:
            return Response({"message": "Consumable request not found."}, status=status.HTTP_404_NOT_FOUND)

        if request_item.status != ConsumableRequest.STATUS_APPROVED:
            return Response(
                {"message": "Only approved consumable requests can be returned."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if request_item.employee_id != employee_id_int:
            return Response(
                {"message": "You can only return consumables assigned to your own request."},
                status=status.HTTP_403_FORBIDDEN,
            )

        already_requested_quantity = (
            ConsumableReturn.objects.select_for_update()
            .filter(
                consumable_request=request_item,
                status__in=[ConsumableReturn.STATUS_PENDING, ConsumableReturn.STATUS_RECEIVED],
            )
            .aggregate(total=Sum("quantity"))["total"]
            or 0
        )
        remaining_quantity = request_item.quantity - already_requested_quantity
        if quantity_value > remaining_quantity:
            return Response(
                {
                    "message": (
                        f"Return quantity exceeds remaining assigned quantity. "
                        f"Remaining quantity available for return: {remaining_quantity}"
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        return_item = ConsumableReturn.objects.create(
            consumable_request=request_item,
            consumable=request_item.consumable,
            employee=request_item.employee,
            quantity=quantity_value,
            reason=reason,
        )
    return_item.refresh_from_db()
    return Response(_consumable_return_to_dict(return_item), status=status.HTTP_201_CREATED)


@api_view(["PUT"])
def consumable_return_receive_view(request, return_id: int):
    received_by_id = request.data.get("received_by_id")
    received_by_user = User.objects.filter(id=received_by_id).first() if received_by_id else None

    with transaction.atomic():
        item = (
            ConsumableReturn.objects.select_for_update()
            .select_related("consumable", "employee", "consumable_request", "received_by", "rejected_by")
            .filter(id=return_id)
            .first()
        )
        if not item:
            return Response({"message": "Consumable return request not found."}, status=status.HTTP_404_NOT_FOUND)

        if item.status != ConsumableReturn.STATUS_PENDING:
            return Response({"message": "Only pending return requests can be received."}, status=status.HTTP_400_BAD_REQUEST)

        consumable = Consumable.objects.select_for_update().filter(id=item.consumable_id).first()
        if not consumable:
            return Response({"message": "Consumable not found."}, status=status.HTTP_404_NOT_FOUND)

        consumable.quantity = consumable.quantity + item.quantity
        consumable.save(update_fields=["quantity", "updated_at"])

        item.status = ConsumableReturn.STATUS_RECEIVED
        item.received_by = received_by_user
        item.received_at = timezone.now()
        item.rejection_reason = ""
        item.save(update_fields=["status", "received_by", "received_at", "rejection_reason", "updated_at"])

        _consume_inventory_assignments(
            consumable_id=item.consumable_id,
            employee_id=item.employee_id,
            quantity=item.quantity,
        )

    item.refresh_from_db()
    return Response(_consumable_return_to_dict(item), status=status.HTTP_200_OK)


@api_view(["PUT"])
def consumable_return_reject_view(request, return_id: int):
    reason = str(request.data.get("reason", "")).strip()
    if not reason:
        return Response({"message": "reason is required."}, status=status.HTTP_400_BAD_REQUEST)

    rejected_by_id = request.data.get("rejected_by_id")
    rejected_by_user = User.objects.filter(id=rejected_by_id).first() if rejected_by_id else None

    with transaction.atomic():
        item = (
            ConsumableReturn.objects.select_for_update()
            .select_related("consumable", "employee", "consumable_request", "received_by", "rejected_by")
            .filter(id=return_id)
            .first()
        )
        if not item:
            return Response({"message": "Consumable return request not found."}, status=status.HTTP_404_NOT_FOUND)

        if item.status != ConsumableReturn.STATUS_PENDING:
            return Response({"message": "Only pending return requests can be rejected."}, status=status.HTTP_400_BAD_REQUEST)

        item.status = ConsumableReturn.STATUS_REJECTED
        item.rejected_by = rejected_by_user
        item.rejected_at = timezone.now()
        item.rejection_reason = reason
        item.save(update_fields=["status", "rejected_by", "rejected_at", "rejection_reason", "updated_at"])
    item.refresh_from_db()
    return Response(_consumable_return_to_dict(item), status=status.HTTP_200_OK)


@api_view(["POST"])
def ai_intake_draft_view(request):
    message = str(request.data.get("message", "")).strip()
    if not message:
        return Response({"message": "message is required."}, status=status.HTTP_400_BAD_REQUEST)

    context_user = _resolve_intake_user(request)
    if not context_user:
        return Response({"message": "A valid user_id or employee_id is required."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        payload = _build_ai_intake_response(
            message,
            context_user,
            extra_context={
                "branch": str(request.data.get("branch", "")).strip(),
                "department": str(request.data.get("department", "")).strip(),
                "caller_name": str(request.data.get("caller_name", "")).strip(),
                "channel": str(request.data.get("channel", "text")).strip() or "text",
            },
        )
    except ConnectionError as error:
        return Response({"message": str(error)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    except RuntimeError as error:
        return Response({"message": str(error)}, status=status.HTTP_502_BAD_GATEWAY)

    return Response(payload, status=status.HTTP_200_OK)


@api_view(["POST"])
@parser_classes([MultiPartParser, FormParser])
def voice_to_ticket_view(request):
    audio_file = request.FILES.get("audio")
    if not audio_file:
        return Response({"message": "audio file is required."}, status=status.HTTP_400_BAD_REQUEST)

    context_user = _resolve_intake_user(request)
    if not context_user:
        return Response({"message": "A valid employee_id is required."}, status=status.HTTP_400_BAD_REQUEST)

    transcript, transcription_source = _transcribe_uploaded_audio(
        audio_file,
        transcript_hint=str(request.data.get("transcript_hint", "")).strip(),
    )

    try:
        payload = _build_ai_intake_response(
            transcript,
            context_user,
            extra_context={
                "branch": str(request.data.get("branch", "")).strip(),
                "department": str(request.data.get("department", "")).strip(),
                "caller_name": str(request.data.get("caller_name", "")).strip(),
                "channel": "voice",
                "transcription_source": transcription_source,
            },
        )
    except ConnectionError as error:
        return Response({"message": str(error)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    except RuntimeError as error:
        return Response({"message": str(error)}, status=status.HTTP_502_BAD_GATEWAY)

    payload["transcript"] = transcript
    payload["transcription_source"] = transcription_source
    return Response(payload, status=status.HTTP_200_OK)


@api_view(["POST"])
def ai_service_chat_proxy_view(request):
    message = str(request.data.get("message", "")).strip()
    if not message:
        return Response({"message": "message is required."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        data = _call_ai_service_json("/ai-service/chat", {"message": message})
        return Response(data, status=status.HTTP_200_OK)
    except RuntimeError as error:
        return Response(
            {"message": str(error)},
            status=status.HTTP_502_BAD_GATEWAY,
        )
    except ConnectionError as error:
        return Response(
            {"message": str(error)},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    



