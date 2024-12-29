from rest_framework import status
from django.urls import reverse
from .test_base import BaseTestCase

class AuthenticationTests(BaseTestCase):
    """Test authentication requirements for API endpoints"""

    def setUp(self):
        super().setUp()
        # Don't auto-authenticate in this test case
        self.client.force_authenticate(user=None)
        
        # Setup test URLs
        self.urls = {
            'client': reverse('client-list'),
            'project': reverse('project-list'),
            'location': reverse('location-list'),
            'measurement': reverse('measurement-list')
        }

    def test_unauthenticated_access(self):
        """Test that unauthenticated requests are rejected"""
        for endpoint, url in self.urls.items():
            # Test GET
            response = self.client.get(url)
            self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN,
                           f"GET to {endpoint} should be forbidden")

            # Test POST
            response = self.client.post(url, {})
            self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN,
                           f"POST to {endpoint} should be forbidden")

    def test_authenticated_access(self):
        """Test that authenticated requests are accepted"""
        self.client.force_authenticate(user=self.user)
        
        for endpoint, url in self.urls.items():
            response = self.client.get(url)
            self.assertEqual(response.status_code, status.HTTP_200_OK,
                           f"GET to {endpoint} should be allowed")

    def test_token_invalidation(self):
        """Test that invalid/expired tokens are rejected"""
        self.client.credentials(HTTP_AUTHORIZATION='Token ' + 'invalid-token')
        
        for endpoint, url in self.urls.items():
            response = self.client.get(url)
            self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN,
                           f"Invalid token should be rejected for {endpoint}")

    def test_permission_preservation(self):
        """Test that authenticated users maintain permissions across requests"""
        self.client.force_authenticate(user=self.user)
        
        # Create a resource
        client = self.create_test_client()
        url = reverse('client-detail', kwargs={'pk': client.pk})
        
        # Verify CRUD operations
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        response = self.client.patch(url, {'name': 'Updated Name'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        response = self.client.delete(url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)