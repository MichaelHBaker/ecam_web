# Generated by Django 5.1.1 on 2025-01-04 23:45

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('main', '0006_measurement_unique_measurement_name_per_location'),
    ]

    operations = [
        migrations.CreateModel(
            name='MeasurementType',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=50, unique=True)),
                ('display_name', models.CharField(max_length=100)),
                ('unit', models.CharField(max_length=10)),
                ('description', models.TextField(blank=True)),
            ],
        ),
    ]
