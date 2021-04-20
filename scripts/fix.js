import { extend } from "./extend.js";
import { patch } from "./patch.js";

PIXI.AbstractRenderer.prototype.resize = function (screenWidth, screenHeight) {
    this.view.width = Math.round(screenWidth * this.resolution);
    this.view.height = Math.round(screenHeight * this.resolution);

    screenWidth = this.view.width / this.resolution;
    screenHeight = this.view.height / this.resolution;

    this.screen.width = screenWidth;
    this.screen.height = screenHeight;

    this.view.style.width = `${screenWidth}px`;
    this.view.style.height = `${screenHeight}px`;

    this.emit('resize', screenWidth, screenHeight);
}

PIXI.Renderer.prototype.resize = function (screenWidth, screenHeight) {
    PIXI.AbstractRenderer.prototype.resize.call(this, screenWidth, screenHeight);

    this.runners.resize.emit(this.screen.height, this.screen.width);
}

Hooks.once("init", () => {
    // https://gitlab.com/foundrynet/foundryvtt/-/issues/4263
    if (isNewerVersion(game.data.version, "0.7.8")) {
        let _darknessChanged;

        patch("PointSource.prototype.drawLight", "PRE", function (opts) {
            opts = typeof (opts) === "object" ? opts : { updateChannels: !!opts };

            if (_darknessChanged !== undefined) {
                opts.updateChannels = opts.updateChannels || _darknessChanged;
            }

            return [opts];
        });

        let _sources = new WeakSet();

        patch("LightingLayer.prototype.refresh", "WRAPPER", function (wrapped, darkness) {
            _darknessChanged = darkness != undefined && (darkness !== this.darknessLevel)

            for (const sources of [this.sources, canvas.sight.sources]) {
                for (const source of sources) {
                    if (!_sources.has(source)) {
                        source._resetIlluminationUniforms = true;
                    }
                }
            }

            _sources = new WeakSet();

            for (const sources of [this.sources, canvas.sight.sources]) {
                for (const source of sources) {
                    _sources.add(source);
                }
            }

            const retVal = wrapped(darkness);

            _darknessChanged = undefined;

            return retVal;
        });
    }

    patch("SceneConfig.prototype.close", "POST", async function () {
        canvas.lighting.refresh(canvas.scene.data.darkness);

        return await arguments[0];
    });

    // Fix flickering border pixels
    patch("BackgroundLayer.prototype.draw", "POST", async function () {
        const retVal = await arguments[0];

        const this_ = extend(this);

        this_.msk = this.addChild(new PIXI.Graphics());
        this_.msk.beginFill(0xFFFFFF, 1.0).drawShape(canvas.dimensions.sceneRect).endFill();
        this.mask = this_.msk;

        return retVal;
    });

    patch("EffectsLayer.prototype.draw", "POST", async function () {
        const retVal = await arguments[0];

        const this_ = extend(this);

        this_.msk = this.addChild(new PIXI.Graphics());
        this_.msk.beginFill(0xFFFFFF, 1.0).drawShape(canvas.dimensions.sceneRect).endFill();
        this.mask = this_.msk;

        return retVal;
    });

    patch("EffectsLayer.layerOptions", "POST", function () {
        return mergeObject(arguments[0], {
            zIndex: Canvas.layers.fxmaster?.layerOptions.zIndex ?? 180
        });
    });

    patch("LightingLayer.prototype._configureChannels", "POST", function (channels) {
        const dim = CONFIG.Canvas.lightLevels.dim;
        channels.dim.rgb = channels.bright.rgb.map((c, i) => (dim * c) + ((1 - dim) * channels.background.rgb[i]));
        channels.dim.hex = rgbToHex(channels.dim.rgb);
        return channels;
    });

    // https://gitlab.com/foundrynet/foundryvtt/-/issues/4565
    patch("normalizeRadians", "POST", function (nr) {
        return nr < -Math.PI ? nr + 2 * Math.PI : nr;
    });

    patch("Ray.fromAngle", "POST", function (ray) {
        ray.angle = normalizeRadians(ray.angle);
        return ray;
    });

    patch("SightLayer._castRays", "POST", function (rays) {
        for (const ray of rays) {
            ray.angle = normalizeRadians(ray.angle);
        }

        rays.sort((ray1, ray2) => ray1.angle - ray2.angle);

        for (let i = rays.length - 1; i > 0; i--) {
            if (rays[i].angle === rays[i - 1].angle) {
                rays.splice(i, 1);
            }
        }

        return rays;
    });

    patch("LightingLayer.prototype._drawColorationContainer", "POST", function (c) {
        c.filter.resolution = Math.pow(2, Math.floor(Math.log2(canvas.app.renderer.resolution)));

        if (c.filter instanceof PIXI.filters.FXAAFilter && c.filter.program.uniformData.inputPixel) {
            c.filter.program = PIXI.Program.from(
                c.filter.program.vertexSrc.replace(/#define SHADER_NAME .*\n/i, "").replace(/inputPixel/g, "inputSize"),
                c.filter.program.fragmentSrc.replace(/#define SHADER_NAME .*\n/i, "").replace(/inputPixel/g, "inputSize")
            );
        }

        return c;
    });

    patch("LightingLayer.prototype._drawIlluminationContainer", "POST", function (c) {
        c.filter.resolution = Math.pow(2, Math.floor(Math.log2(canvas.app.renderer.resolution)));
        return c;
    });

    patch("SightLayer.prototype.draw", "POST", async function () {
        const retVal = await arguments[0];
        this.filter.resolution = Math.pow(2, Math.floor(Math.log2(canvas.app.renderer.resolution)));
        return retVal;
    });

    // https://gitlab.com/foundrynet/foundryvtt/-/issues/4413
    patch("SightLayer.prototype._configureFogResolution", "OVERRIDE", function () {
        const d = canvas.dimensions;
        const gl = canvas.app.renderer.gl;
        const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);

        let res = Math.pow(2, Math.floor(Math.log2(canvas.app.renderer.resolution)));

        while (Math.max(d.sceneWidth, d.sceneHeight) * res > maxTextureSize
            || d.sceneWidth * res * d.sceneHeight * res > 4096 * 4096) {
            res /= 2;
        }

        return res;
    });
});

// https://gitlab.com/foundrynet/foundryvtt/-/issues/4850
Hooks.once("canvasInit", () => {
    const renderer = canvas.app.renderer;
    const gl = renderer.gl;
    const pixel = new Uint8Array(4);
    const texture = PIXI.RenderTexture.create({ width: 1, height: 1 });
    const container = new PIXI.Container();

    container.addChild(new PIXI.Graphics()).beginFill(0xffffff).drawRect(0, 0, 1, 1).endFill();
    container.mask = container.addChild(new PIXI.Graphics());

    renderer.render(container, texture, true);
    renderer.renderTexture.bind(texture);

    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);

    if (pixel[0] !== 0) {
        renderer.render(container, texture, true);
        renderer.renderTexture.bind(texture);

        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);

        if (pixel[0] !== 0) {
            ui.notifications.error("Rendering bug detected. Workaround is NOT working! Please switch to a Chromium-based browser!");
        } else {
            ui.notifications.warn("Rendering bug detected. Workaround enabled. Consider switching to a Chromium-based browser!");

            const render = PIXI.Renderer.prototype.render;
            PIXI.Renderer.prototype.render = function () {
                render.apply(this, arguments);

                if (!this.renderingToScreen) {
                    render.apply(this, arguments);
                }
            }
        }
    }

    renderer.renderTexture.bind(null);

    texture.destroy(true);
});
