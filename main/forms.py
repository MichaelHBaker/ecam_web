from django import forms

class CSVUploadForm(forms.Form):
    csv_file = forms.FileField(
        label='Select a CSV file',
        help_text='File must be CSV format.',
        widget=forms.FileInput(attrs={'accept': '.csv'}),
        allow_empty_file=True
    )

    def clean_csv_file(self):
        file = self.cleaned_data['csv_file']
        if not file.name.endswith('.csv'):
            raise forms.ValidationError('Please upload a valid CSV file')
        return file

