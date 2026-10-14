import { state, TrackWrapper } from './state';
import { renderReaderUI, getReaderView, resetReaderZoomToFit, renderChapterCompleteScreen, setContainerForKey, animateReaderTo } from './viewer';
import { HtmlAudioTrack } from './audio';
import { Region } from '../../types/models';

export function startModeB(container: HTMLElement) {
    if (!state.currentChapterData || !state.currentChapterData.chapterData) {
        alert("This chapter has no cinematic data (chapter.json missing or invalid).");
        return;
    }

    state.sortedRegions = [...state.currentChapterData.chapterData.regions].sort((a, b) => a.order - b.order);
    state.currentRegionIndex = 0;
    state.bState = 'IDLE';
    if (state.activeAudioTrack) state.activeAudioTrack.pause();
    state.activeAudioTrack = null;

    if (state.sortedRegions.length === 0) {
        alert("No regions defined in this chapter. Switching to Standard Mode A.");
        startModeA(container);
        return;
    }

    setContainerForKey(container);
    renderReaderUI(container, 'Cinematic Mode');
    advanceRegionB(container);
}

export function navigateRegionB(container: HTMLElement, direction: 1 | -1) {
    if (state.bState !== 'WAIT_INPUT') return;

    const nextIndex = state.currentRegionIndex + direction;
    if (nextIndex < 0) return; // Cannot go before start

    state.currentRegionIndex = nextIndex;
    advanceRegionB(container);
}

let isLayerFgActive = true;
let visitedBlurRegions: Region[] = [];
let currentBlurGroupId: string | null = null;
let blurClipId = '';

export function advanceRegionB(container: HTMLElement) {
    if (state.currentRegionIndex >= state.sortedRegions.length) {
        renderChapterCompleteScreen(container, 'cinematic');
        return;
    }

    const currentRegion = state.sortedRegions[state.currentRegionIndex];
    state.bState = 'PLAYING';

    const imgData = state.currentChapterData?.images.find(i => i.name === currentRegion.imageId);
    if (!imgData) return;

    const spans = state.currentChapterData?.chapterData?.audioSpans || [];
    const activeSpan = spans.find(s => currentRegion.order >= s.startRegionOrder && currentRegion.order <= s.endRegionOrder);
    const audioSourceLinks = state.centralAudioLinks;

    if (activeSpan) {
        if (activeSpan.trackId === 'silence') {
            if (state.activeAudioTrack) {
                const track = state.activeAudioTrack;
                state.activeAudioTrack = null;
                const fadeOutInt = setInterval(() => {
                    if (track.volume > 0.05) track.volume -= 0.05;
                    else {
                        track.pause();
                        track.volume = 1;
                        clearInterval(fadeOutInt);
                    }
                }, 50);
            }
        } else if (!state.activeAudioTrack || state.activeAudioTrack.trackId !== activeSpan.trackId) {
            const oldAudio = state.activeAudioTrack;

            let newAudioTrack: TrackWrapper | null = null;
            const localTrackMatch = state.currentChapterData?.audio.find(a => a.name === activeSpan.trackId || a.name === activeSpan.trackId + '.mp3');
            const webTrackUrl = audioSourceLinks[activeSpan.trackId];

            if (localTrackMatch || webTrackUrl) {
                const url = localTrackMatch ? localTrackMatch.url : webTrackUrl!;
                const newAudio = new Audio(url);
                newAudio.loop = activeSpan.loop;
                if (activeSpan.startTime > 0) newAudio.currentTime = activeSpan.startTime;

                newAudio.addEventListener('timeupdate', () => {
                    if (activeSpan.endTime > 0 && newAudio.currentTime >= activeSpan.endTime) {
                        if (activeSpan.loop) {
                            newAudio.currentTime = activeSpan.startTime || 0;
                        } else {
                            newAudio.pause();
                        }
                    }
                });

                newAudioTrack = new HtmlAudioTrack(newAudio, activeSpan.trackId);
            }

            if (newAudioTrack) {
                newAudioTrack.volume = 0;
                newAudioTrack.play();
                state.activeAudioTrack = newAudioTrack;

                let v = 0;
                const fadeInt = setInterval(() => {
                    v += 0.05;
                    if (oldAudio && oldAudio.volume > 0.05) oldAudio.volume -= 0.05;
                    if (v >= 1) {
                        if (newAudioTrack) newAudioTrack.volume = 1;
                        if (oldAudio) { oldAudio.pause(); oldAudio.volume = 1; }
                        clearInterval(fadeInt);
                    } else {
                        if (newAudioTrack) newAudioTrack.volume = v;
                    }
                }, 50);
            }
        }
    } else {
        if (state.activeAudioTrack) {
            const track = state.activeAudioTrack;
            state.activeAudioTrack = null;
            const fadeOutInt = setInterval(() => {
                if (track.volume > 0.05) track.volume -= 0.05;
                else {
                    track.pause();
                    track.volume = 1;
                    clearInterval(fadeOutInt);
                }
            }, 50);
        }
    }

    const imgConfig = state.currentChapterData?.chapterData?.imagesConfig?.[imgData.name];
    const isBlurMode = imgConfig?.blurMode;
    const keepPrevious = (typeof currentRegion.keepPrevious === 'boolean')
        ? currentRegion.keepPrevious
        : (imgConfig?.keepPreviousVisible ?? false);
    const transitionType = currentRegion.transitionType ?
        currentRegion.transitionType :
        (isBlurMode ? 'blur' : 'sharp');

    let isFirstBlurEntry = false;
    if (transitionType === 'blur' && state.currentRegionIndex > 0) {
        const prevRegion = state.sortedRegions[state.currentRegionIndex - 1];
        const prevImgConfig = state.currentChapterData?.chapterData?.imagesConfig?.[prevRegion.imageId];
        const prevIsBlurMode = prevImgConfig?.blurMode;
        const prevTransitionType = prevRegion.transitionType ?
            prevRegion.transitionType :
            (prevIsBlurMode ? 'blur' : 'sharp');
        if (prevTransitionType !== 'blur') {
            isFirstBlurEntry = true;
        }
    }

    const blurSharp = (isBlurMode && currentRegion.transitionType === 'sharp') || isFirstBlurEntry;
    currentBlurGroupId = currentRegion.blurGroupId || null;

    const standardLayer = document.getElementById('reader-standard-layer') as HTMLElement | null;
    if (standardLayer) {
        standardLayer.innerHTML = '';
        standardLayer.style.opacity = '0';
    }

    renderRegionFrame(imgData.url, currentRegion.rect, transitionType, { sharp: blurSharp, keepPrevious }, currentRegion);
    state.bState = 'WAIT_INPUT';
}

function autoFocusOnBlurRegions(blurRegions: Region[], imgScale: number, imgW: number, imgH: number) {
    const view = getReaderView();
    if (!view || blurRegions.length === 0) return;

    const viewW = view.clientWidth;
    const viewH = view.clientHeight;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const r of blurRegions) {
        minX = Math.min(minX, r.rect.x);
        minY = Math.min(minY, r.rect.y);
        maxX = Math.max(maxX, r.rect.x + r.rect.w);
        maxY = Math.max(maxY, r.rect.y + r.rect.h);
    }

    const boxCenterX = viewW / 2 - (imgW * imgScale) / 2 + ((minX + maxX) / 2) * imgScale;
    const boxCenterY = viewH / 2 - (imgH * imgScale) / 2 + ((minY + maxY) / 2) * imgScale;
    const boxW = (maxX - minX) * imgScale;
    const boxH = (maxY - minY) * imgScale;

    const focusPadding = 80;
    const targetZoom = Math.min(
        (viewW - focusPadding * 2) / boxW,
        (viewH - focusPadding * 2) / boxH,
        state.ZOOM_MAX
    );
    const clampedZoom = Math.max(state.fitZoom, targetZoom);

    const targetPanX = (viewW / 2 - boxCenterX) * clampedZoom;
    const targetPanY = (viewH / 2 - boxCenterY) * clampedZoom;

    animateReaderTo(clampedZoom, targetPanX, targetPanY);
}

function renderRegionFrame(imgUrl: string, rect: any, transitionType: 'fade' | 'sharp' | 'blur', blurOpts?: { sharp?: boolean; keepPrevious?: boolean }, region?: Region) {
    const layerFg = document.getElementById('layer-fg');
    const layerBg = document.getElementById('layer-bg');
    if (!layerFg || !layerBg) return;

    const activeLayer = isLayerFgActive ? layerFg : layerBg;
    const inactiveLayer = isLayerFgActive ? layerBg : layerFg;

    const view = getReaderView();
    const viewRect = view ? view.getBoundingClientRect() : document.body.getBoundingClientRect();

    let htmlContent = '';

    if (transitionType === 'blur') {
        const keepPrevious = blurOpts?.keepPrevious;

        visitedBlurRegions = [];
        let tempMasked: string | null = null;
        let tempGroupId: string | null = null;

        for (let i = 0; i <= state.currentRegionIndex; i++) {
            const r = state.sortedRegions[i];
            const rImgData = state.currentChapterData?.images.find(img => img.name === r.imageId);
            const rUrl = rImgData?.url || null;
            const rGroupId = r.blurGroupId || null;

            if (tempMasked !== rUrl || tempGroupId !== rGroupId) {
                tempMasked = rUrl;
                visitedBlurRegions = [];
                tempGroupId = rGroupId;
            }

            const rImgConfig = state.currentChapterData?.chapterData?.imagesConfig?.[r.imageId];
            const rKeep = (typeof r.keepPrevious === 'boolean') ? r.keepPrevious : (rImgConfig?.keepPreviousVisible ?? false);

            if (rKeep) {
                visitedBlurRegions.push(r);
            } else {
                visitedBlurRegions = [r];
            }
        }

        blurClipId = `blur-clip-${Date.now()}`;
        const renderFullBackground = !currentBlurGroupId;

        if (keepPrevious) {
            htmlContent = `
            <div style="position: relative; width: 100%; height: 100%; display: flex; justify-content: center; align-items: center; overflow: hidden;">
               <div id="blur-container-wrap-${Date.now()}" style="position: absolute; transform: translate(-50%, -50%); top: 50%; left: 50%;">
                   <svg width="0" height="0" style="position:absolute">
                       <defs>
                           <clipPath id="${blurClipId}"></clipPath>
                       </defs>
                   </svg>
                   ${renderFullBackground ? `<img class="anim-img-bg" src="${imgUrl}" style="
                      display: block;
                      position: absolute;
                      top: 0; left: 0;
                      width: 100%; height: 100%;
                      filter: blur(12px) brightness(0.45);
                   " />` : ''}
                   <img class="anim-img-fg" src="${imgUrl}" style="
                      position: absolute;
                      top: 0; left: 0;
                      width: 100%; height: 100%;
                      clip-path: url(#${blurClipId});
                   " />
               </div>
            </div>`;
        } else {
            htmlContent = `
            <div style="position: relative; width: 100%; height: 100%; display: flex; justify-content: center; align-items: center; overflow: hidden;">
               <div id="blur-container-wrap-${Date.now()}" style="position: absolute; transform: translate(-50%, -50%); top: 50%; left: 50%;">
                   ${renderFullBackground ? `<img class="anim-img-bg" src="${imgUrl}" style="
                      display: block;
                      position: absolute;
                      top: 0; left: 0;
                      width: 100%; height: 100%;
                      filter: blur(12px) brightness(0.45);
                   " />` : ''}
                   <img class="anim-img-fg" src="${imgUrl}" style="
                      position: absolute;
                      top: 0; left: 0;
                      width: 100%; height: 100%;
                   " />
               </div>
            </div>`;
        }
    } else {
        const scaleW = viewRect.width / (rect.w || 1);
        const scaleH = viewRect.height / (rect.h || 1);
        const scale = Math.min(scaleW, scaleH);

        let clipPathStyle = '';
        if (region?.shapeType === 'polygon' && region.polygon) {
            const points = region.polygon.map(p => `${(p.x - rect.x) * scale}px ${(p.y - rect.y) * scale}px`).join(', ');
            clipPathStyle = `clip-path: polygon(${points});`;
        }

        htmlContent = `
        <div style="position: relative; overflow: hidden; width: ${rect.w * scale}px; height: ${rect.h * scale}px; box-shadow: 0 0 50px rgba(0,0,0,0.8); border: 2px solid #222; ${clipPathStyle}">
           <img class="anim-img-fg" src="${imgUrl}" style="
              position: absolute; 
              transform-origin: top left; 
              width: 100%;
              transform: translate(-${rect.x * scale}px, -${rect.y * scale}px);
              transition: transform 0.8s ease-in-out;
           " />
        </div>`;
    }

    inactiveLayer.innerHTML = htmlContent;
    const imgFg = inactiveLayer.querySelector('.anim-img-fg') as HTMLImageElement;

    const finalizeFrame = () => {
        const targetVisibleLayer = inactiveLayer;
        const targetHiddenLayer = activeLayer;

        isLayerFgActive = !isLayerFgActive;
        const imgW = imgFg.naturalWidth;
        const imgH = imgFg.naturalHeight;

        if (transitionType === 'blur') {
            const scaleW = viewRect.width / (imgW || 1);
            const scaleH = viewRect.height / (imgH || 1);
            const scale = Math.min(scaleW, scaleH);

            const wrap = targetVisibleLayer.querySelector('div[id^="blur-container-wrap-"]') as HTMLElement | null;
            if (wrap) {
                wrap.style.width = `${imgW * scale}px`;
                wrap.style.height = `${imgH * scale}px`;
            }

            if (blurOpts?.keepPrevious) {
                const clipEl = document.getElementById(blurClipId);
                if (clipEl) {
                    for (const r of visitedBlurRegions) {
                        if (r.shapeType === 'polygon' && r.polygon) {
                            const svgPoly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
                            const points = r.polygon.map(p => `${p.x * scale},${p.y * scale}`).join(' ');
                            svgPoly.setAttribute('points', points);
                            clipEl.appendChild(svgPoly);
                        } else {
                            const svgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                            svgRect.setAttribute('x', String(r.rect.x * scale));
                            svgRect.setAttribute('y', String(r.rect.y * scale));
                            svgRect.setAttribute('width', String(r.rect.w * scale));
                            svgRect.setAttribute('height', String(r.rect.h * scale));
                            svgRect.setAttribute('rx', '6');
                            svgRect.setAttribute('ry', '6');
                            clipEl.appendChild(svgRect);
                        }
                    }
                }
                imgFg.style.transform = 'none';
            } else {
                imgFg.style.transition = 'none';
                if (region?.shapeType === 'polygon' && region.polygon) {
                    const points = region.polygon.map(p => `${p.x * scale}px ${p.y * scale}px`).join(', ');
                    imgFg.style.clipPath = `polygon(${points})`;
                } else {
                    const top = rect.y * scale;
                    const left = rect.x * scale;
                    const right = (imgW - (rect.x + rect.w)) * scale;
                    const bottom = (imgH - (rect.y + rect.h)) * scale;
                    imgFg.style.clipPath = `inset(${top}px ${right}px ${bottom}px ${left}px round 6px)`;
                }
                imgFg.style.transform = 'none';
            }
        } else {
            const scaleW = viewRect.width / (rect.w || 1);
            const scaleH = viewRect.height / (rect.h || 1);
            const scale = Math.min(scaleW, scaleH);

            imgFg.style.width = `${imgW * scale}px`;
            imgFg.style.height = `${imgH * scale}px`;

            requestAnimationFrame(() => {
                imgFg.style.transform = `translate(-${rect.x * scale}px, -${rect.y * scale}px)`;
            });
        }

        const isSharpTrans = transitionType === 'sharp' || (transitionType === 'blur' && blurOpts?.sharp);
        const fadeDur = transitionType === 'blur' ? '0.8s' : '1.5s';

        if (isSharpTrans) {
            targetVisibleLayer.style.transition = 'none';
            targetHiddenLayer.style.transition = 'none';
            targetVisibleLayer.style.opacity = '1';
            targetHiddenLayer.style.opacity = '0';

            setTimeout(() => {
                targetVisibleLayer.style.transition = `opacity ${fadeDur} ease-in-out`;
                targetHiddenLayer.style.transition = `opacity ${fadeDur} ease-in-out`;
            }, 50);
        } else {
            targetVisibleLayer.style.transition = `opacity ${fadeDur} ease-in-out`;
            targetHiddenLayer.style.transition = `opacity ${fadeDur} ease-in-out`;
            targetVisibleLayer.style.opacity = '1';
            targetHiddenLayer.style.opacity = '0';
        }

        if (transitionType === 'blur' && blurOpts?.keepPrevious && currentBlurGroupId && visitedBlurRegions.length > 0) {
            const focusPad = 50;
            const focusScaleW = (viewRect.width - focusPad * 2) / (imgW || 1);
            const focusScaleH = (viewRect.height - focusPad * 2) / (imgH || 1);
            const focusScale = Math.min(focusScaleW, focusScaleH);
            autoFocusOnBlurRegions(visitedBlurRegions, focusScale, imgW, imgH);
        } else {
            resetReaderZoomToFit();
        }
    };

    if (imgFg.complete) finalizeFrame();
    else imgFg.onload = finalizeFrame;
}

export function startModeA(container: HTMLElement) {
    state.sortedRegions = []; // flag for Mode A
    state.currentImageIndex = 0;
    setContainerForKey(container);
    renderReaderUI(container, 'Standard Mode');
    renderImageA(container);
}

export function renderImageA(container: HTMLElement) {
    if (!state.currentChapterData) return;
    if (state.currentImageIndex >= state.currentChapterData.images.length) {
        renderChapterCompleteScreen(container, 'standard');
        return;
    }

    const imgData = state.currentChapterData.images[state.currentImageIndex];
    const standardLayer = document.getElementById('reader-standard-layer') as HTMLElement | null;
    const layerBg = document.getElementById('layer-bg') as HTMLElement | null;
    const layerFg = document.getElementById('layer-fg') as HTMLElement | null;

    if (standardLayer) {
        standardLayer.style.opacity = '1';
        standardLayer.innerHTML = `<img id="reader-mode-a-image" class="reader-mode-a-image" src="${imgData.url}" />`;
    }
    if (layerBg) {
        layerBg.innerHTML = '';
        layerBg.style.opacity = '0';
    }
    if (layerFg) {
        layerFg.innerHTML = '';
        layerFg.style.opacity = '0';
    }

    const img = document.getElementById('reader-mode-a-image') as HTMLImageElement | null;
    if (img) {
        if (img.complete) {
            resetReaderZoomToFit();
        } else {
            img.onload = () => {
                resetReaderZoomToFit();
            };
        }
    }
}

export function nextImageA(container: HTMLElement) {
    state.currentImageIndex++;
    renderImageA(container);
}

export function prevImageA(container: HTMLElement) {
    if (state.currentImageIndex > 0) {
        state.currentImageIndex--;
        renderImageA(container);
    }
}
