# CRUD.js Refactoring Plan

## Git Setup
```bash
# Create base refactoring branch
git checkout main
git checkout -b refactor-crud-js

# For each chat, create a feature branch
git checkout refactor-crud-js
git checkout -b refactor-crud-js-[feature]
```

## Chat Sessions

### Chat 1: Move Data Processing to Django
Branch: `refactor-crud-js-data`

Required Context Files:
- crud.js (DataTypeManager and FileManager sections)
- views.py (current data processing code)
- services.py (current data analysis code)
- serializers.py (DataImport related serializers)

Create/Modify:
- main/services/data_processing.py
- main/services/validation.py
- main/api/views/data.py
- main/static/main/js/api.js (partial)

Focus:
- Move validation logic to Django services
- Move file analysis to Django
- Move data type detection server-side
- Create DRF endpoints for these operations

### Chat 2: Core State Management
Branch: `refactor-crud-js-state`

Required Context Files:
- crud.js (CSRF_TOKEN, StateManager, apiFetch sections)
- templates/main/base.html (for CSRF setup)
- views.py (current state-related endpoints)

Create/Modify:
- main/static/main/js/state.js
- main/static/main/js/dom.js
- main/static/main/js/api.js (complete)

Focus:
- Simplify state management
- Remove redundant state tracking
- Create cleaner API interface
- Extract DOM utilities

### Chat 3: Import/Export Flow
Branch: `refactor-crud-js-import`

Required Context Files:
- crud.js (SourceManager, PreviewManager sections)
- views.py (create_data_import, get_data_import views)
- services.py (process_csv_import function)
- serializers.py (ImportBatchSerializer)

Create/Modify:
- main/static/main/js/import.js
- main/services/import_service.py
- main/api/views/import_views.py

Focus:
- Simplify import process
- Move preview generation to Django
- Clean up file handling
- Improve error handling

### Chat 4: UI Components
Branch: `refactor-crud-js-ui`

Required Context Files:
- crud.js (Modal management code, form handling code)
- templates/main/measurement.html
- templates/main/tree_item.html
- templates/main/base.html

Create/Modify:
- main/static/main/js/forms.js
- main/static/main/js/modals.js
- main/static/main/js/ui.js

Focus:
- Clean up modal management
- Improve form handling
- Extract UI utilities
- Standardize UI patterns

### Chat 5: CRUD Operations
Branch: `refactor-crud-js-operations`

Required Context Files:
- crud.js (addItem, updateItem, deleteItem, editItem functions)
- views.py (ViewSet CRUD operations)
- serializers.py (model serializers)
- templates/main/tree_item.html

Create/Modify:
- main/static/main/js/crud.js (final version)
- main/static/main/js/events.js

Focus:
- Simplify CRUD operations
- Improve error handling
- Clean up event handling
- Standardize API calls

### Chat 6: Integration
Branch: `refactor-crud-js-integration`

Required Context Files:
- All new JS files
- views.py
- services.py
- templates/main/*.html
- urls.py

Focus:
- Connect all components
- Final testing
- Documentation
- Clean up remaining issues

## File Structure After Refactoring
```
main/
├── services/
│   ├── data_processing.py
│   ├── validation.py
│   └── import_service.py
│
├── api/
│   └── views/
│       ├── data.py
│       └── import_views.py
│
└── static/main/js/
    ├── api.js      # API utilities
    ├── state.js    # State management
    ├── dom.js      # DOM utilities
    ├── forms.js    # Form handling
    ├── modals.js   # Modal management
    ├── ui.js       # UI utilities
    ├── import.js   # Import handling
    ├── events.js   # Event handling
    ├── crud.js     # CRUD operations
    └── main.js     # Main initialization
```

## Testing Strategy
Each chat includes:
1. Django unit tests for new services
2. API endpoint tests
3. JavaScript function tests
4. Integration tests where needed

## Git Workflow (Each Chat)

1. Create feature branch:
```bash
git checkout refactor-crud-js
git checkout -b refactor-crud-js-[feature]
```

2. Make changes and commit:
```bash
git add .
git commit -m "refactor(crud): [chat-number] - [description]

- Added files:
  [list]
- Modified files:
  [list]
- Moved functionality:
  [list]
"
```

3. Push changes:
```bash
git push origin refactor-crud-js-[feature]
```

4. Create PR to refactor-crud-js

## Final Integration

After all chats complete:
```bash
# Merge to refactor branch
git checkout refactor-crud-js
git merge --no-ff refactor-crud-js-integration

# Create PR to main
# After PR approval:
git checkout main
git merge --no-ff refactor-crud-js
```

## Cleanup
```bash
# Delete feature branches
git branch -d refactor-crud-js-data
git branch -d refactor-crud-js-state
git branch -d refactor-crud-js-import
git branch -d refactor-crud-js-ui
git branch -d refactor-crud-js-operations
git branch -d refactor-crud-js-integration
git branch -d refactor-crud-js

# Delete remote branches
git push origin --delete refactor-crud-js-data
git push origin --delete refactor-crud-js-state
git push origin --delete refactor-crud-js-import
git push origin --delete refactor-crud-js-ui
git push origin --delete refactor-crud-js-operations
git push origin --delete refactor-crud-js-integration
git push origin --delete refactor-crud-js
```