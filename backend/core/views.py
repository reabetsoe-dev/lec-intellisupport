import secrets
import os
import json
from urllib import request as urllib_request
from urllib.error import URLError, HTTPError
from django.utils import timezone

from django.contrib.auth.hashers import check_password, make_password
from django.db import IntegrityError, transaction
from django.db.models import Q
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .models import (
    Consumable,
    ConsumableRequest,
    Notification,
    Technician,
    Ticket,
    TicketComment,
    TicketMaterialRequest,
    User,
)


def _ticket_to_dict(ticket: Ticket) -> dict:
    return {
        "id": ticket.id,
        "title": ticket.title,
        "description": ticket.description,
        "category": ticket.category,
        "location": ticket.location,
        "priority": ticket.priority,
        "status": ticket.status,
        "employee_id": ticket.employee_id,
        "employee_name": ticket.employee.name,
        "technician_id": ticket.technician_id,
        "technician_name": ticket.technician.user.name if ticket.technician_id else None,
        "routed_to_role": User.ROLE_ADMIN_FAULT,
        "created_at": ticket.created_at.isoformat(),
        "updated_at": ticket.updated_at.isoformat(),
    }


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
        "skillset": technician.skillset,
        "is_available": technician.is_available,
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
            "token": secrets.token_urlsafe(32),
        },
        status=status.HTTP_200_OK,
    )


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
    queryset = (
        Ticket.objects.select_related("employee", "technician__user")
        .filter(Q(technician__user_id=technician_id) | Q(technician_id=technician_id))
        .order_by("-created_at")
    )
    return Response([_ticket_to_dict(ticket) for ticket in queryset], status=status.HTTP_200_OK)


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
        ticket.save(update_fields=["technician", "updated_at"])
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
    ticket.save(update_fields=["technician", "updated_at"])
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
        ticket.status = Ticket.STATUS_OPEN
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
    if ticket.status == Ticket.STATUS_OPEN:
        ticket.status = Ticket.STATUS_IN_PROGRESS
        ticket.save(update_fields=["technician", "status", "updated_at"])
    else:
        ticket.save(update_fields=["technician", "updated_at"])

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
def ticket_status_view(request, ticket_id: int):
    ticket = Ticket.objects.select_related("employee", "technician__user").filter(id=ticket_id).first()
    if not ticket:
        return Response({"message": "Ticket not found."}, status=status.HTTP_404_NOT_FOUND)

    status_value = str(request.data.get("status", "")).strip()
    if status_value not in dict(Ticket.STATUS_CHOICES):
        return Response({"message": "Invalid status value."}, status=status.HTTP_400_BAD_REQUEST)

    ticket.status = status_value
    ticket.save(update_fields=["status", "updated_at"])
    return Response(_ticket_to_dict(ticket), status=status.HTTP_200_OK)


def _consumable_to_dict(consumable: Consumable) -> dict:
    return {
        "id": consumable.id,
        "item_name": consumable.item_name,
        "quantity": consumable.quantity,
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

    item_name = str(request.data.get("item_name", "")).strip()
    quantity = request.data.get("quantity", 0)
    department = str(request.data.get("department", "")).strip()
    assigned_employee = str(request.data.get("assigned_employee", "")).strip()

    if not item_name:
        return Response({"message": "item_name is required."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        quantity_value = int(quantity)
    except (TypeError, ValueError):
        return Response({"message": "quantity must be a number."}, status=status.HTTP_400_BAD_REQUEST)

    consumable = Consumable.objects.create(
        item_name=item_name,
        quantity=quantity_value,
        department=department,
        assigned_employee=assigned_employee,
    )
    return Response(_consumable_to_dict(consumable), status=status.HTTP_201_CREATED)


@api_view(["PUT"])
def consumable_detail_view(request, consumable_id: int):
    consumable = Consumable.objects.filter(id=consumable_id).first()
    if not consumable:
        return Response({"message": "Consumable not found."}, status=status.HTTP_404_NOT_FOUND)

    if "item_name" in request.data:
        consumable.item_name = str(request.data.get("item_name", consumable.item_name)).strip() or consumable.item_name

    if "quantity" in request.data:
        try:
            consumable.quantity = int(request.data.get("quantity"))
        except (TypeError, ValueError):
            return Response({"message": "quantity must be a number."}, status=status.HTTP_400_BAD_REQUEST)

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

    employee = User.objects.filter(id=employee_id, role=User.ROLE_EMPLOYEE).first()
    if not employee:
        return Response({"message": "Employee not found."}, status=status.HTTP_404_NOT_FOUND)

    consumable = Consumable.objects.filter(item_name__iexact=item_name).first()
    if not consumable:
        return Response({"message": f"Consumable '{item_name}' not found."}, status=status.HTTP_404_NOT_FOUND)

    request_item = ConsumableRequest.objects.create(
        consumable=consumable,
        employee=employee,
        quantity=quantity_value,
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

    if item.quantity > item.consumable.quantity:
        return Response(
            {"message": f"Insufficient stock. Available: {item.consumable.quantity}"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    item.consumable.quantity = item.consumable.quantity - item.quantity
    item.consumable.save(update_fields=["quantity", "updated_at"])

    item.status = ConsumableRequest.STATUS_APPROVED
    item.approved_by = approved_by_user
    item.approved_at = timezone.now()
    item.save(update_fields=["status", "approved_by", "approved_at", "updated_at"])
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
