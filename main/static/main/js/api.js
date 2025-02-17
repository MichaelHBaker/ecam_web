// api.js
// Enhanced API interface module with improved error handling and state management

import { State } from './state.js';

// Constants
const API_STATE_KEY = 'api_state';
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

/**
 * Get CSRF token with validation
 * @returns {string|null}
 */
const getCSRFToken = () => {
    const token = document.querySelector('[name=csrfmiddlewaretoken]')?.value;
    if (!token) {
        console.warn('CSRF token not found in the DOM');
        return null;
    }
    return token;
};

/**
 * Configuration object for API calls
 */
const API_CONFIG = {
    basePath: '/api',
    headers: {
        'X-CSRFToken': getCSRFToken(),
        'Content-Type': 'application/json'
    },
    credentials: 'include',
    retryCount: 0
};

/**
 * Enhanced error class for API responses
 */
export class APIError extends Error {
    constructor(message, response, data) {
        super(message);
        this.name = 'APIError';
        this.response = response;
        this.data = data;
        this.status = response.status;
        this.timestamp = new Date();
        this.retryable = this.isRetryable();
    }

    /**
     * Determine if error is retryable
     * @returns {boolean}
     */
    isRetryable() {
        return [408, 429, 502, 503, 504].includes(this.status) || 
               this.status === 0; // Network error
    }

    /**
     * Format error for logging
     * @returns {Object}
     */
    toLog() {
        return {
            name: this.name,
            message: this.message,
            status: this.status,
            timestamp: this.timestamp,
            data: this.data,
            stack: this.stack
        };
    }
}

/**
 * Request interceptor for preprocessing requests
 * @param {Object} config - Request configuration
 * @returns {Object} Modified configuration
 */
const requestInterceptor = (config) => {
    // Update loading state
    State.update(API_STATE_KEY, {
        loading: true,
        endpoint: config.endpoint,
        method: config.method
    });

    // Refresh CSRF token
    config.headers['X-CSRFToken'] = getCSRFToken();
    
    return config;
};

/**
 * Response interceptor for preprocessing responses
 * @param {Response} response - Fetch response
 * @returns {Promise} Processed response
 */
const responseInterceptor = async (response) => {
    // Update loading state
    State.update(API_STATE_KEY, {
        loading: false,
        lastResponse: {
            status: response.status,
            timestamp: new Date()
        }
    });

    return response;
};

/**
 * Enhanced API client with error handling and request configuration
 */
export const APIClient = {
    /**
     * Send API request with retry logic
     * @param {string} endpoint - API endpoint
     * @param {Object} options - Fetch options
     * @returns {Promise} API response
     */
    async request(endpoint, options = {}) {
        const config = {
            ...API_CONFIG,
            ...options,
            endpoint,
            headers: {
                ...API_CONFIG.headers,
                ...(options.headers || {})
            }
        };

        // Don't set Content-Type for FormData
        if (options.body instanceof FormData) {
            delete config.headers['Content-Type'];
        }

        // Process request through interceptor
        const processedConfig = requestInterceptor(config);
        const cleanEndpoint = processedConfig.endpoint.startsWith('/') ? 
            processedConfig.endpoint : 
            `/${processedConfig.endpoint}`;
        const url = `${API_CONFIG.basePath}${cleanEndpoint}`;

        try {
            const response = await fetch(url, processedConfig);
            const interceptedResponse = await responseInterceptor(response);
            return this._handleResponse(interceptedResponse);
        } catch (error) {
            const apiError = new APIError(
                'Network error occurred',
                { status: 0, statusText: error.message },
                null
            );

            // Retry logic for retryable errors
            if (apiError.retryable && config.retryCount < MAX_RETRIES) {
                config.retryCount++;
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * config.retryCount));
                return this.request(endpoint, config);
            }

            throw apiError;
        }
    },

    /**
     * Enhanced response handler with improved error processing
     * @private
     */
    async _handleResponse(response) {
        const contentType = response.headers.get('content-type');
        let data;

        try {
            if (contentType?.includes('application/json')) {
                data = await response.json();
            } else if (response.status === 204) {
                return null;
            } else {
                data = await response.text();
            }

            if (!response.ok) {
                let message;
                if (response.status === 400 && typeof data === 'object') {
                    message = Object.entries(data)
                        .map(([field, messages]) => {
                            if (Array.isArray(messages)) {
                                return `${field}: ${messages.join(', ')}`;
                            }
                            return `${field}: ${messages}`;
                        })
                        .join('\n');
                } else {
                    message = data.detail || `API Error: ${response.statusText}`;
                }

                throw new APIError(message, response, data);
            }

            return data;
        } catch (error) {
            // Log error details
            console.error('API Response Error:', error.toLog?.() || error);
            throw error;
        }
    },

    /**
     * GET request with query parameter handling
     * @param {string} endpoint - API endpoint
     * @param {Object} [params] - Query parameters
     * @returns {Promise} API response
     */
    async get(endpoint, params = null) {
        const url = params ? 
            `${endpoint}?${new URLSearchParams(params)}` : 
            endpoint;
        return this.request(url, { method: 'GET' });
    },

    /**
     * POST request with improved data handling
     * @param {string} endpoint - API endpoint
     * @param {Object} data - Request data
     * @returns {Promise} API response
     */
    async post(endpoint, data) {
        return this.request(endpoint, {
            method: 'POST',
            body: data instanceof FormData ? data : JSON.stringify(data)
        });
    },

    /**
     * PATCH request with data validation
     * @param {string} endpoint - API endpoint
     * @param {Object} data - Request data
     * @returns {Promise} API response
     */
    async patch(endpoint, data) {
        if (!data || typeof data !== 'object') {
            throw new Error('Invalid data for PATCH request');
        }
        return this.request(endpoint, {
            method: 'PATCH',
            body: JSON.stringify(data)
        });
    },

    /**
     * DELETE request with confirmation option
     * @param {string} endpoint - API endpoint
     * @param {boolean} [confirm=false] - Whether to confirm deletion
     * @returns {Promise} API response
     */
    async delete(endpoint, confirm = false) {
        if (confirm && !window.confirm('Are you sure you want to delete this item?')) {
            throw new Error('Delete operation cancelled by user');
        }
        return this.request(endpoint, { method: 'DELETE' });
    }
};

// Initialize API state in state management
State.set(API_STATE_KEY, {
    loading: false,
    lastResponse: null,
    error: null
});

/**
 * Domain-specific API endpoints with improved error handling
 */
export const API = {
    Projects: {
        list: () => APIClient.get('/projects/'),
        get: (id) => APIClient.get(`/projects/${id}/`),
        create: (data) => APIClient.post('/projects/', data),
        update: (id, data) => APIClient.patch(`/projects/${id}/`, data),
        delete: (id) => APIClient.delete(`/projects/${id}/`, true),
        getAccess: (id) => APIClient.get(`/projects/${id}/access/`),
        grantAccess: (id, userId) => APIClient.post(`/projects/${id}/grant-access/`, { user_id: userId }),
        revokeAccess: (id, userId) => APIClient.post(`/projects/${id}/revoke-access/`, { user_id: userId })
    },

    Locations: {
        list: (projectId) => APIClient.get('/locations/', { project: projectId }),
        get: (id) => APIClient.get(`/locations/${id}/`),
        create: (data) => APIClient.post('/locations/', data),
        update: (id, data) => APIClient.patch(`/locations/${id}/`, data),
        delete: (id) => APIClient.delete(`/locations/${id}/`, true),
        getMeasurements: (id) => APIClient.get(`/locations/${id}/measurements/`),
        getStats: (id) => APIClient.get(`/locations/${id}/stats/`)
    },

    Measurements: {
        list: (locationId) => APIClient.get('/measurements/', { location: locationId }),
        get: (id) => APIClient.get(`/measurements/${id}/`),
        create: (data) => APIClient.post('/measurements/', data),
        update: (id, data) => APIClient.patch(`/measurements/${id}/`, data),
        delete: (id) => APIClient.delete(`/measurements/${id}/`, true),
        getTimeseries: (id, params) => APIClient.get(`/measurements/${id}/timeseries/`, params),
        getChoices: () => APIClient.get('/measurements/choices/')
    },

    DataImports: {
        create: (locationId, file) => {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('location_id', locationId);
            return APIClient.post('/data-imports/', formData);
        },
        get: (id) => APIClient.get(`/data-imports/${id}/`),
        getContent: (id, start, size) => APIClient.post(`/data-imports/${id}/content/`, { start, size }),
        processBatch: (id, config, data) => APIClient.post(`/data-imports/${id}/process-batch/`, { config, data })
    },

    Datasets: {
        list: (sourceId) => APIClient.get('/datasets/', { source: sourceId }),
        get: (id) => APIClient.get(`/datasets/${id}/`),
        create: (data) => APIClient.post('/datasets/', data),
        update: (id, data) => APIClient.patch(`/datasets/${id}/`, data),
        delete: (id) => APIClient.delete(`/datasets/${id}/`, true),
        analyze: (id, config) => APIClient.post(`/datasets/${id}/analyze/`, config)
    },

    DataSources: {
        list: (projectId) => APIClient.get('/data-sources/', { project: projectId }),
        get: (id) => APIClient.get(`/data-sources/${id}/`),
        create: (data) => APIClient.post('/data-sources/', data),
        update: (id, data) => APIClient.patch(`/data-sources/${id}/`, data),
        delete: (id) => APIClient.delete(`/data-sources/${id}/`, true),
        getConfig: (id) => APIClient.get(`/data-sources/${id}/config/`),
        saveConfig: (id, config) => APIClient.post(`/data-sources/${id}/config/`, config)
    },

    Categories: {
        list: () => APIClient.get('/measurement-categories/'),
        get: (id) => APIClient.get(`/measurement-categories/${id}/`),
        getTypes: (id) => APIClient.get(`/measurement-categories/${id}/types/`),
        getMeasurements: (id, params) => APIClient.get(`/measurement-categories/${id}/measurements/`, params),
        getStats: (id) => APIClient.get(`/measurement-categories/${id}/stats/`)
    },

    Types: {
        list: (params) => APIClient.get('/measurement-types/', params),
        get: (id) => APIClient.get(`/measurement-types/${id}/`),
        getUnits: (id) => APIClient.get(`/measurement-types/${id}/units/`),
        getMeasurements: (id, params) => APIClient.get(`/measurement-types/${id}/measurements/`, params),
        getStats: (id) => APIClient.get(`/measurement-types/${id}/stats/`)
    }
};