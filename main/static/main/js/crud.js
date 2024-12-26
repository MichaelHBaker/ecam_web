// CSRF Token setup
export const CSRF_TOKEN = document.querySelector('[name=csrfmiddlewaretoken]')?.value || '';
if (!CSRF_TOKEN) {
    console.warn('CSRF token not found in the DOM.');
}

// Model hierarchy configuration - this should match your Django configuration
export const MODEL_FIELDS = {
    'client': {
        level: 1,
        fields: ['name', 'contact_email', 'phone_number'],
        child_type: 'project',
    },
    'project': {
        level: 2,
        fields: ['name', 'project_type', 'start_date', 'end_date'],
        child_type: 'location',
        parent_type: 'client'
    },
    'location': {
        level: 3,
        fields: ['name', 'address', 'latitude', 'longitude'],
        child_type: 'measurement',
        parent_type: 'project'
    },
    'measurement': {
        level: 4,
        fields: ['name', 'description', 'measurement_type'],
        parent_type: 'location'
    }
};

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

// Generalized API fetch function
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

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            const errorMessages = {
                400: 'Invalid data provided. Please check your input.',
                401: 'Authentication required. Please log in.',
                403: 'You do not have permission to perform this action.',
                404: 'The requested resource was not found.'
            };
            throw new Error(errorMessages[response.status] || data.detail || `API Error: ${response.statusText}`);
        }

        return data;
    } catch (error) {
        console.error(`Error fetching ${apiEndpoint}:`, error.message);
        throw error;
    }
};

// Edit function
export const editItem = (type, id, fields) => {
    const modelInfo = MODEL_FIELDS[type];
    if (!modelInfo) {
        console.error(`Unknown item type: ${type}`);
        return;
    }

    fields.forEach((field) => {
        const element = document.getElementById(`id_${type}${field.charAt(0).toUpperCase() + field.slice(1)}-${id}`);
        if (!element) {
            console.warn(`Element not found: id_${type}${field.charAt(0).toUpperCase() + field.slice(1)}-${id}`);
            return;
        }

        element.dataset.originalValue = element.value.trim();
        element.removeAttribute('readonly');
        element.style.display = "inline";
        element.classList.add('editing');
    });

    const editControls = document.getElementById(`id_${type}EditControls-${id}`);
    if (editControls) {
        editControls.style.display = "inline-flex";
    }

    const nameField = document.getElementById(`id_${type}Name-${id}`);
    if (nameField) {
        nameField.focus();
    }
};

// Update function
export const updateItem = async (event, type, id, fields) => {
    event.preventDefault();

    try {
        const modelInfo = MODEL_FIELDS[type];
        if (!modelInfo) {
            throw new Error(`Unknown item type: ${type}`);
        }

        const data = {};
        
        // Collect field data
        fields.forEach((field) => {
            const element = document.getElementById(`id_${type}${field.charAt(0).toUpperCase() + field.slice(1)}-${id}`);
            if (element) {
                data[field] = element.value.trim();
            }
        });

        // Get parent ID if it exists
        const parentIdInput = event.target.querySelector('input[name="parent_id"]');
        if (parentIdInput && modelInfo.parent_type) {
            data[`${modelInfo.parent_type}_id`] = parentIdInput.value;
        }

        const response = await apiFetch(`/${type}s/${id}/`, {
            method: 'PATCH',
            body: JSON.stringify(data),
        });

        // Update original values and reset UI
        fields.forEach((field) => {
            const element = document.getElementById(`id_${type}${field.charAt(0).toUpperCase() + field.slice(1)}-${id}`);
            if (element) {
                element.dataset.originalValue = element.value.trim();
            }
        });

        resetFields(type, id, fields);

        // Update the display name if it changed
        const nameSpan = document.getElementById(`${type}DisplayName-${id}`);
        if (nameSpan && data.name) {
            nameSpan.textContent = data.name;
        }

    } catch (error) {
        console.error('Error in updateItem:', error);
        alert(error.message || 'An error occurred while updating. Please try again.');
    }
};

// Cancel edit function
export const cancelEdit = (event, type, id, fields) => {
    event.preventDefault();

    fields.forEach((field) => {
        const element = document.getElementById(`id_${type}${field.charAt(0).toUpperCase() + field.slice(1)}-${id}`);
        if (!element) {
            console.warn(`Element not found: id_${type}${field.charAt(0).toUpperCase() + field.slice(1)}-${id}`);
            return;
        }
        
        element.value = element.dataset.originalValue;
    });

    resetFields(type, id, fields);
};

// Delete function
export const deleteItem = async (type, id) => {
    if (!confirm('Are you sure you want to delete this item?')) {
        return;
    }

    try {
        await apiFetch(`/${type}s/${id}/`, { method: 'DELETE' });
        
        // Remove the tree item and its container
        const itemElement = document.getElementById(`id_form-${type}-${id}`).closest('.tree-item');
        const containerElement = document.getElementById(`id_${type}-${id}`);
        
        if (itemElement) {
            itemElement.remove();
        }
        if (containerElement) {
            containerElement.remove();
        }
    } catch (error) {
        console.error('Delete failed:', error);
        alert(error.message || 'Failed to delete the item. Please try again.');
    }
};

// Add new item function
export const addItem = async (type, fields, parentName='', parentId = null) => {
    try {
        const modelInfo = MODEL_FIELDS[type];
        if (!modelInfo) {
            throw new Error(`Unknown item type: ${type}`);
        }

        // Fetch schema information
        const schema = await apiFetch(`/${type}s/`, {
            method: 'OPTIONS'
        });
        const fieldInfo = schema.actions.POST;

        // Create temporary container
        const tempId = `temp-new-${type}`;
        const tempContainer = document.createElement('div');
        tempContainer.id = tempId;
        tempContainer.className = 'tree-item w3-hover-light-grey';

        // Create form
        const form = document.createElement('form');
        form.id = `id_${type}Form-${tempId}`;
        form.className = 'fields-container';

        // Add CSRF token
        const csrfInput = document.createElement('input');
        csrfInput.type = 'hidden';
        csrfInput.name = 'csrfmiddlewaretoken';
        csrfInput.value = CSRF_TOKEN;
        form.appendChild(csrfInput);

        // Add parent ID if exists
        // if (parentId && modelInfo.parent_type) {
        //     const parentInput = document.createElement('input');
        //     parentInput.type = 'hidden';
        //     parentInput.name = 'parent_id';
        //     parentInput.value = parentId;
        //     form.appendChild(parentInput);
        // }

        // Add fields
        fields.forEach(field => {
            console.log(field);
            const fieldSchema = fieldInfo[field] || {};
            const input = document.createElement(fieldSchema.choices ? 'select' : 'input');
            input.id = `id_${type}${field.charAt(0).toUpperCase() + field.slice(1)}-${tempId}`;
            input.name = field;
            input.className = 'tree-item-field editing';

            if (fieldSchema.choices) {
                // Handle choice fields
                const emptyOption = document.createElement('option');
                emptyOption.value = '';
                emptyOption.textContent = `Select ${field.replace(/_/g, ' ')}`;
                input.appendChild(emptyOption);
                console.log("choice even if blank" + fieldSchema.choices);
                fieldSchema.choices.forEach(choice => {
                    const option = document.createElement('option');
                    option.value = choice.value;
                    option.textContent = choice.display_name;
                    input.appendChild(option);
                });
            } else {
                input.type = getInputType(fieldSchema.type);
                input.placeholder = field.replace(/_/g, ' ');
            }

            if (fieldSchema.required) {
                input.required = true;
            }

            form.appendChild(input);
        });

        // Add controls
        const controls = document.createElement('span');
        controls.id = `id_${type}EditControls-${tempId}`;
        controls.style.display = 'inline-flex';
        controls.innerHTML = `
            <button type="submit" class="w3-button" style="padding: 0 4px;">
                <i class="bi bi-check w3-large"></i>
            </button>
            <button type="button" class="w3-button" style="padding: 0 4px;">
                <i class="bi bi-x w3-large"></i>
            </button>
        `;
        form.appendChild(controls);
        tempContainer.appendChild(form);

        // Insert form
        let insertLocation;
        if (parentId) {
            insertLocation = document.getElementById(`id_${modelInfo.parent_type}-${parentName}-${parentId}`);
            if (!insertLocation) {
                throw new Error(`Parent container not found for ${modelInfo.parent_type} ${parentId}`);
            }
        } else {
            insertLocation = document.querySelector('.tree-headings');
        }
        insertLocation.after(tempContainer);

        // Handle form submission
        form.onsubmit = async (event) => {
            event.preventDefault();
            try {
                // Collect form data
                const data = {};
                fields.forEach(field => {
                    const element = document.getElementById(`id_${type}${field.charAt(0).toUpperCase() + field.slice(1)}-${tempId}`);
                    if (element) {
                        const value = element.value.trim();
                        if (fieldInfo[field]?.required && !value) {
                            throw new Error(`${field.replace(/_/g, ' ')} is required`);
                        }
                        data[field] = value || null;
                    }
                });

                // Add parent relationship if needed
                if (parentId && modelInfo.parent_type) {
                    data[`${modelInfo.parent_type}_id`] = parentId;
                }

                // Create item
                const newItem = await apiFetch(`/${type}s/`, {
                    method: 'POST',
                    body: JSON.stringify(data)
                });

                // Render new item
                const context = {
                    item: newItem,
                    level_type: type,
                    model_fields: MODEL_FIELDS,
                    parent: parentId ? { id: parentId } : null
                };

                const renderResponse = await apiFetch('/templates/render/', {
                    method: 'POST',
                    body: JSON.stringify({
                        template: '{% include "main/tree_item.html" %}',
                        context: context
                    })
                });

                if (!renderResponse.html) {
                    throw new Error('No HTML content returned from template rendering');
                }

                // Insert rendered HTML
                insertLocation.insertAdjacentHTML('afterend', renderResponse.html);
                tempContainer.remove();

            } catch (error) {
                console.error(`Error creating ${type}:`, error);
                alert(error.message || `Failed to create ${type}. Please try again.`);
            }
        };

        // Handle cancel
        controls.querySelector('button[type="button"]').onclick = () => {
            tempContainer.remove();
        };

        // Focus first field
        form.querySelector('input, select')?.focus();

    } catch (error) {
        console.error('Error in addItem:', error);
        alert(error.message || 'Failed to initialize form. Please try again.');
    }
};

// Helper function to map DRF types to HTML input types
const getInputType = (drfType) => {
    const typeMap = {
        string: 'text',
        integer: 'number',
        decimal: 'number',
        boolean: 'checkbox',
        date: 'date',
        datetime: 'datetime-local',
        email: 'email',
        url: 'url'
    };
    return typeMap[drfType] || 'text';
};