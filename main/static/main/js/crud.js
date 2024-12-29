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

    console.log('API Endpoint:', apiEndpoint);
    
    try {
        const response = await fetch(apiEndpoint, {
            ...defaultOptions,
            ...options,
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            // Handle DRF validation errors
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

    modelFieldsPromise = apiFetch('/model-fields/', { basePath: '/api' })
        .then(data => {
            MODEL_FIELDS = data;
            console.log('Initialized MODEL_FIELDS:', MODEL_FIELDS);
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

// Helper function to get container element for a type
const getContainerElement = (type, id, modelInfo, parentName = '') => {
    if (!modelInfo.parent_type) {
        // Top level - find last item of same type or headings
        const lastItem = Array.from(document.querySelectorAll('.tree-item'))
            .filter(item => item.querySelector(`[id^="id_${type}Name-"]`))
            .pop();
        return lastItem || document.querySelector('.tree-headings');
    } else if (parentName) {
        // Child item - get parent's container
        return document.getElementById(`id_${modelInfo.parent_type}-${parentName}-${id}`);
    }
    return null;
};

// Helper function to create chevron button
const createChevronButton = (type, name, id, hasChildren = true) => {
    if (!hasChildren) return null;
    
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'w3-button';
    button.onclick = () => toggleOpenClose(`id_${type}-${name}-${id}`);
    button.title = `Click to open/close ${type} details`;
    
    const icon = document.createElement('i');
    icon.id = `id_chevronIcon-id_${type}-${name}-${id}`;
    icon.className = 'bi bi-chevron-right';
    
    button.appendChild(icon);
    return button;
};

// Toggle open/close function
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

// Edit function
export const editItem = async (type, id, fields) => {
    try {
        await ensureInitialized();

        console.log('Initialized MODEL_FIELDS:', MODEL_FIELDS);

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

// Update function with error handling
export const updateItem = async (event, type, id, fields) => {
    event.preventDefault();

    try {
        const modelFields = await ensureInitialized();
        const data = {};
        let hasErrors = false;

        fields.forEach((field) => {
            const element = document.getElementById(`id_${type}${field.charAt(0).toUpperCase() + field.slice(1)}-${id}`);
            if (element) {
                const value = element.value.trim();
                if (!value && element.required) {
                    element.classList.add('error');
                    hasErrors = true;
                } else {
                    element.classList.remove('error');
                    data[field] = value;
                }
            }
        });

        if (hasErrors) {
            throw new Error('Please fill in all required fields');
        }

        const parentIdInput = event.target.querySelector('input[name="parent_id"]');
        if (parentIdInput && modelFields[type].parent_type) {
            data[`${modelFields[type].parent_type}_id`] = parentIdInput.value;
        }

        // Remove error message if it exists
        const existingError = document.getElementById(`id_${type}Error-${id}`);
        if (existingError) {
            existingError.remove();
        }

        const response = await apiFetch(`/${type}s/${id}/`, {
            method: 'PATCH',
            body: JSON.stringify(data),
        });

        resetFields(type, id, fields);

        // Update names in chevron buttons and containers if name changed
        if (data.name) {
            const chevronIcon = document.getElementById(`id_chevronIcon-id_${type}-${id}`);
            if (chevronIcon) {
                chevronIcon.closest('button').title = `Click to open/close ${type} details`;
            }
        }

        return response;
    } catch (error) {
        // Show error message in UI
        const errorDisplay = document.createElement('div');
        errorDisplay.id = `id_${type}Error-${id}`;
        errorDisplay.className = 'w3-text-red';
        errorDisplay.style.marginTop = '4px';
        errorDisplay.textContent = error.message;

        const form = document.getElementById(`id_${type}Form-${id}`);
        form.appendChild(errorDisplay);

        throw error;
    }
};

// Cancel edit function
export const cancelEdit = (event, type, id, fields) => {
    event.preventDefault();
    fields.forEach((field) => {
        const element = document.getElementById(`id_${type}${field.charAt(0).toUpperCase() + field.slice(1)}-${id}`);
        if (element) {
            element.value = element.dataset.originalValue;
            element.classList.remove('error');
        }
    });
    
    // Remove error message if it exists
    const errorDisplay = document.getElementById(`id_${type}Error-${id}`);
    if (errorDisplay) {
        errorDisplay.remove();
    }
    
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
        
        // Remove the item and its container
        const itemElement = document.getElementById(`id_form-${type}-${id}`).closest('.tree-item');
        const containerElement = document.getElementById(`id_${type}-${id}`);
        
        if (itemElement) itemElement.remove();
        if (containerElement) containerElement.remove();
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

        const fieldInfo = await apiFetch(`/${type}s/`, { method: 'OPTIONS' });
        
        // Create temporary form
        const tempId = `temp-new-${type}`;
        const tempContainer = document.createElement('div');
        tempContainer.id = tempId;
        tempContainer.className = 'tree-item w3-hover-light-grey';

        const formContent = document.createElement('div');
        formContent.className = 'tree-text';

        const form = document.createElement('form');
        form.id = `id_${type}Form-${tempId}`;
        form.className = 'fields-container';

        // Add chevron if not a measurement
        if (type !== 'measurement') {
            const chevron = createChevronButton(type, 'new', tempId);
            if (chevron) formContent.appendChild(chevron);
        }

        // Add fields
        fields.forEach(field => {
            const input = createField(field, type, tempId, fieldInfo.actions.POST[field]);
            form.appendChild(input);
        });

        // Add controls
        const controls = createControls(type, tempId);
        form.appendChild(controls);
        formContent.appendChild(form);
        tempContainer.appendChild(formContent);

        // Find insertion location
        let insertLocation;
        if (!modelInfo.parent_type) {
            // Top level (Client) - insert after last client or headings
            const lastClient = Array.from(document.querySelectorAll('.tree-item'))
                .filter(item => item.querySelector(`[id^="id_clientName-"]`))
                .pop();
            insertLocation = lastClient || document.querySelector('.tree-headings');
        } else if (parentId) {
            // Child item - insert into parent's container
            const parentContainer = document.getElementById(`id_${modelInfo.parent_type}-${parentName}-${parentId}`);
            if (!parentContainer) {
                throw new Error(`Parent container not found for ${modelInfo.parent_type} ${parentId}`);
            }
            insertLocation = parentContainer;
        } else {
            throw new Error(`Parent ID required for ${type}`);
        }

        insertLocation.after(tempContainer);

        // Handle form submission
        form.onsubmit = async (event) => {
            event.preventDefault();
            try {
                const data = collectFormData(fields, type, tempId, fieldInfo.actions.POST);
                if (parentId && modelInfo.parent_type) {
                    data[`${modelInfo.parent_type}_id`] = parentId;
                }

                const response = await apiFetch(`/${type}s/`, {
                    method: 'POST',
                    body: JSON.stringify(data)
                });

                // Insert new item HTML from response
                insertLocation.insertAdjacentHTML('afterend', response.html);
                tempContainer.remove();
            } catch (error) {
                console.error(`Error creating ${type}:`, error);
                
                // Show error message in form
                const errorDisplay = document.createElement('div');
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

// Helper functions for form creation
const createField = (field, type, tempId, fieldInfo) => {
    const input = document.createElement(fieldInfo?.choices ? 'select' : 'input');
    input.id = `id_${type}${field.charAt(0).toUpperCase() + field.slice(1)}-${tempId}`;
    input.name = field;
    input.className = 'tree-item-field editing';

    if (fieldInfo?.choices) {
        addChoicesToSelect(input, field, fieldInfo.choices);
    } else {
        input.type = getInputType(fieldInfo?.type);
        input.placeholder = field.replace(/_/g, ' ');
    }

    if (fieldInfo?.required) {
        input.required = true;
    }

    return input;
};

const createControls = (type, tempId) => {
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
    return controls;
};

const addChoicesToSelect = (select, field, choices) => {
    const emptyOption = document.createElement('option');
    emptyOption.value = '';
    emptyOption.textContent = `Select ${field.replace(/_/g, ' ')}`;
    select.appendChild(emptyOption);

    choices.forEach(choice => {
        const option = document.createElement('option');
        option.value = choice.value;
        option.textContent = choice.display_name;
        select.appendChild(option);
    });
};

const collectFormData = (fields, type, tempId, fieldInfo) => {
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
    return data;
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
    
// Initialize MODEL_FIELDS when the module loads
initializeModelFields().catch(error => {
    console.error('Failed to initialize MODEL_FIELDS:', error);
});