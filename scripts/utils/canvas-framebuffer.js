import { Framebuffer } from "./framebuffer.js";
import { Logger } from "./logger.js";

export class CanvasFramebuffer extends Framebuffer {
    stage = new PIXI.Container();
    baseTextures = [];

    constructor(...args) {
        super(...args);

        this.stage.transform = new SynchronizedTransform(PIXI.Transform.IDENTITY);
        this.on("update", this.update, this);
    }

    show(index = 0, channel = 0, alpha = 1.0) {
        return super.show(canvas.stage, index, channel, alpha);
    }

    draw() {
        this.stage.transform.reference = canvas.stage.transform;
        this.stage.children.forEach(c => c._parentID = -1);
    }

    refresh() { }

    tearDown() {
        this.stage.removeChildren().forEach(c => c.destroy({ children: true }));
        this.stage.transform.reference = PIXI.Transform.IDENTITY;
        this.baseTextures.forEach(t => t.off("update", this._onBaseTextureUpdate, this));
        this.baseTextures.length = 0;

        this.dispose();
    }

    update() {
        this.render(canvas.app.renderer, this.stage);
    }

    static _nextWarning = 0;

    _onBaseTextureUpdate(baseTexture) {
        if (baseTexture.resource?.source?.tagName === "VIDEO") {
            if (game.user.isGM && game.time.serverTime >= this.constructor._nextWarning) {
                ui.notifications.warn("[Perfect Vision] Roof/Levels tiles with video texture may impact performance significantly!");
                Logger.warn("Roof/Levels tiles with video texture may impact performance significantly!");

                if (this.constructor._nextWarning === 0) {
                    this.constructor._nextWarning = game.time.serverTime + 300000;
                } else {
                    this.constructor._nextWarning = undefined;
                }
            }
        }

        this.invalidate();
    }

    static _onTick() {
        if (canvas?.ready) {
            this.updateAll();
        }
    }

    static _onResize() {
        if (canvas?.ready) {
            this.invalidateAll();
        }
    }
}

Hooks.on("canvasInit", () => {
    canvas.app.renderer.off("resize", CanvasFramebuffer._onResize, CanvasFramebuffer);
    canvas.app.renderer.on("resize", CanvasFramebuffer._onResize, CanvasFramebuffer);

    canvas.app.ticker.remove(CanvasFramebuffer._onTick, CanvasFramebuffer);
    canvas.app.ticker.add(CanvasFramebuffer._onTick, CanvasFramebuffer, PIXI.UPDATE_PRIORITY.LOW + 1);
});

Hooks.on("canvasReady", () => {
    CanvasFramebuffer.invalidateAll();
});

Hooks.on("canvasPan", () => {
    CanvasFramebuffer.invalidateAll();
});
