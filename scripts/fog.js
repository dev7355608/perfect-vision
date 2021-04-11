import { extend } from "./extend.js";
import { Filter as MaskFilter } from "./mask.js";
import { patch } from "./patch.js";
import { grayscale } from "./utils.js";

const fogFilter = new MaskFilter("1.0 - max(r, g)");

// Based on FXMaster's FogWeatherEffect
class FogEffect extends SpecialEffect {
    static get label() {
        return "Fog of War";
    }

    static get effectOptions() {
        const options = super.effectOptions;
        options.density.min = 0.01;
        options.density.value = 0.02;
        options.density.max = 0.10;
        options.density.step = 0.01;
        return options;
    }

    getParticleEmitters() {
        return [this._getFogEmitter(this.parent)];
    }

    _getFogEmitter(parent) {
        const config = this.constructor._getFogEmitterConfig(this.options);
        const art = this.constructor._getFogEmitterArt(this.options);
        const emitter = new PIXI.particles.Emitter(parent, art, config);
        return emitter;
    }

    static _getFogEmitterConfig(options) {
        const density = options.density.value;
        const d = canvas.dimensions;
        const maxParticles =
            Math.ceil((d.width / d.size) * (d.height / d.size) * density);
        const config = mergeObject(
            this.CONFIG,
            {
                spawnRect: {
                    x: d.paddingX,
                    y: d.paddingY,
                    w: d.sceneWidth,
                    h: d.sceneHeight
                },
                maxParticles: maxParticles,
                frequency: this.CONFIG.lifetime.min / maxParticles
            },
            { inplace: false }
        );
        return config;
    }

    static _getFogEmitterArt(options) {
        return [
            "./modules/perfect-vision/assets/cloud1.png",
            "./modules/perfect-vision/assets/cloud2.png",
            "./modules/perfect-vision/assets/cloud3.png",
            "./modules/perfect-vision/assets/cloud4.png"
        ];
    }

    _updateParticleEmitters() {
        const config = this.constructor._getFogEmitterConfig(this.options);

        this.emitters.forEach(e => {
            e.frequency = config.frequency;
            e.maxParticles = config.maxParticles;
            e.startAlpha = PIXI.particles.PropertyNode.createList(config.alpha);
            e.startColor = PIXI.particles.PropertyNode.createList(config.color);
        });
    }

    static get CONFIG() {
        const color = grayscale(canvas?.lighting?.channels?.bright?.rgb ?? [1, 1, 1]);
        const colorHex = ("000000" + rgbToHex(color).toString(16)).slice(-6);
        const alpha = color[0] * 0.1;
        return mergeObject(
            SpecialEffect.DEFAULT_CONFIG,
            {
                alpha: {
                    list: [
                        { value: 0.0, time: 0.0 },
                        { value: alpha / 2, time: 0.1 },
                        { value: alpha, time: 0.5 },
                        { value: alpha / 2, time: 0.9 },
                        { value: 0.0, time: 1.0 }
                    ],
                    isStepped: false
                },
                scale: {
                    start: 3.0,
                    end: 3.0,
                    minimumScaleMultiplier: 1.0
                },
                speed: {
                    start: 20,
                    end: 10,
                    minimumSpeedMultiplier: 0.5
                },
                color: {
                    start: colorHex,
                    end: colorHex
                },
                startRotation: {
                    min: 0,
                    max: 360
                },
                rotation: {
                    min: 0,
                    max: 360
                },
                rotationSpeed: {
                    min: 0.0,
                    max: 0.0
                },
                acceleration: {
                    x: 0,
                    y: 0
                },
                lifetime: {
                    min: 10,
                    max: 25,
                },
                blendMode: "normal",
                emitterLifetime: -1
            },
            { inplace: false }
        );
    };
}

function update(draw = false) {
    const sight = canvas.sight;
    const sight_ = extend(sight);

    if (!sight_.fog || draw) {
        sight_.fog = sight.addChildAt(new PIXI.Container(), sight.getChildIndex(sight.fog));
        sight_.filter = sight._blurDistance > 0 ?
            new PIXI.filters.BlurFilter(sight._blurDistance) :
            new PIXI.filters.AlphaFilter(1.0);
        sight_.filter.autoFit = sight.filter.autoFit;
        sight_.fog.filter = fogFilter;
        sight_.fog.filter.autoFit = sight_.filter.autoFit;

        if (sight_.filter instanceof PIXI.filters.AlphaFilter)
            sight_.fog.filters = [sight_.fog.filter];
        else
            sight_.fog.filters = [sight_.fog.filter, sight_.filter];

        sight_.fog.filterArea = sight.fog.filterArea;
    }

    sight_.fog.visible = sight.fogExploration && game.settings.get("perfect-vision", "actualFogOfWar");

    if (!sight_.fog.visible) {
        if (sight_.fog.weatherEffect) {
            sight_.fog.weatherEffect.stop();
            delete sight_.fog.weatherEffect;
        }
        return;
    }

    if (sight_.fog.weatherEffect)
        return;

    if (!sight_.fog.weather)
        sight_.fog.weather = sight_.fog.addChild(new PIXI.Container());

    sight_.fog.weatherEffect = new FogEffect(sight_.fog.weather);
    sight_.fog.weatherEffect.play();
}

Hooks.once("init", () => {
    game.settings.register("perfect-vision", "actualFogOfWar", {
        name: "Actual Fog of War",
        hint: "If enabled, the fog of war is overlaid with a fog effect.",
        scope: "world",
        config: true,
        type: Boolean,
        default: false,
        onChange: () => update()
    });

    patch("SightLayer.prototype.draw", "POST", async function () {
        const retVal = await arguments[0];

        update(true);

        return retVal;
    });

    patch("SightLayer.prototype.tearDown", "PRE", function () {
        const this_ = extend(this);

        if (this_.fog) {
            if (this_.fog.weatherEffect)
                this_.fog.weatherEffect.stop();

            this_.fog.weather = this_.fog.weatherEffect = null;
            this_.fog.destroy(true);
            delete this_.fog;
        }

        return arguments;
    });

    patch("Canvas.prototype._updateBlur", "POST", function () {
        const sight = canvas.sight;
        const sight_ = extend(sight);

        const blur = sight.filter.blur;

        if (sight_.filter)
            sight_.filter.blur = blur;

        return arguments[0];
    });
});

Hooks.on("canvasInit", () => {
    fogFilter.resolution = Math.pow(2, Math.floor(Math.log2(canvas.app.renderer.resolution)));
});

Hooks.on("lightingRefresh", () => {
    const sight = canvas.sight;
    const sight_ = extend(sight);

    if (sight_.fog?.weatherEffect)
        sight_.fog.weatherEffect._updateParticleEmitters();
});
