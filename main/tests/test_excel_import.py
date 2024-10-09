# import os
# import json
# import shutil
# from django.test import TestCase
# from django.urls import reverse
# from django.core.files.uploadedfile import SimpleUploadedFile
# from django.conf import settings

# class ExcelFeatureTests(TestCase):
#     @classmethod
#     def setUpClass(cls):
#         super().setUpClass()
#         cls.test_files_dir = os.path.join(settings.BASE_DIR, 'test_files')
#         os.makedirs(cls.test_files_dir, exist_ok=True)

#     @classmethod
#     def tearDownClass(cls):
#         super().tearDownClass()
#         # Clean up the directory after all tests
#         shutil.rmtree(cls.test_files_dir)

#     def setUp(self):
#         self.folder_path = self.test_files_dir
#         self.workbook_name = 'my_workbook.xlsx'
#         self.sheet_name = 'Custom Sheet Name'
#         self.url = reverse('excel_upload')
#         self.test_file_path = os.path.join(self.folder_path, 'test.csv')

#     def create_test_csv_file(self):
#         """Create a test CSV file with sample content."""
#         with open(self.test_file_path, 'w') as f:
#             f.write('Header1,Header2,Header3\nValue1,Value2,Value3')

#     def test_excel_creation_with_csv_data(self):
#         """Test creating an Excel workbook from CSV data"""
#         self.create_test_csv_file()
#         with open(self.test_file_path, 'rb') as file:
#             csv_file = SimpleUploadedFile('test.csv', file.read(), content_type='text/csv')
#             response = self.client.post(self.url, {
#                 'csv_file': csv_file,
#                 'folder_path': self.folder_path,
#                 'workbook_name': self.workbook_name,
#                 'sheet_name': self.sheet_name
#             })
#         data = json.loads(response.content)
#         self.assertEqual(data.get('status'), 'success')
#         self.assertTrue(os.path.exists(os.path.join(self.folder_path, self.workbook_name)))
#         self.assertEqual(data.get('message'), 'Workbook created and CSV data loaded successfully')

#     def test_missing_csv_file(self):
#         """Test that an error is returned when CSV file is missing"""
#         response = self.client.post(self.url, {
#             'folder_path': self.folder_path,
#             'workbook_name': self.workbook_name,
#             'sheet_name': self.sheet_name
#         })
#         data = json.loads(response.content)
#         self.assertEqual(response.status_code, 400)
#         self.assertEqual(data.get('error'), 'CSV file is required')

#     def test_missing_required_fields(self):
#         """Test that an error is returned when required fields are missing"""
#         self.create_test_csv_file()
#         with open(self.test_file_path, 'rb') as file:
#             csv_file = SimpleUploadedFile('test.csv', file.read(), content_type='text/csv')
#             response = self.client.post(self.url, {
#                 'csv_file': csv_file,
#                 'workbook_name': self.workbook_name
#             })
#         data = json.loads(response.content)
#         self.assertEqual(response.status_code, 400)
#         self.assertEqual(data.get('error'), 'All fields are required')

#     def test_nonexistent_folder_path(self):
#         """Test that an error is returned when folder path doesn't exist"""
#         self.create_test_csv_file()
#         with open(self.test_file_path, 'rb') as file:
#             csv_file = SimpleUploadedFile('test.csv', file.read(), content_type='text/csv')
#             response = self.client.post(self.url, {
#                 'csv_file': csv_file,
#                 'folder_path': '/nonexistent/path',
#                 'workbook_name': self.workbook_name,
#                 'sheet_name': self.sheet_name
#             })
#         data = json.loads(response.content)
#         self.assertEqual(response.status_code, 400)
#         self.assertEqual(data.get('error'), 'Folder path does not exist')