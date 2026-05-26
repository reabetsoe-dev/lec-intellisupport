from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0031_technician_notification_email"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="department",
            field=models.CharField(blank=True, default="", max_length=120),
        ),
    ]
