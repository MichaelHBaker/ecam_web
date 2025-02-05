// CSRF Token setup
export const CSRF_TOKEN = document.querySelector('[name=csrfmiddlewaretoken]')?.value || '';
if (!CSRF_TOKEN) {
    console.warn('CSRF token not found in the DOM.');
}

// Initialize state and event handlers
let columnSelectionMenus = {};
let codeMirrorInstances = {};
let codeMirrorLoaded = false;

const initializeColumnSelectionHandlers = () => {
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.action-menu') && !e.target.closest('.w3-card')) {
            Object.keys(columnSelectionMenus).forEach(hideColumnSelectionMenus);
        }
    });
};
initializeColumnSelectionHandlers();

// Initialize MODEL_FIELDS
export let MODEL_FIELDS = null;
let modelFieldsPromise = null;

// Helper function for CodeMirror instances
const generateModalInstanceId = (locationId) => {
    return `${locationId}-${Date.now()}`;
};

const getModalInstanceId = (locationId) => {
    const modal = document.getElementById(`id_modal-location-${locationId}`);
    return modal?.dataset.instanceId;
};

// Function to load CodeMirror and its dependencies
const loadCodeMirror = async () => {
    if (codeMirrorLoaded) return;
    
    if (!window.CodeMirror) {
        await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.2/codemirror.min.js';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    codeMirrorLoaded = true;
};

// Generalized API fetch function with enhanced error handling
export const apiFetch = async (endpoint, options = {}, basePath = '/api') => {
    let headers = {
        'X-CSRFToken': CSRF_TOKEN,
    };

    // Only set Content-Type for non-FormData requests
    if (!(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
    }

    const defaultOptions = {
        headers: headers,
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

export const processMeasurementChoices = (data) => {
    if (data?.measurement?.fields) {
        const unitField = data.measurement.fields.find(f => f.name === 'unit_id');
        if (unitField) {
            // Organize measurement choices hierarchically
            const categories = unitField.choices?.categories || [];
            const units = unitField.choices?.units || [];
            
            // Add unit information to each category
            categories.forEach(category => {
                category.units = units.filter(unit => unit.category_id === category.id);
            });

            // Update the choices structure
            unitField.choices = {
                categories,
                units,
                structured: categories // Categories with nested units
            };
        }
    }
    return data;
};


// Initialize MODEL_FIELDS from API
export const initializeModelFields = async () => {
    if (modelFieldsPromise) {
        return modelFieldsPromise;
    }

    modelFieldsPromise = apiFetch('/model-fields/')
        .then(data => {
            // Process measurement choices before storing
            MODEL_FIELDS = processMeasurementChoices(data);
            return MODEL_FIELDS;
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

// Helper function for consistent field ID generation
export const getFieldId = (type, field, id) => {
    const fieldName = typeof field === 'string' ? field : field.name;
    return `field_${type}_${fieldName}_${id}`;
};

const hideColumnSelectionMenus = (locationId) => {
    if (columnSelectionMenus[locationId]) {
        if (columnSelectionMenus[locationId].actionMenu) {
            columnSelectionMenus[locationId].actionMenu.remove();
        }
        if (columnSelectionMenus[locationId].dropdownMenu) {
            columnSelectionMenus[locationId].dropdownMenu.remove();
        }
        delete columnSelectionMenus[locationId];
    }
};

const showColumnActionMenu = (editor, locationId) => {
    hideColumnSelectionMenus(locationId);

    const selection = editor.getSelection();
    if (!selection) return;

    const to = editor.getCursor('to');
    const coords = editor.charCoords(to, 'window');
    
    console.log('Menu coordinates:', coords);
    console.log('Creating menu at:', {
        top: coords.top,
        left: coords.left + 20
    });

    const menu = document.createElement('div');
    menu.className = 'action-menu';
    menu.style.cssText = `
        position: fixed;  /* Changed from absolute */
        top: ${coords.top}px;
        left: ${(coords.left + 20)}px;
        z-index: 1100;   /* Increased z-index */
        background: white;
        border-radius: 4px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        cursor: pointer;
        padding: 2px;
    `;

    // Add a visible background and border
    menu.innerHTML = `
        <button class="w3-button w3-white w3-border" style="padding: 4px; min-width: 30px;">
            <i class="bi bi-three-dots-vertical"></i>
        </button>
    `;

    menu.onclick = (e) => {
        console.log('Menu clicked');
        e.stopPropagation();
        showColumnDropdownMenu(editor, coords, locationId);
    };

    document.body.appendChild(menu);
    console.log('Menu added to document');
    
    columnSelectionMenus[locationId] = {
        actionMenu: menu,
        dropdownMenu: null
    };
};

const showColumnDropdownMenu = (editor, coords, locationId) => {
    if (columnSelectionMenus[locationId]?.dropdownMenu) {
        columnSelectionMenus[locationId].dropdownMenu.remove();
    }

    const dropdown = document.createElement('div');
    dropdown.className = 'w3-card w3-white';
    dropdown.style.cssText = `
        position: absolute;
        top: ${coords.top}px;
        left: ${coords.left + 40}px;
        z-index: 1001;
        min-width: 150px;
    `;

    dropdown.innerHTML = `
        <div class="w3-bar-block">
            <a href="#" class="w3-bar-item w3-button" data-action="data-start">
                <i class="bi bi-arrow-right-circle"></i> Data Start
            </a>
            <a href="#" class="w3-bar-item w3-button" data-action="data-type">
                <i class="bi bi-graph-up"></i> Data Type
            </a>
            <a href="#" class="w3-bar-item w3-button" data-action="timestamp">
                <i class="bi bi-clock"></i> Time Stamp
            </a>
        </div>
    `;

    dropdown.querySelectorAll('.w3-bar-item').forEach(item => {
        item.onclick = (e) => {
            e.preventDefault();
            const action = e.currentTarget.dataset.action;
            console.log('Selected action:', action);
            hideColumnSelectionMenus(locationId);
        };
    });

    document.body.appendChild(dropdown);
    columnSelectionMenus[locationId].dropdownMenu = dropdown;
};

const initializeColumnSelection = (locationId) => {
    const instanceId = getModalInstanceId(locationId);
    console.log('Initializing column selection for instance:', instanceId);
    
    const editor = codeMirrorInstances[instanceId];
    console.log('Editor found:', editor);
    
    if (!editor) {
        console.log('No editor found for locationId:', locationId);
        return;
    }

    console.log('Setting up selection events');

    // Try multiple event types to see which one fires
    editor.on('cursorActivity', () => {
        console.log('Cursor Activity');
        const selection = editor.getSelection();
        console.log('Selection from cursor:', selection);
    });

    editor.on('select', () => {
        console.log('Select Event');
        const selection = editor.getSelection();
        console.log('Selection from select:', selection);
    });

    editor.getWrapperElement().addEventListener('mouseup', () => {
        console.log('Mouse Up on wrapper');
        setTimeout(() => {
            const selection = editor.getSelection();
            console.log('Selection from mouseup:', selection);
            if (selection && selection.trim()) {
                showColumnActionMenu(editor, locationId);
            }
        }, 50);  // Slight delay to ensure selection is complete
    });

    // Add explicit test method to editor
    editor.testSelection = () => {
        console.log('Manual test of selection');
        const selection = editor.getSelection();
        console.log('Current selection:', selection);
        if (selection && selection.trim()) {
            showColumnActionMenu(editor, locationId);
        }
    };
};

// Modal management functions
export const showMeasurementModal = (locationId) => {
    const modal = document.getElementById(`id_modal-location-${locationId}`);
    if (!modal) return;

    // Generate and store instance ID
    const instanceId = generateModalInstanceId(locationId);
    modal.dataset.instanceId = instanceId;

    // Show modal
    modal.style.display = 'block';
    
    // Set up resize observer for CodeMirror refresh
    const modalContent = modal.querySelector('.w3-modal-content');
    if (modalContent) {
        const resizeObserver = new ResizeObserver(entries => {
            // Refresh CodeMirror when modal is resized
            if (codeMirrorInstances[instanceId]) {
                codeMirrorInstances[instanceId].refresh();
            }
        });
        
        resizeObserver.observe(modalContent);

        // Clean up observer when modal is closed
        const cleanup = () => {
            resizeObserver.disconnect();
            modal.removeEventListener('hide', cleanup);
        };
        
        modal.addEventListener('hide', cleanup);
    }

    // Handle Escape key
    const handleEscape = (event) => {
        if (event.key === 'Escape') {
            hideMeasurementModal(locationId);
            document.removeEventListener('keydown', handleEscape);
        }
    };
    document.addEventListener('keydown', handleEscape);

    // Handle click outside modal
    const handleOutsideClick = (event) => {
        if (event.target === modal) {
            hideMeasurementModal(locationId);
            modal.removeEventListener('click', handleOutsideClick);
        }
    };
    modal.addEventListener('click', handleOutsideClick);
};

export const hideMeasurementModal = (locationId) => {
    const modal = document.getElementById(`id_modal-location-${locationId}`);
    if (!modal) return;

    const instanceId = modal.dataset.instanceId;
    if (instanceId && codeMirrorInstances[instanceId]) {
        codeMirrorInstances[instanceId].toTextArea();
        delete codeMirrorInstances[instanceId];
    }

    // Clean up column selection
    hideColumnSelectionMenus(locationId);

    delete modal.dataset.instanceId;
    modal.style.display = 'none';
    
    // Clear both IDs and file input
    const fileInput = document.getElementById(`id_file_input-${locationId}`);
    const datasetIdInput = document.getElementById(`id_dataset_id-${locationId}`);
    const importIdInput = document.getElementById(`id_import_id-${locationId}`);
    
    if (fileInput) fileInput.value = '';
    if (datasetIdInput) datasetIdInput.value = '';
    if (importIdInput) importIdInput.value = '';
    
    // Reset file display
    const fileDisplay = document.getElementById(`id_file_display-${locationId}`);
    if (fileDisplay) {
        fileDisplay.innerHTML = '<i class="bi bi-file-earmark"></i> No file selected';
        fileDisplay.className = 'w3-panel w3-pale-blue w3-leftbar w3-border-blue file-display';
    }
    
    const cmContainer = document.getElementById(`id_codemirror_container-${locationId}`);
    if (cmContainer) {
        cmContainer.style.display = 'none';
        const notice = cmContainer.querySelector('.w3-panel');
        if (notice) notice.remove();
    }

    const nextButton = document.querySelector(`button[onclick*="processFile('${locationId}')"]`);
    if (nextButton) {
        nextButton.disabled = true;
    }
};

// Add our new file handling functions here
export const handleFileSelect = (locationId) => {
    const fileInput = document.getElementById(`id_file_input-${locationId}`);
    if (fileInput) {
        fileInput.click();
    }
};

export const handleFileChange = async (event, locationId) => {
    const instanceId = getModalInstanceId(locationId);
    if (!instanceId) return;

    const file = event.target.files[0];
    if (!file) return;

    const fileDisplay = document.getElementById(`id_file_display-${locationId}`);
    if (fileDisplay) {
        fileDisplay.innerHTML = `<i class="bi bi-arrow-clockwise"></i> Uploading ${file.name}...`;
        fileDisplay.className = 'w3-panel w3-leftbar w3-pale-yellow w3-border-yellow file-display';
    }

    try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('location_id', String(locationId));

        const response = await apiFetch('/data-imports/', {
            method: 'POST',
            body: formData
        });

        if (fileDisplay) {
            fileDisplay.innerHTML = `<i class="bi bi-file-earmark-check"></i> ${file.name}`;
            fileDisplay.className = 'w3-panel w3-leftbar w3-pale-green w3-border-green file-display';
        }

        const datasetIdInput = document.getElementById(`id_dataset_id-${locationId}`);
        const importIdInput = document.getElementById(`id_import_id-${locationId}`);
        if (datasetIdInput) datasetIdInput.value = response.dataset_id;
        if (importIdInput) importIdInput.value = response.import_id;

        await loadCodeMirror();
        const cmContainer = document.getElementById(`id_codemirror_container-${locationId}`);
        if (cmContainer) {
            cmContainer.style.display = 'block';
        }

        if (!codeMirrorInstances[instanceId] && response.preview_content) {
            const textarea = document.getElementById(`id_codemirror_editor-${locationId}`);
            if (textarea) {
                console.log('Creating CodeMirror instance');
                const cm = CodeMirror.fromTextArea(textarea, {
                    mode: 'text/plain',
                    theme: 'default',
                    lineNumbers: true,
                    readOnly: false,
                    viewportMargin: Infinity,
                    lineWrapping: false,
                    scrollbarStyle: 'native',
                    fixedGutter: true,
                    gutters: ["CodeMirror-linenumbers"],
                });
                
                codeMirrorInstances[instanceId] = cm;
                console.log('CodeMirror instance created:', cm);
                        
                console.log('Initializing column selection');
                initializeColumnSelection(locationId);
                
                // Test if we can access the editor
                console.log('Can access editor after init:', codeMirrorInstances[instanceId]);
            }
        }

        if (codeMirrorInstances[instanceId] && response.preview_content) {
            codeMirrorInstances[instanceId].setValue(response.preview_content);
            codeMirrorInstances[instanceId].refresh();
            
            if (response.preview_truncated) {
                const notice = document.createElement('div');
                notice.className = 'w3-panel w3-pale-yellow w3-leftbar w3-border-yellow';
                notice.innerHTML = '<i class="bi bi-info-circle"></i> File content truncated for preview';
                cmContainer.appendChild(notice);
            }
        }

        const nextButton = document.querySelector(`button[onclick*="processFile('${locationId}')"]`);
        if (nextButton) {
            nextButton.disabled = false;
        }

    } catch (error) {
        console.error('Error uploading file:', error);
        if (fileDisplay) {
            fileDisplay.innerHTML = `<i class="bi bi-exclamation-triangle"></i> Error: ${error.message || 'Failed to upload file'}`;
            fileDisplay.className = 'w3-panel w3-leftbar w3-pale-red w3-border-red file-display';
        }
    }
};

export const processFile = async (locationId) => {
    const datasetId = document.getElementById(`id_dataset_id-${locationId}`)?.value;
    if (!datasetId) {
        console.error('No dataset ID found');
        return;
    }
    
    try {
        await apiFetch(`/datasets/${datasetId}/analyze/`, {
            method: 'POST'
        });
    } catch (error) {
        console.error('Error analyzing file:', error);
    }
};


const getUnitDisplayInfo = (type, unitId, modelFields) => {
    if (!unitId || !modelFields) return null;

    const unitField = modelFields[type]?.fields.find(f => f.name === 'unit_id');
    if (!unitField?.choices?.units) return null;

    const unit = unitField.choices.units.find(u => u.id === parseInt(unitId, 10));
    if (!unit) return null;

    return {
        unit: unit.display_name,
        category: unitField.choices.categories.find(c => c.id === unit.category_id)?.display_name,
        type: `${unit.type_name} (${unit.type_symbol})`
    };
};

export const validateMeasurementForm = (data) => {
    const errors = {};

    if (!data.unit_id) {
        errors.unit_id = 'Unit is required';
    }

    if (!data.name) {
        errors.name = 'Name is required';
    }

    // New validation for multiplier
    if (data.multiplier && !data.type_supports_multipliers) {
        errors.multiplier = 'This measurement type does not support multipliers';
    }

    // Timezone validation (defaults to UTC if not provided)
    if (data.source_timezone) {
        try {
            Intl.DateTimeFormat(undefined, {timeZone: data.source_timezone});
        } catch (e) {
            errors.source_timezone = 'Invalid timezone';
        }
    }

    return Object.keys(errors).length > 0 ? errors : null;
};
const validateUnitConsistency = (type, selectedUnit, modelFields) => {
    if (!selectedUnit || !modelFields) return true;

    const unitField = modelFields[type]?.fields.find(f => f.name === 'unit_id');
    if (!unitField?.choices?.units) return true;

    const unit = unitField.choices.units.find(u => u.id === parseInt(selectedUnit, 10));
    if (!unit) return false;

    // Add validation to ensure unit matches type
    if (unit.type_id !== modelFields.selected_type_id) {
        return false;
    }

    return true;
};

export const clearFormErrors = (type, id) => {
    const form = document.getElementById(`id_${type}Form-${id}`);
    if (!form) return;

    // Remove error display
    const errorDisplay = document.getElementById(`id_${type}Error-${form.id}`);
    if (errorDisplay) {
        errorDisplay.remove();
    }

    // Remove error highlighting from fields
    const fields = form.querySelectorAll('input, select');
    fields.forEach(field => {
        field.classList.remove('error');
    });
};
// Display form errors
const showFormError = (form, error, type) => {
    // Remove any existing error displays
    const existingError = document.getElementById(`id_${type}Error-${form.id}`);
    if (existingError) {
        existingError.remove();
    }

    // Create error display
    const errorDisplay = document.createElement('div');
    errorDisplay.id = `id_${type}Error-${form.id}`;
    errorDisplay.className = 'w3-text-red';
    errorDisplay.style.marginTop = '4px';

    // Handle different error formats
    let errorMessage = '';
    if (error.message) {
        errorMessage = error.message;
    } else if (typeof error === 'object') {
        // Handle validation errors for measurement fields
        const messages = [];
        Object.entries(error).forEach(([field, msg]) => {
            if (field === 'unit_id') {
                messages.push('Please select a valid unit');
            } else if (field === 'category') {
                messages.push('Invalid measurement category');
            } else if (field === 'type') {
                messages.push('Invalid measurement type');
            } else {
                messages.push(`${field}: ${msg}`);
            }
        });
        errorMessage = messages.join('\n');
    } else {
        errorMessage = String(error);
    }

    errorDisplay.textContent = errorMessage;

    // Add error highlighting to relevant fields
    fields.forEach(field => {
        const element = document.getElementById(getFieldId(type, field, form.id));
        if (element) {
            if (error[field]) {
                element.classList.add('error');
            } else {
                element.classList.remove('error');
            }
        }
    });

    form.appendChild(errorDisplay);
};

const createField = (field, type, tempId, fieldInfo) => {
    // Create select for choice fields, input for others
    const element = fieldInfo?.type === 'choice' ? 'select' : 'input';
    const input = document.createElement(element);
    
    // Set common attributes
    input.id = `id_${type}${field.charAt(0).toUpperCase() + field.slice(1)}-${tempId}`;
    input.name = field;
    input.className = 'tree-item-field editing';
    
    if (fieldInfo?.type === 'choice' && fieldInfo.choices) {
        // Add empty option
        const emptyOption = document.createElement('option');
        emptyOption.value = '';
        emptyOption.textContent = `Select ${field.replace(/_/g, ' ')}`;
        input.appendChild(emptyOption);

        // Add choices
        fieldInfo.choices.forEach(choice => {
            const option = document.createElement('option');
            option.value = choice.id;
            option.textContent = choice.display_name;
            input.appendChild(option);
        });
    } else {
        // Regular input field
        input.type = fieldInfo?.type === 'date' ? 'date' : 'text';
        input.placeholder = field.replace(/_/g, ' ');
    }

    // Make sure field is visible during edit/create
    input.style.display = 'inline';

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

            // Handle unit selection
            if (field === 'unit_id') {
                if (value) {
                    data.unit_id = parseInt(value, 10);
                    const selectedOption = element.options[element.selectedIndex];
                    if (selectedOption) {
                        data.category_id = parseInt(selectedOption.dataset.categoryId, 10);
                        data.type_id = parseInt(selectedOption.dataset.typeId, 10);
                        // Add support for multiplier validation
                        data.type_supports_multipliers = selectedOption.dataset.supportsMultipliers === 'true';
                    }
                } else {
                    data.unit_id = null;
                }
            }
            // Handle multiplier field
            else if (field === 'multiplier') {
                data.multiplier = value || null;
            }
            // Handle timezone field - ensure UTC default
            else if (field === 'source_timezone') {
                data.source_timezone = value || 'UTC';
            }
            // Handle other fields
            else if (fieldConfig?.is_foreign_key) {
                data[field] = value ? parseInt(value, 10) : null;
            }
            else if (fieldConfig?.type === 'choice') {
                data[field] = value || null;
            }
            else {
                data[field] = value || null;
            }
        }
    });
    return data;
};




// Utility functions for handling measurement units

export const handleUnitChange = (unitElement, type, id) => {
    if (!unitElement) return;

    const selectedOption = unitElement.options[unitElement.selectedIndex];
    if (!selectedOption) return;

    const categoryDisplay = document.getElementById(getFieldId(type, 'category', id));
    const typeDisplay = document.getElementById(getFieldId(type, 'type', id));
    const displayDiv = document.getElementById(getFieldId(type, 'unit_display', id));

    if (selectedOption.value) {
        // Update displays
        if (categoryDisplay) {
            categoryDisplay.textContent = selectedOption.dataset.categoryName || '';
            categoryDisplay.style.display = 'inline-block';
        }
        
        if (typeDisplay) {
            typeDisplay.textContent = selectedOption.dataset.typeName || '';
            typeDisplay.style.display = 'inline-block';
        }

        if (displayDiv) {
            displayDiv.textContent = selectedOption.text;
            displayDiv.style.display = 'inline-block';
        }

        // Store the selected values
        unitElement.dataset.selectedCategoryId = selectedOption.dataset.categoryId;
        unitElement.dataset.selectedTypeId = selectedOption.dataset.typeId;
        unitElement.dataset.selectedDisplay = selectedOption.text;
    } else {
        // Clear displays if no unit selected
        if (categoryDisplay) {
            categoryDisplay.textContent = '';
            categoryDisplay.style.display = 'none';
        }
        
        if (typeDisplay) {
            typeDisplay.textContent = '';
            typeDisplay.style.display = 'none';
        }

        if (displayDiv) {
            displayDiv.textContent = '';
            displayDiv.style.display = 'none';
        }

        // Clear stored values
        delete unitElement.dataset.selectedCategoryId;
        delete unitElement.dataset.selectedTypeId;
        delete unitElement.dataset.selectedDisplay;
    }
};

export const attachUnitChangeHandler = (element, type, id) => {
    if (!element) return;

    const changeHandler = () => handleUnitChange(element, type, id);
    element.addEventListener('change', changeHandler);

    // Store the handler reference for potential cleanup
    element.dataset.changeHandler = changeHandler;

    // Initial update
    handleUnitChange(element, type, id);

    return changeHandler;
};

export const removeUnitChangeHandler = (element) => {
    if (!element || !element.dataset.changeHandler) return;

    element.removeEventListener('change', element.dataset.changeHandler);
    delete element.dataset.changeHandler;
};

export const setupMeasurementHandlers = (type, id) => {
    const unitElement = document.getElementById(getFieldId(type, 'unit_id', id));
    if (unitElement) {
        attachUnitChangeHandler(unitElement, type, id);
    }
};

export const cleanupMeasurementHandlers = (type, id) => {
    const unitElement = document.getElementById(getFieldId(type, 'unit_id', id));
    if (unitElement) {
        removeUnitChangeHandler(unitElement);
    }
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

        // Create form wrapper div
        const formWrapper = document.createElement('div');
        formWrapper.className = 'tree-text';
        formWrapper.id = `id_form-${type}-${tempId}`;

        // Create form
        const form = document.createElement('form');
        form.id = `id_${type}Form-${tempId}`;

        // Add CSRF token
        const csrfInput = document.createElement('input');
        csrfInput.type = 'hidden';
        csrfInput.name = 'csrfmiddlewaretoken';
        csrfInput.value = CSRF_TOKEN;
        form.appendChild(csrfInput);

        // Add type ID if needed
        const typeIdInput = document.createElement('input');
        typeIdInput.type = 'hidden';
        typeIdInput.name = `${type}_id`;
        typeIdInput.value = tempId;
        form.appendChild(typeIdInput);

        // Add parent ID if needed
        if (parentId && modelInfo.parent_type) {
            const parentInput = document.createElement('input');
            parentInput.type = 'hidden';
            parentInput.name = 'parent_id';
            parentInput.value = parentId;
            form.appendChild(parentInput);
        }

        // Create fields container
        const fieldsContainer = document.createElement('div');
        fieldsContainer.className = 'fields-container';
        fieldsContainer.style.display = 'inline-flex';

        // Create and add fields
        fields.forEach(field => {
            const fieldConfig = modelInfo.fields.find(f => f.name === field);
            const fieldElement = createField(field, type, tempId, fieldConfig);
            fieldsContainer.appendChild(fieldElement);
        });

        form.appendChild(fieldsContainer);

        // Add edit controls
        const controls = document.createElement('span');
        controls.id = `id_${type}EditControls-${tempId}`;
        controls.style.display = 'inline-flex';
        controls.style.marginLeft = '4px';
        controls.innerHTML = `
            <button type="submit" class="w3-button" style="padding: 0 4px;" onclick="event.stopPropagation()">
                <i class="bi bi-check w3-large"></i>
            </button>
            <button type="button" class="w3-button" style="padding: 0 4px;">
                <i class="bi bi-x w3-large"></i>
            </button>
        `;
        form.appendChild(controls);

        // Assemble the structure
        formWrapper.appendChild(form);
        tempContainer.appendChild(formWrapper);

        // Find parent container
        const parentContainer = parentId ?
            document.getElementById(`id_${modelInfo.parent_type}-${parentId}`) :
            document.querySelector('.tree-headings');

        if (!parentContainer) {
            throw new Error('Parent container not found');
        }

        // Insert in appropriate location
        if (parentId) {
            parentContainer.classList.remove('w3-hide');
            parentContainer.classList.add('w3-show');
            parentContainer.insertAdjacentElement('afterbegin', tempContainer);
            
            const chevronIcon = document.getElementById(`id_chevronIcon-id_${modelInfo.parent_type}-${parentId}`);
            if (chevronIcon) {
                chevronIcon.className = "bi bi-chevron-down";
            }
        } else {
            parentContainer.insertAdjacentElement('afterend', tempContainer);
        }

        // Handle form submission
        form.onsubmit = async (event) => {
            event.preventDefault();
            try {
                const data = {};
                fields.forEach(field => {
                    const element = document.getElementById(`id_${type}${field.charAt(0).toUpperCase() + field.slice(1)}-${tempId}`);
                    if (element) {
                        data[field] = element.value;
                    }
                });

                if (parentId && modelInfo.parent_type) {
                    data[modelInfo.parent_type] = parseInt(parentId, 10);
                }

                const response = await apiFetch(`/${type}s/`, {
                    method: 'POST',
                    body: JSON.stringify(data)
                });

                // Create temp div to hold new HTML
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = response.html;
                
                // Find and replace tree item
                const treeItem = tempDiv.querySelector('.tree-item');
                if (treeItem) {
                    tempContainer.replaceWith(treeItem);
                    const containerDiv = Array.from(tempDiv.children).find(
                        child => child.classList.contains('w3-container')
                    );
                    if (containerDiv) {
                        treeItem.after(containerDiv);
                    }
                } else {
                    console.error('No tree item found in response HTML');
                }

            } catch (error) {
                const errorDiv = document.createElement('div');
                errorDiv.className = 'w3-text-red';
                errorDiv.style.marginTop = '4px';
                errorDiv.textContent = error.message;
                form.appendChild(errorDiv);
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
    clearFormErrors(type, id);
    
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
                    
                    // Handle unit updates with validation
                    if (field === 'unit_id' && value) {
                        const isValidUnit = validateUnitConsistency(type, value, modelFields);
                        if (!isValidUnit) {
                            element.classList.add('error');
                            hasErrors = true;
                            throw new Error('Invalid unit selection');
                        }
                        data.unit_id = parseInt(value, 10);
                        
                        const unitInfo = getUnitDisplayInfo(type, value, modelFields);
                        if (unitInfo) {
                            const categoryElement = document.getElementById(getFieldId(type, 'category', id));
                            const typeElement = document.getElementById(getFieldId(type, 'type', id));
                            
                            if (categoryElement) categoryElement.textContent = unitInfo.category;
                            if (typeElement) typeElement.textContent = unitInfo.type;
                        }
                    }
                    // Handle other foreign keys
                    else if (fieldConfig?.is_foreign_key) {
                        data[field] = value ? parseInt(value, 10) : null;
                    }
                    // Handle choices
                    else if (fieldConfig?.type === 'choice') {
                        data[field] = value;
                    }
                    // Handle regular fields
                    else {
                        data[field] = value;
                    }
                }
            }
        });

        if (hasErrors) {
            throw new Error('Please fill in all required fields correctly');
        }

        // For measurements, perform additional validation
        if (type === 'measurement') {
            const validationErrors = validateMeasurementForm(data);
            if (validationErrors) {
                throw validationErrors;
            }
        }

        const response = await apiFetch(`/${type}s/${id}/`, {
            method: 'PATCH',
            body: JSON.stringify(data),
        });

        // Update displays after successful update
        if (type === 'measurement' && response.unit) {
            const unitInfo = getUnitDisplayInfo(type, response.unit.id, modelFields);
            if (unitInfo) {
                const categoryElement = document.getElementById(getFieldId(type, 'category', id));
                const typeElement = document.getElementById(getFieldId(type, 'type', id));
                const unitDisplay = document.getElementById(getFieldId(type, 'unit_display', id));

                if (categoryElement) categoryElement.textContent = unitInfo.category;
                if (typeElement) typeElement.textContent = unitInfo.type;
                if (unitDisplay) unitDisplay.textContent = unitInfo.unit;
            }
        }

        resetFields(type, id, fields);
        return response;

    } catch (error) {
        showFormError(document.getElementById(`id_${type}Form-${id}`), error, type);
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

        // Cleanup any existing handlers first
        cleanupMeasurementHandlers(type, id);

        fields.forEach((field) => {
            const element = document.getElementById(getFieldId(type, field, id));
            if (element) {
                element.dataset.originalValue = element.value;
                
                if (element.tagName.toLowerCase() === 'select') {
                    element.removeAttribute('disabled');
                    element.style.display = "inline-block";
                    element.classList.add('editing');
                    
                    // Store additional data for measurement fields
                    if (field === 'unit_id') {
                        const selectedOption = element.options[element.selectedIndex];
                        if (selectedOption) {
                            element.dataset.originalCategoryId = selectedOption.dataset.categoryId;
                            element.dataset.originalTypeId = selectedOption.dataset.typeId;
                            element.dataset.originalDisplayValue = selectedOption.text;
                        }
                    } else {
                        const selectedOption = element.options[element.selectedIndex];
                        element.dataset.originalDisplayValue = selectedOption ? selectedOption.text : '';
                    }
                } else {
                    element.removeAttribute('readonly');
                    element.style.display = "inline-block";
                    element.classList.add('editing');
                }
            }
        });

        // Setup measurement handlers if this is a measurement
        if (type === 'measurement') {
            setupMeasurementHandlers(type, id);
        }

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
        const element = document.getElementById(getFieldId(type, field, id));
        if (element) {
            // Restore original value
            if (field === 'unit_id') {
                // Restore unit selection
                element.value = element.dataset.originalValue || '';
                
                // Restore category and type displays
                const categoryDisplay = document.getElementById(getFieldId(type, 'category', id));
                const typeDisplay = document.getElementById(getFieldId(type, 'type', id));
                
                if (categoryDisplay && element.dataset.originalCategoryId) {
                    const selectedOption = element.options[element.selectedIndex];
                    if (selectedOption) {
                        categoryDisplay.textContent = selectedOption.dataset.categoryName || '';
                    }
                }
                
                if (typeDisplay && element.dataset.originalTypeId) {
                    const selectedOption = element.options[element.selectedIndex];
                    if (selectedOption) {
                        typeDisplay.textContent = selectedOption.dataset.typeName || '';
                    }
                }
            } else {
                // Handle regular fields and other selects
                element.value = element.dataset.originalValue || '';
                if (element.tagName.toLowerCase() === 'select' && element.dataset.originalDisplayValue) {
                    const option = Array.from(element.options)
                        .find(opt => opt.text === element.dataset.originalDisplayValue);
                    if (option) {
                        element.value = option.value;
                    }
                }
            }

            // Clear error states
            element.classList.remove('error');
            
            // Clean up stored data
            delete element.dataset.originalValue;
            delete element.dataset.originalDisplayValue;
            delete element.dataset.originalCategoryId;
            delete element.dataset.originalTypeId;
        }
    });
    
    // Clear any error messages
    const errorDisplay = document.getElementById(`id_${type}Error-${id}`);
    if (errorDisplay) {
        errorDisplay.remove();
    }

    // Remove any event listeners from unit selection
    const unitField = document.getElementById(getFieldId(type, 'unit_id', id));
    if (unitField) {
        unitField.replaceWith(unitField.cloneNode(true));
    }
    
    resetFields(type, id, fields);
};


export const resetFields = (type, id, fields) => {
    // Clean up measurement handlers first
    cleanupMeasurementHandlers(type, id);

    fields.forEach((field) => {
        const element = document.getElementById(getFieldId(type, field, id));
        if (element) {
            // Reset to original value
            if (element.tagName.toLowerCase() === 'select') {
                element.setAttribute('disabled', 'disabled');
                
                // Special handling for unit selection
                if (field === 'unit_id') {
                    // Restore unit selection and related displays
                    element.value = element.dataset.originalValue || '';
                    handleUnitChange(element, type, id);
                } else {
                    // Handle other select fields
                    if (element.dataset.originalDisplayValue) {
                        const option = Array.from(element.options)
                            .find(opt => opt.text === element.dataset.originalDisplayValue);
                        if (option) {
                            element.value = option.value;
                        }
                    }
                }
            } else {
                element.setAttribute('readonly', 'readonly');
                element.value = element.dataset.originalValue || '';
            }

            // Reset display and classes
            element.classList.remove('editing', 'error');
            if (field !== 'name') {
                element.style.display = "none";
            } else {
                element.style.display = "inline-block";
            }
            
            // Clean up stored data
            delete element.dataset.originalValue;
            delete element.dataset.originalDisplayValue;
            delete element.dataset.originalCategoryId;
            delete element.dataset.originalTypeId;
        }
    });

    // Reset edit controls
    const editControls = document.getElementById(`id_${type}EditControls-${id}`);
    if (editControls) {
        editControls.style.display = "none";
    }

    // Clear any error messages
    const errorDisplay = document.getElementById(`id_${type}Error-${id}`);
    if (errorDisplay) {
        errorDisplay.remove();
    }
};



