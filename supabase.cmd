@echo off
setlocal

set "SUPABASE_EXE=%~dp0app\node_modules\supabase\bin\supabase.exe"
if not exist "%SUPABASE_EXE%" (
  echo Supabase CLI not found at "%SUPABASE_EXE%".
  echo Install dependencies in app\ first: cd app ^&^& npm install
  exit /b 1
)

"%SUPABASE_EXE%" %*
