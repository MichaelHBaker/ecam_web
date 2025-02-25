// section-toggle.js
// Direct implementation for section toggling

// Self-executing function to avoid global scope pollution
(function() {
    // Function to initialize section toggle functionality
    function initSectionToggles() {
        console.log('Initializing section toggles');
        
        // Find all toggle buttons
        const toggleButtons = document.querySelectorAll('[data-action="toggle-section"]');
        console.log('Found toggle buttons:', toggleButtons.length);
        
        // Add click handlers to each button
        toggleButtons.forEach(button => {
            button.addEventListener('click', handleSectionToggle);
        });
    }
    
    // Handler for section toggle clicks
    function handleSectionToggle(e) {
        console.log('Section toggle clicked');
        e.preventDefault();
        
        const sectionName = this.getAttribute('data-section');
        if (!sectionName) return;
        
        const sectionContent = document.querySelector(`[data-content="${sectionName}"]`);
        if (!sectionContent) return;
        
        // Toggle visibility
        const isHidden = sectionContent.classList.contains('w3-hide');
        
        if (isHidden) {
            // Show section
            sectionContent.classList.remove('w3-hide');
            
            // Update icon
            const icon = this.querySelector('i');
            if (icon) {
                icon.classList.remove('bi-chevron-right');
                icon.classList.add('bi-chevron-down');
            }
        } else {
            // Hide section
            sectionContent.classList.add('w3-hide');
            
            // Update icon
            const icon = this.querySelector('i');
            if (icon) {
                icon.classList.remove('bi-chevron-down');
                icon.classList.add('bi-chevron-right');
            }
        }
    }
    
    // Initialize when DOM is loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSectionToggles);
    } else {
        initSectionToggles();
    }
})();