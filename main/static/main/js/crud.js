// CSRF Token setup
export const CSRF_TOKEN = document.querySelector('[name=csrfmiddlewaretoken]')?.value || '';
if (!CSRF_TOKEN) {
    console.warn('CSRF token not found in the DOM.');
}

// Initialize MODEL_FIELDS
export let MODEL_FIELDS = null;
let modelFieldsPromise = null;

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

// Initialize MODEL_FIELDS from API
export const initializeModelFields = async () => {
    if (modelFieldsPromise) {
        return modelFieldsPromise;
    }

    modelFieldsPromise = apiFetch('/model-fields/')
        .then(data => {
            MODEL_FIELDS = data;
            return data;
        })
        .catch(error => {
            console.error('Failed to initialize MODEL_FIELDS:', error);
            throw error;
        });

    return modelFieldsPromise;
};

// Helper function to ensure MODEL_FIELDS is initialized
const ensureInitialized = async () => {
    if (!MODEL_FIELDS) {
        await initializeModelFields();
    }
    return MODEL_FIELDS;
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

// Edit function
export const editItem = async (type, id, fields) => {
    try {
        const modelFields = await ensureInitialized();
        const modelInfo = modelFields[type];
        if (!modelInfo) {
            throw new Error(`Unknown item type: ${type}`);
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
    } catch (error) {
        console.error('Error in editItem:', error);
        alert(error.message || 'An error occurred while editing. Please try again.');
    }
};

// Update function
export const updateItem = async (event, type, id, fields) => {
    event.preventDefault();

    try {
        const modelFields = await ensureInitialized();
        const modelInfo = modelFields[type];
        if (!modelInfo) {
            throw new Error(`Unknown item type: ${type}`);
        }

        const data = {};
        
        fields.forEach((field) => {
            const element = document.getElementById(`id_${type}${field.charAt(0).toUpperCase() + field.slice(1)}-${id}`);
            if (element) {
                data[field] = element.value.trim();
            }
        });

        const parentIdInput = event.target.querySelector('input[name="parent_id"]');
        if (parentIdInput && modelInfo.parent_type) {
            data[`${modelInfo.parent_type}_id`] = parentIdInput.value;
        }

        const response = await apiFetch(`/${type}s/${id}/`, {
            method: 'PATCH',
            body: JSON.stringify(data),
        });

        fields.forEach((field) => {
            const element = document.getElementById(`id_${type}${field.charAt(0).toUpperCase() + field.slice(1)}-${id}`);
            if (element) {
                element.dataset.originalValue = element.value.trim();
            }
        });

        resetFields(type, id, fields);

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
        await ensureInitialized();
        await apiFetch(`/${type}s/${id}/`, { method: 'DELETE' });
        
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
        const modelFields = await ensureInitialized();
        const modelInfo = modelFields[type];
        if (!modelInfo) {
            throw new Error(`Unknown item type: ${type}`);
        }

        const schema = await apiFetch(`/${type}s/`, {
            method: 'OPTIONS'
        });
        const fieldInfo = schema.actions.POST;

        const tempId = `temp-new-${type}`;
        const tempContainer = document.createElement('div');
        tempContainer.id = tempId;
        tempContainer.className = 'tree-item w3-hover-light-grey';

        const form = document.createElement('form');
        form.id = `id_${type}Form-${tempId}`;
        form.className = 'fields-container';

        const csrfInput = document.createElement('input');
        csrfInput.type = 'hidden';
        csrfInput.name = 'csrfmiddlewaretoken';
        csrfInput.value = CSRF_TOKEN;
        form.appendChild(csrfInput);

        fields.forEach(field => {
            const fieldSchema = fieldInfo[field] || {};
            const input = document.createElement(fieldSchema.choices ? 'select' : 'input');
            input.id = `id_${type}${field.charAt(0).toUpperCase() + field.slice(1)}-${tempId}`;
            input.name = field;
            input.className = 'tree-item-field editing';

            if (fieldSchema.choices) {
                const emptyOption = document.createElement('option');
                emptyOption.value = '';
                emptyOption.textContent = `Select ${field.replace(/_/g, ' ')}`;
                input.appendChild(emptyOption);

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

        form.onsubmit = async (event) => {
            event.preventDefault();
            try {
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

                if (parentId && modelInfo.parent_type) {
                    data[`${modelInfo.parent_type}_id`] = parentId;
                }

                const newItem = await apiFetch(`/${type}s/`, {
                    method: 'POST',
                    body: JSON.stringify(data)
                });

                const context = {
                    item: newItem,
                    level_type: type,
                    model_fields: modelFields,
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

                insertLocation.insertAdjacentHTML('afterend', renderResponse.html);
                tempContainer.remove();

            } catch (error) {
                console.error(`Error creating ${type}:`, error);
                alert(error.message || `Failed to create ${type}. Please try again.`);
            }
        };

        controls.querySelector('button[type="button"]').onclick = () => {
            tempContainer.remove();
        };

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

// Initialize the page
initializeModelFields().catch(error => {
    console.error('Failed to initialize MODEL_FIELDS:', error);
});