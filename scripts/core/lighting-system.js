import { cloneData, inheritData, overrideData, updateData } from "../utils/helpers.js";
import { RayCastingSystem } from "./ray-casting-system.js";
import { Console } from "../utils/console.js";
import { Notifications } from "../utils/notifications.js";
import { Shape } from "../utils/shape.js";
import { SmoothGeometry, SmoothMesh } from "../utils/smooth-mesh.js";
import { ShaderPatcher } from "../utils/shader-patcher.js";
import { DepthShader } from "./point-source-shader.js";

const tempMatrix = new PIXI.Matrix();

/**
 * @typedef {object} LightingRegionData
 * @property {PlaceableObject} object
 * @property {boolean} active
 * @property {string|null} prototype
 * @property {object} shape
 * @property {number} shape.x
 * @property {number} shape.y
 * @property {number} shape.width
 * @property {number} shape.height
 * @property {number} shape.scaleX
 * @property {number} shape.scaleY
 * @property {number} shape.rotation
 * @property {number[]|null} shape.points
 * @property {number} shape.bezierFactor
 * @property {"r"|"e"|"p"} shape.type
 * @property {PIXI.Texture|null} texture
 * @property {boolean} fit
 * @property {number} elevation
 * @property {number} sort
 * @property {number} height
 * @property {boolean} occluded
 * @property {number} occlusionMode
 * @property {boolean} [fogExploration]
 * @property {boolean} [fogRevealed]
 * @property {object} [globalLight]
 * @property {number} [globalLight.alpha]
 * @property {object} [globalLight.animation]
 * @property {number} [globalLight.animation.intensity]
 * @property {boolean} [globalLight.animation.reverse]
 * @property {number} [globalLight.animation.speed]
 * @property {string} [globalLight.animation.type]
 * @property {boolean} [globalLight.bright]
 * @property {number|null} [globalLight.color]
 * @property {number} [globalLight.coloration]
 * @property {number} [globalLight.contrast]
 * @property {object} [globalLight.darkness]
 * @property {number} [globalLight.darkness.max]
 * @property {number} [globalLight.darkness.min]
 * @property {boolean} [globalLight.enabled]
 * @property {number} [globalLight.luminosity]
 * @property {number} [globalLight.resolution]
 * @property {number} [globalLight.saturation]
 * @property {number|null} [globalLight.seed]
 * @property {number} [globalLight.shadows]
 * @property {number} [globalLight.vision]
 * @property {number} [globalLight.x]
 * @property {number} [globalLight.y]
 * @property {number} [globalLight.z]
 * @property {object} [lightLevels]
 * @property {number} [lightLevels.bright]
 * @property {number} [lightLevels.dim]
 * @property {number} [lightLevels.halfdark]
 * @property {number} [lightLevels.dark]
 * @property {number} [darkness]
 * @property {number} [darknessLightPenalty]
 * @property {string} [brightestColor]
 * @property {string} [daylightColor]
 * @property {string} [darknessColor]
 * @property {object} [visionLimitation]
 * @property {object} [visionLimitation.detection]
 * @property {boolean} [visionLimitation.enabled]
 * @property {number} [visionLimitation.sight]
 */

/**
 * The lighting system.
 */
export class LightingSystem {
    /**
     * The lighting system instance.
     * @type {LightingSystem}
     * @readonly
     */
    static instance = new LightingSystem();

    /**
     * Print debug messages?
     * @type {boolean}
     */
    static debug = false;

    /**
     * The default lighting system data.
     * @returns {LightingRegionData}
     */
    static getDefaultData() {
        const data = LightingRegion.getDefaultData();
        const sceneDefaults = Scene.cleanData();
        const dimensions = canvas.dimensions;

        data.fogExploration = sceneDefaults.fogExploration;
        data.fogRevealed = false;

        foundry.utils.mergeObject(
            data.globalLight,
            foundry.data.LightData.cleanData(),
            { insertKeys: false }
        );
        foundry.utils.mergeObject(
            data.globalLight,
            CONFIG.Canvas.globalLightConfig,
            { insertKeys: false }
        );

        data.globalLight.enabled = sceneDefaults.globalLight;
        data.globalLight.x = CONFIG.Canvas.globalLightConfig.x ?? dimensions.sceneX ?? 0;
        data.globalLight.y = CONFIG.Canvas.globalLightConfig.y ?? dimensions.sceneY ?? 0;
        data.globalLight.z = null;
        data.globalLight.bright = CONFIG.Canvas.globalLightConfig.bright > 0;
        data.globalLight.darkness.min = 0;
        data.globalLight.darkness.max = sceneDefaults.globalLightThreshold ?? 1;
        data.globalLight.resolution = 1;
        data.globalLight.seed = CONFIG.Canvas.globalLightConfig.seed || 0;
        data.globalLight.vision = !!CONFIG.Canvas.globalLightConfig.vision;
        data.darkness = sceneDefaults.darkness;
        data.darknessLightPenalty = CONFIG.Canvas.darknessLightPenalty;
        data.brightestColor = CONFIG.Canvas.brightestColor;
        data.daylightColor = CONFIG.Canvas.daylightColor;
        data.darknessColor = CONFIG.Canvas.darknessColor;

        const lightLevels = CONFIG.Canvas.lightLevels;

        data.lightLevels.bright = lightLevels.bright;
        data.lightLevels.dim = lightLevels.dim;
        data.lightLevels.halfdark = lightLevels.halfdark;
        data.lightLevels.dark = lightLevels.dark;
        data.visionLimitation.detection = {};
        data.visionLimitation.enabled = false;
        data.visionLimitation.sight = Infinity;

        for (const detectionMode of Object.values(CONFIG.Canvas.detectionModes)) {
            data.visionLimitation.detection[detectionMode.id] = Infinity;
        }

        return data;
    }

    /**
     * The current walls ID.
     * @type {number}
     * @internal
     */
    static _wallsID = 0;

    /**
     * The sorted array of active regions.
     * @type {LightingRegion[]}
     * @readonly
     */
    activeRegions = [];

    /**
     * The regions.
     * @type {Map<string,LightingRegion>}
     * @readonly
     */
    #regions = new Map();

    /**
     * Is a refresh required?
     * @type {boolean}
     */
    #dirty = false;

    /**
     * The default lighting data.
     * @type {LightingRegionData}
     * @readonly
     */
    #defaultData = {};

    /**
     * The override lighting data.
     * @type {LightingRegionData}
     * @readonly
     */
    #overrideData = {};

    /**
     * The walls ID used for tracking wall changes.
     * @type {number}
     */
    #wallsID = -1;

    /**
     * Perception update flags.
     * @type {object}
     * @readonly
     */
    #perception = {
        forceUpdateFog: false,
        initializeLighting: false,
        initializeVision: false,
        refreshDepth: false,
        refreshLighting: false,
        refreshLightSources: false,
        refreshPrimary: false,
        refreshTiles: false,
        refreshVision: false,
        refreshVisionSources: false,
    };

    /**
     * The flat list of elevation-depth pairs sorted by elevation in ascending order.
     * @type {number[]}
     */
    #elevationDepthMap = [];

    [Symbol.iterator]() {
        return this.#regions.values();
    }

    /**
     * Set dirty state.
     * @param {boolean} [dirty=true] - Is dirty?
     * @param {boolean} [perception=true] - Is a full perception update required?
     */
    #setDirty(dirty = true, perception = true) {
        this.#dirty = dirty;

        if (perception) {
            for (const key in this.#perception) {
                this.#perception[key] = dirty;
            }
        }
    }

    /**
     * Create a new region.
     * @param {string} id - The ID of the region.
     * @param {LightingRegionData} [data] - The data of the region.
     * @returns {LightingRegion} The new region.
     * @throws Throws an error if a region with this ID already exists.
     */
    createRegion(id, data) {
        if (this.#regions.has(id)) {
            throw new Error();
        }

        const region = new LightingRegion(id);

        if (data) {
            region._update(data);
        }

        this.#regions.set(id, region);
        this.#setDirty(true);

        RayCastingSystem.instance.createRegion(id);

        if (this.constructor.debug) {
            Console.debug(
                "%s (%O) | Created %s (%O) | %O",
                this.constructor.name,
                this,
                region.id,
                region,
                { data }
            );
        }

        return region;
    }

    /**
     * Update the region.
     * @param {string} id - The ID of the region.
     * @param {LightingRegionData} changes - The changes to the data of the region.
     * @returns {boolean} True if and only if the data of the region has been changed.
     */
    updateRegion(id, changes) {
        const region = this.#regions.get(id);
        const changed = region._update(changes);

        this.#dirty ||= changed;

        if (this.constructor.debug) {
            Console.debug(
                "%s (%O) | Updated %s (%O) | %O",
                this.constructor.name,
                this,
                region.id,
                region,
                { changes, changed }
            );
        }

        return changed;
    }

    /**
     * Destroy the region. If active, it is not actually destroyed until next refresh.
     * @param {string} id - The ID of the region.
     * @returns {boolean} True if and only if the region existed.
     */
    destroyRegion(id) {
        const region = this.#regions.get(id);

        if (!region) {
            return false;
        }

        region.destroyed = true;

        if (!region.active) {
            region._destroy();
        }
        this.#regions.delete(id);
        this.#setDirty(true);

        RayCastingSystem.instance.destroyRegion(id);
        canvas.effects.lightSources.delete(id);

        if (this.constructor.debug) {
            Console.debug(
                "%s (%O) | Destroyed %s (%O)",
                this.constructor.name,
                this,
                region.id,
                region
            );
        }

        return true;
    }

    /**
     * Does the region exist?
     * @param {string} id - The ID of the region.
     * @returns {boolean} True if and only if the region exists.
     */
    hasRegion(id) {
        return this.#regions.has(id);
    }

    /**
     * Get the region.
     * @param {string} id - The ID of the region.
     * @returns {LightingRegion|undefined} The region if it exists.
     */
    getRegion(id) {
        return this.#regions.get(id);
    }

    /**
     * Get the active region at the point and elevation.
     * @param {{x: number, y: number, z: number|undefined}} point - The point.
     * @param {number} [elevation] - The elevation.
     * @returns {LightingRegion|undefined} The region at this point and elevation if there is one.
     */
    getRegionAt(point, elevation) {
        for (let i = this.activeRegions.length - 1; i >= 0; i--) {
            const region = this.activeRegions[i];

            if (region.containsPoint(point, elevation)) {
                return region;
            }
        }
    }

    /**
     * Reset the system.
     */
    reset() {
        for (const region of this.#regions.values()) {
            region.destroyed = true;
            region._destroy();
        }

        this.activeRegions.length = 0;
        this.#regions.clear();
        this.#setDirty(true);
    }

    /**
     * Refresh the system.
     * @param {LightingRegionData} [override] - Overrides the data of all regions.
     * @returns {object} The necessary perception updates.
     */
    refresh(override = {}) {
        if (updateData(this.#defaultData, this.constructor.getDefaultData())) {
            this.#dirty = true;
        }

        if (updateData(this.#overrideData, override)) {
            this.#dirty = true;
        }

        let wallsChanged = false;

        if (this.#wallsID !== this.constructor._wallsID) {
            this.#wallsID = this.constructor._wallsID;

            this.#dirty = wallsChanged = true;
        }

        if (!this.#dirty) {
            return {};
        }

        if (this.constructor.debug) {
            Console.debug("%s (%O) | Refreshing | %O", this.constructor.name, this, override);
        }

        for (const region of this.activeRegions) {
            if (region.destroyed) {
                region._destroy();
            }
        }

        this.activeRegions.length = 0;

        const visitedRegions = new Map();
        const refreshRegion = id => {
            const region = id ? this.#regions.get(id) : undefined;

            if (!region) {
                return [null, this.#defaultData];
            }

            let data = visitedRegions.get(id);

            if (data) {
                return [region, data];
            }

            visitedRegions.set(id, data = cloneData(region.data));

            const [prototype, prototypeData] = refreshRegion(region.data.prototype);

            region.prototype = prototype;

            if (region.data.prototype && !prototype) {
                data.active = false;
            }

            inheritData(data, prototypeData);
            overrideData(data, this.#overrideData);

            const changes = {};

            if (wallsChanged && data.fit) {
                changes.fit = true;
            }

            if (updateData(region._data, data, changes) || changes.fit) {
                region._refresh(data, changes, this.#defaultData, this.#perception);

                if (this.constructor.debug) {
                    Console.debug(
                        "%s (%O) | Refreshed %s (%O) | %O",
                        this.constructor.name,
                        this,
                        region.id,
                        region,
                        { data, changes }
                    );
                }
            }

            if (region.active) {
                this.activeRegions.push(region);
            }

            return [region, data];
        }

        for (const id of this.#regions.keys()) {
            refreshRegion(id);
        }

        this.activeRegions.sort(LightingRegion._compare);

        if (this.#perception.refreshDepth) {
            this.#elevationDepthMap.length = 0;

            const regionsAtSameElevation = [];
            let depthIndex = 0;

            for (const region of Array.from(this.#regions.values()).sort(LightingRegion._compare)) {
                if (regionsAtSameElevation.length) {
                    const previousRegion = regionsAtSameElevation.at(-1);

                    if (region.elevation !== previousRegion.elevation) {
                        this.#elevationDepthMap.push(previousRegion.depth, region.elevation);
                        regionsAtSameElevation.length = 0;
                        depthIndex++;
                    } else if (region.active) {
                        depthIndex = Math.max(depthIndex, ...regionsAtSameElevation.filter(r =>
                            region.globalLight !== r.globalLight &&
                            region.bounds.intersects(r.bounds)).map(r => r.depthIndex + 1));
                    }
                } else {
                    this.#elevationDepthMap.push(region.elevation);
                }

                region.depthIndex = depthIndex;
                region.depth = Math.min((depthIndex + 51) / 255, 1);
                regionsAtSameElevation.push(region);
            }

            if (regionsAtSameElevation.length) {
                this.#elevationDepthMap.push(regionsAtSameElevation.at(-1).depth);
            }

            if (game.user.isGM && !this._suppressDepthWarning && depthIndex > 255 - 51) {
                Notifications.warn(
                    "The depth buffer precision has been exceeded. Too many unique elevations.",
                    { permanent: true }
                );

                this._suppressDepthWarning = true;
            } else {
                this._suppressDepthWarning = false;
            }
        }

        const perception = { ...this.#perception };

        this.#setDirty(false);

        if (this.constructor.debug) {
            Console.debug(
                "%s (%O) | Refreshed | %O",
                this.constructor.name,
                this,
                { perception: { ...perception } }
            );
        }

        return perception;
    }

    /**
     * Maps the elevation (in units) to the color intensity.
     * @param {number} elevation - The elevation in units.
     * @returns {number} The color intensity in the range [0.19, 1.0].
     */
    mapElevationAlpha(elevation) {
        const depths = this.#elevationDepthMap;

        for (let i = depths.length; i;) {
            if (elevation >= depths[i -= 2]) {
                return depths[i + 1];
            }
        }

        return 0.19;
    }
}

/**
 * The region of {@link LightingSystem}.
 */
export class LightingRegion {
    /**
     * Sorts regions based on `elevation` and `sort`.
     * @param {LightingRegion} region1
     * @param {LightingRegion} region2
     * @returns {number}
     * @internal
     */
    static _compare(region1, region2) {
        return region1.elevation - region2.elevation
            || (region1.object instanceof Drawing) - (region2.object instanceof Drawing)
            || region1.sort - region2.sort
            || 0;
    }

    /**
     * The default lighting region data.
     * @returns {LightingRegionData}
     */
    static getDefaultData() {
        return {
            object: null,
            active: false,
            prototype: null,
            shape: {
                x: 0,
                y: 0,
                width: 0,
                height: 0,
                scaleX: 1,
                scaleY: 1,
                rotation: 0,
                type: "r",
                points: null,
                bezierFactor: 0
            },
            texture: null,
            fit: false,
            elevation: 0,
            sort: 0,
            height: Infinity,
            occluded: false,
            occlusionMode: 0,
            fogExploration: undefined,
            fogRevealed: undefined,
            globalLight: {
                alpha: undefined,
                animation: {
                    type: undefined,
                    speed: undefined,
                    intensity: undefined,
                    reverse: undefined
                },
                bright: undefined,
                color: undefined,
                coloration: undefined,
                contrast: undefined,
                darkness: { min: undefined, max: undefined },
                enabled: undefined,
                luminosity: undefined,
                saturation: undefined,
                resolution: undefined,
                seed: undefined,
                shadows: undefined,
                vision: undefined,
                x: undefined,
                y: undefined,
                z: undefined
            },
            lightLevels: {
                bright: undefined,
                dim: undefined,
                halfdark: undefined,
                dark: undefined
            },
            darkness: undefined,
            darknessLightPenalty: undefined,
            brightestColor: undefined,
            daylightColor: undefined,
            darknessColor: undefined,
            visionLimitation: {
                detection: undefined,
                enabled: undefined,
                sight: undefined
            }
        };
    }

    /**
     * The current computed data.
     * @type {LightingRegionData}
     * @internal
     */
    _data = {};

    /**
     * The shape.
     * @type {Shape}
     */
    #shape = null;

    /**
     * The domain.
     * @type {Shape[]}
     */
    #domain = null;

    /**
     * @param {string} id - The ID.
     * @internal
     */
    constructor(id) {
        /**
         * The ID.
         * @type {string}
         * @readonly
         */
        this.id = id;
        /**
         * The data.
         * @type {LightingRegionData}
         * @readonly
         */
        this.data = this.constructor.getDefaultData();
        /**
         * The placeable object.
         * @type {PlaceableObject}
         * @readonly
         */
        this.object = null;
        /**
         * Is active?
         * @type {boolean}
         * @readonly
         */
        this.active = false;
        /**
         * The prototype region.
         * @type {LightingRegion}
         * @readonly
         */
        this.prototype = null;
        /**
         * Fit to walls?
         * @type {boolean}
         * @readonly
         */
        this.fit = false;
        /**
         * The bounds.
         * @type {PIXI.Rectangle}
         * @readonly
         */
        this.bounds = null;
        /**
         * The elevation in grid units.
         * @type {number}
         * @readonly
         */
        this.elevation = 0;
        /**
         * The elevation in pixels.
         * @type {number}
         * @readonly
         */
        this.elevationZ = 0;
        /**
         * The sort.
         * @type {number}
         * @readonly
         */
        this.sort = 0;
        /**
         * The height in grid units.
         * @type {number}
         * @readonly
         */
        this.height = Infinity;
        /**
         * The height in pixels.
         * @type {number}
         * @readonly
         */
        this.heightZ = Infinity;
        /**
         * Is occluded?
         * @type {boolean}
         * @readonly
         */
        this.occluded = false;
        /**
         * Is occluded?
         * @type {CONST.TILE_OCCLUSION_MODES}
         * @readonly
         */
        this.occlusionMode = CONST.TILE_OCCLUSION_MODES.NONE;
        /**
         * Fog exploration?
         * @type {boolean}
         * @readonly
         */
        this.fogExploration = false;
        /**
         * Reveals fog of war?
         * @type {boolean}
         * @readonly
         */
        this.fogRevealed = false;
        /**
         * Global illumination?
         * @type {boolean}
         * @readonly
         */
        this.globalLight = false;
        /**
         * Provides vision?
         * @type {boolean}
         * @readonly
         */
        this.providesVision = false;
        /**
         * The darkness level.
         * @type {number}
         * @readonly
         */
        this.darknessLevel = 0;
        /**
         * The darkness penalty.
         * @type {number}
         * @readonly
         */
        this.darknessPenalty = 0;
        /**
         * The colors.
         * @type {{ambientBrightest: Color, ambientDaylight: Color, ambientDarkness: Color, background: Color}}
         * @readonly
         */
        this.colors = {
            ambientBrightest: new foundry.utils.Color(),
            ambientDaylight: new foundry.utils.Color(),
            ambientDarkness: new foundry.utils.Color(),
            background: new foundry.utils.Color()
        };
        /**
         * The weights.
         * @type {{bright: number, dim: number, halfdark: number, dark: number}}
         * @readonly
         */
        this.weights = { bright: 0, dim: 0, halfdark: 0, dark: 0 };
        /**
         * The source.
         * @type {LightingRegionSource}
         * @readonly
         */
        this.source = new LightingRegionSource(this);
        /**
         * The polygons.
         * @type {PIXI.Polygon[]}
         * @readonly
         */
        this.polygons = null;
        /**
         * The geometry.
         * @type {SmoothGeometry}
         * @readonly
         */
        this.geometry = null;
        /**
         * The texture.
         * @type {PIXI.Texture|null}
         * @readonly
         */
        this.texture = null;
        /**
         * The mesh.
         * @type {SmoothMesh}
         * @readonly
         */
        this.mesh = new SmoothMesh(SmoothGeometry.EMPTY, new LightingRegionShader());
        /**
         * Is destroyed?
         * @type {boolean}
         * @readonly
         */
        this.destroyed = false;
        /**
         * The depth index.
         * @type {number}
         * @readonly
         */
        this.depthIndex = 0;
        /**
         * The depth.
         * @type {number}
         * @readonly
         */
        this.depth = 0;
    }

    /**
     * Test whether the point at the elevation is in the region.
     * @param {{x: number, y: number, z: number|undefined}} point - The point.
     * @param {number} [elevation] - The elevation.
     * @returns {boolean} True if and only if the point at the elevation is contained in this region.
     */
    containsPoint(point, elevation) {
        if (elevation !== undefined) {
            if (elevation < this.elevation || elevation > this.elevation + this.height) {
                return false;
            }
        } else if (point.z !== undefined) {
            if (point.z < this.elevationZ || point.z > this.elevationZ + this.heightZ) {
                return false;
            }
        }

        if (this.texture && this.object?.containsPixel) {
            return this.object.containsPixel(point.x, point.y);
        }

        let contained = false;
        const domain = this.#domain;

        for (let j = domain.length - 1; j >= 0; j--) {
            if (domain[j].containsPoint(point)) {
                contained = !contained;
            }
        }

        return contained;
    }

    /**
     * Update the data.
     * @param {LightingRegionData} changes - The changes.
     * @returns {boolean} True if and only if the data of the region was changed.
     * @internal
     */
    _update(changes) {
        return updateData(this.data, changes);
    }

    /**
     * Refresh the region.
     * @param {LightingRegionData} data - The current computed data.
     * @param {LightingRegionData} changes - The computed data that has changed.
     * @param {LightingRegionData} defaults - The default data.
     * @param {object} perception - The perception update flags.
     * @internal
     */
    _refresh(data, changes, defaults, perception) {
        let updateSource = false;
        let initializeVision = false;
        let refreshLighting = false;
        let refreshVision = false;
        let refreshDepth = false;

        if (this.active !== data.active) {
            this.active = data.active;

            for (const key in perception) {
                perception[key] = true;
            }
        }

        if (this.object !== data.object) {
            this.object = data.object;

            refreshLighting = true;
            refreshVision = true;
            refreshDepth = true;
        }

        if (this.elevation !== data.elevation) {
            this.elevation = data.elevation;
            this.elevationZ = data.elevation * (canvas.dimensions.size / canvas.dimensions.distance);

            refreshLighting = true;
            refreshVision = true;
            refreshDepth = true;
        }

        if (this.sort !== data.sort) {
            this.sort = data.sort;

            updateSource = true;
            refreshLighting = true;
            refreshVision = true;
            refreshDepth = true;
        }

        if (this.height !== data.height) {
            this.height = data.height;
            this.heightZ = data.height * (canvas.dimensions.size / canvas.dimensions.distance);
        }

        if (this.occluded !== data.occluded) {
            this.occluded = data.occluded;

            refreshLighting = true;
            refreshVision = true;
            refreshDepth = true;
        }

        if (this.occlusionMode !== data.occlusionMode) {
            this.occlusionMode = data.occlusionMode;

            refreshLighting = true;
            refreshVision = true;
            refreshDepth = true;
        }

        if (this.fogExploration !== data.fogExploration) {
            this.fogExploration = data.fogExploration;

            refreshVision = true;
        }

        if (this.fogRevealed !== data.fogRevealed) {
            this.fogRevealed = data.fogRevealed;

            refreshVision = true;
        }

        const globalLight = data.globalLight.enabled
            && (data.darkness >= data.globalLight.darkness.min
                && data.darkness <= data.globalLight.darkness.max);

        if (this.globalLight !== globalLight) {
            this.globalLight = globalLight;

            updateSource = true;
            refreshLighting = true;
            refreshVision = true;
        }

        const providesVision = data.globalLight.enabled && data.globalLight.vision;

        if (this.providesVision !== providesVision) {
            this.providesVision = providesVision;

            refreshVision = true;
            updateSource = true;
        }

        if (this.darknessLevel !== data.darkness) {
            this.darknessLevel = data.darkness;

            refreshLighting = true;
        }

        const darknessPenalty = this.darknessLevel * data.darknessLightPenalty;

        if (this.darknessPenalty !== darknessPenalty) {
            this.darknessPenalty = darknessPenalty;

            refreshLighting = true;
        }

        if (!this.colors.ambientBrightest.equals(data.brightestColor ?? defaults.brightestColor)) {
            this.colors.ambientBrightest = new foundry.utils.Color(data.brightestColor ?? defaults.brightestColor);

            refreshLighting = true;
        }

        if (!this.colors.ambientDaylight.equals(data.daylightColor ?? defaults.daylightColor)) {
            this.colors.ambientDaylight = new foundry.utils.Color(data.daylightColor ?? defaults.daylightColor);

            refreshLighting = true;
        }

        if ("daylightColor" in changes && data.daylightColor === 0 && this.data.daylightColor !== undefined && game.user.isGM) {
            this.#notify("warn", "Daylight Color is black (#000000).");
        }

        if (!this.colors.ambientDarkness.equals(data.darknessColor ?? defaults.darknessColor)) {
            this.colors.ambientDarkness = new foundry.utils.Color(data.darknessColor ?? defaults.darknessColor);

            refreshLighting = true;
        }

        if ("darknessColor" in changes && data.darknessColor === 0 && this.data.darknessColor !== undefined && game.user.isGM) {
            this.#notify("warn", "Darkness Color is black (#000000).");
        }

        const backgroundColor = this.colors.ambientDaylight.mix(this.colors.ambientDarkness, this.darknessLevel);

        if (!this.colors.background.equals(backgroundColor)) {
            this.colors.background = backgroundColor;

            refreshLighting = true;
        }

        if (this.weights.bright !== data.lightLevels.bright) {
            this.weights.bright = data.lightLevels.bright;

            refreshLighting = true;
        }

        if (this.weights.dim !== data.lightLevels.dim) {
            this.weights.dim = data.lightLevels.dim;

            refreshLighting = true;
        }

        if (this.weights.halfdark !== data.lightLevels.halfdark) {
            this.weights.halfdark = data.lightLevels.halfdark;

            refreshLighting = true;
        }

        if (this.weights.dark !== data.lightLevels.dark) {
            this.weights.dark = data.lightLevels.dark;

            refreshLighting = true;
        }

        if ("shape" in changes) {
            const { x, y, width, height, scaleX, scaleY, rotation, points, type } = data.shape;

            const transform = tempMatrix.identity()
                .translate(-width / 2, -height / 2)
                .scale(scaleX ?? 1, scaleY ?? 1)
                .rotate(Math.toRadians(rotation ?? 0))
                .translate(x + width / 2, y + height / 2);
            let shape;

            switch (type) {
                case "r":
                    shape = new PIXI.Rectangle(0, 0, width, height);

                    break;
                case "e":
                    shape = new PIXI.Ellipse(width / 2, height / 2, width / 2, height / 2);

                    break;
                case "p":
                    if (!points || points.length < 6) {
                        break;
                    }

                    shape = new PIXI.Polygon(Array.from(points));

                    Shape.dedupePolygon(shape);
                    Shape.smoothPolygon(shape, data.shape.bezierFactor ?? 0.5);

                    break;
            }

            this.#shape = Shape.from(shape ?? new PIXI.Polygon(), transform);

            if (game.user.isGM && !this.#shape.strictlySimple) {
                this.#notify("error", "The shape is self-intersecting.");
            }
        }

        let polygonsChanged = false;

        if ("shape" in changes || "fit" in changes || data.fit && "elevation" in changes) {
            this.fit = data.fit;

            if (this.#shape.strictlySimple) {
                if (this.fit) {
                    this.polygons = this.#fit(this.#shape);
                    this.#domain = this.polygons.map(p => Shape.from(p));
                } else {
                    this.polygons = this.#shape.contour.length >= 6 && this.#shape.area > 0 ? [new PIXI.Polygon(this.#shape.contour)] : [];
                    this.#domain = [this.#shape];
                }
            } else {
                this.polygons = [];
                this.#domain = [];
            }

            this.geometry = null;
            polygonsChanged = true;
            refreshDepth = true;
        }

        if (updateSource || "globalLight" in changes) {
            updateSource = true;

            const radius = canvas.dimensions.maxR;
            const sourceData = foundry.utils.mergeObject(data.globalLight, {
                dim: radius,
                bright: data.globalLight.bright ? radius : 0,
                walls: false,
                angle: 360,
                attenuation: 0,
                resolution: data.globalLight.resolution * (radius / canvas.dimensions.size)
            }, { inplace: false });

            this.source.initialize(sourceData);

            refreshLighting = true;
            refreshVision = true;
        }

        if (!this.geometry || "globalLight" in changes && ("x" in changes.globalLight || "y" in changes.globalLight)) {
            // TODO: bring soft edges back
            const softEdges = this.source._flags.renderSoftEdges = false && canvas.performance.lightSoftEdges
                && this.id !== "globalLight" && !data.texture;
            const options = {
                falloffDistance: softEdges ? Math.abs(PointSource.EDGE_OFFSET) : 0,
                fillRule: "zero-one",
                vertexTransform: new PIXI.Matrix()
                    .translate(-this.source.x, -this.source.y)
                    .scale(1 / this.source.radius, 1 / this.source.radius)
            };

            if (!this.geometry || this.geometry._explored) {
                this.geometry = new SmoothGeometry(this.polygons, options);
                this.geometry._explored = false;
            } else {
                this.geometry.update(this.polygons, options);
            }

            this.bounds = this.geometry.bounds;

            const { x, y, width, height, scaleX, scaleY, rotation } = data.shape;

            this.source._sourceGeometry = this.geometry;
            this.source._textureMatrix.identity()
                .scale(this.source.radius, this.source.radius)
                .translate(this.source.x, this.source.y)
                .translate(-(x + width / 2), -(y + height / 2))
                .rotate(Math.toRadians(-rotation ?? 0))
                .scale(1 / (scaleX ?? 1), 1 / (scaleY ?? 1))
                .translate(width / 2, height / 2)
                .scale(1 / width, 1 / height);

            updateSource = true;
            refreshLighting = true;
            refreshVision = true;
        }

        if (updateSource || "texture" in changes) {
            this.texture = data.texture;
            this.source._texture = this.texture ?? PIXI.Texture.WHITE;
            this.source.refreshSource();

            refreshLighting = true;
            refreshVision = true;
            refreshDepth = true;
        }

        this.source.object = data.object;

        let limits;

        if (data.visionLimitation.enabled) {
            limits = {
                ...data.visionLimitation.detection,
                [DetectionMode.BASIC_MODE_ID]: data.visionLimitation.sight
            };
        } else {
            limits = {};

            for (const id in data.visionLimitation.detection) {
                limits[id] = Infinity;
            }

            limits[DetectionMode.BASIC_MODE_ID] = Infinity;
        }

        const limitData = {
            object: this.object,
            active: this.active,
            mode: "set",
            limits,
            elevation: this.elevation,
            height: this.height,
            priority: [1, this.elevation, this.object instanceof Drawing, this.sort]
        };

        let shapes;

        if (this.fit) {
            if (polygonsChanged) {
                shapes = this.polygons.map(({ points }) => ({ points, type: "p" }));
            }
        } else if (polygonsChanged || "texture" in changes || "object" in changes) {
            shapes = [data.shape];

            if (this.texture && this.object?._textureData) {
                const { pixels, aw: width, ah: height, minX, minY, maxX, maxY } = this.object._textureData;

                shapes[0] = {
                    ...shapes[0],
                    texture: {
                        pixels: new Uint8Array(pixels.buffer, 0, width * height),
                        width, height, minX, minY, maxX, maxY, threshold: 0.75 * 255
                    }
                };
            }
        }

        if (shapes) {
            limitData.shapes = shapes;
        }

        if (RayCastingSystem.instance.updateRegion(this.id, limitData)) {
            initializeVision = true;
            refreshVision = true;
        }

        if (this.active) {
            if (initializeVision) {
                perception.initializeVision = true;
            }

            if (refreshLighting) {
                perception.refreshLighting = true;
            }

            if (refreshVision) {
                perception.refreshVision = true;
            }
        }

        if (refreshDepth) {
            perception.refreshDepth = true;
        }
    }

    /**
     * Update the mesh and return it.
     * @returns {SmoothMesh}
     */
    drawMesh() {
        if (this.occluded && this.occlusionMode === CONST.TILE_OCCLUSION_MODES.FADE) {
            return null;
        }

        const mesh = this.mesh;

        mesh.geometry = this.geometry;
        mesh.position.set(0, 0);
        mesh.scale.set(1);
        mesh.alpha = 1;
        mesh.visible = true;
        mesh.renderable = true;
        mesh.cullable = true;

        const uniforms = mesh.shader.uniforms;

        uniforms.uSampler = this.texture ?? PIXI.Texture.WHITE;
        uniforms.uTextureMatrix = this.source._textureMatrix;
        uniforms.uColor0[0] = this.darknessLevel;
        uniforms.uColor0[1] = 0;
        uniforms.uColor0[2] = 0;
        uniforms.uColor1.set(this.colors.background.rgb);
        uniforms.uColor2.set(this.colors.ambientDarkness.rgb);
        uniforms.uDepthElevation = this.depth;
        uniforms.uOcclusionTexture = canvas.masks.occlusion.renderTexture;
        uniforms.uOcclusionMode = this.occlusionMode;
        uniforms.uScreenDimensions = canvas.screenDimensions;

        return mesh;
    }

    /**
     * Create a mesh for rendering to a stencil mask.
     * @param {boolean} [hole=false] - Is hole?
     * @returns {SmoothMesh}
     */
    createMask(hole = false) {
        const mesh = this.source._createMask();

        mesh._stencilHole = hole;

        return mesh;
    }

    /**
     * Render the depth of this region.
     * @param {PIXI.renderer} renderer - The renderer.
     */
    renderDepth(renderer) {
        const mesh = this.mesh;

        if (!mesh.visible) {
            return;
        }

        if (this.occluded && this.occlusionMode === CONST.TILE_OCCLUSION_MODES.FADE) {
            return;
        }

        const depthShader = DepthShader.instance;

        depthShader.texture = this.texture ?? PIXI.Texture.WHITE;
        depthShader.textureMatrix = this.source._textureMatrix ?? PIXI.Matrix.IDENTITY;
        depthShader.depthElevation = this.depth;

        const originalShader = mesh.shader;
        const originalBlendMode = mesh.blendMode;

        mesh.shader = depthShader;
        mesh.blendMode = PIXI.BLEND_MODES.MAX_COLOR;

        mesh._render(renderer);

        mesh.shader = originalShader;
        mesh.blendMode = originalBlendMode;
    }

    /**
     * Destroy the region.
     * @internal
     */
    _destroy() {
        this.source.destroy();
        this.mesh.destroy({ children: true });

        if (this.constructor.debug) {
            Console.debug(
                "%s (%O) | Destroyed",
                this.constructor.name,
                this
            );
        }
    }

    /**
     * Fit region to walls.
     * @param {Shape} shape
     * @returns {PIXI.Polygon[]}
     */
    #fit(shape) {
        const vertices = new Map();
        let walls = canvas.walls.quadtree?.getObjects(shape.bounds) ?? [];

        if (game.modules.get("wall-height")?.active) {
            const elevation = this.elevation;

            walls = walls.filter(wall => {
                const wallHeight = wall.document.flags["wall-height"];
                const bottom = wallHeight?.bottom ?? -Infinity;
                const top = wallHeight?.top ?? +Infinity;

                return elevation >= bottom && elevation <= top;
            });
        }

        const addEdge = (a, b) => {
            let v, w;

            if (!(v = vertices.get(a.key))) {
                vertices.set(a.key, v = { X: a.x, Y: a.y, key: a.key, neighbors: new Set(), visited: false });
            }

            if (!(w = vertices.get(b.key))) {
                vertices.set(b.key, w = { X: b.x, Y: b.y, key: b.key, neighbors: new Set(), visited: false });
            }

            if (v !== w) {
                v.neighbors.add(w);
                w.neighbors.add(v);
            }
        }

        for (const wall of walls) {
            const { a, b } = wall.vertices;

            if (a.key === b.key) {
                continue;
            }

            const i = wall.intersectsWith;

            if (i.size === 0) {
                if (shape.containsLineSegment(a, b)) {
                    addEdge(a, b);
                }
            } else {
                if (shape.intersectsLineSegment(a, b)) {
                    const p = Array.from(i.values(), v => PolygonVertex.fromPoint(v));

                    p.push(a, b);
                    p.sort((v, w) => v.x - w.x || v.y - w.y);

                    for (let k = 1; k < p.length; k++) {
                        const a = p[k - 1];
                        const b = p[k];

                        if (a.key === b.key) {
                            continue;
                        }

                        if (shape.containsLineSegment(a, b)) {
                            addEdge(a, b);
                        }
                    }
                }
            }
        }

        const paths = [];

        while (vertices.size !== 0) {
            let start;

            for (const vertex of vertices.values()) {
                vertex.visited = false;

                if (!start || start.X > vertex.X || start.X === vertex.X && start.Y > vertex.Y) {
                    start = vertex;
                }
            }

            if (start.neighbors.size >= 2) {
                const path = [];
                let current = start;
                let previous = { X: current.X - 1, Y: current.Y - 1 };

                for (; ;) {
                    current.visited = true;

                    const x0 = previous.X;
                    const y0 = previous.Y;
                    const x1 = current.X;
                    const y1 = current.Y;

                    let next;

                    for (const vertex of current.neighbors) {
                        if (vertex === previous) {
                            continue;
                        }

                        if (vertex !== start && vertex.visited) {
                            continue;
                        }

                        if (!next) {
                            next = vertex;

                            continue;
                        }

                        const x2 = next.X;
                        const y2 = next.Y;
                        const a1 = (y0 - y1) * (x2 - x1) + (x1 - x0) * (y2 - y1);
                        const x3 = vertex.X;
                        const y3 = vertex.Y;
                        const a2 = (y0 - y1) * (x3 - x1) + (x1 - x0) * (y3 - y1);

                        if (a1 < 0) {
                            if (a2 >= 0) {
                                continue;
                            }
                        } else if (a1 > 0) {
                            if (a2 < 0) {
                                next = vertex;

                                continue;
                            }

                            if (a2 === 0) {
                                const b2 = (x3 - x1) * (x0 - x1) + (y3 - y1) * (y0 - y1) > 0;

                                if (!b2) {
                                    next = vertex;
                                }

                                continue;
                            }
                        } else {
                            if (a2 < 0) {
                                next = vertex;

                                continue;
                            }

                            const b1 = (x2 - x1) * (x0 - x1) + (y2 - y1) * (y0 - y1) > 0;

                            if (a2 > 0) {
                                if (b1) {
                                    next = vertex;
                                }

                                continue;
                            }

                            const b2 = (x3 - x1) * (x0 - x1) + (y3 - y1) * (y0 - y1) > 0;

                            if (b1 && !b2) {
                                next = vertex;
                            }

                            continue;
                        }

                        const c = (y1 - y2) * (x3 - x1) + (x2 - x1) * (y3 - y1);

                        if (c > 0) {
                            continue;
                        }

                        if (c < 0) {
                            next = vertex;

                            continue;
                        }

                        const d1 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
                        const d2 = (x3 - x1) * (x3 - x1) + (y3 - y1) * (y3 - y1);

                        if (d2 < d1) {
                            next = vertex;
                        }
                    }

                    if (next) {
                        path.push(current);

                        previous = current;
                        current = next;

                        if (current === start) {
                            break;
                        }
                    } else {
                        current = path.pop();

                        if (!current) {
                            previous = undefined;

                            break;
                        }

                        previous = path.length ? path[path.length - 1] : { X: current.X - 1, Y: current.Y - 1 };
                    }
                }

                if (path.length) {
                    paths.push(path);

                    previous = path[path.length - 1];

                    for (const vertex of path) {
                        previous.neighbors.delete(vertex);

                        if (previous.neighbors.size === 0) {
                            vertices.delete(previous.key);
                        }

                        vertex.neighbors.delete(previous);

                        previous = vertex;
                    }

                    if (previous.neighbors.size === 0) {
                        vertices.delete(previous.key);
                    }
                }
            }

            for (const vertex of start.neighbors) {
                vertex.neighbors.delete(start);

                if (vertex.neighbors.size === 0) {
                    vertices.delete(vertex.key);
                }
            }

            vertices.delete(start.key);
        }

        const clipper = new ClipperLib.Clipper();

        clipper.AddPaths(paths, ClipperLib.PolyType.ptSubject, true);
        clipper.Execute(ClipperLib.ClipType.ctUnion, paths, ClipperLib.PolyFillType.pftPositive, ClipperLib.PolyFillType.pftEvenOdd);

        if (paths.length === 0) {
            this.#notify("warn", "The underlying wall structure needs to be closed and completely contained within the shape in order for Fit To Walls to detect it.")
        }

        return paths.map(p => Shape.createPolygonFromClipper(p, 1));
    }

    #notify(type, message) {
        const object = this.object;

        if (object) {
            Console[type](`[${object.document.uuid}] ${message}`);

            message = `<tt>[${object.constructor.name}.${object.id}]</tt> `
                + message
                + ` Click <a href="javascript:void(0);" onclick="(function() {`
                + `const layer = canvas.getLayerByEmbeddedName('${object.constructor.name}');`
                + `const object = layer.get('${object.id}');`
                + `if (!object) return;`
                + `layer.activate();`
                + `const bounds = object.bounds;`
                + `const x = bounds.x + bounds.width / 2;`
                + `const y = bounds.y + bounds.height / 2;`
                + `const scale = 0.5 * Math.min(`
                + `    canvas.app.screen.width / bounds.width,`
                + `    canvas.app.screen.height / bounds.height`
                + `);`
                + `object.control();`
                + `canvas.pan({ x, y, scale });`
                + `})();">here</a> to select the ${object.constructor.name.toLowerCase()}.`
        } else {
            Console[type](`[Scene] ${message}`);

            message = `<tt>[Scene]</tt> ` + message;
        }

        Notifications[type](message, { permanent: type === "error", console: false });
    }
}

export class LightingRegionSource extends GlobalLightSource {
    static #cache = new WeakMap();

    static #getShader(shaderCls) {
        if (this.#cache.has(shaderCls)) {
            return this.#cache.get(shaderCls);
        }

        this.#cache.set(shaderCls,
            /**
             * Patched lighting shader for {@link LightingRegionSource}.
             */
            shaderCls = class extends shaderCls {
                /** @override */
                static name = `PerfectVision.Global.${super.name}`;

                /** @override */
                static vertexShader = new ShaderPatcher("frag")
                    .setSource(super.vertexShader)
                    .addUniform("uTextureMatrix", "mat3")
                    .addVarying("vTextureCoord", "vec2")
                    .wrapMain(`
                        void main() {
                            @main();

                            vTextureCoord = (uTextureMatrix * vec3(aVertexPosition, 1.0)).xy;
                        }
                    `)
                    .getSource();

                /** @override */
                static fragmentShader = new ShaderPatcher("frag")
                    .setSource(this.fragmentShader)
                    .addVarying("vTextureCoord", "vec2")
                    .addUniform("uSampler", "sampler2D")
                    .addUniform("occlusionTexture", "sampler2D")
                    .addUniform("occlusionMode", "int")
                    .replace(/float depth = smoothstep\(0\.0, 1\.0, vDepth\);/gm, `$&
                        depth *= 1.0 - step(texture2D(uSampler, vTextureCoord).a, 0.75);

                        float @@occlusionAlpha;

                        if (occlusionMode == ${CONST.TILE_OCCLUSION_MODES.RADIAL}) {
                            @@occlusionAlpha = step(depthElevation, texture2D(occlusionTexture, vSamplerUvs).g);
                        } else if (occlusionMode == ${CONST.TILE_OCCLUSION_MODES.VISION}) {
                            @@occlusionAlpha = step(depthElevation, texture2D(occlusionTexture, vSamplerUvs).b);
                        } else {
                            @@occlusionAlpha = 1.0;
                        }

                        depth *= @@occlusionAlpha;
                    `)
                    .getSource();
            }
        );

        return shaderCls;
    }

    _sourceGeometry = SmoothGeometry.EMPTY;
    _texture = PIXI.Texture.WHITE;
    _textureMatrix = new PIXI.Matrix();
    #region;
    #los;
    #animation = {};

    /** @param {LightingRegion} region */
    constructor(region) {
        super(region.object ?? undefined);

        delete this.animation;

        this.#region = region;
        this.#los = new LightingRegionSourcePolygon(this.#region);
    }

    /** @override */
    get animation() {
        return this.#animation;
    }

    /** @override */
    set animation(value) {
        value.backgroundShader = LightingRegionSource.#getShader(value.backgroundShader || AdaptiveBackgroundShader);
        value.illuminationShader = LightingRegionSource.#getShader(value.illuminationShader || AdaptiveIlluminationShader);
        value.colorationShader = LightingRegionSource.#getShader(value.colorationShader || AdaptiveColorationShader);

        this.#animation = value;
    }

    /** @override */
    get elevation() {
        return this.#region.elevation;
    }

    /** @override */
    _createPolygon() {
        return this.#los;
    }

    /** @override */
    _initializeFlags() {
        this._flags.renderSoftEdges = this.#region.geometry?.falloffDistance > 0;
        this._flags.hasColor = !!(this.data.color !== null && this.data.alpha);
    }

    /** @override */
    _isSuppressed() {
        const region = this.#region;

        return !region.active || !region.globalLight
            || region.occluded && region.occlusionMode === CONST.TILE_OCCLUSION_MODES.FADE;
    }

    /** @override */
    _updateMesh(mesh) {
        mesh = super._updateMesh(mesh);
        mesh.elevation = this.#region.elevation;
        mesh.sort = this.#region.sort;

        return mesh;
    }

    /** @override */
    _updateLosGeometry(polygon) { }

    /** @override */
    _updateCommonUniforms(shader) {
        super._updateCommonUniforms(shader);

        const uniforms = shader.uniforms;

        uniforms.uSampler = this._texture;
        uniforms.uTextureMatrix = this._textureMatrix;
        uniforms.occlusionTexture = canvas.masks.occlusion.renderTexture;
        uniforms.occlusionMode = this.#region.occlusionMode;
        uniforms.depthElevation = this.#region.depth;
    }
}

const tempPoint = { x: 0, y: 0, z: 0 };

class LightingRegionSourcePolygon extends PIXI.Polygon {
    /** @type {LightingRegion} */
    #region;

    /** @param {LightingRegion} region */
    constructor(region) {
        super();

        this.#region = region;
    }

    /** @override */
    contains(x, y, z) {
        tempPoint.x = x;
        tempPoint.y = y;
        tempPoint.z = z ?? this.#region.elevationZ;

        return this.#region === LightingSystem.instance.getRegionAt(tempPoint);
    }
}

export class LightingRegionShader extends PIXI.Shader {
    static vertexSrc = `\
        #version 300 es

        precision ${PIXI.settings.PRECISION_VERTEX} float;

        layout(location = 0) in vec2 aVertexPosition;

        uniform mat3 projectionMatrix;
        uniform mat3 translationMatrix;
        uniform mat3 uTextureMatrix;
        uniform vec2 uScreenDimensions;

        out vec2 vTextureCoord;
        out vec2 vScreenCoord;

        void main() {
            vTextureCoord = (uTextureMatrix * vec3(aVertexPosition, 1.0)).xy;
            vec3 pos = translationMatrix * vec3(aVertexPosition, 1.0);
            vScreenCoord = pos.xy / uScreenDimensions;
            gl_Position = vec4((projectionMatrix * pos).xy, 0.0, 1.0);
        }`;

    static fragmentSrc = `\
        #version 300 es

        precision ${PIXI.settings.PRECISION_FRAGMENT} float;

        in vec2 vTextureCoord;
        in vec2 vScreenCoord;

        uniform sampler2D uSampler;
        uniform float uAlpha;
        uniform vec3 uColor0;
        uniform vec3 uColor1;
        uniform vec3 uColor2;
        uniform float uDepthElevation;
        uniform sampler2D uOcclusionTexture;
        uniform int uOcclusionMode;

        layout(location = 0) out vec4 textures[3];

        void main() {
            float alpha = 1.0 - step(texture(uSampler, vTextureCoord).a, 0.75) * uAlpha;
            float occlusionAlpha;

            if (uOcclusionMode == ${CONST.TILE_OCCLUSION_MODES.RADIAL}) {
                occlusionAlpha = step(uDepthElevation, texture(uOcclusionTexture, vScreenCoord).g);
            } else if (uOcclusionMode == ${CONST.TILE_OCCLUSION_MODES.VISION}) {
                occlusionAlpha = step(uDepthElevation, texture(uOcclusionTexture, vScreenCoord).b);
            } else {
                occlusionAlpha = 1.0;
            }

            alpha *= occlusionAlpha;

            textures[0] = vec4(uColor0, 1.0) * alpha;
            textures[1] = vec4(uColor1, 1.0) * alpha;
            textures[2] = vec4(uColor2, 1.0) * alpha;
        }`;

    static #program;

    constructor() {
        super(LightingRegionShader.#program ??= PIXI.Program.from(
            LightingRegionShader.vertexSrc,
            LightingRegionShader.fragmentSrc
        ), {
            uAlpha: 1,
            uSampler: PIXI.Texture.WHITE,
            uTextureMatrix: PIXI.Matrix.IDENTITY,
            uColor0: new Float32Array(3),
            uColor1: new Float32Array(3),
            uColor2: new Float32Array(3),
            uDepthElevation: 0,
            uOcclusionTexture: PIXI.Texture.EMPTY,
            uOcclusionMode: 0,
            uScreenDimensions: canvas.screenDimensions
        });
    }

    update(mesh) {
        this.uniforms.uAlpha = mesh.worldAlpha;
    }
}

Hooks.once("setup", () => {
    if (game.settings.get("core", "noCanvas")) {
        return;
    }

    Hooks.on("canvasInit", () => {
        LightingSystem._wallsID++;
    });

    Hooks.on("createWall", document => {
        if (document.rendered) {
            LightingSystem._wallsID++;
        }
    });

    Hooks.on("updateWall", (document, changes) => {
        if (document.rendered && ("c" in changes
            || "flags" in changes && ("wall-height" in changes.flags || "-=wall-height" in changes.flags)
            || "-=flags" in changes)) {
            LightingSystem._wallsID++;
        }
    });

    Hooks.on("deleteWall", document => {
        if (document.rendered) {
            LightingSystem._wallsID++;
        }
    });
});
