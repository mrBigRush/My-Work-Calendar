import { supabase } from './config.js';

// ======================
export async function renderBank() {
    const { data, error } = await supabase.from('bank').select('*');

    const el = document.getElementById('bank-payments');
    if (!el) return;

    el.innerHTML = '';

    // ❗ показуємо помилку прямо на екрані
    if (error) {
        el.innerHTML = `<div style="color:red;">ERROR: ${error.message}</div>`;
        return;
    }

    // ❗ якщо немає даних
    if (!data || data.length === 0) {
        el.innerHTML = `<div>NO DATA</div>`;
        return;
    }

    // ❗ показуємо всі поля як є
    data.forEach(p => {
        el.innerHTML += `<div>${JSON.stringify(p)}</div>`;
    });
}

// ======================
export function openModal() {
    document.getElementById('bank-modal').style.display = 'block';
}

export function closeModal() {
    document.getElementById('bank-modal').style.display = 'none';
}

// ======================
export async function addPayment() {
    const date = document.getElementById('pay-date').value;
    const amount = document.getElementById('pay-amount').value;
    const type = document.getElementById('pay-type').value;

    await supabase.from('bank').insert([{ date, amount, type }]);

    closeModal();
    renderBank();
}

// ======================
window.openModal = openModal;
window.closeModal = closeModal;
window.addPayment = addPayment;
