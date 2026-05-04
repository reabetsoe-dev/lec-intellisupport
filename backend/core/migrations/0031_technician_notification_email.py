from django.db import migrations, models


def seed_technician_notification_emails(apps, schema_editor):
    Technician = apps.get_model("core", "Technician")

    notification_emails_by_login = {
        "palesa.mokopotsa@lec.com": "apmokopotsa1@gmail.com",
        "technician2@lec.com": "apmokopotsa1@gmail.com",
        "reabetsoe.sephekola@lec.com": "reabetsoesephekola@gmail.com",
        "technician3@lec.com": "reabetsoesephekola@gmail.com",
    }
    notification_emails_by_name = {
        "palesa mokopotsa": "apmokopotsa1@gmail.com",
        "reabetsoe sephekola": "reabetsoesephekola@gmail.com",
    }

    for technician in Technician.objects.select_related("user").all():
        user = technician.user
        login_email = str(getattr(user, "email", "") or "").strip().lower()
        display_name = str(getattr(user, "name", "") or "").strip().lower()
        notification_email = (
            notification_emails_by_login.get(login_email)
            or notification_emails_by_name.get(display_name)
        )
        if notification_email and technician.notification_email != notification_email:
            technician.notification_email = notification_email
            technician.save(update_fields=["notification_email"])


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0030_merge_20260422_0001"),
    ]

    operations = [
        migrations.AddField(
            model_name="technician",
            name="notification_email",
            field=models.EmailField(blank=True, default="", max_length=254),
        ),
        migrations.RunPython(
            seed_technician_notification_emails,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
