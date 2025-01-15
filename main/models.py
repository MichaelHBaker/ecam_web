from django.db import models
from django.core.exceptions import ValidationError
import pytz

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
        return f"{self.name} ({self.unit})"

    def clean(self):
        super().clean()
        # Validate timezone
        try:
            pytz.timezone(self.source_timezone)
        except pytz.exceptions.UnknownTimeZoneError:
            raise ValidationError({
                'source_timezone': f'Invalid timezone: {self.source_timezone}'
            })
        
        # Validate multiplier usage
        if self.multiplier and not self.type.supports_multipliers:
            raise ValidationError({
                'multiplier': f'Type {self.type} does not support multipliers'
            })

        # Validate unit belongs to type
        if self.unit.type != self.type:
            raise ValidationError({
                'unit': f'Unit {self.unit} does not belong to type {self.type}'
            })

    @property
    def category(self):
        return self.type.category

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

    name = models.CharField(max_length=100)
    source_type = models.CharField(max_length=20, choices=SOURCE_TYPES)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    configuration = models.JSONField(default=dict)  # Stores source-specific configuration
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.name} ({self.get_source_type_display()})"

class APIDataSource(DataSource):
    """Configuration for API-based data sources including building automation middleware"""
    url_base = models.URLField(help_text="Base URL for the API")
    middleware_type = models.CharField(
        max_length=20, 
        choices=DataSource.MIDDLEWARE_TYPES,
        help_text="Type of middleware system"
    )
    
    # Authentication
    auth_type = models.CharField(max_length=20, choices=[
        ('basic', 'Basic Auth'),
        ('bearer', 'Bearer Token'),
        ('oauth2', 'OAuth 2.0'),
        ('cert', 'Client Certificate'),
    ])
    
    def clean(self):
        super().clean()
        if self.source_type != 'api':
            raise ValidationError("APIDataSource must have source_type='api'")

class DataSourceMapping(models.Model):
    """Maps a measurement to its exact source location"""
    measurement = models.ForeignKey(
        Measurement,
        on_delete=models.CASCADE,
        related_name='source_mappings'
    )
    data_source = models.ForeignKey(DataSource, on_delete=models.CASCADE)
    
    # JSON field storing ALL identifiers needed to uniquely identify the point
    source_identifiers = models.JSONField(
        help_text="All identifiers needed to uniquely locate this point in the source system"
    )
    
    # Configuration for data handling
    mapping_config = models.JSONField(
        default=dict,
        help_text="Data handling configuration (scaling, units, polling)"
    )
    
    # Sync tracking
    last_sync = models.DateTimeField(null=True)
    last_error = models.TextField(blank=True)
    
    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['measurement', 'data_source'],
                name='unique_measurement_source'
            )
        ]

    def __str__(self):
        ids = [f"{k}={v}" for k, v in self.source_identifiers.items()]
        return f"{self.measurement} <- {self.data_source}: {', '.join(ids)}"

    def clean(self):
        """Validate that all required identifiers are present"""
        super().clean()
        if isinstance(self.data_source, APIDataSource):
            required_ids = {
                'niagara': ['station_name', 'point_path'],
                'ecostruxure': ['server_id', 'device_id', 'point_id'],
                'metasys': ['site_name', 'device_id', 'object_id', 'instance'],
                'desigo': ['system_id', 'point_id'],
                'custom': ['point_id']
            }
            
            middleware_type = self.data_source.middleware_type
            required = required_ids.get(middleware_type, [])
            
            missing = [id_name for id_name in required 
                      if id_name not in self.source_identifiers]
            
            if missing:
                raise ValidationError({
                    'source_identifiers': f'Missing required identifiers for {middleware_type}: {", ".join(missing)}'
                })

class TimeSeriesData(models.Model):
    """Time series data storage as received from source"""
    timestamp = models.DateTimeField(
        help_text="Timestamp as received from source (interpreted using measurement's source_timezone)"
    )
    measurement = models.ForeignKey(
        Measurement, 
        on_delete=models.CASCADE,
        related_name='timeseries'
    )
    value = models.FloatField()

    class Meta:
        indexes = [
            models.Index(fields=['measurement', 'timestamp']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['timestamp', 'measurement'],
                name='unique_measurement_timestamp'
            )
        ]
        ordering = ['-timestamp']

    def __str__(self):
        return f"{self.measurement}: {self.value} at {self.timestamp}"

class DataImport(models.Model):
    """Tracks individual import attempts"""
    IMPORT_STATUS = [
        ('pending', 'Pending'),
        ('in_progress', 'In Progress'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
    ]
    
    data_source = models.ForeignKey(DataSource, on_delete=models.CASCADE)
    status = models.CharField(max_length=20, choices=IMPORT_STATUS, default='pending')
    started_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True)
    import_file = models.FileField(upload_to='imports/', null=True, blank=True)
    row_count = models.IntegerField(default=0)
    error_count = models.IntegerField(default=0)
    error_log = models.JSONField(default=list)
    created_by = models.ForeignKey(
        'auth.User',
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_imports'
    )
    approved_by = models.ForeignKey(
        'auth.User',
        on_delete=models.SET_NULL,
        null=True,
        related_name='approved_imports'
    )
    
    def __str__(self):
        return f"Import {self.id} from {self.data_source} ({self.status})"