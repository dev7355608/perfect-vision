import { patch } from "./patch.js";

const versions = Object.freeze({ world: 1, client: 1, scene: 1, token: 1 });

function getFlags(entity) {
    if (entity === "world" || entity === "client") {
        const storage = game.settings.storage.get(entity);
        let flags;

        if (Symbol.iterator in storage) {
            for (const key of storage.keys()) {
                if (key.startsWith("perfect-vision.")) {
                    const value = storage.getItem(key);
                    flags = flags ?? {};
                    flags[key.split(/\.(.*)/)[1]] = JSON.parse(value);
                }
            }
        } else {
            for (let i = 0; i < storage.length; i++) {
                const key = storage.key(i);
                if (key.startsWith("perfect-vision.")) {
                    const value = storage.getItem(key);
                    flags = flags ?? {};
                    flags[key.split(/\.(.*)/)[1]] = JSON.parse(value);
                }
            }
        }

        return flags;
    }

    if (entity instanceof Actor) {
        return entity.data.token.flags && entity.data.token.flags["perfect-vision"];
    }

    return entity.data.flags && entity.data.flags["perfect-vision"];
}

function getFlag(entity, key) {
    if (entity === "world" || entity === "client") {
        key = `perfect-vision.${key}`;

        const storage = game.settings.storage.get(entity);
        const value = storage.getItem(key);

        return (value ?? false) ? JSON.parse(value) : null;
    }

    if (entity instanceof Actor) {
        key = `flags.perfect-vision.${key}`;
        return getProperty(entity.data.token, key);
    }

    return entity.getFlag("perfect-vision", key);
}

async function setFlag(entity, key, value) {
    if (entity === "world" || entity === "client") {
        key = `perfect-vision.${key}`;

        if (value === undefined) value = null;

        const json = JSON.stringify(value);

        if (entity === "world") {
            await SocketInterface.dispatch("modifyDocument", {
                type: "Setting",
                action: "update",
                data: { key, value: json }
            });
        }

        const storage = game.settings.storage.get(entity);
        storage.setItem(key, json);
        return entity;
    }

    if (entity instanceof Actor) {
        key = `flags.perfect-vision.${key}`;
        return await entity.update({ token: mergeObject(entity.data.token, { [key]: value }, { inplace: false }) });
    }

    return await entity.setFlag("perfect-vision", key, value);
}

async function unsetFlag(entity, key) {
    if (entity === "world" || entity === "client") {
        key = `perfect-vision.${key}`;

        if (entity === "world") {
            await SocketInterface.dispatch("modifyDocument", {
                type: "Setting",
                action: "update",
                data: { key, value: JSON.stringify(null) }
            });
        }

        const storage = game.settings.storage.get(entity);

        if (entity === "client") {
            storage.removeItem(key);
        } else {
            storage.delete(key);
        }

        return entity;
    }

    if (entity instanceof Actor) {
        key = `flags.perfect-vision.-=${key}`;
        return await entity.update({ token: mergeObject(entity.data.token, { [key]: null }, { inplace: false }) });
    }

    return await entity.unsetFlag("perfect-vision", key);
}

let migrator;
let notifed = false;

async function migrate(entity, func) {
    let type;

    if (entity instanceof Scene) {
        type = "scene";
    } else if (entity instanceof Actor) {
        type = "actor";
    } else if (entity instanceof Token) {
        type = "token";
    } else {
        type = entity;
    }

    const versionKey = type !== "client" ? "_version" : "_clientVersion";
    const flags = Object.keys(getFlags(entity) ?? {});
    const canUpdateFlags = type === "client" || game.user === migrator;

    if (flags.length === 0) {
        return false;
    } else if (flags.length === 1 && flags[0] === versionKey) {
        if (canUpdateFlags)
            await unsetFlag(entity, versionKey);

        return false;
    }

    let currentVersion = getFlag(entity, versionKey) ?? 0;
    const targetVersion = versions[type === "actor" ? "token" : type];

    if (currentVersion === 0 && targetVersion === 1) {
        if (canUpdateFlags)
            await setFlag(entity, versionKey, targetVersion);

        return false;
    }

    if (isNewerVersion(currentVersion, targetVersion)) {
        if (!notifed) {
            ui.notifications.error("Please update 'Perfect Vision' to the latest version.");
            notifed = true;
        }
    } else if (isNewerVersion(targetVersion, currentVersion)) {
        if (canUpdateFlags) {
            console.log(`Perfect Vision | Migrating ${type + (entity.id ? " " + entity.id : "")} from version ${currentVersion} to ${targetVersion}`);

            await setFlag(entity, versionKey, targetVersion);

            await func.call(entity, currentVersion);

            return true;
        } else if (!notifed) {
            ui.notifications.error("'Perfect Vision' was updated. The GM needs to connect first to complete the migration. Then reload.");
            notifed = true;
        }
    }

    return false;
}

async function migrateToken(token) {
    return await migrate(token, async function (version) { /* ... */ });
}

async function migrateTokens() {
    const migrated = [];

    for (const scene of game.scenes.entities) {
        for (const data of scene.getEmbeddedCollection("Token")) {
            migrated.push(await migrateToken(new Token(data, scene)));
        }
    }

    return migrated.some(m => m);
}

async function migrateActor(actor) {
    return await migrateToken(actor);
}

async function migrateActors() {
    const migrated = [];

    for (const actor of game.actors.entities) {
        migrated.push(await migrateActor(actor));
    }

    return migrated.some(m => m);
}

async function migrateScene(scene) {
    await migrate(scene, async function (version) { /* ... */ });
}

async function migrateScenes() {
    const migrated = [];

    for (const scene of game.scenes.entities) {
        migrated.push(await migrateScene(scene));
    }

    return migrated.some(m => m);
}

async function resetInvalidSettingsToDefault(scope) {
    let migrated = false;

    for (const s of game.settings.settings.values()) {
        if (s.module !== "perfect-vision")
            continue;

        if (s.scope !== scope)
            continue;

        if (s.choices && !s.choices[game.settings.get(s.module, s.key)]) {
            await game.settings.set(s.module, s.key, s.default);

            migrated = true;
        }
    }

    return migrated;
}

async function migrateWorldSettings() {
    let migrated = false;

    migrated = await migrate("world", async function (version) { /* ... */ }) || migrated;
    migrated = await resetInvalidSettingsToDefault("world") || migrated;

    return migrated;
}

async function migrateClientSettings() {
    let migrated = false;

    migrated = await migrate("client", async function (version) { /* ... */ }) || migrated;
    migrated = await resetInvalidSettingsToDefault("client") || migrated;

    return migrated;
}

async function migrateSettings() {
    let migrated = false;

    migrated = await migrateClientSettings() || migrated;
    migrated = await migrateWorldSettings() || migrated;

    return migrated;
}

async function migrateAll() {
    let migrated = false;

    migrated = await migrateSettings() || migrated;
    migrated = await migrateActors() || migrated;
    migrated = await migrateScenes() || migrated;
    migrated = await migrateTokens() || migrated;

    return migrated;
}

var ready = false;

function onMigration(migrated) {
    if (!migrated || !ready)
        return;

    canvas.app.ticker.remove(refresh, globalThis);
    canvas.app.ticker.addOnce(refresh, globalThis, PIXI.UPDATE_PRIORITY.LOW + 2);
}

var refreshHookID = null;

function refresh() {
    if (!canvas?.ready) {
        if (refreshHookID == null) {
            refreshHookID = Hooks.once("canvasReady", refresh);
        }

        return;
    }

    if (refreshHookID != null) {
        refreshHookID = null;
        Hooks.off("canvasReady", refresh);
    }

    for (const token of canvas.tokens.placeables) {
        token.updateSource({ defer: true });
    }

    canvas.lighting.refresh();
    canvas.sight.refresh();
}

Hooks.once("init", () => {
    game.settings.register("perfect-vision", "_version", {
        name: "World Settings Version",
        hint: "World Settings Version",
        scope: "world",
        config: false,
        type: Number,
        default: 0,
        onChange: () => migrateWorldSettings()
    });

    game.settings.register("perfect-vision", "_clientVersion", {
        name: "Client Settings Version",
        hint: "Client Settings Version",
        scope: "client",
        config: false,
        type: Number,
        default: 0,
        onChange: () => migrateClientSettings()
    });

    patch("Game.prototype.initializeEntities", "POST", function () {
        if (migrator !== undefined) {
            return;
        }

        const activeGMs = game.users.filter(user => user.isGM && user.active);

        if (activeGMs.length === 1) {
            migrator = activeGMs[0];
        } else {
            migrator = null;
        }

        return arguments[0];
    });

    patch("SightLayer.prototype.refresh", "PRE", function (opts) {
        if (!ready) {
            opts = opts ?? {};
            opts.noUpdateFog = true;
            return [opts];
        }
        return arguments;
    });
});

Hooks.on("renderTokenConfig", (sheet, html, data) => {
    const version = document.createElement("input");
    version.setAttribute("type", "hidden");
    version.setAttribute("name", "flags.perfect-vision._version");
    version.setAttribute("value", versions.token);
    version.setAttribute("data-dtype", "Number");
    html.find(`input[name="vision"]`)[0]?.form?.appendChild(version);
});

Hooks.on("renderSceneConfig", (sheet, html, data) => {
    const version = document.createElement("input");
    version.setAttribute("type", "hidden");
    version.setAttribute("name", "flags.perfect-vision._version");
    version.setAttribute("value", versions.scene);
    version.setAttribute("data-dtype", "Number");
    html.find(`input[name="tokenVision"]`)[0]?.form?.appendChild(version);
});

Hooks.on("renderSettingsConfig", (sheet, html, data) => {
    const version = document.createElement("input");
    version.setAttribute("type", "hidden");
    version.setAttribute("name", "perfect-vision._version");
    version.setAttribute("value", versions.world);
    version.setAttribute("data-dtype", "Number");
    html.find(`select[name="perfect-vision.visionRules"]`)[0]?.form?.appendChild(version);

    const clientVersion = document.createElement("input");
    clientVersion.setAttribute("type", "hidden");
    clientVersion.setAttribute("name", "perfect-vision._clientVersion");
    clientVersion.setAttribute("value", versions.client);
    clientVersion.setAttribute("data-dtype", "Number");
    html.find(`select[name="perfect-vision.visionRules"]`)[0]?.form?.appendChild(clientVersion);
});

Hooks.on("updateToken", async (scene, data, update, options, userId) => {
    if (!hasProperty(update, "flags.perfect-vision"))
        return;

    await migrateToken(new Token(data, scene)).then(onMigration);
});

Hooks.on("updateActor", async (actor, update, options, userId) => {
    if (!hasProperty(update, "flags.perfect-vision"))
        return;

    await migrateActor(actor).then(onMigration);
});

Hooks.on("updateScene", async (scene, update, options, userId) => {
    if (!hasProperty(update, "flags.perfect-vision"))
        return;

    await migrateScene(scene).then(onMigration);
});

Hooks.once("ready", async () => {
    await migrateAll();

    ready = true;

    refresh();
});
