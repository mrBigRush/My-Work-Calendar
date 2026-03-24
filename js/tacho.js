import { supabase } from './config.js?v=3';
import { i18n } from './config.js?v=3';
import { isAdmin } from './auth.js';
import {
    formatDate, parseLocal, addDays, fmtDisplay, todayStr,
    timeToDecimal, decimalToTime, calcDayAuto, calcWeeklyCompensation,
    showToast, openModal, closeModal, setToggle
} from './utils.js?v=3';
import { updateAutoInfo } from './calendar.js?v=3';

export let tachoWeekStart = todayStr();
let editingTachoDate = null;
let tachoWeekManuallySet = false;

// ── Helpers ───────────────────────────────────────────
function decimalToHHMM(val) {
    const totalMin = Math.round(val * 60);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return `${h}:${String(m).padStart(2,'0')}`;
}

// ── Week navigation ───────────────────────────────────
export function shiftWeek(dir) {
    tachoWeekManuallySet = true;
    tachoWeekStart = addDays(tachoWeekStart, dir * 7);
    document.getElementById('week-start-picker').value = tachoWeekStart;
    renderTachoWeek(() => document.documentElement.lang || 'pl');
}

export function onWeekStartPicked() {
    tachoWeekManuallySet = true;
    tachoWeekStart = document.getElementById('week-start-picker').value;
    renderTachoWeek(() => document.documentElement.lang || 'pl');
}

// ── Rendering ─────────────────────────────────────────
export async function renderTachoWeek(getLang) {
    const container = document.getElementById('tacho-cards');
    container.innerHTML = '<div class="p-8 text-center text-muted animate-pulse">Завантаження...</div>';

    const { data: allData, error } = await supabase
        .from('driving_days')
        .select('*')
        .order('date', { ascending: true });

    if (error) {
        container.innerHTML = `<div class="p-4 text-red-500">Помилка: ${error.message}</div>`;
        return;
    }

    // ЛОГІКА АВТО-ВИЗНАЧЕННЯ ТИЖНЯ (з урахуванням пауз > 24г та пропущених днів)
    if (!tachoWeekManuallySet && allData && allData.length > 0) {
        let detectedStart = allData[0].date;
        for (let i = 1; i < allData.length; i++) {
            const prev = allData[i - 1];
            const curr = allData[i];
            const d1 = parseLocal(prev.date);
            const d2 = parseLocal(curr.date);
            const diffDays = (d2 - d1) / (1000 * 60 * 60 * 24);

            if (diffDays > 1 || (prev.rest_hours && prev.rest_hours >= 24)) {
                detectedStart = curr.date;
            }
        }
        tachoWeekStart = detectedStart;
        document.getElementById('week-start-picker').value = tachoWeekStart;
    }

    const endOfWeek = addDays(tachoWeekStart, 6);
    const weekData = allData.filter(d => d.date >= tachoWeekStart && d.date <= endOfWeek);

    container.innerHTML = '';

    // СТАТИСТИКА
    let totalDriving = 0;
    let count10h = 0;
    let count15h = 0;
    let count9h = 0;
    let lastRestVal = 0;

    weekData.forEach(day => {
        const dVal = parseFloat(day.driving_hours) || 0;
        totalDriving += dVal;
        if (day.used_extended_10) count10h++;
        if (day.used_extended_15) count15h++;
        if (day.reduced_rest_9h) count9h++;
        if (day.rest_hours) lastRestVal = day.rest_hours;
    });

    document.getElementById('val-driving-hours').innerText = `${decimalToHHMM(totalDriving)} / 56h`;
    document.getElementById('val-ext10').innerText = `${count10h} / 2`;
    document.getElementById('val-ext15').innerText = `${count15h} / 3`;
    document.getElementById('val-short-rests').innerText = `${count9h} / 3`;
    document.getElementById('val-last-rest').innerText = lastRestVal > 0 ? lastRestVal.toFixed(1) + 'h' : '—';

    // Компенсація
    const comp = calcWeeklyCompensation(weekData, allData);
    const compEl = document.getElementById('val-compensation');
    if (comp.compensationOwed > 0) {
        compEl.innerText = `+${comp.compensationOwed.toFixed(1)}h`;
        compEl.className = 'font-bold text-orange-600';
    } else {
        compEl.innerText = i18n[getLang()]?.compensationNone || 'brak';
        compEl.className = 'text-muted';
    }

    if (weekData.length === 0) {
        container.innerHTML = '<div class="p-8 text-center text-muted">Немає даних</div>';
        return;
    }

    weekData.forEach(day => {
        const card = document.createElement('div');
        card.className = 'bg-white border border-[var(--border)] rounded-2xl p-4 shadow-sm relative';
        if (isAdmin) card.classList.add('cursor-pointer', 'hover:border-[var(--accent)]');
        card.onclick = () => { if(isAdmin) openTachoModal(day.date, getLang); };
        card.innerHTML = `
            <div class="flex justify-between items-start mb-2">
                <span class="font-bold text-sm" style="font-family:var(--mono)">${fmtDisplay(parseLocal(day.date))}</span>
                <span class="text-[10px] uppercase px-2 py-0.5 rounded-full bg-[var(--accent-light)] text-[var(--accent)] font-bold">
                    ${decimalToHHMM(day.driving_hours)}H
                </span>
            </div>
            <div class="grid grid-cols-2 gap-2 text-[11px] text-muted">
                <div>Start: <span class="text-[var(--text)]">${day.start_time || '--:--'}</span></div>
                <div>End: <span class="text-[var(--text)]">${day.end_time || '--:--'}</span></div>
                <div>Rest: <span class="text-[var(--text)]">${day.rest_hours ? day.rest_hours.toFixed(1)+'h' : '--'}</span></div>
            </div>
        `;
        container.appendChild(card);
    });
}

// ── Modal Actions ─────────────────────────────────────
export async function openTachoModal(dateStr, getLang) {
    editingTachoDate = dateStr;
    const { data: existing } = await supabase.from('driving_days').select('*').eq('date', dateStr).single();
    const { data: prevDays } = await supabase.from('driving_days').select('end_time').lt('date', dateStr).order('date', {desc:true}).limit(1);
    
    const prevEnd = prevDays?.[0]?.end_time || null;
    document.getElementById('t-inp-start').dataset.prevEnd = prevEnd || '';

    document.getElementById('t-inp-start').value = existing?.start_time || '';
    document.getElementById('t-inp-end').value = existing?.end_time || '';
    document.getElementById('t-inp-driving').value = existing?.driving_hours ? decimalToTime(parseFloat(existing.driving_hours)) : '';
    
    document.getElementById('t-btn-delete').style.display = existing ? '' : 'none';
    updateAutoInfo('t', getLang);
    openModal('modal-tacho');
}

export async function saveTacho(getLang) {
    const s = document.getElementById('t-inp-start').value || null;
    const e = document.getElementById('t-inp-end').value || null;
    const drTime = document.getElementById('t-inp-driving').value;
    const prevEnd = document.getElementById('t-inp-start').dataset.prevEnd || null;

    const { ext10, ext15, reduced_rest_9h, restHours } = calcDayAuto(drTime, s, e, prevEnd);

    await supabase.from('driving_days').upsert({
        date: editingTachoDate,
        start_time: s, end_time: e,
        driving_hours: timeToDecimal(drTime),
        used_extended_10: ext10, used_extended_15: ext15,
        reduced_rest_9h: reduced_rest_9h,
        rest_hours: restHours !== null ? parseFloat(restHours.toFixed(2)) : null,
    }, { onConflict: 'date' });

    closeModal('modal-tacho');
    renderTachoWeek(getLang);
    showToast(i18n[getLang()].reportCopied); 
}

export async function deleteTacho(getLang) {
    if (!confirm('Видалити цей день?')) return;
    await supabase.from('driving_days').delete().eq('date', editingTachoDate);
    closeModal('modal-tacho');
    renderTachoWeek(getLang);
        }
