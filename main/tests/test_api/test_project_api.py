# tests/test_api/test_project_api.py
from rest_framework import status
from django.urls import reverse
from datetime import date
from ..test_base import BaseAPITestCase
from ...models import Project, Location, Measurement, MeasurementUnit, MeasurementCategory, MeasurementType 

class TestProjectAPI(BaseAPITestCase):
    def setUp(self):
        super().setUp()
        self.list_url = reverse('project-list')
        self.detail_url = reverse('project-detail', kwargs={'pk': self.test_project.pk})
        self.test_unit = MeasurementUnit.objects.get(
            type=self.pressure_type,
            multiplier=''  # base unit
        )

    def test_list_projects(self):
        """Test retrieving list of projects"""
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)  # From utils_data
        self.assertEqual(response.data[0]['name'], "Energy Trust Production")

    def test_create_project(self):
        """Test project creation"""
        data = {
            'name': 'New Test Project',
            'project_type': 'M&V',
            'start_date': date.today().isoformat()
        }
        response = self.client.post(self.list_url, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(Project.objects.filter(name='New Test Project').exists())

    def test_create_project_validation(self):
        """Test project creation validation"""
        test_cases = [
            {
                'data': {'name': ''},
                'expected_error': 'name'
            },
            {
                'data': {'name': 'Test Project', 'project_type': 'InvalidType'},
                'expected_error': 'project_type'
            },
            {
                'data': {
                    'name': 'Test Project',
                    'project_type': 'Audit',
                    'start_date': '2024-01-01',
                    'end_date': '2023-12-31'  # End before start
                },
                'expected_error': 'end_date'
            }
        ]

        for test_case in test_cases:
            response = self.client.post(self.list_url, test_case['data'])
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
            self.assertIn(test_case['expected_error'], str(response.data))

    def test_retrieve_project(self):
        """Test retrieving a specific project with measurements"""
        response = self.client.get(self.detail_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], self.test_project.name)
        self.assertIn('locations', response.data)
        
        # Verify nested measurement data includes unit info
        location_data = response.data['locations'][0]
        self.assertIn('measurements', location_data)
        if location_data['measurements']:
            measurement = location_data['measurements'][0]
            self.assertIn('unit', measurement)
            self.assertIn('category', measurement)
            self.assertIn('type', measurement)

    def test_update_project(self):
        """Test updating a project"""
        data = {
            'name': 'Updated Project Name',
            'project_type': 'M&V'
        }
        response = self.client.patch(self.detail_url, data)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.test_project.refresh_from_db()
        self.assertEqual(self.test_project.name, 'Updated Project Name')

    def test_delete_project(self):
        """Test deleting a project"""
        response = self.client.delete(self.detail_url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Project.objects.filter(pk=self.test_project.pk).exists())

    def test_delete_project_cascade(self):
        """Test deleting a project cascades to locations and measurements"""
        # Create a project with nested structure
        project = Project.objects.create(
            name="Cascade Test Project",
            project_type="Audit"
        )
        location = Location.objects.create(
            project=project,
            name="Test Location",
            address="123 Test St"
        )
        measurement = Measurement.objects.create(
            name="Test Measurement",
            location=location,
            unit=self.test_unit
        )

        # Store IDs for verification
        location_id = location.pk
        measurement_id = measurement.pk
        unit_id = self.test_unit.pk
        type_id = self.test_unit.type.id
        category_id = self.test_unit.type.category.id

        # Delete project
        url = reverse('project-detail', kwargs={'pk': project.pk})
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

        # Verify cascade
        self.assertFalse(Project.objects.filter(pk=project.pk).exists())
        self.assertFalse(Location.objects.filter(pk=location_id).exists())
        self.assertFalse(Measurement.objects.filter(pk=measurement_id).exists())
        
        # Verify measurement categories, types and units are NOT deleted
        self.assertTrue(MeasurementUnit.objects.filter(pk=unit_id).exists())
        self.assertTrue(MeasurementType.objects.filter(pk=type_id).exists())
        self.assertTrue(MeasurementCategory.objects.filter(pk=category_id).exists())

    def test_project_list_structure(self):
        """Test project list includes correct nested structure with measurement info"""
        # Create measurement in test location
        measurement = Measurement.objects.create(
            name="API Test Measurement",
            location=self.test_location,
            unit=self.test_unit
        )

        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Get our test project from response
        project_data = next(p for p in response.data if p['id'] == self.test_project.id)
        
        # Verify structure
        self.assertIn('locations', project_data)
        self.assertTrue(len(project_data['locations']) > 0)
        
        # Verify nested location has measurements
        location_data = project_data['locations'][0]
        self.assertIn('measurements', location_data)
        
        # Verify measurement includes full unit information
        measurement_data = next(
            m for m in location_data['measurements'] 
            if m['id'] == measurement.id
        )
        self.assertIn('unit', measurement_data)
        self.assertIn('category', measurement_data)
        self.assertIn('type', measurement_data)
        
        # Verify specific measurement attributes
        self.assertEqual(measurement_data['unit']['id'], self.test_unit.id)
        self.assertEqual(measurement_data['category']['id'], self.test_unit.type.category.id)
        self.assertEqual(measurement_data['type']['id'], self.test_unit.type.id)