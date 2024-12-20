import {getCurrentUser} from './storage.js';
import {updateUserProfile, updateDashboardStats, displayDashboard, displayBuyerOrders, displayReceiverOrders, displayFinalizedOrders, displayWithdrawalOrders, showLoginModal} from './ui.js';

export function initializeApp() {
    const currentUser = getCurrentUser();
    if (!currentUser) {
        showLoginModal();
        return;
    }

    updateUserProfile();
    updateDashboardStats();
    displayDashboard();
    displayBuyerOrders();
    displayReceiverOrders();
    displayFinalizedOrders();
    displayWithdrawalOrders();
}
