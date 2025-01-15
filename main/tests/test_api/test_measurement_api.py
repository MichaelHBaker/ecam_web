# tests/test_models/test_measurement.py
from django.test import TestCase
from django.core.exceptions import ValidationError
from ..test_base import BaseTestCase
from ...models import Measurement, Location, MeasurementUnit

class TestMeasurementModel(BaseTestCase):
    def test_str_representation(self):
        """Test string representation of measurement"""
        unit = MeasurementUnit.objects.get(
            type=self.pressure_type,
            multiplier=''  # base unit
        )
        measurement = Measurement.objects.create(
            name="String Test",
            location=self.test_location,
            unit=unit
        )
        expected = f"String Test ({unit})"
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

    def test_unit_type_validation(self):
        """Test unit must be valid for its type"""
        # Try to create measurement with wrong unit type
        wrong_unit = MeasurementUnit.objects.get(
            type__category__name='flow'  # Different category
        )
        
        with self.assertRaises(ValidationError) as context:
            Measurement.objects.create(
                name="Wrong Unit Test",
                location=self.test_location,
                unit=wrong_unit
            )
        self.assertIn('unit', str(context.exception))

    def test_unit_multiplier_handling(self):
        """Test handling of units with different multipliers"""
        # Get kilo and mega units
        kilo_unit = MeasurementUnit.objects.get(
            type=self.pressure_type,
            multiplier='k'
        )
        mega_unit = MeasurementUnit.objects.get(
            type=self.pressure_type,
            multiplier='M'
        )

        # Create measurements with different multipliers
        kilo_measurement = Measurement.objects.create(
            name="Kilo Test",
            location=self.test_location,
            unit=kilo_unit
        )
        mega_measurement = Measurement.objects.create(
            name="Mega Test",
            location=self.test_location,
            unit=mega_unit
        )

        self.assertEqual(str(kilo_measurement.unit), f"k{self.pressure_type.symbol}")
        self.assertEqual(str(mega_measurement.unit), f"M{self.pressure_type.symbol}")

    def test_duplicate_names_same_location(self):
        """Test measurements in same location can't have duplicate names"""
        unit = MeasurementUnit.objects.get(
            type=self.pressure_type,
            multiplier=''
        )
        measurement1 = Measurement.objects.create(
            name="Duplicate Test",
            location=self.test_location,
            unit=unit
        )
        
        with self.assertRaises(ValidationError) as context:
            measurement2 = Measurement(
                name="Duplicate Test",  # Same name
                location=self.test_location,  # Same location
                unit=unit  # Same or different unit shouldn't matter
            )
            measurement2.full_clean()
        self.assertIn('name', str(context.exception))

    def test_duplicate_names_different_locations(self):
        """Test measurements in different locations can have same name"""
        unit = MeasurementUnit.objects.get(
            type=self.pressure_type,
            multiplier=''
        )
        measurement1 = Measurement.objects.create(
            name="Same Name Test",
            location=self.test_location,
            unit=unit
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
                unit=unit
            )
            measurement2.full_clean()
            measurement2.save()
        except ValidationError as e:
            self.fail("Should allow same name in different location")

    def test_measurement_relationships(self):
        """Test relationships between measurement, unit, type, and category"""
        unit = MeasurementUnit.objects.get(
            type=self.pressure_type,
            multiplier='k'
        )
        measurement = Measurement.objects.create(
            name="Relationship Test",
            location=self.test_location,
            unit=unit
        )
        
        # Test relationship accessors
        self.assertEqual(measurement.type, self.pressure_type)
        self.assertEqual(measurement.category, self.pressure_type.category)
        self.assertEqual(measurement.unit.type, self.pressure_type)

    def test_optional_description(self):
        """Test description field is optional"""
        unit = MeasurementUnit.objects.get(
            type=self.pressure_type,
            multiplier=''
        )
        measurement = Measurement(
            name="No Description Test",
            location=self.test_location,
            unit=unit
        )
        try:
            measurement.full_clean()
            measurement.save()
        except ValidationError as e:
            self.fail("Description should be optional")