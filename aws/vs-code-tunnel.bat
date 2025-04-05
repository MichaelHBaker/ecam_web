ssh -i "C:\dev@echo off
start powershell -Command "ssh -i 'C:\dev\ecam_web\aws\ecam-web.pem' -L 8080:localhost:8080 ubuntu@18.217.173.166"
timeout /t 3
start http://localhost:8080/?folder=/home/ubuntu