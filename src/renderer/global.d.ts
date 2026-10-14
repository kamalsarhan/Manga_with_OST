declare module '*.css' {
  const content: { [className: string]: string } | string;
  export default content;
}

import { ElectronAPI } from '../types/ipc';

declare global {
    interface Window {
        electronAPI: ElectronAPI;
    }
}
