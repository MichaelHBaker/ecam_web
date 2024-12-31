# tests/test_models/test_measurement.py
from django.test import TestCase
from django.core.exceptions import ValidationError
from ..test_base import BaseTestCase
from ...models import Measurement

class TestMeasurementModel(BaseTestCase):
    def test_str_representation(self):
        """Test string representation of measurement"""
        expected = f"{self.test_measurement.name} ({self.test_measurement.get_measurement_type_display()})"
        self.assertEqual(str(self.test_measurement), expected)

    def test_measurement_type_validation(self):
        """Test measurement type validation"""
        with self.assertRaises(ValidationError):
            Measurement(
                name="Invalid Type Test",
                location=self.test_location,
                measurement_type="invalid_type"
            ).full_clean()

    def test_unit_property(self):
        """Test unit property returns correct units"""
        # Test power measurement
        self.assertEqual(self.test_measurement.unit, "kW")
        
        # Test temperature measurement
        temp_measurement = Measurement.objects.get(name="HVAC Temperature")
        self.assertEqual(temp_measurement.unit, "°F")
        
        # Test pressure measurement
        pressure_measurement = Measurement.objects.get(name="Process Line Pressure")
        self.assertEqual(pressure_measurement.unit, "PSI")

    def test_hierarchy_string(self):
        """Test get_hierarchy method"""
        expected = f"{self.test_location.get_hierarchy()} > {self.test_measurement.name}"
        self.assertEqual(self.test_measurement.get_hierarchy(), expected)