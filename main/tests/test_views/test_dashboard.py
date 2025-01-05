# tests/test_views/test_dashboard.py
from django.urls import reverse
from ..test_base import BaseTestCase
from ...models import Project, Location, Measurement, MeasurementType

class TestDashboardView(BaseTestCase):
    def setUp(self):
        """Set up each test"""
        super().setUp()
        self.dashboard_url = reverse('dashboard')
        # Login for each test
        self.client.force_login(self.test_user)

    def test_login_required(self):
        """Test that dashboard requires login"""
        # Logout and try to access
        self.client.logout()
        response = self.client.get(self.dashboard_url)
        self.assertEqual(response.status_code, 302)
        expected_redirect = f'/?next={self.dashboard_url}'  # Updated to match actual configuration
        self.assertRedirects(response, expected_redirect)

    def test_dashboard_loads(self):
        """Test dashboard loads with correct context"""
        # Create test data with measurement types
        location = Location.objects.create(
            project=self.test_project,
            name="Dashboard Test Location",
            address="123 Dashboard St"
        )
        
        measurement = Measurement.objects.create(
            name="Dashboard Test Measurement",
            location=location,
            measurement_type=self.power_type
        )
        
        response = self.client.get(self.dashboard_url)
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, 'main/dashboard.html')
        
        # Check context contains required data
        self.assertIn('projects', response.context)
        self.assertIn('model_fields', response.context)
        self.assertIn('measurement_types', response.context)
        
        # Verify projects are loaded
        projects = response.context['projects']
        self.assertEqual(projects.count(), 2)  # From utils_data
        
        # Verify measurement types are in context
        measurement_types = response.context['measurement_types']
        self.assertIn(self.power_type, measurement_types)
        self.assertIn(self.temp_type, measurement_types)
        self.assertIn(self.pressure_type, measurement_types)

    def test_empty_dashboard(self):
        """Test dashboard displays correctly with no data"""
        # Delete all projects
        self.test_project.__class__.objects.all().delete()
        
        response = self.client.get(self.dashboard_url)
        self.assertEqual(response.status_code, 200)
        
        # Verify context still has required keys
        self.assertIn('projects', response.context)
        self.assertIn('model_fields', response.context)
        self.assertIn('measurement_types', response.context)
        
        # Verify projects queryset is empty
        self.assertEqual(response.context['projects'].count(), 0)

    def test_measurement_type_context(self):
        """Test that measurement types are properly included in context"""
        response = self.client.get(self.dashboard_url)
        self.assertEqual(response.status_code, 200)
        
        measurement_types = response.context['measurement_types']
        
        # Verify all measurement type attributes are available
        power_type = next(mt for mt in measurement_types if mt.name == 'power')
        self.assertEqual(power_type.display_name, 'Power (kW)')
        self.assertEqual(power_type.unit, 'kW')
        
        temp_type = next(mt for mt in measurement_types if mt.name == 'temperature')
        self.assertEqual(temp_type.display_name, 'Temperature (°F)')
        self.assertEqual(temp_type.unit, '°F')
        
        pressure_type = next(mt for mt in measurement_types if mt.name == 'pressure')
        self.assertEqual(pressure_type.display_name, 'Pressure (PSI)')
        self.assertEqual(pressure_type.unit, 'PSI')

    def test_nested_data_structure(self):
        """Test that nested data includes measurement types correctly"""
        # Create nested structure
        location = Location.objects.create(
            project=self.test_project,
            name="Nested Test Location",
            address="456 Nested St"
        )
        
        measurement = Measurement.objects.create(
            name="Nested Test Measurement",
            location=location,
            measurement_type=self.power_type
        )
        
        response = self.client.get(self.dashboard_url)
        self.assertEqual(response.status_code, 200)
        
        # Get project from context
        project = next(p for p in response.context['projects'] 
                      if p.pk == self.test_project.pk)
        
        # Verify measurement type information is accessible through the structure
        location = project.locations.get(name="Nested Test Location")
        measurement = location.measurements.first()
        self.assertEqual(measurement.measurement_type, self.power_type)
        self.assertEqual(measurement.measurement_type.display_name, 'Power (kW)')
        self.assertEqual(measurement.measurement_type.unit, 'kW')