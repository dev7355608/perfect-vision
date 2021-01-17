import { extend } from "./extend.js";
import * as Filters from "./filters.js";
import * as Fog from "./fog.js";
import { migrateAll, migrateToken, migrateActor, migrateScene, migrateWorldSettings, migrateClientSettings } from "./migrate.js";
import { patch } from "./patch.js";

import "./config.js";
import "./controls.js";
import "./lighting.js";

export var isReady = false;

class PerfectVision {
    static _update({ refresh = false, filters = false, placeables = null, tokens = null, layers = null, fog = false, migrate = null } = {}) {
        if (!isReady)
            return;

        if (refresh) {
            this._refreshLighting = true;
            this._refreshSight = true;
        }

        if (migrate === "world") {
            migrateWorldSettings().then((...args) => this._onMigration(...args));
        } else if (migrate === "client") {
            migrateClientSettings().then((...args) => this._onMigration(...args));
        }

        if (!canvas?.ready)
            return;

        if (filters)
            this._updateFilters({ layers: layers, placeables: placeables ?? tokens });

        if (tokens)
            for (const token of tokens)
                token.updateSource({ defer: true });

        if (fog)
            Fog.update();
    }

    static _init() {
        this._registerHooks();
        this._registerSettings();
    }

    static _registerSettings() {
        game.settings.register("perfect-vision", "globalLight", {
            name: "Global Illumination Light",
            hint: "This setting affects only scenes with Global Illumination. If set to Dim (Bright) Light, the entire scene is illuminated with dim (bright) light and, if set to Scene Darkness, the scene is illuminated according to the scene's Darkness Level only. Each scene can also be configured individually. You can find this setting next to Global Illumination in the scene configuration.",
            scope: "world",
            config: true,
            type: String,
            choices: {
                "bright": "Bright Light",
                "dim": "Dim Light",
                "none": "Scene Darkness",
            },
            default: "dim",
            onChange: () => this._update({ refresh: true })
        });

        game.settings.register("perfect-vision", "improvedGMVision", {
            name: "Improved GM Vision",
            hint: "Improves the visibility in darkness for the GM massively while lit areas of the scene are still rendered normally.",
            scope: "world",
            config: true,
            type: Boolean,
            default: false,
            onChange: () => this._update({ refresh: game.user.isGM })
        });

        game.settings.register("perfect-vision", "visionRules", {
            name: "Vision Rules",
            hint: "Choose one of the presets, or select Custom and set your own rules. It is also possible to set rules for each token individually. You can find these token-specific settings in the token configuration under the Vision tab. Dim (Bright) Vision in Darkness controls what dim (bright) vision looks like in darkness, i.e., in areas that are not illuminated by light sources. Dim (Bright) Vision in Dim Light controls how dim (bright) vision interacts with dim light, i.e., if dim light becomes bright light or not. Scene Darkness is the level of darkness in areas without light sources. It's the darkness controlled by Darkness Level in the scene configuration. Total Darkness means no vision at all. Select an option with monochrome to create vision without color in darkness. It's grayscale vision as long as the Monochrome Vision Color is white. If the scene's Darkness Level is 0, it looks the same as it would with non-monochrome vision. But as the Darkness Level increases the saturation decreases accordingly.",
            scope: "world",
            config: true,
            type: String,
            choices: {
                "custom": "Custom",
                "fvtt": "Foundry VTT",
                "dnd35e": "Dungeons & Dragons 3.5e",
                "dnd5e": "Dungeons & Dragons 5e",
                "pf1e": "Pathfinder 1e",
                "pf2e": "Pathfinder 2e",
            },
            default: game.system.id === "dnd5e" ? "dnd5e" : (game.system.id === "pf1" ? "pf1e" : (game.system.id === "pf2e" ? "pf2e" : (game.system.id === "D35E" ? "dnd35e" : "fvtt"))),
            onChange: () => this._update({ refresh: true, tokens: canvas.tokens.placeables })
        });

        game.settings.register("perfect-vision", "dimVisionInDarkness", {
            name: "Dim Vision in Darkness",
            scope: "world",
            config: true,
            type: String,
            choices: {
                "bright": "Bright Light",
                "bright_mono": "Bright Light (monochrome)",
                "dim": "Dim Light",
                "dim_mono": "Dim Light (monochrome)",
                "scene": "Scene Darkness",
                "scene_mono": "Scene Darkness (monochrome)",
                "darkness": "Total Darkness",
            },
            default: "dim",
            onChange: () => this._update({ refresh: true, tokens: canvas.tokens.placeables })
        });

        game.settings.register("perfect-vision", "dimVisionInDimLight", {
            name: "Dim Vision in Dim Light",
            scope: "world",
            config: true,
            type: String,
            choices: {
                "bright": "Bright Light",
                "dim": "Dim Light",
            },
            default: "dim",
            onChange: () => this._update({ refresh: true, tokens: canvas.tokens.placeables })
        });

        game.settings.register("perfect-vision", "brightVisionInDarkness", {
            name: "Bright Vision in Darkness",
            scope: "world",
            config: true,
            type: String,
            choices: {
                "bright": "Bright Light",
                "bright_mono": "Bright Light (monochrome)",
                "dim": "Dim Light",
                "dim_mono": "Dim Light (monochrome)",
                "scene": "Scene Darkness",
                "scene_mono": "Scene Darkness (monochrome)",
                "darkness": "Total Darkness",
            },
            default: "bright",
            onChange: () => this._update({ refresh: true, tokens: canvas.tokens.placeables })
        });

        game.settings.register("perfect-vision", "brightVisionInDimLight", {
            name: "Bright Vision in Dim Light",
            scope: "world",
            config: true,
            type: String,
            choices: {
                "bright": "Bright Light",
                "dim": "Dim Light",
            },
            default: "bright",
            onChange: () => this._update({ refresh: true, tokens: canvas.tokens.placeables })
        });

        game.settings.register("perfect-vision", "monoVisionColor", {
            name: "Monochrome Vision Color",
            hint: "Set this color to anything other than white to make monochrome vision stand out visibly in darkness. For example, choose a green tone to make it look like night vision goggles. This setting affects only scenes without Global Illumination. You can also choose a color for each token individually in the token configuration under the Vision tab.",
            scope: "world",
            config: true,
            type: String,
            default: "#ffffff",
            onChange: () => this._update({ tokens: canvas.tokens.placeables })
        });

        game.settings.register("perfect-vision", "monoTokenIcons", {
            name: "Monochrome Token Icons",
            hint: "If enabled, token icons are affected by monochrome vision. Otherwise, they are not.",
            scope: "world",
            config: true,
            type: Boolean,
            default: false,
            onChange: () => this._update({ filters: true })
        });

        game.settings.register("perfect-vision", "monoSpecialEffects", {
            name: "Monochrome Special Effects",
            hint: "If enabled, FXMaster's and Token Magic FX's special effects are affected by monochrome vision. Otherwise, they are not. Special effects attached to tokens are only affected by this setting if Monochrome Token Icons is enabled as well.",
            scope: "world",
            config: true,
            type: Boolean,
            default: false,
            onChange: () => this._update({ filters: true })
        });

        game.settings.register("perfect-vision", "fogOfWarWeather", {
            name: "Fog of War Weather",
            hint: "If enabled, weather effects are visible in the fog of war. Otherwise, weather is only visible in line-of-sight.",
            scope: "world",
            config: true,
            type: Boolean,
            default: true,
            onChange: () => this._update({ filters: true, fog: true })
        });

        game.settings.register("perfect-vision", "actualFogOfWar", {
            name: "Actual Fog of War",
            hint: "If enabled, the fog of war is overlaid with a fog effect.",
            scope: "world",
            config: true,
            type: Boolean,
            default: false,
            onChange: () => this._update({ fog: true })
        });

        game.settings.register("perfect-vision", "_version", {
            name: "World Settings Version",
            hint: "World Settings Version",
            scope: "world",
            config: false,
            type: Number,
            default: 0,
            onChange: () => this._update({ migrate: "world" })
        });

        game.settings.register("perfect-vision", "_clientVersion", {
            name: "Client Settings Version",
            hint: "Client Settings Version",
            scope: "client",
            config: false,
            type: Number,
            default: 0,
            onChange: () => this._update({ migrate: "client" })
        });
    }

    static _setup() {
        if (game.modules.get("fxmaster")?.active) {
            patch("Canvas.layers.fxmaster.prototype.addChild", "POST", function () {
                PerfectVision._update({ filters: true, layers: ["fxmaster"] });
                return arguments[0];
            });
            Hooks.on("switchFilter", () => PerfectVision._update({ filters: true, layers: ["fxmaster"] }));
            Hooks.on("switchWeather", () => PerfectVision._update({ filters: true, layers: ["fxmaster"] }));
            Hooks.on("updateWeather", () => PerfectVision._update({ filters: true, layers: ["fxmaster"] }));
        }
    }

    static _updated = true;

    static _onMigration(migrated) {
        if (!migrated)
            return;

        if (this._updated) {
            this._updated = false;
            canvas.app.ticker.addOnce(this._canvasReady, this);
        }
    }

    static async _ready() {
        await migrateAll().then((...args) => this._onMigration(...args));

        isReady = true;

        this._canvasReady();

        canvas.app.ticker.add(this._onTick, this, PIXI.UPDATE_PRIORITY.LOW + 2);
    }

    static _canvasReady() {
        this._updated = true;

        if (!isReady)
            return;

        this._update({ refresh: true, filters: true, tokens: canvas.tokens.placeables, fog: true });
    }

    static _lightingRefresh() {
        this._refreshLighting = false;
    }

    static _sightRefresh() {
        this._refreshSight = false;

        this._update({ filters: true });
    }

    static async _updateToken(scene, data, update, options, userId) {
        if (!hasProperty(update, "flags.perfect-vision"))
            return;

        await migrateToken(new Token(data, scene)).then((...args) => this._onMigration(...args));

        const token = canvas.tokens.get(data._id);

        if (token) {
            this._update({ refresh: true, filters: true, tokens: [token] });
        }
    }

    static async _updateActor(actor, update, options, userId) {
        if (!hasProperty(update, "flags.perfect-vision"))
            return;

        await migrateActor(actor).then((...args) => this._onMigration(...args));
    }

    static async _updateScene(scene, update, options, userId) {
        if (!hasProperty(update, "flags.perfect-vision")) {
            if (scene.id === canvas.scene?.id)
                this._update({ filters: true });

            return;
        }

        await migrateScene(scene).then((...args) => this._onMigration(...args));

        if (scene.id !== canvas.scene?.id)
            return;

        this._update({ refresh: true, filters: true, tokens: canvas.tokens.placeables, fog: true });
    }

    static _onTick() {
        if (!canvas?.ready)
            return;

        if (this._refreshLighting)
            canvas.lighting.refresh();

        if (this._refreshSight)
            canvas.sight.refresh();
    }

    static _updateFilters({ layers = null, placeables = null } = {}) {
        Filters.mono.zOrder = Filters.mono.rank = 0;

        if (layers == null && placeables == null) {
            layers = ["background", "effects", "fxmaster"];

            placeables = [
                ...canvas.tokens.placeables,
                ...canvas.tiles.placeables,
                ...canvas.templates.placeables,
            ];

            if (canvas.roofs)
                placeables = [...placeables, canvas.roofs.children];
        }

        if (layers) {
            for (const layerName of layers) {
                const layer = canvas[layerName];

                if (!layer) continue;

                {
                    const monoFilterIndex = layer.filters ? layer.filters.indexOf(Filters.mono) : -1;

                    if (monoFilterIndex >= 0)
                        layer.filters.splice(monoFilterIndex, 1);

                    let object = layer;

                    if (layerName === "background") {
                        const monoFilterIndex = layer.img?.filters ? layer.img.filters.indexOf(Filters.mono) : -1;

                        if (monoFilterIndex >= 0)
                            layer.img.filters.splice(monoFilterIndex, 1);

                        object = layer.img ?? layer;
                    } else if (layerName === "effects" || layerName === "fxmaster") {
                        const monoFilterIndex = layer.weather?.filters ? layer.weather.filters.indexOf(Filters.mono) : -1;

                        if (monoFilterIndex >= 0)
                            layer.weather.filters.splice(monoFilterIndex, 1);

                        if (game.settings.get("perfect-vision", "monoSpecialEffects"))
                            object = layer;
                        else
                            object = layer.weather;
                    }

                    if (object) {
                        if (object.filters?.length > 0) {
                            object.filters.push(Filters.mono);
                        } else {
                            object.filters = [Filters.mono];
                        }
                    }
                }

                if (layerName === "effects" || layerName === "fxmaster") {
                    const sightFilterIndex = layer.filters ? layer.filters.indexOf(Filters.sight) : -1;

                    if (sightFilterIndex >= 0)
                        layer.filters.splice(sightFilterIndex, 1);

                    for (const child of layer.children) {
                        const sightFilterIndex = child.filters ? child.filters.indexOf(Filters.sight) : -1;

                        if (sightFilterIndex >= 0)
                            child.filters.splice(sightFilterIndex, 1);
                    }

                    let objects;

                    if (game.settings.get("perfect-vision", "fogOfWarWeather"))
                        objects = layer.children.filter(child => child !== layer.weather && child !== layer.mask);
                    else
                        objects = [layer];

                    for (const object of objects) {
                        if (object.filters?.length > 0) {
                            object.filters.push(Filters.sight);
                        } else {
                            object.filters = [Filters.sight];
                        }
                    }
                }
            }
        }

        if (placeables) {
            for (const placeable of placeables) {
                let sprite;

                if (placeable instanceof Token) {
                    sprite = placeable.icon;
                } else if (placeable instanceof Tile) {
                    sprite = placeable.tile.img;
                } else if (placeable instanceof MeasuredTemplate) {
                    if (placeable.texture)
                        sprite = placeable.template;
                } else if (placeable instanceof PIXI.DisplayObject) {
                    sprite = placeable;
                }

                if (sprite) {
                    if (sprite.filters) {
                        const monoFilterIndex = sprite.filters ? Math.max(
                            sprite.filters.indexOf(Filters.mono),
                            sprite.filters.indexOf(Filters.mono_noAutoFit)) : -1;

                        if (monoFilterIndex >= 0)
                            sprite.filters.splice(monoFilterIndex, 1);
                    }

                    if (placeable instanceof Token && !game.settings.get("perfect-vision", "monoTokenIcons"))
                        continue;

                    if (placeable instanceof Tile && (placeable.data.flags?.startMarker || placeable.data.flags?.turnMarker))
                        continue;

                    if (sprite.filters?.length > 0) {
                        if (game.settings.get("perfect-vision", "monoSpecialEffects"))
                            sprite.filters.push(Filters.mono_noAutoFit);
                        else
                            sprite.filters.unshift(Filters.mono_noAutoFit);
                    } else {
                        sprite.filters = [Filters.mono];
                    }

                    if (placeable instanceof MeasuredTemplate) {
                        const sightFilterIndex = sprite.filters ? sprite.filters.indexOf(Filters.sight) : -1;

                        if (sightFilterIndex >= 0)
                            sprite.filters.splice(sightFilterIndex, 1);

                        sprite.filters.push(Filters.sight);
                    }
                }
            }
        }
    }

    static _registerHooks() {
        patch("BackgroundLayer.prototype.draw", "POST", async function () {
            const retVal = await arguments[0];

            const this_ = extend(this);

            this_.msk = this.addChild(new PIXI.Graphics());
            this_.msk.beginFill(0xFFFFFF, 1.0).drawShape(canvas.dimensions.sceneRect).endFill();
            this.mask = this_.msk;

            PerfectVision._update({ filters: true, layers: ["background"] });

            return retVal;
        });

        patch("EffectsLayer.layerOptions", "POST", function () {
            return mergeObject(arguments[0], {
                zIndex: Canvas.layers.fxmaster?.layerOptions.zIndex ?? 180
            });
        });

        patch("EffectsLayer.prototype.draw", "POST", async function () {
            const retVal = await arguments[0];

            const this_ = extend(this);

            this_.msk = this.addChild(new PIXI.Graphics());
            this_.msk.beginFill(0xFFFFFF, 1.0).drawShape(canvas.dimensions.sceneRect).endFill();
            this.mask = this_.msk;

            PerfectVision._update({ filters: true, layers: ["effects"] });

            return retVal;
        });

        patch("Token.prototype.draw", "POST", async function () {
            const retVal = await arguments[0];

            PerfectVision._update({ filters: true, placeables: [this] });

            return retVal;
        });

        patch("Tile.prototype.draw", "POST", async function () {
            const retVal = await arguments[0];

            PerfectVision._update({ filters: true, placeables: [this] });

            return retVal;
        });

        patch("MeasuredTemplate.prototype.draw", "POST", async function () {
            const retVal = await arguments[0];

            PerfectVision._update({ filters: true, placeables: [this] });

            return retVal;
        });

        if (game.modules.get("tokenmagic")?.active) {
            patch("PlaceableObject.prototype._TMFXsetRawFilters", "POST", function (retVal, filters) {
                PerfectVision._update({ filters: true, placeables: [this] });
                return retVal;
            });
            Hooks.once("ready", () => {
                patch("TokenMagic._clearImgFiltersByPlaceable", "POST", function (retVal, placeable) {
                    PerfectVision._update({ filters: true, placeables: [placeable] });
                    return retVal;
                })
            });
        }

        if (game.modules.get("roofs")?.active) {
            patch("RoofsLayer.createRoof", "POST", function (retVal, tile) {
                PerfectVision._update({ filters: true, placeables: [tile.roof.container] });
                return retVal;
            });
        }

        Hooks.once("setup", (...args) => PerfectVision._setup(...args));

        Hooks.once("ready", (...args) => PerfectVision._ready(...args));

        Hooks.on("canvasReady", (...args) => PerfectVision._canvasReady(...args));

        Hooks.on("lightingRefresh", (...args) => PerfectVision._lightingRefresh(...args));

        Hooks.on("sightRefresh", (...args) => PerfectVision._sightRefresh(...args));

        Hooks.on("updateToken", (...args) => PerfectVision._updateToken(...args));

        Hooks.on("updateActor", (...args) => PerfectVision._updateActor(...args));

        Hooks.on("updateScene", (...args) => PerfectVision._updateScene(...args));
    }
}

Hooks.once("init", (...args) => PerfectVision._init(...args));

import "./fix.js";

export { PerfectVision };
