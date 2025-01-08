from abc import ABC, abstractmethod
import requests
from datetime import datetime, timedelta
from typing import Dict, Any, Optional
from ..models import APIDataSource

class SourceClient(ABC):
    """Abstract base class for all source clients"""
    
    def __init__(self, source: 'APIDataSource'):
        self.source = source
        self.session = self._create_session()
        
    @abstractmethod
    def _create_session(self) -> requests.Session:
        """Create and configure requests session for the source"""
        pass
        
    @abstractmethod
    def get_point_value(self, identifiers: Dict[str, Any]) -> float:
        """Get current value for a point"""
        pass
        
    @abstractmethod
    def get_historical_data(self, identifiers: Dict[str, Any], 
                          start_time: datetime, 
                          end_time: datetime) -> list:
        """Get historical data for a point"""
        pass

class NiagaraClient(SourceClient):
    def _create_session(self) -> requests.Session:
        session = requests.Session()
        
        auth_type = self.source.auth_type
        if auth_type == 'basic':
            session.auth = (
                self.source.configuration.get('username'),
                self.source.configuration.get('password')
            )
        elif auth_type == 'bearer':
            session.headers['Authorization'] = f"Bearer {self.source.configuration.get('token')}"
            
        return session
        
    def get_point_value(self, identifiers: Dict[str, Any]) -> float:
        station = identifiers['station_name']
        point_path = identifiers['point_path']
        
        url = f"{self.source.url_base}/stations/{station}/points/{point_path}/value"
        response = self.session.get(url)
        response.raise_for_status()
        
        return float(response.json()['value'])

    def get_historical_data(self, identifiers: Dict[str, Any],
                          start_time: datetime,
                          end_time: datetime) -> list:
        # Implementation for historical data retrieval
        pass

class EcoStruxureClient(SourceClient):
    def _create_session(self) -> requests.Session:
        session = requests.Session()
        # Configure EcoStruxure-specific authentication
        return session
        
    def get_point_value(self, identifiers: Dict[str, Any]) -> float:
        server_id = identifiers['server_id']
        device_id = identifiers['device_id']
        point_id = identifiers['point_id']
        
        url = f"{self.source.url_base}/servers/{server_id}/devices/{device_id}/points/{point_id}"
        response = self.session.get(url)
        response.raise_for_status()
        
        return float(response.json()['presentValue'])

class MetasysClient(SourceClient):
    def _create_session(self) -> requests.Session:
        session = requests.Session()
        # Configure Metasys-specific authentication
        return session
        
    def get_point_value(self, identifiers: Dict[str, Any]) -> float:
        # Implementation for Metasys point retrieval
        pass

class DesigoClient(SourceClient):
    def _create_session(self) -> requests.Session:
        session = requests.Session()
        # Configure Desigo-specific authentication
        return session
        
    def get_point_value(self, identifiers: Dict[str, Any]) -> float:
        # Implementation for Desigo point retrieval
        pass

def get_source_client(source: 'APIDataSource') -> SourceClient:
    """Factory function to create appropriate client for a source"""
    
    clients = {
        'niagara': NiagaraClient,
        'ecostruxure': EcoStruxureClient,
        'metasys': MetasysClient,
        'desigo': DesigoClient
    }
    
    client_class = clients.get(source.middleware_type)
    if not client_class:
        raise ValueError(f"No client implementation for middleware type: {source.middleware_type}")
        
    return client_class(source)