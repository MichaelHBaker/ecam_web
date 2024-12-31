# tests/test_views/test_dashboard.py
from django.urls import reverse
from ..test_base import BaseTestCase

class TestDashboardView(BaseTestCase):
    def setUp(self):
        super().setUp()
        self.dashboard_url = reverse('dashboard')

    def test_login_required(self):
        """Test that dashboard requires login"""
        # Logout and try to access
        self.client.logout()
        response = self.client.get(self.dashboard_url)
        self.assertEqual(response.status_code, 302)
        self.assertRedirects(response, f'/?next={self.dashboard_url}')

    def test_dashboard_loads(self):
        """Test dashboard loads with correct context"""
        response = self.client.get(self.dashboard_url)
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, 'main/dashboard.html')
        
        # Check context
        self.assertIn('clients', response.context)
        self.assertIn('model_fields', response.context)
        
        # Check data is present
        clients = response.context['clients']
        self.assertEqual(clients.count(), 2)  # From utils_data
        
    def test_hierarchy_display(self):
        """Test complete hierarchy is displayed"""
        response = self.client.get(self.dashboard_url)
        content = response.content.decode()
        
        # Verify all levels are present
        self.assertInHTML(self.test_client.name, content)
        self.assertInHTML(self.test_project.name, content)
        self.assertInHTML(self.test_location.name, content)
        self.assertInHTML(self.test_measurement.name, content)