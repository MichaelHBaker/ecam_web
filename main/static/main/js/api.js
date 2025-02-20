// api.js
// Enhanced API interface aligned with Django TreeNodeViewSet

import { State } from './state.js';

const API_STATE_KEY = 'api_state';

/**
 * API Error Types based on Django response patterns
 */
const API_ERROR_TYPES = {
    VALIDATION: 'validation_error',
    PERMISSION: 'permission_error',
    NOT_FOUND: 'not_found',
    NETWORK: 'network_error',
    SERVER: 'server_error',
    UNKNOWN: 'unknown_error'
};

/**
 * Enhanced API Error class
 */
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

    /**
     * Format validation errors from Django
     * @returns {Object} Formatted errors
     */
    getValidationErrors() {
        if (this.type !== API_ERROR_TYPES.VALIDATION || !this.data) {
            return null;
        }

        // Handle Django validation error format
        const errors = {};
        Object.entries(this.data).forEach(([field, messages]) => {
            errors[field] = Array.isArray(messages) ? messages : [messages];
        });

        return errors;
    }

    /**
     * Check if error is retryable
     * @returns {boolean}
     */
    isRetryable() {
        return [
            408, // Request Timeout
            429, // Too Many Requests
            502, // Bad Gateway
            503, // Service Unavailable
            504  // Gateway Timeout
        ].includes(this.status) || this.type === API_ERROR_TYPES.NETWORK;
    }

    /**
     * Format error for logging
     * @returns {Object}
     */
    toLog() {
        return {
            type: this.type,
            message: this.message,
            status: this.status,
            timestamp: this.timestamp,
            data: this.data,
            stack: this.stack
        };
    }
}

/**
 * Enhanced CSRF token management
 */
const CSRFManager = {
    token: null,

    /**
     * Get CSRF token with validation
     * @returns {string|null}
     */
    getToken() {
        if (this.token) return this.token;

        const tokenElement = document.querySelector('[name=csrfmiddlewaretoken]');
        if (tokenElement) {
            this.token = tokenElement.value;
            return this.token;
        }

        const cookieToken = this.getTokenFromCookie();
        if (cookieToken) {
            this.token = cookieToken;
            return this.token;
        }

        console.warn('CSRF token not found');
        return null;
    },

    /**
     * Get token from Django CSRF cookie
     * @private
     */
    getTokenFromCookie() {
        const cookieName = 'csrftoken';
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${cookieName}=`);
        if (parts.length === 2) {
            return parts.pop().split(';').shift();
        }
        return null;
    },

    /**
     * Reset stored token
     */
    reset() {
        this.token = null;
    }
};

/**
 * API Configuration
 */
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
        method: config.method,
        timestamp: new Date()
    });

    // Add CSRF token
    const token = CSRFManager.getToken();
    if (token) {
        config.headers['X-CSRFToken'] = token;
    }

    // Add Django expected headers for AJAX
    config.headers['X-Requested-With'] = 'XMLHttpRequest';

    // Handle query parameters
    if (config.params) {
        const params = new URLSearchParams();
        Object.entries(config.params).forEach(([key, value]) => {
            if (value !== null && value !== undefined) {
                if (Array.isArray(value)) {
                    value.forEach(v => params.append(key, v));
                } else {
                    params.append(key, value);
                }
            }
        });
        config.endpoint += `?${params.toString()}`;
    }

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

    // Handle response based on status
    if (!response.ok) {
        let errorType = API_ERROR_TYPES.UNKNOWN;
        let errorData = null;
        let errorMessage = response.statusText;

        try {
            const contentType = response.headers.get('content-type');
            if (contentType?.includes('application/json')) {
                errorData = await response.json();
                errorMessage = errorData.detail || errorData.message || errorMessage;
            }

            // Map Django response status to error type
            switch (response.status) {
                case 400:
                    errorType = API_ERROR_TYPES.VALIDATION;
                    break;
                case 403:
                    errorType = API_ERROR_TYPES.PERMISSION;
                    break;
                case 404:
                    errorType = API_ERROR_TYPES.NOT_FOUND;
                    break;
                case 500:
                    errorType = API_ERROR_TYPES.SERVER;
                    break;
            }
        } catch (error) {
            console.error('Error parsing error response:', error);
        }

        throw new APIError(errorType, errorMessage, response, errorData);
    }

    return response;
};

/**
 * Enhanced API client with Django-specific handling
 */
class APIClient {
    constructor(config = {}) {
        this.config = {
            ...API_CONFIG,
            ...config
        };
    }

    /**
     * Send API request with retry logic
     * @param {string} endpoint - API endpoint
     * @param {Object} options - Request options
     * @returns {Promise} API response
     */
    async request(endpoint, options = {}) {
        const config = {
            ...this.config,
            ...options,
            endpoint,
            headers: {
                ...this.config.headers,
                ...(options.headers || {})
            }
        };

        // Don't set Content-Type for FormData
        if (options.body instanceof FormData) {
            delete config.headers['Content-Type'];
        }

        // Process request through interceptor
        const processedConfig = requestInterceptor(config);
        const url = this.buildUrl(processedConfig.endpoint);

        try {
            // Add timeout
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => {
                    reject(new APIError(
                        API_ERROR_TYPES.NETWORK,
                        'Request timeout',
                        { status: 408 }
                    ));
                }, this.config.timeout);
            });

            // Send request with timeout
            const response = await Promise.race([
                fetch(url, processedConfig),
                timeoutPromise
            ]);

            // Process response
            const processedResponse = await responseInterceptor(response);
            return this.handleResponse(processedResponse);

        } catch (error) {
            // Handle network errors
            if (!(error instanceof APIError)) {
                error = new APIError(
                    API_ERROR_TYPES.NETWORK,
                    'Network error occurred',
                    { status: 0 }
                );
            }

            // Retry logic for retryable errors
            if (error.isRetryable() && config.retryCount < this.config.maxRetries) {
                config.retryCount++;
                const delay = this.config.retryDelay * config.retryCount;
                await new Promise(resolve => setTimeout(resolve, delay));
                return this.request(endpoint, config);
            }

            throw error;
        }
    }
    /**
     * Handle API response with Django-specific processing
     * @private
     */
    async handleResponse(response) {
        const contentType = response.headers.get('content-type');
        
        try {
            if (contentType?.includes('application/json')) {
                const data = await response.json();
                
                // Handle Django pagination format
                if (data.hasOwnProperty('results') && data.hasOwnProperty('count')) {
                    return {
                        data: data.results,  // Changed from nodes to data
                        total: data.count,
                        hasMore: data.next !== null,
                        page: {
                            current: data.current_page,
                            total: data.total_pages,
                            size: data.page_size
                        }
                    };
                }
                
                // Handle direct array responses
                if (Array.isArray(data)) {
                    return {
                        data: data,
                        total: data.length,
                        hasMore: false
                    };
                }
                
                // If data already has a 'data' property, return it as is
                if (data.hasOwnProperty('data')) {
                    return data;
                }
                
                // Otherwise, return the data directly
                return data;
            } else if (response.status === 204) {
                return null;
            } else {
                return await response.text();
            }
        } catch (error) {
            throw new APIError(
                API_ERROR_TYPES.UNKNOWN,
                'Error processing response',
                response,
                error
            );
        }
    }

    /**
     * Build full URL for endpoint
     * @private
     */
    buildUrl(endpoint) {
        const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
        return `${this.config.basePath}${cleanEndpoint}`;
    }
}

/**
 * TreeNode API methods aligned with Django ViewSets
 */
const treeNodeAPI = {
    /**
     * Project endpoints
     */
    Projects: {
        /**
         * List projects with filtering and pagination
         * @param {Object} params - Query parameters
         * @returns {Promise} Project list response
         */
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

        /**
         * Get project details
         * @param {string} id - Project ID
         * @returns {Promise} Project details response
         */
        get: (id) => 
            client.request(`projects/${id}/`),

        /**
         * Create new project
         * @param {Object} data - Project data
         * @returns {Promise} Created project response
         */
        create: (data) => 
            client.request('projects/', {
                method: 'POST',
                body: JSON.stringify(data)
            }),

        /**
         * Update project
         * @param {string} id - Project ID
         * @param {Object} data - Update data
         * @returns {Promise} Updated project response
         */
        update: (id, data) => 
            client.request(`projects/${id}/`, {
                method: 'PATCH',
                body: JSON.stringify(data)
            }),

        /**
         * Delete project
         * @param {string} id - Project ID
         * @returns {Promise} Delete response
         */
        delete: (id) => 
            client.request(`projects/${id}/`, {
                method: 'DELETE'
            }),

        /**
         * Get project children (locations)
         * @param {string} id - Project ID
         * @param {Object} params - Query parameters
         * @returns {Promise} Children response
         */
        getChildren: (id, params = {}) => 
            client.request(`projects/${id}/children/`, {
                params: {
                    offset: params.offset || 0,
                    limit: params.limit || 20,
                    filter: params.filter || ''
                }
            }),

        /**
         * Get project access information
         * @param {string} id - Project ID
         * @returns {Promise} Access response
         */
        getAccess: (id) => 
            client.request(`projects/${id}/access/`),

        /**
         * Grant project access
         * @param {string} id - Project ID
         * @param {string} userId - User ID
         * @returns {Promise} Grant response
         */
        grantAccess: (id, userId) => 
            client.request(`projects/${id}/grant-access/`, {
                method: 'POST',
                body: JSON.stringify({ user_id: userId })
            }),

        /**
         * Revoke project access
         * @param {string} id - Project ID
         * @param {string} userId - User ID
         * @returns {Promise} Revoke response
         */
        revokeAccess: (id, userId) => 
            client.request(`projects/${id}/revoke-access/`, {
                method: 'POST',
                body: JSON.stringify({ user_id: userId })
            })
    },
    /**
     * Location endpoints
     */
    Locations: {
        /**
         * List locations with filtering and pagination
         * @param {Object} params - Query parameters
         * @returns {Promise} Location list response
         */
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

        /**
         * Get location details
         * @param {string} id - Location ID
         * @returns {Promise} Location details response
         */
        get: (id) => 
            client.request(`locations/${id}/`),

        /**
         * Create new location
         * @param {Object} data - Location data
         * @returns {Promise} Created location response
         */
        create: (data) => 
            client.request('locations/', {
                method: 'POST',
                body: JSON.stringify(data)
            }),

        /**
         * Update location
         * @param {string} id - Location ID
         * @param {Object} data - Update data
         * @returns {Promise} Updated location response
         */
        update: (id, data) => 
            client.request(`locations/${id}/`, {
                method: 'PATCH',
                body: JSON.stringify(data)
            }),

        /**
         * Delete location
         * @param {string} id - Location ID
         * @returns {Promise} Delete response
         */
        delete: (id) => 
            client.request(`locations/${id}/`, {
                method: 'DELETE'
            }),

        /**
         * Get location children (measurements)
         * @param {string} id - Location ID
         * @param {Object} params - Query parameters
         * @returns {Promise} Children response
         */
        getChildren: (id, params = {}) => 
            client.request(`locations/${id}/children/`, {
                params: {
                    offset: params.offset || 0,
                    limit: params.limit || 20,
                    filter: params.filter || '',
                    type: params.type || ''
                }
            }),

        /**
         * Get location statistics
         * @param {string} id - Location ID
         * @returns {Promise} Statistics response
         */
        getStats: (id) => 
            client.request(`locations/${id}/stats/`)
    },

    /**
     * Measurement endpoints
     */
    Measurements: {
        /**
         * List measurements with filtering and pagination
         * @param {Object} params - Query parameters
         * @returns {Promise} Measurement list response
         */
        list: (params = {}) => 
            client.request('measurements/', {
                params: {
                    location: params.location,
                    category: params.category,
                    type: params.type,
                    offset: params.offset || 0,
                    limit: params.limit || 20,
                    filter: params.filter || '',
                    ordering: params.ordering || 'name'
                }
            }),

        /**
         * Get measurement details
         * @param {string} id - Measurement ID
         * @returns {Promise} Measurement details response
         */
        get: (id) => 
            client.request(`measurements/${id}/`),

        /**
         * Create new measurement
         * @param {Object} data - Measurement data
         * @returns {Promise} Created measurement response
         */
        create: (data) => 
            client.request('measurements/', {
                method: 'POST',
                body: JSON.stringify(data)
            }),

        /**
         * Update measurement
         * @param {string} id - Measurement ID
         * @param {Object} data - Update data
         * @returns {Promise} Updated measurement response
         */
        update: (id, data) => 
            client.request(`measurements/${id}/`, {
                method: 'PATCH',
                body: JSON.stringify(data)
            }),

        /**
         * Delete measurement
         * @param {string} id - Measurement ID
         * @returns {Promise} Delete response
         */
        delete: (id) => 
            client.request(`measurements/${id}/`, {
                method: 'DELETE'
            }),

        /**
         * Get measurement timeseries data
         * @param {string} id - Measurement ID
         * @param {Object} params - Query parameters
         * @returns {Promise} Timeseries response
         */
        getTimeseries: (id, params = {}) => 
            client.request(`measurements/${id}/timeseries/`, {
                params: {
                    start: params.start,
                    end: params.end,
                    interval: params.interval || 'hour',
                    aggregate: params.aggregate || 'avg'
                }
            }),

        /**
         * Get measurement type choices
         * @returns {Promise} Choices response
         */
        getChoices: () => 
            client.request('measurements/choices/')
    }
};
/**
 * Model fields API for form building
 */
const modelFieldsAPI = {
    /**
     * Get field definitions for all models
     * @returns {Promise} Field definitions response
     */
    getFields: () => 
        client.request('fields/'),

    /**
     * Get validation rules
     * @returns {Promise} Validation rules response
     */
    getValidationRules: () => 
        client.request('fields/validation-rules/'),

    /**
     * Get field dependencies
     * @returns {Promise} Dependencies response
     */
    getDependencies: () => 
        client.request('fields/dependencies/')
};

/**
 * Initialize API client with configuration
 */
const client = new APIClient({
    onError: (error) => {
        // Update global error state
        State.update(API_STATE_KEY, {
            error: {
                type: error.type,
                message: error.message,
                timestamp: new Date()
            }
        });

        // Log error details
        console.error('API Error:', error.toLog());
    },

    onRetry: (endpoint, retryCount) => {
        // Update retry state
        State.update(API_STATE_KEY, {
            retries: {
                endpoint,
                count: retryCount,
                timestamp: new Date()
            }
        });

        console.warn(`Retrying request to ${endpoint} (attempt ${retryCount})`);
    }
});

// Initialize API state
State.set(API_STATE_KEY, {
    loading: false,
    lastResponse: null,
    error: null,
    retries: null
});

/**
 * API module exports
 */
export {
    APIError,
    API_ERROR_TYPES,
    CSRFManager
};

/**
 * Export combined API interface
 */
export const API = {
    ...treeNodeAPI,
    ModelFields: modelFieldsAPI,

    // General convenience methods
    get: (endpoint, params) => client.request(endpoint, { method: 'GET', params }),
    post: (endpoint, data) => client.request(endpoint, { method: 'POST', body: JSON.stringify(data) }),
    patch: (endpoint, data) => client.request(endpoint, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (endpoint) => client.request(endpoint, { method: 'DELETE' }),

    /**
     * Reset API client state
     */
    reset: () => {
        CSRFManager.reset();
        State.update(API_STATE_KEY, {
            loading: false,
            lastResponse: null,
            error: null,
            retries: null
        });
    },

    /**
     * Get current API state
     * @returns {Object} Current API state
     */
    getState: () => State.get(API_STATE_KEY),

    /**
     * Check if API is currently loading
     * @returns {boolean} Loading state
     */
    isLoading: () => State.get(API_STATE_KEY)?.loading || false,

    /**
     * Get last API error if any
     * @returns {Object|null} Last error
     */
    getLastError: () => State.get(API_STATE_KEY)?.error || null,

    /**
     * Subscribe to API state changes
     * @param {Function} callback - State change callback
     * @returns {Function} Unsubscribe function
     */
    subscribe: (callback) => State.subscribe(API_STATE_KEY, callback)
};