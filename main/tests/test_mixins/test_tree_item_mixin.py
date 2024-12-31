# tests/test_mixins/test_tree_item_mixin.py
from django.urls import reverse
from rest_framework import status
from ..test_base import BaseAPITestCase
from ...models import Location, Measurement

class TestTreeItemMixin(BaseAPITestCase):
    def setUp(self):
        super().setUp()
        self.location_url = reverse('location-list')
        self.measurement_url = reverse('measurement-list')

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

    def test_cascading_delete(self):
        """Test delete cascades through tree"""
        # Create nested structure
        child_location = Location.objects.create(
            name="Test Child",
            project=self.test_project,
            parent=self.test_location,
            address="Child Address"
        )
        measurement = Measurement.objects.create(
            name="Child Measurement",
            location=child_location,
            measurement_type="power"
        )

        # Delete parent location
        url = reverse('location-detail', kwargs={'pk': self.test_location.pk})
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        
        # Verify cascade
        self.assertFalse(Location.objects.filter(pk=child_location.pk).exists())
        self.assertFalse(Measurement.objects.filter(pk=measurement.pk).exists())

    def test_template_context(self):
        """Test template rendering includes correct context"""
        data = {
            'name': 'Template Test Location',
            'project': self.test_project.pk,
            'address': 'Template Test Address'
        }
        response = self.client.post(self.location_url, data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        # Check HTML response
        self.assertIn('html', response.data)
        html_content = response.data['html']
        self.assertIn('Template Test Location', html_content)
        self.assertIn('tree-item', html_content)