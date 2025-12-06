# ECAM Web - Energy Charting and Metrics

## Project Overview

This is a **Django web application called "ecam_web"** that serves as a data management and measurement tracking platform. It provides a comprehensive system for organizing scientific or engineering measurement data across hierarchical projects, locations, and datasets. The application features user authentication with project-level access control (via `ProjectAccess`), allowing project owners to grant or revoke access to collaborators. It handles various measurement categories (pressure, flow, temperature, etc.) with support for different measurement types, units, and SI multipliers.

The backend is built with Django REST Framework for API endpoints, uses PostgreSQL as the database (via psycopg2), and includes a custom tree-based CRUD architecture with lazy-loading capabilities for efficient handling of large hierarchical datasets. Data import functionality supports multiple data sources and file formats (CSV, Excel via openpyxl). The application is designed for multi-tenant use cases where users can manage their own projects while sharing access with specific team members, and includes data export capabilities and timezone handling for global collaboration.

## Development Stack

### Backend
- **Django 5.1.1** - Primary web framework
- **Django REST Framework 3.15.2** - RESTful API implementation
- **PostgreSQL** - Primary database (via psycopg2 2.9.10)
- **Python 3.x** - Runtime with virtual environment (venv)
- **Django Extensions 3.2.3** - Development utilities

### Frontend
- **W3.CSS** - Main CSS framework
- **Bootstrap Icons** - Icon library
- **Google Material Icons** - Additional icons
- **CodeMirror 5.65.2** - Code editor component
- **Vanilla JavaScript (ES6 modules)** - Custom frontend logic organized in modular structure (core modules for API, DOM, state management, forms, tree views, etc.)
- **Django Templates** - Server-side HTML rendering

### Data Processing
- **pandas 2.2.3** - Data analysis and manipulation
- **numpy 2.2.1** - Numerical computing
- **openpyxl 3.1.5** - Excel file handling
- **chardet 5.2.0** - Character encoding detection

### Deployment & Infrastructure
- **WhiteNoise** - Static file serving in production
- **AWS** - Deployment target (deployment scripts in `aws/`)
- **WSGI** - Production server interface
- **SSL/TLS** - HTTPS enforcement in production

### Development Tools
- **python-dotenv** - Environment variable management
- **Git** - Version control
- **Virtual environment (venv)** - Dependency isolation

### Security
- Session and Basic authentication via DRF
- CSRF protection
- SSL redirect and HSTS in production
- Environment-based configuration (development/production)

## Project Structure

```
ecam_web/
├── .env                          # Environment variables (development)
├── .gitignore                    # Git ignore rules
├── manage.py                     # Django management script
├── requirements.txt              # Python dependencies
├── context_generator.py          # Context generation utility
│
├── ecam_web/                     # Django project configuration
│   ├── __init__.py
│   ├── settings.py              # Main settings (environment-aware)
│   ├── urls.py                  # Root URL configuration
│   ├── wsgi.py                  # WSGI application entry point
│   └── asgi.py                  # ASGI application entry point
│
├── main/                         # Primary Django application
│   ├── models.py                # Data models (Project, Location, Measurement, etc.)
│   ├── views.py                 # View controllers and ViewSets
│   ├── serializers.py           # DRF serializers
│   ├── forms.py                 # Django forms
│   ├── admin.py                 # Django admin configuration
│   ├── apps.py                  # App configuration
│   │
│   ├── api/                     # API-specific views
│   │   └── views/
│   │       ├── data.py         # Data management API endpoints
│   │       └── import_views.py # Data import API endpoints
│   │
│   ├── services/                # Business logic layer
│   │   ├── data_processing.py  # Data processing utilities
│   │   ├── import_services.py  # Import handling services
│   │   └── validation.py       # Validation logic
│   │
│   ├── management/              # Custom Django commands
│   │   └── commands/
│   │       └── run_tests_with_dependencies.py
│   │
│   ├── migrations/              # Database migrations
│   │
│   ├── static/main/             # Static assets
│   │   ├── css/
│   │   │   ├── base.css
│   │   │   ├── main.css
│   │   │   └── components/     # Component-specific styles
│   │   │       ├── dropdown.css
│   │   │       ├── filter.css
│   │   │       ├── measurement.css
│   │   │       ├── modal.css
│   │   │       └── tree.css
│   │   │
│   │   └── js/
│   │       ├── base.js         # Base JavaScript initialization
│   │       ├── main.js         # Main application entry
│   │       ├── core/           # Core JavaScript modules
│   │       │   ├── api.js      # API communication layer
│   │       │   ├── crud.js     # CRUD operations
│   │       │   ├── dom.js      # DOM manipulation utilities
│   │       │   ├── events.js   # Event handling
│   │       │   ├── forms.js    # Form management
│   │       │   ├── import.js   # Data import UI
│   │       │   ├── modals.js   # Modal dialog management
│   │       │   ├── state.js    # Application state management
│   │       │   ├── tree.js     # Tree view component
│   │       │   ├── ui.js       # UI utilities
│   │       │   └── codemirror.js # Code editor integration
│   │       │
│   │       └── page/           # Page-specific scripts
│   │           ├── dashboard.js
│   │           └── login.js
│   │
│   ├── templates/               # Django templates
│   │   ├── base.html           # Base template
│   │   └── main/
│   │       ├── index.html
│   │       └── dashboard.html
│   │
│   ├── tests/                   # Test suite
│   │   ├── test_api/           # API endpoint tests
│   │   ├── test_models/        # Model tests
│   │   ├── test_views/         # View tests
│   │   └── utils_data.py       # Test utilities
│   │
│   └── sources/                 # Data source integrations
│       └── exceptions.py
│
├── static/                      # Global static files
│   └── favicon.ico
│
├── queries/                     # SQL query templates
│   └── sql/
│       ├── client.sql
│       ├── location.sql
│       ├── measurement.sql
│       └── project.sql
│
├── aws/                         # AWS deployment files
│   ├── deployment.txt
│   ├── setup-server.sh
│   ├── ecam-web.pem
│   └── vs-code-tunnel.bat
│
├── design/                      # Design documents and archives
│   ├── design.txt
│   ├── testing_plan.txt
│   └── [archived UI components]
│
├── sample_data/                 # Sample datasets
│   └── logtool_v2/
│
├── logs/                        # Application logs
│
└── venv/                        # Python virtual environment
```

## Principal Architectural Features

### 1. **Hierarchical Data Model**

The application uses a well-structured hierarchical data organization:

```
User → Project → Location → Measurement → Dataset
                    ↓
            MeasurementCategory → MeasurementType → MeasurementUnit
```

- **Projects**: Top-level containers owned by users, supporting two types (Audit, M&V - Measurement & Verification)
- **Locations**: Physical sites within projects with geocoding support (latitude/longitude)
- **Measurements**: Individual measurement points with configurable types, units, and SI multipliers
- **Measurement System**: Flexible measurement taxonomy supporting categories (Pressure, Flow, Temperature), types (Absolute Pressure, Gauge Pressure), units with conversion factors, and SI multipliers (pico to tera)

### 2. **Multi-Tenant Access Control**

Robust permission system using the `ProjectAccess` model:
- Project owners can grant/revoke user access
- Temporal access tracking (granted_at, revoked_at)
- Database constraints ensure no duplicate active access grants
- Audit trail with grant attribution (granted_by field)
- Owner cannot be granted access (validated at model and serializer levels)

### 3. **Custom Tree-Based CRUD Architecture**

The application implements a CRUD system optimized for hierarchical data:

**Backend - TreeNodeViewSet Base Class:**
- Custom base ViewSet extending Django REST Framework's ModelViewSet
- Automatic child node loading with pagination and filtering
- Built-in search capabilities across hierarchical structures
- Optimized queries with configurable `select_related` and `prefetch_related`
- Custom `children()` action endpoint for lazy-loading tree nodes
- Support for comma-separated filter values for multi-value queries
- Extensible filtering system via `filter_fields` mapping

**Frontend - TreeItemManager (crud.js):**
- Centralized CRUD operation management with state tracking
- Asynchronous operation handling with progress indicators
- Intelligent error handling (concurrency conflicts, permissions, validation)
- Integration with Tree component for automatic UI updates
- Operation history and statistics tracking
- Temporary form insertion with animations for inline editing
- Automatic cleanup and rollback on operation failure

**API Features:**
- **Standard CRUD endpoints** via DRF router registration
- **Custom actions** for specialized operations (@action decorators)
- **Nested resource access** through parent-child relationships
- **Session & Basic Authentication** for API security
- **Serializers** with multi-layer validation logic

### 4. **Service Layer Pattern**

Business logic separated from views into dedicated services:
- `services/data_processing.py` - Data transformation and analysis
- `services/import_services.py` - File import orchestration
- `services/validation.py` - Complex validation rules
- Promotes reusability and testability
- Keeps views thin and focused on HTTP concerns

### 5. **Hybrid Multi-Page Architecture with Progressive Enhancement**

The application uses a traditional multi-page architecture with modern SPA-like interactivity:

**Multi-Page Foundation:**
- Server-rendered Django templates for each major section (dashboard, login, data imports)
- Traditional URL-based navigation between pages (full page reloads)
- SEO-friendly and accessible by default
- No client-side routing framework

**Progressive JavaScript Enhancement:**
- **ES6 module-based organization** with clear separation of concerns
- **Core modules** provide reusable functionality (api.js, state.js, forms.js, tree.js)
- **Page modules** contain page-specific logic (dashboard.js, login.js)
- **Component-based CSS** with dedicated stylesheets per UI component
- **Client-side state management** for interactive components within each page
- **AJAX-powered interactions** for dynamic content loading without page refreshes
- **Event-driven architecture** through centralized event management

**SPA-Like Features Within Pages:**
- Collapsible sections with dynamic content loading
- Tree view components with lazy-loaded children
- Modal dialogs and inline editing
- Real-time form validation and API interactions

This hybrid approach combines the reliability and accessibility of server-rendered pages with the interactivity and responsiveness of modern JavaScript applications.

### 6. **Data Import Pipeline**

Data import system supporting multiple formats:
- Multi-step import workflow (file upload → validation → mapping → import)
- Support for CSV and Excel (openpyxl)
- Character encoding detection (chardet)
- DataSource, Dataset, and SourceColumn models for metadata tracking
- DataImport and ImportBatch models for tracking import operations
- DataCopyGrant for managing data sharing between users

### 7. **Environment-Aware Configuration**

Production-ready configuration management:
- Environment variable-based settings (.env file)
- Automatic environment detection (development/production)
- Production-specific middleware (WhiteNoise for static files)
- SSL enforcement in production (SECURE_SSL_REDIRECT, HSTS headers)
- Database SSL mode switching based on environment
- Separate static file handling strategies

### 8. **Database Optimization**

Performance-focused database design:
- **Composite indexes** on frequently queried field combinations
- **Unique constraints** enforcing data integrity at DB level
- **Conditional constraints** (e.g., unique active project access)
- **Foreign key relationships** with appropriate on_delete behaviors
- **PROTECT cascades** for critical reference data (MeasurementType, MeasurementUnit)

### 9. **Validation at Multiple Layers**

Defense-in-depth validation approach:
- **Model-level**: clean() methods for cross-field validation
- **Database-level**: constraints and indexes
- **Serializer-level**: DRF validators for API input
- **Form-level**: Django forms for template-based views
- **Service-level**: Complex business rules in service classes

### 10. **Test-Driven Structure**

Comprehensive test organization:
- Separate test modules for API, models, and views
- Test utilities for data generation (`utils_data.py`)
- Custom management command for dependency-aware test execution
- Supports isolated unit testing and integration testing

## Key Features

- **Multi-user project management** with granular access control
- **Hierarchical data organization** with lazy-loading tree views for scalable performance
- **Flexible measurement tracking** with configurable units and SI multipliers
- **Optimized data loading** with pagination and on-demand child node fetching
- **Data import from multiple sources** (CSV, Excel) with encoding detection
- **RESTful API** with custom tree-based CRUD endpoints for integration
- **Responsive web interface** using W3.CSS with progressive enhancement
- **Production-ready deployment** with AWS support
- **Timezone-aware** data handling for global collaboration
- **Audit trails** for access grants and data imports
- **Real-time validation** across multiple layers (database, model, serializer, form)

## Getting Started

### Prerequisites
- Python 3.x
- PostgreSQL database
- Virtual environment tool (venv)

### Installation

1. Clone the repository
2. Create and activate virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Configure environment variables in `.env`:
   ```
   ENVIRONMENT=development
   DJANGO_SECRET_KEY=your-secret-key
   DATABASE_NAME=ecam_web
   DATABASE_HOST=localhost
   DATABASE_PORT=5432
   DATABASE_USER=your-db-user
   DATABASE_PASSWORD=your-db-password
   LOCAL_IPS=localhost,127.0.0.1
   ```

5. Run migrations:
   ```bash
   python manage.py migrate
   ```

6. Create superuser:
   ```bash
   python manage.py createsuperuser
   ```

7. Run development server:
   ```bash
   python manage.py runserver
   ```

8. Access the application at `http://localhost:8000`

## API Endpoints

- `/api/projects/` - Project CRUD operations
- `/api/locations/` - Location management
- `/api/measurements/` - Measurement tracking
- `/api/model-fields/` - Field definitions and validation rules
- `/api/data-imports/` - Data import operations
- `/admin/` - Django admin interface

## Development

- **Run tests**: `python manage.py test`
- **Create migrations**: `python manage.py makemigrations`
- **Collect static files**: `python manage.py collectstatic`
- **Shell access**: `python manage.py shell` or `python manage.py shell_plus` (via django-extensions)

## Deployment

AWS deployment scripts are available in the `aws/` directory. The application uses:
- WhiteNoise for static file serving
- PostgreSQL with SSL in production
- WSGI server interface
- Environment-based security settings (HSTS, SSL redirect, secure cookies)

## Current Development Status

### What's Built: Data Infrastructure ✓

The application provides data collection and management capabilities:
- Hierarchical organization (Projects → Locations → Measurements → Datasets)
- Multi-tenant access control with temporal tracking
- Data import pipeline (CSV, Excel with encoding detection)
- Timeseries data storage with indexing
- Tree-based CRUD with lazy loading
- RESTful API with authentication
- Security and validation layers

This infrastructure handles data organization and storage but does not process or analyze the data.

### Missing: Analytics & Intelligence Layer ✗

The core functionality implied by "Energy Charting and Metrics" is not implemented:

#### **1. Mathematical Modeling System** (Highest Priority)
No modeling infrastructure exists:
- **No equation/expression models** - Cannot define mathematical relationships between measurements
- **No operators or parameters** - No computational framework for energy calculations
- **No coefficients or templates** - Cannot create reusable calculation models
- **No computed parameters** - All values must be imported; nothing can be calculated
- **Design exists** (see [design/design.txt](design/design.txt) lines 7-16) but not implemented

**Impact**: Cannot perform any energy analysis, M&V calculations, or derived metrics.

#### **2. Statistical Analysis Capabilities** (Highest Priority)
Despite having pandas and numpy installed, **no statistical processing exists**:
- **No descriptive statistics** - Cannot calculate mean, median, std dev, min/max for datasets
- **No time-series analysis** - Cannot detect trends, seasonality, or anomalies
- **No correlation analysis** - Cannot compare measurements or identify relationships
- **No baseline calculations** - Cannot establish baseline consumption patterns
- **No regression or forecasting** - Cannot predict future consumption or savings

**Impact**: Data can be stored but not analyzed. No insights can be derived from the collected data.

#### **3. Visualization & Charting** (Highest Priority)
No charting infrastructure exists:
- **No charting libraries** - No matplotlib, plotly, chart.js, D3.js, or similar
- **No chart endpoints** - No API to request chart data or renderings
- **No visualization UI** - No graphs, plots, or visual analytics on any page
- **No interactive dashboards** - Dashboard exists but shows only organizational trees

**Impact**: Users cannot see trends, patterns, or insights visually. All data interaction is through tables/forms.

#### **4. Energy-Specific Analytics** (Core Business Logic Missing)
Project types include "Audit" and "M&V" but no energy domain logic is implemented:
- **No energy consumption calculations** - Cannot compute kWh, therms, or energy costs
- **No demand analysis** - Cannot identify peak demand or load profiles
- **No savings calculations** - Cannot quantify energy savings or cost avoidance
- **No M&V algorithms** - Despite having M&V as a project type, no IPMVP methods implemented
- **No baseline/reporting period comparisons** - Cannot perform pre/post analysis
- **No degree-day normalization** - Cannot adjust for weather variations
- **No utility cost modeling** - Cannot calculate costs from rate schedules

**Impact**: Cannot fulfill the primary use case for energy professionals. The application is a timeseries database, not an energy analytics platform.

#### **5. Reporting & Analysis UI** (User Value Missing)
No interfaces for working with analyzed data:
- **No analysis dashboards** - No views showing computed metrics or statistics
- **No report generation** - Cannot produce PDF/Excel reports of findings
- **No comparison tools** - Cannot visually compare locations, periods, or scenarios
- **No export of analysis results** - Can export raw data but not calculated insights

**Impact**: Even if calculations were implemented, users would have no way to access or share results.

#### **6. Advanced Data Processing**
Additional analytical gaps:
- **No data quality scoring** - Cannot assess completeness or reliability of datasets
- **No outlier detection** - Cannot identify or flag anomalous readings
- **No data interpolation** - Cannot fill gaps in timeseries data
- **No aggregation functions** - Cannot roll up data to hourly/daily/monthly summaries
- **No unit conversions in analysis** - Can store different units but not convert for comparison

### What This Means

The current application is an energy data warehouse with:
- Data organization and access control
- Import/export capabilities
- Multi-user collaboration
- Security and validation

It cannot:
- Answer questions about the data ("What's our average consumption?")
- Show trends or patterns ("Is our energy use increasing?")
- Calculate savings ("How much did we save?")
- Compare scenarios ("Location A vs Location B")
- Generate insights ("When is peak demand?")
- Produce reports for stakeholders

### Path Forward

To become a functional energy analytics platform, the following development is required (in priority order):

**Phase 1: Core Analytics (Essential)**
1. Statistical analysis service layer (descriptive stats, aggregations)
2. Charting library integration (plotly or chart.js recommended)
3. Basic visualization endpoints and UI components
4. Energy calculation framework (consumption, demand, costs)

**Phase 2: Mathematical Modeling (High Value)**
5. Equation/expression model implementation
6. Computed parameter system
7. Model templates and reusable calculations
8. M&V calculation methods (IPMVP Option C at minimum)

**Phase 3: Advanced Analytics (Competitive Advantage)**
9. Time-series analysis (trends, seasonality, forecasting)
10. Baseline modeling and regression
11. Weather normalization
12. Anomaly detection and data quality scoring

**Phase 4: User Experience (Adoption)**
13. Interactive dashboards with drill-down
14. Report generation (PDF, Excel)
15. Comparison and benchmarking tools
16. Scheduled reports and alerts

## Future Enhancements & Missing Best Practices

Beyond the core analytics functionality described above, the following web application best practices are **also not currently implemented**:

### High Priority

**1. Logging & Monitoring**
- Structured logging configuration (Python logging module)
- Application Performance Monitoring (APM) integration (e.g., New Relic, DataDog)
- Error tracking service (e.g., Sentry, Rollbar)
- Log aggregation for production debugging

**2. Caching Strategy**
- Redis or Memcached integration
- Django cache middleware configuration
- API response caching for frequently accessed data
- Query result caching to reduce database load

**3. API Rate Limiting**
- DRF throttling classes (AnonRateThrottle, UserRateThrottle)
- Per-endpoint rate limiting configuration
- Protection against DoS attacks and API abuse

**4. Asynchronous Task Processing**
- Celery integration for background tasks
- Async processing for long-running data imports
- Periodic task scheduling (Celery Beat)
- Email notifications and report generation

**5. Containerization**
- Docker and docker-compose configuration
- Consistent development environments
- Simplified deployment process
- Container orchestration (Kubernetes) support

### Medium Priority

**6. CI/CD Pipeline**
- GitHub Actions or GitLab CI configuration
- Automated testing on commits
- Automated deployment to staging/production
- Code quality checks (linting, coverage)

**7. API Documentation**
- Swagger/OpenAPI integration (drf-spectacular)
- Interactive API documentation
- Request/response examples
- Authentication documentation

**8. Health Check Endpoints**
- `/health` endpoint for load balancer health checks
- `/ready` endpoint for container orchestration
- Database connectivity validation
- Dependency health monitoring

**9. Database Optimization**
- Connection pooling (pgBouncer, django-db-pool)
- Read replica configuration for scaling
- Query performance monitoring
- Database backup automation

**10. CORS Configuration**
- django-cors-headers integration
- Whitelist configuration for allowed origins
- Support for frontend apps on different domains

### Lower Priority

**11. Static Asset Optimization**
- JavaScript/CSS minification pipeline (Webpack, Vite)
- CDN integration for static assets
- Advanced cache busting strategies
- Image optimization and lazy loading

**12. API Versioning**
- URL-based or header-based API versioning
- Deprecation strategy for old API versions
- Backward compatibility planning

**13. Content Security Policy**
- CSP headers configuration
- XSS attack mitigation
- Inline script restrictions

**14. Feature Flags**
- Feature toggle system (e.g., django-waffle)
- Gradual feature rollout
- A/B testing capabilities

**15. Additional Security Measures**
- Two-factor authentication (2FA)
- OAuth2/OpenID Connect integration
- Security audit logging
- Penetration testing

**16. Backup & Disaster Recovery**
- Automated database backup procedures
- Media/file backup strategy
- Disaster recovery plan
- Point-in-time recovery capabilities

### Current Strengths ✓

The application already implements these best practices well:
- Environment-based configuration with .env files
- Multi-layer validation (database, model, serializer, form)
- Production security headers (HSTS, XSS protection, CSRF)
- Comprehensive test suite organization
- Database indexing and constraints
- Authentication and authorization
- Migration management
- Service layer pattern for business logic

## Recommended Implementation Order

For teams looking to enhance this application, we recommend implementing improvements in this order:

1. **Logging & Error Tracking** - Essential for production debugging
2. **Containerization (Docker)** - Standardizes environments across team
3. **CI/CD Pipeline** - Automates testing and deployment
4. **Caching** - Immediate performance gains
5. **Rate Limiting** - Protects against abuse
6. **Async Task Processing** - Improves user experience for long operations
7. **API Documentation** - Helps API consumers and team members
8. **Health Checks** - Required for cloud/container deployments

## License

[Specify your license here]

## Contributors

Michael Baker - Project Owner
