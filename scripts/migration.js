import { isPlainObject } from "./utils/helpers.js";
import { Console } from "./utils/console.js";
import { Notifications } from "./utils/notifications.js";

Hooks.once("init", () => {
    game.settings.register("perfect-vision", "migration", {
        scope: "world",
        config: false,
        type: Number,
        default: -1
    });
});

Hooks.once("ready", () => {
    if (game.user === game.users.find(user => user.isGM && user.active)) {
        migrate();
    }
});

async function migrate() {
    if (game.settings.get("perfect-vision", "migration") <= 0) {
        const settings = game.settings.storage.get("world");
        const settingsPreV10 = [
            "perfect-vision._version",
            "perfect-vision.actualFogOfWar",
            "perfect-vision.brightVisionInDarkness",
            "perfect-vision.brightVisionInDimLight",
            "perfect-vision.dimVisionInDarkness",
            "perfect-vision.dimVisionInDimLight",
            "perfect-vision.fogOfWarWeather",
            "perfect-vision.forceMonoVision",
            "perfect-vision.globalLight",
            "perfect-vision.improvedGMVision",
            "perfect-vision.monoSpecialEffects",
            "perfect-vision.monoTokenIcons",
            "perfect-vision.monoVisionColor",
            "perfect-vision.popup",
            "perfect-vision.visionRules"
        ];

        if (game.settings.get("perfect-vision", "migration") === 0
            || settingsPreV10.some(key => settings.getSetting(key))) {
            await migratePreV10({
                scenes: game.scenes,
                actors: game.actors,
                packs: game.packs.filter(pack => pack.metadata.packageType === "world"),
                settings: settings.filter(setting => settingsPreV10.includes(setting.key))
            });
        } else {
            await game.settings.set("perfect-vision", "migration", 1);
        }
    }
}

async function migratePreV10({ scenes = [], actors = [], packs = [], settings = [] }) {
    if (!game.user.isGM) {
        throw new Error("Migrating requires GM privileges");
    }

    validateCollection(scenes, Scene);
    validateCollection(actors, Actor);
    validateCollection(packs, CompendiumCollection);
    validateCollection(settings, Setting);

    Notifications.warn("Migrating... Do NOT logout, reload, or exit Foundry VTT until it is completed!", { permanent: true });

    try {
        await migratePreV10Scenes(scenes);
        await migratePreV10Actors(actors);
        await migratePreV10Packs(packs);

        Console.info(`Migrating Setting`);

        await Setting.deleteDocuments(
            settings.map(setting => setting.id),
            { noHook: true }
        );

        await game.settings.set("perfect-vision", "migration", 1);

        Notifications.info("Migration completed successfully!", { permanent: true });
    } catch (e) {
        Notifications.error("Migration did NOT complete successfully!", { permanent: true });

        throw e;
    }
}

async function migratePreV10Scenes(scenes) {
    for (const scene of scenes) {
        Console.info(`Migrating ${scene.uuid}`);

        if ("perfect-vision" in scene.flags) {
            const flags = scene.flags["perfect-vision"] ?? {};
            const update = {
                "flags.perfect-vision.-=_version": null,
                "flags.perfect-vision.-=globalLight": null,
                "flags.perfect-vision.-=forceSaturation": null,
                "flags.perfect-vision.-=revealed": null,
                "flags.perfect-vision.-=saturation": null,
                "flags.perfect-vision.-=sightLimit": null
            };

            if (flags.revealed) {
                update["flags.perfect-vision.fogRevealed"] = true;
            }

            if (isPlainObject(flags.globalLight)) {
                delete update["flags.perfect-vision.-=globalLight"];
            }

            if (flags.sightLimit !== undefined) {
                update["flags.perfect-vision.light.visionLimitation.sight"] = migrateNonnegativeNumber(flags.sightLimit);
            }

            if (flags.daylightColor) {
                update["flags.perfect-vision.daylightColor"] = migrateColorString(flags.daylightColor);
            } else {
                update["flags.perfect-vision.-=daylightColor"] = null;
            }

            if (flags.darknessColor) {
                update["flags.perfect-vision.darknessColor"] = migrateColorString(flags.darknessColor);
            } else {
                update["flags.perfect-vision.-=darknessColor"] = null;
            }

            await scene.update(prepareUpdate(scene, update), { noHook: true });
        }

        Console.info(`Migrating ${scene.uuid}.Token`);

        await scene.updateEmbeddedDocuments(
            "Token",
            scene.tokens
                .filter(document => "perfect-vision" in document.flags)
                .map(document => {
                    const flags = document.flags["perfect-vision"] ?? {};
                    const update = {
                        _id: document.id,
                        "flags.perfect-vision.-=_version": null,
                        "flags.perfect-vision.-=brightVisionInDarkness": null,
                        "flags.perfect-vision.-=brightVisionInDimLight": null,
                        "flags.perfect-vision.-=dimVisionInDarkness": null,
                        "flags.perfect-vision.-=dimVisionInDimLight": null,
                        "flags.perfect-vision.-=monoVisionColor": null,
                        "flags.perfect-vision.-=sightLimit": null,
                        "flags.perfect-vision.-=visionRules": null,
                        "flags.perfect-vision.light.-=sightLimit": null
                    };

                    if (flags.light?.sightLimit !== undefined) {
                        update["flags.perfect-vision.light.visionLimitation.enabled"] = true;
                        update["flags.perfect-vision.light.visionLimitation.sight"] = migrateNonnegativeNumber(flags.light.sightLimit);
                    } else if (!isPlainObject(flags.light) || Object.keys(flags.light).length === 0) {
                        delete update["flags.perfect-vision.light.-=sightLimit"];
                        update["flags.perfect-vision.-=light"] = null;
                    }

                    return prepareUpdate(document, update);
                }),
            { noHook: true }
        );

        Console.info(`Migrating ${scene.uuid}.AmbientLight`);

        await scene.updateEmbeddedDocuments(
            "AmbientLight",
            scene.lights
                .filter(document => "perfect-vision" in document.flags)
                .map(document => {
                    const flags = document.flags["perfect-vision"] ?? {};
                    const update = {
                        _id: document.id,
                        "flags.perfect-vision.-=_version": null,
                        "flags.perfect-vision.-=unrestricted": null,
                        "flags.perfect-vision.-=sightLimit": null
                    };

                    if (flags.sightLimit !== undefined) {
                        update["flags.perfect-vision.visionLimitation.enabled"] = true;
                        update["flags.perfect-vision.visionLimitation.sight"] = migrateNonnegativeNumber(flags.sightLimit);
                    }

                    return prepareUpdate(document, update);
                }),
            { noHook: true }
        );

        Console.info(`Migrating ${scene.uuid}.MeasuredTemplate`);

        await scene.updateEmbeddedDocuments(
            "MeasuredTemplate",
            scene.templates
                .filter(document => "perfect-vision" in document.flags)
                .map(document => {
                    const flags = document.flags["perfect-vision"] ?? {};
                    const update = {
                        _id: document.id,
                        "flags.perfect-vision.-=_version": null,
                        "flags.perfect-vision.-=sightLimit": null
                    };

                    if (flags.sightLimit !== undefined) {
                        update["flags.perfect-vision.visionLimitation.enabled"] = true;
                        update["flags.perfect-vision.visionLimitation.sight"] = migrateNonnegativeNumber(flags.sightLimit);
                    }

                    return prepareUpdate(document, update);
                }),
            { noHook: true }
        );

        Console.info(`Migrating ${scene.uuid}.Drawing`);

        await scene.updateEmbeddedDocuments(
            "Drawing",
            scene.drawings
                .filter(document => "perfect-vision" in document.flags)
                .map(document => {
                    const flags = document.flags["perfect-vision"] ?? {};
                    const update = {
                        _id: document.id,
                        "flags.perfect-vision.-=_version": null,
                        "flags.perfect-vision.-=active": null,
                        "flags.perfect-vision.-=origin": null,
                        "flags.perfect-vision.-=parent": null,
                        "flags.perfect-vision.-=revealed": null,
                        "flags.perfect-vision.-=saturation": null,
                        "flags.perfect-vision.-=sightLimit": null,
                        "flags.perfect-vision.-=vision": null,
                        "flags.perfect-vision.-=walls": null
                    };

                    if (flags.active && document.hidden) {
                        update["hidden"] = false;
                    }

                    if (flags.active) {
                        update["flags.perfect-vision.enabled"] = true;
                    }

                    if (flags.fit) {
                        update["flags.perfect-vision.fit"] = true;
                    } else {
                        update["flags.perfect-vision.-=fit"] = null;
                    }

                    if (flags.parent && typeof flags.parent === "string") {
                        update["flags.perfect-vision.prototype"] = flags.parent;
                    }

                    if (flags.revealed) {
                        update["flags.perfect-vision.fogRevealed"] = true;
                    }

                    if (flags.globalLight !== undefined && !isPlainObject(flags.globalLight)) {
                        update["flags.perfect-vision.globalLight.enabled"] = !!flags.globalLight;
                    }

                    if (flags.globalLightThreshold !== undefined) {
                        update["flags.perfect-vision.globalLight.darkness.max"] = migrateNonnegativeNumber(flags.globalLightThreshold) ?? 1;
                    }

                    if (flags.vision !== undefined) {
                        update["flags.perfect-vision.globalLight.vision"] = !!flags.vision;
                    }

                    if (flags.darkness !== undefined) {
                        update["flags.perfect-vision.darkness"] = Number.isFinite(flags.darkness) ? Math.clamped(flags.darkness, 0, 1) : 0;
                    }

                    if (flags.sightLimit !== undefined) {
                        update["flags.perfect-vision.visionLimitation.sight"] = migrateNonnegativeNumber(flags.sightLimit);
                    }

                    if (flags.walls && isPlainObject(flags.origin)) {
                        const toNumber = x => Number.isFinite(x) ? x : 0;
                        const origin = new PIXI.Point(
                            toNumber(flags.origin.x ?? 0.5),
                            toNumber(flags.origin.y ?? 0.5)
                        );
                        const transform = new PIXI.Matrix();

                        transform.translate(
                            -document.shape.width / 2, -document.shape.height / 2);
                        transform.rotate(Math.toRadians(document.rotation || 0));
                        transform.translate(
                            document.x + document.shape.width / 2,
                            document.y + document.shape.height / 2);
                        transform.apply(origin, origin);

                        origin.x = Math.clamped(Math.round(origin.x), 0, scene.width);
                        origin.y = Math.clamped(Math.round(origin.y), 0, scene.height);

                        update["flags.perfect-vision.globalLight.x"] = toNumber(origin.x);
                        update["flags.perfect-vision.globalLight.y"] = toNumber(origin.y);
                    }

                    if (flags.daylightColor !== undefined) {
                        update["flags.perfect-vision.daylightColor"] = migrateColorString(flags.daylightColor, 0x0F0F0F);
                    }

                    if (flags.darknessColor !== undefined) {
                        update["flags.perfect-vision.darknessColor"] = migrateColorString(flags.darknessColor, 0x0F0F0F);
                    }

                    return prepareUpdate(document, update);
                }),
            { noHook: true }
        );
    }
}

async function migratePreV10Actors(actors, pack) {
    Console.info(`Migrating ${pack ? pack + "." : ""}Actor`);

    await Actor.updateDocuments(
        actors
            .filter(document => document.prototypeToken && "perfect-vision" in document.prototypeToken.flags)
            .map(document => {
                const flags = document.prototypeToken.flags["perfect-vision"] ?? {};
                const update = {
                    _id: document.id,
                    "prototypeToken.flags.perfect-vision.-=_version": null,
                    "prototypeToken.flags.perfect-vision.-=brightVisionInDarkness": null,
                    "prototypeToken.flags.perfect-vision.-=brightVisionInDimLight": null,
                    "prototypeToken.flags.perfect-vision.-=dimVisionInDarkness": null,
                    "prototypeToken.flags.perfect-vision.-=dimVisionInDimLight": null,
                    "prototypeToken.flags.perfect-vision.-=monoVisionColor": null,
                    "prototypeToken.flags.perfect-vision.-=sightLimit": null,
                    "prototypeToken.flags.perfect-vision.-=visionRules": null,
                    "prototypeToken.flags.perfect-vision.light.-=sightLimit": null
                };

                if (flags.light?.sightLimit !== undefined) {
                    update["prototypeToken.flags.perfect-vision.light.visionLimitation.enabled"] = true;
                    update["prototypeToken.flags.perfect-vision.light.visionLimitation.sight"] = migrateNonnegativeNumber(flags.light.sightLimit);
                } else if (!isPlainObject(flags.light) || Object.keys(flags.light).length === 0) {
                    delete update["prototypeToken.flags.perfect-vision.light.-=sightLimit"];
                    update["prototypeToken.flags.perfect-vision.-=light"] = null;
                }

                return prepareUpdate(document, update, "prototypeToken");
            }),
        { noHook: true, pack }
    );
}

function validateCollection(elements, elementClass) {
    if (elements == null || typeof elements[Symbol.iterator] !== "function"
        || !Array.from(elements).every(object => object instanceof elementClass)) {
        throw new Error(`Expected collection of ${elementClass.documentName}`);
    }
}

function migrateNonnegativeNumber(range) {
    return Number.isFinite(range) ? Math.max(range, 0) : null;
}

function migrateColorString(color, minimum, maximum) {
    if (typeof color === "string" && /^#[0-9A-F]{6,6}$/i.test(color)) {
        color = foundry.utils.Color.fromString(color);
    } else {
        return null;
    }

    if (minimum != null) {
        color = color.maximize(foundry.utils.Color.from(minimum));
    }

    if (maximum != null) {
        color = color.minimize(foundry.utils.Color.from(maximum));
    }

    return color.css;
}

function prepareUpdate(document, update, nested = "") {
    if (foundry.utils.isEmpty(
        foundry.utils.getProperty(
            foundry.utils.mergeObject(
                document.toObject(true),
                update,
                { inplace: false, performDeletions: true }
            ),
            (nested && nested + ".") + "flags.perfect-vision"
        )
    )) {
        const prefix = (nested && nested + ".") + "flags.perfect-vision.";

        for (const key in update) {
            if (key.startsWith(prefix)) {
                delete update[key];
            }
        }

        update[(nested && nested + ".") + "flags.-=perfect-vision"] = null;
    }

    return update;
}

async function migratePreV10Packs(packs) {
    await Dialog.prompt({
        title: "Perfect Vision: Compendium Packs Migration",
        content: "<p><strong>Attention!</strong> Wait for other ongoing migrations to finish first before you migrate the compendium packs.</p>",
        label: "Migrate Compendium Packs",
        rejectClose: false
    });

    for (const pack of packs) {
        if (pack.documentName !== "Scene" && pack.documentName !== "Actor") {
            continue;
        }

        Console.info(`Migrating Compendium.${pack.collection}`);

        let wasLocked = false;

        try {
            for (let trysLeft = 3; trysLeft--;) {
                try {
                    if (wasLocked = pack.locked) {
                        Console.info(`Unlocking Compendium.${pack.collection}`);

                        await pack.configure({ locked: false });
                    }

                    switch (pack.documentName) {
                        case "Scene": await migratePreV10Scenes(await pack.getDocuments()); break;
                        case "Actor": await migratePreV10Actors(await pack.getDocuments(), pack.collection); break;
                    }

                    break;
                } catch (e) {
                    if (trysLeft === 0) {
                        Console.error(`Failed for migrate Compendium.${pack.collection}`);

                        throw e;
                    }

                    await new Promise(r => setTimeout(r, 1000));
                }
            }
        } finally {
            pack.clear();

            if (wasLocked) {
                Console.info(`Relocking Compendium.${pack.collection}`);

                await pack.configure({ locked: true });
            }
        }
    }
}
