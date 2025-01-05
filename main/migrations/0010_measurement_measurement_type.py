# Generated by Django 5.1.1 on 2025-01-05 01:18

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('main', '0009_remove_measurement_measurement_type'),
    ]

    operations = [
        migrations.AddField(
            model_name='measurement',
            name='measurement_type',
            field=models.ForeignKey(default=1, on_delete=django.db.models.deletion.PROTECT, to='main.measurementtype'),
            preserve_default=False,
        ),
    ]
