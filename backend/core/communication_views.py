import logging

from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .authentication import CachedBearerAuthentication
from .models import Notification, Ticket, TicketMessage, User
from .serializers import (
    AppNotificationSerializer,
    DiscussionParticipantCreateSerializer,
    DiscussionParticipantSerializer,
    MentionableUserSerializer,
    TicketMessageCreateSerializer,
    TicketMessageTreeSerializer,
)
from .ticket_communication import (
    bootstrap_discussion_participants,
    build_message_threads,
    can_view_internal_messages,
    create_notification,
    ensure_discussion_participant,
    mentionable_users_for_ticket,
    notify_for_ticket_message,
    participants_for_ticket,
    resolve_mentioned_users,
    user_can_access_ticket,
    visible_messages_for_ticket,
)
from .views import _ticket_detail_to_dict

logger = logging.getLogger(__name__)


def _ticket_queryset():
    return Ticket.objects.select_related("employee", "technician__user", "logged_by_admin")


def _get_accessible_ticket(ticket_id: int, current_user: User) -> Ticket | None:
    ticket = _ticket_queryset().filter(id=ticket_id).first()
    if not ticket:
        return None
    if not user_can_access_ticket(current_user, ticket):
        return None
    return ticket


@api_view(["GET"])
@authentication_classes([CachedBearerAuthentication])
@permission_classes([IsAuthenticated])
def ticket_detail_view(request, ticket_id: int):
    ticket = _get_accessible_ticket(ticket_id, request.user)
    if not ticket:
        return Response({"message": "Ticket not found or access denied."}, status=status.HTTP_404_NOT_FOUND)

    payload = _ticket_detail_to_dict(ticket)
    payload["can_view_internal_messages"] = can_view_internal_messages(request.user)
    payload["can_manage_discussion_participants"] = can_view_internal_messages(request.user)
    return Response(payload, status=status.HTTP_200_OK)


@api_view(["GET", "POST"])
@authentication_classes([CachedBearerAuthentication])
@permission_classes([IsAuthenticated])
def ticket_messages_view(request, ticket_id: int):
    ticket = _get_accessible_ticket(ticket_id, request.user)
    if not ticket:
        return Response({"message": "Ticket not found or access denied."}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "GET":
        visible_messages = visible_messages_for_ticket(ticket, request.user)
        main_thread, discussion_thread = build_message_threads(visible_messages)
        participants = participants_for_ticket(ticket)
        mentionable_users = mentionable_users_for_ticket(ticket, request.user)
        return Response(
            {
                "main_thread": TicketMessageTreeSerializer(main_thread, many=True).data,
                "discussion_thread": TicketMessageTreeSerializer(discussion_thread, many=True).data,
                "participants": DiscussionParticipantSerializer(participants, many=True).data,
                "mentionable_users": MentionableUserSerializer(mentionable_users, many=True).data,
                "permissions": {
                    "can_view_internal_messages": can_view_internal_messages(request.user),
                    "can_manage_discussion_participants": can_view_internal_messages(request.user),
                    "can_post_discussion": can_view_internal_messages(request.user),
                    "can_post_internal_note": can_view_internal_messages(request.user),
                    "can_post_reply": True,
                },
            },
            status=status.HTTP_200_OK,
        )

    serializer = TicketMessageCreateSerializer(
        data=request.data,
        context={
            "current_user": request.user,
            "ticket": ticket,
            "can_view_internal": can_view_internal_messages(request.user),
        },
    )
    if not serializer.is_valid():
        logger.error(
            "Ticket message validation failed",
            extra={
                "ticket_id": ticket_id,
                "user_id": getattr(request.user, "id", None),
                "errors": serializer.errors,
                "payload_keys": sorted(list(getattr(request, "data", {}).keys())) if hasattr(request, "data") else None,
            },
        )
        # Safe, stable error response shape for clients.
        return Response(
            {"message": "Invalid message payload.", "errors": serializer.errors},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if can_view_internal_messages(request.user):
        bootstrap_discussion_participants(ticket, request.user)

    ticket_message = serializer.save()
    ticket.last_activity_at = timezone.now()
    ticket.save(update_fields=["last_activity_at", "updated_at"])

    mentioned_users: list[User] = []
    if can_view_internal_messages(request.user):
        mentioned_users = resolve_mentioned_users(ticket_message.content)
        ensure_discussion_participant(ticket, request.user, request.user)
        for mentioned_user in mentioned_users:
            ensure_discussion_participant(ticket, mentioned_user, request.user)

    notify_for_ticket_message(ticket_message, mentioned_users)

    return Response(TicketMessageTreeSerializer(ticket_message).data, status=status.HTTP_201_CREATED)


@api_view(["GET", "POST"])
@authentication_classes([CachedBearerAuthentication])
@permission_classes([IsAuthenticated])
def ticket_participants_view(request, ticket_id: int):
    ticket = _get_accessible_ticket(ticket_id, request.user)
    if not ticket:
        return Response({"message": "Ticket not found or access denied."}, status=status.HTTP_404_NOT_FOUND)

    if not can_view_internal_messages(request.user):
        return Response({"message": "Only staff can manage discussion participants."}, status=status.HTTP_403_FORBIDDEN)

    if request.method == "GET":
        participants = participants_for_ticket(ticket)
        return Response(DiscussionParticipantSerializer(participants, many=True).data, status=status.HTTP_200_OK)

    bootstrap_discussion_participants(ticket, request.user)
    serializer = DiscussionParticipantCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    target_user = serializer.validated_data["target_user"]

    participant = ensure_discussion_participant(ticket, target_user, request.user)
    if participant is None:
        return Response({"message": "Selected user cannot be added to internal discussions."}, status=status.HTTP_400_BAD_REQUEST)

    if target_user.id != request.user.id:
        create_notification(
            user=target_user,
            message=f"{request.user.name} added you to Ticket #{ticket.id} discussion.",
            notification_type=Notification.TYPE_DISCUSSION,
            ticket=ticket,
        )

    return Response(DiscussionParticipantSerializer(participant).data, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@authentication_classes([CachedBearerAuthentication])
@permission_classes([IsAuthenticated])
def notifications_view(request):
    notifications = (
        Notification.objects.select_related("ticket", "ticket_message")
        .filter(user=request.user)
        .order_by("-created_at", "-id")[:50]
    )
    unread_count = Notification.objects.filter(user=request.user, is_read=False).count()
    return Response(
        {
            "unread_count": unread_count,
            "notifications": AppNotificationSerializer(notifications, many=True).data,
        },
        status=status.HTTP_200_OK,
    )


@api_view(["PATCH"])
@authentication_classes([CachedBearerAuthentication])
@permission_classes([IsAuthenticated])
def notification_mark_read_view(request, notification_id: int):
    notification = Notification.objects.filter(id=notification_id, user=request.user).first()
    if not notification:
        return Response({"message": "Notification not found."}, status=status.HTTP_404_NOT_FOUND)

    if not notification.is_read:
        notification.is_read = True
        notification.read_at = timezone.now()
        notification.save(update_fields=["is_read", "read_at"])

    return Response(AppNotificationSerializer(notification).data, status=status.HTTP_200_OK)
