import { supabase } from './config.js';
import { i18n } from './config.js';
import { isAdmin } from './auth.js';
import {
    formatDate, parseLocal, addDays, fmtDisplay, todayStr,
    timeToDecimal, decimalToTime, calcDayAuto, calcWeeklyCompensation,
    showToast, openModal, closeModal, setToggle
} from './utils.js';
import { updateAutoInfo } from './calendar.js';

export let tachoWeekStart = todayStr();
let editingTachoDate = null;

// ── Week navigation ───────────────────────────────────
export function shiftWeek(dir) {
    tachoWeekStart = addDays(tachoWeekStart, dir * 7);
    document.getElementById('week-start-picker').value = tachoWeekStart;
    renderTachoWeek(null); // getLang injected via window
}

export function onWeekStartPicked() {
    tachoWeekStart = document.getElementById('week-start-picker').value;
    renderTachoWeek(null);
}

// ── Main render ───────────────────────────────────────
export async function renderTachoWeek(getLang) {
    const lang = getLang ? getLang() : window._getLang();
    const t = i18n[lang];

    const { data } = await supabase.from('driving_days').select('*');
    const all = (data || []).map(r => ({ ...r, date: r.date?.slice(0, 10) }));

    const ws = tachoWeekStart;
    const we = addDays(ws, 6);
    document.getElementById('week-start-picker').value = ws;
    document.getElementById('week-end-label').innerText = `→ ${fmtDisplay(parseLocal(we))}`;

    const weekDates = [];
    for (let i = 0; i < 7; i++) weekDates.push(addDays(ws, i));

    const wd = all.filter(r => weekDates.includes(r.date));

    // ── Weekly stats ──
    const totalDr  = wd.reduce((s, r) => s + (parseFloat(r.driving_hours) || 0), 0);
    const e10      = wd.filter(r => r.used_extended_10).length;
    const e15      = wd.filter(r => r.used_extended_15).length;
    const sr       = wd.filter(r => r.reduced_rest_9h).length;

    // Last rest before week start: find the day just before week
    const dayBeforeWeek = all.find(r => r.date === addDays(ws, -1));
    const firstDayOfWeek = wd.find(r => r.date === ws);
    let lastRestHours = null;
    if (dayBeforeWeek?.end_time && firstDayOfWeek?.start_time) {
        lastRestHours = timeToDecimal(firstDayOfWeek.start_time) - timeToDecimal(dayBeforeWeek.end_time);
        if (lastRestHours < 0) lastRestHours += 24;
    }

    // Compensation: sum of (45 - rest) for all 24–45h rests in week
    let compensationOwed = 0;
    wd.forEach(r => {
        const rest = parseFloat(r.rest_hours);
        if (rest >= 24 && rest < 45) compensationOwed += (45 - rest);
    });

    setBar('driving',     totalDr, 56, `${totalDr.toFixed(1)}/56h`);
    setBar('ext10',       e10,     2,  `${e10}/2`);
    setBar('ext15',       e15,     2,  `${e15}/2`);
    setBar('short-rests', sr,      3,  `${sr}/3`);

    // Last rest info
    updateRestInfo(lastRestHours, t);

    // Compensation info
    updateCompensationInfo(compensationOwed, t);

    // ── Day rows ──
    const list = document.getElementById('days-list');
    list.innerHTML = '';

    weekDates.forEach(ds => {
        const d   = parseLocal(ds);
        const rec = wd.find(r => r.date === ds);
        const dn  = t.dayNames[d.getDay()];

        const row = document.createElement('div');
        row.className = 'day-row' + (rec ? ' has-data' : '') + (isAdmin ? ' clickable' : '');
        if (isAdmin) row.onclick = () => openTachoModal(ds, rec || null, getLang || (() => window._getLang()));

        let right = '';
        if (rec) {
            const ts = rec.start_time && rec.end_time
                ? `${rec.start_time.slice(0, 5)} — ${rec.end_time.slice(0, 5)}` : '';
            const badges = [];
            if (rec.used_extended_10) badges.push(`<span class="badge badge-10">+10h</span>`);
            if (rec.used_extended_15) badges.push(`<span class="badge badge-15">+15h</span>`);
            if (rec.reduced_rest_9h)  badges.push(`<span class="badge badge-9h">9h↓</span>`);
            const dh = parseFloat(rec.driving_hours) || 0;
            // Show rest hours between days
            const rh = parseFloat(rec.rest_hours);
            if (rh > 0) badges.push(`<span class="badge" style="background:var(--bg);color:var(--muted)">↩ ${rh.toFixed(1)}h</span>`);

            right = `<div class="text-right">
                ${ts ? `<p class="day-hours">${ts}</p>` : ''}
                ${dh > 0 ? `<p class="text-[10px] text-[var(--muted)]" style="font-family:var(--mono)">🚗 ${dh.toFixed(1)}h</p>` : ''}
                ${badges.length ? `<div class="flex gap-1 justify-end mt-1 flex-wrap">${badges.join('')}</div>` : ''}
            </div>`;
        } else if (isAdmin) {
            right = `<span class="text-[11px] text-[var(--accent)]" style="font-family:var(--mono)">+ dodaj</span>`;
        }

        row.innerHTML = `<div class="flex justify-between items-center">
            <div><p class="day-name">${dn}</p><p class="day-date">${d.getDate()}.${String(d.getMonth()+1).padStart(2,'0')}</p></div>
            ${right}
        </div>`;
        list.appendChild(row);
    });
}

function updateRestInfo(hours, t) {
    const el = document.getElementById('rest-info-block');
    if (!el) return;
    if (hours === null) { el.style.display = 'none'; return; }
    el.style.display = '';
    const valEl = document.getElementById('val-last-rest');
    let color = 'var(--accent)';
    let label = `${hours.toFixed(1)}h`;
    if (hours < 9)        { color = 'var(--red)';    label += ' ⚠'; }
    else if (hours < 11)  { color = 'var(--orange)'; label += ' (9h↓)'; }
    else if (hours >= 45) { color = 'var(--accent)'; label += ' (tygodniowy)'; }
    if (valEl) { valEl.innerText = label; valEl.style.color = color; }
}

function updateCompensationInfo(hours, t) {
    const el = document.getElementById('compensation-block');
    if (!el) return;
    if (hours <= 0) {
        document.getElementById('val-compensation').innerText = t.compensationNone;
        document.getElementById('val-compensation').style.color = 'var(--accent)';
    } else {
        document.getElementById('val-compensation').innerText = `+${hours.toFixed(1)}h`;
        document.getElementById('val-compensation').style.color = 'var(--red)';
    }
}

function setBar(id, val, max, label) {
    const pct = Math.min((val / max) * 100, 100);
    const bar = document.getElementById(`bar-${id}`);
    const el  = document.getElementById(`val-${id}`);
    if (!bar || !el) return;
    bar.style.width = pct + '%';
    el.innerText = label;
    el.style.color = pct >= 100 ? 'var(--red)' : pct >= 75 ? 'var(--orange)' : 'var(--accent)';
    el.style.fontFamily  = 'var(--mono)';
    el.style.fontSize    = '0.6rem';
    el.style.fontWeight  = '600';
}

// ── Tacho modal ───────────────────────────────────────
async function openTachoModal(dateStr, existing, getLang) {
    editingTachoDate = dateStr;
    const lang = getLang();
    const t = i18n[lang];
    const d = parseLocal(dateStr);
    document.getElementById('modal-tacho-date').innerText =
        `${t.dayNames[d.getDay()]}, ${fmtDisplay(d)}`;

    // Load prev day end_time
    const prevDate = addDays(dateStr, -1);
    const { data: prevData } = await supabase.from('driving_days')
        .select('end_time').eq('date', prevDate).maybeSingle();

    // Set prevEnd FIRST, then populate fields
    document.getElementById('t-inp-start').dataset.prevEnd = prevData?.end_time?.slice(0, 5) || '';

    document.getElementById('t-inp-start').value   = existing?.start_time?.slice(0, 5) || '';
    document.getElementById('t-inp-end').value     = existing?.end_time?.slice(0, 5) || '';
    document.getElementById('t-inp-driving').value = existing?.driving_hours
        ? decimalToTime(parseFloat(existing.driving_hours)) : '';
    setToggle('t-tog-9h', !!existing?.reduced_rest_9h);

    document.getElementById('t-btn-delete').style.display = existing ? '' : 'none';
    updateAutoInfo('t', getLang);
    openModal('modal-tacho');
}

export async function saveTacho(getLang) {
    const lang = getLang();
    const s = document.getElementById('t-inp-start').value || null;
    const e = document.getElementById('t-inp-end').value || null;
    const drTime = document.getElementById('t-inp-driving').value;
    const prevEnd = document.getElementById('t-inp-start').dataset.prevEnd || null;

    const { ext10, ext15, reduced_rest_9h, restHours } =
        calcDayAuto(drTime, s, e, prevEnd);

    const r9h = document.getElementById('t-tog-9h').classList.contains('on') || reduced_rest_9h;

    await supabase.from('driving_days').upsert({
        date: editingTachoDate,
        start_time: s, end_time: e,
        driving_hours: timeToDecimal(drTime),
        used_extended_10: ext10, used_extended_15: ext15,
        reduced_rest_9h: r9h,
        rest_hours: restHours !== null ? parseFloat(restHours.toFixed(2)) : null,
        short_breaks_count: 0,
    }, { onConflict: 'date' });

    closeModal('modal-tacho');
    showToast(i18n[lang].save + ' ✓');
    renderTachoWeek(getLang);
}

export async function deleteTacho(getLang) {
    await supabase.from('driving_days').delete().eq('date', editingTachoDate);
    closeModal('modal-tacho');
    renderTachoWeek(getLang);
}
