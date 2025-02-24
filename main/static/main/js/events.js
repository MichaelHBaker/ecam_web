// events.js
// Enhanced event management with proper initialization safety

const EVENTS_STATE_KEY = 'events_state';

import { State } from './state.js';
import { DOM } from './dom.js';

class EventManager {
    constructor() {
        // Private state
        this.initialized = false;
        this.handlers = new Map();
        this.delegatedEvents = new Map();
        this.boundHandlers = new WeakMap();
        
    }

    /**
     * Initialize event manager with dependency checking
     * @returns {Promise<void>}
     */
    async initialize() {
        if (this.initialized) {
            console.warn('Event manager already initialized');
            return;
        }

        try {
            // Verify dependencies are initialized
            if (!State.isInitialized()) {
                throw new Error('State must be initialized before Events');
            }
            if (!DOM.isInitialized()) {
                throw new Error('DOM must be initialized before Events');
            }

            // Initialize event state
            State.set(EVENTS_STATE_KEY, {
                activeHandlers: new Set(),
                delegatedEvents: new Set(),
                lastEvent: null,
                error: null,
                lastUpdate: new Date()
            });

            // Bind handlers
            this.handleGlobalClick = this.handleGlobalClick.bind(this);
            this.handleKeyPress = this.handleKeyPress.bind(this);
            this.handleWindowResize = this.debounce(this.handleWindowResize.bind(this), 250);

            // Setup global listeners
            document.addEventListener('click', this.handleGlobalClick);
            document.addEventListener('keydown', this.handleKeyPress);
            window.addEventListener('resize', this.handleWindowResize);

            this.initialized = true;
            console.log('Event manager initialized');
            
        } catch (error) {
            console.error('Event manager initialization failed:', error);
            throw error;
        }
    }

    /**
     * Check if event manager is initialized
     * @returns {boolean}
     */
    isInitialized() {
        return this.initialized;
    }

    /**
     * Add delegated event listener
     * @param {HTMLElement|Document} context - Context element
     * @param {string} eventType - Event type
     * @param {string} selector - Delegate selector
     * @param {Function} handler - Event handler
     * @param {Object} options - Event listener options
     * @returns {Function} Remove listener function
     */
    addDelegate(context, eventType, selector, handler, options = {}) {
        if (!this.initialized) {
            throw new Error('Event manager must be initialized before use');
        }

        try {
            const listener = (event) => {
                const target = event.target.closest(selector);
                if (target  && context.contains(target)) {
                    handler.call(target, event, target);
                }
            };

            context.addEventListener(eventType, listener, options);

            const delegationId = this.generateDelegationId(context, eventType, selector);

            // Track in delegatedEvents map
            this.delegatedEvents.set(delegationId, {
                context,
                eventType,
                handler: listener,
                selector,
                options
            });

            // Track in state
            this.updateEventState('delegateAdded', {
                delegationId,
                context: context === document ? 'document' : context.id || 'unknown',
                eventType,
                selector,
                timestamp: new Date()
            });

            // Return remove function
            return () => {
                context.removeEventListener(eventType, listener, options);
                this.delegatedEvents.delete(delegationId);
                this.updateEventState('delegateRemoved', { delegationId });
            };
        } catch (error) {
            this.handleError('AddDelegate', error);
            return () => {}; // Return no-op function
        }
    }

    /**
     * Add event listener with cleanup capability
     * @param {HTMLElement} element - Target element
     * @param {string} eventType - Event type
     * @param {Function} handler - Event handler
     * @param {Object} options - Event options
     * @returns {Function} Cleanup function
     */
    on(element, eventType, handler, options = {}) {
        if (!this.initialized) {
            throw new Error('Event manager must be initialized before use');
        }

        try {
            // Create bound handler
            const boundHandler = handler.bind(element);
            this.boundHandlers.set(handler, boundHandler);

            // Add listener
            element.addEventListener(eventType, boundHandler, options);

            // Track handler
            const handlerId = this.generateHandlerId(element, eventType);
            this.handlers.set(handlerId, {
                element,
                eventType,
                handler: boundHandler,
                options
            });

            // Update state
            this.updateEventState('handlerAdded', { handlerId });

            // Return cleanup function
            return () => this.off(element, eventType, handler);

        } catch (error) {
            this.handleError('AddEventListener', error);
            return () => {}; // Return no-op cleanup
        }
    }

    /**
     * Remove event listener
     * @param {HTMLElement} element - Target element
     * @param {string} eventType - Event type
     * @param {Function} handler - Event handler
     */
    off(element, eventType, handler) {
        if (!this.initialized) return;

        try {
            const boundHandler = this.boundHandlers.get(handler);
            if (boundHandler) {
                element.removeEventListener(eventType, boundHandler);
                this.boundHandlers.delete(handler);
            }

            const handlerId = this.generateHandlerId(element, eventType);
            this.handlers.delete(handlerId);

            this.updateEventState('handlerRemoved', { handlerId });

        } catch (error) {
            this.handleError('RemoveEventListener', error);
        }
    }


    /**
     * Handle global click events
     * @private
     */
    handleGlobalClick(event) {
        try {
            this.updateEventState('globalClick', {
                target: event.target,
                timestamp: new Date()
            });

            // Handle dropdown menus
            if (!event.target.closest('.dropdown-toggle')) {
                document.querySelectorAll('.dropdown-menu.show').forEach(menu => {
                    menu.classList.remove('show');
                });
            }

            // Handle modal backdrop clicks
            if (event.target.classList.contains('modal')) {
                event.target.style.display = 'none';
            }

        } catch (error) {
            this.handleError('GlobalClick', error);
        }
    }

    /**
     * Handle keyboard events
     * @private
     */
    handleKeyPress(event) {
        try {
            // Skip if focusing input elements
            if (event.target.matches('input, textarea')) return;

            this.updateEventState('keyPress', {
                key: event.key,
                modifiers: {
                    ctrl: event.ctrlKey,
                    alt: event.altKey,
                    shift: event.shiftKey
                }
            });

            // Handle Escape key
            if (event.key === 'Escape') {
                // Close active modal
                const activeModal = document.querySelector('.modal[style*="display: block"]');
                if (activeModal) {
                    activeModal.style.display = 'none';
                    return;
                }

                // Close active menu
                const activeMenu = document.querySelector('.dropdown-menu.show');
                if (activeMenu) {
                    activeMenu.classList.remove('show');
                }
            }

        } catch (error) {
            this.handleError('KeyPress', error);
        }
    }

    /**
     * Handle window resize
     * @private
     */
    handleWindowResize() {
        try {
            const dimensions = {
                width: window.innerWidth,
                height: window.innerHeight
            };

            this.updateEventState('windowResize', dimensions);

            // Dispatch custom resize event
            document.dispatchEvent(new CustomEvent('app:resize', {
                detail: dimensions
            }));

        } catch (error) {
            this.handleError('WindowResize', error);
        }
    }

    /**
     * Create debounced function
     * @private
     */
    debounce(func, wait) {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    /**
     * Generate unique handler ID
     * @private
     */
    generateHandlerId(element, eventType) {
        return `${element.id || Date.now()}_${eventType}`;
    }

    /**
     * Generate unique delegation ID
     * @private
     */
    generateDelegationId(container, eventType, selector) {
        return `${container.id || Date.now()}_${eventType}_${selector}`;
    }

    /**
     * Update event state
     * @private
     */
    updateEventState(eventType, data = {}) {
        State.update('events_state', {
            lastEvent: {
                type: eventType,
                timestamp: new Date(),
                data
            }
        });
    }

    /**
     * Handle errors
     * @private
     */
    handleError(context, error) {
        console.error(`Events Error (${context}):`, error);
        
        State.update('events_state', {
            error: {
                context,
                message: error.message,
                timestamp: new Date()
            }
        });
    }

    /**
     * Clean up resources
     */
    destroy() {
        if (!this.initialized) return;

        try {
            // Remove global listeners
            document.removeEventListener('click', this.handleGlobalClick);
            document.removeEventListener('keydown', this.handleKeyPress);
            window.removeEventListener('resize', this.handleWindowResize);

            // Remove all tracked handlers
            this.handlers.forEach(({ element, eventType, handler, options }) => {
                element.removeEventListener(eventType, handler, options);
            });

            // Remove all delegated events
            this.delegatedEvents.forEach(entry => {
                entry.context.removeEventListener(entry.eventType, entry.handler, entry.options);
            });
            
            // Clear collections
            this.handlers.clear();
            this.delegatedEvents.clear();
            this.boundHandlers = new WeakMap();

            // Reset state
            State.update(EVENTS_STATE_KEY, {
                activeHandlers: new Set(),
                delegatedEvents: new Set(), 
                lastEvent: null,
                error: null,
                lastUpdate: new Date()
            });

            this.initialized = false;
            console.log('Event manager cleaned up');

        } catch (error) {
            this.handleError('Cleanup', error);
        }
    }
}

// Export singleton instance
export const Events = new EventManager();