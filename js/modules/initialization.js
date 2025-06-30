// modules/initialization.js
import { getCurrentUser, initializeStorage } from './storage.js';
import { 
    updateUserProfile, 
    displayDashboard, 
    displayBuyerOrders, 
    displayReceiverOrders, 
    displayFinalizedOrders, 
    displayWithdrawalOrders,
    showLoginModal,
    setActiveNav,
    setActiveSection,
    updateDashboardVisuals, // Renomeado de updateDashboardStats
    hideLoaderForce // Adicionado para garantir que o loader seja escondido
} from './ui.js';

let appInitialized = false;

/**
 * Inicializa a aplicação ou re-inicializa partes dela.
 * Verifica o usuário logado, atualiza a UI e exibe a seção apropriada.
 */
export function initializeApp() {
    // Esconder qualquer loader existente primeiro
    hideLoaderForce();
    
    try {
        if (!appInitialized) {
            initializeStorage(); // Garante que o localStorage tenha valores padrão
            appInitialized = true;
            console.log("Aplicação inicializada pela primeira vez.");
        } else {
            console.log("Re-inicializando partes da aplicação...");
        }

        const currentUser = getCurrentUser();

        updateUserProfile(currentUser); // Passa o usuário para evitar múltiplas chamadas a getCurrentUser

        if (!currentUser) {
            // Esconde todas as seções principais e mostra o modal de login
            document.querySelectorAll('.main-content .sections-wrapper section').forEach(section => {
                section.classList.add('hidden-section');
                section.classList.remove('active-section');
            });
            // Opcional: desabilitar navegação se não logado
            document.querySelectorAll('.sidebar .nav-btn').forEach(btn => {
                if (btn.id !== 'help-menu-btn') { // Exemplo: permitir ajuda
                     // btn.disabled = true; // Adicionar estilos para .nav-btn:disabled
                }
            });
            showLoginModal();
            return; // Interrompe a inicialização adicional se não houver usuário
        }
        
        // Se logado, habilita a navegação (caso tenha sido desabilitada)
         document.querySelectorAll('.sidebar .nav-btn').forEach(btn => {
            // btn.disabled = false;
        });


        // Carrega dados e atualiza todas as seções relevantes
        // A ordem pode ser importante se uma atualização depender de outra
        updateDashboardVisuals(); // Atualiza contadores e gráfico

        // As funções de display já devem buscar os dados mais recentes
        displayBuyerOrders();
        displayReceiverOrders();
        displayFinalizedOrders();
        displayWithdrawalOrders();

        // Define a seção inicial (Dashboard por padrão) se nenhuma estiver ativa
        // Ou mantém a seção ativa se houver lógica para isso (ex: sessionStorage)
        const currentActiveSection = document.querySelector('.sections-wrapper section.active-section');
        if (!currentActiveSection) {
            setActiveSection('dashboard-section');
            setActiveNav('dashboard-btn'); // Ativa o botão de navegação correspondente
            displayDashboard(); // Garante que o dashboard seja o primeiro a ser exibido
        } else {
            // Se já houver uma seção ativa, apenas garante que seu botão de navegação correspondente esteja ativo
            const activeBtnId = `${currentActiveSection.id.replace('-section', '')}-btn`;
            setActiveNav(activeBtnId);
        }
    } catch (error) {
        console.error("Erro na inicialização da aplicação:", error);
        // Tentar mostrar pelo menos a seção padrão
        try {
            setActiveSection('dashboard-section');
            const dashboardSection = document.getElementById('dashboard-section');
            if (dashboardSection) dashboardSection.classList.remove('hidden-section');
        } catch (e) {
            console.error("Erro ao tentar mostrar seção padrão:", e);
        }
    } finally {
        // Garantir que o loader esteja escondido
        hideLoaderForce();
    }
}