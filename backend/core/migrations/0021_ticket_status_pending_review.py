
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0020_technician_skillset_strict_choices"),
    ]

    operations = [
        migrations.AlterField(
            model_name="ticket",
            name="status",
            field=models.CharField(
                choices=[
                    ("Pending", "Pending"),
                    ("In Progress", "In Progress"),
                    ("Pending Review", "Pending Review"),
                    ("Solved", "Solved"),
                ],
                default="Pending",
                max_length=30,
            ),
        ),
    ]
