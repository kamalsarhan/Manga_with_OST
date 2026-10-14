import { state } from './state';
import { formatTime } from '../shared/utils';
import { FileData } from '../../types/ipc';

export function initPlayer() {
    const audioEl = document.getElementById('audio-element') as HTMLAudioElement;
    const playerTrackSel = document.getElementById('player-track-select') as HTMLSelectElement;
    const playerSeek = document.getElementById('player-seek') as HTMLInputElement;
    const playerVolume = document.getElementById('player-volume') as HTMLInputElement;
    const playerTime = document.getElementById('player-time') as HTMLSpanElement;
    const playerDuration = document.getElementById('player-duration') as HTMLSpanElement;
    const playerLoop = document.getElementById('player-loop') as HTMLInputElement;

    playerTrackSel.addEventListener('change', () => {
        const opt = playerTrackSel.selectedOptions[0];
        const url = opt?.getAttribute('data-url');
        if (url) {
            audioEl.src = url;
            audioEl.load();
            playerSeek.value = '0';
            playerTime.textContent = '0:00';
            playerDuration.textContent = '0:00';
        } else {
            audioEl.pause();
            audioEl.src = '';
        }
    });

    state.on('player:load', (track: FileData) => {
        playerTrackSel.value = track.name;
        audioEl.src = track.url;
        audioEl.load();
        playerSeek.value = '0';
        playerTime.textContent = '0:00';
        playerDuration.textContent = '0:00';
    });

    document.getElementById('btn-play')?.addEventListener('click', () => {
        if (audioEl.src) {
            audioEl.play();
        }
    });
    
    document.getElementById('btn-pause')?.addEventListener('click', () => {
        audioEl.pause();
    });
    
    document.getElementById('btn-stop')?.addEventListener('click', () => {
        audioEl.pause();
        audioEl.currentTime = 0;
        playerSeek.value = '0';
        playerTime.textContent = '0:00';
    });

    audioEl.addEventListener('loadedmetadata', () => {
        playerDuration.textContent = formatTime(audioEl.duration);
        playerSeek.max = String(audioEl.duration);
    });

    audioEl.addEventListener('timeupdate', () => {
        playerTime.textContent = formatTime(audioEl.currentTime);
        if (!isNaN(audioEl.duration)) {
            playerSeek.value = String(audioEl.currentTime);
        }
    });

    playerSeek.addEventListener('input', () => {
        audioEl.currentTime = parseFloat(playerSeek.value);
    });

    playerVolume.addEventListener('input', () => {
        const vol = parseInt(playerVolume.value);
        audioEl.volume = vol / 100;
    });
    audioEl.volume = parseInt(playerVolume.value) / 100;

    playerLoop.addEventListener('change', () => {
        audioEl.loop = playerLoop.checked;
    });
}
