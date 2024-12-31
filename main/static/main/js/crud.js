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
        credentials: 'include',  // Ensure cookies are sent
    };

    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const apiEndpoint = `${basePath}${cleanEndpoint}`;
    
    try {
        const response = await fetch(apiEndpoint, {
            ...defaultOptions,
            ...options,
            headers: {
                ...defaultOptions.headers,
                ...(options.headers || {}),
            },
        });

        // Handle different response types
        const contentType = response.headers.get('content-type');
        let data;
        
        if (contentType?.includes('application/json')) {
            data = await response.json();
        } else if (response.status === 204) {
            // No content
            return null;
        } else {
            data = await response.text();
        }

        if (!response.ok) {
            if (response.status === 400 && typeof data === 'object') {
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

            throw new Error(data.detail || `API Error: ${response.statusText}`);
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

// Helper functions for input handling and field creation

// Enhanced input type mapping
const getInputType = (drfType) => {
    const typeMap = {
        string: 'text',
        integer: 'number',
        decimal: 'number',
        boolean: 'checkbox',
        date: 'date',
        datetime: 'datetime-local',
        email: 'email',
        url: 'url',
        choice: 'select'
    };
    return typeMap[drfType] || 'text';
};

// Choice field value mapping helper
const mapChoiceValue = (value, choices, toInternal = false) => {
    if (!choices) return value;
    
    if (toInternal) {
        const choice = choices.find(c => c.display === value);
        return choice ? choice.value : value;
    } else {
        const choice = choices.find(c => c.value === value);
        return choice ? choice.display : value;
    }
};

// Create form field with proper configuration
const createField = (field, type, tempId, fieldInfo) => {
    const element = fieldInfo?.type === 'choice' ? 'select' : 'input';
    const input = document.createElement(element);
    input.id = `id_${type}${field.charAt(0).toUpperCase() + field.slice(1)}-${tempId}`;
    input.name = field;
    input.className = 'tree-item-field editing';

    if (fieldInfo?.type === 'choice' && fieldInfo.choices) {
        // Add empty option
        const emptyOption = document.createElement('option');
        emptyOption.value = '';
        emptyOption.textContent = `Select ${field.replace(/_/g, ' ')}`;
        input.appendChild(emptyOption);

        // Add field choices
        fieldInfo.choices.forEach(choice => {
            const option = document.createElement('option');
            option.value = choice.display;  // Use display value for visual consistency
            option.textContent = choice.display;
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

// Create edit controls for forms
const createEditControls = (type, id) => {
    const controls = document.createElement('span');
    controls.id = `id_${type}EditControls-${id}`;
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

// Collect and validate form data
const collectFormData = (type, id, fields, modelInfo) => {
    const data = {};
    fields.forEach(field => {
        const element = document.getElementById(`id_${type}${field.charAt(0).toUpperCase() + field.slice(1)}-${id}`);
        if (element) {
            const value = element.value.trim();
            const fieldConfig = modelInfo.fields.find(f => f.name === field);

            if (!value && fieldConfig?.required) {
                throw new Error(`${field.replace(/_/g, ' ')} is required`);
            }

            if (fieldConfig?.type === 'choice' && fieldConfig.choices) {
                data[field] = mapChoiceValue(value, fieldConfig.choices, true);
            } else {
                data[field] = value || null;
            }
        }
    });
    return data;
};

// Display form errors
const showFormError = (form, error, type) => {
    const errorId = `id_${type}Error-${form.id}`;
    let errorDisplay = document.getElementById(errorId);
    
    if (!errorDisplay) {
        errorDisplay = document.createElement('div');
        errorDisplay.id = errorId;
        errorDisplay.className = 'w3-text-red';
        errorDisplay.style.marginTop = '4px';
    }
    
    errorDisplay.textContent = error.message;
    form.appendChild(errorDisplay);
};

// Main CRUD operations

// Add new item function
export const addItem = async (type, fields, parentId = null) => {
    try {
        const modelFields = await ensureInitialized();
        const modelInfo = modelFields[type];
        if (!modelInfo) {
            throw new Error(`Unknown item type: ${type}`);
        }

        // Get field metadata including choices
        const fieldInfo = await apiFetch(`/${type}s/`, { method: 'OPTIONS' });
        
        // Create temporary form container with unique ID
        const tempId = `temp-${type}-${Date.now()}`;
        const tempContainer = document.createElement('div');
        tempContainer.id = tempId;
        tempContainer.className = 'tree-item w3-hover-light-grey';

        // Create form with fields
        const form = document.createElement('form');
        form.id = `id_${type}Form-${tempId}`;
        form.className = 'fields-container';

        // Add CSRF token
        const csrfInput = document.createElement('input');
        csrfInput.type = 'hidden';
        csrfInput.name = 'csrfmiddlewaretoken';
        csrfInput.value = CSRF_TOKEN;
        form.appendChild(csrfInput);

        // Add parent ID if needed
        if (parentId && modelInfo.parent_type) {
            const parentInput = document.createElement('input');
            parentInput.type = 'hidden';
            parentInput.name = 'parent_id';
            parentInput.value = parentId;
            form.appendChild(parentInput);
        }

        // Create and add fields
        fields.forEach(field => {
            const fieldConfig = modelInfo.fields.find(f => f.name === field);
            const fieldElement = createField(field, type, tempId, fieldConfig);
            form.appendChild(fieldElement);
        });

        // Add edit controls
        const controls = createEditControls(type, tempId);
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
                const data = collectFormData(type, tempId, fields, modelInfo);

                // Add parent relationship if needed
                if (parentId && modelInfo.parent_type) {
                    data[modelInfo.parent_type] = parseInt(parentId, 10);
                }

                const response = await apiFetch(`/${type}s/`, {
                    method: 'POST',
                    body: JSON.stringify(data)
                });

                // Replace temp form with new item HTML
                parentContainer.insertAdjacentHTML('afterend', response.html);
                tempContainer.remove();
            } catch (error) {
                showFormError(form, error, type);
            }
        };

        // Handle cancel
        const cancelButton = controls.querySelector('button[type="button"]');
        cancelButton.onclick = () => tempContainer.remove();

        // Focus first field
        form.querySelector('input, select')?.focus();

    } catch (error) {
        console.error('Error in addItem:', error);
        alert(error.message || 'Failed to initialize form. Please try again.');
    }
};

// Update existing item function
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
                data[typeConfig.parent_type] = parseInt(parentIdInput.value, 10);
            } else {
                console.warn(`No parent ID found for ${type} update`);
                throw new Error(`Parent ${typeConfig.parent_type} is required for ${type}`);
            }
        }

        // Validate and collect all field values
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

        if (hasErrors) {
            throw new Error('Please fill in all required fields');
        }

        // Clear any existing error
        const existingError = document.getElementById(`id_${type}Error-${id}`);
        if (existingError) {
            existingError.remove();
        }

        const response = await apiFetch(`/${type}s/${id}/`, {
            method: 'PATCH',
            body: JSON.stringify(data),
        });

        resetFields(type, id, fields);
        return response;
    } catch (error) {
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

// Delete item function
export const deleteItem = async (type, id) => {
    if (!confirm('Are you sure you want to delete this item? This will also delete all related items.')) {
        return;
    }

    try {
        await ensureInitialized();
        await apiFetch(`/${type}s/${id}/`, { method: 'DELETE' });
        
        // Remove item and its container from DOM
        const itemElement = document.getElementById(`id_form-${type}-${id}`).closest('.tree-item');
        const containerElement = document.getElementById(`id_${type}-${id}`);
        
        // Use animation for smooth removal
        if (itemElement) {
            itemElement.style.opacity = '0';
            setTimeout(() => itemElement.remove(), 300);
        }
        if (containerElement) {
            containerElement.style.opacity = '0';
            setTimeout(() => containerElement.remove(), 300);
        }
    } catch (error) {
        console.error('Delete failed:', error);
        alert(error.message || 'Failed to delete the item. Please try again.');
    }
};

// Edit item function
export const editItem = async (type, id, fields) => {
    try {
        const modelFields = await ensureInitialized();
        const typeConfig = modelFields[type];

        // Make fields editable and store original values
        fields.forEach((field) => {
            const element = document.getElementById(`id_${type}${field.charAt(0).toUpperCase() + field.slice(1)}-${id}`);
            if (element) {
                element.dataset.originalValue = element.value.trim();
                element.removeAttribute('readonly');
                element.style.display = "inline";
                element.classList.add('editing');

                // Special handling for choice fields
                const fieldConfig = typeConfig.fields.find(f => f.name === field);
                if (fieldConfig?.type === 'choice' && fieldConfig.choices) {
                    // Store the original display value
                    element.dataset.originalDisplayValue = element.value;
                }
            }
        });

        // Show edit controls
        const editControls = document.getElementById(`id_${type}EditControls-${id}`);
        if (editControls) {
            editControls.style.display = "inline-flex";
        }

        // Focus the name field
        const nameField = document.getElementById(`id_${type}Name-${id}`);
        if (nameField) {
            nameField.focus();
        }
    } catch (error) {
        console.error('Error in editItem:', error);
        alert(error.message || 'An error occurred while editing. Please try again.');
    }
};

// Cancel edit function
export const cancelEdit = (event, type, id, fields) => {
    event.preventDefault();
    
    fields.forEach((field) => {
        const element = document.getElementById(`id_${type}${field.charAt(0).toUpperCase() + field.slice(1)}-${id}`);
        if (element) {
            // Restore original value
            element.value = element.dataset.originalValue || '';
            // For choice fields, restore display value if it exists
            if (element.dataset.originalDisplayValue) {
                element.value = element.dataset.originalDisplayValue;
            }
            element.classList.remove('error');
            delete element.dataset.originalValue;
            delete element.dataset.originalDisplayValue;
        }
    });
    
    // Clear any error messages
    const errorDisplay = document.getElementById(`id_${type}Error-${id}`);
    if (errorDisplay) {
        errorDisplay.remove();
    }
    
    resetFields(type, id, fields);
};

// Reset fields after edit/cancel
const resetFields = (type, id, fields) => {
    fields.forEach((field) => {
        const element = document.getElementById(`id_${type}${field.charAt(0).toUpperCase() + field.slice(1)}-${id}`);
        if (element) {
            element.setAttribute('readonly', 'readonly');
            element.classList.remove('editing', 'error');
            // Hide all fields except name
            if (field !== 'name') {
                element.style.display = "none";
            }
            // Clean up any stored values
            delete element.dataset.originalValue;
            delete element.dataset.originalDisplayValue;
        }
    });

    // Hide edit controls
    const editControls = document.getElementById(`id_${type}EditControls-${id}`);
    if (editControls) {
        editControls.style.display = "none";
    }

    // Remove any error messages
    const errorDisplay = document.getElementById(`id_${type}Error-${id}`);
    if (errorDisplay) {
        errorDisplay.remove();
    }
};

// Toggle tree item expansion
export const toggleOpenClose = (id) => {
    const div = document.getElementById(id);
    const icon = document.getElementById(`id_chevronIcon-${id}`);
    if (!div || !icon) return;

    // Add transition for smooth animation
    div.style.transition = 'all 0.3s ease-out';
    icon.style.transition = 'transform 0.3s ease-out';

    const isExpanding = div.classList.contains('w3-hide');
    
    if (isExpanding) {
        div.classList.remove('w3-hide');
        div.classList.add('w3-show');
        icon.className = "bi bi-chevron-down";
        icon.style.transform = 'rotate(90deg)';
    } else {
        div.classList.remove('w3-show');
        div.classList.add('w3-hide');
        icon.className = "bi bi-chevron-right";
        icon.style.transform = 'rotate(0deg)';
    }

    // Remove transition after animation completes
    setTimeout(() => {
        div.style.transition = '';
        icon.style.transition = '';
    }, 300);
};

// Initialize MODEL_FIELDS when the module loads
initializeModelFields().catch(error => {
    console.error('Failed to initialize MODEL_FIELDS:', error);
});