// app.js
console.log("[app.js] Início da execução - Este log deve aparecer mesmo se houver erros de importação");

// Diagnóstico de importações - usando importações dinâmicas em uma função
function checkImports() {
    console.log("[app.js] Iniciando verificação de módulos");
    
    const modules = [
        { name: 'initialization.js', path: './modules/initialization.js' },
        { name: 'users.js', path: './modules/users.js' },
        { name: 'storage.js', path: './modules/storage.js' },
        { name: 'ui.js', path: './modules/ui.js' },
        { name: 'constants.js', path: './modules/constants.js' },
        { name: 'pdfProcessing.js', path: './modules/pdfProcessing.js' }
    ];
    
    modules.forEach(module => {
        console.log(`[app.js] Tentando importar de ${module.name}`);
        import(module.path)
            .then(() => console.log(`[app.js] Importação de ${module.name} bem-sucedida`))
            .catch(err => console.error(`[app.js] ERRO ao importar ${module.name}:`, err));
    });
}

// Só verificamos as importações em ambiente de desenvolvimento
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    checkImports();
}

// Importações estáticas normais (no topo do módulo, conforme esperado)
import { initializeApp } from './modules/initialization.js';
import { loginUser, logoutUser, registerUser } from './modules/users.js';
import { processPDF } from './modules/pdfProcessing.js';
import { showNotification } from './modules/notifications.js';
import { loadAreas, getCurrentUser, initializeStorage } from './modules/storage.js';
import {
    setActiveSection,
    setActiveNav,
    displayDashboard,
    displayBuyerOrders,
    displayReceiverOrders,
    displayFinalizedOrders,
    displayWithdrawalOrders,
    closeModal,
    handleSelectAreaFormSubmit,
    handleSaveConference,
    handleConfirmSaveConference,
    handleConfirmWithdrawal,
    handleSendRequesterNotification,
    showLoginModal,
    refreshAllOrderDisplays
} from './modules/ui.js';
import { APP_CONFIG } from './modules/constants.js';
import { validateEmail, validatePassword } from './modules/utils.js';

// Todo o app.js é encapsulado em um try-catch para diagnóstico
try {
    console.log("[app.js] Importações normais bem-sucedidas");
    console.log("[app.js] app.js carregado e configurando event handlers");

    // Verificar se já existe um handler de erros do Chart.js
    if (!window.chartErrorHandlerRegistered) {
        // Handler específico para erros do Chart.js
        window.addEventListener('error', function(event) {
            // Verificar se é um erro relacionado ao Chart.js
            if (event.message && event.message.includes('Chart with ID') && 
                event.message.includes('must be destroyed')) {
                
                console.warn('[app.js] Erro do Chart.js detectado. Tentando recuperar...');
                
                // Verificar se o canvas existe
                const canvas = document.getElementById('statusChart');
                if (canvas) {
                    // Remover e recriar o canvas para limpar completamente
                    const parent = canvas.parentNode;
                    if (parent) {
                        // Armazenar atributos originais
                        const width = canvas.width;
                        const height = canvas.height;
                        const id = canvas.id;
                        
                        // Remover canvas antigo
                        parent.removeChild(canvas);
                        
                        // Criar novo canvas com mesmos atributos
                        const newCanvas = document.createElement('canvas');
                        newCanvas.id = id;
                        newCanvas.width = width;
                        newCanvas.height = height;
                        
                        // Adicionar ao DOM
                        parent.appendChild(newCanvas);
                        
                        // Limpar instâncias armazenadas
                        if (window.chartInstances) {
                            window.chartInstances.statusChart = null;
                        }
                        
                        console.log('[app.js] Canvas do gráfico recriado. Erro resolvido.');
                        
                        // Prevenir propagação do erro
                        event.preventDefault();
                        return false;
                    }
                }
            }
        });
        
        // Marcar como registrado para evitar duplicação
        window.chartErrorHandlerRegistered = true;
    }

    // Função segura para adicionar event listeners 
    // (não gera erros se o elemento não existir)
    function addSafeEventListener(elementId, eventType, handlerFn) {
        const element = document.getElementById(elementId);
        if (element) {
            element.addEventListener(eventType, handlerFn);
            console.log(`[app.js] Event listener adicionado para ${elementId}`);
        } else {
            console.warn(`[app.js] Elemento ${elementId} não encontrado para adicionar event listener`);
        }
    }

    // Inicialização da aplicação quando o DOM estiver pronto
    document.addEventListener('DOMContentLoaded', function() {
        console.log('[app.js] DOM carregado, configurando event listeners...');
            
            // Esconder o loader imediatamente
            const loader = document.getElementById('loader');
            if (loader) {
            loader.classList.add('hidden');
                console.log("[app.js] Loader escondido imediatamente no DOMContentLoaded");
            }
            
            // Inicializar armazenamento (cria valores padrão se necessário)
            try {
                console.log("[app.js] Chamando initializeStorage()");
                initializeStorage();
                console.log("[app.js] initializeStorage() concluído");
            } catch (storageError) {
                console.error("[app.js] Erro em initializeStorage():", storageError);
            }
            
            // Carregar áreas
            try {
                console.log("[app.js] Chamando loadAreas()");
                const areas = loadAreas();
                console.log("[app.js] loadAreas() concluído, áreas:", areas);
            } catch (areaError) {
                console.error("[app.js] Erro em loadAreas():", areaError);
            }
            
            // Inicializar a aplicação principal
            try {
                console.log("[app.js] Chamando initializeApp()");
                initializeApp();
                console.log("[app.js] initializeApp() concluído");
            } catch (appError) {
                console.error("[app.js] Erro em initializeApp():", appError);
            }
            
            // --- Eventos de Modais de Autenticação ---
        addSafeEventListener('open-register-modal', 'click', (event) => {
            event.preventDefault();
            console.log('[app.js] Abrindo modal de registro...');
                closeModal(); // Fecha modal de login se estiver aberto
            const registerModal = document.getElementById('register-modal');
            if (registerModal) {
                registerModal.classList.remove('hidden');
                console.log('[app.js] Modal de registro aberto');
            }
        });
        
        addSafeEventListener('open-login-modal', 'click', (event) => {
            event.preventDefault();
            console.log('[app.js] Abrindo modal de login...');
                closeModal(); // Fecha modal de registro se estiver aberto
                showLoginModal();
            });
        
        addSafeEventListener('close-login-modal', 'click', () => {
            console.log('[app.js] Fechando modal de login...');
            closeModal();
        });
        
        addSafeEventListener('close-register-modal', 'click', () => {
            console.log('[app.js] Fechando modal de registro...');
            closeModal();
        });
            
            addSafeEventListener('register-form', 'submit', (event) => {
                event.preventDefault();
            console.log('[app.js] Tentando registrar usuário...');
                const name = document.getElementById('register-name')?.value.trim();
                const email = document.getElementById('register-email')?.value.trim();
                const password = document.getElementById('register-password')?.value;
            
            if (!name || !email || !password) {
                console.warn('[app.js] Campos de registro incompletos');
                showNotification('Por favor, preencha todos os campos.', 'error');
                return;
            }
            
                if (registerUser(name, email, password)) {
                console.log('[app.js] Usuário registrado com sucesso');
                event.target.reset();
                showLoginModal();
                }
            });

            addSafeEventListener('login-form', 'submit', (event) => {
                event.preventDefault();
            console.log('[app.js] Tentando fazer login...');
                const email = document.getElementById('login-email')?.value.trim();
                const password = document.getElementById('login-password')?.value;
            
            if (!email || !password) {
                console.warn('[app.js] Campos de login incompletos');
                showNotification('Por favor, preencha todos os campos.', 'error');
                return;
            }
            
            if (loginUser(email, password)) {
                console.log('[app.js] Login realizado com sucesso');
                     event.target.reset();
                }
            });

            // --- Eventos de Navegação Principal ---
            const navButtons = [
                { id: 'dashboard-btn', section: 'dashboard-section', displayFn: displayDashboard },
                { id: 'buyer-btn', section: 'buyer-section', displayFn: displayBuyerOrders },
                { id: 'receiver-btn', section: 'receiver-section', displayFn: displayReceiverOrders },
                { id: 'withdrawal-btn', section: 'withdrawal-section', displayFn: displayWithdrawalOrders },
            { id: 'finalized-btn', section: 'finalized-section', displayFn: displayFinalizedOrders }
            ];

            navButtons.forEach(nav => {
                addSafeEventListener(nav.id, 'click', () => {
                console.log(`[app.js] Navegando para ${nav.section}...`);
                    setActiveSection(nav.section);
                    setActiveNav(nav.id);
                    if (nav.displayFn) nav.displayFn();
                });
            });

        // Event listeners para o formulário de seleção de área
        const selectAreaForm = document.getElementById('select-area-form');
        const confirmAreaBtn = document.getElementById('confirm-area-btn');
        
        if (selectAreaForm && confirmAreaBtn) {
            console.log('[app.js] Registrando event listeners para seleção de área');
            
            // Event listener para o formulário
            selectAreaForm.addEventListener('submit', function(event) {
                event.preventDefault();
                console.log('[app.js] Formulário de seleção de área submetido');
                handleSelectAreaFormSubmit(event);
            });
            
            // Event listener adicional para o botão
            confirmAreaBtn.addEventListener('click', function(event) {
                event.preventDefault();
                console.log('[app.js] Botão de confirmação de área clicado');
                handleSelectAreaFormSubmit(event);
            });
        } else {
            console.warn('[app.js] Elementos de seleção de área não encontrados:', {
                form: !!selectAreaForm,
                button: !!confirmAreaBtn
            });
        }

        addSafeEventListener('logout-btn', 'click', () => {
            console.log('[app.js] Realizando logout...');
            logoutUser();
        });

        // --- Eventos de Ações Principais ---
        const processPdfBtn = document.getElementById('process-pdf');
        const pdfUploadInput = document.getElementById('pdf-upload');
        const selectedFileName = document.getElementById('selected-file-name');
        
        if (processPdfBtn && pdfUploadInput && selectedFileName) {
            console.log('[app.js] Configurando eventos de processamento de PDF...');
            
            // Evento para mudança no input de arquivo
            pdfUploadInput.addEventListener('change', (event) => {
                const file = event.target.files[0];
                if (file) {
                    console.log('[app.js] Arquivo selecionado:', file.name);
                    if (file.type !== 'application/pdf') {
                        console.warn('[app.js] Arquivo não é um PDF:', file.type);
                        showNotification('Por favor, selecione apenas arquivos PDF.', 'error');
                        event.target.value = ''; // Limpa o input
                        selectedFileName.textContent = 'Nenhum arquivo selecionado';
                        processPdfBtn.disabled = true;
                    } else {
                        // Se for um PDF válido, atualiza a UI
                        selectedFileName.textContent = file.name;
                        processPdfBtn.disabled = false;
                    }
                } else {
                    // Se não houver arquivo, reseta a UI
                    selectedFileName.textContent = 'Nenhum arquivo selecionado';
                    processPdfBtn.disabled = true;
                }
            });
            
            // Evento para o botão de processar
            processPdfBtn.addEventListener('click', async () => {
                console.log('[app.js] Botão de processar PDF clicado');
                const file = pdfUploadInput.files[0];
                
                if (!file) {
                    console.warn('[app.js] Nenhum arquivo selecionado');
                    showNotification('Por favor, selecione um arquivo PDF.', 'error');
                    return;
                }
                
                // Desabilita o botão e mostra loading
                processPdfBtn.disabled = true;
                const originalText = processPdfBtn.textContent;
                processPdfBtn.textContent = 'Processando...';
                
                console.log('[app.js] Iniciando processamento do PDF:', file.name);
                try {
                    await processPDF(file);
                    console.log('[app.js] PDF processado com sucesso');
                    // Limpa o input e reseta a UI após sucesso
                    pdfUploadInput.value = '';
                    selectedFileName.textContent = 'Nenhum arquivo selecionado';
                    showNotification('PDF processado com sucesso!', 'success');
                } catch (error) {
                    console.error('[app.js] Erro ao processar PDF:', error);
                    showNotification('Erro ao processar o PDF. Verifique o console para mais detalhes.', 'error');
                } finally {
                    // Restaura o botão
                    processPdfBtn.disabled = true; // Mantém desabilitado até selecionar novo arquivo
                    processPdfBtn.textContent = originalText;
                }
            });

            // Inicialmente desabilita o botão até que um arquivo seja selecionado
            processPdfBtn.disabled = true;
        } else {
            console.warn('[app.js] Elementos de processamento de PDF não encontrados:', {
                processPdfBtn: !!processPdfBtn,
                pdfUploadInput: !!pdfUploadInput,
                selectedFileName: !!selectedFileName
            });
        }
        
        console.log('[app.js] Event listeners configurados com sucesso');
    });
    
} catch (error) {
    console.error("[app.js] Erro fatal na inicialização:", error);
}