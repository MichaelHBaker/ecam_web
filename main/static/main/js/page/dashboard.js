// dashboard.js - Dashboard-specific functionality

import { State, DOM, Events, CRUD, API, NotificationUI, StatusUI, Tree, Modal, Forms } from '../main.js';

/**
 * Dashboard Manager - Responsible for dashboard-specific functionality
 */
class DashboardManager {
    constructor() {
        this.initialized = false;
        this.loadingState = false;
        this.treeState = null;
        
        // Bind methods
        this.handleFilterChange = this.handleFilterChange.bind(this);
        this.handleFormSubmit = this.handleFormSubmit.bind(this);
        this.handleSectionToggle = this.handleSectionToggle.bind(this);
        this.handleProjectFilter = this.handleProjectFilter.bind(this);
        this.handleAddProject = this.handleAddProject.bind(this);
        this.handleFilterFormSubmit = this.handleFilterFormSubmit.bind(this);
        
        // Initialize dashboard state
        State.set('dashboard_state', {
            initialized: false,
            currentView: 'tree',
            loadingState: false,
            lastUpdate: new Date()
        });
    }

    /**
     * Initialize dashboard-specific components
     */
    async initialize() {
        if (this.initialized) return this;

        console.log('Dashboard initialization started');
        
        try {
            // Initialize state for section expansion
            State.set('dashboard_sections', {
                projects: false,  // Initially collapsed
                measurements: false,
                data: false,
                models: false,
                lastUpdate: new Date()
            });

            // Initialize the TreeManager early
            if (!Tree.isInitialized()) {
                console.log('Initializing Tree Manager');
                const treeContainer = document.querySelector('.tree-container');
                if (!treeContainer) {
                    throw new Error('Tree container not found in DOM');
                }
                
                await Tree.initialize(treeContainer);
                
                // Add 'root' type to nodeTypes configuration if needed
                if (!Tree.nodeTypes.root) {
                    Tree.nodeTypes.root = {
                        childType: 'project',
                        loadChildren: async (id) => API.Root.getChildren(id),
                        canHaveChildren: true
                    };
                    console.log('Added root node type configuration to Tree');
                }
                
                console.log('Tree Manager initialized successfully');
            }

            // Set up event listeners
            this.setupEventListeners();

            // Initialize filters
            this.initializeFilters();

            // Initialize forms
            this.initializeForms();
            
            this.initialized = true;
            State.update('dashboard_state', {
                initialized: true,
                lastUpdate: new Date()
            });
            
            console.log('Dashboard initialization complete');
            return this;
            
        } catch (error) {
            console.error('Dashboard initialization error:', error);
            NotificationUI.show({
                message: `Dashboard initialization error: ${error.message}`,
                type: 'error',
                duration: 0,
                closeable: true
            });
            throw error;
        }
    }

    /**
     * Set up dashboard event listeners
     */
    setupEventListeners() {
        // Section toggling
        Events.addDelegate(document, 'click', '[data-action="toggle-section"]', this.handleSectionToggle);
        
        // Project management
        Events.addDelegate(document, 'click', '[data-action="filter-projects"]', this.handleProjectFilter);
        Events.addDelegate(document, 'click', '[data-action="add-project"]', this.handleAddProject);
        Events.addDelegate(document, 'submit', '[data-action="filter-form"]', this.handleFilterFormSubmit);
    }

    /**
     * Initialize filters
     */
    initializeFilters() {
        var filterInput = document.querySelector('[data-action="filter-projects"]');
        if (!filterInput) return;

        // Set up filter debouncing
        filterInput.addEventListener('input', 
            DOM.debounce(this.handleFilterChange, 300));

        // Initialize filter state
        State.set('filter_state', {
            currentFilter: '',
            lastUpdate: new Date()
        });
    }

    /**
     * Initialize forms
     */
    initializeForms() {
        // Set up form validation and submission handling
        document.querySelectorAll('form[data-type]').forEach(function(form) {
            var type = form.dataset.type;
            
            // Initialize form state
            var formId = form.id || `${type}Form`;
            State.set(`form_${formId}_state`, {
                dirty: false,
                valid: false,
                lastUpdate: new Date()
            });

            // Add form validation
            form.addEventListener('submit', this.handleFormSubmit);

            // Add change tracking
            form.addEventListener('input', function() {
                State.update(`form_${formId}_state`, {
                    dirty: true,
                    lastUpdate: new Date()
                });
            });

            // Add reset handling
            form.addEventListener('reset', function() {
                State.update(`form_${formId}_state`, {
                    dirty: false,
                    valid: false,
                    lastUpdate: new Date()
                });
            });
        }.bind(this));

        // Set up autosave for draft forms
        this.setupAutosave();
    }

    /**
     * Set up form autosave
     */
    setupAutosave() {
        var AUTOSAVE_INTERVAL = 30000; // 30 seconds

        setInterval(function() {
            document.querySelectorAll('form[data-autosave="true"]').forEach(function(form) {
                var formId = form.id || form.dataset.type + 'Form';
                var formState = State.get(`form_${formId}_state`);

                if (formState && formState.dirty) {
                    var formData = new FormData(form);
                    var data = Object.fromEntries(formData.entries());
                    
                    // Save to localStorage
                    localStorage.setItem(`draft_${formId}`, JSON.stringify({
                        data: data,
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
        document.querySelectorAll('form[data-autosave="true"]').forEach(function(form) {
            var formId = form.id || form.dataset.type + 'Form';
            var draft = localStorage.getItem(`draft_${formId}`);
            
            if (draft) {
                try {
                    var parsedDraft = JSON.parse(draft);
                    var data = parsedDraft.data;
                    var timestamp = parsedDraft.timestamp;
                    var draftDate = new Date(timestamp);
                    
                    // Only restore if draft is less than 24 hours old
                    if ((new Date() - draftDate) < 86400000) {
                        Object.entries(data).forEach(function(entry) {
                            var key = entry[0];
                            var value = entry[1];
                            var field = form.elements[key];
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
     * Handle section toggle with event delegation format using w3.css classes
     * @param {Event} e - Event object
     * @param {HTMLElement} target - Target element from delegation
     */
    handleSectionToggle(e, target) {
        // Prevent default action and stop propagation
        e.preventDefault();
        e.stopPropagation();
        
        // Mark as handled to prevent other handlers
        e.customHandled = true;
        
        console.log('[DEBUG] handleSectionToggle called', e, target);
        
        const toggleButton = target.closest('[data-action="toggle-section"]');
        if (!toggleButton) {
            console.log('[DEBUG] No toggle button found');
            return false;
        }
        
        const sectionName = toggleButton.getAttribute('data-section');
        if (!sectionName) {
            console.log('[DEBUG] No section name found');
            return false;
        }
        
        console.log(`[DEBUG] Section toggle: ${sectionName}`);
        
        const sectionContent = document.querySelector(`[data-content="${sectionName}"]`);
        if (!sectionContent) {
            console.log(`[DEBUG] Section content not found for ${sectionName}`);
            return false;
        }
        
        const isHidden = sectionContent.classList.contains('w3-hide');
        const icon = toggleButton.querySelector('i');
        
        // Get current sections state
        const sectionsState = State.get('dashboard_sections') || {};
        console.log('[DEBUG] Current section state:', sectionsState);
        
        if (isHidden) {
            console.log(`[DEBUG] Expanding section: ${sectionName}`);
            
            // First show the section by removing the w3-hide class
            sectionContent.classList.remove('w3-hide');
            
            // Update icon
            if (icon) {
                icon.classList.remove('bi-chevron-right');
                icon.classList.add('bi-chevron-down');
            }
            
            // Update state to reflect section is expanded
            State.update('dashboard_sections', {
                [sectionName]: true,
                lastUpdate: new Date()
            });
            
            // Special handling for projects section
            if (sectionName === 'projects') {
                const treeContainer = sectionContent.querySelector('.tree-container');
                
                console.log('[DEBUG] Tree container found:', !!treeContainer);
                
                if (treeContainer) {
                    // Apply styling
                    if (!treeContainer.classList.contains('w3-container')) {
                        treeContainer.classList.add('w3-container');
                    }
                    
                    treeContainer.classList.add('w3-show');
                    
                    // Find and expand the root node if Tree is initialized
                    console.log('[DEBUG] Tree initialized:', Tree.isInitialized());
                    
                    if (Tree.isInitialized()) {
                        const rootNode = document.getElementById('projects-root');
                        console.log('[DEBUG] Root node found:', !!rootNode);
                        
                        if (rootNode) {
                            console.log('[DEBUG] Root node:', rootNode);
                            console.log('[DEBUG] Root node attributes:', 
                                        'id=' + rootNode.getAttribute('data-id'), 
                                        'type=' + rootNode.getAttribute('data-type'));
                            
                            // Check if the node has the necessary elements
                            const childrenContainer = rootNode.querySelector('.children-container');
                            const toggleButton = rootNode.querySelector('.toggle-btn');
                            
                            console.log('[DEBUG] Children container:', !!childrenContainer);
                            console.log('[DEBUG] Toggle button:', !!toggleButton);
                            
                            // Expand the root node which will trigger loading its children
                            console.log('[DEBUG] Attempting to expand root node...');
                            
                            setTimeout(() => {
                                Tree.toggleNode(rootNode)
                                    .then(() => {
                                        console.log('[DEBUG] Root node expansion successful');
                                    })
                                    .catch(error => {
                                        console.error('[DEBUG] Error expanding root node:', error);
                                    });
                            }, 0);
                        }
                    }
                }
            }
        } else {
            console.log(`[DEBUG] Collapsing section: ${sectionName}`);
            
            // Hide the section
            sectionContent.classList.add('w3-hide');
            
            // Update icon
            if (icon) {
                icon.classList.remove('bi-chevron-down');
                icon.classList.add('bi-chevron-right');
            }
            
            // Update state to reflect section is collapsed
            State.update('dashboard_sections', {
                [sectionName]: false,
                lastUpdate: new Date()
            });
        }
        
        return false;
    }


    handleProjectFilter(e, target) {
        e.preventDefault();
        Modal.show('filter-projects', {
            title: 'Filter Projects',
            type: 'filter',
            width: '400px',
            content: `
                <form class="w3-container w3-padding-16" data-action="filter-form">
                    <div class="w3-row-padding">
                        <div class="w3-col m12">
                            <input class="w3-input" type="text" name="search" placeholder="Search...">
                        </div>
                    </div>
                    <div class="w3-row-padding w3-margin-top">
                        <div class="w3-col m12">
                            <label>Status</label>
                            <select class="w3-select" name="status">
                                <option value="">All</option>
                                <option value="active">Active</option>
                                <option value="archived">Archived</option>
                            </select>
                        </div>
                    </div>
                    <div class="w3-padding-16">
                        <button type="submit" class="w3-button w3-blue">Apply Filter</button>
                        <button type="button" class="w3-button" data-action="clear-filter">Clear</button>
                    </div>
                </form>
            `
        });
    }

    handleAddProject(e, target) {
        e.preventDefault();
        Modal.show('add-project', {
            title: 'Add New Project',
            type: 'form',
            width: '500px',
            content: this.getProjectForm()
        });
    }

    async handleFilterFormSubmit(e, target) {
        e.preventDefault();
        try {
            var formData = new FormData(target);
            await this.applyFilter(Object.fromEntries(formData));
            Modal.hide('filter-projects');
        } catch (error) {
            NotificationUI.show({
                message: `Error applying filter: ${error.message}`,
                type: 'error',
                duration: 5000
            });
        }
    }

    async handleFilterChange(event) {
        var value = event.target.value.trim();
        
        try {
            StatusUI.show('Filtering...', { id: 'filter' });
            
            // Update filter state
            State.update('filter_state', {
                currentFilter: value,
                lastUpdate: new Date()
            });

            // Get filtered data
            var response = await API.Projects.list({ filter: value });
            
            // Update tree
            if (Tree.isInitialized()) {
                var projectsData = [];
                if (response.data) {
                    projectsData = response.data;
                } else if (Array.isArray(response)) {
                    projectsData = response;
                } else {
                    projectsData = response.results || response.nodes || [];
                }
                
                Tree.renderNodes(projectsData);
                
                // Show/hide no results message
                var noResults = document.querySelector('.no-results');
                if (noResults) {
                    noResults.classList.toggle('w3-hide', projectsData.length > 0);
                }
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
        var form = event.target;
        var type = form.dataset.type;
        var id = form.elements.id ? form.elements.id.value : null;

        try {
            StatusUI.show('Saving...', { id: 'save' });
            
            var formData = new FormData(form);
            var data = Object.fromEntries(formData.entries());

            if (id) {
                await CRUD.updateItem(type, id, data);
            } else {
                await CRUD.addItem(type, data);
            }

            // Clear draft if autosave was enabled
            if (form.dataset.autosave) {
                localStorage.removeItem(`draft_${form.id || type + 'Form'}`);
            }

            var modal = form.closest('.w3-modal');
            if (modal) Modal.hide(modal.id);
            
            StatusUI.hide('save');
        } catch (error) {
            NotificationUI.show({
                message: `Save failed: ${error.message}`,
                type: 'error'
            });
        }
    }

    /**
     * Apply filter to projects list
     */
    async applyFilter(filterData) {
        console.log('Applying filter:', filterData);
        
        try {
            StatusUI.show('Filtering...', { id: 'filter' });
            
            // Build filter parameter
            var params = {};
            if (filterData.search) {
                params.filter = filterData.search;
            }
            if (filterData.status) {
                params.status = filterData.status;
            }
            
            // Get filtered data
            var response = await API.Projects.list(params);
            
            // Update tree
            if (Tree.isInitialized()) {
                var projectsData = [];
                if (response.data) {
                    projectsData = response.data;
                } else if (Array.isArray(response)) {
                    projectsData = response;
                } else {
                    projectsData = response.results || response.nodes || [];
                }
                
                Tree.renderNodes(projectsData);
                
                // Show/hide no results message
                var noResults = document.querySelector('.no-results');
                if (noResults) {
                    noResults.classList.toggle('w3-hide', projectsData.length > 0);
                }
            }

            StatusUI.hide('filter');
            
            // Update filter input if it exists
            var filterInput = document.querySelector('[data-action="filter-projects"]');
            if (filterInput && filterData.search) {
                filterInput.value = filterData.search;
            }
            
        } catch (error) {
            NotificationUI.show({
                message: `Filter error: ${error.message}`,
                type: 'error'
            });
            throw error;
        }
    }

    /**
     * Get project form HTML
     */
    getProjectForm() {
        return `
            <form class="w3-container w3-padding-16" data-type="project">
                <div class="w3-row-padding">
                    <div class="w3-col m12">
                        <label>Project Name</label>
                        <input class="w3-input" type="text" name="name" required>
                    </div>
                </div>
                <div class="w3-row-padding w3-margin-top">
                    <div class="w3-col m12">
                        <label>Description</label>
                        <textarea class="w3-input" name="description" rows="3"></textarea>
                    </div>
                </div>
                <div class="w3-padding-16">
                    <button type="submit" class="w3-button w3-blue">Save Project</button>
                    <button type="button" class="w3-button" onclick="Modal.hide('add-project')">Cancel</button>
                </div>
            </form>
        `;
    }
}

// Create dashboard instance
var dashboard = new DashboardManager();

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM content loaded, setting up dashboard');
    
    // Initialize dashboard
    dashboard.initialize().catch(function(error) {
        console.error('Failed to initialize dashboard:', error);
    });
    
});

// Export dashboard instance
export default dashboard;