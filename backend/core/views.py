import secrets
import os
import json
from datetime import date
from decimal import Decimal, InvalidOperation
from urllib import request as urllib_request
from urllib.error import URLError, HTTPError
from django.utils import timezone

from django.contrib.auth.hashers import check_password, make_password
from django.db import IntegrityError, transaction
from django.db.models.deletion import ProtectedError
from django.db.models import Q, Sum
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .models import (
    Consumable,
    ConsumableReturn,
    ConsumableRequest,
    InventoryAssignment,
    Notification,
    Technician,
    Ticket,
    TicketComment,
    TicketMaterialRequest,
    User,
)


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


<<<<<<< HEAD
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
        "resolved": Ticket.STATUS_SOLVED,
        "solved": Ticket.STATUS_SOLVED,
    }
    return status_aliases.get(normalized, raw)


def _extract_escalation_target(comment_text: str) -> str | None:
    if comment_text.startswith("Escalated to Admin Fault"):
        return "Admin Fault Queue"
    prefix = "Escalated to technician "
    if comment_text.startswith(prefix):
        target = comment_text[len(prefix):].split(":", 1)[0].strip()
        return target or None
    return None


def _ticket_to_dict(ticket: Ticket, include_escalation_context: bool = False) -> dict:
    payload = {
=======
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


def _ticket_to_dict(ticket: Ticket) -> dict:
    return {
>>>>>>> d93be2b2 (consumables addition)
        "id": ticket.id,
        "title": ticket.title,
        "description": ticket.description,
        "category": ticket.category,
        "location": ticket.location,
        "priority": ticket.priority,
        "status": _normalize_ticket_status(ticket.status),
        "employee_id": ticket.employee_id,
        "employee_name": ticket.employee.name,
        "technician_id": ticket.technician_id,
        "technician_name": ticket.technician.user.name if ticket.technician_id else None,
        "routed_to_role": User.ROLE_ADMIN_FAULT,
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
        "branch": technician.user.branch,
        "skillset": technician.skillset,
        "is_available": technician.is_available,
    }


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
        "is_read": item.is_read,
        "ticket_id": item.ticket_id,
        "created_at": item.created_at.isoformat(),
        "read_at": item.read_at.isoformat() if item.read_at else None,
    }


def _notify_user(recipient: User, message: str, ticket: Ticket | None = None) -> None:
    Notification.objects.create(recipient=recipient, message=message[:255], ticket=ticket)


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
            "token": secrets.token_urlsafe(32),
        },
        status=status.HTTP_200_OK,
    )


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

    if len(new_password) < 8:
        return Response({"message": "New password must be at least 8 characters long."}, status=status.HTTP_400_BAD_REQUEST)

    user.password_hash = make_password(new_password)
    user.must_change_password = False
    user.save(update_fields=["password_hash", "must_change_password", "updated_at"])
    return Response({"message": "Password changed successfully."}, status=status.HTTP_200_OK)


@api_view(["GET", "POST"])
def tickets_collection_view(request):
    if request.method == "GET":
        employee_id = request.query_params.get("employee_id")
        queryset = Ticket.objects.select_related("employee", "technician__user").all().order_by("-created_at")
        if employee_id:
            queryset = queryset.filter(employee_id=employee_id)
        return Response([_ticket_to_dict(ticket) for ticket in queryset], status=status.HTTP_200_OK)

    title = str(request.data.get("title", "")).strip()
    description = str(request.data.get("description", "")).strip()
    category = str(request.data.get("category", "")).strip()
    location = str(request.data.get("location", "")).strip()
    priority = str(request.data.get("priority", "Low")).strip() or "Low"
    employee_id = request.data.get("employee_id")

    if not title or not description or not category or not employee_id:
        return Response(
            {"message": "title, description, category, and employee_id are required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    employee = User.objects.filter(id=employee_id, role=User.ROLE_EMPLOYEE).first()
    if not employee:
        return Response({"message": "Employee not found."}, status=status.HTTP_404_NOT_FOUND)

    ticket = Ticket.objects.create(
        title=title,
        description=description,
        category=category,
        location=location,
        priority=priority,
        employee=employee,
    )
    for admin_user in User.objects.filter(role=User.ROLE_ADMIN_FAULT, is_active=True):
        _notify_user(admin_user, f"New ticket #{ticket.id} submitted by {employee.name}.", ticket=ticket)
    payload = _ticket_to_dict(ticket)
    payload["routing_note"] = "Ticket routed to Admin Fault queue for assignment."
    return Response(payload, status=status.HTTP_201_CREATED)


@api_view(["GET"])
def assigned_tickets_view(request, technician_id: int):
    technician = (
        Technician.objects.select_related("user")
        .filter(Q(user_id=technician_id) | Q(id=technician_id))
        .first()
    )
    technician_user_id = technician.user_id if technician else technician_id
    technician_profile_id = technician.id if technician else None

    escalated_ticket_ids = set(
        TicketComment.objects.filter(
            author_id=technician_user_id,
            comment__startswith="Escalated",
        ).values_list("ticket_id", flat=True)
    )

    base_filter = Q(technician__user_id=technician_user_id) | Q(technician_id=technician_profile_id)
    if escalated_ticket_ids:
        base_filter = base_filter | Q(id__in=escalated_ticket_ids)

    queryset = (
        Ticket.objects.select_related("employee", "technician__user")
        .filter(base_filter)
        .distinct()
        .order_by("-updated_at", "-created_at")
    )
    payload = []
    for ticket in queryset:
        item = _ticket_to_dict(ticket, include_escalation_context=True)
        is_assigned_to_me = bool(ticket.technician_id) and (
            (technician_profile_id is not None and ticket.technician_id == technician_profile_id)
            or (ticket.technician is not None and ticket.technician.user_id == technician_user_id)
        )
        item["is_currently_assigned_to_me"] = is_assigned_to_me
        item["escalated_by_me"] = ticket.id in escalated_ticket_ids
        item["current_owner"] = ticket.technician.user.name if ticket.technician_id else "Admin Fault Queue"
        payload.append(item)
    return Response(payload, status=status.HTTP_200_OK)


@api_view(["GET"])
def ticket_detail_view(request, ticket_id: int):
    ticket = Ticket.objects.select_related("employee", "technician__user").filter(id=ticket_id).first()
    if not ticket:
        return Response({"message": "Ticket not found."}, status=status.HTTP_404_NOT_FOUND)
    return Response(_ticket_detail_to_dict(ticket), status=status.HTTP_200_OK)


@api_view(["GET", "POST"])
def ticket_material_requests_view(request, ticket_id: int):
    ticket = Ticket.objects.select_related("employee", "technician__user").filter(id=ticket_id).first()
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

    for admin_user in User.objects.filter(Q(role=User.ROLE_ADMIN_FAULT) | Q(role=User.ROLE_ADMIN_CONSUMABLES), is_active=True):
        _notify_user(
            admin_user,
            f"Material request on Ticket #{ticket.id}: {item_name} x{quantity_value} by {requester.name}.",
            ticket=ticket,
        )

    return Response(_ticket_material_request_to_dict(material_request), status=status.HTTP_201_CREATED)


@api_view(["PUT"])
def assign_technician_view(request, ticket_id: int):
    ticket = Ticket.objects.select_related("employee", "technician__user").filter(id=ticket_id).first()
    if not ticket:
        return Response({"message": "Ticket not found."}, status=status.HTTP_404_NOT_FOUND)

    technician_id = request.data.get("technician_id")
    if technician_id in (None, "", "null"):
        previous_technician_user = ticket.technician.user if ticket.technician_id else None
        ticket.technician = None
        ticket.status = Ticket.STATUS_PENDING
        ticket.save(update_fields=["technician", "status", "updated_at"])
        if previous_technician_user:
            _notify_user(previous_technician_user, f"Ticket #{ticket.id} was unassigned by Admin Fault.", ticket=ticket)
        for admin_user in User.objects.filter(role=User.ROLE_ADMIN_FAULT, is_active=True):
            _notify_user(admin_user, f"Ticket #{ticket.id} is now unassigned.", ticket=ticket)
        return Response(_ticket_to_dict(ticket), status=status.HTTP_200_OK)

    technician = Technician.objects.filter(id=technician_id).select_related("user").first()
    if not technician:
        technician = Technician.objects.filter(user_id=technician_id).select_related("user").first()
    if not technician:
        return Response({"message": "Technician not found."}, status=status.HTTP_404_NOT_FOUND)

    previous_technician_user = ticket.technician.user if ticket.technician_id else None
    ticket.technician = technician
    ticket.status = Ticket.STATUS_IN_PROCESS
    ticket.save(update_fields=["technician", "status", "updated_at"])
    if previous_technician_user and previous_technician_user.id != technician.user_id:
        _notify_user(previous_technician_user, f"Ticket #{ticket.id} was reassigned to {technician.user.name}.", ticket=ticket)
    _notify_user(technician.user, f"Ticket #{ticket.id} assigned to you by Admin Fault.", ticket=ticket)
    for admin_user in User.objects.filter(role=User.ROLE_ADMIN_FAULT, is_active=True):
        _notify_user(admin_user, f"Ticket #{ticket.id} assigned to {technician.user.name}.", ticket=ticket)
    return Response(_ticket_to_dict(ticket), status=status.HTTP_200_OK)


@api_view(["PUT"])
def escalate_ticket_view(request, ticket_id: int):
    ticket = Ticket.objects.select_related("employee", "technician__user").filter(id=ticket_id).first()
    if not ticket:
        return Response({"message": "Ticket not found."}, status=status.HTTP_404_NOT_FOUND)

    if not ticket.technician_id:
        return Response({"message": "Cannot escalate an unassigned ticket."}, status=status.HTTP_400_BAD_REQUEST)

    from_technician_user_id = request.data.get("from_technician_user_id")
    if not from_technician_user_id:
        return Response({"message": "from_technician_user_id is required."}, status=status.HTTP_400_BAD_REQUEST)
    try:
        from_technician_user_id_int = int(from_technician_user_id)
    except (TypeError, ValueError):
        return Response({"message": "from_technician_user_id must be a number."}, status=status.HTTP_400_BAD_REQUEST)

    if ticket.technician.user_id != from_technician_user_id_int:
        return Response(
            {"message": "You can only escalate tickets currently assigned to you."},
            status=status.HTTP_403_FORBIDDEN,
        )

    escalation_comment = str(request.data.get("comment", "")).strip()
    if not escalation_comment:
        return Response({"message": "comment is required when escalating."}, status=status.HTTP_400_BAD_REQUEST)

    actor_user = User.objects.filter(id=from_technician_user_id_int, role=User.ROLE_TECHNICIAN).first()
    if not actor_user:
        return Response({"message": "Technician user not found."}, status=status.HTTP_404_NOT_FOUND)

    target_role = str(request.data.get("target_role", "")).strip().lower()
    target_technician_id = request.data.get("target_technician_id")

    if target_role == User.ROLE_ADMIN_FAULT:
        ticket.technician = None
        ticket.status = Ticket.STATUS_PENDING
        ticket.save(update_fields=["technician", "status", "updated_at"])

        TicketComment.objects.create(
            ticket=ticket,
            author=actor_user,
            comment=f"Escalated to Admin Fault: {escalation_comment}",
        )
        for admin_user in User.objects.filter(role=User.ROLE_ADMIN_FAULT, is_active=True):
            _notify_user(
                admin_user,
                f"Ticket #{ticket.id} escalated back to Admin Fault by {actor_user.name}.",
                ticket=ticket,
            )
        return Response(_ticket_to_dict(ticket), status=status.HTTP_200_OK)

    if target_technician_id in (None, "", "null"):
        return Response({"message": "target_technician_id is required."}, status=status.HTTP_400_BAD_REQUEST)

    target_technician = Technician.objects.filter(id=target_technician_id).select_related("user").first()
    if not target_technician:
        target_technician = Technician.objects.filter(user_id=target_technician_id).select_related("user").first()
    if not target_technician:
        return Response({"message": "Target technician not found."}, status=status.HTTP_404_NOT_FOUND)

    if ticket.technician_id == target_technician.id:
        return Response({"message": "Ticket is already assigned to this technician."}, status=status.HTTP_400_BAD_REQUEST)

    previous_technician_user = ticket.technician.user
    ticket.technician = target_technician
    ticket.status = Ticket.STATUS_IN_PROCESS
    ticket.save(update_fields=["technician", "status", "updated_at"])

    TicketComment.objects.create(
        ticket=ticket,
        author=actor_user,
        comment=f"Escalated to technician {target_technician.user.name}: {escalation_comment}",
    )
    if previous_technician_user.id != target_technician.user_id:
        _notify_user(
            previous_technician_user,
            f"Ticket #{ticket.id} has been escalated away from your queue.",
            ticket=ticket,
        )
    _notify_user(
        target_technician.user,
        f"Ticket #{ticket.id} escalated to you by {actor_user.name}.",
        ticket=ticket,
    )
    for admin_user in User.objects.filter(role=User.ROLE_ADMIN_FAULT, is_active=True):
        _notify_user(
            admin_user,
            f"Ticket #{ticket.id} escalated from {actor_user.name} to {target_technician.user.name}.",
            ticket=ticket,
        )
    return Response(_ticket_to_dict(ticket), status=status.HTTP_200_OK)


@api_view(["GET", "POST"])
def technicians_collection_view(request):
    if request.method == "GET":
        technicians = Technician.objects.select_related("user").all().order_by("user__name")
        return Response([_technician_to_dict(item) for item in technicians], status=status.HTTP_200_OK)

    name = str(request.data.get("name", "")).strip()
    email = str(request.data.get("email", "")).strip().lower()
    password = str(request.data.get("password", "")).strip()
    branch = str(request.data.get("branch", "")).strip()
    skillset = str(request.data.get("skillset", "")).strip()
    raw_is_available = request.data.get("is_available", True)
    if isinstance(raw_is_available, str):
        is_available = raw_is_available.strip().lower() not in ("0", "false", "no")
    else:
        is_available = bool(raw_is_available)

    if not name or not email or not password:
        return Response(
            {"message": "name, email, and password are required."},
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
                password_hash=make_password(password),
                role=User.ROLE_TECHNICIAN,
                is_active=True,
            )
            technician = Technician.objects.create(
                user=user,
                skillset=skillset,
                is_available=is_available,
            )
    except IntegrityError:
        return Response({"message": "Failed to create technician."}, status=status.HTTP_400_BAD_REQUEST)

    return Response(_technician_to_dict(technician), status=status.HTTP_201_CREATED)


@api_view(["DELETE"])
def technician_detail_view(request, technician_id: int):
    technician = Technician.objects.select_related("user").filter(id=technician_id).first()
    if not technician:
        return Response({"message": "Technician not found."}, status=status.HTTP_404_NOT_FOUND)

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
    password = str(request.data.get("password", "")).strip()
    branch = str(request.data.get("branch", "")).strip()
    raw_is_active = request.data.get("is_active", True)
    if isinstance(raw_is_active, str):
        is_active = raw_is_active.strip().lower() not in ("0", "false", "no")
    else:
        is_active = bool(raw_is_active)

    if not name or not email or not password:
        return Response(
            {"message": "name, email, and password are required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if User.objects.filter(email=email).exists():
        return Response({"message": "A user with this email already exists."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        user = User.objects.create(
            name=name,
            email=email,
            branch=branch,
            password_hash=make_password(password),
            must_change_password=True,
            role=User.ROLE_EMPLOYEE,
            is_active=is_active,
        )
    except IntegrityError:
        return Response({"message": "Failed to create employee."}, status=status.HTTP_400_BAD_REQUEST)

    return Response(_user_to_dict(user), status=status.HTTP_201_CREATED)


@api_view(["DELETE"])
def employee_detail_view(request, employee_id: int):
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

    queryset = Notification.objects.filter(recipient=user).order_by("-created_at")
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
    queryset = Notification.objects.filter(recipient=user, is_read=False)
    if isinstance(ids, list) and ids:
        queryset = queryset.filter(id__in=ids)

    queryset.update(is_read=True, read_at=timezone.now())
    unread_count = Notification.objects.filter(recipient=user, is_read=False).count()
    return Response({"unread_count": unread_count}, status=status.HTTP_200_OK)


@api_view(["PUT"])
def ticket_priority_view(request, ticket_id: int):
    ticket = Ticket.objects.select_related("employee", "technician__user").filter(id=ticket_id).first()
    if not ticket:
        return Response({"message": "Ticket not found."}, status=status.HTTP_404_NOT_FOUND)

    priority = str(request.data.get("priority", "")).strip()
    if priority not in dict(Ticket.PRIORITY_CHOICES):
        return Response({"message": "Invalid priority value."}, status=status.HTTP_400_BAD_REQUEST)

    ticket.priority = priority
    ticket.save(update_fields=["priority", "updated_at"])
    return Response(_ticket_to_dict(ticket), status=status.HTTP_200_OK)


@api_view(["PUT"])
def ticket_category_view(request, ticket_id: int):
    ticket = Ticket.objects.select_related("employee", "technician__user").filter(id=ticket_id).first()
    if not ticket:
        return Response({"message": "Ticket not found."}, status=status.HTTP_404_NOT_FOUND)

    category = str(request.data.get("category", "")).strip()
    if not category:
        return Response({"message": "category is required."}, status=status.HTTP_400_BAD_REQUEST)

    ticket.category = category
    ticket.save(update_fields=["category", "updated_at"])
    return Response(_ticket_to_dict(ticket), status=status.HTTP_200_OK)


@api_view(["PUT"])
def ticket_status_view(request, ticket_id: int):
    ticket = Ticket.objects.select_related("employee", "technician__user").filter(id=ticket_id).first()
    if not ticket:
        return Response({"message": "Ticket not found."}, status=status.HTTP_404_NOT_FOUND)

    input_status = request.data.get("status")
    if input_status in (None, ""):
        return Response({"message": "status is required."}, status=status.HTTP_400_BAD_REQUEST)

    status_value = _normalize_ticket_status(str(input_status))
    if status_value not in dict(Ticket.STATUS_CHOICES):
        return Response({"message": "Invalid status value."}, status=status.HTTP_400_BAD_REQUEST)

    ticket.status = status_value
    ticket.save(update_fields=["status", "updated_at"])
    return Response(_ticket_to_dict(ticket), status=status.HTTP_200_OK)


@api_view(["GET"])
def performance_metrics_view(request):
    tickets = list(Ticket.objects.select_related("technician__user").all())
    total_tickets = len(tickets)
    resolved_tickets = sum(1 for item in tickets if _normalize_ticket_status(item.status) == Ticket.STATUS_SOLVED)
    open_tickets = sum(1 for item in tickets if _normalize_ticket_status(item.status) != Ticket.STATUS_SOLVED)
    critical_tickets = sum(1 for item in tickets if item.priority == Ticket.PRIORITY_CRITICAL)
    unassigned_tickets = sum(1 for item in tickets if item.technician_id is None)
    resolved_rate = round((resolved_tickets / total_tickets) * 100, 2) if total_tickets else 0.0

    by_status: dict[str, int] = {}
    by_priority: dict[str, int] = {}
    by_category: dict[str, int] = {}
    by_month: dict[str, int] = {}
    by_technician: dict[str, int] = {}

    for item in tickets:
        normalized_status = _normalize_ticket_status(item.status)
        by_status[normalized_status] = by_status.get(normalized_status, 0) + 1
        by_priority[item.priority] = by_priority.get(item.priority, 0) + 1
        by_category[item.category] = by_category.get(item.category, 0) + 1
        month_key = item.created_at.strftime("%Y-%m")
        by_month[month_key] = by_month.get(month_key, 0) + 1
        technician_label = item.technician.user.name if item.technician_id else "Unassigned"
        by_technician[technician_label] = by_technician.get(technician_label, 0) + 1

    payload = {
        "kpis": {
            "total_tickets": total_tickets,
            "open_tickets": open_tickets,
            "resolved_tickets": resolved_tickets,
            "critical_tickets": critical_tickets,
            "unassigned_tickets": unassigned_tickets,
            "resolved_rate": resolved_rate,
        },
        "by_status": [{"name": key, "count": value} for key, value in sorted(by_status.items())],
        "by_priority": [{"name": key, "count": value} for key, value in sorted(by_priority.items())],
        "by_category": [{"name": key, "count": value} for key, value in sorted(by_category.items())],
        "by_month": [{"name": key, "count": value} for key, value in sorted(by_month.items())],
        "by_technician": [{"name": key, "count": value} for key, value in sorted(by_technician.items())],
        "generated_at": timezone.now().isoformat(),
    }
    return Response(payload, status=status.HTTP_200_OK)


def _consumable_to_dict(consumable: Consumable) -> dict:
    return {
        "id": consumable.id,
        "asset_tag": consumable.asset_tag,
        "item_name": consumable.item_name,
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
        "purchase_cost": float(consumable.purchase_cost) if consumable.purchase_cost is not None else None,
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


@api_view(["PUT"])
def consumable_detail_view(request, consumable_id: int):
    consumable = Consumable.objects.filter(id=consumable_id).first()
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

    employee = User.objects.filter(id=employee_id, role=User.ROLE_EMPLOYEE).first()
    if not employee:
        return Response({"message": "Employee not found."}, status=status.HTTP_404_NOT_FOUND)

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
        employee=employee,
        quantity=quantity_value,
        assignment_type=assignment_type,
        department=department,
        notes=notes,
    )
    request_item.refresh_from_db()
    return Response(_consumable_request_to_dict(request_item), status=status.HTTP_201_CREATED)


@api_view(["PUT"])
def consumable_request_approve_view(request, request_id: int):
    item = (
        ConsumableRequest.objects.select_related("consumable", "employee", "approved_by", "rejected_by")
        .filter(id=request_id)
        .first()
    )
    if not item:
        return Response({"message": "Consumable request not found."}, status=status.HTTP_404_NOT_FOUND)

    if item.status != ConsumableRequest.STATUS_PENDING:
        return Response({"message": "Only pending requests can be approved."}, status=status.HTTP_400_BAD_REQUEST)

    approved_by_id = request.data.get("approved_by_id")
    approved_by_user = User.objects.filter(id=approved_by_id).first() if approved_by_id else None
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

    if item.quantity > item.consumable.quantity:
        return Response(
            {"message": f"Insufficient stock. Available: {item.consumable.quantity}"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    item.consumable.quantity = item.consumable.quantity - item.quantity
    item.consumable.save(update_fields=["quantity", "updated_at"])

    item.status = ConsumableRequest.STATUS_APPROVED
    item.assignment_type = assignment_type
    item.approved_by = approved_by_user
    item.approved_at = timezone.now()
    item.save(update_fields=["status", "assignment_type", "approved_by", "approved_at", "updated_at"])
    item.refresh_from_db()
    return Response(_consumable_request_to_dict(item), status=status.HTTP_200_OK)


@api_view(["PUT"])
def consumable_request_reject_view(request, request_id: int):
    item = (
        ConsumableRequest.objects.select_related("consumable", "employee", "approved_by", "rejected_by")
        .filter(id=request_id)
        .first()
    )
    if not item:
        return Response({"message": "Consumable request not found."}, status=status.HTTP_404_NOT_FOUND)

    if item.status != ConsumableRequest.STATUS_PENDING:
        return Response({"message": "Only pending requests can be rejected."}, status=status.HTTP_400_BAD_REQUEST)

    reason = str(request.data.get("reason", "")).strip()
    if not reason:
        return Response({"message": "reason is required."}, status=status.HTTP_400_BAD_REQUEST)

    rejected_by_id = request.data.get("rejected_by_id")
    rejected_by_user = User.objects.filter(id=rejected_by_id).first() if rejected_by_id else None

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

    request_item = (
        ConsumableRequest.objects.select_related("consumable", "employee")
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

    try:
        employee_id_int = int(employee_id)
    except (TypeError, ValueError):
        return Response({"message": "employee_id must be a number."}, status=status.HTTP_400_BAD_REQUEST)

    if request_item.employee_id != employee_id_int:
        return Response(
            {"message": "You can only return consumables assigned to your own request."},
            status=status.HTTP_403_FORBIDDEN,
        )

    already_requested_quantity = (
        ConsumableReturn.objects.filter(
            consumable_request=request_item,
            status__in=[ConsumableReturn.STATUS_PENDING, ConsumableReturn.STATUS_RECEIVED],
        ).aggregate(total=Sum("quantity"))["total"]
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
    item = (
        ConsumableReturn.objects.select_related("consumable", "employee", "consumable_request", "received_by", "rejected_by")
        .filter(id=return_id)
        .first()
    )
    if not item:
        return Response({"message": "Consumable return request not found."}, status=status.HTTP_404_NOT_FOUND)

    if item.status != ConsumableReturn.STATUS_PENDING:
        return Response({"message": "Only pending return requests can be received."}, status=status.HTTP_400_BAD_REQUEST)

    received_by_id = request.data.get("received_by_id")
    received_by_user = User.objects.filter(id=received_by_id).first() if received_by_id else None

    with transaction.atomic():
        item.consumable.quantity = item.consumable.quantity + item.quantity
        item.consumable.save(update_fields=["quantity", "updated_at"])

        item.status = ConsumableReturn.STATUS_RECEIVED
        item.received_by = received_by_user
        item.received_at = timezone.now()
        item.rejection_reason = ""
        item.save(update_fields=["status", "received_by", "received_at", "rejection_reason", "updated_at"])

    item.refresh_from_db()
    return Response(_consumable_return_to_dict(item), status=status.HTTP_200_OK)


@api_view(["PUT"])
def consumable_return_reject_view(request, return_id: int):
    item = (
        ConsumableReturn.objects.select_related("consumable", "employee", "consumable_request", "received_by", "rejected_by")
        .filter(id=return_id)
        .first()
    )
    if not item:
        return Response({"message": "Consumable return request not found."}, status=status.HTTP_404_NOT_FOUND)

    if item.status != ConsumableReturn.STATUS_PENDING:
        return Response({"message": "Only pending return requests can be rejected."}, status=status.HTTP_400_BAD_REQUEST)

    reason = str(request.data.get("reason", "")).strip()
    if not reason:
        return Response({"message": "reason is required."}, status=status.HTTP_400_BAD_REQUEST)

    rejected_by_id = request.data.get("rejected_by_id")
    rejected_by_user = User.objects.filter(id=rejected_by_id).first() if rejected_by_id else None

    item.status = ConsumableReturn.STATUS_REJECTED
    item.rejected_by = rejected_by_user
    item.rejected_at = timezone.now()
    item.rejection_reason = reason
    item.save(update_fields=["status", "rejected_by", "rejected_at", "rejection_reason", "updated_at"])
    item.refresh_from_db()
    return Response(_consumable_return_to_dict(item), status=status.HTTP_200_OK)


@api_view(["POST"])
def ai_service_chat_proxy_view(request):
    message = str(request.data.get("message", "")).strip()
    if not message:
        return Response({"message": "message is required."}, status=status.HTTP_400_BAD_REQUEST)

    ai_base_url = os.getenv("AI_SERVICE_URL", "http://127.0.0.1:8001").rstrip("/")
    endpoint = f"{ai_base_url}/ai-service/chat"

    payload = json.dumps({"message": message}).encode("utf-8")
    req = urllib_request.Request(
        endpoint,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib_request.urlopen(req, timeout=10) as response:
            body = response.read().decode("utf-8")
            data = json.loads(body) if body else {}
            if isinstance(data, dict):
                return Response(data, status=status.HTTP_200_OK)
            return Response({"reply": "AI service returned an invalid response."}, status=status.HTTP_502_BAD_GATEWAY)
    except HTTPError as error:
        return Response(
            {"message": f"AI service error: {error.code}"},
            status=status.HTTP_502_BAD_GATEWAY,
        )
    except URLError:
        return Response(
            {"message": "AI service is unreachable. Ensure ai_services is running on port 8001."},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )





