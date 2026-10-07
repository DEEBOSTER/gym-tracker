// --- TELEGRAM USER IDENTITY & API INTERCEPTOR ---
function getTelegramUser() {
  // 1. Telegram WebApp Mini App environment
  try {
    const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
    if (tgUser && tgUser.id) {
      const tgId = 'tg_' + String(tgUser.id);
      const fullName = tgUser.first_name 
        ? `${tgUser.first_name}${tgUser.last_name ? ' ' + tgUser.last_name : ''}`.trim() 
        : 'Атлет';
      try {
        localStorage.setItem('gym_tracker_tg_id', tgId);
        localStorage.setItem('gym_tracker_user_id', tgId);
        localStorage.setItem('gym_tracker_user_name', fullName);
      } catch (e) {}
      return { id: tgId, name: fullName };
    }
  } catch (e) {}

  // 2. Direct URL testing parameters: ?user_id=... or ?tg_id=...
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const paramId = urlParams.get('user_id') || urlParams.get('tg_id');
    if (paramId) {
      const cleanId = paramId.startsWith('tg_') || paramId.startsWith('u_') ? paramId : 'tg_' + paramId;
      localStorage.setItem('gym_tracker_user_id', cleanId);
      if (cleanId.startsWith('tg_')) {
        localStorage.setItem('gym_tracker_tg_id', cleanId);
      }
      const paramName = urlParams.get('user_name') || urlParams.get('tg_name');
      if (paramName) {
        localStorage.setItem('gym_tracker_user_name', paramName);
      }
      return {
        id: cleanId,
        name: localStorage.getItem('gym_tracker_user_name') || 'Атлет'
      };
    }
  } catch (e) {}

  // 3. Persistent browser / device ID (checks if user previously logged in via Telegram on this device)
  try {
    const savedTgId = localStorage.getItem('gym_tracker_tg_id');
    if (savedTgId) {
      return {
        id: savedTgId,
        name: localStorage.getItem('gym_tracker_user_name') || 'Атлет'
      };
    }

    let savedId = localStorage.getItem('gym_tracker_user_id');
    if (!savedId || savedId === 'default') {
      savedId = 'u_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36);
      localStorage.setItem('gym_tracker_user_id', savedId);
    }
    return {
      id: savedId,
      name: localStorage.getItem('gym_tracker_user_name') || 'Атлет'
    };
  } catch (e) {}

  return { id: 'u_guest', name: 'Атлет' };
}

const _origFetch = window.fetch;
window.fetch = function(input, init = {}) {
  init.headers = init.headers || {};
  const user = getTelegramUser();
  if (init.headers instanceof Headers) {
    if (!init.headers.has('ngrok-skip-browser-warning')) {
      init.headers.append('ngrok-skip-browser-warning', 'true');
    }
    if (!init.headers.has('X-Telegram-User-Id')) {
      init.headers.append('X-Telegram-User-Id', user.id);
    }
    if (!init.headers.has('X-Telegram-User-Name')) {
      init.headers.append('X-Telegram-User-Name', encodeURIComponent(user.name));
    }
  } else {
    init.headers['ngrok-skip-browser-warning'] = 'true';
    if (!init.headers['X-Telegram-User-Id']) {
      init.headers['X-Telegram-User-Id'] = user.id;
    }
    if (!init.headers['X-Telegram-User-Name']) {
      init.headers['X-Telegram-User-Name'] = encodeURIComponent(user.name);
    }
  }
  return _origFetch(input, init);
};

const { useState, useEffect, useRef, useMemo } = React;

// --- TELEGRAM WEBAPP & HAPTIC HELPERS ---
const tg = window.Telegram?.WebApp;
if (tg) {
  try {
    tg.ready();
    tg.expand();
    if (tg.enableClosingConfirmation) tg.enableClosingConfirmation();
  } catch (e) {
    console.warn('Telegram init:', e);
  }
}

// --- AUDIO SESSION CONFIGURATION (MIX WITH BACKGROUND MUSIC) ---
// Configures WebKit/Safari AudioSession to 'ambient' so opening the app
// NEVER pauses user's background music (Spotify, Apple Music, etc.)
try {
  if (typeof navigator !== 'undefined' && 'audioSession' in navigator) {
    navigator.audioSession.type = 'ambient';
  }
} catch (e) {}

const triggerHaptic = (type = 'light') => {
  try {
    if (window.Telegram?.WebApp?.HapticFeedback) {
      const h = window.Telegram.WebApp.HapticFeedback;
      if (type === 'success' || type === 'warning' || type === 'error') {
        h.notificationOccurred(type);
      } else {
        h.impactOccurred(type);
      }
    }
  } catch (e) {}
};

// --- PWA ENVIRONMENT & STANDALONE HELPERS ---
const isStandalonePWA = () => {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || 
           window.navigator.standalone === true || 
           document.referrer.includes('android-app://');
  } catch (e) {
    return false;
  }
};

const isInsideTelegram = () => {
  try {
    return Boolean(window.Telegram?.WebApp?.initDataUnsafe?.user?.id || window.TelegramWebviewProxy);
  } catch (e) {
    return false;
  }
};

let deferredPwaInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPwaInstallPrompt = e;
  window.dispatchEvent(new CustomEvent('gym-pwa-install-ready'));
});

// --- NUMERIC INPUT SANITIZATION HELPER ---
// Solves mobile keypad leading zero quirks (e.g. '060' -> '60', '06' -> '6') 
// and allows empty fields while typing without snapping back to 0.
const cleanNumericInput = (val, isFloat = false) => {
  if (val === null || val === undefined) return '';
  let str = String(val).trim().replace(',', '.');
  if (str === '') return '';

  if (isFloat) {
    str = str.replace(/[^0-9.]/g, '');
    const parts = str.split('.');
    if (parts.length > 2) {
      str = parts[0] + '.' + parts.slice(1).join('');
    }
  } else {
    str = str.replace(/[^0-9]/g, '');
  }

  if (str.length > 1 && str.startsWith('0') && str[1] !== '.') {
    str = str.replace(/^0+/, '');
    if (str === '' || str.startsWith('.')) {
      str = '0' + str;
    }
  }

  return str;
};

// --- ICONS (SVG) ---
const Icons = {
  Dumbbell: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10M8 5v14M16 5v14M20 7v10M8 12h8" />
    </svg>
  ),
  Chart: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" />
    </svg>
  ),
  History: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  List: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
    </svg>
  ),
  Plus: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
    </svg>
  ),
  Trash: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  ),
  Check: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
    </svg>
  ),
  Trophy: () => (
    <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2 0h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
    </svg>
  ),
  User: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  ),
  Clock: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  TrendingUp: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>
  ),
  Search: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  ),
  ChevronDown: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  ),
  Close: () => (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  Fire: () => (
    <svg className="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.316.492-.474.966-.474 1.442 0 .54.19 1.05.51 1.48.243.327.42.705.42 1.145 0 .61-.39 1.155-.95 1.34a2.983 2.983 0 01-1.02.18c-1.32 0-2.45-.88-2.82-2.12-.13-.44-.45-.79-.89-.92a1 1 0 00-1.16.51c-.63 1.31-.95 2.68-.95 4.09 0 4.41 3.59 8 8 8s8-3.59 8-8c0-3.15-1.57-5.96-4.04-7.662z" clipRule="evenodd" />
    </svg>
  ),
  Next: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  )
};

const categoryColors = {
  'Грудь': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  'Спина': 'bg-sky-500/10 text-sky-400 border-sky-500/20',
  'Плечи': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  'Руки': 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  'Трицепс': 'bg-violet-500/10 text-violet-400 border-violet-500/20',
  'Ноги': 'bg-rose-500/10 text-rose-400 border-rose-500/20',
  'Пресс': 'bg-teal-500/10 text-teal-400 border-teal-500/20',
  'Базовые': 'bg-slate-500/10 text-slate-300 border-slate-500/20'
};

const parseSafeDate = (val) => {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val === 'number') {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof val === 'string') {
    const clean = val.trim();
    const match = clean.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
    if (match) {
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10) - 1;
      const day = parseInt(match[3], 10);
      const hours = match[4] ? parseInt(match[4], 10) : 0;
      const minutes = match[5] ? parseInt(match[5], 10) : 0;
      const seconds = match[6] ? parseInt(match[6], 10) : 0;
      return new Date(year, month, day, hours, minutes, seconds);
    }
    const d = new Date(clean.replace(' ', 'T'));
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
};

const formatDate = (dateStr) => {
  const d = parseSafeDate(dateStr);
  if (!d) return '';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
};

const getPluralWorkouts = (n) => {
  const abs = Math.abs(n) % 100;
  const rem = abs % 10;
  if (abs > 10 && abs < 20) return 'тренировок';
  if (rem > 1 && rem < 5) return 'тренировки';
  if (rem === 1) return 'тренировка';
  return 'тренировок';
};

const getPluralWeeks = (n) => {
  const abs = Math.abs(n) % 100;
  const rem = abs % 10;
  if (abs > 10 && abs < 20) return 'недель';
  if (rem > 1 && rem < 5) return 'недели';
  if (rem === 1) return 'неделя';
  return 'недель';
};

const getISOWeekKey = (dateVal) => {
  const d = parseSafeDate(dateVal);
  if (!d) return null;
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayNr = (target.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const isoYear = target.getFullYear();
  const firstThursday = new Date(isoYear, 0, 4);
  const ftDayNr = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - ftDayNr + 3);
  const weekDiff = target.getTime() - firstThursday.getTime();
  const weekNr = 1 + Math.round(weekDiff / (7 * 24 * 60 * 60 * 1000));
  return `${isoYear}-W${String(weekNr).padStart(2, '0')}`;
};

const formatTime = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};


// ==========================================
// 🔔 WEB AUDIO API CHIME (OFFLINE SOUND)
// ==========================================
function playChimeSound() {
  try {
    if (typeof navigator !== 'undefined' && 'audioSession' in navigator) {
      try { navigator.audioSession.type = 'ambient'; } catch (e) {}
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const playTone = (freq, start, duration) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.35, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(start);
      osc.stop(start + duration);
    };

    const t = ctx.currentTime;
    playTone(659.25, t, 0.18);       // E5
    playTone(880.00, t + 0.18, 0.22); // A5
    playTone(1318.51, t + 0.40, 0.45); // E6

    setTimeout(() => {
      try { ctx.close(); } catch (e) {}
    }, 950);
  } catch (e) {
    console.warn('AudioContext sound note:', e);
  }
}

// ==========================================
// 🪜 WARMUP LADDER CALCULATOR LOGIC
// ==========================================
function calculateWarmupLadder(targetWeight, exerciseName = '') {
  const w = parseFloat(targetWeight) || 20;
  const isDumbbell = (exerciseName || '').toLowerCase().includes('гантел');
  const barWeight = isDumbbell ? 6 : 20;

  if (w <= barWeight + 5) {
    return [
      { step: 1, label: 'Легкая разминка суставов', weight: Math.max(4, Math.round(w * 0.6)), reps: 10, pct: '60%' },
      { step: 2, label: 'Целевой рабочий вес', weight: w, reps: 10, pct: '100%', isTarget: true }
    ];
  }

  const step1Weight = barWeight;
  const step2Weight = Math.max(barWeight, Math.round((w * 0.5) / 2.5) * 2.5);
  const step3Weight = Math.max(step2Weight + 2.5, Math.round((w * 0.72) / 2.5) * 2.5);
  
  const ladder = [
    { step: 1, label: isDumbbell ? 'Легкие гантели (разминка суставов)' : 'Пустой гриф (разминка суставов)', weight: step1Weight, reps: 12, pct: `${Math.round((step1Weight/w)*100)}%` },
    { step: 2, label: '50% активация волокон', weight: step2Weight, reps: 6, pct: '50%' },
    { step: 3, label: '70–75% нервная адаптация', weight: step3Weight, reps: 3, pct: '75%' }
  ];

  if (w >= 70) {
    const step4Weight = Math.round((w * 0.88) / 2.5) * 2.5;
    if (step4Weight > step3Weight && step4Weight < w) {
      ladder.push({
        step: 4,
        label: '88% подводящий сингл перед базой',
        weight: step4Weight,
        reps: 1,
        pct: '88%'
      });
    }
  }

  ladder.push({
    step: ladder.length + 1,
    label: 'Целевой рабочий подход',
    weight: w,
    reps: 10,
    pct: '100%',
    isTarget: true
  });

  return ladder;
}

// ==========================================
// ⏱️ ADAPTIVE REST TIME CALCULATOR
// ==========================================
function getAdaptiveRestInfo(exerciseName = '', setType = 'normal', reps = 10, userGoal = 'hypertrophy') {
  const name = (exerciseName || '').toLowerCase();
  
  if (setType === 'warmup') {
    return {
      duration: 45,
      reason: 'Разминка суставов (быстрый отдых перед базой)',
      badge: 'РАЗМИНКА 45с',
      type: 'warmup'
    };
  }

  if (setType === 'drop') {
    return {
      duration: 75,
      reason: 'Дропсет завершен (восстановление закисленных волокон)',
      badge: 'ДРОПСЕТ 75с',
      type: 'drop'
    };
  }

  // 1. Heavy Compound Barbell & Legs Movements
  const isHeavyCompound = [
    'приседан', 'станов', 'жим штанги', 'жим ногами', 
    'гакк', 'румынск', 'армейский', 'брусья с весом'
  ].some(k => name.includes(k));

  if (isHeavyCompound) {
    if (userGoal === 'strength' || reps <= 6 || setType === 'failure') {
      return {
        duration: 180,
        reason: 'Тяжелая база (3 мин для полного восстановления ЦНС и креатинфосфата)',
        badge: 'СИЛОВАЯ БАЗА 3 мин',
        type: 'heavy'
      };
    }
    return {
      duration: 150,
      reason: 'Базовое многосуставное (2.5 мин для восстановления пульса и дыхания)',
      badge: 'БАЗА 2.5 мин',
      type: 'heavy'
    };
  }

  // 2. Moderate Compound (Dumbbells, Pulls, Rows, Presses)
  const isModerateCompound = [
    'гантел', 'тяга', 'подтягиван', 'брусья', 'кроссовер', 'жим'
  ].some(k => name.includes(k));

  if (isModerateCompound) {
    if (userGoal === 'strength' || setType === 'failure') {
      return {
        duration: 120,
        reason: 'Умеренная база (2 мин для качественного следующего подхода)',
        badge: 'ТЯГА / ЖИМ 2 мин',
        type: 'moderate'
      };
    }
    return {
      duration: 90,
      reason: 'Рабочий сплит (1.5 мин: баланс гипертрофии и плотности)',
      badge: 'РАБОЧИЙ 90с',
      type: 'moderate'
    };
  }

  // 3. Isolation & Small Muscles (Arms, Shoulders, Calves, Abs)
  if (userGoal === 'fat_loss') {
    return {
      duration: 60,
      reason: 'Изоляция / сушка (высокая метаболическая плотность)',
      badge: 'СУШКА / ПАМП 60с',
      type: 'isolation'
    };
  }

  return {
    duration: 75,
    reason: 'Изоляция и суставы (1 мин 15 сек на восстановление памп-эффекта)',
    badge: 'ИЗОЛЯЦИЯ 75с',
    type: 'isolation'
  };
}

// ==========================================
// 💡 DYNAMIC NEXT SET WEIGHT ADVISOR
// ==========================================
function calculateNextSetAdvice(currentPlanEx, currentSets = [], userProfile = null) {
  if (!currentPlanEx) return null;

  const exName = currentPlanEx.name || '';
  const targetSets = currentPlanEx.target_sets || 3;
  const targetRepsStr = String(currentPlanEx.target_reps || '8–10');
  
  // Parse min and max target reps
  const cleanReps = targetRepsStr.replace(/\s+/g, '').replace('–', '-');
  const parts = cleanReps.split('-');
  const minReps = parseInt(parts[0], 10) || 8;
  const maxReps = parts.length > 1 ? (parseInt(parts[1], 10) || minReps) : minReps;

  const baseRecWeight = parseFloat(currentPlanEx.recommended_weight) || 20;

  // Filter working sets
  const workingSets = currentSets.filter(s => (s.set_type || 'normal') !== 'warmup');
  const completedCount = workingSets.length;
  const nextSetNum = completedCount + 1;
  const isFinalSet = nextSetNum === targetSets;

  // Step increment: smaller for dumbbells / small muscle isolation, standard for barbells
  const nameLow = exName.toLowerCase();
  const isDumbbellOrSmall = nameLow.includes('гантел') || 
                            nameLow.includes('махи') || 
                            nameLow.includes('бицепс') || 
                            nameLow.includes('трицепс') || 
                            nameLow.includes('пресс');
  const isBarbellOrLegs = nameLow.includes('присед') || 
                          nameLow.includes('ногами') || 
                          nameLow.includes('гакк') || 
                          nameLow.includes('станов') || 
                          nameLow.includes('румынск');

  const weightStep = isDumbbellOrSmall ? 1.0 : (isBarbellOrLegs ? 2.5 : 2.5);

  // If no working sets done yet (about to do Set 1)
  if (workingSets.length === 0) {
    return {
      status: 'START',
      badge: 'СТАРТОВЫЙ ВЕС 🎯',
      badgeColor: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      recWeight: baseRecWeight,
      recReps: maxReps,
      message: `Подход 1 из ${targetSets}: начните с расчетного веса ${baseRecWeight} кг на ${targetRepsStr} повторений. Оцените запас сил по RPE перед повышением.`,
      canApply: false
    };
  }

  // Get the last working set
  const lastSet = workingSets[workingSets.length - 1];
  const lastWeight = parseFloat(lastSet.weight) || baseRecWeight;
  const lastReps = parseInt(lastSet.reps, 10) || minReps;
  const lastType = lastSet.set_type || 'normal';

  let recWeight = lastWeight;
  let recReps = maxReps;
  let badge = 'ДЕРЖАТЬ ВЕС 💪';
  let badgeColor = 'bg-sky-500/20 text-sky-400 border-sky-500/30';
  let message = '';
  let status = 'MAINTAIN';

  // 1. OVERSHOT REPS (e.g. Target 8-10, did 11 or 12+)
  if (lastReps > maxReps) {
    const repsOver = lastReps - maxReps;
    const addStep = repsOver >= 3 ? weightStep * 2 : weightStep;
    recWeight = Math.round((lastWeight + addStep) * 10) / 10;
    recReps = maxReps;
    status = 'INCREASE';
    badge = `ПОВЫСИТЬ ВЕС (+${addStep} кг) 🚀`;
    badgeColor = 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 ring-1 ring-emerald-400';
    message = `Отличный запас сил! В прошлом подходе выжато ${lastReps} повт. (цель ${targetRepsStr}). На подход ${nextSetNum} поставьте ${recWeight} кг, чтобы оставаться в зоне мышечного роста.`;
  }
  // 2. SEVERE UNDERSHOT OR FAILURE (e.g. Target 8-10, failed at 5 or 6 reps)
  else if (lastReps < minReps || (lastType === 'failure' && lastReps <= minReps)) {
    const repsShort = minReps - lastReps;
    const dropStep = repsShort >= 3 ? weightStep * 2 : weightStep;
    recWeight = Math.max(isDumbbellOrSmall ? 2 : 10, Math.round((lastWeight - dropStep) * 10) / 10);
    recReps = minReps;
    status = 'DECREASE';
    badge = `СНИЗИТЬ ВЕС (-${dropStep} кг) ⚖️`;
    badgeColor = 'bg-amber-500/20 text-amber-400 border-amber-500/30 ring-1 ring-amber-400';
    message = `Раннее закисление: ${lastReps} повт. (ниже целевых ${targetRepsStr}). Сбросьте до ${recWeight} кг на подход ${nextSetNum}, чтобы сохранить чистую технику и набрать объем.`;
  }
  // 3. HIT TOP OF RANGE (e.g. Target 8-10, did 10 clean reps)
  else if (lastReps === maxReps) {
    status = 'TOP_HIT';
    badge = 'ТОЧНОЕ ПОПАДАНИЕ 🎯';
    badgeColor = 'bg-teal-500/20 text-teal-300 border-teal-500/30';
    if (isFinalSet) {
      recWeight = lastWeight;
      recReps = maxReps;
      message = `Идеальные ${lastReps} повт.! Заключительный ${nextSetNum}-й подход: выжмите максимум на ${recWeight} кг с фиксацией в пиковой точке.`;
    } else {
      recWeight = lastWeight;
      recReps = maxReps;
      message = `Точно в цель (${lastWeight} кг × ${lastReps})! Оставьте ${lastWeight} кг на подход ${nextSetNum}. Если чувствуете кураж — накиньте +${weightStep} кг на персональный рекорд.`;
    }
  }
  // 4. SOLID WORK ZONE (e.g. Target 8-10, did 8 or 9 reps)
  else {
    status = 'IN_ZONE';
    badge = 'РАБОЧИЙ ТЕМП 💪';
    badgeColor = 'bg-sky-500/20 text-sky-400 border-sky-500/30';
    recWeight = lastWeight;
    recReps = lastReps;
    message = `Хороший рабочий сет (${lastWeight} кг × ${lastReps} повт.). Оставляем ${recWeight} кг на подход ${nextSetNum}. Фокус на контроле негативной фазы (2–3 сек).`;
  }

  if (isFinalSet) {
    message += ' 🔥 Заключительный подход упражнения!';
  }

  return {
    status,
    badge,
    badgeColor,
    recWeight,
    recReps,
    message,
    canApply: recWeight !== lastWeight
  };
}


// ==========================================
// 🎨 STYLISH EXERCISE PICKER MODAL (FOR ANALYTICS & EXTRA)
// ==========================================
function ExercisePickerModal({ isOpen, onClose, exercises, selectedId, onSelect }) {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('Все');

  if (!isOpen) return null;

  const categories = ['Все', 'Грудь', 'Спина', 'Плечи', 'Руки', 'Ноги', 'Пресс'];

  const filtered = exercises.filter(ex => {
    const matchesSearch = ex.name.toLowerCase().includes(search.toLowerCase());
    const matchesCat = activeCategory === 'Все' || ex.category === activeCategory;
    return matchesSearch && matchesCat;
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex flex-col justify-end sm:justify-center items-center p-0 sm:p-4 animate-in fade-in duration-150">
      <div 
        className="w-full max-w-lg bg-gym-900 border border-gym-700/80 rounded-t-3xl sm:rounded-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-gym-800 flex items-center justify-between">
          <div>
            <h3 className="text-base font-extrabold text-white">Выберите упражнение</h3>
            <p className="text-[11px] text-slate-400">Нажмите на карточку для выбора</p>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gym-800 flex items-center justify-center text-slate-400 hover:text-white"
          >
            <Icons.Close />
          </button>
        </div>

        <div className="p-3 border-b border-gym-800/80 bg-gym-950/50">
          <div className="relative">
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
              <Icons.Search />
            </div>
            <input 
              type="text"
              placeholder="Поиск упражнения..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-gym-950 border border-gym-700 rounded-2xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              autoFocus
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">✕</button>
            )}
          </div>

          <div className="flex space-x-1.5 overflow-x-auto no-scrollbar pt-2.5 pb-1">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`text-xs px-3 py-1 rounded-xl whitespace-nowrap font-bold transition ${
                  activeCategory === cat ? 'bg-emerald-500 text-gym-950 shadow-sm' : 'bg-gym-800 text-slate-400 hover:text-white'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-y-auto p-3 space-y-2 flex-1">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">Ничего не найдено</div>
          ) : (
            filtered.map((ex) => {
              const isSelected = ex.id == selectedId;
              const catClass = categoryColors[ex.category] || categoryColors['Базовые'];
              return (
                <div
                  key={ex.id}
                  onClick={() => {
                    onSelect(ex.id);
                    onClose();
                  }}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between active:scale-98 ${
                    isSelected 
                      ? 'bg-emerald-500/15 border-emerald-500/60 shadow-md' 
                      : 'bg-gym-950/70 border-gym-800 hover:border-gym-700'
                  }`}
                >
                  <div className="space-y-1 pr-2">
                    <p className={`font-bold text-sm ${isSelected ? 'text-emerald-400' : 'text-slate-100'}`}>
                      {ex.name}
                    </p>
                    <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-md border ${catClass}`}>
                      {ex.category || 'Базовые'}
                    </span>
                  </div>
                  {isSelected && (
                    <span className="w-6 h-6 rounded-full bg-emerald-500 text-gym-950 flex items-center justify-center text-xs font-black">
                      ✓
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 🔄 SMART EXERCISE SWAP MODAL
// ==========================================
function SwapExerciseModal({ isOpen, onClose, currentEx, exercises, onSwap }) {
  const [search, setSearch] = useState('');
  if (!isOpen || !currentEx) return null;

  const alternatives = currentEx.alternatives || [];

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex flex-col justify-end sm:justify-center items-center p-0 sm:p-4 animate-in fade-in duration-150">
      <div 
        className="w-full max-w-lg bg-gym-900 border border-gym-700/80 rounded-t-3xl sm:rounded-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-gym-800 flex items-center justify-between">
          <div>
            <h3 className="text-base font-extrabold text-white">Замена упражнения</h3>
            <p className="text-[11px] text-slate-400">
              Заменяем: <span className="text-emerald-400 font-bold">{currentEx.name}</span>
            </p>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gym-800 flex items-center justify-center text-slate-400 hover:text-white"
          >
            <Icons.Close />
          </button>
        </div>

        <div className="overflow-y-auto p-4 space-y-4 flex-1">
          {/* Direct Recommended Alternatives */}
          {alternatives.length > 0 && (
            <div className="space-y-2">
              <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">
                ⭐ Рекомендуемые аналоги (та же мышечная группа)
              </span>
              <div className="space-y-2">
                {alternatives.map((altName) => (
                  <div
                    key={altName}
                    onClick={() => {
                      onSwap(currentEx.name, altName);
                      onClose();
                    }}
                    className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 hover:border-emerald-400 cursor-pointer transition active:scale-98 flex items-center justify-between"
                  >
                    <div className="pr-2">
                      <p className="font-bold text-sm text-white">{altName}</p>
                      <p className="text-[10px] text-emerald-400 mt-0.5">Аналогичный вектор и биомеханика</p>
                    </div>
                    <span className="text-xs bg-emerald-500 text-gym-950 font-black px-3 py-1.5 rounded-xl whitespace-nowrap">
                      Выбрать
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Search any other exercise from gym list */}
          <div className="space-y-2 pt-2 border-t border-gym-800">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Все упражнения базы
            </span>
            <div className="relative">
              <input
                type="text"
                placeholder="Поиск по названию..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-gym-950 border border-gym-700 rounded-2xl pl-4 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {exercises
                .filter(e => e.name !== currentEx.name && e.name.toLowerCase().includes(search.toLowerCase()))
                .slice(0, 20)
                .map(e => (
                  <div
                    key={e.id}
                    onClick={() => {
                      onSwap(currentEx.name, e.name);
                      onClose();
                    }}
                    className="p-2.5 rounded-xl bg-gym-950/60 border border-gym-800 hover:border-gym-700 cursor-pointer flex items-center justify-between text-xs transition active:scale-98"
                  >
                    <span className="text-slate-200 font-medium">{e.name}</span>
                    <span className="text-[10px] text-slate-400">{e.category}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 🪜 WARMUP LADDER MODAL (SMART PYRAMID)
// ==========================================
function WarmupLadderModal({ isOpen, onClose, exerciseName, targetWeight, onSelectStep }) {
  if (!isOpen) return null;
  const ladder = calculateWarmupLadder(targetWeight, exerciseName);

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex flex-col justify-end sm:justify-center items-center p-0 sm:p-4 animate-in fade-in duration-150">
      <div 
        className="w-full max-w-lg bg-gym-900 border border-gym-700/80 rounded-t-3xl sm:rounded-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-gym-800 flex items-center justify-between">
          <div>
            <h3 className="text-base font-extrabold text-white flex items-center space-x-1.5">
              <span>🪜 Разминочная лестница</span>
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Для: <span className="text-emerald-400 font-bold">{exerciseName}</span> (цель {targetWeight} кг)
            </p>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gym-800 flex items-center justify-center text-slate-400 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="p-4 space-y-2.5 overflow-y-auto flex-1">
          <p className="text-xs text-slate-300 leading-relaxed bg-gym-950 p-3 rounded-2xl border border-gym-800">
            💡 Разминочные сеты подготавливают суставы и ЦНС, не утомляя мышцы перед рабочим весом. Нажмите на нужный шаг, чтобы применить его:
          </p>

          <div className="space-y-2">
            {ladder.map((step) => (
              <div
                key={step.step}
                onClick={() => {
                  onSelectStep(step.weight, step.reps, step.isTarget ? 'normal' : 'warmup');
                  onClose();
                }}
                className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between active:scale-98 ${
                  step.isTarget
                    ? 'bg-emerald-500/10 border-emerald-500/40 hover:border-emerald-400'
                    : 'bg-gym-950/80 border-gym-800 hover:border-gym-700'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${
                      step.isTarget ? 'bg-emerald-500 text-gym-950' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    }`}>
                      {step.isTarget ? 'РАБОЧИЙ' : `ШАГ ${step.step} (${step.pct})`}
                    </span>
                    <span className="text-sm font-black text-white">{step.weight} кг × {step.reps} повт.</span>
                  </div>
                  <p className="text-[11px] text-slate-400">{step.label}</p>
                </div>

                <button className={`text-xs font-black px-3 py-1.5 rounded-xl transition ${
                  step.isTarget ? 'bg-emerald-500 text-gym-950 shadow-sm' : 'bg-gym-800 text-slate-200 hover:bg-gym-700'
                }`}>
                  Выбрать
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="p-3 border-t border-gym-800 bg-gym-950">
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-gym-800 hover:bg-gym-700 text-slate-300 font-bold text-xs rounded-xl"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 🎬 EXERCISE VIDEO & TECHNIQUE MODAL
// ==========================================
function ExerciseVideoModal({ isOpen, onClose, exerciseName, guide }) {
  const [videoTab, setVideoTab] = useState('animation'); // 'animation' | 'youtube'

  if (!isOpen) return null;

  const currentGuide = guide || {
    name: exerciseName,
    primary_muscle: "Основная группа мышц",
    setup: "Примите устойчивое исходное положение, напрягите мышцы кора и сведите лопатки.",
    technique: "Выполняйте движение подконтрольно: 2 секунды на негативную фазу, мощный концентрический подъем, пауза в точке сокращения.",
    mistakes: "Избегайте читинга, раскачки корпусом и излишнего веса, ломающего траекторию.",
    breathing: "Вдох на опускании/растяжении, выдох на преодолении нагрузки.",
    joint_safety: "Контролируйте углы в суставах, не блокируйте локти и колени до щелчка."
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex flex-col justify-end sm:justify-center items-center p-0 sm:p-4 animate-in fade-in duration-150">
      <div 
        className="w-full max-w-lg bg-gym-900 border border-gym-700/80 rounded-t-3xl sm:rounded-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-gym-800 flex items-center justify-between bg-gym-950/60">
          <div>
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-sky-400"></span>
              <h3 className="text-base font-extrabold text-white leading-tight">
                Техника упражнения
              </h3>
            </div>
            <p className="text-[11px] text-sky-400 font-bold mt-0.5">
              {currentGuide.primary_muscle || "Силовое упражнение"}
            </p>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gym-800 flex items-center justify-center text-slate-400 hover:text-white"
          >
            <Icons.Close />
          </button>
        </div>

        {/* Modal Scrollable Content */}
        <div className="overflow-y-auto p-4 space-y-4 flex-1">
          {/* Exercise Title */}
          <div>
            <h2 className="text-xl font-black text-white tracking-tight">
              {exerciseName}
            </h2>
            {currentGuide.secondary_muscles && (
              <p className="text-xs text-slate-400 mt-0.5">
                Синергисты: <span className="text-slate-300">{currentGuide.secondary_muscles}</span>
              </p>
            )}
          </div>

          {/* Media Player Tabs */}
          <div className="space-y-2">
            <div className="flex bg-gym-950 border border-gym-800 rounded-xl p-1 text-xs">
              <button
                onClick={() => setVideoTab('animation')}
                className={`flex-1 py-1.5 rounded-lg font-bold transition flex items-center justify-center space-x-1 ${
                  videoTab === 'animation'
                    ? 'bg-sky-500 text-gym-950 shadow font-black'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <span>🔄 3D Анимация (Офлайн)</span>
              </button>
              {currentGuide.youtube_id && (
                <button
                  onClick={() => setVideoTab('youtube')}
                  className={`flex-1 py-1.5 rounded-lg font-bold transition flex items-center justify-center space-x-1 ${
                    videoTab === 'youtube'
                      ? 'bg-sky-500 text-gym-950 shadow font-black'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <span>📺 Видео YouTube</span>
                </button>
              )}
            </div>

            {/* Video Viewport */}
            <div className="w-full bg-gym-950 border border-gym-800 rounded-2xl overflow-hidden shadow-inner flex flex-col items-center justify-center min-h-[220px]">
              {videoTab === 'animation' ? (
                <div className="relative w-full flex flex-col items-center justify-center py-2 bg-gradient-to-b from-gym-950 via-gym-900/50 to-gym-950">
                  {currentGuide.local_video || currentGuide.remote_video ? (
                    <img 
                      src={currentGuide.local_video || currentGuide.remote_video} 
                      alt={exerciseName}
                      className="max-h-64 object-contain rounded-xl"
                    />
                  ) : (
                    <div className="py-12 text-slate-400 text-xs">Анимация загружается...</div>
                  )}
                  <span className="text-[10px] text-slate-400 mt-1 uppercase font-mono tracking-wider">
                    ⚡ Зацикленная биомеханика движения
                  </span>
                </div>
              ) : (
                <div className="w-full aspect-video bg-black">
                  {currentGuide.youtube_id && (
                    <iframe
                      className="w-full h-full"
                      src={`https://www.youtube-nocookie.com/embed/${currentGuide.youtube_id}?autoplay=1&mute=1&playsinline=1`}
                      title={exerciseName}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    ></iframe>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Structured Step-by-Step Technique Instructions */}
          <div className="space-y-2.5 pt-1">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-400">
              Пошаговая инструкция тренера
            </h4>

            {currentGuide.setup && (
              <div className="bg-gym-950 border border-gym-800/80 rounded-2xl p-3.5 space-y-1">
                <span className="text-[11px] font-extrabold text-sky-400 uppercase tracking-wider flex items-center space-x-1">
                  <span>🎯 1. Исходное положение</span>
                </span>
                <p className="text-xs text-slate-200 leading-relaxed">
                  {currentGuide.setup}
                </p>
              </div>
            )}

            {currentGuide.technique && (
              <div className="bg-gym-950 border border-gym-800/80 rounded-2xl p-3.5 space-y-1">
                <span className="text-[11px] font-extrabold text-emerald-400 uppercase tracking-wider flex items-center space-x-1">
                  <span>⚙️ 2. Механика и траектория движения</span>
                </span>
                <p className="text-xs text-slate-200 leading-relaxed">
                  {currentGuide.technique}
                </p>
              </div>
            )}

            {currentGuide.joint_safety && (
              <div className="bg-gym-950 border border-emerald-500/30 rounded-2xl p-3.5 space-y-1">
                <span className="text-[11px] font-extrabold text-emerald-400 uppercase tracking-wider flex items-center space-x-1">
                  <span>🛡️ 3. Защита суставов (Gemini Coach)</span>
                </span>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {currentGuide.joint_safety}
                </p>
              </div>
            )}

            {currentGuide.mistakes && (
              <div className="bg-gym-950 border border-rose-500/20 rounded-2xl p-3.5 space-y-1">
                <span className="text-[11px] font-extrabold text-rose-400 uppercase tracking-wider flex items-center space-x-1">
                  <span>⚠️ 4. Чего категорически избегать</span>
                </span>
                <p className="text-xs text-rose-200/90 leading-relaxed">
                  {currentGuide.mistakes}
                </p>
              </div>
            )}

            {currentGuide.breathing && (
              <div className="bg-gym-950 border border-gym-800/80 rounded-2xl p-3.5 space-y-1">
                <span className="text-[11px] font-extrabold text-amber-400 uppercase tracking-wider flex items-center space-x-1">
                  <span>🫁 5. Дыхание</span>
                </span>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {currentGuide.breathing}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer Button */}
        <div className="p-3.5 border-t border-gym-800 bg-gym-950/80">
          <button
            onClick={onClose}
            className="w-full py-3.5 bg-sky-500 hover:bg-sky-400 text-gym-950 font-black text-sm uppercase tracking-wider rounded-2xl shadow-lg shadow-sky-500/20 active:scale-98 transition flex items-center justify-center space-x-2"
          >
            <span>✓ ВСЕ ПОНЯТНО, К ПОДХОДУ</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 🚀 PERSONALIZED ONBOARDING SCREEN
// ==========================================
function OnboardingScreen({ initialProfile, onComplete, onCancel }) {
  const tgUser = getTelegramUser();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    name: initialProfile?.name && initialProfile.name !== 'Атлет' ? initialProfile.name : (tgUser.name !== 'Атлет' ? tgUser.name : ''),
    gender: initialProfile?.gender || 'male',
    age: initialProfile?.age ? String(initialProfile.age) : '26',
    height: initialProfile?.height ? String(initialProfile.height) : '178',
    weight: initialProfile?.weight ? String(initialProfile.weight) : '75',
    experience_level: initialProfile?.experience_level || 'beginner',
    fitness_goal: initialProfile?.fitness_goal || 'hypertrophy',
    injuries: initialProfile?.injuries || '',
    equipment: 'gym',
    onboarding_completed: 1
  });

  const heightM = (parseFloat(formData.height) || 178) / 100;
  const weightKg = parseFloat(formData.weight) || 75;
  const bmi = heightM > 0 ? (weightKg / (heightM * heightM)).toFixed(1) : 23.5;

  const commonInjuries = [
    { id: 'none', label: '🛡️ Нет, всё в порядке' },
    { id: 'плеч', label: '⚠️ Беречь плечи', tip: 'нейтральный хват, угол локтей 45°' },
    { id: 'поясниц', label: '⚠️ Беречь поясницу', tip: 'стабилизация кора, без осевого перегруза' },
    { id: 'колен', label: '⚠️ Беречь колени', tip: 'контроль траектории, без замка суставов' },
    { id: 'кист', label: '⚠️ Беречь кисти/локти', tip: 'мягкий хват, фиксация запястий' }
  ];

  const toggleInjury = (id) => {
    triggerHaptic('light');
    if (id === 'none') {
      setFormData(prev => ({ ...prev, injuries: '' }));
      return;
    }
    const currentList = (formData.injuries || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    let updated;
    if (currentList.some(item => item.includes(id))) {
      updated = currentList.filter(item => !item.includes(id));
    } else {
      updated = [...currentList, id];
    }
    setFormData(prev => ({ ...prev, injuries: updated.join(', ') }));
  };

  const handleFinish = async () => {
    setSubmitting(true);
    triggerHaptic('medium');
    const payload = {
      name: formData.name.trim() || tgUser.name || 'Атлет',
      gender: formData.gender,
      age: parseInt(formData.age) || 26,
      height: parseFloat(formData.height) || 178,
      weight: parseFloat(formData.weight) || 75,
      experience_level: formData.experience_level,
      fitness_goal: formData.fitness_goal,
      injuries: formData.injuries,
      equipment: 'gym',
      onboarding_completed: 1
    };

    // Save to localStorage immediately so user NEVER has to repeat onboarding even if offline / sleeping
    try {
      localStorage.setItem('gym_tracker_user_profile_' + tgUser.id, JSON.stringify(payload));
      localStorage.setItem('gym_tracker_onboarded_' + tgUser.id, '1');
    } catch (e) {}

    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const updated = await res.json();
        triggerHaptic('success');
        try {
          localStorage.setItem('gym_tracker_user_profile_' + tgUser.id, JSON.stringify(updated));
          localStorage.setItem('gym_tracker_onboarded_' + tgUser.id, '1');
        } catch (e) {}
        if (onComplete) onComplete(updated);
      } else {
        // Even if server returned error or cold start delay, local profile is saved
        if (onComplete) onComplete(payload);
      }
    } catch (e) {
      console.warn("Server profile save error, proceeding with local profile:", e);
      if (onComplete) onComplete(payload);
    } finally {
      setSubmitting(false);
    }
  };

  const estBench = Math.round(weightKg * 0.5 * (formData.gender === 'female' ? 0.6 : 1.0));
  const estSquat = Math.round(weightKg * 0.6 * (formData.gender === 'female' ? 0.6 : 1.0));
  const estPull = Math.round(weightKg * 0.45 * (formData.gender === 'female' ? 0.6 : 1.0));
  const recReps = formData.fitness_goal === 'strength' ? '5–7 повт.' : formData.fitness_goal === 'fat_loss' ? '10–15 повт.' : '8–12 повт.';

  return (
    <div className="min-h-screen bg-gym-950 text-slate-100 flex flex-col justify-between max-w-lg mx-auto p-4 sm:p-6 font-sans safe-top safe-bottom">
      {/* Top Header & Step Indicator */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <img 
              src="/static/app-icon.png" 
              alt="GymTracker" 
              className="w-9 h-9 rounded-xl shadow-lg border border-gym-700/80 object-cover shrink-0" 
            />
            <div>
              <span className="text-xs font-black text-white uppercase tracking-wider block">GymTracker</span>
              <span className="text-[10px] text-emerald-400 font-bold">Персональная настройка</span>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-xs font-mono font-bold text-slate-400 bg-gym-900 border border-gym-800 px-2.5 py-1 rounded-full">
              Шаг {step} из 4
            </span>
            {initialProfile && initialProfile.onboarding_completed === 1 && onCancel && (
              <button 
                type="button" 
                onClick={onCancel} 
                className="w-7 h-7 rounded-full bg-gym-900 border border-gym-800 text-slate-400 hover:text-white flex items-center justify-center text-xs transition active:scale-95"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-gym-900 h-1.5 rounded-full overflow-hidden border border-gym-800">
          <div 
            className="bg-gradient-to-r from-emerald-500 via-sky-500 to-emerald-400 h-full transition-all duration-300 rounded-full"
            style={{ width: `${(step / 4) * 100}%` }}
          />
        </div>
      </div>

      {/* STEP 1: Body Parameters */}
      {step === 1 && (
        <div className="py-4 space-y-4 animate-in fade-in slide-in-from-right-4 duration-200">
          <div className="space-y-1">
            <h2 className="text-xl font-black text-white tracking-tight">
              Привет! 👋 Давай познакомимся
            </h2>
            <p className="text-xs text-slate-400">
              Укажи свои параметры, чтобы алгоритм точно подобрал стартовые веса и темп прогрессии.
            </p>
          </div>

          <div className="space-y-3">
            {/* Name Input */}
            <div className="bg-gym-900 border border-gym-800 rounded-2xl p-3.5 space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">Твое имя / позывной</label>
              <input
                type="text"
                placeholder="Например: Дмитрий"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full bg-transparent text-base font-bold text-white focus:outline-none placeholder-slate-600"
              />
            </div>

            {/* Gender Selection */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">Пол</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'male', label: '👨 Мужской', sub: 'Базовый силовой расчет' },
                  { id: 'female', label: '👩 Женский', sub: 'Адаптивный женский расчет' }
                ].map(g => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => { triggerHaptic('light'); setFormData({ ...formData, gender: g.id }); }}
                    className={`p-3 rounded-2xl border flex flex-col items-center justify-center text-center transition active:scale-95 ${
                      formData.gender === g.id
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400 shadow-md ring-1 ring-emerald-400'
                        : 'bg-gym-900 text-slate-400 border-gym-800 hover:text-white'
                    }`}
                  >
                    <span className="text-sm font-black">{g.label}</span>
                    <span className="text-[9px] text-slate-400 mt-0.5">{g.sub}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Height, Weight, Age Grid */}
            <div className="grid grid-cols-3 gap-2">
              {/* Weight */}
              <div className="bg-gym-900 border border-gym-800 rounded-2xl p-3 flex flex-col justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Вес</span>
                <div className="flex items-baseline space-x-1 my-1">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={formData.weight}
                    onFocus={(e) => e.target.select()}
                    onClick={(e) => e.target.select()}
                    onChange={(e) => setFormData({ ...formData, weight: cleanNumericInput(e.target.value, true) })}
                    className="w-20 bg-transparent text-2xl font-black text-white focus:outline-none font-mono"
                  />
                  <span className="text-xs text-slate-400 font-bold">кг</span>
                </div>
                <span className="text-[9px] text-emerald-400 font-mono">База для %</span>
              </div>

              {/* Height */}
              <div className="bg-gym-900 border border-gym-800 rounded-2xl p-3 flex flex-col justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Рост</span>
                <div className="flex items-baseline space-x-1 my-1">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={formData.height}
                    onFocus={(e) => e.target.select()}
                    onClick={(e) => e.target.select()}
                    onChange={(e) => setFormData({ ...formData, height: cleanNumericInput(e.target.value, false) })}
                    className="w-20 bg-transparent text-2xl font-black text-white focus:outline-none font-mono"
                  />
                  <span className="text-xs text-slate-400 font-bold">см</span>
                </div>
                <span className="text-[9px] text-slate-400 font-mono">ИМТ: {bmi}</span>
              </div>

              {/* Age */}
              <div className="bg-gym-900 border border-gym-800 rounded-2xl p-3 flex flex-col justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Возраст</span>
                <div className="flex items-baseline space-x-1 my-1">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={formData.age}
                    onFocus={(e) => e.target.select()}
                    onClick={(e) => e.target.select()}
                    onChange={(e) => setFormData({ ...formData, age: cleanNumericInput(e.target.value, false) })}
                    className="w-16 bg-transparent text-2xl font-black text-white focus:outline-none font-mono"
                  />
                  <span className="text-xs text-slate-400 font-bold">лет</span>
                </div>
                <span className="text-[9px] text-slate-500 font-mono">ЦНС</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STEP 2: Goal and Experience Level */}
      {step === 2 && (
        <div className="py-4 space-y-4 animate-in fade-in slide-in-from-right-4 duration-200">
          <div className="space-y-1">
            <h2 className="text-xl font-black text-white tracking-tight">
              Твоя главная цель 🎯
            </h2>
            <p className="text-xs text-slate-400">
              Это определит структуру рабочих подходов и диапазон целевых повторений.
            </p>
          </div>

          <div className="space-y-3">
            {/* Goal Cards */}
            <div className="space-y-2">
              {[
                { id: 'hypertrophy', icon: '🥩', title: 'Набор мышечной массы (Гипертрофия)', desc: 'Классический бодибилдинг с акцентом на объемы мышц', reps: '8–12 повторений в подходе' },
                { id: 'strength', icon: '⚡', title: 'Развитие силы и мощности', desc: 'Увеличение рабочих весов в базовых движениях', reps: '5–7 тяжелых повторений' },
                { id: 'fat_loss', icon: '🔥', title: 'Сушка, тонус и рельеф', desc: 'Высокая плотность сессии и поддержка дефицита калорий', reps: '10–15 плотных повторений' }
              ].map(g => (
                <div
                  key={g.id}
                  onClick={() => { triggerHaptic('light'); setFormData({ ...formData, fitness_goal: g.id }); }}
                  className={`p-3.5 rounded-2xl border cursor-pointer transition active:scale-[0.99] flex items-start space-x-3 ${
                    formData.fitness_goal === g.id
                      ? 'bg-emerald-500/15 border-emerald-400 text-white shadow-lg ring-1 ring-emerald-400'
                      : 'bg-gym-900 border-gym-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span className="text-2xl mt-0.5">{g.icon}</span>
                  <div className="flex-1 space-y-0.5">
                    <h4 className="text-sm font-black text-white">{g.title}</h4>
                    <p className="text-[11px] text-slate-400 leading-snug">{g.desc}</p>
                    <span className="inline-block text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md mt-1 font-bold">
                      Целевые: {g.reps}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Experience Level */}
            <div className="space-y-1.5 pt-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">Опыт тренировок в зале</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'beginner', title: 'Новичок', sub: 'До 1 года', step: 'Плавный старт' },
                  { id: 'intermediate', title: 'Средний', sub: '1–3 года', step: 'Базовый PPL' },
                  { id: 'advanced', title: 'Опытный', sub: '3+ года', step: 'Высокий темп' }
                ].map(l => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => { triggerHaptic('light'); setFormData({ ...formData, experience_level: l.id }); }}
                    className={`p-2.5 rounded-2xl border text-center transition active:scale-95 flex flex-col justify-between ${
                      formData.experience_level === l.id
                        ? 'bg-sky-500/20 text-sky-300 border-sky-400 font-black shadow-md ring-1 ring-sky-400'
                        : 'bg-gym-900 text-slate-400 border-gym-800 hover:text-white'
                    }`}
                  >
                    <span className="text-xs font-black">{l.title}</span>
                    <span className="text-[9px] text-slate-400 mt-0.5">{l.sub}</span>
                    <span className="text-[8px] text-sky-400 font-mono mt-1 font-bold">{l.step}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STEP 3: Joint Safety & Injuries */}
      {step === 3 && (
        <div className="py-4 space-y-4 animate-in fade-in slide-in-from-right-4 duration-200">
          <div className="space-y-1">
            <h2 className="text-xl font-black text-white tracking-tight">
              Защита суставов 🛡️
            </h2>
            <p className="text-xs text-slate-400">
              Отметь суставы, требующие внимания. Gemini Coach автоматически настроит подсказки безопасной техники и исключит опасные углы.
            </p>
          </div>

          <div className="space-y-2.5">
            {commonInjuries.map(inj => {
              const isNone = inj.id === 'none';
              const active = isNone 
                ? !formData.injuries 
                : (formData.injuries || '').toLowerCase().includes(inj.id);

              return (
                <div
                  key={inj.id}
                  onClick={() => toggleInjury(inj.id)}
                  className={`p-3.5 rounded-2xl border cursor-pointer transition active:scale-[0.99] flex items-center justify-between ${
                    active
                      ? isNone 
                        ? 'bg-emerald-500/15 border-emerald-400 text-emerald-300 font-bold'
                        : 'bg-rose-500/15 border-rose-400 text-rose-200 font-bold shadow-sm'
                      : 'bg-gym-900 border-gym-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <div className="space-y-0.5 pr-2">
                    <span className="text-sm font-black text-white block">{inj.label}</span>
                    {inj.tip && <span className="text-[10px] text-slate-400 block">{inj.tip}</span>}
                  </div>
                  <div className={`w-6 h-6 rounded-full border flex items-center justify-center text-xs font-black ${
                    active
                      ? isNone ? 'bg-emerald-500 text-gym-950 border-emerald-400' : 'bg-rose-500 text-white border-rose-400'
                      : 'border-gym-700 bg-gym-950 text-transparent'
                  }`}>
                    ✓
                  </div>
                </div>
              );
            })}

            <div className="pt-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">
                Другие индивидуальные пожелания / травмы:
              </label>
              <input
                type="text"
                placeholder="Например: болит шея при подтягиваниях, грыжа поясницы"
                value={formData.injuries}
                onChange={(e) => setFormData({ ...formData, injuries: e.target.value })}
                className="w-full bg-gym-900 border border-gym-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-rose-500 transition"
              />
            </div>
          </div>
        </div>
      )}

      {/* STEP 4: Calibration Summary & Launch */}
      {step === 4 && (
        <div className="py-4 space-y-4 animate-in fade-in slide-in-from-right-4 duration-200">
          <div className="space-y-1">
            <div className="flex items-center space-x-2 text-emerald-400 font-bold text-xs uppercase tracking-wider">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
              <span>ИИ-калибровка завершена</span>
            </div>
            <h2 className="text-xl font-black text-white tracking-tight">
              Твоя программа готова, {formData.name || 'Атлет'}! 🚀
            </h2>
            <p className="text-xs text-slate-400">
              Алгоритм адаптировал 3-дневный сплит Push / Pull / Legs под твой вес тела ({weightKg} кг) и цель.
            </p>
          </div>

          {/* Calibrated Program Card */}
          <div className="bg-gradient-to-br from-gym-900 to-gym-950 border border-gym-700/80 rounded-3xl p-4 space-y-3.5 shadow-2xl">
            <div className="flex items-center justify-between pb-2.5 border-b border-gym-800">
              <div className="flex items-center space-x-2">
                <span className="text-2xl">⚡</span>
                <div>
                  <h3 className="text-sm font-black text-white">Персональный PPL Сплит</h3>
                  <p className="text-[10px] text-slate-400">Варианты А & Б для гипертрофии</p>
                </div>
              </div>
              <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                {recReps}
              </span>
            </div>

            {/* Estimated Initial Weights */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                🎯 Стартовые рабочие веса (расчет от веса тела):
              </span>
              <div className="grid grid-cols-3 gap-2 text-center font-mono">
                <div className="bg-gym-950/80 border border-gym-800/80 p-2.5 rounded-xl">
                  <span className="text-[9px] text-slate-400 block uppercase">Жим лежа</span>
                  <span className="text-base font-black text-sky-400">~{estBench} кг</span>
                </div>
                <div className="bg-gym-950/80 border border-gym-800/80 p-2.5 rounded-xl">
                  <span className="text-[9px] text-slate-400 block uppercase">Приседания</span>
                  <span className="text-base font-black text-emerald-400">~{estSquat} кг</span>
                </div>
                <div className="bg-gym-950/80 border border-gym-800/80 p-2.5 rounded-xl">
                  <span className="text-[9px] text-slate-400 block uppercase">Тяга блока</span>
                  <span className="text-base font-black text-amber-400">~{estPull} кг</span>
                </div>
              </div>
            </div>

            {/* Safety notes badge */}
            <div className="bg-gym-950/60 border border-gym-800/60 rounded-xl p-2.5 text-xs text-slate-300 flex items-start space-x-2">
              <span className="text-base mt-0.5">🛡️</span>
              <div className="text-[11px] leading-relaxed">
                <strong>Безопасность суставов:</strong> {formData.injuries ? `включен защитный режим (${formData.injuries})` : 'полная рабочая амплитуда с контролем техники'}.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Buttons (Back & Next) */}
      <div className="pt-4 border-t border-gym-800/80 flex items-center space-x-2">
        {step > 1 && (
          <button
            type="button"
            onClick={() => { triggerHaptic('light'); setStep(s => s - 1); }}
            className="py-3.5 px-4 bg-gym-900 hover:bg-gym-850 text-slate-300 font-bold text-xs rounded-2xl border border-gym-800 transition active:scale-95"
          >
            ‹ Назад
          </button>
        )}

        {step < 4 ? (
          <button
            type="button"
            onClick={() => { triggerHaptic('medium'); setStep(s => s + 1); }}
            className="flex-1 py-3.5 bg-gradient-to-r from-emerald-500 to-sky-500 hover:from-emerald-400 hover:to-sky-400 text-gym-950 font-black text-sm rounded-2xl shadow-lg shadow-emerald-500/20 active:scale-95 transition flex items-center justify-center space-x-2"
          >
            <span>ПРОДОЛЖИТЬ</span>
            <Icons.Next />
          </button>
        ) : (
          <button
            type="button"
            disabled={submitting}
            onClick={handleFinish}
            className="flex-1 py-4 bg-gradient-to-r from-emerald-400 via-emerald-500 to-emerald-400 hover:from-emerald-300 text-gym-950 font-black text-sm uppercase tracking-wider rounded-2xl shadow-xl shadow-emerald-500/30 active:scale-95 transition flex items-center justify-center space-x-2"
          >
            {submitting ? (
              <div className="w-5 h-5 border-2 border-gym-950 border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span>🚀 ПЕРЕЙТИ К ТРЕНИРОВКАМ</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

// ==========================================
// 📱 MAIN APPLICATION COMPONENT
// ==========================================
function App() {
  const [activeTab, setActiveTab] = useState('workout'); // 'workout' | 'analytics' | 'history' | 'exercises' | 'profile'
  const [exercises, setExercises] = useState([]);
  const [activeWorkout, setActiveWorkout] = useState(null);

  const currentUserId = getTelegramUser().id;

  const getCachedProfile = () => {
    try {
      const s = localStorage.getItem('gym_tracker_user_profile_' + currentUserId);
      if (s) {
        const p = JSON.parse(s);
        if (p && p.name) return p;
      }
    } catch (e) {}
    return null;
  };

  const getCachedHistory = () => {
    try {
      const s = localStorage.getItem('gym_tracker_history_' + currentUserId);
      if (s) return JSON.parse(s) || [];
    } catch (e) {}
    return [];
  };

  const initialCachedProfile = getCachedProfile();
  const [userProfile, setUserProfile] = useState(initialCachedProfile);
  const [historyWorkouts, setHistoryWorkouts] = useState(getCachedHistory);
  const [coachDays, setCoachDays] = useState([]);
  const [exerciseGuides, setExerciseGuides] = useState({});
  const [loading, setLoading] = useState(!initialCachedProfile);
  const [showOnboardingModal, setShowOnboardingModal] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  const isLocalOnboarded = (initialCachedProfile && initialCachedProfile.onboarding_completed === 1) || 
                           localStorage.getItem('gym_tracker_onboarded_' + currentUserId) === '1';

  useEffect(() => {
    loadAppData(!initialCachedProfile);
  }, []);

  const loadAppData = async (showSpinner = false) => {
    try {
      if (showSpinner && !initialCachedProfile) setLoading(true);
      const [exRes, activeRes, histRes, daysRes, guidesRes, profRes] = await Promise.all([
        fetch('/api/exercises'),
        fetch('/api/workouts/active'),
        fetch('/api/workouts?limit=50'),
        fetch('/api/coach/days'),
        fetch('/api/exercises/guides'),
        fetch('/api/profile')
      ]);

      const exData = await exRes.json().catch(() => []);
      const activeData = await activeRes.json().catch(() => null);
      let histData = await histRes.json().catch(() => []);
      let daysData = await daysRes.json().catch(() => []);
      const guidesData = await guidesRes.json().catch(() => ({}));
      let profData = await profRes.json().catch(() => null);

      if (profData && profData.telegram_chat_id) {
        try {
          localStorage.setItem('gym_tracker_chat_id', String(profData.telegram_chat_id));
          localStorage.setItem('gym_tracker_tg_id', 'tg_' + profData.telegram_chat_id);
        } catch (e) {}
      }

      // 🔄 SELF-HEALING SYNC FOR COLD SERVER STARTS:
      // If user finished onboarding on this device, but server woke up empty
      // (or reset due to sleep), seamlessly restore the saved profile to the server!
      const currentProfileToUse = (profData && profData.onboarding_completed === 1)
        ? profData
        : (initialCachedProfile || getCachedProfile());

      if (isLocalOnboarded && currentProfileToUse && (!profData || profData.onboarding_completed !== 1)) {
        console.log("⚡ [Self-Healing] Restoring profile from localStorage to server...");
        try {
          const syncRes = await fetch('/api/profile', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...currentProfileToUse,
              onboarding_completed: 1
            })
          });
          if (syncRes.ok) {
            profData = await syncRes.json();
            // Re-fetch coach days calculated with restored profile
            const dRes = await fetch('/api/coach/days');
            daysData = await dRes.json().catch(() => daysData);
          }
        } catch (syncErr) {
          console.warn("Profile sync warning:", syncErr);
        }
      }

      // 🔄 TWO-WAY WORKOUT SYNC & OFFLINE PERSISTENCE:
      let storedFullWorkouts = [];
      try {
        const rawLocal = localStorage.getItem('gym_tracker_full_workouts_' + currentUserId) || 
                         localStorage.getItem('gym_tracker_full_workouts_backup') || 
                         localStorage.getItem('gym_tracker_history_' + currentUserId) || '[]';
        storedFullWorkouts = JSON.parse(rawLocal) || [];
      } catch (e) {}

      // Combine server workouts with stored local workouts by start_time
      const mergedMap = new Map();
      (histData || []).forEach(w => {
        if (w.start_time) mergedMap.set(w.start_time, { ...w });
      });
      storedFullWorkouts.forEach(w => {
        if (!w.start_time) return;
        if (!mergedMap.has(w.start_time)) {
          mergedMap.set(w.start_time, { ...w });
        } else {
          // If server workout has 0 sets or volume, but local has sets or volume, preserve local!
          const srv = mergedMap.get(w.start_time);
          const localSets = Array.isArray(w.sets) ? w.sets : [];
          const localVol = (typeof w.total_volume === 'number' && w.total_volume > 0)
            ? w.total_volume
            : localSets.reduce((sum, s) => sum + ((parseFloat(s.weight) || 0) * (parseInt(s.reps, 10) || 0)), 0);
          const srvVol = srv.total_volume || 0;
          const srvSets = srv.total_sets || 0;

          const merged = { ...srv, ...w };
          merged.total_volume = Math.max(srvVol, localVol);
          merged.total_sets = Math.max(srvSets, localSets.length, w.total_sets || 0);
          if (localSets.length > 0) {
            merged.sets = localSets;
          }
          mergedMap.set(w.start_time, merged);
        }
      });
      const combinedWorkouts = Array.from(mergedMap.values()).sort((a, b) => {
        const da = parseSafeDate(a.start_time);
        const db = parseSafeDate(b.start_time);
        return (db ? db.getTime() : 0) - (da ? da.getTime() : 0);
      });

      // If client has workouts that the server is missing or incomplete (0 sets/volume)
      const missingOrIncompleteOnServer = Array.from(mergedMap.values()).filter(localW => {
        const srv = (histData || []).find(s => s.start_time === localW.start_time);
        if (!srv) return true;
        if ((!srv.total_volume || srv.total_volume === 0) && (localW.total_volume > 0 || (localW.sets && localW.sets.length > 0))) {
          return true;
        }
        return false;
      });

      if (missingOrIncompleteOnServer.length > 0) {
        console.log(`⚡ [Self-Healing] Restoring/Updating ${missingOrIncompleteOnServer.length} workouts to server...`);
        try {
          fetch('/api/workouts/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ workouts: missingOrIncompleteOnServer })
          }).catch(() => {});
        } catch (syncErr) {
          console.warn("Workout sync warning:", syncErr);
        }
      }

      // Update local cache with combined list
      try {
        localStorage.setItem('gym_tracker_full_workouts_' + currentUserId, JSON.stringify(combinedWorkouts));
        localStorage.setItem('gym_tracker_full_workouts_backup', JSON.stringify(combinedWorkouts));
        localStorage.setItem('gym_tracker_history_' + currentUserId, JSON.stringify(combinedWorkouts));
      } catch (e) {}

      histData = combinedWorkouts;

      setExercises(exData || []);
      setActiveWorkout(activeData || null);
      setHistoryWorkouts(histData || []);
      setCoachDays(daysData || []);
      setExerciseGuides(guidesData || {});

      const finalProfile = (profData && profData.onboarding_completed === 1) 
        ? profData 
        : currentProfileToUse;

      setUserProfile(finalProfile);
      if (finalProfile && finalProfile.onboarding_completed === 1) {
        try {
          localStorage.setItem('gym_tracker_user_profile_' + currentUserId, JSON.stringify(finalProfile));
          localStorage.setItem('gym_tracker_onboarded_' + currentUserId, '1');
        } catch (e) {}
      }
    } catch (err) {
      console.error('Error loading data:', err);
      const cached = getCachedProfile();
      if (cached) setUserProfile(cached);
    } finally {
      setLoading(false);
    }
  };

  const isInWorkoutFocus = !!activeWorkout && !isMinimized && activeTab === 'workout';
  
  const hasOnboarded = isLocalOnboarded || (userProfile && userProfile.onboarding_completed === 1);
  const needsOnboarding = showOnboardingModal || !hasOnboarded;

  if (loading && !hasOnboarded) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gym-950 text-slate-100 p-6 space-y-4 safe-top safe-bottom">
        <div className="relative flex items-center justify-center">
          <div className="w-20 h-20 border-4 border-sky-500/20 border-t-sky-400 rounded-3xl animate-spin absolute -inset-1"></div>
          <img src="/static/app-icon.png" alt="GymTracker" className="w-16 h-16 rounded-2xl shadow-2xl relative z-10 border border-gym-700/80 object-cover" />
        </div>
        <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Загрузка GymTracker...</p>
      </div>
    );
  }

  if (needsOnboarding || showOnboardingModal) {
    return (
      <OnboardingScreen
        initialProfile={userProfile}
        onComplete={(updated) => {
          setUserProfile(updated);
          setShowOnboardingModal(false);
          loadAppData(true);
        }}
        onCancel={() => setShowOnboardingModal(false)}
      />
    );
  }

  return (
    <div className={`flex flex-col min-h-screen bg-gym-950 text-slate-100 font-sans select-none ${isInWorkoutFocus ? 'pb-safe-bottom pb-4' : 'safe-pb-nav'}`}>
      {/* Top Header: Hidden in workout focus mode to maximize vertical space */}
      {!isInWorkoutFocus && (
        <header className="sticky top-0 z-40 bg-gym-900 border-b border-gym-800 px-4 pb-2.5 flex items-center justify-between safe-header">
          <div className="flex items-center space-x-2.5">
            <img 
              src="/static/app-icon.png" 
              alt="GymTracker" 
              className="w-9 h-9 rounded-xl shadow-lg shadow-sky-500/10 border border-gym-700/80 object-cover shrink-0" 
            />
            <div>
              <h1 className="text-sm font-extrabold tracking-tight bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
                GymTracker
              </h1>
              <p className="text-[9px] text-slate-400 font-medium uppercase">
                {userProfile?.fitness_goal === 'strength' ? 'Силовой тренинг' : userProfile?.fitness_goal === 'fat_loss' ? 'Сушка и рельеф' : 'Набор массы'} • Gemini Coach
              </p>
            </div>
          </div>

          {activeWorkout ? (
            <button 
              onClick={() => { setIsMinimized(false); setActiveTab('workout'); }}
              className="flex items-center space-x-2 bg-emerald-500/15 border border-emerald-500/40 px-3 py-1 rounded-full active:scale-95 transition"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 live-dot"></span>
              <span className="text-xs font-bold text-emerald-400">Тренировка активна ▶</span>
            </button>
          ) : (
            <div className="flex items-center space-x-1.5">
              <button
                type="button"
                onClick={() => setShowAccountModal(true)}
                className={`text-xs px-2.5 py-1 rounded-full border flex items-center space-x-1 font-mono transition active:scale-95 ${
                  currentUserId.startsWith('tg_')
                    ? 'bg-gym-800/90 text-slate-300 hover:text-white border-gym-700'
                    : 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse'
                }`}
                title="PWA и синхронизация аккаунта"
              >
                <span>{isStandalonePWA() ? '🚀' : currentUserId.startsWith('tg_') ? '📱' : '⚠️'}</span>
                <span className="text-[11px] font-bold">
                  {currentUserId.startsWith('tg_') ? 'PWA' : 'Войти'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('profile')}
                className="text-xs text-slate-300 hover:text-white bg-gym-800/90 px-2.5 py-1 rounded-full border border-gym-700 flex items-center space-x-1 font-mono"
              >
                <span>{userProfile?.weight || 80} кг</span>
                <span className="text-emerald-400">⚙️</span>
              </button>
            </div>
          )}
        </header>
      )}

      {/* Main Content Area */}
      <main className={`flex-1 max-w-lg mx-auto w-full px-3.5 ${isInWorkoutFocus ? 'pt-safe-top pt-2' : 'pt-2'}`}>
        <>
          {activeTab === 'workout' && (
            <GuidedWorkoutScreen 
              activeWorkout={activeWorkout} 
              exercises={exercises} 
              coachDays={coachDays}
              exerciseGuides={exerciseGuides}
              userProfile={userProfile}
              onRefresh={loadAppData}
              onMinimize={() => setIsMinimized(true)}
            />
          )}

          {activeTab === 'analytics' && (
            <AnalyticsScreen exercises={exercises} />
          )}

          {activeTab === 'history' && (
            <HistoryScreen workouts={historyWorkouts} exercises={exercises} onRefresh={loadAppData} />
          )}

          {activeTab === 'exercises' && (
            <ExercisesScreen exercises={exercises} exerciseGuides={exerciseGuides} onRefresh={loadAppData} />
          )}

          {activeTab === 'profile' && (
            <ProfileScreen 
              profile={userProfile} 
              onOpenAccountModal={() => setShowAccountModal(true)}
              onUpdateProfile={(updated) => {
                setUserProfile(updated);
                try {
                  localStorage.setItem('gym_tracker_user_profile_' + getTelegramUser().id, JSON.stringify(updated));
                } catch (e) {}
                loadAppData();
              }} 
              onRestartOnboarding={() => {
                try {
                  localStorage.removeItem('gym_tracker_onboarded_' + getTelegramUser().id);
                  localStorage.removeItem('gym_tracker_user_profile_' + getTelegramUser().id);
                } catch (e) {}
                setShowOnboardingModal(true);
              }}
            />
          )}
        </>
      </main>

      {/* Bottom Fixed Navigation Bar (Hidden during active workout focus) */}
      {!isInWorkoutFocus && (
        <nav className="fixed bottom-0 left-0 right-0 z-40 bg-gym-900 border-t border-gym-800 px-1 pt-1 max-w-lg mx-auto safe-bottom">
          <div className="grid grid-cols-5 gap-0.5">
            <NavButton 
              active={activeTab === 'workout'} 
              onClick={() => { setIsMinimized(false); setActiveTab('workout'); }}
              icon={<Icons.Dumbbell />}
              label="Тренинг"
              badge={activeWorkout ? "•" : null}
            />
            <NavButton 
              active={activeTab === 'analytics'} 
              onClick={() => setActiveTab('analytics')}
              icon={<Icons.Chart />}
              label="Анализ"
            />
            <NavButton 
              active={activeTab === 'history'} 
              onClick={() => setActiveTab('history')}
              icon={<Icons.History />}
              label="История"
            />
            <NavButton 
              active={activeTab === 'exercises'} 
              onClick={() => setActiveTab('exercises')}
              icon={<Icons.List />}
              label="База"
            />
            <NavButton 
              active={activeTab === 'profile'} 
              onClick={() => setActiveTab('profile')}
              icon={<Icons.User />}
              label="О себе"
            />
          </div>
        </nav>
      )}

      {/* Account & PWA Modal */}
      <AccountModal 
        isOpen={showAccountModal} 
        onClose={() => setShowAccountModal(false)} 
        userProfile={userProfile} 
        onUserChanged={() => loadAppData(true)} 
      />
    </div>
  );
}

function NavButton({ active, onClick, icon, label, badge }) {
  return (
    <button
      onClick={onClick}
      className={`relative flex flex-col items-center justify-center py-1 px-1 rounded-xl transition-all duration-150 active:scale-95 ${
        active ? 'bg-gym-800 text-emerald-400 font-bold shadow-inner' : 'text-slate-400 hover:text-slate-200'
      }`}
    >
      <div className="relative">
        {icon}
        {badge && (
          <span className="absolute -top-1 -right-1.5 text-emerald-400 text-xs font-black animate-pulse">
            {badge}
          </span>
        )}
      </div>
      <span className="text-[10px] mt-0.5 tracking-tight font-medium">{label}</span>
    </button>
  );
}

// ==========================================
// 🚀 FULLY GUIDED WORKOUT SCREEN (STEP-BY-STEP FLOW)
// ==========================================
function GuidedWorkoutScreen({ activeWorkout, exercises, coachDays, exerciseGuides = {}, userProfile, onRefresh, onMinimize }) {
  // Navigation inside the plan
  const [currentPlanIndex, setCurrentPlanIndex] = useState(0);
  const [selectedVariant, setSelectedVariant] = useState('a');
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [showCoachTip, setShowCoachTip] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [weight, setWeight] = useState(20);
  const [reps, setReps] = useState(10);
  const [setType, setSetType] = useState('normal'); // 'normal' | 'warmup' | 'drop' | 'failure'
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [workoutDuration, setWorkoutDuration] = useState(0);
  const [editingSet, setEditingSet] = useState(null);

  // Auto-switch variant tab if coach recommends variant B
  useEffect(() => {
    const rec = coachDays.find(d => d.is_recommended);
    if (rec?.variant) {
      setSelectedVariant(rec.variant);
    }
  }, [coachDays]);

  // Rest Timer State (Timestamp-backed for 100% background accuracy)
  const [restSecondsLeft, setRestSecondsLeft] = useState(0);
  const [restActive, setRestActive] = useState(false);
  const [restPreset, setRestPreset] = useState(90);
  const [restReason, setRestReason] = useState('');
  const [restBadge, setRestBadge] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [botPushEnabled, setBotPushEnabled] = useState(() => {
    try {
      const saved = localStorage.getItem('gym_tracker_bot_push_enabled');
      return saved !== null ? saved === 'true' : true;
    } catch (e) {
      return true;
    }
  });
  const [showWarmupModal, setShowWarmupModal] = useState(false);

  // List of planned exercises for today's session
  const plannedList = activeWorkout?.planned_exercises || [];

  // Group finished sets by exercise name
  const setsByExercise = useMemo(() => {
    if (!activeWorkout) return {};
    return activeWorkout.sets.reduce((acc, s) => {
      acc[s.exercise_name] = acc[s.exercise_name] || [];
      acc[s.exercise_name].push(s);
      return acc;
    }, {});
  }, [activeWorkout]);

  // Current active exercise in the plan
  const currentPlanEx = plannedList[currentPlanIndex] || plannedList[0];
  const currentSets = setsByExercise[currentPlanEx?.name] || [];
  const currentWorkingSets = currentSets.filter(s => (s.set_type || 'normal') !== 'warmup');
  const currentWorkingCount = currentWorkingSets.length;

  // Dynamic advice for the upcoming set based on performance in previous sets
  const nextSetAdvice = useMemo(() => {
    return calculateNextSetAdvice(currentPlanEx, currentSets, userProfile);
  }, [currentPlanEx, currentSets, userProfile]);

  // Auto-fill weight when currentPlanIndex changes or exercise is switched
  useEffect(() => {
    if (currentPlanEx) {
      const curSets = setsByExercise[currentPlanEx.name] || [];
      const wSets = curSets.filter(s => (s.set_type || 'normal') !== 'warmup');
      
      setSetType('normal');

      if (wSets.length > 0) {
        const adv = calculateNextSetAdvice(currentPlanEx, curSets, userProfile);
        if (adv && adv.recWeight) {
          setWeight(adv.recWeight);
          setReps(adv.recReps);
        }
      } else {
        setWeight(currentPlanEx.recommended_weight || 20);
        const targetRepsNum = parseInt(currentPlanEx.target_reps?.split('–')[1] || currentPlanEx.target_reps?.split('-')[0] || 10);
        setReps(targetRepsNum || 10);
      }
    }
  }, [currentPlanIndex, activeWorkout?.id]);

  // Workout Session Duration Timer
  useEffect(() => {
    if (!activeWorkout) return;
    const sDate = parseSafeDate(activeWorkout.start_time);
    const startTime = sDate ? sDate.getTime() : Date.now();
    const interval = setInterval(() => {
      const now = Date.now();
      setWorkoutDuration(Math.max(0, Math.floor((now - startTime) / 1000)));
    }, 1000);
    return () => clearInterval(interval);
  }, [activeWorkout]);

  // Restore running rest timer from localStorage on mount (e.g. if WebApp was minimized)
  useEffect(() => {
    try {
      const targetStr = localStorage.getItem('gym_tracker_rest_end');
      if (targetStr) {
        const target = parseInt(targetStr, 10);
        const rem = Math.max(0, Math.ceil((target - Date.now()) / 1000));
        if (rem > 0) {
          setRestSecondsLeft(rem);
          setRestActive(true);
          const rReason = localStorage.getItem('gym_tracker_rest_reason') || '';
          const rBadge = localStorage.getItem('gym_tracker_rest_badge') || '';
          const rTotal = parseInt(localStorage.getItem('gym_tracker_rest_total') || '90', 10);
          setRestReason(rReason);
          setRestBadge(rBadge);
          setRestPreset(rTotal);
        } else {
          localStorage.removeItem('gym_tracker_rest_end');
        }
      }
    } catch (e) {}
  }, []);

  // Rest Timer Countdown (Timestamp-based: works 100% in background / screen off)
  useEffect(() => {
    if (!restActive) return;

    const checkRest = () => {
      const targetStr = localStorage.getItem('gym_tracker_rest_end');
      if (!targetStr) {
        setRestActive(false);
        setRestSecondsLeft(0);
        return;
      }
      const target = parseInt(targetStr, 10);
      const remaining = Math.max(0, Math.ceil((target - Date.now()) / 1000));
      const overdueMs = Date.now() - target;
      setRestSecondsLeft(remaining);

      if (remaining <= 0) {
        setRestActive(false);
        try {
          localStorage.removeItem('gym_tracker_rest_end');
          localStorage.removeItem('gym_tracker_rest_total');
          localStorage.removeItem('gym_tracker_rest_reason');
          localStorage.removeItem('gym_tracker_rest_badge');
        } catch (e) {}

        triggerHaptic('success');
        if (navigator.vibrate) navigator.vibrate([250, 100, 250, 100, 400]);

        // Only play chime sound if the timer expired just now (within 3.5 seconds)
        // If the user reopened the app minutes later, do NOT interrupt their music or workout!
        if (soundEnabled && overdueMs < 3500) {
          playChimeSound();
        }

        // Browser Web Notification via ServiceWorker if supported
        try {
          if ('Notification' in window && Notification.permission === 'granted') {
            if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
              navigator.serviceWorker.ready.then(reg => {
                reg.showNotification('GymTracker ⏱️', {
                  body: 'Отдых окончен! Пора на следующий подход 💪',
                  icon: '/static/icon-192.png',
                  badge: '/static/icon-192.png',
                  tag: 'rest-timer'
                });
              }).catch(() => {
                try { new Notification('GymTracker ⏱️', { body: 'Отдых окончен! Пора на следующий подход 💪', icon: '/static/icon-192.png' }); } catch (e) {}
              });
            } else {
              try { new Notification('GymTracker ⏱️', { body: 'Отдых окончен! Пора на следующий подход 💪', icon: '/static/icon-192.png' }); } catch (e) {}
            }
          }
        } catch (e) {}
      }
    };

    checkRest();
    const interval = setInterval(checkRest, 500);

    const onVisibilityOrFocus = () => {
      checkRest();
    };

    document.addEventListener('visibilitychange', onVisibilityOrFocus);
    window.addEventListener('focus', onVisibilityOrFocus);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityOrFocus);
      window.removeEventListener('focus', onVisibilityOrFocus);
    };
  }, [restActive, soundEnabled]);

  // Server-side Telegram Bot Audible Push Notification
  const scheduleBotRestPush = (seconds, exName, nextSet, targetSets, recW, recR) => {
    if (!botPushEnabled || seconds <= 0) return;
    try {
      const u = getTelegramUser();
      let tgUserId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id ||
                     userProfile?.telegram_chat_id ||
                     (parseInt(localStorage.getItem('gym_tracker_chat_id') || '0', 10) || null);
      if (!tgUserId && u?.id) {
        if (u.id.startsWith('tg_') && /^\d+$/.test(u.id.substring(3))) {
          tgUserId = parseInt(u.id.substring(3), 10);
        } else if (/^\d+$/.test(u.id)) {
          tgUserId = parseInt(u.id, 10);
        }
      }
      fetch('/api/timer/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          duration_seconds: seconds,
          exercise_name: exName || currentPlanEx?.name || 'Следующий подход',
          next_set_num: nextSet || (currentWorkingCount + 1),
          target_sets: targetSets || currentPlanEx?.target_sets || 3,
          rec_weight: recW !== undefined ? parseFloat(recW) : parseFloat(weight),
          rec_reps: recR !== undefined ? parseInt(recR, 10) : parseInt(reps, 10),
          telegram_chat_id: tgUserId || null
        })
      }).catch(() => {});
    } catch (e) {}
  };

  const cancelBotRestPush = () => {
    try {
      const u = getTelegramUser();
      let tgUserId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id ||
                     userProfile?.telegram_chat_id ||
                     (parseInt(localStorage.getItem('gym_tracker_chat_id') || '0', 10) || null);
      if (!tgUserId && u?.id) {
        if (u.id.startsWith('tg_') && /^\d+$/.test(u.id.substring(3))) {
          tgUserId = parseInt(u.id.substring(3), 10);
        } else if (/^\d+$/.test(u.id)) {
          tgUserId = parseInt(u.id, 10);
        }
      }
      fetch('/api/timer/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegram_chat_id: tgUserId || null })
      }).catch(() => {});
    } catch (e) {}
  };

  const adjustRestTime = (secondsDelta) => {
    triggerHaptic('light');
    const targetStr = localStorage.getItem('gym_tracker_rest_end');
    const currentTarget = targetStr ? parseInt(targetStr, 10) : (Date.now() + restSecondsLeft * 1000);
    const newTarget = Math.max(Date.now(), currentTarget + secondsDelta * 1000);
    const newRemaining = Math.max(0, Math.ceil((newTarget - Date.now()) / 1000));
    
    try {
      localStorage.setItem('gym_tracker_rest_end', String(newTarget));
    } catch (e) {}

    setRestSecondsLeft(newRemaining);
    if (newRemaining > restPreset) {
      setRestPreset(newRemaining);
      try { localStorage.setItem('gym_tracker_rest_total', String(newRemaining)); } catch (e) {}
    }

    if (newRemaining > 0) {
      scheduleBotRestPush(newRemaining, currentPlanEx?.name, currentWorkingCount + 1, currentPlanEx?.target_sets, weight, reps);
    } else {
      cancelBotRestPush();
    }
  };

  const setFixedRestTime = (seconds) => {
    triggerHaptic('light');
    const newTarget = Date.now() + seconds * 1000;
    try {
      localStorage.setItem('gym_tracker_rest_end', String(newTarget));
      localStorage.setItem('gym_tracker_rest_total', String(seconds));
    } catch (e) {}
    setRestPreset(seconds);
    setRestSecondsLeft(seconds);
    setRestActive(true);
    scheduleBotRestPush(seconds, currentPlanEx?.name, currentWorkingCount + 1, currentPlanEx?.target_sets, weight, reps);
  };

  const cancelRestTimer = () => {
    triggerHaptic('light');
    setRestActive(false);
    setRestSecondsLeft(0);
    cancelBotRestPush();
    try {
      localStorage.removeItem('gym_tracker_rest_end');
      localStorage.removeItem('gym_tracker_rest_total');
      localStorage.removeItem('gym_tracker_rest_reason');
      localStorage.removeItem('gym_tracker_rest_badge');
    } catch (e) {}
  };

  // Start selected day with variant
  const handleStartDay = async (dayType, variant = 'a') => {
    try {
      const res = await fetch('/api/coach/start-day', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ day_type: dayType, variant: variant })
      });
      if (res.ok) {
        setCurrentPlanIndex(0);
        onRefresh();
      } else {
        alert('Ошибка при запуске');
      }
    } catch (e) {
      alert('Ошибка соединения с сервером');
    }
  };

  // Swap exercise in active workout
  const handleSwapExercise = async (oldName, newName) => {
    try {
      const res = await fetch(`/api/workouts/${activeWorkout.id}/swap-exercise`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          old_exercise_name: oldName,
          new_exercise_name: newName
        })
      });
      if (res.ok) {
        onRefresh();
      } else {
        alert('Ошибка при замене упражнения');
      }
    } catch (e) {
      alert('Ошибка соединения при замене упражнения');
    }
  };

  // Finish workout
  const handleFinishWorkout = async () => {
    if (!confirm('Завершить тренировку и сохранить результаты?')) return;
    cancelBotRestPush();
    try {
      const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
      const finishedSets = (activeWorkout.sets || []).map(s => ({
        exercise_name: s.exercise_name,
        weight: parseFloat(s.weight) || 0,
        reps: parseInt(s.reps, 10) || 0,
        set_type: s.set_type || 'normal',
        set_number: s.set_number
      }));
      const totalVol = finishedSets.reduce((sum, s) => sum + (s.weight * s.reps), 0);
      const finishedWorkoutObj = {
        id: activeWorkout.id,
        title: activeWorkout.title || 'Силовая тренировка',
        start_time: activeWorkout.start_time || nowStr,
        end_time: nowStr,
        notes: activeWorkout.notes || '',
        total_sets: finishedSets.length,
        total_volume: totalVol,
        sets: finishedSets
      };

      try {
        const uId = getTelegramUser().id;
        const uKey = 'gym_tracker_full_workouts_' + uId;
        const prevStored = JSON.parse(localStorage.getItem(uKey) || '[]');
        const updatedStored = [finishedWorkoutObj, ...prevStored.filter(w => w.start_time !== finishedWorkoutObj.start_time)];
        localStorage.setItem(uKey, JSON.stringify(updatedStored));
        localStorage.setItem('gym_tracker_full_workouts_backup', JSON.stringify(updatedStored));
      } catch (storageErr) {
        console.warn('Local workout backup error:', storageErr);
      }

      const u = getTelegramUser();
      let tgUserId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
      if (!tgUserId && u?.id) {
        if (u.id.startsWith('tg_') && /^\d+$/.test(u.id.substring(3))) {
          tgUserId = parseInt(u.id.substring(3), 10);
        } else if (/^\d+$/.test(u.id)) {
          tgUserId = parseInt(u.id, 10);
        }
      }
      const res = await fetch(`/api/workouts/${activeWorkout.id}/finish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegram_chat_id: tgUserId || null
        })
      });
      if (res.ok) {
        alert('🎉 Отличная работа! Тренировка сохранена в историю, а сводка отправлена вам в Telegram.');
        onRefresh();
      }
    } catch (e) {
      alert('Ошибка при завершении');
    }
  };

  const handleDiscardWorkout = async () => {
    if (!confirm('Отменить и удалить текущую тренировку? Все данные этой сессии будут сброшены.')) return;
    cancelBotRestPush();
    try {
      const res = await fetch(`/api/workouts/${activeWorkout.id}`, { method: 'DELETE' });
      if (res.ok) {
        try {
          const uId = getTelegramUser().id;
          const uKey = 'gym_tracker_full_workouts_' + uId;
          const raw = localStorage.getItem(uKey) || localStorage.getItem('gym_tracker_full_workouts_backup') || '[]';
          const list = JSON.parse(raw);
          const filtered = list.filter(w => w.id !== activeWorkout.id && w.start_time !== activeWorkout.start_time);
          localStorage.setItem(uKey, JSON.stringify(filtered));
          localStorage.setItem('gym_tracker_full_workouts_backup', JSON.stringify(filtered));
          localStorage.setItem('gym_tracker_history_' + uId, JSON.stringify(filtered));
        } catch (e) {}
        triggerHaptic('warning');
        onRefresh();
      } else {
        alert('Не удалось сбросить тренировку');
      }
    } catch (e) {
      alert('Ошибка соединения при сбросе тренировки');
    }
  };

  // Add Set with automatic step progression & dynamic set advice
  const handleAddSet = async () => {
    if (!activeWorkout || !currentPlanEx) return;
    setIsSubmitting(true);

    // Find DB exercise ID
    const match = exercises.find(e => e.name.toLowerCase() === currentPlanEx.name.toLowerCase());
    const exId = match ? match.id : exercises[0]?.id;

    const loggedWeight = parseFloat(weight);
    const loggedReps = parseInt(reps, 10);
    const loggedType = setType;

    try {
      const res = await fetch(`/api/workouts/${activeWorkout.id}/sets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exercise_id: exId,
          weight: loggedWeight,
          reps: loggedReps,
          set_type: loggedType
        })
      });

      if (res.ok) {
        const isWarmup = loggedType === 'warmup';
        const currentSets = setsByExercise[currentPlanEx.name] || [];
        const updatedSetsForEx = [...currentSets, {
          weight: loggedWeight,
          reps: loggedReps,
          set_type: loggedType,
          set_number: currentSets.length + 1
        }];

        const prevWorkingCount = currentSets.filter(s => (s.set_type || 'normal') !== 'warmup').length;
        const newWorkingCount = prevWorkingCount + (!isWarmup ? 1 : 0);

        // 1. Calculate Adaptive Rest & Start Background-Resistant Timer
        const restInfo = getAdaptiveRestInfo(currentPlanEx.name, loggedType, loggedReps, userProfile?.fitness_goal);
        const duration = restInfo.duration;
        const targetEndTime = Date.now() + duration * 1000;
        
        try {
          localStorage.setItem('gym_tracker_rest_end', String(targetEndTime));
          localStorage.setItem('gym_tracker_rest_total', String(duration));
          localStorage.setItem('gym_tracker_rest_reason', restInfo.reason);
          localStorage.setItem('gym_tracker_rest_badge', restInfo.badge);
        } catch (e) {}

        setRestPreset(duration);
        setRestSecondsLeft(duration);
        setRestReason(restInfo.reason);
        setRestBadge(restInfo.badge);
        setRestActive(true);

        // Request notification permission if first time
        try {
          if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission().catch(() => {});
          }
        } catch (e) {}

        // 2. Dynamic Next Set Weight Recommendation
        let nextWeightToRec = loggedWeight;
        let nextRepsToRec = loggedReps;

        if (isWarmup) {
          setSetType('normal');
          if (currentPlanEx.recommended_weight) {
            setWeight(currentPlanEx.recommended_weight);
            nextWeightToRec = currentPlanEx.recommended_weight;
          }
        } else if (newWorkingCount < currentPlanEx.target_sets) {
          // Compute dynamic next set advice based on the set just finished!
          const nextAdvice = calculateNextSetAdvice(currentPlanEx, updatedSetsForEx, userProfile);
          if (nextAdvice && nextAdvice.recWeight) {
            setWeight(nextAdvice.recWeight);
            setReps(nextAdvice.recReps);
            nextWeightToRec = nextAdvice.recWeight;
            nextRepsToRec = nextAdvice.recReps;
          }
        }

        // Schedule Telegram Bot Audible Push Notification
        scheduleBotRestPush(
          duration,
          currentPlanEx.name,
          Math.min(currentPlanEx.target_sets, newWorkingCount + 1),
          currentPlanEx.target_sets,
          nextWeightToRec,
          nextRepsToRec
        );

        if (newWorkingCount >= currentPlanEx.target_sets) {
          // This exercise is complete! Automatically move to next exercise if available
          if (currentPlanIndex < plannedList.length - 1) {
            setCurrentPlanIndex(prev => prev + 1);
          }
        }

        onRefresh();
      }
    } catch (e) {
      alert('Ошибка при записи подхода');
    } finally {
      setIsSubmitting(false);
    }
  };

  const adjustWeight = (delta) => setWeight((prev) => Math.max(0, Math.round(((parseFloat(prev) || 0) + delta) * 10) / 10));
  const adjustReps = (delta) => setReps((prev) => Math.max(1, (parseInt(prev, 10) || 1) + delta));

  const handleSaveEditedSet = async (updatedFields) => {
    if (!editingSet) return;
    try {
      const res = await fetch(`/api/sets/${editingSet.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedFields)
      });
      if (res.ok) {
        triggerHaptic('success');
        setEditingSet(null);
        if (typeof onRefresh === 'function') onRefresh();
      } else {
        alert('Ошибка при сохранении изменений');
      }
    } catch (e) {
      alert('Ошибка соединения с сервером');
    }
  };

  const handleDeleteEditedSet = async (setId) => {
    if (!confirm('Удалить этот подход?')) return;
    try {
      const res = await fetch(`/api/sets/${setId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        triggerHaptic('warning');
        setEditingSet(null);
        if (typeof onRefresh === 'function') onRefresh();
      } else {
        alert('Ошибка при удалении подхода');
      }
    } catch (e) {
      alert('Ошибка соединения с сервером');
    }
  };

  // ==========================================
  // 1. ВЫБОР ДНЯ (ЕСЛИ ТРЕНИРОВКА ЕЩЕ НЕ НАЧАТА)
  // ==========================================
  if (!activeWorkout) {
    const recommendedDay = coachDays.find(d => d.is_recommended) || coachDays[0];
    const filteredDays = coachDays.filter(d => d.variant === selectedVariant);
    const displayDays = filteredDays.length > 0 ? filteredDays : coachDays.slice(0, 3);

    return (
      <div className="space-y-4 pt-1">
        <div className="text-center py-2">
          <h2 className="text-2xl font-black text-white tracking-tight">Выберите тренировку</h2>
          <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
            ИИ подстраивает веса под ваши результаты и чередует упражнения для непрерывного прогресса.
          </p>
        </div>

        {/* Variant A vs Variant B Periodization Toggle */}
        <div className="bg-gym-900 border border-gym-800 rounded-2xl p-1.5 shadow-lg">
          <div className="flex space-x-1.5">
            <button
              onClick={() => setSelectedVariant('a')}
              className={`flex-1 py-2.5 px-2 rounded-xl font-bold text-xs transition-all flex flex-col items-center justify-center active:scale-95 ${
                selectedVariant === 'a'
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-gym-950 shadow-md font-black'
                  : 'text-slate-400 hover:text-white hover:bg-gym-800/50'
              }`}
            >
              <span className="flex items-center space-x-1">
                <span>⚡ Вариант А</span>
                {recommendedDay?.variant === 'a' && <span className="text-[10px]">⭐</span>}
              </span>
              <span className="text-[9px] opacity-80 uppercase tracking-wider mt-0.5">Базовый силовой</span>
            </button>

            <button
              onClick={() => setSelectedVariant('b')}
              className={`flex-1 py-2.5 px-2 rounded-xl font-bold text-xs transition-all flex flex-col items-center justify-center active:scale-95 ${
                selectedVariant === 'b'
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-gym-950 shadow-md font-black'
                  : 'text-slate-400 hover:text-white hover:bg-gym-800/50'
              }`}
            >
              <span className="flex items-center space-x-1">
                <span>🔄 Вариант Б</span>
                {recommendedDay?.variant === 'b' && <span className="text-[10px]">⭐</span>}
              </span>
              <span className="text-[9px] opacity-80 uppercase tracking-wider mt-0.5">Смена углов & памп</span>
            </button>
          </div>

          <div className="text-[11px] text-center text-slate-400 pt-2 pb-0.5 font-medium">
            {recommendedDay?.variant === selectedVariant ? (
              <span className="text-emerald-400">
                ✨ Рекомендация тренера: сегодня тренируем <strong>{recommendedDay?.title?.split('—')[0]}</strong>
              </span>
            ) : (
              <span>Чередование вариантов развивает мышцы под разными углами и предотвращает застой</span>
            )}
          </div>
        </div>

        {/* Big 3 Cards for Push / Pull / Legs of selected variant */}
        <div className="grid grid-cols-1 gap-3">
          {displayDays.map((day) => {
            const isRec = day.is_recommended;
            const dayTypeColor = day.type === 'push' ? 'from-rose-950/60 to-gym-900 border-rose-500/40' 
                               : day.type === 'pull' ? 'from-sky-950/60 to-gym-900 border-sky-500/40' 
                               : 'from-emerald-950/60 to-gym-900 border-emerald-500/40';

            return (
              <div
                key={`${day.type}_${day.variant}`}
                className={`bg-gradient-to-r ${dayTypeColor} border rounded-3xl p-5 shadow-xl transition-all relative overflow-hidden`}
              >
                {isRec && (
                  <div className="absolute top-0 right-0 bg-emerald-500 text-gym-950 text-[10px] font-black px-3.5 py-1 rounded-bl-2xl uppercase tracking-wider shadow">
                    ⭐ Рекомендуется сегодня
                  </div>
                )}

                <div className="mb-2">
                  <div className="flex items-center space-x-2">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                      {day.focus}
                    </span>
                  </div>
                  <h3 className="text-xl font-black text-white mt-0.5">{day.title}</h3>
                </div>

                {/* Exercises Preview with pre-calculated weights & progression badges */}
                <div className="bg-gym-950/70 border border-gym-800/80 rounded-2xl p-3 my-3 space-y-2">
                  {day.exercises.map((ex, i) => (
                    <div key={i} className="flex items-center justify-between text-xs font-mono">
                      <div className="flex items-center space-x-1.5 truncate max-w-[65%]">
                        <span className="text-slate-400 text-[10px]">{i + 1}.</span>
                        <span className="text-slate-200 truncate">{ex.name.split('(')[0].trim()}</span>
                      </div>
                      <div className="flex items-center space-x-2 whitespace-nowrap">
                        {ex.progression_badge && (
                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-black ${
                            ex.progression_status === 'INCREASE' 
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' 
                              : 'bg-gym-800 text-slate-400'
                          }`}>
                            {ex.progression_badge}
                          </span>
                        )}
                        <span className="text-emerald-400 font-bold">
                          {ex.target_sets}×{ex.target_reps} • <strong className="text-white">{ex.recommended_weight} кг</strong>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => handleStartDay(day.type, day.variant)}
                  className={`w-full py-3.5 rounded-2xl font-black text-sm uppercase tracking-wide transition flex items-center justify-center space-x-2 shadow-lg active:scale-98 ${
                    isRec 
                      ? 'bg-emerald-500 hover:bg-emerald-400 text-gym-950 shadow-emerald-500/20' 
                      : 'bg-gym-800 hover:bg-white hover:text-gym-950 text-white'
                  }`}
                >
                  <Icons.Plus />
                  <span>ВЫБРАТЬ {day.type.toUpperCase()} ({day.variant.toUpperCase()}) И НАЧАТЬ</span>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ==========================================
  // 2. ИДЕТ АВТОМАТИЧЕСКАЯ ТРЕНИРОВКА (GUIDED STEPPER)
  // ==========================================
  const allCurrentSets = setsByExercise[currentPlanEx?.name] || [];
  const workingSetsDone = allCurrentSets.filter(s => (s.set_type || 'normal') !== 'warmup').length;
  const currentSetNum = workingSetsDone + 1;
  const totalTargetSets = currentPlanEx?.target_sets || 3;
  const isCurrentExCompleted = workingSetsDone >= totalTargetSets;

  // Calculate overall workout completion percentage based on working sets
  const totalPlannedSetsAll = plannedList.reduce((sum, p) => sum + p.target_sets, 0);
  const totalLoggedWorkingSetsAll = activeWorkout.sets.filter(s => (s.set_type || 'normal') !== 'warmup').length;
  const overallProgressPct = totalPlannedSetsAll > 0 ? Math.min(100, Math.round((totalLoggedWorkingSetsAll / totalPlannedSetsAll) * 100)) : 0;
  const isFullWorkoutComplete = plannedList.every(p => {
    const ws = (setsByExercise[p.name] || []).filter(s => (s.set_type || 'normal') !== 'warmup');
    return ws.length >= p.target_sets;
  });

  return (
    <div className="space-y-3 pb-2 select-none">
      {/* 1. Sleek Compact Header */}
      <div className="flex items-center justify-between py-1 px-0.5">
        <div className="flex items-center space-x-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 live-dot"></span>
          <h2 className="text-sm font-extrabold text-white tracking-tight truncate max-w-[150px] sm:max-w-xs">
            {activeWorkout.title}
          </h2>
        </div>

        <div className="flex items-center space-x-1.5">
          <span className="text-xs font-mono font-bold text-slate-300 bg-gym-900 border border-gym-800 px-2 py-1 rounded-xl">
            ⏱ {formatTime(workoutDuration)}
          </span>

          {onMinimize && (
            <button
              onClick={onMinimize}
              title="Свернуть тренировку"
              className="text-[11px] font-bold text-slate-400 hover:text-white bg-gym-800 px-2 py-1 rounded-xl border border-gym-700 active:scale-95 transition"
            >
              Свернуть
            </button>
          )}

          <button
            type="button"
            onClick={handleDiscardWorkout}
            title="Отменить и удалить эту тренировку"
            className="text-[11px] font-bold text-slate-400 hover:text-rose-400 bg-gym-800 hover:bg-rose-500/10 px-2 py-1 rounded-xl border border-gym-700 hover:border-rose-500/30 active:scale-95 transition"
          >
            Сбросить
          </button>

          <button
            onClick={handleFinishWorkout}
            className="text-[11px] font-bold text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 px-2.5 py-1 rounded-xl border border-emerald-500/30 active:scale-95 transition"
          >
            Завершить
          </button>
        </div>
      </div>

      {/* 2. Story-style Segmented Progress Bar */}
      <div className="space-y-1 px-0.5">
        <div className="flex space-x-1">
          {plannedList.map((p, idx) => {
            const ws = (setsByExercise[p.name] || []).filter(s => (s.set_type || 'normal') !== 'warmup');
            const complete = ws.length >= p.target_sets;
            const isCurrent = idx === currentPlanIndex;
            return (
              <button
                key={p.name}
                onClick={() => setCurrentPlanIndex(idx)}
                className={`flex-1 h-1.5 rounded-full transition-all duration-300 ${
                  complete
                    ? 'bg-emerald-400'
                    : isCurrent
                    ? 'bg-sky-400 ring-2 ring-sky-400/40'
                    : 'bg-gym-800'
                }`}
                title={`${idx + 1}. ${p.name}`}
              />
            );
          })}
        </div>

        <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
          <span>Упр {currentPlanIndex + 1} из {plannedList.length}</span>
          <span className="text-emerald-400 font-bold">
            {isCurrentExCompleted ? '✓ Упражнение выполнено' : (
              setType === 'warmup' ? '🔥 Разминочный сет (W)' : `Подход ${currentSetNum} из ${totalTargetSets}`
            )}
          </span>
        </div>
      </div>

      {/* 3. Rest Timer (Background-accurate, Adaptive badges, Presets & Extensions) */}
      {restActive && (
        <div className="bg-gym-950/95 border border-sky-500/40 rounded-3xl p-3.5 shadow-xl animate-in fade-in space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-400 to-blue-600 text-gym-950 flex flex-col items-center justify-center font-mono font-black shadow-lg shadow-sky-500/20">
                <span className="text-sm leading-none">{formatTime(restSecondsLeft)}</span>
                <span className="text-[8px] opacity-75 font-sans uppercase font-bold mt-0.5">отдых</span>
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center space-x-1.5 flex-wrap">
                  <span className="text-xs font-black text-white">Таймер отдыха</span>
                  {restBadge && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-sky-500/20 text-sky-300 border border-sky-500/30">
                      {restBadge}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-300 font-medium leading-tight">
                  {restReason || 'Дышите глубоко и восстанавливайте силы'}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-1.5">
              <button
                type="button"
                onClick={() => {
                  const next = !botPushEnabled;
                  setBotPushEnabled(next);
                  try { localStorage.setItem('gym_tracker_bot_push_enabled', String(next)); } catch (e) {}
                  triggerHaptic('light');
                  if (next) {
                    scheduleBotRestPush(restSecondsLeft, currentPlanEx?.name, currentWorkingCount + 1, currentPlanEx?.target_sets, weight, reps);
                  } else {
                    cancelBotRestPush();
                  }
                }}
                title={botPushEnabled ? 'Звуковой пуш Telegram включен (звонит даже при выключенном экране)' : 'Звуковой пуш Telegram выключен'}
                className={`px-2 py-1 rounded-xl flex items-center space-x-1 text-[10px] font-bold transition border ${
                  botPushEnabled 
                    ? 'bg-sky-500/20 border-sky-400/50 text-sky-200 shadow-sm' 
                    : 'bg-gym-900 border-gym-700 text-slate-500'
                }`}
              >
                <span>{botPushEnabled ? '📲 Звук в TG' : '🔕 Без TG'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const next = !soundEnabled;
                  setSoundEnabled(next);
                  if (next) playChimeSound();
                }}
                title={soundEnabled ? 'Звук в приложении включен' : 'Звук выключен'}
                className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs transition border ${
                  soundEnabled 
                    ? 'bg-sky-500/20 border-sky-500/40 text-sky-300' 
                    : 'bg-gym-900 border-gym-700 text-slate-500'
                }`}
              >
                {soundEnabled ? '🔔' : '🔕'}
              </button>

              <button
                onClick={cancelRestTimer}
                className="text-[11px] font-bold bg-gym-900 hover:bg-gym-800 text-slate-300 px-2.5 py-1.5 rounded-xl border border-gym-700 active:scale-95 transition"
              >
                Пропустить
              </button>
            </div>
          </div>

          {/* Visual Progress Bar */}
          <div className="w-full bg-gym-900 h-1.5 rounded-full overflow-hidden border border-gym-800">
            <div 
              className="bg-gradient-to-r from-sky-400 to-emerald-400 h-full transition-all duration-500 ease-linear rounded-full"
              style={{
                width: `${Math.min(100, Math.max(0, restPreset > 0 ? (restSecondsLeft / restPreset) * 100 : 0))}%`
              }}
            />
          </div>

          {/* Quick presets & Time adjustments */}
          <div className="flex items-center justify-between pt-1 border-t border-gym-800/80 text-[11px]">
            <div className="flex items-center space-x-1">
              {[45, 60, 90, 120, 150, 180].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setFixedRestTime(s)}
                  className={`px-1.5 py-0.5 rounded-lg font-mono text-[10px] font-bold border transition ${
                    Math.abs(restSecondsLeft - s) < 3
                      ? 'bg-sky-500 text-gym-950 border-sky-400 font-black'
                      : 'bg-gym-900 text-slate-400 border-gym-800 hover:text-white'
                  }`}
                >
                  {s >= 60 ? `${s / 60}м` : `${s}с`}
                </button>
              ))}
            </div>

            <div className="flex items-center space-x-1">
              <button
                type="button"
                onClick={() => adjustRestTime(-15)}
                className="bg-gym-900 hover:bg-gym-800 text-slate-300 border border-gym-800 px-2 py-0.5 rounded-lg font-mono text-[10px] font-bold active:scale-95 transition"
              >
                -15с
              </button>
              <button
                type="button"
                onClick={() => adjustRestTime(30)}
                className="bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/30 px-2 py-0.5 rounded-lg font-mono text-[10px] font-black active:scale-95 transition"
              >
                +30с
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. CURRENT EXERCISE CARD (Airy, Modern, Uncluttered) */}
      {currentPlanEx && (
        <div className="bg-gym-900 border border-gym-800 rounded-3xl p-4 shadow-xl space-y-3.5">
          {/* Header: Title + Actions */}
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1">
              <h3 className="text-lg font-black text-white leading-snug">
                {currentPlanEx.name}
              </h3>
              <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                <span className="text-xs font-mono font-bold text-emerald-400">
                  🎯 {currentPlanEx.recommended_weight} кг · {currentPlanEx.target_sets}×{currentPlanEx.target_reps}
                </span>
                {currentPlanEx.progression_badge && (
                  <span className={`text-[10px] font-black px-1.5 py-0.2 rounded uppercase ${
                    currentPlanEx.progression_status === 'INCREASE'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : currentPlanEx.progression_status === 'MAINTAIN'
                      ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                      : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  }`}>
                    {currentPlanEx.progression_badge}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center space-x-1.5 shrink-0 pt-0.5">
              <button
                type="button"
                onClick={() => setShowWarmupModal(true)}
                title="Разминочная лестница (пирамида подходов)"
                className="text-xs text-amber-400 hover:text-white bg-amber-500/15 hover:bg-amber-500/25 px-2.5 py-1.5 rounded-xl border border-amber-500/40 flex items-center space-x-1 font-bold active:scale-95 transition shadow-sm"
              >
                <span>🪜 Разминка</span>
              </button>

              <button
                type="button"
                onClick={() => setShowVideoModal(true)}
                className="text-xs text-sky-400 hover:text-white bg-sky-500/15 hover:bg-sky-500/25 px-2.5 py-1.5 rounded-xl border border-sky-500/40 flex items-center space-x-1 font-bold active:scale-95 transition shadow-sm"
              >
                <svg className="w-3.5 h-3.5 text-sky-400" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z"/>
                </svg>
                <span>Техника</span>
              </button>

              <button
                type="button"
                onClick={() => setShowSwapModal(true)}
                title="Заменить упражнение"
                className="w-8 h-8 rounded-xl bg-gym-800 hover:bg-gym-700 text-slate-300 hover:text-white flex items-center justify-center border border-gym-700 active:scale-95 transition text-xs"
              >
                🔄
              </button>
            </div>
          </div>

          {/* Coach Tip Toggle (Collapsible to keep UI airy) */}
          {(currentPlanEx.recommendation_note || currentPlanEx.last_sets_summary?.length > 0 || currentPlanEx.tip) && (
            <div>
              <button
                onClick={() => setShowCoachTip(prev => !prev)}
                className="text-[11px] text-slate-400 hover:text-slate-200 flex items-center space-x-1 transition active:scale-95"
              >
                <span>💡 Подсказка и прошлая тренировка</span>
                <span className="text-[9px]">{showCoachTip ? '▲' : '▼'}</span>
              </button>

              {showCoachTip && (
                <div className="mt-2 bg-gym-950/80 border border-gym-800 rounded-2xl p-3 text-xs space-y-1.5 animate-in fade-in">
                  {currentPlanEx.recommendation_note && (
                    <p className="text-emerald-300 font-medium leading-relaxed">
                      {currentPlanEx.recommendation_note}
                    </p>
                  )}
                  {currentPlanEx.last_sets_summary?.length > 0 && (
                    <p className="text-slate-400 text-[11px]">
                      Прошлая тренировка: <strong className="text-white font-mono">{currentPlanEx.last_sets_summary.join(', ')}</strong>
                    </p>
                  )}
                  {currentPlanEx.tip && (
                    <p className="text-slate-400 text-[11px] italic">
                      💡 {currentPlanEx.tip}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* IF COMPLETED */}
          {isCurrentExCompleted ? (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 text-center space-y-2.5">
              <p className="text-emerald-400 font-black text-sm">✓ Все {totalTargetSets} подхода выполнены!</p>
              {currentPlanIndex < plannedList.length - 1 ? (
                <button
                  onClick={() => setCurrentPlanIndex(prev => prev + 1)}
                  className="w-full py-3.5 bg-emerald-500 text-gym-950 font-black text-sm rounded-xl shadow-lg flex items-center justify-center space-x-1 active:scale-95 transition"
                >
                  <span>СЛЕДУЮЩЕЕ УПРАЖНЕНИЕ</span>
                  <Icons.Next />
                </button>
              ) : (
                <button
                  onClick={handleFinishWorkout}
                  className="w-full py-3.5 bg-emerald-500 text-gym-950 font-black text-sm rounded-xl shadow-lg active:scale-95 transition"
                >
                  🎉 ВСЯ ПРОГРАММА ВЫПОЛНЕНА! ЗАВЕРШИТЬ
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Set Type Pill Selector */}
              <div className="bg-gym-950/90 border border-gym-800 p-1 rounded-2xl flex items-center space-x-1">
                <button
                  type="button"
                  onClick={() => { setSetType('normal'); triggerHaptic('light'); }}
                  className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1 ${
                    setType === 'normal'
                      ? 'bg-emerald-500 text-gym-950 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <span>Рабочий</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSetType('warmup');
                    triggerHaptic('light');
                    setWeight(prev => Math.max(10, Math.round((prev * 0.5) / 2.5) * 2.5));
                  }}
                  className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1 ${
                    setType === 'warmup'
                      ? 'bg-amber-500 text-gym-950 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <span className="w-3.5 h-3.5 rounded bg-amber-500/20 text-amber-400 font-black text-[9px] flex items-center justify-center">W</span>
                  <span>Разминка</span>
                </button>

                <button
                  type="button"
                  onClick={() => { setSetType('drop'); triggerHaptic('light'); }}
                  className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1 ${
                    setType === 'drop'
                      ? 'bg-purple-500 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <span className="w-3.5 h-3.5 rounded bg-purple-500/20 text-purple-300 font-black text-[9px] flex items-center justify-center">D</span>
                  <span>Дропсет</span>
                </button>

                <button
                  type="button"
                  onClick={() => { setSetType('failure'); triggerHaptic('light'); }}
                  className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1 ${
                    setType === 'failure'
                      ? 'bg-rose-500 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <span className="w-3.5 h-3.5 rounded bg-rose-500/20 text-rose-300 font-black text-[9px] flex items-center justify-center">F</span>
                  <span>Отказ</span>
                </button>
              </div>

              {/* Dynamic Next Set Advice Card (AI Coach recommendations based on previous set) */}
              {nextSetAdvice && setType !== 'warmup' && (
                <div className="bg-gym-950/80 border border-gym-800 rounded-2xl p-3 shadow-md space-y-1.5 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-1.5">
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg border uppercase tracking-wider ${nextSetAdvice.badgeColor}`}>
                        {nextSetAdvice.badge}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        Подход {Math.min(currentPlanEx.target_sets, currentWorkingCount + 1)} из {currentPlanEx.target_sets}
                      </span>
                    </div>
                    {nextSetAdvice.canApply && weight !== nextSetAdvice.recWeight && (
                      <button
                        type="button"
                        onClick={() => {
                          setWeight(nextSetAdvice.recWeight);
                          setReps(nextSetAdvice.recReps);
                          triggerHaptic('medium');
                        }}
                        className="text-[10px] font-black bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 px-2.5 py-1 rounded-xl transition active:scale-95 flex items-center space-x-1 shadow-sm"
                      >
                        <span>Применить {nextSetAdvice.recWeight} кг</span>
                        <span>✓</span>
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed font-medium">
                    {nextSetAdvice.message}
                  </p>
                </div>
              )}

              {/* Steppers for Weight & Reps */}
              <div className="grid grid-cols-2 gap-2.5">
                {/* Weight Stepper */}
                <div className="bg-gym-950/90 border border-gym-800 rounded-2xl p-3 flex flex-col items-center justify-between">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Вес (кг)
                  </span>

                  <div className="flex items-center justify-between w-full my-1.5 px-0.5">
                    <button
                      onClick={() => { adjustWeight(-2.5); triggerHaptic('light'); }}
                      className="w-9 h-9 rounded-xl bg-gym-800 active:bg-gym-700 text-slate-200 font-bold text-xs flex items-center justify-center active:scale-90 transition"
                    >
                      -2.5
                    </button>

                    <input
                      type="text"
                      inputMode="decimal"
                      value={weight}
                      onFocus={(e) => e.target.select()}
                      onClick={(e) => e.target.select()}
                      onChange={(e) => setWeight(cleanNumericInput(e.target.value, true))}
                      className="w-16 text-center bg-transparent text-2xl font-black text-white focus:outline-none font-mono"
                    />

                    <button
                      onClick={() => { adjustWeight(+2.5); triggerHaptic('light'); }}
                      className="w-9 h-9 rounded-xl bg-emerald-500/20 active:bg-emerald-500/40 text-emerald-400 border border-emerald-500/40 font-bold text-xs flex items-center justify-center active:scale-90 transition"
                    >
                      +2.5
                    </button>
                  </div>

                  <div className="flex space-x-1.5 w-full justify-center">
                    <button onClick={() => { adjustWeight(-5); triggerHaptic('light'); }} className="text-[10px] font-mono text-slate-400 bg-gym-900 px-2 py-0.5 rounded-lg border border-gym-800 active:bg-gym-800">-5</button>
                    <button onClick={() => { adjustWeight(+5); triggerHaptic('light'); }} className="text-[10px] font-mono text-emerald-400/90 bg-gym-900 px-2 py-0.5 rounded-lg border border-gym-800 active:bg-gym-800">+5</button>
                  </div>
                </div>

                {/* Reps Stepper */}
                <div className="bg-gym-950/90 border border-gym-800 rounded-2xl p-3 flex flex-col items-center justify-between">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Повторения
                  </span>

                  <div className="flex items-center justify-between w-full my-1.5 px-0.5">
                    <button
                      onClick={() => { adjustReps(-1); triggerHaptic('light'); }}
                      className="w-9 h-9 rounded-xl bg-gym-800 active:bg-gym-700 text-slate-200 font-bold text-sm flex items-center justify-center active:scale-90 transition"
                    >
                      -1
                    </button>

                    <input
                      type="text"
                      inputMode="numeric"
                      value={reps}
                      onFocus={(e) => e.target.select()}
                      onClick={(e) => e.target.select()}
                      onChange={(e) => setReps(cleanNumericInput(e.target.value, false))}
                      className="w-16 text-center bg-transparent text-2xl font-black text-white focus:outline-none font-mono"
                    />

                    <button
                      onClick={() => { adjustReps(+1); triggerHaptic('light'); }}
                      className="w-9 h-9 rounded-xl bg-sky-500/20 active:bg-sky-500/40 text-sky-400 border border-sky-500/40 font-bold text-sm flex items-center justify-center active:scale-90 transition"
                    >
                      +1
                    </button>
                  </div>

                  <div className="flex space-x-1 w-full justify-center">
                    {[8, 10, 12].map(r => (
                      <button
                        key={r}
                        onClick={() => { setReps(r); triggerHaptic('light'); }}
                        className={`text-[10px] font-mono px-2 py-0.5 rounded-lg border transition ${
                          reps === r
                            ? 'bg-sky-500 text-gym-950 font-black border-sky-400'
                            : 'bg-gym-900 text-slate-400 border-gym-800 active:bg-gym-800'
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Big Record Set Button */}
              <button
                onClick={() => {
                  triggerHaptic('success');
                  handleAddSet();
                }}
                disabled={isSubmitting}
                className={`w-full py-4 font-black text-sm rounded-2xl shadow-lg active:scale-[0.98] transition flex items-center justify-center space-x-2 disabled:opacity-50 ${
                  setType === 'warmup'
                    ? 'bg-gradient-to-r from-amber-400 to-amber-500 text-gym-950 shadow-amber-500/25'
                    : setType === 'drop'
                    ? 'bg-gradient-to-r from-purple-500 to-indigo-500 text-white shadow-purple-500/25'
                    : setType === 'failure'
                    ? 'bg-gradient-to-r from-rose-500 to-red-600 text-white shadow-rose-500/25'
                    : 'bg-gradient-to-r from-emerald-500 to-emerald-400 text-gym-950 shadow-emerald-500/25'
                }`}
              >
                {isSubmitting ? (
                  <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <>
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    <span>
                      {setType === 'warmup' && `ЗАПИСАТЬ РАЗМИНКУ (W) (${weight} кг × ${reps})`}
                      {setType === 'drop' && `ЗАПИСАТЬ ДРОПСЕТ (D) (${weight} кг × ${reps})`}
                      {setType === 'failure' && `ЗАПИСАТЬ ДО ОТКАЗА (F) (${weight} кг × ${reps})`}
                      {setType === 'normal' && `ЗАПИСАТЬ ПОДХОД ${currentSetNum} ИЗ ${totalTargetSets} (${weight} кг × ${reps})`}
                    </span>
                  </>
                )}
              </button>
            </>
          )}

          {/* Completed Sets Summary for CURRENT Exercise */}
          {(setsByExercise[currentPlanEx.name] || []).length > 0 && (
            <div className="pt-2 border-t border-gym-800/80">
              <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1.5">
                <span className="font-bold text-slate-300">Выполнено:</span>
                <span className="text-[10px] text-slate-500 font-mono">нажмите для ред. ✏️</span>
              </div>
              <div className="flex items-center space-x-1.5 text-[11px] text-slate-400 flex-wrap gap-y-1">
                {(setsByExercise[currentPlanEx.name] || []).map((s, idx) => {
                  const st = s.set_type || 'normal';
                  if (st === 'warmup') {
                    return (
                      <button
                        key={s.id || idx}
                        type="button"
                        onClick={() => { triggerHaptic('light'); setEditingSet(s); }}
                        className="bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 font-mono font-bold text-[10px] px-2 py-0.5 rounded-lg flex items-center space-x-1 active:scale-95 transition cursor-pointer"
                        title="Нажмите, чтобы изменить или удалить"
                      >
                        <span className="text-[9px] bg-amber-500 text-gym-950 font-black px-1 rounded">W</span>
                        <span>{s.weight} кг × {s.reps}</span>
                        <span className="text-[8px] text-amber-400/80">✏️</span>
                      </button>
                    );
                  }
                  if (st === 'drop') {
                    return (
                      <button
                        key={s.id || idx}
                        type="button"
                        onClick={() => { triggerHaptic('light'); setEditingSet(s); }}
                        className="bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/40 text-purple-300 font-mono font-bold text-[10px] px-2 py-0.5 rounded-lg flex items-center space-x-1 active:scale-95 transition cursor-pointer"
                        title="Нажмите, чтобы изменить или удалить"
                      >
                        <span className="text-[9px] bg-purple-500 text-white font-black px-1 rounded">D</span>
                        <span>{s.weight} кг × {s.reps}</span>
                        <span className="text-[8px] text-purple-400/80">✏️</span>
                      </button>
                    );
                  }
                  if (st === 'failure') {
                    return (
                      <button
                        key={s.id || idx}
                        type="button"
                        onClick={() => { triggerHaptic('light'); setEditingSet(s); }}
                        className="bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-300 font-mono font-bold text-[10px] px-2 py-0.5 rounded-lg flex items-center space-x-1 active:scale-95 transition cursor-pointer"
                        title="Нажмите, чтобы изменить или удалить"
                      >
                        <span className="text-[9px] bg-rose-500 text-white font-black px-1 rounded">F</span>
                        <span>{s.weight} кг × {s.reps}</span>
                        <span className="text-[8px] text-rose-400/80">✏️</span>
                      </button>
                    );
                  }
                  return (
                    <button
                      key={s.id || idx}
                      type="button"
                      onClick={() => { triggerHaptic('light'); setEditingSet(s); }}
                      className="bg-gym-950 hover:bg-gym-800 border border-gym-800 hover:border-emerald-500/50 px-2 py-0.5 rounded-lg text-emerald-400 font-mono font-bold text-[10px] flex items-center space-x-1 active:scale-95 transition cursor-pointer"
                      title="Нажмите, чтобы изменить или удалить"
                    >
                      <span>#{s.set_number || idx + 1}: {s.weight} кг × {s.reps}</span>
                      <span className="text-[8px] text-slate-500">✏️</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quick Skip link if gym equipment is taken */}
          {currentPlanIndex < plannedList.length - 1 && !isCurrentExCompleted && (
            <div className="text-center pt-0.5">
              <button
                onClick={() => setCurrentPlanIndex(prev => prev + 1)}
                className="text-[11px] text-slate-500 hover:text-slate-300 transition"
              >
                Тренажер занят? Пропустить ⏭
              </button>
            </div>
          )}
        </div>
      )}

      {/* Collapsed Accordion for All Done Sets of Today's Workout */}
      {activeWorkout.sets.length > 0 && (
        <div className="pt-1">
          <button
            onClick={() => setShowAllHistory(prev => !prev)}
            className="w-full text-center text-xs text-slate-400 hover:text-slate-200 py-2 bg-gym-900/60 rounded-xl border border-gym-800/60 flex items-center justify-center space-x-1.5 transition"
          >
            <span>📋 История всех подходов за тренировку ({activeWorkout.sets.length})</span>
            <span className="text-[10px]">{showAllHistory ? '▲ скрыть' : '▼ показать'}</span>
          </button>

          {showAllHistory && (
            <div className="mt-2 space-y-2 animate-in fade-in">
              {Object.keys(setsByExercise).map((exName) => (
                <div key={exName} className="bg-gym-900 border border-gym-800 rounded-2xl p-3 space-y-1">
                  <div className="flex items-center justify-between border-b border-gym-800/80 pb-1">
                    <span className="font-bold text-xs text-white">{exName}</span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {setsByExercise[exName].length} подх.
                    </span>
                  </div>
                  <div className="space-y-1 pt-1">
                    {setsByExercise[exName].map((s) => {
                      const st = s.set_type || 'normal';
                      return (
                        <div
                          key={s.id}
                          onClick={() => { triggerHaptic('light'); setEditingSet(s); }}
                          className="flex items-center justify-between text-xs font-mono py-1.5 px-2.5 rounded-xl bg-gym-950/70 hover:bg-gym-800/80 border border-transparent hover:border-gym-700 cursor-pointer active:scale-98 transition group"
                          title="Нажмите, чтобы изменить или удалить подход"
                        >
                          <div className="flex items-center space-x-1.5">
                            {st === 'warmup' && (
                              <span className="text-[9px] font-black bg-amber-500 text-gym-950 px-1 py-0.2 rounded">W</span>
                            )}
                            {st === 'drop' && (
                              <span className="text-[9px] font-black bg-purple-500 text-white px-1 py-0.2 rounded">D</span>
                            )}
                            {st === 'failure' && (
                              <span className="text-[9px] font-black bg-rose-500 text-white px-1 py-0.2 rounded">F</span>
                            )}
                            <span className="text-slate-400">Сет {s.set_number}</span>
                          </div>
                          <span className="text-white font-bold">{s.weight} кг × {s.reps}</span>
                          <div className="flex items-center space-x-2">
                            <span className="text-[10px] text-emerald-400">
                              {st !== 'warmup' ? `1ПМ: ${Math.round(s.weight * (1 + s.reps / 30) * 10) / 10} кг` : 'разминка'}
                            </span>
                            <span className="text-[11px] text-slate-500 group-hover:text-emerald-400 transition">✏️</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Swap Exercise Modal */}
      <SwapExerciseModal
        isOpen={showSwapModal}
        onClose={() => setShowSwapModal(false)}
        currentEx={currentPlanEx}
        exercises={exercises}
        onSwap={handleSwapExercise}
      />

      {/* Exercise Video & Technique Modal */}
      <ExerciseVideoModal
        isOpen={showVideoModal}
        onClose={() => setShowVideoModal(false)}
        exerciseName={currentPlanEx?.name}
        guide={exerciseGuides[currentPlanEx?.name]}
      />

      {/* Warmup Ladder Modal (Smart Pyramid) */}
      <WarmupLadderModal
        isOpen={showWarmupModal}
        onClose={() => setShowWarmupModal(false)}
        exerciseName={currentPlanEx?.name}
        targetWeight={currentPlanEx?.recommended_weight || weight}
        onSelectStep={(stepWeight, stepReps, stepType) => {
          setWeight(stepWeight);
          setReps(stepReps);
          setSetType(stepType);
        }}
      />

      {/* Edit Set Modal */}
      {editingSet && (
        <EditSetModal
          set={editingSet}
          onClose={() => setEditingSet(null)}
          onSave={handleSaveEditedSet}
          onDelete={handleDeleteEditedSet}
        />
      )}
    </div>
  );
}

// ==========================================
// 📊 ANALYTICS SCREEN WITH STYLISH PICKER
// ==========================================
function AnalyticsScreen({ exercises }) {
  const [selectedExId, setSelectedExId] = useState(exercises[0]?.id || '');
  const [showPickerModal, setShowPickerModal] = useState(false);
  const [metric, setMetric] = useState('max_weight');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const chartCanvasRef = useRef(null);
  const chartInstanceRef = useRef(null);

  useEffect(() => {
    if (!selectedExId && exercises.length > 0) {
      setSelectedExId(exercises[0].id);
    }
  }, [exercises]);

  useEffect(() => {
    if (!selectedExId) return;
    loadAnalytics(selectedExId);
  }, [selectedExId]);

  const loadAnalytics = async (exId) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/analytics/${exId}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!data || !chartCanvasRef.current) return;
    const ctx = chartCanvasRef.current.getContext('2d');

    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy();
    }

    const labels = data.history.map(item => formatDate(item.date));
    let values = [];
    let metricLabel = 'Рабочий вес (кг)';

    if (metric === 'max_weight') {
      values = data.history.map(i => i.max_weight);
      metricLabel = 'Макс. рабочий вес (кг)';
    } else if (metric === 'estimated_1rm') {
      values = data.history.map(i => i.estimated_1rm);
      metricLabel = 'Расчетный 1ПМ (кг)';
    } else if (metric === 'total_volume') {
      values = data.history.map(i => i.total_volume);
      metricLabel = 'Общий тоннаж (кг)';
    }

    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, 'rgba(16, 185, 129, 0.35)');
    gradient.addColorStop(1, 'rgba(16, 185, 129, 0.0)');

    chartInstanceRef.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: metricLabel,
            data: values,
            borderColor: '#10b981',
            backgroundColor: gradient,
            borderWidth: 3,
            fill: true,
            tension: 0.35,
            pointBackgroundColor: '#10b981',
            pointBorderColor: '#0c121d',
            pointBorderWidth: 2,
            pointRadius: 5,
            pointHoverRadius: 7,
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#0c121d',
            titleColor: '#f8fafc',
            bodyColor: '#34d399',
            borderColor: '#1e293b',
            borderWidth: 1,
            padding: 10,
            displayColors: false,
            callbacks: {
              label: (ctx) => `${ctx.parsed.y} кг`
            }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: { color: '#94a3b8', font: { size: 10 } }
          },
          y: {
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: { color: '#94a3b8', font: { size: 10 } },
            beginAtZero: false
          }
        }
      }
    });

    return () => {
      if (chartInstanceRef.current) chartInstanceRef.current.destroy();
    };
  }, [data, metric]);

  const selectedExObj = exercises.find(e => e.id == selectedExId);

  return (
    <div className="space-y-4">
      {/* Exercise Picker Trigger Card */}
      <div className="bg-gym-900 border border-gym-800 rounded-3xl p-4 shadow">
        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
          Выберите упражнение для анализа
        </label>
        <div
          onClick={() => setShowPickerModal(true)}
          className="w-full bg-gym-950 border border-gym-700 hover:border-emerald-500/60 rounded-2xl px-4 py-3 flex items-center justify-between cursor-pointer transition active:scale-98"
        >
          <div className="space-y-0.5 truncate pr-2">
            <span className="font-extrabold text-sm text-white block truncate">
              {selectedExObj?.name || 'Выберите упражнение'}
            </span>
            <span className={`inline-block text-[10px] font-bold px-2 py-0.2 rounded border ${categoryColors[selectedExObj?.category] || categoryColors['Базовые']}`}>
              {selectedExObj?.category || 'Базовые'}
            </span>
          </div>
          <div className="text-slate-400 flex items-center space-x-1">
            <span className="text-xs text-emerald-400 font-bold">Выбрать</span>
            <Icons.ChevronDown />
          </div>
        </div>

        {/* Metric Selector Pills */}
        <div className="grid grid-cols-3 gap-1.5 mt-3">
          <button
            onClick={() => setMetric('max_weight')}
            className={`py-2 px-1 text-center rounded-xl text-xs font-bold transition ${
              metric === 'max_weight' ? 'bg-emerald-500 text-gym-950 shadow-sm' : 'bg-gym-950 text-slate-400 hover:text-white'
            }`}
          >
            Рабочий вес
          </button>
          <button
            onClick={() => setMetric('estimated_1rm')}
            className={`py-2 px-1 text-center rounded-xl text-xs font-bold transition ${
              metric === 'estimated_1rm' ? 'bg-emerald-500 text-gym-950 shadow-sm' : 'bg-gym-950 text-slate-400 hover:text-white'
            }`}
          >
            1ПМ (Макс)
          </button>
          <button
            onClick={() => setMetric('total_volume')}
            className={`py-2 px-1 text-center rounded-xl text-xs font-bold transition ${
              metric === 'total_volume' ? 'bg-emerald-500 text-gym-950 shadow-sm' : 'bg-gym-950 text-slate-400 hover:text-white'
            }`}
          >
            Тоннаж
          </button>
        </div>
      </div>

      {/* Chart Canvas Card */}
      <div className="bg-gym-900 border border-gym-800 rounded-3xl p-4 shadow-xl">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <Icons.TrendingUp />
            <h3 className="font-extrabold text-sm text-white truncate max-w-[200px]">{selectedExObj?.name}</h3>
          </div>
          <span className="text-[10px] text-slate-400 bg-gym-800 px-2 py-0.5 rounded-full font-mono">
            {data?.history?.length || 0} тренировок
          </span>
        </div>

        <div className="h-56 w-full relative">
          {loading && (
            <div className="absolute inset-0 bg-gym-900/80 flex items-center justify-center z-10">
              <span className="text-xs text-slate-400">Обновление графика...</span>
            </div>
          )}

          {data?.history?.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-4">
              <p className="text-xs text-slate-400">Пока нет записей для этого упражнения.</p>
              <p className="text-[11px] text-slate-500 mt-1">Запишите подходы в тренировке.</p>
            </div>
          ) : (
            <canvas ref={chartCanvasRef}></canvas>
          )}
        </div>
      </div>

      {/* Records Cards */}
      {data && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gym-900 border border-gym-800 rounded-2xl p-3.5 flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
              <Icons.Trophy />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Рекорд веса</p>
              <p className="text-lg font-black text-amber-400 font-mono">{data.personal_record_weight} кг</p>
            </div>
          </div>

          <div className="bg-gym-900 border border-gym-800 rounded-2xl p-3.5 flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 text-emerald-400">
              <Icons.Dumbbell />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Лучший тоннаж</p>
              <p className="text-lg font-black text-emerald-400 font-mono">{data.personal_record_volume} кг</p>
            </div>
          </div>
        </div>
      )}

      {/* Modal Picker */}
      <ExercisePickerModal 
        isOpen={showPickerModal} 
        onClose={() => setShowPickerModal(false)} 
        exercises={exercises} 
        selectedId={selectedExId} 
        onSelect={(id) => setSelectedExId(id)} 
      />
    </div>
  );
}

// ==========================================
// ✏️ MODAL FOR EDITING / DELETING A LOGGED SET
// ==========================================
function EditSetModal({ set, onClose, onSave, onDelete }) {
  if (!set) return null;

  const [weight, setWeight] = useState(set.weight !== undefined ? String(set.weight) : '20');
  const [reps, setReps] = useState(set.reps !== undefined ? String(set.reps) : '10');
  const [setType, setSetType] = useState(set.set_type || 'normal');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const adjustWeight = (delta) => {
    triggerHaptic('light');
    setWeight(prev => String(Math.max(0, Math.round(((parseFloat(prev) || 0) + delta) * 10) / 10)));
  };

  const adjustReps = (delta) => {
    triggerHaptic('light');
    setReps(prev => String(Math.max(1, (parseInt(prev, 10) || 1) + delta)));
  };

  const handleSave = async (e) => {
    if (e) e.preventDefault();
    setIsSaving(true);
    try {
      await onSave({
        weight: parseFloat(weight) || 0,
        reps: parseInt(reps, 10) || 1,
        set_type: setType,
        set_number: set.set_number
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await onDelete(set.id);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3.5 overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-gym-900 border border-gym-800 rounded-3xl p-5 max-w-sm w-full space-y-4 shadow-2xl animate-in zoom-in-95 my-auto">
        {/* Header */}
        <div className="flex items-start justify-between pb-2 border-b border-gym-800/80">
          <div>
            <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest block">
              Редактирование подхода
            </span>
            <h3 className="text-base font-black text-white leading-tight mt-0.5">
              {set.exercise_name || 'Упражнение'}
            </h3>
            <span className="text-xs text-slate-400 font-mono mt-0.5 block">
              Подход #{set.set_number || 1}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gym-800 hover:bg-gym-700 text-slate-400 hover:text-white flex items-center justify-center text-sm active:scale-95 transition"
          >
            ✕
          </button>
        </div>

        {/* Set Type Pills */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">
            Тип подхода
          </label>
          <div className="grid grid-cols-4 gap-1.5">
            {[
              { id: 'normal', label: 'Обычный', badge: '⚪' },
              { id: 'warmup', label: 'Разминка', badge: '🟡' },
              { id: 'drop', label: 'Дроп-сет', badge: '🟣' },
              { id: 'failure', label: 'Отказ', badge: '🔴' }
            ].map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => { triggerHaptic('light'); setSetType(t.id); }}
                className={`py-2 px-1 rounded-xl border text-[11px] font-bold flex flex-col items-center justify-center space-y-0.5 transition active:scale-95 ${
                  setType === t.id
                    ? t.id === 'warmup'
                      ? 'bg-amber-500/20 border-amber-400 text-amber-300 ring-1 ring-amber-400'
                      : t.id === 'drop'
                      ? 'bg-purple-500/20 border-purple-400 text-purple-300 ring-1 ring-purple-400'
                      : t.id === 'failure'
                      ? 'bg-rose-500/20 border-rose-400 text-rose-300 ring-1 ring-rose-400'
                      : 'bg-emerald-500/20 border-emerald-400 text-emerald-300 ring-1 ring-emerald-400'
                    : 'bg-gym-950/80 border-gym-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>{t.badge}</span>
                <span className="text-[10px] leading-tight text-center">{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Steppers for Weight & Reps */}
        <div className="grid grid-cols-2 gap-2.5">
          {/* Weight */}
          <div className="bg-gym-950/90 border border-gym-800 rounded-2xl p-3 flex flex-col items-center justify-between">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Вес (кг)
            </span>
            <div className="flex items-center justify-between w-full my-2 px-0.5">
              <button
                type="button"
                onClick={() => adjustWeight(-2.5)}
                className="w-8 h-8 rounded-xl bg-gym-800 active:bg-gym-700 text-slate-200 font-bold text-xs flex items-center justify-center active:scale-90 transition"
              >
                -2.5
              </button>
              <input
                type="text"
                inputMode="decimal"
                value={weight}
                onFocus={(e) => e.target.select()}
                onClick={(e) => e.target.select()}
                onChange={(e) => setWeight(cleanNumericInput(e.target.value, true))}
                className="w-16 text-center bg-transparent text-2xl font-black text-white focus:outline-none font-mono"
              />
              <button
                type="button"
                onClick={() => adjustWeight(+2.5)}
                className="w-8 h-8 rounded-xl bg-emerald-500/20 active:bg-emerald-500/40 text-emerald-400 border border-emerald-500/40 font-bold text-xs flex items-center justify-center active:scale-90 transition"
              >
                +2.5
              </button>
            </div>
            <div className="flex space-x-1.5 w-full justify-center">
              <button type="button" onClick={() => adjustWeight(-5)} className="text-[10px] font-mono text-slate-400 bg-gym-900 px-2 py-0.5 rounded-lg border border-gym-800 active:bg-gym-800">-5</button>
              <button type="button" onClick={() => adjustWeight(+5)} className="text-[10px] font-mono text-emerald-400/90 bg-gym-900 px-2 py-0.5 rounded-lg border border-gym-800 active:bg-gym-800">+5</button>
            </div>
          </div>

          {/* Reps */}
          <div className="bg-gym-950/90 border border-gym-800 rounded-2xl p-3 flex flex-col items-center justify-between">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Повторения
            </span>
            <div className="flex items-center justify-between w-full my-2 px-0.5">
              <button
                type="button"
                onClick={() => adjustReps(-1)}
                className="w-8 h-8 rounded-xl bg-gym-800 active:bg-gym-700 text-slate-200 font-bold text-sm flex items-center justify-center active:scale-90 transition"
              >
                -1
              </button>
              <input
                type="text"
                inputMode="numeric"
                value={reps}
                onFocus={(e) => e.target.select()}
                onClick={(e) => e.target.select()}
                onChange={(e) => setReps(cleanNumericInput(e.target.value, false))}
                className="w-16 text-center bg-transparent text-2xl font-black text-white focus:outline-none font-mono"
              />
              <button
                type="button"
                onClick={() => adjustReps(+1)}
                className="w-8 h-8 rounded-xl bg-sky-500/20 active:bg-sky-500/40 text-sky-400 border border-sky-500/40 font-bold text-sm flex items-center justify-center active:scale-90 transition"
              >
                +1
              </button>
            </div>
            <div className="flex space-x-1 w-full justify-center">
              {[8, 10, 12].map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => { triggerHaptic('light'); setReps(String(r)); }}
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-lg border ${parseInt(reps, 10) === r ? 'bg-sky-500 text-gym-950 font-bold border-sky-400' : 'bg-gym-900 text-slate-400 border-gym-800 active:bg-gym-800'}`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex space-x-2 pt-2 border-t border-gym-800/80">
          <button
            type="button"
            disabled={isDeleting || isSaving}
            onClick={handleDelete}
            className="px-3.5 py-3 rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 font-bold text-xs flex items-center justify-center space-x-1.5 active:scale-95 transition"
          >
            <span>🗑️</span>
            <span>{isDeleting ? 'Удаление...' : 'Удалить'}</span>
          </button>
          
          <button
            type="button"
            disabled={isSaving || isDeleting}
            onClick={handleSave}
            className="flex-1 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-gym-950 font-black text-xs uppercase tracking-wider flex items-center justify-center space-x-1.5 shadow-lg shadow-emerald-500/20 active:scale-95 transition"
          >
            <span>✓</span>
            <span>{isSaving ? 'Сохранение...' : 'Сохранить изменения'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 📱 MODAL FOR PWA INSTALL & TELEGRAM ACCOUNT SWITCH
// ==========================================
function AccountModal({ isOpen, onClose, userProfile, onUserChanged }) {
  if (!isOpen) return null;

  const currentUser = getTelegramUser();
  const [tgInput, setTgInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [activeGuideTab, setActiveGuideTab] = useState('ios'); // 'ios' | 'android'
  const [canInstallPwa, setCanInstallPwa] = useState(Boolean(deferredPwaInstallPrompt));
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    const handlePwaReady = () => setCanInstallPwa(Boolean(deferredPwaInstallPrompt));
    window.addEventListener('gym-pwa-install-ready', handlePwaReady);
    return () => window.removeEventListener('gym-pwa-install-ready', handlePwaReady);
  }, []);

  const cleanTgId = currentUser.id.startsWith('tg_') 
    ? currentUser.id.replace('tg_', '') 
    : (currentUser.id.startsWith('u_') ? '' : currentUser.id);

  const personalUrl = window.location.origin + (cleanTgId ? ('/?tg_id=' + cleanTgId) : '');

  const handleCopyLink = () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(personalUrl);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = personalUrl;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      triggerHaptic('success');
      setTimeout(() => setCopied(false), 3000);
    } catch (e) {
      prompt('Скопируйте вашу персональную ссылку:', personalUrl);
    }
  };

  const handleLogin = (idToUse) => {
    const val = (idToUse || tgInput).trim();
    if (!val) {
      alert('Пожалуйста, введите ваш Telegram ID (цифры)');
      return;
    }
    const clean = val.replace(/\D/g, '');
    if (!clean) {
      alert('Telegram ID должен содержать цифры');
      return;
    }
    triggerHaptic('success');
    const fullId = 'tg_' + clean;
    try {
      localStorage.setItem('gym_tracker_tg_id', fullId);
      localStorage.setItem('gym_tracker_user_id', fullId);
    } catch (e) {}
    window.location.href = window.location.origin + window.location.pathname + '?tg_id=' + clean;
  };

  const handleInstallClick = async () => {
    if (!deferredPwaInstallPrompt) {
      alert('Для установки на iPhone используйте меню «Поделиться» ⎋ -> «На экран «Домой»» в Safari.');
      return;
    }
    setInstalling(true);
    try {
      deferredPwaInstallPrompt.prompt();
      const choiceResult = await deferredPwaInstallPrompt.userChoice;
      if (choiceResult && choiceResult.outcome === 'accepted') {
        triggerHaptic('success');
      }
      deferredPwaInstallPrompt = null;
      setCanInstallPwa(false);
    } catch (e) {
      console.warn('PWA prompt error:', e);
    } finally {
      setInstalling(false);
    }
  };

  const isStandalone = isStandalonePWA();
  const isTg = isInsideTelegram();

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200 safe-top safe-bottom">
      <div className="bg-gym-900 border border-gym-800 w-full max-w-lg rounded-t-3xl sm:rounded-3xl p-5 space-y-4 max-h-[90vh] overflow-y-auto shadow-2xl safe-bottom">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gym-800 pb-3">
          <div className="flex items-center space-x-2.5">
            <img 
              src="/static/app-icon.png" 
              alt="GymTracker" 
              className="w-10 h-10 rounded-2xl shadow-lg border border-gym-700/80 object-cover shrink-0" 
            />
            <div>
              <h3 className="text-base font-black text-white leading-tight">
                Веб-приложение (PWA) и Аккаунт
              </h3>
              <p className="text-[11px] text-slate-400">
                Запуск в Safari, Chrome и на экране телефона
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gym-800 hover:bg-gym-700 text-slate-400 hover:text-white flex items-center justify-center text-sm active:scale-95 transition"
          >
            ✕
          </button>
        </div>

        {/* Current status pill */}
        <div className="bg-gym-950 border border-gym-800 rounded-2xl p-3 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-lg">
              {isStandalone ? '🚀' : isTg ? '✈️' : '🌐'}
            </span>
            <div>
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Текущий режим</span>
              <span className="text-xs font-black text-white">
                {isStandalone ? 'Автономное PWA (Экран Домой)' : isTg ? 'Telegram Mini App' : 'Веб-браузер'}
              </span>
            </div>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Аккаунт</span>
            <span className="text-xs font-mono font-bold text-emerald-400">
              {currentUser.id}
            </span>
          </div>
        </div>

        {/* 1. Personal Direct Link */}
        <div className="bg-gym-950/80 border border-gym-800 rounded-2xl p-3.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black text-sky-400 uppercase tracking-wider">
              🔗 Ваша персональная ссылка
            </span>
            <span className="text-[10px] text-slate-500 font-mono">1 клик для входа</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Откройте эту ссылку в <strong>Safari</strong> или <strong>Chrome</strong> на телефоне, чтобы сразу подгрузились все ваши тренировки и история:
          </p>
          <div className="bg-gym-900 border border-gym-800 rounded-xl p-2.5 flex items-center justify-between gap-2">
            <span className="text-xs font-mono text-slate-300 truncate select-all">
              {personalUrl}
            </span>
            <button
              type="button"
              onClick={handleCopyLink}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition shrink-0 active:scale-95 ${
                copied 
                  ? 'bg-emerald-500 text-gym-950 font-black' 
                  : 'bg-sky-500/20 text-sky-300 border border-sky-500/40 hover:bg-sky-500/30'
              }`}
            >
              {copied ? '✓ Скопировано' : '📋 Скопировать'}
            </button>
          </div>
        </div>

        {/* 2. One-click install button if Chrome prompt is available */}
        {canInstallPwa && (
          <button
            type="button"
            disabled={installing}
            onClick={handleInstallClick}
            className="w-full py-3.5 bg-gradient-to-r from-sky-500 to-emerald-500 text-gym-950 font-black text-sm rounded-2xl shadow-lg active:scale-95 transition flex items-center justify-center space-x-2"
          >
            <span>⚡</span>
            <span>{installing ? 'Установка...' : 'УСТАНОВИТЬ НА ЭКРАН ТЕЛЕФОНА (1 КЛИК)'}</span>
          </button>
        )}

        {/* 3. Visual Step-by-Step Install Guide */}
        <div className="bg-gym-950/80 border border-gym-800 rounded-2xl p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black text-emerald-400 uppercase tracking-wider">
              📲 Как добавить на экран телефона
            </span>
            <div className="flex bg-gym-900 rounded-xl p-0.5 border border-gym-800">
              <button
                type="button"
                onClick={() => setActiveGuideTab('ios')}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition ${
                  activeGuideTab === 'ios' ? 'bg-gym-800 text-white shadow-sm' : 'text-slate-400'
                }`}
              >
                🍏 iPhone
              </button>
              <button
                type="button"
                onClick={() => setActiveGuideTab('android')}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition ${
                  activeGuideTab === 'android' ? 'bg-gym-800 text-white shadow-sm' : 'text-slate-400'
                }`}
              >
                🤖 Android
              </button>
            </div>
          </div>

          {activeGuideTab === 'ios' ? (
            <div className="space-y-2 text-xs text-slate-300">
              <div className="flex items-start space-x-2.5 bg-gym-900/60 p-2.5 rounded-xl border border-gym-800/60">
                <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center font-bold text-[11px] shrink-0">1</span>
                <div>
                  <p className="font-bold text-white">Откройте персональную ссылку в Safari</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">В штатном браузере Safari на iPhone (не внутри Telegram).</p>
                </div>
              </div>

              <div className="flex items-start space-x-2.5 bg-gym-900/60 p-2.5 rounded-xl border border-gym-800/60">
                <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center font-bold text-[11px] shrink-0">2</span>
                <div>
                  <p className="font-bold text-white">Нажмите кнопку «Поделиться» ⎋</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Квадратная иконка со стрелочкой вверх по центру нижней панели Safari.</p>
                </div>
              </div>

              <div className="flex items-start space-x-2.5 bg-gym-900/60 p-2.5 rounded-xl border border-gym-800/60">
                <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center font-bold text-[11px] shrink-0">3</span>
                <div>
                  <p className="font-bold text-white">Выберите пункт «На экран «Домой»» ➕</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Прокрутите список действий вниз и нажмите «На экран «Домой»», затем вверху справа нажмите «Добавить».</p>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-300">
                ✨ <strong>Готово!</strong> Приложение появится на рабочем столе с фирменной иконкой. Оно открывается на весь экран без адресной строки и кэширует тренировки автономно.
              </div>
            </div>
          ) : (
            <div className="space-y-2 text-xs text-slate-300">
              <div className="flex items-start space-x-2.5 bg-gym-900/60 p-2.5 rounded-xl border border-gym-800/60">
                <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-[11px] shrink-0">1</span>
                <div>
                  <p className="font-bold text-white">Откройте персональную ссылку в Google Chrome</p>
                </div>
              </div>

              <div className="flex items-start space-x-2.5 bg-gym-900/60 p-2.5 rounded-xl border border-gym-800/60">
                <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-[11px] shrink-0">2</span>
                <div>
                  <p className="font-bold text-white">Нажмите на три точки ⋮ в правом верхнем углу</p>
                </div>
              </div>

              <div className="flex items-start space-x-2.5 bg-gym-900/60 p-2.5 rounded-xl border border-gym-800/60">
                <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-[11px] shrink-0">3</span>
                <div>
                  <p className="font-bold text-white">Выберите «Установить приложение» или «Добавить на главный экран»</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 4. Switch / Connect Telegram ID */}
        <div className="bg-gym-950/80 border border-gym-800 rounded-2xl p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black text-amber-400 uppercase tracking-wider">
              🔑 Вход по Telegram ID
            </span>
            <span className="text-[10px] text-slate-500">Синхронизация истории</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Если вы открыли приложение на новом устройстве или в гостевом режиме, введите свой Telegram ID, чтобы мгновенно загрузить все сохраненные тренировки:
          </p>

          <div className="flex space-x-2">
            <input
              type="text"
              inputMode="numeric"
              placeholder="Например: 123456789"
              value={tgInput}
              onChange={(e) => setTgInput(cleanNumericInput(e.target.value, false))}
              className="flex-1 bg-gym-900 border border-gym-800 rounded-xl px-3 py-2 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
            />
            <button
              type="button"
              onClick={() => handleLogin()}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-gym-950 font-black text-xs rounded-xl shadow-md active:scale-95 transition shrink-0"
            >
              Войти
            </button>
          </div>

          {/* Hint: How to find Telegram ID */}
          <div className="bg-gym-900/60 border border-gym-800/80 rounded-xl p-3 text-[11px] space-y-1.5 text-slate-400 leading-relaxed">
            <div className="flex items-center space-x-1.5 text-amber-400 font-bold">
              <span>💡</span>
              <span>Как узнать свой Telegram ID:</span>
            </div>
            <p>
              1. Откройте в Telegram бота <a href="https://t.me/userinfobot" target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline font-mono font-bold">@userinfobot</a> или <a href="https://t.me/getmyid_bot" target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline font-mono font-bold">@getmyid_bot</a>.
            </p>
            <p>
              2. Отправьте команду <strong className="text-white">/start</strong> — бот сразу напишет ваш числовой <strong className="text-emerald-400 font-mono">Id</strong> (набор цифр).
            </p>
            <p>
              3. Вставьте это число в поле выше и нажмите <strong>«Войти»</strong>, чтобы мгновенно подгрузить ваши тренировки.
            </p>
          </div>
        </div>

        {/* Notifications info */}
        <div className="bg-gym-950/40 border border-gym-800/40 rounded-xl p-3 text-[11px] text-slate-400 leading-relaxed space-y-1">
          <p className="font-bold text-slate-300">🔔 Звуковые оповещения таймера в PWA:</p>
          <p>
            Когда вы тренируетесь в автономном приложении на телефоне, таймер отдыха издает звуковой сигнал прямо на устройстве, а бот дублирует пуш-уведомление в ваш Telegram.
          </p>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// ➕ MODAL FOR ADDING PAST WORKOUTS
// ==========================================
function AddPastWorkoutModal({ isOpen, onClose, exercises = [], onSaved }) {
  if (!isOpen) return null;

  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const [date, setDate] = useState(yesterday);
  const [title, setTitle] = useState('День 1: Push (Жим & Грудь)');
  const [notes, setNotes] = useState('Внесено вручную');
  const [rows, setRows] = useState([
    { exercise_name: 'Жим штанги лежа', weight: 60, reps: 10, sets_count: 3 },
    { exercise_name: 'Жим гантелей на наклонной скамье (30°)', weight: 20, reps: 10, sets_count: 3 }
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const addRow = () => {
    setRows(prev => [...prev, { exercise_name: exercises[0]?.name || 'Жим штанги лежа', weight: 40, reps: 10, sets_count: 3 }]);
  };

  const updateRow = (idx, field, val) => {
    setRows(prev => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [field]: val };
      return copy;
    });
  };

  const removeRow = (idx) => {
    setRows(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const startTimeStr = `${date} 19:00:00`;
      const endTimeStr = `${date} 20:00:00`;
      
      const flatSets = [];
      rows.forEach(r => {
        const count = Math.max(1, parseInt(r.sets_count, 10) || 1);
        for (let i = 1; i <= count; i++) {
          flatSets.push({
            exercise_name: r.exercise_name,
            weight: parseFloat(r.weight) || 0,
            reps: parseInt(r.reps, 10) || 10,
            set_type: 'normal',
            set_number: i
          });
        }
      });

      const totalVol = flatSets.reduce((sum, s) => sum + (s.weight * s.reps), 0);
      const workoutObj = {
        title: title || 'Силовая тренировка',
        start_time: startTimeStr,
        end_time: endTimeStr,
        notes: notes || '',
        total_sets: flatSets.length,
        total_volume: totalVol,
        sets: flatSets
      };

      const res = await fetch('/api/workouts/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workouts: [workoutObj] })
      });

      if (res.ok) {
        // Also save to client localStorage so it never disappears on restart
        try {
          const uId = getTelegramUser().id;
          const uKey = 'gym_tracker_full_workouts_' + uId;
          const stored = JSON.parse(localStorage.getItem(uKey) || '[]');
          const updated = [workoutObj, ...stored.filter(w => w.start_time !== workoutObj.start_time)];
          localStorage.setItem(uKey, JSON.stringify(updated));
          localStorage.setItem('gym_tracker_full_workouts_backup', JSON.stringify(updated));
          localStorage.setItem('gym_tracker_history_' + uId, JSON.stringify(updated));
        } catch (e) {}

        if (typeof onSaved === 'function') onSaved();
        triggerHaptic('success');
        onClose();
      } else {
        alert('Ошибка при сохранении тренировки');
      }
    } catch (err) {
      alert('Ошибка соединения с сервером');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 overflow-y-auto">
      <div className="bg-gym-900 border border-gym-800 rounded-3xl p-4 max-w-sm w-full space-y-3.5 shadow-2xl animate-in zoom-in-95 my-auto max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-2 border-b border-gym-800">
          <div>
            <h3 className="text-sm font-black text-white">Внести прошедшую тренировку</h3>
            <p className="text-[10px] text-slate-400">Сохранится в историю и аналитику навсегда</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-base">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">Дата</label>
              <input
                type="date"
                required
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full bg-gym-950 border border-gym-800 text-white rounded-xl px-2.5 py-1.5 text-xs font-mono"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">Название / День</label>
              <input
                type="text"
                required
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full bg-gym-950 border border-gym-800 text-white rounded-xl px-2.5 py-1.5 text-xs"
              />
            </div>
          </div>

          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Упражнения</span>
              <button
                type="button"
                onClick={addRow}
                className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-lg active:scale-95 transition"
              >
                + Добавить
              </button>
            </div>

            {rows.map((r, i) => (
              <div key={i} className="bg-gym-950 border border-gym-800/80 rounded-2xl p-2.5 space-y-1.5 text-xs">
                <div className="flex items-center justify-between gap-1">
                  <select
                    value={r.exercise_name}
                    onChange={e => updateRow(i, 'exercise_name', e.target.value)}
                    className="bg-transparent font-bold text-white text-xs max-w-[210px] truncate focus:outline-none"
                  >
                    {exercises.map(ex => (
                      <option key={ex.id} value={ex.name} className="bg-gym-950 text-white">{ex.name}</option>
                    ))}
                  </select>
                  {rows.length > 1 && (
                    <button type="button" onClick={() => removeRow(i)} className="text-rose-400 text-xs px-1 hover:text-rose-300">✕</button>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-1.5 text-center font-mono">
                  <div className="bg-gym-900 rounded-xl p-1 border border-gym-800">
                    <span className="text-[8px] text-slate-500 uppercase block">Подходов</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={r.sets_count}
                      onFocus={(e) => e.target.select()}
                      onClick={(e) => e.target.select()}
                      onChange={e => updateRow(i, 'sets_count', cleanNumericInput(e.target.value, false))}
                      className="w-full bg-transparent text-center font-black text-white text-xs"
                    />
                  </div>
                  <div className="bg-gym-900 rounded-xl p-1 border border-gym-800">
                    <span className="text-[8px] text-slate-500 uppercase block">Вес (кг)</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={r.weight}
                      onFocus={(e) => e.target.select()}
                      onClick={(e) => e.target.select()}
                      onChange={e => updateRow(i, 'weight', cleanNumericInput(e.target.value, true))}
                      className="w-full bg-transparent text-center font-black text-white text-xs"
                    />
                  </div>
                  <div className="bg-gym-900 rounded-xl p-1 border border-gym-800">
                    <span className="text-[8px] text-slate-500 uppercase block">Повторов</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={r.reps}
                      onFocus={(e) => e.target.select()}
                      onClick={(e) => e.target.select()}
                      onChange={e => updateRow(i, 'reps', cleanNumericInput(e.target.value, false))}
                      className="w-full bg-transparent text-center font-black text-white text-xs"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex space-x-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 bg-gym-800 text-slate-300 font-bold text-xs rounded-xl"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-2.5 bg-emerald-500 text-gym-950 font-black text-xs rounded-xl shadow-md active:scale-95 transition"
            >
              {isSubmitting ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ==========================================
// ➕ MODAL TO RESTORE / ADD SETS TO EXISTING WORKOUT
// ==========================================
function AddSetsToWorkoutModal({ workout, isOpen, onClose, exercises = [], onSaved }) {
  if (!isOpen || !workout) return null;

  // Determine initial template exercises based on workout title / notes
  const initialRows = useMemo(() => {
    const titleLower = (workout.title || '').toLowerCase();
    const notesLower = (workout.notes || '').toLowerCase();

    if (titleLower.includes('pull') || notesLower.includes('day_type:pull') || titleLower.includes('тяни')) {
      return [
        { exercise_name: 'Подтягивания (турник / резина)', weight: 0, reps: 8, sets_count: 3 },
        { exercise_name: 'Тяга штанги в наклоне', weight: 50, reps: 10, sets_count: 3 },
        { exercise_name: 'Тяга гантели в наклоне одной рукой', weight: 20, reps: 10, sets_count: 3 },
        { exercise_name: 'Peck-Deck на заднюю дельту', weight: 35, reps: 12, sets_count: 3 },
        { exercise_name: 'Сгибания рук с EZ-грифом на бицепс стоя', weight: 25, reps: 10, sets_count: 3 },
        { exercise_name: 'Молотки с гантелями', weight: 14, reps: 10, sets_count: 3 },
        { exercise_name: 'Гиперэкстензия', weight: 0, reps: 15, sets_count: 3 }
      ];
    }
    if (titleLower.includes('legs') || notesLower.includes('day_type:legs') || titleLower.includes('ноги')) {
      return [
        { exercise_name: 'Приседания со штангой', weight: 70, reps: 10, sets_count: 4 },
        { exercise_name: 'Жим ногами в тренажере', weight: 120, reps: 12, sets_count: 3 },
        { exercise_name: 'Румынская тяга с гантелями', weight: 22, reps: 10, sets_count: 3 },
        { exercise_name: 'Сгибания ног лежа', weight: 40, reps: 12, sets_count: 3 },
        { exercise_name: 'Подъем на носки стоя', weight: 60, reps: 15, sets_count: 4 },
        { exercise_name: 'Скручивания на пресс', weight: 0, reps: 20, sets_count: 3 }
      ];
    }
    // Default push
    return [
      { exercise_name: 'Жим гантелей на горизонтальной скамье', weight: 20, reps: 8, sets_count: 4 },
      { exercise_name: 'Жим гантелей на наклонной скамье (30°)', weight: 18, reps: 8, sets_count: 3 },
      { exercise_name: 'Жим гантелей сидя на плечи', weight: 14, reps: 8, sets_count: 4 },
      { exercise_name: 'Тяга штанги к подбородку широким хватом', weight: 30, reps: 12, sets_count: 3 },
      { exercise_name: 'Французский жим со штангой лежа', weight: 20, reps: 10, sets_count: 3 }
    ];
  }, [workout]);

  const [rows, setRows] = useState(initialRows);
  const [pasteText, setPasteText] = useState('');
  const [showPasteBox, setShowPasteBox] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const parseTelegramReportText = (text) => {
    if (!text || !text.trim()) return [];
    const lines = text.split('\n');
    const parsed = [];
    const ignoreKeywords = ['день ', 'поднятый тоннаж', 'выполнено подходов', 'спец-сеты', 'совет тренера', 'выполненные упражнения', 'отчет'];
    
    for (let rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      const lineLower = line.toLowerCase();
      if (ignoreKeywords.some(kw => lineLower.includes(kw))) continue;

      // Clean leading bullet points, numbers, asterisks, dashes, spaces
      const cleaned = line.replace(/^[•\*\-\d\.\)\s]+/, '').trim();
      if (!cleaned) continue;

      // Pattern 1: contains подход / сет / set
      const setsMatch = cleaned.match(/[:–\-]?\s*(\d+)\s*(?:подход|сет|set)[^\d]*/i);
      if (setsMatch) {
        const setsCount = parseInt(setsMatch[1], 10) || 3;
        const prefix = cleaned.substring(0, setsMatch.index);
        const exName = prefix.replace(/[\*_\s:]+$/g, '').trim();
        const remainder = cleaned.substring(setsMatch.index + setsMatch[0].length);

        let weight = 0;
        let reps = 10;

        // Weight and reps pattern: e.g. (макс. 100.0 кг × 10), (макс. *100.0 кг* × 10), 100 кг x 10, etc.
        const wrMatch = remainder.match(/(?:макс\.\s*)?[\(\*]?\s*(\d+(?:[.,]\d+)?)\s*кг[\*\)]?\s*[×xх\*\-]\s*\*?(\d+)/i);
        if (wrMatch) {
          weight = parseFloat(wrMatch[1].replace(',', '.')) || 0;
          reps = parseInt(wrMatch[2], 10) || 10;
        } else {
          const wMatch = remainder.match(/(?:макс\.\s*|по\s*)?[\(\*]?\s*(\d+(?:[.,]\d+)?)\s*кг/i);
          if (wMatch) {
            weight = parseFloat(wMatch[1].replace(',', '.')) || 0;
          }
          const rMatch = remainder.match(/[×xх\*]\s*(\d+)|(?:на\s*)?(\d+)\s*(?:повт|раз)/i);
          if (rMatch) {
            reps = parseInt(rMatch[1] || rMatch[2], 10) || 10;
          }
        }

        if (exName && exName.length > 1 && !ignoreKeywords.some(kw => exName.toLowerCase().includes(kw))) {
          parsed.push({
            exercise_name: exName,
            sets_count: setsCount,
            weight: isNaN(weight) ? 0 : weight,
            reps: isNaN(reps) ? 10 : reps
          });
          continue;
        }
      }

      // Pattern 2: Exercise: 5 x 100 кг x 10
      const colParts = cleaned.split(':');
      if (colParts.length >= 2) {
        const exName = colParts[0].replace(/[\*_]/g, '').trim();
        const rest = colParts.slice(1).join(':').trim();
        const nums = rest.match(/\d+(?:[.,]\d+)?/g);
        if (nums && nums.length >= 3 && exName && exName.length > 1 && !ignoreKeywords.some(kw => exName.toLowerCase().includes(kw))) {
          const setsCount = parseInt(nums[0], 10) || 3;
          const weight = parseFloat(nums[1].replace(',', '.')) || 0;
          const reps = parseInt(nums[2], 10) || 10;
          parsed.push({
            exercise_name: exName,
            sets_count: setsCount,
            weight: isNaN(weight) ? 0 : weight,
            reps: isNaN(reps) ? 10 : reps
          });
        }
      }
    }

    return parsed;
  };

  const applyParsedExercises = (parsedList) => {
    if (parsedList && parsedList.length > 0) {
      setRows(parsedList);
      setShowPasteBox(false);
      triggerHaptic('success');
      return true;
    }
    return false;
  };

  // Fast parser for Telegram report text
  const handleParseTelegramReport = () => {
    if (!pasteText.trim()) return;
    const parsed = parseTelegramReportText(pasteText);
    if (!applyParsedExercises(parsed)) {
      alert('Не удалось распознать упражнения из текста. Убедитесь, что скопирован отчет с упражнениями или заполните данные вручную.');
    }
  };

  const handleQuickPasteClick = async () => {
    let clipboardText = '';
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.readText) {
        clipboardText = await navigator.clipboard.readText();
      }
    } catch (e) {
      console.log('Clipboard read note:', e);
    }

    if (clipboardText && clipboardText.trim()) {
      const parsed = parseTelegramReportText(clipboardText);
      if (applyParsedExercises(parsed)) {
        return;
      }
      setPasteText(clipboardText);
      setShowPasteBox(true);
      return;
    }

    setShowPasteBox(prev => !prev);
  };

  const addRow = () => {
    setRows(prev => [...prev, { exercise_name: exercises[0]?.name || 'Упражнение', weight: 20, reps: 10, sets_count: 3 }]);
  };

  const updateRow = (idx, field, val) => {
    setRows(prev => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [field]: val };
      return copy;
    });
  };

  const removeRow = (idx) => {
    setRows(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const flatSets = [];
      rows.forEach(r => {
        const count = Math.max(1, parseInt(r.sets_count, 10) || 1);
        for (let i = 1; i <= count; i++) {
          flatSets.push({
            exercise_name: r.exercise_name,
            weight: parseFloat(r.weight) || 0,
            reps: parseInt(r.reps, 10) || 10,
            set_type: 'normal',
            set_number: i
          });
        }
      });

      const totalVol = flatSets.reduce((sum, s) => sum + (s.weight * s.reps), 0);
      const updatedWorkout = {
        ...workout,
        total_sets: flatSets.length,
        total_volume: totalVol,
        sets: flatSets
      };

      // 1. Send sync to server
      await fetch('/api/workouts/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workouts: [updatedWorkout] })
      });

      // 2. Persist in local storage
      try {
        const uId = getTelegramUser().id;
        const uKey = 'gym_tracker_full_workouts_' + uId;
        const stored = JSON.parse(localStorage.getItem(uKey) || '[]');
        const updated = [updatedWorkout, ...stored.filter(w => w.start_time !== workout.start_time)];
        localStorage.setItem(uKey, JSON.stringify(updated));
        localStorage.setItem('gym_tracker_full_workouts_backup', JSON.stringify(updated));
        localStorage.setItem('gym_tracker_history_' + uId, JSON.stringify(updated));
      } catch (e) {}

      triggerHaptic('success');
      if (typeof onSaved === 'function') onSaved(updatedWorkout);
      onClose();
    } catch (err) {
      alert('Ошибка при сохранении подходов');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 overflow-y-auto">
      <div className="bg-gym-900 border border-gym-800 rounded-3xl p-4 max-w-sm w-full space-y-3.5 shadow-2xl animate-in zoom-in-95 my-auto max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-2 border-b border-gym-800">
          <div>
            <h3 className="text-sm font-black text-white">Восстановить подходы</h3>
            <p className="text-[10px] text-slate-400 font-mono">{workout.title} ({formatDate(workout.start_time)})</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-base">✕</button>
        </div>

        {/* Option to toggle paste box */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={handleQuickPasteClick}
            className="text-[11px] font-bold text-sky-400 hover:text-sky-300 flex items-center space-x-1"
          >
            <span>📋</span>
            <span>{showPasteBox ? 'Скрыть поле' : 'Вставить отчет из Telegram в 1 клик'}</span>
          </button>
          <button
            type="button"
            onClick={addRow}
            className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-lg active:scale-95 transition"
          >
            + Упражнение
          </button>
        </div>

        {showPasteBox && (
          <div className="bg-gym-950 p-3 rounded-2xl border border-gym-800 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[10px] text-slate-400 block font-medium">Вставьте текст сообщения отчета из бота:</label>
              {typeof navigator !== 'undefined' && navigator.clipboard && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const t = await navigator.clipboard.readText();
                      if (t) {
                        setPasteText(t);
                        const parsed = parseTelegramReportText(t);
                        if (parsed.length > 0) applyParsedExercises(parsed);
                      }
                    } catch (e) {}
                  }}
                  className="text-[10px] text-sky-400 hover:text-sky-300 font-bold"
                >
                  📋 Вставить из буфера
                </button>
              )}
            </div>
            <textarea
              rows={4}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="📋 Выполненные упражнения:&#10;• Приседания со штангой на плечах: 5 подход. (макс. 100.0 кг × 10)&#10;• Румынская тяга: 4 подход. (макс. 80.0 кг × 10)"
              className="w-full bg-gym-900 border border-gym-800 rounded-xl p-2 text-[11px] text-white font-mono placeholder-slate-600 focus:outline-none focus:border-sky-400"
            />
            <button
              type="button"
              onClick={handleParseTelegramReport}
              className="w-full py-2 bg-sky-500 hover:bg-sky-400 text-gym-950 font-black text-xs rounded-xl shadow active:scale-95 transition"
            >
              ⚡ Распознать и заполнить таблицу
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-2 max-h-[46vh] overflow-y-auto pr-1">
            {rows.map((r, i) => (
              <div key={i} className="bg-gym-950 border border-gym-800/80 rounded-2xl p-2.5 space-y-1.5 text-xs">
                <div className="flex items-center justify-between gap-1">
                  <input
                    type="text"
                    required
                    value={r.exercise_name}
                    onChange={e => updateRow(i, 'exercise_name', e.target.value)}
                    className="flex-1 bg-gym-900 border border-gym-800 text-white rounded-lg px-2 py-1 text-xs font-bold"
                  />
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    className="text-slate-500 hover:text-rose-400 text-xs px-1.5 py-1"
                  >
                    ✕
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                  <div className="bg-gym-900 rounded-xl p-1 border border-gym-800">
                    <span className="text-[8px] text-slate-500 uppercase block">Подходов</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={r.sets_count}
                      onFocus={(e) => e.target.select()}
                      onClick={(e) => e.target.select()}
                      onChange={e => updateRow(i, 'sets_count', cleanNumericInput(e.target.value, false))}
                      className="w-full bg-transparent text-center font-black text-white text-xs"
                    />
                  </div>

                  <div className="bg-gym-900 rounded-xl p-1 border border-gym-800">
                    <span className="text-[8px] text-slate-500 uppercase block">Вес (кг)</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={r.weight}
                      onFocus={(e) => e.target.select()}
                      onClick={(e) => e.target.select()}
                      onChange={e => updateRow(i, 'weight', cleanNumericInput(e.target.value, true))}
                      className="w-full bg-transparent text-center font-black text-emerald-400 text-xs"
                    />
                  </div>

                  <div className="bg-gym-900 rounded-xl p-1 border border-gym-800">
                    <span className="text-[8px] text-slate-500 uppercase block">Повторов</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={r.reps}
                      onFocus={(e) => e.target.select()}
                      onClick={(e) => e.target.select()}
                      onChange={e => updateRow(i, 'reps', cleanNumericInput(e.target.value, false))}
                      className="w-full bg-transparent text-center font-black text-white text-xs"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex space-x-2 pt-2 border-t border-gym-800">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 bg-gym-800 text-slate-300 font-bold text-xs rounded-xl"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-2.5 bg-emerald-500 text-gym-950 font-black text-xs rounded-xl shadow-md active:scale-95 transition"
            >
              {isSubmitting ? 'Сохранение...' : 'Сохранить подходы'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ==========================================
// 🗑️ DELETE WORKOUT CONFIRMATION MODAL
// ==========================================
function DeleteWorkoutModal({ workout, isOpen, onClose, onDeleted }) {
  const [isDeleting, setIsDeleting] = useState(false);

  if (!isOpen || !workout) return null;

  const workoutDate = formatDate(workout.start_time);
  const workoutTime = parseSafeDate(workout.start_time)?.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) || '';

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/workouts/${workout.id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        // Purge from localStorage
        try {
          const uId = getTelegramUser().id;
          const uKey = 'gym_tracker_full_workouts_' + uId;
          const raw = localStorage.getItem(uKey) || localStorage.getItem('gym_tracker_full_workouts_backup') || '[]';
          const list = JSON.parse(raw);
          const filtered = list.filter(w => w.id !== workout.id && w.start_time !== workout.start_time);
          localStorage.setItem(uKey, JSON.stringify(filtered));
          localStorage.setItem('gym_tracker_full_workouts_backup', JSON.stringify(filtered));
          localStorage.setItem('gym_tracker_history_' + uId, JSON.stringify(filtered));
        } catch (e) {}

        triggerHaptic('success');
        if (typeof onDeleted === 'function') onDeleted(workout.id);
        onClose();
      } else {
        alert('Не удалось удалить тренировку на сервере');
      }
    } catch (err) {
      alert('Ошибка соединения при удалении');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div 
        className="w-full max-w-sm bg-gym-900 border border-gym-700/80 rounded-3xl p-5 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center space-x-3">
          <div className="w-11 h-11 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-xl shrink-0">
            🗑️
          </div>
          <div>
            <h3 className="text-base font-black text-white">Удалить тренировку?</h3>
            <p className="text-xs text-slate-400">Это действие нельзя отменить</p>
          </div>
        </div>

        <div className="bg-gym-950 p-3.5 rounded-2xl border border-gym-800 space-y-1.5 text-xs font-mono">
          <div className="font-extrabold text-white text-sm font-sans">{workout.title}</div>
          <div className="text-slate-400">
            📅 {workoutDate} • {workoutTime}
          </div>
          <div className="text-slate-400 flex items-center space-x-3 pt-1 border-t border-gym-800/80">
            <span>Подходов: <strong className="text-white">{workout.total_sets || 0}</strong></span>
            <span>Тоннаж: <strong className="text-emerald-400">{Math.round(workout.total_volume || 0).toLocaleString('ru-RU')} кг</strong></span>
          </div>
        </div>

        <p className="text-[11px] text-rose-300/90 leading-relaxed">
          Тренировка будет навсегда удалена из базы данных, истории и исключена из подсчета стрика и общего тоннажа.
        </p>

        <div className="flex space-x-2 pt-1">
          <button
            type="button"
            disabled={isDeleting}
            onClick={onClose}
            className="flex-1 py-2.5 bg-gym-800 hover:bg-gym-700 text-slate-300 font-bold text-xs rounded-xl active:scale-95 transition cursor-pointer"
          >
            Отмена
          </button>
          <button
            type="button"
            disabled={isDeleting}
            onClick={handleDelete}
            className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-black text-xs rounded-xl shadow-lg shadow-rose-600/30 active:scale-95 transition cursor-pointer"
          >
            {isDeleting ? 'Удаление...' : 'Да, удалить'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 📜 HISTORY SCREEN
// ==========================================
function HistoryScreen({ workouts = [], exercises = [], onRefresh }) {
  const [selectedDate, setSelectedDate] = useState(null); // 'YYYY-MM-DD'
  const [viewDate, setViewDate] = useState(new Date());
  const [expandedWorkoutId, setExpandedWorkoutId] = useState(null);
  const [workoutDetailsCache, setWorkoutDetailsCache] = useState({});
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [showAddPastModal, setShowAddPastModal] = useState(false);
  const [editingWorkoutForSets, setEditingWorkoutForSets] = useState(null);
  const [editingSet, setEditingSet] = useState(null);
  const [workoutToDelete, setWorkoutToDelete] = useState(null);

  // Group workouts by 'YYYY-MM-DD'
  const workoutsByDate = useMemo(() => {
    const map = {};
    workouts.forEach((w) => {
      if (!w.start_time) return;
      const d = parseSafeDate(w.start_time);
      if (!d) return;
      const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(w);
    });
    return map;
  }, [workouts]);

  // Streak & monthly stats calculation
  const stats = useMemo(() => {
    if (!workouts || workouts.length === 0) {
      return { streakWeeks: 0, streakWorkouts: 0, monthCount: 0, monthVolume: 0, avgSets: 0 };
    }

    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth();

    // 1. Current month workouts
    const thisMonthList = workouts.filter((w) => {
      const d = parseSafeDate(w.start_time);
      if (!d) return false;
      return d.getFullYear() === curYear && d.getMonth() === curMonth;
    });

    const monthCount = thisMonthList.length;
    const monthVolume = thisMonthList.reduce((sum, w) => {
      const v = (w.total_volume && w.total_volume > 0)
        ? w.total_volume
        : (Array.isArray(w.sets) ? w.sets.reduce((s, set) => s + ((parseFloat(set.weight) || 0) * (parseInt(set.reps, 10) || 0)), 0) : 0);
      return sum + v;
    }, 0);

    const avgSets = workouts.length > 0 
      ? Math.round(workouts.reduce((sum, w) => {
          const s = (w.total_sets && w.total_sets > 0)
            ? w.total_sets
            : (Array.isArray(w.sets) ? w.sets.length : 0);
          return sum + s;
        }, 0) / workouts.length) 
      : 0;

    // 2. Active weeks collection
    const activeWeeks = new Set();
    workouts.forEach((w) => {
      const k = getISOWeekKey(w.start_time);
      if (k) activeWeeks.add(k);
    });

    // 3. Weekly streak calculation
    let streakWeeks = 0;
    const currentWeekKey = getISOWeekKey(now);
    const prevWeekKey = getISOWeekKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7));

    let checkDate = null;
    if (activeWeeks.has(currentWeekKey)) {
      checkDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (activeWeeks.has(prevWeekKey)) {
      checkDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
    }

    if (checkDate) {
      while (true) {
        const key = getISOWeekKey(checkDate);
        if (activeWeeks.has(key)) {
          streakWeeks++;
          checkDate.setDate(checkDate.getDate() - 7);
        } else {
          break;
        }
        if (streakWeeks > 52) break;
      }
    }

    // 4. Consecutive workouts streak calculation (session-by-session)
    const validWorkouts = workouts
      .map(w => ({ ...w, _parsedDate: parseSafeDate(w.start_time) }))
      .filter(w => w._parsedDate !== null)
      .sort((a, b) => b._parsedDate.getTime() - a._parsedDate.getTime());

    let streakWorkouts = 0;
    if (validWorkouts.length > 0) {
      const lastWorkout = validWorkouts[0];
      const msSinceLast = now.getTime() - lastWorkout._parsedDate.getTime();
      const daysSinceLast = msSinceLast / (1000 * 60 * 60 * 24);

      if (daysSinceLast <= 8.5) {
        streakWorkouts = 1;
        for (let i = 1; i < validWorkouts.length; i++) {
          const prevW = validWorkouts[i - 1];
          const currW = validWorkouts[i];
          const gapDays = (prevW._parsedDate.getTime() - currW._parsedDate.getTime()) / (1000 * 60 * 60 * 24);
          if (gapDays <= 8.5) {
            streakWorkouts++;
          } else {
            break;
          }
        }
      }
    }

    return {
      streakWeeks,
      streakWorkouts,
      monthCount,
      monthVolume,
      avgSets
    };
  }, [workouts]);

  // Calendar matrix calculation
  const viewYear = viewDate.getFullYear();
  const viewMonth = viewDate.getMonth();
  const monthNames = [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
  ];

  const firstDayOfMonth = new Date(viewYear, viewMonth, 1).getDay();
  const startingCol = (firstDayOfMonth + 6) % 7; // Monday = 0
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const handlePrevMonth = () => {
    setViewDate(new Date(viewYear, viewMonth - 1, 1));
  };

  const handleNextMonth = () => {
    setViewDate(new Date(viewYear, viewMonth + 1, 1));
  };

  const handleTodayMonth = () => {
    setViewDate(new Date());
  };

  // Toggle workout accordion details
  const toggleWorkoutExpand = async (workoutId) => {
    if (expandedWorkoutId === workoutId) {
      setExpandedWorkoutId(null);
      return;
    }
    setExpandedWorkoutId(workoutId);
    if (!workoutDetailsCache[workoutId]) {
      try {
        setLoadingDetail(true);
        const res = await fetch(`/api/workouts/${workoutId}`);
        if (res.ok) {
          const data = await res.json();
          setWorkoutDetailsCache((prev) => ({ ...prev, [workoutId]: data }));
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingDetail(false);
      }
    }
  };

  const handleSaveHistorySet = async (updatedFields) => {
    if (!editingSet) return;
    try {
      const res = await fetch(`/api/sets/${editingSet.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedFields)
      });
      if (res.ok) {
        const updated = await res.json();
        const workoutId = editingSet.workout_id;
        
        // Update local cache for details
        if (workoutId && workoutDetailsCache[workoutId]) {
          setWorkoutDetailsCache(prev => {
            const cur = prev[workoutId];
            if (!cur || !cur.sets) return prev;
            const updatedSets = cur.sets.map(s => s.id === updated.id ? { ...s, ...updated } : s);
            return { ...prev, [workoutId]: { ...cur, sets: updatedSets } };
          });
        }

        // Update localStorage backup so offline sync keeps edited values
        try {
          const uId = getTelegramUser().id;
          const uKey = 'gym_tracker_full_workouts_' + uId;
          const stored = JSON.parse(localStorage.getItem(uKey) || '[]');
          const wIdx = stored.findIndex(w => w.id === workoutId || (w.sets && w.sets.some(s => s.id === updated.id)));
          if (wIdx !== -1) {
            const w = stored[wIdx];
            const updatedSets = (w.sets || []).map(s => s.id === updated.id ? { ...s, ...updated } : s);
            const newVol = updatedSets.reduce((sum, s) => sum + (s.weight * s.reps), 0);
            stored[wIdx] = { ...w, sets: updatedSets, total_volume: newVol, total_sets: updatedSets.length };
            localStorage.setItem(uKey, JSON.stringify(stored));
            localStorage.setItem('gym_tracker_full_workouts_backup', JSON.stringify(stored));
          }
        } catch (e) {}

        triggerHaptic('success');
        setEditingSet(null);
        if (typeof onRefresh === 'function') onRefresh();
      } else {
        alert('Ошибка при сохранении изменений');
      }
    } catch (e) {
      alert('Ошибка соединения с сервером');
    }
  };

  const handleDeleteHistorySet = async (setId) => {
    if (!confirm('Удалить этот подход из истории?')) return;
    try {
      const res = await fetch(`/api/sets/${setId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        const workoutId = editingSet?.workout_id;
        
        if (workoutId && workoutDetailsCache[workoutId]) {
          setWorkoutDetailsCache(prev => {
            const cur = prev[workoutId];
            if (!cur || !cur.sets) return prev;
            const updatedSets = cur.sets.filter(s => s.id !== setId);
            return { ...prev, [workoutId]: { ...cur, sets: updatedSets } };
          });
        }

        try {
          const uId = getTelegramUser().id;
          const uKey = 'gym_tracker_full_workouts_' + uId;
          const stored = JSON.parse(localStorage.getItem(uKey) || '[]');
          const wIdx = stored.findIndex(w => (workoutId && w.id === workoutId) || (w.sets && w.sets.some(s => s.id === setId)));
          if (wIdx !== -1) {
            const w = stored[wIdx];
            const updatedSets = (w.sets || []).filter(s => s.id !== setId);
            const newVol = updatedSets.reduce((sum, s) => sum + (s.weight * s.reps), 0);
            stored[wIdx] = { ...w, sets: updatedSets, total_volume: newVol, total_sets: updatedSets.length };
            localStorage.setItem(uKey, JSON.stringify(stored));
            localStorage.setItem('gym_tracker_full_workouts_backup', JSON.stringify(stored));
          }
        } catch (e) {}

        triggerHaptic('warning');
        setEditingSet(null);
        if (typeof onRefresh === 'function') onRefresh();
      } else {
        alert('Ошибка при удалении подхода');
      }
    } catch (e) {
      alert('Ошибка соединения с сервером');
    }
  };

  // Filter workouts by selected date
  const filteredWorkouts = useMemo(() => {
    if (!selectedDate) return workouts;
    return workouts.filter((w) => {
      const d = parseSafeDate(w.start_time);
      if (!d) return false;
      const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return dateKey === selectedDate;
    });
  }, [workouts, selectedDate]);

  const todayStr = new Date().toISOString().split('T')[0];

  return (
    <div className="space-y-4">
      {/* 1. STREAK & MOTIVATIONAL STATS CARD */}
      <div className="bg-gradient-to-br from-gym-900 via-gym-900 to-gym-950 border border-gym-800 rounded-3xl p-4 shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-xl shadow-inner animate-pulse">
              🔥
            </div>
            <div>
              <div className="flex items-center space-x-1.5">
                <span className="text-lg font-black text-white">
                  {stats.streakWorkouts > 0 
                    ? `${stats.streakWorkouts} ${getPluralWorkouts(stats.streakWorkouts)} подряд`
                    : stats.streakWeeks > 0 
                    ? `${stats.streakWeeks} ${getPluralWeeks(stats.streakWeeks)}`
                    : '0 тренировок'}
                </span>
                <span className="text-[10px] bg-amber-500/20 text-amber-400 font-bold px-1.5 py-0.5 rounded-full uppercase">Стрик</span>
              </div>
              <p className="text-[11px] text-slate-400">
                {stats.streakWorkouts > 0 
                  ? `🔥 Серия без пропусков • ${stats.streakWeeks} ${getPluralWeeks(stats.streakWeeks)} в зале`
                  : 'Начните тренировку, чтобы запустить серию'}
              </p>
            </div>
          </div>
        </div>

        {/* 3 Metrics Grid */}
        <div className="grid grid-cols-3 gap-2 pt-1 border-t border-gym-800/80 text-center font-mono">
          <div className="bg-gym-950/70 border border-gym-800/60 rounded-xl p-2">
            <span className="text-[10px] text-slate-500 block uppercase">За месяц</span>
            <span className="text-sm font-black text-emerald-400">{stats.monthCount} трен.</span>
          </div>

          <div className="bg-gym-950/70 border border-gym-800/60 rounded-xl p-2">
            <span className="text-[10px] text-slate-500 block uppercase">Тоннаж мес.</span>
            <span className="text-sm font-black text-sky-400">
              {stats.monthVolume >= 1000 ? `${(stats.monthVolume / 1000).toFixed(1)} т` : `${Math.round(stats.monthVolume)} кг`}
            </span>
          </div>

          <div className="bg-gym-950/70 border border-gym-800/60 rounded-xl p-2">
            <span className="text-[10px] text-slate-500 block uppercase">Ср. сетов</span>
            <span className="text-sm font-black text-purple-300">{stats.avgSets}</span>
          </div>
        </div>
      </div>

      {/* 2. INTERACTIVE CALENDAR WIDGET */}
      <div className="bg-gym-900 border border-gym-800 rounded-3xl p-4 shadow-xl space-y-3">
        {/* Month Header & Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-base font-black text-white">
              {monthNames[viewMonth]} {viewYear}
            </span>
            {(viewMonth !== new Date().getMonth() || viewYear !== new Date().getFullYear()) && (
              <button
                onClick={handleTodayMonth}
                className="text-[10px] font-bold text-sky-400 bg-sky-500/10 hover:bg-sky-500/20 px-2 py-0.5 rounded-lg transition"
              >
                Сегодня
              </button>
            )}
          </div>

          <div className="flex items-center space-x-1">
            <button
              onClick={handlePrevMonth}
              className="w-8 h-8 rounded-xl bg-gym-800 hover:bg-gym-700 active:scale-95 text-slate-300 flex items-center justify-center font-bold text-sm transition"
              title="Предыдущий месяц"
            >
              ‹
            </button>
            <button
              onClick={handleNextMonth}
              className="w-8 h-8 rounded-xl bg-gym-800 hover:bg-gym-700 active:scale-95 text-slate-300 flex items-center justify-center font-bold text-sm transition"
              title="Следующий месяц"
            >
              ›
            </button>
          </div>
        </div>

        {/* Days of Week Header */}
        <div className="grid grid-cols-7 gap-1 text-center font-mono text-[11px] font-bold text-slate-500 pb-1">
          <span>Пн</span>
          <span>Вт</span>
          <span>Ср</span>
          <span>Чт</span>
          <span>Пт</span>
          <span className="text-amber-500/70">Сб</span>
          <span className="text-rose-500/70">Вс</span>
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-1.5 text-center">
          {/* Empty cells before first day */}
          {Array.from({ length: startingCol }).map((_, i) => (
            <div key={`empty-${i}`} className="h-9" />
          ))}

          {/* Month Days */}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const dayNum = i + 1;
            const dayStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
            const dayWorkouts = workoutsByDate[dayStr] || [];
            const hasWorkout = dayWorkouts.length > 0;
            const isToday = dayStr === todayStr;
            const isSelected = dayStr === selectedDate;

            return (
              <button
                key={dayStr}
                type="button"
                onClick={() => {
                  setSelectedDate((prev) => (prev === dayStr ? null : dayStr));
                  triggerHaptic('light');
                }}
                className={`h-9 rounded-xl flex flex-col items-center justify-center relative transition-all active:scale-95 font-mono text-xs ${
                  isSelected
                    ? 'bg-emerald-500 text-gym-950 font-black shadow-lg shadow-emerald-500/30 ring-2 ring-emerald-300'
                    : hasWorkout
                    ? 'bg-emerald-500/20 text-emerald-300 font-extrabold border border-emerald-500/40 hover:bg-emerald-500/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-gym-800/60'
                } ${isToday && !isSelected ? 'ring-1 ring-sky-400 font-bold text-white' : ''}`}
              >
                <span>{dayNum}</span>
                {hasWorkout && !isSelected && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.8)] -mt-0.5" />
                )}
              </button>
            );
          })}
        </div>

        {/* Date Filter Badge if active */}
        {selectedDate && (
          <div className="pt-2 border-t border-gym-800 flex items-center justify-between text-xs animate-in fade-in">
            <span className="text-slate-300">
              Показаны тренировки за: <strong className="text-emerald-400">{formatDate(selectedDate)}</strong> ({filteredWorkouts.length})
            </span>
            <button
              onClick={() => setSelectedDate(null)}
              className="text-[11px] font-bold text-slate-400 hover:text-white bg-gym-800 px-2 py-0.5 rounded-lg border border-gym-700"
            >
              ✕ Сбросить
            </button>
          </div>
        )}
      </div>

      {/* 3. WORKOUTS LIST WITH EXPANDABLE DETAILED SETS */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">
            {selectedDate ? `Сессии за ${formatDate(selectedDate)}` : `Все тренировки (${filteredWorkouts.length})`}
          </h3>
          <div className="flex items-center space-x-2">
            {selectedDate && (
              <button onClick={() => setSelectedDate(null)} className="text-[11px] text-sky-400 font-medium">
                Показать все
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowAddPastModal(true)}
              className="text-[11px] font-bold text-emerald-400 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 px-2.5 py-1 rounded-xl active:scale-95 transition flex items-center space-x-1"
            >
              <span>+</span>
              <span>Внести вручную</span>
            </button>
          </div>
        </div>

        {filteredWorkouts.length === 0 ? (
          <div className="bg-gym-900 border border-gym-800 rounded-3xl p-6 text-center text-slate-400 text-xs space-y-2">
            <p className="text-2xl">📋</p>
            <p className="font-bold text-slate-200">Тренировок в истории пока нет</p>
            <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
              Завершите тренировку в режиме тренировки или внесите вчерашнюю тренировку вручную.
            </p>
            <button
              type="button"
              onClick={() => setShowAddPastModal(true)}
              className="mt-2 text-xs font-black bg-emerald-500 text-gym-950 px-3.5 py-2 rounded-xl shadow-md active:scale-95 transition"
            >
              + Внести вчерашнюю тренировку
            </button>
          </div>
        ) : (
          filteredWorkouts.map((w) => {
            const isExpanded = expandedWorkoutId === w.id;
            const details = workoutDetailsCache[w.id];

            const effectiveSets = (details?.sets && details.sets.length > 0)
              ? details.sets
              : (Array.isArray(w.sets) && w.sets.length > 0)
                ? w.sets
                : [];

            // Group detailed sets by exercise name if available
            const groupedSets = effectiveSets.reduce((acc, s) => {
              const name = s.exercise_name || 'Упражнение';
              acc[name] = acc[name] || [];
              acc[name].push(s);
              return acc;
            }, {});

            return (
              <div
                key={w.id}
                className={`bg-gym-900 border rounded-3xl p-4 space-y-3 transition-all shadow-md ${
                  isExpanded ? 'border-emerald-500/50 ring-1 ring-emerald-500/20' : 'border-gym-800 hover:border-gym-700'
                }`}
              >
                {/* Header row */}
                <div
                  onClick={() => toggleWorkoutExpand(w.id)}
                  className="flex items-start justify-between cursor-pointer gap-2 select-none"
                >
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-black text-white text-sm leading-snug">{w.title}</span>
                      {w.is_active && (
                        <span className="text-[9px] font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 px-1.5 py-0.5 rounded-full uppercase live-dot">
                          В процессе
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-slate-400 font-mono block">
                      {formatDate(w.start_time)} • {parseSafeDate(w.start_time)?.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) || ''}
                    </span>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-[11px] font-bold text-sky-400 flex items-center space-x-1">
                      <span>{isExpanded ? 'Скрыть ▲' : 'Детали ▼'}</span>
                    </span>
                  </div>
                </div>

                {/* Quick stats pills */}
                {(() => {
                  const cardSets = (w.total_sets && w.total_sets > 0)
                    ? w.total_sets
                    : (Array.isArray(w.sets) && w.sets.length > 0)
                      ? w.sets.length
                      : (details?.sets?.length || 0);
                  const cardVol = (w.total_volume && w.total_volume > 0)
                    ? w.total_volume
                    : ((w.sets || details?.sets)
                        ? (w.sets || details.sets).reduce((s, set) => s + ((parseFloat(set.weight) || 0) * (parseInt(set.reps, 10) || 0)), 0)
                        : 0);

                  return (
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gym-800/80 text-xs font-mono">
                      <div className="text-slate-400 flex items-center space-x-1">
                        <span>Подходов:</span>
                        <strong className="text-white font-black">{cardSets}</strong>
                      </div>
                      <div className="text-slate-400 text-right flex items-center justify-end space-x-1">
                        <span>Тоннаж:</span>
                        <strong className="text-emerald-400 font-black">
                          {cardVol > 0 ? `${Math.round(cardVol).toLocaleString('ru-RU')} кг` : '0 кг'}
                        </strong>
                      </div>
                    </div>
                  );
                })()}

                {/* Expanded sets & exercises breakdown */}
                {isExpanded && (
                  <div className="pt-3 border-t border-gym-800 space-y-3 animate-in fade-in duration-200">
                    {loadingDetail && !details && effectiveSets.length === 0 ? (
                      <div className="py-4 text-center text-xs text-slate-400 font-mono animate-pulse">
                        Загрузка подходов...
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {w.notes && (
                          <div className="bg-gym-950 p-2.5 rounded-xl border border-gym-800 text-[11px] text-slate-400">
                            📝 {w.notes}
                          </div>
                        )}

                        {effectiveSets.length === 0 ? (
                          <div className="bg-gym-950/70 border border-gym-800/80 rounded-2xl p-4 text-center space-y-2.5">
                            <p className="text-xs text-slate-300 font-semibold">
                              Данные о подходах не были записаны или были сброшены сервером.
                            </p>
                            <p className="text-[11px] text-slate-400">
                              Вы можете восстановить подходы в 1 клик через вставку отчета из Telegram или заполнив веса.
                            </p>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingWorkoutForSets(w);
                              }}
                              className="text-xs font-black bg-emerald-500 hover:bg-emerald-400 text-gym-950 px-4 py-2 rounded-xl shadow-lg active:scale-95 transition"
                            >
                              + Восстановить / внести подходы
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-2.5">
                          {Object.entries(groupedSets).map(([exName, sList]) => (
                            <div key={exName} className="bg-gym-950/80 border border-gym-800/70 rounded-2xl p-3 space-y-2">
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-extrabold text-white">{exName}</span>
                                <span className="text-[10px] text-slate-400 font-mono">{sList.length} сет.</span>
                              </div>

                              <div className="flex flex-wrap gap-1.5">
                                {sList.map((s, idx) => {
                                  const st = s.set_type || 'normal';
                                  const openEditModal = () => {
                                    triggerHaptic('light');
                                    setEditingSet({ ...s, workout_id: w.id });
                                  };
                                  if (st === 'warmup') {
                                    return (
                                      <button
                                        key={s.id || idx}
                                        type="button"
                                        onClick={openEditModal}
                                        className="bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 font-mono font-bold text-[10px] px-2 py-0.5 rounded-lg flex items-center space-x-1 active:scale-95 transition cursor-pointer"
                                        title="Нажмите, чтобы изменить или удалить"
                                      >
                                        <span className="text-[9px] bg-amber-500 text-gym-950 font-black px-1 rounded">W</span>
                                        <span>{s.weight} кг × {s.reps}</span>
                                        <span className="text-[8px] text-amber-400/80">✏️</span>
                                      </button>
                                    );
                                  }
                                  if (st === 'drop') {
                                    return (
                                      <button
                                        key={s.id || idx}
                                        type="button"
                                        onClick={openEditModal}
                                        className="bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/40 text-purple-300 font-mono font-bold text-[10px] px-2 py-0.5 rounded-lg flex items-center space-x-1 active:scale-95 transition cursor-pointer"
                                        title="Нажмите, чтобы изменить или удалить"
                                      >
                                        <span className="text-[9px] bg-purple-500 text-white font-black px-1 rounded">D</span>
                                        <span>{s.weight} кг × {s.reps}</span>
                                        <span className="text-[8px] text-purple-400/80">✏️</span>
                                      </button>
                                    );
                                  }
                                  if (st === 'failure') {
                                    return (
                                      <button
                                        key={s.id || idx}
                                        type="button"
                                        onClick={openEditModal}
                                        className="bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-300 font-mono font-bold text-[10px] px-2 py-0.5 rounded-lg flex items-center space-x-1 active:scale-95 transition cursor-pointer"
                                        title="Нажмите, чтобы изменить или удалить"
                                      >
                                        <span className="text-[9px] bg-rose-500 text-white font-black px-1 rounded">F</span>
                                        <span>{s.weight} кг × {s.reps}</span>
                                        <span className="text-[8px] text-rose-400/80">✏️</span>
                                      </button>
                                    );
                                  }
                                  return (
                                    <button
                                      key={s.id || idx}
                                      type="button"
                                      onClick={openEditModal}
                                      className="bg-gym-900 hover:bg-gym-800 border border-gym-700/80 hover:border-emerald-500/50 px-2 py-0.5 rounded-lg text-emerald-400 font-mono font-bold text-[10px] flex items-center space-x-1 active:scale-95 transition cursor-pointer"
                                      title="Нажмите, чтобы изменить или удалить"
                                    >
                                      <span>#{s.set_number || idx + 1}: {s.weight} кг × {s.reps}</span>
                                      <span className="text-[8px] text-slate-500">✏️</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Workout Action Footer: Add Sets & Delete Workout */}
                      <div className="pt-3 border-t border-gym-800/80 flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingWorkoutForSets(w);
                          }}
                          className="text-[11px] font-bold text-slate-300 hover:text-emerald-400 bg-gym-900 hover:bg-gym-800 border border-gym-700/80 px-3 py-1.5 rounded-xl flex items-center space-x-1.5 active:scale-95 transition cursor-pointer"
                        >
                          <span>📝</span>
                          <span>{effectiveSets.length === 0 ? 'Внести подходы' : 'Править подходы'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setWorkoutToDelete(w);
                          }}
                          className="text-[11px] font-bold text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 px-3 py-1.5 rounded-xl flex items-center space-x-1.5 active:scale-95 transition cursor-pointer"
                          title="Удалить эту тренировку"
                        >
                          <span>🗑️</span>
                          <span>Удалить</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
          })
        )}
      </div>

      {showAddPastModal && (
        <AddPastWorkoutModal
          isOpen={showAddPastModal}
          onClose={() => setShowAddPastModal(false)}
          exercises={exercises}
          onSaved={() => {
            if (typeof onRefresh === 'function') onRefresh();
          }}
        />
      )}

      {/* Restore / Add Sets to Existing Workout Modal */}
      {editingWorkoutForSets && (
        <AddSetsToWorkoutModal
          isOpen={!!editingWorkoutForSets}
          workout={editingWorkoutForSets}
          onClose={() => setEditingWorkoutForSets(null)}
          exercises={exercises}
          onSaved={(updatedW) => {
            setWorkoutDetailsCache(prev => ({ ...prev, [updatedW.id]: updatedW }));
            if (typeof onRefresh === 'function') onRefresh();
          }}
        />
      )}

      {/* Edit Set Modal */}
      {editingSet && (
        <EditSetModal
          set={editingSet}
          onClose={() => setEditingSet(null)}
          onSave={handleSaveHistorySet}
          onDelete={handleDeleteHistorySet}
        />
      )}

      {/* Delete Workout Modal */}
      {workoutToDelete && (
        <DeleteWorkoutModal
          isOpen={!!workoutToDelete}
          workout={workoutToDelete}
          onClose={() => setWorkoutToDelete(null)}
          onDeleted={() => {
            if (typeof onRefresh === 'function') onRefresh();
          }}
        />
      )}
    </div>
  );
}

// ==========================================
// 📚 EXERCISES DIRECTORY SCREEN
// ==========================================
function ExercisesScreen({ exercises, exerciseGuides = {}, onRefresh }) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [newExName, setNewExName] = useState('');
  const [newExCat, setNewExCat] = useState('Грудь');
  const [search, setSearch] = useState('');
  const [selectedGuideEx, setSelectedGuideEx] = useState(null);

  const filteredExercises = exercises.filter(ex => 
    ex.name.toLowerCase().includes(search.toLowerCase()) || 
    ex.category.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newExName.trim()) return;
    try {
      const res = await fetch('/api/exercises', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newExName.trim(), category: newExCat })
      });
      if (res.ok) {
        setNewExName('');
        setShowAddModal(false);
        onRefresh();
      } else {
        const err = await res.json();
        alert(err.detail || 'Ошибка при создании упражнения');
      }
    } catch (e) {
      alert('Ошибка соединения');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-extrabold text-slate-300 uppercase tracking-wider">База упражнений</h2>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-emerald-500 hover:bg-emerald-400 text-gym-950 font-bold text-xs px-3 py-1.5 rounded-xl flex items-center space-x-1 transition shadow-md shadow-emerald-500/20 active:scale-95"
        >
          <Icons.Plus />
          <span>Добавить</span>
        </button>
      </div>

      {/* Quick Search Bar */}
      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск упражнения или группы мышц..."
          className="w-full bg-gym-900 border border-gym-800 rounded-2xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition"
        />
        {search && (
          <button 
            onClick={() => setSearch('')}
            className="absolute right-3 top-2.5 text-slate-400 hover:text-white text-xs"
          >
            ✕
          </button>
        )}
      </div>

      <div className="bg-gym-900 border border-gym-800 rounded-3xl divide-y divide-gym-800/80 overflow-hidden shadow">
        {filteredExercises.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs">
            Ничего не найдено
          </div>
        ) : (
          filteredExercises.map((ex) => {
            const hasGuide = !!exerciseGuides[ex.name];
            return (
              <div key={ex.id} className="p-3.5 flex items-center justify-between hover:bg-gym-850 transition">
                <div className="space-y-1 pr-2">
                  <span className="font-bold text-sm text-slate-100 block">{ex.name}</span>
                  <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-lg border ${categoryColors[ex.category] || categoryColors['Базовые']}`}>
                    {ex.category}
                  </span>
                </div>
                
                {hasGuide && (
                  <button
                    onClick={() => setSelectedGuideEx(ex.name)}
                    className="shrink-0 text-[11px] text-sky-400 hover:text-white bg-sky-500/15 hover:bg-sky-500/25 px-2.5 py-1.5 rounded-xl border border-sky-500/40 flex items-center space-x-1 font-bold active:scale-95 transition"
                  >
                    <svg className="w-3 h-3 text-sky-400" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                    <span>Техника</span>
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Technique Modal in Exercise Encyclopedia */}
      <ExerciseVideoModal
        isOpen={!!selectedGuideEx}
        onClose={() => setSelectedGuideEx(null)}
        exerciseName={selectedGuideEx}
        guide={exerciseGuides[selectedGuideEx]}
      />

      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-gym-900 border border-gym-700 rounded-3xl p-5 max-w-xs w-full space-y-4 shadow-2xl">
            <h3 className="font-extrabold text-base text-white">Новое упражнение</h3>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Название</label>
                <input
                  type="text"
                  required
                  placeholder="Например: Жим лежа"
                  value={newExName}
                  onChange={(e) => setNewExName(e.target.value)}
                  className="w-full bg-gym-950 border border-gym-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">Категория</label>
                <select
                  value={newExCat}
                  onChange={(e) => setNewExCat(e.target.value)}
                  className="w-full bg-gym-950 border border-gym-700 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500"
                >
                  <option value="Грудь">Грудь</option>
                  <option value="Спина">Спина</option>
                  <option value="Плечи">Плечи</option>
                  <option value="Руки">Руки</option>
                  <option value="Ноги">Ноги</option>
                  <option value="Пресс">Пресс</option>
                </select>
              </div>

              <div className="flex space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2.5 bg-gym-800 text-slate-300 font-bold text-xs rounded-xl"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-emerald-500 text-gym-950 font-extrabold text-xs rounded-xl shadow-lg shadow-emerald-500/20"
                >
                  Создать
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// 👤 USER PROFILE SCREEN ("О СЕБЕ")
// ==========================================
function ProfileScreen({ profile, onUpdateProfile, onRestartOnboarding, onOpenAccountModal }) {
  const [formData, setFormData] = useState({
    name: 'Атлет',
    gender: 'male',
    age: 28,
    height: 180,
    weight: 80,
    experience_level: 'intermediate',
    fitness_goal: 'hypertrophy',
    injuries: '',
    equipment: 'gym',
    ...profile
  });

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    if (profile) {
      setFormData(prev => ({ ...prev, ...profile }));
    }
  }, [profile]);

  const heightM = (parseFloat(formData.height) || 180) / 100;
  const weightKg = parseFloat(formData.weight) || 80;
  const bmi = heightM > 0 ? (weightKg / (heightM * heightM)).toFixed(1) : 24.5;
  const bmiLabel = bmi < 18.5 ? 'Дефицит веса' : bmi <= 25 ? 'Норма' : bmi <= 30 ? 'Плотное' : 'Избыток';

  const commonInjuries = ['Плечи', 'Поясница', 'Колени', 'Кисти / Локти'];

  const toggleInjury = (name) => {
    const key = name.toLowerCase().split('/')[0].trim();
    const currentList = (formData.injuries || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    let updated;
    if (currentList.some(item => item.includes(key))) {
      updated = currentList.filter(item => !item.includes(key));
    } else {
      updated = [...currentList, key];
    }
    setFormData(prev => ({ ...prev, injuries: updated.join(', ') }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSaveSuccess(false);
    const payload = {
      ...formData,
      age: parseInt(formData.age, 10) || 28,
      height: parseFloat(formData.height) || 180,
      weight: parseFloat(formData.weight) || 80
    };
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const updated = await res.json();
        setFormData(updated);
        if (typeof onUpdateProfile === 'function') {
          onUpdateProfile(updated);
        }
        setSaveSuccess(true);
        triggerHaptic('success');
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(errData.detail || 'Ошибка при сохранении профиля');
      }
    } catch (err) {
      console.error('Save profile error:', err);
      alert('Ошибка при сохранении: ' + (err.message || 'Сбой соединения'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 pb-4">
      {/* Title */}
      <div className="px-1">
        <h2 className="text-sm font-extrabold text-slate-300 uppercase tracking-wider">Профиль спортсмена (О себе)</h2>
        <p className="text-[11px] text-slate-400 mt-0.5">Данные тела и здоровья используются алгоритмом для адаптации тренировок</p>
      </div>

      <form onSubmit={handleSave} className="space-y-3">
        {/* Section 1: Body stats */}
        <div className="bg-gym-900 border border-gym-800 rounded-3xl p-4 space-y-3 shadow-lg">
          <span className="text-[11px] font-black text-sky-400 uppercase tracking-wider block">
            📏 Физические параметры
          </span>

          <div className="grid grid-cols-2 gap-2.5">
            {/* Weight */}
            <div className="bg-gym-950/90 border border-gym-800 rounded-2xl p-3 flex flex-col justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Вес тела</span>
              <div className="flex items-baseline space-x-1 my-1">
                <input
                  type="text"
                  inputMode="decimal"
                  required
                  value={formData.weight}
                  onFocus={(e) => e.target.select()}
                  onClick={(e) => e.target.select()}
                  onChange={(e) => setFormData({ ...formData, weight: cleanNumericInput(e.target.value, true) })}
                  className="w-20 bg-transparent text-2xl font-black text-white focus:outline-none font-mono"
                />
                <span className="text-xs text-slate-400 font-bold">кг</span>
              </div>
              <span className="text-[9px] text-slate-500 font-mono">Расчет базовых весов</span>
            </div>

            {/* Height */}
            <div className="bg-gym-950/90 border border-gym-800 rounded-2xl p-3 flex flex-col justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Рост</span>
              <div className="flex items-baseline space-x-1 my-1">
                <input
                  type="text"
                  inputMode="numeric"
                  required
                  value={formData.height}
                  onFocus={(e) => e.target.select()}
                  onClick={(e) => e.target.select()}
                  onChange={(e) => setFormData({ ...formData, height: cleanNumericInput(e.target.value, false) })}
                  className="w-20 bg-transparent text-2xl font-black text-white focus:outline-none font-mono"
                />
                <span className="text-xs text-slate-400 font-bold">см</span>
              </div>
              <span className="text-[9px] text-emerald-400 font-mono">ИМТ: {bmi} ({bmiLabel})</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {/* Age */}
            <div className="bg-gym-950/90 border border-gym-800 rounded-2xl p-3">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Возраст</span>
              <div className="flex items-baseline space-x-1">
                <input
                  type="text"
                  inputMode="numeric"
                  value={formData.age}
                  onFocus={(e) => e.target.select()}
                  onClick={(e) => e.target.select()}
                  onChange={(e) => setFormData({ ...formData, age: cleanNumericInput(e.target.value, false) })}
                  className="w-16 bg-transparent text-xl font-black text-white focus:outline-none font-mono"
                />
                <span className="text-xs text-slate-400 font-bold">лет</span>
              </div>
            </div>

            {/* Gender */}
            <div className="bg-gym-950/90 border border-gym-800 rounded-2xl p-3">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Пол</span>
              <div className="flex space-x-1 mt-1">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, gender: 'male' })}
                  className={`flex-1 py-1 rounded-xl text-xs font-bold transition ${formData.gender === 'male' ? 'bg-sky-500 text-gym-950 font-black' : 'bg-gym-800 text-slate-300'}`}
                >
                  Муж
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, gender: 'female' })}
                  className={`flex-1 py-1 rounded-xl text-xs font-bold transition ${formData.gender === 'female' ? 'bg-sky-500 text-gym-950 font-black' : 'bg-gym-800 text-slate-300'}`}
                >
                  Жен
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Goals & Level */}
        <div className="bg-gym-900 border border-gym-800 rounded-3xl p-4 space-y-3 shadow-lg">
          <span className="text-[11px] font-black text-emerald-400 uppercase tracking-wider block">
            🎯 Главная цель и уровень
          </span>

          {/* Fitness Goal */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Цель тренировок</label>
            <div className="grid grid-cols-3 gap-1.5 text-xs">
              {[
                { id: 'hypertrophy', label: '🥩 Масса', desc: '8–12 повт.' },
                { id: 'strength', label: '⚡ Сила', desc: '5–7 повт.' },
                { id: 'fat_loss', label: '🔥 Рельеф', desc: '10–15 повт.' }
              ].map(g => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setFormData({ ...formData, fitness_goal: g.id })}
                  className={`p-2.5 rounded-2xl border flex flex-col items-center justify-center transition active:scale-95 ${
                    formData.fitness_goal === g.id
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400 font-black shadow-md'
                      : 'bg-gym-950/70 text-slate-400 border-gym-800 hover:text-white'
                  }`}
                >
                  <span className="text-xs font-bold">{g.label}</span>
                  <span className="text-[9px] text-slate-400 mt-0.5 font-mono">{g.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Experience Level */}
          <div className="space-y-1 pt-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Опыт в силовом тренинге</label>
            <div className="grid grid-cols-3 gap-1.5 text-xs">
              {[
                { id: 'beginner', label: 'Новичок', desc: '< 1 года' },
                { id: 'intermediate', label: 'Средний', desc: '1–3 года' },
                { id: 'advanced', label: 'Опытный', desc: '3+ года' }
              ].map(l => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setFormData({ ...formData, experience_level: l.id })}
                  className={`p-2 rounded-2xl border flex flex-col items-center justify-center transition active:scale-95 ${
                    formData.experience_level === l.id
                      ? 'bg-sky-500/20 text-sky-300 border-sky-400 font-black shadow-md'
                      : 'bg-gym-950/70 text-slate-400 border-gym-800 hover:text-white'
                  }`}
                >
                  <span className="text-xs font-bold">{l.label}</span>
                  <span className="text-[9px] text-slate-400 mt-0.5">{l.desc}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Section 3: Joint Safety & Injuries */}
        <div className="bg-gym-900 border border-gym-800 rounded-3xl p-4 space-y-2.5 shadow-lg">
          <span className="text-[11px] font-black text-rose-400 uppercase tracking-wider block">
            🛡️ Суставы и травмы (Ограничения)
          </span>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Отметьте уязвимые суставы. Тренер автоматически добавит персональные акценты техники и защиты.
          </p>

          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {commonInjuries.map(inj => {
              const key = inj.toLowerCase().split('/')[0].trim();
              const active = (formData.injuries || '').toLowerCase().includes(key);
              return (
                <button
                  key={inj}
                  type="button"
                  onClick={() => toggleInjury(inj)}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition active:scale-95 flex items-center space-x-1 ${
                    active
                      ? 'bg-rose-500/20 text-rose-300 border-rose-400 shadow-sm'
                      : 'bg-gym-950/70 text-slate-400 border-gym-800 hover:text-white'
                  }`}
                >
                  <span>{active ? '⚠️' : '🛡️'}</span>
                  <span>{inj}</span>
                </button>
              );
            })}
          </div>

          <div className="pt-1">
            <input
              type="text"
              placeholder="Дополнительные травмы (например: шея, колено)"
              value={formData.injuries}
              onChange={(e) => setFormData({ ...formData, injuries: e.target.value })}
              className="w-full bg-gym-950 border border-gym-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 transition"
            />
          </div>
        </div>

        {/* Section 4: Standalone PWA & Account Management */}
        <div className="bg-gym-900 border border-gym-800 rounded-3xl p-4 space-y-3 shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <img src="/static/app-icon.png" alt="GymTracker" className="w-6 h-6 rounded-lg object-cover" />
              <span className="text-[11px] font-black text-sky-400 uppercase tracking-wider block">
                Автономное веб-приложение (PWA)
              </span>
            </div>
            <span className="text-[10px] text-slate-500 font-mono">
              {isStandalonePWA() ? '🚀 PWA Активно' : isInsideTelegram() ? '✈️ Telegram' : '🌐 Веб'}
            </span>
          </div>

          <p className="text-[11px] text-slate-400 leading-relaxed">
            Вы можете запускать GymTracker прямо в <strong>Safari</strong> или <strong>Chrome</strong> и добавить на экран iPhone / Android как отдельное приложение.
          </p>

          {/* Personal URL Copy Card */}
          <div className="bg-gym-950/90 border border-gym-800 rounded-2xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Персональная ссылка с вашим аккаунтом</span>
              <span className="text-[10px] font-mono text-emerald-400 font-bold">{getTelegramUser().id}</span>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                readOnly
                value={window.location.origin + '/?tg_id=' + (getTelegramUser().id.startsWith('tg_') ? getTelegramUser().id.replace('tg_', '') : getTelegramUser().id)}
                className="flex-1 bg-gym-900 border border-gym-800 rounded-xl px-2.5 py-1.5 text-xs font-mono text-slate-300 select-all focus:outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  const url = window.location.origin + '/?tg_id=' + (getTelegramUser().id.startsWith('tg_') ? getTelegramUser().id.replace('tg_', '') : getTelegramUser().id);
                  try {
                    navigator.clipboard.writeText(url);
                    setLinkCopied(true);
                    triggerHaptic('success');
                    setTimeout(() => setLinkCopied(false), 2500);
                  } catch (e) {
                    prompt('Скопируйте ссылку:', url);
                  }
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 active:scale-95 ${
                  linkCopied 
                    ? 'bg-emerald-500 text-gym-950 font-black' 
                    : 'bg-sky-500/20 text-sky-300 border border-sky-500/40 hover:bg-sky-500/30'
                }`}
              >
                {linkCopied ? '✓ Скопировано' : '📋 Копировать'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-0.5">
            <button
              type="button"
              onClick={onOpenAccountModal}
              className="py-2.5 px-3 bg-gym-950 border border-gym-800 hover:border-sky-500/50 rounded-2xl text-xs font-bold text-slate-300 hover:text-white flex items-center justify-center space-x-1.5 transition active:scale-95 shadow-sm"
            >
              <span>📲</span>
              <span>Как установить PWA</span>
            </button>
            <button
              type="button"
              onClick={onOpenAccountModal}
              className="py-2.5 px-3 bg-gym-950 border border-gym-800 hover:border-amber-500/50 rounded-2xl text-xs font-bold text-slate-300 hover:text-white flex items-center justify-center space-x-1.5 transition active:scale-95 shadow-sm"
            >
              <span>🔑</span>
              <span>Сменить TG ID</span>
            </button>
          </div>
        </div>

        {/* Save Button */}
        <button
          type="submit"
          disabled={saving}
          className="w-full py-4 bg-gradient-to-r from-emerald-500 to-emerald-400 hover:from-emerald-400 text-gym-950 font-black text-sm rounded-2xl shadow-lg shadow-emerald-500/20 active:scale-[0.98] transition flex items-center justify-center space-x-2"
        >
          {saving ? (
            <div className="w-5 h-5 border-2 border-gym-950 border-t-transparent rounded-full animate-spin"></div>
          ) : saveSuccess ? (
            <>
              <Icons.Check />
              <span>✓ ПРОФИЛЬ СОХРАНЕН! ПРОГРАММА АДАПТИРОВАНА</span>
            </>
          ) : (
            <>
              <Icons.Check />
              <span>СОХРАНИТЬ ПРОФИЛЬ</span>
            </>
          )}
        </button>

        {/* Re-run Onboarding Wizard button */}
        {onRestartOnboarding && (
          <button
            type="button"
            onClick={onRestartOnboarding}
            className="w-full py-3 bg-gym-950/80 hover:bg-gym-850 text-slate-300 font-bold text-xs rounded-2xl border border-gym-800 flex items-center justify-center space-x-2 transition active:scale-95 shadow-sm"
          >
            <span>🔄 Перенастроить вводные данные (Мастер опроса)</span>
          </button>
        )}

        {/* Info Box */}
        <div className="bg-gym-950/60 border border-gym-800/60 rounded-2xl p-3.5 space-y-1.5 text-xs text-slate-400">
          <p className="font-bold text-slate-300">
            🤖 Как профиль адаптирует тренировки:
          </p>
          <ul className="space-y-1 text-[11px] text-slate-400 list-disc list-inside">
            <li><strong>Вес тела:</strong> расчет отягощений и % силы.</li>
            <li><strong>Цель:</strong> автоматическая смена целевых повторений (сила: 5–7, масса: 8–12, рельеф: 10–15).</li>
            <li><strong>Суставы:</strong> Gemini Coach предупреждает о безопасных углах прямо в карточке упражнения.</li>
          </ul>
        </div>
      </form>
    </div>
  );
}

// Mount React Root
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
