# ecam_web Project Documentation

    
    ## Core Architectural Concepts

    This application is built on the following key architectural principles:

    ### Reactive Programming
    - **Observable/Subscription Pattern**: State changes propagate through the application via a subscription model
    - **Event-driven Architecture**: Components communicate primarily through events rather than direct coupling

    ### Progressive Loading
    - **Lazy Loading**: Data and UI components load on-demand to optimize performance
    - **Client-side Rendering**: UI updates happen client-side to minimize server round-trips

    ### State Management
    - **Centralized State**: Application state is managed through dedicated state containers
    - **Unidirectional Data Flow**: State changes follow a predictable pattern through the application

    These patterns are fundamental to understanding the application structure and should be considered when
    modifying any component.
    

    ## Overview
    - **Generated:** 2025-02-18T23:22:27.823292
    - **Version:** 1.0

    ## Project Summary
- **Python Files:** 40
- **JavaScript Files:** 0
- **HTML Files:** 3
- **Django Models:** 16
- **Django Views:** 23
- **URL Patterns:** 10
- **JS Components:** 40
- **Model Relationships:** 16
- **Frontend-Backend Connections:** 0



## Project Structure
```
ecam_web/ (5py, 0js, 0html)
main/ (8py, 0js, 0html)
    main\api\views/ (2py, 0js, 0html)
  main\management/ (1py, 0js, 0html)
    main\management\commands/ (2py, 0js, 0html)
  main\migrations/ (2py, 0js, 0html)
  main\services/ (4py, 0js, 0html)
  main\sources/ (2py, 0js, 0html)
  main\templates/ (0py, 0js, 1html)
    main\templates\main/ (0py, 0js, 2html)
  main\tests/ (3py, 0js, 0html)
    main\tests\test_api/ (4py, 0js, 0html)
    main\tests\test_models/ (4py, 0js, 0html)
    main\tests\test_views/ (3py, 0js, 0html)
```

## Backend Components
### Django Models
#### ProjectAccess - *main\models.py*
Relationships:
- **project** (ForeignKey) - Required
- **user** (ForeignKey) - Required
- **granted_by** (ForeignKey) - Optional
- **category** (ForeignKey) - Required
- **type** (ForeignKey) - Required
- **project** (ForeignKey) - Required
- **location** (ForeignKey) - Required
- **type** (ForeignKey) - Required
- **unit** (ForeignKey) - Required
- **owner** (ForeignKey) - Required
- **created_by** (ForeignKey) - Optional
- **project** (ForeignKey) - Required
- **data_source** (ForeignKey) - Required
- **location** (ForeignKey) - Required
- **data_source** (ForeignKey) - Required
- **created_by** (ForeignKey) - Optional
- **dataset** (ForeignKey) - Required
- **source_column** (ForeignKey) - Required
- **measurement** (ForeignKey) - Required
- **dataset** (ForeignKey) - Required
- **created_by** (ForeignKey) - Optional
- **approved_by** (ForeignKey) - Optional
- **data_import** (ForeignKey) - Required
- **measurement** (ForeignKey) - Required
- **dataset** (ForeignKey) - Required
- **copied_from** (ForeignKey) - Optional
- **from_user** (ForeignKey) - Required
- **to_user** (ForeignKey) - Required
- **measurement** (ForeignKey) - Required
- **granted_by** (ForeignKey) - Required

#### MeasurementCategory - *main\models.py*
Relationships:
- **project** (ForeignKey) - Required
- **user** (ForeignKey) - Required
- **granted_by** (ForeignKey) - Optional
- **category** (ForeignKey) - Required
- **type** (ForeignKey) - Required
- **project** (ForeignKey) - Required
- **location** (ForeignKey) - Required
- **type** (ForeignKey) - Required
- **unit** (ForeignKey) - Required
- **owner** (ForeignKey) - Required
- **created_by** (ForeignKey) - Optional
- **project** (ForeignKey) - Required
- **data_source** (ForeignKey) - Required
- **location** (ForeignKey) - Required
- **data_source** (ForeignKey) - Required
- **created_by** (ForeignKey) - Optional
- **dataset** (ForeignKey) - Required
- **source_column** (ForeignKey) - Required
- **measurement** (ForeignKey) - Required
- **dataset** (ForeignKey) - Required
- **created_by** (ForeignKey) - Optional
- **approved_by** (ForeignKey) - Optional
- **data_import** (ForeignKey) - Required
- **measurement** (ForeignKey) - Required
- **dataset** (ForeignKey) - Required
- **copied_from** (ForeignKey) - Optional
- **from_user** (ForeignKey) - Required
- **to_user** (ForeignKey) - Required
- **measurement** (ForeignKey) - Required
- **granted_by** (ForeignKey) - Required

#### MeasurementType - *main\models.py*
Relationships:
- **project** (ForeignKey) - Required
- **user** (ForeignKey) - Required
- **granted_by** (ForeignKey) - Optional
- **category** (ForeignKey) - Required
- **type** (ForeignKey) - Required
- **project** (ForeignKey) - Required
- **location** (ForeignKey) - Required
- **type** (ForeignKey) - Required
- **unit** (ForeignKey) - Required
- **owner** (ForeignKey) - Required
- **created_by** (ForeignKey) - Optional
- **project** (ForeignKey) - Required
- **data_source** (ForeignKey) - Required
- **location** (ForeignKey) - Required
- **data_source** (ForeignKey) - Required
- **created_by** (ForeignKey) - Optional
- **dataset** (ForeignKey) - Required
- **source_column** (ForeignKey) - Required
- **measurement** (ForeignKey) - Required
- **dataset** (ForeignKey) - Required
- **created_by** (ForeignKey) - Optional
- **approved_by** (ForeignKey) - Optional
- **data_import** (ForeignKey) - Required
- **measurement** (ForeignKey) - Required
- **dataset** (ForeignKey) - Required
- **copied_from** (ForeignKey) - Optional
- **from_user** (ForeignKey) - Required
- **to_user** (ForeignKey) - Required
- **measurement** (ForeignKey) - Required
- **granted_by** (ForeignKey) - Required

#### MeasurementUnit - *main\models.py*
Relationships:
- **project** (ForeignKey) - Required
- **user** (ForeignKey) - Required
- **granted_by** (ForeignKey) - Optional
- **category** (ForeignKey) - Required
- **type** (ForeignKey) - Required
- **project** (ForeignKey) - Required
- **location** (ForeignKey) - Required
- **type** (ForeignKey) - Required
- **unit** (ForeignKey) - Required
- **owner** (ForeignKey) - Required
- **created_by** (ForeignKey) - Optional
- **project** (ForeignKey) - Required
- **data_source** (ForeignKey) - Required
- **location** (ForeignKey) - Required
- **data_source** (ForeignKey) - Required
- **created_by** (ForeignKey) - Optional
- **dataset** (ForeignKey) - Required
- **source_column** (ForeignKey) - Required
- **measurement** (ForeignKey) - Required
- **dataset** (ForeignKey) - Required
- **created_by** (ForeignKey) - Optional
- **approved_by** (ForeignKey) - Optional
- **data_import** (ForeignKey) - Required
- **measurement** (ForeignKey) - Required
- **dataset** (ForeignKey) - Required
- **copied_from** (ForeignKey) - Optional
- **from_user** (ForeignKey) - Required
- **to_user** (ForeignKey) - Required
- **measurement** (ForeignKey) - Required
- **granted_by** (ForeignKey) - Required

#### Location - *main\models.py*
Relationships:
- **project** (ForeignKey) - Required
- **user** (ForeignKey) - Required
- **granted_by** (ForeignKey) - Optional
- **category** (ForeignKey) - Required
- **type** (ForeignKey) - Required
- **project** (ForeignKey) - Required
- **location** (ForeignKey) - Required
- **type** (ForeignKey) - Required
- **unit** (ForeignKey) - Required
- **owner** (ForeignKey) - Required
- **created_by** (ForeignKey) - Optional
- **project** (ForeignKey) - Required
- **data_source** (ForeignKey) - Required
- **location** (ForeignKey) - Required
- **data_source** (ForeignKey) - Required
- **created_by** (ForeignKey) - Optional
- **dataset** (ForeignKey) - Required
- **source_column** (ForeignKey) - Required
- **measurement** (ForeignKey) - Required
- **dataset** (ForeignKey) - Required
- **created_by** (ForeignKey) - Optional
- **approved_by** (ForeignKey) - Optional
- **data_import** (ForeignKey) - Required
- **measurement** (ForeignKey) - Required
- **dataset** (ForeignKey) - Required
- **copied_from** (ForeignKey) - Optional
- **from_user** (ForeignKey) - Required
- **to_user** (ForeignKey) - Required
- **measurement** (ForeignKey) - Required
- **granted_by** (ForeignKey) - Required

#### Measurement - *main\models.py*
Relationships:
- **project** (ForeignKey) - Required
- **user** (ForeignKey) - Required
- **granted_by** (ForeignKey) - Optional
- **category** (ForeignKey) - Required
- **type** (ForeignKey) - Required
- **project** (ForeignKey) - Required
- **location** (ForeignKey) - Required
- **type** (ForeignKey) - Required
- **unit** (ForeignKey) - Required
- **owner** (ForeignKey) - Required
- **created_by** (ForeignKey) - Optional
- **project** (ForeignKey) - Required
- **data_source** (ForeignKey) - Required
- **location** (ForeignKey) - Required
- **data_source** (ForeignKey) - Required
- **created_by** (ForeignKey) - Optional
- **dataset** (ForeignKey) - Required
- **source_column** (ForeignKey) - Required
- **measurement** (ForeignKey) - Required
- **dataset** (ForeignKey) - Required
- **created_by** (ForeignKey) - Optional
- **approved_by** (ForeignKey) - Optional
- **data_import** (ForeignKey) - Required
- **measurement** (ForeignKey) - Required
- **dataset** (ForeignKey) - Required
- **copied_from** (ForeignKey) - Optional
- **from_user** (ForeignKey) - Required
- **to_user** (ForeignKey) - Required
- **measurement** (ForeignKey) - Required
- **granted_by** (ForeignKey) - Required

#### Project - *main\models.py*
Relationships:
- **project** (ForeignKey) - Required
- **user** (ForeignKey) - Required
- **granted_by** (ForeignKey) - Optional
- **category** (ForeignKey) - Required
- **type** (ForeignKey) - Required
- **project** (ForeignKey) - Required
- **location** (ForeignKey) - Required
- **type** (ForeignKey) - Required
- **unit** (ForeignKey) - Required
- **owner** (ForeignKey) - Required
- **created_by** (ForeignKey) - Optional
- **project** (ForeignKey) - Required
- **data_source** (ForeignKey) - Required
- **location** (ForeignKey) - Required
- **data_source** (ForeignKey) - Required
- **created_by** (ForeignKey) - Optional
- **dataset** (ForeignKey) - Required
- **source_column** (ForeignKey) - Required
- **measurement** (ForeignKey) - Required
- **dataset** (ForeignKey) - Required
- **created_by** (ForeignKey) - Optional
- **approved_by** (ForeignKey) - Optional
- **data_import** (ForeignKey) - Required
- **measurement** (ForeignKey) - Required
- **dataset** (ForeignKey) - Required
- **copied_from** (ForeignKey) - Optional
- **from_user** (ForeignKey) - Required
- **to_user** (ForeignKey) - Required
- **measurement** (ForeignKey) - Required
- **granted_by** (ForeignKey) - Required

#### DataSource - *main\models.py*
Relationships:
- **project** (ForeignKey) - Required
- **user** (ForeignKey) - Required
- **granted_by** (ForeignKey) - Optional
- **category** (ForeignKey) - Required
- **type** (ForeignKey) - Required
- **project** (ForeignKey) - Required
- **location** (ForeignKey) - Required
- **type** (ForeignKey) - Required
- **unit** (ForeignKey) - Required
- **owner** (ForeignKey) - Required
- **created_by** (ForeignKey) - Optional
- **project** (ForeignKey) - Required
- **data_source** (ForeignKey) - Required
- **location** (ForeignKey) - Required
- **data_source** (ForeignKey) - Required
- **created_by** (ForeignKey) - Optional
- **dataset** (ForeignKey) - Required
- **source_column** (ForeignKey) - Required
- **measurement** (ForeignKey) - Required
- **dataset** (ForeignKey) - Required
- **created_by** (ForeignKey) - Optional
- **approved_by** (ForeignKey) - Optional
- **data_import** (ForeignKey) - Required
- **measurement** (ForeignKey) - Required
- **dataset** (ForeignKey) - Required
- **copied_from** (ForeignKey) - Optional
- **from_user** (ForeignKey) - Required
- **to_user** (ForeignKey) - Required
- **measurement** (ForeignKey) - Required
- **granted_by** (ForeignKey) - Required

#### DataSourceLocation - *main\models.py*
Relationships:
- **project** (ForeignKey) - Required
- **user** (ForeignKey) - Required
- **granted_by** (ForeignKey) - Optional
- **category** (ForeignKey) - Required
- **type** (ForeignKey) - Required
- **project** (ForeignKey) - Required
- **location** (ForeignKey) - Required
- **type** (ForeignKey) - Required
- **unit** (ForeignKey) - Required
- **owner** (ForeignKey) - Required
- **created_by** (ForeignKey) - Optional
- **project** (ForeignKey) - Required
- **data_source** (ForeignKey) - Required
- **location** (ForeignKey) - Required
- **data_source** (ForeignKey) - Required
- **created_by** (ForeignKey) - Optional
- **dataset** (ForeignKey) - Required
- **source_column** (ForeignKey) - Required
- **measurement** (ForeignKey) - Required
- **dataset** (ForeignKey) - Required
- **created_by** (ForeignKey) - Optional
- **approved_by** (ForeignKey) - Optional
- **data_import** (ForeignKey) - Required
- **measurement** (ForeignKey) - Required
- **dataset** (ForeignKey) - Required
- **copied_from** (ForeignKey) - Optional
- **from_user** (ForeignKey) - Required
- **to_user** (ForeignKey) - Required
- **measurement** (ForeignKey) - Required
- **granted_by** (ForeignKey) - Required

#### Dataset - *main\models.py*
Relationships:
- **project** (ForeignKey) - Required
- **user** (ForeignKey) - Required
- **granted_by** (ForeignKey) - Optional
- **category** (ForeignKey) - Required
- **type** (ForeignKey) - Required
- **project** (ForeignKey) - Required
- **location** (ForeignKey) - Required
- **type** (ForeignKey) - Required
- **unit** (ForeignKey) - Required
- **owner** (ForeignKey) - Required
- **created_by** (ForeignKey) - Optional
- **project** (ForeignKey) - Required
- **data_source** (ForeignKey) - Required
- **location** (ForeignKey) - Required
- **data_source** (ForeignKey) - Required
- **created_by** (ForeignKey) - Optional
- **dataset** (ForeignKey) - Required
- **source_column** (ForeignKey) - Required
- **measurement** (ForeignKey) - Required
- **dataset** (ForeignKey) - Required
- **created_by** (ForeignKey) - Optional
- **approved_by** (ForeignKey) - Optional
- **data_import** (ForeignKey) - Required
- **measurement** (ForeignKey) - Required
- **dataset** (ForeignKey) - Required
- **copied_from** (ForeignKey) - Optional
- **from_user** (ForeignKey) - Required
- **to_user** (ForeignKey) - Required
- **measurement** (ForeignKey) - Required
- **granted_by** (ForeignKey) - Required

#### SourceColumn - *main\models.py*
Relationships:
- **project** (ForeignKey) - Required
- **user** (ForeignKey) - Required
- **granted_by** (ForeignKey) - Optional
- **category** (ForeignKey) - Required
- **type** (ForeignKey) - Required
- **project** (ForeignKey) - Required
- **location** (ForeignKey) - Required
- **type** (ForeignKey) - Required
- **unit** (ForeignKey) - Required
- **owner** (ForeignKey) - Required
- **created_by** (ForeignKey) - Optional
- **project** (ForeignKey) - Required
- **data_source** (ForeignKey) - Required
- **location** (ForeignKey) - Required
- **data_source** (ForeignKey) - Required
- **created_by** (ForeignKey) - Optional
- **dataset** (ForeignKey) - Required
- **source_column** (ForeignKey) - Required
- **measurement** (ForeignKey) - Required
- **dataset** (ForeignKey) - Required
- **created_by** (ForeignKey) - Optional
- **approved_by** (ForeignKey) - Optional
- **data_import** (ForeignKey) - Required
- **measurement** (ForeignKey) - Required
- **dataset** (ForeignKey) - Required
- **copied_from** (ForeignKey) - Optional
- **from_user** (ForeignKey) - Required
- **to_user** (ForeignKey) - Required
- **measurement** (ForeignKey) - Required
- **granted_by** (ForeignKey) - Required

#### ColumnMapping - *main\models.py*
Relationships:
- **project** (ForeignKey) - Required
- **user** (ForeignKey) - Required
- **granted_by** (ForeignKey) - Optional
- **category** (ForeignKey) - Required
- **type** (ForeignKey) - Required
- **project** (ForeignKey) - Required
- **location** (ForeignKey) - Required
- **type** (ForeignKey) - Required
- **unit** (ForeignKey) - Required
- **owner** (ForeignKey) - Required
- **created_by** (ForeignKey) - Optional
- **project** (ForeignKey) - Required
- **data_source** (ForeignKey) - Required
- **location** (ForeignKey) - Required
- **data_source** (ForeignKey) - Required
- **created_by** (ForeignKey) - Optional
- **dataset** (ForeignKey) - Required
- **source_column** (ForeignKey) - Required
- **measurement** (ForeignKey) - Required
- **dataset** (ForeignKey) - Required
- **created_by** (ForeignKey) - Optional
- **approved_by** (ForeignKey) - Optional
- **data_import** (ForeignKey) - Required
- **measurement** (ForeignKey) - Required
- **dataset** (ForeignKey) - Required
- **copied_from** (ForeignKey) - Optional
- **from_user** (ForeignKey) - Required
- **to_user** (ForeignKey) - Required
- **measurement** (ForeignKey) - Required
- **granted_by** (ForeignKey) - Required

#### DataImport - *main\models.py*
Relationships:
- **project** (ForeignKey) - Required
- **user** (ForeignKey) - Required
- **granted_by** (ForeignKey) - Optional
- **category** (ForeignKey) - Required
- **type** (ForeignKey) - Required
- **project** (ForeignKey) - Required
- **location** (ForeignKey) - Required
- **type** (ForeignKey) - Required
- **unit** (ForeignKey) - Required
- **owner** (ForeignKey) - Required
- **created_by** (ForeignKey) - Optional
- **project** (ForeignKey) - Required
- **data_source** (ForeignKey) - Required
- **location** (ForeignKey) - Required
- **data_source** (ForeignKey) - Required
- **created_by** (ForeignKey) - Optional
- **dataset** (ForeignKey) - Required
- **source_column** (ForeignKey) - Required
- **measurement** (ForeignKey) - Required
- **dataset** (ForeignKey) - Required
- **created_by** (ForeignKey) - Optional
- **approved_by** (ForeignKey) - Optional
- **data_import** (ForeignKey) - Required
- **measurement** (ForeignKey) - Required
- **dataset** (ForeignKey) - Required
- **copied_from** (ForeignKey) - Optional
- **from_user** (ForeignKey) - Required
- **to_user** (ForeignKey) - Required
- **measurement** (ForeignKey) - Required
- **granted_by** (ForeignKey) - Required

#### ImportBatch - *main\models.py*
Relationships:
- **project** (ForeignKey) - Required
- **user** (ForeignKey) - Required
- **granted_by** (ForeignKey) - Optional
- **category** (ForeignKey) - Required
- **type** (ForeignKey) - Required
- **project** (ForeignKey) - Required
- **location** (ForeignKey) - Required
- **type** (ForeignKey) - Required
- **unit** (ForeignKey) - Required
- **owner** (ForeignKey) - Required
- **created_by** (ForeignKey) - Optional
- **project** (ForeignKey) - Required
- **data_source** (ForeignKey) - Required
- **location** (ForeignKey) - Required
- **data_source** (ForeignKey) - Required
- **created_by** (ForeignKey) - Optional
- **dataset** (ForeignKey) - Required
- **source_column** (ForeignKey) - Required
- **measurement** (ForeignKey) - Required
- **dataset** (ForeignKey) - Required
- **created_by** (ForeignKey) - Optional
- **approved_by** (ForeignKey) - Optional
- **data_import** (ForeignKey) - Required
- **measurement** (ForeignKey) - Required
- **dataset** (ForeignKey) - Required
- **copied_from** (ForeignKey) - Optional
- **from_user** (ForeignKey) - Required
- **to_user** (ForeignKey) - Required
- **measurement** (ForeignKey) - Required
- **granted_by** (ForeignKey) - Required

#### TimeSeriesData - *main\models.py*
Relationships:
- **project** (ForeignKey) - Required
- **user** (ForeignKey) - Required
- **granted_by** (ForeignKey) - Optional
- **category** (ForeignKey) - Required
- **type** (ForeignKey) - Required
- **project** (ForeignKey) - Required
- **location** (ForeignKey) - Required
- **type** (ForeignKey) - Required
- **unit** (ForeignKey) - Required
- **owner** (ForeignKey) - Required
- **created_by** (ForeignKey) - Optional
- **project** (ForeignKey) - Required
- **data_source** (ForeignKey) - Required
- **location** (ForeignKey) - Required
- **data_source** (ForeignKey) - Required
- **created_by** (ForeignKey) - Optional
- **dataset** (ForeignKey) - Required
- **source_column** (ForeignKey) - Required
- **measurement** (ForeignKey) - Required
- **dataset** (ForeignKey) - Required
- **created_by** (ForeignKey) - Optional
- **approved_by** (ForeignKey) - Optional
- **data_import** (ForeignKey) - Required
- **measurement** (ForeignKey) - Required
- **dataset** (ForeignKey) - Required
- **copied_from** (ForeignKey) - Optional
- **from_user** (ForeignKey) - Required
- **to_user** (ForeignKey) - Required
- **measurement** (ForeignKey) - Required
- **granted_by** (ForeignKey) - Required

#### DataCopyGrant - *main\models.py*
Relationships:
- **project** (ForeignKey) - Required
- **user** (ForeignKey) - Required
- **granted_by** (ForeignKey) - Optional
- **category** (ForeignKey) - Required
- **type** (ForeignKey) - Required
- **project** (ForeignKey) - Required
- **location** (ForeignKey) - Required
- **type** (ForeignKey) - Required
- **unit** (ForeignKey) - Required
- **owner** (ForeignKey) - Required
- **created_by** (ForeignKey) - Optional
- **project** (ForeignKey) - Required
- **data_source** (ForeignKey) - Required
- **location** (ForeignKey) - Required
- **data_source** (ForeignKey) - Required
- **created_by** (ForeignKey) - Optional
- **dataset** (ForeignKey) - Required
- **source_column** (ForeignKey) - Required
- **measurement** (ForeignKey) - Required
- **dataset** (ForeignKey) - Required
- **created_by** (ForeignKey) - Optional
- **approved_by** (ForeignKey) - Optional
- **data_import** (ForeignKey) - Required
- **measurement** (ForeignKey) - Required
- **dataset** (ForeignKey) - Required
- **copied_from** (ForeignKey) - Optional
- **from_user** (ForeignKey) - Required
- **to_user** (ForeignKey) - Required
- **measurement** (ForeignKey) - Required
- **granted_by** (ForeignKey) - Required

### Django Views (14 class-based, 9 function-based)
*Showing 10 most important views:*
- **Import** (class) - Methods: GET
- **ImportBatch** (class) - Methods: GET
- **TestDashboard** (class) - Methods: GET
- **TreeNode** (class) - Methods: GET
- **ProjectAccess** (class) - Methods: GET
- **Project** (class) - Methods: GET
- **Location** (class) - Methods: GET
- **DataCopyGrant** (class) - Methods: GET
- **DataImport** (class) - Methods: GET
- **Dataset** (class) - Methods: GET

### URL Patterns
**ecam_web\urls.py**
- `admin/` → admin.site
- `excel-upload/` → name
- `dashboard/` → name
- `project/` → name
- `measurement/` → name
- `data/` → name
- `model/` → name
- `api/data-imports/` → name
- `api/data-imports/<int:import_id>/` → name
- `api/` → include


## Frontend Components
### JavaScript Components
- **API_ERROR_TYPES** (object_literal)  
- **errors** (object_literal)  
- **CSRFManager** (object_literal)  Methods: getTokenFromCookie, warn, getToken, shift, reset, split, querySelector, pop
- **API_CONFIG** (object_literal)  
- **config** (object_literal)  
- **treeNodeAPI** (object_literal)  Methods: stringify, request, children
- **modelFieldsAPI** (object_literal)  Methods: request
- **API** (object_literal)  Methods: request, update, get, reset, subscribe, stringify
- **APIError** (class) extends Error Methods: constructor, super, Date
- **APIClient** (class)  Methods: constructor
- **stats** (object_literal)  
- **TreeItemManager** (class)  Methods: constructor, Map, initialize
- **config** (object_literal)  
- **initialValues** (object_literal)  
- **DOMUtilities** (class)  Methods: constructor, Map
- **shortcuts** (object_literal)  Methods: requestSubmit, cancelEdit, closest, querySelector, click, preventDefault
- **dimensions** (object_literal)  Methods: Date
- **EventManager** (class)  Methods: constructor, debounce, Map, bind
- **FIELD_HANDLERS** (object_literal)  Methods: map, getChoices
- **FormManager** (class)  Methods: initializeState, constructor, Map, bind
- **initialState** (object_literal)  Methods: Date
- **statusConfig** (object_literal)  
- **ImportManager** (class)  
- **DashboardManager** (class)  Methods: set, constructor, bind, Date
- **config** (object_literal)  
- **ModalManager** (class)  Methods: set, constructor, Map, Set
- **oldValue** (object_literal)  
- **newValue** (object_literal)  Methods: _processValue
- **config** (object_literal)  
- **subscription** (object_literal)  Methods: _wrapCallback
- **notification** (object_literal)  Methods: Date
- **StateManager** (class)  Methods: constructor, Map, bind, Set
- **params** (object_literal)  
- **params** (object_literal)  
- **TreeManager** (class)  Methods: Map, getChildren, async, Set, constructor
- **notification** (object_literal)  Methods: now, Date
- **status** (object_literal)  Methods: Date
- **NotificationManager** (class)  Methods: bind, constructor, Map, initialize
- **StatusManager** (class)  Methods: constructor, Map, initialize
- **TreeUIManager** (class)  Methods: constructor, Map, Set

### W3.CSS Usage
#### W3.CSS Class Usage
- **Layout:** 12 unique classes
- **Colors:** 6 unique classes
- **Typography:** 2 unique classes
- **Effects:** 6 unique classes
- **Other:** 20 unique classes


## Component Relationships
### Model Relationships
#### ProjectAccess
- project → Project (ForeignKey)
- project → Project (ForeignKey)
- location → Location (ForeignKey)
- project → Project (ForeignKey)
- location → Location (ForeignKey)
- dataset → Dataset (ForeignKey)
- measurement → Measurement (ForeignKey)
- dataset → Dataset (ForeignKey)
- measurement → Measurement (ForeignKey)
- dataset → Dataset (ForeignKey)
- measurement → Measurement (ForeignKey)
#### MeasurementCategory
- project → Project (ForeignKey)
- project → Project (ForeignKey)
- location → Location (ForeignKey)
- project → Project (ForeignKey)
- location → Location (ForeignKey)
- dataset → Dataset (ForeignKey)
- measurement → Measurement (ForeignKey)
- dataset → Dataset (ForeignKey)
- measurement → Measurement (ForeignKey)
- dataset → Dataset (ForeignKey)
- measurement → Measurement (ForeignKey)
#### MeasurementType
- project → Project (ForeignKey)
- project → Project (ForeignKey)
- location → Location (ForeignKey)
- project → Project (ForeignKey)
- location → Location (ForeignKey)
- dataset → Dataset (ForeignKey)
- measurement → Measurement (ForeignKey)
- dataset → Dataset (ForeignKey)
- measurement → Measurement (ForeignKey)
- dataset → Dataset (ForeignKey)
- measurement → Measurement (ForeignKey)
#### MeasurementUnit
- project → Project (ForeignKey)
- project → Project (ForeignKey)
- location → Location (ForeignKey)
- project → Project (ForeignKey)
- location → Location (ForeignKey)
- dataset → Dataset (ForeignKey)
- measurement → Measurement (ForeignKey)
- dataset → Dataset (ForeignKey)
- measurement → Measurement (ForeignKey)
- dataset → Dataset (ForeignKey)
- measurement → Measurement (ForeignKey)
#### Location
- project → Project (ForeignKey)
- project → Project (ForeignKey)
- location → Location (ForeignKey)
- project → Project (ForeignKey)
- location → Location (ForeignKey)
- dataset → Dataset (ForeignKey)
- measurement → Measurement (ForeignKey)
- dataset → Dataset (ForeignKey)
- measurement → Measurement (ForeignKey)
- dataset → Dataset (ForeignKey)
- measurement → Measurement (ForeignKey)
#### Measurement
- project → Project (ForeignKey)
- project → Project (ForeignKey)
- location → Location (ForeignKey)
- project → Project (ForeignKey)
- location → Location (ForeignKey)
- dataset → Dataset (ForeignKey)
- measurement → Measurement (ForeignKey)
- dataset → Dataset (ForeignKey)
- measurement → Measurement (ForeignKey)
- dataset → Dataset (ForeignKey)
- measurement → Measurement (ForeignKey)
#### Project
- project → Project (ForeignKey)
- project → Project (ForeignKey)
- location → Location (ForeignKey)
- project → Project (ForeignKey)
- location → Location (ForeignKey)
- dataset → Dataset (ForeignKey)
- measurement → Measurement (ForeignKey)
- dataset → Dataset (ForeignKey)
- measurement → Measurement (ForeignKey)
- dataset → Dataset (ForeignKey)
- measurement → Measurement (ForeignKey)
#### DataSource
- project → Project (ForeignKey)
- project → Project (ForeignKey)
- location → Location (ForeignKey)
- project → Project (ForeignKey)
- location → Location (ForeignKey)
- dataset → Dataset (ForeignKey)
- measurement → Measurement (ForeignKey)
- dataset → Dataset (ForeignKey)
- measurement → Measurement (ForeignKey)
- dataset → Dataset (ForeignKey)
- measurement → Measurement (ForeignKey)
#### DataSourceLocation
- project → Project (ForeignKey)
- project → Project (ForeignKey)
- location → Location (ForeignKey)
- project → Project (ForeignKey)
- location → Location (ForeignKey)
- dataset → Dataset (ForeignKey)
- measurement → Measurement (ForeignKey)
- dataset → Dataset (ForeignKey)
- measurement → Measurement (ForeignKey)
- dataset → Dataset (ForeignKey)
- measurement → Measurement (ForeignKey)
#### Dataset
- project → Project (ForeignKey)
- project → Project (ForeignKey)
- location → Location (ForeignKey)
- project → Project (ForeignKey)
- location → Location (ForeignKey)
- dataset → Dataset (ForeignKey)
- measurement → Measurement (ForeignKey)
- dataset → Dataset (ForeignKey)
- measurement → Measurement (ForeignKey)
- dataset → Dataset (ForeignKey)
- measurement → Measurement (ForeignKey)
#### SourceColumn
- project → Project (ForeignKey)
- project → Project (ForeignKey)
- location → Location (ForeignKey)
- project → Project (ForeignKey)
- location → Location (ForeignKey)
- dataset → Dataset (ForeignKey)
- measurement → Measurement (ForeignKey)
- dataset → Dataset (ForeignKey)
- measurement → Measurement (ForeignKey)
- dataset → Dataset (ForeignKey)
- measurement → Measurement (ForeignKey)
#### ColumnMapping
- project → Project (ForeignKey)
- project → Project (ForeignKey)
- location → Location (ForeignKey)
- project → Project (ForeignKey)
- location → Location (ForeignKey)
- dataset → Dataset (ForeignKey)
- measurement → Measurement (ForeignKey)
- dataset → Dataset (ForeignKey)
- measurement → Measurement (ForeignKey)
- dataset → Dataset (ForeignKey)
- measurement → Measurement (ForeignKey)
#### DataImport
- project → Project (ForeignKey)
- project → Project (ForeignKey)
- location → Location (ForeignKey)
- project → Project (ForeignKey)
- location → Location (ForeignKey)
- dataset → Dataset (ForeignKey)
- measurement → Measurement (ForeignKey)
- dataset → Dataset (ForeignKey)
- measurement → Measurement (ForeignKey)
- dataset → Dataset (ForeignKey)
- measurement → Measurement (ForeignKey)
#### ImportBatch
- project → Project (ForeignKey)
- project → Project (ForeignKey)
- location → Location (ForeignKey)
- project → Project (ForeignKey)
- location → Location (ForeignKey)
- dataset → Dataset (ForeignKey)
- measurement → Measurement (ForeignKey)
- dataset → Dataset (ForeignKey)
- measurement → Measurement (ForeignKey)
- dataset → Dataset (ForeignKey)
- measurement → Measurement (ForeignKey)
#### TimeSeriesData
- project → Project (ForeignKey)
- project → Project (ForeignKey)
- location → Location (ForeignKey)
- project → Project (ForeignKey)
- location → Location (ForeignKey)
- dataset → Dataset (ForeignKey)
- measurement → Measurement (ForeignKey)
- dataset → Dataset (ForeignKey)
- measurement → Measurement (ForeignKey)
- dataset → Dataset (ForeignKey)
- measurement → Measurement (ForeignKey)
#### DataCopyGrant
- project → Project (ForeignKey)
- project → Project (ForeignKey)
- location → Location (ForeignKey)
- project → Project (ForeignKey)
- location → Location (ForeignKey)
- dataset → Dataset (ForeignKey)
- measurement → Measurement (ForeignKey)
- dataset → Dataset (ForeignKey)
- measurement → Measurement (ForeignKey)
- dataset → Dataset (ForeignKey)
- measurement → Measurement (ForeignKey)
