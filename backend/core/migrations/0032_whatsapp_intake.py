from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0031_technician_notification_email"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="phone_number",
            field=models.CharField(blank=True, db_index=True, default="", max_length=32),
        ),
        migrations.CreateModel(
            name="WhatsAppInboundMessage",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("provider", models.CharField(blank=True, default="", max_length=40)),
                ("provider_message_id", models.CharField(blank=True, db_index=True, default="", max_length=160)),
                ("sender_phone", models.CharField(db_index=True, max_length=32)),
                ("sender_name", models.CharField(blank=True, default="", max_length=150)),
                ("message_text", models.TextField()),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("received", "Received"),
                            ("ticket_created", "Ticket Created"),
                            ("needs_registration", "Needs Registration"),
                            ("duplicate", "Duplicate"),
                            ("failed", "Failed"),
                        ],
                        default="received",
                        max_length=32,
                    ),
                ),
                ("error_message", models.TextField(blank=True, default="")),
                ("raw_payload", models.JSONField(blank=True, default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "employee",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="whatsapp_inbound_messages",
                        to="core.user",
                    ),
                ),
                (
                    "ticket",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="whatsapp_inbound_messages",
                        to="core.ticket",
                    ),
                ),
            ],
            options={
                "db_table": "whatsapp_inbound_messages",
                "ordering": ["-created_at", "-id"],
                "indexes": [
                    models.Index(fields=["provider", "provider_message_id"], name="wa_inbound_provider_msg_idx"),
                    models.Index(fields=["sender_phone", "created_at"], name="wa_inbound_sender_at_idx"),
                ],
            },
        ),
    ]
