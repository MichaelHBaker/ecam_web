// api.js
// API interface module for ECAM Web

// Get CSRF token from the DOM
const CSRF_TOKEN = document.querySelector('[name=csrfmiddlewaretoken]')?.value;
if (!CSRF_TOKEN) {
    console.warn('CSRF token not found in the DOM');
}

/**
 * Configuration object for API calls
 */
const API_CONFIG = {
    basePath: '/api',
    headers: {
        'X-CSRFToken': CSRF_TOKEN,
        'Content-Type': 'application/json'
    },
    credentials: 'include'
};

/**
 * Error class for API responses
 */
export class APIError extends Error {
    constructor(message, response, data) {
        super(message);
        this.name = 'APIError';
        this.response = response;
        this.data = data;
        this.status = response.status;
    }
}

/**
 * Core API client with error handling and request configuration
 */
export const APIClient = {
    /**
     * Send API request
     * @param {string} endpoint - API endpoint
     * @param {Object} options - Fetch options
     * @returns {Promise} API response
     */
    async request(endpoint, options = {}) {
        const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
        const url = `${API_CONFIG.basePath}${cleanEndpoint}`;
        
        // Prepare request options
        const requestOptions = {
            ...API_CONFIG,
            ...options,
            headers: {
                ...API_CONFIG.headers,
                ...(options.headers || {})
            }
        };

        // Don't set Content-Type for FormData
        if (options.body instanceof FormData) {
            delete requestOptions.headers['Content-Type'];
        }

        try {
            const response = await fetch(url, requestOptions);
            return this._handleResponse(response);
        } catch (error) {
            throw new APIError(
                'Network error occurred',
                { status: 0, statusText: error.message },
                null
            );
        }
    },

    /**
     * Handle API response
     * @private
     */
    async _handleResponse(response) {
        const contentType = response.headers.get('content-type');
        let data;

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
    },

    /**
     * GET request
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
     * POST request
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
     * PATCH request
     * @param {string} endpoint - API endpoint
     * @param {Object} data - Request data
     * @returns {Promise} API response
     */
    async patch(endpoint, data) {
        return this.request(endpoint, {
            method: 'PATCH',
            body: JSON.stringify(data)
        });
    },

    /**
     * DELETE request
     * @param {string} endpoint - API endpoint
     * @returns {Promise} API response
     */
    async delete(endpoint) {
        return this.request(endpoint, { method: 'DELETE' });
    }
};

/**
 * Domain-specific API endpoints
 */
export const API = {
    Projects: {
        list: () => APIClient.get('/projects/'),
        get: (id) => APIClient.get(`/projects/${id}/`),
        create: (data) => APIClient.post('/projects/', data),
        update: (id, data) => APIClient.patch(`/projects/${id}/`, data),
        delete: (id) => APIClient.delete(`/projects/${id}/`),
        getAccess: (id) => APIClient.get(`/projects/${id}/access/`),
        grantAccess: (id, userId) => APIClient.post(`/projects/${id}/grant-access/`, { user_id: userId }),
        revokeAccess: (id, userId) => APIClient.post(`/projects/${id}/revoke-access/`, { user_id: userId })
    },

    Locations: {
        list: (projectId) => APIClient.get('/locations/', { project: projectId }),
        get: (id) => APIClient.get(`/locations/${id}/`),
        create: (data) => APIClient.post('/locations/', data),
        update: (id, data) => APIClient.patch(`/locations/${id}/`, data),
        delete: (id) => APIClient.delete(`/locations/${id}/`),
        getMeasurements: (id) => APIClient.get(`/locations/${id}/measurements/`),
        getStats: (id) => APIClient.get(`/locations/${id}/stats/`)
    },

    Measurements: {
        list: (locationId) => APIClient.get('/measurements/', { location: locationId }),
        get: (id) => APIClient.get(`/measurements/${id}/`),
        create: (data) => APIClient.post('/measurements/', data),
        update: (id, data) => APIClient.patch(`/measurements/${id}/`, data),
        delete: (id) => APIClient.delete(`/measurements/${id}/`),
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
        delete: (id) => APIClient.delete(`/datasets/${id}/`),
        analyze: (id, config) => APIClient.post(`/datasets/${id}/analyze/`, config)
    },

    DataSources: {
        list: (projectId) => APIClient.get('/data-sources/', { project: projectId }),
        get: (id) => APIClient.get(`/data-sources/${id}/`),
        create: (data) => APIClient.post('/data-sources/', data),
        update: (id, data) => APIClient.patch(`/data-sources/${id}/`, data),
        delete: (id) => APIClient.delete(`/data-sources/${id}/`),
        getConfig: (id) => APIClient.get(`/data-sources/${id}/config/`),
        saveConfig: (id, config) => APIClient.post(`/data-sources/${id}/config/`, config)
    },

    ModelFields: {
        list: () => APIClient.get('/model-fields/'),
        getValidationRules: () => APIClient.get('/model-fields/validation-rules/'),
        getDependencies: () => APIClient.get('/model-fields/dependencies/')
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