import os
import hashlib

def get_file_hash(filename):
    with open(filename, 'rb') as f:
        return hashlib.md5(f.read()).hexdigest()

def generate_dependency_file(base_dir, output_file):
    dependencies = {}
    for root, dirs, files in os.walk(base_dir):
        for file in files:
            if file.endswith('.py'):
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