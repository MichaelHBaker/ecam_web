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
            console.log('Event manager already initialized');
            return this;
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

            // Setup global listeners in bubbling phase (LOWER priority)
            document.addEventListener('click', this.handleGlobalClick, { capture: false });
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

    _originalAddDelegate = null;

    /**
     * Add delegated event listener with improved event delegation handling
     * @param {HTMLElement|Document} context - Context element
     * @param {string} eventType - Event type
     * @param {string} selector - Delegate selector
     * @param {Function} handler - Event handler
     * @param {Object} options - Event listener options
     * @returns {Function} Remove listener function
     */
    addDelegate(context, eventType, selector, handler, options = {}) {
        console.log(`[Events] Adding delegation: ${eventType} for '${selector}'`);
        
        if (!this.initialized) {
            console.error(`[Events] Not initialized when adding delegation for ${eventType} - ${selector}`);
            throw new Error('Event manager must be initialized before use');
        }

        try {
            // Generate a base ID for this delegation type
            const baseId = this.generateDelegationBaseId(context, eventType, selector);
            console.log(`[Events] Generated baseId: ${baseId}`);
            
            // Check if we already have delegations of this type
            const existingDelegations = Array.from(this.delegatedEvents.entries())
                .filter(([key, value]) => key.startsWith(baseId));
            
            console.log(`[Events] Found ${existingDelegations.length} existing delegations for ${baseId}`);
            if (existingDelegations.length > 0) {
                console.log(`[Events] Existing delegation IDs:`, existingDelegations.map(([id]) => id));
            }
            
            // Instead of just checking for the exact same handler,
            // we'll check if there's already a delegation for this context/type/selector combination
            if (existingDelegations.length > 0) {
                const [delegationId, delegation] = existingDelegations[0];
                console.log(`[Events] Reusing existing delegation: ${delegationId} for ${eventType} on '${selector}'`);
                
                // Return the remove function for the first existing delegation
                return () => {
                    console.log(`[Events] Removing reused delegation: ${delegationId}`);
                    delegation.context.removeEventListener(
                        delegation.eventType, 
                        delegation.handler, 
                        delegation.options
                    );
                    this.delegatedEvents.delete(delegationId);
                    this.updateEventState('delegateRemoved', { delegationId });
                };
            }
            
            console.log(`[Events] Creating new delegation for ${eventType} on '${selector}'`);
            
            // Create a listener function that handles both standard and custom events
            const listener = (event) => {
                // Skip if already handled by another delegate
                if (event.customHandled) {
                    console.log(`[Events] Event already handled, skipping: ${eventType} for '${selector}'`);
                    return;
                }
                
                // Handle custom events (those with colon in the name, like 'dashboard:ready')
                if (eventType.includes(':') || !event.target || typeof event.target.closest !== 'function') {
                    console.log(`[Events] Handling custom event: ${eventType}`);
                    handler.call(context, event, context);
                    return;
                }
                
                // First check if target itself matches
                let matchedElement = null;
                
                // Check if target matches directly
                if (event.target.matches && event.target.matches(selector)) {
                    matchedElement = event.target;
                    console.log(`[Events] Direct match found for '${selector}'`);
                } 
                // Otherwise find closest ancestor that matches
                else if (event.target.closest) {
                    matchedElement = event.target.closest(selector);
                    if (matchedElement) {
                        console.log(`[Events] Ancestor match found for '${selector}'`);
                    }
                }
                
                // Skip context check for document/window
                const skipContextCheck = context === document || context === window;
                const inContext = skipContextCheck || context.contains(matchedElement);
                
                // Call handler if we found a match and it's in context
                if (matchedElement && inContext) {
                    console.log(`[Events] Calling handler for ${eventType} on '${selector}'`);
                    // Call handler with matched element as this and second parameter
                    handler.call(matchedElement, event, matchedElement);
                } else if (matchedElement) {
                    console.log(`[Events] Match found but not in context for '${selector}'`);
                } else {
                    // Verbose debug level logging - uncomment if needed
                    // console.log(`[Events] No match found for '${selector}'`);
                }
            };

            // Set capture to true to ensure delegated handlers run BEFORE global handlers
            const captureOptions = {
                ...options,
                capture: true  // This ensures delegated handlers run first
            };

            // Add the event listener to the context with capture phase
            context.addEventListener(eventType, listener, captureOptions);
            console.log(`[Events] Event listener added to context for ${eventType}`);

            // Generate a unique ID for this delegation
            const delegationId = `${baseId}_${Date.now()}`;
            console.log(`[Events] Generated unique delegationId: ${delegationId}`);
            
            // Store in our delegation map with the original handler reference
            this.delegatedEvents.set(delegationId, {
                context,
                eventType,
                handler: listener,
                originalHandler: handler, // Store the original handler for comparison
                selector,
                options: captureOptions
            });
            console.log(`[Events] Stored delegation in map with id: ${delegationId}`);
            
            // Update state
            this.updateEventState('delegateAdded', {
                delegationId,
                context: context === document ? 'document' : context.id || 'unknown',
                eventType,
                selector,
                timestamp: new Date()
            });
            
            // Return remove function
            return () => {
                console.log(`[Events] Removing delegation: ${delegationId}`);
                context.removeEventListener(eventType, listener, captureOptions);
                this.delegatedEvents.delete(delegationId);
                this.updateEventState('delegateRemoved', { delegationId });
            };
        } catch (error) {
            console.error(`[Events] ERROR in addDelegate for ${eventType} - ${selector}:`, error);
            this.handleError('AddDelegate', error);
            return () => {}; // Return no-op function
        }
    }

    /**
     * Generate base delegation ID (without uniqueness suffix)
     * @private
     */
    generateDelegationBaseId(container, eventType, selector) {
        const containerId = container.id || 
                        (container === document ? 'document' : 
                            (container === window ? 'window' : 'unknown'));
        return `${containerId}_${eventType}_${selector}`;
    }

    /**
     * Trigger an event
     * @param {string} eventName - Name of the event to trigger
     * @param {Object} data - Optional event data
     */
    trigger(eventName, data = {}) {
        if (!this.initialized) {
            throw new Error('Event manager must be initialized before use');
        }

        try {
            // Create and dispatch custom event
            const event = new CustomEvent(eventName, {
                detail: data,
                bubbles: true,
                cancelable: true
            });
            
            document.dispatchEvent(event);
            
            // Update state
            this.updateEventState('triggered', {
                eventName,
                timestamp: new Date()
            });
            
            return true;
        } catch (error) {
            this.handleError('Trigger Event', error);
            return false;
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
        // Skip ALL processing if already handled by delegation
        if (event.customHandled) {
            return;
        }
        
        try {
            // Handle section toggle clicks
            const toggleButton = event.target.closest('[data-action="toggle-section"]');
            if (toggleButton) {
                const sectionName = toggleButton.getAttribute('data-section');
                if (sectionName) {
                    const sectionContent = document.querySelector(`[data-content="${sectionName}"]`);
                    if (sectionContent) {
                        console.log('Global handler processing section toggle:', sectionName);
                        
                        // Toggle visibility
                        const isHidden = sectionContent.classList.contains('w3-hide');
                        
                        if (isHidden) {
                            // Show section
                            sectionContent.classList.remove('w3-hide');
                            
                            // Update icon
                            const icon = toggleButton.querySelector('i');
                            if (icon) {
                                icon.classList.remove('bi-chevron-right');
                                icon.classList.add('bi-chevron-down');
                            }
                        } else {
                            // Hide section
                            sectionContent.classList.add('w3-hide');
                            
                            // Update icon
                            const icon = toggleButton.querySelector('i');
                            if (icon) {
                                icon.classList.remove('bi-chevron-down');
                                icon.classList.add('bi-chevron-right');
                            }
                        }
                        
                        // Mark as handled to prevent double processing
                        event.customHandled = true;
                        
                        // Update state
                        this.updateEventState('sectionToggle', {
                            section: sectionName,
                            isVisible: !isHidden,
                            timestamp: new Date()
                        });
                    }
                }
            }

            // Only log detailed information for debugging, not in production
            // console.log(`[Events] Global click handler triggered on:`, event.target);
            
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