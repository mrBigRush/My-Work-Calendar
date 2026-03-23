import { supabase } from './config.js?v=3';
import { i18n } from './config.js?v=3';
import { isAdmin } from './auth.js';
import {
    formatDate, parseLocal, addDays, fmtDisplay,
    timeToDecimal, decimalToTime, calcDayAuto,
    showToast, openModal, closeModal, setToggle
} from './utils.js?v=3';

let allCalData = [];
let editingDates = [];
let editingDayType = null;
let dBreaks = 0;

// ── Calendar init ─────────────────────────────────────
export function initCalendar(getLang) {
    const calEl = document.getElementById('calendar');
    window.calendar = new FullCalendar.Calendar(calEl, {
        initialView: 'dayGridMonth',
        locale: getLang(),
        firstDay: 1,
        selectable: isAdmin,
        headerToolbar: { left: 'prev,next', center: 'title', right: 'today' },
        datesSet: () => refreshStats(),
        events: async (info, cb) => {
            const { data: cd } = await supabase.from('work_days').select('*');
            allCalData = cd || [];
            refreshStats();
            cb(allCalData.map(d => ({
                title: i18n[getLang()][d.type] || d.type,
                start: d.date, allDay: true,
                className: `type-${d.type}`
            })));
            const { data: td } = await supabase.from('driving_days').select('date');
            setTimeout(() => markTachoDays((td || []).map(r => r.date)), 150);
        },
        dateClick: (info) => {
            if (!isAdmin) return;
            editingDates = [info.dateStr];
            openDayModal(info.dateStr, false, getLang);
        },
        eventClick: (info) => {
            if (!isAdmin) return;
            const dateStr = formatDate(new Date(info.event.start));
            editingDates = [dateStr];
            openDayModal(dateStr, false, getLang);
        },
        select: (info) => {
            if (!isAdmin) return;
            editingDates = [];
            let c = new Date(info.start);
            const e = new Date(info.end);
            while (c < e) { editingDates.push(formatDate(c)); c.setDate(c.getDate() + 1); }
            openDayModal(editingDates[0], editingDates.length > 1, getLang);
        },
        eventDisplay: 'block',
        eventInteractive: false,
    });
    window.calendar.render();
}

function markTachoDays(dates) {
    document.querySelectorAll('.has-tacho').forEach(el => el.classList.remove('has-tacho'));
    dates.forEach(ds => {
        const el = document.querySelector(`[data-date="${ds}"]`);
        if (el) el.classList.add('has-tacho');
    });
}

// ── Day modal ─────────────────────────────────────────
async function openDayModal(primaryDate, isMulti, getLang) {
    const t = i18n[getLang()];
    const d = parseLocal(primaryDate);
    document.getElementById('modal-day-title').innerText =
        `${t.dayNames[d.getDay()]}, ${fmtDisplay(d)}` + (isMulti ? ` (+${editingDates.length - 1})` : '');

    const existing = allCalData.find(r => r.date === primaryDate);
    selectChip(existing?.type || null, true);

    document.getElementById('day-tacho-section').style.display = 'none';

    if (!isMulti) {
        await loadTachoIntoDay(primaryDate, getLang);
        // Show tacho section AFTER fields are populated
        if (editingDayType === 'work') {
            document.getElementById('day-tacho-section').style.display = '';
        }
    }

    document.getElementById('d-btn-delete').style.display = existing ? '' : 'none';
    openModal('modal-day');
}

async function loadTachoIntoDay(dateStr, getLang) {
    const { data } = await supabase.from('driving_days')
        .select('*').eq('date', dateStr).maybeSingle();

    const prevDate = addDays(dateStr, -1);
    const { data: prevData } = await supabase.from('driving_days')
        .select('end_time').eq('date', prevDate).maybeSingle();

    // First set prevEnd on the input so calcDayAuto can read it
    document.getElementById('d-inp-start').dataset.prevEnd = prevData?.end_time?.slice(0, 5) || '';

    // Then populate fields
    document.getElementById('d-inp-start').value   = data?.start_time?.slice(0, 5) || '';
    document.getElementById('d-inp-end').value     = data?.end_time?.slice(0, 5) || '';
    document.getElementById('d-inp-driving').value = data?.driving_hours ? decimalToTime(parseFloat(data.driving_hours)) : '';
    setToggle('d-tog-9h', !!data?.reduced_rest_9h);

    // Call AFTER all fields are populated
    updateAutoInfo('d', getLang);
}

export function selectChip(type, silent = false) {
    editingDayType = type;
    ['work', 'vacation', 'sick'].forEach(tp => {
        document.getElementById(`chip-${tp}`).className =
            'type-chip' + (tp === type ? ` sel-${tp}` : '');
    });
    if (!silent) {
        const isMulti = editingDates.length > 1;
        document.getElementById('day-tacho-section').style.display =
            (!isMulti && type === 'work') ? '' : 'none';
    }
}

export async function saveDay(getLang) {
    const lang = getLang();
    if (!editingDayType) { showToast('⚠ ' + i18n[lang].secType + '!'); return; }

    await supabase.from('work_days').upsert(
        editingDates.map(d => ({ date: d, type: editingDayType }))
    );

    if (editingDates.length === 1 && editingDayType === 'work') {
        const s = document.getElementById('d-inp-start').value || null;
        const e = document.getElementById('d-inp-end').value || null;
        const drTime = document.getElementById('d-inp-driving').value;
        const prevEnd = document.getElementById('d-inp-start').dataset.prevEnd || null;

        const { ext10, ext15, reduced_rest_9h, restHours } =
            calcDayAuto(drTime, s, e, prevEnd);

        const dr = timeToDecimal(drTime);
        const r9h = reduced_rest_9h;

        if (s || e || dr > 0 || ext10 || ext15 || r9h) {
            await supabase.from('driving_days').upsert({
                date: editingDates[0],
                start_time: s, end_time: e, driving_hours: dr,
                used_extended_10: ext10, used_extended_15: ext15,
                reduced_rest_9h: r9h,
                rest_hours: restHours !== null ? parseFloat(restHours.toFixed(2)) : null,
                short_breaks_count: 0,
            }, { onConflict: 'date' });
        }
    }

    closeModal('modal-day');
    showToast(i18n[lang].save + ' ✓');
    window.calendar.unselect();
    window.calendar.refetchEvents();
}

export async function deleteDay() {
    await supabase.from('work_days').delete().in('date', editingDates);
    await supabase.from('driving_days').delete().in('date', editingDates);
    closeModal('modal-day');
    window.calendar.unselect();
    window.calendar.refetchEvents();
}

// ── Auto-info display ─────────────────────────────────
export function updateAutoInfo(prefix, getLang) {
    const lang = getLang();
    const t = i18n[lang];
    const drivingEl = document.getElementById(`${prefix}-inp-driving`);
    const startEl   = document.getElementById(`${prefix}-inp-start`);
    const endEl     = document.getElementById(`${prefix}-inp-end`);
    if (!drivingEl || !startEl || !endEl) return;

    const driving = drivingEl.value || '';
    const start   = startEl.value   || '';
    const end     = endEl.value     || '';
    const prevEnd = startEl.dataset.prevEnd || '';

    const { ext10, ext15, restType, restHours, workHours } =
        calcDayAuto(driving, start, end, prevEnd || null);

    const infoEl = document.getElementById(`${prefix}-auto-info`);
    const textEl = document.getElementById(`${prefix}-auto-text`);
    if (!infoEl || !textEl) return;

    const parts = [];
    if (start && end && workHours > 0) {
        const wH = Math.floor(workHours);
        const wM = Math.round((workHours - wH) * 60);
        const wStr = `${String(wH).padStart(2,'0')}:${String(wM).padStart(2,'0')}`;
        parts.push(`⏱ ${wStr} роботи`);
    }
    if (ext10) parts.push(t.autoInfo.ext10);
    if (ext15) parts.push(t.autoInfo.ext15);
    if (restType === 'reduced9h')  parts.push(`${t.autoInfo.rest9h} (${restHours?.toFixed(1)}г)`);
    if (restType === 'normal')     parts.push(t.autoInfo.restNormal);
    if (restType === 'weekly45')   parts.push(t.autoInfo.restWeekly45);
    if (restType === 'weekly24')   parts.push(`${t.autoInfo.restWeekly24} (${restHours?.toFixed(1)}г)`);

    if (parts.length) {
        textEl.innerHTML = parts.map(p => `<span style="display:block">${p}</span>`).join('');
        infoEl.style.display = '';
    } else {
        infoEl.style.display = 'none';
    }
}

// ── Month stats ───────────────────────────────────────
function refreshStats() {
    if (!allCalData || !window.calendar) return;
    const v = window.calendar.getDate();
    const m = v.getMonth(), y = v.getFullYear();
    const c = { work: 0, vacation: 0, sick: 0 };
    allCalData.forEach(item => {
        const d = parseLocal(item.date);
        if (d.getMonth() === m && d.getFullYear() === y) c[item.type]++;
    });
    document.getElementById('stat-work').innerText     = c.work;
    document.getElementById('stat-vacation').innerText = c.vacation;
    document.getElementById('stat-sick').innerText     = c.sick;
}

export function generateReport(getLang) {
    const lang = getLang();
    const date = window.calendar.getDate();
    const monthName = date.toLocaleString('pl', { month: 'long', year: 'numeric' });
    const t = i18n[lang];
    const w = document.getElementById('stat-work').innerText;
    const v = document.getElementById('stat-vacation').innerText;
    const s = document.getElementById('stat-sick').innerText;

    // Завжди польською для SMS до дирекції
    const report =
        `Dzień dobry! Przesyłam podsumowanie za ${monthName} pracownika Serhii Kolomiiets:\n` +
        `✅ Dni pracy: ${w}\n` +
        `🌴 Urlop: ${v}\n` +
        `🏥 Choroba: ${s}`;

    navigator.clipboard.writeText(report).then(() => showToast(t.reportCopied));
}
