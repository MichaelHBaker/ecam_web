# tests/test_mixins/test_tree_item_mixin.py
from django.urls import reverse
from rest_framework import status
from ..test_base import BaseAPITestCase
from ...models import Location, Measurement, Project, MeasurementType

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
        # No parent reference for top level
        self.assertNotIn('parent=', html_content)

    def test_create_with_parent(self):
        """Test creation with parent relationship"""
        data = {
            'name': 'Child Location',
            'project': self.test_project.pk,
            'address': '123A Test St',
            'parent': self.test_location.pk
        }
        response = self.client.post(self.location_url, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('html', response.data)
        
        # Verify parent relationship
        created_location = Location.objects.get(name='Child Location')
        self.assertEqual(created_location.parent, self.test_location)
        
        # Verify template shows proper hierarchy
        html_content = response.data['html']
        self.assertIn(f'parent={self.test_location.pk}', html_content)

    def test_create_leaf_item(self):
        """Test creation of a leaf item (Measurement)"""
        data = {
            'name': 'Leaf Measurement',
            'location': self.test_location.pk,
            'measurement_type': self.power_type.pk,
            'description': 'Test leaf node'
        }
        response = self.client.post(self.measurement_url, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('html', response.data)
        
        # Verify no children container for leaf
        html_content = response.data['html']
        self.assertNotIn('w3-container w3-hide', html_content)
        # Verify measurement type information is included
        self.assertIn(self.power_type.display_name, html_content)
        self.assertIn(self.power_type.unit, html_content)

    def test_cascading_delete(self):
        """Test delete cascades through tree"""
        # Create nested structure
        parent_location = Location.objects.get(name="Acme Products")
        child_location = Location.objects.create(
            name="Test Child",
            project=self.test_project,
            parent=parent_location,
            address="Child Address"
        )
        measurement = Measurement.objects.create(
            name="Child Measurement",
            location=child_location,
            measurement_type=self.power_type
        )
        
        # Store IDs for verification
        measurement_type_id = self.power_type.pk

        # Delete parent location
        url = reverse('location-detail', kwargs={'pk': parent_location.pk})
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        
        # Verify cascade
        self.assertFalse(Location.objects.filter(pk=child_location.pk).exists())
        self.assertFalse(Measurement.objects.filter(pk=measurement.pk).exists())
        # Verify measurement type is NOT deleted
        self.assertTrue(
            MeasurementType.objects.filter(pk=measurement_type_id).exists(),
            "MeasurementType should not be deleted on cascade"
        )

    def test_template_context(self):
        """Test template rendering includes correct context"""
        # Create location and measurement to test context
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
            measurement_type=self.power_type
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
            measurement_type=self.power_type
        )
        
        # Get location detail
        url = reverse('location-detail', kwargs={'pk': location.pk})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Check for field attributes
        self.assertIn('name', response.data)
        self.assertIn('address', response.data)
        self.assertIn('measurements', response.data)
        
        # Verify measurement type information
        measurement_data = response.data['measurements'][0]
        self.assertIn('measurement_type', measurement_data)
        self.assertEqual(
            measurement_data['measurement_type']['name'],
            self.power_type.name
        )
        self.assertEqual(
            measurement_data['measurement_type']['unit'],
            self.power_type.unit
        )

    def test_nested_structure_handling(self):
        """Test handling of nested structure in template"""
        # Create a location with nested items
        parent_loc = Location.objects.create(
            name="Parent Location",
            project=self.test_project,
            address="Parent Address"
        )
        
        child_loc = Location.objects.create(
            name="Child Location",
            project=self.test_project,
            address="Child Address",
            parent=parent_loc
        )
        
        measurement = Measurement.objects.create(
            name="Child Measurement",
            location=child_loc,
            measurement_type=self.power_type
        )

        # Get parent location to check rendering
        url = reverse('location-detail', kwargs={'pk': parent_loc.pk})
        response = self.client.get(url)
        
        # Verify structure in response
        self.assertIn('children', response.data)
        child_data = response.data['children']
        self.assertEqual(len(child_data), 1)
        self.assertEqual(child_data[0]['name'], "Child Location")
        
        # Verify measurement data
        measurement_data = child_data[0]['measurements'][0]
        self.assertEqual(measurement_data['name'], "Child Measurement")
        self.assertEqual(
            measurement_data['measurement_type']['name'],
            self.power_type.name
        )