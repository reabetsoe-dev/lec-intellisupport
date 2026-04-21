import logging

from rest_framework import serializers

from .models import DiscussionParticipant, Notification, TicketMessage, User
from .ticket_communication import extract_mention_tokens, get_primary_mention_handle

logger = logging.getLogger(__name__)


class MentionableUserSerializer(serializers.ModelSerializer):
    mention_handle = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "name", "email", "role", "mention_handle"]

    def get_mention_handle(self, obj: User) -> str:
        return get_primary_mention_handle(obj)


class TicketMessageSenderSerializer(serializers.ModelSerializer):
    mention_handle = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "name", "email", "role", "mention_handle"]

    def get_mention_handle(self, obj: User) -> str:
        return get_primary_mention_handle(obj)


class DiscussionParticipantSerializer(serializers.ModelSerializer):
    user = TicketMessageSenderSerializer(read_only=True)
    added_by = TicketMessageSenderSerializer(read_only=True)

    class Meta:
        model = DiscussionParticipant
        fields = ["id", "ticket_id", "user", "added_by", "created_at"]


class TicketMessageTreeSerializer(serializers.ModelSerializer):
    sender = TicketMessageSenderSerializer(read_only=True)
    parent_message_id = serializers.IntegerField(read_only=True)
    children = serializers.SerializerMethodField()
    mention_tokens = serializers.SerializerMethodField()

    class Meta:
        model = TicketMessage
        fields = [
            "id",
            "ticket_id",
            "sender",
            "message_type",
            "content",
            "parent_message_id",
            "is_internal",
            "created_at",
            "mention_tokens",
            "children",
        ]

    def get_children(self, obj: TicketMessage):
        return TicketMessageTreeSerializer(getattr(obj, "thread_children", []), many=True).data

    def get_mention_tokens(self, obj: TicketMessage) -> list[str]:
        return extract_mention_tokens(obj.content)


class TicketMessageCreateSerializer(serializers.Serializer):
    # Compatibility:
    # - allow missing message_type (defaults to REPLY)
    # - allow legacy/alias strings (normalized in validate)
    # - never raise server errors for unexpected values
    message_type = serializers.CharField(required=False, allow_blank=True)
    content = serializers.CharField()
    parent_message_id = serializers.IntegerField(required=False, allow_null=True)

    def validate(self, attrs):
        current_user = self.context["current_user"]
        ticket = self.context["ticket"]
        can_view_internal = self.context["can_view_internal"]
        content = str(attrs.get("content", "")).strip()
        raw_message_type = attrs.get("message_type", "")
        normalized = str(raw_message_type or "").strip().upper()

        aliases = {
            "": TicketMessage.TYPE_REPLY,
            TicketMessage.TYPE_REPLY: TicketMessage.TYPE_REPLY,
            "PUBLIC": TicketMessage.TYPE_REPLY,
            "EXTERNAL": TicketMessage.TYPE_REPLY,
            TicketMessage.TYPE_INTERNAL_NOTE: TicketMessage.TYPE_INTERNAL_NOTE,
            "INTERNAL": TicketMessage.TYPE_INTERNAL_NOTE,
            "NOTE": TicketMessage.TYPE_INTERNAL_NOTE,
            "INTERNALNOTE": TicketMessage.TYPE_INTERNAL_NOTE,
            TicketMessage.TYPE_DISCUSSION: TicketMessage.TYPE_DISCUSSION,
            "INTERNAL_DISCUSSION": TicketMessage.TYPE_DISCUSSION,
        }

        message_type = aliases.get(normalized)
        if message_type is None:
            logger.error(
                "Invalid ticket message_type; coercing to REPLY",
                extra={
                    "ticket_id": getattr(ticket, "id", None),
                    "user_id": getattr(current_user, "id", None),
                    "message_type": raw_message_type,
                },
            )
            message_type = TicketMessage.TYPE_REPLY

        if not content:
            raise serializers.ValidationError({"content": "Message content is required."})

        if current_user.role == User.ROLE_EMPLOYEE and message_type != TicketMessage.TYPE_REPLY:
            raise serializers.ValidationError({"message_type": "Employees can only send reply messages."})

        if not can_view_internal and message_type != TicketMessage.TYPE_REPLY:
            raise serializers.ValidationError({"message_type": "You are not allowed to create internal messages."})

        parent_message_id = attrs.get("parent_message_id")
        parent_message = None
        if parent_message_id is not None:
            parent_message = (
                TicketMessage.objects.select_related("sender")
                .filter(id=parent_message_id, ticket=ticket)
                .first()
            )
            if not parent_message:
                raise serializers.ValidationError({"parent_message_id": "Parent message was not found on this ticket."})

            if message_type == TicketMessage.TYPE_DISCUSSION and parent_message.message_type != TicketMessage.TYPE_DISCUSSION:
                raise serializers.ValidationError(
                    {"parent_message_id": "Discussion messages can only reply to other discussion messages."}
                )
            if message_type != TicketMessage.TYPE_DISCUSSION and parent_message.message_type == TicketMessage.TYPE_DISCUSSION:
                raise serializers.ValidationError(
                    {"parent_message_id": "Replies and internal notes cannot be threaded inside discussion messages."}
                )

            if current_user.role == User.ROLE_EMPLOYEE and parent_message.message_type != TicketMessage.TYPE_REPLY:
                raise serializers.ValidationError(
                    {"parent_message_id": "Employees can only reply to external reply messages."}
                )

        attrs["content"] = content
        attrs["message_type"] = message_type
        attrs["parent_message"] = parent_message
        return attrs

    def create(self, validated_data):
        return TicketMessage.objects.create(
            ticket=self.context["ticket"],
            sender=self.context["current_user"],
            message_type=validated_data["message_type"],
            content=validated_data["content"],
            parent_message=validated_data.get("parent_message"),
        )


class DiscussionParticipantCreateSerializer(serializers.Serializer):
    user_id = serializers.IntegerField(required=False)
    email = serializers.EmailField(required=False)

    def validate(self, attrs):
        user_id = attrs.get("user_id")
        email = str(attrs.get("email", "")).strip().lower()

        if not user_id and not email:
            raise serializers.ValidationError({"user_id": "Provide either user_id or email."})

        if user_id and email:
            raise serializers.ValidationError({"user_id": "Provide either user_id or email, not both."})

        if user_id:
            target_user = User.objects.filter(id=user_id, is_active=True).first()
        else:
            target_user = User.objects.filter(email=email, is_active=True).first()

        if not target_user:
            message = "User not found." if user_id else "No active teammate was found for this email."
            field = "user_id" if user_id else "email"
            raise serializers.ValidationError({field: message})
        if target_user.role == User.ROLE_EMPLOYEE:
            raise serializers.ValidationError(
                {"user_id": "Employees cannot be added to internal discussion participants."}
            )
        attrs["target_user"] = target_user
        return attrs


class AppNotificationSerializer(serializers.ModelSerializer):
    ticket_id = serializers.IntegerField(read_only=True)
    ticket_message_id = serializers.IntegerField(read_only=True)

    class Meta:
        model = Notification
        fields = [
            "id",
            "message",
            "type",
            "is_read",
            "ticket_id",
            "ticket_message_id",
            "created_at",
            "read_at",
        ]
