from typing import Optional, List
from pydantic import BaseModel, Field

class ExerciseBase(BaseModel):
    name: str
    category: Optional[str] = "Базовые"

class ExerciseCreate(ExerciseBase):
    pass

class ExerciseResponse(ExerciseBase):
    id: int
    created_at: Optional[str] = None

class WorkoutSetCreate(BaseModel):
    exercise_id: int
    weight: float = Field(ge=0, description="Вес в кг")
    reps: int = Field(ge=1, description="Количество повторений")
    set_number: Optional[int] = None
    set_type: Optional[str] = "normal"  # 'normal', 'warmup', 'drop', 'failure'

class WorkoutSetUpdate(BaseModel):
    weight: Optional[float] = Field(default=None, ge=0, description="Вес в кг")
    reps: Optional[int] = Field(default=None, ge=1, description="Количество повторений")
    set_type: Optional[str] = None  # 'normal', 'warmup', 'drop', 'failure'
    set_number: Optional[int] = None

class WorkoutSetResponse(BaseModel):
    id: int
    workout_id: int
    exercise_id: int
    exercise_name: str
    set_number: int
    set_type: Optional[str] = "normal"
    weight: float
    reps: int
    created_at: str

class WorkoutStart(BaseModel):
    title: Optional[str] = "Силовая тренировка"
    notes: Optional[str] = ""

class WorkoutFinish(BaseModel):
    notes: Optional[str] = None
    telegram_chat_id: Optional[int] = None

class WorkoutDetailResponse(BaseModel):
    id: int
    title: str
    start_time: str
    end_time: Optional[str] = None
    notes: Optional[str] = ""
    is_active: bool
    day_type: Optional[str] = None
    planned_exercises: Optional[List[dict]] = None
    sets: List[WorkoutSetResponse] = []

class WorkoutSummaryResponse(BaseModel):
    id: int
    title: str
    start_time: str
    end_time: Optional[str] = None
    notes: Optional[str] = ""
    is_active: bool
    total_sets: int
    total_volume: float

class AnalyticsDataPoint(BaseModel):
    date: str
    workout_id: int
    max_weight: float
    total_volume: float
    estimated_1rm: float
    sets_count: int

class AnalyticsResponse(BaseModel):
    exercise_id: int
    exercise_name: str
    history: List[AnalyticsDataPoint]
    personal_record_weight: float
    personal_record_volume: float

class UserProfileModel(BaseModel):
    user_id: str = "default"
    name: str = "Атлет"
    gender: str = "male"
    age: int = 28
    height: float = 180.0
    weight: float = 80.0
    experience_level: str = "intermediate"
    fitness_goal: str = "hypertrophy"
    injuries: Optional[str] = ""
    equipment: Optional[str] = "gym"
    onboarding_completed: Optional[int] = 0
    updated_at: Optional[str] = None

class UserProfileUpdate(BaseModel):
    name: Optional[str] = None
    gender: Optional[str] = None
    age: Optional[int] = None
    height: Optional[float] = None
    weight: Optional[float] = None
    experience_level: Optional[str] = None
    fitness_goal: Optional[str] = None
    injuries: Optional[str] = None
    equipment: Optional[str] = None
    onboarding_completed: Optional[int] = None

