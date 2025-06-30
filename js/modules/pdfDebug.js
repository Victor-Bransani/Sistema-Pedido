// pdfDebug.js - Módulo para auxiliar na análise e debug de PDFs do SENAC

/**
 * Identifica o tipo de relatório de pedido do SENAC com base na estrutura do PDF
 * @param {Array} structuredLines - Linhas estruturadas extraídas do PDF
 * @returns {string} Tipo do relatório
 */
export function identifySenacReportType(structuredLines) {
    if (!structuredLines || !Array.isArray(structuredLines) || structuredLines.length === 0) {
        return 'UNKNOWN';
    }
    
    // Analisa as primeiras linhas para identificar padrões conhecidos
    const firstLineTexts = [];
    for (let i = 0; i < Math.min(5, structuredLines.length); i++) {
        const line = structuredLines[i];
        if (line && line.length > 0) {
            const text = line.map(item => item.text).join(' ');
            firstLineTexts.push(text);
        }
    }
    
    // Converte para texto único para facilitar a busca
    const headerText = firstLineTexts.join(' ');
    console.log('[PdfDebug] Analisando cabeçalho:', headerText);
    
    if (headerText.includes('PEDIDO Pedido Número Revisão Data Criação')) {
        return 'SENAC_STANDARD';
    } else if (headerText.includes('Relatório de Pedido de Compra')) {
        return 'SENAC_REPORT';
    } else if (headerText.includes('Ordem de Compra') && headerText.includes('Fornecedor:')) {
        return 'SENAC_ORDER';
    } else if (headerText.includes('Nota Fiscal') || headerText.includes('Danfe')) {
        return 'INVOICE';
    }
    
    return 'UNKNOWN';
}

/**
 * Detecta padrões específicos em relatórios do SENAC
 * @param {Array} structuredLines - Linhas estruturadas extraídas do PDF
 * @returns {Object} Informações e padrões detectados
 */
export function detectSenacPatterns(structuredLines) {
    const patterns = {
        reportType: identifySenacReportType(structuredLines),
        hasColumnAlignment: false,
        dataPatterns: [],
        supplierNameLine: -1,
        orderNumberLine: -1,
        itemsHeaderLine: -1,
        potentialItemLines: []
    };
    
    // Não prossegue se não houver dados suficientes
    if (!structuredLines || !Array.isArray(structuredLines) || structuredLines.length < 5) {
        return patterns;
    }
    
    // Analisa cada linha para encontrar padrões conhecidos
    for (let i = 0; i < structuredLines.length; i++) {
        const line = structuredLines[i];
        if (!line || line.length === 0) continue;
        
        const lineText = line.map(item => item.text).join(' ');
        const normalizedText = lineText.toLowerCase();
        
        // Detecta linha do Fornecedor
        if (normalizedText.includes('fornecedor:') || normalizedText.includes('fornecedor ')) {
            patterns.supplierNameLine = i;
            patterns.dataPatterns.push({
                type: 'SUPPLIER_LINE',
                lineNumber: i,
                text: lineText
            });
        }
        
        // Detecta linha com o número do pedido
        if (normalizedText.includes('pedido número') || normalizedText.includes('número do pedido') || 
            normalizedText.includes('pedido n')) {
            patterns.orderNumberLine = i;
            patterns.dataPatterns.push({
                type: 'ORDER_NUMBER_LINE',
                lineNumber: i,
                text: lineText
            });
        }
        
        // Detecta cabeçalho da tabela de itens
        if ((normalizedText.includes('item') || normalizedText.includes('linha')) && 
            normalizedText.includes('quantidade') && 
            (normalizedText.includes('unitário') || normalizedText.includes('unit'))) {
            patterns.itemsHeaderLine = i;
            patterns.dataPatterns.push({
                type: 'ITEMS_HEADER',
                lineNumber: i,
                text: lineText
            });
        }
        
        // Detecta linhas potenciais de itens
        if (line.length > 0 && /^\d+$/.test(line[0].text.trim())) {
            patterns.potentialItemLines.push(i);
            
            // Verifica padrões específicos de valores colados
            for (const item of line) {
                // Padrão: Preço e quantidade colados (ex: "2.581,251,00")
                if (item.text.match(/(\d{1,3}(?:\.\d{3})*,\d{2})(\d+,\d{2})/)) {
                    patterns.dataPatterns.push({
                        type: 'JOINED_PRICE_QUANTITY',
                        lineNumber: i,
                        text: item.text,
                        position: {x: item.x, y: item.y}
                    });
                }
                
                // Padrão: Preço, código e descrição colados
                if (item.text.match(/(\d{1,3}(?:\.\d{3})*,\d{2})(\d{6,})\.(.+)/)) {
                    patterns.dataPatterns.push({
                        type: 'JOINED_PRICE_CODE_DESC',
                        lineNumber: i,
                        text: item.text,
                        position: {x: item.x, y: item.y}
                    });
                }
            }
        }
    }
    
    // Verifica se existem colunas bem alinhadas
    const columnCount = {};
    for (const line of structuredLines) {
        for (const item of line) {
            if (item.columnIndex !== undefined && item.columnIndex >= 0) {
                columnCount[item.columnIndex] = (columnCount[item.columnIndex] || 0) + 1;
            }
        }
    }
    
    const significantColumns = Object.keys(columnCount).filter(col => 
        columnCount[col] > structuredLines.length * 0.1
    );
    
    patterns.hasColumnAlignment = significantColumns.length >= 3;
    patterns.columnStats = {
        total: Object.keys(columnCount).length,
        significant: significantColumns.length,
        counts: columnCount
    };
    
    return patterns;
}

/**
 * Extrai e sugere correções baseadas nos padrões detectados
 * @param {Object} patterns - Padrões detectados
 * @param {Array} structuredLines - Linhas estruturadas extraídas do PDF
 * @returns {Object} Sugestões de correções
 */
export function suggestCorrections(patterns, structuredLines) {
    const suggestions = {
        extractionMethod: 'standard',
        supplierNameSuggestion: null,
        orderNumberSuggestion: null,
        itemsExtractionMethod: 'standard'
    };
    
    // Define método de extração baseado no tipo de relatório
    if (patterns.reportType === 'SENAC_STANDARD') {
        suggestions.extractionMethod = 'senac_standard';
    } else if (patterns.reportType === 'SENAC_REPORT') {
        suggestions.extractionMethod = 'senac_report';
    } else if (patterns.reportType === 'SENAC_ORDER') {
        suggestions.extractionMethod = 'senac_order';
    }
    
    // Sugestões para nome do fornecedor
    if (patterns.supplierNameLine !== -1 && patterns.supplierNameLine + 1 < structuredLines.length) {
        const supplierLine = structuredLines[patterns.supplierNameLine];
        const nextLine = structuredLines[patterns.supplierNameLine + 1];
        
        // Verifica se tem CNPJ na linha do fornecedor
        const hasCNPJ = supplierLine.some(item => 
            /\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/.test(item.text)
        );
        
        if (hasCNPJ) {
            // Extrai nome antes do CNPJ
            const cnpjItem = supplierLine.find(item => 
                /\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/.test(item.text)
            );
            
            if (cnpjItem) {
                const beforeItems = supplierLine.filter(item => item.x < cnpjItem.x);
                if (beforeItems.length > 0) {
                    const name = beforeItems.map(item => item.text).join(' ');
                    suggestions.supplierNameSuggestion = name;
                }
            }
        } else {
            // Provavelmente o nome está na próxima linha
            const nextLineText = nextLine.map(item => item.text).join(' ');
            
            // Verifica se não é endereço ou SENAC
            if (!nextLineText.match(/^\s*(rua|avenida|av|alameda|praca|r\.)/i) && 
                !nextLineText.toLowerCase().includes('senac')) {
                suggestions.supplierNameSuggestion = nextLineText;
            }
        }
    }
    
    // Sugestões para número do pedido
    if (patterns.orderNumberLine !== -1) {
        const orderLine = structuredLines[patterns.orderNumberLine];
        
        // Procura um número isolado na linha
        const numberItem = orderLine.find(item => /^\d{4,}$/.test(item.text.trim()));
        if (numberItem) {
            suggestions.orderNumberSuggestion = numberItem.text.trim();
        } 
        // Procura na próxima linha
        else if (patterns.orderNumberLine + 1 < structuredLines.length) {
            const nextLine = structuredLines[patterns.orderNumberLine + 1];
            const nextNumberItem = nextLine.find(item => /^\d{4,}$/.test(item.text.trim()));
            if (nextNumberItem) {
                suggestions.orderNumberSuggestion = nextNumberItem.text.trim();
            }
        }
    }
    
    // Sugestões para extração de itens
    if (patterns.dataPatterns.some(p => p.type === 'JOINED_PRICE_QUANTITY' || p.type === 'JOINED_PRICE_CODE_DESC')) {
        suggestions.itemsExtractionMethod = 'senac_special';
    } else if (patterns.hasColumnAlignment) {
        suggestions.itemsExtractionMethod = 'column_based';
    } else if (patterns.potentialItemLines.length > 0) {
        suggestions.itemsExtractionMethod = 'line_based';
    }
    
    return suggestions;
}

/**
 * Extrai o tipo de documento SENAC do nome do arquivo
 * @param {string} filename - Nome do arquivo
 * @returns {Object} Informações sobre o documento
 */
export function extractInfoFromFilename(filename) {
    if (!filename) return { type: 'unknown' };
    
    const info = {
        type: 'unknown',
        date: null,
        month: null,
        year: null,
        category: null
    };
    
    // Relatório de Pedido de Compra do SENAC
    if (filename.startsWith('SNC___Relatório_de_Pedido_de_C')) {
        info.type = 'senac_order';
        
        // Tenta extrair data (formato: DDMMYY)
        const dateMatch = filename.match(/_(\d{6})/) || filename.match(/_(\d{2})(\d{2})(\d{2})/);
        if (dateMatch) {
            const fullDate = dateMatch[1];
            if (fullDate.length === 6) {
                info.date = fullDate;
                info.day = fullDate.substring(0, 2);
                info.month = fullDate.substring(2, 4);
                info.year = '20' + fullDate.substring(4, 6);
            }
        }
        
        // Tenta extrair categoria
        if (filename.includes('INSUMOS')) {
            info.category = 'insumos';
        } else if (filename.includes('FRASCOS')) {
            info.category = 'frascos';
        }
    }
    
    return info;
}

// Exporta as funções de debug
export default {
    identifySenacReportType,
    detectSenacPatterns,
    suggestCorrections,
    extractInfoFromFilename
}; 