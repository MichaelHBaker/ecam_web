// base.js - Core initialization and base page functionality

import { State, DOM, Events, API, NotificationUI, StatusUI, Tree, Modal, Forms, CRUD } from './main.js';

/**
 * Initializes base page functionality
 */
async function initializeBasePage() {
    try {
        // First ensure Events is initialized before adding any event delegates
        await Events.initialize();
        
        // Add page type detection for page-specific initialization
        const pageType = document.body.getAttribute('data-page-type') || 'page';
        console.log(`Page type detected: ${pageType}`);
        
        // Listen for core initialization
        Events.addDelegate(document, 'core:initialized', 'body', () => {
            console.log('Core initialized, setting up global handlers');
               
            // Global error handling
            Events.addDelegate(window, 'error', 'body', (e, target) => {
                NotificationUI.show({
                    message: `Error: ${e.error?.message || e.message}`,
                    type: 'error',
                    duration: 5000
                });
            });

            // Unhandled promise rejection handling
            Events.addDelegate(window, 'unhandledrejection', 'body', (e, target) => {
                NotificationUI.show({
                    message: `Async Error: ${e.reason?.message || e.reason}`,
                    type: 'error',
                    duration: 5000
                });
            });

            // Online/offline status handling
            Events.addDelegate(window, 'online', 'body', () => {
                NotificationUI.show({
                    message: 'Connection restored',
                    type: 'success',
                    duration: 3000
                });
            });

            Events.addDelegate(window, 'offline', 'body', () => {
                NotificationUI.show({
                    message: 'Connection lost',
                    type: 'warning',
                    duration: 0,
                    closeable: true
                });
            });
            
            // Add navigation handling
            setupNavigation();
            
            // Trigger page-specific initialization
            console.log(`Triggering ${pageType}:ready event`);
            State.update('dashboard_state', {
                initialized: true,
                ready: true,  // Add a specific flag for the ready event
                lastUpdate: new Date()
            });
            Events.trigger(`${pageType}:ready`);
        });
        
    } catch (error) {
        console.error('Base initialization error:', error);
        // Simple alert as UI components might not be available
        alert(`Base initialization error: ${error.message}`);
    }
}

/**
 * Sets up navigation handling
 */
function setupNavigation() {
    // Handle navigation links
    Events.addDelegate(document, 'click', '[data-action="navigate"]', (e, target) => {
        const href = target.getAttribute('href');
        if (href && href !== '#') {
            // Add any navigation-specific logic here
            // For example, showing a loading indicator
            const isExternalLink = href.startsWith('http') || href.startsWith('//');
            
            if (!isExternalLink) {
                e.preventDefault();
                // Show loading state
                StatusUI.show('Loading...', { id: 'navigation' });
                
                // Navigate after a short delay to show loading state
                setTimeout(() => {
                    window.location.href = href;
                }, 100);
            }
        }
    });
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initializeBasePage);

// Export functions if needed elsewhere
export {
    initializeBasePage,
    setupNavigation
};