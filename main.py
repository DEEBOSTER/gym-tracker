import os
import sys
import copy
import json
import threading
import asyncio
import html
from contextlib import asynccontextmanager
from typing import List, Optional, Dict, Any, Union
from datetime import datetime

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

from fastapi import FastAPI, HTTPException, status, Header, Depends
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
import urllib.parse

def get_current_user_id(
    x_telegram_user_id: Optional[str] = Header(None)
) -> str:
    if x_telegram_user_id and str(x_telegram_user_id).strip() and str(x_telegram_user_id).strip() != "null" and str(x_telegram_user_id).strip() != "undefined":
        return str(x_telegram_user_id).strip()
    return "default"

def get_current_user_name(
    x_telegram_user_name: Optional[str] = Header(None)
) -> str:
    if x_telegram_user_name and str(x_telegram_user_name).strip() and str(x_telegram_user_name).strip() != "null":
        try:
            return urllib.parse.unquote(str(x_telegram_user_name).strip())
        except Exception:
            return str(x_telegram_user_name).strip()
    return "Атлет"

from pydantic import BaseModel
from database import init_database, get_db
from init_db import seed_exercises, seed_sample_history_if_empty, seed_real_user_history
from models import (
    ExerciseResponse, ExerciseCreate,
    WorkoutStart, WorkoutFinish,
    WorkoutDetailResponse, WorkoutSummaryResponse,
    WorkoutSetCreate, WorkoutSetUpdate, WorkoutSetResponse,
    AnalyticsResponse, AnalyticsDataPoint,
    UserProfileModel, UserProfileUpdate
)

def _background_sync_telegram():
    """Syncs Telegram WebApp Menu Button in background without blocking server startup."""
    try:
        render_url = os.environ.get("RENDER_EXTERNAL_URL") or os.environ.get("WEBAPP_URL")
        bot_token = os.environ.get("BOT_TOKEN")
        base_dir = os.path.dirname(os.path.abspath(__file__))
        if not bot_token and os.path.exists(os.path.join(base_dir, "bot_token.txt")):
            try:
                with open(os.path.join(base_dir, "bot_token.txt"), "r", encoding="utf-8") as f:
                    bot_token = f.read().strip()
            except Exception:
                pass

        if render_url and bot_token:
            import urllib.request
            payload = json.dumps({
                "menu_button": {
                    "type": "web_app",
                    "text": "Тренировки 💪",
                    "web_app": {"url": render_url}
                }
            }).encode("utf-8")
            req = urllib.request.Request(
                f"https://api.telegram.org/bot{bot_token}/setChatMenuButton",
                data=payload,
                headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=8) as r:
                pass
            print(f"[Telegram] WebApp button updated to: {render_url}")
    except Exception as e:
        print(f"[Telegram] Menu button sync note: {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Auto-initialize database and pre-seed on launch
    try:
        init_database()
        seed_exercises()
        seed_sample_history_if_empty()
        seed_real_user_history()
    except Exception as e:
        print(f"[DB Init] Note: {e}")

    # Start Telegram sync non-blockingly
    threading.Thread(target=_background_sync_telegram, daemon=True).start()

    yield

app = FastAPI(
    title="GymTracker PWA API",
    description="API для отслеживания силовых тренировок и прогресса весов",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- EXERCISES ENDPOINTS ---

@app.get("/api/exercises", response_model=List[ExerciseResponse])
def get_exercises():
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, name, category, created_at FROM exercises ORDER BY name ASC;")
        rows = cursor.fetchall()
        return [dict(r) for r in rows]

@app.post("/api/exercises", response_model=ExerciseResponse, status_code=status.HTTP_201_CREATED)
def create_exercise(exercise: ExerciseCreate):
    name = exercise.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Название упражнения не может быть пустым")
    with get_db() as conn:
        cursor = conn.cursor()
        try:
            cursor.execute(
                "INSERT INTO exercises (name, category) VALUES (?, ?);",
                (name, exercise.category or "Пользовательские")
            )
            ex_id = cursor.lastrowid
            cursor.execute("SELECT id, name, category, created_at FROM exercises WHERE id = ?;", (ex_id,))
            return dict(cursor.fetchone())
        except Exception:
            raise HTTPException(status_code=400, detail="Упражнение с таким названием уже существует")

GUIDES_FILE_PATH = os.path.join(os.path.dirname(__file__), "static", "exercise_guides.json")

@app.get("/api/exercises/guides")
def get_exercise_guides():
    if os.path.exists(GUIDES_FILE_PATH):
        with open(GUIDES_FILE_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}

# --- COACH & PROGRESSIVE OVERLOAD DEFINITIONS ---

PPL_PROGRAMS = {
    "push_a": {
        "type": "push",
        "variant": "a",
        "variant_title": "Вариант А (Базовый силовой)",
        "title": "День 1: Push (Толкай) — Вариант А",
        "focus": "Грудь, жим на плечи, махи дельт, трицепс",
        "exercises": [
            {
                "name": "Жим штанги лежа",
                "target_sets": 3,
                "target_reps": "8–10",
                "tip": "Локти чуть согнуты вверху, без отбива от груди",
                "alternatives": ["Жим гантелей на горизонтальной скамье", "Сведение рук в кроссовере"]
            },
            {
                "name": "Жим гантелей на наклонной скамье (30°)",
                "target_sets": 3,
                "target_reps": "8–10",
                "tip": "Локти под углом 45–60°, кисти не заламывать",
                "alternatives": ["Жим штанги на наклонной скамье", "Сведение рук в кроссовере"]
            },
            {
                "name": "Жим гантелей сидя на плечи",
                "target_sets": 3,
                "target_reps": "8–10",
                "tip": "Локти на 30° вперед в плоскости лопаток, не соударять гантели вверху",
                "alternatives": ["Армейский жим штанги стоя", "Жим Арнольда"]
            },
            {
                "name": "Махи гантелями через стороны",
                "target_sets": 3,
                "target_reps": "12–15",
                "tip": "Движение начинается от локтей, без читинга корпусом",
                "alternatives": ["Тяга штанги к подбородку широким хватом"]
            },
            {
                "name": "Французский жим со штангой лежа",
                "target_sets": 3,
                "target_reps": "8–10",
                "tip": "Опускай гриф чуть за макушку головы, локти строго параллельны",
                "alternatives": ["Французский жим с гантелью из-за головы", "Отжимания на брусьях / гравитрон"]
            },
            {
                "name": "Разгибания рук на верхнем блоке с канатом",
                "target_sets": 3,
                "target_reps": "12–15",
                "tip": "Разводи канат внизу, локти прижаты к бокам",
                "alternatives": ["Разгибания рук на блоке с V-рукоятью", "Французский жим с гантелью из-за головы"]
            }
        ]
    },
    "push_b": {
        "type": "push",
        "variant": "b",
        "variant_title": "Вариант Б (Смена углов & гипертрофия)",
        "title": "День 1: Push (Толкай) — Вариант Б",
        "focus": "Верх груди, кроссовер, армейский жим, брусья",
        "exercises": [
            {
                "name": "Жим штанги на наклонной скамье",
                "target_sets": 3,
                "target_reps": "8–10",
                "tip": "Скамья 30°, штанга опускается на верхний обрез груди",
                "alternatives": ["Жим гантелей на наклонной скамье (30°)"]
            },
            {
                "name": "Сведение рук в кроссовере",
                "target_sets": 3,
                "target_reps": "10–12",
                "tip": "Слегка согнутые локти зафиксированы, пиковое сжатие груди 1 сек",
                "alternatives": ["Жим гантелей на горизонтальной скамье", "Жим штанги лежа"]
            },
            {
                "name": "Армейский жим штанги стоя",
                "target_sets": 3,
                "target_reps": "6–8",
                "tip": "Пресс и ягодицы зажаты, штанга движется строго вертикально",
                "alternatives": ["Жим гантелей сидя на плечи", "Жим Арнольда"]
            },
            {
                "name": "Тяга штанги к подбородку широким хватом",
                "target_sets": 3,
                "target_reps": "10–12",
                "tip": "Хват шире плеч, тяни локтями в стороны",
                "alternatives": ["Махи гантелями через стороны", "Жим Арнольда"]
            },
            {
                "name": "Отжимания на брусьях / гравитрон",
                "target_sets": 3,
                "target_reps": "6–8",
                "tip": "Корпус слегка вперед, опускание до 90° в локтях",
                "alternatives": ["Французский жим со штангой лежа", "Французский жим с гантелью из-за головы"]
            },
            {
                "name": "Разгибания рук на блоке с V-рукоятью",
                "target_sets": 3,
                "target_reps": "12–15",
                "tip": "Угловая рукоять жестко изолирует латеральную головку",
                "alternatives": ["Разгибания рук на верхнем блоке с канатом"]
            }
        ]
    },
    "pull_a": {
        "type": "pull",
        "variant": "a",
        "variant_title": "Вариант А (Базовый силовой)",
        "title": "День 2: Pull (Тяни) — Вариант А",
        "focus": "Подтягивания, тяга штанги в наклоне, руки, поясница",
        "exercises": [
            {
                "name": "Подтягивания (турник / резина)",
                "target_sets": 3,
                "target_reps": "6–8",
                "tip": "Используй резинку для объема, тяни лопатками",
                "alternatives": ["Тяга верхнего блока к груди", "Тяга верхнего блока параллельным хватом"]
            },
            {
                "name": "Тяга штанги в наклоне",
                "target_sets": 3,
                "target_reps": "8–10",
                "tip": "Спина прямая, тяни гриф локтями назад к низу живота",
                "alternatives": ["Тяга Т-грифа с упором в грудь", "Тяга гантели в наклоне одной рукой"]
            },
            {
                "name": "Горизонтальная тяга блока (V-хват)",
                "target_sets": 3,
                "target_reps": "10–12",
                "tip": "Тяга к низу живота, сведение лопаток на 1 сек",
                "alternatives": ["Тяга гантели в наклоне одной рукой"]
            },
            {
                "name": "Peck-Deck на заднюю дельту",
                "target_sets": 3,
                "target_reps": "10–12",
                "tip": "Локти на высоте плеч, медленный подконтрольный возврат",
                "alternatives": ["Тяга каната к лицу (Face pulls)"]
            },
            {
                "name": "Сгибания рук с EZ-грифом на бицепс стоя",
                "target_sets": 3,
                "target_reps": "8–10",
                "tip": "Медленное опускание на 2-3 счета, локти на месте",
                "alternatives": ["Сгибания на скамье Скотта", "Концентрированные сгибания на бицепс"]
            },
            {
                "name": "Молотки с гантелями",
                "target_sets": 3,
                "target_reps": "8–10",
                "tip": "Нейтральный хват, защита кистей и локтей",
                "alternatives": ["Концентрированные сгибания на бицепс"]
            },
            {
                "name": "Гиперэкстензия",
                "target_sets": 3,
                "target_reps": "12–15",
                "tip": "Подъем строго до одной прямой с ногами, без переразгибания назад",
                "alternatives": ["Тяга верхнего блока прямыми руками (Straight-arm)"]
            }
        ]
    },
    "pull_b": {
        "type": "pull",
        "variant": "b",
        "variant_title": "Вариант Б (Смена углов & гипертрофия)",
        "title": "День 2: Pull (Тяни) — Вариант Б",
        "focus": "V-тяга спины, пуловер, скамья Скотта, пик бицепса",
        "exercises": [
            {
                "name": "Тяга верхнего блока параллельным хватом",
                "target_sets": 4,
                "target_reps": "8–10",
                "tip": "Нейтральная рукоять максимально бережет локти и плечи",
                "alternatives": ["Тяга верхнего блока к груди", "Подтягивания (турник / резина)"]
            },
            {
                "name": "Тяга гантели в наклоне одной рукой",
                "target_sets": 3,
                "target_reps": "10–12",
                "tip": "Начинай со слабой руки, локоть скользит к поясу",
                "alternatives": ["Тяга Т-грифа с упором в грудь", "Тяга штанги в наклоне"]
            },
            {
                "name": "Пуловер с гантелью на скамье",
                "target_sets": 3,
                "target_reps": "10–12",
                "tip": "Глубокий вдох при опускании за голову, растягивай широчайшие",
                "alternatives": ["Тяга верхнего блока прямыми руками (Straight-arm)"]
            },
            {
                "name": "Тяга каната к лицу (Face pulls)",
                "target_sets": 3,
                "target_reps": "12–15",
                "tip": "Тяни канат к переносице, разводя кулаки наружу",
                "alternatives": ["Peck-Deck на заднюю дельту"]
            },
            {
                "name": "Сгибания на скамье Скотта",
                "target_sets": 3,
                "target_reps": "10–12",
                "tip": "Полная изоляция бицепса без раскачки спиной",
                "alternatives": ["Сгибания рук с EZ-грифом на бицепс стоя"]
            },
            {
                "name": "Концентрированные сгибания на бицепс",
                "target_sets": 3,
                "target_reps": "10–12",
                "tip": "Локоть уперт в бедро, секундная фиксация пика бицепса",
                "alternatives": ["Молотки с гантелями"]
            }
        ]
    },
    "legs_a": {
        "type": "legs",
        "variant": "a",
        "variant_title": "Вариант А (Базовый силовой)",
        "title": "День 3: Legs (Ноги & Пресс) — Вариант А",
        "focus": "Присед со штангой, румынская тяга, выпады, икры",
        "exercises": [
            {
                "name": "Приседания со штангой на плечах",
                "target_sets": 4,
                "target_reps": "8–10",
                "tip": "Колени в стороны носков, грудь колесом, пятки не отрывать",
                "alternatives": ["Жим ногами в тренажере", "Приседания в Гакк-тренажере"]
            },
            {
                "name": "Румынская тяга",
                "target_sets": 4,
                "target_reps": "10–12",
                "tip": "Таз далеко назад, растяжение задней поверхности бедра",
                "alternatives": ["Сгибание ног сидя", "Сгибания ног в тренажере лежа"]
            },
            {
                "name": "Выпады вперед",
                "target_sets": 3,
                "target_reps": "8–10",
                "tip": "Обратные выпады шаг назад, толчок пяткой передней ноги",
                "alternatives": ["Болгарские сплит-приседания"]
            },
            {
                "name": "Сгибание ног сидя",
                "target_sets": 3,
                "target_reps": "10–12",
                "tip": "Секундная фиксация внизу, медленный возврат",
                "alternatives": ["Сгибания ног в тренажере лежа"]
            },
            {
                "name": "Разгибания ног в тренажере",
                "target_sets": 3,
                "target_reps": "10–12",
                "tip": "Пиковое сокращение вверху, жжение в квадрицепсе",
                "alternatives": ["Жим ногами в тренажере"]
            },
            {
                "name": "Подъем на носки стоя",
                "target_sets": 3,
                "target_reps": "15–20",
                "tip": "Максимальная растяжка внизу, пауза на носках",
                "alternatives": ["Подъем на носки в тренажере"]
            },
            {
                "name": "Скручивания на пресс в тренажере",
                "target_sets": 3,
                "target_reps": "12–15",
                "tip": "Скручивание на резком выдохе, руками не тянуть",
                "alternatives": ["Подъем ног в висе"]
            }
        ]
    },
    "legs_b": {
        "type": "legs",
        "variant": "b",
        "variant_title": "Вариант Б (Гакк-присед & Ягодичный мост)",
        "title": "День 3: Legs (Ноги & Пресс) — Вариант Б",
        "focus": "Гакк-присед, ягодичный мостик, сплит-приседы",
        "exercises": [
            {
                "name": "Приседания в Гакк-тренажере",
                "target_sets": 4,
                "target_reps": "10–12",
                "tip": "Поясница прижата, мощный акцент на переднюю поверхность бедра",
                "alternatives": ["Жим ногами в тренажере", "Гоблет-приседания", "Приседания со штангой на плечах"]
            },
            {
                "name": "Ягодичный мостик со штангой",
                "target_sets": 4,
                "target_reps": "10–12",
                "tip": "Взгляд перед собой, мощное сжатие ягодиц на 1-2 сек в верхней точке",
                "alternatives": ["Румынская тяга", "Гиперэкстензия"]
            },
            {
                "name": "Болгарские сплит-приседания",
                "target_sets": 3,
                "target_reps": "10–12",
                "tip": "Задняя нога на скамье, упор строго в пятку передней ноги",
                "alternatives": ["Выпады вперед", "Гоблет-приседания"]
            },
            {
                "name": "Сгибания ног в тренажере лежа",
                "target_sets": 4,
                "target_reps": "10–12",
                "tip": "Таз прижат к скамье, мощное сокращение бицепса бедра",
                "alternatives": ["Сгибание ног сидя"]
            },
            {
                "name": "Разгибания ног в тренажере",
                "target_sets": 3,
                "target_reps": "12–15",
                "tip": "Работа в верхней половине амплитуды на максимальный памп",
                "alternatives": ["Жим ногами в тренажере"]
            },
            {
                "name": "Подъем на носки в тренажере",
                "target_sets": 3,
                "target_reps": "15–20",
                "tip": "20 чистых повторений с секундной фиксацией вверху",
                "alternatives": ["Подъем на носки стоя"]
            },
            {
                "name": "Подъем ног в висе",
                "target_sets": 3,
                "target_reps": "12–15",
                "tip": "Подкручивай таз к ребрам, не раскачивайся",
                "alternatives": ["Скручивания на пресс в тренажере"]
            }
        ]
    }
}

def get_user_profile_dict(cursor, user_id: str = "default", user_name: str = "Атлет") -> dict:
    try:
        cursor.execute("SELECT * FROM user_profiles WHERE user_id = ?;", (user_id,))
        row = cursor.fetchone()
        if row:
            d = dict(row)
            d["user_id"] = user_id
            return d

        # Check if other non-default users exist
        cursor.execute("SELECT COUNT(*) as c FROM user_profiles WHERE user_id != 'default';")
        other_users_count = cursor.fetchone()["c"]

        cursor.execute("SELECT * FROM user_profiles WHERE user_id = 'default';")
        default_row = cursor.fetchone()

        # If this is the FIRST telegram user and there are default workouts/profile, migrate workouts
        if other_users_count == 0 and default_row and user_id != "default":
            clean_uid = user_id.replace("tg_", "")
            cursor.execute("""
                INSERT OR REPLACE INTO user_profiles (user_id, name, gender, age, height, weight, experience_level, fitness_goal, injuries, equipment, onboarding_completed, telegram_chat_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?);
            """, (
                user_id,
                user_name if user_name != "Атлет" else (default_row["name"] or "Атлет"),
                default_row["gender"] or "male",
                default_row["age"] or 26,
                default_row["height"] or 178.0,
                default_row["weight"] or 75.0,
                default_row["experience_level"] or "beginner",
                default_row["fitness_goal"] or "hypertrophy",
                default_row["injuries"] or "",
                default_row["equipment"] or "gym",
                int(clean_uid) if clean_uid.isdigit() else None
            ))
            cursor.execute("UPDATE workouts SET user_id = ? WHERE user_id = 'default';", (user_id,))
            cursor.execute("SELECT * FROM user_profiles WHERE user_id = ?;", (user_id,))
            migrated_row = cursor.fetchone()
            if migrated_row:
                d = dict(migrated_row)
                d["user_id"] = user_id
                return d

        # New user: onboarding_completed MUST ALWAYS be 0!
        clean_uid = user_id.replace("tg_", "")
        cursor.execute("""
            INSERT OR REPLACE INTO user_profiles (user_id, name, gender, age, height, weight, experience_level, fitness_goal, injuries, equipment, onboarding_completed, telegram_chat_id)
            VALUES (?, ?, 'male', 26, 178.0, 75.0, 'beginner', 'hypertrophy', '', 'gym', 0, ?);
        """, (user_id, user_name or "Атлет", int(clean_uid) if clean_uid.isdigit() else None))

        cursor.execute("SELECT * FROM user_profiles WHERE user_id = ?;", (user_id,))
        new_row = cursor.fetchone()
        if new_row:
            d = dict(new_row)
            d["user_id"] = user_id
            return d
    except Exception as e:
        print(f"Error in get_user_profile_dict: {e}")

    return {
        "user_id": user_id,
        "name": user_name or "Атлет",
        "gender": "male",
        "age": 26,
        "height": 178.0,
        "weight": 75.0,
        "experience_level": "beginner",
        "fitness_goal": "hypertrophy",
        "injuries": "",
        "equipment": "gym",
        "onboarding_completed": 0
    }

def enrich_exercise_item(ex, cursor, profile=None, user_id: str = "default"):
    if profile is None:
        profile = get_user_profile_dict(cursor, user_id=user_id)

    uid = profile.get("user_id") or user_id
    user_weight = float(profile.get("weight") or 80.0)
    user_goal = profile.get("fitness_goal") or "hypertrophy"
    user_level = profile.get("experience_level") or "intermediate"
    injuries = (profile.get("injuries") or "").lower()

    ex_name = ex["name"]
    cursor.execute("SELECT id FROM exercises WHERE name = ?;", (ex_name,))
    ex_row = cursor.fetchone()
    
    last_weight = 0.0
    last_reps = 0
    last_sets_summary = []
    rec_reps = ex.get("target_reps", "8–10")
    target_sets = ex.get("target_sets", 3)
    tip = ex.get("tip", "")

    # 1. ADAPTIVE REPS BASED ON USER GOAL:
    is_compound = any(w in ex_name.lower() for w in ["штанги", "ногами", "станов", "брусья", "присед", "подтягивания", "тяга штанги"])
    if user_goal == "strength" and is_compound:
        rec_reps = "5–7"
    elif user_goal == "fat_loss":
        rec_reps = "10–14" if is_compound else "12–15"

    # Parse target reps
    target_str = str(rec_reps).replace(" ", "")
    parts = target_str.replace("–", "-").split("-")
    try:
        target_min = int(parts[0])
        target_max = int(parts[1]) if len(parts) > 1 else target_min
    except Exception:
        target_min, target_max = 8, 10

    # 2. INJURY PREVENTION WARNINGS FROM PROFILE:
    injury_notes = []
    if "плеч" in injuries:
        if any(w in ex_name.lower() for w in ["жим", "брусья", "плеч", "дельт", "арнольд"]):
            injury_notes.append("🛡️ Профиль: берегите плечи (угол локтей 45°, нейтральный хват)")
    if "поясниц" in injuries or "спин" in injuries:
        if any(w in ex_name.lower() for w in ["станов", "наклон", "присед", "тяга штанги"]):
            injury_notes.append("🛡️ Профиль: берегите поясницу (жесткий кор, не округлять спину)")
    if "колен" in injuries:
        if any(w in ex_name.lower() for w in ["ног", "присед", "выпад", "разгибан"]):
            injury_notes.append("🛡️ Профиль: берегите колени (не блокировать сустав в замок)")
    if "кист" in injuries:
        if any(w in ex_name.lower() for w in ["жим", "бицепс", "французск"]):
            injury_notes.append("🛡️ Профиль: используйте нейтральный хват или бинты")

    if injury_notes:
        tip = f"{' | '.join(injury_notes)}. {tip}".strip()

    rec_weight = 20.0
    rec_note = "Начните с разминочного сета"
    progression_status = "NEW"
    progression_badge = ""

    if ex_row:
        ex_id = ex_row["id"]
        cursor.execute("""
            SELECT s.weight, s.reps, s.workout_id, COALESCE(s.set_type, 'normal') as set_type, s.created_at 
            FROM workout_sets s
            JOIN workouts w ON s.workout_id = w.id
            WHERE s.exercise_id = ? AND w.user_id = ?
            ORDER BY s.workout_id DESC, s.set_number ASC;
        """, (ex_id, uid))
        sets = cursor.fetchall()
        if sets:
            last_wid = sets[0]["workout_id"]
            recent_sets = [s for s in sets if s["workout_id"] == last_wid]
            
            def format_set_badge(s):
                st = s["set_type"] or "normal"
                w_str = f"{s['weight']} кг × {s['reps']}"
                if st == "warmup":
                    return f"W: {w_str}"
                elif st == "drop":
                    return f"D: {w_str}"
                elif st == "failure":
                    return f"F: {w_str}"
                return w_str

            last_sets_summary = [format_set_badge(s) for s in recent_sets]
            
            # Use working sets for progression (exclude warmups)
            working_sets = [s for s in recent_sets if s["set_type"] != "warmup"]
            eval_sets = working_sets if working_sets else recent_sets

            max_w = max(s["weight"] for s in eval_sets)
            avg_reps = sum(s["reps"] for s in eval_sets) / len(eval_sets)
            last_weight = max_w

            # 3. PROGRESSIVE OVERLOAD ADAPTED TO EXPERIENCE LEVEL:
            if user_level == "beginner":
                step = 2.5 if max_w >= 50 else 1.25 if max_w >= 10 else 1.0
            elif user_level == "advanced":
                step = 2.5 if max_w >= 90 else 1.25 if max_w >= 20 else 1.0
            else: # intermediate
                step = 5.0 if max_w >= 80 else 2.5 if max_w >= 20 else 1.0

            if avg_reps >= target_max:
                rec_weight = round(max_w + step, 1)
                progression_status = "INCREASE"
                progression_badge = f"+{step} кг Прогрессия"
                rec_note = f"🚀 Прогрессия веса! Прошлый вес {max_w} кг закрыт ({round(avg_reps, 1)} повт.). Новый целевой вес: {rec_weight} кг!"
            elif avg_reps >= target_min:
                rec_weight = max_w
                progression_status = "MAINTAIN"
                progression_badge = "Закрепление"
                rec_note = f"🎯 Закрепление: держим {max_w} кг (в прошлый раз {round(avg_reps, 1)} повт.). Цель — закрыть {target_max} во всех подходах!"
            else:
                rec_weight = max_w
                progression_status = "STABILIZE"
                progression_badge = "Стабилизация"
                rec_note = f"🛡️ Стабилизация: повторяем {max_w} кг с чистой техникой и контролем."
        else:
            # 4. INITIAL WEIGHT CALCULATED FROM USER BODYWEIGHT:
            is_female = profile.get("gender") == "female"
            mult = 0.6 if is_female else 1.0
            name_low = ex_name.lower()
            if any(w in name_low for w in ["подтягиван", "брусь", "гиперэкстенз", "подъем ног", "скручиван"]):
                rec_weight = 0.0
                rec_note = f"Свой вес ({user_weight} кг)"
            elif "ногами" in name_low:
                rec_weight = round(user_weight * 1.1 * mult, 1)
                rec_note = f"Расчет от веса тела ({user_weight} кг): {rec_weight} кг"
            elif any(w in name_low for w in ["приседания со штангой", "гакк"]):
                rec_weight = round(user_weight * 0.6 * mult, 1)
                rec_note = f"Расчет от веса тела ({user_weight} кг): {rec_weight} кг"
            elif any(w in name_low for w in ["мостик", "румынск"]):
                rec_weight = round(user_weight * 0.55 * mult, 1)
                rec_note = f"Расчет от веса тела ({user_weight} кг): {rec_weight} кг"
            elif any(w in name_low for w in ["штанги лежа", "штанги на наклонной"]):
                rec_weight = round(user_weight * 0.5 * mult, 1)
                rec_note = f"Расчет от веса тела ({user_weight} кг): {rec_weight} кг"
            elif any(w in name_low for w in ["армейский", "штанги в наклоне"]):
                rec_weight = round(user_weight * 0.42 * mult, 1)
                rec_note = f"Расчет от веса тела ({user_weight} кг): {rec_weight} кг"
            elif any(w in name_low for w in ["плечи", "арнольд"]) and "гантел" in name_low:
                rec_weight = round(user_weight * 0.16 * mult, 1)
                rec_note = f"Расчет от веса тела ({user_weight} кг): гантели по {rec_weight} кг"
            elif "кроссовер" in name_low:
                rec_weight = round(user_weight * 0.15 * mult, 1)
                rec_note = f"Блоки кроссовера ({user_weight} кг): по ~{rec_weight} кг"
            elif "гантел" in name_low:
                rec_weight = round(user_weight * 0.18 * mult, 1)
                rec_note = f"Расчет от веса тела ({user_weight} кг): гантели по {rec_weight} кг"
            elif "блок" in name_low or "тяга" in name_low:
                rec_weight = round(user_weight * 0.45 * mult, 1)
                rec_note = f"Расчет от веса тела ({user_weight} кг): ~{rec_weight} кг"
            else:
                rec_weight = round(user_weight * 0.25 * mult, 1)
                rec_note = f"Стартовый вес от веса тела: {rec_weight} кг"
    else:
        rec_weight = round(user_weight * 0.25, 1)

    return {
        "name": ex_name,
        "target_sets": target_sets,
        "target_reps": rec_reps,
        "tip": tip,
        "alternatives": ex.get("alternatives", []),
        "last_weight": last_weight,
        "last_sets_summary": last_sets_summary,
        "recommended_weight": rec_weight,
        "progression_status": progression_status,
        "progression_badge": progression_badge,
        "recommendation_note": rec_note
    }

def enrich_single_plan(plan_template, cursor, profile=None, user_id: str = "default"):
    if profile is None:
        profile = get_user_profile_dict(cursor, user_id=user_id)

    enriched_exercises = []
    for ex in plan_template["exercises"]:
        enriched_exercises.append(enrich_exercise_item(ex, cursor, profile=profile, user_id=user_id))

    return {
        "type": plan_template["type"],
        "variant": plan_template.get("variant", "a"),
        "variant_title": plan_template.get("variant_title", ""),
        "title": plan_template["title"],
        "focus": plan_template["focus"],
        "user_profile": profile,
        "exercises": enriched_exercises
    }

# --- WORKOUTS ENDPOINTS ---

@app.get("/api/workouts/active", response_model=Optional[WorkoutDetailResponse])
def get_active_workout(
    user_id: str = Depends(get_current_user_id),
    user_name: str = Depends(get_current_user_name)
):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, title, start_time, end_time, notes 
            FROM workouts 
            WHERE user_id = ? AND end_time IS NULL 
            ORDER BY id DESC LIMIT 1;
        """, (user_id,))
        w_row = cursor.fetchone()
        if not w_row:
            return None
        
        w_id = w_row["id"]
        cursor.execute("""
            SELECT s.id, s.workout_id, s.exercise_id, e.name as exercise_name,
                   s.set_number, COALESCE(s.set_type, 'normal') as set_type, s.weight, s.reps, s.created_at
            FROM workout_sets s
            JOIN exercises e ON s.exercise_id = e.id
            WHERE s.workout_id = ?
            ORDER BY s.id ASC;
        """, (w_id,))
        sets = [dict(s) for s in cursor.fetchall()]

        notes_str = w_row["notes"] or ""
        day_type = None
        variant = "a"
        planned_exercises = None
        
        if "day_type:" in notes_str:
            try:
                day_type = notes_str.split("day_type:")[1].split("|")[0].strip()
            except Exception:
                pass
        elif "push" in w_row["title"].lower():
            day_type = "push"
        elif "pull" in w_row["title"].lower():
            day_type = "pull"
        elif "legs" in w_row["title"].lower() or "ноги" in w_row["title"].lower():
            day_type = "legs"

        if "variant:b" in notes_str or "вариант б" in w_row["title"].lower():
            variant = "b"

        if day_type:
            prog_key = f"{day_type}_{variant}"
            target_template = PPL_PROGRAMS.get(prog_key) or PPL_PROGRAMS.get(f"{day_type}_a")
            if target_template:
                template_copy = copy.deepcopy(target_template)
                for part in notes_str.split("|"):
                    if part.startswith("swap:"):
                        swap_content = part[5:]
                        if "->" in swap_content:
                            old_name, new_name = swap_content.split("->", 1)
                            for ex in template_copy["exercises"]:
                                if ex["name"].strip().lower() == old_name.strip().lower():
                                    ex["name"] = new_name.strip()
                                    ex["tip"] = f"Замена на альтернативу: {new_name.strip()}"
                profile = get_user_profile_dict(cursor, user_id=user_id, user_name=user_name)
                planned_exercises = enrich_single_plan(template_copy, cursor, profile=profile, user_id=user_id)["exercises"]

        return {
            "id": w_row["id"],
            "title": w_row["title"],
            "start_time": w_row["start_time"],
            "end_time": w_row["end_time"],
            "notes": w_row["notes"] or "",
            "is_active": True,
            "day_type": day_type,
            "planned_exercises": planned_exercises,
            "sets": sets
        }

@app.post("/api/workouts/start", response_model=WorkoutDetailResponse)
def start_workout(
    payload: WorkoutStart,
    user_id: str = Depends(get_current_user_id),
    user_name: str = Depends(get_current_user_name)
):
    with get_db() as conn:
        cursor = conn.cursor()
        # Check if active already exists for this user
        cursor.execute("SELECT id FROM workouts WHERE user_id = ? AND end_time IS NULL ORDER BY id DESC LIMIT 1;", (user_id,))
        active = cursor.fetchone()
        if active:
            # Return currently active workout instead of creating orphan duplicate
            return get_active_workout(user_id=user_id, user_name=user_name)

        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        cursor.execute(
            "INSERT INTO workouts (user_id, title, start_time, notes) VALUES (?, ?, ?, ?);",
            (user_id, payload.title or "Силовая тренировка", now_str, payload.notes or "")
        )
    return get_active_workout(user_id=user_id, user_name=user_name)

def send_telegram_workout_summary(cursor, workout_id: int, chat_id: Optional[int] = None):
    """Sends a rich summary of the completed workout with volume, PRs, and tip to the user's Telegram."""
    try:
        base_dir = os.path.dirname(os.path.abspath(__file__))
        token_file = os.path.join(base_dir, "bot_token.txt")
        if not os.path.exists(token_file):
            return
        with open(token_file, "r", encoding="utf-8") as f:
            bot_token = f.read().strip()
        if not bot_token:
            return

        # Fetch workout details
        cursor.execute("SELECT id, user_id, title, start_time, end_time, notes FROM workouts WHERE id = ?;", (workout_id,))
        w_row = cursor.fetchone()
        if not w_row:
            return

        w_user_id = str(w_row["user_id"] or "default")

        # Determine target chat ID
        target_chat_id = chat_id
        if not target_chat_id:
            if w_user_id.isdigit():
                target_chat_id = int(w_user_id)
            elif w_user_id.startswith("tg_") and w_user_id[3:].isdigit():
                target_chat_id = int(w_user_id[3:])
            else:
                cursor.execute("SELECT telegram_chat_id FROM user_profiles WHERE user_id = ?;", (w_user_id,))
                p_row = cursor.fetchone()
                if p_row and p_row["telegram_chat_id"]:
                    target_chat_id = p_row["telegram_chat_id"]

        if not target_chat_id:
            chat_id_file = os.path.join(base_dir, "telegram_chat_id.txt")
            if os.path.exists(chat_id_file):
                with open(chat_id_file, "r", encoding="utf-8") as f:
                    val = f.read().strip()
                    if val.isdigit():
                        target_chat_id = int(val)

        if not target_chat_id:
            try:
                import urllib.request
                with urllib.request.urlopen(f"https://api.telegram.org/bot{bot_token}/getUpdates", timeout=4) as r:
                    upd_data = json.loads(r.read().decode())
                    results = upd_data.get("result", [])
                    if results:
                        last_msg = results[-1].get("message", {})
                        if last_msg.get("chat", {}).get("id"):
                            target_chat_id = last_msg["chat"]["id"]
            except Exception:
                pass

        if not target_chat_id:
            print("⚠️ [Telegram Report] Не найден chat_id для отправки отчета")
            return

        w_title = w_row["title"] or "Силовая тренировка"
        start_time = w_row["start_time"]
        end_time = w_row["end_time"] or datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        duration_mins = 45
        try:
            st = datetime.strptime(start_time, "%Y-%m-%d %H:%M:%S")
            et = datetime.strptime(end_time, "%Y-%m-%d %H:%M:%S")
            duration_mins = max(1, int((et - st).total_seconds() / 60))
        except Exception:
            pass

        # Fetch all sets
        cursor.execute("""
            SELECT s.id, s.exercise_id, e.name as ex_name, s.weight, s.reps, COALESCE(s.set_type, 'normal') as set_type
            FROM workout_sets s
            JOIN exercises e ON s.exercise_id = e.id
            WHERE s.workout_id = ?
            ORDER BY s.id ASC;
        """, (workout_id,))
        all_sets = cursor.fetchall()
        if not all_sets:
            return

        # Group by exercise
        exercises_map = {}
        for s in all_sets:
            ex_name = s["ex_name"]
            if ex_name not in exercises_map:
                exercises_map[ex_name] = []
            exercises_map[ex_name].append(s)

        working_sets = [s for s in all_sets if s["set_type"] != 'warmup']
        warmup_sets = [s for s in all_sets if s["set_type"] == 'warmup']
        drop_sets = [s for s in all_sets if s["set_type"] == 'drop']
        failure_sets = [s for s in all_sets if s["set_type"] == 'failure']
        total_tonnage = sum(s["weight"] * s["reps"] for s in all_sets)

        # Detect PRs for this user
        records = []
        for ex_name, s_list in exercises_map.items():
            working = [s for s in s_list if s["set_type"] != 'warmup']
            if not working:
                continue
            ex_id = working[0]["exercise_id"]
            curr_max_w = max(s["weight"] for s in working)
            curr_max_1rm = max(s["weight"] * (1.0 + s["reps"] / 30.0) for s in working)

            cursor.execute("""
                SELECT MAX(s.weight) as prev_max_w, MAX(s.weight * (1.0 + s.reps / 30.0)) as prev_max_1rm
                FROM workout_sets s
                JOIN workouts w ON s.workout_id = w.id
                WHERE s.exercise_id = ? AND s.workout_id != ? AND w.user_id = ? AND w.end_time IS NOT NULL AND s.set_type != 'warmup';
            """, (ex_id, workout_id, w_user_id))
            prev = cursor.fetchone()
            prev_max_w = prev["prev_max_w"] if prev and prev["prev_max_w"] is not None else 0
            prev_max_1rm = prev["prev_max_1rm"] if prev and prev["prev_max_1rm"] is not None else 0

            if prev_max_w > 0 and curr_max_w > prev_max_w:
                diff = curr_max_w - prev_max_w
                records.append(f"🏆 *{ex_name}*: рабочий вес *{curr_max_w:.1f} кг* (+{diff:.1f} кг к рекорду!)")
            elif prev_max_1rm > 0 and curr_max_1rm > prev_max_1rm + 1.5:
                records.append(f"🔥 *{ex_name}*: расчетный 1ПМ *{curr_max_1rm:.1f} кг* (новый пик силы!)")

        # Date formatting in Russian
        months = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"]
        try:
            dt = datetime.strptime(end_time, "%Y-%m-%d %H:%M:%S")
            date_text = f"{dt.day} {months[dt.month - 1]}, {dt.strftime('%H:%M')}"
        except Exception:
            date_text = end_time

        tonnage_str = f"{int(total_tonnage):,}".replace(",", " ")

        lines = [
            "💪 *ТРЕНИРОВКА ЗАВЕРШЕНА!*",
            "━━━━━━━━━━━━━━━━━━━━",
            f"🎯 *{w_title}*",
            f"📅 *{date_text}*  •  ⏱ *{duration_mins} мин*",
            f"🏋️‍♂️ Поднятый тоннаж: *{tonnage_str} кг*",
            f"🔢 Выполнено подходов: *{len(all_sets)}* (рабочих: {len(working_sets)})",
        ]

        if warmup_sets or drop_sets or failure_sets:
            spec = []
            if warmup_sets: spec.append(f"{len(warmup_sets)} разм.")
            if drop_sets: spec.append(f"{len(drop_sets)} дроп.")
            if failure_sets: spec.append(f"{len(failure_sets)} отказ")
            lines.append(f"🏷️ _Спец-сеты: {', '.join(spec)}_")

        lines.append("")
        lines.append("📋 *Выполненные упражнения:*")
        for ex_name, s_list in exercises_map.items():
            best_s = max(s_list, key=lambda x: x["weight"])
            lines.append(f"• *{ex_name}*: {len(s_list)} подход. (макс. *{best_s['weight']} кг* × {best_s['reps']})")

        if records:
            lines.append("")
            lines.append("🎉 *ЛИЧНЫЕ РЕКОРДЫ (PR):*")
            for r in records:
                lines.append(r)

        # Smart recovery tip
        title_lower = w_title.lower()
        if "push" in title_lower or "грудь" in title_lower or "жим" in title_lower:
            tip = "Грудные мышцы и трицепсы получили отличный стимул. Обеспечьте 25–35г белка и дайте плечевому поясу 48 часов отдыха."
        elif "pull" in title_lower or "спина" in title_lower or "тяга" in title_lower:
            tip = "Широчайшие и бицепсы качественно отработали. Растяжка спины и хороший 8-часовой сон ускорят анаболический отклик."
        elif "legs" in title_lower or "ноги" in title_lower or "присед" in title_lower:
            tip = "День ног дал максимальный выброс гормонов! Пейте больше воды, чтобы снизить крепатуру завтра."
        else:
            tip = "Отличная силовая сессия! Мышцы растут во время отдыха и сна. Закройте белковое окно и восстанавливайтесь."

        lines.append("")
        lines.append(f"💡 *Совет тренера:* {tip}")
        lines.append("━━━━━━━━━━━━━━━━━━━━")

        msg_text = "\n".join(lines)

        webapp_url = os.environ.get("RENDER_EXTERNAL_URL") or os.environ.get("WEBAPP_URL") or "https://feed-condense-afloat.ngrok-free.dev"
        url_file = os.path.join(base_dir, "current_tunnel_url.txt")
        if not os.environ.get("RENDER_EXTERNAL_URL") and os.path.exists(url_file):
            with open(url_file, "r", encoding="utf-8") as f:
                u = f.read().strip()
                if u.startswith("http"):
                    webapp_url = u

        import urllib.request
        pwa_url = f"{webapp_url.rstrip('/')}/?tg_id={target_chat_id}"
        send_payload = json.dumps({
            "chat_id": target_chat_id,
            "text": msg_text,
            "parse_mode": "Markdown",
            "reply_markup": {
                "inline_keyboard": [
                    [
                        {"text": "📊 В Telegram Mini App", "web_app": {"url": webapp_url}},
                        {"text": "🌐 В браузере (PWA)", "url": pwa_url}
                    ]
                ]
            }
        }).encode("utf-8")

        req = urllib.request.Request(
            f"https://api.telegram.org/bot{bot_token}/sendMessage",
            data=send_payload,
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=8) as r:
            pass
        print(f"✅ [Telegram Report] Отчет о тренировке успешно отправлен в chat {target_chat_id}!")
    except Exception as e:
        print(f"⚠️ [Telegram Report] Ошибка отправки отчета: {e}")

@app.post("/api/workouts/{workout_id}/finish", response_model=WorkoutSummaryResponse)
def finish_workout(
    workout_id: int,
    payload: WorkoutFinish,
    user_id: str = Depends(get_current_user_id)
):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, user_id, title, start_time, notes FROM workouts WHERE id = ?;", (workout_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Тренировка не найдена")

        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        new_notes = payload.notes if payload.notes is not None else row["notes"]
        cursor.execute(
            "UPDATE workouts SET end_time = ?, notes = ? WHERE id = ?;",
            (now_str, new_notes, workout_id)
        )

        cursor.execute("""
            SELECT COUNT(*) as total_sets, COALESCE(SUM(weight * reps), 0) as total_volume
            FROM workout_sets WHERE workout_id = ?;
        """, (workout_id,))
        stats = cursor.fetchone()

        # Send Telegram Summary Report
        send_telegram_workout_summary(cursor, workout_id, payload.telegram_chat_id)

        # Persist telegram_chat_id if provided
        target_uid = row["user_id"] or user_id
        if payload.telegram_chat_id and target_uid:
            try:
                base_dir = os.path.dirname(os.path.abspath(__file__))
                with open(os.path.join(base_dir, "telegram_chat_id.txt"), "w", encoding="utf-8") as f:
                    f.write(str(payload.telegram_chat_id))
                cursor.execute("UPDATE user_profiles SET telegram_chat_id = ? WHERE user_id = ?;", (payload.telegram_chat_id, target_uid))
            except Exception:
                pass

        return {
            "id": row["id"],
            "title": row["title"],
            "start_time": row["start_time"],
            "end_time": now_str,
            "notes": new_notes,
            "is_active": False,
            "total_sets": stats["total_sets"],
            "total_volume": float(stats["total_volume"])
        }

class SwapExerciseRequest(BaseModel):
    old_exercise_name: str
    new_exercise_name: str

@app.post("/api/workouts/{workout_id}/swap-exercise", response_model=WorkoutDetailResponse)
def swap_workout_exercise(
    workout_id: int,
    payload: SwapExerciseRequest,
    user_id: str = Depends(get_current_user_id),
    user_name: str = Depends(get_current_user_name)
):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, notes FROM workouts WHERE id = ? AND end_time IS NULL;", (workout_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Активная тренировка не найдена")
        
        notes = row["notes"] or ""
        swap_tag = f"swap:{payload.old_exercise_name.strip()}->{payload.new_exercise_name.strip()}"
        new_notes = f"{notes}|{swap_tag}"
        cursor.execute("UPDATE workouts SET notes = ? WHERE id = ?;", (new_notes, workout_id))
    return get_active_workout(user_id=user_id, user_name=user_name)

@app.get("/api/workouts", response_model=List[WorkoutSummaryResponse])
def list_workouts(
    limit: int = 50,
    user_id: str = Depends(get_current_user_id)
):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT w.id, w.title, w.start_time, w.end_time, w.notes,
                   COUNT(s.id) as total_sets,
                   COALESCE(SUM(s.weight * s.reps), 0) as total_volume
            FROM workouts w
            LEFT JOIN workout_sets s ON w.id = s.workout_id
            WHERE w.user_id = ?
            GROUP BY w.id
            ORDER BY w.id DESC
            LIMIT ?;
        """, (user_id, limit))
        rows = cursor.fetchall()
        result = []
        for r in rows:
            result.append({
                "id": r["id"],
                "title": r["title"],
                "start_time": r["start_time"],
                "end_time": r["end_time"],
                "notes": r["notes"] or "",
                "is_active": r["end_time"] is None,
                "total_sets": r["total_sets"],
                "total_volume": float(r["total_volume"])
            })
        return result

class SyncSetItem(BaseModel):
    exercise_name: str
    weight: float
    reps: int
    set_type: Optional[str] = "normal"
    set_number: Optional[int] = None

class SyncWorkoutItem(BaseModel):
    id: Optional[Union[int, str]] = None
    title: str
    start_time: str
    end_time: Optional[str] = None
    notes: Optional[str] = ""
    total_sets: Optional[int] = 0
    total_volume: Optional[float] = 0.0
    sets: Optional[List[SyncSetItem]] = []

class SyncWorkoutsRequest(BaseModel):
    workouts: List[SyncWorkoutItem]

@app.post("/api/workouts/sync")
def sync_workouts(
    payload: SyncWorkoutsRequest,
    user_id: str = Depends(get_current_user_id)
):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, name FROM exercises;")
        ex_map = {row["name"].lower(): row["id"] for row in cursor.fetchall()}

        synced_count = 0
        for w in payload.workouts:
            if not w.start_time:
                continue

            # Check if workout already exists by user_id and start_time
            cursor.execute(
                "SELECT id FROM workouts WHERE user_id = ? AND start_time = ?;",
                (user_id, w.start_time)
            )
            existing = cursor.fetchone()
            if existing:
                workout_id = existing["id"]
                # Update title/notes if provided
                cursor.execute(
                    "UPDATE workouts SET title = COALESCE(?, title), notes = COALESCE(?, notes), end_time = COALESCE(?, end_time) WHERE id = ?;",
                    (w.title, w.notes, w.end_time, workout_id)
                )
                if w.sets and len(w.sets) > 0:
                    cursor.execute("DELETE FROM workout_sets WHERE workout_id = ?;", (workout_id,))
                else:
                    continue
            else:
                cursor.execute(
                    "INSERT INTO workouts (user_id, title, start_time, end_time, notes) VALUES (?, ?, ?, ?, ?);",
                    (user_id, w.title or "Силовая тренировка", w.start_time, w.end_time or w.start_time, w.notes or "")
                )
                workout_id = cursor.lastrowid

            set_num = 1
            for s in (w.sets or []):
                ex_name = (s.exercise_name or "Упражнение").strip()
                ex_id = ex_map.get(ex_name.lower())
                if not ex_id:
                    cursor.execute("INSERT OR IGNORE INTO exercises (name, category) VALUES (?, ?);", (ex_name, "Базовые"))
                    cursor.execute("SELECT id FROM exercises WHERE name = ?;", (ex_name,))
                    ex_row = cursor.fetchone()
                    ex_id = ex_row["id"] if ex_row else 1
                    ex_map[ex_name.lower()] = ex_id

                cursor.execute("""
                    INSERT INTO workout_sets (workout_id, exercise_id, set_number, set_type, weight, reps, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?);
                """, (workout_id, ex_id, s.set_number or set_num, s.set_type or "normal", s.weight, s.reps, w.start_time))
                set_num += 1

            synced_count += 1

        print(f"🔄 [Sync] Synced {synced_count} workouts from client for user={user_id}")
        return {"status": "ok", "synced_count": synced_count}

@app.get("/api/workouts/{workout_id}", response_model=WorkoutDetailResponse)
def get_workout_detail(workout_id: int):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, title, start_time, end_time, notes FROM workouts WHERE id = ?;", (workout_id,))
        w_row = cursor.fetchone()
        if not row_exists(w_row):
            raise HTTPException(status_code=404, detail="Тренировка не найдена")

        cursor.execute("""
            SELECT s.id, s.workout_id, s.exercise_id, e.name as exercise_name,
                   s.set_number, COALESCE(s.set_type, 'normal') as set_type, s.weight, s.reps, s.created_at
            FROM workout_sets s
            JOIN exercises e ON s.exercise_id = e.id
            WHERE s.workout_id = ?
            ORDER BY s.id ASC;
        """, (workout_id,))
        sets = [dict(s) for s in cursor.fetchall()]

        return {
            "id": w_row["id"],
            "title": w_row["title"],
            "start_time": w_row["start_time"],
            "end_time": w_row["end_time"],
            "notes": w_row["notes"] or "",
            "is_active": w_row["end_time"] is None,
            "sets": sets
        }

def row_exists(row):
    return row is not None

# --- SETS ENDPOINTS ---

@app.post("/api/workouts/{workout_id}/sets", response_model=WorkoutSetResponse, status_code=status.HTTP_201_CREATED)
def add_workout_set(workout_id: int, payload: WorkoutSetCreate):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM workouts WHERE id = ?;", (workout_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Тренировка не найдена")

        cursor.execute("SELECT name FROM exercises WHERE id = ?;", (payload.exercise_id,))
        ex_row = cursor.fetchone()
        if not ex_row:
            raise HTTPException(status_code=404, detail="Упражнение не найдено")

        # Determine set_number for this exercise in this workout
        if payload.set_number is not None:
            set_num = payload.set_number
        else:
            cursor.execute("""
                SELECT COALESCE(MAX(set_number), 0) + 1 
                FROM workout_sets 
                WHERE workout_id = ? AND exercise_id = ?;
            """, (workout_id, payload.exercise_id))
            set_num = cursor.fetchone()[0]

        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        set_type = payload.set_type or "normal"
        cursor.execute("""
            INSERT INTO workout_sets (workout_id, exercise_id, set_number, set_type, weight, reps, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?);
        """, (workout_id, payload.exercise_id, set_num, set_type, payload.weight, payload.reps, now_str))
        set_id = cursor.lastrowid

        return {
            "id": set_id,
            "workout_id": workout_id,
            "exercise_id": payload.exercise_id,
            "exercise_name": ex_row["name"],
            "set_number": set_num,
            "set_type": set_type,
            "weight": payload.weight,
            "reps": payload.reps,
            "created_at": now_str
        }

@app.put("/api/sets/{set_id}", response_model=WorkoutSetResponse)
def update_workout_set(set_id: int, payload: WorkoutSetUpdate):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT s.id, s.workout_id, s.exercise_id, s.set_number, COALESCE(s.set_type, 'normal') as set_type,
                   s.weight, s.reps, s.created_at, e.name as exercise_name
            FROM workout_sets s
            JOIN exercises e ON e.id = s.exercise_id
            WHERE s.id = ?;
        """, (set_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Подход не найден")

        new_weight = payload.weight if payload.weight is not None else row["weight"]
        new_reps = payload.reps if payload.reps is not None else row["reps"]
        new_type = payload.set_type if payload.set_type is not None else row["set_type"]
        new_set_num = payload.set_number if payload.set_number is not None else row["set_number"]

        cursor.execute("""
            UPDATE workout_sets
            SET weight = ?, reps = ?, set_type = ?, set_number = ?
            WHERE id = ?;
        """, (new_weight, new_reps, new_type, new_set_num, set_id))

        return {
            "id": row["id"],
            "workout_id": row["workout_id"],
            "exercise_id": row["exercise_id"],
            "exercise_name": row["exercise_name"],
            "set_number": new_set_num,
            "set_type": new_type,
            "weight": new_weight,
            "reps": new_reps,
            "created_at": row["created_at"]
        }

@app.delete("/api/sets/{set_id}")
def delete_workout_set(set_id: int):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM workout_sets WHERE id = ?;", (set_id,))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Подход не найден")
        return {"status": "ok", "deleted_id": set_id}

@app.delete("/api/workouts/{workout_id}")
def delete_workout(
    workout_id: int,
    user_id: str = Depends(get_current_user_id)
):
    """Permanently deletes a workout and its sets, and records in deleted_workouts to prevent auto-re-seeding."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, user_id, start_time FROM workouts WHERE id = ?;", (workout_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Тренировка не найдена")

        w_uid = row["user_id"] or user_id
        start_time = row["start_time"]

        # Prevent automatic re-seeding on fresh server boot
        if start_time:
            try:
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS deleted_workouts (
                        user_id TEXT NOT NULL,
                        start_time TEXT NOT NULL,
                        deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        PRIMARY KEY (user_id, start_time)
                    );
                """)
                cursor.execute(
                    "INSERT OR REPLACE INTO deleted_workouts (user_id, start_time) VALUES (?, ?);",
                    (w_uid, start_time)
                )
                if user_id != w_uid:
                    cursor.execute(
                        "INSERT OR REPLACE INTO deleted_workouts (user_id, start_time) VALUES (?, ?);",
                        (user_id, start_time)
                    )
            except Exception as e:
                print(f"⚠️ Note on deleted_workouts recording: {e}")

        # Delete all sets for this workout
        cursor.execute("DELETE FROM workout_sets WHERE workout_id = ?;", (workout_id,))
        # Delete workout
        cursor.execute("DELETE FROM workouts WHERE id = ?;", (workout_id,))

        return {"status": "ok", "deleted_id": workout_id}

# ==========================================
# ⏱️ TELEGRAM BOT REST TIMER PUSH SCHEDULER
# ==========================================

_active_rest_timers: Dict[str, Any] = {}

class ScheduleTimerRequest(BaseModel):
    duration_seconds: int
    exercise_name: Optional[str] = "Следующий подход"
    next_set_num: Optional[int] = 1
    target_sets: Optional[int] = 3
    rec_weight: Optional[float] = None
    rec_reps: Optional[int] = None
    telegram_chat_id: Optional[int] = None

class CancelTimerRequest(BaseModel):
    telegram_chat_id: Optional[int] = None

def _send_telegram_rest_push_sync(chat_id: int, duration_seconds: int, exercise_name: str, next_set_num: int, target_sets: int, rec_weight: Optional[float], rec_reps: Optional[int]):
    """Sends a high-priority push message to Telegram user chat with audible sound and vibration."""
    try:
        base_dir = os.path.dirname(os.path.abspath(__file__))
        bot_token = os.environ.get("BOT_TOKEN")
        if not bot_token and os.path.exists(os.path.join(base_dir, "bot_token.txt")):
            try:
                with open(os.path.join(base_dir, "bot_token.txt"), "r", encoding="utf-8") as f:
                    bot_token = f.read().strip()
            except Exception:
                pass
        
        if not bot_token or not chat_id:
            return

        mins = duration_seconds // 60
        secs = duration_seconds % 60
        time_str = f"{mins} мин" if secs == 0 else (f"{secs} сек" if mins == 0 else f"{mins}м {secs}с")

        weight_str = f" — <b>{rec_weight} кг</b>" if (rec_weight is not None and rec_weight > 0) else ""
        reps_str = f" × <b>{rec_reps} повт.</b>" if (rec_reps is not None and rec_reps > 0) else ""
        safe_ex_name = html.escape(str(exercise_name or "Следующее упражнение"))

        msg_html = (
            f"⏱️ <b>Время отдыха вышло! ({time_str})</b>\n\n"
            f"💪 Пора на подход <b>{next_set_num}</b> из <b>{target_sets}</b>:\n"
            f"🏋️ <b>{safe_ex_name}</b>{weight_str}{reps_str}\n\n"
            f"<i>Заходи в приложение и запиши результат! 🔥</i>"
        )

        webapp_url = os.environ.get("RENDER_EXTERNAL_URL") or os.environ.get("WEBAPP_URL")
        url_file = os.path.join(base_dir, "current_tunnel_url.txt")
        if not webapp_url and os.path.exists(url_file):
            try:
                with open(url_file, "r", encoding="utf-8") as f:
                    u = f.read().strip()
                    if u.startswith("http"):
                        webapp_url = u
            except Exception:
                pass

        payload = {
            "chat_id": chat_id,
            "text": msg_html,
            "parse_mode": "HTML",
            "disable_notification": False  # Triggers native loud ringtone & vibration on phone!
        }

        if webapp_url:
            clean_url = webapp_url.rstrip("/")
            pwa_url = f"{clean_url}/?tg_id={chat_id}"
            payload["reply_markup"] = {
                "inline_keyboard": [
                    [
                        {"text": "⚡ В Telegram Mini App", "web_app": {"url": webapp_url}},
                        {"text": "🌐 В браузере (PWA)", "url": pwa_url}
                    ]
                ]
            }

        req = urllib.request.Request(
            f"https://api.telegram.org/bot{bot_token}/sendMessage",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=8) as r:
            pass
        print(f"🔔 [RestTimer] Push notification successfully sent to chat {chat_id}!")
    except Exception as e:
        print(f"⚠️ [RestTimer] Push notification note: {e}")

async def _rest_timer_worker(user_key: str, chat_id: int, duration_seconds: int, exercise_name: str, next_set_num: int, target_sets: int, rec_weight: Optional[float], rec_reps: Optional[int]):
    try:
        await asyncio.sleep(duration_seconds)
        # Verify this task wasn't cancelled or superseded
        current_info = _active_rest_timers.get(user_key)
        if current_info and current_info.get("task") == asyncio.current_task():
            _active_rest_timers.pop(user_key, None)
            await asyncio.to_thread(
                _send_telegram_rest_push_sync,
                chat_id, duration_seconds, exercise_name, next_set_num, target_sets, rec_weight, rec_reps
            )
    except asyncio.CancelledError:
        pass
    except Exception as e:
        print(f"⚠️ [RestTimer Worker] Error: {e}")

@app.post("/api/timer/schedule")
async def schedule_rest_timer(
    payload: ScheduleTimerRequest,
    user_id: str = Depends(get_current_user_id)
):
    base_dir = os.path.dirname(os.path.abspath(__file__))
    target_chat_id = payload.telegram_chat_id
    if not target_chat_id:
        if user_id.startswith("tg_") and user_id[3:].isdigit():
            target_chat_id = int(user_id[3:])
        elif user_id.isdigit():
            target_chat_id = int(user_id)

    if not target_chat_id:
        try:
            with get_db() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT telegram_chat_id FROM user_profiles WHERE user_id = ?;", (user_id,))
                p = cursor.fetchone()
                if p and p["telegram_chat_id"]:
                    target_chat_id = p["telegram_chat_id"]
                
                # Check if ANY user profile has a telegram_chat_id
                if not target_chat_id:
                    cursor.execute("SELECT telegram_chat_id FROM user_profiles WHERE telegram_chat_id IS NOT NULL ORDER BY updated_at DESC LIMIT 1;")
                    p_any = cursor.fetchone()
                    if p_any and p_any["telegram_chat_id"]:
                        target_chat_id = p_any["telegram_chat_id"]
        except Exception:
            pass

    # Check telegram_chat_id.txt fallback file
    if not target_chat_id:
        chat_id_file = os.path.join(base_dir, "telegram_chat_id.txt")
        if os.path.exists(chat_id_file):
            try:
                with open(chat_id_file, "r", encoding="utf-8") as f:
                    v = f.read().strip()
                    if v.isdigit():
                        target_chat_id = int(v)
            except Exception:
                pass

    # Check telegram bot getUpdates fallback
    if not target_chat_id:
        try:
            bot_token = os.environ.get("BOT_TOKEN")
            if not bot_token and os.path.exists(os.path.join(base_dir, "bot_token.txt")):
                with open(os.path.join(base_dir, "bot_token.txt"), "r", encoding="utf-8") as f:
                    bot_token = f.read().strip()
            if bot_token:
                req = urllib.request.Request(f"https://api.telegram.org/bot{bot_token}/getUpdates", timeout=4)
                with urllib.request.urlopen(req) as r:
                    upd_data = json.loads(r.read().decode())
                    results = upd_data.get("result", [])
                    if results:
                        last_msg = results[-1].get("message", {})
                        if last_msg.get("chat", {}).get("id"):
                            target_chat_id = last_msg["chat"]["id"]
        except Exception:
            pass

    # If resolved, cache it in user_profiles and telegram_chat_id.txt for future speed
    if target_chat_id:
        try:
            with open(os.path.join(base_dir, "telegram_chat_id.txt"), "w", encoding="utf-8") as f:
                f.write(str(target_chat_id))
            with get_db() as conn:
                conn.cursor().execute("UPDATE user_profiles SET telegram_chat_id = ? WHERE user_id = ?;", (target_chat_id, user_id))
        except Exception:
            pass

    user_key = f"{user_id}_{target_chat_id}"
    
    # Cancel previous timer if still running
    if user_key in _active_rest_timers:
        old_task = _active_rest_timers[user_key].get("task")
        if old_task and not old_task.done():
            old_task.cancel()
        _active_rest_timers.pop(user_key, None)

    if not target_chat_id or payload.duration_seconds <= 0:
        return {"status": "skipped", "reason": "no_chat_id_or_duration_zero"}

    task = asyncio.create_task(_rest_timer_worker(
        user_key=user_key,
        chat_id=target_chat_id,
        duration_seconds=payload.duration_seconds,
        exercise_name=payload.exercise_name or "Следующее упражнение",
        next_set_num=payload.next_set_num or 1,
        target_sets=payload.target_sets or 3,
        rec_weight=payload.rec_weight,
        rec_reps=payload.rec_reps
    ))

    _active_rest_timers[user_key] = {
        "task": task,
        "chat_id": target_chat_id,
        "duration": payload.duration_seconds
    }

    return {"status": "scheduled", "duration_seconds": payload.duration_seconds, "chat_id": target_chat_id}

@app.post("/api/timer/cancel")
async def cancel_rest_timer(
    payload: Optional[CancelTimerRequest] = None,
    user_id: str = Depends(get_current_user_id)
):
    base_dir = os.path.dirname(os.path.abspath(__file__))
    target_chat_id = payload.telegram_chat_id if payload else None
    if not target_chat_id:
        if user_id.startswith("tg_") and user_id[3:].isdigit():
            target_chat_id = int(user_id[3:])
        elif user_id.isdigit():
            target_chat_id = int(user_id)

    if not target_chat_id:
        chat_id_file = os.path.join(base_dir, "telegram_chat_id.txt")
        if os.path.exists(chat_id_file):
            try:
                with open(chat_id_file, "r", encoding="utf-8") as f:
                    v = f.read().strip()
                    if v.isdigit():
                        target_chat_id = int(v)
            except Exception:
                pass

    user_key = f"{user_id}_{target_chat_id}"
    cancelled = False
    if user_key in _active_rest_timers:
        old_task = _active_rest_timers[user_key].get("task")
        if old_task and not old_task.done():
            old_task.cancel()
        _active_rest_timers.pop(user_key, None)
        cancelled = True

    for k in list(_active_rest_timers.keys()):
        if k.startswith(f"{user_id}_"):
            t = _active_rest_timers[k].get("task")
            if t and not t.done():
                t.cancel()
            _active_rest_timers.pop(k, None)
            cancelled = True

    return {"status": "cancelled" if cancelled else "not_found"}

# --- ANALYTICS ENDPOINT ---

@app.get("/api/analytics/{exercise_id}", response_model=AnalyticsResponse)
def get_exercise_analytics(
    exercise_id: int,
    user_id: str = Depends(get_current_user_id)
):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, name FROM exercises WHERE id = ?;", (exercise_id,))
        ex = cursor.fetchone()
        if not ex:
            raise HTTPException(status_code=404, detail="Упражнение не найдено")

        # Query aggregate progress per workout over time for this user
        cursor.execute("""
            SELECT 
                w.id as workout_id,
                DATE(w.start_time) as workout_date,
                MAX(s.weight) as max_weight,
                SUM(s.weight * s.reps) as total_volume,
                MAX(s.weight * (1.0 + s.reps / 30.0)) as est_1rm,
                COUNT(s.id) as sets_count
            FROM workout_sets s
            JOIN workouts w ON s.workout_id = w.id
            WHERE s.exercise_id = ? AND w.user_id = ?
            GROUP BY w.id
            ORDER BY w.start_time ASC;
        """, (exercise_id, user_id))
        rows = cursor.fetchall()

        history: List[AnalyticsDataPoint] = []
        pr_weight = 0.0
        pr_volume = 0.0

        for r in rows:
            mw = float(r["max_weight"])
            tv = float(r["total_volume"])
            e1 = round(float(r["est_1rm"]), 1)
            if mw > pr_weight:
                pr_weight = mw
            if tv > pr_volume:
                pr_volume = tv

            history.append(AnalyticsDataPoint(
                date=r["workout_date"],
                workout_id=r["workout_id"],
                max_weight=mw,
                total_volume=tv,
                estimated_1rm=e1,
                sets_count=r["sets_count"]
            ))

        return AnalyticsResponse(
            exercise_id=ex["id"],
            exercise_name=ex["name"],
            history=history,
            personal_record_weight=pr_weight,
            personal_record_volume=pr_volume
        )

# --- COACH & PROGRESSIVE OVERLOAD ENDPOINTS ---

@app.get("/api/coach/days")
def get_all_coach_days(
    variant: Optional[str] = None,
    user_id: str = Depends(get_current_user_id),
    user_name: str = Depends(get_current_user_name)
):
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, title, notes FROM workouts WHERE user_id = ? AND end_time IS NOT NULL ORDER BY id DESC LIMIT 20;", (user_id,))
        recent = cursor.fetchall()

        # 1. Determine recommended next day type (push -> pull -> legs -> push)
        rec_day = "push"
        for r in recent:
            t = (r["title"] or "").lower()
            n = (r["notes"] or "").lower()
            if "push" in t or "толкай" in t or "day_type:push" in n:
                rec_day = "pull"
                break
            elif "pull" in t or "тяни" in t or "day_type:pull" in n:
                rec_day = "legs"
                break
            elif "legs" in t or "ноги" in t or "day_type:legs" in n:
                rec_day = "push"
                break

        # 2. Determine recommended variant for EACH day type (alternate A and B to vary stimulus!)
        variant_recommendations = {"push": "a", "pull": "a", "legs": "a"}
        for d in ["push", "pull", "legs"]:
            for r in recent:
                t = (r["title"] or "").lower()
                n = (r["notes"] or "").lower()
                if d in t or f"day_type:{d}" in n:
                    if "variant:a" in n or "вариант а" in t:
                        variant_recommendations[d] = "b"
                    elif "variant:b" in n or "вариант б" in t:
                        variant_recommendations[d] = "a"
                    break

        profile = get_user_profile_dict(cursor, user_id=user_id, user_name=user_name)
        days_result = []
        for key, template in PPL_PROGRAMS.items():
            if variant and variant.lower() in ["a", "b"] and template.get("variant") != variant.lower():
                continue
            day_data = enrich_single_plan(template, cursor, profile=profile, user_id=user_id)
            is_rec = (template["type"] == rec_day and template.get("variant") == variant_recommendations.get(rec_day, "a"))
            day_data["is_recommended"] = is_rec
            day_data["is_day_recommended"] = (template["type"] == rec_day)
            day_data["recommended_variant_for_day"] = variant_recommendations.get(template["type"], "a")
            days_result.append(day_data)

        return days_result

@app.get("/api/coach/next-workout")
def get_next_workout_plan(
    user_id: str = Depends(get_current_user_id),
    user_name: str = Depends(get_current_user_name)
):
    days = get_all_coach_days(variant=None, user_id=user_id, user_name=user_name)
    for d in days:
        if d.get("is_recommended"):
            return d
    return days[0]

class StartDayRequest(BaseModel):
    day_type: str # 'push' | 'pull' | 'legs'
    variant: Optional[str] = "a" # 'a' | 'b'

@app.post("/api/coach/start-day")
def start_day_workout(
    payload: StartDayRequest,
    user_id: str = Depends(get_current_user_id),
    user_name: str = Depends(get_current_user_name)
):
    var = (payload.variant or "a").lower()
    prog_key = f"{payload.day_type.lower()}_{var}"
    target_template = PPL_PROGRAMS.get(prog_key) or PPL_PROGRAMS.get(f"{payload.day_type.lower()}_a")
    title = target_template["title"]
    notes = f"day_type:{target_template['type']}|variant:{target_template['variant']}|{target_template['focus']}"
    return start_workout(WorkoutStart(title=title, notes=notes), user_id=user_id, user_name=user_name)

@app.post("/api/coach/start-planned")
def start_planned_workout(
    user_id: str = Depends(get_current_user_id),
    user_name: str = Depends(get_current_user_name)
):
    plan = get_next_workout_plan(user_id=user_id, user_name=user_name)
    title = plan["title"]
    notes = f"day_type:{plan['type']}|variant:{plan.get('variant', 'a')}|{plan['focus']}"
    return start_workout(WorkoutStart(title=title, notes=notes), user_id=user_id, user_name=user_name)

# --- USER PROFILE ENDPOINTS ---

@app.get("/api/profile", response_model=UserProfileModel)
def get_user_profile(
    user_id: str = Depends(get_current_user_id),
    user_name: str = Depends(get_current_user_name)
):
    with get_db() as conn:
        cursor = conn.cursor()
        return get_user_profile_dict(cursor, user_id=user_id, user_name=user_name)

@app.put("/api/profile", response_model=UserProfileModel)
def update_user_profile(
    payload: UserProfileUpdate,
    user_id: str = Depends(get_current_user_id),
    user_name: str = Depends(get_current_user_name)
):
    with get_db() as conn:
        cursor = conn.cursor()
        current = get_user_profile_dict(cursor, user_id=user_id, user_name=user_name)

        updates = payload.dict(exclude_unset=True)
        for k, v in updates.items():
            if v is not None:
                current[k] = v

        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        cursor.execute("""
            UPDATE user_profiles 
            SET name = ?, gender = ?, age = ?, height = ?, weight = ?,
                experience_level = ?, fitness_goal = ?, injuries = ?, equipment = ?,
                onboarding_completed = ?, updated_at = ?
            WHERE user_id = ?;
        """, (
            current.get("name", "Атлет"),
            current.get("gender", "male"),
            int(current.get("age", 28)),
            float(current.get("height", 180.0)),
            float(current.get("weight", 80.0)),
            current.get("experience_level", "intermediate"),
            current.get("fitness_goal", "hypertrophy"),
            current.get("injuries", ""),
            current.get("equipment", "gym"),
            int(current.get("onboarding_completed", 1)),
            now_str,
            user_id
        ))
        current["updated_at"] = now_str
        return current

# --- STATIC FILES & PWA ---

STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
os.makedirs(STATIC_DIR, exist_ok=True)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

@app.get("/")
def serve_index():
    index_path = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"message": "GymTracker PWA Backend Running"}

@app.get("/manifest.json")
def serve_manifest():
    return FileResponse(os.path.join(STATIC_DIR, "manifest.json"), media_type="application/manifest+json")

@app.get("/sw.js")
def serve_sw():
    return FileResponse(os.path.join(STATIC_DIR, "sw.js"), media_type="application/javascript")

@app.get("/healthz")
def healthz():
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)

