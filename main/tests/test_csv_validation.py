import os
import shutil
from django.test import TestCase
from django.urls import reverse
from django.core.files.uploadedfile import SimpleUploadedFile
from django.conf import settings
from . import utils_data

TEST_FILES_DIR = os.path.join(settings.BASE_DIR, 'test_files')

class CSVUploadTestCase(TestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.url = reverse('excel_upload')  # Ensure this is correctly pointing to your upload handling view
        cls.csv_files = {}
        cls.default_data = {
            'folder_path': TEST_FILES_DIR, 
            'workbook_name': 'test_workbook.xlsx',
            'sheet_name': 'test_sheet'
        }

        # Set up the test files directory and create CSV files
        if os.path.exists(TEST_FILES_DIR):
            shutil.rmtree(TEST_FILES_DIR)
        os.makedirs(TEST_FILES_DIR, exist_ok=True)

        # Generate CSV files using utility functions
        for func_name in dir(utils_data):
            if func_name.startswith('create_') and func_name.endswith('_csv'):
                file_path = os.path.join(TEST_FILES_DIR, f"{func_name}.csv")
                getattr(utils_data, func_name)(file_path)
                cls.csv_files[func_name] = cls.selected_file(file_path)

    @classmethod
    def selected_file(cls, file_path):
        """Create a SimpleUploadedFile from a file path."""
        with open(file_path, 'rb') as f:
            return SimpleUploadedFile(os.path.basename(file_path), f.read(), content_type="text/csv")

    def test_empty_csv(self):
        data = self.default_data.copy()  # Start with a copy of the default data
        data['csv_file'] = self.csv_files['create_empty_csv']
        response = self.client.post(self.url, data, follow=True)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['error'], 'The selected CSV file is empty')

    def test_header_only_csv(self):
        data = self.default_data.copy()  # Start with a copy of the default data
        data['csv_file'] = self.csv_files['create_header_only_csv']
        response = self.client.post(self.url, data, follow=True)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['error'], 'The CSV file contains only headers')

    def test_inconsistent_columns_csv(self):
        data = self.default_data.copy()  # Start with a copy of the default data
        data['csv_file'] = self.csv_files['create_inconsistent_columns_csv']
        response = self.client.post(self.url, data, follow=True)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['error'], 'Inconsistent number of columns in CSV')

    def test_duplicate_headers_csv(self):
        data = self.default_data.copy()  # Start with a copy of the default data
        data['csv_file'] = self.csv_files['create_duplicate_headers_csv']
        response = self.client.post(self.url, data, follow=True)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['error'], 'Duplicate headers found in CSV')

    def test_valid_csv(self):
        """Test that a valid CSV file can be uploaded and processed successfully."""
        data = self.default_data.copy()  # Start with a copy of the default data
        data['csv_file'] = self.csv_files['create_valid_csv']
        response = self.client.post(self.url, data, follow=True)
        self.assertEqual(response.status_code, 200)
        self.assertIn('Valid CSV File', response.json()['message'])

    # def test_missing_values_csv(self):
    #     """Test handling of a CSV file with missing values."""
    #     response = self.client.post(self.url, {'csv_file': self.csv_files['create_missing_values_csv']}, follow=True)
    #     self.assertEqual(response.status_code, 200)
    #     self.assertIn('Workbook created and CSV data loaded successfully', response.json()['message'])

    # def test_large_csv(self):
    #     """Test handling of a large CSV file."""
    #     response = self.client.post(self.url, {'csv_file': self.csv_files['create_large_csv']}, follow=True)
    #     self.assertEqual(response.status_code, 200)
    #     self.assertIn('Workbook created and CSV data loaded successfully', response.json()['message'])

    # def test_quoted_fields_csv(self):
    #     """Test handling of a CSV file with quoted fields."""
    #     response = self.client.post(self.url, {'csv_file': self.csv_files['create_quoted_fields_csv']}, follow=True)
    #     self.assertEqual(response.status_code, 200)
    #     self.assertIn('Workbook created and CSV data loaded successfully', response.json()['message'])

    # def test_mixed_data_types_csv(self):
    #     """Test handling of a CSV file with mixed data types."""
    #     response = self.client.post(self.url, {'csv_file': self.csv_files['create_mixed_data_types_csv']}, follow=True)
    #     self.assertEqual(response.status_code, 200)
    #     self.assertIn('Workbook created and CSV data loaded successfully', response.json()['message'])

    # def test_non_utf8_csv(self):
    #     """Test handling of a non-UTF8 encoded CSV file."""
    #     response = self.client.post(self.url, {'csv_file': self.csv_files['create_non_utf8_csv']}, follow=True)
    #     self.assertEqual(response.status_code, 200)
    #     self.assertIn('Workbook created and CSV data loaded successfully', response.json()['message'])
