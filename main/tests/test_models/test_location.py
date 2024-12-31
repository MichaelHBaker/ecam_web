# tests/test_models/test_location.py
from django.test import TestCase
from django.core.exceptions import ValidationError
from decimal import Decimal
from ..test_base import BaseTestCase
from ...models import Location

class TestLocationModel(BaseTestCase):
    def test_str_representation(self):
        """Test string representation of location"""
        expected = f"{self.test_location.name} - Project: {self.test_project.name}"
        self.assertEqual(str(self.test_location), expected)

    def test_coordinate_validation(self):
        """Test coordinate validation"""
        # Test invalid latitude
        with self.assertRaises(ValidationError):
            Location(
                name="Invalid Coords Test",
                project=self.test_project,
                address="Test Address",
                latitude=Decimal('91.0'),  # Invalid latitude
                longitude=Decimal('0.0')
            ).full_clean()

        # Test invalid longitude
        with self.assertRaises(ValidationError):
            Location(
                name="Invalid Coords Test",
                project=self.test_project,
                address="Test Address",
                latitude=Decimal('0.0'),
                longitude=Decimal('181.0')  # Invalid longitude
            ).full_clean()

    def test_parent_child_relationship(self):
        """Test parent-child relationship"""
        factory = Location.objects.get(name="Acme Factory")
        self.assertEqual(factory.parent, self.test_location)
        self.assertIn(factory, self.test_location.children.all())

    def test_hierarchy_string(self):
        """Test get_hierarchy method"""
        factory = Location.objects.get(name="Acme Factory")
        expected = f"{self.test_project.get_hierarchy()} > {self.test_location.name} > {factory.name}"
        self.assertEqual(factory.get_hierarchy(), expected)