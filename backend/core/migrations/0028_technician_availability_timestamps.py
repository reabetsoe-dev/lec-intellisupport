from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0027_merge_20260420_0001"),
    ]

    operations = [
        migrations.AddField(
            model_name="technician",
            name="availability_updated_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="technician",
            name="last_check_in_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="technician",
            name="last_check_out_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
