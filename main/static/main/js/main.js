// main.js
// Main application integration module

import { State } from '/static/main/js/state.js';
import { DOM } from '/static/main/js/dom.js';
import { Events } from '/static/main/js/events.js';
import { CRUD } from '/static/main/js/crud.js';
import { API } from '/static/main/js/api.js';
import { Modal } from '/static/main/js/modals.js';
import { NotificationUI, TreeUI, StatusUI } from '/static/main/js/ui.js';

class DashboardManager {
    constructor() {
        this.initialized = false;
        this.loadingState = false;
        this.treeState = null;
        
        // Bind methods
        this.handleTreeAction = this.handleTreeAction.bind(this);
        this.handleFilterChange = this.handleFilterChange.bind(this);
        this.handleFormSubmit = this.handleFormSubmit.bind(this);
        
        // Initialize state
        State.set('dashboard_state', {
            initialized: false,
            currentView: 'tree',
            loadingState: false,
            lastUpdate: new Date()
        });
    }

    /**
     * Initialize dashboard components
     */
    async initialize() {
        if (this.initialized) return;

        try {
            StatusUI.show('Initializing dashboard...', { id: 'init' });
            
            // Set up event subscriptions
            this.setupSubscriptions();
            
            this.initialized = true;
            State.update('dashboard_state', {
                initialized: true,
                lastUpdate: new Date()
            });

            StatusUI.hide('init');
            NotificationUI.show({
                message: 'Dashboard ready',
                type: 'success',
                duration: 2000
            });

        } catch (error) {
            console.error('Dashboard initialization error:', error);
            NotificationUI.show({
                message: `Failed to initialize dashboard: ${error.message}`,
                type: 'error'
            });
        }
    }

    /**
     * Initialize tree view
     */
    async initializeTree() {
        const treeContainer = DOM.getElement('.tree-container');
        if (!treeContainer) return;

        try {
            // Load initial data
            const response = await API.Projects.list();
            
            // Initialize tree UI
            TreeUI.renderProjects(response.data);
            
            // Set up tree event delegation
            Events.addDelegate(treeContainer, 'click', '[data-action]', 
                (e, target) => this.handleTreeAction(e, target));

        } catch (error) {
            throw new Error(`Tree initialization failed: ${error.message}`);
        }
    }
    /**
     * Initialize filters
     */
    initializeFilters() {
        const filterInput = DOM.getElement('[data-action="filter-projects"]');
        if (!filterInput) return;

        // Set up filter debouncing
        filterInput.addEventListener('input', 
            DOM.debounce(this.handleFilterChange, 300));

        // Initialize filter state
        State.set('filter_state', {
            currentFilter: '',
            lastUpdate: new Date()
        });

        // Add clear filter button
        const clearButton = DOM.createElement('button', {
            className: 'w3-button w3-hover-light-grey clear-filter',
            content: '<i class="bi bi-x"></i>',
            attributes: {
                'data-action': 'clear-filter',
                'title': 'Clear filter'
            }
        });
        filterInput.parentNode.appendChild(clearButton);

        // Handle clear filter
        clearButton.addEventListener('click', () => {
            filterInput.value = '';
            this.handleFilterChange({ target: filterInput });
        });
    }

    /**
     * Initialize forms
     */
    initializeForms() {
        // Set up form validation and submission handling
        document.querySelectorAll('form[data-type]').forEach(form => {
            const type = form.dataset.type;
            
            // Initialize form state
            const formId = form.id || `${type}Form`;
            State.set(`form_${formId}_state`, {
                dirty: false,
                valid: false,
                lastUpdate: new Date()
            });

            // Add form validation
            form.addEventListener('submit', this.handleFormSubmit);

            // Add change tracking
            form.addEventListener('input', () => {
                State.update(`form_${formId}_state`, {
                    dirty: true,
                    lastUpdate: new Date()
                });
            });

            // Add reset handling
            form.addEventListener('reset', () => {
                State.update(`form_${formId}_state`, {
                    dirty: false,
                    valid: false,
                    lastUpdate: new Date()
                });
            });
        });

        // Set up autosave for draft forms
        this.setupAutosave();
    }

    /**
     * Set up form autosave
     */
    setupAutosave() {
        const AUTOSAVE_INTERVAL = 30000; // 30 seconds

        setInterval(() => {
            document.querySelectorAll('form[data-autosave="true"]').forEach(form => {
                const formId = form.id || form.dataset.type + 'Form';
                const formState = State.get(`form_${formId}_state`);

                if (formState?.dirty) {
                    const formData = new FormData(form);
                    const data = Object.fromEntries(formData.entries());
                    
                    // Save to localStorage
                    localStorage.setItem(`draft_${formId}`, JSON.stringify({
                        data,
                        timestamp: new Date().toISOString()
                    }));

                    // Update state
                    State.update(`form_${formId}_state`, {
                        lastAutosave: new Date()
                    });
                }
            });
        }, AUTOSAVE_INTERVAL);

        // Restore drafts on page load
        document.querySelectorAll('form[data-autosave="true"]').forEach(form => {
            const formId = form.id || form.dataset.type + 'Form';
            const draft = localStorage.getItem(`draft_${formId}`);
            
            if (draft) {
                try {
                    const { data, timestamp } = JSON.parse(draft);
                    const draftDate = new Date(timestamp);
                    
                    // Only restore if draft is less than 24 hours old
                    if ((new Date() - draftDate) < 86400000) {
                        Object.entries(data).forEach(([key, value]) => {
                            const field = form.elements[key];
                            if (field) field.value = value;
                        });

                        NotificationUI.show({
                            message: 'Draft restored',
                            type: 'info'
                        });
                    } else {
                        localStorage.removeItem(`draft_${formId}`);
                    }
                } catch (error) {
                    console.error('Error restoring draft:', error);
                    localStorage.removeItem(`draft_${formId}`);
                }
            }
        });
    }
    /**
     * Initialize modals
     */
    initializeModals() {
        // Set up modal state tracking
        State.set('modal_state', {
            activeModals: new Set(),
            lastUpdate: new Date()
        });

        // Handle modal triggers
        Events.addDelegate(document, 'click', '[data-modal]', (e, target) => {
            const modalId = target.dataset.modal;
            this.showModal(modalId);
        });

        // Handle modal close buttons
        Events.addDelegate(document, 'click', '[data-action="close-modal"]', (e, target) => {
            const modal = target.closest('.w3-modal');
            if (modal) this.hideModal(modal.id);
        });

        // Handle modal backdrop clicks
        document.querySelectorAll('.w3-modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.hideModal(modal.id);
                }
            });
        });

        // Handle keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const activeModal = document.querySelector('.w3-modal[style*="display: block"]');
                if (activeModal) {
                    this.hideModal(activeModal.id);
                }
            }
        });
    }

    /**
     * Event Handlers
     */
    async handleTreeAction(event, target) {
        const action = target.dataset.action;
        const item = target.closest('.tree-item');
        
        if (!item) return;

        const type = item.dataset.type;
        const id = item.dataset.id;

        try {
            switch(action) {
                case 'edit':
                    await this.handleEdit(type, id);
                    break;
                case 'delete':
                    await this.handleDelete(type, id);
                    break;
                case 'add-child':
                    await this.handleAddChild(type, id);
                    break;
                case 'toggle':
                    await this.handleToggle(type, id);
                    break;
                default:
                    console.warn('Unknown tree action:', action);
            }
        } catch (error) {
            NotificationUI.show({
                message: `Action failed: ${error.message}`,
                type: 'error'
            });
        }
    }

    async handleFilterChange(event) {
        const value = event.target.value.trim();
        
        try {
            StatusUI.show('Filtering...', { id: 'filter' });
            
            // Update filter state
            State.update('filter_state', {
                currentFilter: value,
                lastUpdate: new Date()
            });

            // Get filtered data
            const response = await API.Projects.list({ filter: value });
            
            // Update tree
            TreeUI.renderProjects(response.data);
            
            // Show/hide no results message
            const noResults = DOM.getElement('.no-results');
            if (noResults) {
                noResults.classList.toggle('w3-hide', response.data.length > 0);
            }

            StatusUI.hide('filter');
        } catch (error) {
            NotificationUI.show({
                message: `Filter error: ${error.message}`,
                type: 'error'
            });
        }
    }

    async handleFormSubmit(event) {
        event.preventDefault();
        const form = event.target;
        const type = form.dataset.type;
        const id = form.elements.id?.value;

        try {
            StatusUI.show('Saving...', { id: 'save' });
            
            const formData = new FormData(form);
            const data = Object.fromEntries(formData.entries());

            if (id) {
                await CRUD.updateItem(type, id, data);
            } else {
                await CRUD.addItem(type, data);
            }

            // Clear draft if autosave was enabled
            if (form.dataset.autosave) {
                localStorage.removeItem(`draft_${form.id || type + 'Form'}`);
            }

            this.hideModal(form.closest('.w3-modal')?.id);
            
            StatusUI.hide('save');
        } catch (error) {
            NotificationUI.show({
                message: `Save failed: ${error.message}`,
                type: 'error'
            });
        }
    }
    /**
     * Modal handlers
     */
    showModal(modalId, data = {}) {
        const modal = DOM.getElement(`#${modalId}`);
        if (!modal) return;

        try {
            // Update modal content if needed
            if (data.title) {
                const titleEl = modal.querySelector('.modal-title');
                if (titleEl) titleEl.textContent = data.title;
            }

            // Populate form if present
            const form = modal.querySelector('form');
            if (form && data.formData) {
                Object.entries(data.formData).forEach(([key, value]) => {
                    const field = form.elements[key];
                    if (field) field.value = value;
                });
            }

            // Show modal with animation
            modal.style.display = 'block';
            modal.classList.add('w3-animate-opacity');

            // Update state
            State.update('modal_state', {
                activeModals: new Set([...State.get('modal_state')?.activeModals || [], modalId]),
                lastUpdate: new Date()
            });

            // Setup focus trap
            this.setupModalFocus(modal);

        } catch (error) {
            console.error('Error showing modal:', error);
            NotificationUI.show({
                message: 'Error showing modal',
                type: 'error'
            });
        }
    }

    hideModal(modalId) {
        const modal = DOM.getElement(`#${modalId}`);
        if (!modal) return;

        try {
            // Add closing animation
            modal.classList.add('w3-animate-opacity');
            modal.style.opacity = '0';

            // Hide after animation
            setTimeout(() => {
                modal.style.display = 'none';
                modal.style.opacity = '1';
                modal.classList.remove('w3-animate-opacity');

                // Reset form if present
                const form = modal.querySelector('form');
                if (form) {
                    form.reset();
                    // Clear validation states
                    form.querySelectorAll('.invalid').forEach(el => {
                        el.classList.remove('invalid');
                    });
                }

                // Update state
                const activeModals = new Set(State.get('modal_state')?.activeModals || []);
                activeModals.delete(modalId);
                State.update('modal_state', {
                    activeModals,
                    lastUpdate: new Date()
                });
            }, 300);

        } catch (error) {
            console.error('Error hiding modal:', error);
        }
    }

    /**
     * Utility functions
     */
    setupModalFocus(modal) {
        const focusableElements = modal.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );

        if (focusableElements.length === 0) return;

        const firstFocusable = focusableElements[0];
        const lastFocusable = focusableElements[focusableElements.length - 1];

        // Focus first element
        firstFocusable.focus();

        // Setup focus trap
        modal.addEventListener('keydown', function(e) {
            if (e.key === 'Tab') {
                if (e.shiftKey) {
                    if (document.activeElement === firstFocusable) {
                        e.preventDefault();
                        lastFocusable.focus();
                    }
                } else {
                    if (document.activeElement === lastFocusable) {
                        e.preventDefault();
                        firstFocusable.focus();
                    }
                }
            }
        });
    }

    /**
     * Setup state subscriptions
     */
    setupSubscriptions() {
        // Subscribe to CRUD operations
        State.subscribe('crud_state', (newState) => {
            if (newState.error) {
                NotificationUI.show({
                    message: newState.error.message,
                    type: 'error'
                });
            }
        });

        // Subscribe to API state
        State.subscribe('api_state', (newState) => {
            this.loadingState = newState.loading;
            DOM.getElement('#loadingOverlay')?.classList.toggle(
                'w3-show', 
                this.loadingState
            );
        });

        // Subscribe to filter changes
        State.subscribe('filter_state', (newState) => {
            const filterInput = DOM.getElement('[data-action="filter-projects"]');
            if (filterInput && filterInput.value !== newState.currentFilter) {
                filterInput.value = newState.currentFilter;
            }
        });
    }
}


// Create singleton instance
const Dashboard = new DashboardManager();

// Initialize dashboard when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    Dashboard.initialize();
});

// Export utilities
export {
    State,
    DOM,
    Events,
    CRUD,
    API,
    NotificationUI,
    TreeUI,
    Modal,
    StatusUI,
    Dashboard
};