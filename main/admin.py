# main/admin.py
from django.contrib import admin
from .models import Project, Location, Measurement

@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ('name', 'project_type', 'start_date', 'end_date')
    list_filter = ('project_type',)
    search_fields = ('name',)

@admin.register(Location)
class LocationAdmin(admin.ModelAdmin):
    list_display = ('name', 'project', 'address', 'parent')
    list_filter = ('project',)
    search_fields = ('name', 'address')
    raw_id_fields = ('project', 'parent')

@admin.register(Measurement)
class MeasurementAdmin(admin.ModelAdmin):
    list_display = ('name', 'location', 'measurement_type')
    list_filter = ('measurement_type', 'location')
    search_fields = ('name', 'description')
    raw_id_fields = ('location',)