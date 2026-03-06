import secrets
import os
import json
from urllib import request as urllib_request
from urllib.error import URLError, HTTPError
from django.utils import timezone

from django.contrib.auth.hashers import check_password
from django.db.models import Q
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .models import Consumable, ConsumableRequest, Technician, Ticket, User


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
        "created_at": ticket.created_at.isoformat(),
        "updated_at": ticket.updated_at.isoformat(),
    }


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
    return Response(_ticket_to_dict(ticket), status=status.HTTP_201_CREATED)


@api_view(["GET"])
def assigned_tickets_view(request, technician_id: int):
    queryset = (
        Ticket.objects.select_related("employee", "technician__user")
        .filter(Q(technician__user_id=technician_id) | Q(technician_id=technician_id))
        .order_by("-created_at")
    )
    return Response([_ticket_to_dict(ticket) for ticket in queryset], status=status.HTTP_200_OK)


@api_view(["PUT"])
def assign_technician_view(request, ticket_id: int):
    ticket = Ticket.objects.select_related("employee", "technician__user").filter(id=ticket_id).first()
    if not ticket:
        return Response({"message": "Ticket not found."}, status=status.HTTP_404_NOT_FOUND)

    technician_id = request.data.get("technician_id")
    if technician_id in (None, "", "null"):
        ticket.technician = None
        ticket.save(update_fields=["technician", "updated_at"])
        return Response(_ticket_to_dict(ticket), status=status.HTTP_200_OK)

    technician = Technician.objects.filter(Q(id=technician_id) | Q(user_id=technician_id)).select_related("user").first()
    if not technician:
        return Response({"message": "Technician not found."}, status=status.HTTP_404_NOT_FOUND)

    ticket.technician = technician
    ticket.save(update_fields=["technician", "updated_at"])
    return Response(_ticket_to_dict(ticket), status=status.HTTP_200_OK)


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
