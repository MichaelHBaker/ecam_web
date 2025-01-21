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
            type=self.pressure_type,
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
                type=self.pressure_type,
                unit=None
            ).full_clean()
        self.assertIn('unit', str(context.exception))

    def test_type_required(self):
        """Test type is required"""
        with self.assertRaises(ValidationError) as context:
            Measurement(
                name="Missing Type Test",
                location=self.test_location,
                type=None,
                unit=self.test_unit
            ).full_clean()
        self.assertIn('type', str(context.exception))

    def test_category_type_relationships(self):
        """Test relationships to category and type through unit"""
        measurement = Measurement.objects.create(
            name="Relationship Test",
            location=self.test_location,
            type=self.pressure_type,
            unit=self.test_unit
        )
        self.assertEqual(measurement.type, self.test_unit.type)
        self.assertEqual(measurement.category, self.test_unit.type.category)

    def test_unit_validation(self):
        """Test unit validation with correct type"""
        # Ensure the unit belongs to the correct type
        measurement = Measurement.objects.create(
            name="Unit Type Validation Test",
            location=self.test_location,
            type=self.pressure_type,
            unit=self.test_unit
        )
        
        self.assertEqual(measurement.unit, self.test_unit)
        self.assertEqual(measurement.type, self.test_unit.type)

    def test_unit_type_mismatch(self):
        """Test that unit must match measurement type"""
        with self.assertRaises(ValidationError) as context:
            Measurement(
                name="Mismatched Unit Test",
                location=self.test_location,
                type=self.flow_category.types.first(),
                unit=self.test_unit
            ).full_clean()
        self.assertIn('unit', str(context.exception))

    def test_duplicate_names_same_location(self):
        """Test measurements in same location can't have duplicate names"""
        Measurement.objects.create(
            name="Duplicate Test",
            location=self.test_location,
            type=self.pressure_type,
            unit=self.test_unit
        )
        
        with self.assertRaises(ValidationError) as context:
            measurement2 = Measurement(
                name="Duplicate Test",  # Same name
                location=self.test_location,  # Same location
                type=self.pressure_type,
                unit=self.test_unit
            )
            measurement2.full_clean()
        self.assertIn('name', str(context.exception))

    def test_duplicate_names_different_locations(self):
        """Test measurements in different locations can have same name"""
        Measurement.objects.create(
            name="Same Name Test",
            location=self.test_location,
            type=self.pressure_type,
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
                type=self.pressure_type,
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
            type=self.pressure_type,
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
            type=self.pressure_type,
            unit=self.test_unit
        )
        try:
            measurement.full_clean()
            measurement.save()
        except ValidationError as e:
            self.fail("Description should be optional")