import { renderFromLDZ } from '../npr/programs/diatom.js';


export class NprRenderer {
    constructor(canvasId, webglRenderer, stateManager) {
        this.webglRenderer = webglRenderer;
        this.stateManager = stateManager;

        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d', { 
            alpha: false,
            colorSpace: 'srgb',
            willReadFrequently: false
        });

        this.adaptToDimensions();

        this.stateManager.subscribe(['nprSeed'], async () => {
            await this.render();
        });

        this.stateManager.subscribe(['dimensions'], async () => {
            this.adaptToDimensions();
            await this.render();
        });
    }

    adaptToDimensions() {
        const { width, height } = this.stateManager.get('dimensions');

        this.width = width;
        this.height = height;

        this.canvas.width = width;
        this.canvas.height = height;
    }

    async render() {
        await this.stateManager.setState({ isRendering: true });

        try {
            const seed = this.stateManager.get('nprSeed');
            const dpi = this.stateManager.get('dpi');
            const ldzData = this.webglRenderer.getLdzData();

            this.ctx.save();
            this.ctx.translate(0, this.height);
            this.ctx.scale(1, -1);
            renderFromLDZ(this.ctx, ldzData, this.width, this.height, dpi, seed);
            this.ctx.restore();

            await this.stateManager.setState({ nprIsDirty: false });
        } finally {
            await this.stateManager.setState({ isRendering: false });
        }
    }
}
