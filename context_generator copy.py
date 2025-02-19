import os
import json
import subprocess
from datetime import datetime
import re
from pathlib import Path
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any

@dataclass
class ComponentDoc:
    name: str
    file_path: str
    type: str
    methods: List[str] = field(default_factory=list)
    dependencies: List[str] = field(default_factory=list)
    events_emitted: List[str] = field(default_factory=list)
    events_handled: List[str] = field(default_factory=list)
    state_dependencies: List[str] = field(default_factory=list)

@dataclass
class ObserverDoc:
    name: str
    file_path: str
    observed_states: List[str]
    update_patterns: List[str]
    dependencies: List[str] = field(default_factory=list)

@dataclass
class StateDoc:
    name: str
    file_path: str
    subscribers: List[str]
    mutation_patterns: List[str]
    persistence: bool = False

class ECAMDocumentationGenerator:
    def __init__(self):
        print("Initializing enhanced documentation generator...")
        
        # Initialize pathspec for gitignore handling
        self.pathspec_available = self._init_pathspec()
        
        # Project paths setup
        self._init_project_paths()
        
        # Load gitignore patterns
        self.gitignore_spec = self.load_gitignore()
        
        # Initialize enhanced documentation structure
        self.documentation = {
            'metadata': {
                'generated_at': datetime.now().isoformat(),
                'version': '2.0.0',
                'project_name': 'ECAM_WEB'
            },
            'architecture': {
                'patterns': [],
                'data_flow': [],
                'state_management': [],
                'event_system': []
            },
            'frontend': {
                'components': [],
                'observers': [],
                'subscribers': [],
                'state_management': {
                    'stores': [],
                    'mutations': [],
                    'subscriptions': []
                },
                'ui_patterns': {
                    'w3styles': [],
                    'layouts': [],
                    'components': []
                },
                'performance': {
                    'lazy_loading': [],
                    'code_splitting': [],
                    'caching': []
                },
                'security': {
                    'csrf_handling': [],
                    'input_validation': [],
                    'auth_flows': []
                }
            },
            'backend': {
                'models': [],
                'views': [],
                'serializers': [],
                'urls': [],
                'middleware': [],
                'services': [],
                'data_access': {
                    'queries': [],
                    'repositories': []
                },
                'async_tasks': [],
                'caching': [],
                'security': {
                    'permissions': [],
                    'validations': []
                }
            },
            'api': {
                'endpoints': [],
                'response_formats': [],
                'error_handling': [],
                'rate_limiting': []
            },
            'dependencies': {
                'python': [],
                'javascript': [],
                'css': []
            }
        }
        
        # Component relationship tracking
        self.component_relationships = {}
        self.state_dependencies = {}
        self.event_flows = {}
        
    def _init_pathspec(self) -> bool:
        """Initialize pathspec library for gitignore handling."""
        try:
            import pathspec
            print("pathspec library available")
            return True
        except ImportError:
            print("Warning: pathspec library not installed. .gitignore patterns will not be respected.")
            print("Install with: pip install pathspec")
            return False
            
    def _init_project_paths(self):
        """Initialize project directory paths."""
        self.project_root = Path.cwd()
        print(f"Project root: {self.project_root}")
        
        # Define project structure
        self.paths = {
            'output': self.project_root / 'design',
            'main_app': self.project_root / 'main',
            'ecam_web': self.project_root / 'ecam_web',
            'queries': self.project_root / 'queries',
            'static': self.project_root / 'static',
            'requirements': self.project_root / 'requirements.txt'
        }
        
        # Create output directory if it doesn't exist
        self.paths['output'].mkdir(exist_ok=True)
    
    def should_process_file(self, file_path: Path) -> bool:
        """Enhanced determination if a file should be processed."""
        rel_path = file_path.relative_to(self.project_root)
        print(f"Checking if should process: {rel_path}")
        
        # Skip if file is in ignored patterns
        if self.is_ignored(file_path):
            print(f"File is ignored: {rel_path}")
            return False
            
        # Configuration for file processing
        config = {
            '.py': {'max_size': 1024 * 1024},  # 1MB
            '.js': {'max_size': 512 * 1024},   # 500KB
            '.html': {'max_size': 256 * 1024}, # 250KB
            '.css': {'max_size': 256 * 1024}   # 250KB
        }
        
        # Check file extension
        if file_path.suffix not in config:
            print(f"Invalid extension: {file_path.suffix}")
            return False
            
        # Check file size
        if file_path.stat().st_size > config[file_path.suffix]['max_size']:
            print(f"File too large: {rel_path}")
            return False
            
        # Skip specific patterns
        skip_patterns = [
            r'migrations',
            r'tests?[/\\]',
            r'test_.*\.py$',
            r'.*\.min\.js$',
            r'.*\.test\.js$',
            r'.*\.spec\.js$',
            r'__pycache__',
            r'node_modules',
            r'venv',
            r'env'
        ]
        
        if any(re.search(pattern, str(rel_path)) for pattern in skip_patterns):
            print(f"Skipping matched pattern: {rel_path}")
            return False
            
        print(f"Will process file: {rel_path}")
        return True

    def refresh_dependencies(self) -> bool:
        """Enhanced dependency management and analysis."""
        try:
            # Python dependencies
            result = subprocess.run(['pip', 'freeze'], capture_output=True, text=True)
            if result.returncode == 0:
                requirements = result.stdout
                with open(self.paths['requirements'], 'w') as f:
                    f.write(requirements)
                print("Updated requirements.txt")
                return self.capture_dependencies()
            else:
                print(f"Error running pip freeze: {result.stderr}")
                return False
        except Exception as e:
            print(f"Error refreshing dependencies: {e}")
            return False

    def capture_dependencies(self) -> bool:
        """Enhanced dependency capture with version analysis."""
        try:
            if not self.paths['requirements'].exists():
                print("requirements.txt not found")
                return False

            with open(self.paths['requirements']) as f:
                requirements = f.read()

            # Parse requirements with version constraints
            dependency_pattern = r'^([^=]+)==([^;]+)(?:;(.+))?$'
            
            self.documentation['dependencies']['python'] = []
            
            for line in requirements.split('\n'):
                if not line.strip() or line.startswith('#'):
                    continue
                    
                match = re.match(dependency_pattern, line.strip())
                if match:
                    name, version, constraints = match.groups()
                    dep_info = {
                        'name': name.strip(),
                        'version': version.strip(),
                        'required_by': [],
                        'constraints': constraints.strip() if constraints else None,
                        'is_direct': self._is_direct_dependency(name.strip())
                    }
                    self.documentation['dependencies']['python'].append(dep_info)
            
            return True
        except Exception as e:
            print(f"Error capturing dependencies: {e}")
            return False

    def _is_direct_dependency(self, package_name: str) -> bool:
        """Check if a package is a direct dependency or a sub-dependency."""
        try:
            result = subprocess.run(
                ['pip', 'show', package_name], 
                capture_output=True, 
                text=True
            )
            if result.returncode == 0:
                # If Required-by is empty, it's a direct dependency
                return 'Required-by: ' not in result.stdout or \
                       'Required-by: \n' in result.stdout
            return False
        except Exception:
            return False
    def scan_directory(self, dir_path: Path) -> None:
        """Enhanced recursive directory scanning with better error handling."""
        print(f"Scanning directory: {dir_path}")
        try:
            for root, dirs, files in os.walk(dir_path):
                # Remove ignored directories in-place
                dirs[:] = [d for d in dirs if not self.is_ignored(Path(root) / d)]
                
                # Process each file
                for file in files:
                    full_path = Path(root) / file
                    try:
                        if self.should_process_file(full_path):
                            self._process_file_with_tracking(full_path)
                    except Exception as e:
                        print(f"Error processing file {full_path}: {e}")
                        continue
        except Exception as e:
            print(f"Error scanning directory {dir_path}: {e}")

    def _process_file_with_tracking(self, file_path: Path) -> None:
        """Process file with dependency and relationship tracking."""
        try:
            with open(file_path, encoding='utf-8') as f:
                content = f.read()

            # Track processing start time
            start_time = datetime.now()

            # Process based on file type
            suffix = file_path.suffix
            if suffix == '.py':
                self._process_python_file(content, file_path)
            elif suffix == '.js':
                self._process_javascript_file(content, file_path)
            elif suffix == '.html':
                self._process_html_file(content, file_path)
            elif suffix == '.css':
                self._process_css_file(content, file_path)

            # Track processing duration
            duration = datetime.now() - start_time
            print(f"Processed {file_path} in {duration.total_seconds():.2f} seconds")

        except Exception as e:
            print(f"Error in file processing: {e}")
            raise

    def _process_javascript_file(self, content: str, file_path: Path) -> None:
        """Enhanced JavaScript file processing with pattern detection."""
        print(f"Processing JavaScript file: {file_path}")

        # Extract architectural patterns
        patterns = self.extract_architectural_patterns(content, file_path)
        self.documentation['architecture']['patterns'].extend([
            {'file': str(file_path), 'pattern': pattern}
            for category, patterns_list in patterns.items()
            for pattern in patterns_list
        ])

        # Extract component information
        components = self._extract_js_components(content, file_path)
        if components:
            self.documentation['frontend']['components'].extend(components)

        # Extract state management
        state_info = self.extract_state_management(content, file_path)
        if state_info['stores'] or state_info['mutations'] or state_info['subscriptions']:
            self.documentation['frontend']['state_management']['stores'].extend(state_info['stores'])
            self.documentation['frontend']['state_management']['mutations'].extend(state_info['mutations'])
            self.documentation['frontend']['state_management']['subscriptions'].extend(state_info['subscriptions'])

        # Track dependencies
        dependencies = self.extract_component_dependencies(content, file_path)
        if dependencies:
            rel_path = str(file_path.relative_to(self.project_root))
            self.component_relationships[rel_path] = dependencies

    def _extract_js_components(self, content: str, file_path: Path) -> List[Dict[str, Any]]:
        """Extract JavaScript component information with enhanced pattern detection."""
        components = []
        
        # Class-based components
        class_pattern = r'class\s+(\w+)(?:\s+extends\s+(\w+))?\s*{([^}]+)}'
        for match in re.finditer(class_pattern, content, re.DOTALL):
            class_name, parent_class, class_body = match.groups()
            
            # Extract methods
            methods = re.findall(r'\b(?:async\s+)?(?:function\s+)?(\w+)\s*\([^)]*\)\s*{', class_body)
            
            # Extract event handlers
            event_handlers = re.findall(r'(?:on|handle)(\w+)\s*[=:]\s*(?:function|\([^)]*\)\s*=>)', class_body)
            
            # Extract state usage
            state_usage = re.findall(r'(?:this\.)?state\.(\w+)', class_body)
            
            components.append({
                'name': class_name,
                'type': 'class',
                'parent': parent_class,
                'file': str(file_path.relative_to(self.project_root)),
                'methods': methods,
                'event_handlers': event_handlers,
                'state_dependencies': list(set(state_usage))
            })
            
        # Function components
        func_pattern = r'(?:export\s+)?(?:const|function)\s+(\w+)\s*=?\s*(?:\([^)]*\))?\s*=>\s*{([^}]+)}'
        for match in re.finditer(func_pattern, content, re.DOTALL):
            func_name, func_body = match.groups()
            
            # Extract hooks usage
            hooks_usage = re.findall(r'use(\w+)\(', func_body)
            
            # Extract event handlers
            event_handlers = re.findall(r'(?:on|handle)(\w+)\s*=\s*(?:\([^)]*\)\s*=>)', func_body)
            
            components.append({
                'name': func_name,
                'type': 'function',
                'file': str(file_path.relative_to(self.project_root)),
                'hooks': hooks_usage,
                'event_handlers': event_handlers
            })
            
        return components
    def _process_python_file(self, content: str, file_path: Path) -> None:
        """Enhanced Python file processing with comprehensive pattern detection."""
        print(f"Processing Python file: {file_path}")

        # Extract Django models
        if 'models.Model' in content:
            models = self._extract_django_models(content, file_path)
            self.documentation['backend']['models'].extend(models)

        # Extract DRF views and viewsets
        if 'rest_framework' in content:
            api_components = self._extract_drf_components(content, file_path)
            self.documentation['backend']['views'].extend(api_components.get('views', []))
            self.documentation['api']['endpoints'].extend(api_components.get('endpoints', []))

        # Extract service patterns
        if 'class' in content and ('Service' in content or 'Manager' in content):
            services = self._extract_service_patterns(content, file_path)
            self.documentation['backend']['services'].extend(services)

        # Extract data access patterns
        if any(pattern in content for pattern in ['objects.filter', 'objects.get', 'objects.update']):
            data_access = self._extract_data_access_patterns(content, file_path)
            self.documentation['backend']['data_access']['queries'].extend(data_access)

        # Extract async patterns
        if any(pattern in content for pattern in ['async def', 'await', '@asyncio']):
            async_patterns = self._extract_async_patterns(content, file_path)
            self.documentation['backend']['async_tasks'].extend(async_patterns)

    def _extract_django_models(self, content: str, file_path: Path) -> List[Dict[str, Any]]:
        """Extract Django model definitions with enhanced field analysis."""
        models = []
        model_pattern = r"class\s+(\w+)\(models\.Model\):\s*(.*?)(?=\n\s*class|\Z)"
        
        for match in re.finditer(model_pattern, content, re.DOTALL):
            model_name, model_body = match.groups()
            
            # Extract fields with their complete definitions
            fields = []
            field_pattern = r"^\s*(\w+)\s*=\s*models\.(\w+)\((.*?)\)"
            
            for field_match in re.finditer(field_pattern, model_body, re.MULTILINE):
                field_name, field_type, field_args = field_match.groups()
                
                # Parse field arguments
                args = self._parse_field_arguments(field_args)
                
                fields.append({
                    'name': field_name,
                    'type': field_type,
                    'arguments': args,
                    'is_required': 'null=True' not in field_args and 'blank=True' not in field_args
                })
            
            # Extract model meta options
            meta_options = self._extract_model_meta(model_body)
            
            # Extract model methods
            methods = self._extract_model_methods(model_body)
            
            models.append({
                'name': model_name,
                'file': str(file_path.relative_to(self.project_root)),
                'fields': fields,
                'meta': meta_options,
                'methods': methods,
                'relationships': self._extract_model_relationships(fields)
            })
        
        return models

    def _parse_field_arguments(self, args_str: str) -> Dict[str, Any]:
        """Parse Django model field arguments into structured format."""
        args_dict = {}
        current_key = None
        current_value = []
        in_parentheses = 0
        
        tokens = args_str.split(',')
        
        for token in tokens:
            token = token.strip()
            
            # Handle positional arguments
            if '=' not in token:
                if current_key is None:
                    args_dict[f'pos_arg_{len(args_dict)}'] = token
                else:
                    current_value.append(token)
                continue
            
            # Handle keyword arguments
            if current_key is None:
                key, value = token.split('=', 1)
                current_key = key.strip()
                current_value = [value.strip()]
            
            # Track nested parentheses
            in_parentheses += token.count('(') - token.count(')')
            
            # If we've closed all parentheses, save the argument
            if in_parentheses == 0:
                args_dict[current_key] = ','.join(current_value).strip()
                current_key = None
                current_value = []
        
        return args_dict

    def _extract_model_meta(self, model_body: str) -> Dict[str, Any]:
        """Extract model Meta class options."""
        meta_pattern = r"class\s+Meta:\s*(.*?)(?=\n\s*(?:def|\s*class|\Z))"
        meta_match = re.search(meta_pattern, model_body, re.DOTALL)
        
        if not meta_match:
            return {}
            
        meta_body = meta_match.group(1)
        meta_options = {}
        
        # Extract common meta options
        options_to_extract = [
            'verbose_name',
            'verbose_name_plural',
            'db_table',
            'ordering',
            'indexes',
            'constraints',
            'permissions',
            'unique_together'
        ]
        
        for option in options_to_extract:
            pattern = fr'{option}\s*=\s*(.+?)(?=\n\s*\w+\s*=|\Z)'
            match = re.search(pattern, meta_body, re.DOTALL)
            if match:
                meta_options[option] = self._clean_meta_value(match.group(1))
        
        return meta_options

    def _clean_meta_value(self, value: str) -> Any:
        """Clean and parse Meta class values."""
        value = value.strip()
        if value.startswith('[') and value.endswith(']'):
            # Parse list values
            return [item.strip(" '\"") for item in value[1:-1].split(',') if item.strip()]
        if value.startswith('{') and value.endswith('}'):
            # Parse dict values
            return {k.strip(" '\""): v.strip(" '\"") for k, v in 
                   [pair.split(':') for pair in value[1:-1].split(',') if ':' in pair]}
        return value.strip(" '\"")

    def _extract_model_methods(self, model_body: str) -> List[Dict[str, Any]]:
        """Extract model methods with documentation and parameters."""
        methods = []
        method_pattern = r"def\s+(\w+)\s*\((self(?:,\s*[^)]+)?)\):\s*(['\"].*?['\"])?\s*(.*?)(?=\n\s*(?:def|\s*class|\Z))"
        
        for match in re.finditer(method_pattern, model_body, re.DOTALL):
            name, params, docstring, body = match.groups()
            
            methods.append({
                'name': name,
                'parameters': [p.strip() for p in params.split(',') if p.strip()],
                'docstring': docstring.strip("'\"") if docstring else None,
                'is_property': bool(re.search(r'@property', body)),
                'accesses_fields': self._extract_field_access(body)
            })
        
        return methods

    def _extract_model_relationships(self, fields: List[Dict[str, Any]]) -> Dict[str, List[str]]:
        """Extract model relationship information."""
        relationships = {
            'foreign_keys': [],
            'many_to_many': [],
            'one_to_one': []
        }
        
        for field in fields:
            if field['type'] in ['ForeignKey', 'OneToOneField']:
                relationships['foreign_keys'].append(field['name'])
            elif field['type'] == 'ManyToManyField':
                relationships['many_to_many'].append(field['name'])
            elif field['type'] == 'OneToOneField':
                relationships['one_to_one'].append(field['name'])
        
        return relationships
    def _extract_drf_components(self, content: str, file_path: Path) -> Dict[str, List[Dict[str, Any]]]:
        """Extract DRF views, viewsets, and their configurations."""
        components = {
            'views': [],
            'endpoints': [],
            'serializers': []
        }
        
        # Extract ViewSets
        viewset_pattern = r"class\s+(\w+)(?:ViewSet|ModelViewSet)\(.*?\):\s*(.*?)(?=\n\s*class|\Z)"
        for match in re.finditer(viewset_pattern, content, re.DOTALL):
            name, body = match.groups()
            viewset_info = self._analyze_viewset(name, body, file_path)
            components['views'].append(viewset_info)
            components['endpoints'].extend(self._generate_viewset_endpoints(viewset_info))

        # Extract APIViews
        apiview_pattern = r"class\s+(\w+)(?:APIView)\(.*?\):\s*(.*?)(?=\n\s*class|\Z)"
        for match in re.finditer(apiview_pattern, content, re.DOTALL):
            name, body = match.groups()
            view_info = self._analyze_apiview(name, body, file_path)
            components['views'].append(view_info)
            components['endpoints'].extend(self._generate_apiview_endpoints(view_info))

        # Extract Serializers
        serializer_pattern = r"class\s+(\w+)Serializer\(.*?\):\s*(.*?)(?=\n\s*class|\Z)"
        for match in re.finditer(serializer_pattern, content, re.DOTALL):
            name, body = match.groups()
            serializer_info = self._analyze_serializer(name, body, file_path)
            components['serializers'].append(serializer_info)

        return components

    def _analyze_viewset(self, name: str, body: str, file_path: Path) -> Dict[str, Any]:
        """Analyze DRF ViewSet implementation details."""
        return {
            'name': name,
            'type': 'ViewSet',
            'file': str(file_path.relative_to(self.project_root)),
            'queryset': self._extract_queryset(body),
            'serializer_class': self._extract_serializer_class(body),
            'permissions': self._extract_permissions(body),
            'filters': self._extract_filters(body),
            'actions': self._extract_viewset_actions(body),
            'mixins': self._extract_mixins(body)
        }

    def _analyze_apiview(self, name: str, body: str, file_path: Path) -> Dict[str, Any]:
        """Analyze DRF APIView implementation details."""
        return {
            'name': name,
            'type': 'APIView',
            'file': str(file_path.relative_to(self.project_root)),
            'methods': self._extract_http_methods(body),
            'permissions': self._extract_permissions(body),
            'authentication': self._extract_authentication(body),
            'request_validation': self._extract_validation(body)
        }

    def _analyze_serializer(self, name: str, body: str, file_path: Path) -> Dict[str, Any]:
        """Analyze DRF Serializer implementation details."""
        return {
            'name': name,
            'file': str(file_path.relative_to(self.project_root)),
            'fields': self._extract_serializer_fields(body),
            'validations': self._extract_serializer_validations(body),
            'nested_serializers': self._extract_nested_serializers(body),
            'meta': self._extract_serializer_meta(body)
        }

    def _process_html_file(self, content: str, file_path: Path) -> None:
        """Process HTML templates with enhanced pattern detection."""
        print(f"Processing HTML file: {file_path}")

        # Extract template patterns
        template_patterns = self._extract_template_patterns(content, file_path)
        
        # Extract W3.CSS usage
        w3css_info = self._extract_w3css_usage(content, file_path)
        if w3css_info:
            self.documentation['frontend']['ui_patterns']['w3styles'].extend(w3css_info)

        # Extract layout patterns
        layout_patterns = self._extract_layout_patterns(content, file_path)
        if layout_patterns:
            self.documentation['frontend']['ui_patterns']['layouts'].extend(layout_patterns)

        # Extract component usage
        component_usage = self._extract_component_usage(content, file_path)
        if component_usage:
            self.documentation['frontend']['ui_patterns']['components'].extend(component_usage)

    def _extract_template_patterns(self, content: str, file_path: Path) -> List[Dict[str, Any]]:
        """Extract Django template patterns and usage."""
        patterns = []
        
        # Extract template tags
        template_tags = re.finditer(r'{%\s*(.*?)\s*%}', content)
        unique_tags = set()
        for match in template_tags:
            tag = match.group(1).split()[0]
            unique_tags.add(tag)

        # Extract template variables
        template_vars = re.finditer(r'{{(.*?)}}', content)
        unique_vars = set(var.group(1).strip() for var in template_vars)

        # Extract template filters
        filter_pattern = r'{{\s*.*?\|\s*(\w+).*?}}'
        filters = re.finditer(filter_pattern, content)
        unique_filters = set(f.group(1) for f in filters)

        # Extract template blocks
        blocks = re.finditer(r'{%\s*block\s+(\w+)\s*%}', content)
        block_names = set(b.group(1) for b in blocks)

        patterns.append({
            'file': str(file_path.relative_to(self.project_root)),
            'tags_used': list(unique_tags),
            'variables_used': list(unique_vars),
            'filters_used': list(unique_filters),
            'blocks_defined': list(block_names)
        })

        return patterns

    def _extract_w3css_usage(self, content: str, file_path: Path) -> List[Dict[str, Any]]:
        """Extract W3.CSS class usage and patterns."""
        patterns = []
        
        # Class usage analysis
        class_pattern = r'class=["\']([^"\']*w3-[^"\']*)["\']'
        classes = re.finditer(class_pattern, content)
        unique_classes = set()
        
        for match in classes:
            class_list = match.group(1).split()
            w3_classes = [c for c in class_list if c.startswith('w3-')]
            unique_classes.update(w3_classes)

        # Responsive patterns
        responsive_classes = {c for c in unique_classes 
                            if any(p in c for p in ['s', 'm', 'l', 'xl'])}

        # Color theme usage
        color_classes = {c for c in unique_classes 
                        if any(color in c for color in ['red', 'green', 'blue', 'white', 'black', 'grey'])}

        patterns.append({
            'file': str(file_path.relative_to(self.project_root)),
            'classes': list(unique_classes),
            'responsive_patterns': list(responsive_classes),
            'color_usage': list(color_classes)
        })

        return patterns
    def _process_css_file(self, content: str, file_path: Path) -> None:
        """Process CSS files with enhanced pattern detection."""
        print(f"Processing CSS file: {file_path}")

        # Extract W3.CSS customizations
        w3css_customizations = self._extract_w3css_customizations(content, file_path)
        if w3css_customizations:
            self.documentation['frontend']['ui_patterns']['w3styles'].extend(w3css_customizations)

        # Extract responsive patterns
        responsive_patterns = self._extract_css_responsive_patterns(content, file_path)
        if responsive_patterns:
            self.documentation['frontend']['ui_patterns']['layouts'].extend(responsive_patterns)

        # Extract theme configurations
        theme_config = self._extract_theme_configuration(content, file_path)
        if theme_config:
            if 'theming' not in self.documentation['frontend']:
                self.documentation['frontend']['theming'] = []
            self.documentation['frontend']['theming'].extend(theme_config)

    def _extract_w3css_customizations(self, content: str, file_path: Path) -> List[Dict[str, Any]]:
        """Extract and analyze W3.CSS customizations."""
        customizations = []
        
        # Extract class overrides
        overrides = re.finditer(r'\.w3-([a-zA-Z0-9-]+)\s*{([^}]+)}', content)
        override_details = {}
        
        for match in overrides:
            class_name = match.group(1)
            properties = match.group(2)
            override_details[class_name] = self._parse_css_properties(properties)

        # Extract custom color themes
        color_themes = re.finditer(r'\.theme-([a-zA-Z0-9-]+)\s*{([^}]+)}', content)
        theme_details = {}
        
        for match in color_themes:
            theme_name = match.group(1)
            properties = match.group(2)
            theme_details[theme_name] = self._parse_css_properties(properties)

        if override_details or theme_details:
            customizations.append({
                'file': str(file_path.relative_to(self.project_root)),
                'overrides': override_details,
                'themes': theme_details
            })

        return customizations

    def _parse_css_properties(self, properties_str: str) -> Dict[str, str]:
        """Parse CSS properties into structured format."""
        properties = {}
        for prop in properties_str.split(';'):
            prop = prop.strip()
            if ':' in prop:
                key, value = prop.split(':', 1)
                properties[key.strip()] = value.strip()
        return properties

    def generate_documentation(self) -> None:
        """Generate comprehensive documentation in multiple formats."""
        print("Generating ECAM Web documentation...")

        # Create design directory if it doesn't exist
        self.paths['output'].mkdir(exist_ok=True)

        # Process dependencies
        self.refresh_dependencies()

        # Scan project directories
        for path in self.paths.values():
            if isinstance(path, Path) and path.is_dir() and path != self.paths['output']:
                print(f"\nScanning {path}...")
                self.scan_directory(path)

        # Generate documentation files
        self._generate_markdown_docs()
        self._generate_json_docs()
        self._generate_architectural_diagrams()
        self._save_timestamp()

    def _generate_markdown_docs(self) -> None:
        """Generate detailed markdown documentation."""
        md_sections = [
            self._generate_header_section(),
            self._generate_architecture_section(),
            self._generate_frontend_section(),
            self._generate_backend_section(),
            self._generate_api_section(),
            self._generate_dependency_section()
        ]

        markdown = '\n\n'.join(md_sections)
        docs_path = self.paths['output'] / 'documentation.md'
        
        with open(docs_path, 'w', encoding='utf-8') as f:
            f.write(markdown)
        print(f"Generated markdown documentation: {docs_path}")

    def _generate_header_section(self) -> str:
        """Generate documentation header section."""
        return f"""# ECAM Web Documentation

## Overview
Generated on: {self.documentation['metadata']['generated_at']}
Version: {self.documentation['metadata']['version']}

## Project Structure
```
ECAM_WEB/
├── design/          # Documentation and design assets
├── ecam_web/        # Django project configuration
├── main/            # Main application code
├── queries/         # Database queries and data access
├── static/          # Static files (JS, CSS, etc.)
└── .vscode/         # Development environment settings
```"""

    def _generate_architecture_section(self) -> str:
        """Generate architecture documentation section."""
        sections = ["## Architecture\n"]
        
        # Add patterns section
        if self.documentation['architecture']['patterns']:
            sections.append("### Design Patterns")
            sections.append("The following design patterns are implemented throughout the application:\n")
            for pattern in self.documentation['architecture']['patterns']:
                sections.append(f"- **{pattern['pattern']}** ({pattern['file']})")

        # Add data flow section
        if self.documentation['architecture']['data_flow']:
            sections.append("\n### Data Flow")
            sections.append("Key data flows in the application:\n")
            for flow in self.documentation['architecture']['data_flow']:
                sections.append(f"- {flow}")

        # Add state management section
        if self.documentation['architecture']['state_management']:
            sections.append("\n### State Management")
            sections.append("State management strategies:\n")
            for strategy in self.documentation['architecture']['state_management']:
                sections.append(f"- {strategy}")

        return '\n'.join(sections)

    def _generate_json_docs(self) -> None:
        """Generate detailed JSON documentation."""
        json_path = self.paths['output'] / 'documentation.json'
        
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(self.documentation, f, indent=2, ensure_ascii=False)
        print(f"Generated JSON documentation: {json_path}")

    def _generate_architectural_diagrams(self) -> None:
        """Generate architectural diagrams using Mermaid syntax."""
        diagrams = []
        
        # Generate component relationship diagram
        if self.component_relationships:
            diagrams.append(self._generate_component_diagram())
            
        # Generate data flow diagram
        if self.documentation['architecture']['data_flow']:
            diagrams.append(self._generate_data_flow_diagram())
            
        # Generate state management diagram
        if self.documentation['architecture']['state_management']:
            diagrams.append(self._generate_state_diagram())

        if diagrams:
            diagrams_path = self.paths['output'] / 'architecture_diagrams.md'
            with open(diagrams_path, 'w', encoding='utf-8') as f:
                f.write('\n\n'.join(diagrams))
            print(f"Generated architectural diagrams: {diagrams_path}")

    def _save_timestamp(self) -> None:
        """Save documentation generation timestamp."""
        timestamp_path = self.paths['output'] / 'last_updated.txt'
        with open(timestamp_path, 'w', encoding='utf-8') as f:
            f.write(f"Documentation last updated: {datetime.now().isoformat()}")
        print(f"Saved timestamp: {timestamp_path}")
    def _generate_component_diagram(self) -> str:
        """Generate component relationship diagram using Mermaid."""
        diagram = ["```mermaid", "graph TD"]
        
        # Add nodes for each component
        components = set()
        for src, deps in self.component_relationships.items():
            components.add(src)
            for dep in deps:
                if 'inherits' in dep:
                    components.add(dep.split(': ')[1])
                elif 'injected' in dep:
                    components.add(dep.split(': ')[1])

        # Add node definitions
        for comp in components:
            node_id = f"node_{len(diagram)}"
            diagram.append(f"    {node_id}[{comp}]")

        # Add relationships
        for src, deps in self.component_relationships.items():
            src_id = f"node_{list(components).index(src) + 2}"
            for dep in deps:
                if 'inherits' in dep:
                    target = dep.split(': ')[1]
                    target_id = f"node_{list(components).index(target) + 2}"
                    diagram.append(f"    {src_id} --|extends| {target_id}")
                elif 'injected' in dep:
                    target = dep.split(': ')[1]
                    target_id = f"node_{list(components).index(target) + 2}"
                    diagram.append(f"    {src_id} -.->|uses| {target_id}")

        diagram.append("```")
        return '\n'.join(diagram)

    def _generate_data_flow_diagram(self) -> str:
        """Generate data flow diagram using Mermaid."""
        diagram = ["```mermaid", "graph LR"]
        
        # Add nodes for each component type
        diagram.extend([
            "    UI[User Interface]",
            "    API[API Layer]",
            "    SVC[Services]",
            "    DAL[Data Access]",
            "    DB[(Database)]"
        ])
        
        # Add standard flow
        diagram.extend([
            "    UI --> API",
            "    API --> SVC",
            "    SVC --> DAL",
            "    DAL --> DB"
        ])
        
        # Add state management if present
        if self.documentation['frontend']['state_management']['stores']:
            diagram.extend([
                "    STATE[State Store]",
                "    UI --> STATE",
                "    STATE --> UI"
            ])
        
        diagram.append("```")
        return '\n'.join(diagram)

    def _generate_state_diagram(self) -> str:
        """Generate state management diagram using Mermaid."""
        diagram = ["```mermaid", "stateDiagram-v2"]
        
        # Add states from state management documentation
        states = set()
        transitions = set()
        
        for store in self.documentation['frontend']['state_management']['stores']:
            if 'definition' in store:
                states.add(store['definition'])
        
        for mutation in self.documentation['frontend']['state_management']['mutations']:
            if 'pattern' in mutation:
                source, target = self._parse_mutation_pattern(mutation['pattern'])
                if source and target:
                    transitions.add((source, target))
        
        # Add state definitions
        for state in states:
            diagram.append(f"    {state}")
        
        # Add transitions
        for source, target in transitions:
            diagram.append(f"    {source} --> {target}")
        
        diagram.append("```")
        return '\n'.join(diagram)

    def _parse_mutation_pattern(self, pattern: str) -> tuple[str, str]:
            """Parse state mutation pattern to extract source and target states."""
            # This is a simplified example - enhance based on your actual mutation patterns
            parts = pattern.split('->')
            if len(parts) == 2:
                return parts[0].strip(), parts[1].strip()
            return None, None

    def _format_markdown_table(self, headers: List[str], rows: List[List[str]]) -> str:
        """Utility function to format markdown tables."""
        if not rows:
            return ""
            
        # Calculate column widths
        col_widths = [len(h) for h in headers]
        for row in rows:
            for i, cell in enumerate(row):
                col_widths[i] = max(col_widths[i], len(str(cell)))
        
        # Format headers
        header_row = "| " + " | ".join(h.ljust(w) for h, w in zip(headers, col_widths)) + " |"
        separator = "|" + "|".join("-" * (w + 2) for w in col_widths) + "|"
        
        # Format data rows
        data_rows = []
        for row in rows:
            formatted_row = "| " + " | ".join(str(cell).ljust(w) for cell, w in zip(row, col_widths)) + " |"
            data_rows.append(formatted_row)
        
        return "\n".join([header_row, separator] + data_rows)

    def _clean_html_content(self, content: str) -> str:
        """Clean HTML content for documentation."""
        # Remove comments
        content = re.sub(r'<!--.*?-->', '', content, flags=re.DOTALL)
        # Remove extra whitespace
        content = re.sub(r'\s+', ' ', content)
        # Remove script and style tags
        content = re.sub(r'<script.*?</script>', '', content, flags=re.DOTALL)
        content = re.sub(r'<style.*?</style>', '', content, flags=re.DOTALL)
        return content.strip()

if __name__ == '__main__':
    generator = ECAMDocumentationGenerator()
    generator.generate_documentation()