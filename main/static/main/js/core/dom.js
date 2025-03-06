// dom.js

import { State } from './state.js';

class DOMUtilities {
    constructor() {
        this.elementCache = new Map();
        this.mutationObservers = new Map();
        this.intersectionObservers = new Map();
        this.initialized = false;
    }

    /**
     * Initialize DOM utilities with error handling
     * @returns {Promise<void>}
     */
    async initialize() {
        if (this.initialized) return;

        try {
            // Verify State is initialized
            if (!State.isInitialized()) {
                throw new Error('State must be initialized before DOM');
            }

            // Set initial DOM state
            State.set('dom_state', {
                lastUpdate: new Date(),
                observedElements: new Set(),
                mutations: []
            });

            this.initialized = true;
        } catch (error) {
            console.error('DOM initialization failed:', error);
            throw error;
        }
    }

    /**
     * Check if DOM utilities are initialized
     * @returns {boolean}
     */
    isInitialized() {
        return this.initialized;
    }

    /**
     * Create an element with attributes and properties
     * @param {string} tag - Element tag name
     * @param {Object} config - Element configuration
     * @returns {HTMLElement} Created element
     */
    createElement(tag, config = {}) {
        if (!this.initialized) {
            throw new Error('DOM utilities must be initialized before use');
        }

        try {
            const element = document.createElement(tag);

            // Set attributes
            if (config.attributes) {
                Object.entries(config.attributes).forEach(([key, value]) => {
                    if (value !== null && value !== undefined) {
                        element.setAttribute(key, value);
                    }
                });
            }

            // Set properties
            if (config.properties) {
                Object.entries(config.properties).forEach(([key, value]) => {
                    element[key] = value;
                });
            }

            // Add classes
            if (config.classes) {
                if (Array.isArray(config.classes)) {
                    element.classList.add(...config.classes);
                } else {
                    element.className = config.classes;
                }
            }


            // Set styles
            if (config.styles) {
                Object.entries(config.styles).forEach(([key, value]) => {
                    element.style[key] = value;
                });
            }


            // Add event listeners
            if (config.events) {
                Object.entries(config.events).forEach(([event, handler]) => {
                    element.addEventListener(event, handler);
                });
            }


            // Add content
            if (config.content) {
                if (typeof config.content === 'string') {
                    element.innerHTML = config.content;
                } else if (config.content instanceof Node) {
                    element.appendChild(config.content);
                } else if (Array.isArray(config.content)) {
                    config.content.forEach(child => {
                        if (typeof child === 'string') {
                            element.appendChild(document.createTextNode(child));
                        } else if (child instanceof Node) {
                            element.appendChild(child);
                        }
                    });
                }
            }


            // Add to element cache if ID is provided
            if (config.id) {
                this.elementCache.set(config.id, element);
            }


            return element;

        } catch (error) {
            console.error('Error creating element:', error);
            throw error;
        }
    }
    /**
     * Get element safely with error handling
     * @param {string} selector - Element selector
     * @param {HTMLElement|Document} [context=document] - Search context
     * @returns {HTMLElement|null} Found element or null
     */
    getElement(selector, context = document) {
        if (!this.initialized) {
            throw new Error('DOM utilities must be initialized before use');
        }

        try {
            // Check cache first
            if (this.elementCache.has(selector)) {
                const element = this.elementCache.get(selector);
                if (document.contains(element)) {
                    return element;
                }
                // Remove from cache if element no longer in document
                this.elementCache.delete(selector);
            }

            // Find element
            const element = context.querySelector(selector);
            if (element) {
                // Cache element if it has an ID
                const id = element.id || selector;
                if (id) {
                    this.elementCache.set(id, element);
                }
                return element;
            }
            return null;
        } catch (error) {
            console.error('Error getting element:', error);
            return null;
        }
    }

    /**
     * Get all elements matching selector safely
     * @param {string} selector - Element selector
     * @param {HTMLElement|Document} [context=document] - Search context
     * @returns {Array<HTMLElement>} Found elements
     */
    getElements(selector, context = document) {
        if (!this.initialized) {
            throw new Error('DOM utilities must be initialized before use');
        }

        try {
            return Array.from(context.querySelectorAll(selector));
        } catch (error) {
            console.error('Error getting elements:', error);
            return [];
        }
    }

    /**
     * Add multiple classes to an element
     * @param {HTMLElement} element - Target element
     * @param {string|Array} classes - Classes to add
     * @returns {HTMLElement} Updated element
     */
    addClasses(element, classes) {
        if (!this.initialized) {
            throw new Error('DOM utilities must be initialized before use');
        }

        try {
            if (Array.isArray(classes)) {
                element.classList.add(...classes);
            } else if (typeof classes === 'string') {
                element.classList.add(...classes.split(/\s+/));
            }
            return element;
        } catch (error) {
            console.error('Error adding classes:', error);
            return element;
        }
    }

    /**
     * Remove multiple classes from an element
     * @param {HTMLElement} element - Target element
     * @param {string|Array} classes - Classes to remove
     * @returns {HTMLElement} Updated element
     */
    removeClasses(element, classes) {
        if (!this.initialized) {
            throw new Error('DOM utilities must be initialized before use');
        }

        try {
            if (Array.isArray(classes)) {
                element.classList.remove(...classes);
            } else if (typeof classes === 'string') {
                element.classList.remove(...classes.split(/\s+/));
            }
            return element;
        } catch (error) {
            console.error('Error removing classes:', error);
            return element;
        }
    }

    /**
     * Set multiple attributes on an element
     * @param {HTMLElement} element - Target element
     * @param {Object} attributes - Attributes to set
     * @returns {HTMLElement} Updated element
     */
    setAttributes(element, attributes) {
        if (!this.initialized) {
            throw new Error('DOM utilities must be initialized before use');
        }

        try {
            Object.entries(attributes).forEach(([key, value]) => {
                if (value === null || value === undefined) {
                    element.removeAttribute(key);
                } else {
                    element.setAttribute(key, value);
                }
            });
            return element;
        } catch (error) {
            console.error('Error setting attributes:', error);
            return element;
        }
    }
    
    /**
     * Sets up focus trap for modal or dropdown
     * @param {HTMLElement} element - Container element
     * @returns {Function} Cleanup function
     */
    setupFocusTrap(element) {
        if (!this.initialized) {
            throw new Error('DOM utilities must be initialized before use');
        }

        const focusableElements = element.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );

        if (focusableElements.length === 0) return () => {};

        const firstFocusable = focusableElements[0];
        const lastFocusable = focusableElements[focusableElements.length - 1];

        const handler = (e) => {
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
        };

        element.addEventListener('keydown', handler);
        firstFocusable.focus();

        return () => element.removeEventListener('keydown', handler);
    }

    /**
     * Debounce function execution
     * @param {Function} func - Function to debounce
     * @param {number} wait - Wait time in milliseconds
     * @returns {Function} Debounced function
     */
    debounce(func, wait) {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }
    /**
     * Find parent element matching selector
     * @param {HTMLElement} element - Start element
     * @param {string} selector - Parent selector
     * @returns {HTMLElement|null} Matching parent or null
     */
    findParent(element, selector) {
        if (!this.initialized) {
            throw new Error('DOM utilities must be initialized before use');
        }

        try {
            let parent = element.parentElement;
            while (parent) {
                if (parent.matches(selector)) {
                    return parent;
                }
                parent = parent.parentElement;
            }
            return null;
        } catch (error) {
            console.error('Error finding parent:', error);
            return null;
        }
    }

    /**
     * Find previous sibling matching selector
     * @param {HTMLElement} element - Start element
     * @param {string} selector - Sibling selector
     * @returns {HTMLElement|null} Matching sibling or null
     */
    findPreviousSibling(element, selector) {
        if (!this.initialized) {
            throw new Error('DOM utilities must be initialized before use');
        }

        try {
            let sibling = element.previousElementSibling;
            while (sibling) {
                if (sibling.matches(selector)) {
                    return sibling;
                }
                sibling = sibling.previousElementSibling;
            }
            return null;
        } catch (error) {
            console.error('Error finding previous sibling:', error);
            return null;
        }
    }

    /**
     * Insert element relative to target
     * @param {HTMLElement} element - Element to insert
     * @param {HTMLElement} target - Target element
     * @param {string} position - Insert position (before, after, prepend, append)
     * @returns {HTMLElement} Inserted element
     */
    insertElement(element, target, position = 'append') {
        if (!this.initialized) {
            throw new Error('DOM utilities must be initialized before use');
        }

        try {
            switch (position) {
                case 'before':
                    target.parentNode.insertBefore(element, target);
                    break;
                case 'after':
                    target.parentNode.insertBefore(element, target.nextSibling);
                    break;
                case 'prepend':
                    target.insertBefore(element, target.firstChild);
                    break;
                case 'append':
                default:
                    target.appendChild(element);
                    break;
            }
            return element;
        } catch (error) {
            console.error('Error inserting element:', error);
            return element;
        }
    }

    /**
     * Remove element safely
     * @param {HTMLElement|string} element - Element or selector to remove
     * @returns {boolean} Success status
     */
    removeElement(element) {
        if (!this.initialized) {
            throw new Error('DOM utilities must be initialized before use');
        }

        try {
            const el = typeof element === 'string' ? this.getElement(element) : element;
            if (el && el.parentNode) {
                el.parentNode.removeChild(el);
                // Remove from cache if present
                this.elementCache.delete(el.id);
                return true;
            }
            return false;
        } catch (error) {
            console.error('Error removing element:', error);
            return false;
        }
    }
    /**
     * Show/hide loading state for an element
     * @param {HTMLElement} element - Target element
     * @param {boolean} loading - Loading state
     */
    setLoading(element, loading) {
        if (!this.initialized) {
            throw new Error('DOM utilities must be initialized before use');
        }

        try {
            if (loading) {
                const spinner = this.createElement('div', {
                    classes: ['w3-spin', 'loading-state'],
                    content: '<i class="bi bi-arrow-repeat"></i> Loading...'
                });
                this.insertElement(spinner, element, 'prepend');
                element.classList.add('w3-disabled');
            } else {
                const spinner = element.querySelector('.loading-state');
                if (spinner) {
                    spinner.remove();
                }
                element.classList.remove('w3-disabled');
            }
        } catch (error) {
            console.error('Error setting loading state:', error);
        }
    }

    /**
     * Animate element with transitions
     * @param {HTMLElement} element - Target element
     * @param {Object} properties - CSS properties to animate
     * @param {Object} options - Animation options
     * @returns {Promise} Animation completion promise
     */
    animate(element, properties, options = {}) {
        if (!this.initialized) {
            throw new Error('DOM utilities must be initialized before use');
        }

        return new Promise((resolve, reject) => {
            try {
                const config = {
                    duration: options.duration || 300,
                    easing: options.easing || 'ease',
                    delay: options.delay || 0,
                    ...options
                };

                // Store initial values
                const initialValues = {};
                Object.keys(properties).forEach(prop => {
                    initialValues[prop] = getComputedStyle(element)[prop];
                });

                // Set up transition
                element.style.transition = Object.keys(properties)
                    .map(prop => `${prop} ${config.duration}ms ${config.easing}`)
                    .join(', ');

                // Add transition end listener
                const handleTransitionEnd = (event) => {
                    if (event.target === element) {
                        element.removeEventListener('transitionend', handleTransitionEnd);
                        element.style.transition = '';
                        resolve();
                    }
                };
                element.addEventListener('transitionend', handleTransitionEnd);

                // Trigger animation
                requestAnimationFrame(() => {
                    Object.entries(properties).forEach(([prop, value]) => {
                        element.style[prop] = value;
                    });
                });

                // Timeout fallback
                setTimeout(() => {
                    element.removeEventListener('transitionend', handleTransitionEnd);
                    resolve();
                }, config.duration + config.delay + 50);

            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Fade element in or out
     * @param {HTMLElement} element - Target element
     * @param {string} type - Fade type ('in' or 'out')
     * @param {Object} options - Animation options
     * @returns {Promise} Animation completion promise
     */
    fade(element, type = 'in', options = {}) {
        if (!this.initialized) {
            throw new Error('DOM utilities must be initialized before use');
        }

        return this.animate(element, {
            opacity: type === 'in' ? '1' : '0'
        }, {
            duration: options.duration || 300,
            easing: options.easing || 'ease',
            delay: options.delay || 0,
            onComplete: () => {
                if (type === 'out' && options.remove) {
                    element.remove();
                }
            }
        });
    }

    /**
     * Clean up resources
     */
    cleanup() {
        if (!this.initialized) return;

        try {
            // Disconnect all observers
            this.mutationObservers.forEach(observer => observer.disconnect());
            this.intersectionObservers.forEach(observer => observer.disconnect());

            // Clear collections
            this.mutationObservers.clear();
            this.intersectionObservers.clear();
            this.elementCache.clear();

            // Reset state
            State.update('dom_state', {
                observedElements: new Set(),
                mutations: [],
                lastUpdate: new Date()
            });

            this.initialized = false;

        } catch (error) {
            console.error('Error during cleanup:', error);
        }
    }
}

// Export singleton instance
export const DOM = new DOMUtilities();