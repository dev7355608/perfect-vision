import { extend } from "./extend.js";
import { patch } from "./patch.js";

var dirty = true;
const mask = new PIXI.Container();

mask.background = mask.addChild(new PIXI.Graphics());
mask.layers = [
    new PIXI.Container(),
    new PIXI.Container(),
    new PIXI.Container()
];
mask.addChild(
    mask.layers[0],
    mask.layers[1],
    mask.layers[2]
);

mask.msk = mask.addChild(new PIXI.Graphics());
mask.mask = mask.msk;

export const texture = PIXI.RenderTexture.create();

export function visualize() {
    const dataUrl = canvas.app.renderer.extract.canvas(texture).toDataURL("image/png");
    const w = window.open();
    w.document.open();
    w.document.write(`<html><body style="margin:0;background-image:linear-gradient(45deg, #ccc 25%, transparent 25%),linear-gradient(135deg, #ccc 25%, transparent 25%),linear-gradient(45deg, transparent 75%, #ccc 75%),linear-gradient(135deg, transparent 75%, #ccc 75%);background-size: 2em 2em;background-position:0 0, 1em 0, 1em -1em, 0 -1em;"><iframe src="${dataUrl}" width="100%" height="100%" frameborder="0" scrolling="no"></iframe></body></html>`);
    w.document.close();
}

function render() {
    if (dirty && canvas?.ready) {
        dirty = false;

        const stage = canvas.stage;

        mask.position.copyFrom(stage.position);
        mask.pivot.copyFrom(stage.pivot);
        mask.scale.copyFrom(stage.scale);
        mask.skew.copyFrom(stage.skew);
        mask.rotation = stage.rotation;

        const renderer = canvas.app.renderer;
        const screen = renderer.screen;
        const resolution = renderer.resolution;
        const width = screen.width;
        const height = screen.height;

        if (texture.resolution !== resolution) {
            texture.setResolution(resolution);
        }

        if (texture.width !== width || texture.height !== height) {
            texture.resize(width, height);
        }

        // if (mask.filter instanceof PerfectVision._GlowFilter)
        //     mask.filter.uniforms.uStrength = canvas.sight.filter.blur / 4;

        canvas.app.renderer.render(mask, texture, true, undefined, false);
    }
}

Hooks.on("lightingRefresh", () => {
    mask.background.clear();

    if (canvas.lighting.globalLight)
        mask.background.beginFill(0x00FF00, 1.0).drawShape(canvas.dimensions.sceneRect).endFill();

    for (const layer of mask.layers)
        layer.removeChildren();

    for (const source of canvas.lighting.sources) {
        if (!source.active) continue;

        const sc = source.illumination;
        const sc_ = extend(sc);

        if (sc_.fovLight)
            mask.layers[1].addChild(sc_.fovLight);
    }

    for (const source of canvas.sight.sources) {
        if (!source.active) continue;

        const sc = source.illumination;
        const sc_ = extend(sc);

        if (sc_.fovMono)
            mask.layers[0].addChild(sc_.fovMono);

        if (sc_.fovColor)
            mask.layers[1].addChild(sc_.fovColor);

        if (sc_.fovDimToBright)
            mask.layers[2].addChild(sc_.fovDimToBright);
    }

    dirty = true;
});

Hooks.on("sightRefresh", () => {
    mask.msk.clear();

    if (canvas.sight.tokenVision && canvas.sight.sources.size > 0) {
        mask.msk.beginFill(0xFFFFFF, 1.0);

        for (const source of canvas.sight.sources) {
            if (!source.active) continue;

            mask.msk.drawPolygon(source.los);
        }

        for (const source of canvas.lighting.sources) {
            if (!source.active || source.type === CONST.SOURCE_TYPES.LOCAL)
                continue;

            mask.msk.drawPolygon(source.fov);
        }

        mask.msk.endFill();

        mask.mask = mask.msk;
    } else {
        mask.mask = null;
    }

    dirty = true;
});

Hooks.once("init", () => {
    patch("PointSource.prototype.drawLight", "POST", function (c) {
        const this_ = extend(this);

        const ilm = canvas.lighting.illumination;
        const ilm_ = extend(ilm);

        const c_ = extend(c);

        if (this_.isVision) {
            if (this_.fovMono) {
                if (!c_.fovMono)
                    c_.fovMono = new PIXI.Graphics();

                c_.fovMono.clear().beginFill(0x00FF00, 1.0).drawPolygon(this_.fovMono).endFill();
            } else if (c_.fovMono) {
                c_.fovMono.destroy();
                delete c_.fovMono;
            }

            if (this_.fovColor) {
                if (!c_.fovColor) {
                    c_.fovColor = new PIXI.Graphics();
                    c_.fovColor.blendMode = PIXI.BLEND_MODES.ADD;
                }

                c_.fovColor.clear().beginFill(0xFF0000, 1.0).drawPolygon(this_.fovColor).endFill();
            } else if (c_.fovColor) {
                c_.fovColor.destroy();
                delete c_.fovColor;
            }

            if (this_.fovDimToBright) {
                if (!c_.fovDimToBright) {
                    c_.fovDimToBright = new PIXI.Graphics();
                    c_.fovDimToBright.blendMode = PIXI.BLEND_MODES.ADD;
                }

                c_.fovDimToBright.clear().beginFill(0x0000FF, 1.0).drawPolygon(this_.fovDimToBright).endFill();
            } else if (c_.fovDimToBright) {
                c_.fovDimToBright.destroy();
                delete c_.fovDimToBright;
            }
        } else {
            if (this !== ilm_.globalLight2) {
                if (!c_.fovLight)
                    c_.fovLight = new PIXI.Graphics();

                c_.fovLight.clear();

                if (this.radius > 0)
                    c_.fovLight.beginFill(0xFF0000, 1.0).drawPolygon(this.fov).endFill();
            } else if (c_.fovLight) {
                c_.fovLight.destroy();
                delete c_.fovLight;
            }
        }

        dirty = true;
        return c;
    });
});

Hooks.on("canvasInit", () => {
    // const blurDistance = game.settings.get("core", "softShadows") ? Math.max(CONFIG.Canvas.blurStrength / 2, 1) : 0;
    // mask.filter = blurDistance ?
    //     new PerfectVision._GlowFilter(CONFIG.Canvas.blurStrength / 4, 2.0, 4 / 5, blurDistance) :
    //     new PIXI.filters.AlphaFilter(1.0);
    // mask.filters = [mask.filter];
    // mask.filterArea = canvas.app.renderer.screen;
});

Hooks.on("canvasPan", () => {
    dirty = true;
});

Hooks.on("ready", () => {
    canvas.app.ticker.add(render, null, PIXI.UPDATE_PRIORITY.LOW + 1);
});
