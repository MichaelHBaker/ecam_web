from django.db import models

class Client(models.Model):
    name = models.CharField(max_length=200)
    contact_email = models.EmailField()
    phone_number = models.CharField(max_length=15, blank=True, null=True)

    def __str__(self):
        return self.name

    def get_hierarchy(self):
        return self.name

class Project(models.Model):
    PROJECT_TYPES = [
        ('Audit', 'Audit'),
        ('M&V', 'Measurement & Verification'),
    ]

    name = models.CharField(max_length=100)
    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name='projects')
    project_type = models.CharField(max_length=20, choices=PROJECT_TYPES)
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)

    def __str__(self):
        return f"{self.name} ({self.get_project_type_display()})"

    def get_hierarchy(self):
        return f"{self.client.get_hierarchy()} > {self.name}"

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
        Generate a string that shows the complete path from client to this location.
        """
        hierarchy = f"{self.project.get_hierarchy()}"
        ancestors = [self.name]
        p = self.parent
        while p is not None:
            ancestors.append(p.name)
            p = p.parent
        return f"{hierarchy} > {' > '.join(reversed(ancestors))}"

class Measurement(models.Model):
    MEASUREMENT_TYPES = [
        ('power', 'Power (kW)'),
        ('temperature', 'Temperature (°F)'),
        ('pressure', 'Pressure (PSI)'),
    ]

    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    measurement_type = models.CharField(max_length=20, choices=MEASUREMENT_TYPES)
    location = models.ForeignKey(Location, on_delete=models.CASCADE, related_name='measurements')

    def __str__(self):
        return f"{self.name} ({self.get_measurement_type_display()})"

    def get_hierarchy(self):
        return f"{self.location.get_hierarchy()} > {self.name}"

    @property
    def unit(self):
        units = {
            'power': 'kW',
            'temperature': '°F',
            'pressure': 'PSI'
        }
        return units.get(self.measurement_type, '')
