// login.js - Login page specific functionality

import { State, DOM, Events, API, NotificationUI, StatusUI } from '../main.js';

/**
 * Login page manager
 */
class LoginManager {
    constructor() {
        this.initialized = false;
        this.form = null;
    }

    /**
     * Initialize login page
     */
    async initialize() {
        if (this.initialized) return this;

        console.log('Login page initialization started');
        
        try {
            // Find login form
            this.form = document.getElementById('loginForm');
            
            if (!this.form) {
                console.warn('Login form not found');
                return this;
            }
            
            // Set up event listeners
            this.setupEventListeners();
            
            this.initialized = true;
            console.log('Login page initialization complete');
            return this;
            
        } catch (error) {
            console.error('Login initialization error:', error);
            NotificationUI.show({
                message: `Login initialization error: ${error.message}`,
                type: 'error',
                duration: 5000
            });
            throw error;
        }
    }

    /**
     * Set up login event listeners
     */
    setupEventListeners() {
        // Handle form submission
        Events.addDelegate(this.form, 'submit', null, this.handleSubmit.bind(this));
    }

    /**
     * Handle login form submission
     */
    async handleSubmit(e, target) {
        e.preventDefault();
        const submitButton = this.form.querySelector('button[type="submit"]');
        
        try {
            // Show loading state
            submitButton.disabled = true;
            submitButton.innerHTML = '<i class="bi bi-arrow-repeat w3-spin"></i> Logging in...';

            const formData = new FormData(this.form);
            const response = await fetch(this.form.action, {
                method: 'POST',
                body: formData,
                headers: {
                    'X-CSRFToken': formData.get('csrfmiddlewaretoken')
                }
            });

            if (response.ok) {
                // Reset button BEFORE navigation
                submitButton.disabled = false;
                submitButton.textContent = 'Login';
                
                // THEN redirect
                window.location.href = '/dashboard/';
            } else {
                throw new Error('Invalid credentials');
            }

        } catch (error) {
            console.error('Login error:', error);
            // Show error message using NotificationUI
            NotificationUI.show({
                message: error.message || 'Login failed. Please try again.',
                type: 'error',
                duration: 5000
            });
            
            // Reset button state
            submitButton.disabled = false;
            submitButton.textContent = 'Login';
        }
    }
}

// Create login instance
const login = new LoginManager();

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM content loaded, setting up login page');
    
    // Initialize login
    login.initialize().catch(error => {
        console.error('Failed to initialize login page:', error);
    });
    
    // Also trigger login:ready event for backward compatibility
    document.dispatchEvent(new CustomEvent('login:ready'));
});

// Export login instance
export default login;