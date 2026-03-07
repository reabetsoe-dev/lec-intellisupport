from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0004_notification"),
    ]

    operations = [
        migrations.CreateModel(
            name="TicketMaterialRequest",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("item_name", models.CharField(max_length=120)),
                ("quantity", models.PositiveIntegerField(default=1)),
                ("notes", models.TextField(blank=True, default="")),
                (
                    "status",
                    models.CharField(
                        choices=[("pending", "Pending"), ("approved", "Approved"), ("rejected", "Rejected")],
                        default="pending",
                        max_length=20,
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "requested_by",
                    models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="ticket_material_requests", to="core.user"),
                ),
                (
                    "ticket",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="material_requests", to="core.ticket"),
                ),
            ],
            options={"db_table": "ticket_material_requests"},
        ),
    ]
