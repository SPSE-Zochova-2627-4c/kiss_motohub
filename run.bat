@echo off
setlocal enabledelayedexpansion

echo ============================================
echo   MotoHub - instalacia a spustenie
echo ============================================

REM Najdi funkcny Python prikaz (niektore instalacie maju len "py")
set PYCMD=
where python >nul 2>nul
if %errorlevel%==0 (
    set PYCMD=python
) else (
    where py >nul 2>nul
    if %errorlevel%==0 (
        set PYCMD=py
    )
)

if "%PYCMD%"=="" (
    echo CHYBA: Python sa nenasiel v PATH.
    echo Nainstaluj ho z https://www.python.org/downloads/
    echo a pri instalacii zaskrtni "Add python.exe to PATH".
    pause
    exit /b 1
)

echo Pouzivam Python prikaz: %PYCMD%

REM Vytvor virtualne prostredie, ak eeste neexistuje
if not exist "venv\Scripts\activate.bat" (
    echo [1/3] Vytvaram virtualne prostredie ^(este neexistuje^)...
    %PYCMD% -m venv venv
    if not exist "venv\Scripts\activate.bat" (
        echo CHYBA: Vytvorenie virtualneho prostredia zlyhalo.
        pause
        exit /b 1
    )
) else (
    echo [1/3] Virtualne prostredie uz existuje, preskakujem.
)

call venv\Scripts\activate.bat

echo [2/3] Instalujem kniznice z requirements.txt...
python -m pip install --upgrade pip >nul
pip install -r requirements.txt
if errorlevel 1 (
    echo CHYBA: Instalacia kniznic zlyhala. Skontroluj pripojenie na internet.
    pause
    exit /b 1
)

if not exist ".env" (
    echo.
    echo ============================================
    echo  Chyba subor .env s API klucmi.
    echo  Vytvaram ho zo sablony .env.example a otvaram
    echo  v Notepade - dopln NINJA_API_KEY a
    echo  OPENROUTER_API_KEY, uloz a zavri Notepad.
    echo ============================================
    copy .env.example .env >nul
    notepad .env
)

echo [3/3] Spustam MotoHub na http://127.0.0.1:5000 ...
echo (Aplikaciu zastavis klavesovou skratkou CTRL+C v tomto okne.)
python app.py

echo.
echo Aplikacia sa zastavila. Ak si ocakaval, ze pobezi, precitaj si chybovu hlasku vyssie.
pause
