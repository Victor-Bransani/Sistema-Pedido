import {loadAreas} from './modules/storage.js';
import {initializeApp} from './modules/initialization.js';
import {loginUser, logoutUser, registerUser} from './modules/users.js';
import {validateEmail, validatePassword} from './modules/utils.js';
import {processPDF} from './modules/pdfProcessing.js';
import {showNotification} from './modules/notifications.js';

// Eventos iniciais
window.onload = function() {
    loadAreas();
    initializeApp();

    // Eventos de interface
    document.getElementById('process-pdf').addEventListener('click', () => {
        const fileInput = document.getElementById('pdf-upload');
        const file = fileInput.files[0];
        if (!file) {
            showNotification('Por favor, selecione um arquivo PDF.', 'error');
            return;
        }
        processPDF(file);
    });

    document.getElementById('logout-btn').addEventListener('click', () => {
        logoutUser();
    });

    document.getElementById('open-register-modal').addEventListener('click', () => {
        const registerModal = document.getElementById('register-modal');
        registerModal.classList.remove('hidden');
        const loginModal = document.getElementById('login-modal');
        loginModal.classList.add('hidden');
    });

    document.getElementById('open-login-modal').addEventListener('click', () => {
        const loginModal = document.getElementById('login-modal');
        loginModal.classList.remove('hidden');
        const registerModal = document.getElementById('register-modal');
        registerModal.classList.add('hidden');
    });

    document.getElementById('close-login-modal').addEventListener('click', () => {
        const loginModal = document.getElementById('login-modal');
        loginModal.classList.add('hidden');
    });

    document.getElementById('close-register-modal').addEventListener('click', () => {
        const registerModal = document.getElementById('register-modal');
        registerModal.classList.add('hidden');
    });

    document.getElementById('register-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('register-name').value.trim();
        const email = document.getElementById('register-email').value.trim();
        const password = document.getElementById('register-password').value;

        if (!validateEmail(email)) {
            showNotification('Por favor, insira um e-mail válido.', 'error');
            return;
        }

        if (!validatePassword(password)) {
            showNotification('A senha deve ter pelo menos 6 caracteres.', 'error');
            return;
        }

        const success = registerUser(name, email, password);
        if (success) {
            document.getElementById('register-form').reset();
            const registerModal = document.getElementById('register-modal');
            registerModal.classList.add('hidden');
            const loginModal = document.getElementById('login-modal');
            loginModal.classList.remove('hidden');
        }
    });

    document.getElementById('login-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;
        loginUser(email, password);
    });

    // Adicionar event listeners para as abas dashboard, buyer, receiver, etc., se necessário
    // Por exemplo:
    const dashboardBtn = document.getElementById('dashboard-btn');
    if (dashboardBtn) {
        dashboardBtn.addEventListener('click', () => {
            setActiveSection('dashboard-section');
            setActiveNav('dashboard-btn');
            displayDashboard();
        });
    }

    // E assim por diante, adicionando os mesmos eventos e chamadas do código original, ajustando as importações e chamadas às funções do ui.js
};
