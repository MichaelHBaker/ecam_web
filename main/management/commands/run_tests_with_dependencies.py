from django.core.management.base import BaseCommand
from django.conf import settings
from django.core.management import call_command
import os
from ...tests.test_dependencies import generate_dependency_file, check_dependencies

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