// modules/ui.js
import { showNotification } from './notifications.js';
import { 
    getCurrentUser, getOrders, saveOrders, 
    getWithdrawers, saveWithdrawers, 
    loadAreas, saveAreas, getTempOrder, clearTempOrder 
} from './storage.js';
import { parseDate, getCurrentDate, normalizeString, formatCurrency, formatDate, debounce } from './utils.js';
// CORREÇÃO: Adicionando UserRoles à importação de constants.js
import { OrderStatus, DEFAULT_AREAS, APP_CONFIG, STORAGE_KEYS, UserRoles } from './constants.js';
import { determineOrderStatus, formatStatus, getStatusIcon, formatCNPJ } from './orders.js'; 

// Estado da UI (simplificado)
let currentOpenModal = null;
let AREAS = []; // Será carregado em initializeUIState

// --- Funções de Utilidade para DOM ---
const getEl = (id) => document.getElementById(id);
const querySel = (selector) => document.querySelector(selector);
const querySelAll = (selector) => document.querySelectorAll(selector);

// Variável para rastrear requisições de loader ativas
let loaderRequestCount = 0;
let loaderTimeouts = [];

export function showLoader() {
    loaderRequestCount++;
    const loader = getEl('loader');
    if (loader) {
        loader.classList.remove('hidden');
        
        // Adicionar um timeout de segurança para este loader
        const timeoutId = setTimeout(() => {
            console.warn('[UI] Loader ficou visível por muito tempo. Escondendo automaticamente.');
            hideLoaderForce();
        }, 10000); // 10 segundos de timeout
        
        loaderTimeouts.push(timeoutId);
    }
}

export function hideLoader() {
    loaderRequestCount = Math.max(0, loaderRequestCount - 1);
    
    if (loaderRequestCount === 0) {
        const loader = getEl('loader');
        if (loader) {
            loader.classList.add('hidden');
            
            // Limpar todos os timeouts quando o loader é escondido
            loaderTimeouts.forEach(id => clearTimeout(id));
            loaderTimeouts = [];
        }
    }
}

// Força o fechamento do loader, independentemente do contador
export function hideLoaderForce() {
    loaderRequestCount = 0;
    const loader = getEl('loader');
    if (loader) {
        loader.classList.add('hidden');
        
        // Limpar todos os timeouts quando o loader é escondido
        loaderTimeouts.forEach(id => clearTimeout(id));
        loaderTimeouts = [];
    }
}

export function closeModal() {
    console.log('[UI] Fechando todos os modais...');
    querySelAll('.modal').forEach(modal => {
        modal.classList.add('hidden');
        console.log(`[UI] Modal ${modal.id} fechado`);
    });
    currentOpenModal = null;
    // Restaura o scroll do body
    document.body.style.overflow = '';
}

function openModal(modalId) {
    console.log(`[UI] Tentando abrir modal: ${modalId}`);
    const modalToOpen = getEl(modalId);
    if (!modalToOpen) {
        console.warn(`[UI] Modal com ID "${modalId}" não encontrado.`);
        return;
    }

    // Fecha todos os outros modais primeiro
    querySelAll('.modal').forEach(modal => {
        if (modal.id !== modalId) {
            modal.classList.add('hidden');
            console.log(`[UI] Modal ${modal.id} fechado`);
        }
    });

    // Agora mostra o modal alvo
    modalToOpen.classList.remove('hidden');
    console.log(`[UI] Modal ${modalId} aberto`);
    currentOpenModal = modalId;
    
    // Evita scroll do body quando modal está aberto
    document.body.style.overflow = 'hidden';

    // Foco no primeiro elemento focável do modal para acessibilidade
    const focusableElements = modalToOpen.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusableElements.length > 0) {
        focusableElements[0].focus();
        console.log(`[UI] Foco definido no primeiro elemento do modal ${modalId}`);
    }
}

// --- Inicialização e Estado da UI ---
export function initializeUIState() {
    AREAS = loadAreas();
    if (!Array.isArray(AREAS) || AREAS.length === 0) {
        AREAS = [...DEFAULT_AREAS]; // Cria uma cópia para evitar mutação direta do DEFAULT_AREAS
        saveAreas(AREAS);
    }
}
initializeUIState(); // Carrega as áreas ao carregar o módulo


// --- Atualizações de Perfil e Dashboard ---
export function updateUserProfile(currentUser = getCurrentUser()) {
    const userProfileName = querySel('#user-profile span');
    const userProfileIcon = querySel('#user-profile i[data-feather="user"]');
    
    if (userProfileName) {
        userProfileName.textContent = currentUser ? currentUser.name : 'Visitante';
    }
    if (userProfileIcon && window.feather) { // Garante que feather está disponível
        userProfileIcon.setAttribute('data-feather', currentUser ? 'user-check' : 'user');
        window.feather.replace();
    }
}

function getStatusCounts() {
    const orders = getOrders();
    const counts = Object.values(OrderStatus).reduce((acc, status) => {
        acc[status] = 0;
        return acc;
    }, {});

    orders.forEach(order => {
        if (order.status && counts.hasOwnProperty(order.status)) {
            counts[order.status]++;
        } else {
            // Se o status for desconhecido ou ausente, pode-se contar como pendente ou logar um aviso
            console.warn(`Pedido com ID ${order.id || order.numeroPedido} possui status inválido: ${order.status}. Contando como PENDENTE.`);
            counts[OrderStatus.PENDING]++;
        }
    });
    return counts;
}

let statusChartInstance = null; // Mantém a instância do gráfico

export function updateDashboardVisuals() {
    const counts = getStatusCounts();
    
    const elementsToUpdate = {
        'count-pending': counts[OrderStatus.PENDING],
        'count-received': counts[OrderStatus.RECEIVED],
        'count-with_observations': counts[OrderStatus.WITH_OBSERVATIONS],
        'count-completed': counts[OrderStatus.COMPLETED],
        'count-returned': counts[OrderStatus.RETURNED],
    };
    // Adiciona contagem para 'Pronto para Retirada' se o elemento existir no HTML
    if (getEl('count-ready_for_pickup')) {
        elementsToUpdate['count-ready_for_pickup'] = counts[OrderStatus.READY_FOR_PICKUP];
    }


    Object.entries(elementsToUpdate).forEach(([id, value]) => {
        const element = getEl(id);
        if (element) element.textContent = value !== undefined ? value : 0;
    });

    // Atualiza ou cria o gráfico
    const ctx = getEl('statusChart')?.getContext('2d');
    if (!ctx) {
        // console.warn("Elemento canvas 'statusChart' não encontrado para o dashboard.");
        return;
    }

    const chartLabels = [];
    const chartDataValues = [];
    const chartBackgroundColors = [];

    // Garante que apenas status com contagem ou relevantes sejam mostrados, ou todos se preferir
    // Aqui, vamos mostrar todos os status definidos em OrderStatus para consistência
    for (const statusKey in OrderStatus) {
        const statusValue = OrderStatus[statusKey];
        chartLabels.push(formatStatus(statusValue));
        chartDataValues.push(counts[statusValue] || 0); // Garante que é um número
        switch(statusValue) {
            case OrderStatus.PENDING: chartBackgroundColors.push('var(--senac-orange, #D5580D)'); break;
            case OrderStatus.RECEIVED: chartBackgroundColors.push('var(--senac-light-blue, #0078C2)'); break;
            case OrderStatus.WITH_OBSERVATIONS: chartBackgroundColors.push('#FFC107'); break;
            case OrderStatus.COMPLETED: chartBackgroundColors.push('#28a745'); break;
            case OrderStatus.RETURNED: chartBackgroundColors.push('#dc3545'); break;
            case OrderStatus.READY_FOR_PICKUP: chartBackgroundColors.push('#805AD5'); break; // Roxo para 'Pronto para Retirada'
            default: chartBackgroundColors.push('#CCCCCC'); // Cor padrão para status desconhecido
        }
    }
    
    const chartConfigData = {
        labels: chartLabels,
        datasets: [{
            data: chartDataValues,
            backgroundColor: chartBackgroundColors,
            borderColor: 'var(--white, #FFFFFF)', // Fallback para cor de fundo
            borderWidth: 2,
        }]
    };

    // Verificar primeiro se existe uma instância global
    if (window.chartInstances && window.chartInstances.statusChart) {
        // Usar a instância global
        window.chartInstances.statusChart.data = chartConfigData;
        window.chartInstances.statusChart.update();
        return;
    }

    // Verificar e destruir a instância local se existir
    if (statusChartInstance) {
        statusChartInstance.destroy();
    }

    // Criar uma nova instância
    if (typeof Chart !== 'undefined') { // Verifica se Chart.js está carregado
        statusChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: chartConfigData,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    animateScale: true,
                    animateRotate: true
                },
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            font: { family: 'var(--font-family, sans-serif)' },
                            padding: 15,
                        }
                    },
                    tooltip: {
                        bodyFont: { family: 'var(--font-family, sans-serif)' },
                        titleFont: { family: 'var(--font-family, sans-serif)' }
                    }
                }
            }
        });
        
        // Armazenar também na referência global
        if (!window.chartInstances) {
            window.chartInstances = {};
        }
        window.chartInstances.statusChart = statusChartInstance;
    } else {
        console.warn("Chart.js não está carregado. O gráfico do dashboard não será exibido.");
    }
}

export function displayDashboard() {
    updateDashboardVisuals(); // Apenas atualiza, a seção já deve estar ativa
}


// --- Renderização de Pedidos ---
function orderMatchesSearch(order, normalizedSearchValue) {
    if (!normalizedSearchValue) return true; // Se a busca estiver vazia, todos combinam

    const fieldsToSearch = [
        order.numeroPedido,
        order.nomeFornecedor,
        order.cnpjFornecedor,
        order.globalObservation,
        order.area,
        order.senderName,
        order.receiverName,
        order.withdrawer,
        formatStatus(order.status) // Permite buscar pelo nome do status formatado
    ];

    if (fieldsToSearch.some(field => field && normalizeString(String(field)).includes(normalizedSearchValue))) {
        return true;
    }

    return (order.itens || []).some(item =>
        (item.description && normalizeString(item.description).includes(normalizedSearchValue)) ||
        (item.code && normalizeString(item.code).includes(normalizedSearchValue))
    );
}

function createOrderCard(order, currentUser) {
    const orderCard = document.createElement('div');
    orderCard.className = 'order-card';
    orderCard.dataset.orderId = order.id; // Usar o ID interno do sistema

    const {
        numeroPedido, nomeFornecedor, cnpjFornecedor, area, senderName, sendDate,
        receiveDate, receiverName, withdrawalDate, withdrawer, status, globalObservation, itens = []
    } = order;

    const totalValue = itens.reduce((acc, item) => {
        const qty = Number(item.quantity) || 0;
        const price = Number(item.unitPrice) || 0;
        return acc + (qty * price);
    }, 0);

    let actionsHTML = '';
    // Assegura que currentUser e currentUser.role existem antes de verificar as permissões
    if (currentUser && currentUser.role) { 
        // Usuário 'admin' pode ter todas as ações disponíveis para teste ou gerenciamento
        const isAdmin = currentUser.role === UserRoles.ADMIN; // UserRoles agora está definido

        if (status === OrderStatus.PENDING && (isAdmin || currentUser.role === UserRoles.RECEIVER || currentUser.role === UserRoles.USER)) {
             actionsHTML += `<button class="action-btn conferir-btn" data-action="conferir"><i data-feather="check-circle"></i> Conferir Pedido</button>`;
        }
        if ((status === OrderStatus.RECEIVED || status === OrderStatus.WITH_OBSERVATIONS) && (isAdmin || currentUser.role === UserRoles.USER)) {
            actionsHTML += `<button class="action-btn finalizar-retirada-btn" data-action="finalizar-retirada"><i data-feather="package"></i> Pronto p/ Retirada</button>`;
            actionsHTML += `<button class="action-btn notify-requester-btn" data-action="notify-requester"><i data-feather="send"></i> Avisar Requisitante</button>`;
        }
        if (status === OrderStatus.READY_FOR_PICKUP && (isAdmin || currentUser.role === UserRoles.USER || currentUser.role === UserRoles.RECEIVER)) {
            actionsHTML += `<button class="action-btn confirmar-retirada-btn" data-action="confirmar-retirada"><i data-feather="truck"></i> Confirmar Retirada</button>`;
        }
        // Ação de imprimir pode estar disponível para mais status ou papéis
        if (status === OrderStatus.COMPLETED || status === OrderStatus.RETURNED || isAdmin) {
            actionsHTML += `<button class="action-btn print-details-btn" data-action="print-details"><i data-feather="printer"></i> Imprimir Detalhes</button>`;
        }
    }

    orderCard.innerHTML = `
        <div class="order-card-header">
            <h3>Pedido Nº ${numeroPedido}</h3>
            <span class="status-indicator status-${status}">
                <i data-feather="${getStatusIcon(status)}"></i> ${formatStatus(status)}
            </span>
        </div>
        <div class="order-details">
            <p><strong>Fornecedor:</strong> ${nomeFornecedor || 'N/A'}</p>
            <p><strong>CNPJ:</strong> ${cnpjFornecedor ? formatCNPJ(cnpjFornecedor) : 'N/A'}</p>
            <p><strong>Área Dest.:</strong> ${area || 'Não definida'}</p>
            <p><strong>Enviado por:</strong> ${senderName || 'N/A'} em ${sendDate ? formatDate(sendDate) : 'N/A'}</p>
            ${receiveDate ? `<p><strong>Recebido por:</strong> ${receiverName || 'N/A'} em ${formatDate(receiveDate)}</p>` : ''}
            ${withdrawalDate ? `<p><strong>Retirado por:</strong> ${withdrawer || 'N/A'} em ${formatDate(withdrawalDate)}</p>` : ''}
            ${globalObservation ? `<p class="global-observation-display"><strong>Obs. Pedido:</strong> ${globalObservation}</p>` : ''}
        </div>
        <div class="order-card-footer">
            <button class="action-btn view-items-btn" data-action="view-items">
                <i data-feather="eye"></i> Ver Itens
            </button>
            <div class="order-actions">${actionsHTML}</div>
        </div>
        <div class="items-list hidden">
            <table>
                <thead>
                    <tr>
                        <th>#</th><th>Cód.</th><th>Descrição</th><th>Qtd</th><th>UN</th><th>Vlr. Unit.</th><th>Vlr. Total</th><th>Obs. Item</th>
                    </tr>
                </thead>
                <tbody>
                    ${itens.map(item => `
                        <tr>
                            <td>${item.lineNumber || '-'}</td>
                            <td>${item.code || '-'}</td>
                            <td class="item-description">${item.description || '-'}</td>
                            <td>${Number(item.quantity) || 0}</td>
                            <td>${item.unit || '-'}</td>
                            <td>${formatCurrency(Number(item.unitPrice) || 0)}</td>
                            <td>${formatCurrency((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0))}</td>
                            <td class="item-observation">${item.observation || '-'}</td>
                        </tr>
                    `).join('')}
                    ${itens.length > 0 ? `
                        <tr class="total-row">
                            <td colspan="6"><strong>TOTAL DO PEDIDO:</strong></td>
                            <td colspan="2"><strong>${formatCurrency(totalValue)}</strong></td>
                        </tr>
                    ` : `<tr><td colspan="8" class="text-center p-4">Nenhum item encontrado para este pedido.</td></tr>`}
                </tbody>
            </table>
        </div>
    `;
    return orderCard;
}

function renderOrders(containerId, specificFilterFn = () => true, sortFn = (a, b) => {
    // Ordena por data de envio (ou upload) mais recente primeiro
    const dateA = parseDate(a.uploadDate || a.sendDate) || new Date(0);
    const dateB = parseDate(b.uploadDate || b.sendDate) || new Date(0);
    return dateB - dateA;
}) {
    const container = getEl(containerId);
    if (!container) {
        console.warn(`Container "${containerId}" não encontrado para renderizar pedidos.`);
        return;
    }
    container.innerHTML = ''; // Limpa antes de renderizar

    const orders = getOrders();
    const currentUser = getCurrentUser(); 
    
    // Constrói IDs dos inputs de busca e filtro de status dinamicamente
    const baseId = containerId.replace('-orders-container', '');
    const searchInput = getEl(`${baseId}-search`);
    const statusFilter = getEl(`${baseId}-status-filter`) || getEl(`${baseId}-pending-filter`); // Caso especial para receiver

    const normalizedSearchValue = searchInput ? normalizeString(searchInput.value) : '';
    const selectedStatus = statusFilter ? statusFilter.value : 'all';

    const filteredOrders = orders
        .filter(order => {
            const statusMatch = selectedStatus === 'all' || order.status === selectedStatus;
            const searchMatch = orderMatchesSearch(order, normalizedSearchValue);
            return specificFilterFn(order) && statusMatch && searchMatch;
        })
        .sort(sortFn);

    if (filteredOrders.length === 0) {
        container.innerHTML = '<p class="no-orders-message">Nenhum pedido encontrado com os critérios selecionados.</p>';
        return;
    }

    filteredOrders.forEach(order => {
        container.appendChild(createOrderCard(order, currentUser));
    });

    if (window.feather) window.feather.replace(); // Atualiza os ícones
}


// --- Funções de Display para Cada Seção ---
export function displayBuyerOrders() {
    // Na aba "Comprador", geralmente mostramos todos os pedidos. O filtro de status no select fará o trabalho.
    renderOrders('buyer-orders-container');
}

export function displayReceiverOrders() {
    // Na aba "Recebimento", filtramos por padrão para mostrar apenas pedidos PENDENTES.
    // O select 'receiver-pending-filter' pode permitir ver outros status se necessário.
    renderOrders('receiver-orders-container', order => order.status === OrderStatus.PENDING);
}

export function displayFinalizedOrders() {
     // Na aba "Finalizados", mostramos pedidos Concluídos, Devolvidos ou Com Observações (após recebimento).
    renderOrders('finalized-orders-container', order => 
        [OrderStatus.COMPLETED, OrderStatus.RETURNED, OrderStatus.WITH_OBSERVATIONS].includes(order.status)
    );
}

export function displayWithdrawalOrders() {
    // Na aba "Retirada", mostramos pedidos que estão Prontos para Retirada.
    renderOrders('withdrawal-orders-container', order => order.status === OrderStatus.READY_FOR_PICKUP);
}

// --- Funções de Ação do Pedido (Manipuladores de Eventos) ---
function handleOrderCardAction(event) {
    const action = event.target.dataset.action;
    const orderId = event.target.closest('.order-card')?.dataset.orderId;
    
    if (!action || !orderId) {
        console.warn('[UI] Ação ou ID do pedido não encontrados:', { action, orderId });
        return;
    }

    console.log(`[UI] Ação "${action}" solicitada para pedido ${orderId}`);
    
    // Adiciona estado de loading ao botão
    const button = event.target;
    const originalContent = button.innerHTML;
    button.disabled = true;
    button.innerHTML = 'Processando...';
    
    // Pequeno delay para mostrar o estado de loading
    setTimeout(() => {
        try {
            switch (action) {
                case 'view-items':
                    toggleItemsList(event.target.closest('.order-card'));
                    break;
                case 'conferir':
                    openConferenceModal(orderId);
                    break;
                case 'notify-requester':
                    openNotifyRequesterModal(orderId);
                    break;
                case 'finalizar-retirada':
                    markOrderReadyForPickup(orderId);
                    break;
                case 'confirmar-retirada':
                    openWithdrawalModal(orderId);
                    break;
                case 'print-details':
                    window.print();
                    break;
                default:
                    console.warn(`[UI] Ação desconhecida: ${action}`);
            }
        } catch (error) {
            console.error(`[UI] Erro ao executar ação ${action}:`, error);
            showNotification('Erro ao executar ação. Tente novamente.', 'error');
        } finally {
            // Restaura o botão ao estado original
            button.disabled = false;
            button.innerHTML = originalContent;
        }
    }, 100);
}

function toggleItemsList(orderCardElement) {
    if (!orderCardElement) {
        console.warn('[UI] Elemento do card de pedido não encontrado');
        return;
    }

    const itemsList = orderCardElement.querySelector('.items-list');
    const viewItemsBtn = orderCardElement.querySelector('[data-action="view-items"]');
    
    if (!itemsList || !viewItemsBtn) {
        console.warn('[UI] Elementos necessários não encontrados:', {
            itemsList: !!itemsList,
            viewItemsBtn: !!viewItemsBtn
        });
        return;
    }

    const isHidden = itemsList.classList.contains('hidden');
    console.log(`[UI] Alternando visibilidade da lista de itens: ${isHidden ? 'mostrando' : 'escondendo'}`);

    // Toggle da lista
    itemsList.classList.toggle('hidden');
    
    // Atualiza o texto e ícone do botão
    const icon = viewItemsBtn.querySelector('i[data-feather]');
    if (icon) {
        icon.setAttribute('data-feather', isHidden ? 'chevron-up' : 'eye');
    }
    
    // Atualiza o texto do botão mantendo o ícone
    const newIconHtml = `<i data-feather="${isHidden ? 'chevron-up' : 'eye'}"></i>`;
    viewItemsBtn.innerHTML = `${newIconHtml} ${isHidden ? 'Ocultar Itens' : 'Ver Itens'}`;
    
    // Atualiza os ícones
    if (window.feather) {
        window.feather.replace();
    }
}


// --- Modais Específicos ---

export function showLoginModal() {
    console.log('[UI] Mostrando modal de login...');
    openModal('login-modal');
}

export function openSelectAreaModal(orderData) {
    console.log('[UI] Abrindo modal de seleção de área com dados:', orderData);
    
    const modal = getEl('select-area-modal');
    const areaSelect = getEl('area-select');
    const newAreaGroup = getEl('new-area-group');
    const newAreaInput = getEl('new-area');

    if (!modal || !areaSelect || !newAreaGroup || !newAreaInput) {
        console.error('[UI] Elementos do modal de seleção de área não encontrados:', {
            modal: !!modal,
            areaSelect: !!areaSelect,
            newAreaGroup: !!newAreaGroup,
            newAreaInput: !!newAreaInput
        });
        return;
    }

    if (!orderData) {
        console.error('[UI] Dados do pedido não fornecidos ao abrir modal de área');
        showNotification('Erro: dados do pedido não encontrados.', 'error');
        return;
    }
    
    try {
        console.log('[UI] Salvando dados do pedido no modal...');
        modal.dataset.orderData = JSON.stringify(orderData);
        console.log('[UI] Dados salvos com sucesso');
    } catch (error) {
        console.error('[UI] Erro ao salvar dados do pedido no modal:', error);
        showNotification('Erro ao processar dados do pedido.', 'error');
        return;
    }

    console.log('[UI] Preenchendo select de áreas...');
    areaSelect.innerHTML = '<option value="">Selecione uma área...</option>';
    AREAS.sort().forEach(area => { 
        const option = document.createElement('option');
        option.value = area;
        option.textContent = area;
        areaSelect.appendChild(option);
    });
    const otherOption = document.createElement('option');
    otherOption.value = 'Outra';
    otherOption.textContent = 'Outra (especificar)';
    areaSelect.appendChild(otherOption);

    newAreaInput.value = '';
    newAreaGroup.classList.add('hidden'); 
    areaSelect.value = ''; 

    console.log('[UI] Abrindo modal...');
    openModal('select-area-modal');
    console.log('[UI] Modal aberto com sucesso');
}

function openConferenceModal(orderId) {
    const order = getOrders().find(o => o.id === orderId);
    if (!order) {
        showNotification('Pedido não encontrado para conferência.', 'error');
        return;
    }

    getEl('modal-order-number').textContent = order.numeroPedido;
    getEl('modal-supplier-name').textContent = order.nomeFornecedor;
    getEl('modal-supplier-cnpj').textContent = formatCNPJ(order.cnpjFornecedor);
    getEl('modal-sender-name').textContent = order.senderName;
    getEl('modal-send-date').textContent = formatDate(order.sendDate);

    const itemsTableBody = querySel('#modal-items-table tbody');
    itemsTableBody.innerHTML = ''; 
    (order.itens || []).forEach(item => {
        const row = itemsTableBody.insertRow();
        row.innerHTML = `
            <td>${item.lineNumber || '-'}</td>
            <td>${item.code || '-'}</td>
            <td class="item-description">${item.description || '-'}</td>
            <td>${item.quantity || 0}</td>
            <td>${item.unit || '-'}</td>
            <td>${formatCurrency(item.unitPrice || 0)}</td>
            <td>${formatCurrency((item.quantity || 0) * (item.unitPrice || 0))}</td>
        `;
    });

    getEl('global-observation').value = order.globalObservation || '';
    getEl('nf-upload').value = ''; 
    getEl('boleto-upload').value = '';

    const modal = getEl('modal'); 
    modal.dataset.orderId = orderId; 
    openModal('modal');
    if (window.feather) window.feather.replace(); 
}

function openNotifyRequesterModal(orderId) {
    const modal = getEl('notify-requester-modal');
    const order = getOrders().find(o => o.id === orderId);
    if (!order || !modal) {
        console.warn("Pedido ou modal de notificação não encontrado.");
        return;
    }

    modal.dataset.orderId = orderId;
    const requesterNameInput = getEl('requester-name');
    if (requesterNameInput) {
        requesterNameInput.value = order.senderName || ''; 
    }
    openModal('notify-requester-modal');
}

function openWithdrawalModal(orderId) {
    const modal = getEl('withdrawal-modal');
    if (!modal) return;
    modal.dataset.orderId = orderId;
    const withdrawerNameInput = getEl('withdrawer-name');
    if (withdrawerNameInput) withdrawerNameInput.value = '';
    updateWithdrawerSuggestions(''); 
    openModal('withdrawal-modal');
}


// --- Funções de Lógica de Negócio da UI (disparadas por eventos) ---

export function handleSelectAreaFormSubmit(event) {
    event.preventDefault();
    console.log('[UI] Processando submissão do formulário de área...');

    const modal = getEl('select-area-modal');
    const orderDataString = modal.dataset.orderData; 
    if (!orderDataString) {
        showNotification('Erro: dados do pedido não encontrados para salvar área.', 'error');
        closeModal();
        return;
    }

    try {
        const order = JSON.parse(orderDataString);
        console.log('[UI] Dados do pedido recuperados:', order);

        const areaSelect = getEl('area-select');
        const newAreaInput = getEl('new-area');
        let selectedArea = areaSelect.value;

        if (!selectedArea) {
            showNotification('Por favor, selecione ou defina uma área.', 'error');
            return;
        }

        if (selectedArea === 'Outra') {
            selectedArea = normalizeString(newAreaInput.value).toUpperCase(); 
            if (!selectedArea) {
                showNotification('Por favor, insira o nome da nova área.', 'error');
                newAreaInput.focus();
                return;
            }
            const normalizedNewArea = normalizeString(selectedArea);
            if (!AREAS.map(a => normalizeString(a)).includes(normalizedNewArea)) {
                AREAS.push(selectedArea); 
                saveAreas(AREAS);         
                console.log("[UI] Nova área adicionada e salva:", selectedArea);
            } else {
                selectedArea = AREAS.find(a => normalizeString(a) === normalizedNewArea) || selectedArea;
            }
        }

        order.area = selectedArea;
        order.status = OrderStatus.PENDING;

        const orders = getOrders();
        orders.push(order); 

        console.log('[UI] Salvando pedido com área:', order);

        if (saveOrders(orders)) {
            showNotification(`Pedido Nº ${order.numeroPedido} salvo com área "${selectedArea}"!`, 'success');
            clearTempOrder(); 
            closeModal();

            // Atualiza a interface
            displayBuyerOrders(); // Atualiza a lista de pedidos
            updateDashboardVisuals(); // Atualiza o dashboard
            
            // Muda para a aba do comprador
            setActiveSection('buyer-section');
            setActiveNav('buyer-btn');
        } else {
            showNotification('Erro ao salvar o pedido.', 'error');
        }
    } catch (error) {
        console.error('[UI] Erro ao processar formulário de área:', error);
        showNotification('Erro ao processar o pedido. Por favor, tente novamente.', 'error');
    }
}

export function handleSaveConference() { 
    const conferenceModal = getEl('modal'); 
    const orderId = conferenceModal?.dataset.orderId;
    if (!orderId) {
        console.warn("ID do pedido não encontrado no modal de conferência.");
        return;
    }

    const confirmationModal = getEl('confirmation-modal');
    if (confirmationModal) {
        confirmationModal.dataset.orderId = orderId; 
        openModal('confirmation-modal');
    }
}

export async function handleConfirmSaveConference() { 
    const confirmationModal = getEl('confirmation-modal');
    const orderId = confirmationModal?.dataset.orderId;
    if (!orderId) {
        showNotification('Erro: ID do pedido não encontrado para salvar conferência.', 'error');
        closeModal(); 
        return;
    }

    showLoader();
    const orders = getOrders();
    const orderIndex = orders.findIndex(o => o.id === orderId);

    if (orderIndex === -1) {
        hideLoader();
        showNotification('Pedido não encontrado no sistema.', 'error');
        closeModal();
        return;
    }

    const order = { ...orders[orderIndex] }; 
    const currentUser = getCurrentUser();

    order.globalObservation = getEl('global-observation').value.trim();
    order.receiverName = currentUser?.name || 'Sistema'; 
    order.receiveDate = new Date().toISOString();      

    const nfFileInput = getEl('nf-upload');
    const boletoFileInput = getEl('boleto-upload');
    const nfFile = nfFileInput ? nfFileInput.files[0] : null;
    const boletoFile = boletoFileInput ? boletoFileInput.files[0] : null;

    if (nfFile) {
        order.nfFile = { name: nfFile.name, type: nfFile.type, size: nfFile.size, uploadedAt: new Date().toISOString() };
    }
    if (boletoFile) {
        order.boletoFile = { name: boletoFile.name, type: boletoFile.type, size: boletoFile.size, uploadedAt: new Date().toISOString() };
    }
    
    order.status = determineOrderStatus(order); 
    orders[orderIndex] = order; 

    if (saveOrders(orders)) {
        showNotification('Conferência salva com sucesso!', 'success');
    } else {
        showNotification('Erro ao salvar a conferência.', 'error');
    }
    
    hideLoader();
    closeModal(); 
    refreshAllOrderDisplays();
    updateDashboardVisuals();
}

export function handleConfirmWithdrawal() {
    const modal = getEl('withdrawal-modal');
    const orderId = modal?.dataset.orderId;
    const withdrawerNameInput = getEl('withdrawer-name');
    const withdrawerName = normalizeString(withdrawerNameInput.value).toUpperCase();

    if (!orderId) {
        showNotification('Erro: ID do pedido não encontrado.', 'error'); return;
    }
    if (!withdrawerName) {
        showNotification('Por favor, insira o nome do retirante.', 'error');
        if (withdrawerNameInput) withdrawerNameInput.focus();
        return;
    }

    const orders = getOrders();
    const orderIndex = orders.findIndex(o => o.id === orderId);
    if (orderIndex === -1) {
        showNotification('Pedido não encontrado.', 'error'); return;
    }

    const orderToUpdate = { ...orders[orderIndex] }; 
    orderToUpdate.withdrawer = withdrawerName;
    orderToUpdate.withdrawalDate = new Date().toISOString();
    orderToUpdate.status = OrderStatus.COMPLETED;
    
    orders[orderIndex] = orderToUpdate; 
    
    if (saveOrders(orders)) {
        const withdrawers = getWithdrawers();
        const normalizedNewWithdrawer = normalizeString(withdrawerName);
        if (!withdrawers.map(w => normalizeString(w)).includes(normalizedNewWithdrawer)) {
            withdrawers.push(withdrawerName.toUpperCase()); 
            saveWithdrawers(withdrawers);
        }
        showNotification('Retirada confirmada e pedido concluído!', 'success');
    } else {
        showNotification('Erro ao confirmar retirada.', 'error');
    }

    closeModal();
    refreshAllOrderDisplays();
    updateDashboardVisuals();
}

export function handleSendRequesterNotification() {
    const modal = getEl('notify-requester-modal');
    const orderId = modal?.dataset.orderId; 
    const requesterNameInput = getEl('requester-name');
    const requesterName = requesterNameInput ? requesterNameInput.value.trim() : '';

    if (!requesterName) {
        showNotification('Por favor, insira o nome do requisitante.', 'error');
        if (requesterNameInput) requesterNameInput.focus();
        return;
    }
    
    const order = getOrders().find(o => o.id === orderId);
    const orderNumberText = order ? `do pedido Nº ${order.numeroPedido} ` : '';

    console.log(`Simulando envio de notificação para ${requesterName} sobre o pedido ${orderId}`);
    showNotification(`Notificação ${orderNumberText}enviada para ${requesterName}! (Simulado)`, 'success');
    
    if (requesterNameInput) requesterNameInput.value = ''; 
    closeModal();
}

function markOrderReadyForPickup(orderId) {
    const orders = getOrders();
    const orderIndex = orders.findIndex(o => o.id === orderId);
    if (orderIndex === -1) {
        showNotification('Pedido não encontrado.', 'error'); return;
    }
    
    const orderToUpdate = { ...orders[orderIndex] };
    orderToUpdate.status = OrderStatus.READY_FOR_PICKUP;
    orders[orderIndex] = orderToUpdate;

    if (saveOrders(orders)) {
        showNotification('Pedido marcado como "Pronto para Retirada"!', 'success');
        refreshAllOrderDisplays();
        updateDashboardVisuals();
    } else {
        showNotification('Erro ao atualizar status do pedido.', 'error');
    }
}

function updateWithdrawerSuggestions(query) {
    const suggestionsList = getEl('withdrawer-suggestions');
    if (!suggestionsList) return;

    suggestionsList.innerHTML = '';
    const normalizedQuery = normalizeString(query);

    if (!normalizedQuery || normalizedQuery.length < 2) { 
        suggestionsList.classList.add('hidden');
        return;
    }

    const allWithdrawers = getWithdrawers();
    const filtered = allWithdrawers
        .filter(w => normalizeString(w).includes(normalizedQuery))
        .sort() 
        .slice(0, 5); 

    if (filtered.length > 0) {
        filtered.forEach(name => {
            const li = document.createElement('li');
            li.textContent = name;
            li.tabIndex = 0; 
            li.addEventListener('click', () => selectWithdrawerSuggestion(name));
            li.addEventListener('keydown', (e) => { 
                if (e.key === 'Enter' || e.key === ' ') {
                    selectWithdrawerSuggestion(name);
                }
            });
            suggestionsList.appendChild(li);
        });
        suggestionsList.classList.remove('hidden');
    } else {
        suggestionsList.classList.add('hidden');
    }
}

function selectWithdrawerSuggestion(name) {
    const withdrawerNameInput = getEl('withdrawer-name');
    const suggestionsList = getEl('withdrawer-suggestions');
    if (withdrawerNameInput) withdrawerNameInput.value = name;
    if (suggestionsList) {
        suggestionsList.innerHTML = '';
        suggestionsList.classList.add('hidden');
    }
    if (withdrawerNameInput) withdrawerNameInput.focus(); 
}


// --- Navegação e Visibilidade de Seções ---
export function setActiveSection(sectionId) {
    querySelAll('main .sections-wrapper section').forEach(section => {
        const isActive = section.id === sectionId;
        section.classList.toggle('hidden-section', !isActive); 
        section.classList.toggle('active-section', isActive);  
    });
}

export function setActiveNav(activeBtnId) {
    querySelAll('.nav-menu .nav-item').forEach(item => {
        const button = item.querySelector('.nav-btn');
        item.classList.toggle('active', button && button.id === activeBtnId);
    });
}

// --- Funções de Refresh ---
export function refreshAllOrderDisplays() {
    displayBuyerOrders();
    displayReceiverOrders();
    displayFinalizedOrders();
    displayWithdrawalOrders();
}

// --- Event Listeners Globais ---

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && currentOpenModal) {
        closeModal();
    }
});

querySelAll('.modal').forEach(modalElement => {
    modalElement.addEventListener('click', (event) => {
        if (event.target === modalElement) { 
            closeModal();
        }
    });
});

// Event listeners específicos para containers de pedidos
['buyer-orders-container', 'receiver-orders-container', 'finalized-orders-container', 'withdrawal-orders-container'].forEach(containerId => {
    const container = document.getElementById(containerId);
    if (container) {
        container.addEventListener('click', function(event) {
            const btn = event.target.closest('button[data-action]');
            if (btn && btn.closest('.order-card')) {
                console.log(`[UI] Botão de ação clicado em ${containerId}:`, {
                    action: btn.dataset.action,
                    orderId: btn.closest('.order-card')?.dataset.orderId
                });
                handleOrderCardAction(event);
            }
        });
    }
});

const withdrawerNameInput = getEl('withdrawer-name');
if (withdrawerNameInput) {
    withdrawerNameInput.addEventListener('input', debounce((event) => {
        updateWithdrawerSuggestions(event.target.value);
    }, APP_CONFIG.DEBOUNCE_SEARCH_TIMEOUT));
    document.addEventListener('click', (event) => {
        const suggestionsList = getEl('withdrawer-suggestions');
        if (suggestionsList && !withdrawerNameInput.contains(event.target) && !suggestionsList.contains(event.target)) {
            suggestionsList.classList.add('hidden');
        }
    });
}

const areaSelect = getEl('area-select');
if (areaSelect) {
    areaSelect.addEventListener('change', (event) => {
        const newAreaGroup = getEl('new-area-group');
        if (newAreaGroup) {
            const isOtherSelected = event.target.value === 'Outra';
            newAreaGroup.classList.toggle('hidden', !isOtherSelected);
            const newAreaInput = getEl('new-area');
            if (newAreaInput) {
                newAreaInput.value = ''; 
                if (isOtherSelected) {
                    newAreaInput.focus(); 
                }
            }
        }
    });
}

const searchAndFilterIds = [
    { input: 'buyer-search', filter: 'buyer-status-filter', displayFn: displayBuyerOrders },
    { input: 'receiver-search', filter: 'receiver-pending-filter', displayFn: displayReceiverOrders },
    { input: 'finalized-search', filter: 'finalized-status-filter', displayFn: displayFinalizedOrders },
    { input: 'withdrawal-search', filter: null, displayFn: displayWithdrawalOrders } 
];

searchAndFilterIds.forEach(({ input, filter, displayFn }) => {
    const searchInputEl = getEl(input);
    const filterSelectEl = filter ? getEl(filter) : null;

    if (searchInputEl) {
        searchInputEl.addEventListener('input', debounce(displayFn, APP_CONFIG.DEBOUNCE_SEARCH_TIMEOUT));
    }
    if (filterSelectEl) {
        filterSelectEl.addEventListener('change', displayFn);
    }
});
