"""
Скрипт импорта реальной истории тренировок из чата Gemini в SQLite (workouts.db).
"""
import sqlite3
import os
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), "workouts.db")

WORKOUTS_DATA = [
    {
        "title": "День 1: Push (Толкай) — Неделя 1",
        "date": "2026-09-15 19:30:00",
        "end_date": "2026-09-15 20:45:00",
        "notes": "Первая жимовая тренировка цикла. Грудные, плечи, трицепс. Берегли локти и кисти.",
        "exercises": [
            {
                "name": "Жим гантелей на наклонной скамье (30°)",
                "category": "Грудь",
                "sets": [(20.0, 10), (20.0, 10), (20.0, 9), (20.0, 9)]
            },
            {
                "name": "Жим штанги лежа",
                "category": "Грудь",
                "sets": [(50.0, 10), (50.0, 9)]
            },
            {
                "name": "Отжимания на брусьях / гравитрон",
                "category": "Трицепс",
                "sets": [(0.0, 6), (15.0, 5), (25.0, 7)] # 0 = свой вес, 15/25 = гравитрон
            },
            {
                "name": "Тяга штанги к подбородку широким хватом",
                "category": "Плечи",
                "sets": [(20.0, 10), (25.0, 12), (25.0, 12), (25.0, 11)]
            },
            {
                "name": "Разгибания рук на верхнем блоке с канатом",
                "category": "Трицепс",
                "sets": [(24.0, 13), (24.0, 11), (24.0, 10)]
            }
        ]
    },
    {
        "title": "День 2: Pull (Тяни) — Неделя 1",
        "date": "2026-09-17 19:15:00",
        "end_date": "2026-09-17 20:35:00",
        "notes": "Спина, задняя дельта, бицепс. Работа на ширину и толщину спины.",
        "exercises": [
            {
                "name": "Тяга верхнего блока к груди",
                "category": "Спина",
                "sets": [(45.0, 8), (45.0, 8), (40.0, 7)]
            },
            {
                "name": "Тяга в тренажере с упором в грудь (Т-тяга)",
                "category": "Спина",
                "sets": [(20.0, 8), (30.0, 7), (30.0, 7), (25.0, 9)]
            },
            {
                "name": "Горизонтальная тяга блока (V-хват)",
                "category": "Спина",
                "sets": [(30.0, 12), (35.0, 10), (35.0, 8)]
            },
            {
                "name": "Peck-Deck на заднюю дельту",
                "category": "Плечи",
                "sets": [(20.0, 10), (25.0, 9), (20.0, 10)]
            },
            {
                "name": "Сгибания рук с EZ-грифом на бицепс стоя",
                "category": "Руки",
                "sets": [(20.0, 10), (20.0, 12), (20.0, 10)]
            },
            {
                "name": "Молотки с гантелями",
                "category": "Руки",
                "sets": [(7.0, 10), (7.0, 9)]
            }
        ]
    },
    {
        "title": "День 1: Push (Толкай) — Неделя 2",
        "date": "2026-09-22 19:30:00",
        "end_date": "2026-09-22 20:50:00",
        "notes": "Прогрессия веса на наклонной скамье до 22 кг. Жим штанги 50 кг 3 подхода.",
        "exercises": [
            {
                "name": "Жим гантелей на наклонной скамье (30°)",
                "category": "Грудь",
                "sets": [(22.0, 8), (22.0, 7), (20.0, 7)]
            },
            {
                "name": "Жим штанги лежа",
                "category": "Грудь",
                "sets": [(50.0, 10), (50.0, 7), (50.0, 6)]
            },
            {
                "name": "Отжимания на брусьях / гравитрон",
                "category": "Трицепс",
                "sets": [(0.0, 6), (0.0, 5), (0.0, 5)] # Со своим весом!
            },
            {
                "name": "Тяга штанги к подбородку широким хватом",
                "category": "Плечи",
                "sets": [(20.0, 12), (20.0, 12), (20.0, 11)]
            },
            {
                "name": "Разгибания рук на верхнем блоке с канатом",
                "category": "Трицепс",
                "sets": [(18.0, 6), (14.0, 9), (14.0, 8)] # 40 lbs / 30 lbs
            }
        ]
    },
    {
        "title": "День 2: Pull (Тяни) — Неделя 2",
        "date": "2026-09-24 19:20:00",
        "end_date": "2026-09-24 20:45:00",
        "notes": "Пулл-день с повышенным объемом. Тяга гантели 18 кг на 4 подхода + Straight-arm pulldown.",
        "exercises": [
            {
                "name": "Подтягивания (турник / резина)",
                "category": "Спина",
                "sets": [(0.0, 4), (0.0, 4), (0.0, 7), (0.0, 5)]
            },
            {
                "name": "Тяга гантели в наклоне одной рукой",
                "category": "Спина",
                "sets": [(20.0, 10), (18.0, 12), (18.0, 10), (18.0, 10)]
            },
            {
                "name": "Тяга верхнего блока к груди",
                "category": "Спина",
                "sets": [(50.0, 9), (50.0, 7), (45.0, 9)]
            },
            {
                "name": "Сгибания рук с EZ-грифом на бицепс стоя",
                "category": "Руки",
                "sets": [(20.0, 10), (20.0, 10), (20.0, 8)]
            },
            {
                "name": "Молотки с гантелями",
                "category": "Руки",
                "sets": [(10.0, 10), (10.0, 8), (10.0, 7)]
            },
            {
                "name": "Тяга верхнего блока прямыми руками (Straight-arm)",
                "category": "Спина",
                "sets": [(23.0, 10), (23.0, 8), (23.0, 5)] # 50 lbs
            }
        ]
    },
    {
        "title": "День 3: Legs (Ноги) — Неделя 2",
        "date": "2026-09-26 19:00:00",
        "end_date": "2026-09-26 20:30:00",
        "notes": "Мощный день ног: Жим платформы 110 кг x 12, Румынская тяга 22 кг, пресс в тренажере.",
        "exercises": [
            {
                "name": "Жим ногами в тренажере",
                "category": "Ноги",
                "sets": [(100.0, 10), (100.0, 11), (110.0, 10), (110.0, 12)]
            },
            {
                "name": "Румынская тяга",
                "category": "Ноги",
                "sets": [(18.0, 11), (22.0, 10), (22.0, 12), (22.0, 10)]
            },
            {
                "name": "Выпады вперед",
                "category": "Ноги",
                "sets": [(12.0, 10), (12.0, 8), (12.0, 8)]
            },
            {
                "name": "Сгибание ног сидя",
                "category": "Ноги",
                "sets": [(35.0, 12), (35.0, 11), (35.0, 8)]
            },
            {
                "name": "Разгибания ног в тренажере",
                "category": "Ноги",
                "sets": [(40.0, 15), (45.0, 12), (45.0, 10)]
            },
            {
                "name": "Подъем на носки стоя",
                "category": "Ноги",
                "sets": [(35.0, 20), (40.0, 16), (40.0, 13)]
            },
            {
                "name": "Скручивания на пресс в тренажере",
                "category": "Пресс",
                "sets": [(10.0, 20), (20.0, 11), (20.0, 9)]
            }
        ]
    }
]

def import_history():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    cursor = conn.cursor()

    print("[+] Импорт реальной истории тренировок Аби из выгрузки Gemini...")

    # Очищаем старые демонстрационные тренировки, чтобы заполнить реальными данными
    cursor.execute("DELETE FROM workout_sets;")
    cursor.execute("DELETE FROM workouts;")
    conn.commit()

    total_sets = 0
    total_workouts = 0

    for w in WORKOUTS_DATA:
        cursor.execute(
            "INSERT INTO workouts (title, start_time, end_time, notes) VALUES (?, ?, ?, ?);",
            (w["title"], w["date"], w["end_date"], w["notes"])
        )
        workout_id = cursor.lastrowid
        total_workouts += 1

        for ex_data in w["exercises"]:
            ex_name = ex_data["name"]
            ex_cat = ex_data.get("category", "Базовые")

            # Находим или создаем упражнение
            cursor.execute("SELECT id FROM exercises WHERE name = ?;", (ex_name,))
            row = cursor.fetchone()
            if row:
                exercise_id = row["id"]
            else:
                cursor.execute(
                    "INSERT INTO exercises (name, category) VALUES (?, ?);",
                    (ex_name, ex_cat)
                )
                exercise_id = cursor.lastrowid

            # Вставляем подходы
            for set_idx, (weight, reps) in enumerate(ex_data["sets"], 1):
                cursor.execute("""
                    INSERT INTO workout_sets (workout_id, exercise_id, set_number, weight, reps, created_at)
                    VALUES (?, ?, ?, ?, ?, ?);
                """, (workout_id, exercise_id, set_idx, weight, reps, w["date"]))
                total_sets += 1

    conn.commit()
    conn.close()
    print(f"[SUCCESS] Успешно импортировано: {total_workouts} тренировок, {total_sets} подходов!")

if __name__ == "__main__":
    import_history()
