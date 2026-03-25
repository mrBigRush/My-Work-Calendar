import { ADMIN_PASS, i18n } from './config.js';
import { openModal, closeModal } from './utils.js';

export let isAdmin = localStorage.getItem('isSergAdmin') === 'true';

export function initAuth(getLang) {
    document.getElementById('login-inp')
        .addEventListener('keydown', e => { if (e.key === 'Enter') submitLogin(getLang); });
}

export function handleAuth(getLang) {
    if (isAdmin) {
        localStorage.removeItem('isSergAdmin');
        location.reload();
    } else {
        document.getElementById('login-inp').value = '';
        document.getElementById('login-err').classList.add('hidden');
        openModal('modal-login');
        setTimeout(() => document.getElementById('login-inp').focus(), 200);
    }
}

export function submitLogin(getLang) {
    const lang = getLang();
    if (document.getElementById('login-inp').value === ADMIN_PASS) {
        localStorage.setItem('isSergAdmin', 'true');
        location.reload();
    } else {
        document.getElementById('login-err').classList.remove('hidden');
        document.getElementById('login-inp').value = '';
        document.getElementById('login-inp').focus();
    }
}

export function applyAdminUI() {
    if (isAdmin) {
        document.body.classList.add('is-admin');
        document.getElementById('tabs-row').style.display = 'flex';
        document.getElementById('admin-badge').style.display = 'inline-block';
    }
}
