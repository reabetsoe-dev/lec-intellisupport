
from django.db import migrations, models


def forwards(apps, schema_editor):
    Technician = apps.get_model("core", "Technician")
    for technician in Technician.objects.all().iterator():
        current = str(getattr(technician, "skillset", "") or "").strip()
        lower = current.lower()
        if "security" in lower or "cyber" in lower:
            if technician.skillset != "Security":
                technician.skillset = "Security"
                technician.save(update_fields=["skillset"])


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0021_ticket_status_pending_review"),
    ]

    operations = [
        migrations.RunPython(forwards, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="technician",
            name="skillset",
            field=models.CharField(
                choices=[
                    ("Network", "Network"),
                    ("Software", "Software"),
                    ("Hardware", "Hardware"),
                    ("Security", "Security"),
                ],
                max_length=20,
            ),
        ),
    ]
