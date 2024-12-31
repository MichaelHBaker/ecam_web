# tests/test_models/test_client.py
from django.test import TestCase
from django.core.exceptions import ValidationError
from ..test_base import BaseTestCase
from ...models import Client

class TestClientModel(BaseTestCase):
    def test_str_representation(self):
        """Test string representation of client"""
        self.assertEqual(str(self.test_client), "Acme Corp")

    def test_unique_name_constraint(self):
        """Test that client names must be unique"""
        with self.assertRaises(ValidationError):
            Client(
                name="Acme Corp",  # Already exists
                contact_email="other@test.com"
            ).full_clean()

    def test_email_validation(self):
        """Test email field validation"""
        with self.assertRaises(ValidationError):
            Client(
                name="Invalid Email Test",
                contact_email="not-an-email"
            ).full_clean()

    def test_cascade_delete(self):
        """Test that deleting a client cascades to related objects"""
        project_count = self.test_client.projects.count()
        self.assertTrue(project_count > 0)  # Verify we have projects
        
        self.test_client.delete()
        self.assertEqual(
            type(self).test_client.projects.count(), 
            0, 
            "Projects should be deleted with client"
        )