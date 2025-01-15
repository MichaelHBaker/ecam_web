# tests/test_models/test_measurement.py
from django.test import TestCase
from django.core.exceptions import ValidationError
from ..test_base import BaseTestCase
from ...models import Measurement, Location, MeasurementUnit

class TestMeasurementModel(BaseTestCase):
    def test_str_representation(self):
        """Test string representation of measurement"""
        measurement = Measurement.objects.create(
            name="String Test",
            location=self.test_location,
            unit=self.test_unit
        )
        expected = f"String Test ({self.test_unit})"
        self.assertEqual(str(measurement), expected)

    def test_unit_required(self):
        """Test unit is required"""
        with self.assertRaises(ValidationError) as context:
            Measurement(
                name="Missing Unit Test",
                location=self.test_location,
                unit=None
            ).full_clean()
        self.assertIn('unit', str(context.exception))

    def test_category_type_relationships(self):
        """Test relationships to category and type through unit"""
        measurement = Measurement.objects.create(
            name="Relationship Test",
            location=self.test_location,
            unit=self.test_unit
        )
        self.assertEqual(measurement.type, self.test_unit.type)
        self.assertEqual(measurement.category, self.test_unit.type.category)

    def test_unit_validation(self):
        """Test unit validation with different multipliers"""
        # Get units with different multipliers
        base_unit = MeasurementUnit.objects.get(
            type=self.pressure_type,
            multiplier=''
        )
        kilo_unit = MeasurementUnit.objects.get(
            type=self.pressure_type,
            multiplier='k'
        )
        
        # Both should work
        measurement1 = Measurement.objects.create(
            name="Base Unit Test",
            location=self.test_location,
            unit=base_unit
        )
        measurement2 = Measurement.objects.create(
            name="Kilo Unit Test",
            location=self.test_location,
            unit=kilo_unit
        )
        
        self.assertEqual(measurement1.unit, base_unit)
        self.assertEqual(measurement2.unit, kilo_unit)

    def test_duplicate_names_same_location(self):
        """Test measurements in same location can't have duplicate names"""
        measurement1 = Measurement.objects.create(
            name="Duplicate Test",
            location=self.test_location,
            unit=self.test_unit
        )
        
        with self.assertRaises(ValidationError) as context:
            measurement2 = Measurement(
                name="Duplicate Test",  # Same name
                location=self.test_location,  # Same location
                unit=self.test_unit
            )
            measurement2.full_clean()
        self.assertIn('name', str(context.exception))

    def test_duplicate_names_different_locations(self):
        """Test measurements in different locations can have same name"""
        measurement1 = Measurement.objects.create(
            name="Same Name Test",
            location=self.test_location,
            unit=self.test_unit
        )
        
        different_location = Location.objects.create(
            name="Different Location",
            project=self.test_project,
            address="456 Different St"
        )
        
        try:
            measurement2 = Measurement(
                name="Same Name Test",  # Same name
                location=different_location,  # Different location
                unit=self.test_unit
            )
            measurement2.full_clean()
            measurement2.save()
        except ValidationError as e:
            self.fail("Should allow same name in different location")

    def test_unit_deletion_protection(self):
        """Test that units cannot be deleted while in use"""
        measurement = Measurement.objects.create(
            name="Protection Test",
            location=self.test_location,
            unit=self.test_unit
        )
        
        # Attempt to delete the unit
        with self.assertRaises(Exception):
            self.test_unit.delete()
        
        # Verify measurement and unit still exist
        self.assertTrue(
            Measurement.objects.filter(pk=measurement.pk).exists(),
            "Measurement should still exist"
        )
        self.assertTrue(
            MeasurementUnit.objects.filter(pk=self.test_unit.pk).exists(),
            "MeasurementUnit should still exist"
        )

    def test_optional_description(self):
        """Test description field is optional"""
        measurement = Measurement(
            name="No Description Test",
            location=self.test_location,
            unit=self.test_unit
        )
        try:
            measurement.full_clean()
            measurement.save()
        except ValidationError as e:
            self.fail("Description should be optional")