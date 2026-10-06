"""
Скрипт инициализации базы данных SQLite и предзаполнения списка упражнений.
"""
import sys
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
from datetime import datetime, timedelta
from database import init_database, get_db

DEFAULT_EXERCISES = [
    # Push A & B
    "Жим гантелей на наклонной скамье (30°)",
    "Жим штанги на наклонной скамье",
    "Жим штанги лежа",
    "Жим гантелей на горизонтальной скамье",
    "Жим гантелей сидя на плечи",
    "Армейский жим штанги стоя",
    "Жим Арнольда",
    "Сведение рук в кроссовере",
    "Отжимания на брусьях / гравитрон",
    "Тяга штанги к подбородку широким хватом",
    "Махи гантелями через стороны",
    "Французский жим со штангой лежа",
    "Французский жим с гантелью из-за головы",
    "Разгибания рук на верхнем блоке с канатом",
    "Разгибания рук на блоке с V-рукоятью",
    # Pull A & B
    "Подтягивания (турник / резина)",
    "Тяга штанги в наклоне",
    "Тяга гантели в наклоне одной рукой",
    "Тяга верхнего блока к груди",
    "Тяга верхнего блока параллельным хватом",
    "Тяга Т-грифа с упором в грудь",
    "Горизонтальная тяга блока (V-хват)",
    "Пуловер с гантелью на скамье",
    "Гиперэкстензия",
    "Сгибания рук с EZ-грифом на бицепс стоя",
    "Сгибания на скамье Скотта",
    "Концентрированные сгибания на бицепс",
    "Молотки с гантелями",
    "Тяга верхнего блока прямыми руками (Straight-arm)",
    "Peck-Deck на заднюю дельту",
    "Тяга каната к лицу (Face pulls)",
    # Legs A & B
    "Приседания со штангой на плечах",
    "Приседания в Гакк-тренажере",
    "Жим ногами в тренажере",
    "Гоблет-приседания",
    "Румынская тяга",
    "Ягодичный мостик со штангой",
    "Болгарские сплит-приседания",
    "Выпады вперед",
    "Сгибание ног сидя",
    "Сгибания ног в тренажере лежа",
    "Разгибания ног в тренажере",
    "Подъем на носки стоя",
    "Подъем на носки в тренажере",
    "Скручивания на пресс в тренажере",
    "Подъем ног в висе"
]

def seed_exercises():
    init_database()
    
    with get_db() as conn:
        cursor = conn.cursor()
        print("[+] Инициализация таблицы упражнений...")
        inserted_count = 0
        for name in DEFAULT_EXERCISES:
            try:
                cursor.execute(
                    "INSERT INTO exercises (name, category) VALUES (?, ?)",
                    (name, "Базовые")
                )
                inserted_count += 1
                print(f"  ✓ Добавлено упражнение: {name}")
            except Exception:
                print(f"  - Упражнение уже существует: {name}")
                
        print(f"[OK] Предзаполнение завершено. Добавлено новых: {inserted_count}")

def seed_sample_history_if_empty():
    """
    Добавляет историю тренировок за последние несколько недель для демонстрации
    работы графиков аналитики, если в базе еще нет тренировок.
    """
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM workouts;")
        if cursor.fetchone()[0] > 0:
            print("[i] История тренировок уже существует, пропускаем создание демо-данных.")
            return

        print("[+] Добавление демонстрационной истории тренировок для аналитики...")
        
        # Получаем ID упражнений
        cursor.execute("SELECT id, name FROM exercises;")
        ex_map = {row["name"]: row["id"] for row in cursor.fetchall()}
        
        # Генерируем 5 тренировок с ростом рабочего веса за последний месяц
        now = datetime.now()
        demo_workouts = [
            (now - timedelta(days=28), "День ног & Жим", [
                (ex_map.get("Гоблет-приседания"), [(16.0, 12), (18.0, 10), (20.0, 8)]),
                (ex_map.get("Жим гантелей на наклонной скамье"), [(16.0, 10), (18.0, 8), (18.0, 8)]),
                (ex_map.get("Румынская тяга"), [(40.0, 12), (45.0, 10), (50.0, 8)]),
            ]),
            (now - timedelta(days=21), "Фулбоди", [
                (ex_map.get("Гоблет-приседания"), [(18.0, 12), (20.0, 10), (22.0, 8)]),
                (ex_map.get("Жим гантелей на наклонной скамье"), [(18.0, 10), (20.0, 8), (20.0, 8)]),
                (ex_map.get("Румынская тяга"), [(45.0, 10), (50.0, 10), (55.0, 8)]),
                (ex_map.get("Сгибание ног сидя"), [(30.0, 12), (35.0, 10)]),
            ]),
            (now - timedelta(days=14), "Прогрессия весов", [
                (ex_map.get("Гоблет-приседания"), [(20.0, 12), (22.0, 10), (24.0, 8)]),
                (ex_map.get("Жим гантелей на наклонной скамье"), [(20.0, 10), (22.0, 8), (22.0, 8)]),
                (ex_map.get("Румынская тяга"), [(50.0, 10), (55.0, 10), (60.0, 7)]),
                (ex_map.get("Выпады вперед"), [(12.0, 10), (14.0, 10)]),
            ]),
            (now - timedelta(days=7), "Интенсивная тренировка", [
                (ex_map.get("Гоблет-приседания"), [(22.0, 10), (24.0, 10), (26.0, 8)]),
                (ex_map.get("Жим гантелей на наклонной скамье"), [(22.0, 10), (24.0, 8), (24.0, 8)]),
                (ex_map.get("Румынская тяга"), [(55.0, 10), (60.0, 8), (65.0, 6)]),
                (ex_map.get("Скручивания на блоке (кроссовер)"), [(25.0, 15), (30.0, 12)]),
            ]),
            (now - timedelta(days=2), "Пиковая форма", [
                (ex_map.get("Гоблет-приседания"), [(24.0, 10), (26.0, 8), (28.0, 6)]),
                (ex_map.get("Жим гантелей на наклонной скамье"), [(24.0, 10), (26.0, 8), (26.0, 7)]),
                (ex_map.get("Румынская тяга"), [(60.0, 10), (65.0, 8), (70.0, 6)]),
                (ex_map.get("Подъем на носки стоя"), [(50.0, 15), (60.0, 12)]),
            ]),
        ]

        for dt, title, sets_data in demo_workouts:
            start_str = dt.strftime("%Y-%m-%d %H:%M:%S")
            end_str = (dt + timedelta(minutes=50)).strftime("%Y-%m-%d %H:%M:%S")
            cursor.execute(
                "INSERT INTO workouts (title, start_time, end_time, notes) VALUES (?, ?, ?, ?)",
                (title, start_str, end_str, "Демонстрационная тренировка")
            )
            workout_id = cursor.lastrowid
            
            for ex_id, sets in sets_data:
                if not ex_id:
                    continue
                for set_idx, (w, r) in enumerate(sets, 1):
                    cursor.execute(
                        """INSERT INTO workout_sets 
                           (workout_id, exercise_id, set_number, weight, reps, created_at)
                           VALUES (?, ?, ?, ?, ?, ?)""",
                        (workout_id, ex_id, set_idx, w, r, start_str)
                    )

        print("[OK] Демо-данные успешно добавлены.")

def seed_real_user_history():
    """Seeds the user's real workouts from 2026-09-29 and 2026-10-01 so they are permanently preserved across fresh server installs."""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, name FROM exercises;")
        ex_map = {r['name'].lower(): r['id'] for r in cursor.fetchall()}

        workouts_data = [
            {
                'title': 'День 3: Legs (Ноги) — Неделя 2',
                'start_time': '2026-09-26 19:00:00',
                'end_time': '2026-09-26 20:30:00',
                'notes': 'Рекорд в жиме: пожал 110 кг x 12, гоблет с 22 кг, пресс отлично.',
                'sets': [
                    ('Жим ногами в тренажере', 100.0, 10, 'normal'),
                    ('Жим ногами в тренажере', 100.0, 11, 'normal'),
                    ('Жим ногами в тренажере', 110.0, 10, 'normal'),
                    ('Жим ногами в тренажере', 110.0, 12, 'normal'),

                    ('Гоблет-приседания', 18.0, 11, 'normal'),
                    ('Гоблет-приседания', 22.0, 10, 'normal'),
                    ('Гоблет-приседания', 22.0, 12, 'normal'),
                    ('Гоблет-приседания', 22.0, 10, 'normal'),

                    ('Румынская тяга', 12.0, 10, 'normal'),
                    ('Румынская тяга', 12.0, 8, 'normal'),
                    ('Румынская тяга', 12.0, 8, 'normal'),

                    ('Сгибание ног сидя', 35.0, 12, 'normal'),
                    ('Сгибание ног сидя', 35.0, 11, 'normal'),
                    ('Сгибание ног сидя', 35.0, 8, 'normal'),

                    ('Разгибания ног в тренажере', 40.0, 15, 'normal'),
                    ('Разгибания ног в тренажере', 45.0, 12, 'normal'),
                    ('Разгибания ног в тренажере', 45.0, 10, 'normal'),

                    ('Подъем на носки стоя', 35.0, 20, 'normal'),
                    ('Подъем на носки стоя', 40.0, 16, 'normal'),
                    ('Подъем на носки стоя', 40.0, 13, 'normal'),

                    ('Скручивания на пресс в тренажере', 10.0, 20, 'normal'),
                    ('Скручивания на пресс в тренажере', 20.0, 11, 'normal'),
                    ('Скручивания на пресс в тренажере', 20.0, 9, 'normal'),
                ]
            },
            {
                'title': 'День 1: Push (Толкай) — Вариант А',
                'start_time': '2026-09-29 17:47:00',
                'end_time': '2026-09-29 19:09:00',
                'notes': 'day_type:push|variant:a|Грудь, плечи, трицепс',
                'sets': [
                    ('Жим гантелей на горизонтальной скамье', 15.0, 12, 'warmup'),
                    ('Жим гантелей на горизонтальной скамье', 18.0, 10, 'normal'),
                    ('Жим гантелей на горизонтальной скамье', 20.0, 10, 'normal'),
                    ('Жим гантелей на горизонтальной скамье', 22.5, 8, 'normal'),

                    ('Жим гантелей на наклонной скамье (30°)', 16.0, 10, 'normal'),
                    ('Жим гантелей на наклонной скамье (30°)', 18.0, 9, 'normal'),
                    ('Жим гантелей на наклонной скамье (30°)', 20.0, 5, 'normal'),

                    ('Жим гантелей сидя на плечи', 10.0, 12, 'warmup'),
                    ('Жим гантелей сидя на плечи', 12.0, 10, 'normal'),
                    ('Жим гантелей сидя на плечи', 14.0, 10, 'normal'),
                    ('Жим гантелей сидя на плечи', 15.0, 7, 'normal'),

                    ('Тяга штанги к подбородку широким хватом', 25.0, 15, 'normal'),
                    ('Тяга штанги к подбородку широким хватом', 27.5, 12, 'normal'),
                    ('Тяга штанги к подбородку широким хватом', 30.0, 13, 'normal'),

                    ('Французский жим со штангой лежа', 15.0, 12, 'warmup'),
                    ('Французский жим со штангой лежа', 17.5, 12, 'normal'),
                    ('Французский жим со штангой лежа', 20.0, 10, 'normal'),

                    ('Французский жим с гантелью из-за головы', 16.0, 10, 'normal'),
                    ('Французский жим с гантелью из-за головы', 18.0, 11, 'normal'),
                    ('Французский жим с гантелью из-за головы', 20.0, 6, 'normal'),
                ]
            },
            {
                'title': 'День 2: Pull (Тяни) — Вариант А',
                'start_time': '2026-10-01 16:24:07',
                'end_time': '2026-10-01 17:30:45',
                'notes': 'day_type:pull|variant:a|Подтягивания, тяга штанги в наклоне, руки, поясница|swap:Горизонтальная тяга блока (V-хват)->Тяга гантели в наклоне одной рукой',
                'sets': [
                    ('Подтягивания (турник / резина)', 0.0, 8, 'warmup'),
                    ('Подтягивания (турник / резина)', 0.0, 8, 'normal'),
                    ('Подтягивания (турник / резина)', 20.0, 7, 'normal'),

                    ('Тяга штанги в наклоне', 20.0, 10, 'warmup'),
                    ('Тяга штанги в наклоне', 25.0, 10, 'normal'),
                    ('Тяга штанги в наклоне', 30.0, 10, 'normal'),
                    ('Тяга штанги в наклоне', 40.0, 10, 'normal'),

                    ('Тяга гантели в наклоне одной рукой', 10.0, 12, 'normal'),
                    ('Тяга гантели в наклоне одной рукой', 15.0, 12, 'normal'),
                    ('Тяга гантели в наклоне одной рукой', 15.0, 12, 'normal'),

                    ('Peck-Deck на заднюю дельту', 15.0, 10, 'normal'),
                    ('Peck-Deck на заднюю дельту', 20.0, 10, 'normal'),
                    ('Peck-Deck на заднюю дельту', 25.0, 10, 'normal'),

                    ('Сгибания рук с EZ-грифом на бицепс стоя', 17.5, 10, 'normal'),
                    ('Сгибания рук с EZ-грифом на бицепс стоя', 20.0, 10, 'normal'),
                    ('Сгибания рук с EZ-грифом на бицепс стоя', 22.5, 10, 'normal'),
                    ('Сгибания рук с EZ-грифом на бицепс стоя', 25.0, 9, 'normal'),

                    ('Молотки с гантелями', 8.0, 10, 'normal'),
                    ('Молотки с гантелями', 9.0, 10, 'normal'),
                    ('Молотки с гантелями', 10.0, 10, 'normal'),

                    ('Гиперэкстензия', 5.0, 15, 'normal'),
                    ('Гиперэкстензия', 15.0, 15, 'normal'),
                    ('Гиперэкстензия', 20.0, 15, 'normal'),
                ]
            }
        ]

        user_ids = ['tg_591306946', 'default']
        cursor.execute('''
            INSERT OR REPLACE INTO user_profiles 
            (user_id, name, gender, age, height, weight, experience_level, fitness_goal, injuries, equipment, onboarding_completed, telegram_chat_id, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        ''', ('tg_591306946', 'DEBOOSTER', 'male', 26, 186.0, 80.0, 'intermediate', 'hypertrophy', 'Плечи', 'gym', 1, 591306946, '2026-09-29 17:47:00'))

        for u_id in user_ids:
            for w in workouts_data:
                cursor.execute("SELECT id FROM workouts WHERE user_id = ? AND start_time = ?;", (u_id, w['start_time']))
                existing = cursor.fetchone()
                if existing:
                    w_id = existing["id"]
                    cursor.execute("SELECT COUNT(*) FROM workout_sets WHERE workout_id = ?;", (w_id,))
                    count = cursor.fetchone()[0]
                    if count > 0:
                        continue
                else:
                    cursor.execute(
                        "INSERT INTO workouts (user_id, title, start_time, end_time, notes) VALUES (?, ?, ?, ?, ?);",
                        (u_id, w['title'], w['start_time'], w['end_time'], w['notes'])
                    )
                    w_id = cursor.lastrowid

                set_num = 1
                for ex_name, w_val, r_val, st in w['sets']:
                    ex_id = ex_map.get(ex_name.lower())
                    if not ex_id:
                        cursor.execute("INSERT OR IGNORE INTO exercises (name, category) VALUES (?, ?);", (ex_name, "Базовые"))
                        cursor.execute("SELECT id FROM exercises WHERE name = ?;", (ex_name,))
                        ex_row = cursor.fetchone()
                        ex_id = ex_row["id"] if ex_row else 1
                        ex_map[ex_name.lower()] = ex_id
                    cursor.execute('''
                        INSERT INTO workout_sets (workout_id, exercise_id, set_number, set_type, weight, reps, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?);
                    ''', (w_id, ex_id, set_num, st, w_val, r_val, w['start_time']))
                    set_num += 1

if __name__ == "__main__":
    seed_exercises()
    # Если запущен с аргументом --clean, удаляем старую БД
    if "--demo" in sys.argv or True:
        seed_sample_history_if_empty()
    seed_real_user_history()
    print("[SUCCESS] База данных готова к работе!")
