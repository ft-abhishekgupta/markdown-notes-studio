@echo off
REM Launch Notes Studio in editable development mode.
cd /d "%~dp0"
if not exist "node_modules" (
  echo Installing dependencies...
  call npm install
)
echo.
echo Starting Notes Studio at http://localhost:5173
echo Editing is enabled in this mode. Press Ctrl+C to stop.
echo.
call npm run dev -- --open
