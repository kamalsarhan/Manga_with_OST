import { registerDirectoryHandlers } from './directories';
import { registerChapterHandlers } from './chapter';
import { registerAudioHandlers } from './audio';
import { registerMagiv2Handlers } from './magiv2';
import { registerServerHandlers } from './serverIpc';

export function registerIpcHandlers() {
    registerDirectoryHandlers();
    registerChapterHandlers();
    registerAudioHandlers();
    registerMagiv2Handlers();
    registerServerHandlers();
}
