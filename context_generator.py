import os
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any, Optional, Set

class ProjectDocumentationGenerator:
    """
    Generates concise project documentation for Django/JavaScript applications
    using vanilla JS and w3.css
    """
    
    def __init__(self):
        """Initialize the documentation generator"""
        print("Initializing documentation generator...")
        
        # Project paths setup
        self.project_root = Path.cwd()
        self.output_dir = self.project_root / 'design'
        self.output_dir.mkdir(exist_ok=True)
        
        # Documentation structure initialization
        self.documentation = {
            'metadata': {
                'generated_at': datetime.now().isoformat(),
                'version': '1.0',
                'project_name': os.path.basename(self.project_root)
            },
            'structure': {
                'directories': [],
                'summary': {}
            },
            'frontend': {
                'js_components': [],
                'w3css_usage': {},
                'events': [],
                'dom_manipulations': []
            },
            'backend': {
                'models': [],
                'views': [],
                'urls': [],
                'api_endpoints': []
            },
            'relationships': {
                'frontend_to_backend': [],
                'model_relationships': []
            }
        }
        
        # File pattern configuration
        self.file_patterns = {
            'python': ['*.py'],
            'javascript': ['*.js'],
            'html': ['*.html'],
            'css': ['*.css']
        }
        
        # Exclusion patterns
        self.exclude_patterns = [
            '**/venv/**',
            '**/node_modules/**',
            '**/.git/**',
            '**/migrations/**',
            '**/__pycache__/**',
            '**/static/admin/**',
            '**/static/rest_framework/**',
            '**/design/**'
        ]

        # Load gitignore patterns
        gitignore_patterns = self.load_gitignore()
        self.exclude_patterns.extend(gitignore_patterns)
            
        print(f"Project root: {self.project_root}")
        print(f"Output directory: {self.output_dir}")
        print(f"Loaded {len(gitignore_patterns)} patterns from .gitignore")
    
    def load_gitignore(self) -> List[str]:
        """Load gitignore patterns from .gitignore file"""
        gitignore_path = self.project_root / '.gitignore'
        patterns = []
        
        if gitignore_path.exists():
            with open(gitignore_path, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    # Skip empty lines and comments
                    if not line or line.startswith('#'):
                        continue
                    # Convert gitignore pattern to glob pattern
                    if line.endswith('/'):
                        # Directory pattern
                        patterns.append(f'**/{line}**')
                    else:
                        # File pattern
                        patterns.append(f'**/{line}')
        
        return patterns
    
    
    def should_process_file(self, file_path: Path) -> bool:
        """
        Determine if a file should be processed based on patterns and exclusions
        """
        # Convert to string for pattern matching
        path_str = str(file_path)
        rel_path = str(file_path.relative_to(self.project_root))
        
        # Check exclusions first
        for pattern in self.exclude_patterns:
            if self._matches_pattern(rel_path, pattern):
                return False
        
        # Check if file matches any include pattern
        for category, patterns in self.file_patterns.items():
            for pattern in patterns:
                if self._matches_pattern(rel_path, pattern):
                    return True
        
        return False
    
    def _matches_pattern(self, path: str, pattern: str) -> bool:
        """Simple glob pattern matching for file paths"""
        import fnmatch
        return fnmatch.fnmatch(path, pattern)
    
    def scan_directory(self, directory: Path = None) -> None:
        """
        Scan directory recursively and process relevant files
        """
        if directory is None:
            directory = self.project_root
            
        print(f"Scanning directory: {directory}")
        
        # Collect directory structure information
        if directory == self.project_root:
            self._collect_directory_structure()
        
        try:
            for item in directory.iterdir():
                if item.is_dir() and not self._is_excluded_dir(item):
                    self.scan_directory(item)
                elif item.is_file() and self.should_process_file(item):
                    self._process_file(item)
        except PermissionError:
            print(f"Permission denied: {directory}")
        except Exception as e:
            print(f"Error scanning {directory}: {e}")
    
    def _is_excluded_dir(self, directory: Path) -> bool:
        """Check if directory should be excluded from scanning"""
        rel_path = str(directory.relative_to(self.project_root))
        for pattern in self.exclude_patterns:
            if self._matches_pattern(rel_path, pattern):
                return True
        return False
    
    def _collect_directory_structure(self) -> None:
        """Build a compact representation of project directory structure"""
        structure = []
        
        for root, dirs, files in os.walk(self.project_root):
            # Skip excluded directories
            dirs[:] = [d for d in dirs if not self._is_excluded_dir(Path(root) / d)]
            
            path = Path(root)
            if path == self.project_root:
                continue
                
            rel_path = path.relative_to(self.project_root)
            depth = len(rel_path.parts)
            
            # Only include relevant directories (not too deep)
            if depth <= 3:
                py_count = len([f for f in files if f.endswith('.py')])
                js_count = len([f for f in files if f.endswith('.js')])
                html_count = len([f for f in files if f.endswith('.html')])
                
                if py_count > 0 or js_count > 0 or html_count > 0:
                    structure.append({
                        'path': str(rel_path),
                        'depth': depth,
                        'files': {
                            'python': py_count,
                            'javascript': js_count,
                            'html': html_count
                        }
                    })
        
        self.documentation['structure']['directories'] = structure
    def _process_file(self, file_path: Path) -> None:
        """Process a file based on its type"""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
                
            if file_path.suffix == '.py':
                self._process_python_file(content, file_path)
            elif file_path.suffix == '.js':
                self._process_javascript_file(content, file_path)
            elif file_path.suffix == '.html':
                self._process_html_file(content, file_path)
            elif file_path.suffix == '.css':
                self._process_css_file(content, file_path)
                
        except UnicodeDecodeError:
            # Skip binary files or files with unknown encoding
            pass
        except Exception as e:
            print(f"Error processing {file_path}: {e}")
    
    def _process_python_file(self, content: str, file_path: Path) -> None:
        """Process Python files, focusing on Django patterns"""
        rel_path = str(file_path.relative_to(self.project_root))
        
        # Detect Django models
        if 'class' in content and 'models.Model' in content:
            models = self._extract_django_models(content, rel_path)
            self.documentation['backend']['models'].extend(models)
            
        # Detect Django views
        if any(view_pattern in content for view_pattern in 
              ['class', 'View', 'APIView', 'ViewSet', 'def get', 'def post']):
            views = self._extract_django_views(content, rel_path)
            self.documentation['backend']['views'].extend(views)
            
        # Detect URL patterns
        if 'urlpatterns' in content:
            urls = self._extract_django_urls(content, rel_path)
            self.documentation['backend']['urls'].extend(urls)

    def _extract_django_models(self, content: str, file_path: str) -> List[Dict[str, Any]]:
        """Extract Django model definitions"""
        models = []
        model_pattern = r"class\s+(\w+)\((?:.*?)models\.Model(?:.*?)\):"
        field_pattern = r"^\s+(\w+)\s*=\s*models\.(\w+)\(([^)]*)\)"
        
        for match in re.finditer(model_pattern, content, re.MULTILINE):
            model_name = match.group(1)
            
            # Find model fields
            fields = []
            for field_match in re.finditer(field_pattern, content, re.MULTILINE):
                field_name, field_type, field_args = field_match.groups()
                fields.append({
                    'name': field_name,
                    'type': field_type,
                    'is_required': 'null=True' not in field_args and 'blank=True' not in field_args
                })
            
            models.append({
                'name': model_name,
                'file': file_path,
                'fields': fields
            })
            
        return models
        
    def _extract_django_views(self, content: str, file_path: str) -> List[Dict[str, Any]]:
        """Extract Django view definitions"""
        views = []
        
        # Class-based views
        class_view_pattern = r"class\s+(\w+)(?:View|APIView|ViewSet)(?:\(([^)]+)\)):"
        for match in re.finditer(class_view_pattern, content, re.MULTILINE):
            view_name, parent_classes = match.groups()
            
            # Extract HTTP methods
            methods = []
            for method in ['get', 'post', 'put', 'patch', 'delete']:
                if re.search(rf"def\s+{method}\s*\(", content):
                    methods.append(method.upper())
            
            views.append({
                'name': view_name,
                'type': 'class',
                'file': file_path,
                'methods': methods
            })
        
        # Function-based views
        func_view_pattern = r"def\s+(\w+)(?:\(request[^)]*\)):"
        for match in re.finditer(func_view_pattern, content, re.MULTILINE):
            view_name = match.group(1)
            
            # Skip if this is likely a helper function, not a view
            if not re.search(r"render|HttpResponse|JsonResponse|Response", content):
                continue
                
            views.append({
                'name': view_name,
                'type': 'function',
                'file': file_path
            })
            
        return views
    def _extract_django_urls(self, content: str, file_path: str) -> List[Dict[str, Any]]:
        """Extract Django URL patterns"""
        urls = []
        # Look for urlpatterns list
        if 'urlpatterns' in content:
            # Extract path/url patterns
            pattern_regex = r"(?:path|url|re_path)\(\s*['\"]([^'\"]+)['\"](?:\s*,\s*(\w+\.?\w*|include\([^)]+\)))+"
            
            for match in re.finditer(pattern_regex, content, re.MULTILINE):
                route, view = match.groups()
                
                # Clean up the view name if it's an include
                if 'include' in view:
                    include_match = re.search(r"include\(['\"]([^'\"]+)['\"]", view)
                    if include_match:
                        view = f"include:{include_match.group(1)}"
                
                urls.append({
                    'route': route,
                    'view': view,
                    'file': file_path
                })
        
        return urls
    
    def _process_javascript_file(self, content: str, file_path: Path) -> None:
        """Process JavaScript files, focusing on vanilla JS patterns"""
        rel_path = str(file_path.relative_to(self.project_root))
        
        # Extract JS component/module information
        components = self._extract_js_components(content, rel_path)
        if components:
            self.documentation['frontend']['js_components'].extend(components)
            
        # Extract DOM manipulation patterns
        dom_operations = self._extract_dom_operations(content, rel_path)
        if dom_operations:
            self.documentation['frontend']['dom_manipulations'].extend(dom_operations)
            
        # Extract events and listeners
        events = self._extract_js_events(content, rel_path)
        if events:
            self.documentation['frontend']['events'].extend(events)
    
    def _extract_js_components(self, content: str, file_path: str) -> List[Dict[str, Any]]:
        """Extract JavaScript component patterns"""
        components = []
        
        # Look for module patterns (IIFE, object literals, function modules)
        module_patterns = [
            # IIFE pattern
            (r"\(\s*function\s*\(\s*\)\s*{(.*?)}\s*\)\s*\(\s*\)\s*;?", "IIFE"),
            # Object literal module
            (r"const\s+(\w+)\s*=\s*{(.*?)};", "object_literal"),
            # Function module
            (r"function\s+(\w+)\s*\(\s*\)\s*{(.*?)}", "function_module"),
            # Class definition
            (r"class\s+(\w+)(?:\s+extends\s+(\w+))?\s*{(.*?)}", "class")
        ]
        
        for pattern, pattern_type in module_patterns:
            for match in re.finditer(pattern, content, re.DOTALL):
                if pattern_type == "object_literal":
                    name = match.group(1)
                    body = match.group(2)
                elif pattern_type == "class":
                    name = match.group(1)
                    parent = match.group(2) or None
                    body = match.group(3)
                else:
                    # For IIFE, extract name from comments or variable assignment
                    body = match.group(1)
                    name_match = re.search(r"//\s*Module:\s*(\w+)|\/\*\s*Module:\s*(\w+)", content)
                    if name_match:
                        name = name_match.group(1) or name_match.group(2)
                    else:
                        name = f"AnonymousModule_{len(components)}"
                
                # Extract methods 
                methods = []
                method_pattern = r"(?:function|const|let|var)?\s*(\w+)(?:\s*=\s*function|\s*=\s*\()|\s*(\w+)\s*\("
                for method_match in re.finditer(method_pattern, body):
                    method_name = method_match.group(1) or method_match.group(2)
                    if method_name and method_name not in ['if', 'for', 'while', 'switch']:
                        methods.append(method_name)
                
                component_info = {
                    'name': name,
                    'type': pattern_type,
                    'file': file_path,
                    'methods': list(set(methods))
                }
                
                if pattern_type == "class" and parent:
                    component_info['parent'] = parent
                    
                components.append(component_info)
        
        return components
    def _extract_dom_operations(self, content: str, file_path: str) -> List[Dict[str, Any]]:
        """Extract DOM manipulation patterns"""
        dom_ops = []
        
        # Common DOM operation patterns
        operations = {
            'selectors': r"(?:document\.(?:getElementById|querySelector|querySelectorAll)|getElementById|querySelector|jQuery|\$)\s*\(\s*['\"]([^'\"]+)['\"]",
            'creation': r"(?:document\.createElement|createElement)\(\s*['\"]([^'\"]+)['\"]",
            'manipulation': r"\.(?:innerHTML|textContent|innerText|value|classList|style|appendChild|removeChild|setAttribute)\s*=?"
        }
        
        found_ops = {}
        for op_type, pattern in operations.items():
            matches = re.finditer(pattern, content)
            elements = []
            
            for match in matches:
                if op_type == 'selectors' and match.group(1):
                    elements.append(match.group(1))
                elif op_type == 'creation' and match.group(1):
                    elements.append(match.group(1))
                elif op_type == 'manipulation':
                    elements.append(True)
            
            if elements:
                found_ops[op_type] = len(elements)
        
        if found_ops:
            dom_ops.append({
                'file': file_path,
                'operations': found_ops
            })
            
        return dom_ops
    
    def _extract_js_events(self, content: str, file_path: str) -> List[Dict[str, Any]]:
        """Extract event handlers and listeners"""
        events = []
        
        # Event patterns to look for
        event_patterns = {
            'listeners': r"\.addEventListener\(\s*['\"](\w+)['\"]",
            'handlers': r"on(\w+)\s*=",
            'custom_events': r"(?:dispatchEvent|new\s+CustomEvent)\(\s*['\"](\w+)['\"]",
            'inline_handlers': r"function\s+(?:handle|on)(\w+)"
        }
        
        found_events = {}
        for event_type, pattern in event_patterns.items():
            matches = re.finditer(pattern, content)
            event_names = []
            
            for match in matches:
                event_name = match.group(1)
                if event_name:
                    event_names.append(event_name)
            
            if event_names:
                found_events[event_type] = list(set(event_names))
        
        if found_events:
            events.append({
                'file': file_path,
                'events': found_events
            })
            
        return events
    
    def _process_html_file(self, content: str, file_path: Path) -> None:
        """Process HTML files, focusing on w3.css usage and structure"""
        rel_path = str(file_path.relative_to(self.project_root))
        
        # Extract w3.css classes
        w3css_classes = self._extract_w3css_classes(content, rel_path)
        if w3css_classes:
            # Merge with existing w3css data
            if rel_path not in self.documentation['frontend']['w3css_usage']:
                self.documentation['frontend']['w3css_usage'][rel_path] = w3css_classes
            else:
                for category, classes in w3css_classes.items():
                    if category in self.documentation['frontend']['w3css_usage'][rel_path]:
                        self.documentation['frontend']['w3css_usage'][rel_path][category].update(classes)
                    else:
                        self.documentation['frontend']['w3css_usage'][rel_path][category] = classes
    
    def _extract_w3css_classes(self, content: str, file_path: str) -> Dict[str, Set[str]]:
        """Extract w3.css class usage from HTML"""
        w3css_data = {
            'layout': set(),
            'colors': set(),
            'typography': set(),
            'effects': set(),
            'other': set()
        }
        
        # Find all class attributes
        class_pattern = r'class\s*=\s*["\']([^"\']+)["\']'
        class_matches = re.finditer(class_pattern, content)
        
        for match in class_matches:
            classes = match.group(1).split()
            for css_class in classes:
                if css_class.startswith('w3-'):
                    # Categorize the w3.css class
                    if any(layout_term in css_class for layout_term in 
                          ['container', 'panel', 'card', 'bar', 'row', 'col', 'half', 'third', 'quarter']):
                        w3css_data['layout'].add(css_class)
                    elif any(color_term in css_class for color_term in 
                            ['red', 'pink', 'purple', 'blue', 'green', 'yellow', 'amber', 
                             'orange', 'black', 'gray', 'white', 'light', 'dark']):
                        w3css_data['colors'].add(css_class)
                    elif any(typo_term in css_class for typo_term in 
                            ['text', 'font', 'wide', 'large', 'small', 'justify', 'center', 'bold', 'italic']):
                        w3css_data['typography'].add(css_class)
                    elif any(effect_term in css_class for effect_term in 
                            ['animate', 'hover', 'shadow', 'opacity', 'border', 'round']):
                        w3css_data['effects'].add(css_class)
                    else:
                        w3css_data['other'].add(css_class)
        
        # Convert sets to lists for easier JSON serialization
        return {k: list(v) for k, v in w3css_data.items() if v}
    def _process_css_file(self, content: str, file_path: Path) -> None:
        """Process CSS files, focusing on custom styles and w3.css extensions"""
        rel_path = str(file_path.relative_to(self.project_root))
        
        # Look for w3.css customizations or extensions
        if 'w3-' in content:
            w3_customizations = self._extract_w3css_customizations(content, rel_path)
            if 'w3css_customizations' not in self.documentation['frontend']:
                self.documentation['frontend']['w3css_customizations'] = []
            
            if w3_customizations:
                self.documentation['frontend']['w3css_customizations'].append(w3_customizations)
    
    def _extract_w3css_customizations(self, content: str, file_path: str) -> Dict[str, Any]:
        """Extract w3.css customizations from CSS files"""
        customizations = {
            'file': file_path,
            'overrides': [],
            'extensions': []
        }
        
        # Look for overrides of existing w3 classes
        override_pattern = r'\.w3-([a-zA-Z0-9-]+)\s*{([^}]+)}'
        for match in re.finditer(override_pattern, content, re.DOTALL):
            class_name = match.group(1)
            properties = match.group(2).strip()
            
            customizations['overrides'].append({
                'class': f'w3-{class_name}',
                'properties_count': len(properties.split(';')) - 1
            })
        
        # Look for extensions (custom classes following w3 patterns)
        extension_pattern = r'\.(?!w3-)([a-zA-Z0-9-]+)\s*{([^}]+\bw3-[^}]+)}'
        for match in re.finditer(extension_pattern, content, re.DOTALL):
            class_name = match.group(1)
            properties = match.group(2).strip()
            
            if 'w3-' in properties:
                customizations['extensions'].append({
                    'class': class_name,
                    'extends': 'w3.css'
                })
        
        return customizations
    
    def _extract_relationships(self) -> None:
        """Extract relationships between frontend and backend components"""
        # Model relationships
        self._extract_model_relationships()
        
        # Frontend-backend connections
        self._extract_frontend_backend_connections()
    
    def _extract_model_relationships(self) -> None:
        """Extract relationships between Django models"""
        models = self.documentation['backend']['models']
        relationships = []
        
        for model in models:
            related_models = []
            
            for field in model.get('fields', []):
                # Look for ForeignKey, OneToOneField, or ManyToManyField
                if field.get('type') in ['ForeignKey', 'OneToOneField', 'ManyToManyField']:
                    # Extract the related model from args if available
                    rel_model = None
                    for other_model in models:
                        if other_model['name'].lower() in str(field).lower():
                            rel_model = other_model['name']
                            break
                    
                    if rel_model:
                        related_models.append({
                            'field': field['name'],
                            'related_model': rel_model,
                            'relationship_type': field['type']
                        })
            
            if related_models:
                relationships.append({
                    'model': model['name'],
                    'relationships': related_models
                })
        
        self.documentation['relationships']['model_relationships'] = relationships

    def _extract_frontend_backend_connections(self) -> None:
        """Identify connections between frontend JS and backend endpoints"""
        js_components = self.documentation['frontend']['js_components']
        urls = self.documentation['backend']['urls']
        connections = []
        
        # For each JS component, look for fetch/ajax calls that might connect to endpoints
        for component in js_components:
            with open(component['file'], 'r', encoding='utf-8') as f:
                content = f.read()
                
                # Look for fetch/ajax/XMLHttpRequest calls
                api_call_patterns = [
                    r"fetch\(\s*['\"]([^'\"]+)['\"]",
                    r"\.ajax\(\s*{\s*url:\s*['\"]([^'\"]+)['\"]",
                    r"\.open\(\s*(?:['\"][^'\"]+['\"],\s*)?['\"]([^'\"]+)['\"]"
                ]
                
                endpoints_called = set()
                for pattern in api_call_patterns:
                    for match in re.finditer(pattern, content):
                        endpoint = match.group(1)
                        # Clean up the endpoint
                        if endpoint.startswith('/api/') or endpoint.endswith('.json'):
                            endpoints_called.add(endpoint)
                
                if endpoints_called:
                    # Find matching backend URLs
                    matched_urls = []
                    for endpoint in endpoints_called:
                        for url in urls:
                            # Convert Django URL pattern to regex for matching
                            url_pattern = url['route']
                            # Replace Django URL parameters with regex
                            url_regex = re.sub(r'<[^>]+>', r'[^/]+', url_pattern)
                            if re.match(f"^{url_regex}$", endpoint.lstrip('/')):
                                matched_urls.append(url['route'])
                    
                    connections.append({
                        'component': component['name'],
                        'endpoints_called': list(endpoints_called),
                        'matched_backend_urls': matched_urls
                    })
        
        self.documentation['relationships']['frontend_to_backend'] = connections
    
    def generate_documentation(self) -> None:
        """Generate documentation files"""
        print("Generating documentation...")
        
        # Scan project directory
        self.scan_directory()
        
        # Extract relationships
        self._extract_relationships()
        
        # Calculate summary statistics
        self._calculate_summary()
        
        # Generate output files
        self._generate_json_docs()
        self._generate_markdown_docs()
        
        print(f"Documentation generated successfully in {self.output_dir}")
    
    def _calculate_summary(self) -> None:
        """Calculate summary statistics for the project"""
        summary = {
            'python_files': sum(d['files']['python'] for d in self.documentation['structure']['directories']),
            'javascript_files': sum(d['files']['javascript'] for d in self.documentation['structure']['directories']),
            'html_files': sum(d['files']['html'] for d in self.documentation['structure']['directories']),
            'models_count': len(self.documentation['backend']['models']),
            'views_count': len(self.documentation['backend']['views']),
            'urls_count': len(self.documentation['backend']['urls']), 
            'js_components_count': len(self.documentation['frontend']['js_components']),
            'relationships': {
                'model_relationships': len(self.documentation['relationships']['model_relationships']),
                'frontend_backend_connections': len(self.documentation['relationships']['frontend_to_backend'])
            }
        }
        
        self.documentation['structure']['summary'] = summary
    def _generate_json_docs(self) -> None:
        """Generate JSON documentation file"""
        json_path = self.output_dir / 'project_documentation.json'
        
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(self.documentation, f, indent=2)
            
        print(f"JSON documentation generated: {json_path}")
    
    def _generate_markdown_docs(self) -> None:
        """Generate markdown documentation file"""
        md_path = self.output_dir / 'project_documentation.md'
        
        sections = [
            self._generate_header_section(),
            self._generate_structure_section(),
            self._generate_backend_section(),
            self._generate_frontend_section(),
            self._generate_relationships_section()
        ]
        
        with open(md_path, 'w', encoding='utf-8') as f:
            f.write('\n\n'.join(sections))
            
        print(f"Markdown documentation generated: {md_path}")
    
    def _generate_header_section(self) -> str:
        """Generate documentation header section with architectural principles"""
        project_name = self.documentation['metadata']['project_name']
        generated_at = self.documentation['metadata']['generated_at']
        
        # Add hardwired architectural concepts
        architecture_overview = """
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
    """
        
        return f"""# {project_name} Project Documentation

    {architecture_overview}

    ## Overview
    - **Generated:** {generated_at}
    - **Version:** {self.documentation['metadata']['version']}

    {self._generate_summary_section()}
"""

    def _generate_summary_section(self) -> str:
        """Generate project summary section"""
        summary = self.documentation['structure']['summary']
        
        return f"""## Project Summary
- **Python Files:** {summary['python_files']}
- **JavaScript Files:** {summary['javascript_files']}
- **HTML Files:** {summary['html_files']}
- **Django Models:** {summary['models_count']}
- **Django Views:** {summary['views_count']}
- **URL Patterns:** {summary['urls_count']}
- **JS Components:** {summary['js_components_count']}
- **Model Relationships:** {summary['relationships']['model_relationships']}
- **Frontend-Backend Connections:** {summary['relationships']['frontend_backend_connections']}
"""

    def _generate_structure_section(self) -> str:
        """Generate project structure section"""
        directories = sorted(self.documentation['structure']['directories'], 
                             key=lambda d: d['path'])
        
        structure_text = ["## Project Structure", "```"]
        
        for directory in directories:
            depth = directory['depth']
            indent = "  " * (depth - 1)
            dir_name = directory['path'].split('/')[-1]
            files_info = f"({directory['files']['python']}py, {directory['files']['javascript']}js, {directory['files']['html']}html)"
            structure_text.append(f"{indent}{dir_name}/ {files_info}")
            
        structure_text.append("```")
        return "\n".join(structure_text)

    def _generate_backend_section(self) -> str:
        """Generate backend documentation section focused only on relationships"""
        models = self.documentation['backend']['models']
        views = self.documentation['backend']['views']
        urls = self.documentation['backend']['urls']
        
        sections = ["## Backend Components"]
        
        # Models section - only show ForeignKeys
        if models:
            sections.append("### Django Models")
            for model in models:
                sections.append(f"#### {model['name']} - *{model['file']}*")
                
                # Filter only ForeignKey, OneToOneField, and ManyToManyField fields
                relationship_fields = [f for f in model.get('fields', []) 
                                    if f.get('type') in ['ForeignKey', 'OneToOneField', 'ManyToManyField']]
                
                if relationship_fields:
                    sections.append("Relationships:")
                    for field in relationship_fields:
                        required = "Required" if field.get('is_required', False) else "Optional"
                        sections.append(f"- **{field['name']}** ({field['type']}) - {required}")
                else:
                    sections.append("*No relationships defined*")
                    
                sections.append("")
        
        # Views section
        if views:
            view_counts = {'class': 0, 'function': 0}
            for view in views:
                view_counts[view.get('type', 'function')] += 1
                
            sections.append(f"### Django Views ({view_counts['class']} class-based, {view_counts['function']} function-based)")
            # List just the key views (limit to 10)
            if len(views) > 10:
                view_summary = views[:10]
                sections.append("*Showing 10 most important views:*")
            else:
                view_summary = views
                
            for view in view_summary:
                view_type = view.get('type', 'function')
                methods = ", ".join(view.get('methods', [])) if view.get('methods') else "GET"
                sections.append(f"- **{view['name']}** ({view_type}) - Methods: {methods}")
                
            sections.append("")
        
        # URLs section
        if urls:
            sections.append("### URL Patterns")
            # Group URLs by file
            url_files = {}
            for url in urls:
                if url['file'] not in url_files:
                    url_files[url['file']] = []
                url_files[url['file']].append(url)
            
            for file, file_urls in url_files.items():
                sections.append(f"**{file}**")
                for url in file_urls:
                    sections.append(f"- `{url['route']}` → {url['view']}")
                sections.append("")
        
        return "\n".join(sections)
    
    def _generate_frontend_section(self) -> str:
        """Generate frontend documentation section"""
        js_components = self.documentation['frontend']['js_components']
        w3css_usage = self.documentation['frontend']['w3css_usage']
        
        sections = ["## Frontend Components"]
        
        # JS Components section
        if js_components:
            sections.append("### JavaScript Components")
            for component in js_components:
                methods = ", ".join(component.get('methods', []))
                methods_display = f"Methods: {methods}" if methods else ""
                parent = f"extends {component['parent']}" if 'parent' in component else ""
                sections.append(f"- **{component['name']}** ({component['type']}) {parent} {methods_display}")
            sections.append("")
        
        # W3.CSS Usage section
        if w3css_usage:
            sections.append("### W3.CSS Usage")
            
            # Count w3.css classes by category
            category_counts = {
                'layout': 0,
                'colors': 0, 
                'typography': 0,
                'effects': 0,
                'other': 0
            }
            
            for file_classes in w3css_usage.values():
                for category, classes in file_classes.items():
                    if isinstance(classes, list):
                        category_counts[category] += len(classes)
            
            sections.append("#### W3.CSS Class Usage")
            for category, count in category_counts.items():
                if count > 0:
                    sections.append(f"- **{category.title()}:** {count} unique classes")
            
            sections.append("")
        
        return "\n".join(sections)
    
    def _generate_relationships_section(self) -> str:
        """Generate relationships documentation section"""
        model_relationships = self.documentation['relationships']['model_relationships']
        frontend_backend = self.documentation['relationships']['frontend_to_backend']
        
        sections = ["## Component Relationships"]
        
        # Model relationships
        if model_relationships:
            sections.append("### Model Relationships")
            for relation in model_relationships:
                sections.append(f"#### {relation['model']}")
                for rel in relation['relationships']:
                    sections.append(f"- {rel['field']} → {rel['related_model']} ({rel['relationship_type']})")
            sections.append("")
        
        # Frontend-Backend connections
        if frontend_backend:
            sections.append("### Frontend-Backend Connections")
            for connection in frontend_backend:
                endpoints = ", ".join(connection['endpoints_called'])
                sections.append(f"- **{connection['component']}** → {endpoints}")
            sections.append("")
        
        return "\n".join(sections)


if __name__ == "__main__":
    generator = ProjectDocumentationGenerator()
    generator.generate_documentation()