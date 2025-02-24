// forms.js
// Enhanced form handling with Django model field integration and proper initialization

import { State } from './state.js';
import { API } from './api.js';
import { NotificationUI } from './ui.js';
import { DOM } from './dom.js';

const FORMS_STATE_KEY = 'forms_state';

/**
 * Field type handlers mapped to Django model field types
 */
const FIELD_HANDLERS = {
    // ... existing FIELD_HANDLERS object ...
};

/**
 * Enhanced Form Manager Class with proper initialization and safety checks
 */
class FormManager {
    constructor() {
        this.initialized = false;
        
        // Track form instances
        this.forms = new Map();
        
        // Cache field definitions
        this.fieldDefinitions = null;
        this.validationRules = null;
        this.fieldDependencies = null;

    }

    /**
     * Check if form manager is initialized
     * @returns {boolean}
     */
    isInitialized() {
        return this.initialized;
    }

    /**
     * Ensure manager is initialized
     * @private
     */
    _checkInitialized() {
        if (!this.initialized) {
            throw new Error('Form Manager must be initialized before use');
        }
    }

    /**
     * Initialize form manager with dependency checks
     * @returns {Promise<FormManager>} Initialized instance
     */
    async initialize() {
        if (this.initialized) {
            console.warn('FormManager already initialized');
            return this;
        }

        try {
            // Check dependencies
            if (!State.isInitialized()) {
                throw new Error('State must be initialized before FormManager');
            }
            if (!API.isInitialized()) {
                throw new Error('API must be initialized before FormManager');
            }
            if (!DOM.isInitialized()) {
                throw new Error('DOM must be initialized before FormManager');
            }

            // Initialize state
            await this.initializeState();

            // Bind methods
            this.handleSubmit = this.handleSubmit.bind(this);
            this.handleFieldChange = this.handleFieldChange.bind(this);
            this.handleFieldBlur = this.handleFieldBlur.bind(this);

            // Load field definitions
            await this.loadFieldDefinitions();

            this.initialized = true;
            console.log('FormManager initialized');

            return this;

        } catch (error) {
            this.handleError('Initialization Error', error);
            throw error;
        }
    }

    /**
     * Initialize form state
     * @private
     */
    async initializeState() {
        try {
            const initialState = {
                instances: {},
                modelFields: null,
                validationRules: null,
                dependencies: null,
                lastUpdate: new Date()
            };

            await State.set(FORMS_STATE_KEY, initialState);

        } catch (error) {
            this.handleError('State Initialization Error', error);
            throw error;
        }
    }

    /**
     * Load field definitions from Django with enhanced error handling
     * @returns {Promise<void>}
     */
    async loadFieldDefinitions() {
        try {
            // Load all required definitions
            const [fields, rules, dependencies] = await Promise.all([
                API.ModelFields.getFields(),
                API.ModelFields.getValidationRules(),
                API.ModelFields.getDependencies()
            ]);

            // Validate responses
            if (!fields || typeof fields !== 'object') {
                throw new Error('Invalid field definitions response');
            }

            // Cache results
            this.fieldDefinitions = fields;
            this.validationRules = rules;
            this.fieldDependencies = dependencies;

            // Update state
            await State.update(FORMS_STATE_KEY, {
                modelFields: fields,
                validationRules: rules,
                dependencies: dependencies,
                lastUpdate: new Date()
            });

        } catch (error) {
            this.handleError('Field Definitions Loading Error', error);
            throw error;
        }
    }

    /**
     * Handle errors consistently
     * @private
     * @param {string} context - Error context
     * @param {Error} error - Error object
     */
    handleError(context, error) {
        console.error(`Forms Error (${context}):`, error);
        
        NotificationUI.show({
            message: `Forms Error: ${error.message}`,
            type: 'error',
            duration: 5000
        });

        // Update state with error
        try {
            State.update(FORMS_STATE_KEY, {
                error: {
                    context,
                    message: error.message,
                    stack: error.stack,
                    timestamp: new Date()
                }
            });
        } catch (stateError) {
            console.error('Error updating state with error:', stateError);
        }
    }

    /**
         * Create a new form instance with enhanced error handling and safety checks
         * @param {string} modelType - Django model type
         * @param {string} instanceId - Form instance ID
         * @param {Object} options - Form options
         * @returns {Promise<HTMLFormElement>} Created form
         */
    async createForm(modelType, instanceId, options = {}) {
        this._checkInitialized();

        if (!modelType || !instanceId) {
            throw new Error('Model type and instance ID are required');
        }

        const formId = `${modelType}-${instanceId}`;
        
        try {
            // Load field definitions if not already loaded
            if (!this.fieldDefinitions) {
                await this.loadFieldDefinitions();
            }

            // Get model field definitions
            const modelFields = this.fieldDefinitions[modelType];
            if (!modelFields) {
                throw new Error(`No field definitions found for ${modelType}`);
            }

            // Create form element using DOM utility
            const form = DOM.createElement('form', {
                id: formId,
                className: 'w3-container',
                attributes: {
                    'data-type': modelType,
                    'data-id': instanceId
                }
            });

            // Add form fields
            for (const field of modelFields) {
                try {
                    const fieldElement = await this.createField(field, options.initialData?.[field.name]);
                    if (fieldElement) {
                        form.appendChild(fieldElement);
                    }
                } catch (fieldError) {
                    this.handleError(`Field Creation Error (${field.name})`, fieldError);
                    // Continue with other fields even if one fails
                }
            }

            // Setup form event handlers with error handling
            this.attachFormEventHandlers(form);
            
            // Store form instance with enhanced state tracking
            this.forms.set(formId, {
                element: form,
                type: modelType,
                id: instanceId,
                fields: modelFields,
                state: {
                    dirty: false,
                    valid: true,
                    submitted: false,
                    errors: new Map(),
                    lastUpdate: new Date()
                }
            });

            // Update state
            await this.updateFormState(formId, 'created');

            return form;

        } catch (error) {
            this.handleError(`Form Creation Error (${formId})`, error);
            throw error;
        }
    }

    /**
     * Create a form field element with enhanced error handling
     * @param {Object} fieldConfig - Field configuration
     * @param {*} initialValue - Initial field value
     * @returns {Promise<HTMLElement>} Created field element
     * @private
     */
    async createField(fieldConfig, initialValue) {
        if (!fieldConfig || !fieldConfig.field_type) {
            throw new Error('Invalid field configuration');
        }

        const handler = FIELD_HANDLERS[fieldConfig.field_type];
        if (!handler) {
            console.warn(`No handler for field type: ${fieldConfig.field_type}`);
            return null;
        }

        try {
            // Create field container using DOM utility
            const container = DOM.createElement('div', {
                className: 'field-container w3-margin-bottom'
            });

            // Add label if specified
            if (fieldConfig.label) {
                const label = DOM.createElement('label', {
                    className: 'w3-text-dark-grey',
                    htmlFor: fieldConfig.name,
                    innerHTML: fieldConfig.label + (fieldConfig.required ? ' <span class="w3-text-red">*</span>' : '')
                });
                container.appendChild(label);
            }

            // Create field element
            const field = DOM.createElement(handler.component, {
                className: 'w3-input w3-border',
                id: fieldConfig.name,
                name: fieldConfig.name,
                attributes: {
                    type: handler.type || 'text'
                }
            });

            // Apply handler-specific configuration
            const config = handler.createField(fieldConfig);
            await this.applyFieldConfiguration(field, config);

            // Set initial value if provided
            if (initialValue !== undefined) {
                await this.setFieldValue(field, initialValue, handler.type);
            }

            // Add field event listeners with error handling
            this.attachFieldEventHandlers(field);

            // Add field to container
            container.appendChild(field);

            // Add error container
            const errorContainer = DOM.createElement('div', {
                className: 'field-error w3-text-red w3-small w3-hide'
            });
            container.appendChild(errorContainer);

            // Handle async options if needed
            if (config.async && config.loadOptions) {
                await this.handleAsyncFieldOptions(field, config);
            }

            return container;

        } catch (error) {
            this.handleError(`Field Creation Error (${fieldConfig.name})`, error);
            throw error;
        }
    }

    /**
     * Apply field configuration with safety checks
     * @param {HTMLElement} field - Field element
     * @param {Object} config - Field configuration
     * @private
     */
    async applyFieldConfiguration(field, config) {
        try {
            for (const [key, value] of Object.entries(config)) {
                if (key === 'options' && Array.isArray(value)) {
                    // Handle select options
                    field.innerHTML = ''; // Clear existing options
                    value.forEach(option => {
                        const optElement = DOM.createElement('option', {
                            value: option.value,
                            textContent: option.label,
                            attributes: {
                                selected: option.selected || false
                            }
                        });
                        field.appendChild(optElement);
                    });
                } else if (key !== 'component' && key !== 'createField' && key !== 'async' && key !== 'loadOptions') {
                    field[key] = value;
                }
            }
        } catch (error) {
            this.handleError('Field Configuration Error', error);
            throw error;
        }
    }

    /**
     * Handle async field options loading
     * @param {HTMLElement} field - Field element
     * @param {Object} config - Field configuration
     * @private
     */
    async handleAsyncFieldOptions(field, config) {
        try {
            // Add loading state
            field.disabled = true;
            field.innerHTML = '<option value="">Loading...</option>';

            const options = await config.loadOptions();
            
            // Clear loading state
            field.innerHTML = '';
            field.disabled = false;

            // Add options
            options.forEach(option => {
                const optElement = DOM.createElement('option', {
                    value: option.value,
                    textContent: option.label
                });
                field.appendChild(optElement);
            });

        } catch (error) {
            field.disabled = false;
            field.innerHTML = '<option value="">Error loading options</option>';
            this.handleError('Async Options Loading Error', error);
        }
    }

    /**
     * Set field value with type handling
     * @param {HTMLElement} field - Field element
     * @param {*} value - Value to set
     * @param {string} type - Field type
     * @private
     */
    async setFieldValue(field, value, type) {
        try {
            switch (type) {
                case 'checkbox':
                    field.checked = Boolean(value);
                    break;
                case 'select-multiple':
                    if (Array.isArray(value)) {
                        Array.from(field.options).forEach(option => {
                            option.selected = value.includes(option.value);
                        });
                    }
                    break;
                case 'number':
                    field.value = value !== null ? String(value) : '';
                    break;
                case 'date':
                    if (value instanceof Date) {
                        field.value = value.toISOString().split('T')[0];
                    } else if (value) {
                        field.value = String(value);
                    }
                    break;
                default:
                    field.value = value !== null ? String(value) : '';
            }
        } catch (error) {
            this.handleError('Field Value Setting Error', error);
            throw error;
        }
    }

    /**
     * Attach form event handlers
     * @param {HTMLFormElement} form - Form element
     * @private
     */
    attachFormEventHandlers(form) {
        try {
            form.addEventListener('submit', this.handleSubmit);
            form.addEventListener('reset', (event) => {
                const formId = `${form.dataset.type}-${form.dataset.id}`;
                this.updateFormState(formId, 'reset');
            });
        } catch (error) {
            this.handleError('Form Event Handler Attachment Error', error);
        }
    }

    /**
     * Attach field event handlers
     * @param {HTMLElement} field - Field element
     * @private
     */
    attachFieldEventHandlers(field) {
        try {
            field.addEventListener('change', () => this.handleFieldChange(field));
            field.addEventListener('blur', () => this.handleFieldBlur(field));
            field.addEventListener('input', () => {
                const form = field.closest('form');
                if (form) {
                    const formId = `${form.dataset.type}-${form.dataset.id}`;
                    this.updateFormState(formId, 'field-input', {
                        field: field.name
                    });
                }
            });
        } catch (error) {
            this.handleError('Field Event Handler Attachment Error', error);
        }
    }
    /**
         * Validate entire form with enhanced error handling
         * @param {string} formId - Form identifier
         * @returns {Promise<boolean>} Validation result
         * @private
         */
    async validateForm(formId) {
        this._checkInitialized();

        const instance = this.forms.get(formId);
        if (!instance) {
            throw new Error(`Form instance not found: ${formId}`);
        }

        const form = instance.element;
        let isValid = true;

        try {
            // Clear previous errors
            await this.clearFormErrors(form);

            // Start validation state
            await this.updateFormState(formId, 'validating');

            // Validate each field
            for (const field of instance.fields) {
                const element = DOM.getElement(field.name);
                if (!element) continue;

                try {
                    const fieldValid = await this.validateField(element, field);
                    isValid = isValid && fieldValid;

                    // Update field state
                    await this.updateFieldState(formId, field.name, {
                        valid: fieldValid,
                        validated: true,
                        timestamp: new Date()
                    });
                } catch (fieldError) {
                    this.handleError(`Field Validation Error (${field.name})`, fieldError);
                    isValid = false;
                }
            }

            // Check field dependencies if all fields are valid
            if (isValid && this.fieldDependencies) {
                const dependencyErrors = await this.validateDependencies(form, instance.type);
                if (dependencyErrors.length > 0) {
                    for (const error of dependencyErrors) {
                        const element = DOM.getElement(error.field);
                        if (element) {
                            await this.showFieldError(element, error.message);
                        }
                    }
                    isValid = false;
                }
            }

            // Update form state with validation result
            await this.updateFormState(formId, isValid ? 'valid' : 'invalid', {
                validationComplete: true,
                lastValidation: new Date()
            });

            return isValid;

        } catch (error) {
            this.handleError('Form Validation Error', error);
            await this.updateFormState(formId, 'error', {
                error: error.message,
                timestamp: new Date()
            });
            return false;
        }
    }

    /**
     * Validate a single field with enhanced error handling
     * @param {HTMLElement} element - Field element
     * @param {Object} fieldConfig - Field configuration
     * @returns {Promise<boolean>} Validation result
     * @private
     */
    async validateField(element, fieldConfig) {
        if (!element || !fieldConfig) {
            throw new Error('Invalid field validation parameters');
        }

        try {
            const value = await this.getFieldValue(element);
            let isValid = true;
            let errorMessage = '';

            // Required field validation
            if (fieldConfig.required && !this.isValuePresent(value)) {
                isValid = false;
                errorMessage = `${fieldConfig.label || fieldConfig.name} is required`;
            }

            // Skip further validation if empty and not required
            if (!this.isValuePresent(value) && !fieldConfig.required) {
                await this.clearFieldError(element);
                return true;
            }

            // Field type validation
            if (isValid) {
                const typeValidation = await this.validateFieldType(value, fieldConfig);
                if (!typeValidation.valid) {
                    isValid = false;
                    errorMessage = typeValidation.message;
                }
            }

            // Custom validation rules
            if (isValid && this.validationRules && fieldConfig.validation_rules) {
                for (const rule of fieldConfig.validation_rules) {
                    const ruleValidation = await this.validateRule(value, rule);
                    if (!ruleValidation.valid) {
                        isValid = false;
                        errorMessage = ruleValidation.message;
                        break;
                    }
                }
            }

            // Update UI
            if (!isValid) {
                await this.showFieldError(element, errorMessage);
            } else {
                await this.clearFieldError(element);
            }

            return isValid;

        } catch (error) {
            this.handleError(`Field Validation Error (${fieldConfig.name})`, error);
            await this.showFieldError(element, 'Validation error occurred');
            return false;
        }
    }

    /**
     * Validate field type with enhanced type checking
     * @param {*} value - Field value
     * @param {Object} fieldConfig - Field configuration
     * @returns {Promise<Object>} Validation result
     * @private
     */
    async validateFieldType(value, fieldConfig) {
        try {
            const handler = FIELD_HANDLERS[fieldConfig.field_type];
            if (!handler) {
                return { valid: true }; // Skip validation if no handler
            }

            switch (fieldConfig.field_type) {
                case 'IntegerField':
                    if (!Number.isInteger(Number(value))) {
                        return {
                            valid: false,
                            message: 'Please enter a valid integer'
                        };
                    }
                    if (fieldConfig.min_value !== undefined && value < fieldConfig.min_value) {
                        return {
                            valid: false,
                            message: `Value must be at least ${fieldConfig.min_value}`
                        };
                    }
                    if (fieldConfig.max_value !== undefined && value > fieldConfig.max_value) {
                        return {
                            valid: false,
                            message: `Value must be at most ${fieldConfig.max_value}`
                        };
                    }
                    break;

                case 'FloatField':
                    if (isNaN(Number(value))) {
                        return {
                            valid: false,
                            message: 'Please enter a valid number'
                        };
                    }
                    break;

                case 'DateField':
                    const date = new Date(value);
                    if (isNaN(date.getTime())) {
                        return {
                            valid: false,
                            message: 'Please enter a valid date'
                        };
                    }
                    break;

                case 'CharField':
                case 'TextField':
                    if (fieldConfig.max_length && String(value).length > fieldConfig.max_length) {
                        return {
                            valid: false,
                            message: `Text must be at most ${fieldConfig.max_length} characters`
                        };
                    }
                    if (fieldConfig.min_length && String(value).length < fieldConfig.min_length) {
                        return {
                            valid: false,
                            message: `Text must be at least ${fieldConfig.min_length} characters`
                        };
                    }
                    if (fieldConfig.regex) {
                        const regex = new RegExp(fieldConfig.regex);
                        if (!regex.test(String(value))) {
                            return {
                                valid: false,
                                message: fieldConfig.regex_message || 'Invalid format'
                            };
                        }
                    }
                    break;
            }

            return { valid: true };

        } catch (error) {
            this.handleError('Type Validation Error', error);
            return {
                valid: false,
                message: 'Type validation error occurred'
            };
        }
    }

    /**
     * Check if a value is present
     * @param {*} value - Value to check
     * @returns {boolean} True if value is present
     * @private
     */
    isValuePresent(value) {
        if (value === null || value === undefined) return false;
        if (typeof value === 'string') return value.trim().length > 0;
        if (Array.isArray(value)) return value.length > 0;
        return true;
    }

    /**
     * Show field error with enhanced UI feedback
     * @param {HTMLElement} element - Field element
     * @param {string} message - Error message
     * @private
     */
    async showFieldError(element, message) {
        try {
            const container = element.closest('.field-container');
            if (!container) return;

            // Add error class with animation
            DOM.addClasses(element, ['w3-border-red']);
            
            const errorDisplay = container.querySelector('.field-error');
            if (errorDisplay) {
                errorDisplay.textContent = message;
                // Animate error appearance
                errorDisplay.style.opacity = '0';
                DOM.removeClass(errorDisplay, 'w3-hide');
                
                requestAnimationFrame(() => {
                    errorDisplay.style.transition = 'opacity 0.2s ease-in';
                    errorDisplay.style.opacity = '1';
                });
            }

            // Add aria attributes for accessibility
            element.setAttribute('aria-invalid', 'true');
            element.setAttribute('aria-describedby', errorDisplay?.id);

        } catch (error) {
            this.handleError('Error Display Error', error);
        }
    }

    /**
     * Clear field error with smooth transition
     * @param {HTMLElement} element - Field element
     * @private
     */
    async clearFieldError(element) {
        try {
            const container = element.closest('.field-container');
            if (!container) return;

            DOM.removeClasses(element, ['w3-border-red']);
            
            const errorDisplay = container.querySelector('.field-error');
            if (errorDisplay) {
                errorDisplay.style.transition = 'opacity 0.2s ease-out';
                errorDisplay.style.opacity = '0';
                
                // Wait for transition before hiding
                await new Promise(resolve => setTimeout(resolve, 200));
                DOM.addClasses(errorDisplay, ['w3-hide']);
                errorDisplay.textContent = '';
            }

            // Clear aria attributes
            element.removeAttribute('aria-invalid');
            element.removeAttribute('aria-describedby');

        } catch (error) {
            this.handleError('Error Clearing Error', error);
        }
    }

    /**
     * Clear all form errors
     * @param {HTMLFormElement} form - Form element
     * @private
     */
    async clearFormErrors(form) {
        try {
            // Clear field errors
            const fieldErrors = form.querySelectorAll('.field-error');
            for (const error of fieldErrors) {
                DOM.addClasses(error, ['w3-hide']);
                error.textContent = '';
            }

            // Clear error styling
            const errorFields = form.querySelectorAll('.w3-border-red');
            for (const field of errorFields) {
                DOM.removeClasses(field, ['w3-border-red']);
                field.removeAttribute('aria-invalid');
                field.removeAttribute('aria-describedby');
            }

            // Clear form error
            const formError = form.querySelector('.form-error');
            if (formError) {
                formError.style.display = 'none';
                formError.innerHTML = '';
            }

        } catch (error) {
            this.handleError('Error Clearing Form', error);
        }
    }
    /**
         * Handle form submission with enhanced error handling
         * @param {Event} event - Submit event
         * @private
         */
    async handleSubmit(event) {
        event.preventDefault();
        this._checkInitialized();

        const form = event.target;
        const formId = `${form.dataset.type}-${form.dataset.id}`;
        const instance = this.forms.get(formId);

        if (!instance) {
            this.handleError('Submit Error', new Error('Form instance not found'));
            return;
        }

        try {
            // Update state to submitting
            await this.updateFormState(formId, 'submitting');

            // Mark form as submitted
            instance.state.submitted = true;

            // Validate all fields
            const isValid = await this.validateForm(formId);
            if (!isValid) {
                await this.updateFormState(formId, 'invalid');
                NotificationUI.show({
                    message: 'Please correct the errors in the form',
                    type: 'warning'
                });
                return;
            }

            // Collect form data
            const formData = await this.collectFormData(form, instance.fields);

            // Create custom event
            const submitEvent = new CustomEvent('form:submit', {
                detail: {
                    formId,
                    type: instance.type,
                    id: instance.id,
                    data: formData
                },
                bubbles: true,
                cancelable: true
            });

            // Dispatch event and check if it was cancelled
            const shouldProceed = form.dispatchEvent(submitEvent);
            if (!shouldProceed) {
                await this.updateFormState(formId, 'cancelled');
                return;
            }

            await this.updateFormState(formId, 'submitted', {
                data: formData,
                timestamp: new Date()
            });

        } catch (error) {
            this.handleError('Form Submission Error', error);
            await this.updateFormState(formId, 'error', {
                error: error.message,
                timestamp: new Date()
            });
            this.showFormError(form, error);
        }
    }

    /**
     * Handle field change with debouncing and state updates
     * @param {HTMLElement} field - Changed field
     * @private
     */
    async handleFieldChange(field) {
        this._checkInitialized();

        const form = field.closest('form');
        if (!form) return;

        const formId = `${form.dataset.type}-${form.dataset.id}`;
        const instance = this.forms.get(formId);
        if (!instance) return;

        try {
            // Clear any existing debounce timer
            if (field._changeTimer) {
                clearTimeout(field._changeTimer);
            }

            // Update dirty state
            instance.state.dirty = true;

            // Get field value
            const value = await this.getFieldValue(field);

            // Update field state immediately
            await this.updateFieldState(formId, field.name, {
                value,
                dirty: true,
                modified: new Date()
            });

            // Debounce validation
            field._changeTimer = setTimeout(async () => {
                // Only validate if form was previously submitted or field is dirty
                if (instance.state.submitted || instance.state.dirty) {
                    const fieldConfig = instance.fields.find(f => f.name === field.name);
                    if (fieldConfig) {
                        await this.validateField(field, fieldConfig);
                    }
                }

                // Emit change event
                const changeEvent = new CustomEvent('form:field:change', {
                    detail: {
                        formId,
                        field: field.name,
                        value,
                        timestamp: new Date()
                    },
                    bubbles: true
                });
                field.dispatchEvent(changeEvent);

            }, 300); // 300ms debounce

        } catch (error) {
            this.handleError('Field Change Error', error);
        }
    }

    /**
     * Handle field blur with validation
     * @param {HTMLElement} field - Blurred field
     * @private
     */
    async handleFieldBlur(field) {
        this._checkInitialized();

        const form = field.closest('form');
        if (!form) return;

        const formId = `${form.dataset.type}-${form.dataset.id}`;
        const instance = this.forms.get(formId);
        if (!instance) return;

        try {
            // Clear any pending change timer
            if (field._changeTimer) {
                clearTimeout(field._changeTimer);
            }

            // Get field value
            const value = await this.getFieldValue(field);

            // Update field state
            await this.updateFieldState(formId, field.name, {
                focused: false,
                lastBlur: new Date()
            });

            // Validate field
            const fieldConfig = instance.fields.find(f => f.name === field.name);
            if (fieldConfig) {
                await this.validateField(field, fieldConfig);
            }

            // Emit blur event
            const blurEvent = new CustomEvent('form:field:blur', {
                detail: {
                    formId,
                    field: field.name,
                    value,
                    timestamp: new Date()
                },
                bubbles: true
            });
            field.dispatchEvent(blurEvent);

        } catch (error) {
            this.handleError('Field Blur Error', error);
        }
    }

    /**
     * Update form state with error handling
     * @param {string} formId - Form identifier
     * @param {string} action - State action
     * @param {Object} [data] - Additional data
     * @private
     */
    async updateFormState(formId, action, data = {}) {
        try {
            const currentState = State.get(FORMS_STATE_KEY);
            const formState = currentState.instances[formId] || {};
            
            const updatedState = {
                ...formState,
                lastAction: action,
                lastUpdate: new Date(),
                ...data
            };

            await State.update(FORMS_STATE_KEY, {
                instances: {
                    ...currentState.instances,
                    [formId]: updatedState
                }
            });

            // Emit state change event
            const stateEvent = new CustomEvent('form:state:change', {
                detail: {
                    formId,
                    action,
                    state: updatedState,
                    timestamp: new Date()
                },
                bubbles: true
            });
            window.dispatchEvent(stateEvent);

        } catch (error) {
            this.handleError('State Update Error', error);
        }
    }

    /**
     * Update field state with error handling
     * @param {string} formId - Form identifier
     * @param {string} fieldName - Field name
     * @param {Object} data - Field state data
     * @private
     */
    async updateFieldState(formId, fieldName, data) {
        try {
            const currentState = State.get(FORMS_STATE_KEY);
            const formState = currentState.instances[formId] || {};
            const fieldStates = formState.fields || {};

            const updatedFieldState = {
                ...fieldStates[fieldName],
                ...data,
                lastUpdate: new Date()
            };

            await State.update(FORMS_STATE_KEY, {
                instances: {
                    ...currentState.instances,
                    [formId]: {
                        ...formState,
                        fields: {
                            ...fieldStates,
                            [fieldName]: updatedFieldState
                        }
                    }
                }
            });

        } catch (error) {
            this.handleError('Field State Update Error', error);
        }
    }

    /**
     * Collect form data with type conversion
     * @param {HTMLFormElement} form - Form element
     * @param {Array} fields - Field configurations
     * @returns {Promise<Object>} Collected form data
     * @private
     */
    async collectFormData(form, fields) {
        try {
            const formData = {};

            for (const field of fields) {
                const element = form.elements[field.name];
                if (!element) continue;

                const value = await this.getFieldValue(element);
                
                // Convert value based on field type
                formData[field.name] = await this.convertFieldValue(value, field.field_type);
            }

            return formData;

        } catch (error) {
            this.handleError('Data Collection Error', error);
            throw error;
        }
    }

    /**
     * Convert field value to appropriate type
     * @param {*} value - Raw value
     * @param {string} fieldType - Field type
     * @returns {Promise<*>} Converted value
     * @private
     */
    async convertFieldValue(value, fieldType) {
        if (value === null || value === undefined || value === '') {
            return null;
        }

        try {
            switch (fieldType) {
                case 'IntegerField':
                    return parseInt(value, 10);
                case 'FloatField':
                    return parseFloat(value);
                case 'BooleanField':
                    return Boolean(value);
                case 'DateField':
                    return value instanceof Date ? value : new Date(value);
                case 'ArrayField':
                    return Array.isArray(value) ? value : [value];
                default:
                    return value;
            }
        } catch (error) {
            this.handleError('Value Conversion Error', error);
            return value; // Return original value on error
        }
    }
    /**
         * Reset form to initial state
         * @param {string} formId - Form identifier
         * @returns {Promise<void>}
         */
    async resetForm(formId) {
        this._checkInitialized();

        const instance = this.forms.get(formId);
        if (!instance) {
            throw new Error(`Form instance not found: ${formId}`);
        }

        try {
            const form = instance.element;

            // Clear all fields
            form.reset();

            // Clear all errors
            await this.clearFormErrors(form);

            // Reset instance state
            instance.state = {
                dirty: false,
                valid: true,
                submitted: false,
                errors: new Map(),
                lastUpdate: new Date()
            };

            // Update state
            await this.updateFormState(formId, 'reset', {
                resetTimestamp: new Date()
            });

            // Emit reset event
            const resetEvent = new CustomEvent('form:reset', {
                detail: {
                    formId,
                    timestamp: new Date()
                },
                bubbles: true
            });
            form.dispatchEvent(resetEvent);

        } catch (error) {
            this.handleError('Form Reset Error', error);
            throw error;
        }
    }

    /**
     * Destroy form instance and cleanup resources
     * @param {string} formId - Form identifier
     * @returns {Promise<void>}
     */
    async destroyForm(formId) {
        this._checkInitialized();

        const instance = this.forms.get(formId);
        if (!instance) return;

        try {
            const form = instance.element;

            // Remove event listeners
            form.removeEventListener('submit', this.handleSubmit);
            
            // Clear any pending timers on fields
            form.querySelectorAll('input, select, textarea').forEach(field => {
                if (field._changeTimer) {
                    clearTimeout(field._changeTimer);
                }
            });

            // Remove form element
            form.remove();

            // Clear form state
            this.forms.delete(formId);

            // Update global state
            const currentState = State.get(FORMS_STATE_KEY);
            delete currentState.instances[formId];
            await State.update(FORMS_STATE_KEY, currentState);

            // Emit destroy event
            const destroyEvent = new CustomEvent('form:destroy', {
                detail: {
                    formId,
                    timestamp: new Date()
                },
                bubbles: true
            });
            window.dispatchEvent(destroyEvent);

        } catch (error) {
            this.handleError('Form Destroy Error', error);
        }
    }

    /**
     * Clear all forms and reset manager state
     * @returns {Promise<void>}
     */
    async clearAll() {
        this._checkInitialized();

        try {
            // Destroy all form instances
            for (const formId of this.forms.keys()) {
                await this.destroyForm(formId);
            }

            // Reset manager state
            this.forms.clear();
            this.fieldDefinitions = null;
            this.validationRules = null;
            this.fieldDependencies = null;

            // Reset global state
            await State.update(FORMS_STATE_KEY, {
                instances: {},
                modelFields: null,
                validationRules: null,
                dependencies: null,
                lastUpdate: new Date()
            });

            // Emit clear event
            const clearEvent = new CustomEvent('forms:clear', {
                detail: {
                    timestamp: new Date()
                },
                bubbles: true
            });
            window.dispatchEvent(clearEvent);

        } catch (error) {
            this.handleError('Clear All Error', error);
        }
    }

    /**
     * Refresh field definitions and validation rules
     * @returns {Promise<void>}
     */
    async refresh() {
        this._checkInitialized();

        try {
            // Reload field definitions
            await this.loadFieldDefinitions();

            // Revalidate all active forms
            for (const [formId, instance] of this.forms) {
                try {
                    await this.validateForm(formId);
                } catch (validationError) {
                    this.handleError(`Form Revalidation Error (${formId})`, validationError);
                }
            }

            // Emit refresh event
            const refreshEvent = new CustomEvent('forms:refresh', {
                detail: {
                    timestamp: new Date()
                },
                bubbles: true
            });
            window.dispatchEvent(refreshEvent);

        } catch (error) {
            this.handleError('Refresh Error', error);
            throw error;
        }
    }

    /**
     * Get form instance state
     * @param {string} formId - Form identifier
     * @returns {Object} Form state
     */
    getFormState(formId) {
        this._checkInitialized();

        const instance = this.forms.get(formId);
        if (!instance) {
            throw new Error(`Form instance not found: ${formId}`);
        }

        const state = State.get(FORMS_STATE_KEY);
        return {
            ...instance.state,
            ...state.instances[formId]
        };
    }

    /**
     * Check if form is dirty (has unsaved changes)
     * @param {string} formId - Form identifier
     * @returns {boolean} True if form is dirty
     */
    isFormDirty(formId) {
        this._checkInitialized();

        const instance = this.forms.get(formId);
        return instance ? instance.state.dirty : false;
    }

    /**
     * Check if form is valid
     * @param {string} formId - Form identifier
     * @returns {boolean} True if form is valid
     */
    isFormValid(formId) {
        this._checkInitialized();

        const instance = this.forms.get(formId);
        return instance ? instance.state.valid : false;
    }

    /**
     * Get all active form instances
     * @returns {Array<string>} Array of form IDs
     */
    getActiveForms() {
        this._checkInitialized();
        return Array.from(this.forms.keys());
    }

    /**
     * Destroy manager instance and cleanup all resources
     */
    async destroy() {
        if (!this.initialized) return;

        try {
            // Clear all forms
            await this.clearAll();

            // Remove any global event listeners
            window.removeEventListener('forms:clear', this.handleClear);
            window.removeEventListener('forms:refresh', this.handleRefresh);

            // Reset initialized state
            this.initialized = false;

            // Emit destroy event
            const destroyEvent = new CustomEvent('forms:destroy', {
                detail: {
                    timestamp: new Date()
                },
                bubbles: true
            });
            window.dispatchEvent(destroyEvent);

        } catch (error) {
            this.handleError('Destroy Error', error);
        }
    }
}

// Create and export singleton instance
export const Forms = new FormManager();