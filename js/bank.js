import { supabase } from './config.js';

// ======================
export async function renderBank() {
    const { data } = await supabase.from('bank').select('*');

    console.log('BANK DATA:', data);

    const el = document.getElementById('bank-payments');
    if (!el) return;

    el.innerHTML = '';

    (data || []).forEach(p => {
        el.innerHTML += `
            <div>
                ${p.date} — ${p.amount}€ (${p.type || ''})
            </div>
        `;
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
