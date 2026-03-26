// js/bank.js
import { supabase } from './config.js';
import { i18n } from './config.js';
import { isAdmin } from './auth.js';
import { formatDate, parseLocal, fmtDisplay, showToast, openModal, closeModal } from './utils.js';

let currentMonth = new Date();
let editingId = null;
let stylesAdded = false;

const RATES = {
    work: 350,
    vacation: 150,
    sick: 120
};

export function addSalaryStyles() {
    if (stylesAdded) return;
    stylesAdded = true;
    const style = document.createElement('style');
    style.textContent = `
        .salary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; margin-bottom: 1rem; }
        .salary-card { background: white; border: 1px solid #e2e0d8; border-radius: 12px; padding: 0.75rem; text-align: center; }
        .salary-label { font-family: monospace; font-size: 0.6rem; font-weight: 600; text-transform: uppercase; color: #8a8880; }
        .salary-value { font-family: monospace; font-size: 1.25rem; font-weight: 700; }
        .tx-item { background: white; border: 1px solid #e2e0d8; border-radius: 10px; padding: 0.75rem; margin-bottom: 0.5rem; cursor: pointer; }
        .tx-date { font-family: monospace; font-size: 0.7rem; font-weight: 600; color: #8a8880; }
        .tx-type { font-family: monospace; font-size: 0.65rem; background: #f5f4f0; padding: 0.15rem 0.5rem; border-radius: 12px; display: inline-block; }
        .tx-amount { font-family: monospace; font-size: 0.9rem; font-weight: 700; color: #2d6a4f; }
        .year-stats { background: #f5f4f0; border-radius: 12px; padding: 0.75rem; margin-top: 1rem; }
        .year-row { display: flex; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid #e2e0d8; }
        .year-nav { display: flex; justify-content: center; gap: 0.5rem; margin-bottom: 0.75rem; }
        .year-btn { background: white; border: 1px solid #e2e0d8; border-radius: 8px; width: 28px; height: 28px; cursor: pointer; font-family: monospace; }
        .chart-box { display: flex; align-items: flex-end; justify-content: space-between; height: 100px; gap: 4px; margin: 0.5rem 0; }
        .chart-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; }
        .chart-bar { width: 100%; max-width: 20px; background: #2d6a4f; border-radius: 4px 4px 0 0; margin: 0 auto; }
        .chart-label { font-family: monospace; font-size: 0.5rem; color: #8a8880; }
        .flex-between { display: flex; justify-content: space-between; align-items: center; }
        .gap-2 { gap: 0.5rem; }
        .mt-2 { margin-top: 0.5rem; }
        .mb-2 { margin-bottom: 0.5rem; }
        .text-center { text-align: center; }
        .text-sm { font-size: 0.75rem; }
        .text-muted { color: #8a8880; }
    `;
    document.head.appendChild(style);
}

async function getWorkDays(year, month) {
    const start = formatDate(new Date(year, month, 1));
    const end = formatDate(new Date(year, month + 1, 0));
    const { data } = await supabase.from('work_days').select('*').gte('date', start).lte('date', end);
    return data || [];
}

async function getPayments(year, month) {
    const start = formatDate(new Date(year, month, 1));
    const end = formatDate(new Date(year, month + 1, 0));
    const { data } = await supabase.from('bank').select('*').eq('type', 'payment').gte('date', start).lte('date', end).order('date');
    return data || [];
}

async function getBonuses(year, month) {
    const start = formatDate(new Date(year, month, 1));
    const end = formatDate(new Date(year, month + 1, 0));
    const { data } = await supabase.from('bank').select('*').eq('type', 'bonus').gte('date', start).lte('date', end).order('date');
    return data || [];
}

async function getYearTotal(year) {
    const start = formatDate(new Date(year, 0, 1));
    const end = formatDate(new Date(year, 11, 31));
    const { data } = await supabase.from('bank').select('*').gte('date', start).lte('date', end);
    const total = (data || []).reduce((s, d) => s + (parseFloat(d.amount) || 0), 0);
    return total;
}

function calcProjected(workDays, bonuses) {
    let total = 0;
    let work = 0, vac = 0, sick = 0;
    workDays.forEach(d => {
        if (d.type === 'work') { total += RATES.work; work++; }
        if (d.type === 'vacation') { total += RATES.vacation; vac++; }
        if (d.type === 'sick') { total += RATES.sick; sick++; }
    });
    const bonusTotal = bonuses.reduce((s, b) => s + (parseFloat(b.amount) || 0), 0);
    total += bonusTotal;
    return { total: Math.round(total), work, vac, sick, bonusTotal: Math.round(bonusTotal) };
}

export async function renderSalary(getLang) {
    const lang = getLang();
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    
    const monthNames = lang === 'pl' 
        ? ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień']
        : ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];
    
    document.getElementById('salary-month-title').innerText = `${monthNames[month]} ${year}`;
    document.getElementById('year-title').innerText = `${lang === 'pl' ? 'Rok' : 'Рік'} ${year}`;
    
    const workDays = await getWorkDays(year, month);
    const payments = await getPayments(year, month);
    const bonuses = await getBonuses(year, month);
    const projected = calcProjected(workDays, bonuses);
    const actualTotal = payments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
    
    document.getElementById('stat-work').innerText = projected.work;
    document.getElementById('stat-vacation').innerText = projected.vac;
    document.getElementById('stat-sick').innerText = projected.sick;
    document.getElementById('stat-bonus').innerText = projected.bonusTotal + ' PLN';
    document.getElementById('stat-projected').innerText = projected.total + ' PLN';
    document.getElementById('stat-actual').innerText = actualTotal + ' PLN';
    
    const diff = actualTotal - projected.total;
    const diffEl = document.getElementById('stat-diff');
    diffEl.innerText = (diff >= 0 ? '+' : '') + diff + ' PLN';
    diffEl.style.color = diff >= 0 ? '#2d6a4f' : '#dc2626';
    
    // список виплат
    const payList = document.getElementById('payments-list');
    if (payList) {
        if (!payments.length) {
            payList.innerHTML = `<p class="text-center text-muted text-sm">${lang === 'pl' ? 'Brak wypłat' : 'Немає виплат'}</p>`;
        } else {
            payList.innerHTML = payments.map(p => `
                <div class="tx-item" data-id="${p.id}">
                    <div class="flex-between">
                        <div>
                            <div class="tx-date">${fmtDisplay(parseLocal(p.date))}</div>
                            <span class="tx-type">${lang === 'pl' ? 'Wypłata' : 'Виплата'}</span>
                            ${p.note ? `<div class="text-sm text-muted">${p.note}</div>` : ''}
                        </div>
                        <div class="tx-amount">${parseFloat(p.amount).toFixed(2)} PLN</div>
                    </div>
                </div>
            `).join('');
            if (isAdmin) {
                payList.querySelectorAll('.tx-item').forEach(el => {
                    el.onclick = () => openPaymentModal(el.dataset.id, getLang);
                });
            }
        }
    }
    
    // список доплат
    const bonusList = document.getElementById('bonuses-list');
    if (bonusList) {
        if (!bonuses.length) {
            bonusList.innerHTML = `<p class="text-center text-muted text-sm">${lang === 'pl' ? 'Brak dodatków' : 'Немає доплат'}</p>`;
        } else {
            bonusList.innerHTML = bonuses.map(b => `
                <div class="tx-item" data-id="${b.id}">
                    <div class="flex-between">
                        <div>
                            <div class="tx-date">${fmtDisplay(parseLocal(b.date))}</div>
                            <span class="tx-type">${lang === 'pl' ? 'Dodatek' : 'Доплата'}</span>
                            ${b.note ? `<div class="text-sm text-muted">${b.note}</div>` : ''}
                        </div>
                        <div class="tx-amount">${parseFloat(b.amount).toFixed(2)} PLN</div>
                    </div>
                </div>
            `).join('');
            if (isAdmin) {
                bonusList.querySelectorAll('.tx-item').forEach(el => {
// js/bank.js
import { supabase } from './config.js';
import { i18n } from './config.js';
import { isAdmin } from './auth.js';
import { formatDate, parseLocal, fmtDisplay, showToast, openModal, closeModal } from './utils.js';

let currentMonth = new Date();
let editingId = null;
let stylesAdded = false;

const RATES = {
    work: 350,
    vacation: 150,
    sick: 120
};

export function addSalaryStyles() {
    if (stylesAdded) return;
    stylesAdded = true;
    const style = document.createElement('style');
    style.textContent = `
        .salary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; margin-bottom: 1rem; }
        .salary-card { background: white; border: 1px solid #e2e0d8; border-radius: 12px; padding: 0.75rem; text-align: center; }
        .salary-label { font-family: monospace; font-size: 0.6rem; font-weight: 600; text-transform: uppercase; color: #8a8880; }
        .salary-value { font-family: monospace; font-size: 1.25rem; font-weight: 700; }
        .tx-item { background: white; border: 1px solid #e2e0d8; border-radius: 10px; padding: 0.75rem; margin-bottom: 0.5rem; cursor: pointer; }
        .tx-date { font-family: monospace; font-size: 0.7rem; font-weight: 600; color: #8a8880; }
        .tx-type { font-family: monospace; font-size: 0.65rem; background: #f5f4f0; padding: 0.15rem 0.5rem; border-radius: 12px; display: inline-block; }
        .tx-amount { font-family: monospace; font-size: 0.9rem; font-weight: 700; color: #2d6a4f; }
        .year-stats { background: #f5f4f0; border-radius: 12px; padding: 0.75rem; margin-top: 1rem; }
        .year-row { display: flex; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid #e2e0d8; }
        .year-nav { display: flex; justify-content: center; gap: 0.5rem; margin-bottom: 0.75rem; }
        .year-btn { background: white; border: 1px solid #e2e0d8; border-radius: 8px; width: 28px; height: 28px; cursor: pointer; font-family: monospace; }
        .chart-box { display: flex; align-items: flex-end; justify-content: space-between; height: 100px; gap: 4px; margin: 0.5rem 0; }
        .chart-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; }
        .chart-bar { width: 100%; max-width: 20px; background: #2d6a4f; border-radius: 4px 4px 0 0; margin: 0 auto; }
        .chart-label { font-family: monospace; font-size: 0.5rem; color: #8a8880; }
        .flex-between { display: flex; justify-content: space-between; align-items: center; }
        .gap-2 { gap: 0.5rem; }
        .mt-2 { margin-top: 0.5rem; }
        .mb-2 { margin-bottom: 0.5rem; }
        .text-center { text-align: center; }
        .text-sm { font-size: 0.75rem; }
        .text-muted { color: #8a8880; }
    `;
    document.head.appendChild(style);
}

async function getWorkDays(year, month) {
    const start = formatDate(new Date(year, month, 1));
    const end = formatDate(new Date(year, month + 1, 0));
    const { data } = await supabase.from('work_days').select('*').gte('date', start).lte('date', end);
    return data || [];
}

async function getPayments(year, month) {
    const start = formatDate(new Date(year, month, 1));
    const end = formatDate(new Date(year, month + 1, 0));
    const { data } = await supabase.from('bank').select('*').eq('type', 'payment').gte('date', start).lte('date', end).order('date');
    return data || [];
}

async function getBonuses(year, month) {
    const start = formatDate(new Date(year, month, 1));
    const end = formatDate(new Date(year, month + 1, 0));
    const { data } = await supabase.from('bank').select('*').eq('type', 'bonus').gte('date', start).lte('date', end).order('date');
    return data || [];
}

async function getYearTotal(year) {
    const start = formatDate(new Date(year, 0, 1));
    const end = formatDate(new Date(year, 11, 31));
    const { data } = await supabase.from('bank').select('*').gte('date', start).lte('date', end);
    const total = (data || []).reduce((s, d) => s + (parseFloat(d.amount) || 0), 0);
    return total;
}

function calcProjected(workDays, bonuses) {
    let total = 0;
    let work = 0, vac = 0, sick = 0;
    workDays.forEach(d => {
        if (d.type === 'work') { total += RATES.work; work++; }
        if (d.type === 'vacation') { total += RATES.vacation; vac++; }
        if (d.type === 'sick') { total += RATES.sick; sick++; }
    });
    const bonusTotal = bonuses.reduce((s, b) => s + (parseFloat(b.amount) || 0), 0);
    total += bonusTotal;
    return { total: Math.round(total), work, vac, sick, bonusTotal: Math.round(bonusTotal) };
}

export async function renderSalary(getLang) {
    const lang = getLang();
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    
    const monthNames = lang === 'pl' 
        ? ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień']
        : ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];
    
    document.getElementById('salary-month-title').innerText = `${monthNames[month]} ${year}`;
    document.getElementById('year-title').innerText = `${lang === 'pl' ? 'Rok' : 'Рік'} ${year}`;
    
    const workDays = await getWorkDays(year, month);
    const payments = await getPayments(year, month);
    const bonuses = await getBonuses(year, month);
    const projected = calcProjected(workDays, bonuses);
    const actualTotal = payments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
    
    document.getElementById('stat-work').innerText = projected.work;
    document.getElementById('stat-vacation').innerText = projected.vac;
    document.getElementById('stat-sick').innerText = projected.sick;
    document.getElementById('stat-bonus').innerText = projected.bonusTotal + ' PLN';
    document.getElementById('stat-projected').innerText = projected.total + ' PLN';
    document.getElementById('stat-actual').innerText = actualTotal + ' PLN';
    
    const diff = actualTotal - projected.total;
    const diffEl = document.getElementById('stat-diff');
    diffEl.innerText = (diff >= 0 ? '+' : '') + diff + ' PLN';
    diffEl.style.color = diff >= 0 ? '#2d6a4f' : '#dc2626';
    
    // список виплат
    const payList = document.getElementById('payments-list');
    if (payList) {
        if (!payments.length) {
            payList.innerHTML = `<p class="text-center text-muted text-sm">${lang === 'pl' ? 'Brak wypłat' : 'Немає виплат'}</p>`;
        } else {
            payList.innerHTML = payments.map(p => `
                <div class="tx-item" data-id="${p.id}">
                    <div class="flex-between">
                        <div>
                            <div class="tx-date">${fmtDisplay(parseLocal(p.date))}</div>
                            <span class="tx-type">${lang === 'pl' ? 'Wypłata' : 'Виплата'}</span>
                            ${p.note ? `<div class="text-sm text-muted">${p.note}</div>` : ''}
                        </div>
                        <div class="tx-amount">${parseFloat(p.amount).toFixed(2)} PLN</div>
                    </div>
                </div>
            `).join('');
            if (isAdmin) {
                payList.querySelectorAll('.tx-item').forEach(el => {
                    el.onclick = () => openPaymentModal(el.dataset.id, getLang);
                });
            }
        }
    }
    
    // список доплат
    const bonusList = document.getElementById('bonuses-list');
    if (bonusList) {
        if (!bonuses.length) {
            bonusList.innerHTML = `<p class="text-center text-muted text-sm">${lang === 'pl' ? 'Brak dodatków' : 'Немає доплат'}</p>`;
        } else {
            bonusList.innerHTML = bonuses.map(b => `
                <div class="tx-item" data-id="${b.id}">
                    <div class="flex-between">
                        <div>
                            <div class="tx-date">${fmtDisplay(parseLocal(b.date))}</div>
                            <span class="tx-type">${lang === 'pl' ? 'Dodatek' : 'Доплата'}</span>
                            ${b.note ? `<div class="text-sm text-muted">${b.note}</div>` : ''}
                        </div>
                        <div class="tx-amount">${parseFloat(b.amount).toFixed(2)} PLN</div>
                    </div>
                </div>
            `).join('');
            if (isAdmin) {
                bonusList.querySelectorAll('.tx-item').forEach(el => {
                    el.onclick = () => openBonusModal(el.dataset.id, getLang);
                });
            }
        }
    }
    
    const yearTotal = await getYearTotal(year);
    document.getElementById('year-actual').innerText = yearTotal + ' PLN';
}

export async function initBank(getLang) {
    const lang = getLang();
    const t = i18n[lang];
    
    document.getElementById('stat-work-label').innerText = t.workDays || 'Dni pracy';
    document.getElementById('stat-vacation-label').innerText = t.vacationDays || 'Urlop';
    document.getElementById('stat-sick-label').innerText = t.sickDays || 'Choroba';
    document.getElementById('stat-bonus-label').innerText = t.otherBonus || 'Inne dopłaty';
    document.getElementById('stat-projected-label').innerText = t.projectedSalary || 'Prognozowana';
    document.getElementById('stat-actual-label').innerText = t.actualSalary || 'Faktyczna';
    document.getElementById('stat-diff-label').innerText = t.difference || 'Różnica';
    document.getElementById('payments-title').innerText = t.transactions || 'Wypłaty';
    document.getElementById('bonuses-title').innerText = t.bonuses || 'Dodatki';
    document.getElementById('year-actual-label').innerText = t.actualYearly || 'Faktyczna roczna';
    
    const addBtn = document.querySelector('#tab-salary .flex.gap-2 button:first-child');
    const bonusBtn = document.querySelector('#tab-salary .flex.gap-2 button:last-child');
    if (addBtn) addBtn.innerHTML = `+ ${t.addPayment || (lang === 'pl' ? 'Dodaj wypłatę' : 'Додати виплату')}`;
    if (bonusBtn) bonusBtn.innerHTML = `+ ${t.addBonus || (lang === 'pl' ? 'Dodaj dodatek' : 'Додати доплату')}`;
    
    await renderSalary(getLang);
}

export async function openPaymentModal(id, getLang) {
    editingId = id;
    const lang = getLang();
    let record = null;
    if (id) {
        const { data } = await supabase.from('bank').select('*').eq('id', id).single();
        record = data;
    }
    document.getElementById('trans-modal-title').innerText = id ? (lang === 'pl' ? 'Edytuj wypłatę' : 'Редагувати виплату') : (lang === 'pl' ? 'Dodaj wypłatę' : 'Додати виплату');
    document.getElementById('trans-date').value = record?.date || formatDate(new Date());
    document.getElementById('trans-amount').value = record?.amount || '';
    document.getElementById('trans-note').value = record?.note || '';
    document.getElementById('trans-type').value = 'payment';
    document.getElementById('trans-delete').style.display = id ? 'block' : 'none';
    openModal('modal-transaction');
}

export async function openBonusModal(id, getLang) {
    editingId = id;
    const lang = getLang();
    let record = null;
    if (id) {
        const { data } = await supabase.from('bank').select('*').eq('id', id).single();
        record = data;
    }
    document.getElementById('trans-modal-title').innerText = id ? (lang === 'pl' ? 'Edytuj dodatek' : 'Редагувати доплату') : (lang === 'pl' ? 'Dodaj dodatek' : 'Додати доплату');
    document.getElementById('trans-date').value = record?.date || formatDate(new Date());
    document.getElementById('trans-amount').value = record?.amount || '';
    document.getElementById('trans-note').value = record?.note || '';
    document.getElementById('trans-type').value = 'bonus';
    document.getElementById('trans-delete').style.display = id ? 'block' : 'none';
    openModal('modal-transaction');
}

export async function saveTransaction(getLang) {
    const lang = getLang();
    const date = document.getElementById('trans-date').value;
    const amount = parseFloat(document.getElementById('trans-amount').value);
    const type = document.getElementById('trans-type').value;
    const note = document.getElementById('trans-note').value;
    
    if (!date || isNaN(amount) || amount <= 0) {
        showToast(lang === 'pl' ? 'Wprowadź poprawną kwotę i datę!' : 'Введіть коректну суму та дату!');
        return;
    }
    
    if (editingId) {
        await supabase.from('bank').update({ date, amount, type, note }).eq('id', editingId);
    } else {
        await supabase.from('bank').insert([{ date, amount, type, note }]);
    }
    
    closeModal('modal-transaction');
    showToast(i18n[lang].save + ' ✓');
    await renderSalary(getLang);
}

export async function deleteTransaction(getLang) {
    if (!editingId) return;
    const lang = getLang();
    await supabase.from('bank').delete().eq('id', editingId);
    closeModal('modal-transaction');
    showToast(i18n[lang].delete + ' ✓');
    await renderSalary(getLang);
}

export function shiftMonth(delta) {
    currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + delta, 1);
    renderSalary(window._getLang);
}

export function changeYear(delta) {
    currentMonth = new Date(currentMonth.getFullYear() + delta, currentMonth.getMonth(), 1);
    renderSalary(window._getLang);
}
