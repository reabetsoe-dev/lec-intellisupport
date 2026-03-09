from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0009_consumablereturn"),
    ]

    operations = [
        migrations.AddField(
            model_name="consumablerequest",
            name="assignment_type",
            field=models.CharField(
                choices=[("new", "New"), ("loan", "Loan"), ("exchange", "Exchange")],
                default="new",
                max_length=20,
            ),
        ),
    ]
