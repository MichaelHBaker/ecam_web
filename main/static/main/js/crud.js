// CSRF Token for authenticated requests
export const CSRF_TOKEN = document.querySelector('[name=csrfmiddlewaretoken]')?.value || '';
if (!CSRF_TOKEN) {
    console.warn('CSRF token not found in the DOM. Ensure it is included for authenticated requests.');
}

// Helper function to reset fields
const resetFields = (type, id, fields) => {
    fields.forEach((field) => {
        const element = document.getElementById(`id_${type}${field.charAt(0).toUpperCase() + field.slice(1)}-${id}`);
        if (element) {
            element.setAttribute('readonly', 'readonly');
            element.classList.remove('editing');
            if (field !== 'name') {
                element.style.display = "none";
            }
        }
    });

    const editControls = document.getElementById(`id_${type}EditControls-${id}`);
    if (editControls) {
        editControls.style.display = "none";
    }
};

// Generalized API fetch function with improved error handling
export const apiFetch = async (endpoint, options = {}, basePath = '/api') => {
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': CSRF_TOKEN,
        },
        credentials: 'same-origin',
    };

    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const apiEndpoint = `${basePath}${cleanEndpoint}`;

    try {
        const response = await fetch(apiEndpoint, {
            ...defaultOptions,
            ...options,
        });

        const errorData = await response.json().catch(() => ({}));

        if (!response.ok) {
            switch (response.status) {
                case 400:
                    throw new Error('Invalid data provided. Please check your input.');
                case 401:
                    throw new Error('Authentication required. Please log in.');
                case 403:
                    throw new Error('You do not have permission to perform this action.');
                case 404:
                    throw new Error('The requested resource was not found.');
                default:
                    throw new Error(errorData.detail || `API Error: ${response.statusText}`);
            }
        }

        return errorData;
    } catch (error) {
        console.error(`Error fetching ${apiEndpoint}:`, error.message);
        throw error;
    }
};

// Generalized edit function
export const editItem = (type, id, fields) => {
    fields.forEach((field) => {
        const element = document.getElementById(`id_${type}${field.charAt(0).toUpperCase() + field.slice(1)}-${id}`);
        if (!element) {
            console.warn(`Element not found: id_${type}${field.charAt(0).toUpperCase() + field.slice(1)}-${id}`);
            return;
        }

        // Store original value
        element.dataset.originalValue = element.value.trim();
        
        // Make editable
        element.removeAttribute('readonly');
        
        // Make visible
        element.style.display = "inline";
        
        // Add editing style
        element.classList.add('editing');
        
        // Remove w3-input class if present
        element.classList.remove('w3-input');
    });

    // Show edit controls inline
    const editControls = document.getElementById(`id_${type}EditControls-${id}`);
    if (editControls) {
        editControls.style.display = "inline-flex";
    }

    // Focus the name field
    const nameField = document.getElementById(`id_${type}Name-${id}`);
    if (nameField) {
        nameField.focus();
    }
};

// Generalized update function
export const updateItem = async (event, type, id, fields) => {
    event.preventDefault();

    try {
        // Collect data from fields
        const data = {};
        fields.forEach((field) => {
            const element = document.getElementById(`id_${type}${field.charAt(0).toUpperCase() + field.slice(1)}-${id}`);
            if (element) {
                data[field] = element.value.trim();
            }
        });

        console.log('Collected data:', data);

        // Send the update request
        const response = await apiFetch(`/${type}s/${id}/`, {
            method: 'PATCH',
            body: JSON.stringify(data),
        });

        console.log('Update successful:', response);

        // Update original values and reset UI
        fields.forEach((field) => {
            const element = document.getElementById(`id_${type}${field.charAt(0).toUpperCase() + field.slice(1)}-${id}`);
            if (element) {
                element.dataset.originalValue = element.value.trim();
            }
        });

        resetFields(type, id, fields);

    } catch (error) {
        console.error('Error in updateItem:', error);
        // Show user-friendly error message
        const errorMessage = error.message || 'An error occurred while updating. Please try again.';
        alert(errorMessage);
    }
};

// Generalized cancel edit function
export const cancelEdit = (event, type, id, fields) => {
    event.preventDefault();

    fields.forEach((field) => {
        const element = document.getElementById(`id_${type}${field.charAt(0).toUpperCase() + field.slice(1)}-${id}`);
        if (!element) {
            console.warn(`Element not found: id_${type}${field.charAt(0).toUpperCase() + field.slice(1)}-${id}`);
            return;
        }
        
        // Restore original value
        element.value = element.dataset.originalValue;
    });

    resetFields(type, id, fields);
};

// Generalized delete function
export const deleteItem = async (type, id) => {
    if (!confirm('Are you sure you want to delete this item?')) {
        return;
    }

    try {
        await apiFetch(`/${type}s/${id}/`, { method: 'DELETE' });
        console.log('Delete successful');

        // Remove the entire tree item
        const itemElement = document.getElementById(`id_form-${id}`).closest('.tree-item');
        if (itemElement) {
            itemElement.remove();
        } else {
            console.warn(`Tree item for ${type} with ID ${id} not found.`);
        }
    } catch (error) {
        console.error('Delete failed:', error);
        const errorMessage = error.message || 'Failed to delete the item. Please try again.';
        alert(errorMessage);
    }
};