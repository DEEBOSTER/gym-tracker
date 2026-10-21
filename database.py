import sqlite3
import os
from contextlib import contextmanager

DB_PATH = os.path.join(os.path.dirname(__file__), "workouts.db")

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn

@contextmanager
def get_db():
    conn = get_db_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

def init_database():
    """Initializes the SQLite schema."""
    with get_db() as conn:
        cursor = conn.cursor()
        
        # Exercises table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS exercises (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                category TEXT DEFAULT 'Базовые',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        
        # Workouts table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS workouts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT DEFAULT 'Силовая тренировка',
                start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                end_time TIMESTAMP NULL,
                notes TEXT DEFAULT ''
            );
        """)
        
        # Workout sets table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS workout_sets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                workout_id INTEGER NOT NULL,
                exercise_id INTEGER NOT NULL,
                set_number INTEGER NOT NULL,
                set_type TEXT DEFAULT 'normal',
                weight REAL NOT NULL,
                reps INTEGER NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (workout_id) REFERENCES workouts (id) ON DELETE CASCADE,
                FOREIGN KEY (exercise_id) REFERENCES exercises (id) ON DELETE CASCADE
            );
        """)
        
        # Migration: ensure set_type column exists
        try:
            cursor.execute("ALTER TABLE workout_sets ADD COLUMN set_type TEXT DEFAULT 'normal';")
        except Exception:
            pass

        cursor.execute("CREATE INDEX IF NOT EXISTS idx_sets_workout ON workout_sets(workout_id);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_sets_exercise ON workout_sets(exercise_id);")

        # Migration: ensure workouts has user_id
        try:
            cursor.execute("ALTER TABLE workouts ADD COLUMN user_id TEXT DEFAULT 'default';")
        except Exception:
            pass
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_workouts_user ON workouts(user_id);")

        # Multi-user profile table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS user_profiles (
                user_id TEXT PRIMARY KEY,
                name TEXT DEFAULT 'Атлет',
                gender TEXT DEFAULT 'male',
                age INTEGER DEFAULT 28,
                height REAL DEFAULT 180.0,
                weight REAL DEFAULT 80.0,
                experience_level TEXT DEFAULT 'intermediate',
                fitness_goal TEXT DEFAULT 'hypertrophy',
                injuries TEXT DEFAULT '',
                equipment TEXT DEFAULT 'gym',
                onboarding_completed INTEGER DEFAULT 0,
                telegram_chat_id INTEGER DEFAULT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)

        # Migration from legacy user_profile to user_profiles
        try:
            cursor.execute("""
                INSERT OR IGNORE INTO user_profiles (user_id, name, gender, age, height, weight, experience_level, fitness_goal, injuries, equipment, onboarding_completed, telegram_chat_id)
                SELECT 'default', name, gender, age, height, weight, experience_level, fitness_goal, injuries, equipment, 0, telegram_chat_id
                FROM user_profile WHERE id = 1;
            """)
        except Exception:
            pass

        # Migrations tracking table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS _migrations (
                name TEXT PRIMARY KEY,
                applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)

        # Deleted workouts tracking table (prevents re-seeding permanently)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS deleted_workouts (
                user_id TEXT NOT NULL,
                start_time TEXT NOT NULL,
                deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, start_time)
            );
        """)

        # Also ensure legacy user_profile table exists for backward-compatibility
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS user_profile (
                id INTEGER PRIMARY KEY,
                name TEXT DEFAULT 'Атлет',
                gender TEXT DEFAULT 'male',
                age INTEGER DEFAULT 28,
                height REAL DEFAULT 180.0,
                weight REAL DEFAULT 80.0,
                experience_level TEXT DEFAULT 'intermediate',
                fitness_goal TEXT DEFAULT 'hypertrophy',
                injuries TEXT DEFAULT '',
                equipment TEXT DEFAULT 'gym',
                telegram_chat_id INTEGER DEFAULT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)

        # Gamification columns migration for user_profiles
        gamification_cols = [
            ("xp", "INTEGER", "0"),
            ("fitpoints", "INTEGER", "0"),
            ("tier", "TEXT", "'Bronze'"),
            ("level", "INTEGER", "1"),
            ("streak_days", "INTEGER", "0"),
            ("total_volume_kg", "REAL", "0.0"),
            ("total_workouts", "INTEGER", "0"),
            ("total_sets", "INTEGER", "0"),
            ("personal_records_count", "INTEGER", "0"),
        ]
        for col, col_type, default_val in gamification_cols:
            try:
                cursor.execute(f"ALTER TABLE user_profiles ADD COLUMN {col} {col_type} DEFAULT {default_val};")
            except Exception:
                pass

        # Nutrition logs table (Food & KBJU tracking)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS nutrition_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT DEFAULT 'default',
                date TEXT NOT NULL,
                meal_name TEXT NOT NULL,
                calories REAL NOT NULL DEFAULT 0,
                protein REAL NOT NULL DEFAULT 0,
                fat REAL NOT NULL DEFAULT 0,
                carbs REAL NOT NULL DEFAULT 0,
                portion_grams REAL DEFAULT 100,
                image_url TEXT DEFAULT '',
                ingredients TEXT DEFAULT '[]',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        try:
            cursor.execute("ALTER TABLE nutrition_logs ADD COLUMN ingredients TEXT DEFAULT '[]';")
        except Exception:
            pass
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_nutrition_user_date ON nutrition_logs(user_id, date);")

        # Retroactively calculate and sync gamification progress for all users
        try:
            sync_all_users_gamification_stats(conn)
        except Exception as e:
            print(f"Warning during gamification sync: {e}")


def calculate_user_gamification(conn, user_id: str) -> dict:
    """
    Accurately and retroactively computes gamification stats for a user:
    - Workouts count, total sets, total volume (tonnage)
    - Personal Records (PRs) over progressive training history
    - Consecutive streak (gap <= 8.5 days)
    - XP & FitPoints loyalty points
    - Athlete Level & Tier (Bronze, Silver, Gold, Platinum, Diamond)
    """
    from datetime import datetime

    cursor = conn.cursor()

    # Get all workouts for this user ordered chronologically
    cursor.execute("""
        SELECT id, start_time, end_time FROM workouts 
        WHERE user_id = ? 
        ORDER BY start_time ASC, id ASC;
    """, (user_id,))
    workout_rows = cursor.fetchall()
    total_workouts = len(workout_rows)

    if total_workouts == 0:
        base_res = {
            "user_id": user_id,
            "xp": 0,
            "fitpoints": 0,
            "tier": "Bronze",
            "level": 1,
            "streak_days": 0,
            "total_volume_kg": 0.0,
            "total_workouts": 0,
            "total_sets": 0,
            "personal_records_count": 0,
            "xp_current_level": 0,
            "xp_needed_for_level": 150,
            "xp_to_next_level": 150,
            "next_level_threshold": 150,
            "next_tier": "Silver",
            "xp_to_next_tier": 1000
        }
        cursor.execute("""
            UPDATE user_profiles 
            SET xp = 0, fitpoints = 0, tier = 'Bronze', level = 1, streak_days = 0,
                total_volume_kg = 0.0, total_workouts = 0, total_sets = 0, personal_records_count = 0
            WHERE user_id = ?;
        """, (user_id,))
        return base_res

    workout_ids = [w["id"] for w in workout_rows]
    placeholders = ",".join("?" * len(workout_ids))
    cursor.execute(f"""
        SELECT s.workout_id, s.exercise_id, s.weight, s.reps, s.created_at
        FROM workout_sets s
        WHERE s.workout_id IN ({placeholders})
        ORDER BY s.created_at ASC, s.id ASC;
    """, workout_ids)
    sets_rows = cursor.fetchall()

    total_sets = len(sets_rows)
    total_volume_kg = round(sum(float(s["weight"] or 0) * int(s["reps"] or 0) for s in sets_rows), 1)

    # Progressive Personal Records calculation
    max_weights = {}
    pr_count = 0
    for s in sets_rows:
        ex_id = s["exercise_id"]
        weight = float(s["weight"] or 0)
        if weight > 0:
            if ex_id not in max_weights:
                max_weights[ex_id] = weight
                pr_count += 1
            elif weight > max_weights[ex_id]:
                max_weights[ex_id] = weight
                pr_count += 1

    # Streak calculation (gap <= 8.5 days between workouts)
    dates = []
    for w in workout_rows:
        st = str(w["start_time"] or "").strip()
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
            try:
                dt = datetime.strptime(st, fmt)
                dates.append(dt)
                break
            except Exception:
                pass
    dates.sort(reverse=True)
    streak_days = 0
    if dates:
        streak_days = 1
        for i in range(1, len(dates)):
            gap = (dates[i - 1] - dates[i]).total_seconds() / 86400.0
            if 0 <= gap <= 8.5:
                streak_days += 1
            elif gap > 8.5:
                break

    # Gamification Formulas
    # XP: 100 per workout + 10 per set + 15 per 1,000 kg volume + 25 per PR
    xp = (total_workouts * 100) + (total_sets * 10) + int(total_volume_kg * 0.015) + (pr_count * 25)
    # FitPoints: 50 per workout + 5 per 1,000 kg volume + 10 per PR
    fitpoints = (total_workouts * 50) + int(total_volume_kg * 0.005) + (pr_count * 10)

    # Level calculation: threshold = int(150 * (lvl ** 1.6))
    level = 1
    xp_current_level = 0
    xp_needed_for_level = 150
    xp_to_next_level = 150
    next_level_threshold = 150

    while True:
        next_thresh = int(150 * (level ** 1.6))
        if xp < next_thresh:
            prev_thresh = int(150 * ((level - 1) ** 1.6)) if level > 1 else 0
            xp_current_level = xp - prev_thresh
            xp_needed_for_level = next_thresh - prev_thresh
            xp_to_next_level = next_thresh - xp
            next_level_threshold = next_thresh
            break
        level += 1
        if level >= 100:
            level = 100
            xp_current_level = xp
            xp_needed_for_level = 10000
            xp_to_next_level = 0
            next_level_threshold = xp
            break

    # Tier calculation
    if xp >= 20000:
        tier = "Diamond"
        next_tier = "Legend"
        xp_to_next_tier = max(0, 50000 - xp)
    elif xp >= 8000:
        tier = "Platinum"
        next_tier = "Diamond"
        xp_to_next_tier = max(0, 20000 - xp)
    elif xp >= 3500:
        tier = "Gold"
        next_tier = "Platinum"
        xp_to_next_tier = max(0, 8000 - xp)
    elif xp >= 1000:
        tier = "Silver"
        next_tier = "Gold"
        xp_to_next_tier = max(0, 3500 - xp)
    else:
        tier = "Bronze"
        next_tier = "Silver"
        xp_to_next_tier = max(0, 1000 - xp)

    # Persist calculated values to user_profiles
    cursor.execute("""
        UPDATE user_profiles 
        SET xp = ?, fitpoints = ?, tier = ?, level = ?, streak_days = ?,
            total_volume_kg = ?, total_workouts = ?, total_sets = ?,
            personal_records_count = ?
        WHERE user_id = ?;
    """, (xp, fitpoints, tier, level, streak_days, total_volume_kg, total_workouts, total_sets, pr_count, user_id))

    return {
        "user_id": user_id,
        "xp": xp,
        "fitpoints": fitpoints,
        "tier": tier,
        "level": level,
        "streak_days": streak_days,
        "total_volume_kg": total_volume_kg,
        "total_workouts": total_workouts,
        "total_sets": total_sets,
        "personal_records_count": pr_count,
        "xp_current_level": xp_current_level,
        "xp_needed_for_level": xp_needed_for_level,
        "xp_to_next_level": xp_to_next_level,
        "next_level_threshold": next_level_threshold,
        "next_tier": next_tier,
        "xp_to_next_tier": xp_to_next_tier
    }


def sync_all_users_gamification_stats(conn):
    """Retroactively calculates and updates gamification stats for all users in database."""
    cursor = conn.cursor()
    # Find all users in user_profiles
    cursor.execute("SELECT user_id FROM user_profiles;")
    profile_uids = [r["user_id"] for r in cursor.fetchall()]

    # Find all users in workouts
    cursor.execute("SELECT DISTINCT user_id FROM workouts WHERE user_id IS NOT NULL;")
    workout_uids = [r["user_id"] for r in cursor.fetchall()]

    all_uids = list(set(profile_uids + workout_uids))

    for uid in all_uids:
        # If user is in workouts but not user_profiles, create baseline profile
        if uid not in profile_uids:
            clean_uid = uid.replace("tg_", "") if isinstance(uid, str) else str(uid)
            cursor.execute("""
                INSERT OR IGNORE INTO user_profiles (
                    user_id, name, gender, age, height, weight, experience_level,
                    fitness_goal, injuries, equipment, onboarding_completed, telegram_chat_id
                ) VALUES (
                    ?, 'Атлет', 'male', 28, 180.0, 80.0, 'intermediate',
                    'hypertrophy', '', 'gym', 1, ?
                );
            """, (uid, int(clean_uid) if clean_uid.isdigit() else None))
        calculate_user_gamification(conn, uid)

