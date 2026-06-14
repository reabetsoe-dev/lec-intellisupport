
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0018_merge_20260323_0314"),
    ]

    operations = [
        migrations.AddField(
            model_name="ticket",
            name="reporter_reviewed_problem",
            field=models.BooleanField(default=False),
        ),
    ]
