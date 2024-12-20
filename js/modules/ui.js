import {showNotification} from './notifications.js';
import {getCurrentUser, getOrders, saveOrders, getWithdrawers, saveWithdrawers, saveAreas, getAreas} from './storage.js';
import {parseDate, getCurrentDate, validateEmail, validatePassword, normalizeString} from './utils.js';
import {OrderStatus} from './constants.js';
import {determineOrderStatus, formatStatus, getStatusIcon, formatCNPJ, extractOrderData, cleanDescription, cleanExtraParts, splitLineAtNewItemPattern, isPageHeaderOrFooter} from './orders.js';

let AREAS = getAreas();

export function showLoader() {
    const loader = document.getElementById('loader');
    if (loader) loader.classList.remove('hidden');
}

export function hideLoader() {
    const loader = document.getElementById('loader');
    if (loader) loader.classList.add('hidden');
}

export function closeModal() {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => modal.classList.add('hidden'));
}

export function updateUserProfile() {
    const currentUser = getCurrentUser();
    const userProfile = document.getElementById('user-profile');
    if (currentUser) {
        userProfile.querySelector('span').innerText = currentUser.name;
    } else {
        userProfile.querySelector('span').innerText = 'Usuário';
    }
}

function getStatusCounts() {
    const orders = getOrders();
    const counts = {
        pending: 0,
        received: 0,
        with_observations: 0,
        completed: 0,
        returned: 0
    };

    orders.forEach(order => {
        if (counts[order.status] !== undefined) {
            counts[order.status]++;
        }
    });

    return counts;
}

export function updateDashboardStats() {
    const counts = getStatusCounts();
    const pendingCountEl = document.getElementById('count-pending');
    const receivedCountEl = document.getElementById('count-received');
    const withObservationsCountEl = document.getElementById('count-with_observations');
    const completedCountEl = document.getElementById('count-completed');
    const returnedCountEl = document.getElementById('count-returned');

    if (pendingCountEl) pendingCountEl.innerText = counts.pending;
    if (receivedCountEl) receivedCountEl.innerText = counts.received;
    if (withObservationsCountEl) withObservationsCountEl.innerText = counts.with_observations;
    if (completedCountEl) completedCountEl.innerText = counts.completed;
    if (returnedCountEl) returnedCountEl.innerText = counts.returned;

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
                backgroundColor: [
                    '#FFC107',
                    '#17A2B8',
                    '#E67E22',
                    '#27AE60',
                    '#C0392B'
                ]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });
}

function orderMatchesSearch(order, searchValue) {
    const normSearch = normalizeString(searchValue);

    const normNumeroPedido = normalizeString(order.numeroPedido);
    const normNomeFornecedor = normalizeString(order.nomeFornecedor);
    const normCnpjFornecedor = normalizeString(order.cnpjFornecedor);
    const normGlobalObs = normalizeString(order.globalObservation || '');
    const normArea = normalizeString(order.area || '');
    const normSenderName = normalizeString(order.senderName || '');
    const normReceiverName = normalizeString(order.receiverName || '');
    const normWithdrawer = normalizeString(order.withdrawer || '');

    if (normNumeroPedido.includes(normSearch)) return true;
    if (normNomeFornecedor.includes(normSearch)) return true;
    if (normCnpjFornecedor.includes(normSearch)) return true;
    if (normGlobalObs.includes(normSearch)) return true;
    if (normArea.includes(normSearch)) return true;
    if (normSenderName.includes(normSearch)) return true;
    if (normReceiverName.includes(normSearch)) return true;
    if (normWithdrawer.includes(normSearch)) return true;

    for (let item of order.itens) {
        const normDesc = normalizeString(item.description);
        const normCode = normalizeString(item.code);
        if (normDesc.includes(normSearch) || normCode.includes(normSearch)) {
            return true;
        }
    }

    return false;
}

export function displayBuyerOrders() {
    const buyerOrdersContainer = document.getElementById('buyer-orders-container');
    if (!buyerOrdersContainer) return;

    buyerOrdersContainer.innerHTML = '';

    const searchInput = document.getElementById('buyer-search');
    const statusFilter = document.getElementById('buyer-status-filter');

    if (!searchInput || !statusFilter) return;

    const searchValue = searchInput.value;
    const selectedStatus = statusFilter.value;
    let orders = getOrders();

    if (selectedStatus !== 'all') {
        orders = orders.filter(order => order.status === selectedStatus);
    }

    const filteredOrders = orders.filter(order => orderMatchesSearch(order, searchValue));

    if (filteredOrders.length === 0) {
        buyerOrdersContainer.innerHTML = '<p>Nenhum pedido encontrado.</p>';
        return;
    }

    filteredOrders.sort((a, b) => {
        const dateA = parseDate(a.sendDate);
        const dateB = parseDate(b.sendDate);
        return dateB - dateA;
    });

    const currentUser = getCurrentUser();

    filteredOrders.forEach(order => {
        const itens = Array.isArray(order.itens) ? order.itens : [];
        const totalValue = itens.reduce((acc, item) => {
            const q = (typeof item.quantity === 'number') ? item.quantity : 0;
            const p = (typeof item.unitPrice === 'number') ? item.unitPrice : 0;
            return acc + (q * p);
        }, 0).toFixed(2);

        const orderCard = document.createElement('div');
        orderCard.className = 'order-card';
        orderCard.innerHTML = `
            <h3>Pedido Nº ${order.numeroPedido}</h3>
            <div class="order-details">
                <p><strong>Fornecedor:</strong> ${order.nomeFornecedor}</p>
                <p><strong>CNPJ:</strong> ${order.cnpjFornecedor}</p>
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
                    ? `<button class="finalizar-pedido-btn"><i data-feather="check"></i> Concluir (Pronto p/ Retirada)</button>
                       <button class="action-btn" data-action="notify-requester"><i data-feather="send"></i> Avisar Requisitante</button>`
                    : ''
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
                            const qty = (typeof item.quantity === 'number') ? item.quantity : 0;
                            const uPrice = (typeof item.unitPrice === 'number') ? item.unitPrice : 0;
                            const tPrice = (qty * uPrice).toFixed(2);
                            return `
                            <tr>
                                <td>${item.lineNumber || '-'}</td>
                                <td>${item.code || '-'}</td>
                                <td>${item.description || '-'}</td>
                                <td>${qty}</td>
                                <td>${item.unit || '-'}</td>
                                <td>R$ ${!isNaN(uPrice) ? uPrice.toFixed(2) : '0.00'}</td>
                                <td>R$ ${!isNaN(qty) && !isNaN(uPrice) ? tPrice : '0.00'}</td>
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

        buyerOrdersContainer.appendChild(orderCard);

        const visualizarBtn = orderCard.querySelector('.visualizar-itens-btn');
        visualizarBtn.addEventListener('click', () => {
            const itemsList = orderCard.querySelector('.items-list');
            itemsList.style.display = itemsList.style.display === 'none' ? 'block' : 'none';
        });

        const finalizarBtn = orderCard.querySelector('.finalizar-pedido-btn');
        if (finalizarBtn) {
            finalizarBtn.addEventListener('click', () => {
                finalizeOrderForPickup(order.numeroPedido);
            });
        }

        const notifyBtn = orderCard.querySelector('[data-action="notify-requester"]');
        if (notifyBtn) {
            notifyBtn.addEventListener('click', () => {
                openNotifyRequesterModal(order.numeroPedido);
            });
        }
    });

    feather.replace();
}

function finalizeOrderForPickup(orderNumber) {
    const orders = getOrders();
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

function openNotifyRequesterModal(orderNumber) {
    const modal = document.getElementById('notify-requester-modal');
    modal.dataset.orderNumber = orderNumber;
    modal.classList.remove('hidden');
}

document.getElementById('send-requester-notification').addEventListener('click', () => {
    const modal = document.getElementById('notify-requester-modal');
    const requesterNameInput = document.getElementById('requester-name');
    const requesterName = requesterNameInput.value.trim();
    if (!requesterName) {
        showNotification('Por favor, insira o nome do requisitante.', 'error');
        return;
    }
    showNotification(`Notificação enviada ao requisitante ${requesterName}!`, 'success');
    requesterNameInput.value = '';
    closeModal();
});

export function displayReceiverOrders() {
    const receiverOrdersContainer = document.getElementById('receiver-orders-container');
    if (!receiverOrdersContainer) return;

    receiverOrdersContainer.innerHTML = '';

    const searchInput = document.getElementById('receiver-search');
    const pendingFilter = document.getElementById('receiver-pending-filter');

    if (!searchInput || !pendingFilter) return;

    const searchValue = searchInput.value;
    const selectedStatus = pendingFilter.value;
    let orders = getOrders();

    if (selectedStatus !== 'all') {
        orders = orders.filter(order => order.status === selectedStatus);
    }

    const filteredOrders = orders.filter(order => orderMatchesSearch(order, searchValue));

    if (filteredOrders.length === 0) {
        receiverOrdersContainer.innerHTML = '<p>Nenhum pedido pendente encontrado.</p>';
        return;
    }

    filteredOrders.sort((a, b) => {
        const dateA = parseDate(a.sendDate);
        const dateB = parseDate(b.sendDate);
        return dateB - dateA;
    });

    const currentUser = getCurrentUser();

    filteredOrders.forEach(order => {
        const orderCard = document.createElement('div');
        orderCard.className = 'order-card';
        orderCard.innerHTML = `
            <h3>Pedido Nº ${order.numeroPedido}</h3>
            <div class="order-details">
                <p><strong>Fornecedor:</strong> ${order.nomeFornecedor}</p>
                <p><strong>CNPJ:</strong> ${order.cnpjFornecedor}</p>
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
                    currentUser && (currentUser.role === 'user' || currentUser.role === 'recebimento')
                    && order.status === OrderStatus.PENDING
                    ? `<button class="action-btn conferir-btn"><i data-feather="check-circle"></i> Conferir</button>` 
                    : ''
                }
            </div>
        `;

        receiverOrdersContainer.appendChild(orderCard);
        const conferirBtn = orderCard.querySelector('.conferir-btn');
        if (conferirBtn) {
            conferirBtn.addEventListener('click', () => {
                openConferenceModal(order.numeroPedido);
            });
        }
    });

    feather.replace();
}

export function displayFinalizedOrders() {
    const finalizedOrdersContainer = document.getElementById('finalized-orders-container');
    if (!finalizedOrdersContainer) return;

    finalizedOrdersContainer.innerHTML = '';

    const searchInput = document.getElementById('finalized-search');
    const statusFilter = document.getElementById('finalized-status-filter');

    if (!searchInput || !statusFilter) return;

    const searchValue = searchInput.value;
    const selectedStatus = statusFilter.value;

    let orders = getOrders().filter(order => 
        [OrderStatus.COMPLETED, OrderStatus.WITH_OBSERVATIONS, OrderStatus.RETURNED].includes(order.status)
    );

    if (selectedStatus !== 'all') {
        orders = orders.filter(order => order.status === selectedStatus);
    }

    const filteredOrders = orders.filter(order => orderMatchesSearch(order, searchValue));

    if (filteredOrders.length === 0) {
        finalizedOrdersContainer.innerHTML = '<p>Nenhum pedido finalizado encontrado.</p>';
        return;
    }

    filteredOrders.sort((a, b) => {
        const dateA = parseDate(a.sendDate);
        const dateB = parseDate(b.sendDate);
        return dateB - dateA;
    });

    filteredOrders.forEach(order => {
        const itens = Array.isArray(order.itens) ? order.itens : [];
        const totalValue = itens.reduce((acc, item) => {
            const q = (typeof item.quantity === 'number') ? item.quantity : 0;
            const p = (typeof item.unitPrice === 'number') ? item.unitPrice : 0;
            return acc + (q * p);
        }, 0).toFixed(2);

        const orderCard = document.createElement('div');
        orderCard.className = 'order-card';
        orderCard.innerHTML = `
            <h3>Pedido Nº ${order.numeroPedido}</h3>
            <div class="order-details">
                <p><strong>Fornecedor:</strong> ${order.nomeFornecedor}</p>
                <p><strong>CNPJ:</strong> ${order.cnpjFornecedor}</p>
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
                            const qty = (typeof item.quantity === 'number') ? item.quantity : 0;
                            const uPrice = (typeof item.unitPrice === 'number') ? item.unitPrice : 0;
                            const tPrice = (qty * uPrice).toFixed(2);
                            return `
                            <tr>
                                <td>${item.lineNumber || '-'}</td>
                                <td>${item.code || '-'}</td>
                                <td>${item.description || '-'}</td>
                                <td>${qty}</td>
                                <td>${item.unit || '-'}</td>
                                <td>R$ ${!isNaN(uPrice) ? uPrice.toFixed(2) : '0.00'}</td>
                                <td>R$ ${!isNaN(qty) && !isNaN(uPrice) ? tPrice : '0.00'}</td>
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

        finalizedOrdersContainer.appendChild(orderCard);
        const visualizarBtn = orderCard.querySelector('.visualizar-itens-btn');
        visualizarBtn.addEventListener('click', () => {
            const itemsList = orderCard.querySelector('.items-list');
            itemsList.style.display = itemsList.style.display === 'none' ? 'block' : 'none';
        });
    });

    feather.replace();
}

export function displayWithdrawalOrders() {
    const withdrawalOrdersContainer = document.getElementById('withdrawal-orders-container');
    if (!withdrawalOrdersContainer) return;

    withdrawalOrdersContainer.innerHTML = '';

    const searchInput = document.getElementById('withdrawal-search');

    if (!searchInput) return;

    const searchValue = searchInput.value;
    let orders = getOrders().filter(order => order.status === OrderStatus.READY_FOR_PICKUP);

    const filteredOrders = orders.filter(order => orderMatchesSearch(order, searchValue));

    if (filteredOrders.length === 0) {
        withdrawalOrdersContainer.innerHTML = '<p>Nenhum pedido para retirada encontrado.</p>';
        return;
    }

    filteredOrders.sort((a, b) => {
        const dateA = parseDate(a.sendDate);
        const dateB = parseDate(b.sendDate);
        return dateB - dateA;
    });

    filteredOrders.forEach(order => {
        const orderCard = document.createElement('div');
        orderCard.className = 'order-card';
        orderCard.innerHTML = `
            <h3>Pedido Nº ${order.numeroPedido}</h3>
            <div class="order-details">
                <p><strong>Fornecedor:</strong> ${order.nomeFornecedor}</p>
                <p><strong>CNPJ:</strong> ${order.cnpjFornecedor}</p>
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

        withdrawalOrdersContainer.appendChild(orderCard);
        const retirarBtn = orderCard.querySelector('.retirar-btn');
        retirarBtn.addEventListener('click', () => {
            openWithdrawalModal(order.numeroPedido);
        });
    });

    feather.replace();
}

function openConferenceModal(orderNumber) {
    const modal = document.getElementById('modal');
    if (!modal) return;

    const order = getOrders().find(o => o.numeroPedido === orderNumber);
    if (!order) {
        showNotification('Pedido não encontrado.', 'error');
        return;
    }

    document.getElementById('modal-order-number').innerText = order.numeroPedido;
    document.getElementById('modal-supplier-name').innerText = order.nomeFornecedor;
    document.getElementById('modal-supplier-cnpj').innerText = order.cnpjFornecedor;
    document.getElementById('modal-sender-name').innerText = order.senderName;
    document.getElementById('modal-send-date').innerText = order.sendDate;

    const itemsTableBody = document.querySelector('#modal-items-table tbody');
    itemsTableBody.innerHTML = '';
    const itens = Array.isArray(order.itens) ? order.itens : [];

    itens.forEach(item => {
        const row = document.createElement('tr');
        const qty = (typeof item.quantity === 'number') ? item.quantity : 0;
        row.innerHTML = `
            <td>${item.lineNumber}</td>
            <td>${item.code}</td>
            <td>${item.description}</td>
            <td>${qty}</td>
            <td>${item.unit}</td>
            <td>R$ ${item.unitPrice && !isNaN(item.unitPrice) ? item.unitPrice.toFixed(2) : '0.00'}</td>
            <td>R$ ${(qty * (item.unitPrice || 0)).toFixed(2)}</td>
        `;
        itemsTableBody.appendChild(row);
    });

    document.getElementById('global-observation').value = order.globalObservation || '';

    modal.dataset.orderNumber = order.numeroPedido;
    modal.classList.remove('hidden');

    feather.replace();
}

function openWithdrawalModal(orderNumber) {
    const withdrawalModal = document.getElementById('withdrawal-modal');
    if (!withdrawalModal) return;

    withdrawalModal.dataset.orderNumber = orderNumber;
    withdrawalModal.classList.remove('hidden');
    updateWithdrawerSuggestions('');
}

function updateWithdrawerSuggestions(query) {
    const suggestionsList = document.getElementById('withdrawer-suggestions');
    suggestionsList.innerHTML = '';
    if (!query) return;
    const allWithdrawers = getWithdrawers();
    const filtered = allWithdrawers.filter(w => w.includes(query));
    if (filtered.length > 0) {
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
}

document.getElementById('select-area-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const areaSelect = document.getElementById('area-select');
    let selectedArea = areaSelect.value;
    if (!selectedArea) {
        showNotification('Por favor, selecione uma área.', 'error');
        return;
    }
    if (selectedArea === 'Outra') {
        const newAreaInput = document.getElementById('new-area');
        selectedArea = newAreaInput.value.trim().toUpperCase();
        if (!selectedArea) {
            showNotification('Por favor, insira a nova área.', 'error');
            return;
        }
        if (AREAS.includes(selectedArea)) {
            showNotification('Área já existe.', 'error');
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

    const orders = getOrders();
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

document.getElementById('save-conference-btn').addEventListener('click', () => {
    const confirmationModal = document.getElementById('confirmation-modal');
    confirmationModal.classList.remove('hidden');
    const modal = document.getElementById('modal');
    confirmationModal.dataset.orderNumber = modal.dataset.orderNumber;
});

document.getElementById('cancel-save-conference').addEventListener('click', () => {
    const confirmationModal = document.getElementById('confirmation-modal');
    confirmationModal.classList.add('hidden');
});

document.getElementById('confirm-save-conference').addEventListener('click', () => {
    const confirmationModal = document.getElementById('confirmation-modal');
    const orderNumber = confirmationModal.dataset.orderNumber;
    finalizeConference(orderNumber);
    confirmationModal.classList.add('hidden');
});

function finalizeConference(orderNumber) {
    showLoader();
    const nfFile = document.getElementById('nf-upload').files[0];
    const boletoFile = document.getElementById('boleto-upload').files[0];
    const globalObservationInput = document.getElementById('global-observation');

    const orders = getOrders();
    const orderIndex = orders.findIndex(o => o.numeroPedido === orderNumber);
    if (orderIndex === -1) {
        hideLoader();
        showNotification('Pedido não encontrado.', 'error');
        return;
    }

    orders[orderIndex].globalObservation = globalObservationInput.value.trim();

    orders[orderIndex].receiverName = getCurrentUser().name;
    orders[orderIndex].receiveDate = getCurrentDate();

    orders[orderIndex].status = determineOrderStatus(orders[orderIndex]);

    function handleFileUpload(file, key) {
        return new Promise((resolve, reject) => {
            if (file) {
                const reader = new FileReader();
                reader.onload = function (e) {
                    orders[orderIndex][key] = e.target.result;
                    resolve();
                };
                reader.onerror = function (error) {
                    reject(error);
                };
                reader.readAsDataURL(file);
            } else {
                resolve();
            }
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

document.getElementById('confirm-withdrawal-btn').addEventListener('click', () => {
    const withdrawalModal = document.getElementById('withdrawal-modal');
    const orderNumber = withdrawalModal.dataset.orderNumber;
    const withdrawerNameInput = document.getElementById('withdrawer-name');
    const withdrawerName = withdrawerNameInput.value.trim().toUpperCase();
    if (!withdrawerName) {
        showNotification('Por favor, insira o nome do retirante.', 'error');
        return;
    }

    const orders = getOrders();
    const orderIndex = orders.findIndex(o => o.numeroPedido === orderNumber);
    if (orderIndex === -1) {
        showNotification('Pedido não encontrado.', 'error');
        return;
    }

    orders[orderIndex].withdrawer = withdrawerName;
    orders[orderIndex].withdrawalDate = getCurrentDate();
    orders[orderIndex].status = OrderStatus.COMPLETED;
    saveOrders(orders);

    const existingWithdrawers = getWithdrawers();
    if (!existingWithdrawers.includes(withdrawerName)) {
        existingWithdrawers.push(withdrawerName);
        saveWithdrawers(existingWithdrawers);
    }

    showNotification('Retirada confirmada e pedido concluído!', 'success');
    withdrawalModal.classList.add('hidden');
    updateDashboardStats();
    displayWithdrawalOrders();
    displayFinalizedOrders();
    displayReceiverOrders();
    displayBuyerOrders();
});

export function setActiveSection(sectionId) {
    const sections = document.querySelectorAll('main .sections-wrapper section');
    sections.forEach(section => {
        if (section.id === sectionId) {
            section.classList.remove('hidden-section');
            section.classList.add('active-section');
        } else {
            section.classList.add('hidden-section');
            section.classList.remove('active-section');
        }
    });
}

export function setActiveNav(btnId) {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        const button = item.querySelector('.nav-btn');
        if (button && button.id === btnId) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
}

export function showLoginModal() {
    const loginModal = document.getElementById('login-modal');
    if (loginModal) {
        loginModal.classList.remove('hidden');
    }
}
