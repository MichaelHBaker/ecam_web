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

// Add new item function
export const addItem = async (type, fields, parentId = null) => {
    try {
        // Fetch schema information first
        const schema = await apiFetch(`/${type}s/`, {
            method: 'OPTIONS'
        });
        const fieldInfo = schema.actions.POST;

        // Create form container
        const tempId = 'temp-new-item';
        const tempContainer = document.createElement('div');
        tempContainer.id = tempId;
        tempContainer.className = 'tree-item w3-hover-light-grey';

        const form = document.createElement('form');
        form.className = 'fields-container';
        form.id = `id_${type}Form-${tempId}`;

        // Add fields based on schema information
        fields.forEach(field => {
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

                fieldSchema.choices.forEach(([value, label]) => {
                    const option = document.createElement('option');
                    option.value = value;
                    option.textContent = label;
                    input.appendChild(option);
                });
            } else {
                // Handle input fields
                input.type = getInputType(fieldSchema.type);
                input.placeholder = field.replace(/_/g, ' ');

                if (fieldSchema.type === 'decimal') {
                    input.step = 'any';
                }
            }

            if (fieldSchema.required) {
                input.required = true;
            }

            form.appendChild(input);
        });

        // Add save/cancel controls
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

        // Determine insert location and parent relationship
        let insertLocation;
        let parentData = {};
        if (parentId) {
            // Find the foreign key field from schema that's not in our fields list
            const parentField = Object.entries(fieldInfo)
                .find(([key, value]) =>
                    value.type === 'field' &&
                    value.required &&
                    !fields.includes(key)
                )?.[0];

            if (!parentField) {
                throw new Error('Could not determine parent relationship field');
            }

            insertLocation = document.getElementById(`id_${parentId}`);
            if (!insertLocation) {
                throw new Error(`Parent element with ID ${parentId} not found`);
            }

            parentData = { [parentField]: parentId };
        } else {
            insertLocation = document.querySelector('.tree-headings');
            if (!insertLocation) {
                throw new Error('Could not find tree headings element');
            }
        }

        insertLocation.after(tempContainer);

        // Handle form submission
        form.onsubmit = async (event) => {
            event.preventDefault();
            try {
                // Collect and validate form data
                const data = { ...parentData };
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

                // Create the item
                const newItem = await apiFetch(`/${type}s/`, {
                    method: 'POST',
                    body: JSON.stringify(data)
                });

                console.log(`${type} created successfully:`, newItem);

                try {
                    // Construct the template
                    const template = `
                        <div class="tree-item w3-hover-light-grey">
                            <div class="tree-text">
                                {% if type != 'measurement' %}
                                    <button
                                        type="button"
                                        onclick="toggleOpenClose('id_{{ newItem.name|slugify }}-{{ newItem.id }}')"
                                        class="w3-button icon"
                                        title="Click to open/close {{ type }} details"
                                    >
                                        <i id="id_chevronIcon-id_{{ newItem.name|slugify }}-{{ newItem.id }}" class="bi bi-chevron-right"></i>
                                    </button>
                                {% endif %}
                                <span id="id_{{ type }}Name-{{ newItem.id }}">{{ newItem.name }}</span>
                            </div>
                            <div class="item-actions">
                                <button class="w3-button">
                                    <i class="bi bi-three-dots-vertical"></i>
                                </button>
                                <div class="w3-dropdown-content w3-bar-block w3-border">
                                    <a href="#" class="w3-bar-item w3-button" onclick="crud.editItem('{{ type }}', '{{ newItem.id }}', '${fields}'); return false;">
                                        <i class="bi bi-pencil"></i> Edit
                                    </a>
                                    <a href="#" class="w3-bar-item w3-button" onclick="crud.deleteItem('{{ type }}', '{{ newItem.id }}'); return false;">
                                        <i class="bi bi-trash"></i> Delete
                                    </a>
                                </div>
                            </div>
                        </div>
                    `;

                    // Render the template
                    const renderResponse = await apiFetch('/templates/render/', {
                        method: 'POST',
                        body: JSON.stringify({
                            template: template,
                            context: {
                                type: type,
                                newItem: newItem,
                                fields: fields
                            }
                        })
                    });

                    if (!renderResponse.html) {
                        throw new Error('No HTML content returned from template rendering');
                    }

                    // Insert the rendered HTML
                    insertLocation.insertAdjacentHTML('afterend', renderResponse.html);
                    tempContainer.remove();

                } catch (templateError) {
                    console.error('Template rendering error:', templateError);
                    throw new Error('Failed to render new item template');
                }

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