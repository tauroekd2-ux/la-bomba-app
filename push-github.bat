@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "REPO=la-bomba-app"
set "USER=%1"
if "%USER%"=="" (
  if exist GITHUB_USER.txt (
    set /p USER=<GITHUB_USER.txt
  ) else (
    echo Escribe tu usuario de GitHub y pulsa Enter:
    set /p USER=
  )
)
if "%USER%"=="" (
  echo Crea el repo en https://github.com/new con nombre: %REPO%
  echo Luego ejecuta: push-github.bat TU_USUARIO
  exit /b 1
)
"C:\Program Files\Git\bin\bash.exe" -c "cd '/c/Users/EDGAR/edgar robot/la-bomba-app' && git remote remove origin 2>/dev/null; git remote add origin https://github.com/%USER%/%REPO%.git && git branch -M main && git push -u origin main"
if %errorlevel% equ 0 (echo. && echo Listo. Conecta el repo en Render: New -^> Blueprint) else (echo. && echo Si el repo no existe, crealo en https://github.com/new nombre: %REPO%)
pause
