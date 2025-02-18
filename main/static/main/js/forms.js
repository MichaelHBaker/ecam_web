// forms.js
// Enhanced form handling with Django model field integration

import { State } from './state.js';
import { API } from './api.js';
import { NotificationUI } from './ui.js';

const FORMS_STATE_KEY = 'forms_state';

/**
 * Field type handlers mapped to Django model field types
 */
const FIELD_HANDLERS = {
    CharField: {
        component: 'input',
        type: 'text',
        createField: (config) => ({
            ...config,
            maxLength: config.max_length,
            minLength: config.min_length,
            pattern: config.regex
        })
    },
    TextField: {
        component: 'textarea',
        createField: (config) => ({
            ...config,
            rows: 3
        })
    },
    IntegerField: {
        component: 'input',
        type: 'number',
        createField: (config) => ({
            ...config,
            step: 1,
            min: config.min_value,
            max: config.max_value
        })
    },
    FloatField: {
        component: 'input',
        type: 'number',
        createField: (config) => ({
            ...config,
            step: 'any',
            min: config.min_value,
            max: config.max_value
        })
    },
    BooleanField: {
        component: 'input',
        type: 'checkbox',
        createField: (config) => ({
            ...config,
            checked: config.default || false
        })
    },
    DateField: {
        component: 'input',
        type: 'date',
        createField: (config) => ({
            ...config,
            min: config.min_value,
            max: config.max_value
        })
    },
    ChoiceField: {
        component: 'select',
        createField: (config) => ({
            ...config,
            options: config.choices.map(([value, label]) => ({
                value,
                label,
                selected: value === config.default
            }))
        })
    },
    ForeignKey: {
        component: 'select',
        createField: (config) => ({
            ...config,
            async: true,
            loadOptions: () => API.ModelFields.getChoices(config.related_model)
        })
    }
};

/**
 * Form Manager Class
 */
class FormManager {
    constructor() {
        // Track form instances
        this.forms = new Map();
        
        // Cache field definitions
        this.fieldDefinitions = null;
        this.validationRules = null;
        this.fieldDependencies = null;

        // Bind methods
        this.handleSubmit = this.handleSubmit.bind(this);
        this.handleFieldChange = this.handleFieldChange.bind(this);
        this.handleFieldBlur = this.handleFieldBlur.bind(this);

        // Initialize state
        this.initializeState();
    }

    /**
     * Initialize form state
     * @private
     */
    initializeState() {
        State.set(FORMS_STATE_KEY, {
            instances: {},
            modelFields: null,
            validationRules: null,
            dependencies: null,
            lastUpdate: new Date()
        });
    }

    /**
     * Load field definitions from Django
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

            // Cache results
            this.fieldDefinitions = fields;
            this.validationRules = rules;
            this.fieldDependencies = dependencies;

            // Update state
            State.update(FORMS_STATE_KEY, {
                modelFields: fields,
                validationRules: rules,
                dependencies: dependencies,
                lastUpdate: new Date()
            });

        } catch (error) {
            console.error('Error loading field definitions:', error);
            NotificationUI.show({
                message: 'Error loading form definitions',
                type: 'error'
            });
            throw error;
        }
    }
    /**
     * Create a new form instance
     * @param {string} modelType - Django model type
     * @param {string} instanceId - Form instance ID
     * @param {Object} options - Form options
     * @returns {Promise<HTMLFormElement>} Created form
     */
    async createForm(modelType, instanceId, options = {}) {
        if (!this.fieldDefinitions) {
            await this.loadFieldDefinitions();
        }

        const formId = `${modelType}-${instanceId}`;
        
        try {
            // Get model field definitions
            const modelFields = this.fieldDefinitions[modelType];
            if (!modelFields) {
                throw new Error(`No field definitions found for ${modelType}`);
            }

            // Create form element
            const form = document.createElement('form');
            form.id = formId;
            form.className = 'w3-container';
            form.dataset.type = modelType;
            form.dataset.id = instanceId;

            // Add form fields
            for (const field of modelFields) {
                const fieldElement = await this.createField(field, options.initialData?.[field.name]);
                form.appendChild(fieldElement);
            }

            // Setup form event handlers
            form.addEventListener('submit', this.handleSubmit);
            
            // Store form instance
            this.forms.set(formId, {
                element: form,
                type: modelType,
                id: instanceId,
                fields: modelFields,
                state: {
                    dirty: false,
                    valid: true,
                    submitted: false,
                    errors: new Map()
                }
            });

            // Update state
            this.updateFormState(formId, 'created');

            return form;

        } catch (error) {
            console.error(`Error creating form ${formId}:`, error);
            throw error;
        }
    }

    /**
     * Create a form field element
     * @param {Object} fieldConfig - Field configuration
     * @param {*} initialValue - Initial field value
     * @returns {Promise<HTMLElement>} Created field element
     */
    async createField(fieldConfig, initialValue) {
        const handler = FIELD_HANDLERS[fieldConfig.field_type];
        if (!handler) {
            console.warn(`No handler for field type: ${fieldConfig.field_type}`);
            return null;
        }

        try {
            // Create field container
            const container = document.createElement('div');
            container.className = 'field-container w3-margin-bottom';

            // Add label if specified
            if (fieldConfig.label) {
                const label = document.createElement('label');
                label.className = 'w3-text-dark-grey';
                label.htmlFor = fieldConfig.name;
                label.textContent = fieldConfig.label;
                if (fieldConfig.required) {
                    label.innerHTML += ' <span class="w3-text-red">*</span>';
                }
                container.appendChild(label);
            }

            // Create field element
            const field = document.createElement(handler.component);
            field.className = 'w3-input w3-border';
            field.name = fieldConfig.name;
            field.id = fieldConfig.name;

            // Apply handler-specific configuration
            const config = handler.createField(fieldConfig);
            Object.entries(config).forEach(([key, value]) => {
                if (key === 'options' && Array.isArray(value)) {
                    // Handle select options
                    value.forEach(option => {
                        const optElement = document.createElement('option');
                        optElement.value = option.value;
                        optElement.textContent = option.label;
                        optElement.selected = option.selected;
                        field.appendChild(optElement);
                    });
                } else if (key !== 'component' && key !== 'createField') {
                    field[key] = value;
                }
            });

            // Set initial value if provided
            if (initialValue !== undefined) {
                if (handler.type === 'checkbox') {
                    field.checked = Boolean(initialValue);
                } else {
                    field.value = initialValue;
                }
            }

            // Add field event listeners
            field.addEventListener('change', () => this.handleFieldChange(field));
            field.addEventListener('blur', () => this.handleFieldBlur(field));

            // Add field to container
            container.appendChild(field);

            // Add error container
            const errorContainer = document.createElement('div');
            errorContainer.className = 'field-error w3-text-red w3-small w3-hide';
            container.appendChild(errorContainer);

            // Load async options if needed
            if (config.async && config.loadOptions) {
                try {
                    const options = await config.loadOptions();
                    field.innerHTML = ''; // Clear loading state
                    options.forEach(option => {
                        const optElement = document.createElement('option');
                        optElement.value = option.value;
                        optElement.textContent = option.label;
                        field.appendChild(optElement);
                    });
                } catch (error) {
                    console.error('Error loading field options:', error);
                    // Add error option
                    const errorOpt = document.createElement('option');
                    errorOpt.value = '';
                    errorOpt.textContent = 'Error loading options';
                    errorOpt.disabled = true;
                    field.appendChild(errorOpt);
                }
            }

            return container;

        } catch (error) {
            console.error('Error creating field:', error);
            throw error;
        }
    }
    /**
     * Handle form submission
     * @param {Event} event - Submit event
     * @private
     */
    async handleSubmit(event) {
        event.preventDefault();
        const form = event.target;
        const formId = `${form.dataset.type}-${form.dataset.id}`;
        const instance = this.forms.get(formId);

        if (!instance) return;

        try {
            // Mark form as submitted
            instance.state.submitted = true;
            this.updateFormState(formId, 'submitting');

            // Validate all fields
            const isValid = await this.validateForm(formId);
            if (!isValid) {
                this.updateFormState(formId, 'invalid');
                return;
            }

            // Collect form data
            const formData = this.collectFormData(form, instance.fields);

            // Dispatch custom event with form data
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

            const shouldProceed = form.dispatchEvent(submitEvent);
            if (!shouldProceed) {
                this.updateFormState(formId, 'cancelled');
                return;
            }

            this.updateFormState(formId, 'submitted');

        } catch (error) {
            console.error('Form submission error:', error);
            this.updateFormState(formId, 'error', error);
            this.showFormError(form, error);
        }
    }

    /**
     * Validate entire form
     * @param {string} formId - Form identifier
     * @returns {Promise<boolean>} Validation result
     * @private
     */
    async validateForm(formId) {
        const instance = this.forms.get(formId);
        if (!instance) return false;

        const form = instance.element;
        let isValid = true;

        // Clear previous errors
        this.clearFormErrors(form);

        try {
            // Validate each field
            for (const field of instance.fields) {
                const element = form.elements[field.name];
                if (!element) continue;

                const fieldValid = await this.validateField(element, field);
                isValid = isValid && fieldValid;
            }

            // Check field dependencies
            if (isValid && this.fieldDependencies) {
                const dependencyErrors = this.validateDependencies(form, instance.type);
                if (dependencyErrors.length > 0) {
                    dependencyErrors.forEach(error => {
                        this.showFieldError(
                            form.elements[error.field],
                            error.message
                        );
                    });
                    isValid = false;
                }
            }

            return isValid;

        } catch (error) {
            console.error('Form validation error:', error);
            this.showFormError(form, error);
            return false;
        }
    }

    /**
     * Validate a single field
     * @param {HTMLElement} element - Field element
     * @param {Object} fieldConfig - Field configuration
     * @returns {Promise<boolean>} Validation result
     * @private
     */
    async validateField(element, fieldConfig) {
        try {
            const value = this.getFieldValue(element);
            
            // Check required
            if (fieldConfig.required && !value) {
                this.showFieldError(element, `${fieldConfig.label || fieldConfig.name} is required`);
                return false;
            }

            // Skip further validation if empty and not required
            if (!value && !fieldConfig.required) {
                return true;
            }

            // Get field type validator
            const handler = FIELD_HANDLERS[fieldConfig.field_type];
            if (!handler) return true;

            // Run field type validation
            if (handler.validate) {
                const typeValid = await handler.validate(value, fieldConfig);
                if (!typeValid) {
                    this.showFieldError(element, `Invalid ${fieldConfig.field_type.toLowerCase()}`);
                    return false;
                }
            }

            // Run Django validation rules
            if (this.validationRules && fieldConfig.validation_rules) {
                for (const rule of fieldConfig.validation_rules) {
                    const ruleConfig = this.validationRules[rule];
                    if (!ruleConfig) continue;

                    const ruleValid = await this.validateRule(value, ruleConfig);
                    if (!ruleValid) {
                        this.showFieldError(element, ruleConfig.message);
                        return false;
                    }
                }
            }

            // Clear any previous errors
            this.clearFieldError(element);
            return true;

        } catch (error) {
            console.error('Field validation error:', error);
            this.showFieldError(element, 'Validation error occurred');
            return false;
        }
    }
    /**
     * Show field error
     * @param {HTMLElement} element - Field element
     * @param {string} message - Error message
     * @private
     */
    showFieldError(element, message) {
        const container = element.closest('.field-container');
        if (!container) return;

        element.classList.add('w3-border-red');
        
        const errorDisplay = container.querySelector('.field-error');
        if (errorDisplay) {
            errorDisplay.textContent = message;
            errorDisplay.classList.remove('w3-hide');
            
            // Animate error appearance
            errorDisplay.style.opacity = '0';
            requestAnimationFrame(() => {
                errorDisplay.style.transition = 'opacity 0.2s ease-in';
                errorDisplay.style.opacity = '1';
            });
        }
    }

    /**
     * Clear field error
     * @param {HTMLElement} element - Field element
     * @private
     */
    clearFieldError(element) {
        const container = element.closest('.field-container');
        if (!container) return;

        element.classList.remove('w3-border-red');
        
        const errorDisplay = container.querySelector('.field-error');
        if (errorDisplay) {
            errorDisplay.style.transition = 'opacity 0.2s ease-out';
            errorDisplay.style.opacity = '0';
            
            setTimeout(() => {
                errorDisplay.classList.add('w3-hide');
                errorDisplay.textContent = '';
            }, 200);
        }
    }

    /**
     * Show form-level error
     * @param {HTMLFormElement} form - Form element
     * @param {Error} error - Error object
     * @private
     */
    showFormError(form, error) {
        let errorContainer = form.querySelector('.form-error');
        if (!errorContainer) {
            errorContainer = document.createElement('div');
            errorContainer.className = 'form-error w3-panel w3-pale-red w3-leftbar w3-border-red';
            form.insertBefore(errorContainer, form.firstChild);
        }

        errorContainer.innerHTML = `
            <p><strong>Error:</strong> ${error.message}</p>
            ${error.details ? `<p class="w3-small">${error.details}</p>` : ''}
        `;

        errorContainer.style.display = 'block';
    }

    /**
     * Clear all form errors
     * @param {HTMLFormElement} form - Form element
     * @private
     */
    clearFormErrors(form) {
        // Clear field errors
        form.querySelectorAll('.field-error').forEach(error => {
            error.classList.add('w3-hide');
            error.textContent = '';
        });

        // Clear form error
        const formError = form.querySelector('.form-error');
        if (formError) {
            formError.style.display = 'none';
            formError.innerHTML = '';
        }

        // Clear error styling
        form.querySelectorAll('.w3-border-red').forEach(element => {
            element.classList.remove('w3-border-red');
        });
    }

    /**
     * Handle field change event
     * @param {HTMLElement} field - Changed field
     * @private
     */
    handleFieldChange(field) {
        const form = field.closest('form');
        if (!form) return;

        const formId = `${form.dataset.type}-${form.dataset.id}`;
        const instance = this.forms.get(formId);
        if (!instance) return;

        // Update dirty state
        instance.state.dirty = true;

        // Run validation if form was previously submitted
        if (instance.state.submitted) {
            const fieldConfig = instance.fields.find(f => f.name === field.name);
            if (fieldConfig) {
                this.validateField(field, fieldConfig);
            }
        }

        // Update state
        this.updateFormState(formId, 'field-changed', {
            field: field.name,
            value: this.getFieldValue(field)
        });
    }

    /**
     * Handle field blur event
     * @param {HTMLElement} field - Blurred field
     * @private
     */
    handleFieldBlur(field) {
        const form = field.closest('form');
        if (!form) return;

        const formId = `${form.dataset.type}-${form.dataset.id}`;
        const instance = this.forms.get(formId);
        if (!instance) return;

        // Validate on blur
        const fieldConfig = instance.fields.find(f => f.name === field.name);
        if (fieldConfig) {
            this.validateField(field, fieldConfig);
        }

        // Update state
        this.updateFormState(formId, 'field-blur', {
            field: field.name
        });
    }

    /**
     * Get field value based on type
     * @param {HTMLElement} field - Field element
     * @returns {*} Field value
     * @private
     */
    getFieldValue(field) {
        switch (field.type) {
            case 'checkbox':
                return field.checked;
            case 'select-multiple':
                return Array.from(field.selectedOptions).map(opt => opt.value);
            case 'number':
                return field.value ? Number(field.value) : null;
            case 'date':
                return field.value ? new Date(field.value) : null;
            default:
                return field.value;
        }
    }

    /**
     * Update form state
     * @param {string} formId - Form identifier
     * @param {string} action - State action
     * @param {Object} [data] - Additional data
     * @private
     */
    updateFormState(formId, action, data = {}) {
        const currentState = State.get(FORMS_STATE_KEY);
        
        State.update(FORMS_STATE_KEY, {
            ...currentState,
            instances: {
                ...currentState.instances,
                [formId]: {
                    ...currentState.instances[formId],
                    lastAction: action,
                    lastUpdate: new Date(),
                    ...data
                }
            }
        });
    }
}

// Export singleton instance
export const Forms = new FormManager();