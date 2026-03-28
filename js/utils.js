// ── Date helpers ──────────────────────────────────────
export function formatDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export function parseLocal(s) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
}

export function addDays(dateStr, n) {
    const d = parseLocal(dateStr);
    d.setDate(d.getDate() + n);
    return formatDate(d);
}

export function fmtDisplay(d) {
    return `${d.getDate()}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
}

export function todayStr() {
    return formatDate(new Date());
}

// ── Time helpers ──────────────────────────────────────
export function timeToDecimal(t) {
    if (!t) return 0;
    const [h, m] = t.split(':').map(Number);
    return h + (m || 0) / 60;
}

export function decimalToTime(v) {
    if (!v && v !== 0) return '';
    const h = Math.floor(v);
    const m = Math.round((v - h) * 60);
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

// ── EU tachograph logic ───────────────────────────────

/**
 * Розраховує автоматичні поля для одного дня.
 * @param {string} drivingTime  - "HH:MM" годин їзди
 * @param {string} startTime    - "HH:MM" початок роботи сьогодні
 * @param {string} endTime      - "HH:MM" кінець роботи сьогодні
 * @param {string|null} prevEndTime  - "HH:MM" кінець роботи вчора (або null)
 * @returns {{ ext10, ext15, reduced_rest_9h, restHours, restType }}
 */
export function calcDayAuto(drivingTime, startTime, endTime, prevEndTime) {
    const driving = timeToDecimal(drivingTime);

    // +10h їзди: більше 9 годин
    const ext10 = driving > 9;

    // +15h робочий день: тривалість зміни більше 13 годин
    // (стандарт EU: робочий день >13г вважається подовженим до 15г ліміту)
    let ext15 = false;
    let workHours = 0;
    if (startTime && endTime) {
        const s = timeToDecimal(startTime);
        const e = timeToDecimal(endTime);
        workHours = e - s;
        if (workHours < 0) workHours += 24; // нічна зміна через північ
        workHours = Math.round(workHours * 100) / 100; // прибираємо floating point похибку
        ext15 = workHours > 13;
    }

    // Відпочинок між змінами
    let restHours = null;
    let restType = null;
    let reduced_rest_9h = false;

    if (prevEndTime && startTime) {
        const s = timeToDecimal(startTime);
        const p = timeToDecimal(prevEndTime);
        restHours = s - p;
        if (restHours < 0) restHours += 24;
        restHours = Math.round(restHours * 100) / 100;

        if (restHours >= 45) {
            restType = 'weekly45';
        } else if (restHours >= 24) {
            restType = 'weekly24';
        } else if (restHours >= 9 && restHours < 11) {
            restType = 'reduced9h';
            reduced_rest_9h = true;
        } else if (restHours >= 11) {
            restType = 'normal';
        }
    }

    return { ext10, ext15, reduced_rest_9h, restHours, restType, workHours, driving };
}

/**
 * Розраховує компенсацію скороченого тижневого відпочинку.
 * Якщо був відпочинок 24–45г, водій має компенсувати різницю до 45г
 * у наступні 3 тижні.
 * @param {Array} weekData - записи driving_days за тиждень
 * @param {Array} allData  - всі записи (для пошуку відпочинків)
 * @returns {{ shortWeeklyRests: number, compensationOwed: number }}
 */
export function calcWeeklyCompensation(weekData, allData) {
    // Знаходимо паузи ≥ 24г в межах тижня (за кінцем попереднього дня)
    let compensationOwed = 0;
    let shortWeeklyRests = 0;

    // Сортуємо всі дані по даті
    const sorted = [...allData].sort((a, b) => a.date > b.date ? 1 : -1);

    weekData.forEach(rec => {
        if (!rec.rest_hours) return;
        const rest = parseFloat(rec.rest_hours);
        if (rest >= 24 && rest < 45) {
            shortWeeklyRests++;
            compensationOwed += (45 - rest);
        }
    });

    return { shortWeeklyRests, compensationOwed };
}

// ── DOM helpers ───────────────────────────────────────
export function showToast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2000);
}

export function openModal(id)  { document.getElementById(id).classList.add('open'); }
export function closeModal(id) { document.getElementById(id).classList.remove('open'); }

export function setToggle(id, val) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('on', val);
}
