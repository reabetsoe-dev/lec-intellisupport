from django.db import migrations, models
import django.db.models.deletion
from django.utils import timezone


def reset_technician_availability(apps, schema_editor):
    Technician = apps.get_model("core", "Technician")

    for technician in Technician.objects.all().iterator():
        technician.is_available = False
        technician.save(update_fields=["is_available"])


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0028_technician_availability_timestamps"),
    ]

    operations = [
        migrations.AlterField(
            model_name="technician",
            name="is_available",
            field=models.BooleanField(default=False),
        ),
        migrations.CreateModel(
            name="TechnicianActivityLog",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "action_type",
                    models.CharField(
                        choices=[
                            ("check_in", "Check In"),
                            ("check_out", "Check Out"),
                            ("ticket_accepted", "Ticket Accepted"),
                            ("ticket_solved", "Ticket Solved"),
                            ("ticket_escalated", "Ticket Escalated"),
                            ("asset_request_submitted", "Asset Request Submitted"),
                        ],
                        max_length=40,
                    ),
                ),
                ("description", models.CharField(blank=True, default="", max_length=255)),
                ("occurred_at", models.DateTimeField(default=timezone.now)),
                ("ended_at", models.DateTimeField(blank=True, null=True)),
                ("duration_minutes", models.PositiveIntegerField(blank=True, null=True)),
                ("metadata", models.JSONField(blank=True, default=dict)),
                (
                    "consumable_request",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="technician_activity_logs",
                        to="core.consumablerequest",
                    ),
                ),
                (
                    "technician",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="activity_logs",
                        to="core.technician",
                    ),
                ),
                (
                    "ticket",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="technician_activity_logs",
                        to="core.ticket",
                    ),
                ),
            ],
            options={
                "db_table": "technician_activity_logs",
                "ordering": ["-occurred_at", "-id"],
            },
        ),
        migrations.AddIndex(
            model_name="technicianactivitylog",
            index=models.Index(fields=["technician", "occurred_at"], name="tech_act_techn_occ_idx"),
        ),
        migrations.AddIndex(
            model_name="technicianactivitylog",
            index=models.Index(fields=["action_type", "occurred_at"], name="tech_act_type_occ_idx"),
        ),
        migrations.AddIndex(
            model_name="technicianactivitylog",
            index=models.Index(fields=["ticket", "occurred_at"], name="tech_act_ticket_occ_idx"),
        ),
        migrations.RunPython(reset_technician_availability, migrations.RunPython.noop),
    ]
