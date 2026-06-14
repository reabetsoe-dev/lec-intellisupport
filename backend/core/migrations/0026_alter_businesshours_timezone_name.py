
from django.db import migrations, models


def set_maseru_timezone(apps, schema_editor):
    BusinessHours = apps.get_model("core", "BusinessHours")
    BusinessHours.objects.exclude(timezone_name="Africa/Maseru").update(timezone_name="Africa/Maseru")


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0025_businessleave'),
    ]

    operations = [
        migrations.AlterField(
            model_name='businesshours',
            name='timezone_name',
            field=models.CharField(default='Africa/Maseru', max_length=64),
        ),
        migrations.RunPython(set_maseru_timezone, migrations.RunPython.noop),
    ]
