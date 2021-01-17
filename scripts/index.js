
import { migrateAll, migrateToken, migrateActor, migrateScene, migrateWorldSettings, migrateClientSettings } from "./migrate.js";

import "./config.js";
import "./controls.js";
import "./lighting.js";
import "./filters.js";
import "./fog.js";

export var isReady = false;

class PerfectVision {
    static _update({ migrate = null } = {}) {
        if (!isReady)
            return;

        if (migrate === "world") {
            migrateWorldSettings().then((...args) => this._onMigration(...args));
        } else if (migrate === "client") {
            migrateClientSettings().then((...args) => this._onMigration(...args));
        }
    }

    static _init() {
        this._registerHooks();
        this._registerSettings();
    }

    static _registerSettings() {
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
    }

    static _canvasReady() {
        this._updated = true;

        if (!isReady)
            return;

        this._update({ refresh: true, tokens: canvas.tokens.placeables });
    }

    static async _updateToken(scene, data, update, options, userId) {
        if (!hasProperty(update, "flags.perfect-vision"))
            return;

        await migrateToken(new Token(data, scene)).then((...args) => this._onMigration(...args));
    }

    static async _updateActor(actor, update, options, userId) {
        if (!hasProperty(update, "flags.perfect-vision"))
            return;

        await migrateActor(actor).then((...args) => this._onMigration(...args));
    }

    static async _updateScene(scene, update, options, userId) {
        if (!hasProperty(update, "flags.perfect-vision"))
            return;

        await migrateScene(scene).then((...args) => this._onMigration(...args));
    }

    static _registerHooks() {
        Hooks.once("ready", (...args) => PerfectVision._ready(...args));

        Hooks.on("canvasReady", (...args) => PerfectVision._canvasReady(...args));

        Hooks.on("updateToken", (...args) => PerfectVision._updateToken(...args));

        Hooks.on("updateActor", (...args) => PerfectVision._updateActor(...args));

        Hooks.on("updateScene", (...args) => PerfectVision._updateScene(...args));
    }
}

Hooks.once("init", (...args) => PerfectVision._init(...args));

import "./fix.js";

export { PerfectVision };
