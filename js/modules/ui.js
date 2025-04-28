import { showNotification } from './notifications.js';
import { getCurrentUser, getOrders, saveOrders, getWithdrawers, saveWithdrawers, saveAreas, loadAreas } from './storage.js';
import { parseDate, getCurrentDate, normalizeString } from './utils.js';
import { OrderStatus, DEFAULT_AREAS } from './constants.js';
import { determineOrderStatus, formatStatus, getStatusIcon, formatCNPJ } from './orders.js';

// Inicializa AREAS com base no localStorage ou DEFAULT_AREAS
let AREAS = loadAreas();
if (!Array.isArray(AREAS) || AREAS.length === 0) {
    AREAS = [...DEFAULT_AREAS]; // Usa as áreas padrão se não houver nada no localStorage
    saveAreas(AREAS); // Salva as áreas padrão no localStorage
}

// Funções de utilidade para manipulação do DOM
export function showLoader() {
    const loader = document.getElementById('loader');
    if (loader) loader.classList.remove('hidden');
}

export function hideLoader() {
    const loader = document.getElementById('loader');
    if (loader) loader.classList.add('hidden');
}

export function closeModal() {
    document.querySelectorAll('.modal').forEach(modal => modal.classList.add('hidden'));
}

// Atualiza o perfil do usuário na interface
export function updateUserProfile() {
    const currentUser = getCurrentUser();
    const userProfile = document.getElementById('user-profile');
    if (userProfile) {
        userProfile.querySelector('span').innerText = currentUser ? currentUser.name : 'Usuário';
    }
}

// Calcula contagens de status para o dashboard
function getStatusCounts() {
    const orders = getOrders() || [];
    const counts = {
        pending: 0,
        received: 0,
        with_observations: 0,
        completed: 0,
        returned: 0
    };

    orders.forEach(order => {
        if (order.status in counts) {
            counts[order.status]++;
        }
    });

    return counts;
}

// Atualiza estatísticas do dashboard
export function updateDashboardStats() {
    const counts = getStatusCounts();
    const elements = {
        'count-pending': counts.pending,
        'count-received': counts.received,
        'count-with_observations': counts.with_observations,
        'count-completed': counts.completed,
        'count-returned': counts.returned
    };

    Object.entries(elements).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) element.innerText = value;
    });

    if (window.statusChartInstance) {
        window.statusChartInstance.data.datasets[0].data = [
            counts.pending,
            counts.received,
            counts.with_observations,
            counts.completed,
            counts.returned
        ];
        window.statusChartInstance.update();
    }
}

// Exibe o dashboard com gráfico de status
export function displayDashboard() {
    updateDashboardStats();
    const counts = getStatusCounts();
    const ctx = document.getElementById('statusChart');
    if (!ctx) return;

    if (window.statusChartInstance) {
        window.statusChartInstance.destroy();
    }

    window.statusChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Pendente', 'Recebido', 'Com Observações', 'Concluído', 'Devolvido'],
            datasets: [{
                data: [counts.pending, counts.received, counts.with_observations, counts.completed, counts.returned],
                backgroundColor: ['#FFC107', '#17A2B8', '#E67E22', '#27AE60', '#C0392B']
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });
}

// Verifica se um pedido corresponde ao termo de busca
function orderMatchesSearch(order, searchValue) {
    const normSearch = normalizeString(searchValue);
    const fields = [
        order.numeroPedido,
        order.nomeFornecedor,
        order.cnpjFornecedor,
        order.globalObservation || '',
        order.area || '',
        order.senderName || '',
        order.receiverName || '',
        order.withdrawer || ''
    ];

    if (fields.some(field => normalizeString(field).includes(normSearch))) return true;

    return (order.itens || []).some(item =>
        normalizeString(item.description).includes(normSearch) ||
        normalizeString(item.code).includes(normSearch)
    );
}

// Exibe pedidos na seção de comprador
export function displayBuyerOrders() {
    const container = document.getElementById('buyer-orders-container');
    if (!container) return;

    container.innerHTML = '';

    const searchInput = document.getElementById('buyer-search');
    const statusFilter = document.getElementById('buyer-status-filter');
    if (!searchInput || !statusFilter) return;

    let orders = getOrders() || [];
    const searchValue = searchInput.value;
    const selectedStatus = statusFilter.value;

    if (selectedStatus !== 'all') {
        orders = orders.filter(order => order.status === selectedStatus);
    }

    const filteredOrders = orders.filter(order => orderMatchesSearch(order, searchValue));
    if (filteredOrders.length === 0) {
        container.innerHTML = '<p>Nenhum pedido encontrado.</p>';
        return;
    }

    filteredOrders.sort((a, b) => parseDate(b.sendDate) - parseDate(a.sendDate));

    const currentUser = getCurrentUser();
    filteredOrders.forEach(order => {
        const itens = Array.isArray(order.itens) ? order.itens : [];
        const totalValue = itens.reduce((acc, item) => {
            const qty = Number(item.quantity) || 0;
            const price = Number(item.unitPrice) || 0;
            return acc + (qty * price);
        }, 0).toFixed(2);

        const orderCard = document.createElement('div');
        orderCard.className = 'order-card';
        orderCard.innerHTML = `
            <h3>Pedido Nº ${order.numeroPedido}</h3>
            <div class="order-details">
                <p><strong>Fornecedor:</strong> ${order.nomeFornecedor}</p>
                <p><strong>CNPJ:</strong> ${formatCNPJ(order.cnpjFornecedor)}</p>
                <p><strong>Área Destinada:</strong> ${order.area || 'Não definida'}</p>
                <p><strong>Enviado Por:</strong> ${order.senderName} em ${order.sendDate}</p>
                ${order.receiveDate ? `<p><strong>Recebido Por:</strong> ${order.receiverName} em ${order.receiveDate}</p>` : ''}
                ${order.withdrawer ? `<p><strong>Retirado Por:</strong> ${order.withdrawer} em ${order.withdrawalDate}</p>` : ''}
                <p><strong>Status:</strong> 
                    <span class="status-${order.status}">
                        <i data-feather="${getStatusIcon(order.status)}"></i> ${formatStatus(order.status)}
                    </span>
                </p>
                ${order.globalObservation ? `<p><strong>Observação do Pedido:</strong> ${order.globalObservation}</p>` : ''}
            </div>
            <button class="visualizar-itens-btn"><i data-feather="eye"></i> Visualizar Itens</button>
            <div class="order-actions">
                ${
                    currentUser && currentUser.role === 'user' && 
                    (order.status === OrderStatus.RECEIVED || order.status === OrderStatus.WITH_OBSERVATIONS) 
                    ? `
                        <button class="finalizar-pedido-btn"><i data-feather="check"></i> Concluir (Pronto p/ Retirada)</button>
                        <button class="action-btn" data-action="notify-requester"><i data-feather="send"></i> Avisar Requisitante</button>
                    ` : ''
                }
            </div>
            <div class="items-list" style="display: none;">
                <table>
                    <thead>
                        <tr>
                            <th>Linha</th>
                            <th>Código</th>
                            <th>Descrição</th>
                            <th>Quantidade</th>
                            <th>Unidade</th>
                            <th>Preço Unitário</th>
                            <th>Preço Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itens.map(item => {
                            const qty = Number(item.quantity) || 0;
                            const uPrice = Number(item.unitPrice) || 0;
                            const tPrice = (qty * uPrice).toFixed(2);
                            return `
                                <tr>
                                    <td>${item.lineNumber || '-'}</td>
                                    <td>${item.code || '-'}</td>
                                    <td>${item.description || '-'}</td>
                                    <td>${qty}</td>
                                    <td>${item.unit || '-'}</td>
                                    <td>R$ ${uPrice.toFixed(2)}</td>
                                    <td>R$ ${tPrice}</td>
                                </tr>`;
                        }).join('')}
                        <tr class="total-row">
                            <td colspan="5"><strong>Total:</strong></td>
                            <td colspan="2"><strong>R$ ${totalValue}</strong></td>
                        </tr>
                    </tbody>
                </table>
            </div>
        `;

        container.appendChild(orderCard);

        orderCard.querySelector('.visualizar-itens-btn').addEventListener('click', () => {
            const itemsList = orderCard.querySelector('.items-list');
            itemsList.style.display = itemsList.style.display === 'none' ? 'block' : 'none';
        });

        const finalizarBtn = orderCard.querySelector('.finalizar-pedido-btn');
        if (finalizarBtn) {
            finalizarBtn.addEventListener('click', () => finalizeOrderForPickup(order.numeroPedido));
        }

        const notifyBtn = orderCard.querySelector('[data-action="notify-requester"]');
        if (notifyBtn) {
            notifyBtn.addEventListener('click', () => openNotifyRequesterModal(order.numeroPedido));
        }
    });

    feather.replace();
}

// Marca um pedido como pronto para retirada
function finalizeOrderForPickup(orderNumber) {
    const orders = getOrders() || [];
    const orderIndex = orders.findIndex(o => o.numeroPedido === orderNumber);
    if (orderIndex === -1) {
        showNotification('Pedido não encontrado.', 'error');
        return;
    }

    orders[orderIndex].status = OrderStatus.READY_FOR_PICKUP;
    saveOrders(orders);
    showNotification('Pedido marcado como pronto para retirada!', 'success');
    updateDashboardStats();
    displayBuyerOrders();
    displayWithdrawalOrders();
}

// Abre o modal para notificar o requisitante
function openNotifyRequesterModal(orderNumber) {
    const modal = document.getElementById('notify-requester-modal');
    if (modal) {
        modal.dataset.orderNumber = orderNumber;
        modal.classList.remove('hidden');
    }
}

// Exibe pedidos na seção de recebimento
export function displayReceiverOrders() {
    const container = document.getElementById('receiver-orders-container');
    if (!container) return;

    container.innerHTML = '';

    const searchInput = document.getElementById('receiver-search');
    const pendingFilter = document.getElementById('receiver-pending-filter');
    if (!searchInput || !pendingFilter) return;

    let orders = getOrders() || [];
    const searchValue = searchInput.value;
    const selectedStatus = pendingFilter.value;

    if (selectedStatus !== 'all') {
        orders = orders.filter(order => order.status === selectedStatus);
    }

    const filteredOrders = orders.filter(order => orderMatchesSearch(order, searchValue));
    if (filteredOrders.length === 0) {
        container.innerHTML = '<p>Nenhum pedido pendente encontrado.</p>';
        return;
    }

    filteredOrders.sort((a, b) => parseDate(b.sendDate) - parseDate(a.sendDate));

    const currentUser = getCurrentUser();
    filteredOrders.forEach(order => {
        const orderCard = document.createElement('div');
        orderCard.className = 'order-card';
        orderCard.innerHTML = `
            <h3>Pedido Nº ${order.numeroPedido}</h3>
            <div class="order-details">
                <p><strong>Fornecedor:</strong> ${order.nomeFornecedor}</p>
                <p><strong>CNPJ:</strong> ${formatCNPJ(order.cnpjFornecedor)}</p>
                <p><strong>Área Destinada:</strong> ${order.area || 'Não definida'}</p>
                <p><strong>Enviado Por:</strong> ${order.senderName} em ${order.sendDate}</p>
                ${order.receiveDate ? `<p><strong>Recebido Por:</strong> ${order.receiverName} em ${order.receiveDate}</p>` : ''}
                ${order.withdrawer ? `<p><strong>Retirado Por:</strong> ${order.withdrawer} em ${order.withdrawalDate}</p>` : ''}
                <p><strong>Status:</strong> 
                    <span class="status-${order.status}">
                        <i data-feather="${getStatusIcon(order.status)}"></i> ${formatStatus(order.status)}
                    </span>
                </p>
            </div>
            <div class="order-actions">
                ${
                    currentUser && (currentUser.role === 'user' || currentUser.role === 'recebimento') &&
                    order.status === OrderStatus.PENDING
                    ? `<button class="action-btn conferir-btn"><i data-feather="check-circle"></i> Conferir</button>`
                    : ''
                }
            </div>
        `;

        container.appendChild(orderCard);
        const conferirBtn = orderCard.querySelector('.conferir-btn');
        if (conferirBtn) {
            conferirBtn.addEventListener('click', () => openConferenceModal(order.numeroPedido));
        }
    });

    feather.replace();
}

// Exibe pedidos finalizados
export function displayFinalizedOrders() {
    const container = document.getElementById('finalized-orders-container');
    if (!container) return;

    container.innerHTML = '';

    const searchInput = document.getElementById('finalized-search');
    const statusFilter = document.getElementById('finalized-status-filter');
    if (!searchInput || !statusFilter) return;

    let orders = (getOrders() || []).filter(order =>
        [OrderStatus.COMPLETED, OrderStatus.WITH_OBSERVATIONS, OrderStatus.RETURNED].includes(order.status)
    );

    const searchValue = searchInput.value;
    const selectedStatus = statusFilter.value;

    if (selectedStatus !== 'all') {
        orders = orders.filter(order => order.status === selectedStatus);
    }

    const filteredOrders = orders.filter(order => orderMatchesSearch(order, searchValue));
    if (filteredOrders.length === 0) {
        container.innerHTML = '<p>Nenhum pedido finalizado encontrado.</p>';
        return;
    }

    filteredOrders.sort((a, b) => parseDate(b.sendDate) - parseDate(a.sendDate));

    filteredOrders.forEach(order => {
        const itens = Array.isArray(order.itens) ? order.itens : [];
        const totalValue = itens.reduce((acc, item) => {
            const qty = Number(item.quantity) || 0;
            const price = Number(item.unitPrice) || 0;
            return acc + (qty * price);
        }, 0).toFixed(2);

        const orderCard = document.createElement('div');
        orderCard.className = 'order-card';
        orderCard.innerHTML = `
            <h3>Pedido Nº ${order.numeroPedido}</h3>
            <div class="order-details">
                <p><strong>Fornecedor:</strong> ${order.nomeFornecedor}</p>
                <p><strong>CNPJ:</strong> ${formatCNPJ(order.cnpjFornecedor)}</p>
                <p><strong>Área Destinada:</strong> ${order.area || 'Não definida'}</p>
                <p><strong>Enviado Por:</strong> ${order.senderName} em ${order.sendDate}</p>
                ${order.receiveDate ? `<p><strong>Recebido Por:</strong> ${order.receiverName} em ${order.receiveDate}</p>` : ''}
                ${order.withdrawer ? `<p><strong>Retirado Por:</strong> ${order.withdrawer} em ${order.withdrawalDate}</p>` : ''}
                <p><strong>Status:</strong> 
                    <span class="status-${order.status}">
                        <i data-feather="${getStatusIcon(order.status)}"></i> ${formatStatus(order.status)}
                    </span>
                </p>
                ${order.globalObservation ? `<p><strong>Observação do Pedido:</strong> ${order.globalObservation}</p>` : ''}
            </div>
            <button class="visualizar-itens-btn"><i data-feather="eye"></i> Visualizar Itens</button>
            <div class="order-actions">
                <button class="action-btn"><i data-feather="printer"></i> Imprimir</button>
            </div>
            <div class="items-list" style="display: none;">
                <table>
                    <thead>
                        <tr>
                            <th>Linha</th>
                            <th>Código</th>
                            <th>Descrição</th>
                            <th>Quantidade</th>
                            <th>Unidade</th>
                            <th>Preço Unitário</th>
                            <th>Preço Total</th>
                            <th>Observação</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itens.map(item => {
                            const qty = Number(item.quantity) || 0;
                            const uPrice = Number(item.unitPrice) || 0;
                            const tPrice = (qty * uPrice).toFixed(2);
                            return `
                                <tr>
                                    <td>${item.lineNumber || '-'}</td>
                                    <td>${item.code || '-'}</td>
                                    <td>${item.description || '-'}</td>
                                    <td>${qty}</td>
                                    <td>${item.unit || '-'}</td>
                                    <td>R$ ${uPrice.toFixed(2)}</td>
                                    <td>R$ ${tPrice}</td>
                                    <td>${item.observation || '-'}</td>
                                </tr>`;
                        }).join('')}
                        <tr class="total-row">
                            <td colspan="6"><strong>Total:</strong></td>
                            <td colspan="2"><strong>R$ ${totalValue}</strong></td>
                        </tr>
                    </tbody>
                </table>
            </div>
        `;

        container.appendChild(orderCard);
        orderCard.querySelector('.visualizar-itens-btn').addEventListener('click', () => {
            const itemsList = orderCard.querySelector('.items-list');
            itemsList.style.display = itemsList.style.display === 'none' ? 'block' : 'none';
        });
    });

    feather.replace();
}

// Exibe pedidos prontos para retirada
export function displayWithdrawalOrders() {
    const container = document.getElementById('withdrawal-orders-container');
    if (!container) return;

    container.innerHTML = '';

    const searchInput = document.getElementById('withdrawal-search');
    if (!searchInput) return;

    let orders = (getOrders() || []).filter(order => order.status === OrderStatus.READY_FOR_PICKUP);
    const searchValue = searchInput.value;

    const filteredOrders = orders.filter(order => orderMatchesSearch(order, searchValue));
    if (filteredOrders.length === 0) {
        container.innerHTML = '<p>Nenhum pedido para retirada encontrado.</p>';
        return;
    }

    filteredOrders.sort((a, b) => parseDate(b.sendDate) - parseDate(a.sendDate));

    filteredOrders.forEach(order => {
        const orderCard = document.createElement('div');
        orderCard.className = 'order-card';
        orderCard.innerHTML = `
            <h3>Pedido Nº ${order.numeroPedido}</h3>
            <div class="order-details">
                <p><strong>Fornecedor:</strong> ${order.nomeFornecedor}</p>
                <p><strong>CNPJ:</strong> ${formatCNPJ(order.cnpjFornecedor)}</p>
                <p><strong>Área Destinada:</strong> ${order.area || 'Não definida'}</p>
                <p><strong>Enviado Por:</strong> ${order.senderName} em ${order.sendDate}</p>
                ${order.receiveDate ? `<p><strong>Recebido Por:</strong> ${order.receiverName} em ${order.receiveDate}</p>` : ''}
                <p><strong>Status:</strong> 
                    <span class="status-${order.status}">
                        <i data-feather="${getStatusIcon(order.status)}"></i> ${formatStatus(order.status)}
                    </span>
                </p>
            </div>
            <div class="order-actions">
                <button class="action-btn retirar-btn"><i data-feather="truck"></i> Confirmar Retirada</button>
            </div>
        `;

        container.appendChild(orderCard);
        orderCard.querySelector('.retirar-btn').addEventListener('click', () => {
            openWithdrawalModal(order.numeroPedido);
        });
    });

    feather.replace();
}

// Abre o modal de conferência de pedido
function openConferenceModal(orderNumber) {
    const modal = document.getElementById('modal');
    if (!modal) return;

    const order = getOrders()?.find(o => o.numeroPedido === orderNumber);
    if (!order) {
        showNotification('Pedido não encontrado.', 'error');
        return;
    }

    document.getElementById('modal-order-number').innerText = order.numeroPedido;
    document.getElementById('modal-supplier-name').innerText = order.nomeFornecedor;
    document.getElementById('modal-supplier-cnpj').innerText = formatCNPJ(order.cnpjFornecedor);
    document.getElementById('modal-sender-name').innerText = order.senderName;
    document.getElementById('modal-send-date').innerText = order.sendDate;

    const itemsTableBody = document.querySelector('#modal-items-table tbody');
    itemsTableBody.innerHTML = '';
    const itens = Array.isArray(order.itens) ? order.itens : [];

    itens.forEach(item => {
        const qty = Number(item.quantity) || 0;
        const uPrice = Number(item.unitPrice) || 0;
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${item.lineNumber || '-'}</td>
            <td>${item.code || '-'}</td>
            <td>${item.description || '-'}</td>
            <td>${qty}</td>
            <td>${item.unit || '-'}</td>
            <td>R$ ${uPrice.toFixed(2)}</td>
            <td>R$ ${(qty * uPrice).toFixed(2)}</td>
        `;
        itemsTableBody.appendChild(row);
    });

    document.getElementById('global-observation').value = order.globalObservation || '';
    modal.dataset.orderNumber = order.numeroPedido;
    modal.classList.remove('hidden');
    feather.replace();
}

// Abre o modal de retirada
function openWithdrawalModal(orderNumber) {
    const modal = document.getElementById('withdrawal-modal');
    if (!modal) return;

    modal.dataset.orderNumber = orderNumber;
    modal.classList.remove('hidden');
    updateWithdrawerSuggestions('');
}

// Atualiza sugestões de nomes de retirantes
function updateWithdrawerSuggestions(query) {
    const suggestionsList = document.getElementById('withdrawer-suggestions');
    if (!suggestionsList) return;

    suggestionsList.innerHTML = '';
    if (!query) return;

    const allWithdrawers = getWithdrawers() || [];
    const filtered = allWithdrawers.filter(w => w.toLowerCase().includes(query.toLowerCase()));
    filtered.forEach(name => {
        const li = document.createElement('li');
        li.textContent = name;
        li.addEventListener('click', () => {
            const input = document.getElementById('withdrawer-name');
            input.value = name;
            suggestionsList.innerHTML = '';
        });
        suggestionsList.appendChild(li);
    });
}

// Manipula a submissão do formulário de seleção de área
document.getElementById('select-area-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const areaSelect = document.getElementById('area-select');
    const newAreaInput = document.getElementById('new-area');
    let selectedArea = areaSelect?.value;

    if (!selectedArea) {
        showNotification('Por favor, selecione uma área.', 'error');
        return;
    }

    if (selectedArea === 'Outra') {
        selectedArea = newAreaInput?.value.trim().toUpperCase();
        if (!selectedArea) {
            showNotification('Por favor, insira a nova área.', 'error');
            newAreaInput.focus();
            return;
        }
        if (AREAS.includes(selectedArea)) {
            showNotification('Área já existe.', 'error');
            newAreaInput.focus();
            return;
        }
        AREAS.push(selectedArea);
        saveAreas(AREAS);
    }

    const tempOrder = JSON.parse(localStorage.getItem('tempOrder'));
    if (!tempOrder) {
        showNotification('Erro ao obter o pedido temporário.', 'error');
        closeModal();
        return;
    }

    tempOrder.area = selectedArea;
    tempOrder.status = OrderStatus.PENDING;

    const orders = getOrders() || [];
    orders.push(tempOrder);
    saveOrders(orders);
    showNotification('Pedido processado e salvo com sucesso!', 'success');
    localStorage.removeItem('tempOrder');
    closeModal();
    updateDashboardStats();
    displayBuyerOrders();
    displayReceiverOrders();
    displayFinalizedOrders();
    displayWithdrawalOrders();
});

// Manipula o botão de salvar conferência
document.getElementById('save-conference-btn')?.addEventListener('click', () => {
    const confirmationModal = document.getElementById('confirmation-modal');
    const modal = document.getElementById('modal');
    if (confirmationModal && modal) {
        confirmationModal.dataset.orderNumber = modal.dataset.orderNumber;
        confirmationModal.classList.remove('hidden');
    }
});

// Cancela a conferência
document.getElementById('cancel-save-conference')?.addEventListener('click', () => {
    const confirmationModal = document.getElementById('confirmation-modal');
    if (confirmationModal) {
        confirmationModal.classList.add('hidden');
    }
});

// Confirma a conferência
document.getElementById('confirm-save-conference')?.addEventListener('click', () => {
    const confirmationModal = document.getElementById('confirmation-modal');
    if (confirmationModal) {
        finalizeConference(confirmationModal.dataset.orderNumber);
        confirmationModal.classList.add('hidden');
    }
});

// Finaliza a conferência de um pedido
function finalizeConference(orderNumber) {
    showLoader();
    const nfFile = document.getElementById('nf-upload')?.files[0];
    const boletoFile = document.getElementById('boleto-upload')?.files[0];
    const globalObservationInput = document.getElementById('global-observation');

    const orders = getOrders() || [];
    const orderIndex = orders.findIndex(o => o.numeroPedido === orderNumber);
    if (orderIndex === -1) {
        hideLoader();
        showNotification('Pedido não encontrado.', 'error');
        return;
    }

    orders[orderIndex].globalObservation = globalObservationInput?.value.trim() || '';
    orders[orderIndex].receiverName = getCurrentUser()?.name || '';
    orders[orderIndex].receiveDate = getCurrentDate();
    orders[orderIndex].status = determineOrderStatus(orders[orderIndex]);

    async function handleFileUpload(file, key) {
        if (!file) return;
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => {
                orders[orderIndex][key] = e.target.result;
                resolve();
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    Promise.all([
        handleFileUpload(nfFile, 'nfFile'),
        handleFileUpload(boletoFile, 'boletoFile')
    ])
        .then(() => {
            saveOrders(orders);
            hideLoader();
            showNotification('Conferência salva com sucesso!', 'success');
            closeModal();
            updateDashboardStats();
            displayReceiverOrders();
            displayFinalizedOrders();
            displayBuyerOrders();
        })
        .catch(() => {
            hideLoader();
            showNotification('Erro ao processar arquivos.', 'error');
        });
}

// Confirma a retirada de um pedido
document.getElementById('confirm-withdrawal-btn')?.addEventListener('click', () => {
    const modal = document.getElementById('withdrawal-modal');
    const orderNumber = modal?.dataset.orderNumber;
    const withdrawerNameInput = document.getElementById('withdrawer-name');
    const withdrawerName = withdrawerNameInput?.value.trim().toUpperCase();

    if (!withdrawerName) {
        showNotification('Por favor, insira o nome do retirante.', 'error');
        return;
    }

    const orders = getOrders() || [];
    const orderIndex = orders.findIndex(o => o.numeroPedido === orderNumber);
    if (orderIndex === -1) {
        showNotification('Pedido não encontrado.', 'error');
        return;
    }

    orders[orderIndex].withdrawer = withdrawerName;
    orders[orderIndex].withdrawalDate = getCurrentDate();
    orders[orderIndex].status = OrderStatus.COMPLETED;
    saveOrders(orders);

    const existingWithdrawers = getWithdrawers() || [];
    if (!existingWithdrawers.includes(withdrawerName)) {
        existingWithdrawers.push(withdrawerName);
        saveWithdrawers(existingWithdrawers);
    }

    showNotification('Retirada confirmada e pedido concluído!', 'success');
    if (modal) modal.classList.add('hidden');
    updateDashboardStats();
    displayWithdrawalOrders();
    displayFinalizedOrders();
    displayReceiverOrders();
    displayBuyerOrders();
});

// Manipula a notificação ao requisitante
document.getElementById('send-requester-notification')?.addEventListener('click', () => {
    const modal = document.getElementById('notify-requester-modal');
    const requesterNameInput = document.getElementById('requester-name');
    const requesterName = requesterNameInput?.value.trim();

    if (!requesterName) {
        showNotification('Por favor, insira o nome do requisitante.', 'error');
        return;
    }

    showNotification(`Notificação enviada ao requisitante ${requesterName}!`, 'success');
    requesterNameInput.value = '';
    closeModal();
});

// Define a seção ativa
export function setActiveSection(sectionId) {
    document.querySelectorAll('main .sections-wrapper section').forEach(section => {
        section.classList.toggle('hidden-section', section.id !== sectionId);
        section.classList.toggle('active-section', section.id === sectionId);
    });
}

// Define o item de navegação ativo
export function setActiveNav(btnId) {
    document.querySelectorAll('.nav-item').forEach(item => {
        const button = item.querySelector('.nav-btn');
        item.classList.toggle('active', button && button.id === btnId);
    });
}

// Exibe o modal de login
export function showLoginModal() {
    const loginModal = document.getElementById('login-modal');
    if (loginModal) loginModal.classList.remove('hidden');
}

// Abre o modal de seleção de área
export function openSelectAreaModal(order) {
    const modal = document.getElementById('select-area-modal');
    if (!modal) {
        console.error('Modal "select-area-modal" não encontrado.');
        return;
    }

    const areaSelect = document.getElementById('area-select');
    if (!areaSelect) {
        console.error('Elemento "area-select" não encontrado.');
        return;
    }

    // Limpa e preenche o dropdown de áreas
    areaSelect.innerHTML = '<option value="">Selecione uma área</option>';
    AREAS.forEach(area => {
        const option = document.createElement('option');
        option.value = area;
        option.textContent = area;
        areaSelect.appendChild(option);
    });
    const otherOption = document.createElement('option');
    otherOption.value = 'Outra';
    otherOption.textContent = 'Outra';
    areaSelect.appendChild(otherOption);

    // Garante que o campo de nova área seja exibido quando "Outra" for selecionada
    const newAreaDiv = document.getElementById('new-area-group');
    const newAreaInput = document.getElementById('new-area');
    if (!newAreaDiv || !newAreaInput) {
        console.error('Elementos "new-area-group" ou "new-area" não encontrados.');
        return;
    }

    // Limpa o campo de nova área e ajusta a visibilidade inicial
    newAreaInput.value = '';
    newAreaDiv.classList.toggle('hidden', areaSelect.value !== 'Outra');

    // Adiciona evento de mudança para exibir/esconder o campo de nova área
    areaSelect.addEventListener('change', () => {
        newAreaDiv.classList.toggle('hidden', areaSelect.value !== 'Outra');
        if (areaSelect.value !== 'Outra') {
            newAreaInput.value = ''; // Limpa o campo ao mudar a seleção
        }
    });

    modal.classList.remove('hidden');
}