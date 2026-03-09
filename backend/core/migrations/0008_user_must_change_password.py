from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0007_user_branch"),
    ]

    operations = [
        migrations.AddField(
            model_name="user",
            name="must_change_password",
            field=models.BooleanField(default=False),
        ),
    ]
