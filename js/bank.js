import { supabase } from './config.js';
import { i18n } from './config.js';
import { isAdmin } from './auth.js';
import {
    formatDate, parseLocal, addDays, fmtDisplay,
    showToast, openModal, closeModal
} from './utils.js';

let currentMonth = new Date();
let editingSalaryRecord = null;
let stylesAdded = false;

export function addSalaryStyles() {
    if (stylesAdded) return;
    stylesAdded = true;
    
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
        
        .year-nav-btn:hover {
            background: var(--bg);
        }
    `;
    document.head.appendChild(style);
}

// Конфігурація ставок зарплати
const SALARY_RATES = {
    workDay: 350,    // Ставка за робочий день (PLN)
    vacation: 150,   // Ставка за день відпустки
    sick: 120,        // Ставка за день хвороби
    otherBonus: 0    // Інші доплати - будуть додаватися окремо
};

// ── Ініціалізація модуля ───────────────────────────────────
export async function initBank(getLang) {
    const lang = getLang();
    updateSalaryLocale(lang);
    await renderSalaryMonth(getLang);
}

// ── Оновлення текстів при зміні мови ───────────────────────
function updateSalaryLocale(lang) {
    const t = i18n[lang];
    
    const elements = {
        'salary-tab-title': t.salaryTab || 'Zarobki',
        'salary-month-nav': t.salaryMonthNav || 'Miesiąc',
        'salary-add-btn': t.salaryAddBtn || '+ Dodaj',
        'stat-work-days-label': t.workDays || 'Dni pracy',
        'stat-vacation-days-label': t.vacationDays || 'Urlop',
        'stat-sick-days-label': t.sickDays || 'Choroba',
        'stat-other-bonus-label': t.otherBonus || 'Inne dopłaty',
        'stat-projected-label': t.projectedSalary || 'Prognozowana',
        'stat-actual-label': t.actualSalary || 'Faktyczna',
        'stat-diff-label': t.difference || 'Różnica',
        'transactions-title': t.transactions || 'Transakcje',
        'year-title': t.year || 'Rok',
        'year-actual-label': t.actualYearly || 'Faktyczna roczna',
        'year-projected-label': t.projectedYearly || 'Prognozowana roczna',
        'chart-legend-projected': t.projected || 'Prognoza',
        'chart-legend-actual': t.actual || 'Faktyczna'
    };
    
    for (const [id, text] of Object.entries(elements)) {
        const el = document.getElementById(id);
        if (el) el.innerText = text;
    }
    
    // Оновлюємо місяці в графіку при наступному рендері
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
    
    const { data: otherBonuses } = await supabase
        .from('bank')
        .select('*')
        .eq('type', 'other_bonus')
        .gte('date', startDate)
        .lte('date', endDate);
    
    // Групуємо інші доплати по днях
    const bonusByDate = {};
    (otherBonuses || []).forEach(bonus => {
        if (!bonusByDate[bonus.date]) bonusByDate[bonus.date] = 0;
        bonusByDate[bonus.date] += parseFloat(bonus.amount) || 0;
    });
    
    return {
        workDays: workDays || [],
        bonuses: bonusByDate
    };
}

// ── Отримання всіх транзакцій (виплат) за місяць ───────────
async function getSalaryPayments(year, month) {
    const startDate = formatDate(new Date(year, month, 1));
    const endDate = formatDate(new Date(year, month + 1, 0));
    
    const { data } = await supabase
        .from('bank')
        .select('*')
        .eq('type', 'salary_payment')
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true });
    
    return data || [];
}

// ── Отримання всіх інших доплат ────────────────────────────
async function getOtherBonuses(year, month) {
    const startDate = formatDate(new Date(year, month, 1));
    const endDate = formatDate(new Date(year, month + 1, 0));
    
    const { data } = await supabase
        .from('bank')
        .select('*')
        .eq('type', 'other_bonus')
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true });
    
    return data || [];
}

// ── Розрахунок прогнозованої зарплати за місяць ────────────
function calculateProjectedSalary(workDays, bonuses) {
    let total = 0;
    let workDaysCount = 0;
    let vacationDays = 0;
    let sickDays = 0;
    let otherBonusesTotal = 0;
    
    workDays.forEach(day => {
        switch(day.type) {
            case 'work':
                total += SALARY_RATES.workDay;
                workDaysCount++;
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
    
    // Додаємо інші доплати
    for (const date in bonuses) {
        otherBonusesTotal += bonuses[date];
        total += bonuses[date];
    }
    
    return {
        total: Math.round(total * 100) / 100,
        workDaysCount,
        vacationDays,
        sickDays,
        otherBonusesTotal: Math.round(otherBonusesTotal * 100) / 100
    };
}

// ── Розрахунок фактичних виплат за місяць ──────────────────
function calculateActualPayments(payments) {
    let total = 0;
    
    payments.forEach(payment => {
        total += parseFloat(payment.amount) || 0;
    });
    
    return {
        total: Math.round(total * 100) / 100,
        count: payments.length
    };
}

// ── Розрахунок річної статистики (тільки фактична) ─────────
async function calculateYearStats(year, getLang) {
    const startDate = formatDate(new Date(year, 0, 1));
    const endDate = formatDate(new Date(year, 11, 31));
    
    // Отримуємо всі виплати за рік
    const { data: payments } = await supabase
        .from('bank')
        .select('*')
        .eq('type', 'salary_payment')
        .gte('date', startDate)
        .lte('date', endDate);
    
    const { data: bonuses } = await supabase
        .from('bank')
        .select('*')
        .eq('type', 'other_bonus')
        .gte('date', startDate)
        .lte('date', endDate);
    
    const totalPayments = (payments || []).reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    const totalBonuses = (bonuses || []).reduce((sum, b) => sum + (parseFloat(b.amount) || 0), 0);
    const totalActual = totalPayments + totalBonuses;
    
    // Місячна розбивка для графіка
    const monthlyBreakdown = [];
    for (let month = 0; month < 12; month++) {
        const monthStart = formatDate(new Date(year, month, 1));
        const monthEnd = formatDate(new Date(year, month + 1, 0));
        
        const monthPayments = (payments || []).filter(p => 
            p.date >= monthStart && p.date <= monthEnd
        );
        const monthBonuses = (bonuses || []).filter(b => 
            b.date >= monthStart && b.date <= monthEnd
        );
        
        const monthActual = monthPayments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0) +
                           monthBonuses.reduce((s, b) => s + (parseFloat(b.amount) || 0), 0);
        
        monthlyBreakdown.push({
            month,
            actual: Math.round(monthActual * 100) / 100
        });
    }
    
    return {
        actual: Math.round(totalActual * 100) / 100,
        paymentsCount: (payments || []).length,
        bonusesCount: (bonuses || []).length,
        monthlyBreakdown
    };
}

// ── Головний рендер вкладки зарплати ──────────────────────
export async function renderSalaryMonth(getLang) {
    const lang = getLang();
    updateSalaryLocale(lang);
    
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    
    // Оновлюємо заголовок місяця
    const monthNames = lang === 'pl' 
        ? ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień']
        : ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];
    
    document.getElementById('salary-month-title').innerText = `${monthNames[month]} ${year}`;
    document.getElementById('year-title').innerText = `${lang === 'pl' ? 'Rok' : 'Рік'} ${year}`;
    
    // Отримуємо дані
    const { workDays, bonuses } = await getWorkDaysForMonth(year, month, getLang);
    const payments = await getSalaryPayments(year, month);
    const otherBonuses = await getOtherBonuses(year, month);
    
    const projected = calculateProjectedSalary(workDays, bonuses);
    const actual = calculateActualPayments(payments);
    
    // Сума інших доплат за місяць
    const otherBonusesTotal = otherBonuses.reduce((s, b) => s + (parseFloat(b.amount) || 0), 0);
    
    // Оновлюємо статистику
    document.getElementById('stat-work-days').innerText = projected.workDaysCount;
    document.getElementById('stat-vacation-days').innerText = projected.vacationDays;
    document.getElementById('stat-sick-days').innerText = projected.sickDays;
    document.getElementById('stat-other-bonus').innerText = `${otherBonusesTotal.toFixed(2)} PLN`;
    document.getElementById('stat-projected').innerText = `${projected.total.toFixed(2)} PLN`;
    document.getElementById('stat-actual').innerText = `${actual.total.toFixed(2)} PLN`;
    
    // Різниця
    const diff = actual.total - projected.total;
    const diffEl = document.getElementById('stat-diff');
    diffEl.innerText = `${diff >= 0 ? '+' : ''}${diff.toFixed(2)} PLN`;
    diffEl.style.color = diff >= 0 ? 'var(--accent)' : 'var(--red)';
    
    // Рендеримо список виплат
    renderPaymentsList(payments, getLang);
    
    // Рендеримо список інших доплат
    renderBonusesList(otherBonuses, getLang);
    
    // Рендеримо річну статистику (тільки фактична)
    const yearStats = await calculateYearStats(year, getLang);
    document.getElementById('year-actual').innerText = `${yearStats.actual.toFixed(2)} PLN`;
    
    // Рендеримо графік
    renderMonthlyChart(yearStats.monthlyBreakdown, lang);
}

// ── Рендер списку виплат зарплати ─────────────────────────
function renderPaymentsList(payments, getLang) {
    const container = document.getElementById('payments-list');
    const lang = getLang();
    
    if (!payments || payments.length === 0) {
        container.innerHTML = `<p class="text-center text-[var(--muted)] text-sm py-4">${lang === 'pl' ? 'Brak wypłat' : 'Немає виплат'}</p>`;
        return;
    }
    
    container.innerHTML = payments.map(payment => `
        <div class="transaction-item ${isAdmin ? 'clickable' : ''}" data-id="${payment.id}" onclick="${isAdmin ? `window._editPayment('${payment.id}')` : ''}">
            <div class="flex justify-between items-center">
                <div>
                    <p class="transaction-date">${fmtDisplay(parseLocal(payment.date))}</p>
                    <span class="transaction-type">${lang === 'pl' ? 'Wypłata' : 'Виплата'}</span>
                    ${payment.note ? `<p class="transaction-note">${payment.note}</p>` : ''}
                </div>
                <p class="transaction-amount positive">
                    ${parseFloat(payment.amount).toFixed(2)} PLN
                </p>
            </div>
        </div>
    `).join('');
}

// ── Рендер списку інших доплат ────────────────────────────
function renderBonusesList(bonuses, getLang) {
    const container = document.getElementById('bonuses-list');
    const lang = getLang();
    
    if (!bonuses || bonuses.length === 0) {
        container.innerHTML = `<p class="text-center text-[var(--muted)] text-sm py-4">${lang === 'pl' ? 'Brak dodatków' : 'Немає доплат'}</p>`;
        return;
    }
    
    container.innerHTML = bonuses.map(bonus => `
        <div class="transaction-item ${isAdmin ? 'clickable' : ''}" data-id="${bonus.id}" onclick="${isAdmin ? `window._editBonus('${bonus.id}')` : ''}">
            <div class="flex justify-between items-center">
                <div>
                    <p class="transaction-date">${fmtDisplay(parseLocal(bonus.date))}</p>
                    <span class="transaction-type">${lang === 'pl' ? 'Dodatek' : 'Доплата'}</span>
                    ${bonus.note ? `<p class="transaction-note">${bonus.note}</p>` : ''}
                </div>
                <p class="transaction-amount positive">
                    ${parseFloat(bonus.amount).toFixed(2)} PLN
                </p>
            </div>
        </div>
    `).join('');
}

// ── Рендер графіку місячної розбивки (тільки фактична) ────
function renderMonthlyChart(monthlyBreakdown, lang) {
    const container = document.getElementById('monthly-chart');
    if (!container) return;
    
    const monthLabels = lang === 'pl' 
        ? ['Sty', 'Lut', 'Mar', 'Kwi', 'Maj', 'Cze', 'Lip', 'Sie', 'Wrz', 'Paź', 'Lis', 'Gru']
        : ['Січ', 'Лют', 'Бер', 'Кві', 'Тра', 'Чер', 'Лип', 'Сер', 'Вер', 'Жов', 'Лис', 'Гру'];
    
    const maxValue = Math.max(...monthlyBreakdown.map(m => m.actual), 1);
    
    container.innerHTML = `
        <div class="chart-container">
            ${monthlyBreakdown.map((m, i) => `
                <div class="chart-bar-group">
                    <div class="chart-bars">
                        <div class="chart-bar actual" style="height: ${(m.actual / maxValue * 100)}%"></div>
                    </div>
                    <span class="chart-label">${monthLabels[i]}</span>
                </div>
            `).join('')}
        </div>
        <div class="chart-legend">
            <span><span class="legend-color actual"></span> ${lang === 'pl' ? 'Faktyczna' : 'Фактична'}</span>
        </div>
    `;
}

// ── Модальне вікно для додавання виплати ───────────────────
export async function openPaymentModal(existingId = null, getLang) {
    const lang = getLang();
    
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
    
    document.getElementById('transaction-modal-title').innerText = 
        existingId 
            ? (lang === 'pl' ? 'Edytuj wypłatę' : 'Редагувати виплату')
            : (lang === 'pl' ? 'Dodaj wypłatę' : 'Додати виплату');
    
    document.getElementById('trans-date').value = record?.date || formatDate(new Date());
    document.getElementById('trans-amount').value = record?.amount || '';
    document.getElementById('trans-note').value = record?.note || '';
    document.getElementById('trans-type').value = 'salary_payment';
    document.getElementById('trans-type').disabled = true;
    
    document.getElementById('trans-delete-btn').style.display = existingId ? '' : 'none';
    
    openModal('modal-transaction');
}

// ── Модальне вікно для додавання іншої доплати ────────────
export async function openBonusModal(existingId = null, getLang) {
    const lang = getLang();
    
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
    
    document.getElementById('transaction-modal-title').innerText = 
        existingId 
            ? (lang === 'pl' ? 'Edytuj dodatek' : 'Редагувати доплату')
            : (lang === 'pl' ? 'Dodaj dodatek' : 'Додати доплату');
    
    document.getElementById('trans-date').value = record?.date || formatDate(new Date());
    document.getElementById('trans-amount').value = record?.amount || '';
    document.getElementById('trans-note').value = record?.note || '';
    document.getElementById('trans-type').value = 'other_bonus';
    document.getElementById('trans-type').disabled = true;
    
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
    await renderSalaryMonth(getLang);
}

// ── Видалення транзакції ──────────────────────────────────
export async function deleteTransaction(getLang) {
    if (!editingSalaryRecord) return;
    
    const lang = getLang();
    await supabase
        .from('bank')
        .delete()
        .eq('id', editingSalaryRecord);
    
    closeModal('modal-transaction');
    showToast(i18n[lang].delete + ' ✓');
    await renderSalaryMonth(getLang);
}

// ── Навігація по місяцях ──────────────────────────────────
export function shiftMonth(delta) {
    currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + delta, 1);
    renderSalaryMonth(window._getLang);
}

// ── Зміна року ────────────────────────────────────────────
export function changeYear(delta) {
    currentMonth = new Date(currentMonth.getFullYear() + delta, currentMonth.getMonth(), 1);
    renderSalaryMonth(window._getLang);
        }
