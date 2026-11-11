@echo off
REM ==================================================================
REM  Enciende SIGEV para toda la red local.
REM  Doble clic en este archivo y dejar la ventana abierta.
REM  Para apagarlo: cerrar la ventana o presionar Ctrl + C
REM ==================================================================
title SIGEV - Servidor en red
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   No se encontro Node.js en este equipo.
  echo   Instalelo siguiendo el PASO 1 de INSTALACION.txt
  echo.
  pause
  exit /b 1
)

npm run red

echo.
echo   El servidor se detuvo.
pause
