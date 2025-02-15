// Base API functionality for data processing
// Partial implementation - will be completed with full state management in Chat 2

const API_BASE = '/api';
const CSRF_TOKEN = document.querySelector('[name=csrfmiddlewaretoken]')?.value;

/**
 * Enhanced fetch wrapper with error handling and CSRF protection
 */
const apiFetch = async (endpoint, options = {}) => {
    const defaultHeaders = {
        'X-CSRFToken': CSRF_TOKEN
    };

    // Only set Content-Type for non-FormData requests
    if (!(options.body instanceof FormData)) {
        defaultHeaders['Content-Type'] = 'application/json';
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers: {
            ...defaultHeaders,
            ...(options.headers || {})
        },
        credentials: 'include'  // Include cookies for CSRF
    });

    // Handle different response types
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
        if (data.error) {
            throw new Error(data.error);
        }
        throw new Error(response.statusText);
    }

    return data;
};

/**
 * Data processing API endpoints
 */
export const dataProcessingApi = {
    /**
     * Analyze a file and return its structure
     * @param {File} file - The file to analyze
     * @returns {Promise<Object>} Analysis results
     */
    analyzeFile: async (file) => {
        const formData = new FormData();
        formData.append('file', file);

        return apiFetch('/data-processing/analyze_file/', {
            method: 'POST',
            body: formData
        });
    },

    /**
     * Detect data types for a file or content
     * @param {File|string} input - File object or content string
     * @param {boolean} isFile - Whether the input is a file
     * @returns {Promise<Object>} Type detection results
     */
    detectTypes: async (input, isFile = true) => {
        if (isFile) {
            const formData = new FormData();
            formData.append('file', input);
            return apiFetch('/data-processing/detect_types/', {
                method: 'POST',
                body: formData
            });
        }

        return apiFetch('/data-processing/detect_types/', {
            method: 'POST',
            body: JSON.stringify({ content: input })
        });
    },

    /**
     * Validate import configuration
     * @param {Object} config - Import configuration
     * @returns {Promise<Object>} Validation results
     */
    validateConfig: async (config) => {
        return apiFetch('/data-processing/validate_config/', {
            method: 'POST',
            body: JSON.stringify(config)
        });
    },

    /**
     * Process a chunk of data
     * @param {Object} params - Processing parameters
     * @param {string} params.chunk - Data chunk to process
     * @param {Object} params.config - Processing configuration
     * @param {number} params.importId - Import ID
     * @returns {Promise<Object>} Processing results
     */
    processChunk: async ({ chunk, config, importId }) => {
        return apiFetch('/data-processing/process_chunk/', {
            method: 'POST',
            body: JSON.stringify({
                chunk,
                config,
                import_id: importId
            })
        });
    },

    /**
     * Validate processed data
     * @param {Object} params - Validation parameters
     * @param {Array} params.data - Data to validate
     * @param {Object} params.validations - Validation rules
     * @returns {Promise<Object>} Validation results
     */
    validateData: async ({ data, validations }) => {
        return apiFetch('/data-processing/validate_data/', {
            method: 'POST',
            body: JSON.stringify({
                data,
                validations
            })
        });
    }
};

export default {
    apiFetch,
    dataProcessingApi
};