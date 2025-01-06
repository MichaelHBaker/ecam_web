from django.urls import path
from .api_views import ClaudeChatView  # Importing from the same app directory
from .views import ChatPageView 

urlpatterns = [
    path('api/chat/', ClaudeChatView.as_view(), name='claude_chat'),
    path('chat/', ChatPageView.as_view(), name='chat_page'),
]