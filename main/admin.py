from django.contrib import admin
from django.contrib import messages
from .models import (
    Project, Location, Measurement, MeasurementCategory,
    MeasurementType, MeasurementUnit, DataSource, Dataset,
    DataSourceLocation, SourceColumn, ColumnMapping,
    DataImport, ImportBatch, TimeSeriesData, DataCopyGrant,
    ProjectAccess
)

@admin.register(ProjectAccess)
class ProjectAccessAdmin(admin.ModelAdmin):
    list_display = ('user', 'project', 'granted_by', 'granted_at', 'revoked_at')
    list_filter = ('project', 'user', 'granted_by', 'revoked_at')
    search_fields = ('user__username', 'project__name')
    raw_id_fields = ('user', 'project', 'granted_by')
    readonly_fields = ('granted_at',)
    date_hierarchy = 'granted_at'

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
    list_display = ('name', 'owner', 'project_type', 'start_date', 'end_date')
    list_filter = ('project_type', 'owner')
    search_fields = ('name',)
    raw_id_fields = ('owner',)

@admin.register(Location)
class LocationAdmin(admin.ModelAdmin):
    list_display = ('name', 'project', 'get_owner', 'address', 'latitude', 'longitude')
    list_filter = ('project__owner', 'project')
    search_fields = ('name', 'address')
    raw_id_fields = ('project',)

    def get_owner(self, obj):
        return obj.project.owner
    get_owner.short_description = 'Owner'
    get_owner.admin_order_field = 'project__owner'

@admin.register(Measurement)
class MeasurementAdmin(admin.ModelAdmin):
    list_display = ('name', 'get_owner', 'get_category', 'type', 'unit', 
                   'multiplier', 'location', 'get_project', 'source_timezone')
    list_filter = ('type__category', 'type', 'location__project', 
                  'location__project__owner')
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

    def get_owner(self, obj):
        return obj.location.project.owner
    get_owner.short_description = 'Owner'
    get_owner.admin_order_field = 'location__project__owner'

@admin.register(DataSource)
class DataSourceAdmin(admin.ModelAdmin):
    list_display = ('name', 'project', 'created_by', 'source_type', 'middleware_type', 
                   'is_active', 'created_at')
    list_filter = ('source_type', 'middleware_type', 'is_active', 'project__owner')
    search_fields = ('name', 'description')
    readonly_fields = ('created_at', 'updated_at')
    raw_id_fields = ('project', 'created_by')

@admin.register(Dataset)
class DatasetAdmin(admin.ModelAdmin):
    list_display = ('name', 'data_source', 'created_by', 'created_at')
    list_filter = ('created_by', 'data_source__project')
    search_fields = ('name', 'description')
    raw_id_fields = ('data_source', 'created_by')
    readonly_fields = ('created_at', 'updated_at')

@admin.register(DataSourceLocation)
class DataSourceLocationAdmin(admin.ModelAdmin):
    list_display = ('data_source', 'get_data_source_project', 'location', 
                   'get_location_project')
    list_filter = ('data_source__project', 'location__project')
    raw_id_fields = ('data_source', 'location')

    def get_data_source_project(self, obj):
        return obj.data_source.project
    get_data_source_project.short_description = 'Data Source Project'
    get_data_source_project.admin_order_field = 'data_source__project'

    def get_location_project(self, obj):
        return obj.location.project
    get_location_project.short_description = 'Location Project'
    get_location_project.admin_order_field = 'location__project'

@admin.register(SourceColumn)
class SourceColumnAdmin(admin.ModelAdmin):
    list_display = ('name', 'dataset', 'get_created_by', 'position', 'data_type', 
                   'timestamp_role')
    list_filter = ('dataset', 'dataset__created_by', 'data_type', 'timestamp_role')
    search_fields = ('name', 'dataset__name')
    raw_id_fields = ('dataset',)

    def get_created_by(self, obj):
        return obj.dataset.created_by
    get_created_by.short_description = 'Created By'
    get_created_by.admin_order_field = 'dataset__created_by'

@admin.register(ColumnMapping)
class ColumnMappingAdmin(admin.ModelAdmin):
    list_display = ('source_column', 'get_dataset_source', 'measurement', 
                   'get_project', 'get_transform_config')
    list_filter = ('source_column__dataset__data_source', 
                  'measurement__location__project',
                  'measurement__type')
    search_fields = ('source_column__name', 'measurement__name')
    raw_id_fields = ('source_column', 'measurement')

    def get_transform_config(self, obj):
        return ', '.join(f"{k}={v}" for k, v in obj.transform_config.items())
    get_transform_config.short_description = 'Transformations'

    def get_dataset_source(self, obj):
        return obj.source_column.dataset.data_source
    get_dataset_source.short_description = 'Data Source'
    get_dataset_source.admin_order_field = 'source_column__dataset__data_source'

    def get_project(self, obj):
        return obj.measurement.location.project
    get_project.short_description = 'Project'
    get_project.admin_order_field = 'measurement__location__project'

class ImportBatchInline(admin.TabularInline):
    model = ImportBatch
    extra = 0
    readonly_fields = ('batch_number', 'start_row', 'end_row', 'status',
                      'error_count', 'success_count', 'processing_time',
                      'retry_count', 'last_error')

@admin.register(DataImport)
class DataImportAdmin(admin.ModelAdmin):
    list_display = ('id', 'dataset', 'get_project', 'status', 'started_at', 
                   'processed_rows', 'total_rows', 'error_count', 
                   'created_by', 'approved_by')
    list_filter = ('status', 'dataset__data_source__project', 'dataset', 
                  'created_by', 'approved_by')
    search_fields = ('dataset__name',)
    raw_id_fields = ('dataset', 'created_by', 'approved_by')
    readonly_fields = ('started_at', 'completed_at', 'processed_rows',
                      'total_rows', 'error_count', 'success_count',
                      'error_log', 'processing_log', 'statistics')
    inlines = [ImportBatchInline]

    def get_project(self, obj):
        return obj.dataset.data_source.project
    get_project.short_description = 'Project'
    get_project.admin_order_field = 'dataset__data_source__project'

    def delete_model(self, request, obj):
        """Warns admin before deleting a DataImport."""
        messages.warning(request, "Warning: Deleting this import will remove all related data.")
        super().delete_model(request, obj)

@admin.register(TimeSeriesData)
class TimeSeriesDataAdmin(admin.ModelAdmin):
    list_display = ('timestamp', 'measurement', 'get_project', 'value', 
                   'get_dataset', 'copied_from')
    list_filter = ('measurement__type__category', 'measurement__type',
                  'measurement__location__project', 'dataset__data_source__project',
                  'timestamp')
    search_fields = ('measurement__name', 'dataset__name')
    raw_id_fields = ('measurement', 'dataset', 'copied_from')
    date_hierarchy = 'timestamp'

    def get_project(self, obj):
        return obj.measurement.location.project
    get_project.short_description = 'Project'
    get_project.admin_order_field = 'measurement__location__project'

    def get_dataset(self, obj):
        return obj.dataset.name
    get_dataset.short_description = 'Dataset'
    get_dataset.admin_order_field = 'dataset__name'

@admin.register(DataCopyGrant)
class DataCopyGrantAdmin(admin.ModelAdmin):
    list_display = ('from_user', 'to_user', 'measurement', 'granted_at', 
                   'start_time', 'end_time', 'granted_by', 'revoked_at')
    list_filter = ('from_user', 'to_user', 'granted_by', 
                  'measurement__location__project')
    search_fields = ('measurement__name', 'from_user__username', 
                    'to_user__username')
    raw_id_fields = ('from_user', 'to_user', 'measurement', 'granted_by')
    readonly_fields = ('granted_at',)
    date_hierarchy = 'granted_at'