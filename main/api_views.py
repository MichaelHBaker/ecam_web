# myapp/api_views.py

import json
import requests
from django.http import JsonResponse
from django.views import View
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator

# Load the configuration
with open('config.json') as config_file:
    config = json.load(config_file)

@method_decorator(csrf_exempt, name='dispatch')  # Disable CSRF for this view
class ClaudeChatView(View):
    def post(self, request):
        user_input = request.POST.get('prompt')  # Get user input from the request
        api_key = config['apiKey']  # Get the API key from the config

        # Make a request to the Claude API
        response = requests.post(
            'https://api.claude.example.com',  # Replace with the actual Claude API endpoint
            headers={'Authorization': f'Bearer {api_key}'},
            json={
                'prompt': user_input,
                'temperature': 0.7,  # Adjust as needed
                'max_tokens': 150    # Adjust as needed
            }
        )

        if response.status_code == 200:
            return JsonResponse(response.json())
        else:
            return JsonResponse({'error': 'Failed to get response from Claude API'}, status=response.status_code)