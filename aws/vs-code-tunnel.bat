@echo off
echo Starting VS Code tunnel connection to EC2 instance...
echo Time: %TIME% Date: %DATE%
echo -----------------------------------------------

:: Create a logs directory if it doesn't exist
if not exist "C:\dev\ecam_web\logs" mkdir "C:\dev\ecam_web\logs"

:: Generate a timestamp for the log file
set TIMESTAMP=%DATE:~10,4%%DATE:~4,2%%DATE:~7,2%_%TIME:~0,2%%TIME:~3,2%%TIME:~6,2%
set TIMESTAMP=%TIMESTAMP: =0%
set LOGFILE=C:\dev\ecam_web\logs\vscode_tunnel_%TIMESTAMP%.log

:: Test network connectivity first
echo Testing network connectivity to EC2 instance...
ping -n 4 18.217.173.166 > "%LOGFILE%" 2>&1
echo Network test results saved to %LOGFILE%

:: Start SSH tunnel with improved parameters, but do it in background
echo Starting SSH tunnel with keepalive settings...
start /min powershell -Command "ssh -i 'C:\dev\ecam_web\aws\ecam-web.pem' -L 8080:localhost:8080 -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -o ConnectTimeout=10 -o ConnectionAttempts=3 ubuntu@18.217.173.166 | Out-File -Append '%LOGFILE%'"

:: Wait for tunnel to establish
echo Waiting for tunnel to establish...
timeout /t 5 /nobreak > nul

:: Check if port 8080 is listening
echo Checking if tunnel is active...
powershell -Command "if ((Get-NetTCPConnection -LocalPort 8080 -ErrorAction SilentlyContinue).Count -gt 0) { Write-Host 'Tunnel appears to be active!' -ForegroundColor Green } else { Write-Host 'Warning: Tunnel may not be established properly.' -ForegroundColor Yellow }"

:: Open browser with VS Code interface
echo Opening VS Code in browser...
start http://localhost:8080/?folder=/home/ubuntu

:: Wait a bit for the browser to open and connect
echo Waiting for VS Code to start...
timeout /t 10 /nobreak > nul

:: Close this window automatically
exit