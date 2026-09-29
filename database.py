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

