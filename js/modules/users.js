// modules/users.js
import { getUsers, saveUsers, getCurrentUser, setCurrentUser, clearCurrentUser } from './storage.js';
import { showNotification } from './notifications.js';
import { validateEmail, validatePassword } from './utils.js';
import { APP_CONFIG } from './constants.js';
import { initializeApp } from './initialization.js';

/**
 * Registra um novo usuário.
 * @param {string} name - Nome do usuário.
 * @param {string} email - Email do usuário.
 * @param {string} password - Senha do usuário.
 * @param {string} [role='user'] - Papel do usuário (ex: 'user', 'admin', 'receiver').
 * @returns {boolean} True se o registro for bem-sucedido, false caso contrário.
 */
export function registerUser(name, email, password, role = 'user') {
    if (!name || !email || !password) {
        showNotification('Nome, e-mail e senha são obrigatórios.', 'error');
        return false;
    }
    if (!validateEmail(email)) {
        showNotification('Formato de e-mail inválido.', 'error');
        return false;
    }
    if (!validatePassword(password, APP_CONFIG.PASSWORD_MIN_LENGTH)) {
        showNotification(`A senha deve ter pelo menos ${APP_CONFIG.PASSWORD_MIN_LENGTH} caracteres.`, 'error');
        return false;
    }

    const users = getUsers();
    const normalizedEmail = email.toLowerCase();
    if (users.some(user => user.email.toLowerCase() === normalizedEmail)) {
        showNotification('Este e-mail já está cadastrado.', 'error');
        return false;
    }

    const newUser = {
        id: Date.now().toString(),
        name,
        email: normalizedEmail,
        password, // Em produção, use hash
        role,
        createdAt: new Date().toISOString()
    };

    users.push(newUser);
    if (saveUsers(users)) {
        showNotification('Cadastro realizado com sucesso!', 'success');
        return true;
    } else {
        showNotification('Erro ao salvar o cadastro.', 'error');
        return false;
    }
}

/**
 * Loga um usuário no sistema.
 * @param {string} email - Email do usuário.
 * @param {string} password - Senha do usuário.
 * @returns {object|null} Objeto do usuário se o login for bem-sucedido, null caso contrário.
 */
export function loginUser(email, password) {
    if (!email || !password) {
        showNotification('E-mail e senha são obrigatórios.', 'error');
        return null;
    }
    if (!validateEmail(email)) {
        showNotification('Formato de e-mail inválido.', 'error');
        return null;
    }

    const users = getUsers();
    const normalizedEmail = email.toLowerCase();
    const user = users.find(u => u.email.toLowerCase() === normalizedEmail);

    if (!user) {
        showNotification('E-mail não encontrado.', 'error');
        return null;
    }

    // Comparação de senha (NÃO USE EM PRODUÇÃO REAL SEM BACKEND SEGURO E HASHING)
    if (user.password !== password) {
        showNotification('Senha incorreta.', 'error');
        return null;
    }

    // Login bem-sucedido
    const userToStore = { ...user };
    delete userToStore.password; // NUNCA armazene a senha no currentUser após o login.

    setCurrentUser(userToStore);
    showNotification(`Bem-vindo(a), ${user.name}!`, 'success');
    
    // Re-inicializa partes da aplicação que dependem do usuário logado
    initializeApp();

    return userToStore;
}

/**
 * Desloga o usuário atual.
 */
export function logoutUser() {
    const currentUser = getCurrentUser();
    if (currentUser) {
        showNotification(`Até logo, ${currentUser.name}!`, 'info');
    }
    clearCurrentUser();
    initializeApp();
}