@echo off
chcp 65001 >nul
title GymTracker Server & Cloudflare Tunnel
cd /d "%~dp0"
python run_server.py
pause
