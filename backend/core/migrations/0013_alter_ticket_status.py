
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0012_seed_consumable_inventory_data'),
    ]

    operations = [
        migrations.AlterField(
            model_name='ticket',
            name='status',
            field=models.CharField(choices=[('Pending', 'Pending'), ('In Process', 'In Process'), ('Solved', 'Solved')], default='Pending', max_length=30),
        ),
    ]
