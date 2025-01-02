# tests/test_views/test_dashboard.py
from django.urls import reverse
from ..test_base import BaseTestCase

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
        response = self.client.get(self.dashboard_url)
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, 'main/dashboard.html')
        
        # Check context contains required data
        self.assertIn('projects', response.context)
        self.assertIn('model_fields', response.context)
        
        # Verify projects are loaded
        projects = response.context['projects']
        self.assertEqual(projects.count(), 2)  # From utils_data

    def test_empty_dashboard(self):
        """Test dashboard displays correctly with no data"""
        # Delete all projects
        self.test_project.__class__.objects.all().delete()
        
        response = self.client.get(self.dashboard_url)
        self.assertEqual(response.status_code, 200)
        
        # Verify context still has required keys
        self.assertIn('projects', response.context)
        self.assertIn('model_fields', response.context)
        
        # Verify projects queryset is empty
        self.assertEqual(response.context['projects'].count(), 0)