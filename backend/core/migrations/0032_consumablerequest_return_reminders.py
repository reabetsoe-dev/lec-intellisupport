from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0031_technician_notification_email"),
    ]

    operations = [
        migrations.AddField(
            model_name="consumablerequest",
            name="expected_return_date",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="consumablerequest",
            name="return_reminder_before_sent_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="consumablerequest",
            name="return_reminder_due_sent_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="consumablerequest",
            name="return_reminder_after_sent_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
