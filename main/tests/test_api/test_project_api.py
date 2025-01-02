# tests/test_api/test_project_api.py
from rest_framework import status
from django.urls import reverse
from datetime import date
from ..test_base import BaseAPITestCase
from ...models import Project

class TestProjectAPI(BaseAPITestCase):
    def setUp(self):
        super().setUp()
        self.list_url = reverse('project-list')
        self.detail_url = reverse('project-detail', kwargs={'pk': self.test_project.pk})

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
        """Test retrieving a specific project"""
        response = self.client.get(self.detail_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], self.test_project.name)
        self.assertIn('locations', response.data)

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
        project = Project.objects.create(
            name="Cascade Test Project",
            project_type="Audit"
        )
        location = project.locations.create(
            name="Test Location",
            address="123 Test St"
        )
        measurement = location.measurements.create(
            name="Test Measurement",
            measurement_type="power"
        )

        # Delete project
        url = reverse('project-detail', kwargs={'pk': project.pk})
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

        # Verify cascade
        self.assertFalse(Project.objects.filter(pk=project.pk).exists())
        self.assertFalse(location.__class__.objects.filter(pk=location.pk).exists())
        self.assertFalse(measurement.__class__.objects.filter(pk=measurement.pk).exists())

    def test_project_list_structure(self):
        """Test project list includes correct nested structure"""
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