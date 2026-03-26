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

const SALARY_RATES = {
    workDay: 350,
    vacation: 150,
    sick: 120
};

export function addSalaryStyles() {
    if (stylesAdded) return;
    stylesAdded = true;
    
    const style = document.createElement('style');
    style.textContent = `
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
            cursor: pointer;
        }
        .transaction-item:hover {
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
            color: var(--accent);
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
        .error-state {
            text-align: center;
            color: var(--red);
            padding: 1rem;
            font-family: var(--mono);
            font-size: 0.75rem;
        }
        .btn-salary {
            font-family: var(--mono);
            font-size: 0.7rem;
            font-weight: 600;
            padding: 0.5rem;
            border-radius: 10px;
            cursor: pointer;
            transition: all 0.15s;
            text-align: center;
        }
        .btn-salary-primary {
            background: var(--text);
            color: white;
            border: none;
        }
        .btn-salary-primary:hover {
            opacity: 0.85;
        }
        .btn-salary-secondary {
            background: var(--orange);
            color: white;
            border: none;
        }
        .btn-salary-secondary:hover {
            opacity: 0.85;
        }
    `;
    document.head.appendChild(style);
}

async function checkSupabaseConnection() {
    try {
        const { error } = await supabase
            .from('work_days')
            .select('count', { count: 'exact', head: true })
            .limit(1);
        if (error) return false;
        return true;
    } catch (e) {
        return false;
    }
}

async function getWorkDaysForMonth(year, month) {
    const startDate = formatDate(new Date(year, month, 1));
    const endDate = formatDate(new Date(year, month + 1, 0));
    try {
        const { data, error } = await supabase
            .from('work_days')
            .select('*')
            .gte('date', startDate)
            .lte('date', endDate);
        if (error) return [];
        return data || [];
    } catch (e) {
        return [];
    }
}

async function getPaymentsForMonth(year, month) {
    const startDate = formatDate(new Date(year, month, 1));
    const endDate = formatDate(new Date(year, month + 1, 0));
    try {
        const { data, error } = await supabase
            .from('bank')
            .select('*')
            .eq('type', 'salary_payment')
            .gte('date', startDate)
            .lte('date', endDate)
            .order('date', { ascending: true });
        if (error) return [];
        return data || [];
    } catch (e) {
        return [];
    }
}

async function getBonusesForMonth(year, month) {
    const startDate = formatDate(new Date(year, month, 1));
    const endDate = formatDate(new Date(year, month + 1, 0));
    try {
        const { data, error } = await supabase
            .from('bank')
            .select('*')
            .eq('type', 'other_bonus')
            .gte('date', startDate)
            .lte('date', endDate)
            .order('date', { ascending: true });
        if (error) return [];
        return data || [];
    } catch (e) {
        return [];
    }
}

function calculateProjectedSalary(workDays, monthBonuses) {
    let total = 0;
    let workDaysCount = 0;
    let vacationDays = 0;
    let sickDays = 0;
    
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
    
    const bonusesTotal = monthBonuses.reduce((sum, b) => sum + (parseFloat(b.amount) || 0), 0);
    total += bonusesTotal;
    
    return {
        total: Math.round(total * 100) / 100,
        workDaysCount,
        vacationDays,
        sickDays,
        bonusesTotal: Math.round(bonusesTotal * 100) / 100
    };
}

async function calculateYearStats(year) {
    const startDate = formatDate(new Date(year, 0, 1));
    const endDate = formatDate(new Date(year, 11, 31));
    try {
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
        
        const totalActual = (payments || []).reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0) +
                            (bonuses || []).reduce((sum, b) => sum + (parseFloat(b.amount) || 0), 0);
        
        const monthlyBreakdown = [];
        for (let month = 0; month < 12; month++) {
            const monthStart = formatDate(new Date(year, month, 1));
            const monthEnd = formatDate(new Date(year, month + 1, 0));
            const monthPayments = (payments || []).filter(p => p.date >= monthStart && p.date <= monthEnd);
            const monthBonuses = (bonuses || []).filter(b => b.date >= monthStart && b.date <= monthEnd);
            const monthActual = monthPayments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0) +
                               monthBonuses.reduce((s, b) => s + (parseFloat(b.amount) || 0), 0);
            monthlyBreakdown.push({ month, actual: Math.round(monthActual * 100) / 100 });
        }
        return { actual: Math.round(totalActual * 100) / 100, monthlyBreakdown };
    } catch (e) {
        return { actual: 0, monthlyBreakdown: Array(12).fill({ actual: 0 }) };
    }
}

function renderPaymentsList(payments, lang) {
    const container = document.getElementById('payments-list');
    if (!container) return;
    if (!payments || payments.length === 0) {
        container.innerHTML = `<p class="text-center text-[var(--muted)] text-sm py-4">${lang === 'pl' ? 'Brak wypłat' : 'Немає виплат'}</p>`;
        return;
    }
    container.innerHTML = payments.map(payment => `
        <div class="transaction-item" data-id="${payment.id}">
            <div class="flex justify-between items-center">
                <div>
                    <p class="transaction-date">${fmtDisplay(parseLocal(payment.date))}</p>
                    <span class="transaction-type">${lang === 'pl' ? 'Wypłata' : 'Виплата'}</span>
                    ${payment.note ? `<p class="transaction-note">${payment.note}</p>` : ''}
                </div>
                <p class="transaction-amount">${parseFloat(payment.amount).toFixed(2)} PLN</p>
            </div>
        </div>
    `).join('');
    if (isAdmin) {
        container.querySelectorAll('.transaction-item').forEach(el => {
            el.addEventListener('click', () => openPaymentModal(el.dataset.id, () => lang));
        });
    }
}

function renderBonusesList(bonuses, lang) {
    const container = document.getElementById('bonuses-list');
    if (!container) return;
    if (!bonuses || bonuses.length === 0) {
        container.innerHTML = `<p class="text-center text-[var(--muted)] text-sm py-4">${lang === 'pl' ? 'Brak dodatków' : 'Немає доплат'}</p>`;
        return;
    }
    container.innerHTML = bonuses.map(bonus => `
        <div class="transaction-item" data-id="${bonus.id}">
            <div class="flex justify-between items-center">
                <div>
                    <p class="transaction-date">${fmtDisplay(parseLocal(bonus.date))}</p>
                    <span class="transaction-type">${lang === 'pl' ? 'Dodatek' : 'Доплата'}</span>
                    ${bonus.note ? `<p class="transaction-note">${bonus.note}</p>` : ''}
                </div>
                <p class="transaction-amount">${parseFloat(bonus.amount).toFixed(2)} PLN</p>
            </div>
        </div>
    `).join('');
    if (isAdmin) {
        container.querySelectorAll('.transaction-item').forEach(el => {
            el.addEventListener('click', () => openBonusModal(el.dataset.id, () => lang));
        });
    }
}

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
                        <div class="chart-bar" style="height: ${(m.actual / maxValue * 100)}%"></div>
                    </div>
                    <span class="chart-label">${monthLabels[i]}</span>
                </div>
            `).join('')}
        </div>
        <div class="chart-legend">
            <span><span class="legend-color"></span> ${lang === 'pl' ? 'Faktyczna' : 'Фактична'}</span>
        </div>
    `;
}

function updateButtonsText(lang) {
    const t = i18n[lang];
    const addPaymentBtn = document.querySelector('#tab-salary .flex.gap-2 button:first-child');
    const addBonusBtn = document.querySelector('#tab-salary .flex.gap-2 button:last-child');
    if (addPaymentBtn) addPaymentBtn.innerHTML = `+ ${t.addPayment || (lang === 'pl' ? 'Dodaj wypłatę' : 'Додати виплату')}`;
    if (addBonusBtn) addBonusBtn.innerHTML = `+ ${t.addBonus || (lang === 'pl' ? 'Dodaj dodatek' : 'Додати доплату')}`;
}

export async function renderSalaryMonth(getLang) {
    const lang = getLang();
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const monthNames = lang === 'pl' 
        ? ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień']
        : ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];
    
    document.getElementById('salary-month-title').innerText = `${monthNames[month]} ${year}`;
    document.getElementById('year-title').innerHTML = `${lang === 'pl' ? 'Rok' : 'Рік'} ${year}`;
    updateButtonsText(lang);
    
    const isConnected = await checkSupabaseConnection();
    if (!isConnected) {
        const errorMsg = lang === 'pl' ? '❌ Brak połączenia z bazą danych!' : '❌ Немає зв\'язку з базою даних!';
        document.getElementById('payments-list').innerHTML = `<p class="error-state">${errorMsg}</p>`;
        document.getElementById('bonuses-list').innerHTML = `<p class="error-state">${errorMsg}</p>`;
        showToast(errorMsg);
        return;
    }
    
    const workDays = await getWorkDaysForMonth(year, month);
    const payments = await getPaymentsForMonth(year, month);
    const bonuses = await getBonusesForMonth(year, month);
    const projected = calculateProjectedSalary(workDays, bonuses);
    const actualTotal = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    
    document.getElementById('stat-work-days').innerText = projected.workDaysCount;
    document.getElementById('stat-vacation-days').innerText = projected.vacationDays;
    document.getElementById('stat-sick-days').innerText = projected.sickDays;
    document.getElementById('stat-other-bonus').innerText = `${projected.bonusesTotal.toFixed(2)} PLN`;
    document.getElementById('stat-projected').innerText = `${projected.total.toFixed(2)} PLN`;
    document.getElementById('stat-actual').innerText = `${actualTotal.toFixed(2)} PLN`;
    
    const diff = actualTotal - projected.total;
    const diffEl = document.getElementById('stat-diff');
    diffEl.innerText = `${diff >= 0 ? '+' : ''}${diff.toFixed(2)} PLN`;
    diffEl.style.color = diff >= 0 ? 'var(--accent)' : 'var(--red)';
    
    renderPaymentsList(payments, lang);
    renderBonusesList(bonuses, lang);
    
    const yearStats = await calculateYearStats(year);
    document.getElementById('year-actual').innerText = `${yearStats.actual.toFixed(2)} PLN`;
    renderMonthlyChart(yearStats.monthlyBreakdown, lang);
}

export async function initBank(getLang) {
    const lang = getLang();
    updateSalaryLocale(lang);
    await renderSalaryMonth(getLang);
}

function updateSalaryLocale(lang) {
    const t = i18n[lang];
    const labels = {
        'stat-work-days-label': t.workDays,
        'stat-vacation-days-label': t.vacationDays,
        'stat-sick-days-label': t.sickDays,
        'stat-other-bonus-label': t.otherBonus,
        'stat-projected-label': t.projectedSalary,
        'stat-actual-label': t.actualSalary,
        'stat-diff-label': t.difference,
        'transactions-title': t.transactions,
        'bonuses-title': t.bonuses,
        'year-actual-label': t.actualYearly
    };
    for (const [id, text] of Object.entries(labels)) {
        const el = document.getElementById(id);
        if (el) el.innerText = text;
    }
    updateButtonsText(lang);
}

export async function openPaymentModal(existingId = null, getLang) {
    const lang = getLang();
    editingSalaryRecord = existingId;
    let record = null;
    if (existingId) {
        const { data } = await supabase.from('bank').select('*').eq('id', existingId).maybeSingle();
        record = data;
    }
    document.getElementById('transaction-modal-title').innerText = existingId 
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

export async function openBonusModal(existingId = null, getLang) {
    const lang = getLang();
    editingSalaryRecord = existingId;
    let record = null;
    if (existingId) {
        const { data } = await supabase.from('bank').select('*').eq('id', existingId).maybeSingle();
        record = data;
    }
    document.getElementById('transaction-modal-title').innerText = existingId 
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

export async function openBonusModal(existingId = null, getLang) {
    const lang = getLang();
    editingSalaryRecord = existingId;
    let record = null;
    if (existingId) {
        const { data } = await supabase.from('bank').select('*').eq('id', existingId).maybeSingle();
        record = data;
    }
    document.getElementById('transaction-modal-title').innerText = existingId 
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

export async function saveTransaction(getLang) {
    const lang = getLang();
    const date = document.getElementById('trans-date').value;
    const amount = parseFloat(document.getElementById('trans-amount').value);
    const type = document.getElementById('trans-type').value;
    const note = document.getElementById('trans-note').value;
    
    if (isNaN(amount) || amount <= 0) {
        showToast(lang === 'pl' ? 'Wprowadź poprawną kwotę!' : 'Введіть коректну суму!');
        return;
    }
    if (!date) {
        showToast(lang === 'pl' ? 'Wybierz datę!' : 'Виберіть дату!');
        return;
    }
    
    try {
        if (editingSalaryRecord) {
            await supabase.from('bank').update({ date, amount, type, note }).eq('id', editingSalaryRecord);
        } else {
            await supabase.from('bank').insert([{ date, amount, type, note }]);
        }
        closeModal('modal-transaction');
        showToast(i18n[lang].save + ' ✓');
        await renderSalaryMonth(getLang);
    } catch (error) {
        showToast(lang === 'pl' ? 'Błąd zapisu!' : 'Помилка збереження!');
    }
}

export async function deleteTransaction(getLang) {
    if (!editingSalaryRecord) return;
    const lang = getLang();
    try {
        await supabase.from('bank').delete().eq('id', editingSalaryRecord);
        closeModal('modal-transaction');
        showToast(i18n[lang].delete + ' ✓');
        await renderSalaryMonth(getLang);
    } catch (error) {
        showToast(lang === 'pl' ? 'Błąd usuwania!' : 'Помилка видалення!');
    }
}

export function shiftMonth(delta) {
    currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + delta, 1);
    renderSalaryMonth(window._getLang);
}

export function changeYear(delta) {
    currentMonth = new Date(currentMonth.getFullYear() + delta, currentMonth.getMonth(), 1);
    renderSalaryMonth(window._getLang);
}
