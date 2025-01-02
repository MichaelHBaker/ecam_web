# tests/test_models/test_measurement.py
from django.test import TestCase
from django.core.exceptions import ValidationError
from ..test_base import BaseTestCase
from ...models import Measurement, Location

class TestMeasurementModel(BaseTestCase):
    def test_str_representation(self):
        """Test string representation of measurement"""
        expected = f"{self.test_measurement.name} ({self.test_measurement.get_measurement_type_display()})"
        self.assertEqual(str(self.test_measurement), expected)

    def test_measurement_type_validation(self):
        """Test measurement type validation"""
        with self.assertRaises(ValidationError) as context:
            Measurement(
                name="Invalid Type Test",
                location=self.test_location,
                measurement_type="invalid_type"
            ).full_clean()
        self.assertIn('measurement_type', str(context.exception))

    def test_unit_property(self):
        """Test unit property returns correct units"""
        # Test power measurement
        power_measurement = Measurement.objects.get(name="Main Power Meter")
        self.assertEqual(power_measurement.unit, "kW")
        
        # Test temperature measurement
        temp_measurement = Measurement.objects.get(name="HVAC Temperature")
        self.assertEqual(temp_measurement.unit, "°F")
        
        # Test pressure measurement
        pressure_measurement = Measurement.objects.get(name="Process Line Pressure")
        self.assertEqual(pressure_measurement.unit, "PSI")

    def test_hierarchy_string(self):
        """Test get_hierarchy method"""
        measurement = Measurement.objects.get(name="Main Power Meter")
        storage_location = Location.objects.get(name="Fish Storage Warehouse")
        expected = f"{storage_location.get_hierarchy()} > {measurement.name}"
        self.assertEqual(measurement.get_hierarchy(), expected)

    def test_duplicate_names_same_location(self):
        """Test measurements in same location can't have duplicate names"""
        existing_measurement = self.test_measurement
        with self.assertRaises(ValidationError) as context:
            new_measurement = Measurement(
                name=existing_measurement.name,  # Duplicate name
                location=existing_measurement.location,  # Same location
                measurement_type="power"
            )
            new_measurement.full_clean()
        self.assertIn('name', str(context.exception))

    def test_duplicate_names_different_locations(self):
        """Test measurements in different locations can have same name"""
        existing_measurement = self.test_measurement
        different_location = Location.objects.create(
            name="Different Location",
            project=self.test_project,
            address="456 Different St"
        )
        
        new_measurement = Measurement(
            name=existing_measurement.name,  # Same name
            location=different_location,  # Different location
            measurement_type="power"
        )
        try:
            new_measurement.full_clean()
            new_measurement.save()
        except ValidationError as e:
            self.fail("Should allow same name in different location")

    def test_all_measurement_types(self):
        """Test all measurement types are valid"""
        for m_type, _ in Measurement.MEASUREMENT_TYPES:
            measurement = Measurement(
                name=f"Test {m_type}",
                location=self.test_location,
                measurement_type=m_type
            )
            try:
                measurement.full_clean()
            except ValidationError as e:
                self.fail(f"Measurement type {m_type} should be valid but raised: {e}")

    def test_optional_description(self):
        """Test description field is optional"""
        measurement = Measurement(
            name="No Description Test",
            location=self.test_location,
            measurement_type="power"
        )
        try:
            measurement.full_clean()
            measurement.save()
        except ValidationError as e:
            self.fail("Description should be optional")