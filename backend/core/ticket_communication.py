import re
from collections.abc import Iterable
from typing import cast

from django.db.models import Q
from django.utils.text import slugify

from .models import DiscussionParticipant, Notification, Ticket, TicketMessage, User


MENTION_PATTERN = re.compile(r"(?<![\w@])@([A-Za-z0-9._-]+)")
DISCUSSION_MENTION_TOKEN = "discussion"


def is_staff_user(user: User) -> bool:
    return user.role != User.ROLE_EMPLOYEE


def can_view_internal_messages(user: User) -> bool:
    return is_staff_user(user)


def get_primary_mention_handle(user: User) -> str:
    email_prefix = user.email.split("@", 1)[0].strip().lower()
    if email_prefix:
        return email_prefix

    slug = slugify(user.name or "")
    if slug:
        return slug

    return f"user-{user.id}"


def get_all_mention_handles(user: User) -> set[str]:
    handles = {get_primary_mention_handle(user)}
    if user.name:
        slug_handle = slugify(user.name)
        if slug_handle:
            handles.add(slug_handle)
        compact_handle = re.sub(r"[^a-z0-9]", "", slug_handle)
        if compact_handle:
            handles.add(compact_handle)
    return {item.lower() for item in handles if item}


def extract_mention_tokens(content: str) -> list[str]:
    tokens: list[str] = []
    seen = set()
    for raw_token in MENTION_PATTERN.findall(content or ""):
        token = raw_token.strip().lower()
        if not token or token in seen:
            continue
        seen.add(token)
        tokens.append(token)
    return tokens


def resolve_mentioned_users(content: str, *, include_employees: bool = False) -> list[User]:
    tokens = extract_mention_tokens(content)
    if not tokens:
        return []

    queryset = User.objects.filter(is_active=True)
    if not include_employees:
        queryset = queryset.exclude(role=User.ROLE_EMPLOYEE)

    candidates = list(queryset.order_by("name", "id"))
    matched_users: list[User] = []
    seen_user_ids = set()

    for token in tokens:
        for candidate in candidates:
            if candidate.id in seen_user_ids:
                continue
            if token in get_all_mention_handles(candidate):
                matched_users.append(candidate)
                seen_user_ids.add(candidate.id)
                break

    return matched_users


def bootstrap_discussion_participants(ticket: Ticket, actor: User) -> None:
    default_users: list[User] = []
    if is_staff_user(actor):
        default_users.append(actor)
    if ticket.technician_id:
        default_users.append(ticket.technician.user)
    if ticket.logged_by_admin_id:
        default_users.append(ticket.logged_by_admin)

    unique_users: dict[int, User] = {
        user.id: user
        for user in default_users
        if user
        and user.is_active
        and is_staff_user(user)
    }
    existing_user_ids = set(
        DiscussionParticipant.objects.filter(ticket=ticket, user_id__in=unique_users.keys()).values_list("user_id", flat=True)
    )
    new_rows = [
        DiscussionParticipant(ticket=ticket, user=user, added_by=actor)
        for user_id, user in unique_users.items()
        if user_id not in existing_user_ids
    ]
    if new_rows:
        DiscussionParticipant.objects.bulk_create(new_rows)


def ensure_discussion_participant(ticket: Ticket, user: User, added_by: User) -> DiscussionParticipant | None:
    if not user.is_active or not is_staff_user(user):
        return None
    participant, _ = DiscussionParticipant.objects.get_or_create(
        ticket=ticket,
        user=user,
        defaults={"added_by": added_by},
    )
    return participant


def user_can_access_ticket(user: User, ticket: Ticket) -> bool:
    if user.role == User.ROLE_EMPLOYEE:
        return ticket.employee_id == user.id

    if user.role in {User.ROLE_ADMIN_FAULT, User.ROLE_MANAGER}:
        return True

    if user.role == User.ROLE_TECHNICIAN and ticket.technician_id and ticket.technician.user_id == user.id:
        return True

    return DiscussionParticipant.objects.filter(ticket=ticket, user=user).exists()


def build_message_threads(messages: Iterable[TicketMessage]) -> tuple[list[TicketMessage], list[TicketMessage]]:
    ordered_messages = list(messages)
    visible_by_id = {message.id: message for message in ordered_messages}

    for message in ordered_messages:
        setattr(message, "thread_children", [])

    main_roots: list[TicketMessage] = []
    discussion_roots: list[TicketMessage] = []

    for message in ordered_messages:
        parent = visible_by_id.get(message.parent_message_id)
        if parent:
            parent_children = cast(list[TicketMessage], getattr(parent, "thread_children"))
            parent_children.append(message)
            continue

        if message.message_type == TicketMessage.TYPE_DISCUSSION:
            discussion_roots.append(message)
        else:
            main_roots.append(message)

    return main_roots, discussion_roots


def create_notification(
    *,
    user: User,
    message: str,
    notification_type: str,
    ticket: Ticket | None = None,
    ticket_message: TicketMessage | None = None,
) -> Notification:
    return Notification.objects.create(
        user=user,
        message=message,
        type=notification_type,
        ticket=ticket,
        ticket_message=ticket_message,
    )


def _staff_participant_user_ids(ticket: Ticket) -> set[int]:
    return set(
        DiscussionParticipant.objects.filter(ticket=ticket).values_list("user_id", flat=True)
    )


def notify_for_ticket_message(ticket_message: TicketMessage, mentioned_users: Iterable[User]) -> None:
    ticket = ticket_message.ticket
    sender = ticket_message.sender
    mention_tokens = set(extract_mention_tokens(ticket_message.content))
    mentioned_user_ids = {user.id for user in mentioned_users if user.id != sender.id}
    priority_notified_user_ids: set[int] = set()
    recipient_user_ids: set[int] = set()

    if ticket_message.message_type == TicketMessage.TYPE_REPLY:
        if sender.role == User.ROLE_EMPLOYEE:
            recipient_user_ids.update(
                User.objects.filter(role=User.ROLE_ADMIN_FAULT, is_active=True)
                .exclude(id=sender.id)
                .values_list("id", flat=True)
            )
            if ticket.technician_id and ticket.technician.user_id != sender.id:
                recipient_user_ids.add(ticket.technician.user_id)
            recipient_user_ids.update(_staff_participant_user_ids(ticket))
        else:
            if ticket.employee_id != sender.id:
                recipient_user_ids.add(ticket.employee_id)
            recipient_user_ids.update(_staff_participant_user_ids(ticket))
            if ticket.technician_id and ticket.technician.user_id != sender.id:
                recipient_user_ids.add(ticket.technician.user_id)
            if ticket.logged_by_admin_id and ticket.logged_by_admin_id != sender.id:
                recipient_user_ids.add(ticket.logged_by_admin_id)
    else:
        recipient_user_ids.update(_staff_participant_user_ids(ticket))

    recipient_user_ids.discard(sender.id)
    direct_reply_user_id = None
    if ticket_message.parent_message_id and ticket_message.parent_message and ticket_message.parent_message.sender_id != sender.id:
        direct_reply_user_id = ticket_message.parent_message.sender_id
        recipient_user_ids.discard(direct_reply_user_id)

    discussion_mentioned = (
        ticket_message.message_type != TicketMessage.TYPE_REPLY
        and DISCUSSION_MENTION_TOKEN in mention_tokens
    )

    if discussion_mentioned:
        recipient_user_ids.difference_update(_staff_participant_user_ids(ticket))

    if ticket_message.message_type == TicketMessage.TYPE_REPLY:
        notification_type = Notification.TYPE_REPLY
        notification_text = f"{sender.name} replied on Ticket #{ticket.id}."
    else:
        notification_type = Notification.TYPE_DISCUSSION
        notification_text = f"{sender.name} posted an internal update on Ticket #{ticket.id}."

    if direct_reply_user_id is not None:
        direct_reply_user = User.objects.filter(id=direct_reply_user_id, is_active=True).first()
        if direct_reply_user:
            create_notification(
                user=direct_reply_user,
                message=f"{sender.name} replied to your message on Ticket #{ticket.id}.",
                notification_type=Notification.TYPE_REPLY,
                ticket=ticket,
                ticket_message=ticket_message,
            )
            priority_notified_user_ids.add(direct_reply_user_id)

    for mentioned_user in mentioned_users:
        if mentioned_user.id == sender.id or not mentioned_user.is_active or mentioned_user.id in priority_notified_user_ids:
            continue
        create_notification(
            user=mentioned_user,
            message=f"You were mentioned in Ticket #{ticket.id}.",
            notification_type=Notification.TYPE_MENTION,
            ticket=ticket,
            ticket_message=ticket_message,
        )
        priority_notified_user_ids.add(mentioned_user.id)

    if discussion_mentioned:
        for participant_user_id in sorted(_staff_participant_user_ids(ticket)):
            if participant_user_id == sender.id or participant_user_id in priority_notified_user_ids:
                continue
            discussion_user = User.objects.filter(id=participant_user_id, is_active=True).first()
            if not discussion_user:
                continue
            create_notification(
                user=discussion_user,
                message=f"{sender.name} mentioned the discussion on Ticket #{ticket.id}.",
                notification_type=Notification.TYPE_MENTION,
                ticket=ticket,
                ticket_message=ticket_message,
            )
            priority_notified_user_ids.add(participant_user_id)

    for recipient_user_id in sorted(recipient_user_ids.difference(priority_notified_user_ids)):
        recipient = User.objects.filter(id=recipient_user_id, is_active=True).first()
        if not recipient:
            continue
        create_notification(
            user=recipient,
            message=notification_text,
            notification_type=notification_type,
            ticket=ticket,
            ticket_message=ticket_message,
        )


def mentionable_users_for_ticket(ticket: Ticket, current_user: User) -> list[User]:
    if not can_view_internal_messages(current_user):
        return []

    queryset = User.objects.filter(is_active=True).exclude(role=User.ROLE_EMPLOYEE)
    return list(queryset.order_by("name", "id"))


def visible_messages_for_ticket(ticket: Ticket, current_user: User) -> list[TicketMessage]:
    queryset = (
        TicketMessage.objects.select_related("sender", "parent_message", "ticket")
        .filter(ticket=ticket)
        .order_by("created_at", "id")
    )
    if not can_view_internal_messages(current_user):
        queryset = queryset.filter(message_type=TicketMessage.TYPE_REPLY)
    return list(queryset)


def participants_for_ticket(ticket: Ticket) -> list[DiscussionParticipant]:
    return list(
        DiscussionParticipant.objects.select_related("user", "added_by")
        .filter(ticket=ticket)
        .order_by("created_at", "id")
    )
