@echo off
cd /d "%~dp0"
echo ================================================
echo   SmartNutri / Meatay - Lancement du backend
echo ================================================
start "Meatay Chatbot (port 5002)" cmd /k python chatbot_service.py
start "Recommandation (port 5001)" cmd /k python recommendation_service.py
echo Chatbot (5002) et Recommandation (5001) lances dans leurs fenetres.
echo Demarrage de l'API Node (port 5000)...
npm run dev
