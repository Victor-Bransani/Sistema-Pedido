import {loadAreas} from './modules/storage.js';
import {initializeApp} from './modules/initialization.js';
import {loginUser, logoutUser, registerUser} from './modules/users.js';
import {validateEmail, validatePassword} from './modules/utils.js';
import {processPDF} from './modules/pdfProcessing.js';
import {showNotification} from './modules/notifications.js';
import {setActiveSection, setActiveNav, displayDashboard, displayBuyerOrders, displayReceiverOrders, displayFinalizedOrders, displayWithdrawalOrders} from './modules/ui.js';

// Aguarda o DOM estar completamente carregado
document.addEventListener('DOMContentLoaded', () => {
    loadAreas();
    initializeApp();

    // Eventos de interface
    const processPdfBtn = document.getElementById('process-pdf');
    if (processPdfBtn) {
        processPdfBtn.addEventListener('click', () => {
            const fileInput = document.getElementById('pdf-upload');
            const file = fileInput?.files[0];
            if (!file) {
                showNotification('Por favor, selecione um arquivo PDF.', 'error');
                return;
            }
            processPDF(file);
        });
    }

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            logoutUser();
        });
    }

    const openRegisterModalBtn = document.getElementById('open-register-modal');
    if (openRegisterModalBtn) {
        openRegisterModalBtn.addEventListener('click', () => {
            const registerModal = document.getElementById('register-modal');
            const loginModal = document.getElementById('login-modal');
            if (registerModal && loginModal) {
                registerModal.classList.remove('hidden');
                loginModal.classList.add('hidden');
            }
        });
    }

    const openLoginModalBtn = document.getElementById('open-login-modal');
    if (openLoginModalBtn) {
        openLoginModalBtn.addEventListener('click', () => {
            const loginModal = document.getElementById('login-modal');
            const registerModal = document.getElementById('register-modal');
            if (loginModal && registerModal) {
                loginModal.classList.remove('hidden');
                registerModal.classList.add('hidden');
            }
        });
    }

    const closeLoginModalBtn = document.getElementById('close-login-modal');
    if (closeLoginModalBtn) {
        closeLoginModalBtn.addEventListener('click', () => {
            const loginModal = document.getElementById('login-modal');
            if (loginModal) loginModal.classList.add('hidden');
        });
    }

    const closeRegisterModalBtn = document.getElementById('close-register-modal');
    if (closeRegisterModalBtn) {
        closeRegisterModalBtn.addEventListener('click', () => {
            const registerModal = document.getElementById('register-modal');
            if (registerModal) registerModal.classList.add('hidden');
        });
    }

    const registerForm = document.getElementById('register-form');
    if (registerForm) {
        registerForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const name = document.getElementById('register-name')?.value.trim();
            const email = document.getElementById('register-email')?.value.trim();
            const password = document.getElementById('register-password')?.value;

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
                registerForm.reset();
                const registerModal = document.getElementById('register-modal');
                const loginModal = document.getElementById('login-modal');
                if (registerModal && loginModal) {
                    registerModal.classList.add('hidden');
                    loginModal.classList.remove('hidden');
                }
            }
        });
    }

    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const email = document.getElementById('login-email')?.value.trim();
            const password = document.getElementById('login-password')?.value;
            loginUser(email, password);
        });
    }

    // Event listeners para as abas de navegação
    const dashboardBtn = document.getElementById('dashboard-btn');
    if (dashboardBtn) {
        dashboardBtn.addEventListener('click', () => {
            setActiveSection('dashboard-section');
            setActiveNav('dashboard-btn');
            displayDashboard();
        });
    }

    const buyerBtn = document.getElementById('buyer-btn');
    if (buyerBtn) {
        buyerBtn.addEventListener('click', () => {
            setActiveSection('buyer-section');
            setActiveNav('buyer-btn');
            displayBuyerOrders();
        });
    }

    const receiverBtn = document.getElementById('receiver-btn');
    if (receiverBtn) {
        receiverBtn.addEventListener('click', () => {
            setActiveSection('receiver-section');
            setActiveNav('receiver-btn');
            displayReceiverOrders();
        });
    }

    const finalizedBtn = document.getElementById('finalized-btn');
    if (finalizedBtn) {
        finalizedBtn.addEventListener('click', () => {
            setActiveSection('finalized-section');
            setActiveNav('finalized-btn');
            displayFinalizedOrders();
        });
    }

    const withdrawalBtn = document.getElementById('withdrawal-btn');
    if (withdrawalBtn) {
        withdrawalBtn.addEventListener('click', () => {
            setActiveSection('withdrawal-section');
            setActiveNav('withdrawal-btn');
            displayWithdrawalOrders();
        });
    }
});