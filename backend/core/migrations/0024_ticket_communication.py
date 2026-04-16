from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0023_technician_department_and_hq_branch"),
    ]

    operations = [
        migrations.CreateModel(
            name="TicketMessage",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "message_type",
                    models.CharField(
                        choices=[("REPLY", "Reply"), ("INTERNAL_NOTE", "Internal Note"), ("DISCUSSION", "Discussion")],
                        default="REPLY",
                        max_length=20,
                    ),
                ),
                ("content", models.TextField()),
                ("is_internal", models.BooleanField(default=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "parent_message",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="child_messages",
                        to="core.ticketmessage",
                    ),
                ),
                (
                    "sender",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="ticket_messages",
                        to="core.user",
                    ),
                ),
                (
                    "ticket",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="messages",
                        to="core.ticket",
                    ),
                ),
            ],
            options={
                "db_table": "ticket_messages",
                "ordering": ["created_at", "id"],
                "indexes": [
                    models.Index(fields=["ticket", "created_at"], name="ticket_mess_ticket__80bcb6_idx"),
                    models.Index(fields=["ticket", "message_type", "created_at"], name="ticket_mess_ticket__b735e3_idx"),
                    models.Index(fields=["parent_message", "created_at"], name="ticket_mess_parent__efbca8_idx"),
                ],
            },
        ),
        migrations.CreateModel(
            name="DiscussionParticipant",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "added_by",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="discussion_participants_added",
                        to="core.user",
                    ),
                ),
                (
                    "ticket",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="discussion_participants",
                        to="core.ticket",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="discussion_participations",
                        to="core.user",
                    ),
                ),
            ],
            options={
                "db_table": "discussion_participants",
                "ordering": ["created_at", "id"],
                "indexes": [
                    models.Index(fields=["ticket", "created_at"], name="discussion__ticket__fa37be_idx"),
                    models.Index(fields=["user", "created_at"], name="discussion__user_id_abf2cc_idx"),
                ],
                "constraints": [
                    models.UniqueConstraint(fields=("ticket", "user"), name="unique_ticket_discussion_participant"),
                ],
            },
        ),
        migrations.RenameField(
            model_name="notification",
            old_name="recipient",
            new_name="user",
        ),
        migrations.AddField(
            model_name="notification",
            name="ticket_message",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="notifications",
                to="core.ticketmessage",
            ),
        ),
        migrations.AddField(
            model_name="notification",
            name="type",
            field=models.CharField(
                choices=[("MENTION", "Mention"), ("REPLY", "Reply"), ("DISCUSSION", "Discussion"), ("SYSTEM", "System")],
                default="SYSTEM",
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name="notification",
            name="message",
            field=models.TextField(),
        ),
        migrations.AlterModelOptions(
            name="notification",
            options={"db_table": "notifications", "ordering": ["-created_at", "-id"]},
        ),
        migrations.AddIndex(
            model_name="notification",
            index=models.Index(fields=["user", "is_read", "created_at"], name="notificatio_user_id_5cf777_idx"),
        ),
        migrations.AddIndex(
            model_name="notification",
            index=models.Index(fields=["type", "created_at"], name="notificatio_type_cb6908_idx"),
        ),
    ]
