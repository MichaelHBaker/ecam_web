# Complete CRUD Refactoring Plan

## Overview

This plan details the complete refactoring of crud.js into a modern, maintainable codebase with proper separation of client/server concerns. Each chat session builds upon previous work following a clear progression.

## Git Strategy

### Branch Structure
```
main
└── refactor-crud
    ├── refactor-crud-core           (Chat 1)
    ├── refactor-crud-ui-preview     (Chat 2)
    ├── refactor-crud-ui-forms       (Chat 3)
    ├── refactor-crud-server-analysis (Chat 4)
    ├── refactor-crud-server-import   (Chat 5)
    ├── refactor-crud-integration-1   (Chat 6)
    ├── refactor-crud-integration-2   (Chat 7)
    └── refactor-crud-final          (Chat 8)
```

### Standard Git Workflow (Each Chat)
1. Create base branch if not exists:
```bash
git checkout main
git checkout -b refactor-crud
```

2. Create feature branch:
```bash
git checkout refactor-crud
git checkout -b refactor-crud-<feature>
```

3. Commit changes:
```bash
git add .
git commit -m "refactor(crud): <chat-number> - <description>

- Added files:
  - List new files
- Modified files:
  - List modified files
- Breaking changes:
  - List breaking changes
- Migration notes:
  - List migration steps
"
```

4. Push changes:
```bash
git push origin refactor-crud-<feature>
```

### Pull Request Milestones
- After Chat 3: UI Components Complete
- After Chat 5: Server Components Complete
- After Chat 8: Final Integration

## Chat Sessions

### Chat 1: Core Infrastructure & State

#### Git Setup
```bash
git checkout main
git checkout -b refactor-crud
git checkout -b refactor-crud-core
```

#### Required Context
```javascript
// From crud.js:

// CSRF Token setup
export const CSRF_TOKEN = document.querySelector('[name=csrfmiddlewaretoken]')?.value || '';

// Initialize state variables
let columnSelectionMenus = {};
let codeMirrorInstances = {};
let codeMirrorLoaded = false;
let MODEL_FIELDS = null;
let modelFieldsPromise = null;

// API fetch function
export const apiFetch = async (endpoint, options = {}, basePath = '/api') => {
    // ... entire function
}

// Central State Management
export const StateManager = {
    // ... entire object
}

// State initialization functions
const initializeColumnSelectionHandlers = () => {
    // ... entire function
}
const initializeColumnSelection = () => {
    // ... entire function
}
```

#### Deliverables
1. core/ directory structure
2. state.js implementation
3. api.js implementation
4. Unit tests

#### Files Created
- frontend/core/state.js
- frontend/core/api.js
- frontend/core/__tests__/

### Chat 2: UI Components Part 1 - Preview & Sources

#### Git Setup
```bash
git checkout refactor-crud
git checkout -b refactor-crud-ui-preview
```

#### Required Context
```javascript
// Preview Management
const PreviewManager = {
    // ... entire object
}

// Source Management
const SourceManager = {
    // ... entire object
}

// File Manager
export const FileManager = {
    // ... entire object
}

// API Manager
const ApiManager = {
    // ... entire object
}

// Database Manager
const DatabaseManager = {
    // ... entire object
}
```

#### Deliverables
1. components/ directory
2. Preview components
3. Source components
4. Tests for components

#### Files Created
- frontend/components/preview/
- frontend/components/sources/

### Chat 3: UI Components Part 2 - Forms & CRUD

#### Git Setup
```bash
git checkout refactor-crud
git checkout -b refactor-crud-ui-forms
```

#### Required Context
```javascript
// Measurement form functions
export const validateMeasurementForm = () => {
    // ... entire function
}
export const handleUnitChange = () => {
    // ... entire function
}
export const setupMeasurementHandlers = () => {
    // ... entire function
}

// CRUD operations
export const addItem = async () => {
    // ... entire function
}
export const updateItem = async () => {
    // ... entire function
}
export const deleteItem = async () => {
    // ... entire function
}
export const editItem = async () => {
    // ... entire function
}
export const cancelEdit = () => {
    // ... entire function
}

// Modal management
export const showMeasurementModal = () => {
    // ... entire function
}
export const hideMeasurementModal = () => {
    // ... entire function
}

// Utility functions
export const getFieldId = () => {
    // ... entire function
}
export const createField = () => {
    // ... entire function
}
export const collectFormData = () => {
    // ... entire function
}
```

#### Deliverables
1. Measurement components
2. CRUD components
3. Utility functions
4. Tests

#### Files Created
- frontend/components/measurements/
- frontend/components/crud/
- frontend/utils/

### Chat 4: Server-Side Views Part 1

#### Git Setup
```bash
git checkout refactor-crud
git checkout -b refactor-crud-server-analysis
```

#### Required Context
```javascript
// Data type detection
const DataTypeManager = {
    // ... entire object
}

// File analysis methods
const FileManager = {
    detectFileProperties: () => {
        // ... entire function
    },
    detectFileFormat: () => {
        // ... entire function
    },
    detectDelimiter: () => {
        // ... entire function
    },
    detectEncoding: () => {
        // ... entire function
    }
}
```

#### Deliverables
1. Django views for analysis
2. Basic services
3. Tests

#### Files Created
- backend/views/analysis_views.py
- backend/services/analysis_service.py
- backend/tests/

### Chat 5: Server-Side Views Part 2

#### Git Setup
```bash
git checkout refactor-crud
git checkout -b refactor-crud-server-import
```

#### Required Context
```javascript
// Import Configuration
export const ImportConfigManager = {
    // ... entire object
}

// Validation
const ValidationManager = {
    // ... entire object
}

// Dataset Management
const DatasetManager = {
    // ... entire object
}

// Mapping
const MappingManager = {
    // ... entire object
}
```

#### Deliverables
1. Import views
2. Validation views
3. Services
4. Tests

#### Files Created
- backend/views/import_views.py
- backend/views/validation_views.py
- backend/services/import_service.py
- backend/services/mapping_service.py

### Chat 6: Client-Server Integration Part 1

#### Git Setup
```bash
git checkout refactor-crud
git checkout -b refactor-crud-integration-1
```

#### Required Context
1. All code from Chat 1
2. Preview and Source components from Chat 2
3. Server endpoints from Chat 4

#### Deliverables
1. Updated API layer
2. Connected preview components
3. Connected source components
4. Integration tests

#### Files Modified
- frontend/core/api.js
- frontend/components/preview/*
- frontend/components/sources/*

### Chat 7: Client-Server Integration Part 2

#### Git Setup
```bash
git checkout refactor-crud
git checkout -b refactor-crud-integration-2
```

#### Required Context
1. All code from Chat 1
2. Form and CRUD components from Chat 3
3. Server endpoints from Chat 5

#### Deliverables
1. Connected measurement components
2. Connected CRUD components
3. Updated validation
4. Integration tests

#### Files Modified
- frontend/components/measurements/*
- frontend/components/crud/*
- frontend/utils/*

### Chat 8: Final Integration & Testing

#### Git Setup
```bash
git checkout refactor-crud
git checkout -b refactor-crud-final
```

#### Required Context
All code from previous chats

#### Deliverables
1. Final integration tests
2. Performance tests
3. Error handling
4. Documentation

#### Files Modified/Created
- Various
- docs/

## Final Steps

1. Review and merge feature branches:
```bash
# For each feature branch
git checkout refactor-crud
git merge --no-ff refactor-crud-<feature>
git push origin refactor-crud
```

2. Create final PR to main:
   - Complete test coverage report
   - Full migration guide
   - Breaking changes documentation

## Testing Strategy
Each chat includes:
1. Unit tests for new components
2. Integration tests for connected components
3. End-to-end tests for workflows
4. Performance tests for critical paths

## Documentation Strategy
Each chat includes:
1. API documentation updates
2. Component documentation
3. Migration guide updates
4. Usage examples

## Dependencies
- Chat 2 depends on Chat 1
- Chat 3 depends on Chat 1
- Chat 5 depends on Chat 4
- Chat 6 depends on Chats 1, 2, 4
- Chat 7 depends on Chats 1, 3, 5
- Chat 8 depends on all previous chats

## Branch Cleanup
After successful merge to main:
```bash
# Delete local feature branches
git branch -d refactor-crud-core
git branch -d refactor-crud-ui-preview
git branch -d refactor-crud-ui-forms
git branch -d refactor-crud-server-analysis
git branch -d refactor-crud-server-import
git branch -d refactor-crud-integration-1
git branch -d refactor-crud-integration-2
git branch -d refactor-crud-final
git branch -d refactor-crud

# Delete remote feature branches
git push origin --delete refactor-crud-core
git push origin --delete refactor-crud-ui-preview
git push origin --delete refactor-crud-ui-forms
git push origin --delete refactor-crud-server-analysis
git push origin --delete refactor-crud-server-import
git push origin --delete refactor-crud-integration-1
git push origin --delete refactor-crud-integration-2
git push origin --delete refactor-crud-final
git push origin --delete refactor-crud
```