export function showNotification(message, type) {
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
