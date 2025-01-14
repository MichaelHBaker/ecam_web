from django.db import models
from django.core.exceptions import ValidationError
from django.utils import timezone

class MeasurementCategory(models.Model):
    """Categories like Energy, Power, Flow, etc."""
    name = models.CharField(max_length=50, unique=True)
    display_name = models.CharField(max_length=100)
    description = models.TextField(blank=True)

    def __str__(self):
        return self.display_name

    class Meta:
        verbose_name_plural = "Measurement Categories"

class MeasurementType(models.Model):
    """Base units like Watt, BTU, Therm"""
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
    name = models.CharField(max_length=50)
    symbol = models.CharField(max_length=10)
    description = models.TextField(blank=True)
    conversion_factor = models.FloatField(
        default=1.0,
        help_text="Conversion factor to category's base unit"
    )
    is_base_unit = models.BooleanField(
        default=False,
        help_text="Whether this is the base unit for its category"
    )
    supports_multipliers = models.BooleanField(
        default=True,
        help_text="Whether this type supports SI multipliers"
    )

    def __str__(self):
        return f"{self.name} ({self.symbol})"

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['category', 'name'],
                name='unique_type_per_category'
            )
        ]

    def clean(self):
        super().clean()
        if self.is_base_unit:
            existing_base = MeasurementType.objects.filter(
                category=self.category,
                is_base_unit=True
            )
            if self.pk:
                existing_base = existing_base.exclude(pk=self.pk)
            if existing_base.exists():
                raise ValidationError({
                    'is_base_unit': f'{self.category} already has a base unit'
                })

class MeasurementUnit(models.Model):
    """Specific units including multipliers"""
    type = models.ForeignKey(
        MeasurementType,
        on_delete=models.PROTECT,
        related_name='units'
    )
    multiplier = models.CharField(
        max_length=2,
        choices=MeasurementType.MULTIPLIER_CHOICES,
        default='',
        blank=True
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['type', 'multiplier'],
                name='unique_type_multiplier'
            )
        ]

    def __str__(self):
        if self.multiplier and self.type.supports_multipliers:
            return f"{self.multiplier}{self.type.symbol}"
        return self.type.symbol

    def clean(self):
        super().clean()
        if self.multiplier and not self.type.supports_multipliers:
            raise ValidationError({
                'multiplier': f'{self.type} does not support multipliers'
            })

class Measurement(models.Model):
    """Individual measurements"""
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    unit = models.ForeignKey(
        MeasurementUnit,
        on_delete=models.PROTECT
    )
    location = models.ForeignKey(
        'Location',
        on_delete=models.CASCADE,
        related_name='measurements'
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
        if self.name:
            existing = Measurement.objects.filter(
                location=self.location,
                name=self.name
            )
            if self.pk:
                existing = existing.exclude(pk=self.pk)
            if existing.exists():
                raise ValidationError({
                    'name': 'A measurement with this name already exists in this location'
                })

    @property
    def type(self):
        return self.unit.type

    @property
    def category(self):
        return self.type.category
    
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
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='locations')
    name = models.CharField(max_length=100)
    address = models.TextField()
    parent = models.ForeignKey('self', on_delete=models.CASCADE, related_name='children', null=True, blank=True)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)

    def __str__(self):
        return f"{self.name} - Project: {self.project.name}"

    def clean(self):
        super().clean()
        if self.parent and self.parent.project != self.project:
            raise ValidationError({
                'parent': 'Parent location must belong to the same project'
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
    measurement = models.ForeignKey('Measurement', on_delete=models.CASCADE, related_name='source_mappings')
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
   """
   Time series data storage using Django's datetime with UTC
   """
   timestamp = models.DateTimeField(
       db_index=True,
       help_text="UTC timestamp"
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

   @property 
   def local_time(self):
       """Get timestamp in local timezone"""
       return timezone.localtime(self.timestamp)
   
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
    
    # For file imports: reference to the specific file
    import_file = models.FileField(upload_to='imports/', null=True, blank=True)
    
    # Metadata about the import
    row_count = models.IntegerField(default=0)
    error_count = models.IntegerField(default=0)
    error_log = models.JSONField(default=list)
    
    # Record who initiated/approved the import
    created_by = models.ForeignKey('auth.User', on_delete=models.SET_NULL, null=True, related_name='created_imports')
    approved_by = models.ForeignKey('auth.User', on_delete=models.SET_NULL, null=True, related_name='approved_imports')
    
    def __str__(self):
        return f"Import {self.id} from {self.data_source} ({self.status})"