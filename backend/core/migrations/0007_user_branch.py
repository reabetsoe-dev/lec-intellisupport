from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0006_expand_consumable_asset_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="branch",
            field=models.CharField(blank=True, default="", max_length=120),
        ),
    ]
