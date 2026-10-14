export function initServerDashboard(container: HTMLElement) {
    container.innerHTML = `
        <div class="server-dashboard">
            <div class="server-header">
                <h1 class="server-title"><span class="highlight">Cinematic</span> Server</h1>
                <p class="server-subtitle">Host your manga online for others to read</p>
            </div>
            
            <div class="server-panel">
                <div class="status-indicator">
                    <div class="status-dot" id="server-status-dot"></div>
                    <span id="server-status-text">Server Stopped</span>
                </div>
                
                <div class="server-control-group">
                    <label>Local Network URL</label>
                    <div class="url-box">
                        <input type="text" class="url-input" id="local-url-input" readonly value="Not running">
                        <button class="copy-btn" id="btn-copy-local" disabled>Copy</button>
                    </div>
                </div>
                
                <div class="server-control-group">
                    <label>Public Internet URL (Cloudflare Tunnel)</label>
                    <div class="url-box">
                        <input type="text" class="url-input" id="public-url-input" readonly value="Not active">
                        <button class="copy-btn" id="btn-copy-public" disabled>Copy</button>
                    </div>
                </div>
                
                <div class="action-row">
                    <button class="server-btn primary" id="btn-toggle-server">Start Server</button>
                    <button class="server-btn danger" id="btn-toggle-ngrok" disabled>Start Cloudflare Tunnel</button>
                </div>
                
                <div class="stats-row">
                    <span>Active Connections:</span>
                    <span class="stats-value" id="stats-connections">0</span>
                </div>
            </div>
            
            <div class="back-btn-container">
                <button class="btn-back" id="btn-back-menu">← Back to Main Menu</button>
            </div>
        </div>
    `;

    const statusDot = document.getElementById('server-status-dot') as HTMLElement;
    const statusText = document.getElementById('server-status-text') as HTMLElement;
    const localUrlInput = document.getElementById('local-url-input') as HTMLInputElement;
    const publicUrlInput = document.getElementById('public-url-input') as HTMLInputElement;
    const btnCopyLocal = document.getElementById('btn-copy-local') as HTMLButtonElement;
    const btnCopyPublic = document.getElementById('btn-copy-public') as HTMLButtonElement;
    const btnToggleServer = document.getElementById('btn-toggle-server') as HTMLButtonElement;
    const btnToggleNgrok = document.getElementById('btn-toggle-ngrok') as HTMLButtonElement;
    const statsConnections = document.getElementById('stats-connections') as HTMLElement;
    const btnBackMenu = document.getElementById('btn-back-menu') as HTMLButtonElement;

    let isServerRunning = false;
    let isNgrokRunning = false;
    let refreshInterval: ReturnType<typeof setInterval> | null = null;

    const refreshStatus = async () => {
        try {
            const status = await window.electronAPI.getServerStatus();
            isServerRunning = status.running;
            isNgrokRunning = !!status.publicUrl;

            statusDot.className = `status-dot ${isServerRunning ? 'active' : ''}`;
            statusText.textContent = isServerRunning ? `Running on Port ${status.port}` : 'Server Stopped';

            localUrlInput.value = status.localUrl || 'Not running';
            publicUrlInput.value = status.publicUrl || 'Not active';

            btnCopyLocal.disabled = !status.localUrl;
            btnCopyPublic.disabled = !status.publicUrl;

            btnToggleServer.textContent = isServerRunning ? 'Stop Server' : 'Start Server';
            btnToggleServer.className = `server-btn ${isServerRunning ? 'danger' : 'primary'}`;

            btnToggleNgrok.disabled = !isServerRunning;
            btnToggleNgrok.textContent = isNgrokRunning ? 'Stop Cloudflare Tunnel' : 'Start Cloudflare Tunnel';
            btnToggleNgrok.className = `server-btn ${!isServerRunning ? 'danger' : (isNgrokRunning ? 'danger' : 'primary')}`;

            statsConnections.textContent = status.connections.toString();

        } catch (e) {
            console.error('Failed to get server status', e);
        }
    };

    const copyToClipboard = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            alert('Copied to clipboard!');
        } catch (err) {
            console.error('Failed to copy', err);
        }
    };

    btnCopyLocal.addEventListener('click', () => copyToClipboard(localUrlInput.value));
    btnCopyPublic.addEventListener('click', () => copyToClipboard(publicUrlInput.value));

    btnToggleServer.addEventListener('click', async () => {
        btnToggleServer.disabled = true;
        btnToggleServer.textContent = 'Wait...';

        try {
            if (isServerRunning) {
                await window.electronAPI.stopServer();
            } else {
                const res = await window.electronAPI.startServer();
                if (!res.success) {
                    alert('Error starting server: ' + res.error);
                }
            }
        } catch (e: any) {
            alert('Error: ' + e.message);
        } finally {
            await refreshStatus();
            btnToggleServer.disabled = false;
        }
    });

    btnToggleNgrok.addEventListener('click', async () => {
        btnToggleNgrok.disabled = true;
        btnToggleNgrok.textContent = 'Wait...';

        try {
            if (isNgrokRunning) {
                await window.electronAPI.stopNgrok();
            } else {
                const res = await window.electronAPI.startNgrok();
                if (!res.success) {
                    alert('Error starting tunnel: ' + res.error);
                }
            }
        } catch (e: any) {
            alert('Error: ' + e.message);
        } finally {
            await refreshStatus();
            btnToggleNgrok.disabled = false;
        }
    });

    btnBackMenu.addEventListener('click', () => {
        if (refreshInterval) clearInterval(refreshInterval);
        window.location.reload();
    });

    // Initial fetch and start interval
    refreshStatus();
    refreshInterval = setInterval(refreshStatus, 3000);
}
