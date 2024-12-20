import {getUsers, saveUsers, getCurrentUser, setCurrentUser, clearCurrentUser} from './storage.js';
import {showNotification} from './notifications.js';
import {initializeApp} from './initialization.js';

export function registerUser(name, email, password) {
    const users = getUsers();
    const exists = users.some(user => user.email === email);
    if (exists) {
        showNotification('E-mail já cadastrado.', 'error');
        return false;
    }
    const newUser = {
        id: Date.now(),
        name,
        email,
        password,
        role: 'user' 
    };
    users.push(newUser);
    saveUsers(users);
    showNotification('Cadastro realizado com sucesso! Faça login.', 'success');
    return true;
}

export function loginUser(email, password) {
    const users = getUsers();
    const user = users.find(u => u.email === email && u.password === password);
    if (user) {
        setCurrentUser(user);
        showNotification(`Bem-vindo, ${user.name}!`, 'success');
        initializeApp();
        return true;
    } else {
        showNotification('E-mail ou senha inválidos.', 'error');
        return false;
    }
}

export function logoutUser() {
    clearCurrentUser();
    showNotification('Logout realizado com sucesso.', 'info');
    window.location.reload();
}
