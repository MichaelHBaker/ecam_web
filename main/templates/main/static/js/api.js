// CSRF Token for authenticated requests
export const CSRF_TOKEN = document.querySelector('[name=csrfmiddlewaretoken]').value;

// Generalized API fetch function
export const apiFetch = async (endpoint, options = {}, basePath = '/api') => {
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': CSRF_TOKEN,
        },
        credentials: 'same-origin',
    };

    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const apiEndpoint = `${basePath}${cleanEndpoint}`;

    const response = await fetch(apiEndpoint, {
        ...defaultOptions,
        ...options,
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `API Error: ${response.statusText}`);
    }

    return response.json();
};

// Generalized edit function
export const editItem = (type, id, fields) => {
    fields.forEach((field) => {
        const element = document.getElementById(`id_${type}${field.charAt(0).toUpperCase() + field.slice(1)}-${id}`);
        if (!element) {
            console.warn(`Element not found: id_${type}${field.charAt(0).toUpperCase() + field.slice(1)}-${id}`);
            return;
        }

        if (element.tagName === 'SPAN') {
            element.dataset.originalValue = element.textContent.trim();
            element.contentEditable = "true";
        } else {
            element.dataset.originalValue = element.value.trim();
            element.style.display = "inline";
        }
    });

    const editControls = document.getElementById(`id_${type}EditControls-${id}`);
    if (editControls) {
        editControls.style.display = "inline-block";
    } else {
        console.error(`Edit controls not found: id_${type}EditControls-${id}`);
    }
};

// Generalized cancel edit function
export const cancelEdit = (type, id, fields) => {
    fields.forEach((field) => {
        const element = document.getElementById(`id_${type}${field.charAt(0).toUpperCase() + field.slice(1)}-${id}`);
        if (!element) {
            console.warn(`Element not found: id_${type}${field.charAt(0).toUpperCase() + field.slice(1)}-${id}`);
            return;
        }

        if (element.tagName === 'SPAN') {
            element.contentEditable = "false";
            element.textContent = element.dataset.originalValue || element.textContent;
        } else {
            element.value = element.dataset.originalValue || element.value;
            element.style.display = "none";
        }
    });

    const editControls = document.getElementById(`id_${type}EditControls-${id}`);
    if (editControls) {
        editControls.style.display = "none";
    }
};

// Generalized update function
export const updateItem = async (type, id, fields) => {
    const updatedData = {};

    fields.forEach((field) => {
        const element = document.getElementById(`id_${type}${field.charAt(0).toUpperCase() + field.slice(1)}-${id}`);
        if (!element) {
            console.warn(`Element not found: id_${type}${field.charAt(0).toUpperCase() + field.slice(1)}-${id}`);
            return;
        }

        if (element.tagName === 'SPAN') {
            updatedData[field] = element.textContent.trim();
        } else {
            updatedData[field] = element.value.trim();
        }
    });

    try {
        const response = await apiFetch(`/${type}s/${id}/`, {
            method: 'PATCH',
            body: JSON.stringify(updatedData),
        });

        fields.forEach((field) => {
            const element = document.getElementById(`id_${type}${field.charAt(0).toUpperCase() + field.slice(1)}-${id}`);
            if (element) {
                if (element.tagName === 'SPAN') {
                    element.textContent = response[field];
                } else {
                    element.value = response[field];
                    element.style.display = "none";
                }
            }
        });

        const editControls = document.getElementById(`id_${type}EditControls-${id}`);
        if (editControls) {
            editControls.style.display = "none";
        }
    } catch (error) {
        console.error(`Error updating ${type}:`, error);
        alert(`Failed to update ${type}. Please try again.`);
    }
};

// Generalized delete function
export const deleteItem = async (type, id) => {
    if (!confirm(`Are you sure you want to delete this ${type}?`)) {
        return;
    }

    try {
        await apiFetch(`/${type}s/${id}/`, {
            method: 'DELETE',
        });

        const itemElement = document.getElementById(`id_${type}Item-${id}`);
        if (itemElement) {
            itemElement.remove();
        }

        alert(`${type.charAt(0).toUpperCase() + type.slice(1)} deleted successfully.`);
    } catch (error) {
        console.error(`Error deleting ${type}:`, error);
        alert(`Failed to delete ${type}. Please try again.`);
    }
};
