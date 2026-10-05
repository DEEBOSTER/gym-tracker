import os
import sys
import json
import time
import urllib.request
import urllib.parse
import urllib.error

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TOKEN_FILE = os.path.join(BASE_DIR, "bot_token.txt")
URL_FILE = os.path.join(BASE_DIR, "current_tunnel_url.txt")

def get_bot_token():
    if os.path.exists(TOKEN_FILE):
        with open(TOKEN_FILE, "r", encoding="utf-8") as f:
            token = f.read().strip()
            if token:
                return token
    return None

def get_tunnel_url():
    if os.path.exists(URL_FILE):
        with open(URL_FILE, "r", encoding="utf-8") as f:
            url = f.read().strip()
            if url.startswith("http"):
                return url
    return None

def telegram_api_request(token, method, payload=None):
    url = f"https://api.telegram.org/bot{token}/{method}"
    headers = {"Content-Type": "application/json"}
    data = json.dumps(payload).encode("utf-8") if payload else None
    
    req = urllib.request.Request(url, data=data, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        try:
            return json.loads(err_body)
        except Exception:
            return {"ok": False, "description": err_body}
    except Exception as e:
        return {"ok": False, "description": str(e)}

def update_bot_menu_button(token, webapp_url):
    """
    Updates the Telegram Bot Menu Button (bottom left button in Telegram chat)
    to point directly to the WebApp URL.
    """
    payload = {
        "menu_button": {
            "type": "web_app",
            "text": "Тренировки 💪",
            "web_app": {
                "url": webapp_url
            }
        }
    }
    res = telegram_api_request(token, "setChatMenuButton", payload)
    return res

def set_bot_commands(token):
    payload = {
        "commands": [
            {"command": "start", "description": "Запустить GymTracker"},
            {"command": "app", "description": "Открыть приложение тренировок"}
        ]
    }
    return telegram_api_request(token, "setMyCommands", payload)

def send_welcome_message(token, chat_id, webapp_url):
    personal_pwa_url = f"{webapp_url.rstrip('/')}/?tg_id={chat_id}"
    payload = {
        "chat_id": chat_id,
        "text": (
            "🏋️‍♂️ *Добро пожаловать в GymTracker!*\n\n"
            "Твой интеллектуальный дневник силовых тренировок и личный AI-тренер готов к работе.\n\n"
            "📱 *Теперь доступен и как автономное приложение (PWA):*\n"
            "Вы можете пользоваться GymTracker прямо в Telegram, либо открыть в обычном браузере (Safari / Chrome) и добавить на рабочий стол телефона как полноценное приложение.\n\n"
            "✨ *Возможности:*\n"
            "• 🪜 *Разминочная лестница* — расчет разминочных подходов\n"
            "• 🔔 *Фоновый таймер* — звуковой сигнал и пуш в чат по окончании отдыха\n"
            "• 🏷️ *Типы подходов* — обычный, разминка, дропсет, отказ и редактирование\n"
            "• 📚 *Энциклопедия 46 упражнений* с анимациями и техникой\n\n"
            "Выберите удобный способ запуска:"
        ),
        "parse_mode": "Markdown",
        "reply_markup": {
            "inline_keyboard": [
                [
                    {
                        "text": "🚀 Открыть в Telegram",
                        "web_app": {"url": webapp_url}
                    }
                ],
                [
                    {
                        "text": "🌐 Открыть в Safari / Chrome (PWA)",
                        "url": personal_pwa_url
                    }
                ]
            ]
        }
    }
    return telegram_api_request(token, "sendMessage", payload)

def run_bot_polling():
    token = get_bot_token()
    if not token:
        print("=" * 60)
        print("⚠️ Файл bot_token.txt не найден!")
        print("=" * 60)
        print("Чтобы бот автоматически привязывал актуальную ссылку и")
        print("открывал WebApp, создайте файл bot_token.txt в папке проекта")
        print("и вставьте в него токен бота, полученный от @BotFather.")
        print("=" * 60)
        user_input = input("Введите токен бота прямо сейчас (или Enter для выхода): ").strip()
        if user_input:
            with open(TOKEN_FILE, "w", encoding="utf-8") as f:
                f.write(user_input)
            token = user_input
        else:
            return

    webapp_url = get_tunnel_url()
    if not webapp_url:
        print("⚠️ Не найден актуальный адрес туннеля в current_tunnel_url.txt!")
        print("Сначала запустите run_server.py")
        return

    # Verify token
    me = telegram_api_request(token, "getMe")
    if not me.get("ok"):
        print(f"❌ Ошибка проверки токена бота: {me.get('description')}")
        return

    bot_info = me.get("result", {})
    bot_username = bot_info.get("username", "UnknownBot")
    print(f"🤖 Подключен бот: @{bot_username}")
    print(f"🔗 Актуальный WebApp URL: {webapp_url}")

    # 1. Update Menu Button
    res_menu = update_bot_menu_button(token, webapp_url)
    if res_menu.get("ok"):
        print("✅ Кнопка Меню (Menu Button) в боте успешно обновлена на новый URL!")
    else:
        print(f"⚠️ Предупреждение при обновлении кнопки меню: {res_menu.get('description')}")

    # 2. Update Bot Commands
    set_bot_commands(token)

    print("=" * 60)
    print(f"🚀 Бот @{bot_username} запущен и ожидает сообщений!")
    print("Напишите боту /start в Telegram, чтобы открыть GymTracker.")
    print("Для остановки бота нажмите Ctrl+C.")
    print("=" * 60)

    offset = 0
    while True:
        try:
            # Check if tunnel URL changed in background
            new_url = get_tunnel_url()
            if new_url and new_url != webapp_url:
                webapp_url = new_url
                print(f"🔄 Туннель обновился! Новый URL: {webapp_url}")
                update_bot_menu_button(token, webapp_url)

            updates_res = telegram_api_request(token, "getUpdates", {
                "offset": offset,
                "timeout": 15
            })

            if updates_res.get("ok"):
                updates = updates_res.get("result", [])
                for upd in updates:
                    offset = upd["update_id"] + 1
                    msg = upd.get("message")
                    if msg:
                        chat_id = msg.get("chat", {}).get("id")
                        text = msg.get("text", "")
                        print(f"📩 Сообщение от {chat_id}: {text}")
                        if chat_id:
                            try:
                                with open(os.path.join(BASE_DIR, "telegram_chat_id.txt"), "w", encoding="utf-8") as f:
                                    f.write(str(chat_id))
                                from database import get_db
                                with get_db() as conn:
                                    conn.cursor().execute("UPDATE user_profile SET telegram_chat_id = ? WHERE id = 1;", (chat_id,))
                            except Exception as e:
                                pass
                        send_welcome_message(token, chat_id, webapp_url)

            time.sleep(0.5)
        except KeyboardInterrupt:
            print("\nБот остановлен.")
            break
        except Exception as e:
            print(f"Ошибка в цикле бота: {e}")
            time.sleep(2)

if __name__ == "__main__":
    run_bot_polling()
