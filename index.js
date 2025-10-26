import { initWebGL, createBuffer, createFloatTexture, createFramebuffer } from './webgl-setup.js';
import { compileShader, createProgram } from './shader-utils.js';
import { vertexShader } from './shaders/vertex.js';
import { fragmentVisualizeShader } from './shaders/visualize.js';
import { fragmentShader } from './shaders/fragment/fibonacci.js';
import { renderFromLDZ } from './npr/stippling.js';


const widthCm = 20;
const heightCm = 20;
const dpi = 150;

const aspectRatio = widthCm / heightCm;
const dpcm = dpi / 2.54; // dots per cm
const width = Math.round(widthCm * dpcm);
const height = Math.round(heightCm * dpcm);

const debugWidth = width;
const debugHeight = Math.round(debugWidth / aspectRatio);


const { gl, canvas: debugCanvas } = initWebGL('debugCanvas', debugWidth, debugHeight);
const outputCanvas = document.getElementById('outputCanvas');
outputCanvas.width = width;
outputCanvas.height = height;
const ctx2d = outputCanvas.getContext('2d');

const vs = compileShader(gl, vertexShader, gl.VERTEX_SHADER);
const fs = compileShader(gl, fragmentShader, gl.FRAGMENT_SHADER);
const fsVis = compileShader(gl, fragmentVisualizeShader, gl.FRAGMENT_SHADER);

const shaderProgram = createProgram(gl, vs, fs);
const visualizeProgram = createProgram(gl, vs, fsVis);

// Create full-screen quad
const positions = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
const posBuffer = createBuffer(gl, positions);


// Create RGBA32F textures for LDZ and hit position
const ldzTexture = createFloatTexture(gl, width, height);

// Create framebuffer and attach both textures for MRT using helper
const framebuffer = createFramebuffer(gl, [ldzTexture]);

// Buffers for reading back data
const ldzData = new Float32Array(width * height * 4);

let visualizationMode = 0;

function renderDebugCanvas() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, debugWidth, debugHeight);
    gl.useProgram(visualizeProgram);

    const a_quadPositionVis = gl.getAttribLocation(visualizeProgram, 'a_position');
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    gl.enableVertexAttribArray(a_quadPositionVis);
    gl.vertexAttribPointer(a_quadPositionVis, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, ldzTexture);
    const u_texture = gl.getUniformLocation(visualizeProgram, 'u_texture');
    gl.uniform1i(u_texture, 0);

    const u_mode = gl.getUniformLocation(visualizeProgram, 'u_mode');
    gl.uniform1i(u_mode, visualizationMode);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

// STEP 1: Render results of ray marching to float texture
gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
gl.viewport(0, 0, width, height);
gl.useProgram(shaderProgram);

const a_quadPositionRayMarch = gl.getAttribLocation(shaderProgram, 'a_position');
gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
gl.enableVertexAttribArray(a_quadPositionRayMarch);
gl.vertexAttribPointer(a_quadPositionRayMarch, 2, gl.FLOAT, false, 0, 0);

const u_aspect = gl.getUniformLocation(shaderProgram, 'u_aspect');
gl.uniform1f(u_aspect, width / height);

gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

// STEP 2: Read back data from both textures
gl.readBuffer(gl.COLOR_ATTACHMENT0);
gl.readPixels(0, 0, width, height, gl.RGBA, gl.FLOAT, ldzData);

// STEP 3: Visualize the RGBA float texture on debugCanvas using visualizeProgram
renderDebugCanvas();


ctx2d.fillStyle = '#fff';
ctx2d.fillRect(0, 0, width, height);
ctx2d.save();
ctx2d.translate(0, height);
ctx2d.scale(1, -1);
renderFromLDZ(ctx2d, ldzData, width, height, dpi);
ctx2d.restore();

// Click to change visualization mode and show pixel data
debugCanvas.addEventListener('click', () => {
    visualizationMode = (visualizationMode + 1) % 3; // 3 visualization modes
    renderDebugCanvas();
});
