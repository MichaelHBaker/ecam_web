import os
import hashlib
from django.core.management.base import BaseCommand
from django.conf import settings
from django.core.management import call_command

class Command(BaseCommand):
    help = 'Run tests and regenerate test files if dependencies have changed'

    def handle(self, *args, **options):
        base_dir = settings.BASE_DIR
        dependency_file = os.path.join(base_dir, 'test_dependencies.txt')
        test_files_dir = os.path.join(base_dir, 'test_files')

        if not check_dependencies(base_dir, dependency_file) or not os.path.exists(test_files_dir):
            self.stdout.write(self.style.WARNING('Dependencies changed or test files missing. Regenerating...'))
            
            # Remove existing test files
            if os.path.exists(test_files_dir):
                for file in os.listdir(test_files_dir):
                    os.remove(os.path.join(test_files_dir, file))
            
            # Run tests (which will regenerate test files)
            call_command('test', verbosity=1)
            
            # Generate new dependency file
            generate_dependency_file(base_dir, dependency_file)
            
            self.stdout.write(self.style.SUCCESS('Test files regenerated and dependencies updated.'))
        else:
            self.stdout.write(self.style.SUCCESS('No changes detected. Running tests...'))
            call_command('test', verbosity=1)


def get_file_hash(filename):
    with open(filename, 'rb') as f:
        return hashlib.md5(f.read()).hexdigest()

def generate_dependency_file(base_dir, output_file):
    dependencies = {}
    for root, dirs, files in os.walk(base_dir):
        for file in files:
            if (file.startswith('test_') or file.startswith('utils_')) and file.endswith('.py'):
                full_path = os.path.join(root, file)
                relative_path = os.path.relpath(full_path, base_dir)
                dependencies[relative_path] = get_file_hash(full_path)
    
    with open(output_file, 'w') as f:
        for path, hash_value in dependencies.items():
            f.write(f"{path}:{hash_value}\n")

def check_dependencies(base_dir, dependency_file):
    if not os.path.exists(dependency_file):
        return False
    
    with open(dependency_file, 'r') as f:
        stored_dependencies = dict(line.strip().split(':') for line in f)
    
    for root, dirs, files in os.walk(base_dir):
        for file in files:
            if file.endswith('.py'):
                full_path = os.path.join(root, file)
                relative_path = os.path.relpath(full_path, base_dir)
                if relative_path not in stored_dependencies or stored_dependencies[relative_path] != get_file_hash(full_path):
                    return False
    
    return True