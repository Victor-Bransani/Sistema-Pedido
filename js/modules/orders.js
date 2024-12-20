import {OrderStatus, RETURN_KEYWORDS} from './constants.js';

export function cleanDescription(description) {
    if (!description || typeof description !== 'string') return '';
    const noisePatterns = [/\*\*\*/, /\/\//, /\bREQ\b/i, /\bCAM\b/i, /\bPEDIDO\b/i, /\bOBSERVAÇÃO\b/i, /\bDE\s+OUTRAS\s+ESTRUTURAS\b/i];
    let cleaned = description;
    noisePatterns.forEach(pattern => {
        cleaned = cleaned.replace(pattern, '');
    });
    return cleaned.replace(/\s+/g, ' ').trim();
}

export function cleanExtraParts(description) {
    if (!description || typeof description !== 'string') return '';
    let desc = description;
    const unwantedPatternsList = [
        /\b\d{1,3}(?:\.\d{3})*,\d{2}\b/g,
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

    unwantedPatternsList.forEach(pattern => {
        desc = desc.replace(pattern, '').trim();
    });

    desc = desc.replace(/FRAMON\s+OS\s+ORÇAMENTOS\.\s+ANEXO\s+AS\s+JUSTIFICATICAS\s+DELE\./i, 'FRAMON').trim();
    desc = desc.replace(/(\.[A-Za-z0-9\-]+){2,}$/i, '').trim();

    return desc;
}

export function isPageHeaderOrFooter(line) {
    const lowerLine = line.trim().toLowerCase();
    return (
        lowerLine.includes('serviço nacional de aprendizagem comercial') ||
        lowerLine.includes('administração regional no estado de são paulo') ||
        lowerLine.includes('comprador:') ||
        (lowerLine.includes('fone:') && lowerLine.includes('email:')) ||
        lowerLine.includes('página')
    );
}

export function splitLineAtNewItemPattern(line) {
    const regex = /(\d+\s+\d{8,}\.)/g;
    let result = [];
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(line)) !== null) {
        if (match.index > lastIndex) {
            const precedingText = line.substring(lastIndex, match.index).trim();
            if (precedingText) {
                result.push(precedingText);
            }
        }
        lastIndex = match.index;
    }

    if (lastIndex < line.length) {
        const remainingText = line.substring(lastIndex).trim();
        if (remainingText) {
            result.push(remainingText);
        }
    }

    return result;
}

export function determineOrderStatus(order) {
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

    if (order.receiveDate) {
        if ((globalObservation || '').trim() !== '') {
            return OrderStatus.WITH_OBSERVATIONS;
        }
        return OrderStatus.RECEIVED;
    }

    return OrderStatus.PENDING;
}

export function extractItems(lines) {
    const itens = [];
    let isItemSection = false;
    let currentItem = null;

    const itemLineRegex = /^(\d+)\s+(\d{8,})\.(.*?)\s+([\d.,]+)\s+([^\s]+)\s+([\d.,]+)\s+([\d.,]+)$/;

    function isNoiseLine(line) {
        const noisePatterns = [
            /^PEDIDO/i,
            /^CAM/i,
            /^OBSERVAÇÃO/i,
            /^\*\*\*/,
            /^\/\//,
            /^REQ\b\s+.*$/i,
            /Linha\s+Produto\/Serviço/i,
            /^\d+\s+\d+\s+\d{2}-\d{2}-\d{4}\s+/
        ];

        for (const pattern of noisePatterns) {
            if (pattern.test(line)) {
                return true;
            }
        }
        return false;
    }

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (!line) continue;

        const splitLines = splitLineAtNewItemPattern(line);
        for (let splitLine of splitLines) {
            if (!splitLine) continue;

            if (isPageHeaderOrFooter(splitLine)) {
                continue;
            }

            if (!isItemSection && splitLine.toLowerCase().includes('produto/serviço')) {
                isItemSection = true;
                continue;
            }

            if (isItemSection && (splitLine.toLowerCase().includes('total geral') || splitLine.toLowerCase().includes('total:'))) {
                if (currentItem) {
                    itens.push(currentItem);
                    currentItem = null;
                }
                isItemSection = false;
                break;
            }

            if (isItemSection) {
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

                    if (currentItem) {
                        itens.push(currentItem);
                        currentItem = null;
                    }

                    const quantity = parseFloat(quantityStr.replace(/\./g, '').replace(',', '.'));
                    const unitPrice = parseFloat(unitPriceStr.replace(/\./g, '').replace(',', '.'));
                    const totalPrice = parseFloat(totalPriceStr.replace(/\./g, '').replace(',', '.'));

                    if (isNaN(quantity) || isNaN(unitPrice) || isNaN(totalPrice)) {
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

                } else {
                    if (currentItem && !isNoiseLine(splitLine)) {
                        let extraText = cleanDescription(splitLine);
                        extraText = cleanExtraParts(extraText);

                        if (extraText) {
                            currentItem.description += ' ' + extraText;
                            currentItem.description = currentItem.description.replace(/\s+/g, ' ').trim();
                        }
                    }
                }
            }
        }
    }

    if (currentItem) {
        itens.push(currentItem);
    }

    itens.forEach(item => {
        item.description = cleanExtraParts(item.description);
    });

    return itens;
}

export function extractOrderData(orderText) {
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
        senderName,
        sendDate,
        itens,
        globalObservation,
        status: OrderStatus.PENDING,
        nfFile: '',
        boletoFile: '',
        area: '',
        receiveDate: '',
        withdrawalDate: '',
        withdrawer: '',
        receiverName: ''
    };

    return order;
}

export function formatCNPJ(cnpj) {
    if (typeof cnpj !== 'string') return 'Inválido';
    cnpj = cnpj.replace(/\D/g, '');
    return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

export function formatStatus(status) {
    switch(status) {
        case OrderStatus.PENDING: return 'Pendente';
        case OrderStatus.RECEIVED: return 'Recebido';
        case OrderStatus.WITH_OBSERVATIONS: return 'Recebido c/ Observações';
        case OrderStatus.COMPLETED: return 'Concluído';
        case OrderStatus.RETURNED: return 'Devolvido';
        case OrderStatus.READY_FOR_PICKUP: return 'Pronto para Retirada';
        default: return 'Desconhecido';
    }
}

export function getStatusIcon(status) {
    switch(status) {
        case OrderStatus.PENDING: return 'clock';
        case OrderStatus.RECEIVED: return 'check-circle';
        case OrderStatus.WITH_OBSERVATIONS: return 'alert-triangle';
        case OrderStatus.COMPLETED: return 'check-circle';
        case OrderStatus.RETURNED: return 'x-circle';
        case OrderStatus.READY_FOR_PICKUP: return 'truck';
        default: return 'clock';
    }
}
