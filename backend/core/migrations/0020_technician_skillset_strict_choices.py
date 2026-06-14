
from django.db import migrations, models


def _normalize_skillset(raw_skillset: str) -> str:
    value = str(raw_skillset or "").strip().lower()
    if value == "network":
        return "Network"
    if value == "software":
        return "Software"
    if value == "hardware":
        return "Hardware"

    network_keywords = (
        "network",
        "internet",
        "vpn",
        "wifi",
        "wi-fi",
        "dns",
        "router",
        "switch",
        "scada",
    )
    hardware_keywords = (
        "hardware",
        "endpoint",
        "laptop",
        "desktop",
        "printer",
        "metering",
        "distribution",
        "line",
        "substation",
        "keyboard",
        "mouse",
        "monitor",
    )
    software_keywords = (
        "software",
        "application",
        "system",
        "systems",
        "password",
        "account",
        "email",
        "outlook",
        "security",
        "cyber",
    )

    if any(keyword in value for keyword in network_keywords):
        return "Network"
    if any(keyword in value for keyword in software_keywords):
        return "Software"
    if any(keyword in value for keyword in hardware_keywords):
        return "Hardware"

    return "Software"


def forwards(apps, schema_editor):
    Technician = apps.get_model("core", "Technician")
    for technician in Technician.objects.all().iterator():
        normalized = _normalize_skillset(getattr(technician, "skillset", ""))
        if technician.skillset != normalized:
            technician.skillset = normalized
            technician.save(update_fields=["skillset"])


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0019_ticket_reporter_reviewed_problem"),
    ]

    operations = [
        migrations.RunPython(forwards, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="technician",
            name="skillset",
            field=models.CharField(
                choices=[("Network", "Network"), ("Software", "Software"), ("Hardware", "Hardware")],
                max_length=20,
            ),
        ),
    ]
