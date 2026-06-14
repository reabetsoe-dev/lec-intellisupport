
from django.db import migrations, models


TECHNICIAN_BRANCH = "Maseru HQ"
TECHNICIAN_DEPARTMENT = "IT"


def forwards(apps, schema_editor):
    User = apps.get_model("core", "User")
    Technician = apps.get_model("core", "Technician")

    User.objects.filter(role="technician").exclude(branch=TECHNICIAN_BRANCH).update(branch=TECHNICIAN_BRANCH)
    Technician.objects.exclude(department=TECHNICIAN_DEPARTMENT).update(department=TECHNICIAN_DEPARTMENT)


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0022_technician_skillset_add_security"),
    ]

    operations = [
        migrations.AddField(
            model_name="technician",
            name="department",
            field=models.CharField(choices=[("IT", "IT")], default="IT", max_length=20),
        ),
        migrations.RunPython(forwards, migrations.RunPython.noop),
    ]
