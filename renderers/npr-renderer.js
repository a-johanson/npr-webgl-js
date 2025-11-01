import { renderFromLDZ } from '../npr/stippling.js';


export class NprRenderer {
    constructor(canvasId, webglRenderer, stateManager) {
        this.webglRenderer = webglRenderer;
        this.stateManager = stateManager;

        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');

        this.adaptToDimensions();

        this.stateManager.subscribe(['nprSeed'], () => {
            this.stateManager.setState({ nprIsDirty: false });
            this.render();
        });

        this.stateManager.subscribe(['dimensions'], () => {
            this.stateManager.setState({ nprIsDirty: false });
            this.adaptToDimensions();
            this.render();
        });

        this.render();
    }

    adaptToDimensions() {
        const { width, height } = this.stateManager.get('dimensions');

        this.width = width;
        this.height = height;

        this.canvas.width = width;
        this.canvas.height = height;
    }

    render() {
        const seed = this.stateManager.get('nprSeed');
        const dpi = this.stateManager.get('dpi');
        const ldzData = this.webglRenderer.getLdzData();

        this.ctx.fillStyle = '#fff';
        this.ctx.fillRect(0, 0, this.width, this.height);

        this.ctx.save();
        this.ctx.translate(0, this.height);
        this.ctx.scale(1, -1);
        renderFromLDZ(this.ctx, ldzData, this.width, this.height, dpi, seed);
        this.ctx.restore();
    }
}
