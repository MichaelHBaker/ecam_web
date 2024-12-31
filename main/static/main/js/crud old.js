// CSRF Token setup
export const CSRF_TOKEN = document.querySelector('[name=csrfmiddlewaretoken]')?.value || '';
if (!CSRF_TOKEN) {
    console.warn('CSRF token not found in the DOM.');
}

// Initialize MODEL_FIELDS
export let MODEL_FIELDS = null;
let modelFieldsPromise = null;

// Generalized API fetch function with enhanced error handling
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
            if (response.status === 400 && data.detail) {
                throw new Error(data.detail);
            }

            if (response.status === 400) {
                const errors = [];
                Object.entries(data).forEach(([field, messages]) => {
                    if (Array.isArray(messages)) {
                        errors.push(`${field}: ${messages.join(', ')}`);
                    } else if (typeof messages === 'string') {
                        errors.push(`${field}: ${messages}`);
                    }
                });
                throw new Error(errors.join('\n'));
            }

            const errorMessages = {
                401: 'Authentication required. Please log in.',
                403: 'You do not have permission to perform this action.',
                404: 'The requested resource was not found.',
                500: 'Server error occurred. Please try again later.'
            };

            throw new Error(errorMessages[response.status] || data.detail || `API Error: ${response.statusText}`);
        }

        return data;
    } catch (error) {
        console.error(`Error fetching ${apiEndpoint}:`, error);
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
            console.error('Error initializing MODEL_FIELDS:', error);
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

// Helper function to reset fields after edit
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

// Toggle open/close function for tree items
export const toggleOpenClose = (id) => {
    const div = document.getElementById(id);
    const icon = document.getElementById(`id_chevronIcon-${id}`);
    if (!div || !icon) return;

    if (div.classList.contains('w3-show')) {
        div.classList.remove('w3-show');
        div.classList.add('w3-hide');
        icon.className = "bi bi-chevron-right";
    } else {
        div.classList.remove('w3-hide');
        div.classList.add('w3-show');
        icon.className = "bi bi-chevron-down";
    }
};

// Helper function to create form field
const createField = (field, type, tempId, fieldInfo) => {
    const input = document.createElement(fieldInfo?.choices ? 'select' : 'input');
    input.id = `id_${type}${field.charAt(0).toUpperCase() + field.slice(1)}-${tempId}`;
    input.name = field;
    input.className = 'tree-item-field editing';

    if (fieldInfo?.choices) {
        // Add empty option
        const emptyOption = document.createElement('option');
        emptyOption.value = '';
        emptyOption.textContent = `Select ${field.replace(/_/g, ' ')}`;
        input.appendChild(emptyOption);

        // Add field choices
        fieldInfo.choices.forEach(choice => {
            const option = document.createElement('option');
            option.value = choice.value;
            option.textContent = choice.display_name;
            input.appendChild(option);
        });
    } else {
        input.type = getInputType(fieldInfo?.type);
        input.placeholder = field.replace(/_/g, ' ');
    }

    if (fieldInfo?.required) {
        input.required = true;
    }

    return input;
};

// Edit function - makes fields editable
export const editItem = async (type, id, fields) => {
    try {
        await ensureInitialized();

        fields.forEach((field) => {
            const element = document.getElementById(`id_${type}${field.charAt(0).toUpperCase() + field.slice(1)}-${id}`);
            if (element) {
                element.dataset.originalValue = element.value.trim();
                element.removeAttribute('readonly');
                element.style.display = "inline";
                element.classList.add('editing');
            }
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

// Update function - saves changes to server
export const updateItem = async (event, type, id, fields) => {
    event.preventDefault();

    try {
        const modelFields = await ensureInitialized();
        const data = {};
        let hasErrors = false;

        // Get parent ID and handle parent relationship
        const parentIdInput = event.target.querySelector('input[name="parent_id"]');
        const typeConfig = modelFields[type];
        
        // If this type has a parent type defined and no parent ID is provided, that's an error
        if (typeConfig.parent_type) {
            if (parentIdInput && parentIdInput.value) {
                // For project, we need to set 'client', not 'client_id'
                const parentKeyField = typeConfig.parent_type;  // Changed this line
                data[parentKeyField] = parseInt(parentIdInput.value, 10);
                console.log('Parent relationship:', {
                    parentType: typeConfig.parent_type,
                    parentId: parentIdInput.value,
                    parentKeyField,
                    finalData: data
                });
            } else {
                console.warn(`No parent ID found for ${type} update`);
                throw new Error(`Parent ${typeConfig.parent_type} is required for ${type}`);
            }
        }

        // Rest of your code for field processing...
        fields.forEach((field) => {
            const element = document.getElementById(`id_${type}${field.charAt(0).toUpperCase() + field.slice(1)}-${id}`);
            if (element) {
                const value = element.value.trim();
                
                // Find the field configuration to check if it's required
                const fieldConfig = typeConfig.fields.find(f => f.name === field);
                if (!value && fieldConfig?.required) {
                    element.classList.add('error');
                    hasErrors = true;
                } else {
                    element.classList.remove('error');
                    // If this is a choice field with choices, map display value to internal value
                    if (fieldConfig?.type === 'choice' && fieldConfig.choices) {
                        console.log('Processing choice field:', {
                            field,
                            value,
                            choices: fieldConfig.choices
                        });
                        const choice = fieldConfig.choices.find(c => c.display === value);
                        if (choice) {
                            data[field] = choice.value;
                        } else {
                            console.warn(`Could not find choice mapping for ${value}`);
                            data[field] = value;
                        }
                    } else {
                        data[field] = value;
                    }
                }
            }
        });

        // Log the full data object right before sending
        console.log('Data being sent:', JSON.stringify(data, null, 2));

        // Rest of your code...
        const response = await apiFetch(`/${type}s/${id}/`, {
            method: 'PATCH',
            body: JSON.stringify(data),
        });

        resetFields(type, id, fields);
        return response;
    } catch (error) {
        // Error handling code...
        throw error;
    }
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
        
        if (itemElement) itemElement.remove();
        if (containerElement) containerElement.remove();
    } catch (error) {
        console.error('Delete failed:', error);
        alert(error.message || 'Failed to delete the item. Please try again.');
    }
};

// Add function for creating new items
export const addItem = async (type, fields, parentId = null) => {
    try {
        const modelFields = await ensureInitialized();
        const modelInfo = modelFields[type];
        if (!modelInfo) {
            throw new Error(`Unknown item type: ${type}`);
        }

        const fieldInfo = await apiFetch(`/${type}s/`, { method: 'OPTIONS' });
        
        // Create temporary form container
        const tempId = `temp-${type}-${Date.now()}`;
        const tempContainer = document.createElement('div');
        tempContainer.id = tempId;
        tempContainer.className = 'tree-item w3-hover-light-grey';

        // Create form
        const form = document.createElement('form');
        form.id = `id_${type}Form-${tempId}`;
        form.className = 'fields-container';

        // Add fields
        fields.forEach(field => {
            const input = createField(field, type, tempId, fieldInfo.actions.POST[field]);
            form.appendChild(input);
        });

        // Add edit controls
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

        // Find parent container and insert form
        const parentContainer = parentId ? 
            document.getElementById(`id_${modelInfo.parent_type}-${parentId}`) : 
            document.querySelector('.tree-headings');

        if (!parentContainer) {
            throw new Error('Parent container not found');
        }

        parentContainer.after(tempContainer);

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
                        if (fieldInfo.actions.POST[field]?.required && !value) {
                            throw new Error(`${field.replace(/_/g, ' ')} is required`);
                        }
                        data[field] = value || null;
                    }
                });

                // Add parent ID if needed
                if (parentId && modelInfo.parent_type) {
                    data[`${modelInfo.parent_type}_id`] = parentId;
                }

                // Submit to API
                const response = await apiFetch(`/${type}s/`, {
                    method: 'POST',
                    body: JSON.stringify(data)
                });

                // Replace temp form with new item HTML
                parentContainer.insertAdjacentHTML('afterend', response.html);
                tempContainer.remove();
            } catch (error) {
                // Show error in form
                const errorDisplay = document.createElement('div');
                errorDisplay.id = `id_${type}Error-${tempId}`;
                errorDisplay.className = 'w3-text-red';
                errorDisplay.style.marginTop = '4px';
                errorDisplay.textContent = error.message;

                const existingError = form.querySelector('.w3-text-red');
                if (existingError) {
                    existingError.remove();
                }
                form.appendChild(errorDisplay);
            }
        };

        // Handle cancel
        controls.querySelector('button[type="button"]').onclick = () => tempContainer.remove();

        // Focus first field
        form.querySelector('input, select')?.focus();

    } catch (error) {
        console.error('Error in addItem:', error);
        alert(error.message || 'Failed to initialize form. Please try again.');
    }
};

// Helper function to get input type for form fields
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

// Initialize MODEL_FIELDS when the module loads
initializeModelFields().catch(error => {
    console.error('Failed to initialize MODEL_FIELDS:', error);
});