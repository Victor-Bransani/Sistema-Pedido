// Inicialização do PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = './libs/pdfjs/pdf.worker.js';

// Definição de Estados e Constantes
const OrderStatus = {
    PENDING: 'pending',
    RECEIVED: 'received',
    WITH_OBSERVATIONS: 'with_observations',
    COMPLETED: 'completed',
    RETURNED: 'returned'
};

const RETURN_KEYWORDS = ['devolvido', 'retorno', 'volta', 'reembolso'];

const AREAS = [
    'BIBLIOTECA',
    'SECRETARIA',
    'ENFERMAGEM',
    'ATENDIMENTO',
    'TI',
    'GERÊNCIA',
    'PATRIMONIO',
    'FUNDAÇÃO CASA',
    'DESENVOLVIMENTO SOCIAL',
    'SALA, BAR E RESTAURANTE',
    'PODOLOGIA',
    'SETOR TÉCNICO',
    'FARMACIA',
    'RADIOLOGIA',
    'PROTESE',
    'ESTETICA',
    'ADMINISTRAÇÃO E NEGÓCIOS',
    'EMED',
    'SEGURANÇA DO TRABALHO',
    'MANUTENÇÃO',
    'MODA E ARQUITETURA',
    'CULTURA E COMUNICAÇÃO',
    'BEM-ESTAR',
    'APRENDIZAGEM'
];

// Funções de Gestão de Usuário
function getUsers() {
    try {
        const users = JSON.parse(localStorage.getItem('users'));
        return Array.isArray(users) ? users : [];
    } catch (error) {
        console.error('Erro ao parsear usuários do LocalStorage:', error);
        return [];
    }
}

function saveUsers(users) {
    localStorage.setItem('users', JSON.stringify(users));
}

function registerUser(name, email, password) {
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
        password, // Nota: Em produção, as senhas devem ser hashadas
        role: 'user' // Por enquanto, todos são 'user'
    };
    users.push(newUser);
    saveUsers(users);
    showNotification('Cadastro realizado com sucesso! Faça login.', 'success');
    return true;
}

function loginUser(email, password) {
    const users = getUsers();
    const user = users.find(u => u.email === email && u.password === password);
    if (user) {
        localStorage.setItem('currentUser', JSON.stringify(user));
        showNotification(`Bem-vindo, ${user.name}!`, 'success');
        return true;
    } else {
        showNotification('E-mail ou senha inválidos.', 'error');
        return false;
    }
}

function logoutUser() {
    localStorage.removeItem('currentUser');
    showNotification('Logout realizado com sucesso.', 'info');
    window.location.reload();
}

function getCurrentUser() {
    try {
        const user = JSON.parse(localStorage.getItem('currentUser'));
        return user || null;
    } catch (error) {
        console.error('Erro ao parsear usuário atual:', error);
        return null;
    }
}

// Funções de Gestão de Pedidos
if (!localStorage.getItem('orders')) {
    localStorage.setItem('orders', JSON.stringify([]));
}

function getOrders() {
    try {
        const orders = JSON.parse(localStorage.getItem('orders'));
        return Array.isArray(orders) ? orders : [];
    } catch (error) {
        console.error('Erro ao parsear pedidos do LocalStorage:', error);
        return [];
    }
}

function saveOrders(orders) {
    localStorage.setItem('orders', JSON.stringify(orders));
}

function formatCNPJ(cnpj) {
    if (typeof cnpj !== 'string') return 'Inválido';
    cnpj = cnpj.replace(/\D/g, '');
    return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

function isPageHeaderOrFooter(line) {
    const lowerLine = line.trim().toLowerCase();
    return (
        lowerLine.includes('serviço nacional de aprendizagem comercial') ||
        lowerLine.includes('administração regional no estado de são paulo') ||
        lowerLine.includes('comprador:') ||
        (lowerLine.includes('fone:') && lowerLine.includes('email:')) ||
        lowerLine.includes('página')
    );
}

function cleanDescription(description) {
    if (!description || typeof description !== 'string') return '';
    const noisePatterns = [
        /\*\*\*/,
        /\/\//,
        /\bREQ\b/i,
        /\bCAM\b/i,
        /\bPEDIDO\b/i,
        /\bOBSERVAÇÃO\b/i,
        /\bDE\s+OUTRAS\s+ESTRUTURAS\b/i // Remover partes específicas
    ];
    let cleaned = description;
    noisePatterns.forEach(pattern => {
        cleaned = cleaned.replace(pattern, '');
    });
    return cleaned.replace(/\s+/g, ' ').trim();
}

function determineOrderStatus(order) {
    const { itens, globalObservation } = order;

    if (!itens || itens.length === 0) {
        return OrderStatus.PENDING;
    }

    const hasReturned = itens.some(item => {
        const obs = (item.observation || '').toLowerCase();
        return RETURN_KEYWORDS.some(keyword => obs.includes(keyword));
    });
    if (hasReturned) {
        return OrderStatus.RETURNED;
    }

    const allReceived = itens.every(item => item.received && (item.receivedQuantity >= item.quantity));

    if (!allReceived) {
        return OrderStatus.PENDING;
    }

    const hasItemObservations = itens.some(item => (item.observation || '').trim() !== '' && !RETURN_KEYWORDS.some(keyword => item.observation.toLowerCase().includes(keyword)));
    const hasGlobalObservation = (globalObservation || '').trim() !== '';

    if (hasItemObservations || hasGlobalObservation) {
        return OrderStatus.WITH_OBSERVATIONS;
    }

    return OrderStatus.RECEIVED;
}

// Função para remover partes extras da descrição após identificação do item base
function cleanExtraParts(description) {
    if (!description || typeof description !== 'string') return '';
    
    let desc = description;

    // Lista de padrões indesejados a serem removidos
    const unwantedPatternsList = [
        /\b\d{1,3}(?:\.\d{3})*,\d{2}\b/g, // Padrão para valores monetários
        /SEGUNDA COTAÇÃO E COMPRAMOS NUMA URGÊNCIA\.$/i,
        /OS\s+ORÇAMENTOS\.\s+ANEXO\s+AS\s+JUSTIFICATICAS\s+DELE\./i,
        /SP\s+-\s+SOLICITADO\s*:\s*[^.\n]+$/i,
        /COMPRA DE ITENS APÓS AVALIAÇÃO DO DOCENTE DE VINHOS: GUSTAVO\. NO EMAIL ELE SOLICITA OS RÓTULOS QUE ESTÃO NESSA ORDEM DE COMPRA, APÓS APRESENTAÇÃO\s*/i,
        /OBSERVAÇÃO.*$/i,
        /\bSOLICITADO POR\b.*$/i,
        /\bREQ\b\s+\d+\s+-\s+.*$/i,
        /\bFORNECEDOR\b.*$/i,
        /\bACORDO DE COOPERAÇÃO\b.*$/i,
        /\bCONVÊNIO\b.*$/i,
        /\b[A-Z]\)\b.*$/i,
        /\bALBANEZ\b.*$/i,
        /\bObs:.*$/i,
        /\bObs\b.*$/i,
        /\*\*\*/i,
        /\/\//i,
        /HMMG\.\d{4}\.\d+.*$/i,
        /\bEscolhido o segundo fornecedor\b.*$/i,
        /\bA\).*$/i,
        /\bB\).*$/i,
        /\b\d{1,2}-[A-Z]{3}-\d{2}\b/i,
        /\b\d+\s*-\s*-\s*.*$/i,
        /^REQ\b\s+.*$/i,
        /\*\./g,
        /\*/g,
        /^(Tivemos que|Fizemos uma|Precisamos de|Adquirimos|Compramos|Realizamos|Necessitamos|Realizamos uma|Necessitamos de)\b.*$/i,
    ];

    // Remover todos os padrões indesejados
    unwantedPatternsList.forEach(pattern => {
        desc = desc.replace(pattern, '').trim();
    });

    // Substituição específica para preservar termos essenciais como "FRAMON"
    desc = desc.replace(/FRAMON\s+OS\s+ORÇAMENTOS\.\s+ANEXO\s+AS\s+JUSTIFICATICAS\s+DELE\./i, 'FRAMON').trim();

    // Remover padrões como ".ABC-123" que aparecem no final da descrição
    desc = desc.replace(/(\.[A-Za-z0-9\-]+){2,}$/i, '').trim();

    return desc;
}

function splitLineAtNewItemPattern(line) {
    // Regex para identificar o início de um novo item
    const regex = /(\d+\s+\d{8,}\.)/g;
    let result = [];
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(line)) !== null) {
        if (match.index > lastIndex) {
            // Adiciona a parte anterior à correspondência
            const precedingText = line.substring(lastIndex, match.index).trim();
            if (precedingText) {
                result.push(precedingText);
            }
        }
        // Adiciona a correspondência (início de novo item)
        lastIndex = match.index;
    }

    // Adiciona o restante da linha após a última correspondência
    if (lastIndex < line.length) {
        const remainingText = line.substring(lastIndex).trim();
        if (remainingText) {
            result.push(remainingText);
        }
    }

    return result;
}

// Função para extrair itens a partir das linhas
function extractItems(lines) {
    const itens = [];
    let isItemSection = false;
    let currentItem = null;

    // Regex refinado para corresponder linhas de itens, permitindo caracteres especiais na unidade
    const itemLineRegex = /^(\d+)\s+(\d{8,})\.(.*?)\s+([\d.,]+)\s+([^\s]+)\s+([\d.,]+)\s+([\d.,]+)$/;

    function isNoiseLine(line) {
        const noisePatterns = [
            /^PEDIDO/i,
            /^CAM/i,
            /^OBSERVAÇÃO/i,
            /^\*\*\*/,
            /^\/\//,
            /^REQ\b\s+.*$/i, // Regex aprimorada com word boundary
            /Linha\s+Produto\/Serviço/i,
            /^\d+\s+\d+\s+\d{2}-\d{2}-\d{4}\s+/
        ];
    
        for (const pattern of noisePatterns) {
            if (pattern.test(line)) {
                console.log(`Linha identificada como ruído: "${line}"`);
                return true;
            }
        }
        return false;
    }

    console.log('Iniciando extração de itens...');
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (!line) continue;

        // Dividir a linha se o padrão de novo item for encontrado
        const splitLines = splitLineAtNewItemPattern(line);
        for (let splitLine of splitLines) {
            if (!splitLine) continue;

            if (isPageHeaderOrFooter(splitLine)) {
                console.log(`Linha ignorada (cabeçalho/rodapé): "${splitLine}"`);
                continue;
            }

            if (!isItemSection && splitLine.toLowerCase().includes('produto/serviço')) {
                console.log('Encontrado cabeçalho de itens, iniciando seção de itens.');
                isItemSection = true;
                continue;
            }

            if (isItemSection && (splitLine.toLowerCase().includes('total geral') || splitLine.toLowerCase().includes('total:'))) {
                console.log(`Encontrado final da seção de itens em: "${splitLine}"`);
                if (currentItem) {
                    itens.push(currentItem);
                    console.log('Item finalizado antes do encerramento da seção:', currentItem);
                    currentItem = null;
                }
                isItemSection = false;
                break;
            }

            if (isItemSection) {
                console.log(`Processando linha dentro da seção de itens: "${splitLine}"`);
                const match = splitLine.match(itemLineRegex);
                if (match) {
                    const lineNumber = parseInt(match[1], 10);
                    const code = match[2].trim();
                    const descriptionRaw = match[3] || '';
                    let description = cleanDescription(descriptionRaw);
                    const quantityStr = match[4];
                    const unit = match[5].trim();
                    const unitPriceStr = match[6];
                    const totalPriceStr = match[7];

                    console.log(`Correspondência encontrada para item: Linha ${lineNumber}, Código ${code}`);

                    if (currentItem) {
                        itens.push(currentItem);
                        console.log('Salvando item anterior:', currentItem);
                        currentItem = null;
                    }

                    const quantity = parseFloat(quantityStr.replace(/\./g, '').replace(',', '.'));
                    const unitPrice = parseFloat(unitPriceStr.replace(/\./g, '').replace(',', '.'));
                    const totalPrice = parseFloat(totalPriceStr.replace(/\./g, '').replace(',', '.'));

                    if (isNaN(quantity) || isNaN(unitPrice) || isNaN(totalPrice)) {
                        console.warn(`Linha de item ignorada (valores inválidos): "${splitLine}"`);
                        continue;
                    }

                    description = cleanExtraParts(description);

                    currentItem = {
                        lineNumber,
                        code,
                        description,
                        quantity,
                        unit,
                        unitPrice,
                        totalPrice,
                        received: false,
                        receivedQuantity: 0,
                        observation: ''
                    };
                    console.log('Novo item criado:', currentItem);

                } else {
                    console.log(`Linha não corresponde a um item completo: "${splitLine}"`);
                    if (currentItem && !isNoiseLine(splitLine)) {
                        let extraText = cleanDescription(splitLine);
                        extraText = cleanExtraParts(extraText);

                        if (extraText) {
                            currentItem.description += ' ' + extraText;
                            currentItem.description = currentItem.description.replace(/\s+/g, ' ').trim();
                            console.log(`Descrição atualizada do item: "${currentItem.description}"`);
                        } else {
                            console.log('Linha extra ignorada após limpeza.');
                        }
                    }
                }
            }
        }
    }

    if (currentItem) {
        console.log('Salvando item pendente no final:', currentItem);
        itens.push(currentItem);
    }

    itens.forEach(item => {
        item.description = cleanExtraParts(item.description);
    });

    console.log('Extração finalizada. Itens extraídos:', itens);
    return itens;
}

function extractOrderData(orderText) {
    const lines = orderText.split('\n').map(l => l.trim()).filter(l => l);

    let numeroPedido = 'Não encontrado';
    let nomeFornecedor = 'Não encontrado';
    let cnpjFornecedor = 'Não encontrado';
    let senderName = 'Não encontrado';
    let sendDate = 'Não encontrado';

    for (let i = 0; i < lines.length; i++) {
        if (/pedido/i.test(lines[i])) {
            const numMatch = lines[i].match(/(\d+)/);
            const numNext = (lines[i+1] || '').match(/(\d+)/);
            if (numMatch) {
                numeroPedido = numMatch[1];
                break;
            } else if (numNext) {
                numeroPedido = numNext[1];
                break;
            }
        }
    }

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes('fornecedor:')) {
            const cnpjMatch = lines[i].match(/fornecedor:\s*(\d{14})/i);
            if (cnpjMatch) {
                cnpjFornecedor = formatCNPJ(cnpjMatch[1]);
                nomeFornecedor = lines[i+1] || nomeFornecedor;
            } else {
                const nextLine = lines[i+1] || '';
                const cnpjNext = nextLine.match(/^(\d{14})$/);
                if (cnpjNext) {
                    cnpjFornecedor = formatCNPJ(cnpjNext[1]);
                    nomeFornecedor = lines[i+2] || nomeFornecedor;
                }
            }

            // **Aplicar a regex para remover "SENAC CAMPINAS"**
            nomeFornecedor = nomeFornecedor.replace(/\bSENAC\s+CAMPINAS\b/i, '').trim();

            break;
        }
    }

    // Capturar o nome do remetente e data de envio (assumindo que estão em linhas específicas)
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes('enviado por:')) {
            senderName = lines[i].split(':')[1].trim() || 'Não encontrado';
        }
        if (lines[i].toLowerCase().includes('data de envio:')) {
            sendDate = lines[i].split(':')[1].trim() || 'Não encontrado';
        }
    }

    const globalObservation = '';
    const itens = extractItems(lines);

    const order = {
        numeroPedido,
        nomeFornecedor,
        cnpjFornecedor,
        senderName,
        sendDate,
        itens,
        globalObservation,
        status: determineOrderStatus({itens, globalObservation}),
        nfFile: '',
        boletoFile: '',
        area: '',
        receiveDate: '',
        withdrawalDate: '',
        withdrawer: ''
    };

    return order;
}

function normalizeString(str) {
    if (!str || typeof str !== 'string') return '';
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function orderMatchesSearch(order, searchValue) {
    const normSearch = normalizeString(searchValue);

    const normNumeroPedido = normalizeString(order.numeroPedido);
    const normNomeFornecedor = normalizeString(order.nomeFornecedor);
    const normCnpjFornecedor = normalizeString(order.cnpjFornecedor);
    const normGlobalObs = normalizeString(order.globalObservation || '');

    if (normNumeroPedido.includes(normSearch)) return true;
    if (normNomeFornecedor.includes(normSearch)) return true;
    if (normCnpjFornecedor.includes(normSearch)) return true;
    if (normGlobalObs.includes(normSearch)) return true;

    for (let item of order.itens) {
        const normDesc = normalizeString(item.description);
        const normCode = normalizeString(item.code);
        if (normDesc.includes(normSearch) || normCode.includes(normSearch)) {
            return true;
        }
    }

    return false;
}

function formatStatus(status) {
    switch(status) {
        case OrderStatus.PENDING: return 'Pendente';
        case OrderStatus.RECEIVED: return 'Recebido';
        case OrderStatus.WITH_OBSERVATIONS: return 'Recebido c/ Observações';
        case OrderStatus.COMPLETED: return 'Concluído';
        case OrderStatus.RETURNED: return 'Devolvido';
        default: return 'Desconhecido';
    }
}

function getStatusIcon(status) {
    switch(status) {
        case OrderStatus.PENDING: return 'clock';
        case OrderStatus.RECEIVED: return 'check-circle';
        case OrderStatus.WITH_OBSERVATIONS: return 'alert-triangle';
        case OrderStatus.COMPLETED: return 'check-circle';
        case OrderStatus.RETURNED: return 'x-circle';
        default: return 'clock';
    }
}

function displayBuyerOrders() {
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

    // Ordenar por data de envio, mais recente primeiro
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
                <p><strong>Enviado Por:</strong> ${order.senderName}</p>
                <p><strong>Data de Envio:</strong> ${order.sendDate}</p>
                <p><strong>Área Destinada:</strong> ${order.area || 'Não definida'}</p>
                <p><strong>Status:</strong> 
                    <span class="status-${order.status}">
                        <i data-feather="${getStatusIcon(order.status)}"></i> ${formatStatus(order.status)}
                    </span>
                </p>
                ${order.globalObservation ? `<p><strong>Observação do Pedido:</strong> ${order.globalObservation}</p>` : ''}
            </div>
            <!-- Botão visualizar itens agora fica no canto superior direito -->
            <button class="visualizar-itens-btn"><i data-feather="eye"></i> Visualizar Itens</button>
            
            <div class="order-actions">
                ${getCurrentUser().role === 'buyer' && [OrderStatus.RECEIVED, OrderStatus.WITH_OBSERVATIONS].includes(order.status) ? `<button class="finalizar-pedido-btn"><i data-feather="check"></i> Concluir Pedido</button>` : ''}
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
                finalizeOrder(order.numeroPedido);
            });
        }
    });

    feather.replace();
}

function displayReceiverOrders() {
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

    // Ordenar por data de envio, mais recente primeiro
    filteredOrders.sort((a, b) => {
        const dateA = parseDate(a.sendDate);
        const dateB = parseDate(b.sendDate);
        return dateB - dateA;
    });

    filteredOrders.forEach(order => {
        const itens = Array.isArray(order.itens) ? order.itens : [];
        const hasPendingItems = itens.some(item => !item.received || item.receivedQuantity < item.quantity);

        const orderCard = document.createElement('div');
        orderCard.className = 'order-card';
        orderCard.innerHTML = `
            <h3>Pedido Nº ${order.numeroPedido}</h3>
            <div class="order-details">
                <p><strong>Fornecedor:</strong> ${order.nomeFornecedor}</p>
                <p><strong>CNPJ:</strong> ${order.cnpjFornecedor}</p>
                <p><strong>Enviado Por:</strong> ${order.senderName}</p>
                <p><strong>Data de Envio:</strong> ${order.sendDate}</p>
                <p><strong>Área Destinada:</strong> ${order.area || 'Não definida'}</p>
                <p><strong>Status:</strong> 
                    <span class="status-${order.status}">
                        <i data-feather="${getStatusIcon(order.status)}"></i> ${formatStatus(order.status)}
                    </span>
                </p>
            </div>
            <div class="order-actions">
                <button class="action-btn conferir-btn"><i data-feather="check-circle"></i> Conferir</button>
            </div>
        `;

        receiverOrdersContainer.appendChild(orderCard);
        const conferirBtn = orderCard.querySelector('.conferir-btn');
        conferirBtn.addEventListener('click', () => {
            openConferenceModal(order.numeroPedido);
        });
    });

    feather.replace();
}

function displayFinalizedOrders() {
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

    // Ordenar por data de envio, mais recente primeiro
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
                <p><strong>Enviado Por:</strong> ${order.senderName}</p>
                <p><strong>Data de Envio:</strong> ${order.sendDate}</p>
                <p><strong>Área Destinada:</strong> ${order.area || 'Não definida'}</p>
                <p><strong>Status:</strong> 
                    <span class="status-${order.status}">
                        <i data-feather="${getStatusIcon(order.status)}"></i> ${formatStatus(order.status)}
                    </span>
                </p>
                ${order.globalObservation ? `<p><strong>Observação do Pedido:</strong> ${order.globalObservation}</p>` : ''}
            </div>
            <!-- Botão visualizar itens no canto superior direito -->
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

function displayWithdrawalOrders() {
    const withdrawalOrdersContainer = document.getElementById('withdrawal-orders-container');
    if (!withdrawalOrdersContainer) return;

    withdrawalOrdersContainer.innerHTML = '';

    const searchInput = document.getElementById('withdrawal-search');

    if (!searchInput) return;

    const searchValue = searchInput.value;
    let orders = getOrders().filter(order => order.status === OrderStatus.RECEIVED);

    const filteredOrders = orders.filter(order => orderMatchesSearch(order, searchValue));

    if (filteredOrders.length === 0) {
        withdrawalOrdersContainer.innerHTML = '<p>Nenhum pedido para retirada encontrado.</p>';
        return;
    }

    // Ordenar por data de envio, mais recente primeiro
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
                <p><strong>Enviado Por:</strong> ${order.senderName}</p>
                <p><strong>Data de Envio:</strong> ${order.sendDate}</p>
                <p><strong>Área Destinada:</strong> ${order.area || 'Não definida'}</p>
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

    feather.replace();
}

function closeModal() {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        modal.classList.add('hidden');
    });
}

const closeButtons = document.querySelectorAll('.close-btn');
closeButtons.forEach(button => {
    button.addEventListener('click', closeModal);
});

window.addEventListener('click', function(event) {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        if (event.target === modal) {
            modal.classList.add('hidden');
        }
    });
});

// Notificações
function showNotification(message, type) {
    const notificationContainer = document.getElementById('notification-container');
    if (!notificationContainer) return;

    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <span>${message}</span>
        <button class="close-notification" aria-label="Fechar">&times;</button>
    `;

    notificationContainer.appendChild(notification);
    const closeButton = notification.querySelector('.close-notification');
    closeButton.addEventListener('click', () => {
        notification.classList.add('fade-out');
        setTimeout(() => notification.remove(), 500);
    });

    setTimeout(() => {
        if (notification) {
            notification.classList.add('fade-out');
            setTimeout(() => notification.remove(), 500);
        }
    }, 3000);
}

function isReturnedObservation(observation) {
    if (!observation) return false;
    const obsLower = observation.toLowerCase();
    return RETURN_KEYWORDS.some(keyword => obsLower.includes(keyword));
}

// Funções de Upload e Processamento de PDF
document.getElementById('process-pdf').addEventListener('click', () => {
    const fileInput = document.getElementById('pdf-upload');
    const file = fileInput.files[0];
    if (!file) {
        showNotification('Por favor, selecione um arquivo PDF.', 'error');
        return;
    }

    const fileReader = new FileReader();
    fileReader.onload = function () {
        const typedarray = new Uint8Array(this.result);

        pdfjsLib.getDocument(typedarray).promise.then(pdf => {
            let pagePromises = [];
            for (let i = 1; i <= pdf.numPages; i++) {
                pagePromises.push(pdf.getPage(i).then(page => {
                    return page.getTextContent().then(textContent => {
                        let lines = {};
                        textContent.items.forEach(item => {
                            let x = item.transform[4];
                            let y = item.transform[5];
                            let yRounded = Math.round(y / 5) * 5;
                            if (!lines[yRounded]) {
                                lines[yRounded] = [];
                            }
                            lines[yRounded].push({ x: x, str: item.str });
                        });

                        let sortedY = Object.keys(lines).sort((a, b) => b - a);
                        let pageText = '';

                        sortedY.forEach(y => {
                            let items = lines[y];
                            items.sort((a, b) => a.x - b.x);
                            let lineText = items.map(item => item.str).join(' ');
                            pageText += lineText + '\n';
                        });

                        return pageText;
                    });
                }));
            }

            Promise.all(pagePromises).then(pagesText => {
                const textoCompleto = pagesText.join('\n');
                const order = extractOrderData(textoCompleto);
                if (order.numeroPedido === 'Não encontrado') {
                    showNotification('Erro ao extrair o número do pedido.', 'error');
                    return;
                }

                const orders = getOrders();
                const exists = orders.some(o => o.numeroPedido === order.numeroPedido);
                if (exists) {
                    showNotification('Pedido já existe no sistema.', 'error');
                    return;
                }

                const currentUser = getCurrentUser();
                order.senderName = currentUser.name;
                order.sendDate = getCurrentDate();

                // Abrir modal de seleção de área
                openSelectAreaModal(order);

                // Temporariamente armazenar o pedido antes da seleção de área
                localStorage.setItem('tempOrder', JSON.stringify(order));
            });
        }).catch(error => {
            console.error('Erro ao processar o PDF:', error);
            showNotification('Erro ao processar o PDF.', 'error');
        });
    };

    fileReader.readAsArrayBuffer(file);
});

// Funções de Seleção de Área
function openSelectAreaModal(order) {
    const selectAreaModal = document.getElementById('select-area-modal');
    if (!selectAreaModal) return;

    const areaSelect = document.getElementById('area-select');
    const newAreaGroup = document.getElementById('new-area-group');

    // Preencher as opções do select
    areaSelect.innerHTML = '<option value="">Selecione uma área</option>';
    AREAS.forEach(area => {
        const option = document.createElement('option');
        option.value = area;
        option.text = area;
        areaSelect.appendChild(option);
    });

    // Adicionar opção "Outra"
    const otherOption = document.createElement('option');
    otherOption.value = 'Outra';
    otherOption.text = 'Outra';
    areaSelect.appendChild(otherOption);

    // Event Listener para mostrar campo de nova área
    areaSelect.addEventListener('change', () => {
        if (areaSelect.value === 'Outra') {
            newAreaGroup.classList.remove('hidden');
            document.getElementById('new-area').required = true;
        } else {
            newAreaGroup.classList.add('hidden');
            document.getElementById('new-area').required = false;
        }
    });

    selectAreaModal.classList.remove('hidden');
}

document.getElementById('close-select-area-modal').addEventListener('click', () => {
    closeModal();
    localStorage.removeItem('tempOrder');
});

document.getElementById('select-area-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const areaSelect = document.getElementById('area-select');
    let selectedArea = areaSelect.value;
    if (selectedArea === 'Outra') {
        const newAreaInput = document.getElementById('new-area');
        selectedArea = newAreaInput.value.trim();
        if (selectedArea) {
            // Adicionar a nova área à lista e salvar no localStorage para futuras operações
            AREAS.push(selectedArea.toUpperCase());
            saveAreas();
        } else {
            showNotification('Por favor, insira a nova área.', 'error');
            return;
        }
    }

    const tempOrder = JSON.parse(localStorage.getItem('tempOrder'));
    if (!tempOrder) {
        showNotification('Erro ao obter o pedido temporário.', 'error');
        closeModal();
        return;
    }

    tempOrder.area = selectedArea;
    tempOrder.status = OrderStatus.PENDING; // Atualizar status após seleção de área

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

function saveAreas() {
    localStorage.setItem('areas', JSON.stringify(AREAS));
}

// Funções de Retirada
function openWithdrawalModal(orderNumber) {
    const withdrawalModal = document.getElementById('withdrawal-modal');
    if (!withdrawalModal) return;

    withdrawalModal.dataset.orderNumber = orderNumber;
    withdrawalModal.classList.remove('hidden');
}

document.getElementById('withdrawal-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const withdrawerNameInput = document.getElementById('withdrawer-name');
    const withdrawerName = withdrawerNameInput.value.trim();
    if (!withdrawerName) {
        showNotification('Por favor, insira o nome do retirante.', 'error');
        return;
    }

    const withdrawalModal = document.getElementById('withdrawal-modal');
    const orderNumber = withdrawalModal.dataset.orderNumber;
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

    showNotification('Retirada confirmada e pedido concluído!', 'success');
    withdrawalModal.classList.add('hidden');
    updateDashboardStats();
    displayWithdrawalOrders();
    displayFinalizedOrders();
    displayReceiverOrders();
    displayBuyerOrders();
});

// Função para Finalizar Pedido
function finalizeOrder(orderNumber) {
    if (getCurrentUser().role !== 'buyer') {
        showNotification('Somente o Comprador pode concluir o pedido.', 'error');
        return;
    }

    const orders = getOrders();
    const orderIndex = orders.findIndex(o => o.numeroPedido === orderNumber);
    if (orderIndex === -1) {
        showNotification('Pedido não encontrado.', 'error');
        return;
    }

    orders[orderIndex].status = OrderStatus.COMPLETED;
    saveOrders(orders);

    showNotification('Pedido concluído com sucesso!', 'success');
    closeModal();
    updateDashboardStats();
    displayFinalizedOrders();
    displayBuyerOrders();
}

// Funções de Formatação de Data
function getCurrentDate() {
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0'); // Janeiro é 0!
    const year = today.getFullYear();
    return `${day}/${month}/${year}`;
}

function parseDate(dateStr) {
    const parts = dateStr.split('/');
    if (parts.length !== 3) return new Date(0);
    return new Date(parts[2], parts[1] - 1, parts[0]);
}

// Função de Logout
document.getElementById('logout-btn').addEventListener('click', () => {
    logoutUser();
});

// Funções de Login e Cadastro
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

// Formulários de Login e Cadastro
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

    const success = loginUser(email, password);
    if (success) {
        const loginModal = document.getElementById('login-modal');
        loginModal.classList.add('hidden');
        initializeApp();
    }
});

// Validação de Formulários
function validateEmail(email) {
    const re = /\S+@\S+\.\S+/;
    return re.test(email);
}

function validatePassword(password) {
    return password.length >= 6;
}

// Inicialização do App após Login
function initializeApp() {
    const currentUser = getCurrentUser();
    if (!currentUser) {
        showLoginModal();
        return;
    }

    // Atualizar perfil do usuário no header
    const userProfile = document.getElementById('user-profile');
    userProfile.querySelector('span').innerText = currentUser.name;

    // Definir permissões de acordo com a role (futuro)
    // Por enquanto, todas as funções estão disponíveis

    // Atualizar Dashboard e outras abas
    updateDashboardStats();
    displayDashboard();
    displayBuyerOrders();
    displayReceiverOrders();
    displayFinalizedOrders();
    displayWithdrawalOrders();
}

// Mostrar Modal de Login se não estiver logado
function showLoginModal() {
    const loginModal = document.getElementById('login-modal');
    if (loginModal) {
        loginModal.classList.remove('hidden');
    }
}

// Função para Atualizar Dashboard
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

function updateDashboardStats() {
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

function displayDashboard() {
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

// Modal de Seleção de Área
document.getElementById('select-area-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const areaSelect = document.getElementById('area-select');
    let selectedArea = areaSelect.value;
    if (selectedArea === 'Outra') {
        const newAreaInput = document.getElementById('new-area');
        selectedArea = newAreaInput.value.trim();
        if (selectedArea) {
            // Adicionar a nova área à lista e salvar no localStorage para futuras operações
            AREAS.push(selectedArea.toUpperCase());
            saveAreas();
        } else {
            showNotification('Por favor, insira a nova área.', 'error');
            return;
        }
    }

    const tempOrder = JSON.parse(localStorage.getItem('tempOrder'));
    if (!tempOrder) {
        showNotification('Erro ao obter o pedido temporário.', 'error');
        closeModal();
        return;
    }

    tempOrder.area = selectedArea;
    tempOrder.status = OrderStatus.PENDING; // Atualizar status após seleção de área

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

// Evento de Seleção de Área (Opcional)
document.getElementById('select-area-form').addEventListener('change', (e) => {
    const areaSelect = document.getElementById('area-select');
    const newAreaGroup = document.getElementById('new-area-group');
    if (areaSelect.value === 'Outra') {
        newAreaGroup.classList.remove('hidden');
        document.getElementById('new-area').required = true;
    } else {
        newAreaGroup.classList.add('hidden');
        document.getElementById('new-area').required = false;
    }
});

// Função para Exibir Modal de Seleção de Área
function openSelectAreaModal(order) {
    const selectAreaModal = document.getElementById('select-area-modal');
    if (!selectAreaModal) return;

    const areaSelect = document.getElementById('area-select');
    const newAreaGroup = document.getElementById('new-area-group');

    // Preencher as opções do select
    areaSelect.innerHTML = '<option value="">Selecione uma área</option>';
    AREAS.forEach(area => {
        const option = document.createElement('option');
        option.value = area;
        option.text = area;
        areaSelect.appendChild(option);
    });

    // Adicionar opção "Outra"
    const otherOption = document.createElement('option');
    otherOption.value = 'Outra';
    otherOption.text = 'Outra';
    areaSelect.appendChild(otherOption);

    // Event Listener para mostrar campo de nova área
    areaSelect.addEventListener('change', () => {
        if (areaSelect.value === 'Outra') {
            newAreaGroup.classList.remove('hidden');
            document.getElementById('new-area').required = true;
        } else {
            newAreaGroup.classList.add('hidden');
            document.getElementById('new-area').required = false;
        }
    });

    selectAreaModal.classList.remove('hidden');
}

// Modal de Retirada
document.getElementById('withdrawal-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const withdrawerNameInput = document.getElementById('withdrawer-name');
    const withdrawerName = withdrawerNameInput.value.trim();
    if (!withdrawerName) {
        showNotification('Por favor, insira o nome do retirante.', 'error');
        return;
    }

    const withdrawalModal = document.getElementById('withdrawal-modal');
    const orderNumber = withdrawalModal.dataset.orderNumber;
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

    showNotification('Retirada confirmada e pedido concluído!', 'success');
    withdrawalModal.classList.add('hidden');
    updateDashboardStats();
    displayWithdrawalOrders();
    displayFinalizedOrders();
    displayReceiverOrders();
    displayBuyerOrders();
});

// Modal de Conferência (Simplificado sem quantidade recebida, flag e observação do item)
document.getElementById('save-conference-btn').addEventListener('click', () => {
    const modal = document.getElementById('modal');
    const orderNumber = modal.dataset.orderNumber;
    const nfFile = document.getElementById('nf-upload').files[0];
    const boletoFile = document.getElementById('boleto-upload').files[0];
    const globalObservationInput = document.getElementById('global-observation');

    const orders = getOrders();
    const orderIndex = orders.findIndex(o => o.numeroPedido === orderNumber);
    if (orderIndex === -1) {
        showNotification('Pedido não encontrado.', 'error');
        return;
    }

    // Atualizar observação geral
    orders[orderIndex].globalObservation = globalObservationInput.value.trim();

    // Atualizar status para RECEIVED ou WITH_OBSERVATIONS
    orders[orderIndex].status = determineOrderStatus(orders[orderIndex]);

    // Função para lidar com upload de arquivos
    function handleFileUpload(file, key) {
        return new Promise((resolve, reject) => {
            if (file) {
                const reader = new FileReader();
                reader.onload = function (e) {
                    orders[orderIndex][key] = e.target.result;
                    resolve();
                };
                reader.onerror = function (error) {
                    console.error('Erro ao ler arquivo:', error);
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
        showNotification('Conferência salva com sucesso!', 'success');
        closeModal();
        updateDashboardStats();
        displayReceiverOrders();
        displayFinalizedOrders();
        displayBuyerOrders();
    })
    .catch(() => {
        showNotification('Erro ao processar arquivos.', 'error');
    });
});

document.getElementById('print-order-btn').addEventListener('click', () => {
    const modal = document.getElementById('modal');
    const orderNumber = modal.dataset.orderNumber;
    const order = getOrders().find(o => o.numeroPedido === orderNumber);

    if (!order) {
        showNotification('Pedido não encontrado.', 'error');
        return;
    }

    const itens = Array.isArray(order.itens) ? order.itens : [];
    const totalValue = itens.reduce((acc, item) => {
        const q = (typeof item.quantity === 'number') ? item.quantity : 0;
        const p = (typeof item.unitPrice === 'number') ? item.unitPrice : 0;
        return acc + (q * p);
    }, 0).toFixed(2);

    let printContent = `
    <html>
    <head>
        <style>
            body {
                font-family: 'Calibri', 'Arial', sans-serif;
                margin: 20px;
            }
            h1, h3 {
                text-align: center;
                font-weight: bold;
            }
            table {
                width: 100%;
                border-collapse: collapse;
                margin-top: 20px;
            }
            th {
                background-color: #f2f2f2;
                font-weight: bold;
                text-align: left;
                padding: 8px;
                border: 1px solid #ddd;
            }
            td {
                padding: 8px;
                border: 1px solid #ddd;
            }
            .total-row {
                font-weight: bold;
            }
        </style>
    </head>
    <body>
        <h1>Pedido Nº ${order.numeroPedido}</h1>
        <p><strong>Fornecedor:</strong> ${order.nomeFornecedor}</p>
        <p><strong>CNPJ:</strong> ${order.cnpjFornecedor}</p>
        <p><strong>Enviado Por:</strong> ${order.senderName}</p>
        <p><strong>Data de Envio:</strong> ${order.sendDate}</p>
        <p><strong>Área Destinada:</strong> ${order.area || 'Não definida'}</p>
        ${order.globalObservation ? `<p><strong>Observação do Pedido:</strong> ${order.globalObservation}</p>` : ''}
        <h3>Itens</h3>
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
                    const q = (typeof item.quantity === 'number') ? item.quantity : 0;
                    const p = (typeof item.unitPrice === 'number') ? item.unitPrice : 0;
                    return `
                    <tr>
                        <td>${item.lineNumber}</td>
                        <td>${item.code}</td>
                        <td>${item.description}</td>
                        <td>${q}</td>
                        <td>${item.unit}</td>
                        <td>R$ ${p.toFixed(2)}</td>
                        <td>R$ ${(q * p).toFixed(2)}</td>
                    </tr>`;
                }).join('')}
                <tr class="total-row">
                    <td colspan="6"><strong>Total:</strong></td>
                    <td><strong>R$ ${totalValue}</strong></td>
                </tr>
            </tbody>
        </table>
    </body>
    </html>
    `;

    const newWindow = window.open('', '', 'width=800,height=600');
    newWindow.document.write(printContent);
    newWindow.document.close();
    newWindow.print();
});

// Atualizar Informações do Usuário e Verificar Autenticação
function initializeApp() {
    const currentUser = getCurrentUser();
    if (!currentUser) {
        showLoginModal();
        return;
    }

    // Atualizar perfil do usuário no header
    const userProfile = document.getElementById('user-profile');
    userProfile.querySelector('span').innerText = currentUser.name;

    // Atualizar Dashboard e outras abas
    updateDashboardStats();
    displayDashboard();
    displayBuyerOrders();
    displayReceiverOrders();
    displayFinalizedOrders();
    displayWithdrawalOrders();
}

// Verificar se há um usuário logado na inicialização
window.onload = function() {
    const currentUser = getCurrentUser();
    if (currentUser) {
        initializeApp();
    } else {
        showLoginModal();
    }

    // Inicializar seleção de área se necessário
    // Inicializar outras funcionalidades
};

// Atualizar Dashboard e Abas ao Alterar Dados
function updateDashboardStats() {
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

function displayDashboard() {
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

// Gestão de Seleção de Área
document.getElementById('select-area-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const areaSelect = document.getElementById('area-select');
    let selectedArea = areaSelect.value;
    if (selectedArea === 'Outra') {
        const newAreaInput = document.getElementById('new-area');
        selectedArea = newAreaInput.value.trim();
        if (selectedArea) {
            // Adicionar a nova área à lista e salvar no localStorage para futuras operações
            AREAS.push(selectedArea.toUpperCase());
            saveAreas();
        } else {
            showNotification('Por favor, insira a nova área.', 'error');
            return;
        }
    }

    const tempOrder = JSON.parse(localStorage.getItem('tempOrder'));
    if (!tempOrder) {
        showNotification('Erro ao obter o pedido temporário.', 'error');
        closeModal();
        return;
    }

    tempOrder.area = selectedArea;
    tempOrder.status = OrderStatus.PENDING; // Atualizar status após seleção de área

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

// Carregar Áreas Salvas (Inclusão de áreas adicionadas)
function loadAreas() {
    const savedAreas = JSON.parse(localStorage.getItem('areas'));
    if (savedAreas && Array.isArray(savedAreas)) {
        AREAS.length = 0; // Limpar array
        AREAS.push(...savedAreas);
    }
}

// Salvar Áreas no LocalStorage
function saveAreas() {
    localStorage.setItem('areas', JSON.stringify(AREAS));
}

// Inicializar Áreas
loadAreas();

// Seleção de Área no Modal de Upload
document.getElementById('process-pdf').addEventListener('click', () => {
    const fileInput = document.getElementById('pdf-upload');
    const file = fileInput.files[0];
    if (!file) {
        showNotification('Por favor, selecione um arquivo PDF.', 'error');
        return;
    }

    const fileReader = new FileReader();
    fileReader.onload = function () {
        const typedarray = new Uint8Array(this.result);

        pdfjsLib.getDocument(typedarray).promise.then(pdf => {
            let pagePromises = [];
            for (let i = 1; i <= pdf.numPages; i++) {
                pagePromises.push(pdf.getPage(i).then(page => {
                    return page.getTextContent().then(textContent => {
                        let lines = {};
                        textContent.items.forEach(item => {
                            let x = item.transform[4];
                            let y = item.transform[5];
                            let yRounded = Math.round(y / 5) * 5;
                            if (!lines[yRounded]) {
                                lines[yRounded] = [];
                            }
                            lines[yRounded].push({ x: x, str: item.str });
                        });

                        let sortedY = Object.keys(lines).sort((a, b) => b - a);
                        let pageText = '';

                        sortedY.forEach(y => {
                            let items = lines[y];
                            items.sort((a, b) => a.x - b.x);
                            let lineText = items.map(item => item.str).join(' ');
                            pageText += lineText + '\n';
                        });

                        return pageText;
                    });
                }));
            }

            Promise.all(pagePromises).then(pagesText => {
                const textoCompleto = pagesText.join('\n');
                const order = extractOrderData(textoCompleto);
                if (order.numeroPedido === 'Não encontrado') {
                    showNotification('Erro ao extrair o número do pedido.', 'error');
                    return;
                }

                const orders = getOrders();
                const exists = orders.some(o => o.numeroPedido === order.numeroPedido);
                if (exists) {
                    showNotification('Pedido já existe no sistema.', 'error');
                    return;
                }

                const currentUser = getCurrentUser();
                order.senderName = currentUser.name;
                order.sendDate = getCurrentDate();

                // Abrir modal de seleção de área
                openSelectAreaModal(order);

                // Temporariamente armazenar o pedido antes da seleção de área
                localStorage.setItem('tempOrder', JSON.stringify(order));
            });
        }).catch(error => {
            console.error('Erro ao processar o PDF:', error);
            showNotification('Erro ao processar o PDF.', 'error');
        });
    };

    fileReader.readAsArrayBuffer(file);
});

// Eventos de Login e Cadastro
document.getElementById('login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    const success = loginUser(email, password);
    if (success) {
        const loginModal = document.getElementById('login-modal');
        loginModal.classList.add('hidden');
        initializeApp();
    }
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

// Fechar Modais ao Clicar Fora
window.onclick = function(event) {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        if (event.target === modal) {
            modal.classList.add('hidden');
        }
    });
};

// Gestão de Logout
document.getElementById('logout-btn').addEventListener('click', () => {
    logoutUser();
});

// Atualizar Perfil do Usuário
function updateUserProfile() {
    const currentUser = getCurrentUser();
    const userProfile = document.getElementById('user-profile');
    if (currentUser) {
        userProfile.querySelector('span').innerText = currentUser.name;
    } else {
        userProfile.querySelector('span').innerText = 'Usuário';
    }
}

// Carregar Áreas Salvas
function loadAreas() {
    const savedAreas = JSON.parse(localStorage.getItem('areas'));
    if (savedAreas && Array.isArray(savedAreas)) {
        AREAS.length = 0; // Limpar array
        AREAS.push(...savedAreas);
    }
}

// Salvar Áreas no LocalStorage
function saveAreas() {
    localStorage.setItem('areas', JSON.stringify(AREAS));
}

// Inicializar Áreas
loadAreas();

// Implementação da Função para Conferência Simplificada
document.getElementById('save-conference-btn').addEventListener('click', () => {
    const modal = document.getElementById('modal');
    const orderNumber = modal.dataset.orderNumber;
    const nfFile = document.getElementById('nf-upload').files[0];
    const boletoFile = document.getElementById('boleto-upload').files[0];
    const globalObservationInput = document.getElementById('global-observation');

    const orders = getOrders();
    const orderIndex = orders.findIndex(o => o.numeroPedido === orderNumber);
    if (orderIndex === -1) {
        showNotification('Pedido não encontrado.', 'error');
        return;
    }

    // Atualizar observação geral
    orders[orderIndex].globalObservation = globalObservationInput.value.trim();

    // Atualizar status para RECEIVED ou WITH_OBSERVATIONS
    orders[orderIndex].status = determineOrderStatus(orders[orderIndex]);

    // Função para lidar com upload de arquivos
    function handleFileUpload(file, key) {
        return new Promise((resolve, reject) => {
            if (file) {
                const reader = new FileReader();
                reader.onload = function (e) {
                    orders[orderIndex][key] = e.target.result;
                    resolve();
                };
                reader.onerror = function (error) {
                    console.error('Erro ao ler arquivo:', error);
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
        showNotification('Conferência salva com sucesso!', 'success');
        closeModal();
        updateDashboardStats();
        displayReceiverOrders();
        displayFinalizedOrders();
        displayBuyerOrders();
    })
    .catch(() => {
        showNotification('Erro ao processar arquivos.', 'error');
    });
});

// Função de Carregamento Inicial
window.onload = function() {
    const currentUser = getCurrentUser();
    if (currentUser) {
        initializeApp();
    } else {
        showLoginModal();
    }

    feather.replace();
};

// Eventos para atualizar a lista após digitar ou alterar filtros:
document.getElementById('buyer-search').addEventListener('input', displayBuyerOrders);
document.getElementById('buyer-status-filter').addEventListener('change', displayBuyerOrders);

document.getElementById('receiver-search').addEventListener('input', displayReceiverOrders);
document.getElementById('receiver-pending-filter').addEventListener('change', displayReceiverOrders);

document.getElementById('finalized-search').addEventListener('input', displayFinalizedOrders);
document.getElementById('finalized-status-filter').addEventListener('change', displayFinalizedOrders);

document.getElementById('withdrawal-search').addEventListener('input', displayWithdrawalOrders);

// Implementar Modal de Retirada
document.getElementById('withdrawal-modal').addEventListener('submit', (e) => {
    e.preventDefault();
    const withdrawerNameInput = document.getElementById('withdrawer-name');
    const withdrawerName = withdrawerNameInput.value.trim();
    if (!withdrawerName) {
        showNotification('Por favor, insira o nome do retirante.', 'error');
        return;
    }

    const withdrawalModal = document.getElementById('withdrawal-modal');
    const orderNumber = withdrawalModal.dataset.orderNumber;
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

    showNotification('Retirada confirmada e pedido concluído!', 'success');
    withdrawalModal.classList.add('hidden');
    updateDashboardStats();
    displayWithdrawalOrders();
    displayFinalizedOrders();
    displayReceiverOrders();
    displayBuyerOrders();
});

// Funções de Navegação de Seções
const buyerBtn = document.getElementById('buyer-btn');
const receiverBtn = document.getElementById('receiver-btn');
const finalizedBtn = document.getElementById('finalized-btn');
const dashboardBtn = document.getElementById('dashboard-btn');
const withdrawalBtn = document.getElementById('withdrawal-btn'); // Adicionar botão de retirada no sidebar

if (dashboardBtn) {
    dashboardBtn.addEventListener('click', () => {
        setActiveSection('dashboard-section');
        setActiveNav('dashboard-btn');
        displayDashboard();
    });
}

if (buyerBtn) {
    buyerBtn.addEventListener('click', () => {
        setActiveSection('buyer-section');
        setActiveNav('buyer-btn');
        displayBuyerOrders();
    });
}

if (receiverBtn) {
    receiverBtn.addEventListener('click', () => {
        setActiveSection('receiver-section');
        setActiveNav('receiver-btn');
        displayReceiverOrders();
    });
}

if (finalizedBtn) {
    finalizedBtn.addEventListener('click', () => {
        setActiveSection('finalized-section');
        setActiveNav('finalized-btn');
        displayFinalizedOrders();
    });
}

// Adicionar Botão de Retirada no Sidebar (Se ainda não existir)
(function addWithdrawalButton() {
    const navMenu = document.querySelector('.nav-menu ul');
    const withdrawalBtnExists = document.getElementById('withdrawal-btn');
    if (!withdrawalBtnExists) {
        const li = document.createElement('li');
        li.className = 'nav-item';
        li.innerHTML = `
            <button id="withdrawal-btn" class="nav-btn" aria-label="Retirada">
                <i data-feather="truck"></i>
                <span>Retirada</span>
            </button>
        `;
        navMenu.appendChild(li);

        const newWithdrawalBtn = document.getElementById('withdrawal-btn');
        newWithdrawalBtn.addEventListener('click', () => {
            setActiveSection('withdrawal-section');
            setActiveNav('withdrawal-btn');
            displayWithdrawalOrders();
        });
    }
})();

function setActiveSection(sectionId) {
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

function setActiveNav(btnId) {
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

// Função para Atualizar Status dos Pedidos e Dashboard
function updateOrderStatus(orderNumber) {
    const orders = getOrders();
    const orderIndex = orders.findIndex(o => o.numeroPedido === orderNumber);
    if (orderIndex === -1) return;

    orders[orderIndex].status = determineOrderStatus(orders[orderIndex]);
    saveOrders(orders);
    updateDashboardStats();
}


