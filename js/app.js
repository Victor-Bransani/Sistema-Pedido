pdfjsLib.GlobalWorkerOptions.workerSrc = './libs/pdfjs/pdf.worker.js';

const OrderStatus = {
    PENDING: 'pending',
    RECEIVED: 'received',
    WITH_OBSERVATIONS: 'with_observations',
    COMPLETED: 'completed',
    RETURNED: 'returned'
};

const RETURN_KEYWORDS = ['devolvido', 'retorno', 'volta', 'reembolso'];

const currentUser = {
    role: 'buyer' // Ajustar conforme necessidade
};

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
        // Padrões específicos
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

    const globalObservation = '';
    const itens = extractItems(lines);

    const order = {
        numeroPedido,
        nomeFornecedor,
        cnpjFornecedor,
        itens,
        globalObservation,
        status: determineOrderStatus({itens, globalObservation}),
        nfFile: '',
        boletoFile: ''
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
                ${currentUser.role === 'buyer' && order.status !== OrderStatus.PENDING && order.status !== OrderStatus.RETURNED ? `<button class="finalizar-pedido-btn"><i data-feather="check"></i> Concluir Pedido</button>` : ''}
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
                            <th>Status</th>
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
                                <td>${item.received ? 'Recebido' : 'Pendente'}</td>
                                <td>${item.observation || '-'}</td>
                            </tr>`;
                        }).join('')}
                        <tr class="total-row">
                            <td colspan="6"><strong>Total:</strong></td>
                            <td colspan="3"><strong>R$ ${totalValue}</strong></td>
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
    const showOnlyPending = pendingFilter.checked;

    let orders = getOrders().filter(order => 
        [OrderStatus.PENDING, OrderStatus.RECEIVED, OrderStatus.WITH_OBSERVATIONS, OrderStatus.RETURNED].includes(order.status)
    );

    if (showOnlyPending) {
        orders = orders.filter(order => 
            order.itens.some(item => !item.received || item.receivedQuantity < item.quantity)
        );
    }

    const filteredOrders = orders.filter(order => orderMatchesSearch(order, searchValue));

    if (filteredOrders.length === 0) {
        receiverOrdersContainer.innerHTML = '<p>Nenhum pedido pendente encontrado.</p>';
        return;
    }

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
                <p><strong>Status:</strong> 
                    <span class="status-${order.status}">
                        <i data-feather="${getStatusIcon(order.status)}"></i> ${formatStatus(order.status)}
                    </span>
                </p>
                ${hasPendingItems ? '<p class="pending-items">Itens Pendentes</p>' : ''}
            </div>
            <div class="order-actions">
                <button class="conferir-btn"><i data-feather="check-circle"></i> Conferir</button>
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

    filteredOrders.forEach(order => {
        const itens = Array.isArray(order.itens) ? order.itens : [];
        const totalValue = itens.reduce((acc, item) => {
            const q = (typeof item.quantity === 'number') ? item.quantity : 0;
            const p = (typeof item.unitPrice === 'number') ? item.unitPrice : 0;
            return acc + (q * p);
        }, 0).toFixed(2);

        const icon = getStatusIcon(order.status);

        const orderCard = document.createElement('div');
        orderCard.className = 'order-card';
        orderCard.innerHTML = `
            <h3>Pedido Nº ${order.numeroPedido}</h3>
            <div class="order-details">
                <p><strong>Fornecedor:</strong> ${order.nomeFornecedor}</p>
                <p><strong>CNPJ:</strong> ${order.cnpjFornecedor}</p>
                <p><strong>Status:</strong> 
                    <span class="status-${order.status}">
                        <i data-feather="${icon}"></i> ${formatStatus(order.status)}
                    </span>
                </p>
                ${order.globalObservation ? `<p><strong>Observação do Pedido:</strong> ${order.globalObservation}</p>` : ''}
            </div>
            <!-- Botão visualizar itens no canto superior direito -->
            <button class="visualizar-itens-btn"><i data-feather="eye"></i> Visualizar Itens</button>
            
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

// Modal de Conferência do Pedido
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
            <td><input type="number" min="0" max="${qty}" value="${item.receivedQuantity || 0}" data-line-number="${item.lineNumber}" class="received-quantity"></td>
            <td><input type="checkbox" ${item.received ? 'checked' : ''} data-line-number="${item.lineNumber}" class="received-checkbox"></td>
            <td><input type="text" value="${item.observation || ''}" data-line-number="${item.lineNumber}" class="observation-input" placeholder="Observação"></td>
        `;
        itemsTableBody.appendChild(row);
    });

    document.getElementById('global-observation').value = order.globalObservation || '';

    modal.dataset.orderNumber = order.numeroPedido;
    modal.classList.remove('hidden');

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
    const helpModal = document.getElementById('help-modal');
    const modal = document.getElementById('modal');
    if (event.target === helpModal) closeHelpModal();
    if (event.target === modal) closeModal();
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

document.getElementById('save-conference-btn').addEventListener('click', () => {
    const modal = document.getElementById('modal');
    const orderNumber = modal.dataset.orderNumber;
    const nfFile = document.getElementById('nf-upload').files[0];
    const boletoFile = document.getElementById('boleto-upload').files[0];
    const globalObservationInput = document.getElementById('global-observation');

    const itemsRows = document.querySelectorAll('#modal-items-table tbody tr');
    const updatedItems = [];
    let errorFound = false;

    itemsRows.forEach(row => {
        const receivedQuantityInput = row.querySelector('.received-quantity');
        const receivedCheckbox = row.querySelector('.received-checkbox');
        const observationInput = row.querySelector('.observation-input');

        const lineNumber = parseInt(receivedQuantityInput.getAttribute('data-line-number'));
        const received = receivedCheckbox.checked;
        let receivedQuantity = parseFloat(receivedQuantityInput.value) || 0;
        const quantity = parseFloat(row.cells[3].innerText);

        if (isNaN(receivedQuantity) || receivedQuantity < 0) {
            showNotification(`Quantidade recebida inválida para o item linha ${lineNumber}.`, 'error');
            errorFound = true;
            return;
        }

        if (receivedQuantity > quantity) {
            receivedQuantity = quantity;
            showNotification(`Quantidade recebida do item linha ${lineNumber} excede a quantidade total. Ajustada para ${quantity}.`, 'info');
        }

        const observation = observationInput.value.trim();
        const isReturned = isReturnedObservation(observation);
        updatedItems.push({
            lineNumber,
            received,
            receivedQuantity,
            observation: isReturned ? 'Devolvido' : observation,
        });
    });

    if (errorFound) return;

    const globalObservation = globalObservationInput ? globalObservationInput.value.trim() : '';
    const orders = getOrders();
    const orderIndex = orders.findIndex(o => o.numeroPedido === orderNumber);
    if (orderIndex === -1) {
        showNotification('Pedido não encontrado.', 'error');
        return;
    }

    orders[orderIndex].itens.forEach(item => {
        const updatedItem = updatedItems.find(u => u.lineNumber === item.lineNumber);
        if (updatedItem) {
            item.received = updatedItem.received;
            item.receivedQuantity = updatedItem.receivedQuantity;
            item.observation = updatedItem.observation;
        }
    });

    orders[orderIndex].globalObservation = globalObservation;
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

function finalizeOrder(orderNumber) {
    if (currentUser.role !== 'buyer') {
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

                orders.push(order);
                saveOrders(orders);

                showNotification('Pedido processado e salvo com sucesso!', 'success');
                fileInput.value = '';
                updateDashboardStats();
                displayBuyerOrders();
                displayReceiverOrders();
                displayFinalizedOrders();
            });
        }).catch(error => {
            console.error('Erro ao processar o PDF:', error);
            showNotification('Erro ao processar o PDF.', 'error');
        });
    };

    fileReader.readAsArrayBuffer(file);
});

const helpBtns = document.querySelectorAll('.icon-btn.tooltip');
helpBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        openHelpModal();
    });
});

function openHelpModal() {
    const helpModal = document.getElementById('help-modal');
    if (helpModal) {
        helpModal.classList.remove('hidden');
    }
}

function closeHelpModal() {
    const helpModal = document.getElementById('help-modal');
    if (helpModal) {
        helpModal.classList.add('hidden');
    }
}

const helpCloseButtons = document.querySelectorAll('#help-modal .close-btn');
helpCloseButtons.forEach(button => {
    button.addEventListener('click', closeHelpModal);
});

const buyerBtn = document.getElementById('buyer-btn');
const receiverBtn = document.getElementById('receiver-btn');
const finalizedBtn = document.getElementById('finalized-btn');
const dashboardBtn = document.getElementById('dashboard-btn');

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

window.onload = function() {
    const dashboardSection = document.getElementById('dashboard-section');
    if (dashboardSection && document.getElementById('dashboard-btn')) {
        setActiveSection('dashboard-section');
        setActiveNav('dashboard-btn');
        displayDashboard();
    } else {
        setActiveSection('buyer-section');
        setActiveNav('buyer-btn');
        displayBuyerOrders();
    }

    updateDashboardStats();
    displayReceiverOrders();
    displayFinalizedOrders();

    if (typeof feather !== 'undefined') {
        feather.replace();
    }
};

// Eventos para atualizar a lista após digitar ou alterar filtros:
document.getElementById('buyer-search').addEventListener('input', displayBuyerOrders);
document.getElementById('buyer-status-filter').addEventListener('change', displayBuyerOrders);

document.getElementById('receiver-search').addEventListener('input', displayReceiverOrders);
document.getElementById('receiver-pending-filter').addEventListener('change', displayReceiverOrders);

document.getElementById('finalized-search').addEventListener('input', displayFinalizedOrders);
document.getElementById('finalized-status-filter').addEventListener('change', displayFinalizedOrders);
