import { extend } from "./extend.js";
import { texture, BaseFilter, Filter as MaskFilter } from "./mask.js";
import { patch } from "./patch.js";

class MonoFilter extends BaseFilter {
    constructor(...args) {
        super(
            `\
            precision mediump float;

            uniform sampler2D uSampler;
            uniform sampler2D uMask;
            uniform vec3 uTint;
            uniform float uSaturation;

            varying vec2 vTextureCoord;
            varying vec2 vMaskCoord;

            vec3 rgb2srgb(vec3 c)
            {
                vec3 a = 12.92 * c;
                vec3 b = 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055;
                vec3 s = step(vec3(0.0031308), c);
                return mix(a, b, s);
            }

            vec3 srgb2rgb(vec3 c)
            {
                vec3 a = c / 12.92;
                vec3 b = pow((c + 0.055) / 1.055, vec3(2.4));
                vec3 s = step(vec3(0.04045), c);
                return mix(a, b, s);
            }

            float rgb2y(vec3 c)
            {
                vec3 w = vec3(0.2126, 0.7152, 0.0722);
                return dot(c, w);
            }

            vec3 y2mono(float y, vec3 tint)
            {
                float tintY = rgb2y(tint);
                return mix(
                    mix(tint, vec3(1.0), (y - tintY) / (1.0 - mix(tintY, 0.0, step(1.0, tintY)))),
                    tint * (y / mix(tintY, 1.0, step(tintY, 0.0))),
                    step(y, tintY)
                );
            }

            void main(void)
            {
                vec4 mask = texture2D(uMask, vMaskCoord);
                vec4 srgba = texture2D(uSampler, vTextureCoord);
                vec3 srgb = srgba.rgb;
                vec3 rgb = srgb2rgb(srgb);
                float a = srgba.a;
                float y = rgb2y(rgb);
                vec3 tint = srgb2rgb(uTint);
                gl_FragColor = vec4(rgb2srgb(mix(mix(vec3(y), y2mono(y, tint), mask.a), rgb, max(mask.r, uSaturation))), a);
            }`,
            ...args
        );

        this.uniforms.uTint = new Float32Array(3);
        this.uniforms.uSaturation = 1;
    }
}

const sightFilter = new MaskFilter("max(r, g)");

const monoFilter = new MonoFilter();
// Remove as soon as pixi.js fixes the auto fit bug.
let monoFilter_noAutoFit = new Proxy(monoFilter, {
    get(target, prop, receiver) {
        if (prop === "autoFit")
            return false;
        return Reflect.get(...arguments);
    }
});

function removeFromDisplayObject(object, ...filters) {
    if (!object)
        return;

    for (const filter of filters) {
        const index = object.filters ? object.filters.indexOf(filter) : -1;

        if (index >= 0)
            object.filters.splice(index, 1);
    }
}

function addFirstToDisplayObject(object, filter) {
    if (!object)
        return;

    if (object.filters?.length > 0) {
        object.filters.unshift(filter);
    } else if (object.filters) {
        object.filters[0] = filter;
    } else {
        object.filters = [filter];
    }
}

function addLastToDisplayObject(object, filter) {
    if (!object)
        return;

    if (object.filters?.length > 0) {
        object.filters.push(filter);
    } else if (object.filters) {
        object.filters[0] = filter;
    } else {
        object.filters = [filter];
    }
}

function updateLayer(layer) {
    if (!layer)
        return;

    if (layer === canvas.background || layer === canvas.foreground || (!isNewerVersion(game.data.version, "0.8") && layer instanceof BackgroundLayer && layer.iso_layer)) {
        removeFromDisplayObject(layer, monoFilter);
        removeFromDisplayObject(layer.img, monoFilter);
        addLastToDisplayObject(layer.img ?? layer, monoFilter);
    } else if (layer === canvas.effects || layer === canvas.fxmaster) {
        removeFromDisplayObject(layer, monoFilter);
        removeFromDisplayObject(layer.weather, monoFilter);
        addLastToDisplayObject(game.settings.get("perfect-vision", "monoSpecialEffects") ? layer : layer.weather, monoFilter);

        removeFromDisplayObject(layer, sightFilter);

        for (const child of layer.children)
            removeFromDisplayObject(child, sightFilter);

        let objects;

        if (!isNewerVersion(game.data.version, "0.8.4") && game.settings.get("perfect-vision", "fogOfWarWeather")) {
            objects = layer.children.filter(child => child !== layer.weather && child !== layer.mask);
        } else {
            objects = [layer];
        }

        for (const object of objects)
            addLastToDisplayObject(object, sightFilter);
    }
}

function updatePlaceable(placeable) {
    if (!placeable)
        return;

    let sprite;
    let sight = true;

    if (placeable instanceof Token) {
        sprite = placeable.icon;
    } else if (placeable instanceof Tile) {
        if (!isNewerVersion(game.data.version, "0.8") && game.modules.get("blood-n-guts")?.active && placeable.layer === canvas.blood) {
            sprite = placeable.tile;
            sight = false;
        } else {
            if (isNewerVersion(game.data.version, "0.8.1")) {
                sprite = placeable.tile;
            } else {
                sprite = placeable.tile.img;
            }
        }
    } else if (placeable instanceof MeasuredTemplate) {
        sprite = placeable.template;
    } else if (placeable instanceof PIXI.DisplayObject) {
        sprite = placeable;
    }

    removeFromDisplayObject(sprite, monoFilter, monoFilter_noAutoFit, sightFilter);

    if (!sprite)
        return;

    if (placeable instanceof Token && !game.settings.get("perfect-vision", "monoTokenIcons"))
        return;

    // Skip Turn Marker
    if (placeable instanceof Tile && (placeable.data.flags?.startMarker || placeable.data.flags?.turnMarker))
        return;

    if (placeable instanceof MeasuredTemplate) {
        const highlight = canvas.grid.getHighlightLayer(`Template.${placeable.id}`);

        removeFromDisplayObject(highlight, sightFilter);

        if (!placeable.owner) {
            addLastToDisplayObject(sprite, sightFilter);
            addLastToDisplayObject(highlight, sightFilter);

            placeable.ruler.renderable = false;
            placeable.controlIcon.renderable = false;

            if (placeable.handle) {
                placeable.handle.renderable = false;
            }
        }

        if (!placeable.texture || canvas.templates._active && placeable.owner)
            return;
    }

    if (sprite.filters?.length > 0) {
        if (game.settings.get("perfect-vision", "monoSpecialEffects"))
            addLastToDisplayObject(sprite, monoFilter_noAutoFit);
        else
            addFirstToDisplayObject(sprite, monoFilter_noAutoFit);
    } else {
        addLastToDisplayObject(sprite, monoFilter);
    }

    if (!sight) {
        addLastToDisplayObject(sprite, sightFilter);
    }
}

function updateAll() {
    let layers = ["background"];

    if (isNewerVersion(game.data.version, "0.8.1")) {
        layers = [...layers, "foreground"];
    }

    layers = [...layers, "effects", "fxmaster"];

    let placeables = [
        ...canvas.tokens.placeables,
        ...canvas.templates.placeables,
    ];

    if (isNewerVersion(game.data.version, "0.8.1")) {
        placeables = [...placeables, ...canvas.background.placeables, ...canvas.foreground.placeables];
    } else {
        placeables = [...placeables, ...canvas.tiles.placeables];

        if (!isNewerVersion(game.data.version, "0.8")) {
            if (game.modules.get("blood-n-guts")?.active) {
                placeables = [...placeables, ...canvas.blood.placeables];
            }
        }
    }

    if (game.modules.get("roofs")?.active) {
        placeables = [...placeables, ...canvas.roofs.children];
    }

    for (const layerName of layers) {
        const layer = canvas[layerName];

        if (!layer) continue;

        updateLayer(layer);
    }

    if (!isNewerVersion(game.data.version, "0.8")) {
        if (game.modules.get("grape_juice-isometrics")?.active) {
            for (const layer of canvas.stage.children) {
                if (layer instanceof BackgroundLayer && layer.iso_layer) {
                    updateLayer(layer);
                }
            }
        }
    }

    for (const placeable of placeables) {
        updatePlaceable(placeable);
    }
}

Hooks.once("init", () => {
    game.settings.register("perfect-vision", "monoTokenIcons", {
        name: "Monochrome Token Icons",
        hint: "If enabled, token icons are affected by monochrome vision. Otherwise, they are not.",
        scope: "world",
        config: true,
        type: Boolean,
        default: false,
        onChange: () => updateAll()
    });

    game.settings.register("perfect-vision", "monoSpecialEffects", {
        name: "Monochrome Special Effects",
        hint: "If enabled, FXMaster's and Token Magic FX's special effects are affected by monochrome vision. Otherwise, they are not. Special effects attached to tokens are only affected by this setting if Monochrome Token Icons is enabled as well.",
        scope: "world",
        config: true,
        type: Boolean,
        default: false,
        onChange: () => updateAll()
    });

    game.settings.register("perfect-vision", "forceMonoVision", {
        name: "Force Monochrome Vision",
        hint: "If disabled, monochrome vision is affected by the scene's Darkness Level. If the scene's Darkness Level is 0, it looks the same as it would with non-monochrome vision. But as the Darkness Level increases the saturation decreases accordingly. If enabled, monochrome vision is always completely monochrome.",
        scope: "world",
        config: true,
        type: Boolean,
        default: false,
        onChange: () => updateAll()
    });

    if (!isNewerVersion(game.data.version, "0.8.3")) {
        game.settings.register("perfect-vision", "fogOfWarWeather", {
            name: "Fog of War Weather",
            hint: "If enabled, weather effects are visible in the fog of war. Otherwise, weather is only visible in line-of-sight.",
            scope: "world",
            config: true,
            type: Boolean,
            default: true,
            onChange: () => updateAll()
        });
    }

    patch("TemplateLayer.prototype.activate", "POST", function () {
        for (const template of canvas.templates.placeables) {
            updatePlaceable(template);
        }

        return arguments[0];
    });

    patch("TemplateLayer.prototype.deactivate", "PRE", function () {
        for (const template of canvas.templates.placeables) {
            updatePlaceable(template);
        }

        return arguments;
    });

    if (isNewerVersion(game.data.version, "0.8.1")) {
        patch("MapLayer.prototype.draw", "POST", async function () {
            const retVal = await arguments[0];

            updateLayer(this);

            return retVal;
        });
    } else {
        patch("BackgroundLayer.prototype.draw", "POST", async function () {
            const retVal = await arguments[0];

            updateLayer(this);

            return retVal;
        });
    }

    patch("EffectsLayer.prototype.draw", "POST", async function () {
        const retVal = await arguments[0];

        updateLayer(this);

        return retVal;
    });

    patch("Token.prototype.draw", "POST", async function () {
        const retVal = await arguments[0];

        updatePlaceable(this);

        return retVal;
    });

    patch("Tile.prototype.draw", "POST", async function () {
        const retVal = await arguments[0];

        updatePlaceable(this);

        return retVal;
    });

    if (!isNewerVersion(game.data.version, "0.8")) {
        if (game.modules.get("blood-n-guts")?.active) {
            Hooks.once("ready", () => {
                patch("Canvas.layers.blood.layerOptions.objectClass.prototype.draw", "POST", async function () {
                    const retVal = await arguments[0];

                    updatePlaceable(this);

                    return retVal;
                });

                updateAll();
            });
        }
    }

    patch("MeasuredTemplate.prototype.draw", "POST", async function () {
        const retVal = await arguments[0];

        updatePlaceable(this);

        return retVal;
    });

    if (game.modules.get("tokenmagic")?.active) {
        patch("PlaceableObject.prototype._TMFXsetRawFilters", "POST", function () {
            updatePlaceable(this);
            return arguments[0];
        });

        Hooks.once("ready", () => {
            patch("TokenMagic._clearImgFiltersByPlaceable", "POST", function (retVal, placeable) {
                updatePlaceable(placeable);
                return retVal;
            })
        });

        Object.defineProperty(monoFilter, "zOrder", { value: 0, writable: false });
        Object.defineProperty(monoFilter, "rank", { value: 0, writable: false });
        Object.defineProperty(sightFilter, "zOrder", { value: 0, writable: false });
        Object.defineProperty(sightFilter, "rank", { value: 0, writable: false });

        if (isNewerVersion(PIXI.VERSION, "5.3.4") || isNewerVersion(game.modules.get("tokenmagic").data.version, "0.5")) {
            monoFilter_noAutoFit = monoFilter;
        }
    } else {
        monoFilter_noAutoFit = monoFilter;
    }

    if (game.modules.get("roofs")?.active) {
        patch("RoofsLayer.createRoof", "POST", function (retVal, tile) {
            updatePlaceable(tile.roof.container);
            return retVal;
        });
    }

    if (game.modules.get("fxmaster")?.active) {
        Hooks.on("switchFilter", () => updateLayer(canvas.fxmaster));
        Hooks.on("switchWeather", () => updateLayer(canvas.fxmaster));
        Hooks.on("updateWeather", () => updateLayer(canvas.fxmaster));

        Hooks.on("updateScene", (scene, change, options) => {
            if (!game.settings.get("fxmaster", "enable")) {
                return
            }

            if (hasProperty(change, "flags.fxmaster")) {
                updateLayer(canvas.fxmaster);
            }
        });
    }
});

Hooks.once("setup", () => {
    if (game.modules.get("fxmaster")?.active) {
        patch("Canvas.layers.fxmaster.prototype.addChild", "POST", function () {
            updateLayer(canvas.fxmaster);
            return arguments[0];
        });
    }
});

Hooks.on("canvasInit", () => {
    const resolution = Math.pow(2, Math.floor(Math.log2(canvas.app.renderer.resolution)));

    sightFilter.resolution = resolution;
    monoFilter.resolution = resolution;
});

Hooks.on("lightingRefresh", () => {
    if (canvas.sight.sources.size === 0 && game.user.isGM && game.settings.get("perfect-vision", "improvedGMVision")) {
        monoFilter.uniforms.uSaturation = 1;
    } else {
        if (game.settings.get("perfect-vision", "forceMonoVision")) {
            monoFilter.uniforms.uSaturation = 0;
        } else {
            monoFilter.uniforms.uSaturation = 1 - canvas.lighting.darknessLevel;
        }
    }
});

Hooks.on("sightRefresh", () => {
    let monoVisionColor;

    if (canvas.sight.tokenVision && canvas.sight.sources.size > 0) {
        for (const source of canvas.sight.sources) {
            if (!source.active) continue;

            const source_ = extend(source);

            if (source_.monoVisionColor) {
                if (monoVisionColor && !(
                    monoVisionColor[0] === source_.monoVisionColor[0] &&
                    monoVisionColor[1] === source_.monoVisionColor[1] &&
                    monoVisionColor[2] === source_.monoVisionColor[2])) {
                    monoVisionColor = undefined;
                    break;
                } else {
                    monoVisionColor = source_.monoVisionColor;
                }
            }
        }

        sightFilter.enabled = true;
    } else {
        sightFilter.enabled = false;
    }

    if (monoVisionColor) {
        monoFilter.uniforms.uTint[0] = monoVisionColor[0];
        monoFilter.uniforms.uTint[1] = monoVisionColor[1];
        monoFilter.uniforms.uTint[2] = monoVisionColor[2];
    } else {
        monoFilter.uniforms.uTint[0] = 1;
        monoFilter.uniforms.uTint[1] = 1;
        monoFilter.uniforms.uTint[2] = 1;
    }
});
