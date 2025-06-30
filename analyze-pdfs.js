// Script para analisar a estrutura dos PDFs
import { processPDF } from './js/modules/pdfProcessing.js';

// Lista de PDFs para analisar
const pdfFiles = [
    'SNC___Relatório_de_Pedido_de_C_240425.pdf',
    'SNC___Relatório_de_Pedido_de_C_020425.pdf',
    'SNC___Relatório_de_Pedido_de_C_011024 (1).pdf',
    'SNC___Relatório_de_Pedido_de_C_020924 (1).pdf',
    'SNC___Relatório_de_Pedido_de_C_070624.pdf',
    'SNC___Relatório_de_Pedido_de_C_080524.pdf',
    'SNC___Relatório_de_Pedido_de_C_060525_FRASCOS.pdf',
    'SNC___Relatório_de_Pedido_de_C_060525_INSUMOS CORRETO (2).pdf',
    'SNC___Relatório_de_Pedido_de_C_050525_INSUMOS CORRETO.pdf'
];

// Função para analisar PDFs
async function analyzePDFs() {
    console.log('=== INICIANDO ANÁLISE DE PDFS ===');
    
    // Processa cada PDF
    for (const pdfFile of pdfFiles) {
        console.log(`\n=== ANALISANDO: ${pdfFile} ===`);
        
        try {
            // Criar File object a partir do path
            const response = await fetch(pdfFile);
            const blob = await response.blob();
            const file = new File([blob], pdfFile, { type: 'application/pdf' });
            
            // Processa o PDF
            await processPDF(file);
            
        } catch (error) {
            console.error(`Erro ao analisar ${pdfFile}:`, error);
        }
        
        console.log(`=== FIM DA ANÁLISE: ${pdfFile} ===\n`);
    }
    
    console.log('=== ANÁLISE DE PDFS CONCLUÍDA ===');
}

// Executa a análise
analyzePDFs().catch(error => {
    console.error('Erro durante a análise:', error);
}); 