// modules/notifications.js
import { APP_CONFIG } from './constants.js';

/**
 * Mostra uma notificação na tela.
 * @param {string} message - A mensagem a ser exibida.
 * @param {'success'|'error'|'info'|'warning'} type - O tipo da notificação.
 * @param {number} [duration=APP_CONFIG.NOTIFICATION_TIMEOUT] - Duração em milissegundos.
 */
export function showNotification(message, type = 'info', duration = APP_CONFIG.NOTIFICATION_TIMEOUT) {
    const notificationContainer = document.getElementById('notification-container');
    if (!notificationContainer) {
        console.warn('Notification container "notification-container" not found.');
        return;
    }

    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`; // Usar classes mais específicas
    
    // Adicionar ícone baseado no tipo (requer Feather Icons ou similar)
    let iconName = 'info';
    switch (type) {
        case 'success': iconName = 'check-circle'; break;
        case 'error': iconName = 'alert-octagon'; break;
        case 'warning': iconName = 'alert-triangle'; break;
    }

    notification.innerHTML = `
        <i data-feather="${iconName}" class="notification-icon"></i>
        <span class="notification-message">${message}</span>
        <button class="close-notification" aria-label="Fechar Notificação">
            <i data-feather="x" class="notification-close-icon"></i>
        </button>
    `;

    notificationContainer.appendChild(notification);
    if (window.feather) { // Garante que os ícones sejam renderizados se Feather estiver global
        window.feather.replace();
    }

    const removeNotification = () => {
        notification.classList.add('fade-out');
        // Espera a animação de fade-out terminar antes de remover o elemento
        notification.addEventListener('transitionend', () => notification.remove(), { once: true });
         // Fallback caso transitionend não dispare (ex: se não houver transição CSS)
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 500);
    };

    const closeButton = notification.querySelector('.close-notification');
    closeButton.addEventListener('click', removeNotification);

    const timer = setTimeout(removeNotification, duration);

    // Opcional: Pausar o timer ao passar o mouse sobre a notificação
    notification.addEventListener('mouseenter', () => clearTimeout(timer));
    notification.addEventListener('mouseleave', () => setTimeout(removeNotification, duration));
}