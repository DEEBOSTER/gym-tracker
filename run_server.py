import subprocess
import re
import sys
import time
import os

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

print("=" * 62)
print("🚀  GymTracker: Локальный сервер + Cloudflare Tunnel")
print("=" * 62)

base_dir = os.path.dirname(os.path.abspath(__file__))
os.chdir(base_dir)

cf_exe = os.path.join(base_dir, "cloudflared.exe")
if not os.path.exists(cf_exe):
    print("❌ Файл cloudflared.exe не найден в директории проекта!")
    sys.exit(1)

# 1. Запуск Uvicorn
print("1️⃣  Запускаем сервер FastAPI (Uvicorn 127.0.0.1:8000)...")
server_proc = subprocess.Popen(
    [sys.executable, "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8000"],
    stdout=subprocess.DEVNULL,
    stderr=subprocess.DEVNULL
)

time.sleep(1.5)

# 2. Запуск туннеля (Ngrok с постоянным доменом или Cloudflare)
ngrok_exe = os.path.join(base_dir, "ngrok.exe")
ngrok_domain_file = os.path.join(base_dir, "ngrok_domain.txt")
ngrok_token_file = os.path.join(base_dir, "ngrok_token.txt")

tunnel_proc = None
tunnel_url = None

if os.path.exists(ngrok_domain_file) and os.path.exists(ngrok_exe):
    with open(ngrok_domain_file, "r", encoding="utf-8") as f:
        ngrok_domain = f.read().strip()

    if ngrok_domain:
        if os.path.exists(ngrok_token_file):
            with open(ngrok_token_file, "r", encoding="utf-8") as f:
                ngrok_token = f.read().strip()
            if ngrok_token:
                subprocess.run([ngrok_exe, "config", "add-authtoken", ngrok_token], capture_output=True)

        print(f"2️⃣  Подключаем ПОСТОЯННЫЙ статический домен Ngrok:\n    👉 https://{ngrok_domain}")
        tunnel_proc = subprocess.Popen(
            [ngrok_exe, "http", "8000", "--url", ngrok_domain, "--log=stdout"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
        tunnel_url = f"https://{ngrok_domain}"
        time.sleep(2)

if not tunnel_url:
    print("2️⃣  Подключаем защищенный Cloudflare Tunnel...")
    tunnel_proc = subprocess.Popen(
        [cf_exe, "tunnel", "--url", "http://127.0.0.1:8000"],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
        encoding="utf-8",
        errors="replace"
    )

    start_time = time.time()
    while time.time() - start_time < 25:
        line = tunnel_proc.stdout.readline()
        if not line:
            continue
        match = re.search(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com", line)
        if match:
            tunnel_url = match.group(0)
            break

if tunnel_url:
    # Save URL to a text file for convenience
    with open(os.path.join(base_dir, "current_tunnel_url.txt"), "w", encoding="utf-8") as f:
        f.write(tunnel_url)

    print("\n" + "=" * 62)
    print("✅  GYMTRACKER УСПЕШНО ДОСТУПЕН В СЕТИ!")
    print("=" * 62)
    print(f"\n🌍  ВАША ССЫЛКА ДЛЯ ТЕЛЕФОНА И TELEGRAM:\n")
    print(f"👉  {tunnel_url}  👈\n")
    print("=" * 62)

    # Auto-update Telegram Bot Menu Button if token is provided
    token_file = os.path.join(base_dir, "bot_token.txt")
    bot_proc = None
    if os.path.exists(token_file):
        with open(token_file, "r", encoding="utf-8") as f:
            token = f.read().strip()
        if token:
            try:
                import urllib.request
                import json
                menu_payload = json.dumps({
                    "menu_button": {
                        "type": "web_app",
                        "text": "Тренировки 💪",
                        "web_app": {"url": tunnel_url}
                    }
                }).encode("utf-8")
                req = urllib.request.Request(
                    f"https://api.telegram.org/bot{token}/setChatMenuButton",
                    data=menu_payload,
                    headers={"Content-Type": "application/json"}
                )
                with urllib.request.urlopen(req, timeout=8) as r:
                    res = json.loads(r.read().decode("utf-8"))
                    if res.get("ok"):
                        print("🤖 [Telegram] Кнопка Меню в боте АВТОМАТИЧЕСКИ обновлена на новый URL!")
                    else:
                        print(f"⚠️ [Telegram] Ответ API: {res.get('description')}")

                bot_script = os.path.join(base_dir, "telegram_bot.py")
                if os.path.exists(bot_script):
                    bot_proc = subprocess.Popen([sys.executable, bot_script])
                    print("🤖 [Telegram] Фоновый бот запущен (отвечает на /start и сообщения).")
            except Exception as e:
                print(f"⚠️ [Telegram] Ошибка авто-обновления бота: {e}")
    else:
        print("💡 [Авто-обновление бота]")
        print("   Хотите, чтобы ссылка в вашем Telegram-боте обновлялась САМА?")
        print("   Создайте в этой папке файл bot_token.txt и сохраните в него токен от @BotFather!")
        print("=" * 62)

    print("📱 Инструкция по использованию:")
    print("• Отправьте эту ссылку себе в Telegram 'Избранное' или друзьям")
    print("• Или привяжите в @BotFather через команду /setmenubutton")
    print("• В Safari/Chrome на телефоне нажмите 'На экран Домой'")
    print("=" * 62)
    print("⚡ Оставьте это окно открытым на время тренировки.")
    print("Нажмите Ctrl+C, чтобы остановить сервер.\n")
else:
    print("⚠️ Туннель запущен, но URL не удалось распознать автоматически.")
    print("Проверьте соединение с интернетом.")
    bot_proc = None

try:
    while True:
        time.sleep(1)
except KeyboardInterrupt:
    print("\nОстановка сервера и туннеля...")
    try:
        server_proc.terminate()
        if tunnel_proc:
            tunnel_proc.terminate()
        if bot_proc:
            bot_proc.terminate()
    except Exception:
        pass
    print("Сервер остановлен. До встречи в зале!")
