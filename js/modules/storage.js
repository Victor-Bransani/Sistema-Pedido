// modules/storage.js
import { DEFAULT_AREAS, STORAGE_KEYS } from './constants.js';

/**
 * Helper para obter item do localStorage com JSON.parse e tratamento de erro.
 * @param {string} key - A chave do item.
 * @param {*} defaultValue - Valor padrão a ser retornado em caso de erro ou item não encontrado.
 * @returns {*} O item parseado ou o valor padrão.
 */
function getItem(key, defaultValue = null) {
    try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : defaultValue;
    } catch (error) {
        console.error(`Error getting item "${key}" from localStorage:`, error);
        return defaultValue;
    }
}

/**
 * Helper para definir item no localStorage com JSON.stringify e tratamento de erro.
 * @param {string} key - A chave do item.
 * @param {*} value - O valor a ser armazenado.
 * @returns {boolean} True se o item foi salvo com sucesso, false caso contrário.
 */
function setItem(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch (error) {
        console.error(`Error setting item "${key}" in localStorage:`, error);
        return false;
    }
}

/**
 * Helper para remover item do localStorage com tratamento de erro.
 * @param {string} key - A chave do item a ser removido.
 */
function removeItem(key) {
    try {
        localStorage.removeItem(key);
    } catch (error) {
        console.error(`Error removing item "${key}" from localStorage:`, error);
    }
}

// --- Funções Específicas de Armazenamento ---

export function loadAreas() {
    return getItem(STORAGE_KEYS.AREAS, [...DEFAULT_AREAS]); // Retorna cópia de DEFAULT_AREAS
}

export function saveAreas(areas) {
    if (!Array.isArray(areas)) {
        console.warn('saveAreas: "areas" must be an array.');
        return false;
    }
    return setItem(STORAGE_KEYS.AREAS, areas);
}

export function getUsers() {
    return getItem(STORAGE_KEYS.USERS, []);
}

export function saveUsers(users) {
    if (!Array.isArray(users)) {
        console.warn('saveUsers: "users" must be an array.');
        return false;
    }
    return setItem(STORAGE_KEYS.USERS, users);
}

export function getOrders() {
    const orders = getItem(STORAGE_KEYS.ORDERS, []);
    // Adicional: Pode-se adicionar uma migração ou validação de dados aqui se a estrutura do pedido mudar no futuro
    return orders;
}

export function saveOrders(orders) {
    if (!Array.isArray(orders)) {
        console.warn('saveOrders: "orders" must be an array.');
        return false;
    }
    return setItem(STORAGE_KEYS.ORDERS, orders);
}

export function getWithdrawers() {
    return getItem(STORAGE_KEYS.WITHDRAWERS, []);
}

export function saveWithdrawers(withdrawers) {
    if (!Array.isArray(withdrawers)) {
        console.warn('saveWithdrawers: "withdrawers" must be an array.');
        return false;
    }
    return setItem(STORAGE_KEYS.WITHDRAWERS, withdrawers);
}

export function getCurrentUser() {
    return getItem(STORAGE_KEYS.CURRENT_USER, null);
}

export function setCurrentUser(user) {
    if (user && typeof user === 'object') {
        return setItem(STORAGE_KEYS.CURRENT_USER, user);
    } else if (user === null) { // Permitir limpar o usuário
        return setItem(STORAGE_KEYS.CURRENT_USER, null);
    }
    console.warn('setCurrentUser: "user" must be an object or null.');
    return false;
}

export function clearCurrentUser() {
    removeItem(STORAGE_KEYS.CURRENT_USER);
}

export function getTempOrder() {
    return getItem(STORAGE_KEYS.TEMP_ORDER, null);
}

export function setTempOrder(order) {
    if (order && typeof order === 'object') {
        return setItem(STORAGE_KEYS.TEMP_ORDER, order);
    } else if (order === null) {
        return setItem(STORAGE_KEYS.TEMP_ORDER, null);
    }
    console.warn('setTempOrder: "order" must be an object or null.');
    return false;
}

export function clearTempOrder() {
    removeItem(STORAGE_KEYS.TEMP_ORDER);
}

// Inicialização: Garante que chaves essenciais existam com valores padrão se não estiverem no localStorage
export function initializeStorage() {
    if (localStorage.getItem(STORAGE_KEYS.ORDERS) === null) {
        saveOrders([]);
    }
    if (localStorage.getItem(STORAGE_KEYS.USERS) === null) {
        saveUsers([]);
    }
    if (localStorage.getItem(STORAGE_KEYS.AREAS) === null) {
        saveAreas([...DEFAULT_AREAS]);
    }
    if (localStorage.getItem(STORAGE_KEYS.WITHDRAWERS) === null) {
        saveWithdrawers([]);
    }
    // CURRENT_USER e TEMP_ORDER podem ser null por padrão.
}