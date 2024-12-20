import {extractOrderData, formatCNPJ} from './orders.js';
import {showLoader, hideLoader} from './ui.js';
import {showNotification} from './notifications.js';
import {getCurrentUser, getOrders, saveOrders} from './storage.js';
import {openSelectAreaModal} from './ui.js';
import {getCurrentDate} from './utils.js';

// Função principal para processar PDF (similar à original):
export function processPDF(file) {
    showLoader();
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
                    hideLoader();
                    showNotification('Erro ao extrair o número do pedido.', 'error');
                    return;
                }

                const orders = getOrders();
                const exists = orders.some(o => o.numeroPedido === order.numeroPedido);
                if (exists) {
                    hideLoader();
                    showNotification('Pedido já existe no sistema.', 'error');
                    return;
                }

                const currentUser = getCurrentUser();
                if (!currentUser) {
                    hideLoader();
                    showNotification('Você precisa estar logado para enviar um pedido.', 'error');
                    return;
                }
                order.senderName = currentUser.name;
                order.sendDate = getCurrentDate();

                localStorage.setItem('tempOrder', JSON.stringify(order));
                hideLoader();
                openSelectAreaModal(order);
            });
        }).catch(error => {
            console.error('Erro ao processar o PDF:', error);
            hideLoader();
            showNotification('Erro ao processar o PDF.', 'error');
        });
    };

    fileReader.readAsArrayBuffer(file);
}
