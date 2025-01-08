# main/admin.py
from django.contrib import admin
from django.utils import timezone
from .models import (
    Project, Location, Measurement, MeasurementType,
    DataSource, APIDataSource, DataSourceMapping,
    TimeSeriesData, DataImport
)

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
    list_display = ('name', 'measurement_type', 'location', 'get_project')
    list_filter = ('measurement_type', 'location__project')
    search_fields = ('name', 'description')
    raw_id_fields = ('location', 'measurement_type')

    def get_project(self, obj):
        return obj.location.project
    get_project.short_description = 'Project'
    get_project.admin_order_field = 'location__project'

@admin.register(MeasurementType)
class MeasurementTypeAdmin(admin.ModelAdmin):
    list_display = ('name', 'display_name', 'unit')
    search_fields = ('name', 'display_name')

@admin.register(DataSource)
class DataSourceAdmin(admin.ModelAdmin):
    list_display = ('name', 'source_type', 'created_at', 'is_active')
    list_filter = ('source_type', 'is_active')
    search_fields = ('name', 'description')
    readonly_fields = ('created_at', 'updated_at')

@admin.register(APIDataSource)
class APIDataSourceAdmin(admin.ModelAdmin):
    list_display = ('name', 'url_base', 'auth_type', 'is_active')
    list_filter = ('auth_type', 'is_active')
    search_fields = ('name', 'description', 'url_base')
    readonly_fields = ('created_at', 'updated_at')

@admin.register(DataSourceMapping)
class DataSourceMappingAdmin(admin.ModelAdmin):
    list_display = ('measurement', 'data_source', 'get_identifiers', 'last_sync')
    list_filter = ('data_source', 'last_sync')
    search_fields = ('measurement__name',)
    raw_id_fields = ('measurement', 'data_source')
    readonly_fields = ('last_sync',)

    def get_identifiers(self, obj):
        return ', '.join(f"{k}={v}" for k, v in obj.source_identifiers.items())
    get_identifiers.short_description = 'Source Identifiers'

@admin.register(TimeSeriesData)
class TimeSeriesDataAdmin(admin.ModelAdmin):
   list_display = ('timestamp', 'get_local_time', 'measurement', 'value', 'get_unit')
   list_filter = (
       'measurement__measurement_type',
       'measurement__location__project',
       'timestamp',
   )
   search_fields = ('measurement__name',)
   raw_id_fields = ('measurement',)
   date_hierarchy = 'timestamp'

   def get_local_time(self, obj):
       return timezone.localtime(obj.timestamp)
   get_local_time.short_description = 'Local Time'
   get_local_time.admin_order_field = 'timestamp'

   def get_unit(self, obj):
       return obj.measurement.unit
   get_unit.short_description = 'Unit'
   get_unit.admin_order_field = 'measurement__measurement_type__unit'

@admin.register(DataImport)
class DataImportAdmin(admin.ModelAdmin):
    list_display = ('id', 'data_source', 'status', 'started_at', 'row_count', 'error_count', 'created_by')
    list_filter = ('status', 'data_source')
    search_fields = ('data_source__name',)
    raw_id_fields = ('data_source', 'created_by', 'approved_by')
    readonly_fields = ('started_at', 'completed_at', 'row_count', 'error_count', 'error_log')


