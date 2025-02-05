# main/admin.py
from django.contrib import admin
from django.contrib import messages
from .models import (
   Project, Location, Measurement, MeasurementCategory,
   MeasurementType, MeasurementUnit, DataSource, Dataset,
   DataSourceLocation, SourceColumn, ColumnMapping,
   DataImport, ImportBatch, TimeSeriesData
)

@admin.register(MeasurementCategory)
class MeasurementCategoryAdmin(admin.ModelAdmin):
   list_display = ('display_name', 'name')
   search_fields = ('name', 'display_name', 'description')

@admin.register(MeasurementType)
class MeasurementTypeAdmin(admin.ModelAdmin):
   list_display = ('name', 'category', 'supports_multipliers')
   list_filter = ('category', 'supports_multipliers')
   search_fields = ('name', 'description')

@admin.register(MeasurementUnit)
class MeasurementUnitAdmin(admin.ModelAdmin):
   list_display = ('name', 'type', 'is_base_unit', 'conversion_factor')
   list_filter = ('type__category', 'type', 'is_base_unit')
   search_fields = ('name', 'type__name')

@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
   list_display = ('name', 'project_type', 'start_date', 'end_date')
   list_filter = ('project_type',)
   search_fields = ('name',)

@admin.register(Location)
class LocationAdmin(admin.ModelAdmin):
   list_display = ('name', 'project', 'address')
   list_filter = ('project',)
   search_fields = ('name', 'address')
   raw_id_fields = ('project',)

@admin.register(Measurement)
class MeasurementAdmin(admin.ModelAdmin):
   list_display = ('name', 'get_category', 'type', 'unit', 'multiplier', 'location', 'get_project')
   list_filter = ('type__category', 'type', 'location__project')
   search_fields = ('name', 'description')
   raw_id_fields = ('location', 'type', 'unit')

   def get_category(self, obj):
       return obj.type.category
   get_category.short_description = 'Category'
   get_category.admin_order_field = 'type__category'

   def get_project(self, obj):
       return obj.location.project
   get_project.short_description = 'Project'
   get_project.admin_order_field = 'location__project'

@admin.register(DataSource)
class DataSourceAdmin(admin.ModelAdmin):
   list_display = ('name', 'source_type', 'middleware_type', 'is_active', 'created_at')
   list_filter = ('source_type', 'middleware_type', 'is_active')
   search_fields = ('name', 'description')
   readonly_fields = ('created_at', 'updated_at')

@admin.register(Dataset)
class DatasetAdmin(admin.ModelAdmin):
   list_display = ('name', 'data_source', 'source_timezone', 'created_at')
   list_filter = ('data_source', 'source_timezone')
   search_fields = ('name', 'description')
   raw_id_fields = ('data_source',)
   readonly_fields = ('created_at', 'updated_at')

@admin.register(DataSourceLocation)
class DataSourceLocationAdmin(admin.ModelAdmin):
   list_display = ('data_source', 'location')
   list_filter = ('data_source', 'location')
   raw_id_fields = ('data_source', 'location')

class SourceColumnInline(admin.TabularInline):
   model = SourceColumn
   extra = 0
   fields = ('name', 'position', 'data_type', 'timestamp_role')

@admin.register(SourceColumn)
class SourceColumnAdmin(admin.ModelAdmin):
   list_display = ('name', 'dataset', 'position', 'data_type', 'timestamp_role')
   list_filter = ('dataset', 'data_type', 'timestamp_role')
   search_fields = ('name', 'dataset__name')
   raw_id_fields = ('dataset',)

@admin.register(ColumnMapping)
class ColumnMappingAdmin(admin.ModelAdmin):
   list_display = ('source_column', 'measurement', 'get_transform_config')
   list_filter = ('source_column__dataset', 'measurement__type')
   search_fields = ('source_column__name', 'measurement__name')
   raw_id_fields = ('source_column', 'measurement')

   def get_transform_config(self, obj):
       return ', '.join(f"{k}={v}" for k, v in obj.transform_config.items())
   get_transform_config.short_description = 'Transformations'

class ImportBatchInline(admin.TabularInline):
   model = ImportBatch
   extra = 0
   readonly_fields = ('batch_number', 'start_row', 'end_row', 'status',
                     'error_count', 'success_count', 'processing_time')


@admin.register(DataImport)
class DataImportAdmin(admin.ModelAdmin):
    list_display = ('id', 'dataset', 'status', 'started_at', 'processed_rows',
                   'total_rows', 'error_count', 'created_by')
    list_filter = ('status', 'dataset')
    search_fields = ('dataset__name',)
    raw_id_fields = ('dataset', 'created_by', 'approved_by')
    readonly_fields = ('started_at', 'completed_at', 'processed_rows',
                      'total_rows', 'error_count', 'success_count',
                      'error_log', 'processing_log')
    inlines = [ImportBatchInline]

    def delete_model(self, request, obj):
        """Warns admin before deleting a DataImport."""
        messages.warning(request, f"Warning: Deleting this import will remove all related data.")
        super().delete_model(request, obj)


@admin.register(TimeSeriesData)
class TimeSeriesDataAdmin(admin.ModelAdmin):
   list_display = ('timestamp', 'measurement', 'value')
   list_filter = ('measurement__type__category', 'measurement__type',
                 'measurement__location__project', 'timestamp')
   search_fields = ('measurement__name',)
   raw_id_fields = ('measurement',)
   date_hierarchy = 'timestamp'