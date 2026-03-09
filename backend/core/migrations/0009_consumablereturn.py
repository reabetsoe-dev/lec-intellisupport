from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0008_user_must_change_password"),
    ]

    operations = [
        migrations.CreateModel(
            name="ConsumableReturn",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("quantity", models.PositiveIntegerField(default=1)),
                ("reason", models.TextField(blank=True, default="")),
                (
                    "status",
                    models.CharField(
                        choices=[("pending", "Pending"), ("received", "Received"), ("rejected", "Rejected")],
                        default="pending",
                        max_length=20,
                    ),
                ),
                ("received_at", models.DateTimeField(blank=True, null=True)),
                ("rejected_at", models.DateTimeField(blank=True, null=True)),
                ("rejection_reason", models.TextField(blank=True, default="")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "consumable",
                    models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="return_requests", to="core.consumable"),
                ),
                (
                    "consumable_request",
                    models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="return_requests", to="core.consumablerequest"),
                ),
                (
                    "employee",
                    models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="consumable_returns", to="core.user"),
                ),
                (
                    "received_by",
                    models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="received_consumable_returns", to="core.user"),
                ),
                (
                    "rejected_by",
                    models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="rejected_consumable_returns", to="core.user"),
                ),
            ],
            options={
                "db_table": "consumable_returns",
            },
        ),
    ]
