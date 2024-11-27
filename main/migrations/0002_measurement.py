# Generated by Django 5.1.1 on 2024-11-26 22:52

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('main', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='Measurement',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=100)),
                ('description', models.TextField(blank=True)),
                ('measurement_type', models.CharField(choices=[('power', 'Power (kW)'), ('temperature', 'Temperature (°F)'), ('pressure', 'Pressure (PSI)')], max_length=20)),
                ('location', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='measurement', to='main.location')),
            ],
        ),
    ]
