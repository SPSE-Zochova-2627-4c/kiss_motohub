@echo off
REM Vytvori virtualne prostredie, nainstaluje kniznice a spusti MotoHub

if not exist venv (
    python -m venv venv
)
call venv\Scripts\activate.bat
pip install -r requirements.txt

if not exist .env (
    copy .env.example .env
    echo Dopln API kluce do suboru .env a uloz ho.
    notepad .env
)

echo MotoHub bezi na http://127.0.0.1:5000
python app.py
pause
