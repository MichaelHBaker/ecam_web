# from django.test import TestCase
# from django.urls import reverse
# import json
# from unittest.mock import patch
# import os

# class ExcelUploadFrontendTests(TestCase):
#     def test_form_structure(self):
#         response = self.client.get(reverse('index'))
#         self.assertContains(response, '<form id="excelForm"')
#         self.assertContains(response, 'name="csv_file"')
#         self.assertContains(response, 'name="folder_path"')
#         self.assertContains(response, 'name="workbook_name"')
#         self.assertContains(response, 'name="sheet_name"')
#         self.assertContains(response, 'Create Excel Workbook')
#         self.assertNotContains(response, 'Upload CSV')

#     @patch('os.path.exists')
#     @patch('openpyxl.Workbook.save')
#     def test_excel_creation_with_csv_data(self, mock_save, mock_exists):
#         mock_exists.return_value = True
        
#         with open('test.csv', 'w') as f:
#             f.write('dummy,csv,data')
        
#         with open('test.csv', 'rb') as f:
#             response = self.client.post(reverse('excel_upload'), {
#                 'csv_file': f,
#                 'folder_path': '/test/path',
#                 'workbook_name': 'test.xlsx',
#                 'sheet_name': 'Sheet1'
#             })
        
#         os.remove('test.csv')  # Clean up
        
#         self.assertEqual(response.status_code, 200)
#         response_data = json.loads(response.content)
#         expected_data = {
#             'status': 'success',
#             'message': 'Workbook created and CSV data loaded successfully'
#         }
#         self.assertDictEqual(response_data, expected_data)

#     def test_missing_csv_file(self):
#         response = self.client.post(reverse('excel_upload'), {
#             'folder_path': '/test/path',
#             'workbook_name': 'test.xlsx',
#             'sheet_name': 'Sheet1'
#         })
        
#         self.assertEqual(response.status_code, 400)
#         self.assertJSONEqual(str(response.content, encoding='utf8'), 
#                              {'error': 'CSV file is required'})

#     def test_missing_required_field(self):
#         with open('test.csv', 'w') as f:
#             f.write('dummy,csv,data')
        
#         with open('test.csv', 'rb') as f:
#             response = self.client.post(reverse('excel_upload'), {
#                 'csv_file': f,
#                 'workbook_name': 'test.xlsx',
#                 'sheet_name': 'Sheet1'
#             })
        
#         os.remove('test.csv')  # Clean up
        
#         self.assertEqual(response.status_code, 400)
#         self.assertJSONEqual(str(response.content, encoding='utf8'), 
#                              {'error': 'All fields are required'})

#     @patch('os.path.exists')
#     def test_nonexistent_folder_path(self, mock_exists):
#         mock_exists.return_value = False
        
#         with open('test.csv', 'w') as f:
#             f.write('dummy,csv,data')
        
#         with open('test.csv', 'rb') as f:
#             response = self.client.post(reverse('excel_upload'), {
#                 'csv_file': f,
#                 'folder_path': '/nonexistent/path',
#                 'workbook_name': 'test.xlsx',
#                 'sheet_name': 'Sheet1'
#             })
        
#         os.remove('test.csv')  # Clean up
        
#         self.assertEqual(response.status_code, 400)
#         self.assertJSONEqual(str(response.content, encoding='utf8'), 
#                              {'error': 'Folder path does not exist'})