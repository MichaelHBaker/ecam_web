from django.db import models

class Client(models.Model):
    name = models.CharField(max_length=200)
    contact_email = models.EmailField()
    phone_number = models.CharField(max_length=15, blank=True, null=True)

    def __str__(self):
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
        Generate a string that shows the path from the top-level parent to this location.
        """
        ancestors = [self.name]
        p = self.parent
        while p is not None:
            ancestors.append(p.name)
            p = p.parent
        return " > ".join(reversed(ancestors))
