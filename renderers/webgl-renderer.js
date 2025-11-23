import { initWebGL, createBuffer, createFloatTexture, createRGBA8Texture, createFramebuffer } from '../webgl-utils/webgl-setup.js';
import { compileShader, createProgram } from '../webgl-utils/shader-utils.js';
import { vertexShader } from '../shaders/vertex.js';
import { fragmentSampleLdzShader } from '../shaders/sample-ldz.js';
import { fragmentVisualizeShader } from '../shaders/visualize.js';
import { fragmentShader } from '../shaders/fragment/berry.js';


export class WebGLRenderer {
    constructor(canvasId, stateManager) {
        this.stateManager = stateManager;

        this.canvas = document.getElementById(canvasId);
        this.gl = initWebGL(this.canvas);
        const gl = this.gl;

        const vs = compileShader(gl, vertexShader, gl.VERTEX_SHADER);
        const fs = compileShader(gl, fragmentShader, gl.FRAGMENT_SHADER);
        const fsSample = compileShader(gl, fragmentSampleLdzShader, gl.FRAGMENT_SHADER);
        const fsVis = compileShader(gl, fragmentVisualizeShader, gl.FRAGMENT_SHADER);

        this.ldzProgram = createProgram(gl, vs, fs);
        this.sampleProgram = createProgram(gl, vs, fsSample);
        this.visualizeProgram = createProgram(gl, vs, fsVis);

        this.attributeLocs = {
            ldz: {
                a_position: gl.getAttribLocation(this.ldzProgram, 'a_position')
            },
            sample: {
                a_position: gl.getAttribLocation(this.sampleProgram, 'a_position')
            },
            visualize: {
                a_position: gl.getAttribLocation(this.visualizeProgram, 'a_position')
            }
        };
        this.uniformLocs = {
            ldz: {
                u_aspect: gl.getUniformLocation(this.ldzProgram, 'u_aspect'),
                u_prng_seed: gl.getUniformLocation(this.ldzProgram, 'u_prng_seed'),
                u_tile_offset: gl.getUniformLocation(this.ldzProgram, 'u_tile_offset'),
                u_tile_scale: gl.getUniformLocation(this.ldzProgram, 'u_tile_scale')
            },
            sample: {
                u_tile_offset: gl.getUniformLocation(this.sampleProgram, 'u_tile_offset'),
                u_tile_scale: gl.getUniformLocation(this.sampleProgram, 'u_tile_scale'),
                u_ldz_texture: gl.getUniformLocation(this.sampleProgram, 'u_ldz_texture')
            },
            visualize: {
                u_tile_offset: gl.getUniformLocation(this.visualizeProgram, 'u_tile_offset'),
                u_tile_scale: gl.getUniformLocation(this.visualizeProgram, 'u_tile_scale'),
                u_texture: gl.getUniformLocation(this.visualizeProgram, 'u_texture'),
                u_mode: gl.getUniformLocation(this.visualizeProgram, 'u_mode')
            }
        };

        // Full-screen quad
        const positions = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
        this.posBuffer = createBuffer(gl, positions);

        this.adaptToDimensions();

        this.canvas.addEventListener('click', async () => {
            const currentMode = this.stateManager.get('visualizationMode');
            await this.stateManager.setState({
                visualizationMode: (currentMode + 1) % 3
            });
        });

        this.stateManager.subscribe(['webglSeed'], async () => {
            await this.renderLdzTiled();
        });

        this.stateManager.subscribe(['dimensions'], async () => {
            this.adaptToDimensions();
            await this.renderLdzTiled();
        });

        this.stateManager.subscribe(['visualizationMode'], () => {
            this.renderDebug();
        });
    }

    adaptToDimensions() {
        const gl = this.gl;
        const { width, height, debugWidth, debugHeight } = this.stateManager.get('dimensions');

        if (this.ldzTexture) {
            gl.deleteTexture(this.ldzTexture);
        }
        if (this.ldzFramebuffer) {
            gl.deleteFramebuffer(this.ldzFramebuffer);
        }
        if (this.debugTexture) {
            gl.deleteTexture(this.debugTexture);
        }
        if (this.debugFramebuffer) {
            gl.deleteFramebuffer(this.debugFramebuffer);
        }

        this.tileSize = Math.min(
            1024,
            Math.max(width, height),
            gl.getParameter(gl.MAX_TEXTURE_SIZE),
            gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)
        );

        this.width = width;
        this.height = height;
        this.debugWidth = debugWidth;
        this.debugHeight = debugHeight;

        this.canvas.width = debugWidth;
        this.canvas.height = debugHeight;

        this.ldzTexture = createFloatTexture(gl, this.tileSize, this.tileSize);
        this.ldzFramebuffer = createFramebuffer(gl, [this.ldzTexture]);
        this.debugTexture = createRGBA8Texture(gl, debugWidth, debugHeight);
        this.debugFramebuffer = createFramebuffer(gl, [this.debugTexture]);

        this.ldzData = new Float32Array(width * height * 4);
    }

    #setupQuadRender(program, positionAttribLoc) {
        const gl = this.gl;
        gl.useProgram(program);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer);
        gl.enableVertexAttribArray(positionAttribLoc);
        gl.vertexAttribPointer(positionAttribLoc, 2, gl.FLOAT, false, 0, 0);
    }

    #drawQuad() {
        this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
    }

    async renderLdzTiled() {
        await this.stateManager.setState({ isRendering: true });

        try {
            const gl = this.gl;
            const seed = this.stateManager.get('webglSeed');

            const xTileCount = Math.ceil(this.width / this.tileSize);
            const yTileCount = Math.ceil(this.height / this.tileSize);
            const xTileScale = this.tileSize / this.width;
            const yTileScale = this.tileSize / this.height;
            const tileData = new Float32Array(this.tileSize * this.tileSize * 4);

            // Helper function to copy tile data into the full ldzData array
            const copyTileToLdzData = (tileData, xStart, yStart, validWidth, validHeight) => {
                const srcStride = validWidth * 4;
                const dstStride = this.width * 4;

                // Optimize for full-width tiles
                if (validWidth === this.width && xStart === 0) {
                    const srcLength = validHeight * srcStride;
                    const dstStart = yStart * dstStride;
                    this.ldzData.set(tileData.subarray(0, srcLength), dstStart);
                } else { // Copy row by row for partial-width tiles
                    for (let row = 0; row < validHeight; row++) {
                        const srcStart = row * srcStride;
                        const dstStart = (yStart + row) * dstStride + xStart * 4;
                        this.ldzData.set(tileData.subarray(srcStart, srcStart + srcStride), dstStart);
                    }
                }
            };

            console.log(`Rendering to ${xTileCount}x${yTileCount} tiles of size ${this.tileSize}`);

            for (let yTile = 0; yTile < yTileCount; yTile++) {
                for (let xTile = 0; xTile < xTileCount; xTile++) {
                    console.log(`Rendering tile ${yTile * xTileCount + xTile + 1}/${xTileCount * yTileCount}`);

                    // Calculate valid region for edge tiles
                    const xStart = xTile * this.tileSize;
                    const yStart = yTile * this.tileSize;
                    const validWidth = Math.min(this.tileSize, this.width - xStart);
                    const validHeight = Math.min(this.tileSize, this.height - yStart);

                    gl.bindFramebuffer(gl.FRAMEBUFFER, this.ldzFramebuffer);
                    gl.viewport(0, 0, validWidth, validHeight);
                    this.#setupQuadRender(this.ldzProgram, this.attributeLocs.ldz.a_position);

                    gl.uniform1f(this.uniformLocs.ldz.u_aspect, this.width / this.height);
                    gl.uniform1ui(this.uniformLocs.ldz.u_prng_seed, seed);

                    gl.uniform2f(this.uniformLocs.ldz.u_tile_offset, xTile * xTileScale, yTile * yTileScale);
                    gl.uniform2f(this.uniformLocs.ldz.u_tile_scale, xTileScale * (validWidth / this.tileSize), yTileScale * (validHeight / this.tileSize));

                    this.#drawQuad();

                    gl.readBuffer(gl.COLOR_ATTACHMENT0);
                    gl.readPixels(0, 0, validWidth, validHeight, gl.RGBA, gl.FLOAT, tileData);

                    copyTileToLdzData(tileData, xStart, yStart, validWidth, validHeight);

                    this.renderLdzTileToDebug(xTile, yTile);
                    this.renderDebug();

                    await new Promise(resolve => setTimeout(resolve, 0));
                }
            }
        } finally {
            await this.stateManager.setState({ isRendering: false });
        }
    }

    renderLdzTileToDebug(xTile, yTile) {
        const gl = this.gl;
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.debugFramebuffer);

        // Compute debug region for this tile
        const xStart = xTile * this.tileSize;
        const yStart = yTile * this.tileSize;
        const validWidth = Math.min(this.tileSize, this.width - xStart);
        const validHeight = Math.min(this.tileSize, this.height - yStart);

        const debugX0 = xStart / this.width * this.debugWidth;
        const debugY0 = yStart / this.height * this.debugHeight;
        const debugX1 = (xStart + validWidth) / this.width * this.debugWidth;
        const debugY1 = (yStart + validHeight) / this.height * this.debugHeight;

        const viewportX = Math.round(debugX0);
        const viewportY = Math.round(debugY0);
        const viewportW = Math.round(debugX1) - viewportX;
        const viewportH = Math.round(debugY1) - viewportY;

        gl.viewport(viewportX, viewportY, viewportW, viewportH);
        this.#setupQuadRender(this.sampleProgram, this.attributeLocs.sample.a_position);

        gl.uniform2f(this.uniformLocs.sample.u_tile_offset, 0.0, 0.0);
        gl.uniform2f(this.uniformLocs.sample.u_tile_scale, validWidth / this.tileSize, validHeight / this.tileSize);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.ldzTexture);
        gl.uniform1i(this.uniformLocs.sample.u_ldz_texture, 0);

        this.#drawQuad();
    }

    renderDebug() {
        const gl = this.gl;
        const visualizationMode = this.stateManager.get('visualizationMode');

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, this.debugWidth, this.debugHeight);
        this.#setupQuadRender(this.visualizeProgram, this.attributeLocs.visualize.a_position);

        gl.uniform2f(this.uniformLocs.visualize.u_tile_offset, 0.0, 0.0);
        gl.uniform2f(this.uniformLocs.visualize.u_tile_scale, 1.0, 1.0);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.debugTexture);
        gl.uniform1i(this.uniformLocs.visualize.u_texture, 0);

        gl.uniform1i(this.uniformLocs.visualize.u_mode, visualizationMode);

        this.#drawQuad();
    }

    getLdzData() {
        return this.ldzData;
    }
}
