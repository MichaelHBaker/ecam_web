# tests/test_models/test_measurement.py
from django.test import TestCase
from django.core.exceptions import ValidationError
from ..test_base import BaseTestCase
from ...models import Measurement, Location, MeasurementType

class TestMeasurementModel(BaseTestCase):
    def test_str_representation(self):
        """Test string representation of measurement"""
        measurement = Measurement.objects.create(
            name="String Test",
            location=self.test_location,
            measurement_type=self.power_type
        )
        expected = f"String Test ({self.power_type.display_name})"
        self.assertEqual(str(measurement), expected)

    def test_measurement_type_required(self):
        """Test measurement type is required"""
        with self.assertRaises(ValidationError) as context:
            Measurement(
                name="Missing Type Test",
                location=self.test_location,
                measurement_type=None
            ).full_clean()
        self.assertIn('measurement_type', str(context.exception))

    def test_unit_from_measurement_type(self):
        """Test unit is correctly obtained from measurement type"""
        # Test power measurement
        power_measurement = Measurement.objects.create(
            name="Power Test",
            location=self.test_location,
            measurement_type=self.power_type
        )
        self.assertEqual(power_measurement.unit, "kW")
        
        # Test temperature measurement
        temp_measurement = Measurement.objects.create(
            name="Temp Test",
            location=self.test_location,
            measurement_type=self.temp_type
        )
        self.assertEqual(temp_measurement.unit, "°F")
        
        # Test pressure measurement
        pressure_measurement = Measurement.objects.create(
            name="Pressure Test",
            location=self.test_location,
            measurement_type=self.pressure_type
        )
        self.assertEqual(pressure_measurement.unit, "PSI")

    def test_hierarchy_string(self):
        """Test get_hierarchy method"""
        measurement = Measurement.objects.create(
            name="Hierarchy Test",
            location=self.test_location,
            measurement_type=self.power_type
        )
        expected = f"{self.test_location.get_hierarchy()} > {measurement.name}"
        self.assertEqual(measurement.get_hierarchy(), expected)

    def test_duplicate_names_same_location(self):
        """Test measurements in same location can't have duplicate names"""
        measurement1 = Measurement.objects.create(
            name="Duplicate Test",
            location=self.test_location,
            measurement_type=self.power_type
        )
        
        with self.assertRaises(ValidationError) as context:
            measurement2 = Measurement(
                name="Duplicate Test",  # Same name
                location=self.test_location,  # Same location
                measurement_type=self.temp_type  # Different type doesn't matter
            )
            measurement2.full_clean()
        self.assertIn('name', str(context.exception))

    def test_duplicate_names_different_locations(self):
        """Test measurements in different locations can have same name"""
        measurement1 = Measurement.objects.create(
            name="Same Name Test",
            location=self.test_location,
            measurement_type=self.power_type
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
                measurement_type=self.power_type
            )
            measurement2.full_clean()
            measurement2.save()
        except ValidationError as e:
            self.fail("Should allow same name in different location")

    def test_measurement_type_deletion_protection(self):
        """Test that measurement types cannot be deleted while in use"""
        measurement = Measurement.objects.create(
            name="Protection Test",
            location=self.test_location,
            measurement_type=self.power_type
        )
        
        # Attempt to delete the measurement type
        with self.assertRaises(Exception):
            self.power_type.delete()
        
        # Verify measurement and type still exist
        self.assertTrue(
            Measurement.objects.filter(pk=measurement.pk).exists(),
            "Measurement should still exist"
        )
        self.assertTrue(
            MeasurementType.objects.filter(pk=self.power_type.pk).exists(),
            "MeasurementType should still exist"
        )

    def test_optional_description(self):
        """Test description field is optional"""
        measurement = Measurement(
            name="No Description Test",
            location=self.test_location,
            measurement_type=self.power_type
        )
        try:
            measurement.full_clean()
            measurement.save()
        except ValidationError as e:
            self.fail("Description should be optional")

    def test_measurement_type_attributes(self):
        """Test access to measurement type attributes"""
        measurement = Measurement.objects.create(
            name="Attributes Test",
            location=self.test_location,
            measurement_type=self.power_type
        )
        
        self.assertEqual(measurement.measurement_type.name, 'power')
        self.assertEqual(measurement.measurement_type.display_name, 'Power (kW)')
        self.assertEqual(measurement.measurement_type.unit, 'kW')
        self.assertEqual(
            measurement.measurement_type.description,
            'Power consumption measurement'
        )