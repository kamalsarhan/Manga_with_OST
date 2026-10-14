export interface NotificationEntry {
    id: string;
    message: string;
    type: 'success' | 'error' | 'info';
    timestamp: number;
}

const notificationLog: NotificationEntry[] = [];
let onNotificationChangeCallback: (() => void) | null = null;

export function onNotificationChange(callback: () => void) {
    onNotificationChangeCallback = callback;
}

export function getNotificationLog(): NotificationEntry[] {
    return notificationLog;
}

export function showToast(message: string, type: 'success' | 'error' | 'info' = 'info') {
    const entry: NotificationEntry = {
        id: Date.now().toString(),
        message,
        type,
        timestamp: Date.now()
    };
    notificationLog.unshift(entry);
    if (notificationLog.length > 50) notificationLog.pop();

    if (onNotificationChangeCallback) {
        onNotificationChangeCallback();
    }

    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('removing');
        toast.addEventListener('animationend', () => {
            toast.remove();
        });
    }, 3000);
}
