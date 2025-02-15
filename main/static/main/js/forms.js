// forms.js
// Form handling and validation utilities

/**
 * Map to store form state data
 * @type {Map<string, Object>}
 */
const formStates = new Map();

/**
 * Generates a consistent field ID across the application
 * @param {string} type - The form type (e.g., 'measurement', 'project')
 * @param {string|Object} field - The field name or configuration object
 * @param {string} id - The instance ID
 * @returns {string} The generated field ID
 */
export const getFieldId = (type, field, id) => {
    const fieldName = typeof field === 'string' ? field : field.name;
    return `field_${type}_${fieldName}_${id}`;
};

/**
 * Initializes form state
 * @param {string} type - Form type
 * @param {string} id - Form instance ID
 * @param {Object} initialData - Initial form data
 * @returns {void}
 */
export const initializeFormState = (type, id, initialData = {}) => {
    const formId = `${type}-${id}`;
    formStates.set(formId, {
        originalValues: { ...initialData },
        currentValues: { ...initialData },
        isDirty: false,
        errors: new Map(),
        validators: new Map()
    });
};

/**
 * Creates form field elements based on configuration
 * @param {Object} field - Field configuration object
 * @param {string} type - Form type
 * @param {string} id - Form instance ID
 * @param {Object} fieldInfo - Additional field information
 * @returns {HTMLElement} The created form field element
 */
export const createField = (field, type, id, fieldInfo) => {
    const isChoice = fieldInfo?.type === 'choice';
    const input = document.createElement(isChoice ? 'select' : 'input');
    
    // Set common attributes
    input.id = getFieldId(type, field, id);
    input.name = field;
    input.className = 'tree-item-field editing';
    
    if (isChoice && fieldInfo.choices) {
        appendChoiceOptions(input, field, fieldInfo.choices);
    } else {
        setupInputField(input, field, fieldInfo);
    }

    // Set up change tracking
    input.addEventListener('change', () => trackFieldChange(type, id, field));
    input.addEventListener('input', () => validateField(type, id, field));

    return input;
};

/**
 * Appends options to a select element
 * @param {HTMLSelectElement} select - Select element
 * @param {string} field - Field name
 * @param {Array} choices - Choice options
 * @returns {void}
 */
const appendChoiceOptions = (select, field, choices) => {
    const emptyOption = document.createElement('option');
    emptyOption.value = '';
    emptyOption.textContent = `Select ${field.replace(/_/g, ' ')}`;
    select.appendChild(emptyOption);

    choices.forEach(choice => {
        const option = document.createElement('option');
        option.value = choice.id;
        option.textContent = choice.display_name;
        if (choice.data) {
            Object.entries(choice.data).forEach(([key, value]) => {
                option.dataset[key] = value;
            });
        }
        select.appendChild(option);
    });
};

/**
 * Sets up a regular input field
 * @param {HTMLInputElement} input - Input element
 * @param {string} field - Field name
 * @param {Object} fieldInfo - Field configuration
 * @returns {void}
 */
const setupInputField = (input, field, fieldInfo) => {
    input.type = fieldInfo?.type === 'date' ? 'date' : 'text';
    input.placeholder = field.replace(/_/g, ' ');
    
    if (fieldInfo?.required) {
        input.required = true;
    }
    if (fieldInfo?.pattern) {
        input.pattern = fieldInfo.pattern;
    }
    if (fieldInfo?.min) {
        input.min = fieldInfo.min;
    }
    if (fieldInfo?.max) {
        input.max = fieldInfo.max;
    }
};

/**
 * Tracks changes to form fields
 * @param {string} type - Form type
 * @param {string} id - Form instance ID
 * @param {string} field - Field name
 * @returns {void}
 */
const trackFieldChange = (type, id, field) => {
    const formId = `${type}-${id}`;
    const state = formStates.get(formId);
    if (!state) return;

    const element = document.getElementById(getFieldId(type, field, id));
    if (!element) return;

    state.currentValues[field] = element.value;
    state.isDirty = !Object.entries(state.currentValues).every(
        ([key, value]) => value === state.originalValues[key]
    );

    updateFormStatus(type, id);
};

/**
 * Validates a specific field
 * @param {string} type - Form type
 * @param {string} id - Form instance ID
 * @param {string} field - Field name
 * @returns {boolean} True if valid
 */
export const validateField = (type, id, field) => {
    const formId = `${type}-${id}`;
    const state = formStates.get(formId);
    if (!state) return true;

    const element = document.getElementById(getFieldId(type, field, id));
    if (!element) return true;

    const validator = state.validators.get(field);
    if (!validator) return true;

    const result = validator(element.value);
    
    if (result === true) {
        clearFieldError(type, id, field);
        return true;
    } else {
        showFieldError(type, id, field, result);
        return false;
    }
};

/**
 * Validates entire form
 * @param {string} type - Form type
 * @param {string} id - Form instance ID
 * @returns {boolean} True if all fields are valid
 */
export const validateForm = (type, id) => {
    const formId = `${type}-${id}`;
    const state = formStates.get(formId);
    if (!state) return true;

    const form = document.getElementById(`${type}Form-${id}`);
    if (!form) return true;

    clearFormErrors(type, id);
    
    let isValid = true;
    for (const [field] of state.validators) {
        if (!validateField(type, id, field)) {
            isValid = false;
        }
    }

    return isValid;
};

/**
 * Shows an error for a specific field
 * @param {string} type - Form type
 * @param {string} id - Form instance ID
 * @param {string} field - Field name
 * @param {string} error - Error message
 * @returns {void}
 */
export const showFieldError = (type, id, field, error) => {
    const element = document.getElementById(getFieldId(type, field, id));
    if (!element) return;

    element.classList.add('error');
    
    const errorDisplay = document.createElement('div');
    errorDisplay.id = `${getFieldId(type, field, id)}-error`;
    errorDisplay.className = 'w3-text-red field-error';
    errorDisplay.style.fontSize = '0.8em';
    errorDisplay.textContent = error;

    element.parentNode.insertBefore(errorDisplay, element.nextSibling);
};

/**
 * Clears error for a specific field
 * @param {string} type - Form type
 * @param {string} id - Form instance ID
 * @param {string} field - Field name
 * @returns {void}
 */
export const clearFieldError = (type, id, field) => {
    const element = document.getElementById(getFieldId(type, field, id));
    if (!element) return;

    element.classList.remove('error');
    
    const errorDisplay = document.getElementById(`${getFieldId(type, field, id)}-error`);
    if (errorDisplay) {
        errorDisplay.remove();
    }
};

/**
 * Clears all form errors
 * @param {string} type - Form type
 * @param {string} id - Form instance ID
 * @returns {void}
 */
export const clearFormErrors = (type, id) => {
    const form = document.getElementById(`${type}Form-${id}`);
    if (!form) return;

    form.querySelectorAll('.field-error').forEach(error => error.remove());
    form.querySelectorAll('.error').forEach(field => field.classList.remove('error'));
};

/**
 * Updates form status and UI
 * @param {string} type - Form type
 * @param {string} id - Form instance ID
 * @returns {void}
 */
const updateFormStatus = (type, id) => {
    const formId = `${type}-${id}`;
    const state = formStates.get(formId);
    if (!state) return;

    const form = document.getElementById(`${type}Form-${id}`);
    if (!form) return;

    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton) {
        submitButton.disabled = !state.isDirty || state.errors.size > 0;
    }
};

/**
 * Resets form to original state
 * @param {string} type - Form type
 * @param {string} id - Form instance ID
 * @returns {void}
 */
export const resetForm = (type, id) => {
    const formId = `${type}-${id}`;
    const state = formStates.get(formId);
    if (!state) return;

    Object.entries(state.originalValues).forEach(([field, value]) => {
        const element = document.getElementById(getFieldId(type, field, id));
        if (element) {
            element.value = value;
            clearFieldError(type, id, field);
        }
    });

    state.currentValues = { ...state.originalValues };
    state.isDirty = false;
    state.errors.clear();

    updateFormStatus(type, id);
};

/**
 * Collects current form data
 * @param {string} type - Form type
 * @param {string} id - Form instance ID
 * @returns {Object|null} Form data or null if validation fails
 */
export const collectFormData = (type, id) => {
    if (!validateForm(type, id)) return null;

    const formId = `${type}-${id}`;
    const state = formStates.get(formId);
    if (!state) return null;

    return { ...state.currentValues };
};

/**
 * Adds a field validator
 * @param {string} type - Form type
 * @param {string} id - Form instance ID
 * @param {string} field - Field name
 * @param {Function} validator - Validation function
 * @returns {void}
 */
export const addFieldValidator = (type, id, field, validator) => {
    const formId = `${type}-${id}`;
    const state = formStates.get(formId);
    if (!state) return;

    state.validators.set(field, validator);
};