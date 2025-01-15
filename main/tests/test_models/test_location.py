from django.urls import reverse
from rest_framework import status
from ..test_base import BaseAPITestCase
from ...models import Location, Measurement, Project, MeasurementUnit

class TestTreeItemMixin(BaseAPITestCase):
    def setUp(self):
        super().setUp()
        self.location_url = reverse('location-list')
        self.measurement_url = reverse('measurement-list')
        self.project_url = reverse('project-list')

    def test_create_top_level_item(self):
        """Test creation of a top-level item (Project)"""
        data = {
            'name': 'Top Level Project',
            'project_type': 'Audit',
        }
        response = self.client.post(self.project_url, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('html', response.data)

        # Verify template context
        html_content = response.data['html']
        self.assertIn('Top Level Project', html_content)
        self.assertIn('tree-item', html_content)

    def test_create_location(self):
        """Test creation of a location"""
        data = {
            'name': 'Test Location',
            'project': self.test_project.pk,
            'address': '123 Test St',
        }
        response = self.client.post(self.location_url, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('html', response.data)

        # Verify location creation
        created_location = Location.objects.get(name='Test Location')
        self.assertEqual(created_location.project, self.test_project)

        # Verify template context
        html_content = response.data['html']
        self.assertIn('Test Location', html_content)

    def test_create_leaf_item(self):
        """Test creation of a leaf item (Measurement)"""
        data = {
            'name': 'Leaf Measurement',
            'location': self.test_location.pk,
            'unit': self.test_unit.pk,
            'description': 'Test leaf node'
        }
        response = self.client.post(self.measurement_url, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('html', response.data)

        # Verify measurement information display
        html_content = response.data['html']
        self.assertIn(str(self.test_unit), html_content)
        self.assertIn(self.test_unit.type.category.display_name, html_content)
        self.assertIn(self.test_unit.type.name, html_content)

    def test_cascading_delete(self):
        """Test delete cascades to measurements but preserves measurement info"""
        # Create location and measurement
        test_location = Location.objects.get(name="Industrial Facility")
        measurement = Measurement.objects.create(
            name="Child Measurement",
            location=test_location,
            unit=self.test_unit
        )

        # Store IDs for verification
        unit_id = self.test_unit.pk
        type_id = self.test_unit.type.id
        category_id = self.test_unit.type.category.id

        # Delete location
        url = reverse('location-detail', kwargs={'pk': test_location.pk})
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

        # Verify cascading delete
        self.assertFalse(Measurement.objects.filter(pk=measurement.pk).exists())

        # Verify preservation of measurement reference data
        self.assertTrue(MeasurementUnit.objects.filter(pk=unit_id).exists())
        self.assertTrue(self.test_unit.type.__class__.objects.filter(pk=type_id).exists())
        self.assertTrue(self.test_unit.type.category.__class__.objects.filter(pk=category_id).exists())

    def test_template_context(self):
        """Test template rendering includes correct context"""
        data = {
            'name': 'Template Test Location',
            'project': self.test_project.pk,
            'address': 'Template Test Address'
        }
        response = self.client.post(self.location_url, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        # Create measurement in location
        location = Location.objects.get(name='Template Test Location')
        measurement = Measurement.objects.create(
            name="Template Test Measurement",
            location=location,
            unit=self.test_unit
        )

        # Verify context in HTML
        html_content = response.data['html']
        self.assertIn('Template Test Location', html_content)
        self.assertIn('tree-item', html_content)
        self.assertIn('fields-container', html_content)
        self.assertIn(str(self.test_project.pk), html_content)

    def test_model_fields_in_context(self):
        """Test model fields are correctly included in context"""
        # Create location with measurement
        location = Location.objects.create(
            name='Fields Test Location',
            project=self.test_project,
            address='Fields Test Address'
        )
        measurement = Measurement.objects.create(
            name="Fields Test Measurement",
            location=location,
            unit=self.test_unit
        )

        # Get location detail
        url = reverse('location-detail', kwargs={'pk': location.pk})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Check for field attributes
        self.assertIn('name', response.data)
        self.assertIn('address', response.data)
        self.assertIn('measurements', response.data)

        # Verify measurement information
        measurement_data = response.data['measurements'][0]
        self.assertIn('unit', measurement_data)
        self.assertIn('category', measurement_data)
        self.assertIn('type', measurement_data)

        # Verify specific values
        self.assertEqual(measurement_data['unit']['id'], self.test_unit.id)
        self.assertEqual(measurement_data['category']['id'], self.test_unit.type.category.id)
        self.assertEqual(measurement_data['type']['id'], self.test_unit.type.id)
