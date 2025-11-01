import { StateManager } from './state-manager.js';
import { WebGLRenderer } from './renderers/webgl-renderer.js';
import { NprRenderer } from './renderers/npr-renderer.js';

// ======= Configuration =======
const widthCm = 20;
const heightCm = 20;
const dpi = 150;
const debugScale = 1.0;
const webglSeed = 0;
const nprSeed = '52769ff2367023';
// =============================


function computeDimensions(dpi) {
    const aspectRatio = widthCm / heightCm;
    const dpcm = dpi / 2.54;
    const width = Math.round(widthCm * dpcm);
    const height = Math.round(heightCm * dpcm);
    const debugWidth = debugScale * width;
    const debugHeight = Math.round(debugWidth / aspectRatio);

    return { width, height, debugWidth, debugHeight };
}


const stateManager = new StateManager({
    webglSeed,
    nprSeed,
    dpi,
    dimensions: computeDimensions(dpi),
    visualizationMode: 0,
    nprIsDirty: false
});

const webglRenderer = new WebGLRenderer('debugCanvas', stateManager);
const nprRenderer = new NprRenderer('outputCanvas', webglRenderer, stateManager);

const dpiInput = document.getElementById('dpi');
const webglSeedInput = document.getElementById('webglSeed');
const nprSeedInput = document.getElementById('nprSeed');

dpiInput.value = String(stateManager.get('dpi'));
webglSeedInput.value = String(stateManager.get('webglSeed'));
nprSeedInput.value = stateManager.get('nprSeed');

document.getElementById('applyDpi').addEventListener('click', () => {
    const newDpi = parseInt(dpiInput.value) || dpi;
    stateManager.setState({
        dpi: newDpi,
        dimensions: computeDimensions(newDpi)
    });
});

document.getElementById('randomizeWebGLSeed').addEventListener('click', () => {
    const randomSeed = Math.floor(Math.random() * 0x100000000);
    webglSeedInput.value = String(randomSeed);
    console.log('Random WebGL seed:', randomSeed);
    stateManager.setState({ webglSeed: randomSeed, nprIsDirty: true });
});

document.getElementById('applyWebGLSeed').addEventListener('click', () => {
    const parsedInt = parseInt(webglSeedInput.value);
    const newSeed = Number.isNaN(parsedInt) ? webglSeed : parsedInt;
    stateManager.setState({ webglSeed: newSeed, nprIsDirty: true });
});

document.getElementById('applyNprSeed').addEventListener('click', () => {
    const newSeed = nprSeedInput.value || nprSeed;
    stateManager.setState({ nprSeed: newSeed });
    if (stateManager.get('nprIsDirty')) {
        stateManager.setState({ nprIsDirty: false });
        nprRenderer.render();
    }
});
