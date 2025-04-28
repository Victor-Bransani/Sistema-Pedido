export function loadAreas() {
    try {
        const savedAreas = JSON.parse(localStorage.getItem('areas'));
        return Array.isArray(savedAreas) ? savedAreas : [];
    } catch {
        return [];
    }
}

export function saveAreas(areas) {
    localStorage.setItem('areas', JSON.stringify(areas));
}

export function getUsers() {
    try {
        const users = JSON.parse(localStorage.getItem('users'));
        return Array.isArray(users) ? users : [];
    } catch {
        return [];
    }
}

export function saveUsers(users) {
    localStorage.setItem('users', JSON.stringify(users));
}

if (!localStorage.getItem('orders')) {
    localStorage.setItem('orders', JSON.stringify([]));
}

export function getOrders() {
    try {
        const orders = JSON.parse(localStorage.getItem('orders'));
        return Array.isArray(orders) ? orders : [];
    } catch {
        return [];
    }
}

export function saveOrders(orders) {
    localStorage.setItem('orders', JSON.stringify(orders));
}

export function getWithdrawers() {
    try {
        const withdrawers = JSON.parse(localStorage.getItem('withdrawers'));
        return Array.isArray(withdrawers) ? withdrawers : [];
    } catch {
        return [];
    }
}

export function saveWithdrawers(withdrawers) {
    localStorage.setItem('withdrawers', JSON.stringify(withdrawers));
}

export function getCurrentUser() {
    try {
        const user = JSON.parse(localStorage.getItem('currentUser'));
        return user || null;
    } catch {
        return null;
    }
}

export function setCurrentUser(user) {
    localStorage.setItem('currentUser', JSON.stringify(user));
}

export function clearCurrentUser() {
    localStorage.removeItem('currentUser');
}