from django.db import models
from django.core.exceptions import ValidationError
from django.contrib.auth.models import User
from django.db.models import Q, F
from django.db.models import Exists, OuterRef

from datetime import datetime
from typing import Dict, Any
import pytz
from zoneinfo import ZoneInfo

class MeasurementCategory(models.Model):
    """Top level categories like Pressure, Flow, Temperature"""
    name = models.CharField(max_length=50, unique=True)
    display_name = models.CharField(max_length=100)
    description = models.TextField(blank=True)

    def __str__(self):
        return self.display_name

    class Meta:
        verbose_name_plural = "Measurement Categories"

class MeasurementType(models.Model):
    """Types within categories, e.g., Absolute Pressure within Pressure"""
    MULTIPLIER_CHOICES = [
        ('p', 'pico'),    # 10^-12
        ('n', 'nano'),    # 10^-9
        ('µ', 'micro'),   # 10^-6
        ('m', 'milli'),   # 10^-3
        ('', 'base'),     # 10^0
        ('k', 'kilo'),    # 10^3
        ('M', 'mega'),    # 10^6
        ('G', 'giga'),    # 10^9
        ('T', 'tera'),    # 10^12
    ]

    category = models.ForeignKey(
        MeasurementCategory,
        on_delete=models.PROTECT,
        related_name='types'
    )
    name = models.CharField(max_length=100)
    description = models.TextField()
    supports_multipliers = models.BooleanField(
        default=True,
        help_text="Whether this type supports SI multipliers"
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['category', 'name'],
                name='unique_type_per_category'
            )
        ]

    def __str__(self):
        return f"{self.category.name} - {self.name}"
    
class MeasurementUnit(models.Model):
    """Units valid for specific types, e.g., Pascal for Absolute Pressure"""
    type = models.ForeignKey(
        MeasurementType,
        on_delete=models.PROTECT,
        related_name='units'
    )
    name = models.CharField(max_length=50)
    description = models.TextField(blank=True)
    conversion_factor = models.FloatField(
        default=1.0,
        help_text="Conversion factor to type's base unit"
    )
    is_base_unit = models.BooleanField(
        default=False,
        help_text="Whether this is the base unit for its type"
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['type', 'name'],
                name='unique_unit_name_per_type'
            ),
            models.UniqueConstraint(
                fields=['type'],
                condition=models.Q(is_base_unit=True),
                name='unique_base_unit_per_type'
            )
        ]

    def __str__(self):
        return self.name

    def clean(self):
        super().clean()
        if self.is_base_unit:
            existing_base = MeasurementUnit.objects.filter(
                type=self.type,
                is_base_unit=True
            )
            if self.pk:
                existing_base = existing_base.exclude(pk=self.pk)
            if existing_base.exists():
                raise ValidationError({
                    'is_base_unit': f'{self.type} already has a base unit'
                })

            
class Location(models.Model):
   project = models.ForeignKey(
       'Project',
       on_delete=models.CASCADE,
       related_name='locations'
   )
   name = models.CharField(max_length=100)
   address = models.TextField()
   latitude = models.DecimalField(
       max_digits=9,
       decimal_places=6,
       null=True,
       blank=True
   )
   longitude = models.DecimalField(
       max_digits=9,
       decimal_places=6,
       null=True,
       blank=True
   )

   def __str__(self):
       return f"{self.name} - Project: {self.project.name}"
   
class Measurement(models.Model):
    """Individual measurement points"""
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    location = models.ForeignKey(
        'Location',
        on_delete=models.CASCADE,
        related_name='measurements'
    )
    type = models.ForeignKey(
        MeasurementType,
        on_delete=models.PROTECT,
        related_name='measurements'
    )
    unit = models.ForeignKey(
        MeasurementUnit,
        on_delete=models.PROTECT,
        help_text="Unit for this measurement"
    )
    multiplier = models.CharField(
        max_length=2,
        choices=MeasurementType.MULTIPLIER_CHOICES,
        null=True,
        blank=True,
        help_text="SI multiplier for the measurement (if supported by type)"
    )
    source_timezone = models.CharField(
        max_length=50,
        choices=[(tz, tz) for tz in pytz.all_timezones],
        default='UTC',
        help_text="Timezone of the incoming data"
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['name', 'location'],
                name='unique_measurement_name_per_location'
            )
        ]

    def __str__(self):
        return f"{self.name} - {self.location.name}"

    def clean(self):
        super().clean()
        # Validate that unit belongs to measurement type
        if self.unit and self.type and self.unit.type != self.type:
            raise ValidationError({
                'unit': f'Unit must belong to measurement type {self.type}'
            })
        
        # Validate multiplier if present
        if self.multiplier and not self.type.supports_multipliers:
            raise ValidationError({
                'multiplier': f'Measurement type {self.type} does not support multipliers'
            })


class Project(models.Model):
    PROJECT_TYPES = [
        ('Audit', 'Audit'),
        ('M&V', 'Measurement & Verification'),
    ]

    name = models.CharField(max_length=100)
    project_type = models.CharField(max_length=20, choices=PROJECT_TYPES)
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)

    def __str__(self):
        return f"{self.name} ({self.get_project_type_display()})"

    def clean(self):
        super().clean()
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValidationError({
                'end_date': 'End date cannot be before start date'
            })
        
class DataSource(models.Model):
   """Base model for all data sources"""
   SOURCE_TYPES = [
       ('file', 'File Upload'),
       ('api', 'API Connection'),
       ('db', 'Database Connection'),
   ]
   
   MIDDLEWARE_TYPES = [
       ('niagara', 'Niagara AX/N4'),
       ('ecostruxure', 'EcoStruxure Building'),
       ('metasys', 'Johnson Controls Metasys'),
       ('desigo', 'Siemens Desigo CC'),
       ('custom', 'Custom API'),
   ]

   AUTH_TYPES = [
       ('basic', 'Basic Auth'),
       ('bearer', 'Bearer Token'),
       ('oauth2', 'OAuth 2.0'),
       ('cert', 'Client Certificate'),
   ]

   name = models.CharField(max_length=100)
   description = models.TextField(blank=True)
   source_type = models.CharField(max_length=20, choices=SOURCE_TYPES)
   middleware_type = models.CharField(
       max_length=20, 
       choices=MIDDLEWARE_TYPES,
       null=True,
       blank=True
   )
   auth_type = models.CharField(
       max_length=20,
       choices=AUTH_TYPES,
       null=True,
       blank=True
   )
   url_base = models.URLField(null=True, blank=True)
   connection_config = models.JSONField(default=dict)
   created_at = models.DateTimeField(auto_now_add=True)
   updated_at = models.DateTimeField(auto_now=True)
   is_active = models.BooleanField(default=True)

   def __str__(self):
       return f"{self.name} ({self.get_source_type_display()})"

   def clean(self):
       if self.source_type == 'api':
           if not self.middleware_type:
               raise ValidationError('Middleware type required for API sources')
           if not self.auth_type:
               raise ValidationError('Auth type required for API sources')
           if not self.url_base:
               raise ValidationError('URL required for API sources')
           
class DataSourceLocation(models.Model):
   """Many-to-many relationship between DataSources and Locations"""
   data_source = models.ForeignKey(
       DataSource,
       on_delete=models.CASCADE,
       related_name='location_links'
   )
   location = models.ForeignKey(
       'Location',
       on_delete=models.CASCADE,
       related_name='source_links'
   )
   
   class Meta:
       unique_together = ['data_source', 'location']

   def __str__(self):
       return f"{self.data_source.name} -> {self.location.name}"

class Dataset(models.Model):
   """Represents a specific set of data from a source"""
   data_source = models.ForeignKey(
       DataSource,
       on_delete=models.CASCADE,
       related_name='datasets'
   )
   name = models.CharField(max_length=255)
   description = models.TextField(blank=True)
   source_timezone = models.CharField(
       max_length=50,
       choices=[(tz, tz) for tz in pytz.all_timezones],
       help_text="Timezone of source data"
   )
   import_config = models.JSONField(
       default=dict,
       help_text="Dataset-specific import settings"
   )
   created_at = models.DateTimeField(auto_now_add=True)
   updated_at = models.DateTimeField(auto_now=True)

   class Meta:
       constraints = [
           models.UniqueConstraint(
               fields=['data_source', 'name'],
               name='unique_dataset_name_per_source'
           )
       ]

   def __str__(self):
       return f"{self.name} ({self.data_source.name})"

   def assemble_timestamp(self, components: Dict[str, Any]) -> datetime:
       """Assemble timestamp from components using dataset timezone"""
       if 'timestamp' in components:
           if isinstance(components['timestamp'], datetime):
               ts = components['timestamp']
           else:
               format_string = self.import_config.get('timestamp_format')
               if format_string:
                   ts = datetime.strptime(components['timestamp'], format_string)
               else:
                   ts = datetime.fromisoformat(components['timestamp'])
           
           if ts.tzinfo is None:
               ts = ts.replace(tzinfo=ZoneInfo(self.source_timezone))
           return ts.astimezone(ZoneInfo('UTC'))

       if 'date' in components:
           date_str = components['date']
           time_str = components.get('time', '00:00:00')
           format_string = self.import_config.get('date_format')
           if format_string:
               ts = datetime.strptime(f"{date_str} {time_str}", format_string)
           else:
               ts = datetime.fromisoformat(f"{date_str}T{time_str}")
           ts = ts.replace(tzinfo=ZoneInfo(self.source_timezone))
           return ts.astimezone(ZoneInfo('UTC'))

       year = components.get('year')
       month = components.get('month')
       day = components.get('day')
       hour = components.get('hour', 0)
       minute = components.get('minute', 0)
       second = components.get('second', 0)
       microsecond = components.get('microsecond', 0)

       if not all(x is not None for x in [year, month, day]):
           raise ValueError("Must provide at least year, month, and day")

       ts = datetime(
           year=int(year),
           month=int(month),
           day=int(day),
           hour=int(hour),
           minute=int(minute),
           second=int(second),
           microsecond=int(microsecond),
           tzinfo=ZoneInfo(self.source_timezone)
       )
       
       return ts.astimezone(ZoneInfo('UTC'))

class SourceColumn(models.Model):
   """Defines a column in the dataset"""
   TIMESTAMP_ROLES = [
       ('timestamp', 'Complete Timestamp'),
       ('date', 'Complete Date'),
       ('time', 'Complete Time'),
       ('year', 'Year'),
       ('month', 'Month'),
       ('day', 'Day'),
       ('hour', 'Hour'),
       ('minute', 'Minute'),
       ('second', 'Second'),
       ('microsecond', 'Microsecond'),
   ]

   dataset = models.ForeignKey(
       Dataset,
       on_delete=models.CASCADE,
       related_name='columns'
   )
   name = models.CharField(max_length=255)
   position = models.IntegerField()
   data_type = models.CharField(max_length=50)
   timestamp_role = models.CharField(
       max_length=20,
       choices=TIMESTAMP_ROLES,
       null=True,
       blank=True
   )
   sample_data = models.JSONField(default=list)
   header_rows = models.JSONField(default=list)

   class Meta:
       ordering = ['position']
       constraints = [
           models.UniqueConstraint(
               fields=['dataset', 'position'],
               name='unique_column_position_per_dataset'
           )
       ]

   def __str__(self):
       role = f" ({self.get_timestamp_role_display()})" if self.timestamp_role else ""
       return f"{self.name}{role} - {self.dataset.name}"
   

class ColumnMapping(models.Model):
    """Maps source columns to measurements"""
    source_column = models.ForeignKey(
        SourceColumn,
        on_delete=models.CASCADE,
        related_name='mappings'
    )
    measurement = models.ForeignKey(
        'Measurement',
        on_delete=models.CASCADE,
        related_name='column_mappings'
    )
    transform_config = models.JSONField(default=dict)
    validation_rules = models.JSONField(default=dict)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['source_column', 'measurement'],
                name='unique_source_column_measurement'
            )
        ]

    def __str__(self):
        return f"{self.source_column.name} -> {self.measurement.name}"

    def clean(self):
        super().clean()
        if not self.source_column_id or not self.measurement_id:
            return  # Skip validation if either field is not set
            
        # Validate that the data source is linked to the measurement location
        location_link_exists = DataSourceLocation.objects.filter(
            data_source=self.source_column.dataset.data_source,
            location=self.measurement.location
        ).exists()
        
        if not location_link_exists:
            raise ValidationError({
                'measurement': 'The data source must be linked to the measurement location'
            })
        
        # Additional validation for transform_config if needed
        if self.transform_config and not isinstance(self.transform_config, dict):
            raise ValidationError({
                'transform_config': 'Transform configuration must be a valid JSON object'
            })
            
        # Additional validation for validation_rules if needed
        if self.validation_rules and not isinstance(self.validation_rules, dict):
            raise ValidationError({
                'validation_rules': 'Validation rules must be a valid JSON object'
            })
        
class DataImport(models.Model):
   """Tracks individual import attempts"""
   IMPORT_STATUS = [
       ('pending', 'Pending'),
       ('analyzing', 'Analyzing Source'),
       ('configuring', 'Awaiting Configuration'),
       ('validated', 'Configuration Validated'),
       ('in_progress', 'Import In Progress'),
       ('completed', 'Completed'),
       ('failed', 'Failed'),
       ('partially_completed', 'Partially Completed With Errors'),
   ]

   dataset = models.ForeignKey(
       Dataset,
       on_delete=models.CASCADE,
       related_name='imports'
   )
   status = models.CharField(
       max_length=20, 
       choices=IMPORT_STATUS,
       default='pending'
   )
   started_at = models.DateTimeField(auto_now_add=True)
   completed_at = models.DateTimeField(null=True)
   total_rows = models.IntegerField(default=0)
   processed_rows = models.IntegerField(default=0)
   error_count = models.IntegerField(default=0)
   success_count = models.IntegerField(default=0)
   start_time = models.DateTimeField(null=True, blank=True)
   end_time = models.DateTimeField(null=True, blank=True)
   statistics = models.JSONField(default=dict)
   error_log = models.JSONField(default=list)
   processing_log = models.JSONField(default=list)
   created_by = models.ForeignKey(
       User,
       on_delete=models.CASCADE,
       null=True,
       related_name='created_imports'
   )
   approved_by = models.ForeignKey(
       User,
       on_delete=models.CASCADE,
       null=True,
       related_name='approved_imports'
   )

   class Meta:
       ordering = ['-started_at']

   def __str__(self):
       return f"Import {self.id} - {self.dataset.name} ({self.status})"

   @property
   def progress_percentage(self):
        if self.total_rows == 0:
            return 0  # Avoid division by zero
        return round((self.processed_rows / self.total_rows) * 100, 1)

class ImportBatch(models.Model):
   """Tracks individual batches within an import"""
   data_import = models.ForeignKey(
       DataImport,
       on_delete=models.CASCADE,
       related_name='batches'
   )
   batch_number = models.IntegerField()
   start_row = models.IntegerField()
   end_row = models.IntegerField()
   status = models.CharField(
       max_length=20,
       choices=DataImport.IMPORT_STATUS
   )
   error_count = models.IntegerField(default=0)
   success_count = models.IntegerField(default=0)
   processing_time = models.DurationField(null=True)
   error_details = models.JSONField(default=list)
   retry_count = models.IntegerField(default=0)
   last_error = models.TextField(blank=True)

   class Meta:
       ordering = ['batch_number']

   def __str__(self):
       return f"Batch {self.batch_number} of Import {self.data_import.id}"

class TimeSeriesData(models.Model):
   """Time series data storage"""
   timestamp = models.DateTimeField(db_index=True)
   measurement = models.ForeignKey(
       'Measurement',
       on_delete=models.CASCADE,
       related_name='timeseries'
   )
   value = models.FloatField()

   class Meta:
       constraints = [
           models.UniqueConstraint(
               fields=['timestamp', 'measurement'],
               name='unique_measurement_timestamp'
           )
       ]
       indexes = [
           models.Index(fields=['measurement', 'timestamp'])
       ]
       ordering = ['-timestamp']

   def __str__(self):
       return f"{self.measurement}: {self.value} at {self.timestamp}"
   
