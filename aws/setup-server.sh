#!/bin/bash
# Server setup script for Django project with vanilla JS frontend

# Exit on any error
set -e

echo "Starting server setup..."

# Update system packages
echo "Updating system packages..."
sudo apt update
sudo apt upgrade -y

# Install dependencies for building Python and other tools
echo "Installing dependencies..."
sudo apt install -y build-essential zlib1g-dev libncurses5-dev libgdbm-dev \
libnss3-dev libssl-dev libsqlite3-dev libreadline-dev libffi-dev curl \
libbz2-dev git nginx

# Install Python 3.12.4
echo "Installing Python 3.12.4..."
cd /tmp
wget -O Python-3.12.4.tgz https://www.python.org/ftp/python/3.12.4/Python-3.12.4.tgz
tar -xf Python-3.12.4.tgz
cd Python-3.12.4
./configure --enable-optimizations
sudo make -j $(nproc)
sudo make altinstall

# Verify Python installation
python3.12 --version

# Clean up and recreate project directory structure
echo "Setting up project directories..."
rm -rf ~/app ~/venv
mkdir -p ~/app
mkdir -p ~/app/static
mkdir -p ~/app/media

# Create virtual environment
echo "Creating Python virtual environment..."
python3.12 -m pip install --user virtualenv
python3.12 -m virtualenv ~/venv

# Install requirements
echo "Installing Python packages..."
source ~/venv/bin/activate
pip install django==5.1.1 djangorestframework==3.15.2 gunicorn python-dotenv \
psycopg2-binary asgiref==3.8.1 numpy==2.2.1 pandas==2.2.3 openpyxl==3.1.5 \
django-extensions==3.2.3

# Set up Gunicorn service
echo "Setting up Gunicorn service..."
sudo bash -c 'cat > /etc/systemd/system/gunicorn.service << EOL
[Unit]
Description=gunicorn daemon
After=network.target

[Service]
User=ubuntu
Group=ubuntu
WorkingDirectory=/home/ubuntu/app
ExecStart=/home/ubuntu/venv/bin/gunicorn --workers 3 --bind unix:/home/ubuntu/app/app.sock yourproject.wsgi:application
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOL'

# Set up Nginx configuration
echo "Setting up Nginx configuration..."
sudo bash -c 'cat > /etc/nginx/sites-available/django << EOL
server {
    listen 80;
    server_name _;

    location = /favicon.ico { access_log off; log_not_found off; }
    
    location /static/ {
        root /home/ubuntu/app;
    }

    location /media/ {
        root /home/ubuntu/app;
    }

    location / {
        include proxy_params;
        proxy_pass http://unix:/home/ubuntu/app/app.sock;
    }
}
EOL'

# Enable Nginx site
sudo ln -sf /etc/nginx/sites-available/django /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test Nginx configuration
sudo nginx -t

echo "Setup complete! Next steps:"
echo "1. Clone or upload your Django project to the ~/app directory"
echo "2. Configure your Django settings.py file"
echo "3. Run migrations: python manage.py migrate"
echo "4. Collect static files: python manage.py collectstatic"
echo "5. Update the Gunicorn service file with your actual project name"
echo "6. Start services: sudo systemctl enable gunicorn && sudo systemctl start gunicorn && sudo systemctl restart nginx"