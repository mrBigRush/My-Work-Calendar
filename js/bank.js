import { supabase } from './config.js';
import { i18n } from './config.js';
import { isAdmin } from './auth.js';
import {
    formatDate, parseLocal, addDays, fmtDisplay,
    showToast, openModal, closeModal
} from './utils.js';

let currentMonth = new Date();
let editingSalaryRecord = null;
let currentYear = new Date().getFullYear();

// Конфігурація ставок зарплати (можна змінити під реальні)
const SALARY_RATES = {
    workDay: 350,    // Ставка за робочий день (PLN)
    vacation: 150,   // Ставка за день відпустки
    sick: 120,        // Ставка за день хвороби
    tachoBonus: 0   // Бонус за день з тахографом (PLN)
};

// ── Ініціалізація модуля ───────────────────────────────────
export function initBank(getLang) {
    renderSalaryMonth(getLang);
}

// ── Отримання даних про робочі дні за місяць ───────────────
async function getWorkDaysForMonth(year, month, getLang) {
    const startDate = formatDate(new Date(year, month, 1));
    const endDate = formatDate(new Date(year, month + 1, 0));
    
    const { data: workDays } = await supabase
        .from('work_days')
        .select('*')
        .gte('date', startDate)
        .lte('date', endDate);
    
    const { data: drivingDays } = await supabase
        .from('driving_days')
        .select('date')
        .gte('date', startDate)
        .lte('date', endDate);
    
    const tachoDates = new Set((drivingDays || []).map(d => d.date));
    
    return (workDays || []).map(day => ({
        ...day,
        hasTacho: tachoDates.has(day.date)
    }));
}

// ── Отримання записів про зарплату з таблиці bank ─────────
async function getSalaryRecords(year, month) {
    const startDate = formatDate(new Date(year, month, 1));
    const endDate = formatDate(new Date(year, month + 1, 0));
    
    const { data } = await supabase
        .from('bank')
        .select('*')
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true });
    
    return data || [];
}

// ── Розрахунок прогнозованої зарплати ─────────────────────
function calculateProjectedSalary(workDays) {
    let total = 0;
    let workDaysCount = 0;
    let vacationDays = 0;
    let sickDays = 0;
    let tachoBonus = 0;
    
    workDays.forEach(day => {
        switch(day.type) {
            case 'work':
                total += SALARY_RATES.workDay;
                workDaysCount++;
                if (day.hasTacho) {
                    total += SALARY_RATES.tachoBonus;
                    tachoBonus++;
                }
                break;
            case 'vacation':
                total += SALARY_RATES.vacation;
                vacationDays++;
                break;
            case 'sick':
                total += SALARY_RATES.sick;
                sickDays++;
                break;
        }
    });
    
    return {
        total: Math.round(total * 100) / 100,
        workDaysCount,
        vacationDays,
        sickDays,
        tachoBonusCount: tachoBonus
    };
}

// ── Розрахунок фактичної зарплати з таблиці bank ──────────
function calculateActualSalary(records) {
    let total = 0;
    let transfers = 0;
    let cash = 0;
    let other = 0;
    
    records.forEach(record => {
        const amount = parseFloat(record.amount) || 0;
        total += amount;
        
        switch(record.type) {
            case 'transfer':
                transfers += amount;
                break;
            case 'cash':
                cash += amount;
                break;
            default:
                other += amount;
                break;
        }
    });
    
    return {
        total: Math.round(total * 100) / 100,
        transfers: Math.round(transfers * 100) / 100,
        cash: Math.round(cash * 100) / 100,
        other: Math.round(other * 100) / 100,
        recordsCount: records.length
    };
}

// ── Розрахунок річної статистики ──────────────────────────
async function calculateYearStats(year, getLang) {
    const startDate = formatDate(new Date(year, 0, 1));
    const endDate = formatDate(new Date(year, 11, 31));
    
    // Отримуємо всі робочі дні за рік
    const { data: workDays } = await supabase
        .from('work_days')
        .select('*')
        .gte('date', startDate)
        .lte('date', endDate);
    
    const { data: drivingDays } = await supabase
        .from('driving_days')
        .select('date')
        .gte('date', startDate)
        .lte('date', endDate);
    
    const tachoDates = new Set((drivingDays || []).map(d => d.date));
    const workDaysWithTacho = (workDays || []).map(day => ({
        ...day,
        hasTacho: tachoDates.has(day.date)
    }));
    
    // Розрахунок прогнозованої зарплати за рік
    const projected = calculateProjectedSalary(workDaysWithTacho);
    
    // Отримуємо всі банківські транзакції за рік
    const { data: bankRecords } = await supabase
        .from('bank')
        .select('*')
        .gte('date', startDate)
        .lte('date', endDate);
    
    const actual = calculateActualSalary(bankRecords || []);
    
    // Розрахунок місячної розбивки
    const monthlyBreakdown = [];
    for (let month = 0; month < 12; month++) {
        const monthStart = formatDate(new Date(year, month, 1));
        const monthEnd = formatDate(new Date(year, month + 1, 0));
        
        const monthWorkDays = (workDays || []).filter(d => 
            d.date >= monthStart && d.date <= monthEnd
        ).map(d => ({
            ...d,
            hasTacho: tachoDates.has(d.date)
        }));
        
        const monthBank = (bankRecords || []).filter(r => 
            r.date >= monthStart && r.date <= monthEnd
        );
        
        monthlyBreakdown.push({
            month,
            projected: calculateProjectedSalary(monthWorkDays).total,
            actual: calculateActualSalary(monthBank).total
        });
    }
    
    return {
        projected: projected.total,
        actual: actual.total,
        workDaysCount: projected.workDaysCount,
        vacationDays: projected.vacationDays,
        sickDays: projected.sickDays,
        tachoBonusCount: projected.tachoBonusCount,
        monthlyBreakdown
    };
}

// ── Головний рендер вкладки зарплати ──────────────────────
export async function renderSalaryMonth(getLang) {
    const lang = getLang();
    const t = i18n[lang];
    
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    
    // Оновлюємо заголовок місяця
    const monthNames = lang === 'pl' 
        ? ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień']
        : ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];
    
    document.getElementById('salary-month-title').innerText = `${monthNames[month]} ${year}`;
    
    // Отримуємо дані
    const workDays = await getWorkDaysForMonth(year, month, getLang);
    const bankRecords = await getSalaryRecords(year, month);
    
    const projected = calculateProjectedSalary(workDays);
    const actual = calculateActualSalary(bankRecords);
    
    // Оновлюємо статистику
    document.getElementById('stat-work-days').innerText = projected.workDaysCount;
    document.getElementById('stat-vacation-days').innerText = projected.vacationDays;
    document.getElementById('stat-sick-days').innerText = projected.sickDays;
    document.getElementById('stat-tacho-bonus').innerText = projected.tachoBonusCount;
    document.getElementById('stat-projected').innerText = `${projected.total.toFixed(2)} PLN`;
    document.getElementById('stat-actual').innerText = `${actual.total.toFixed(2)} PLN`;
    
    // Різниця між прогнозом і фактом
    const diff = actual.total - projected.total;
    const diffEl = document.getElementById('stat-diff');
    diffEl.innerText = `${diff >= 0 ? '+' : ''}${diff.toFixed(2)} PLN`;
    diffEl.style.color = diff >= 0 ? 'var(--accent)' : 'var(--red)';
    
    // Оновлюємо річну статистику
    const yearStats = await calculateYearStats(year, getLang);
    document.getElementById('year-projected').innerText = `${yearStats.projected.toFixed(2)} PLN`;
    document.getElementById('year-actual').innerText = `${yearStats.actual.toFixed(2)} PLN`;
    const yearDiff = yearStats.actual - yearStats.projected;
    const yearDiffEl = document.getElementById('year-diff');
    yearDiffEl.innerText = `${yearDiff >= 0 ? '+' : ''}${yearDiff.toFixed(2)} PLN`;
    yearDiffEl.style.color = yearDiff >= 0 ? 'var(--accent)' : 'var(--red)';
    
    // Рендеримо список транзакцій
    renderTransactionsList(bankRecords, getLang);
    
    // Рендеримо графік місячної розбивки
    renderMonthlyChart(yearStats.monthlyBreakdown, lang);
}

// ── Рендер списку транзакцій ──────────────────────────────
function renderTransactionsList(records, getLang) {
    const container = document.getElementById('transactions-list');
    const lang = getLang();
    const t = i18n[lang];
    
    if (!records || records.length === 0) {
        container.innerHTML = `<p class="text-center text-[var(--muted)] text-sm py-4">${lang === 'pl' ? 'Brak transakcji' : 'Немає транзакцій'}</p>`;
        return;
    }
    
    const typeLabels = {
        transfer: lang === 'pl' ? 'Przelew' : 'Переказ',
        cash: lang === 'pl' ? 'Gotówka' : 'Готівка',
        other: lang === 'pl' ? 'Inne' : 'Інше'
    };
    
    container.innerHTML = records.map(record => `
        <div class="transaction-item ${isAdmin ? 'clickable' : ''}" data-id="${record.id}" onclick="${isAdmin ? `window._editTransaction('${record.id}')` : ''}">
            <div class="flex justify-between items-center">
                <div>
                    <p class="transaction-date">${fmtDisplay(parseLocal(record.date))}</p>
                    <span class="transaction-type">${typeLabels[record.type] || record.type || '-'}</span>
                    ${record.note ? `<p class="transaction-note">${record.note}</p>` : ''}
                </div>
                <p class="transaction-amount ${parseFloat(record.amount) >= 0 ? 'positive' : 'negative'}">
                    ${parseFloat(record.amount).toFixed(2)} PLN
                </p>
            </div>
        </div>
    `).join('');
}

// ── Рендер графіку місячної розбивки ──────────────────────
function renderMonthlyChart(monthlyBreakdown, lang) {
    const container = document.getElementById('monthly-chart');
    if (!container) return;
    
    const monthLabels = lang === 'pl' 
        ? ['Sty', 'Lut', 'Mar', 'Kwi', 'Maj', 'Cze', 'Lip', 'Sie', 'Wrz', 'Paź', 'Lis', 'Gru']
        : ['Січ', 'Лют', 'Бер', 'Кві', 'Тра', 'Чер', 'Лип', 'Сер', 'Вер', 'Жов', 'Лис', 'Гру'];
    
    const maxValue = Math.max(
        ...monthlyBreakdown.map(m => Math.max(m.projected, m.actual)),
        1
    );
    
    container.innerHTML = `
        <div class="chart-container">
            ${monthlyBreakdown.map((m, i) => `
                <div class="chart-bar-group">
                    <div class="chart-bars">
                        <div class="chart-bar projected" style="height: ${(m.projected / maxValue * 100)}%"></div>
                        <div class="chart-bar actual" style="height: ${(m.actual / maxValue * 100)}%"></div>
                    </div>
                    <span class="chart-label">${monthLabels[i]}</span>
                </div>
            `).join('')}
        </div>
        <div class="chart-legend">
            <span><span class="legend-color projected"></span> ${lang === 'pl' ? 'Prognoza' : 'Прогноз'}</span>
            <span><span class="legend-color actual"></span> ${lang === 'pl' ? 'Faktyczna' : 'Фактична'}</span>
        </div>
    `;
}

// ── Модальне вікно для додавання/редагування транзакції ───
export async function openTransactionModal(dateStr, existingId = null, getLang) {
    const lang = getLang();
    const t = i18n[lang];
    
    editingSalaryRecord = existingId;
    
    let record = null;
    if (existingId) {
        const { data } = await supabase
            .from('bank')
            .select('*')
            .eq('id', existingId)
            .maybeSingle();
        record = data;
    }
    
    const modalDate = dateStr || formatDate(currentMonth);
    const d = parseLocal(modalDate);
    document.getElementById('transaction-modal-title').innerText = 
        existingId 
            ? (lang === 'pl' ? 'Edytuj transakcję' : 'Редагувати транзакцію')
            : (lang === 'pl' ? 'Dodaj transakcję' : 'Додати транзакцію');
    
    document.getElementById('trans-date').value = modalDate;
    document.getElementById('trans-amount').value = record?.amount || '';
    document.getElementById('trans-type').value = record?.type || 'transfer';
    document.getElementById('trans-note').value = record?.note || '';
    
    document.getElementById('trans-delete-btn').style.display = existingId ? '' : 'none';
    
    openModal('modal-transaction');
}

// ── Збереження транзакції ─────────────────────────────────
export async function saveTransaction(getLang) {
    const lang = getLang();
    const date = document.getElementById('trans-date').value;
    const amount = parseFloat(document.getElementById('trans-amount').value);
    const type = document.getElementById('trans-type').value;
    const note = document.getElementById('trans-note').value;
    
    if (isNaN(amount)) {
        showToast(lang === 'pl' ? 'Wprowadź kwotę!' : 'Введіть суму!');
        return;
    }
    
    if (editingSalaryRecord) {
        await supabase
            .from('bank')
            .update({ date, amount, type, note })
            .eq('id', editingSalaryRecord);
    } else {
        await supabase
            .from('bank')
            .insert([{ date, amount, type, note }]);
    }
    
    closeModal('modal-transaction');
    showToast(i18n[lang].save + ' ✓');
    renderSalaryMonth(getLang);
}

// ── Видалення транзакції ──────────────────────────────────
export async function deleteTransaction(getLang) {
    if (!editingSalaryRecord) return;
    
    await supabase
        .from('bank')
        .delete()
        .eq('id', editingSalaryRecord);
    
    closeModal('modal-transaction');
    showToast(i18n[lang].delete + ' ✓');
    renderSalaryMonth(getLang);
}

// ── Навігація по місяцях ──────────────────────────────────
export function shiftMonth(delta) {
    currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + delta, 1);
    renderSalaryMonth(window._getLang);
}

// ── Зміна року для річної статистики ──────────────────────
export function changeYear(delta) {
    currentYear += delta;
    renderSalaryMonth(window._getLang);
}

// ── Додавання нового рядка CSS для стилів зарплати ────────
export function addSalaryStyles() {
    const style = document.createElement('style');
    style.textContent = `
        /* Salary Tab Styles */
        .salary-stats-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 0.75rem;
            margin-bottom: 1rem;
        }
        
        .salary-stat-card {
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 0.75rem;
            text-align: center;
        }
        
        .salary-stat-label {
            font-family: var(--mono);
            font-size: 0.6rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: var(--muted);
        }
        
        .salary-stat-value {
            font-family: var(--mono);
            font-size: 1.25rem;
            font-weight: 700;
            line-height: 1.2;
        }
        
        .transaction-item {
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: 10px;
            padding: 0.75rem;
            margin-bottom: 0.5rem;
            transition: all 0.15s;
        }
        
        .transaction-item.clickable {
            cursor: pointer;
        }
        
        .transaction-item.clickable:hover {
            border-color: var(--accent);
            background: var(--accent-light);
        }
        
        .transaction-date {
            font-family: var(--mono);
            font-size: 0.7rem;
            font-weight: 600;
            color: var(--muted);
        }
        
        .transaction-type {
            font-family: var(--mono);
            font-size: 0.65rem;
            background: var(--bg);
            padding: 0.15rem 0.5rem;
            border-radius: 12px;
            display: inline-block;
            margin-top: 0.25rem;
        }
        
        .transaction-note {
            font-family: var(--mono);
            font-size: 0.6rem;
            color: var(--muted);
            margin-top: 0.25rem;
        }
        
        .transaction-amount {
            font-family: var(--mono);
            font-size: 0.9rem;
            font-weight: 700;
        }
        
        .transaction-amount.positive {
            color: var(--accent);
        }
        
        .transaction-amount.negative {
            color: var(--red);
        }
        
        .chart-container {
            display: flex;
            align-items: flex-end;
            justify-content: space-between;
            height: 120px;
            gap: 4px;
            padding: 0.5rem 0;
        }
        
        .chart-bar-group {
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 6px;
        }
        
        .chart-bars {
            display: flex;
            gap: 3px;
            align-items: flex-end;
            height: 90px;
            width: 100%;
            justify-content: center;
        }
        
        .chart-bar {
            width: 12px;
            border-radius: 4px 4px 0 0;
            transition: height 0.3s ease;
        }
        
        .chart-bar.projected {
            background: var(--muted);
            opacity: 0.6;
        }
        
        .chart-bar.actual {
            background: var(--accent);
        }
        
        .chart-label {
            font-family: var(--mono);
            font-size: 0.55rem;
            color: var(--muted);
        }
        
        .chart-legend {
            display: flex;
            justify-content: center;
            gap: 1rem;
            margin-top: 0.5rem;
            font-family: var(--mono);
            font-size: 0.6rem;
        }
        
        .legend-color {
            display: inline-block;
            width: 12px;
            height: 12px;
            border-radius: 2px;
            margin-right: 4px;
        }
        
        .legend-color.projected {
            background: var(--muted);
            opacity: 0.6;
        }
        
        .legend-color.actual {
            background: var(--accent);
        }
        
        .year-stats {
            background: var(--bg);
            border-radius: 12px;
            padding: 0.75rem;
            margin-top: 1rem;
        }
        
        .year-stats-row {
            display: flex;
            justify-content: space-between;
            padding: 0.5rem 0;
            border-bottom: 1px solid var(--border);
        }
        
        .year-stats-row:last-child {
            border-bottom: none;
        }
        
        .year-nav {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;
            margin-bottom: 0.75rem;
        }
        
        .year-nav-btn {
            font-family: var(--mono);
            font-size: 0.8rem;
            font-weight: 700;
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: 8px;
            width: 28px;
            height: 28px;
            cursor: pointer;
        }
    `;
    document.head.appendChild(style);
}
