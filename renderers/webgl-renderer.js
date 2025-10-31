import { initWebGL, createBuffer, createFloatTexture, createFramebuffer } from '../webgl-utils/webgl-setup.js';
import { compileShader, createProgram } from '../webgl-utils/shader-utils.js';
import { vertexShader } from '../shaders/vertex.js';
import { fragmentVisualizeShader } from '../shaders/visualize.js';
import { fragmentShader } from '../shaders/fragment/fibonacci.js';


export class WebGLRenderer {
    constructor(canvasId, stateManager) {
        this.stateManager = stateManager;

        this.canvas = document.getElementById(canvasId);
        this.gl = initWebGL(this.canvas);
        const gl = this.gl;

        const vs = compileShader(gl, vertexShader, gl.VERTEX_SHADER);
        const fs = compileShader(gl, fragmentShader, gl.FRAGMENT_SHADER);
        const fsVis = compileShader(gl, fragmentVisualizeShader, gl.FRAGMENT_SHADER);

        this.shaderProgram = createProgram(gl, vs, fs);
        this.visualizeProgram = createProgram(gl, vs, fsVis);

        // Full-screen quad
        const positions = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
        this.posBuffer = createBuffer(gl, positions);

        this.canvas.addEventListener('click', () => {
            const currentMode = this.stateManager.get('visualizationMode');
            this.stateManager.setState({ 
                visualizationMode: (currentMode + 1) % 3 
            });
        });

        this.adaptToDimensions();

        this.stateManager.subscribe(['webglSeed'], () => {
            this.renderRayMarch();
            this.renderDebug();
        });

        this.stateManager.subscribe(['dimensions'], () => {
            this.adaptToDimensions();
            this.renderRayMarch();
            this.renderDebug();
        });

        this.stateManager.subscribe(['visualizationMode'], () => {
            this.renderDebug();
        });

        this.renderRayMarch();
        this.renderDebug();
    }

    adaptToDimensions() {
        const gl = this.gl;
        const { width, height, debugWidth, debugHeight } = this.stateManager.get('dimensions');

        if (this.ldzTexture) {
            gl.deleteTexture(this.ldzTexture);
        }
        if (this.framebuffer) {
            gl.deleteFramebuffer(this.framebuffer);
        }

        this.width = width;
        this.height = height;
        this.debugWidth = debugWidth;
        this.debugHeight = debugHeight;

        this.canvas.width = debugWidth;
        this.canvas.height = debugHeight;

        this.ldzTexture = createFloatTexture(gl, width, height);
        this.framebuffer = createFramebuffer(gl, [this.ldzTexture]);
        this.ldzData = new Float32Array(width * height * 4);
    }

    renderRayMarch() {
        const gl = this.gl;
        const seed = this.stateManager.get('webglSeed');

        gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
        gl.viewport(0, 0, this.width, this.height);
        gl.useProgram(this.shaderProgram);

        const a_position = gl.getAttribLocation(this.shaderProgram, 'a_position');
        gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer);
        gl.enableVertexAttribArray(a_position);
        gl.vertexAttribPointer(a_position, 2, gl.FLOAT, false, 0, 0);

        const u_aspect = gl.getUniformLocation(this.shaderProgram, 'u_aspect');
        gl.uniform1f(u_aspect, this.width / this.height);

        const u_prng_seed = gl.getUniformLocation(this.shaderProgram, 'u_prng_seed');
        gl.uniform1ui(u_prng_seed, seed);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        gl.readBuffer(gl.COLOR_ATTACHMENT0);
        gl.readPixels(0, 0, this.width, this.height, gl.RGBA, gl.FLOAT, this.ldzData);
    }

    renderDebug() {
        const gl = this.gl;
        const visualizationMode = this.stateManager.get('visualizationMode');

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, this.debugWidth, this.debugHeight);
        gl.useProgram(this.visualizeProgram);

        const a_position = gl.getAttribLocation(this.visualizeProgram, 'a_position');
        gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer);
        gl.enableVertexAttribArray(a_position);
        gl.vertexAttribPointer(a_position, 2, gl.FLOAT, false, 0, 0);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.ldzTexture);
        const u_texture = gl.getUniformLocation(this.visualizeProgram, 'u_texture');
        gl.uniform1i(u_texture, 0);

        const u_mode = gl.getUniformLocation(this.visualizeProgram, 'u_mode');
        gl.uniform1i(u_mode, visualizationMode);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    getLdzData() {
        return this.ldzData;
    }
}
