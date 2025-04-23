from django.db import models
from django.core.exceptions import ValidationError
from django.contrib.auth.models import User
from django.utils import timezone

from zoneinfo import available_timezones

def get_valid_timezones():
    """Get a list of valid timezones from Python's standard zoneinfo module."""
    return [(tz, tz) for tz in sorted(available_timezones())]

class ProjectAccess(models.Model):
    """Manages user access rights to projects"""
    project = models.ForeignKey(
        'Project',
        on_delete=models.CASCADE,
        related_name='user_access'
    )
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='project_access'
    )
    granted_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        related_name='granted_project_access'
    )
    granted_at = models.DateTimeField(auto_now_add=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['project', 'user'],
                condition=models.Q(revoked_at__isnull=True),
                name='unique_active_project_access'
            )
        ]
        indexes = [
            models.Index(fields=['project', 'user', 'revoked_at']),
            models.Index(fields=['user', 'revoked_at']),
            models.Index(fields=['granted_at', 'revoked_at']),
        ]
        verbose_name = "Project Access"
        verbose_name_plural = "Project Access"

    def clean(self):
        super().clean()
        if self.user == self.project.owner:
            raise ValidationError({
                'user': 'Cannot grant access to project owner'
            })

    def __str__(self):
        return f"{self.user.username} -> {self.project.name}"
    
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

    class Meta:
        indexes = [
            models.Index(fields=['latitude', 'longitude']),
        ]

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
    class ProjectType(models.TextChoices):
        AUDIT = 'Audit', 'Audit'
        MV = 'M&V', 'Measurement & Verification'

    owner = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='owned_projects',
        help_text="User who owns this project"
    )
    name = models.CharField(
        max_length=100,
        help_text="Name of the project"
    )
    project_type = models.CharField(
        max_length=20,
        choices=ProjectType.choices,
        help_text="Type of project"
    )
    start_date = models.DateField(
        null=True,
        blank=True,
        help_text="Project start date"
    )
    end_date = models.DateField(
        null=True,
        blank=True,
        help_text="Project end date"
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['name', 'owner'],
                name='unique_project_name_per_owner'
            )
        ]
        indexes = [
            models.Index(fields=['project_type', 'start_date']),
            models.Index(fields=['start_date', 'end_date']),
        ]
        verbose_name = "Project"
        verbose_name_plural = "Projects"

    def __str__(self):
        return f"{self.name} ({self.get_project_type_display()})"

    def clean(self):
        super().clean()
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValidationError({
                'end_date': 'End date cannot be before start date'
            })

    def grant_access(self, user, granted_by):
        """Grant access to a user"""
        if user == self.owner:
            raise ValidationError('Cannot grant access to project owner')
        return ProjectAccess.objects.create(
            project=self,
            user=user,
            granted_by=granted_by
        )

    def revoke_access(self, user):
        """Revoke user access"""
        if user == self.owner:
            raise ValidationError('Cannot revoke access from project owner')
        access = ProjectAccess.objects.get(
            project=self,
            user=user,
            revoked_at__isnull=True
        )
        access.revoked_at = timezone.now()
        access.save()

    def has_access(self, user):
        """Check if user has access to project"""
        if user == self.owner:
            return True
        return ProjectAccess.objects.filter(
            project=self,
            user=user,
            revoked_at__isnull=True
        ).exists()
            
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

    created_by = models.ForeignKey(
        'auth.User',
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_data_sources',
        help_text="User who created this data source"
    )
    project = models.ForeignKey(
        'Project',
        on_delete=models.CASCADE,
        related_name='data_sources',
        help_text="Project this data source belongs to"
    )
    name = models.CharField(
        max_length=100,
        help_text="Name of the data source"
    )
    description = models.TextField(
        blank=True,
        help_text="Optional description of the data source"
    )
    source_type = models.CharField(
        max_length=20,
        choices=SOURCE_TYPES,
        help_text="Type of data source"
    )
    source_timezone = models.CharField(
        max_length=50,
        choices=get_valid_timezones(),
        default='UTC',
        help_text="Timezone of the incoming data"
    )
    middleware_type = models.CharField(
        max_length=20, 
        choices=MIDDLEWARE_TYPES,
        null=True,
        blank=True,
        help_text="Type of middleware for API connections"
    )
    auth_type = models.CharField(
        max_length=20,
        choices=AUTH_TYPES,
        null=True,
        blank=True,
        help_text="Authentication method for API connections"
    )
    url_base = models.URLField(
        null=True,
        blank=True,
        help_text="Base URL for API connections"
    )
    connection_config = models.JSONField(
        default=dict,
        help_text="Configuration details for the connection"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['project', 'name'], 
                name='unique_data_source_name_per_project'
            )
        ]
        indexes = [
            models.Index(fields=['source_type', 'middleware_type']),
            models.Index(fields=['created_at', 'is_active']),
        ]
        verbose_name = "Data Source"
        verbose_name_plural = "Data Sources"

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
        
        if not (self.created_by == self.project.owner or 
                ProjectAccess.objects.filter(
                    project=self.project,
                    user=self.created_by,
                    revoked_at__isnull=True
                ).exists()):
            raise ValidationError('User does not have access to this project')
           
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

    def clean(self):
        super().clean()
        # Ensure data source only links to locations in projects where the owners match
        if self.data_source.project.owner != self.location.project.owner:
            raise ValidationError({
                'location': 'Data source can only be linked to locations in projects you own'
            })

class Dataset(models.Model):
    """Represents a specific set of data from a source"""
    data_source = models.ForeignKey(
        DataSource,
        on_delete=models.CASCADE,
        related_name='datasets'
    )
    created_by = models.ForeignKey(
        'auth.User',
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_datasets'
    )
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    import_config = models.JSONField(
        default=dict,
        help_text="Dataset-specific import settings"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['data_source', 'name', 'created_by'],
                name='unique_dataset_name_per_source_creator'
            )
        ]
        indexes = [
            models.Index(fields=['created_at', 'updated_at']),
        ]

    def __str__(self):
        return f"{self.name} ({self.data_source.name})"

    def clean(self):
        super().clean()
        if not (self.created_by == self.data_source.project.owner or 
                ProjectAccess.objects.filter(
                    project=self.data_source.project,
                    user=self.created_by,
                    revoked_at__isnull=True
                ).exists()):
            raise ValidationError('User does not have access to this project')

    def assemble_timestamp(self, components, measurement):
        """
        Assemble timestamp from components using measurement's timezone
        
        Args:
            components: Dict with timestamp components
            measurement: Measurement instance whose timezone should be used
        """
        if 'timestamp' in components:
            if isinstance(components['timestamp'], timezone.datetime):
                ts = components['timestamp']
            else:
                format_string = self.import_config.get('timestamp_format')
                if format_string:
                    ts = timezone.datetime.strptime(components['timestamp'], format_string)
                else:
                    ts = timezone.datetime.fromisoformat(components['timestamp'])
            
            if timezone.is_naive(ts):
                ts = timezone.make_aware(ts, timezone.get_timezone(measurement.source_timezone))
            return timezone.localtime(ts, timezone.UTC)

        if 'date' in components:
            date_str = components['date']
            time_str = components.get('time', '00:00:00')
            format_string = self.import_config.get('date_format')
            if format_string:
                ts = timezone.datetime.strptime(f"{date_str} {time_str}", format_string)
            else:
                ts = timezone.datetime.fromisoformat(f"{date_str}T{time_str}")
            ts = timezone.make_aware(ts, timezone.get_timezone(measurement.source_timezone))
            return timezone.localtime(ts, timezone.UTC)

        year = components.get('year')
        month = components.get('month')
        day = components.get('day')
        hour = components.get('hour', 0)
        minute = components.get('minute', 0)
        second = components.get('second', 0)
        microsecond = components.get('microsecond', 0)

        if not all(x is not None for x in [year, month, day]):
            raise ValueError("Must provide at least year, month, and day")

        ts = timezone.datetime(
            year=int(year),
            month=int(month),
            day=int(day),
            hour=int(hour),
            minute=int(minute),
            second=int(second),
            microsecond=int(microsecond)
        )
        
        ts = timezone.make_aware(ts, timezone.get_timezone(measurement.source_timezone))
        return timezone.localtime(ts, timezone.UTC)

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

        # Validate measurement access
        measurement_owner = self.measurement.location.project.owner
        dataset_owner = self.source_column.dataset.owner
        
        if measurement_owner != dataset_owner:
            # Check if there's an active grant
            has_grant = DataCopyGrant.objects.filter(
                from_user=measurement_owner,
                to_user=dataset_owner,
                measurement=self.measurement,
                start_time__lte=timezone.now(),
                end_time__gte=timezone.now(),
                revoked_at__isnull=True
            ).exists()
            
            if not has_grant:
                raise ValidationError({
                    'measurement': 'You do not have permission to map to this measurement'
                })
        
        # Validate configurations
        if self.transform_config and not isinstance(self.transform_config, dict):
            raise ValidationError({
                'transform_config': 'Transform configuration must be a valid JSON object'
            })
            
        if self.validation_rules and not isinstance(self.validation_rules, dict):
            raise ValidationError({
                'validation_rules': 'Validation rules must be a valid JSON object'
            })
        
class DataImport(models.Model):
    """Tracks individual import attempts"""
    class ImportStatus(models.TextChoices):
        PENDING = 'pending', 'Pending'
        ANALYZING = 'analyzing', 'Analyzing Source'
        CONFIGURING = 'configuring', 'Awaiting Configuration'
        VALIDATED = 'validated', 'Configuration Validated'
        IN_PROGRESS = 'in_progress', 'Import In Progress'
        COMPLETED = 'completed', 'Completed'
        FAILED = 'failed', 'Failed'
        PARTIAL = 'partially_completed', 'Partially Completed With Errors'

    dataset = models.ForeignKey(
        Dataset,
        on_delete=models.CASCADE,
        related_name='imports',
        help_text="Dataset being imported"
    )
    status = models.CharField(
        max_length=20, 
        choices=ImportStatus.choices,
        default=ImportStatus.PENDING,
        help_text="Current import status"
    )
    started_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True)
    
    # File handling
    import_file = models.FileField(
        upload_to='imports/',
        null=True,
        blank=True,
        help_text="Uploaded file for file-based imports"
    )
    
    # Progress tracking
    total_rows = models.IntegerField(default=0)
    processed_rows = models.IntegerField(default=0)
    error_count = models.IntegerField(default=0)
    success_count = models.IntegerField(default=0)
    
    # Data time range
    start_time = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Data start time"
    )
    end_time = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Data end time"
    )
    
    # Detailed logging
    statistics = models.JSONField(
        default=dict,
        help_text="Import statistics"
    )
    error_log = models.JSONField(
        default=list,
        help_text="Import errors"
    )
    processing_log = models.JSONField(
        default=list,
        help_text="Processing details"
    )
    
    # User tracking
    created_by = models.ForeignKey(
        'auth.User',
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_imports',
        help_text="User who created this import"
    )
    approved_by = models.ForeignKey(
        'auth.User',
        on_delete=models.SET_NULL,
        null=True,
        related_name='approved_imports',
        help_text="User who approved this import"
    )

    class Meta:
        ordering = ['-started_at']
        indexes = [
            models.Index(fields=['status', 'started_at']),
            models.Index(fields=['started_at', 'completed_at']),
        ]
        verbose_name = "Data Import"
        verbose_name_plural = "Data Imports"

    def __str__(self):
        return f"Import {self.id} - {self.dataset.name} ({self.status})"

    @property
    def progress_percentage(self):
        if self.total_rows == 0:
            return 0
        return round((self.processed_rows / self.total_rows) * 100, 1)

    def clean(self):
        super().clean()
        if not (self.created_by == self.dataset.data_source.project.owner or 
                ProjectAccess.objects.filter(
                    project=self.dataset.data_source.project,
                    user=self.created_by,
                    revoked_at__isnull=True
                ).exists()):
            raise ValidationError('User does not have access to this project')
        if self.approved_by == self.created_by:
            raise ValidationError({
                'approved_by': 'Approver must be different from creator'
            })


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
        choices=DataImport.ImportStatus.choices
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
    timestamp = models.DateTimeField()
    measurement = models.ForeignKey(
        'Measurement',
        on_delete=models.CASCADE,
        related_name='timeseries',
        help_text="Measurement point this data belongs to"
    )
    dataset = models.ForeignKey(
        Dataset,
        on_delete=models.CASCADE,
        related_name='timeseries_data',
        help_text="Dataset this data belongs to"
    )
    value = models.FloatField(
        help_text="Measurement value"
    )
    copied_from = models.ForeignKey(
        'self',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='copies',
        help_text="Original data point if this is a copy"
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['timestamp', 'measurement', 'dataset'],
                name='unique_dataset_measurement_timestamp'
            )
        ]
        indexes = [
            models.Index(fields=['dataset', 'measurement', 'timestamp']),
            models.Index(fields=['value']),
            models.Index(fields=['timestamp']),
            models.Index(fields=['timestamp', 'value']),  # New index
        ]
        ordering = ['-timestamp']
        verbose_name = "Time Series Data Point"
        verbose_name_plural = "Time Series Data Points"

    def __str__(self):
        return f"{self.measurement}: {self.value} at {self.timestamp}"
    
class DataCopyGrant(models.Model):
    """Tracks permissions for data copying between users"""
    from_user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='granted_copies',
        help_text="User granting access to their data"
    )
    to_user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='received_copies',
        help_text="User receiving access to data"
    )
    measurement = models.ForeignKey(
        Measurement,
        on_delete=models.CASCADE,
        help_text="Measurement point being shared"
    )
    granted_at = models.DateTimeField(auto_now_add=True)
    start_time = models.DateTimeField(
        help_text="When access begins"
    )
    end_time = models.DateTimeField(
        help_text="When access ends"
    )
    granted_by = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='copy_grants_given',
        help_text="User who created this grant"
    )
    revoked_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When access was revoked, if applicable"
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['from_user', 'to_user', 'measurement'],
                condition=models.Q(revoked_at__isnull=True),
                name='unique_active_grant'
            )
        ]
        verbose_name = "Data Copy Grant"
        verbose_name_plural = "Data Copy Grants"

    def __str__(self):
        return f"{self.from_user.username} -> {self.to_user.username}: {self.measurement}"

    def clean(self):
        super().clean()
        if self.start_time and self.end_time and self.end_time < self.start_time:
            raise ValidationError({
                'end_time': 'End time cannot be before start date'
            })
        if self.measurement.location.project.owner != self.from_user:
            raise ValidationError({
                'from_user': 'Must be the measurement owner'
            })
        if self.from_user == self.to_user:
            raise ValidationError({
                'to_user': 'Cannot grant copy permission to yourself'
            })