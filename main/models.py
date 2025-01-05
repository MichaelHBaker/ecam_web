from django.db import models
from django.core.exceptions import ValidationError

class MeasurementType(models.Model):
        name = models.CharField(max_length=50, unique=True)  # e.g., 'power'
        display_name = models.CharField(max_length=100)      # e.g., 'Power (kW)'
        unit = models.CharField(max_length=10)               # e.g., 'kW'
        description = models.TextField(blank=True)

        def __str__(self):
            return self.display_name

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

    def get_hierarchy(self):
        return self.name

    def clean(self):
        """Validate model data"""
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

    def get_hierarchy(self):
        """
        Generate a string that shows the complete path from project to this location.
        """
        hierarchy = f"{self.project.get_hierarchy()}"
        ancestors = [self.name]
        p = self.parent
        while p is not None:
            ancestors.append(p.name)
            p = p.parent
        return f"{hierarchy} > {' > '.join(reversed(ancestors))}"

    def clean(self):
        """Validate model data"""
        super().clean()
        if self.parent and self.parent.project != self.project:
            raise ValidationError({
                'parent': 'Parent location must belong to the same project'
            })

class Measurement(models.Model):
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    measurement_type = models.ForeignKey(MeasurementType, on_delete=models.PROTECT)
    location = models.ForeignKey(Location, on_delete=models.CASCADE, related_name='measurements')

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['name', 'location'],
                name='unique_measurement_name_per_location'
            )
        ]

    def __str__(self):
        return f"{self.name} ({self.measurement_type.display_name})"

    def get_hierarchy(self):
        return f"{self.location.get_hierarchy()} > {self.name}"

    def clean(self):
        """Validate model data"""
        super().clean()

        # Check for duplicate names in same location
        if self.name:
            existing = Measurement.objects.filter(
                location=self.location,
                name=self.name
            )
            if self.pk:  # If updating existing measurement
                existing = existing.exclude(pk=self.pk)
            if existing.exists():
                raise ValidationError({
                    'name': 'A measurement with this name already exists in this location'
                })

    @property
    def unit(self):
        return self.measurement_type.unit
    
        
class TimeSeriesData(models.Model):
    timestamp = models.DateTimeField(db_index=True)
    measurement = models.ForeignKey(Measurement, on_delete=models.CASCADE)
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
class DataImport(models.Model):
    IMPORT_STATUS = [
        ('uploaded', 'File Uploaded'),
        ('analyzed', 'Data Analyzed'),
        ('mapped', 'Measurements Mapped'),
        ('imported', 'Data Imported'),
        ('error', 'Error'),
    ]
    
    file = models.FileField(upload_to='imports/')
    uploaded_at = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=20, choices=IMPORT_STATUS, default='uploaded')
    error_message = models.TextField(blank=True)
    stats = models.JSONField(default=dict)
    processed_by = models.ForeignKey('auth.User', on_delete=models.SET_NULL, null=True)

    def __str__(self):
        return f"Import {self.id} - {self.status} at {self.uploaded_at}"