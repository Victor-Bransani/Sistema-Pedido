export function parseDate(dateStr) {
    const parts = dateStr.split('/');
    if (parts.length !== 3) return new Date(0);
    return new Date(parts[2], parts[1] - 1, parts[0]);
}

export function getCurrentDate() {
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    return `${day}/${month}/${year}`;
}

export function normalizeString(str) {
    if (!str || typeof str !== 'string') return '';
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function validateEmail(email) {
    const re = /\S+@\S+\.\S+/;
    return re.test(email);
}

export function validatePassword(password) {
    return password.length >= 6;
}
