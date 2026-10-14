import { renderSetup } from './setup';
import { renderHome } from './library';

export function initReader(container: HTMLElement) {
    checkAndRender(container);
}

async function checkAndRender(container: HTMLElement) {
    const config = await window.electronAPI.getDirectoryConfig();
    if (config) {
        renderHome(container);
    } else {
        renderSetup(container);
    }
}
