// main.js
// Main application initialization module
import { State } from './core/state.js';
import { DOM } from './core/dom.js';
import { Events } from './core/events.js';
import { CRUD } from './core/crud.js';
import { API } from './core/api.js';
import { Modal } from './core/modals.js';
import { Forms } from './core/forms.js';
import { Tree } from './core/tree.js';
import { NotificationUI, StatusUI } from './core/ui.js';
/**
 * Core initialization manager - responsible for initializing core application components
 */
class CoreManager {
    constructor() {
        this.initialized = false;
        
        // Initialize core state
        State.set('core_state', {
            initialized: false,
            lastUpdate: new Date()
        });
    }

    /**
     * Initialize core components with proper dependency order
     */
    async initialize() {
        if (this.initialized) return;

        try {
            // Improved error logging
            window.onerror = function(message, source, lineno, colno, error) {
                console.error('Uncaught Error:', {message, source, lineno, colno, error});
                return false;
            };

            // Define initialization order with dependencies
            const modules = [
                { module: State, name: 'State' },
                { module: DOM, name: 'DOM' },
                { module: Events, name: 'Events' },
                { module: API, name: 'API' },
                { module: NotificationUI, name: 'NotificationUI' },
                { module: StatusUI, name: 'StatusUI' },
                { module: Modal, name: 'Modal' },
                { module: Forms, name: 'Forms' },
                { module: CRUD, name: 'CRUD' }
            ];

            // Skip Event Manager if already initialized
            if (Events.isInitialized()) {
                console.log('Events already initialized, skipping');
                modules.splice(modules.findIndex(m => m.name === 'Events'), 1);
            }

            // Initialize modules sequentially
            for (const item of modules) {
                try {
                    console.log(`Initializing ${item.name}...`);
                    await item.module.initialize();
                } catch (error) {
                    console.error(`Failed to initialize ${item.name}:`, error);
                    console.error(`Error details: ${error.message}`);

                    // For non-critical components, we could continue
                    if (!['State', 'DOM', 'API'].includes(item.name)) {
                        console.warn(`Continuing without ${item.name}`);
                        continue;
                    }
                    
                    throw error; // Re-throw for critical components
                }
            }
            
            // Initialize Tree component if needed based on page type
            await this.initializeTreeIfNeeded();
            
            // Now it's safe to show UI elements
            StatusUI.show('Initializing...', { id: 'init' });
            
            this.initialized = true;
            State.update('core_state', {
                initialized: true,
                lastUpdate: new Date()
            });

            StatusUI.hide('init');
            NotificationUI.show({
                message: 'Application initialized',
                type: 'success',
                duration: 2000
            });
            
            // Trigger an event indicating core is initialized
            Events.trigger('core:initialized');
            
            console.log('Core initialization complete:', new Date());
            
            // Force cleanup of any lingering loading states after a delay
            setTimeout(() => {
                this.cleanupLoadingStates();
            }, 1000);

        } catch (error) {
            console.error('Core initialization error:', error);
            // Use basic alert if UI components might not be initialized
            alert(`Failed to initialize application: ${error.message}`);
        }
    }
    
    /**
     * Initialize the Tree component if we're on a page that needs it
     */
    async initializeTreeIfNeeded() {
        try {
            // Check if we're on a page that needs Tree
            const pageType = document.body.getAttribute('data-page-type');
            if (pageType !== 'dashboard' && pageType !== 'projects') {
                console.log(`Current page type (${pageType}) doesn't require Tree component`);
                return;
            }
            
            if (Tree.isInitialized()) {
                console.log('Tree already initialized');
                return;
            }
            
            console.log('Attempting to find tree container...');
            
            // Find tree container
            let treeContainer = document.querySelector('.tree-container');
            if (!treeContainer) {
                console.log('Tree container not found, Tree initialization will be deferred');
                return;
            }
            
            // Ensure container has an ID for reliable selection
            if (!treeContainer.id) {
                treeContainer.id = 'treeContainer';
                console.log('Added ID to tree container:', treeContainer.id);
            }
            
            // Make sure the container has the minimum required structure
            let treeWrapper = treeContainer.querySelector('.tree-wrapper');
            if (!treeWrapper) {
                treeWrapper = document.createElement('div');
                treeWrapper.className = 'tree-wrapper';
                treeContainer.appendChild(treeWrapper);
                console.log('Added tree-wrapper to container');
            }
            
            try {
                console.log('Initializing Tree with container:', treeContainer.id);
                await Tree.initialize(treeContainer);
                console.log('Tree initialized successfully');
                
                // Dispatch an event to notify that Tree is initialized
                const treeInitEvent = new CustomEvent('tree:initialized', {
                    detail: { timestamp: new Date() },
                    bubbles: true
                });
                document.dispatchEvent(treeInitEvent);
                
            } catch (error) {
                console.error('Error initializing Tree:', error);
                throw error;
            }
            
        } catch (error) {
            console.warn('Tree initialization failed:', error);
            console.warn('Continuing without Tree functionality');
        }
    }
    
    /**
     * Clean up any lingering loading states
     */
    cleanupLoadingStates() {
        // Force loading state to false
        State.update('api_state', {
            loading: false,
            lastUpdate: new Date()
        });
        
        // Hide any spinning elements directly
        document.querySelectorAll('.w3-spin, .bi-arrow-repeat').forEach(el => {
            el.classList.remove('w3-spin');
            // Try to find and hide parent containers
            const container = el.closest('.status-item, .loading-container, .tree-loading');
            if (container) {
                container.classList.add('w3-hide');
            }
        });
        
        // Hide status indicators
        StatusUI.hide('init');
        StatusUI.hide('loading');
        StatusUI.hide('filter');
        StatusUI.hide('save');
    }
}

// Create and initialize core manager
const core = new CoreManager();

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        core.initialize().catch(error => {
            console.error('Failed to initialize core:', error);
        });
    });
} else {
    core.initialize().catch(error => {
        console.error('Failed to initialize core:', error);
    });
}

// Export all modules for use in other files
export {
    State,
    DOM,
    Events,
    CRUD,
    API,
    NotificationUI,
    Tree,
    Modal,
    Forms,
    StatusUI
};