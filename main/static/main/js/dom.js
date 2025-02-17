// dom.js
// Enhanced DOM manipulation utilities

import { State } from './state.js';

const DOM_STATE_KEY = 'dom_state';

/**
 * DOM Utilities for element creation and manipulation
 */
class DOMUtilities {
    constructor() {
        this.elementCache = new Map();
        this.mutationObservers = new Map();
        this.intersectionObservers = new Map();
        
        // Initialize DOM state
        State.set(DOM_STATE_KEY, {
            lastUpdate: new Date(),
            observedElements: new Set(),
            mutations: []
        });
    }

    /**
     * Create an element with attributes and properties
     * @param {string} tag - Element tag name
     * @param {Object} config - Element configuration
     * @returns {HTMLElement} Created element
     */
    createElement(tag, config = {}) {
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

            // Set data attributes
            if (config.dataset) {
                Object.entries(config.dataset).forEach(([key, value]) => {
                    element.dataset[key] = value;
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
        try {
            return Array.from(context.querySelectorAll(selector));
        } catch (error) {
            console.error('Error getting elements:', error);
            return [];
        }
    }

    /**
     * Set multiple attributes on an element
     * @param {HTMLElement} element - Target element
     * @param {Object} attributes - Attributes to set
     * @returns {HTMLElement} Updated element
     */
    setAttributes(element, attributes) {
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
     * Set multiple styles on an element
     * @param {HTMLElement} element - Target element
     * @param {Object} styles - Styles to set
     * @returns {HTMLElement} Updated element
     */
    setStyles(element, styles) {
        try {
            Object.entries(styles).forEach(([key, value]) => {
                element.style[key] = value;
            });
            return element;
        } catch (error) {
            console.error('Error setting styles:', error);
            return element;
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
     * Empty an element's contents
     * @param {HTMLElement|string} element - Element or selector to empty
     * @returns {boolean} Success status
     */
    emptyElement(element) {
        try {
            const el = typeof element === 'string' ? this.getElement(element) : element;
            if (el) {
                while (el.firstChild) {
                    el.removeChild(el.firstChild);
                }
                return true;
            }
            return false;
        } catch (error) {
            console.error('Error emptying element:', error);
            return false;
        }
    }

// dom.js - Part 2
// Class manipulation, event handling, and traversal

    /**
     * Add multiple classes to an element
     * @param {HTMLElement} element - Target element
     * @param {string|Array} classes - Classes to add
     * @returns {HTMLElement} Updated element
     */
    addClasses(element, classes) {
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
     * Toggle multiple classes on an element
     * @param {HTMLElement} element - Target element
     * @param {Object} classMap - Classes to toggle with boolean values
     * @returns {HTMLElement} Updated element
     */
    toggleClasses(element, classMap) {
        try {
            Object.entries(classMap).forEach(([className, force]) => {
                element.classList.toggle(className, force);
            });
            return element;
        } catch (error) {
            console.error('Error toggling classes:', error);
            return element;
        }
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
        try {
            const listener = (event) => {
                const target = event.target.closest(selector);
                if (target) {
                    handler.call(target, event, target);
                }
            };

            context.addEventListener(eventType, listener, options);

            // Store in state for tracking
            State.update(DOM_STATE_KEY, {
                eventDelegates: [
                    ...(State.get(DOM_STATE_KEY)?.eventDelegates || []),
                    {
                        context: context === document ? 'document' : context.id || 'unknown',
                        eventType,
                        selector,
                        timestamp: new Date()
                    }
                ]
            });

            // Return remove function
            return () => {
                context.removeEventListener(eventType, listener, options);
                // Update state when removed
                const currentDelegates = State.get(DOM_STATE_KEY)?.eventDelegates || [];
                State.update(DOM_STATE_KEY, {
                    eventDelegates: currentDelegates.filter(d => 
                        d.context !== (context === document ? 'document' : context.id) ||
                        d.eventType !== eventType ||
                        d.selector !== selector
                    )
                });
            };
        } catch (error) {
            console.error('Error adding delegate:', error);
            return () => {}; // Return no-op function
        }
    }

    /**
     * Find parent element matching selector
     * @param {HTMLElement} element - Start element
     * @param {string} selector - Parent selector
     * @returns {HTMLElement|null} Matching parent or null
     */
    findParent(element, selector) {
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
     * Find all parent elements matching selector
     * @param {HTMLElement} element - Start element
     * @param {string} selector - Parent selector
     * @returns {Array<HTMLElement>} Matching parents
     */
    findParents(element, selector) {
        try {
            const parents = [];
            let parent = element.parentElement;
            while (parent) {
                if (parent.matches(selector)) {
                    parents.push(parent);
                }
                parent = parent.parentElement;
            }
            return parents;
        } catch (error) {
            console.error('Error finding parents:', error);
            return [];
        }
    }

    /**
     * Find previous sibling matching selector
     * @param {HTMLElement} element - Start element
     * @param {string} selector - Sibling selector
     * @returns {HTMLElement|null} Matching sibling or null
     */
    findPreviousSibling(element, selector) {
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
     * Find next sibling matching selector
     * @param {HTMLElement} element - Start element
     * @param {string} selector - Sibling selector
     * @returns {HTMLElement|null} Matching sibling or null
     */
    findNextSibling(element, selector) {
        try {
            let sibling = element.nextElementSibling;
            while (sibling) {
                if (sibling.matches(selector)) {
                    return sibling;
                }
                sibling = sibling.nextElementSibling;
            }
            return null;
        } catch (error) {
            console.error('Error finding next sibling:', error);
            return null;
        }
    }

    /**
     * Find all siblings matching selector
     * @param {HTMLElement} element - Start element
     * @param {string} selector - Sibling selector
     * @returns {Array<HTMLElement>} Matching siblings
     */
    findSiblings(element, selector) {
        try {
            const siblings = [];
            let sibling = element.parentElement?.firstElementChild;
            while (sibling) {
                if (sibling !== element && sibling.matches(selector)) {
                    siblings.push(sibling);
                }
                sibling = sibling.nextElementSibling;
            }
            return siblings;
        } catch (error) {
            console.error('Error finding siblings:', error);
            return [];
        }
    }

    /**
     * Find closest ancestor matching selector or self
     * @param {HTMLElement} element - Start element
     * @param {string} selector - Ancestor selector
     * @returns {HTMLElement|null} Matching ancestor or null
     */
    findClosest(element, selector) {
        try {
            return element.closest(selector);
        } catch (error) {
            console.error('Error finding closest:', error);
            return null;
        }
    }

    /**
     * Find all children matching selector
     * @param {HTMLElement} element - Parent element
     * @param {string} selector - Child selector
     * @returns {Array<HTMLElement>} Matching children
     */
    findChildren(element, selector) {
        try {
            return Array.from(element.children).filter(child => 
                child.matches(selector)
            );
        } catch (error) {
            console.error('Error finding children:', error);
            return [];
        }
    }
// dom.js - Part 3
// Animation utilities, mutation observers, and cleanup

    /**
     * Animate element with transitions
     * @param {HTMLElement} element - Target element
     * @param {Object} properties - CSS properties to animate
     * @param {Object} options - Animation options
     * @returns {Promise} Animation completion promise
     */
    animate(element, properties, options = {}) {
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

                // Handle animation timeout
                setTimeout(() => {
                    element.removeEventListener('transitionend', handleTransitionEnd);
                    resolve();
                }, config.duration + config.delay + 50);

            } catch (error) {
                console.error('Animation error:', error);
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
     * Slide element up or down
     * @param {HTMLElement} element - Target element
     * @param {string} type - Slide type ('up' or 'down')
     * @param {Object} options - Animation options
     * @returns {Promise} Animation completion promise
     */
    slide(element, type = 'down', options = {}) {
        const isSlideDown = type === 'down';
        
        // Store original height
        const originalHeight = element.scrollHeight + 'px';
        element.style.overflow = 'hidden';
        
        if (isSlideDown) {
            element.style.height = '0';
            element.style.opacity = '0';
        }

        return this.animate(element, {
            height: isSlideDown ? originalHeight : '0',
            opacity: isSlideDown ? '1' : '0'
        }, {
            duration: options.duration || 300,
            easing: options.easing || 'ease-in-out',
            delay: options.delay || 0,
            onComplete: () => {
                if (!isSlideDown && options.remove) {
                    element.remove();
                } else {
                    element.style.height = '';
                    element.style.overflow = '';
                }
            }
        });
    }

    /**
     * Observe DOM mutations on an element
     * @param {HTMLElement} element - Element to observe
     * @param {Object} config - Observer configuration
     * @param {Function} callback - Mutation callback
     * @returns {MutationObserver} Observer instance
     */
    observeMutations(element, config = {}, callback) {
        try {
            const observer = new MutationObserver((mutations) => {
                callback(mutations);
                
                // Update state with mutation info
                State.update(DOM_STATE_KEY, {
                    mutations: [
                        ...(State.get(DOM_STATE_KEY)?.mutations || []).slice(-9),
                        {
                            element: element.id || 'unknown',
                            type: mutations[0]?.type || 'unknown',
                            timestamp: new Date()
                        }
                    ]
                });
            });

            const observerConfig = {
                attributes: true,
                childList: true,
                subtree: true,
                ...config
            };

            observer.observe(element, observerConfig);
            this.mutationObservers.set(element, observer);

            // Update state
            State.update(DOM_STATE_KEY, {
                observedElements: new Set([
                    ...(State.get(DOM_STATE_KEY)?.observedElements || []),
                    element.id || 'unknown'
                ])
            });

            return observer;
        } catch (error) {
            console.error('Error setting up mutation observer:', error);
            return null;
        }
    }

    /**
     * Observe element intersection with viewport
     * @param {HTMLElement} element - Element to observe
     * @param {Function} callback - Intersection callback
     * @param {Object} options - Observer options
     * @returns {IntersectionObserver} Observer instance
     */
    observeIntersection(element, callback, options = {}) {
        try {
            const observer = new IntersectionObserver((entries) => {
                callback(entries[0]);
            }, options);

            observer.observe(element);
            this.intersectionObservers.set(element, observer);

            return observer;
        } catch (error) {
            console.error('Error setting up intersection observer:', error);
            return null;
        }
    }

    /**
     * Stop observing mutations on an element
     * @param {HTMLElement} element - Element to stop observing
     */
    stopObserving(element) {
        try {
            // Disconnect mutation observer
            const mutationObserver = this.mutationObservers.get(element);
            if (mutationObserver) {
                mutationObserver.disconnect();
                this.mutationObservers.delete(element);
            }

            // Disconnect intersection observer
            const intersectionObserver = this.intersectionObservers.get(element);
            if (intersectionObserver) {
                intersectionObserver.disconnect();
                this.intersectionObservers.delete(element);
            }

            // Update state
            const observedElements = State.get(DOM_STATE_KEY)?.observedElements || new Set();
            observedElements.delete(element.id || 'unknown');
            State.update(DOM_STATE_KEY, { observedElements });

        } catch (error) {
            console.error('Error stopping observers:', error);
        }
    }

    /**
     * Clean up all resources
     */
    cleanup() {
        try {
            // Disconnect all observers
            this.mutationObservers.forEach(observer => observer.disconnect());
            this.intersectionObservers.forEach(observer => observer.disconnect());

            // Clear collections
            this.mutationObservers.clear();
            this.intersectionObservers.clear();
            this.elementCache.clear();

            // Reset state
            State.update(DOM_STATE_KEY, {
                observedElements: new Set(),
                mutations: [],
                lastUpdate: new Date()
            });

        } catch (error) {
            console.error('Error during cleanup:', error);
        }
    }
}

// Export singleton instance
export const DOM = new DOMUtilities();