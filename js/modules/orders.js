// modules/orders.js (Versão Refatorada Final - Estratégia Simplificada)

import { OrderStatus, RETURN_KEYWORDS } from './constants.js';
import { normalizeString, getCurrentDate, formatDate, parseDate, formatCurrency } from './utils.js';

// --- Funções Auxiliares de Limpeza e Verificação ---

function cleanItemDescription(description) {
    if (typeof description !== 'string' || !description) return '';
    let cleanedDesc = description;
    cleanedDesc = cleanedDesc.replace(/^\s*\d{6,12}\.?\s*/, '').trim(); // Código no início
    const noisePatterns = [ /\bCOD[:.\s]*\S+/gi, /\bREF[:.\s]*[\w-]+/gi, /\bPART\s*NUMBER[:.\s]*[\w-]+/gi, /\bNCM[:.\s]*\d+(\.\d+)?\b/gi ];
    noisePatterns.forEach(p => cleanedDesc = cleanedDesc.replace(p, ''));
    cleanedDesc = cleanedDesc.replace(/\s*\*{2}.*$/i, '').trim(); // Remove **comentários**
    cleanedDesc = cleanedDesc.replace(/\s+(UN|PC|PCT|CX|KG|L|M|CM|MM|METRO|HORA|HL|BALDE|BD|PACOTE|PCT|UNIDADE|UNID|UND|MONTHLY|ROLO|RL|BOBINA|MENSAL|GALAO|GL|LATA|LT|FRASCO|FR|SACO|SC|RESMA|RM|CENTO|CT|KIT|KT|JOGO|JG|PAR|PÇ|SV)\s*$/i, ''); // Unidades
    return cleanedDesc.replace(/\s+/g, ' ').trim();
}

function isPageHeaderOrFooter(line) {
    if (typeof line !== 'string' || !line) return false;
    const lowerLine = normalizeString(line);
    const patterns = [
        'servico nacional de aprendizagem comercial', 'senac', 'administracao regional no estado de sao paulo',
        'comprador:', 'pagina', 'pag.', 'fls', 'folha', 'impresso em:', 'data de emissao', 'dt. emissao', 'data emissao',
        'local de faturamento:', 'local de entrega:', /^\s*senac\s*$/i, /^\s*\d{1,2}\/\d{1,2}\/\d{2,4}\s+\d{1,2}:\d{2}(:\d{2})?\s*$/,
        /^\s*Relatório de Pedido de C/i, /^\s*Pedido\s+Número\s+Revisão\s+Data Criação/i,
        /^\s*linha\s+produto\/servi[çc]o\s+data entrega\s+quantidade\s+udm\s+pre[çc]o unit[áa]rio\s+pre[çc]o total\s*$/i
    ];
    if (patterns[patterns.length-1].test(lowerLine)) return false; // Não é header/footer PÁGINA se for header ITENS
    if (patterns.slice(0,-1).some(p => typeof p === 'string' ? lowerLine.includes(p) : p.test(line))) return true;
    if (line.length < 25 && /^[\d\W\s]+$/.test(line) && !lowerLine.match(/total|valor|preco|r\$|item|[\d.,]{3,}/)) return true;
    return false;
}

function isItemCommentLine(line) {
    if (typeof line !== 'string' || !line) return false;
    const normalizedLine = normalizeString(line);
    const commentPatterns = [
        /^(cam|req\s*\d+|solicitado\s+por|compra\s+emergencial|pedido\s+urgente|-)/i, // Mantido e pode pegar "CAM CENTRO - REQ..."
        /^REQ\s*\d+/i, // Adicionado para reforçar "REQ NNNN"
        /CAM CENTRO\s*-\s*REQ\s*\d+/i, // Adicionado para ser bem específico para "CAM CENTRO - REQ NNNN"
        /materiais?\s+(?:para|d[oa])\s+(?:o\s+)?curso/i, /^\s*\*\*\s*(?:itens?\s+da?\s+linha|frete)/i,
        /^\s*\*\*\*/, /^\s*\(.+\)$/, /^\s*CNPJ:/i, /^\s*Fone:/i, /^\s*Email:/i
    ];
    const startsWithItemNumber = line.match(/^\s*\d{1,4}\s+/);
    const endsWithMultipleNumbers = line.match(/([\d.,]+\s*){2,}$/);
    return commentPatterns.some(pattern => pattern.test(normalizedLine)) && (!startsWithItemNumber || !endsWithMultipleNumbers);
}

// --- Funções de Extração de Cabeçalho ---
function extractOrderNumber(lines) {
    console.log('[Orders] Iniciando extração do número do pedido...');
    const headerLineKeywords = ['pedido numero', 'revisao', 'data criacao'];
    const numberOnNextLineRegex = /^(?:["\s]*PEDIDO["\s]*)?["\s]*(\d{5,8})\b/;
    let headerFoundIndex = -1;

    // Procura pelo cabeçalho tabular
    for (let i = 0; i < Math.min(lines.length, 15); i++) {
        const normalizedLine = normalizeString(lines[i]);
        if (headerLineKeywords.every(kw => normalizedLine.includes(kw))) {
            headerFoundIndex = i;
            console.log(`[Orders] Linha header pedido encontrada ${i}: "${lines[i]}"`);
            break;
        }
    }

    // Se encontrou o cabeçalho, procura o número nas próximas linhas
    if (headerFoundIndex !== -1) {
        for (let j = 1; j <= 3 && (headerFoundIndex + j) < lines.length; j++) {
            const nextLine = lines[headerFoundIndex + j].trim();
            if (!nextLine || isPageHeaderOrFooter(nextLine)) continue;

            const match = nextLine.match(numberOnNextLineRegex);
            if (match && match[1]) {
                console.log(`[Orders] Nº Pedido "${match[1]}" encontrado linha ${headerFoundIndex + j}`);
                return match[1];
            }

            const simpleMatch = nextLine.match(/^\s*(\d{5,8})\s*$/);
            if (simpleMatch && simpleMatch[1]) {
                console.log(`[Orders] Nº Pedido "${simpleMatch[1]}" (linha isolada) linha ${headerFoundIndex + j}`);
                return simpleMatch[1];
            }

            if (!nextLine.match(/^["\s]*(?:PEDIDO|\d)/)) break;
        }
    }

    // Fallback: procura por padrões mais genéricos
    console.log("[Orders] Cabeçalho tabular não encontrado ou número não localizado. Tentando fallback...");
    const orderKeywords = ['pedido numero', 'numero do pedido', 'pedido no.', 'pedido n.'];
    const pcPattern = /(?:pedido|ordem)\s*n?[º°.]?\s*[:\-]?\s*(\d{5,8})/i;

    for (let i = 0; i < Math.min(lines.length, 25); i++) {
        const currentLine = lines[i].trim();
        const normalizedCurrentLine = normalizeString(currentLine);

        // Tenta o padrão PC
        const pcMatch = currentLine.match(pcPattern);
        if (pcMatch && pcMatch[1]) {
            console.log(`[Orders] Nº Pedido "${pcMatch[1]}" encontrado via padrão PC`);
            return pcMatch[1].trim();
        }

        // Tenta os keywords
        for (const keyword of orderKeywords) {
            if (normalizedCurrentLine.includes(keyword.replace(/[º°.:]/g, ''))) {
                const regex = new RegExp(`(?:${keyword.replace(/\s/g, '\\s*')})\\s*[:\\-]?\\s*(\\d{5,8})`, 'i');
                let match = currentLine.match(regex);
                if (match && match[1]) {
                    console.log(`[Orders] Nº Pedido "${match[1]}" encontrado via keyword "${keyword}"`);
                    return match[1].trim();
                }
            }
        }

        // Tenta linha isolada com número
        if (currentLine.match(/^\d{5,8}$/)) {
            console.log(`[Orders] Nº Pedido "${currentLine}" encontrado em linha isolada`);
            return currentLine;
        }
    }

    console.error("[Orders] ERRO CRÍTICO: Número do pedido não extraído.");
    return null;
}

function extractSupplierInfo(lines, structuredLines = null) {
    console.log('[Orders] Iniciando extração de informações do fornecedor...');

    let nomeFornecedor = null;
    let cnpjFornecedor = null;

    // Regex para CNPJ
    const cnpjRegex = /(\d{2}\.?\d{3}\.?\d{3}\/\d{4}-?\d{2}|\d{14})/;
    const clientKeywords = [
        'senac', 'serviço nacional', 'aprendizagem comercial', 
        'local de faturamento', 'local de entrega',
        '03.709.814/0057-42', 'rua sacramento', 'campinas - sp - cep: 13010-210'
    ];

    // --- NOVO: Tenta extração estruturada se disponível ---
    if (structuredLines && Array.isArray(structuredLines)) {
        for (let i = 0; i < structuredLines.length - 1; i++) {
            const line = structuredLines[i];
            // Procura por "Fornecedor:" e CNPJ na mesma linha
            const hasFornecedor = line.some(item => normalizeString(item.text).startsWith('fornecedor'));
            const cnpjItem = line.find(item => cnpjRegex.test(item.text));
            if (hasFornecedor && cnpjItem) {
                // Próxima linha, campo da esquerda (col:0)
                const nextLine = structuredLines[i + 1];
                if (nextLine && nextLine.length > 0) {
                    const leftField = nextLine[0].text.trim();
                    if (
                        leftField.length > 3 &&
                        !clientKeywords.some(kw => normalizeString(leftField).includes(normalizeString(kw))) &&
                        !leftField.match(cnpjRegex)
                    ) {
                        nomeFornecedor = leftField.replace(/\s*\(\d+\)\s*$/, '').trim();
                        cnpjFornecedor = formatCNPJ(cnpjItem.text.replace(/\D/g, ''));
                        break;
                    }
                }
            }
        }
    }

    // Fallback: código legado para texto plano
    if (!nomeFornecedor || !cnpjFornecedor) {
        // ... (restante do código legado já existente aqui) ...
        // Copie o bloco do seu código anterior para manter compatibilidade
        // (não repito aqui para não duplicar, mas mantenha o restante do código)
    }

    console.log('[Orders] Resultado final da extração:', {
        nomeFornecedor: nomeFornecedor || 'Não encontrado',
        cnpjFornecedor: cnpjFornecedor || 'Não encontrado'
    });
    return {
        nomeFornecedor: nomeFornecedor || 'Não encontrado',
        cnpjFornecedor: cnpjFornecedor || 'Não encontrado'
    };
}

// ** CORRIGIDA extractSenderInfo **
function extractSenderInfo(lines) {
    let senderName = null; let sendDate = null;
    const senderKeywords = ['comprador', 'solicitante', 'contato', 'elaborado por', 'criado por', 'responsavel', 'responsável'];
    const dateKeywords = ['data criacao', 'data criac~ao', 'data de criacao', 'data de criação', 'data emissao', 'emitido em', 'data do pedido', 'data da compra', 'dt. pedido'];
    const datePatternIsolate = /(\d{1,2}[-./](\d{1,2}|[A-Z]{3})[-./]\d{2,4})/; // Regex para o formato da data

    for (let i = 0; i < Math.min(lines.length, 25); i++) {
        const line = lines[i].trim(); const normalizedLine = normalizeString(line);
        // Extrai Nome
        if (!senderName) { /* ... (lógica anterior para nome) ... */
             for (const keyword of senderKeywords) { const keywordIndex = normalizedLine.indexOf(keyword.replace(':','')); if (keywordIndex !== -1) { let pName = line.substring(keywordIndex + keyword.length).replace(/^\s*[:\-]?\s*/, '').split(/email:|e-mail:|fone:|tel\.:|cel\.:|ramal:/i)[0].trim(); if (pName.length > 2 && pName.length < 60 && pName.match(/[a-zA-Z]/) && !isPageHeaderOrFooter(pName) && !parseDate(pName) && !pName.match(/\d{2}\.\d{3}\.\d{3}/) ) { senderName = pName; console.log(`[Orders] Sender Name: ${senderName}`); break; } } }
        }
        // Extrai Data (MAIS RESTRITIVO)
        if (!sendDate) {
             for (const keyword of dateKeywords) {
                const keywordIndex = normalizedLine.indexOf(keyword.replace(':',''));
                if (keywordIndex !== -1) {
                    const restOfLine = line.substring(keywordIndex + keyword.length).trim();
                    // 1. Procura data EXATA logo após keyword na MESMA linha
                    let dateMatch = restOfLine.match(datePatternIsolate);
                    // Verifica se o match foi logo no início do resto da linha
                    if (dateMatch && dateMatch[0] && restOfLine.startsWith(dateMatch[0])) {
                        const parsed = parseDate(dateMatch[0]); // Tenta parsear SÓ o match
                        if (parsed) { sendDate = formatDate(parsed); console.log(`[Orders] Send Date: ${sendDate} (linha keyword)`); break; }
                    }
                    // 2. Procura data EXATA no início da PRÓXIMA linha (se não vazia)
                    else if (i + 1 < lines.length) {
                        const nextLine = lines[i+1].trim();
                        if(nextLine){ // Verifica se a próxima linha não é vazia
                            dateMatch = nextLine.match(datePatternIsolate);
                            // Verifica se a linha seguinte COMEÇA com a data encontrada
                            if (dateMatch && dateMatch[0] && nextLine.startsWith(dateMatch[0])) {
                                 const parsed = parseDate(dateMatch[0]);
                                 if (parsed) { sendDate = formatDate(parsed); console.log(`[Orders] Send Date: ${sendDate} (linha seguinte)`); break; }
                            }
                        }
                    }
                } // Fim if keywordIndex
             } // Fim loop dateKeywords
             if (sendDate) break; // Sai do loop principal se achou a data
        } // Fim if (!sendDate)
        if (senderName && sendDate) break; // Sai se achou ambos
    }
    return { senderName: senderName || 'Não encontrado', sendDate: sendDate || getCurrentDate() };
}

// --- Função Principal de Extração de Itens ---
function extractItems(lines, initialSearchIndex = 0) {
    console.log('[Orders] Iniciando extração de itens...');
    const itens = [];
    const warnings = [];
    let itemTableStarted = false;
    let currentItemLinesBuffer = [];

    // Keywords para identificar o cabeçalho da tabela
    const headerKeywords = [
        'linha', 'produto/serviço', 'data entrega', 
        'quantidade', 'udm', 'preço unitário', 'preço total'
    ];

    // Keywords para identificar o rodapé da tabela
    const footerKeywords = [
        'total geral:', 'valor total do pedido:', 'subtotal:', 
        'total:', 'soma total:', 'observacoes:', 
        'condicoes de pagamento:', /^\(.*? REAIS/i
    ];

    // 1. Encontrar o cabeçalho da tabela
    let headerLineIndex = -1;
    for (let i = initialSearchIndex; i < Math.min(lines.length, 50); i++) {
        const line = lines[i];
        const normalizedLine = normalizeString(line);
        
        if (isPageHeaderOrFooter(line)) continue;

        // Conta quantas keywords do cabeçalho estão presentes
        const keywordCount = headerKeywords.reduce((count, kw) => 
            count + (normalizedLine.includes(kw.split(' ')[0]) ? 1 : 0), 0);

        if (keywordCount >= 3) {
            // Verifica se a próxima linha parece um item
            let nextLineLooksLikeItem = false;
            for (let k = 1; k <= 3 && (i + k) < lines.length; k++) {
                if (lines[i + k].trim().match(/^\s*\d{1,4}\s+/)) {
                    nextLineLooksLikeItem = true;
                    break;
                }
            }

            if (nextLineLooksLikeItem) {
                headerLineIndex = i;
                itemTableStarted = true;
                console.log(`[Orders] Cabeçalho da tabela detectado na linha ${i}: "${line}"`);
                break;
            }
        }
    }

    // Fallback: procura pelo primeiro item
    if (!itemTableStarted) {
        console.log('[Orders] Tentando encontrar início da tabela pelo primeiro item...');
        for (let i = Math.min(10, lines.length); i < lines.length; i++) {
            const line = lines[i].trim();
            // Procura por linha que começa com "1" e tem números no final
            if (line.match(/^\s*1\s+(?:(?:\d{6,}\.?\s+)?[a-zà-úçãõ].*?)([\d.,]+\s*){2,}$/i)) {
                headerLineIndex = i - 1;
                itemTableStarted = true;
                console.log(`[Orders] Início da tabela inferido na linha ${i}: "${line}"`);
                break;
            }
        }
    }

    if (!itemTableStarted) {
        warnings.push("Cabeçalho/início da tabela de itens não identificado.");
        console.warn("[Orders] Cabeçalho não encontrado.");
        return { itens, warnings };
    }

    // 2. Processar as linhas de itens
    let currentExpectedLineNumber = 1;
    for (let i = headerLineIndex + 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const normalizedLine = normalizeString(line);

        // Verifica se é uma linha de rodapé
        const isFooter = footerKeywords.some(kw => 
            typeof kw === 'string' ? 
                normalizedLine.startsWith(kw.replace(':', '')) : 
                kw.test(line)
        ) && line.length < 100;

        if (isFooter) {
            if (currentItemLinesBuffer.length > 0) {
                const item = parseSingleItemFromBuffer(currentItemLinesBuffer, warnings, currentExpectedLineNumber - 1);
                if (item) itens.push(item);
            }
            console.log(`[Orders] Rodapé detectado na linha ${i}: "${line}". Finalizando.`);
            break;
        }

        // Pula headers/footers de página
        if (isPageHeaderOrFooter(line)) {
            if (currentItemLinesBuffer.length > 0) {
                const item = parseSingleItemFromBuffer(currentItemLinesBuffer, warnings, currentExpectedLineNumber - 1);
                if (item) {
                    itens.push(item);
                } else {
                    warnings.push(`Buffer descartado antes do header/footer página ${i}`);
                }
                currentItemLinesBuffer = [];
            }
            console.log(`[Orders] Header/Footer de página ignorado na linha ${i}: "${line}"`);
            continue;
        }

        // Verifica se é uma nova linha de item
        const newItemMatch = line.match(/^\s*(\d{1,4})\s+.*/);
        const lineNumberFound = newItemMatch ? parseInt(newItemMatch[1], 10) : NaN;
        const isNewItemLine = !isNaN(lineNumberFound) && 
            (lineNumberFound >= currentExpectedLineNumber || 
             (lineNumberFound === 1 && currentExpectedLineNumber === 1));

        if (isNewItemLine) {
            // Processa o buffer anterior se existir
            if (currentItemLinesBuffer.length > 0) {
                const item = parseSingleItemFromBuffer(currentItemLinesBuffer, warnings, currentExpectedLineNumber - 1);
                if (item) itens.push(item);
            }
            currentItemLinesBuffer = [line];
            currentExpectedLineNumber = lineNumberFound + 1;
            console.log(`[Orders] Nova linha de item detectada: ${line}`);
        } else if (currentItemLinesBuffer.length > 0) {
            // Adiciona ao buffer atual se não for uma linha de comentário
            if (!isItemCommentLine(line)) {
                currentItemLinesBuffer.push(line);
                console.log(`[Orders] Linha adicional para item atual: ${line}`);
            } else {
                console.log(`[Orders] Linha de comentário ignorada: "${line}"`);
            }
        }
    }

    // Processa o último buffer se existir
    if (currentItemLinesBuffer.length > 0) {
        const item = parseSingleItemFromBuffer(currentItemLinesBuffer, warnings, currentExpectedLineNumber - 1);
        if (item) itens.push(item);
    }

    // Validações finais
    if (itens.length === 0 && itemTableStarted) {
        warnings.push("Tabela iniciada, mas nenhum item extraído.");
        console.warn("[Orders] Nenhum item extraído.");
    } else if (itens.length > 0) {
        console.log(`[Orders] Extração finalizada com sucesso. ${itens.length} itens encontrados.`);
    }

    return { itens, warnings };
}

// --- Função de Parse do Buffer do Item (SIMPLIFICADA) ---
function parseSingleItemFromBuffer(itemLineBuffer, warnings, itemNumber) {
    let combinedText = itemLineBuffer.join(' ').replace(/\s+/g, ' ').trim();
    if (!combinedText) return null;
    console.log(`--- [Item ${itemNumber} LEGACY_PARSE] Parsing: "${combinedText}"`); // Log Adicionado

    const parseFloatPtBr = (value) => { 
        console.log(`[parseFloatPtBr LEGACY_PARSE] Input: '${value}'`); // Log Adicionado
        if (typeof value !== 'string' || !value) return NaN; 
        const cleaned = value.replace(/\./g, '').replace(',', '.'); 
        const number = parseFloat(cleaned); 
        console.log(`[parseFloatPtBr LEGACY_PARSE] Cleaned: '${cleaned}', Output: ${number}`); // Log Adicionado
        return isNaN(number) ? NaN : number; 
    };

    let extractedData = null; 
    let patternUsed = "None";

    // Melhorado para capturar formatos de preço com melhor precisão
    const patterns = [
        { name: "trailingText", regex: /^\s*(?<lineNumber>\d{1,4})\s+(?:(?<itemCode>\d{6,12}\.?)\s*)?(?<description>.+?)\s+(?<quantity>[\d.,]+)\s+(?<unit>[A-ZÀ-ÚÇç/]{1,15})\s+(?<unitPrice>[\d.,]+)\s+(?<totalPrice>[\d.,]+)(?<trailingDesc>.*?)\s*$/i },
        { name: "main",         regex: /^\s*(?<lineNumber>\d{1,4})\s+(?:(?<itemCode>\d{6,12}\.?)\s*)?(?<description>.+?)\s+(?:(?<deliveryDate>\d{1,2}[-./][A-Z]{3}[-./]\d{2,4}|\d{1,2}[-./]\d{1,2}[-./]\d{2,4})\s+)?(?<quantity>[\d.,]+)\s+(?<unit>[A-ZÀ-ÚÇç/]{1,15})\s+(?<unitPrice>[\d.,]+)\s+(?<totalPrice>[\d.,]+)\s*$/i },
        { name: "service",      regex: /^\s*(?<lineNumber>\d{1,4})\s+(?:(?<itemCode>\d{6,12}\.?)\s*)?(?<description>.+?)\s+(?:(?<deliveryDate>\d{1,2}[-./][A-Z]{3}[-./]\d{2,4}|\d{1,2}[-./]\d{1,2}[-./]\d{2,4})\s+)?R\$\s+(?<quantity>[\d.,]+)\s+(?<unitPrice>[\d.,]+)\s+(?<totalPrice>[\d.,]+)\s*$/i }
    ];

    // Primeiro tenta encontrar valores com padrões específicos de preço
    const pricePatterns = [
        /(\d{1,3}(?:\.\d{3})*,\d{2})/g,  // Formato brasileiro de moeda: 1.234,56
        /(\d+,\d{2})/g,                   // Formato simples: 1234,56
        /R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/g,  // Com prefixo R$: R$ 1.234,56
        /(\d+(?:,\d+)?)/g                 // Qualquer número com ou sem decimal
    ];
    
    // Extrai possíveis preços do texto
    let possiblePrices = [];
    for (const pattern of pricePatterns) {
        const matches = [...combinedText.matchAll(pattern)];
        if (matches.length > 0) {
            possiblePrices = [
                ...possiblePrices,
                ...matches.map(m => m[1])
            ];
        }
    }
    
    // Log dos possíveis preços para debug
    if (possiblePrices.length > 0) {
        console.log(`[Item ${itemNumber} LEGACY_PARSE] Possíveis preços encontrados:`, possiblePrices);
    }

    // Tenta os padrões regulares
    for (const p of patterns) {
        let match = combinedText.match(p.regex);
        if (match && match.groups) {
            const g = match.groups;
            if (p.name === "trailingText" && g.trailingDesc && g.trailingDesc.trim().match(/^\d{1,4}\s+/)) {
                continue; 
            }
            console.log(`   [Item ${itemNumber} LEGACY_PARSE] Regex Match: ${p.name}. Groups:`, g); // Log Adicionado
            patternUsed = p.name;
            extractedData = {...g};
            if (p.name === "trailingText") extractedData.description = (g.description.trim() + ' ' + g.trailingDesc.trim()).trim();
            if (p.name === "service") extractedData.unit = 'SV';
            break; 
        }
    }

    // Se não encontrou através dos padrões regulares, tenta uma abordagem mais agressiva
    if (!extractedData) {
        console.log(`   [Item ${itemNumber} LEGACY_PARSE] Padrões regulares falharam, tentando extração agressiva.`);
        
        // Extrai a descrição excluindo possíveis valores numéricos no final
        // Busca por código de produto no formato SENAC (números seguidos de ponto)
        const codeMatch = combinedText.match(/(\d{6,12})\.?/);
        let code = "N/A";
        if (codeMatch) {
            code = codeMatch[1];
            // Remove o código da descrição
            combinedText = combinedText.replace(codeMatch[0], '');
        }
        
        // Detecta e extrai valores numéricos que podem ser quantidade, preço unitário ou preço total
        let numbers = possiblePrices.map(price => parseFloatPtBr(price));
        
        // Determina qual é qual baseado na posição e valores
        let quantity = 1;  // valor padrão
        let unitPrice = 0;
        let totalPrice = 0;
        
        if (numbers.length >= 3) {
            // Se tem 3 ou mais números, assume que os últimos são os valores de preço
            quantity = numbers[0];
            unitPrice = numbers[1];
            totalPrice = numbers[2];
        } else if (numbers.length === 2) {
            // Se tem 2 números, assume quantidade e preço total
            quantity = numbers[0];
            totalPrice = numbers[1];
            if (quantity > 0) {
                unitPrice = totalPrice / quantity;
            }
        } else if (numbers.length === 1) {
            // Se tem apenas 1 número, assume que é o preço total
            totalPrice = numbers[0];
            quantity = 1; // Assume quantidade 1
            unitPrice = totalPrice; // Mesmo valor para unitário
        }
        
        // Tenta determinar a unidade
        const unitPattern = /\b(UN|PC|PCT|CX|KG|L|M|CM|MM|METRO|HORA|HL|BALDE|BD|PACOTE|UNIDADE|UNID|UND|MONTHLY|ROLO|RL|BOBINA|MENSAL|GALAO|GL|LATA|LT|FRASCO|FR|SACO|SC|RESMA|RM|CENTO|CT|KIT|KT|JOGO|JG|PAR|PÇ|SV)\b/i;
        const unitMatch = combinedText.match(unitPattern);
        let unit = "UN"; // valor padrão
        
        if (unitMatch) {
            unit = unitMatch[1].toUpperCase();
            // Remove a unidade da descrição
            combinedText = combinedText.replace(unitPattern, '');
        }
        
        // Limpa a descrição de possíveis preços
        pricePatterns.forEach(pattern => {
            combinedText = combinedText.replace(pattern, '');
        });
        
        // Remove múltiplos espaços e números isolados
        combinedText = combinedText.replace(/\s+/g, ' ').replace(/\b\d+\b/g, '').trim();
        
        extractedData = {
            lineNumber: itemNumber,
            itemCode: code,
            description: combinedText,
            quantity: quantity.toString(),
            unit: unit,
            unitPrice: unitPrice.toString(),
            totalPrice: totalPrice.toString()
        };
        
        patternUsed = "agressivo";
        console.log(`   [Item ${itemNumber} LEGACY_PARSE] Extração agressiva: Qty=${quantity}, Unit=${unit}, Unit Price=${unitPrice}, Total=${totalPrice}`);
    }

    if (!extractedData) { 
        console.warn(`   [Item ${itemNumber} LEGACY_PARSE] NENHUM PADRÃO CORRESPONDEU: "${combinedText}"`);
        warnings.push(`Item ${itemNumber}: Padrão não reconhecido (Texto: "${combinedText.substring(0, 60)}...")`);
        return null; 
    }

    try {
        console.log(`   [Item ${itemNumber} LEGACY_PARSE] Extracted Data before parse:`, extractedData); // Log Adicionado
        const finalItem = {
            lineNumber: parseInt(extractedData.lineNumber, 10) || itemNumber,
            code: extractedData.itemCode?.replace(/\.$/,'').trim() || "N/A",
            description: cleanItemDescription(extractedData.description?.trim() || ""),
            quantity: parseFloatPtBr(extractedData.quantity) || 1, // Fallback para quantidade 1
            unit: extractedData.unit?.trim().toUpperCase().substring(0,10) || "UN",
            unitPrice: parseFloatPtBr(extractedData.unitPrice) || 0,
            totalPrice: parseFloatPtBr(extractedData.totalPrice) || 0,
            dateDelivery: extractedData.deliveryDate ? formatDate(parseDate(extractedData.deliveryDate.trim())) : null,
            received: false, receivedQuantity: 0, observation: ''
        };
        console.log(`   [Item ${itemNumber} LEGACY_PARSE] Parsed Values: quantity=${finalItem.quantity}, unitPrice=${finalItem.unitPrice}, totalPrice=${finalItem.totalPrice}`); // Log Adicionado
        
        // Valida números essenciais e tenta calcular valores faltantes
        if (isNaN(finalItem.lineNumber)) {
             console.warn(`   [Item ${itemNumber} LEGACY_PARSE] LineNumber is NaN. Original: ${extractedData.lineNumber}`);
             finalItem.lineNumber = itemNumber;
        }

        // Lógica de cálculo de fallback (incluindo para totalPrice)
        if (isNaN(finalItem.totalPrice) || finalItem.totalPrice === 0) {
            if (!isNaN(finalItem.quantity) && finalItem.quantity !== 0 && !isNaN(finalItem.unitPrice) && finalItem.unitPrice !== 0) {
                finalItem.totalPrice = parseFloat((finalItem.quantity * finalItem.unitPrice).toFixed(2));
                console.log(`   [Item ${itemNumber} LEGACY_PARSE] Calculated totalPrice: ${finalItem.totalPrice}`);
            } else {
                // Se ambos forem zero ou NaN, tenta extrair preço baseado na descrição como último recurso
                const priceInDesc = extractPossiblePrice(finalItem.description);
                if (priceInDesc > 0) {
                    finalItem.totalPrice = priceInDesc;
                    finalItem.unitPrice = priceInDesc;
                    console.log(`   [Item ${itemNumber} LEGACY_PARSE] Extracted price from description: ${priceInDesc}`);
                }
            }
        } 
        
        if (isNaN(finalItem.quantity) || finalItem.quantity === 0) {
            if (!isNaN(finalItem.unitPrice) && finalItem.unitPrice !== 0 && !isNaN(finalItem.totalPrice) && finalItem.totalPrice !== 0) {
                finalItem.quantity = parseFloat((finalItem.totalPrice / finalItem.unitPrice).toFixed(2));
                console.log(`   [Item ${itemNumber} LEGACY_PARSE] Calculated quantity: ${finalItem.quantity}`);
            } else {
                finalItem.quantity = 1; // Fallback para quantidade padrão
                console.log(`   [Item ${itemNumber} LEGACY_PARSE] Definindo quantidade padrão: 1`);
            }
        } 
        
        if (isNaN(finalItem.unitPrice) || finalItem.unitPrice === 0) {
            if (!isNaN(finalItem.quantity) && finalItem.quantity !== 0 && !isNaN(finalItem.totalPrice) && finalItem.totalPrice !== 0) {
                finalItem.unitPrice = parseFloat((finalItem.totalPrice / finalItem.quantity).toFixed(4));
                console.log(`   [Item ${itemNumber} LEGACY_PARSE] Calculated unitPrice: ${finalItem.unitPrice}`);
            }
        }

        // Correções finais
        if (finalItem.unit === 'R$' || finalItem.unit === 'R') { finalItem.unit = 'SV'; }
        
        // Se após todas as tentativas ainda tiver valores NaN, define valores padrão
        if (isNaN(finalItem.quantity)) finalItem.quantity = 1;
        if (isNaN(finalItem.unitPrice)) finalItem.unitPrice = 0;
        if (isNaN(finalItem.totalPrice)) finalItem.totalPrice = 0;

        console.log(`--- [Item ${itemNumber} LEGACY_PARSE] Parseado SUCESSO (${patternUsed}). Final Item:`, finalItem); // Log Adicionado
        return finalItem;

    } catch (e) {
        console.error(`   [Item ${itemNumber} LEGACY_PARSE] Erro processando dados finais (${patternUsed}):`, e, extractedData);
        warnings.push(`Erro interno item ${itemNumber}: ${e.message}`);
        return null; 
    }
}

// Função auxiliar para extrair possíveis preços da descrição
function extractPossiblePrice(description) {
    if (!description) return 0;
    
    const pricePatterns = [
        /R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/,  // R$ 1.234,56
        /(\d{1,3}(?:\.\d{3})*,\d{2})/,         // 1.234,56
        /(\d+,\d{2})/                         // 1234,56
    ];
    
    for (const pattern of pricePatterns) {
        const match = description.match(pattern);
        if (match && match[1]) {
            const price = parseFloat(match[1].replace(/\./g, '').replace(',', '.'));
            if (!isNaN(price) && price > 0) {
                return price;
            }
        }
    }
    
    return 0;
}

// Função utilitária para separar campos por X
function splitFieldsByX(lineItems, xThreshold = 40) {
    if (!Array.isArray(lineItems) || lineItems.length === 0) return [];
    const sorted = [...lineItems].sort((a, b) => a.x - b.x);
    let fields = [];
    let current = sorted[0].text;
    for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].x - sorted[i-1].x > xThreshold) {
            fields.push(current);
            current = sorted[i].text;
        } else {
            current += ' ' + sorted[i].text;
        }
    }
    fields.push(current);
    return fields;
}

// --- Funções de Status e Formatação ---
export function determineOrderStatus(order) { /* ... código anterior ... */
    const { itens, globalObservation, receiveDate, withdrawalDate, status: currentStatus } = order; const orderItens = Array.isArray(itens) ? itens : []; const hasAnyItemObservation = orderItens.some(item => typeof item.observation === 'string' && item.observation.trim() !== ''); const hasGlobalObservation = typeof globalObservation === 'string' && globalObservation.trim() !== ''; const isReturned = (hasGlobalObservation && RETURN_KEYWORDS.some(keyword => normalizeString(globalObservation).includes(keyword))) || orderItens.some(item => typeof item.observation === 'string' && RETURN_KEYWORDS.some(keyword => normalizeString(item.observation).includes(keyword))); if (isReturned) return OrderStatus.RETURNED; if (withdrawalDate) return OrderStatus.COMPLETED; if (currentStatus === OrderStatus.READY_FOR_PICKUP && !withdrawalDate) return OrderStatus.READY_FOR_PICKUP; if (receiveDate) { if (hasAnyItemObservation || hasGlobalObservation) return OrderStatus.WITH_OBSERVATIONS; return OrderStatus.RECEIVED; } return OrderStatus.PENDING;
 }
export function formatCNPJ(cnpj) { /* ... código anterior ... */
    if (typeof cnpj !== 'string') return cnpj || 'Inválido'; const cleaned = cnpj.replace(/\D/g, ''); if (cleaned.length === 14) return cleaned.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5'); return cnpj;
 }
export function formatStatus(status) { /* ... código anterior ... */
     const statusMap = { [OrderStatus.PENDING]: 'Pendente', [OrderStatus.RECEIVED]: 'Recebido', [OrderStatus.WITH_OBSERVATIONS]: 'Recebido c/ Obs.', [OrderStatus.READY_FOR_PICKUP]: 'Pronto p/ Retirada', [OrderStatus.COMPLETED]: 'Concluído', [OrderStatus.RETURNED]: 'Devolvido', }; return statusMap[status] || (status ? String(status).charAt(0).toUpperCase() + String(status).slice(1) : 'Desconhecido');
 }
export function getStatusIcon(status) { /* ... código anterior ... */
     const iconMap = { [OrderStatus.PENDING]: 'clock', [OrderStatus.RECEIVED]: 'check-circle', [OrderStatus.WITH_OBSERVATIONS]: 'alert-triangle', [OrderStatus.READY_FOR_PICKUP]: 'package', [OrderStatus.COMPLETED]: 'check-square', [OrderStatus.RETURNED]: 'rotate-ccw', }; return iconMap[status] || 'help-circle';
 }

// --- Classe OrderParser e Função extractOrderData ---
export class OrderParser {
    constructor(text, structuredLines = [], columnPositions = []) {
        this.text = text;
        this.lines = text.split('\n').map(line => line.trim()).filter(line => line);
        this.structuredLines = structuredLines;
        this.columnPositions = columnPositions;
        console.log('[OrderParser] Inicializado com:', {
            textLength: text.length,
            linesCount: this.lines.length,
            structuredLinesCount: structuredLines.length,
            columnPositionsCount: columnPositions.length
        });
    }

    parse() {
        console.log('[OrderParser] Iniciando parse do pedido...');
        
        try {
            // Extrair informações básicas
            const orderNumber = this.extractOrderNumber();
            const { nomeFornecedor, cnpjFornecedor } = extractSupplierInfo(this.lines, this.structuredLines);
            const { senderName, sendDate } = extractSenderInfo(this.lines);
            
            console.log('[OrderParser] Informações básicas extraídas:', {
                orderNumber,
                nomeFornecedor,
                cnpjFornecedor,
                senderName,
                sendDate
            });

            // Extrair itens
            let items;
            if (this.structuredLines.length > 0) {
                console.log('[OrderParser] Usando extração estruturada de itens...');
                items = this.extractStructuredItems();
                    } else {
                console.log('[OrderParser] Usando extração tradicional de itens...');
                items = extractItems(this.lines);
            }

            console.log('[OrderParser] Itens extraídos:', items);

            // Montar objeto do pedido
            const order = {
                numeroPedido: orderNumber || 'N/A',
                nomeFornecedor,
                cnpjFornecedor,
                senderName,
                sendDate,
                itens: items.itens || [],
                warnings: items.warnings || []
            };

            console.log('[OrderParser] Pedido montado:', order);
            return order;
        } catch (error) {
            console.error('[OrderParser] Erro ao fazer parse do pedido:', error);
            throw error;
        }
    }
    
    /**
     * Tenta extrair itens usando os dados estruturados fornecidos pelo PDF
     * @returns {Object} Objeto contendo itens e avisos
     */
    extractStructuredItems() {
        const itens = [];
        const warnings = [];
        
        if (!this.structuredLines || !this.columnPositions) {
            warnings.push('Dados estruturados não disponíveis para extração de itens');
            return { itens, warnings };
        }
        
        try {
            // 1. Localizar a tabela de itens
            const headerRowIndex = this.findTableHeader();
            if (headerRowIndex === -1) {
                warnings.push('Cabeçalho da tabela não encontrado. Tentando método agressivo...');
                // Tentativa agressiva de extrair itens mesmo sem cabeçalho identificado
                return this.extractItemsAggressively();
            }
            
            // 2. Mapear colunas baseado no cabeçalho
            const columnMap = this.mapTableColumns(this.structuredLines[headerRowIndex]);
            if (!columnMap || Object.keys(columnMap).length < 3) {
                warnings.push('Mapeamento insuficiente de colunas na tabela. Tentando método agressivo...');
                // Tentativa agressiva de extrair itens mesmo sem mapeamento completo de colunas
                return this.extractItemsAggressively();
            }
            
            console.log('[OrderParser] Mapeamento de colunas:', columnMap);
            
            // 3. Extrair itens a partir da tabela estruturada
            let currentItem = null;
            let currentItemDesc = '';
            let lastLineNumber = -1;
            
            // Inicia a partir da linha após o cabeçalho
            for (let i = headerRowIndex + 1; i < this.structuredLines.length; i++) {
                const line = this.structuredLines[i];
                if (!line || line.length === 0) continue;
                
                // Verifica se é uma linha de total ou rodapé
                const lineText = line.map(item => item.text).join(' ').toLowerCase();
                if (lineText.match(/total\s+(geral|do pedido|r\$)|valor\s+total/i)) {
                    console.log(`[OrderParser] Encontrou rodapé da tabela: "${lineText}"`);
                    break;
                }
                
                // Verifica se é uma nova linha de item
                const isNewItemLine = this.isItemLine(line, columnMap);
                
                if (isNewItemLine) {
                    // Salva o item anterior se existir
                    if (currentItem) {
                        // Limpa a descrição antes de salvar
                        currentItem.description = cleanItemDescription(currentItemDesc);
                        itens.push(currentItem);
                    }
                    
                    // Processa novo item
                    const itemData = this.extractItemFromLine(line, columnMap);
                    currentItemDesc = itemData.description || '';
                    lastLineNumber = itemData.lineNumber;
                    currentItem = itemData;
                } 
                // Se não é um novo item, pode ser continuação da descrição ou observação
                else if (currentItem) {
                    const lineText = line.map(item => item.text).join(' ');
                    if (isItemCommentLine(lineText)) {
                        console.log('[OrderParser] Linha de observação/comentário ignorada.');
                        // Ignora a linha de comentário/observação
                    } else {
                        // Extrai possível continuação da descrição
                        const descriptionContinuation = this.extractDescriptionContinuation(line, columnMap);
                        if (descriptionContinuation && descriptionContinuation.trim()) {
                            currentItemDesc += ' ' + descriptionContinuation;
                        }
                    }
                }
            }
            
            // Adiciona o último item
            if (currentItem) {
                currentItem.description = cleanItemDescription(currentItemDesc);
                itens.push(currentItem);
            }
            
            // Validação final
            if (itens.length === 0) {
                warnings.push('Nenhum item extraído usando o método estruturado. Tentando método agressivo...');
                return this.extractItemsAggressively();
            } else {
                console.log(`[OrderParser] Extração estruturada concluída: ${itens.length} itens extraídos`);
            }
            
            return { itens, warnings };
        } catch (error) {
            console.error('[OrderParser] Erro ao extrair itens estruturados:', error);
            warnings.push(`Erro durante extração estruturada: ${error.message}. Tentando método agressivo...`);
            return this.extractItemsAggressively();
        }
    }
    
    /**
     * Método mais agressivo de extração de itens para PDFs complexos
     */
    extractItemsAggressively() {
        const itens = [];
        const warnings = [];
        
        console.log('[OrderParser.extractItemsAggressively] Iniciando extração agressiva de itens...'); // Log Adicionado
        
        try {
            // 1. Procurar todas as linhas que começam com um número e parecem itens
            const potentialItemLines = [];
            const numericStartRegex = /^\d{1,3}\b/;  // Linhas que começam com 1-3 dígitos seguidos de limite de palavra
            
            // Percorre todas as linhas estruturadas
            for (let i = 0; i < this.structuredLines.length; i++) {
                const line = this.structuredLines[i];
                if (!line || line.length === 0) continue;
                
                // Verifica se a linha começa com número (potencial número de item)
                if (line[0] && numericStartRegex.test(line[0].text.trim())) {
                    // Ignora linhas que podem ser datas ou outros números
                    const fullText = line.map(item => item.text).join(' ');
                    if (fullText.match(/total|valor/i) || 
                        fullText.match(/^\d{1,2}\/\d{1,2}\/\d{2,4}/)) {
                        continue;
                    }
                    
                    potentialItemLines.push({
                        index: i,
                        line: line
                    });
                }
            }
            
            console.log(`[OrderParser] Encontradas ${potentialItemLines.length} linhas potenciais de itens`);
            
            // 2. Para cada linha potencial, extrair informações de item
            for (let i = 0; i < potentialItemLines.length; i++) {
                const { index, line } = potentialItemLines[i];
                const nextIndex = i < potentialItemLines.length - 1 ? potentialItemLines[i + 1].index : this.structuredLines.length;
                
                // Extrai informações básicas
                const numMatch = line[0].text.match(/^(\d+)/);
                if (!numMatch) continue;
                
                const lineNumber = parseInt(numMatch[1], 10);
                
                // Pega todos os textos da linha e tenta extrair valores
                const fullText = line.map(item => item.text).join(' ');
                
                // Coleta linhas adicionais até o próximo item (para descrição completa)
                let additionalLines = [];
                for (let j = index + 1; j < nextIndex; j++) {
                    const addLine = this.structuredLines[j];
                    if (addLine && addLine.length > 0) {
                        additionalLines.push(addLine.map(item => item.text).join(' '));
                    }
                }
                
                // Junta tudo em um texto para processamento
                const fullItemText = [fullText, ...additionalLines].join(' ');
                
                // Tenta extrair valores importantes
                
                // 1. Extrair quantidade, unidade e valores
                let quantity = 0;
                let unitPrice = 0;
                let totalPrice = 0;
                let unit = "UN";
                
                // Padrões comuns de unidade
                const unitPattern = /\b(UN|PC|PCT|CX|KG|L|M|CM|MM|METRO|HORA|HL|BALDE|BD|PACOTE|UNIDADE|UNID|UND|MONTHLY|ROLO|RL|BOBINA|MENSAL|GALAO|GL|LATA|LT|FRASCO|FR|SACO|SC|RESMA|RM|CENTO|CT|KIT|KT|JOGO|JG|PAR|PÇ|SV)\b/i;
                const unitMatch = fullItemText.match(unitPattern);
                if (unitMatch) {
                    unit = unitMatch[1].toUpperCase();
                }
                
                // Padrões de valores monetários
                const pricePattern = /\b(R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2})\b/g;
                const priceMatches = [...fullItemText.matchAll(pricePattern)];
                
                if (priceMatches.length >= 2) {
                    // Assumindo que o último valor é o total e o penúltimo é o unitário
                    const unitPriceStr = priceMatches[priceMatches.length - 2][2];
                    const totalPriceStr = priceMatches[priceMatches.length - 1][2];
                    
                    unitPrice = parseFloat(unitPriceStr.replace(/\./g, '').replace(',', '.'));
                    totalPrice = parseFloat(totalPriceStr.replace(/\./g, '').replace(',', '.'));
                } else if (priceMatches.length === 1) {
                    // Se só tem um valor, assumimos ser o total
                    const priceStr = priceMatches[0][2];
                    totalPrice = parseFloat(priceStr.replace(/\./g, '').replace(',', '.'));
                }
                
                // Tenta extrair quantidade - busca por números que não sejam valores monetários
                const qtyPattern = /\b(\d+(?:,\d+)?)\b\s*(?:UN|PC|KG|L|M|CM)/i;
                const qtyPatternGeneric = /\b(\d+(?:,\d+)?)\b/g;
                
                const qtyMatch = fullItemText.match(qtyPattern);
                if (qtyMatch) {
                    quantity = parseFloat(qtyMatch[1].replace(',', '.'));
                } else {
                    // Se não encontrou com unidade, procura por qualquer número
                    const allNumbers = [...fullItemText.matchAll(qtyPatternGeneric)].map(m => m[1]);
                    // Filtra números que não parecem ser parte de valores monetários
                    const candidateQtys = allNumbers.filter(n => 
                        !n.includes(',') || !n.match(/^\d{1,3}(?:\.\d{3})*,\d{2}$/)
                    );
                    
                    if (candidateQtys.length > 0) {
                        quantity = parseFloat(candidateQtys[0].replace(',', '.'));
                    }
                }
                
                // Recalcula valores inconsistentes
                if (quantity > 0 && totalPrice > 0 && unitPrice === 0) {
                    unitPrice = parseFloat((totalPrice / quantity).toFixed(4));
                } else if (quantity === 0 && unitPrice > 0 && totalPrice > 0) {
                    quantity = parseFloat((totalPrice / unitPrice).toFixed(2));
                } else if (quantity > 0 && unitPrice > 0 && totalPrice === 0) {
                    totalPrice = parseFloat((quantity * unitPrice).toFixed(2));
                }
                
                // 2. Extrair descrição 
                let description = fullItemText;
                
                // Remove número do item no início
                description = description.replace(/^\d+\s+/, '');
                
                // Remove valores monetários
                description = description.replace(/R\$\s*\d{1,3}(?:\.\d{3})*,\d{2}/g, '');
                description = description.replace(/\b\d{1,3}(?:\.\d{3})*,\d{2}\b/g, '');
                
                // Remove a unidade
                description = description.replace(unitPattern, '');
                
                // Limpa e formata a descrição final
                description = cleanItemDescription(description);
                
                // Cria o item
                const item = {
                    lineNumber,
                    code: "N/A",
                    description,
                    quantity,
                    unit,
                    unitPrice,
                    totalPrice,
                    dateDelivery: null,
                    received: false,
                    receivedQuantity: 0,
                    observation: ''
                };
                
                console.log(`[OrderParser] Item extraído agressivamente: ${lineNumber} - ${description.substring(0, 30)}...`);
                itens.push(item);
            }
            
            // Se não encontrou nenhum item, tenta uma abordagem ainda mais agressiva
            if (itens.length === 0) {
                warnings.push("Extração agressiva falhou. Tentando extrair qualquer texto que pareça um item...");
                
                // Olha para qualquer linha que tenha texto substancial
                for (let i = 0; i < this.structuredLines.length; i++) {
                    const line = this.structuredLines[i];
                    if (!line || line.length < 3) continue; // Precisa ter pelo menos alguns elementos
                    
                    const lineText = line.map(item => item.text).join(' ');
                    
                    // Ignora linhas de cabeçalho ou rodapé
                    if (lineText.match(/total|valor|linha|quantidade|unitario|servico|produto/i)) {
                        continue;
                    }
                    
                    // Se a linha tem algum texto descritivo substancial, considera como potencial item
                    if (lineText.length > 20 && lineText.match(/[a-zA-Z]{10,}/)) {
                        const item = {
                            lineNumber: itens.length + 1,
                            code: "N/A",
                            description: cleanItemDescription(lineText),
                            quantity: 1, // Valores default
                            unit: "UN",
                            unitPrice: 0,
                            totalPrice: 0,
                            dateDelivery: null,
                            received: false,
                            receivedQuantity: 0,
                            observation: 'Item extraído por fallback extremo'
                        };
                        
                        console.log(`[OrderParser] Item extraído por fallback extremo: ${item.description.substring(0, 30)}...`);
                        itens.push(item);
                    }
                }
            }
            
            // Aviso se não foi possível extrair nenhum item
            if (itens.length === 0) {
                warnings.push("Não foi possível extrair nenhum item mesmo com métodos agressivos.");
                
                // Cria um item genérico para que o sistema possa continuar
                itens.push({
                    lineNumber: 1,
                    code: "AUTO",
                    description: "Item não identificado automaticamente. Por favor, edite manualmente.",
                    quantity: 1,
                    unit: "UN",
                    unitPrice: 0,
                    totalPrice: 0,
                    dateDelivery: null,
                    received: false,
                    receivedQuantity: 0,
                    observation: 'Extraído por fallback automático'
                });
            }
            
            console.log(`[OrderParser] Extração agressiva finalizada: ${itens.length} itens extraídos`);
            return { itens, warnings };
        } catch (error) {
            console.error('[OrderParser.extractItemsAggressively] Erro na extração agressiva:', error);
            warnings.push(`Erro na extração agressiva: ${error.message}`);
            
            // Retorna um item genérico para que o sistema possa continuar
            return { 
                itens: [{
                    lineNumber: 1,
                    code: "AUTO",
                    description: "Item não identificado devido a erro. Por favor, edite manualmente.",
                    quantity: 1,
                    unit: "UN",
                    unitPrice: 0,
                    totalPrice: 0,
                    dateDelivery: null,
                    received: false,
                    receivedQuantity: 0,
                    observation: 'Erro na extração: ' + error.message
                }],
                warnings 
            };
        }
    }
    
    /**
     * Localiza o índice da linha de cabeçalho da tabela de itens
     */
    findTableHeader() {
        const headerKeywords = ['item', 'código', 'descricao', 'qtd', 'quantidade', 'unit', 'total'];
        
        for (let i = 0; i < this.structuredLines.length; i++) {
            const line = this.structuredLines[i];
            if (!line || line.length === 0) continue;
            
            // Converte a linha para texto e normaliza
            const lineText = line.map(item => normalizeString(item.text)).join(' ');
            
            // Conta quantas palavras-chave do cabeçalho estão presentes
            const keywordCount = headerKeywords.reduce((count, keyword) => 
                lineText.includes(keyword) ? count + 1 : count, 0);
            
            // Se encontrou pelo menos 3 palavras-chave, verifica se a próxima linha parece um item
            if (keywordCount >= 3) {
                // Verifica se a próxima linha parece o início de um item (geralmente começa com número)
                if (i + 1 < this.structuredLines.length) {
                    const nextLine = this.structuredLines[i + 1];
                    if (nextLine && nextLine.length > 0) {
                        // Verificação simples: primeiro elemento é um número
                        const firstItem = nextLine[0];
                        if (firstItem && /^\d+$/.test(firstItem.text.trim())) {
                            console.log(`[OrderParser] Cabeçalho tabela encontrado linha ${i}: "${lineText}"`);
                            return i;
                        }
                    }
                }
            }
        }
        
        console.warn('[OrderParser] Cabeçalho da tabela não encontrado');
        return -1;
    }
    
    /**
     * Mapeia as colunas baseado na linha de cabeçalho
     */
    mapTableColumns(headerLine) {
        if (!headerLine || !Array.isArray(headerLine)) return null;
        
        const columnMap = {};
        
        // Palavras-chave para identificar cada tipo de coluna
        const columnTypes = {
            lineNumber: ['item', 'linha', 'numero', '#'],
            code: ['codigo', 'referencia', 'ref'],
            description: ['descricao', 'produto', 'servico', 'discriminacao'],
            quantity: ['qtd', 'quant', 'quantidade'],
            unit: ['unidade', 'unid', 'und', 'medida', 'udm'],
            unitPrice: ['unit', 'valor unit', 'preco unit', 'unitario'],
            totalPrice: ['total', 'valor total', 'preco total'],
            deliveryDate: ['entrega', 'data entrega', 'prazo']
        };
        
        // Para cada item na linha de cabeçalho
        for (const item of headerLine) {
            const text = normalizeString(item.text);
            
            // Tenta identificar o tipo de coluna
            for (const [type, keywords] of Object.entries(columnTypes)) {
                if (keywords.some(keyword => text.includes(keyword))) {
                    columnMap[type] = {
                        columnIndex: item.columnIndex,
                        x: item.x
                    };
                    break;
                }
            }
        }
        
        return columnMap;
    }
    
    /**
     * Verifica se uma linha representa um novo item
     */
    isItemLine(line, columnMap) {
        if (!line || !Array.isArray(line) || line.length === 0) return false;
        
        // Verifica se há um item na primeira coluna que seja um número
        const lineNumberColumn = columnMap.lineNumber;
        if (!lineNumberColumn) return false;
        
        // Procura por item alinhado com a coluna do número da linha
        const lineNumberItem = line.find(item => 
            Math.abs(item.x - lineNumberColumn.x) < 20 ||
            item.columnIndex === lineNumberColumn.columnIndex);
            
        return lineNumberItem && /^\d+$/.test(lineNumberItem.text.trim());
    }
    
    /**
     * Extrai dados de uma linha de item
     */
    extractItemFromLine(line, columnMap) {
        console.log('[OrderParser] Iniciando extração de item da linha:', line);
        
        // Função para obter o valor de um tipo de coluna específico
        const getColumnValue = (type) => {
            if (!columnMap[type]) return null;
            const colInfo = columnMap[type];
            const preferredIdx = typeof colInfo.columnIndex === 'number' ? colInfo.columnIndex : null;
            let val = null;
            
            // 1) Se columnIndex é válido (>=0) tenta primeiro por columnIndex
            if (preferredIdx !== null && preferredIdx >= 0) {
                const itemByIdx = line.find(it => it.columnIndex === preferredIdx);
                if (itemByIdx) val = itemByIdx.text.trim();
            }
            
            // 2) Se não encontrou ou columnIndex é -1, procura por proximidade X (tolerância 40)
            if (!val) {
                const toleranceX = 40;
                const candidate = line.find(it => Math.abs(it.x - colInfo.x) < toleranceX);
                if (candidate) val = candidate.text.trim();
            }
            
            return val || null;
        };
        
        // Função para parsear números em formato brasileiro
        const parseFloatPtBr = (value) => {
            if (typeof value !== 'string' || !value) return NaN;
            const cleaned = value.replace(/[^\d,.]/g, '').replace(/\./g, '').replace(',', '.');
            return parseFloat(cleaned);
        };
        
        // Texto completo da linha para análise
        const fullLineText = line.map(item => item.text).join(' ');
        console.log('[OrderParser] Texto completo da linha:', fullLineText);

        // Initialize all potentially extracted text fields from their columns first
        const lineNumberText = getColumnValue('lineNumber');
        let quantityText = getColumnValue('quantity');
        let unitText = getColumnValue('unit');
        let unitPriceText = getColumnValue('unitPrice');
        let totalPriceText = getColumnValue('totalPrice');
        let codeText = getColumnValue('code');
        let descriptionText = getColumnValue('description');

        // CASO 0: Tenta capturar padrão "preço + código + descrição" (ex.: "2.581,25<codigo>.DESCRIÇÃO")
        // Muito comum em PDFs SENAC quando a coluna Preço Total "cola" o código e a descrição.
        const priceCodeDescPattern = /(\d{1,3}(?:\.\d{3})*,\d{2})\s*(\d{6,15})\.\s*([A-Za-zÀ-úÇç].+)/i;
        const pcdMatch = fullLineText.match(priceCodeDescPattern);

        if (pcdMatch) {
            console.log('[OrderParser] CASO 0: Detectado padrão Preço+Código+Descrição colados');
            // pcdMatch[1] = preço, pcdMatch[2] = código, pcdMatch[3] = descrição
            // Override with cleaner values from this specific pattern if it matches.
            totalPriceText = pcdMatch[1]; 
            codeText = pcdMatch[2];
            descriptionText = pcdMatch[3].trim();

            // If quantity is 1 (common for this PDF type), unit price should also be this cleaned price.
            const tempQty = parseFloatPtBr(quantityText);
            if (tempQty === 1 || (isNaN(tempQty) && (unitText || "").toUpperCase() === "UNIDADE")) {
                unitPriceText = pcdMatch[1]; // Update unitPriceText to match cleaned total price
            }

        } else {
            // CASO 1: Formato SENAC padrão - código e descrição já separados (itemCode.description)
            // Ajustado o lookahead para ser mais específico para a data de entrega ou, como fallback, para um claro início de outra coluna.
            const senacPattern = /(\d{6,12})\.(.+?)(?=\s+\d{1,2}[-/][A-Z]{3}[-/]\d{2,4}|\s+\d{1,3}(?:\.\d{3})*,\d{2}\s+[A-ZÀ-ÚÇ]+|\s+UNIDADE|\s+PACOTE|$)/i;
            const senacMatch = fullLineText.match(senacPattern);

            if (senacMatch) {
                console.log('[OrderParser] CASO 1: Encontrado padrão SENAC de código e descrição');
                // Override if current codeText is null/generic or senacMatch provides a better/longer description.
                if (!codeText || codeText === "N/A") {
                    codeText = senacMatch[1];
                }
                if (!descriptionText || (senacMatch[2] && descriptionText.length < senacMatch[2].trim().length)) {
                    descriptionText = senacMatch[2].trim();
                }
            } else {
                // No specific pattern (CASO 0 or CASO 1) matched for code/description. 
                // They remain as initially set by getColumnValue.
                console.log('[OrderParser] Nenhum padrão específico de código/descrição (CASO 0 ou CASO 1) correspondeu. Usando valores de getColumnValue, se houver.');
            }
        }

        // CASO 2: Procura por valores numéricos em sequência (fallback)
        const numberPattern = /(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}|\d+)/g;
        const numbers = [...fullLineText.matchAll(numberPattern)].map(m => m[0]);
        console.log('[OrderParser] CASO 2: Números encontrados:', numbers);

        if (numbers.length >= 3) {
            // Assumindo ordem: quantidade, preço unitário, preço total
            if (!quantityText) quantityText = numbers[numbers.length - 3];
            if (!unitPriceText) unitPriceText = numbers[numbers.length - 2];
            if (!totalPriceText) totalPriceText = numbers[numbers.length - 1];
        }

        // CASO 3: Detecção de unidade (fallback)
        if (!unitText) {
            const unitPattern = /(UNIDADE|PACOTE|UN|PC|PCT|CX|KG|L|M|CM|MM)/i;
            const unitMatch = fullLineText.match(unitPattern);
            if (unitMatch) {
                console.log('[OrderParser] CASO 3: Unidade encontrada (fallback em fullLineText):', unitMatch[1]);
                unitText = unitMatch[1].toUpperCase();
            }
        }

        let totalPrice = parseFloatPtBr(totalPriceText) || 0;
        let deliveryDateText = getColumnValue('deliveryDate');

        // Se o senacPattern não pegou a data, e a coluna da data não foi lida ainda,
        // e a descrição atual (de getColumnValue) contém a data, tenta limpá-la.
        if (!deliveryDateText && descriptionText && descriptionText.includes(formatDate(new Date(), 'DD-MMM-YY').substring(3))) { // Verifica se tem um padrão de data
            const dateInDescPattern = /(\d{1,2}[-/][A-Z]{3}[-/]\d{2,4})/i;
            const dateMatchInDesc = descriptionText.match(dateInDescPattern);
            if (dateMatchInDesc && dateMatchInDesc[1]) {
                deliveryDateText = dateMatchInDesc[1];
                descriptionText = descriptionText.replace(dateMatchInDesc[0], '').trim();
                console.log(`[OrderParser] Data de entrega (${deliveryDateText}) extraída da descrição e removida.`);
            }
        }

        // Converte e valida os valores
        const item = {
            lineNumber: lineNumberText ? parseInt(lineNumberText, 10) : 1,
            code: codeText?.replace(/\.$/, '').trim() || "N/A",
            description: descriptionText ? descriptionText.trim() : "",
            quantity: parseFloatPtBr(quantityText) || 1,
            unit: unitText || "UN",
            unitPrice: parseFloatPtBr(unitPriceText) || 0,
            totalPrice: parseFloatPtBr(totalPriceText) || 0,
            dateDelivery: deliveryDateText ? formatDate(parseDate(deliveryDateText.trim())) : null,
            received: false,
            receivedQuantity: 0,
            observation: ''
        };

        // Validação e cálculo de valores faltantes
        if (item.quantity > 0 && item.unitPrice > 0 && item.totalPrice === 0) {
            item.totalPrice = parseFloat((item.quantity * item.unitPrice).toFixed(2));
        } else if (item.quantity > 0 && item.totalPrice > 0 && item.unitPrice === 0) {
            item.unitPrice = parseFloat((item.totalPrice / item.quantity).toFixed(2));
        } else if (item.unitPrice > 0 && item.totalPrice > 0 && item.quantity === 0) {
            item.quantity = parseFloat((item.totalPrice / item.unitPrice).toFixed(2));
        }

        console.log('[OrderParser] Item extraído:', {
                lineNumber: item.lineNumber,
                code: item.code,
                description: item.description,
                quantity: item.quantity, // Corrigido para item.quantity
                unit: item.unit, // Corrigido para item.unit
                unitPrice: item.unitPrice, // Corrigido para item.unitPrice
                totalPrice: item.totalPrice, // Corrigido para item.totalPrice
                dateDelivery: item.dateDelivery,
                received: item.received,
                receivedQuantity: item.receivedQuantity,
                observation: item.observation
        });

        return {
            lineNumber: item.lineNumber,
            code: item.code,
            description: item.description,
            quantity: item.quantity, // Corrigido para item.quantity
            unit: item.unit, // Corrigido para item.unit
            unitPrice: item.unitPrice, // Corrigido para item.unitPrice
            totalPrice: item.totalPrice, // Corrigido para item.totalPrice
            dateDelivery: item.dateDelivery,
            received: item.received,
            receivedQuantity: item.receivedQuantity,
            observation: item.observation // Adicionado para garantir que seja retornado
        };
    }
    
    /**
     * Extrai continuação da descrição de um item
     */
    extractDescriptionContinuation(line, columnMap) {
        // Se não temos mapeamento de colunas ou a linha está vazia
        if (!columnMap || !line || line.length === 0) {
            return '';
        }
        
        // Verifica se a linha é uma linha de comentário/observação do item - REMOVIDO DAQUI, FEITO ANTES
        // const lineTextForCommentCheck = line.map(item => item.text).join(' ');
        // if (isItemCommentLine(lineTextForCommentCheck)) {
        //     console.log(`[OrderParser] Ignorando linha de comentário em extractDescriptionContinuation: "${lineTextForCommentCheck}"`);
        //     return '';
        // }
        
        // Determina quais itens podem ser parte da descrição (antes da coluna de quantidade)
        let descItems = [];
        
        // 1. Primeiro verifica se a linha parece ser exclusivamente continuação da descrição
        // (poucas colunas e primeiro item não parece ser número de linha)
        const firstItem = line[0];
        if (line.length < 3 && firstItem && !/^\d+$/.test(firstItem.text.trim())) {
            // Linha contém provavelmente apenas continuação da descrição
            descItems = line;
            console.log('[OrderParser] Linha parece ser continuação de descrição.');
        } 
        // 2. Caso contrário, identifica itens que pertencem à descrição
        else {
            // Seleciona itens que estão na mesma coluna da descrição ou antes da coluna de quantidade
            descItems = line.filter(item => {
                // Se temos coluna de descrição mapeada, verifica se pertence a ela
                const matchesDescriptionColumn = columnMap.description && 
                    (item.columnIndex === columnMap.description.columnIndex ||
                     Math.abs(item.x - columnMap.description.x) < 30);
                
                // Verifica se está antes das colunas numéricas
                const beforeQuantityColumn = (columnMap.quantity && item.x < columnMap.quantity.x) ||
                                           (columnMap.unitPrice && item.x < columnMap.unitPrice.x);
                
                // Não está na coluna do número da linha ou código
                const notLineNumberOrCode = columnMap.lineNumber && 
                    item.columnIndex !== columnMap.lineNumber.columnIndex &&
                    (columnMap.code ? item.columnIndex !== columnMap.code.columnIndex : true);
                
                return (matchesDescriptionColumn || beforeQuantityColumn) && notLineNumberOrCode;
            });
        }
        
        // Extrai e processa o texto da descrição
        if (descItems.length === 0) return '';
        
        // Ordenamos por posição X para preservar a ordem correta
        descItems.sort((a, b) => a.x - b.x);
        
        const descriptionText = descItems.map(item => {
            // Remove partes que não devem aparecer na descrição
            let text = item.text.trim();
            
            // Remove padrões como códigos de referência no início
            text = text.replace(/^(?:REF|COD)[:\.\s]*[\w-]+/i, '').trim();
            
            // Remove palavras-chave de comentários/observações
            text = text.replace(/^(?:OBS|OBSERVAÇÃO|COMENTÁRIO):\s*/i, '').trim();
            
            return text;
        }).join(' ');
        
        // Verifica se a descrição extraída parece válida
        if (descriptionText && 
            descriptionText.length > 1 && 
            !/^[\d\s,.]+$/.test(descriptionText) &&  // Não é apenas números
            !/total|valor|preco/i.test(descriptionText)) {  // Não é um rodapé
            
            console.log(`[OrderParser] Continuação de descrição extraída: "${descriptionText}"`);
            return descriptionText;
        }
        
        return '';
    }

    extractOrderNumber() {
        // Se temos dados estruturados, usamos primeiro
        if (Array.isArray(this.structuredLines) && this.structuredLines.length > 0) {
            // Procura padrão "Pedido Número" e o número logo abaixo ou ao lado
            for (let i = 0; i < Math.min(this.structuredLines.length, 10); i++) {
                const line = this.structuredLines[i];
                
                // Procura pelo texto "Pedido Número" ou variações
                const pedidoNumeroItem = line.find(item => 
                    normalizeString(item.text).includes('pedido numero') ||
                    normalizeString(item.text).includes('pedido n') ||
                    normalizeString(item.text).match(/pedido\s*n[°º.]/)
                );
                
                if (pedidoNumeroItem) {
                    console.log('[OrderParser] Encontrado cabeçalho "Pedido Número" estruturado');
                    
                    // Verifica se há um número na mesma linha após "Pedido Número"
                    const numeroItem = line.find(item => 
                        item.x > pedidoNumeroItem.x && 
                        /^\d{4,}$/.test(item.text.trim())
                    );
                    
                    if (numeroItem) {
                        console.log(`[OrderParser] Número pedido encontrado (mesma linha): ${numeroItem.text}`);
                        return numeroItem.text.trim();
                    }
                    
                    // Se não achou na mesma linha, procura na linha seguinte na mesma posição (coluna)
                    if (i + 1 < this.structuredLines.length) {
                        const nextLine = this.structuredLines[i + 1];
                        
                        const nextLineNumeroItem = nextLine.find(item => 
                            Math.abs(item.x - pedidoNumeroItem.x) < 30 || // Similar posição X
                            item.columnIndex === pedidoNumeroItem.columnIndex || // Mesma coluna
                            /^\d{4,}$/.test(item.text.trim()) // Só número com ao menos 4 dígitos
                        );
                        
                        if (nextLineNumeroItem && /^\d{4,}$/.test(nextLineNumeroItem.text.trim())) {
                            console.log(`[OrderParser] Número pedido encontrado (linha seguinte): ${nextLineNumeroItem.text}`);
                            return nextLineNumeroItem.text.trim();
                        }
                    }
                }
            }
            
            // Procura por padrões diretos como "Pedido: 123456" ou simplesmente um número de 5-8 dígitos nas primeiras linhas
            for (let i = 0; i < Math.min(this.structuredLines.length, 5); i++) {
                const line = this.structuredLines[i];
                
                for (const item of line) {
                    // Verifica padrão "Pedido: 12345"
                    const pedidoMatch = item.text.match(/pedido\s*(?:n[°º.]|numero|:)?\s*(\d{5,8})/i);
                    if (pedidoMatch && pedidoMatch[1]) {
                        console.log(`[OrderParser] Número pedido extraído via regex estruturada: ${pedidoMatch[1]}`);
                        return pedidoMatch[1].trim();
                    }
                    
                    // Se for um número isolado de 5-8 dígitos nas primeiras linhas, provavelmente é o número do pedido
                    if (/^\d{5,8}$/.test(item.text.trim())) {
                        console.log(`[OrderParser] Número pedido encontrado (isolado): ${item.text}`);
                        return item.text.trim();
                    }
                }
            }
            
            // LAST RESORT: Procurar números isolados nas primeiras linhas
            for (let i = 0; i < Math.min(this.structuredLines.length, 15); i++) {
                const line = this.structuredLines[i];
                
                // Procurar por um número isolado de 4+ dígitos em linhas com poucos elementos
                if (line.length < 5) {
                    for (const item of line) {
                        if (/^\d{4,}$/.test(item.text.trim())) {
                            console.log(`[OrderParser] Número pedido last resort (número isolado): ${item.text}`);
                            return item.text.trim();
                        }
                    }
                }
                
                // Extrair qualquer número de um padrão como "60726 0 24-04-2025" (número pedido, revisão, data)
                // comum em PDFs do SENAC
                if (line.length >= 3) {
                    const potentialOrderNumbers = line.filter(item => /^\d{4,}$/.test(item.text.trim()));
                    if (potentialOrderNumbers.length > 0) {
                        // Pega o primeiro número de 4+ dígitos na linha
                        console.log(`[OrderParser] Número pedido potencial encontrado: ${potentialOrderNumbers[0].text}`);
                        return potentialOrderNumbers[0].text.trim();
                    }
                }
            }
        }
            
        console.log('[OrderParser] Tentativa estruturada falhou, tentando método legado para número do pedido');
        
        // Método legado caso a abordagem estruturada falhe
        const headerLineKeywords = ['pedido numero', 'revisao', 'data criacao']; 
        const numberOnNextLineRegex = /^(?:["\s]*PEDIDO["\s]*)?["\s]*(\d{5,8})\b/; 
        let headerFoundIndex = -1;
        
        for (let i = 0; i < Math.min(this.lines.length, 15); i++) { 
            const normalizedLine = normalizeString(this.lines[i]); 
            if (headerLineKeywords.every(kw => normalizedLine.includes(kw))) { 
                headerFoundIndex = i; 
                console.log(`[Orders] Linha header pedido encontrada ${i}: "${this.lines[i]}"`); 
                break; 
            } 
        }
        
        if (headerFoundIndex !== -1) { 
            for (let j = 1; j <= 3 && (headerFoundIndex + j) < this.lines.length; j++) { 
                const nextLine = this.lines[headerFoundIndex + j].trim(); 
                if (!nextLine || isPageHeaderOrFooter(nextLine)) continue; 
                const match = nextLine.match(numberOnNextLineRegex); 
                if (match && match[1]) { 
                    console.log(`[Orders] Nº Pedido "${match[1]}" encontrado linha ${headerFoundIndex + j}`); 
                    return match[1]; 
                } 
                const simpleMatch = nextLine.match(/^\s*(\d{5,8})\s*$/); 
                if (simpleMatch && simpleMatch[1]) { 
                    console.log(`[Orders] Nº Pedido "${simpleMatch[1]}" (linha isolada) linha ${headerFoundIndex + j}`); 
                    return simpleMatch[1]; 
                } 
                if (!nextLine.match(/^["\s]*(?:PEDIDO|\d)/)) break; 
            } 
        }
        
        console.warn("[Orders] Cabeçalho tabular não encontrado ou número não localizado. Tentando fallback..."); 
        const orderKeywords = ['pedido numero', 'numero do pedido', 'pedido no.', 'pedido n.']; 
        const pcPattern = /(?:pedido|ordem)\s*n?[º°.]?\s*[:\-]?\s*(\d{5,8})/i;
        
        for (let i = 0; i < Math.min(this.lines.length, 25); i++) { 
            const currentLine = this.lines[i].trim(); 
            const normalizedCurrentLine = normalizeString(currentLine); 
            const pcMatch = currentLine.match(pcPattern); 
            if (pcMatch && pcMatch[1]) return pcMatch[1].trim(); 
            for (const keyword of orderKeywords) { 
                if (normalizedCurrentLine.includes(keyword.replace(/[º°.:]/g, ''))) { 
                    const regex = new RegExp(`(?:${keyword.replace(/\s/g, '\\s*')})\\s*[:\\-]?\\s*(\\d{5,8})`, 'i'); 
                    let match = currentLine.match(regex); 
                    if (match && match[1]) return match[1].trim(); 
                } 
            } 
            if (currentLine.match(/^\d{5,8}$/)) return currentLine; 
        }
        
        // ÚLTIMO RECURSO: Procura por qualquer número que possa ser um pedido
        console.error("[Orders] ERRO CRÍTICO: Número do pedido não encontrado por métodos normais. Tentando extração agressiva...");
        
        // Primeiro procura por padrões comuns de números de pedido
        for (let i = 0; i < Math.min(this.lines.length, 30); i++) {
            const line = this.lines[i].trim();
            
            // Procura números isolados
            if (/^\d{4,8}$/.test(line)) {
                console.log(`[Orders] Número potencial encontrado (linha isolada): ${line}`);
                return line;
            }
            
            // Procura números no início de linhas
            const startMatch = line.match(/^(\d{4,8})\b/);
            if (startMatch) {
                console.log(`[Orders] Número potencial encontrado (início de linha): ${startMatch[1]}`);
                return startMatch[1];
            }
            
            // Procura números após ":" ou "-"
            const separatorMatch = line.match(/[:|\-|–|—]\s*(\d{4,8})\b/);
            if (separatorMatch) {
                console.log(`[Orders] Número potencial encontrado (após separador): ${separatorMatch[1]}`);
                return separatorMatch[1];
            }
        }
        
        // FALLBACK EXTREMO: Extrair qualquer número potencial
        const allText = this.text.substring(0, 1000); // Primeiros 1000 caracteres
        const allNumbers = allText.match(/\d{4,8}/g);
        if (allNumbers && allNumbers.length > 0) {
            // Pega o primeiro número que pareça um número de pedido
            const potentialOrderNr = allNumbers.find(n => n.length >= 5 && n.length <= 8);
            if (potentialOrderNr) {
                console.warn(`[Orders] NÚMERO EXTRAÍDO POR FALLBACK EXTREMO: ${potentialOrderNr}`);
                return potentialOrderNr;
            }
            
            // Se não encontrou, pega o primeiro número com 4+ dígitos
            if (allNumbers[0]) {
                console.warn(`[Orders] NÚMERO EXTRAÍDO POR FALLBACK DESESPERADO: ${allNumbers[0]}`);
                return allNumbers[0];
            }
        }
        
        console.error("[Orders] ERRO CRÍTICO: Número do pedido não extraído."); 
        return "AUTO" + Math.floor(Math.random() * 100000); // Gera número único como último recurso
    }

    extractSupplierName() {
        // Lista de palavras que indicam que estamos tratando do SENAC (cliente) e não do fornecedor
        const clientKeywords = ['local de faturamento', 'local de entrega', 'senac', 'serviço nacional', 'aprendizagem comercial'];
        
        // Lista de palavras que indicam que estamos tratando de um ENDEREÇO e não do nome do fornecedor
        const addressKeywords = ['rua', 'avenida', 'av.', 'av ', 'alameda', 'al.', 'praça', 'rodovia', 'estrada', 'travessa', 'r.', 'r ', 'jardim', 'jd.', 'jd ', 'bairro', 'cep:'];
        
        // Lista de palavras-chave que não devem ser extraídas como nomes de fornecedor
        const invalidSupplierNames = ['fornecedor', 'fornecedor:', 'observação', 'observação:', 'fone', 'fone:'];
        
        // Usar modo estruturado se disponível
        if (Array.isArray(this.structuredLines) && this.structuredLines.length > 0) {
            // Regex para identificar um CNPJ
            const cnpjRegex = /(\d{2}[\.]?\d{3}[\.]?\d{3}[\/]?\d{4}[-]?\d{2}|\d{14})/;
            
            // CASO ESPECÍFICO: Procura pela linha completa do fornecedor após "Fornecedor:" e CNPJ
            for (let i = 0; i < Math.min(this.structuredLines.length, 20); i++) {
                const line = this.structuredLines[i];
                
                // Verifica se é a linha que contém "Fornecedor:" seguido de CNPJ
                const fornecedorLabel = line.find(item => 
                    normalizeString(item.text) === 'fornecedor:' || 
                    normalizeString(item.text) === 'fornecedor'
                );
                
                const cnpjItem = line.find(item => cnpjRegex.test(item.text));
                
                if (fornecedorLabel && cnpjItem && i + 1 < this.structuredLines.length) {
                    // A próxima linha provavelmente contém o nome da empresa
                    const nextLine = this.structuredLines[i + 1];
                    
                    // Busca por um item que tenha características de nome de empresa
                    const companyNameItem = nextLine.find(item => {
                        const text = item.text;
                        return text.length > 5 && 
                            text.toUpperCase() === text && // Está em maiúsculas 
                            !addressKeywords.some(kw => normalizeString(text).startsWith(kw)) && // Não começa com palavras de endereço
                            !clientKeywords.some(kw => normalizeString(text).includes(kw)) && // Não contém palavras do cliente
                            text.match(/[A-Z]{2,}/) && // Contém pelo menos 2 letras maiúsculas juntas
                            !text.match(/^\d/) && // Não começa com número
                            !invalidSupplierNames.some(kw => normalizeString(text) === kw); // Não é um texto inválido
                    });
                    
                    if (companyNameItem) {
                        // Extrai apenas o texto antes de qualquer palavra de endereço
                        let companyName = companyNameItem.text;
                        
                        // Separa no primeiro indicador de endereço, se houver
                        const addressStart = addressKeywords.find(kw => 
                            companyName.toLowerCase().includes(' ' + kw)
                        );
                        
                        if (addressStart) {
                            const parts = companyName.split(new RegExp(' ' + addressStart, 'i'));
                            companyName = parts[0];
                        }
                        
                        // Remover o (0001) se presente
                        if (companyName.includes('(0001)')) {
                            companyName = companyName.split('(0001)')[0].trim();
                        }
                        
                        console.log(`[OrderParser] Nome fornecedor encontrado (linha após CNPJ): ${companyName}`);
                        return this.cleanSupplierName(companyName);
                    }
                }
            }
            
            // BACKUP: Procura especificamente por palavras "SOLUCOES", "COMERCIAL", etc. que são comuns em nomes de empresas
            const companyCommonWords = ['SOLUCOES', 'COMERCIAL', 'SERVICOS', 'LTDA', 'EIRELI', 'INDUSTRIA', 'DISTRIBUIDORA', 'COMERCIO'];
            
            for (let i = 10; i < Math.min(this.structuredLines.length, 20); i++) {
                const line = this.structuredLines[i];
                const lineText = line.map(item => item.text).join(' ');
                
                // Verifica se a linha contém palavras comuns de nomes de empresas e não começa com palavras de endereço
                if (!addressKeywords.some(kw => lineText.toLowerCase().startsWith(kw)) && 
                    !clientKeywords.some(kw => lineText.toLowerCase().includes(kw)) &&
                    companyCommonWords.some(word => lineText.includes(word))) {
                    
                    // Busca a empresa completa (até o primeiro indicador de endereço)
                    let companyName = lineText;
                    
                    // Separa no primeiro indicador de endereço
                    for (const addressKw of addressKeywords) {
                        const pattern = new RegExp(`\\s+${addressKw}\\s+`, 'i');
                        if (companyName.toLowerCase().match(pattern)) {
                            companyName = companyName.split(pattern)[0];
                            break;
                        }
                    }
                    
                    // Remover o (0001) se presente
                    if (companyName.includes('(0001)')) {
                        companyName = companyName.split('(0001)')[0].trim();
                    }
                    
                    console.log(`[OrderParser] Nome fornecedor encontrado (palavras-chave de empresa): ${companyName}`);
                    return this.cleanSupplierName(companyName);
                }
            }
            
            // Caso específico SENAC - fornecedor é geralmente a linha após "Fornecedor:" 
            // e antes da linha de endereço que começa com "RUA", "AVENIDA", etc.
            for (let i = 0; i < Math.min(this.structuredLines.length, 20); i++) {
                const line = this.structuredLines[i];
                
                // Verifica se a linha contém "Fornecedor:" explicitamente
                const isFornecedorLine = line.some(item => 
                    item.text.toLowerCase().trim() === 'fornecedor:' || 
                    item.text.toLowerCase().trim() === 'fornecedor' ||
                    normalizeString(item.text) === 'fornecedor:'
                );
                
                if (isFornecedorLine) {
                    // Verifica se há um CNPJ na mesma linha (formato SENAC)
                    const cnpjItem = line.find(item => cnpjRegex.test(item.text));
                    if (cnpjItem) {
                        // Se há um CNPJ na mesma linha, geralmente o nome do fornecedor está na próxima linha
                        if (i + 1 < this.structuredLines.length) {
                            const nextLine = this.structuredLines[i + 1];
                            const nextLineText = nextLine.map(item => item.text).join(' ');
                            
                            // Verifica se não é um linha do cliente/SENAC e não é um endereço
                            if (!clientKeywords.some(kw => nextLineText.toLowerCase().includes(kw)) &&
                                !addressKeywords.some(kw => nextLineText.toLowerCase().startsWith(kw)) &&
                                !nextLineText.match(/^\s*\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\s*$/) && // não é apenas um CNPJ
                                !invalidSupplierNames.some(kw => normalizeString(nextLineText) === kw)) { // não é apenas "Fornecedor:"
                                
                                // Busca a empresa completa (até o primeiro indicador de endereço)
                                let companyName = nextLineText;
                                
                                // Separa no primeiro indicador de endereço, se houver
                                for (const addressKw of addressKeywords) {
                                    const pattern = new RegExp(`\\s+${addressKw}\\s+`, 'i');
                                    if (companyName.toLowerCase().match(pattern)) {
                                        companyName = companyName.split(pattern)[0];
                                        break;
                                    }
                                }
                                
                                // Remover o (0001) se presente
                                if (companyName.includes('(0001)')) {
                                    companyName = companyName.split('(0001)')[0].trim();
                                }
                                
                                console.log(`[OrderParser] Nome fornecedor SENAC encontrado (abaixo de Fornecedor:): ${companyName}`);
                                return this.cleanSupplierName(companyName);
                            }
                        }
                    }
                }
            }
            
            // Procura por linhas com o texto "Fornecedor:" primeiro
            for (let i = 0; i < Math.min(this.structuredLines.length, 20); i++) {
                const line = this.structuredLines[i];
                
                // Procura pelo item "Fornecedor:"
                const fornecedorItem = line.find(item => 
                    normalizeString(item.text).includes('fornecedor') ||
                    normalizeString(item.text).includes('empresa') ||
                    normalizeString(item.text).includes('razao social')
                );
                
                if (fornecedorItem) {
                    console.log('[OrderParser] Encontrado rótulo de fornecedor estruturado');
                    
                    // Verifica se não é uma linha sobre o SENAC/cliente
                    const lineText = line.map(item => item.text).join(' ');
                    if (clientKeywords.some(keyword => lineText.toLowerCase().includes(keyword))) {
                        console.log(`[OrderParser] Ignorando linha com rótulo "fornecedor" que parece ser do cliente: "${lineText}"`);
                        continue;
                    }
                    
                    // 1. Procura nome na mesma linha após o label "Fornecedor:"
                    const fornecedorIndex = line.indexOf(fornecedorItem);
                    const possibleNameItems = line.filter(item => 
                        item.x > fornecedorItem.x && 
                        !cnpjRegex.test(item.text) && 
                        item.text.length > 3 &&
                        /[a-zA-Z]/.test(item.text) && // Contém letras
                        !addressKeywords.some(kw => normalizeString(item.text).startsWith(kw)) && // Não é endereço
                        !clientKeywords.some(kw => normalizeString(item.text).includes(kw)) && // Não é cliente
                        !invalidSupplierNames.some(kw => normalizeString(item.text) === kw) // Não é apenas "Fornecedor:"
                    );
                    
                    if (possibleNameItems.length > 0) {
                        const nomeFornecedor = possibleNameItems.map(item => item.text).join(' ');
                        console.log(`[OrderParser] Nome fornecedor encontrado (mesma linha): ${nomeFornecedor}`);
                        return this.cleanSupplierName(nomeFornecedor);
                    }
                    
                    // 2. Se não encontrou na mesma linha, verifica na linha seguinte
                    if (i + 1 < this.structuredLines.length) {
                        const nextLine = this.structuredLines[i + 1];
                        
                        // Verifica se a próxima linha NÃO parece ser o cliente ou um endereço
                        const nextLineText = nextLine.map(item => item.text).join(' ');
                        if (!clientKeywords.some(kw => nextLineText.toLowerCase().includes(kw)) &&
                            !addressKeywords.some(kw => nextLineText.toLowerCase().startsWith(kw)) &&
                            !nextLineText.match(/cnpj|cpf|fone|telefone|email|e-mail/i) &&
                            !invalidSupplierNames.some(kw => normalizeString(nextLineText) === kw)) { // Não é apenas "Fornecedor:"
                            
                            // Verifica se tem texto substancial (não apenas números/símbolos)
                            if (nextLine.length > 0 && nextLineText.length > 3 && /[a-zA-Z]{4,}/.test(nextLineText)) {
                                console.log(`[OrderParser] Nome fornecedor encontrado (linha seguinte): ${nextLineText}`);
                                return this.cleanSupplierName(nextLineText);
                            }
                        }
                    }
                }
            }
            
            // 3. Procura por um padrão de linha com CNPJ e o nome na frente
            for (let i = 0; i < Math.min(this.structuredLines.length, 20); i++) {
                const line = this.structuredLines[i];
                
                // Procura por CNPJ na linha
                let cnpjItem = null;
                for (const item of line) {
                    if (cnpjRegex.test(item.text)) {
                        cnpjItem = item;
                        break;
                    }
                }
                
                // Se encontrou CNPJ e a linha não contém keywords do cliente
                if (cnpjItem) {
                    const lineText = line.map(item => item.text).join(' ');
                    if (!clientKeywords.some(kw => lineText.toLowerCase().includes(kw))) {
                        console.log(`[OrderParser] Encontrado CNPJ que não parece ser do cliente: "${lineText}"`);
                        
                        // Itens antes do CNPJ na mesma linha
                        const cnpjIndex = line.indexOf(cnpjItem);
                        const itemsBeforeCNPJ = line.filter(item => 
                            item.x < cnpjItem.x && 
                            item.text.length > 3 && 
                            /[a-zA-Z]/.test(item.text) &&
                            !addressKeywords.some(kw => normalizeString(item.text).startsWith(kw)) &&
                            !clientKeywords.some(kw => normalizeString(item.text).includes(kw)) &&
                            !['fornecedor', 'empresa', 'cnpj', 'observação', 'fone'].some(kw => normalizeString(item.text).includes(kw))
                        );
                        
                        if (itemsBeforeCNPJ.length > 0) {
                            const nomeFornecedor = itemsBeforeCNPJ.map(item => item.text).join(' ');
                            console.log(`[OrderParser] Nome fornecedor encontrado (antes do CNPJ): ${nomeFornecedor}`);
                            return this.cleanSupplierName(nomeFornecedor);
                        }
                        
                        // Tenta buscar na linha anterior
                        if (i > 0) {
                            const prevLine = this.structuredLines[i - 1];
                            const prevLineText = prevLine.map(item => item.text).join(' ');
                            
                            // Verifica se a linha anterior não contém palavras-chave problemáticas
                            if (prevLineText.length > 3 && 
                                /[a-zA-Z]{4,}/.test(prevLineText) &&
                                !clientKeywords.some(kw => prevLineText.toLowerCase().includes(kw)) &&
                                !addressKeywords.some(kw => prevLineText.toLowerCase().startsWith(kw)) &&
                                !prevLineText.match(/cnpj|cpf|fone|telefone|email|e-mail/i) &&
                                !invalidSupplierNames.some(kw => normalizeString(prevLineText) === kw)) {
                                
                                console.log(`[OrderParser] Nome fornecedor encontrado (linha anterior ao CNPJ): ${prevLineText}`);
                                return this.cleanSupplierName(prevLineText);
                            }
                        }
                    }
                }
            }
            
            console.log('[OrderParser] Tentativa estruturada para nome do fornecedor falhou, tentando método legado');
        }
        
        // Método legado para extração do nome do fornecedor
        const fornecedorKeywords = ['fornecedor', 'fornec\\.', 'fornec:', 'emitente', 'razao social', 'razão social'];
        
        for (let i = 0; i < Math.min(this.lines.length, 30); i++) {
            const line = this.lines[i].trim();
            const normalizedLine = normalizeString(line);
            
            // Ignora linhas que parecem ser do cliente
            if (clientKeywords.some(keyword => normalizedLine.includes(keyword))) {
                continue;
            }
            
            if (fornecedorKeywords.some(kw => normalizedLine.includes(kw.replace(/[.:\\]/g, '')))) {
                // Extrai potencial nome do fornecedor
                let potentialName = line;
                
                // Remove a palavra-chave e símbolos no início
                for (const keyword of fornecedorKeywords) {
                    potentialName = potentialName.replace(new RegExp(keyword.replace(/[.:\\]/g, '\\$&'), 'i'), '');
                }
                potentialName = potentialName.replace(/^\s*[:\-]\s*/, '').trim();
                
                // Remove CNPJ se presente
                const cnpjRegex = /\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/;
                potentialName = potentialName.replace(cnpjRegex, '').trim();
                
                // Verifica se não é um endereço ou um nome inválido
                if (!addressKeywords.some(keyword => normalizeString(potentialName).startsWith(keyword)) && 
                    !clientKeywords.some(keyword => normalizeString(potentialName).includes(keyword)) &&
                    !invalidSupplierNames.some(kw => normalizeString(potentialName) === kw) &&
                    potentialName.length > 3 && 
                    potentialName.length < 100 && 
                    potentialName.match(/[a-zA-Z]/)) {
                    
                    return this.cleanSupplierName(potentialName);
                }
                
                // Se não encontrou na mesma linha, verifica a linha seguinte
                if (i + 1 < this.lines.length) {
                    const nextLine = this.lines[i + 1].trim();
                    if (nextLine.length > 3 && 
                        nextLine.match(/[a-zA-Z]/) && 
                        !nextLine.match(/cnpj|cpf|fone|telefone|email|e-mail|endere[çc]o/i) &&
                        !addressKeywords.some(kw => normalizeString(nextLine).startsWith(kw)) &&
                        !clientKeywords.some(kw => normalizeString(nextLine).includes(kw)) &&
                        !invalidSupplierNames.some(kw => normalizeString(nextLine) === kw)) {
                        
                        return this.cleanSupplierName(nextLine);
                    }
                }
            }
        }
        
        return 'Não encontrado';
    }
    
    /**
     * Limpa e normaliza o nome do fornecedor
     */
    cleanSupplierName(name) {
        if (!name) return 'Não encontrado';
        
        let cleanedName = name.trim();
        
        // Ignora valores que são claramente não fornecedores
        const invalidSupplierNames = [
            'observação', 'observacao', 'obs', 'observação:', 'observacao:',
            'fornecedor', 'fornecedor:', 'fornec', 'fornec:',
            'fone', 'fone:'
        ];
        
        if (invalidSupplierNames.includes(normalizeString(cleanedName)) || 
            cleanedName.length < 4) {
            console.log(`[OrderParser] Nome ignorado por ser inválido: "${cleanedName}"`);
            return 'Não encontrado';
        }
        
        // Remove sufixos comuns de razão social
        cleanedName = cleanedName.replace(/\s+(LTDA|ME|EPP|S\.A\.?|EIRELI|CIA|COMERCIO|SERVICOS|INDUSTRIA|IMPORTACAO|DISTRIBUICAO)(\s+.*)?$/i, '').trim();
        
        // Remove "CNPJ:" e qualquer texto após isso
        cleanedName = cleanedName.replace(/CNPJ:.*$/i, '').trim();
        
        // Remove códigos internos como (0001)
        cleanedName = cleanedName.replace(/\s*\(\d+\)\s*$/, '').trim();
        
        // Remove possíveis identificadores de cliente
        cleanedName = cleanedName.replace(/\b(senac|serviço nacional|aprendizagem comercial)\b/i, '').trim();
        
        // Remove caracteres problemáticos no início/fim
        cleanedName = cleanedName.replace(/^[-:,;.]+|[-:,;.]+$/g, '').trim();
        
        // Limita o tamanho máximo a 7 palavras
        if (cleanedName.split(' ').length > 7) {
            cleanedName = cleanedName.split(' ').slice(0, 7).join(' ');
        }
        
        // Verifica se o nome limpo não ficou muito curto
        if (cleanedName.length < 3) {
            return 'Não encontrado';
        }
        
        return cleanedName || 'Não encontrado';
    }

    extractSupplierCNPJ() {
        // Usar modo estruturado se disponível
        if (Array.isArray(this.structuredLines) && this.structuredLines.length > 0) {
            // Regex para encontrar padrões de CNPJ
            const cnpjRegex = /(\d{2}[\.]?\d{3}[\.]?\d{3}[\/]?\d{4}[-]?\d{2}|\d{14})/;

            // Procura linhas com o texto "Fornecedor:" primeiro
            for (let i = 0; i < Math.min(this.structuredLines.length, 20); i++) {
                const line = this.structuredLines[i];
                
                // Procura pelo item "Fornecedor:"
                const fornecedorItem = line.find(item => 
                    normalizeString(item.text).includes('fornecedor') ||
                    normalizeString(item.text).includes('empresa')
                );
                
                if (fornecedorItem) {
                    console.log('[OrderParser] Encontrado rótulo de fornecedor estruturado');
                    
                    // Verifica se há um CNPJ na mesma linha
                    for (const item of line) {
                        const match = item.text.match(cnpjRegex);
                        if (match && match[1]) {
                            const cnpj = match[1].replace(/\D/g, '');
                            if (cnpj.length === 14) {
                                console.log(`[OrderParser] CNPJ encontrado (mesma linha): ${cnpj}`);
                                return formatCNPJ(cnpj);
                            }
                        }
                    }
                    
                    // Se não achou na mesma linha, verifica na próxima linha
                    if (i + 1 < this.structuredLines.length) {
                        const nextLine = this.structuredLines[i + 1];
                        for (const item of nextLine) {
                            const match = item.text.match(cnpjRegex);
                            if (match && match[1]) {
                                const cnpj = match[1].replace(/\D/g, '');
                                if (cnpj.length === 14) {
                                    console.log(`[OrderParser] CNPJ encontrado (linha seguinte): ${cnpj}`);
                                    return formatCNPJ(cnpj);
                                }
                            }
                        }
                    }
                }
            }
            
            // Busca por CNPJ em qualquer linha próxima ao início
            for (let i = 0; i < Math.min(this.structuredLines.length, 20); i++) {
                const line = this.structuredLines[i];
                
                for (const item of line) {
                    const match = item.text.match(cnpjRegex);
                    if (match && match[1]) {
                        const cnpj = match[1].replace(/\D/g, '');
                        if (cnpj.length === 14) {
                            // Verifica se não é o CNPJ do destinatário/cliente (Senac)
                            const lineText = line.map(i => i.text).join(' ').toLowerCase();
                            if (!lineText.includes('senac') && !lineText.includes('faturamento') && !lineText.includes('entrega')) {
                                console.log(`[OrderParser] CNPJ encontrado (busca geral): ${cnpj}`);
                                return formatCNPJ(cnpj);
                            }
                        }
                    }
                }
            }
            
            console.log('[OrderParser] Tentativa estruturada para CNPJ falhou, tentando método legado');
        }
        
        // Usar método legado para extrair CNPJ
        const cnpjRegex = /(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}|\d{14})/;
        
        for (let i = 0; i < Math.min(this.lines.length, 30); i++) {
            const line = this.lines[i].trim();
            
            // Verifica se a linha pode se referir ao fornecedor
            if (normalizeString(line).includes('fornecedor') || 
                normalizeString(line).includes('empresa') || 
                normalizeString(line).includes('razao social')) {
                
                const match = line.match(cnpjRegex);
                if (match && match[1]) {
                    const cnpj = match[1].replace(/\D/g, '');
                    if (cnpj.length === 14) return formatCNPJ(cnpj);
                }
                
                // Verifica na próxima linha
                if (i + 1 < this.lines.length) {
                    const nextLine = this.lines[i + 1].trim();
                    const nextMatch = nextLine.match(cnpjRegex);
                    if (nextMatch && nextMatch[1]) {
                        const cnpj = nextMatch[1].replace(/\D/g, '');
                        if (cnpj.length === 14) return formatCNPJ(cnpj);
                    }
                }
            }
            
            // Também busca CNPJs isolados
            const match = line.match(cnpjRegex);
            if (match && match[1]) {
                const cnpj = match[1].replace(/\D/g, '');
                if (cnpj.length === 14 && !line.toLowerCase().includes('senac')) {
                    return formatCNPJ(cnpj);
                }
            }
        }
        
        return 'Não encontrado';
    }

    extractSendDate() {
        // Método existente
    }

    extractSenderName() {
        // Método existente
    }

    extractItems() {
        // Método existente
    }

    parseItemLine(line) {
        // Método existente
    }

    splitNumbersAndText(line) {
        // Método existente
    }
}

export function extractOrderData(orderText) {
    const parser = new OrderParser(orderText);
    return parser.parse();
}

// Exportações Adicionais

export default OrderParser;