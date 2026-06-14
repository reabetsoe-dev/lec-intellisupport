
from django.db import migrations, models


def migrate_status_forward(apps, schema_editor):
    Ticket = apps.get_model("core", "Ticket")
    Ticket.objects.filter(status__iexact="In Process").update(status="In Progress")


def migrate_status_backward(apps, schema_editor):
    Ticket = apps.get_model("core", "Ticket")
    Ticket.objects.filter(status__iexact="In Progress").update(status="In Process")


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0014_merge_20260319_0204"),
    ]

    operations = [
        migrations.RunPython(migrate_status_forward, migrate_status_backward),
        migrations.AlterField(
            model_name="ticket",
            name="status",
            field=models.CharField(
                choices=[("Pending", "Pending"), ("In Progress", "In Progress"), ("Solved", "Solved")],
                default="Pending",
                max_length=30,
            ),
        ),
    ]
