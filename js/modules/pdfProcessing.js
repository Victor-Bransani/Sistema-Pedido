// modules/pdfProcessing.js
import { OrderParser, determineOrderStatus } from './orders.js';
import { showLoader, hideLoader, openSelectAreaModal } from './ui.js';
import { showNotification } from './notifications.js';
import { getCurrentUser, getOrders, setTempOrder } from './storage.js';
import { getCurrentDate, generateId, normalizeString, parseDate } from './utils.js';
import { OrderStatus, APP_CONFIG } from './constants.js';
import * as pdfDebug from './pdfDebug.js';

const pdfjsLib = window['pdfjs-dist/build/pdf'];
// Configurar o worker do PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = './libs/pdfjs/pdf.worker.js';

console.log('[PDF Processing] Módulo carregado. PDF.js disponível:', !!pdfjsLib);

/**
 * Extrai texto de forma estruturada de uma página PDF com melhor detecção de tabelas.
 */
async function extractTextFromPage(page) {
    try {
        console.log('[PDF Processing] Extraindo texto da página...');
        const textContent = await page.getTextContent({ 
            normalizeWhitespace: true, 
            disableCombineTextItems: false 
        });
        
        if (!textContent?.items?.length) {
            console.warn('[PDF Processing] Nenhum texto encontrado na página');
            return { text: '', structuredLines: [] };
        }

        console.log(`[PDF Processing] ${textContent.items.length} itens de texto encontrados`);
        let lines = [];
        let currentLine = { y: -1, items: [] };
        
        // Obtém viewport para normalizar coordenadas
        const viewport = page.getViewport({ scale: 1.0 });
        const pageHeight = viewport.height;
        
        // Ordena itens por Y (de cima para baixo) e então por X (da esquerda para direita)
        const sortedItems = [...textContent.items].sort((a, b) => {
            // Inverte Y para corresponder à orientação top-to-bottom
            const aY = pageHeight - a.transform[5];
            const bY = pageHeight - b.transform[5];
            
            const yTolerance = (a.height || 5) * 0.5;
            const yDiff = aY - bY;
            
            if (Math.abs(yDiff) < yTolerance) {
                return a.transform[4] - b.transform[4]; // Mesma linha, ordena por X
            }
            return yDiff; // Linhas diferentes, ordena por Y
        });
        
        // Agrupa itens em linhas baseado em coordenadas Y próximas
        sortedItems.forEach(item => {
            if (!item.str?.trim()) return;
            
            const itemY = pageHeight - item.transform[5]; // Inverte Y
            const itemHeight = item.height || 10;
            const yTolerance = itemHeight * 0.7;
            
            if (currentLine.y === -1 || Math.abs(itemY - currentLine.y) < yTolerance) {
                // Mesmo grupo/linha
                currentLine.items.push({
                    x: item.transform[4],
                    y: itemY,
                    text: item.str.trim(),
                    width: item.width || 0,
                    height: itemHeight,
                    fontSize: item.fontSize,
                    fontName: item.fontName
                });
                currentLine.y = (currentLine.y === -1) ? itemY : (currentLine.y + itemY) / 2;
            } else {
                // Nova linha
                if (currentLine.items.length > 0) {
                    currentLine.items.sort((a, b) => a.x - b.x);
                    lines.push([...currentLine.items]);
                }
                currentLine = {
                    y: itemY,
                    items: [{
                        x: item.transform[4],
                        y: itemY,
                        text: item.str.trim(),
                        width: item.width || 0,
                        height: itemHeight,
                        fontSize: item.fontSize,
                        fontName: item.fontName
                    }]
                };
            }
        });
        
        // Adiciona a última linha
        if (currentLine.items.length > 0) {
            currentLine.items.sort((a, b) => a.x - b.x);
            lines.push([...currentLine.items]);
        }
        
        console.log(`[PDF Processing] ${lines.length} linhas estruturadas encontradas`);
        
        // Identifica colunas prováveis baseado em alinhamento X consistente
        const columnPositions = detectColumnPositions(lines);
        
        // Adiciona informação de coluna provável para cada item
        lines = lines.map(line => {
            return line.map(item => {
                const columnIndex = getItemColumnIndex(item, columnPositions);
                return { ...item, columnIndex };
            });
        });
        
        // Logging para debug
        lines.forEach((line, idx) => {
            const debugLine = line.map(i => `[${i.text} @x:${Math.round(i.x)},col:${i.columnIndex}]`).join(' | ');
            console.log(`[PDF DEBUG][Linha ${idx}]`, debugLine);
        });
        
        // Texto normal (para compatibilidade com código existente)
        const joinedLines = lines.map(line => line.map(i => i.text).join(' ')).join('\n');
        
        return { 
            text: joinedLines, 
            structuredLines: lines,
            columnPositions: columnPositions
        };
    } catch (error) {
        console.error('[PDF Processing] Erro ao extrair texto da página:', error);
        throw error;
    }
}

/**
 * Detecta posições prováveis de colunas baseado em alinhamento consistente
 */
function detectColumnPositions(lines) {
    // Passo 1: Colete todas as posições X
    const allPositions = [];
    lines.forEach(line => {
        line.forEach(item => {
            allPositions.push(Math.round(item.x));
        });
    });
    
    // Passo 2: Agrupe posições próximas
    const clusters = [];
    const tolerance = 10; // Tolerância de pixels para mesmo alinhamento
    
    allPositions.sort((a, b) => a - b).forEach(pos => {
        let addedToCluster = false;
        
        for (let i = 0; i < clusters.length; i++) {
            const clusterAvg = clusters[i].sum / clusters[i].count;
            
            if (Math.abs(pos - clusterAvg) <= tolerance) {
                clusters[i].sum += pos;
                clusters[i].count++;
                clusters[i].positions.push(pos);
                addedToCluster = true;
                break;
            }
        }
        
        if (!addedToCluster) {
            clusters.push({ 
                sum: pos, 
                count: 1,
                positions: [pos]
            });
        }
    });
    
    // Passo 3: Calcule a posição média de cada cluster e filtre clusters com poucos pontos
    const significantThreshold = Math.max(2, Math.floor(lines.length * 0.1)); // Pelo menos 10% das linhas ou 2
    
    const columnPositions = clusters
        .filter(c => c.count >= significantThreshold)
        .map(c => ({
            x: Math.round(c.sum / c.count),
            frequency: c.count
        }))
        .sort((a, b) => a.x - b.x);
    
    console.log("[PDF Processing] Colunas detectadas:", columnPositions);
    
    return columnPositions;
}

/**
 * Determina a qual coluna um item pertence
 */
function getItemColumnIndex(item, columnPositions) {
    if (!columnPositions || columnPositions.length === 0) return -1;
    
    const tolerance = 30; // Tolerância mais ampla para associação de itens às colunas
    const itemX = Math.round(item.x);
    
    // Encontra a coluna mais próxima
    let closestColumn = -1;
    let minDistance = tolerance;
    
    for (let i = 0; i < columnPositions.length; i++) {
        const distance = Math.abs(itemX - columnPositions[i].x);
        if (distance < minDistance) {
            minDistance = distance;
            closestColumn = i;
        }
    }
    
    return closestColumn;
}

/**
 * Processa um arquivo PDF para extrair dados do pedido.
 */
export async function processPDF(file) {
    console.log('[PDF Processing] Iniciando processamento do arquivo:', file?.name);
    
    if (!file || file.type !== 'application/pdf') {
        showNotification('Selecione um PDF.', 'error');
        return;
    }

    try {
        // Garantir que o loader seja escondido em caso de erro
        let loaderHidden = false;
        let pdf = null;
        
        // Função para garantir que o loader será escondido
        const ensureLoaderHidden = () => {
            if (!loaderHidden) {
                loaderHidden = true;
                hideLoader();
            }
        };
        
        // Definir um timeout de segurança para esconder o loader
        const safetyTimeout = setTimeout(ensureLoaderHidden, 10000);
        
        showLoader();
        console.log(`[PDF Processing] Iniciando: ${file.name}`);

        const arrayBuffer = await file.arrayBuffer();
        const typedarray = new Uint8Array(arrayBuffer);
        
        if (typeof pdfjsLib === 'undefined' || !pdfjsLib.getDocument) {
            throw new Error('pdf.js não carregada.');
        }

        console.log('[PDF Processing] PDF.js disponível, iniciando carregamento do documento...');
        const loadingTask = pdfjsLib.getDocument({ data: typedarray });
        
        // Adicionar handlers de progresso
        loadingTask.onProgress = (progressData) => {
            if (progressData.total > 0) {
                const percent = Math.round((progressData.loaded / progressData.total) * 100);
                console.log(`[PDF Processing] Carregando PDF: ${percent}%`);
            }
        };
        
        pdf = await loadingTask.promise;
        console.log(`[PDF Processing] PDF carregado (${pdf.numPages} páginas).`);

        let allTextContent = '';
        let allStructuredLines = [];
        let allColumnPositions = [];

        // Processar cada página
        for (let i = 1; i <= pdf.numPages; i++) {
            console.log(`[PDF Processing] Processando página ${i} de ${pdf.numPages}...`);
            const page = await pdf.getPage(i);
            const pageContent = await extractTextFromPage(page);
            
            allTextContent += pageContent.text + '\n\n';
            allStructuredLines = allStructuredLines.concat(pageContent.structuredLines);
            allColumnPositions = mergeColumnPositions(allColumnPositions, pageContent.columnPositions);
        }

        // Limpar timeout de segurança
        clearTimeout(safetyTimeout);
        ensureLoaderHidden();

        console.log('[PDF Processing] PDF processado com sucesso');
        console.log('[PDF Processing] Total de linhas estruturadas:', allStructuredLines.length);
        console.log('[PDF Processing] Posições de colunas detectadas:', allColumnPositions);

        // Processar o texto extraído
        const parser = new OrderParser(allTextContent, allStructuredLines, allColumnPositions);
        const orderData = parser.parse();
        
        if (!orderData) {
            throw new Error('Não foi possível extrair dados do pedido do PDF.');
        }

        // Determinar status do pedido
        orderData.status = determineOrderStatus(orderData);
        
        // Adicionar metadados
        orderData.id = generateId();
        orderData.createdAt = getCurrentDate();
        orderData.createdBy = getCurrentUser()?.id;
        orderData.pdfFileName = file.name;
        
        // Salvar pedido temporário
        setTempOrder(orderData);
        
        // Abrir modal de seleção de área com os dados do pedido
        openSelectAreaModal(orderData);
        
        return orderData;
    } catch (error) {
        console.error('[PDF Processing] Erro ao processar PDF:', error);
        
        // Mensagens de erro mais específicas
        if (error.name === 'PasswordException') {
            showNotification('O PDF está protegido por senha.', 'error');
        } else if (error.name === 'InvalidPDFException') {
            showNotification('O arquivo PDF está corrompido ou é inválido.', 'error');
        } else if (error.message.includes('pdf.js não carregada')) {
            showNotification('Erro ao carregar a biblioteca PDF.js. Tente recarregar a página.', 'error');
        } else {
            showNotification('Erro ao processar o PDF. Tente novamente.', 'error');
        }
        
        // Garantir que o loader seja escondido
        if (!loaderHidden) {
            hideLoader();
        }
        
        throw error;
    }
}

/**
 * Mescla posições de colunas de diferentes páginas
 */
function mergeColumnPositions(positions1, positions2) {
    const allPositions = [...positions1, ...positions2];
    const tolerance = 15;
    
    // Agrupa posições similares
    const merged = [];
    
    allPositions.forEach(pos => {
        let foundMatch = false;
        
        for (let i = 0; i < merged.length; i++) {
            if (Math.abs(merged[i].x - pos.x) <= tolerance) {
                // Atualiza a posição com média ponderada pela frequência
                const totalFreq = merged[i].frequency + pos.frequency;
                const newX = (merged[i].x * merged[i].frequency + pos.x * pos.frequency) / totalFreq;
                
                merged[i] = {
                    x: Math.round(newX),
                    frequency: totalFreq
                };
                
                foundMatch = true;
                break;
            }
        }
        
        if (!foundMatch) {
            merged.push({...pos});
        }
    });
    
    return merged.sort((a, b) => a.x - b.x);
}