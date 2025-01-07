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

// Helper function for consistent field ID generation
export const getFieldId = (type, field, id) => {
    const fieldName = typeof field === 'string' ? field : field.name;
    return `field_${type}_${fieldName}_${id}`;
};

// Generalizing the input type mapping
const getInputType = (fieldConfig) => {
    // Base type mappings
    const typeMap = {
        'CharField': 'text',
        'TextField': 'text',
        'IntegerField': 'number',
        'DecimalField': 'number',
        'BooleanField': 'checkbox',
        'DateField': 'date',
        'DateTimeField': 'datetime-local',
        'EmailField': 'email',
        'URLField': 'url'
    };

    // Handle special cases
    if (fieldConfig.is_foreign_key || fieldConfig.type === 'choice') {
        return 'select';
    }

    return typeMap[fieldConfig.type] || 'text';
};

// Helper function to handle field value updates
const updateFieldValue = async (response, type, id, fieldConfig) => {
    const fieldElement = document.getElementById(`id_${type}${fieldConfig.name.charAt(0).toUpperCase() + fieldConfig.name.slice(1)}-${id}`);
    if (!fieldElement) return;

    if (fieldConfig.is_foreign_key) {
        // Handle foreign key fields
        const relatedData = response[fieldConfig.name];
        if (relatedData) {
            const displayValue = relatedData[fieldConfig.display_field || 'name'];
            const unit = relatedData.unit ? ` (${relatedData.unit})` : '';
            
            // Update display if there's a separate display element
            const displayElement = document.getElementById(`id_${type}${fieldConfig.name}Display-${id}`);
            if (displayElement) {
                displayElement.innerHTML = `${displayValue}${unit}`;
            }
            
            // Update the select element's value
            fieldElement.value = relatedData.id;
        }
    } else if (fieldConfig.type === 'choice') {
        // Handle choice fields
        const choiceValue = response[fieldConfig.name];
        fieldElement.value = choiceValue;
        
        // Update display value if needed
        const displayElement = document.getElementById(`id_${type}${fieldConfig.name}Display-${id}`);
        if (displayElement) {
            const selectedOption = Array.from(fieldElement.options)
                .find(option => option.value === choiceValue);
            if (selectedOption) {
                displayElement.textContent = selectedOption.textContent;
            }
        }
    } else {
        // Handle regular fields
        fieldElement.value = response[fieldConfig.name] || '';
    }
};

const createField = (field, type, tempId, fieldInfo) => {
    const isSelect = fieldInfo?.is_foreign_key || fieldInfo?.type === 'choice';
    const input = document.createElement(isSelect ? 'select' : 'input');
    
    // Set basic attributes
    input.id = `id_${type}${field.charAt(0).toUpperCase() + field.slice(1)}-${tempId}`;
    input.name = field;
    input.className = 'tree-item-field editing';

    if (fieldInfo?.is_foreign_key) {
        input.className += ' fk-select';
        
        // Add empty option
        const emptyOption = document.createElement('option');
        emptyOption.value = '';
        emptyOption.textContent = `Select ${field.replace(/_/g, ' ')}`;
        input.appendChild(emptyOption);

        // Add choices
        if (fieldInfo.choices) {
            fieldInfo.choices.forEach(choice => {
                const option = document.createElement('option');
                option.value = choice.id;
                option.textContent = choice.display_name || choice.name || choice.id;
                if (choice.unit) {
                    option.textContent += ` (${choice.unit})`;
                }
                input.appendChild(option);
            });
        }
    } else if (fieldInfo?.type === 'choice') {
        input.className += ' choice-select';
        
        // Add empty option
        const emptyOption = document.createElement('option');
        emptyOption.value = '';
        emptyOption.textContent = `Select ${field.replace(/_/g, ' ')}`;
        input.appendChild(emptyOption);

        // Add choices
        if (fieldInfo.choices) {
            fieldInfo.choices.forEach(choice => {
                const option = document.createElement('option');
                option.value = choice.id;
                option.textContent = choice.display_name || choice.name || choice.id;
                input.appendChild(option);
            });
        }
    } else {
        input.type = getInputType(fieldInfo);
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

            if (fieldConfig?.is_foreign_key) {
                // Handle all foreign keys consistently
                data[field] = value ? parseInt(value, 10) : null;
            } else if (fieldConfig?.type === 'choice') {
                // Handle choice fields
                data[field] = value || null;
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


// Add new item function
export const addItem = async (type, fields, parentId = null) => {
    try {
        const modelFields = await ensureInitialized();
        const modelInfo = modelFields[type];
        if (!modelInfo) {
            throw new Error(`Unknown item type: ${type}`);
        }

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

        // If this is a child item (has parentId), insert inside the parent container
        if (parentId) {
            // Make sure parent container is visible when adding child
            parentContainer.classList.remove('w3-hide');
            parentContainer.classList.add('w3-show');
            
            // Insert at the beginning of parent container
            parentContainer.insertAdjacentElement('afterbegin', tempContainer);
            
            // Update the chevron icon to show expansion
            const chevronIcon = document.getElementById(`id_chevronIcon-id_${modelInfo.parent_type}-${parentId}`);
            if (chevronIcon) {
                chevronIcon.className = "bi bi-chevron-down";
            }
        } else {
            // For top-level items, insert after the headings
            parentContainer.insertAdjacentElement('afterend', tempContainer);
        }

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
                

                // Create a temporary div to hold the new HTML
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = response.html;
                
                // Find the tree item div
                const treeItem = tempDiv.querySelector('.tree-item');
                
                // Replace the temporary form
                if (treeItem) {
                    if (parentId) {
                        // For child items, keep them inside the parent container
                        tempContainer.replaceWith(treeItem);
                        
                        // If there's a container div, insert it right after the tree item
                        const containerDiv = Array.from(tempDiv.children).find(
                            child => child.classList.contains('w3-container')
                        );
                        if (containerDiv) {
                            treeItem.after(containerDiv);
                        }
                    } else {
                        // For top-level items, replace normally
                        tempContainer.replaceWith(treeItem);
                        const containerDiv = Array.from(tempDiv.children).find(
                            child => child.classList.contains('w3-container')
                        );
                        if (containerDiv) {
                            treeItem.after(containerDiv);
                        }
                    }
                } else {
                    console.error('No tree item found in response HTML');
                }

            } catch (error) {
                console.error('Error in addItem:', error);
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

// Update existing functions to use the new ID pattern
export const updateItem = async (event, type, id, fields) => {
    event.preventDefault();
    try {
        const modelFields = await ensureInitialized();
        const typeConfig = modelFields[type];
        const data = {};
        let hasErrors = false;

        const parentIdInput = event.target.querySelector('input[name="parent_id"]');
        
        if (typeConfig.parent_type) {
            if (parentIdInput && parentIdInput.value) {
                data[typeConfig.parent_type] = parseInt(parentIdInput.value, 10);
            } else {
                throw new Error(`Parent ${typeConfig.parent_type} is required for ${type}`);
            }
        }

        fields.forEach((field) => {
            const element = document.getElementById(getFieldId(type, field, id));
            if (element) {
                const value = element.value.trim();
                const fieldConfig = typeConfig.fields.find(f => f.name === field);

                if (!value && fieldConfig?.required) {
                    element.classList.add('error');
                    hasErrors = true;
                } else {
                    element.classList.remove('error');
                    if (field === 'measurement_type_id') {
                        data['measurement_type_id'] = value ? parseInt(value, 10) : null;
                    } else {
                        data[field] = value || null;
                    }
                }
            }
        });

        if (hasErrors) {
            throw new Error('Please fill in all required fields');
        }

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

    // Find elements first and immediately start fade out
    const itemElement = document.getElementById(`id_form-${type}-${id}`).closest('.tree-item');
    const containerElement = document.getElementById(`id_${type}-${id}`);
    
    // Immediately start fade out and disable interactions
    if (itemElement) {
        itemElement.style.transition = 'opacity 0.3s';
        itemElement.style.opacity = '0.5';
        itemElement.style.pointerEvents = 'none';
    }
    if (containerElement) {
        containerElement.style.transition = 'opacity 0.3s';
        containerElement.style.opacity = '0.5';
        containerElement.style.pointerEvents = 'none';
    }

    try {
        // Send delete request to server
        await ensureInitialized();
        await apiFetch(`/${type}s/${id}/`, { method: 'DELETE' });
        
        // Remove elements from DOM after server confirms deletion
        if (itemElement) itemElement.remove();
        if (containerElement) containerElement.remove();
    } catch (error) {
        // Restore elements if delete fails
        if (itemElement) {
            itemElement.style.opacity = '1';
            itemElement.style.pointerEvents = 'auto';
        }
        if (containerElement) {
            containerElement.style.opacity = '1';
            containerElement.style.pointerEvents = 'auto';
        }
        console.error('Delete failed:', error);
        alert(error.message || 'Failed to delete the item. Please try again.');
    }
};

export const editItem = async (type, id, fields) => {
    try {
        
        const modelFields = await ensureInitialized();
        const typeConfig = modelFields[type];

        fields.forEach((field) => {
            const element = document.getElementById(getFieldId(type, field, id));
            if (element) {
                element.dataset.originalValue = element.value;
                
                if (element.tagName.toLowerCase() === 'select') {
                    element.removeAttribute('disabled');
                    element.style.display = "inline-block";
                    element.classList.add('editing');
                    
                    const selectedOption = element.options[element.selectedIndex];
                    element.dataset.originalDisplayValue = selectedOption ? selectedOption.text : '';
                } else {
                    element.removeAttribute('readonly');
                    element.style.display = "inline-block";
                    element.classList.add('editing');
                }
            }
        });

        const editControls = document.getElementById(`id_${type}EditControls-${id}`);
        if (editControls) {
            editControls.style.display = "inline-flex";
        }

        // Focus the name field
        const nameField = document.getElementById(getFieldId(type, 'name', id));
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

const resetFields = (type, id, fields) => {
    fields.forEach((field) => {
        const element = document.getElementById(getFieldId(type, field, id));
        if (element) {
            if (element.tagName.toLowerCase() === 'select') {
                element.setAttribute('disabled', 'disabled');
            } else {
                element.setAttribute('readonly', 'readonly');
            }
            element.classList.remove('editing', 'error');
            
            if (field !== 'name') {
                element.style.display = "none";
            } else {
                element.style.display = "inline-block";
            }
            
            delete element.dataset.originalValue;
            delete element.dataset.originalDisplayValue;
        }
    });

    const editControls = document.getElementById(`id_${type}EditControls-${id}`);
    if (editControls) {
        editControls.style.display = "none";
    }

    const errorDisplay = document.getElementById(`id_${type}Error-${id}`);
    if (errorDisplay) {
        errorDisplay.remove();
    }
};

