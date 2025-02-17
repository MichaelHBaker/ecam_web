// forms.js
// Enhanced form handling and validation utilities

import { State } from './state.js';
import { NotificationUI } from './ui.js';

const FORMS_STATE_KEY = 'forms_state';

/**
 * Map to store form state data
 * @type {Map<string, Object>}
 */
const formStates = new Map();

/**
 * Field type definitions with validation rules
 */
const FIELD_TYPES = {
    string: {
        component: 'input',
        attributes: { type: 'text' },
        validate: (value) => typeof value === 'string'
    },
    number: {
        component: 'input',
        attributes: { type: 'number' },
        validate: (value) => !isNaN(parseFloat(value))
    },
    date: {
        component: 'input',
        attributes: { type: 'date' },
        validate: (value) => !isNaN(Date.parse(value))
    },
    choice: {
        component: 'select',
        validate: (value, field) => {
            const choices = field.choices || [];
            return choices.some(c => c.id === value);
        }
    },
    boolean: {
        component: 'input',
        attributes: { type: 'checkbox' },
        validate: (value) => typeof value === 'boolean'
    }
};

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
 * Initializes form state with error handling
 * @param {string} type - Form type
 * @param {string} id - Form instance ID
 * @param {Object} initialData - Initial form data
 */
export const initializeFormState = (type, id, initialData = {}) => {
    try {
        const formId = `${type}-${id}`;
        
        const state = {
            originalValues: { ...initialData },
            currentValues: { ...initialData },
            isDirty: false,
            errors: new Map(),
            validators: new Map(),
            lastUpdate: new Date(),
            status: 'initialized'
        };

        formStates.set(formId, state);
        
        // Update global form state
        updateFormsState(formId, 'initialized');

    } catch (error) {
        console.error('Error initializing form state:', error);
        NotificationUI.show({
            message: `Failed to initialize form: ${error.message}`,
            type: 'error'
        });
    }
};

/**
 * Creates form field elements based on configuration
 * @param {Object} field - Field configuration object
 * @param {string} type - Form type
 * @param {string} id - Form instance ID
 * @param {Object} fieldInfo - Additional field information
 * @returns {HTMLElement} The created form field element
 */
export const createField = (field, type, id, fieldInfo = {}) => {
    try {
        const fieldType = fieldInfo.type || 'string';
        const typeConfig = FIELD_TYPES[fieldType];
        
        if (!typeConfig) {
            throw new Error(`Unsupported field type: ${fieldType}`);
        }

        const element = document.createElement(typeConfig.component);
        
        // Set common attributes
        element.id = getFieldId(type, field, id);
        element.name = field;
        element.className = 'tree-item-field editing';
        
        // Apply type-specific attributes
        if (typeConfig.attributes) {
            Object.entries(typeConfig.attributes).forEach(([key, value]) => {
                element.setAttribute(key, value);
            });
        }

        // Set up field based on type
        if (fieldType === 'choice') {
            setupChoiceField(element, field, fieldInfo);
        } else {
            setupBasicField(element, field, fieldInfo);
        }

        // Add validation
        addFieldValidation(element, type, id, field, fieldInfo);
        
        // Add event listeners
        setupFieldEventListeners(element, type, id, field);

        return element;

    } catch (error) {
        console.error('Error creating field:', error);
        NotificationUI.show({
            message: `Failed to create field: ${error.message}`,
            type: 'error'
        });
        
        // Return a disabled input as fallback
        const fallback = document.createElement('input');
        fallback.type = 'text';
        fallback.disabled = true;
        fallback.value = 'Error creating field';
        return fallback;
    }
};

/**
 * Sets up a choice (select) field
 * @private
 */
const setupChoiceField = (element, field, fieldInfo) => {
    const choices = fieldInfo.choices || [];
    
    // Add placeholder option
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = `Select ${field.replace(/_/g, ' ')}`;
    placeholder.disabled = true;
    placeholder.selected = true;
    element.appendChild(placeholder);

    // Add choices
    choices.forEach(choice => {
        const option = document.createElement('option');
        option.value = choice.id;
        option.textContent = choice.display_name || choice.name;
        
        // Add data attributes
        if (choice.data) {
            Object.entries(choice.data).forEach(([key, value]) => {
                option.dataset[key] = value;
            });
        }

        element.appendChild(option);
    });
};

/**
 * Sets up a basic input field
 * @private
 */
const setupBasicField = (element, field, fieldInfo) => {
    if (fieldInfo.type === 'date') {
        element.type = 'date';
    } else {
        element.type = 'text';
    }

    element.placeholder = field.replace(/_/g, ' ');
    
    if (fieldInfo.required) {
        element.required = true;
    }

    if (fieldInfo.pattern) {
        element.pattern = fieldInfo.pattern;
    }

    if (fieldInfo.min !== undefined) {
        element.min = fieldInfo.min;
    }

    if (fieldInfo.max !== undefined) {
        element.max = fieldInfo.max;
    }

    if (fieldInfo.maxLength) {
        element.maxLength = fieldInfo.maxLength;
    }
};

/**
 * Sets up event listeners for a field
 * @private
 */
const setupFieldEventListeners = (element, type, id, field) => {
    // Track changes
    element.addEventListener('change', () => {
        trackFieldChange(type, id, field);
    });

    // Live validation
    element.addEventListener('input', () => {
        validateField(type, id, field);
    });

    // Focus handling
    element.addEventListener('focus', () => {
        element.classList.add('focused');
        updateFormsState(`${type}-${id}`, 'field-focused', { field });
    });

    element.addEventListener('blur', () => {
        element.classList.remove('focused');
        validateField(type, id, field);
        updateFormsState(`${type}-${id}`, 'field-blurred', { field });
    });
};

/**
 * Updates global forms state
 * @private
 */
const updateFormsState = (formId, status, data = {}) => {
    const currentState = State.get(FORMS_STATE_KEY) || {};
    
    State.update(FORMS_STATE_KEY, {
        ...currentState,
        [formId]: {
            status,
            timestamp: new Date(),
            ...data
        }
    });
};
// forms.js - Part 2
// Validation and field tracking

/**
 * Adds validation to a field
 * @private
 */
const addFieldValidation = (element, type, id, field, fieldInfo) => {
    const formId = `${type}-${id}`;
    const state = formStates.get(formId);
    
    if (!state) return;

    // Get field type configuration
    const fieldType = fieldInfo.type || 'string';
    const typeConfig = FIELD_TYPES[fieldType];

    // Create composite validator
    const validator = (value) => {
        // Required field validation
        if (fieldInfo.required && !value) {
            return `${field} is required`;
        }

        // Type-specific validation
        if (value && !typeConfig.validate(value, fieldInfo)) {
            return `Invalid ${fieldType} value for ${field}`;
        }

        // Pattern validation
        if (fieldInfo.pattern && value && !new RegExp(fieldInfo.pattern).test(value)) {
            return fieldInfo.patternError || `${field} does not match required pattern`;
        }

        // Range validation
        if (fieldType === 'number' && value) {
            const numValue = parseFloat(value);
            if (fieldInfo.min !== undefined && numValue < fieldInfo.min) {
                return `${field} must be at least ${fieldInfo.min}`;
            }
            if (fieldInfo.max !== undefined && numValue > fieldInfo.max) {
                return `${field} must be no more than ${fieldInfo.max}`;
            }
        }

        // Length validation
        if (fieldType === 'string' && value) {
            if (fieldInfo.minLength && value.length < fieldInfo.minLength) {
                return `${field} must be at least ${fieldInfo.minLength} characters`;
            }
            if (fieldInfo.maxLength && value.length > fieldInfo.maxLength) {
                return `${field} must be no more than ${fieldInfo.maxLength} characters`;
            }
        }

        // Custom validation
        if (fieldInfo.validate) {
            const customResult = fieldInfo.validate(value);
            if (customResult !== true) {
                return customResult;
            }
        }

        return true;
    };

    state.validators.set(field, validator);
};

/**
 * Tracks changes to form fields
 * @param {string} type - Form type
 * @param {string} id - Form instance ID
 * @param {string} field - Field name
 */
const trackFieldChange = (type, id, field) => {
    const formId = `${type}-${id}`;
    const state = formStates.get(formId);
    if (!state) return;

    const element = document.getElementById(getFieldId(type, field, id));
    if (!element) return;

    try {
        // Get field value based on type
        const value = getFieldValue(element);
        
        // Update state
        state.currentValues[field] = value;
        state.isDirty = !areValuesEqual(state.currentValues, state.originalValues);
        state.lastUpdate = new Date();

        // Update global form state
        updateFormsState(formId, 'field-changed', {
            field,
            isDirty: state.isDirty
        });

        // Update form status
        updateFormStatus(type, id);

    } catch (error) {
        console.error('Error tracking field change:', error);
        NotificationUI.show({
            message: `Failed to track field change: ${error.message}`,
            type: 'error'
        });
    }
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

    try {
        const validator = state.validators.get(field);
        if (!validator) return true;

        const value = getFieldValue(element);
        const result = validator(value);

        if (result === true) {
            clearFieldError(type, id, field);
            element.classList.add('valid');
            element.classList.remove('invalid');
            return true;
        } else {
            showFieldError(type, id, field, result);
            element.classList.add('invalid');
            element.classList.remove('valid');
            return false;
        }

    } catch (error) {
        console.error('Error validating field:', error);
        NotificationUI.show({
            message: `Failed to validate field: ${error.message}`,
            type: 'error'
        });
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

    try {
        clearFormErrors(type, id);
        
        let isValid = true;
        const errors = [];

        // Validate all fields
        for (const [field, validator] of state.validators) {
            if (!validateField(type, id, field)) {
                isValid = false;
                const element = document.getElementById(getFieldId(type, field, id));
                errors.push({
                    field,
                    message: element?.dataset.errorMessage || 'Validation failed'
                });
            }
        }

        // Update form status
        updateFormsState(formId, isValid ? 'valid' : 'invalid', { errors });

        return isValid;

    } catch (error) {
        console.error('Error validating form:', error);
        NotificationUI.show({
            message: `Failed to validate form: ${error.message}`,
            type: 'error'
        });
        return false;
    }
};

/**
 * Shows an error for a specific field
 * @param {string} type - Form type
 * @param {string} id - Form instance ID
 * @param {string} field - Field name
 * @param {string} error - Error message
 */
export const showFieldError = (type, id, field, error) => {
    const element = document.getElementById(getFieldId(type, field, id));
    if (!element) return;

    try {
        // Add error classes
        element.classList.add('error');
        element.dataset.errorMessage = error;
        
        // Create or update error display
        let errorDisplay = document.getElementById(`${getFieldId(type, field, id)}-error`);
        if (!errorDisplay) {
            errorDisplay = document.createElement('div');
            errorDisplay.id = `${getFieldId(type, field, id)}-error`;
            errorDisplay.className = 'w3-text-red field-error';
            errorDisplay.style.fontSize = '0.8em';
            element.parentNode.insertBefore(errorDisplay, element.nextSibling);
        }
        errorDisplay.textContent = error;

        // Ensure error is visible
        errorDisplay.style.display = 'block';
        errorDisplay.style.opacity = '0';
        requestAnimationFrame(() => {
            errorDisplay.style.transition = 'opacity 0.2s ease-in-out';
            errorDisplay.style.opacity = '1';
        });

        // Update state
        const formId = `${type}-${id}`;
        const state = formStates.get(formId);
        if (state) {
            state.errors.set(field, error);
        }

        // Update global form state
        updateFormsState(formId, 'field-error', {
            field,
            error
        });

    } catch (error) {
        console.error('Error showing field error:', error);
    }
};

/**
 * Gets field value based on field type
 * @private
 */
const getFieldValue = (element) => {
    switch (element.type) {
        case 'checkbox':
            return element.checked;
        case 'number':
            return element.value ? parseFloat(element.value) : null;
        case 'date':
            return element.value ? new Date(element.value) : null;
        default:
            return element.value;
    }
};

/**
 * Compares two value objects for equality
 * @private
 */
const areValuesEqual = (obj1, obj2) => {
    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);

    if (keys1.length !== keys2.length) return false;

    return keys1.every(key => {
        const val1 = obj1[key];
        const val2 = obj2[key];

        if (val1 instanceof Date && val2 instanceof Date) {
            return val1.getTime() === val2.getTime();
        }

        return val1 === val2;
    });
};
// forms.js - Part 3
// Form status, cleanup, and data collection

/**
 * Clears error for a specific field
 * @param {string} type - Form type
 * @param {string} id - Form instance ID
 * @param {string} field - Field name
 */
export const clearFieldError = (type, id, field) => {
    const element = document.getElementById(getFieldId(type, field, id));
    if (!element) return;

    try {
        // Remove error classes and data
        element.classList.remove('error');
        delete element.dataset.errorMessage;
        
        // Remove error display with animation
        const errorDisplay = document.getElementById(`${getFieldId(type, field, id)}-error`);
        if (errorDisplay) {
            errorDisplay.style.transition = 'opacity 0.2s ease-out';
            errorDisplay.style.opacity = '0';
            setTimeout(() => errorDisplay.remove(), 200);
        }

        // Update state
        const formId = `${type}-${id}`;
        const state = formStates.get(formId);
        if (state) {
            state.errors.delete(field);
        }

        // Update global form state
        updateFormsState(formId, 'field-error-cleared', { field });

    } catch (error) {
        console.error('Error clearing field error:', error);
    }
};

/**
 * Clears all form errors
 * @param {string} type - Form type
 * @param {string} id - Form instance ID
 */
export const clearFormErrors = (type, id) => {
    const form = document.getElementById(`${type}Form-${id}`);
    if (!form) return;

    try {
        // Remove all error displays
        form.querySelectorAll('.field-error').forEach(error => {
            error.style.transition = 'opacity 0.2s ease-out';
            error.style.opacity = '0';
            setTimeout(() => error.remove(), 200);
        });

        // Remove error classes
        form.querySelectorAll('.error').forEach(field => {
            field.classList.remove('error');
            delete field.dataset.errorMessage;
        });

        // Clear state errors
        const formId = `${type}-${id}`;
        const state = formStates.get(formId);
        if (state) {
            state.errors.clear();
        }

        // Update global form state
        updateFormsState(formId, 'errors-cleared');

    } catch (error) {
        console.error('Error clearing form errors:', error);
    }
};

/**
 * Updates form status and UI
 * @param {string} type - Form type
 * @param {string} id - Form instance ID
 */
const updateFormStatus = (type, id) => {
    const formId = `${type}-${id}`;
    const state = formStates.get(formId);
    if (!state) return;

    try {
        const form = document.getElementById(`${type}Form-${id}`);
        if (!form) return;

        // Update submit button state
        const submitButton = form.querySelector('button[type="submit"]');
        if (submitButton) {
            const isDisabled = !state.isDirty || state.errors.size > 0;
            submitButton.disabled = isDisabled;
            
            // Update button appearance
            submitButton.classList.toggle('w3-disabled', isDisabled);
            submitButton.classList.toggle('w3-blue', !isDisabled);
        }

        // Update form classes
        form.classList.toggle('dirty', state.isDirty);
        form.classList.toggle('has-errors', state.errors.size > 0);

        // Update global form state
        updateFormsState(formId, 'status-updated', {
            isDirty: state.isDirty,
            hasErrors: state.errors.size > 0
        });

    } catch (error) {
        console.error('Error updating form status:', error);
    }
};

/**
 * Resets form to original state
 * @param {string} type - Form type
 * @param {string} id - Form instance ID
 */
export const resetForm = (type, id) => {
    const formId = `${type}-${id}`;
    const state = formStates.get(formId);
    if (!state) return;

    try {
        // Reset all fields to original values
        Object.entries(state.originalValues).forEach(([field, value]) => {
            const element = document.getElementById(getFieldId(type, field, id));
            if (element) {
                setFieldValue(element, value);
                clearFieldError(type, id, field);
            }
        });

        // Reset state
        state.currentValues = { ...state.originalValues };
        state.isDirty = false;
        state.errors.clear();
        state.lastUpdate = new Date();

        // Update form status
        updateFormStatus(type, id);

        // Update global form state
        updateFormsState(formId, 'reset');

    } catch (error) {
        console.error('Error resetting form:', error);
        NotificationUI.show({
            message: `Failed to reset form: ${error.message}`,
            type: 'error'
        });
    }
};

/**
 * Collects current form data
 * @param {string} type - Form type
 * @param {string} id - Form instance ID
 * @returns {Object|null} Form data or null if validation fails
 */
export const collectFormData = (type, id) => {
    if (!validateForm(type, id)) {
        return null;
    }

    const formId = `${type}-${id}`;
    const state = formStates.get(formId);
    if (!state) return null;

    try {
        // Create clean copy of current values
        const data = { ...state.currentValues };

        // Add metadata
        Object.defineProperty(data, '_metadata', {
            value: {
                timestamp: new Date(),
                formId,
                isValid: true,
                isDirty: state.isDirty
            },
            enumerable: false
        });

        return data;

    } catch (error) {
        console.error('Error collecting form data:', error);
        NotificationUI.show({
            message: `Failed to collect form data: ${error.message}`,
            type: 'error'
        });
        return null;
    }
};

/**
 * Sets field value based on field type
 * @private
 */
const setFieldValue = (element, value) => {
    switch (element.type) {
        case 'checkbox':
            element.checked = Boolean(value);
            break;
        case 'date':
            element.value = value instanceof Date ? 
                value.toISOString().split('T')[0] : value;
            break;
        default:
            element.value = value !== null && value !== undefined ? value : '';
    }
};

/**
 * Cleans up form resources
 * @param {string} type - Form type
 * @param {string} id - Form instance ID
 */
export const cleanupForm = (type, id) => {
    const formId = `${type}-${id}`;
    
    try {
        // Remove form state
        formStates.delete(formId);

        // Clear errors
        clearFormErrors(type, id);

        // Remove event listeners
        const form = document.getElementById(`${type}Form-${id}`);
        if (form) {
            form.querySelectorAll('input, select, textarea').forEach(element => {
                element.removeEventListener('change', () => {});
                element.removeEventListener('input', () => {});
                element.removeEventListener('focus', () => {});
                element.removeEventListener('blur', () => {});
            });
        }

        // Update global form state
        updateFormsState(formId, 'cleaned-up');

    } catch (error) {
        console.error('Error cleaning up form:', error);
        NotificationUI.show({
            message: `Failed to clean up form: ${error.message}`,
            type: 'error'
        });
    }
};

// Initialize forms state in state management
State.set(FORMS_STATE_KEY, {
    activeForms: new Set(),
    lastUpdate: new Date(),
    error: null
});