// api.js
// Enhanced API interface with initialization safety

import { State } from './state.js';

const API_STATE_KEY = 'api_state';

const API_ERROR_TYPES = {
    VALIDATION: 'validation_error',
    PERMISSION: 'permission_error',
    NOT_FOUND: 'not_found',
    NETWORK: 'network_error',
    SERVER: 'server_error',
    UNKNOWN: 'unknown_error'
};

class APIError extends Error {
    constructor(type, message, response, data = null) {
        super(message);
        this.name = 'APIError';
        this.type = type;
        this.response = response;
        this.data = data;
        this.status = response?.status;
        this.timestamp = new Date();
    }

    isRetryable() {
        return [408, 429, 502, 503, 504].includes(this.status) || 
               this.type === API_ERROR_TYPES.NETWORK;
    }
}

const API_CONFIG = {
    basePath: '/api',
    headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
    },
    credentials: 'include',
    retryCount: 0,
    maxRetries: 3,
    retryDelay: 1000,
    timeout: 30000
};

class APIClient {
    constructor() {
        this.initialized = false;
        this.pendingRequests = new Set();
        this.config = { ...API_CONFIG };
    }

    async initialize() {
        if (this.initialized) {
            console.warn('API client already initialized');
            return;
        }

        try {
            // Verify State dependency
            if (!State.isInitialized()) {
                throw new Error('State must be initialized before API');
            }

            // Initialize API state
            State.set(API_STATE_KEY, {
                loading: false,
                pendingRequests: new Set(),
                lastResponse: null,
                error: null,
                retries: null,
                lastUpdate: new Date()
            });

            this.initialized = true;
            console.log('API client initialized');

        } catch (error) {
            console.error('API client initialization failed:', error);
            throw error;
        }
    }

    isInitialized() {
        return this.initialized;
    }

    async request(endpoint, options = {}) {
        if (!this.initialized) {
            throw new Error('API client must be initialized before use');
        }

        const requestId = `${endpoint}_${Date.now()}`;
        this.pendingRequests.add(requestId);

        try {
            // Update loading state
            this.updateState({
                loading: true,
                endpoint,
                method: options.method || 'GET',
                requestId
            });

            const config = {
                ...this.config,
                ...options,
                headers: {
                    ...this.config.headers,
                    ...(options.headers || {})
                }
            };

            // Don't set Content-Type for FormData
            if (options.body instanceof FormData) {
                delete config.headers['Content-Type'];
            }

            const url = this.buildUrl(endpoint);
            const response = await this.sendRequest(url, config);
            return await this.handleResponse(response);

        } catch (error) {
            if (!(error instanceof APIError)) {
                error = new APIError(
                    API_ERROR_TYPES.NETWORK,
                    'Network error occurred',
                    { status: 0 }
                );
            }

            if (error.isRetryable() && (!options.retryCount || options.retryCount < this.config.maxRetries)) {
                return this.retryRequest(endpoint, options, error);
            }

            this.handleError(error);
            throw error;

        } finally {
            this.pendingRequests.delete(requestId);
            if (this.pendingRequests.size === 0) {
                this.updateState({ loading: false });
            }
        }
    }

    async sendRequest(url, config) {
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
                reject(new APIError(
                    API_ERROR_TYPES.NETWORK,
                    'Request timeout',
                    { status: 408 }
                ));
            }, this.config.timeout);
        });

        return Promise.race([
            fetch(url, config),
            timeoutPromise
        ]);
    }

    async retryRequest(endpoint, options, error) {
        const retryCount = (options.retryCount || 0) + 1;
        const delay = this.config.retryDelay * retryCount;

        this.updateState({
            retries: {
                endpoint,
                count: retryCount,
                error: error.message,
                timestamp: new Date()
            }
        });

        await new Promise(resolve => setTimeout(resolve, delay));

        return this.request(endpoint, {
            ...options,
            retryCount
        });
    }

    async handleResponse(response) {
        if (!response.ok) {
            let errorType = API_ERROR_TYPES.UNKNOWN;
            let errorData = null;
            let errorMessage = response.statusText;

            try {
                if (response.headers.get('content-type')?.includes('application/json')) {
                    errorData = await response.json();
                    errorMessage = errorData.detail || errorData.message || errorMessage;
                }

                switch (response.status) {
                    case 400: errorType = API_ERROR_TYPES.VALIDATION; break;
                    case 403: errorType = API_ERROR_TYPES.PERMISSION; break;
                    case 404: errorType = API_ERROR_TYPES.NOT_FOUND; break;
                    case 500: errorType = API_ERROR_TYPES.SERVER; break;
                }
            } catch (error) {
                console.error('Error parsing error response:', error);
            }

            throw new APIError(errorType, errorMessage, response, errorData);
        }

        const contentType = response.headers.get('content-type');
        if (contentType?.includes('application/json')) {
            const data = await response.json();
            
            if (data.hasOwnProperty('results') && data.hasOwnProperty('count')) {
                return {
                    data: data.results,
                    total: data.count,
                    hasMore: data.next !== null,
                    page: {
                        current: data.current_page,
                        total: data.total_pages,
                        size: data.page_size
                    }
                };
            }
            
            return data;
        } else if (response.status === 204) {
            return null;
        } else {
            return await response.text();
        }
    }

    buildUrl(endpoint) {
        if (endpoint.startsWith('http')) return endpoint;
        const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
        return `${this.config.basePath}${cleanEndpoint}`;
    }

    updateState(update) {
        console.log('API State Update:', update);
        State.update(API_STATE_KEY, {
            ...update,
            lastUpdate: new Date()
        });
    }

    handleError(error) {
        console.error('API Error:', error);
        
        this.updateState({
            error: {
                type: error.type,
                message: error.message,
                timestamp: new Date()
            }
        });
    }

    destroy() {
        if (!this.initialized) return;

        try {
            this.pendingRequests.clear();

            State.update(API_STATE_KEY, {
                loading: false,
                pendingRequests: new Set(),
                lastResponse: null,
                error: null,
                retries: null,
                lastUpdate: new Date()
            });

            this.initialized = false;
            console.log('API client destroyed');

        } catch (error) {
            console.error('Error destroying API client:', error);
        }
    }
}

// Create singleton instance
const client = new APIClient();

// Export error types and classes
export {
    APIError,
    API_ERROR_TYPES
};

// Export combined API interface
export const API = {
    // Base methods
    initialize: () => client.initialize(),
    isInitialized: () => client.isInitialized(),

    // Project endpoints
    Projects: {
        list: (params = {}) => 
            client.request('projects/', {
                method: 'GET',
                params: {
                    offset: params.offset || 0,
                    limit: params.limit || 20,
                    filter: params.filter || '',
                    ordering: params.ordering || '-created_at'
                }
            }),

        get: (id) => 
            client.request(`projects/${id}/`),

        create: (data) => 
            client.request('projects/', {
                method: 'POST',
                body: JSON.stringify(data)
            }),

        update: (id, data) => 
            client.request(`projects/${id}/`, {
                method: 'PATCH',
                body: JSON.stringify(data)
            }),

        delete: (id) => 
            client.request(`projects/${id}/`, {
                method: 'DELETE'
            }),

        getChildren: (id, params = {}) => 
            client.request(`projects/${id}/children/`, {
                params: {
                    offset: params.offset || 0,
                    limit: params.limit || 20,
                    filter: params.filter || ''
                }
            })
    },

    // Location endpoints
    Locations: {
        list: (params = {}) => 
            client.request('locations/', {
                params: {
                    project: params.project,
                    offset: params.offset || 0,
                    limit: params.limit || 20,
                    filter: params.filter || '',
                    ordering: params.ordering || 'name'
                }
            }),

        get: (id) => 
            client.request(`locations/${id}/`),

        create: (data) => 
            client.request('locations/', {
                method: 'POST',
                body: JSON.stringify(data)
            }),

        update: (id, data) => 
            client.request(`locations/${id}/`, {
                method: 'PATCH',
                body: JSON.stringify(data)
            }),

        delete: (id) => 
            client.request(`locations/${id}/`, {
                method: 'DELETE'
            }),

        getChildren: (id, params = {}) => 
            client.request(`locations/${id}/children/`, {
                params: {
                    offset: params.offset || 0,
                    limit: params.limit || 20,
                    filter: params.filter || ''
                }
            })
    },

    // Measurement endpoints
    Measurements: {
        list: (params = {}) => 
            client.request('measurements/', {
                params: {
                    location: params.location,
                    type: params.type,
                    offset: params.offset || 0,
                    limit: params.limit || 20,
                    filter: params.filter || '',
                    ordering: params.ordering || '-created_at'
                }
            }),

        get: (id) => 
            client.request(`measurements/${id}/`),

        create: (data) => 
            client.request('measurements/', {
                method: 'POST',
                body: JSON.stringify(data)
            }),

        update: (id, data) => 
            client.request(`measurements/${id}/`, {
                method: 'PATCH',
                body: JSON.stringify(data)
            }),

        delete: (id) => 
            client.request(`measurements/${id}/`, {
                method: 'DELETE'
            })
    },

    // Model field endpoints
    ModelFields: {
        getFields: () => client.request('fields/'),
        getValidationRules: () => client.request('fields/validation/'),
        getDependencies: () => client.request('fields/dependencies/')
    },

    // Convenience methods
    get: (endpoint, params) => client.request(endpoint, { method: 'GET', params }),
    post: (endpoint, data) => client.request(endpoint, { method: 'POST', body: JSON.stringify(data) }),
    patch: (endpoint, data) => client.request(endpoint, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (endpoint) => client.request(endpoint, { method: 'DELETE' }),

    // State management
    getState: () => State.get(API_STATE_KEY),
    isLoading: () => State.get(API_STATE_KEY)?.loading || false,
    getLastError: () => State.get(API_STATE_KEY)?.error || null,

    // Cleanup
    destroy: () => client.destroy()
};