// js/salary.js - простий модуль зарплати
import { supabase } from './config.js';
import { i18n } from './config.js';
import { isAdmin } from './auth.js';
import { formatDate, parseLocal, fmtDisplay, showToast, openModal, closeModal } from './utils.js';

let currentMonth = new Date();
let editingId = null;

// Ставки
const RATES = { work: 350, vacation: 150, sick: 120 };

// Додавання стилів
export function addSalaryStyles() {
    if (document.getElementById('salary-styles')) return;
    const style = document.createElement('style');
    style.id = 'salary-styles';
    style.textContent = `
        .tx-item { background: white; border: 1px solid #e2e0d8; border-radius: 10px; padding: 0.75rem 1rem; margin-bottom: 0.5rem; cursor: pointer; transition: border-color 0.15s; }
        .tx-item:hover { border-color: #2d6a4f; box-shadow: 0 2px 8px rgba(45,106,79,0.08); }
        .tx-item-empty { text-align: center; color: #8a8880; font-size: 0.75rem; padding: 1.5rem 0.75rem; }
        .tx-date { font-family: IBM Plex Mono, monospace; font-size: 0.7rem; font-weight: 600; color: #8a8880; display: block; margin-bottom: 0.25rem; }
        .tx-type { font-family: IBM Plex Mono, monospace; font-size: 0.65rem; background: #f5f4f0; color: #8a8880; padding: 0.2rem 0.5rem; border-radius: 4px; display: inline-block; margin-right: 0.5rem; }
        .tx-note { font-family: IBM Plex Sans, sans-serif; font-size: 0.75rem; color: #8a8880; display: block; margin-top: 0.25rem; }
        .tx-amount { font-family: IBM Plex Mono, monospace; font-size: 0.9rem; font-weight: 700; color: #2d6a4f; text-align: right; }
        .tx-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem; }
    `;
    document.head.appendChild(style);
}

// Допоміжна функція для формування місяца розрахунку (попередній місяц від сьогодні)
function formatDefaultMonth() {
    const today = new Date();
    const prevMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const year = prevMonth.getFullYear();
    const month = String(prevMonth.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
}

// Отримання робочих днів за місяць
async function getWorkDays(year, month) {
    try {
        const start = formatDate(new Date(year, month, 1));
        const end = formatDate(new Date(year, month + 1, 0));
        const { data, error } = await supabase.from('work_days').select('*').gte('date', start).lte('date', end);
        if (error) throw error;
        return data || [];
    } catch (err) {
        console.error('Error fetching work days:', err);
        return [];
    }
}

// Отримання виплат за місяц розрахунку
async function getPayments(year, month) {
    try {
        const monthStr = String(month + 1).padStart(2, '0');
        const yearMonth = `${year}-${monthStr}`;
        const { data, error } = await supabase.from('bank').select('*').eq('type', 'payment').eq('year_month', yearMonth).order('date');
        if (error) throw error;
        return data || [];
    } catch (err) {
        console.error('Error fetching payments:', err);
        return [];
    }
}

// Отримання доплат за місяц розрахунку
async function getBonuses(year, month) {
    try {
        const monthStr = String(month + 1).padStart(2, '0');
        const yearMonth = `${year}-${monthStr}`;
        const { data, error } = await supabase.from('bank').select('*').eq('type', 'bonus').eq('year_month', yearMonth).order('date');
        if (error) throw error;
        return data || [];
    } catch (err) {
        console.error('Error fetching bonuses:', err);
        return [];
    }
}

// Розрахунок прогнозованої зарплати
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

// Оновлення тексту кнопок
function updateButtons(lang) {
    const addBtn = document.querySelector('#tab-salary .flex.gap-2 button:first-child');
    const bonusBtn = document.querySelector('#tab-salary .flex.gap-2 button:last-child');
    if (addBtn) addBtn.innerHTML = lang === 'pl' ? '+ Dodaj wypłatę' : '+ Додати виплату';
    if (bonusBtn) bonusBtn.innerHTML = lang === 'pl' ? '+ Dodaj dodatek' : '+ Додати доплату';
}

// Головний рендер
export async function renderSalary(getLang) {
    try {
        const lang = getLang();
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();
        
        const monthNames = lang === 'pl' 
            ? ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień']
            : ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];
        
        document.getElementById('salary-month-title').innerText = `${monthNames[month]} ${year}`;
        document.getElementById('year-title').innerHTML = `${lang === 'pl' ? 'Rok' : 'Рік'} ${year}`;
        updateButtons(lang);
        
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
        
        // Список виплат
        const payList = document.getElementById('payments-list');
        if (payList) {
            if (!payments.length) {
                payList.innerHTML = `<p class="tx-item-empty">${lang === 'pl' ? 'Brak wypłat' : 'Немає виплат'}</p>`;
            } else {
                payList.innerHTML = payments.map(p => `
                    <div class="tx-item" data-id="${p.id}">
                        <div class="tx-header">
                            <div style="flex: 1;">
                                <div class="tx-date">${fmtDisplay(parseLocal(p.date))}</div>
                                <span class="tx-type">${lang === 'pl' ? 'Wypłata' : 'Виплата'}</span>
                                ${p.note ? `<div class="tx-note">${p.note}</div>` : ''}
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
        
        // Список доплат
        const bonusList = document.getElementById('bonuses-list');
        if (bonusList) {
            if (!bonuses.length) {
                bonusList.innerHTML = `<p class="tx-item-empty">${lang === 'pl' ? 'Brak dodatków' : 'Немає доплат'}</p>`;
            } else {
                bonusList.innerHTML = bonuses.map(b => `
                    <div class="tx-item" data-id="${b.id}">
                        <div class="tx-header">
                            <div style="flex: 1;">
                                <div class="tx-date">${fmtDisplay(parseLocal(b.date))}</div>
                                <span class="tx-type">${lang === 'pl' ? 'Dodatek' : 'Доплата'}</span>
                                ${b.note ? `<div class="tx-note">${b.note}</div>` : ''}
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
        
        // Річна статистика
        const { data: allYearPayments, error: yearError } = await supabase.from('bank').select('*').eq('type', 'payment');
        if (yearError) throw yearError;
        const yearPayments = (allYearPayments || []).filter(p => p.year_month && p.year_month.startsWith(String(year)));
        const yearTotal = yearPayments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
        document.getElementById('year-actual').innerText = yearTotal + ' PLN';
    } catch (err) {
        console.error('Error rendering salary:', err);
        showToast(getLang() === 'pl' ? 'Błąd wyświetlania pensji' : 'Помилка виведення зарплати');
    }
}

// Ініціалізація
export async function initSalary(getLang) {
    const lang = getLang();
    await renderSalary(getLang);
}

// Модальні вікна
export async function openPaymentModal(id, getLang) {
    editingId = id;
    const lang = getLang();
    let record = null;
    if (id) {
        try {
            const { data, error } = await supabase.from('bank').select('*').eq('id', id).single();
            if (error) throw error;
            record = data;
        } catch (err) {
            console.error('Error loading payment:', err);
            showToast(lang === 'pl' ? 'Błąd przy ładowaniu danych!' : 'Помилка при завантаженні!');
            return;
        }
    }
    document.getElementById('trans-modal-title').innerText = id ? (lang === 'pl' ? 'Edytuj wypłatę' : 'Редагувати виплату') : (lang === 'pl' ? 'Dodaj wypłatę' : 'Додати виплату');
    document.getElementById('trans-date').value = record?.date || formatDate(new Date());
    const defaultMonth = record?.year_month || formatDefaultMonth();
    console.log('Setting month to:', defaultMonth);
    document.getElementById('trans-month').value = defaultMonth;
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
        try {
            const { data, error } = await supabase.from('bank').select('*').eq('id', id).single();
            if (error) throw error;
            record = data;
        } catch (err) {
            console.error('Error loading bonus:', err);
            showToast(lang === 'pl' ? 'Błąd przy ładowaniu danych!' : 'Помилка при завантаженні!');
            return;
        }
    }
    document.getElementById('trans-modal-title').innerText = id ? (lang === 'pl' ? 'Edytuj dodatek' : 'Редагувати доплату') : (lang === 'pl' ? 'Dodaj dodatek' : 'Додати доплату');
    document.getElementById('trans-date').value = record?.date || formatDate(new Date());
    document.getElementById('trans-month').value = record?.year_month || currentMonth.getFullYear() + '-' + String(currentMonth.getMonth() + 1).padStart(2, '0');
    document.getElementById('trans-amount').value = record?.amount || '';
    document.getElementById('trans-note').value = record?.note || '';
    document.getElementById('trans-type').value = 'bonus';
    document.getElementById('trans-delete').style.display = id ? 'block' : 'none';
    openModal('modal-transaction');
}

export async function saveTransaction(getLang) {
    const lang = getLang();
    const date = document.getElementById('trans-date').value;
    const year_month = document.getElementById('trans-month').value;
    const amount = parseFloat(document.getElementById('trans-amount').value);
    const type = document.getElementById('trans-type').value;
    const note = document.getElementById('trans-note').value || '';
    
    console.log('Saving transaction:', { date, year_month, amount, type, note, editingId });
    
    if (!date || !year_month || isNaN(amount) || amount <= 0) {
        showToast(lang === 'pl' ? 'Wprowadź poprawną kwotę, datę i miesiąc!' : 'Введіть коректну суму, дату та місяц!');
        return;
    }
    
    try {
        // Prepare data object
        const dataToSave = {
            date: date,
            year_month: year_month,
            amount: parseFloat(amount.toFixed(2)),
            type: type,
            note: note
        };
        
        // Add ID only if editing existing record
        if (editingId) {
            dataToSave.id = editingId;
        }
        
        console.log('Data to save:', dataToSave);
        
        if (editingId) {
            // Update existing record
            const result = await supabase.from('bank').update(dataToSave).eq('id', editingId);
            console.log('Update response:', result);
            if (result.error) throw result.error;
        } else {
            // Insert new record (don't use upsert for new records)
            const result = await supabase.from('bank').insert([dataToSave]);
            console.log('Insert response:', result);
            if (result.error) throw result.error;
        }
        
        closeModal('modal-transaction');
        showToast(i18n[lang].save + ' ✓');
        editingId = null;
        await renderSalary(getLang);
    } catch (err) {
        console.error('Error saving transaction:', err);
        console.error('Error details:', { 
            message: err.message, 
            code: err.code, 
            details: err.details,
            context: err.context,
            status: err.status
        });
        const errorMsg = err.message || (lang === 'pl' ? 'Błąd przy zapisywaniu danych!' : 'Помилка при збереженні!');
        showToast(lang === 'pl' ? 'Błąd: ' + errorMsg : 'Помилка: ' + errorMsg);
    }
}

export async function deleteTransaction(getLang) {
    if (!editingId) return;
    const lang = getLang();
    
    try {
        console.log('Deleting transaction with id:', editingId);
        
        const result = await supabase.from('bank').delete().eq('id', editingId);
        
        console.log('Delete response:', result);
        
        if (result.error) {
            console.error('Supabase delete error:', result.error);
            throw result.error;
        }
        
        closeModal('modal-transaction');
        showToast(i18n[lang].save + ' ✓');
        editingId = null;
        await renderSalary(getLang);
    } catch (err) {
        console.error('Error deleting transaction:', err);
        console.error('Error details:', { 
            message: err.message, 
            code: err.code, 
            details: err.details
        });
        showToast(lang === 'pl' ? 'Błąd przy usuwaniu danych: ' + err.message : 'Помилка при видаленні: ' + err.message);
    }
}

export async function shiftMonth(delta) {
    currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + delta, 1);
    await renderSalary(window._getLang);
}

export async function changeYear(delta) {
    currentMonth = new Date(currentMonth.getFullYear() + delta, currentMonth.getMonth(), 1);
    await renderSalary(window._getLang);
}