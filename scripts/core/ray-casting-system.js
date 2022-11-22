import { updateData } from "../utils/helpers.js";
import { Console } from "../utils/console.js";

/**
 * @typedef {"sum"|"set"|"min"|"max"} VolumetricRegionMode
 *
 * @typedef {{
 *      x: number,
 *      y: number,
 *      width: number,
 *      height: number,
 *      scaleX: number,
 *      scaleY: number,
 *      rotation: number,
 *      points: number[]|null,
 *      type: "r"|"e"|"p",
 *      texture: {
 *          pixels: (number|boolean)[],
 *          offset: number,
 *          stride: number,
 *          width: number,
 *          height: number,
 *          minX: number,
 *          minY: number,
 *          maxX: number,
 *          maxY: number,
 *          threshold: number
 *      },
 *      mask: boolean
 * }} ShapeData
 *
 * @typedef {object} VolumetricRegionData
 * @property {PlaceableObject} object
 * @property {boolean} active
 * @property {VolumetricRegionMode} mode
 * @property {Object<string,number>} limits
 * @property {ShapeData[]} shapes
 * @property {number} elevation
 * @property {number} height
 * @property {(number|string|boolean)[]} priority
 */

const tempPoint = new PIXI.Point();
const tempMatrix = new PIXI.Matrix();

/**
 * The ray casting system.
 */
export class RayCastingSystem {
    /**
     * The ray casting system instance.
     * @type {RayCastingSystem}
     * @readonly
     */
    static instance = new RayCastingSystem();

    /**
     * Print debug messages?
     * @type {boolean}
     */
    static debug = false;

    /**
     * The sorted array of active regions.
     * @type {VolumetricRegion[]}
     * @readonly
     */
    activeRegions = [];

    /**
     * This cache is cleared on refresh if anything changes.
     * @type {Map<*,RayCaster>}
     * @readonly
     */
    cache = new Map();

    /**
     * The regions.
     * @type {Map<string,VolumetricRegion>}
     * @readonly
     */
    #regions = new Map();

    /**
     * Is a refresh required?
     * @type {boolean}
     */
    #dirty = false;

    [Symbol.iterator]() {
        return this.#regions.values();
    }

    /**
     * Create a new region.
     * @param {string} id - The ID of the region.
     * @param {VolumetricRegionData} [data] - The data of the region.
     * @returns {VolumetricRegion} The new region.
     * @throws Throws an error if a region with this ID already exists.
     */
    createRegion(id, data) {
        if (this.#regions.has(id)) {
            throw new Error();
        }

        const region = new VolumetricRegion(id);

        if (data) {
            region._update(data);
        }

        this.#regions.set(id, region);
        this.#dirty = true;

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
     * @param {VolumetricRegionData} changes - The changes to the data of the region.
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
        this.#dirty = true;

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
     * @returns {VolumetricRegion|undefined} The region if it exists.
     */
    getRegion(id) {
        return this.#regions.get(id);
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
        this.cache.clear();
        this.#regions.clear();
        this.#dirty = true;
    }

    /**
     * Refresh the system.
     * @returns {boolean} True if and only if any region was changed.
     */
    refresh() {
        if (!this.#dirty) {
            return false;
        }

        this.#dirty = false;

        for (const region of this.activeRegions) {
            if (region.destroyed) {
                region._destroy();
            }
        }

        this.activeRegions.length = 0;

        for (const region of this.#regions.values()) {
            const data = region._data;
            const changes = {};

            if (updateData(data, region.data, changes)) {
                region._refresh(data, changes);

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
        }

        this.activeRegions.sort(VolumetricRegion._compare);
        this.cache.clear();

        return true;
    }

    /**
     * Create an optimized ray caster for the senses restricted to the specified bounds and range.
     * @param {object} senses - The senses.
     * @param {number} [minX] - The minimum x-coordinate.
     * @param {number} [minY] - The minimum y-coordinate.
     * @param {number} [minZ] - The minimum z-coordinate.
     * @param {number} [maxX] - The maximum x-coordinate.
     * @param {number} [maxY] - The maximum y-coordinate.
     * @param {number} [maxZ] - The maximum z-coordinate.
     * @param {number} [maxR] - The maximum range.
     * @returns {RayCaster} The new ray caster restricted to the bounds and range.
     */
    createRayCaster(senses, minX, minY, minZ, maxX, maxY, maxZ, maxR) {
        return new RayCaster(this.activeRegions, senses, minX, minY, minZ, maxX, maxY, maxZ, maxR);
    }
}

/**
 * The region of {@link RayCastingSystem}.
 */
export class VolumetricRegion {
    /**
     * Sorts regions based on `priority`.
     * @param {VolumetricRegion} region1
     * @param {VolumetricRegion} region2
     * @returns {number}
     * @internal
     */
    static _compare(region1, region2) {
        const priority1 = region1.priority;
        const priority2 = region2.priority;
        let diff = 0;

        for (let i = 0, n = Math.min(priority1.length, priority2.length); diff === 0 && i < n; i++) {
            diff = priority1[i] - priority2[i];
        }

        return diff || priority1.length - priority2.length;
    }

    /**
     * The current data.
     * @type {VolumetricRegion}
     * @internal
     */
    _data = {};

    /**
     * Skip region?
     * @type {boolean}
     * @internal
     */
    _skip = false;

    /**
     * @param {string} id - The ID of the region.
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
         * @type {VolumetricRegionData}
         * @readonly
         */
        this.data = {
            object: null,
            active: false,
            mode: "sum",
            limits: {},
            shapes: [],
            elevation: 0,
            height: 0,
            priority: []
        };
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
         * The mode.
         * @type {VolumetricRegionMode}
         * @readonly
         */
        this.mode = "sum";
        /**
         * The limits.
         * @type {Object<string,number>}
         * @readonly
         */
        this.limits = null;
        /**
         * The shapes.
         * @type {Shape[]}
         * @readonly
         */
        this.shapes = [];
        /**
         * The minimum x-coordinate.
         * @type {number}
         * @readonly
         */
        this.minX = +Infinity;
        /**
         * The minimum y-coordinate.
         * @type {number}
         * @readonly
         */
        this.minY = +Infinity;
        /**
         * The minimum z-coordinate.
         * @type {number}
         * @readonly
         */
        this.minZ = +Infinity;
        /**
         * The maximum x-coordinate.
         * @type {number}
         * @readonly
         */
        this.maxX = -Infinity;
        /**
         * The maximum y-coordinate.
         * @type {number}
         * @readonly
         */
        this.maxY = -Infinity;
        /**
         * The maximum z-coordinate.
         * @type {number}
         * @readonly
         */
        this.maxZ = -Infinity;
        /**
         * The elevation.
         * @type {number}
         * @readonly
         */
        this.elevation = 0;
        /**
         * The height.
         * @type {number}
         * @readonly
         */
        this.height = 0;
        /**
         * The priority.
         * @type {(number|string|boolean)[]}
         * @readonly
         */
        this.priority = [];
        /**
         * Is deleted?
         * @type {boolean}
         * @readonly
         */
        this.deleted = false;
        /**
         * Is destroyed?
         * @type {boolean}
         * @readonly
         */
        this.destroyed = false;
    }

    /**
     * Update the data of the region.
     * @param {VolumetricRegionData} changes - The changes to the data of the region.
     * @returns {boolean} True if and only if the data of the region was changed.
     * @internal
     */
    _update(changes) {
        return updateData(this.data, changes);
    }

    /**
     * Refresh the region.
     * @param {VolumetricRegionData} data - The current data.
     * @param {VolumetricRegionData} changes - The data that has changed.
     * @internal
     */
    _refresh(data, changes) {
        this.object = data.object;
        this.active = data.active;
        this.mode = data.mode;
        this.limits = { ...data.limits };
        this.priority = [...data.priority];
        this.elevation = data.elevation;
        this.height = max(data.height, 0);

        const unitsToPixels = canvas.dimensions.size / canvas.dimensions.distance;

        this.minZ = this.elevation * unitsToPixels;
        this.maxZ = Number.isFinite(this.height)
            ? this.minZ + this.height * unitsToPixels
            : Infinity;

        if ("shapes" in changes) {
            this.shapes.length = 0;

            let minX = +Infinity;
            let minY = +Infinity;
            let maxX = -Infinity;
            let maxY = -Infinity;
            const mask = data.shapes.some(s => s.mask) ? 1 : -1;

            for (const shapeData of data.shapes) {
                const shape = Shape.create(shapeData, shapeData.mask ? -2 : mask);

                if (!shape) {
                    continue;
                }

                minX = min(minX, shape.minX);
                minY = min(minY, shape.minY);
                maxX = max(maxX, shape.maxX);
                maxY = max(maxY, shape.maxY);

                this.shapes.push(shape);
            }

            this.minX = minX;
            this.minY = minY;
            this.maxX = maxX;
            this.maxY = maxY;
        }

        this._skip = false;

        if (this.shapes.length === 0
            || Math.min(
                this.maxX - this.minX,
                this.maxY - this.minY,
                this.maxZ - this.minZ
            ) < 1 / 256) {
            this._skip = true;
        } else {
            switch (this.mode) {
                case "sum":
                case "min":
                    this._skip = Object.values(this.limits).every(limit => limit === Infinity);
                    break;
                case "max":
                    this._skip = Object.values(this.limits).every(limit => limit === 0);
                    break;
            }
        }
    }

    /**
     * Destroy the region.
     * @internal
     */
    _destroy() {
        this.destroyed = true;

        if (this.constructor.debug) {
            Console.debug(
                "%s (%O) | Destroyed",
                this.constructor.name,
                this
            );
        }
    }
}

/**
 * @abstract
 */
class Shape {
    /**
     * Create a shape from the data.
     * @param {ShapeData} data - The shape data.
     * @param {number} [mask=1] - The bit mask (31-bit).
     * @returns {Shape|undefined} The new shape unless the degenerate.
     */
    static create(data, mask = 1) {
        if ((mask &= 0x7FFFFFFF) === 0) {
            return;
        }

        const type = data.type ?? "r";
        let shape;

        if (type === "r") {
            shape = data.texture ? Tile._create(data) : Rectangle._create(data);
        }

        if (type === "e") {
            shape = Ellipse._create(data);
        }

        if (type === "p") {
            shape = Polygon._create(data);
        }

        if (shape) {
            shape.mask = mask;
        }

        return shape;
    }

    /**
     * Create a shape from the data.
     * @param {ShapeData} data - The shape data.
     * @returns {Shape|undefined}
     * @abstract
     * @internal
     */
    static _create(data) {
        throw new Error("Not implemented");
    }

    /**
     * @param {number} minX - The minimum x-coordinate.
     * @param {number} minY - The minimum y-coordinate.
     * @param {number} maxX - The maximum x-coordinate.
     * @param {number} maxY - The maximum y-coordinate.
     * @private
     */
    constructor(minX, minY, maxX, maxY) {
        /**
         * The minimum x-coordinate.
         * @type {number}
         * @readonly
         */
        this.minX = minX;
        /**
         * The maximum y-coordinate.
         * @type {number}
         * @readonly
         */
        this.minY = minY;
        /**
         * The minimum x-coordinate.
         * @type {number}
         * @readonly
         */
        this.maxX = maxX;
        /**
         * The maximum y-coordinate.
         * @type {number}
         * @readonly
         */
        this.maxY = maxY;
        /**
         * The bit mask of the shape (31-bit).
         * @type {number}
         * @readonly
         */
        this.mask = 0;
    }

    /**
     * Test whether this shape intersects the bounding box.
     * @param {number} minX - The minimum x-coordinate.
     * @param {number} minY - The minimum y-coordinate.
     * @param {number} maxX - The maximum x-coordinate.
     * @param {number} maxY - The maximum y-coordinate.
     * @returns {boolean} False if the bounding box to not intersect with the shape.
     */
    intersectsBounds(minX, minY, maxX, maxY) {
        return max(minX, this.minX) <= min(maxX, this.maxX)
            && max(minY, this.minY) <= min(maxY, this.maxY)
    }

    /**
     * Test whether the shape contains the bounding box.
     * @param {number} minX - The minimum x-coordinate.
     * @param {number} minY - The minimum y-coordinate.
     * @param {number} maxX - The maximum x-coordinate.
     * @param {number} maxY - The maximum y-coordinate.
     * @returns {boolean} True if the bounding box to contains the shape.
     * @abstract
     */
    containsBounds(minX, minY, maxX, maxY) {
        throw new Error("Not implemented");
    }

    /**
     * Compute the hits of the shape with the ray.
     * @param {number} originX - The x-origin of the ray.
     * @param {number} originY - The y-origin of the ray.
     * @param {number} velocityX - The x-velocity of the ray.
     * @param {number} velocityY - The y-velocity of the ray.
     * @param {RayCasterHit[]|null} hitQueue - The hit queue.
     * @param {number} volumeIndex - The index of the volume.
     * @returns {number} The mask that encodes whether the ray originates in the shape.
     * @abstract
     */
    computeHits(originX, originY, velocityX, velocityY, hitQueue, volumeIndex) {
        throw new Error("Not implemented");
    }
}

class Rectangle extends Shape {
    /** @override */
    static _create({ x, y, width, height, scaleX = 1, scaleY = 1, rotation = 0 }) {
        if (!(width > 0 && height > 0 && scaleX > 0 && scaleY > 0)) {
            return;
        }

        return new Rectangle(x, y, width, height, scaleX, scaleY, rotation);
    }

    /**
     * The transform matrix.
     * @type {Float64Array}
     */
    #matrix = new Float64Array(6);

    /** @internal */
    constructor(x, y, width, height, scaleX, scaleY, rotation) {
        const halfWidth = width / 2;
        const halfHeight = height / 2;
        const centerX = x + halfWidth;
        const centerY = y + halfHeight;
        const radiusX = width * scaleX;
        const radiusY = height * scaleY;
        const angle = Math.toRadians(rotation);
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const l = -radiusX / 2;
        const r = -l;
        const t = -radiusY / 2;
        const b = -t;
        const x0 = cos * l - sin * t;
        const x1 = cos * r - sin * t;
        const x2 = cos * r - sin * b;
        const x3 = cos * l - sin * b;
        const minX = Math.min(x0, x1, x2, x3) + centerX;
        const maxX = Math.max(x0, x1, x2, x3) + centerX;
        const y0 = sin * l + cos * t;
        const y1 = sin * r + cos * t;
        const y2 = sin * r + cos * b;
        const y3 = sin * l + cos * b;
        const minY = Math.min(y0, y1, y2, y3) + centerY;
        const maxY = Math.max(y0, y1, y2, y3) + centerY;

        super(minX, minY, maxX, maxY);

        const matrix = this.#matrix;
        const m0 = matrix[0] = cos / radiusX;
        const m1 = matrix[1] = -sin / radiusY;
        const m2 = matrix[2] = sin / radiusX;
        const m3 = matrix[3] = cos / radiusY;

        matrix[4] = 0.5 - (centerX * m0 + centerY * m2);
        matrix[5] = 0.5 - (centerX * m1 + centerY * m3);
    }

    /** @override */
    containsBounds(minX, minY, maxX, maxY) {
        const [ta, tb, tc, td, tx, ty] = this.#matrix;
        let x, y;

        x = ta * minX + tc * minY + tx;

        if (x < 0 || x > 1) {
            return false;
        }

        x = ta * maxX + tc * minY + tx;

        if (x < 0 || x > 1) {
            return false;
        }

        x = ta * maxX + tc * maxY + tx;

        if (x < 0 || x > 1) {
            return false;
        }

        x = ta * minX + tc * maxY + tx;

        if (x < 0 || x > 1) {
            return false;
        }

        y = tb * minX + td * minY + ty;

        if (y < 0 || y > 1) {
            return false;
        }

        y = tb * maxX + td * minY + ty;

        if (y < 0 || y > 1) {
            return false;
        }

        y = tb * maxX + td * maxY + ty;

        if (y < 0 || y > 1) {
            return false;
        }

        y = tb * minX + td * maxY + ty;

        if (y < 0 || y > 1) {
            return false;
        }

        return true;
    }

    /** @override */
    computeHits(originX, originY, velocityX, velocityY, hitQueue, volumeIndex) {
        const [ta, tb, tc, td, tx, ty] = this.#matrix;
        const x = ta * originX + tc * originY + tx;
        const y = tb * originX + td * originY + ty;
        const dx = ta * velocityX + tc * velocityY;
        const dy = tb * velocityX + td * velocityY;
        const px = -1 / dx;
        const py = -1 / dy;

        let t1 = x * px;
        let t2 = (x - 1) * px;
        let time1 = min(max(t1, 0), max(t2, 0));
        let time2 = max(min(t1, Infinity), min(t2, Infinity));

        t1 = y * py;
        t2 = (y - 1) * py;
        time1 = min(max(t1, time1), max(t2, time1));
        time2 = max(min(t1, time2), min(t2, time2));

        let state = 0;

        if (time1 <= time2 && time1 < 1 && time2 > 0) {
            if (time1 <= 0) {
                state = this.mask;
            }

            if (hitQueue) {
                if (time1 > 0) {
                    hitQueue.push(new RayCasterHit(time1, volumeIndex, this.mask));
                }

                if (time2 < 1) {
                    hitQueue.push(new RayCasterHit(time2, volumeIndex, this.mask));
                }
            }
        }

        return state;
    }
}

class Tile extends Shape {
    /** @override */
    static _create({ x, y, width, height, scaleX = 1, scaleY = 1, rotation = 0, texture }) {
        if (!(width > 0 && height > 0 && scaleX > 0 && scaleY > 0)) {
            return;
        }

        return new Tile(x, y, width, height, scaleX, scaleY, rotation, texture);
    }

    /**
     * The transform matrix.
     * @type {Float64Array}
     */
    #matrix = new Float64Array(6);

    /**
     * The width.
     * @type {number}
     */
    #width;

    /**
     * The height.
     * @type {number}
     */
    #height;

    /**
     * The signed distance field.
     * @type {Float64Array}
     */
    #field;

    /** @internal */
    constructor(x, y, width, height, scaleX, scaleY, rotation, texture) {
        // TODO: implement offsetX, offsetY, and rotation of TextureData
        const textureWidth = texture.width;
        const textureHeight = texture.height;
        const textureMinX = texture.minX ?? 0;
        const textureMinY = texture.minY ?? 0;
        const textureMaxX = texture.maxX ?? textureWidth;
        const textureMaxY = texture.maxY ?? textureHeight;
        const textureScaleX = textureWidth / width;
        const textureScaleY = textureHeight / height;
        const halfWidth = width / 2;
        const halfHeight = height / 2;
        const centerX = x + halfWidth;
        const centerY = y + halfHeight;
        const angle = Math.toRadians(rotation);
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const l = (textureMinX / textureScaleX - halfWidth) * scaleX;
        const r = (textureMaxX / textureScaleX - halfWidth) * scaleX;
        const t = (textureMinY / textureScaleY - halfHeight) * scaleY;
        const b = (textureMaxY / textureScaleY - halfHeight) * scaleY;
        const x0 = cos * l - sin * t;
        const x1 = cos * r - sin * t;
        const x2 = cos * r - sin * b;
        const x3 = cos * l - sin * b;
        const minX = Math.min(x0, x1, x2, x3) + centerX;
        const maxX = Math.max(x0, x1, x2, x3) + centerX;
        const y0 = sin * l + cos * t;
        const y1 = sin * r + cos * t;
        const y2 = sin * r + cos * b;
        const y3 = sin * l + cos * b;
        const minY = Math.min(y0, y1, y2, y3) + centerY;
        const maxY = Math.max(y0, y1, y2, y3) + centerY;

        super(minX, minY, maxX, maxY);

        this.#width = textureMaxX - textureMinX + 2;
        this.#height = textureMaxY - textureMinY + 2;

        const matrix = this.#matrix;
        const m0 = matrix[0] = cos / scaleX;
        const m1 = matrix[1] = -sin / scaleY;
        const m2 = matrix[2] = sin / scaleX;
        const m3 = matrix[3] = cos / scaleY;

        matrix[4] = halfWidth - (centerX * m0 + centerY * m2);
        matrix[5] = halfHeight - (centerX * m1 + centerY * m3);

        matrix[0] *= textureScaleX;
        matrix[1] *= textureScaleY;
        matrix[2] *= textureScaleX;
        matrix[3] *= textureScaleY;
        matrix[4] *= textureScaleX;
        matrix[5] *= textureScaleY;
        matrix[4] += 1 - textureMinX;
        matrix[5] += 1 - textureMinY;

        const textureStrideX = texture.stride ?? 1;
        const textureStrideY = textureWidth * textureStrideX;
        const signedDistanceField = this.#field = sdf(
            texture.pixels,
            texture.offset ?? 0,
            textureStrideX,
            textureStrideY,
            textureMinX,
            textureMinY,
            textureMaxX,
            textureMaxY,
            texture.threshold ?? 0
        );

        for (let i = 0, n = signedDistanceField.length; i < n; i++) {
            const signedDistance = signedDistanceField[i];

            signedDistanceField[i] = Math.sign(signedDistance)
                * max(Math.abs(signedDistance) - 1, 0.5);
        }
    }

    /** @override */
    containsBounds(minX, minY, maxX, maxY) {
        const [ta, tb, tc, td, tx, ty] = this.#matrix;
        const w = this.#width;
        const h = this.#height;
        let x, y;

        x = ta * minX + tc * minY + tx;

        if (x < 0 || x > w) {
            return false;
        }

        x = ta * maxX + tc * minY + tx;

        if (x < 0 || x > w) {
            return false;
        }

        x = ta * maxX + tc * maxY + tx;

        if (x < 0 || x > w) {
            return false;
        }

        x = ta * minX + tc * maxY + tx;

        if (x < 0 || x > w) {
            return false;
        }

        y = tb * minX + td * minY + ty;

        if (y < 0 || y > h) {
            return false;
        }

        y = tb * maxX + td * minY + ty;

        if (y < 0 || y > h) {
            return false;
        }

        y = tb * maxX + td * maxY + ty;

        if (y < 0 || y > h) {
            return false;
        }

        y = tb * minX + td * maxY + ty;

        if (y < 0 || y > h) {
            return false;
        }

        return true;
    }

    /** @override */
    computeHits(originX, originY, velocityX, velocityY, hitQueue, volumeIndex) {
        const [ta, tb, tc, td, tx, ty] = this.#matrix;
        const w = this.#width;
        const h = this.#height;
        let x = ta * originX + tc * originY + tx;
        let y = tb * originX + td * originY + ty;
        const dx = ta * velocityX + tc * velocityY;
        const dy = tb * velocityX + td * velocityY;
        const px = 1 / dx;
        const py = 1 / dy;

        let t1 = (1 - x) * px;
        let t2 = (w - 1 - x) * px;
        let time1 = min(max(t1, 0), max(t2, 0));
        let time2 = max(min(t1, Infinity), min(t2, Infinity));

        t1 = (1 - y) * py;
        t2 = (h - 1 - y) * py;
        time1 = min(max(t1, time1), max(t2, time1));
        time2 = max(min(t1, time2), min(t2, time2));

        let state = 0;

        if (time1 <= time2 && time1 < 1 && time2 > 0) {
            const f = this.#field;
            let inside;

            if (time1 <= 0) {
                time1 = 0;
                inside = f[(y | 0) * w + (x | 0)] < 0;

                if (inside) {
                    state = this.mask;
                }
            } else {
                inside = false;
            }

            if (hitQueue) {
                const invTravelDistance = 1 / Math.sqrt(dx * dx + dy * dy);

                do {
                    const signedDistance = f[(y + dy * time1 | 0) * w + (x + dx * time1 | 0)]
                        * invTravelDistance;

                    if (inside !== signedDistance < 0) {
                        inside = !inside;

                        if (time1 < 1) {
                            hitQueue.push(new RayCasterHit(time1, volumeIndex, this.mask));
                        }
                    }

                    time1 += Math.abs(signedDistance);
                } while (time1 <= time2);

                if (inside && time2 <= 1) {
                    hitQueue.push(new RayCasterHit(time2, volumeIndex, this.mask));
                }
            }
        }

        return state;
    }
}

class Ellipse extends Shape {
    /** @override */
    static _create({ x, y, width, height, scaleX = 1, scaleY = 1, rotation = 0 }) {
        if (!(width > 0 && height > 0 && scaleX > 0 && scaleY > 0)) {
            return;
        }

        return new Ellipse(x, y, width, height, scaleX, scaleY, rotation);
    }

    /**
     * The transform matrix.
     * @type {Float64Array}
     */
    #matrix = new Float64Array(6);

    constructor(x, y, width, height, scaleX, scaleY, rotation) {
        const halfWidth = width / 2;
        const halfHeight = height / 2;
        const centerX = x + halfWidth;
        const centerY = y + halfHeight;
        const radiusX = halfWidth * scaleX;
        const radiusY = halfHeight * scaleY;
        const angle = Math.toRadians(rotation);
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const deltaX = Math.hypot(radiusX * cos, radiusY * sin);
        const deltaY = Math.hypot(radiusX * sin, radiusY * cos);
        const minX = centerX - deltaX;
        const minY = centerY - deltaY;
        const maxX = centerX + deltaX;
        const maxY = centerY + deltaY;

        super(minX, minY, maxX, maxY);

        const matrix = this.#matrix;
        const m0 = matrix[0] = cos / radiusX;
        const m1 = matrix[1] = -sin / radiusY;
        const m2 = matrix[2] = sin / radiusX;
        const m3 = matrix[3] = cos / radiusY;

        matrix[4] = -(centerX * m0 + centerY * m2);
        matrix[5] = -(centerX * m1 + centerY * m3);
    }

    /** @override */
    containsBounds(minX, minY, maxX, maxY) {
        const [ta, tb, tc, td, tx, ty] = this.#matrix;
        let x, y;

        x = ta * minX + tc * minY + tx;
        y = tb * minX + td * minY + ty;

        if (x * x + y * y > 1) {
            return false;
        }

        x = ta * maxX + tc * minY + tx;
        y = tb * maxX + td * minY + ty;

        if (x * x + y * y > 1) {
            return false;
        }

        x = ta * maxX + tc * maxY + tx;
        y = tb * maxX + td * maxY + ty;

        if (x * x + y * y > 1) {
            return false;
        }

        x = ta * minX + tc * maxY + tx;
        y = tb * minX + td * maxY + ty;

        if (x * x + y * y > 1) {
            return false;
        }

        return true;
    }

    /** @override */
    computeHits(originX, originY, velocityX, velocityY, hitQueue, volumeIndex) {
        const [ta, tb, tc, td, tx, ty] = this.#matrix;
        const x = ta * originX + tc * originY + tx;
        const y = tb * originX + td * originY + ty;
        const dx = ta * velocityX + tc * velocityY;
        const dy = tb * velocityX + td * velocityY;
        const a = dx * dx + dy * dy;
        const b = dx * x + dy * y;
        const c = x * x + y * y - 1;
        let time1, time2;
        let state = 0;

        if (c !== 0) {
            const d = b * b - a * c;

            if (d <= 1e-6) {
                return state;
            }

            const f = Math.sqrt(d);

            if (b !== 0) {
                time1 = (-b - Math.sign(b) * f) / a;
                time2 = c / (a * time1);
            } else {
                time1 = f / a;
                time2 = -time1;
            }
        } else {
            time1 = 0;
            time2 = -b / a;
        }

        if (time1 > 0) {
            if (time1 < 1 && hitQueue) {
                hitQueue.push(new RayCasterHit(time1, volumeIndex, this.mask));
            }

            state ^= this.mask;
        }

        if (time2 > 0) {
            if (time2 < 1 && hitQueue) {
                hitQueue.push(new RayCasterHit(time2, volumeIndex, this.mask));
            }

            state ^= this.mask;
        }

        return state;
    }
}

class Polygon extends Shape {
    /** @override */
    static _create({ x = null, y = null, width = null, height = null, scaleX = 1, scaleY = 1, rotation = 0, points }) {
        const m = points?.length;

        if (!(m >= 6)) {
            return;
        }

        const pts = new Float64Array(points);

        if (width != null) {
            if (!(width > 0 && height > 0 && scaleX > 0 && scaleY > 0)) {
                return;
            }

            tempMatrix.identity();
            tempMatrix.translate(-width / 2, -height / 2);
            tempMatrix.scale(scaleX ?? 1, scaleY ?? 1);
            tempMatrix.rotate(Math.toRadians(rotation ?? 0));
            tempMatrix.translate(x + width / 2, y + height / 2);

            for (let i = 0; i < m; i += 2) {
                tempPoint.set(pts[i], pts[i + 1]);
                tempMatrix.apply(tempPoint, tempPoint);

                pts[i] = tempPoint.x;
                pts[i + 1] = tempPoint.y;
            }
        }

        return new Polygon(pts);
    }

    /**
     * The points.
     * @type {Float64Array}
     */
    #points;

    /** @internal */
    constructor(points) {
        const m = points.length;
        let minX = points[0] = Math.round(points[0] * 256) / 256;
        let minY = points[1] = Math.round(points[1] * 256) / 256;
        let maxX = minX;
        let maxY = minY;

        for (let i = 2; i < m; i += 2) {
            const x = points[i] = Math.round(points[i] * 256) / 256;
            const y = points[i + 1] = Math.round(points[i + 1] * 256) / 256;

            minX = min(minX, x);
            minY = min(minY, y);
            maxX = max(maxX, x);
            maxY = max(maxY, y);
        }

        super(minX, minY, maxX, maxY);

        this.#points = points;
    }

    /** @override */
    containsBounds(minX, minY, maxX, maxY) {
        const points = this.#points;
        const m = points.length;
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        let centerInside = false;

        for (let i = 0, x0 = points[m - 2], y0 = points[m - 1]; i < m; i += 2) {
            const x1 = points[i];
            const y1 = points[i + 1];

            if ((y1 > centerY) !== (y0 > centerY)
                && centerX < (x0 - x1) * ((centerY - y1) / (y0 - y1)) + x1) {
                centerInside = !centerInside;
            }

            x0 = x1;
            y0 = y1;
        }

        if (!centerInside) {
            return false;
        }

        for (let i = 0, x0 = points[m - 2], y0 = points[m - 1]; i < m; i += 2) {
            const x1 = points[i];
            const y1 = points[i + 1];
            const px = 1 / (x1 - x0);
            const py = 1 / (y1 - y0);

            let t1 = (minX - x0) * px;
            let t2 = (maxX - x0) * px;
            let time1 = min(max(t1, 0), max(t2, 0));
            let time2 = max(min(t1, Infinity), min(t2, Infinity));

            t1 = (minY - y0) * py;
            t2 = (maxY - y0) * py;
            time1 = min(max(t1, time1), max(t2, time1));
            time2 = max(min(t1, time2), min(t2, time2));

            if (time1 <= time2 && time1 < 1 && time2 > 0) {
                return false;
            }

            x0 = x1;
            y0 = y1;
        }

        return true;
    }

    /** @override */
    computeHits(originX, originY, velocityX, velocityY, hitQueue, volumeIndex) {
        const points = this.#points;
        const m = points.length;
        let i = 0;
        let x0 = points[m - 2];
        let y0 = points[m - 1];
        let state = 0;

        do {
            const x1 = points[i++];
            const y1 = points[i++];
            const dx = x1 - x0;
            const dy = y1 - y0;
            const q = velocityX * dy - velocityY * dx;

            while (q !== 0) {
                const ox = x0 - originX;
                const oy = y0 - originY;
                const u = (ox * velocityY - oy * velocityX) / q;

                if (u < 0 || u > 1 || u === 0 && q > 0 || u === 1 && q < 0) {
                    break;
                }

                const time = (ox * dy - oy * dx) / q;

                if (time <= 0) {
                    break;
                }

                if (time < 1 && hitQueue) {
                    hitQueue.push(new RayCasterHit(time, volumeIndex, this.mask));
                }

                state ^= this.mask;

                break;
            }

            x0 = x1;
            y0 = y1;
        } while (i !== m);

        return state;
    }
}

/**
 * The ray caster.
 */
export class RayCaster {
    /**
     * The minimum distance a ray can travel.
     * @type {number}
     * @readonly
     */
    minD;

    /**
     * The maximum distance a ray can travel.
     * @type {number}
     * @readonly
     */
    maxD;

    /**
     * The volumes.
     * @type {RayCasterVolume[]}
     */
    #volumes = [];

    /**
     * The sense ranges.
     * @type {Float64Array}
     */
    #senses;

    /**
     * The hits.
     * @type {RayCasterHit[]}
     */
    #hits = [];

    /**
     * The x-coordinate of the current origin.
     * @type {number}
     */
    #originX = 0;

    /**
     * The y-coordinate of the current origin.
     * @type {number}
     */
    #originY = 0;

    /**
     * The z-coordinate of the current origin.
     * @type {number}
     */
    #originZ = 0;

    /**
     * The x-coordinate of the current target.
     * @type {number}
     */
    #targetX = 0;

    /**
     * The y-coordinate of the current target.
     * @type {number}
     */
    #targetY = 0;

    /**
     * The z-coordinate of the current target.
     * @type {number}
     */
    #targetZ = 0;

    /**
     * @param {VolumetricRegion[]|RayCasterVolume[]} regions - The regions/volumes.
     * @param {Object<string,number>|Float64Array} senses - The senses.
     * @param {number} [minX] - The minimum x-coordinate.
     * @param {number} [minY] - The minimum y-coordinate.
     * @param {number} [minZ] - The minimum z-coordinate.
     * @param {number} [maxX] - The maximum x-coordinate.
     * @param {number} [maxY] - The maximum y-coordinate.
     * @param {number} [maxZ] - The maximum z-coordinate.
     * @param {number} [maxR] - The maximum range.
     * @internal
     */
    constructor(regions, senses, minX, minY, minZ, maxX, maxY, maxZ, maxR) {
        /**
         * The minimum x-coordinate.
         * @type {number}
         * @readonly
         */
        this.minX = minX ??= -Infinity;
        /**
         * The minimum y-coordinate.
         * @type {number}
         * @readonly
         */
        this.minY = minY ??= -Infinity;
        /**
         * The minimum z-coordinate.
         * @type {number}
         * @readonly
         */
        this.minZ = minZ ??= -Infinity;
        /**
         * The maximum x-coordinate.
         * @type {number}
         * @readonly
         */
        this.maxX = maxX ??= +Infinity;
        /**
         * The maximum y-coordinate.
         * @type {number}
         * @readonly
         */
        this.maxY = maxY ??= +Infinity;
        /**
         * The maximum z-coordinate.
         * @type {number}
         * @readonly
         */
        this.maxZ = maxZ ??= +Infinity;

        if (!("length" in senses)) {
            const sortedSenses = Object.entries(senses)
                .filter(sense => sense[1] > 0)
                .sort((a, b) => b[1] - a[1]);
            const numSenses = sortedSenses.length;
            const senseNames = new Array(numSenses);
            const senseRanges = this.#senses = new Float64Array(numSenses);

            for (let senseIndex = 0; senseIndex < numSenses; senseIndex++) {
                const [senseName, senseRange] = sortedSenses[senseIndex];

                senseNames[senseIndex] = senseName;
                senseRanges[senseIndex] = senseRange;
            }

            for (const region of regions) {
                if (!region.active || region._skip) {
                    continue;
                }

                if (!(max(minX, region.minX) <= min(maxX, region.maxX)
                    && max(minY, region.minY) <= min(maxY, region.maxY)
                    && max(minZ, region.minZ) <= min(maxZ, region.maxZ))) {
                    continue;
                }

                const shapes = [];

                if (region.shapes.length === 1) {
                    shapes.push(region.shapes[0]);
                } else {
                    for (const shape of region.shapes) {
                        if (max(minX, shape.minX) <= min(maxX, shape.maxX)
                            && max(minY, shape.minY) <= min(maxY, shape.maxY)) {
                            shapes.push(shape);
                        }
                    }
                }

                if (!shapes.length) {
                    continue;
                }

                let mode;

                switch (region.mode) {
                    case "sum": mode = 0; break;
                    case "set": mode = 1; break;
                    case "min": mode = 2; break;
                    case "max": mode = 3; break;
                }

                const energyCosts = new Float64Array(numSenses);

                for (let senseIndex = 0; senseIndex < numSenses; senseIndex++) {
                    const senseName = senseNames[senseIndex];
                    const senseLimit = region.limits[senseName] ?? Infinity;

                    energyCosts[senseIndex] = 1 / senseLimit;
                }

                this.#volumes.push(new RayCasterVolume(shapes, mode, energyCosts, region.minZ, region.maxZ));
            }
        } else {
            this.#senses = senses;

            for (const volume of regions) {
                const shapes = [];

                for (const shape of volume.shapes) {
                    if (max(minX, shape.minX) <= min(maxX, shape.maxX)
                        && max(minY, shape.minY) <= min(maxY, shape.maxY)) {
                        shapes.push(shape);
                    }
                }

                if (!shapes.length) {
                    continue;
                }

                this.#volumes.push(new RayCasterVolume(shapes, volume.mode, volume.costs));
            }
        }

        this.#optimizeVolumes();
        this.#estimateDistances(maxR);
    }

    /**
     * Remove unnecessary volumes and identify volumes that contain the bounds of the ray caster,
     * which are marked to be skipped by the ray intersection test.
     */
    #optimizeVolumes() {
        const { minX, minY, minZ, maxX, maxY, maxZ } = this;

        for (let i = this.#volumes.length - 1; i >= 0; i--) {
            const volume = this.#volumes[i];
            const volumeContainsBounds = volume.containsBounds(minX, minY, minZ, maxX, maxY, maxZ);

            if (volumeContainsBounds) {
                volume.skip = true;
                volume.state = 0;

                const mode = volume.mode;

                if (mode === 1
                    || (mode === 0 || mode === 2) && volume.costs.every(cost => cost === Infinity)
                    || mode === 3 && volume.costs.every(cost => cost === 0)) {
                    this.#volumes.splice(0, i);

                    break;
                }
            }
        }
    }

    /**
     * Estimate the minimum and maximum ranges that rays can travel.
     * @param {number} [maxR] - The maximum range.
     */
    #estimateDistances(maxR) {
        const senseRanges = this.#senses;
        const numSenses = senseRanges.length
        let maxD = Math.min(
            maxR ?? Infinity,
            numSenses ? senseRanges[0] : 0,
            Math.hypot(
                this.maxX - this.minX,
                this.maxY - this.minY,
                this.maxZ - this.minZ
            )
        );

        if (maxD === 0) {
            this.minD = this.maxD = 0;

            return;
        }

        const volumes = this.#volumes;

        if (volumes.length === 0) {
            this.minD = this.maxD = maxD;

            return;
        }

        const estimateDistance = (senseRanges, energyCosts) => {
            const numSenses = senseRanges.length;
            const senseIndicesOrderedByEnergyCost = new Int32Array(numSenses);

            for (let i = 0; i < numSenses; i++) {
                senseIndicesOrderedByEnergyCost[i] = i;
            }

            senseIndicesOrderedByEnergyCost.sort((i, j) => energyCosts[i] - energyCosts[j]);

            let currentDistance = 0;
            let remainingEnergy = 1;

            for (let i = 0; i < numSenses; i++) {
                const senseIndex = senseIndicesOrderedByEnergyCost[i];
                const senseRange = senseRanges[senseIndex];
                const energyCost = energyCosts[senseIndex];
                const deltaDistance = senseRange - currentDistance;

                if (!(deltaDistance > 0)) {
                    continue;
                }

                const requiredEnergy = deltaDistance * energyCost || 0;

                if (remainingEnergy <= requiredEnergy) {
                    if (energyCost !== 0) {
                        currentDistance += remainingEnergy / energyCost;
                    } else if (remainingEnergy !== 0) {
                        currentDistance = Infinity;
                    }

                    break;
                }

                remainingEnergy -= requiredEnergy;
                currentDistance = senseRange;

                if (remainingEnergy <= 1e-12) {
                    remainingEnergy = 0;

                    break;
                }

                if (currentDistance === Infinity) {
                    break;
                }
            }

            return currentDistance;
        }

        const firstVolume = volumes[0];

        if (firstVolume.skip && firstVolume.state === 0) {
            const minEnergyCosts = new Float64Array(numSenses).fill(Infinity);

            for (const volume of volumes) {
                const mode = volume.mode;

                if (mode === 1 || mode === 3) {
                    const energyCosts = volume.costs;

                    for (let senseIndex = 0; senseIndex < numSenses; senseIndex++) {
                        const energyCost = energyCosts[senseIndex];

                        minEnergyCosts[senseIndex] = min(minEnergyCosts[senseIndex], energyCost);
                    }
                }
            }

            this.maxD = maxD = min(maxD, estimateDistance(senseRanges, minEnergyCosts));
        } else {
            this.maxD = maxD;
        }

        const maxEnergyCosts = new Float64Array(numSenses);

        for (const volume of volumes) {
            const mode = volume.mode;
            const energyCosts = volume.costs;

            for (let senseIndex = 0; senseIndex < numSenses; senseIndex++) {
                const energyCost = energyCosts[senseIndex];

                switch (mode) {
                    case 0:
                        // TODO: accumulate costs in a separate array and add to `maxEnergyCosts`
                        maxEnergyCosts[senseIndex] = Infinity; break;
                    case 1:
                    case 2:
                        maxEnergyCosts[senseIndex] = max(maxEnergyCosts[senseIndex], energyCost);
                }
            }
        }

        this.minD = min(estimateDistance(senseRanges, maxEnergyCosts), maxD);
    }

    /**
     * Create an optimized ray caster restricted to the specified bounds and range.
     * @param {number} [minX] - The minimum x-coordinate.
     * @param {number} [minY] - The minimum y-coordinate.
     * @param {number} [minZ] - The minimum z-coordinate.
     * @param {number} [maxX] - The maximum x-coordinate.
     * @param {number} [maxY] - The maximum y-coordinate.
     * @param {number} [maxZ] - The maximum z-coordinate.
     * @param {number} [maxR] - The maximum range.
     * @returns {RayCaster} The new ray caster restricted to the bounds and range.
     */
    crop(minX, minY, minZ, maxX, maxY, maxZ, maxR) {
        minX = max(minX ?? -Infinity, this.minX);
        minY = max(minY ?? -Infinity, this.minY);
        minZ = max(minZ ?? -Infinity, this.minZ);
        maxX = min(maxX ?? +Infinity, this.maxX);
        maxY = min(maxY ?? +Infinity, this.maxY);
        maxZ = min(maxZ ?? +Infinity, this.maxZ);
        maxR = min(maxR ?? Infinity, this.maxD);

        return new RayCaster(this.#volumes, this.#senses, minX, minY, minZ, maxX, maxY, maxZ, maxR);
    }

    /**
     * Set the origin for the next ray casts.
     * @param {number} originX - The x-coordinate of the origin.
     * @param {number} originY - The y-coordinate of the origin.
     * @param {number} originZ - The z-coordinate of the origin.
     * @returns {this}
     */
    setOrigin(originX, originY, originZ) {
        this.#originX = Math.round(originX * 256) / 256;
        this.#originY = Math.round(originY * 256) / 256;
        this.#originZ = Math.round(originZ * 256) / 256;

        return this;
    }

    /**
     * Set the target for the next ray casts.
     * @param {number} targetX - The x-coordinate of the target.
     * @param {number} targetY - The y-coordinate of the target.
     * @param {number} targetZ - The z-coordinate of the target.
     * @returns {this}
     */
    setTarget(targetX, targetY, targetZ) {
        this.#targetX = targetX;
        this.#targetY = targetY;
        this.#targetZ = targetZ;

        return this;
    }

    /**
     * Cast a ray from the origin to the target point.
     * @param {boolean} [hitTest=false] - Return whether the ray hits the target instead of the normalized distance the ray has traveled.
     * @returns {number|boolean}
     */
    castRay(hitTest = false) {
        const originX = this.#originX;
        const originY = this.#originY;
        const originZ = this.#originZ;
        const targetX = this.#targetX;
        const targetY = this.#targetY;
        const targetZ = this.#targetZ;
        const velocityX = Math.trunc((targetX - originX) * 256) / 256;
        const velocityY = Math.trunc((targetY - originY) * 256) / 256;
        const velocityZ = Math.trunc((targetZ - originZ) * 256) / 256;
        const travelDistance = Math.sqrt(
            velocityX * velocityX +
            velocityY * velocityY +
            velocityZ * velocityZ
        );

        if (travelDistance <= this.minD) {
            return hitTest ? true : 1;
        }

        if (hitTest && travelDistance > this.maxD) {
            return false;
        }

        let activeSenses = this.#initializeSenses(travelDistance);

        this.#computeHits(originX, originY, originZ, velocityX, velocityY, velocityZ);
        this.#heapifyHits();

        const volumes = this.#volumes;
        let currentTime = 0;
        let currentEnergyCost = this.#computeEnergyCost(activeSenses);
        let remainingEnergy = 1 / travelDistance;
        const almostZeroEnergy = remainingEnergy * 1e-12;

        for (let hit; hit = this.#nextHit();) {
            const hitTime = hit.time;
            const hitVolumeIndex = hit.index;

            if (hitVolumeIndex >= 0) {
                const hitVolume = volumes[hitVolumeIndex];
                const hitState = hitVolume.state;

                if ((hitVolume.state ^= hit.mask) !== 0 && hitState !== 0) {
                    continue;
                }
            } else {
                activeSenses--;
            }

            const deltaTime = hitTime - currentTime;
            const requiredEnergy = deltaTime > 0 ? deltaTime * min(currentEnergyCost, 256) : 0;

            if (remainingEnergy <= requiredEnergy) {
                this.#hits.length = 0;

                break;
            }

            currentTime = hitTime;
            currentEnergyCost = this.#computeEnergyCost(activeSenses);
            remainingEnergy -= requiredEnergy;

            if (remainingEnergy <= almostZeroEnergy) {
                remainingEnergy = 0;
                this.#hits.length = 0;

                break;
            }
        }

        if (currentEnergyCost !== 0) {
            currentTime = min(currentTime + remainingEnergy / currentEnergyCost, 1);
        } else if (remainingEnergy !== 0) {
            currentTime = 1;
        }

        if (currentTime >= 0.99999) { // TODO
            currentTime = 1;
        }

        return hitTest ? currentTime === 1 : currentTime;
    }

    /**
     * Initialize the senses.
     * @param {number} travelDistance - The distance from the origin of the ray to the target.
     * @returns {number} The number of active senses.
     */
    #initializeSenses(travelDistance) {
        const senses = this.#senses;
        const numSenses = senses.length;

        for (let senseIndex = 0; senseIndex < numSenses; senseIndex++) {
            const senseRange = senses[senseIndex];

            if (senseRange < travelDistance) {
                this.#hits.push(new RayCasterHit(senseRange / travelDistance, -1, 0));
            }
        }

        return numSenses;
    }

    /**
     * Compute the hits of all volumes with the ray.
     * @param {number} originX - The x-origin of the ray.
     * @param {number} originY - The y-origin of the ray.
     * @param {number} originZ - The z-origin of the ray.
     * @param {number} velocityX - The x-velocity of the ray.
     * @param {number} velocityY - The y-velocity of the ray.
     * @param {number} velocityZ - The z-velocity of the ray.
     */
    #computeHits(originX, originY, originZ, velocityX, velocityY, velocityZ) {
        let shapeHitQueue = this.#hits;

        if (velocityX === 0 && velocityY === 0) {
            velocityX = velocityY = 1;
            shapeHitQueue = null;
        }

        const invVelocityX = 1 / velocityX;
        const invVelocityY = 1 / velocityY;
        const invVelocityZ = 1 / velocityZ;

        const volumes = this.#volumes;
        const numVolumes = volumes.length;

        for (let volumeIndex = 0; volumeIndex < numVolumes; volumeIndex++) {
            const volume = volumes[volumeIndex];

            if (volume.skip) {
                continue;
            }

            let state = -1;

            const t1 = (volume.minZ - originZ) * invVelocityZ;
            const t2 = (volume.maxZ - originZ) * invVelocityZ;
            const time1 = min(max(t1, 0), max(t2, 0));
            const time2 = max(min(t1, Infinity), min(t2, Infinity));

            if (time1 <= time2 && time2 > 0) {
                if (time1 >= 0) {
                    if (time1 < 1) {
                        this.#hits.push(new RayCasterHit(time1, volumeIndex, 1 << 31));
                    }

                    state ^= 1 << 31;
                }

                if (time2 >= 0) {
                    if (time2 < 1) {
                        this.#hits.push(new RayCasterHit(time2, volumeIndex, 1 << 31));
                    }

                    state ^= 1 << 31;
                }

                const shapes = volume.shapes;
                const numShapes = shapes.length;

                for (let shapeIndex = 0; shapeIndex < numShapes; shapeIndex++) {
                    const shape = shapes[shapeIndex];

                    let t1 = (shape.minX - originX) * invVelocityX;
                    let t2 = (shape.maxX - originX) * invVelocityX;
                    let time1 = min(max(t1, 0), max(t2, 0));
                    let time2 = max(min(t1, Infinity), min(t2, Infinity));

                    t1 = (shape.minY - originY) * invVelocityY;
                    t2 = (shape.maxY - originY) * invVelocityY;
                    time1 = min(max(t1, time1), max(t2, time1));
                    time2 = max(min(t1, time2), min(t2, time2));

                    if (time1 > time2 || time2 <= 0) {
                        continue;
                    }

                    state ^= shape.computeHits(originX, originY, velocityX, velocityY, shapeHitQueue, volumeIndex);
                }
            }

            volume.state = state;
        }
    }

    /**
     * Heapify hits.
     */
    #heapifyHits() {
        const hits = this.#hits;

        for (let i = hits.length >> 1; i--;) {
            this.#siftDownHit(hits[i], i);
        }
    }

    /**
     * Get the next this that needs to be processed.
     * @returns {RayCasterHit} The next hit.
     */
    #nextHit() {
        const hits = this.#hits;
        const numHits = hits.length;

        if (!numHits) {
            return;
        }

        const nextHit = hits[0];
        const lastHit = hits.pop();

        if (numHits > 1) {
            this.#siftDownHit(lastHit, 0);
        }

        return nextHit;
    }

    /**
     * Sift down the hit.
     * @param {RayCasterHit} hit - The hit.
     * @param {number} i - The current index of the hit.
     * @returns {number} The new index of the hit.
     */
    #siftDownHit(hit, i) {
        const hits = this.#hits;
        const numHits = hits.length;

        for (; ;) {
            const r = i + 1 << 1;
            const l = r - 1;
            let j = i;
            let h = hit
            let tmp;

            if (l < numHits && (tmp = hits[l]).time < h.time) {
                j = l;
                h = tmp;
            }

            if (r < numHits && (tmp = hits[r]).time < h.time) {
                j = r;
                h = tmp;
            }

            if (j === i) {
                break;
            }

            hits[i] = h;
            i = j;
        }

        hits[i] = hit;

        return i;
    }

    /**
     * Compute the current energy cost based on the active senses.
     * @param {number} activeSenses - The number of active senses.
     * @returns {number} The current energy cost.
     */
    #computeEnergyCost(activeSenses) {
        if (activeSenses === 0) {
            return Infinity;
        }

        let computedEnergyCost = 0;
        const volumes = this.#volumes;

        for (let volumeIndex = 0, numVolumes = volumes.length; volumeIndex < numVolumes; volumeIndex++) {
            const volume = volumes[volumeIndex];

            if (volume.state !== 0) {
                continue;
            }

            const mode = volume.mode;
            const energyCosts = volume.costs;
            let minEnergyCost = Infinity;

            for (let i = 0; i < activeSenses; i++) {
                minEnergyCost = min(minEnergyCost, energyCosts[i]);
            }

            switch (mode) {
                case 0: computedEnergyCost += minEnergyCost; break;
                case 1: computedEnergyCost = minEnergyCost; break;
                case 2: computedEnergyCost = max(computedEnergyCost, minEnergyCost); break;
                case 3: computedEnergyCost = min(computedEnergyCost, minEnergyCost); break;
            }
        }

        return computedEnergyCost;
    }
}

/**
 * The volume used by {@link RayCaster}. Computed from {@link VolumetricRegion} and the current senses.
 */
class RayCasterVolume {
    /**
     * Mapping of {@link VolumetricRegionMode} to integers.
     * "sum" is `0`.
     * "set" is `1`.
     * "min" is `2`.
     * "max" is `3`.
     * @typedef {0|1|2|3} RayCasterVolumeMode
     */

    /**
     * @param {Shape[]} shapes - The shapes.
     * @param {RayCasterVolumeMode} mode - The mode.
     * @param {Float64Array} costs - The energy costs.
     * @param {number} minZ - The minimum z-coordinate.
     * @param {number} maxZ - The maximum z-coordinate.
     */
    constructor(shapes, mode, costs, minZ, maxZ) {
        /**
         * The shapes.
         * @type {Shape[]}
         * @readonly
         */
        this.shapes = shapes;
        /**
         * The mode.
         * @type {RayCasterVolumeMode}
         * @readonly
         */
        this.mode = mode;
        /**
         * The energy costs.
         * @type {Float64Array}
         * @readonly
         */
        this.costs = costs;
        /**
         * The minimum z-coordinate.
         * @type {number}
         * @readonly
         */
        this.minZ = minZ;
        /**
         * The maximum z-coordinate.
         * @type {number}
         * @readonly
         */
        this.maxZ = maxZ;
        /**
         * The current state of the ray relative to this volume.
         * If zero, the ray is currently inside the volume.
         * @type {number}
         */
        this.state = 0;
        /**
         * Skip hits computation?
         * @type {boolean}
         */
        this.skip = false;
    }

    /**
     * Test whether this volume contains the bounding box.
     * @param {number} minX - The minimum x-coordinate.
     * @param {number} minY - The minimum y-coordinate.
     * @param {number} minZ - The minimum z-coordinate.
     * @param {number} maxX - The maximum x-coordinate.
     * @param {number} maxY - The maximum y-coordinate.
     * @param {number} maxZ - The maximum z-coordinate.
     * @returns {boolean} True if the volume contains the bounds.
     */
    containsBounds(minX, minY, minZ, maxX, maxY, maxZ) {
        const shapes = this.shapes;

        if (minZ < this.minZ || maxZ > this.maxZ) {
            return false;
        }

        const n = shapes.length;
        let state = (1 << 31) - 1;

        for (let i = 0; i < n; i++) {
            state ^= shapes[i].mask;
        }

        if (state) {
            return false;
        }

        for (let i = 0; i < n; i++) {
            if (!shapes[i].containsBounds(minX, minY, maxX, maxY)) {
                return false;
            }
        }

        return true;
    }
}

/**
 * The hit of a ray with a volume.
 */
class RayCasterHit {
    /**
     * @param {number} time - The time the ray hits the volume.
     * @param {number} index - The index of the volume that was hit.
     * @param {number} mask - The bit mask indicating which shapes are hit.
     */
    constructor(time, index, mask) {
        /**
         * The time the ray hits the volume.
         * @type {number}
         * @readonly
         */
        this.time = time;
        /**
         * The index of the volume that was hit.
         * @type {number}
         * @readonly
         */
        this.index = index;
        /**
         * The bit mask indicating which shapes are hit.
         * @type {number}
         * @readonly
         */
        this.mask = mask;
    }
}

/**
 * Minimum.
 * @param {number} x
 * @param {number} y
 * @returns {number}
 */
function min(x, y) {
    return x < y ? x : y;
}

/**
 * Maximum.
 * @param {number} x
 * @param {number} y
 * @returns {number}
 */
function max(x, y) {
    return x > y ? x : y;
}

/**
 * The value representing infinity. Used by {@link edt}.
 * @type {number}
 */
const EDT_INF = 1e20;

/**
 * Generate the 2D Euclidean signed distance field.
 * @param {(number|boolean)[]} data - The elements.
 * @param {number} offset - The offset of the first element in `data`.
 * @param {number} strideX - The distance between consecutive elements in a row of `data`.
 * @param {number} strideY - The distance between consecutive elements in a column of `data`.
 * @param {number} minX - The minimum x-coordinate of the rectangle.
 * @param {number} minY - The minimum y-coordinate of the rectangle.
 * @param {number} maxX - The maximum x-coordinate of the rectangle.
 * @param {number} maxY - The maximum x-coordinate of the rectangle.
 * @param {number} [threshold=0] - The threshold that needs to be exceeded for a pixel to be inner.
 * @returns {Float64Array} - The signed distance field with a 1 pixel padding.
 */
function sdf(data, offset, strideX, strideY, minX, minY, maxX, maxY, threshold = 0) {
    const width = maxX - minX + 2;
    const height = maxY - minY + 2;
    const size = width * height;
    const capacity = Math.max(width, height);
    const temp = new ArrayBuffer(8 * size + 20 * capacity + 8);
    const inner = new Float64Array(temp, 0, size);
    const outer = new Float64Array(size).fill(EDT_INF);

    for (let y = minY, j = width + 1; y < maxY; y++, j += 2) {
        for (let x = minX; x < maxX; x++, j++) {
            const a = data[offset + x * strideX + y * strideY];

            if (a > threshold) {
                inner[j] = EDT_INF;
                outer[j] = 0;
            }
        }
    }

    const f = new Float64Array(temp, inner.byteLength, capacity);
    const z = new Float64Array(temp, f.byteOffset + f.byteLength, capacity + 1);
    const v = new Int32Array(temp, z.byteOffset + z.byteLength, capacity);

    edt(inner, width, height, f, v, z);
    edt(outer, width, height, f, v, z);

    for (let i = 0; i < size; i++) {
        outer[i] = Math.sqrt(outer[i]) - Math.sqrt(inner[i]);
    }

    return outer;
}

/**
 * 2D Euclidean squared distance transform by Felzenszwalb & Huttenlocher.
 * @param {Float64Array} grid - The grid.
 * @param {number} width - The width of the grid.
 * @param {number} height - The height of the grid.
 * @param {Float64Array} f - The temporary source data, which returns the y of the parabola vertex at x.
 * @param {Int32Array} v - The temporary used to store x-coordinates of parabola vertices.
 * @param {Float64Array} z - The temporary used to store x-coordinates of parabola intersections.
 */
function edt(grid, width, height, f, v, z) {
    for (let x = 0; x < width; x++) {
        edt1d(grid, x, width, height, f, v, z);
    }

    for (let y = 0; y < height; y++) {
        edt1d(grid, y * width, 1, width, f, v, z);
    }
}

/**
 * 1D squared distance transform. Used by {@link edt}.
 * @param {Float64Array} grid - The grid.
 * @param {number} offset - The offset.
 * @param {number} stride - The stride.
 * @param {number} length - The length.
 * @param {Float64Array} f - The temporary source data, which returns the y of the parabola vertex at x.
 * @param {Int32Array} v - The temporary used to store x-coordinates of parabola vertices.
 * @param {Float64Array} z - The temporary used to store x-coordinates of parabola intersections.
 */
function edt1d(grid, offset, stride, length, f, v, z) {
    f[0] = grid[offset];
    v[0] = 0;
    z[0] = -EDT_INF;
    z[1] = EDT_INF;

    for (let q = 1, k = 0, s = 0; q < length; q++) {
        f[q] = grid[offset + q * stride];

        const q2 = q * q;

        do {
            const r = v[k];

            s = (f[q] - f[r] + q2 - r * r) / (q - r) * 0.5;
        } while (s <= z[k] && k--);

        k++;
        v[k] = q;
        z[k] = s;
        z[k + 1] = EDT_INF;
    }

    for (let q = 0, k = 0; q < length; q++) {
        while (z[k + 1] < q) {
            k++;
        }

        const r = v[k];
        const qr = q - r;

        grid[offset + q * stride] = f[r] + qr * qr;
    }
}
