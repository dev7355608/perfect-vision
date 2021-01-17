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
            Filters.update({ layers: layers, placeables: placeables ?? tokens });

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

    static _registerHooks() {
        patch("EffectsLayer.layerOptions", "POST", function () {
            return mergeObject(arguments[0], {
                zIndex: Canvas.layers.fxmaster?.layerOptions.zIndex ?? 180
            });
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
