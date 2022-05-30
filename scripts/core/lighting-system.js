import { Region } from "../utils/region.js";
import { LimitSystem } from "./limit-system.js";
import { Tess2 } from "../utils/tess2.js";
import { SmoothGeometry, SmoothMesh } from "../utils/smooth-mesh.js";

const inheritedKeys = {
    vision: false, globalLight: false, globalLightThreshold: null, sightLimit: Infinity,
    daylightColor: CONFIG.Canvas.daylightColor, darknessColor: CONFIG.Canvas.darknessColor,
    darkness: 0, saturation: null, fogExploration: false, revealed: false
};

export class LightingSystem {
    static instance = new LightingSystem();

    regions = {};
    activeRegions = [];
    dirty = false;
    flags = {
        refreshVision: false,
        darknessChanged: false
    };

    addRegion(id, { shape, active = true, hidden = false, parent = null, fit = false, origin = null, elevation = 0, z = 0, inset = 0,
        walls = false, vision, globalLight, globalLightThreshold, sightLimit, fogExploration, revealed,
        daylightColor, darknessColor, darkness, saturation }) {
        let region = this.regions[id];

        if (!region) {
            this.regions[id] = region = new LightingRegion(id);
        }

        shape = Region.from(shape);
        origin = {
            x: origin?.x ?? 0,
            y: origin?.y ?? 0,
            b: origin?.b ?? -Infinity,
            t: origin?.t ?? +Infinity
        };
        region.data = {
            active, hidden, parent, shape, fit, elevation, z, inset, origin, walls, vision, globalLight, globalLightThreshold,
            sightLimit, daylightColor, darknessColor, darkness, saturation, fogExploration, revealed
        };

        this.dirty = true;
        this.flags.refreshVision = true;
        this.flags.darknessChanged = true;

        return region;
    }

    updateRegion(id, changes) {
        const region = this.regions[id];

        if (!region?.data) {
            return false;
        }

        let changed = false;

        changes = { ...changes };

        if ("active" in changes) {
            changes.active = changes.active ?? true;
        }

        if ("hidden" in changes) {
            changes.hidden = changes.hidden ?? false;
        }

        if ("parent" in changes) {
            changes.parent = changes.parent ?? null;
        }

        if ("shape" in changes) {
            changes.shape = Region.from(changes.shape);

            if (region.data.shape !== changes.shape) {
                region.data.shape = changes.shape;
                changed = true;
            }

            delete changes.shape;
        }

        if ("fit" in changes) {
            changes.fit = changes.fit ?? false;
        }

        if ("elevation" in changes) {
            changes.elevation = changes.elevation ?? 0;
        }

        if ("z" in changes) {
            changes.z = changes.z ?? 0;
        }

        if ("inset" in changes) {
            changes.inset = changes.inset ?? 0;
        }

        if ("origin" in changes) {
            changes.origin = changes.origin ?? {};

            if ("x" in changes.origin) {
                changes.origin.x = changes.origin.x ?? 0;
            }

            if ("y" in changes.origin) {
                changes.origin.y = changes.origin.y ?? 0;
            }

            if ("b" in changes.origin) {
                changes.origin.b = changes.origin.b ?? -Infinity
            }

            if ("t" in changes.origin) {
                changes.origin.t = changes.origin.t ?? +Infinity
            }
        }

        const update = foundry.utils.diffObject(region.data, changes);

        if (foundry.utils.isObjectEmpty(update)) {
            return changed;
        }

        foundry.utils.mergeObject(region.data, changes);
        this.dirty = true;

        return true;
    }

    deleteRegion(id) {
        const region = this.regions[id];

        if (region?.data) {
            region.data = null;

            this.dirty = true;
            this.flags.refreshVision = true;
            this.flags.darknessChanged = true;

            return true;
        }

        return false;
    }

    hasRegion(id) {
        return !!this.regions[id]?.data;
    }

    getRegion(id) {
        const region = this.regions[id];

        return region?.data ? region : undefined;
    }

    getActiveRegion(id) {
        const region = this.getRegion(id);

        return region?.active ? region : undefined;
    }

    reset() {
        for (const region of Object.values(this.regions)) {
            region.data = null;
            region.reset();
        }

        this.regions = {};
        this.activeRegions = [];
        this.dirty = true;
        this.flags.refreshVision = true;
        this.flags.darknessChanged = true;
    }

    getActiveRegionAtPoint(point) {
        for (let i = this.activeRegions.length - 1; i >= 0; i--) {
            const region = this.activeRegions[i];
            const domain = region.domain;
            let contains = false;

            for (let j = domain.length - 1; j >= 0; j--) {
                if (domain[j].containsPoint(point)) {
                    contains = !contains;
                }
            }

            if (contains) {
                return region;
            }
        }
    }

    refresh({ backgroundColor, forceUpdateLOS = false, forceVision = undefined } = {}) {
        if (backgroundColor !== undefined || forceUpdateLOS) {
            this.dirty = true;
        }

        if (this.flags.forceVision !== forceVision) {
            this.dirty = true;
        }

        if (!this.dirty) {
            return {
                refreshVision: false,
                darknessChanged: false
            };
        }

        this.dirty = false;
        this.flags.backgroundColor = backgroundColor ?? undefined;
        this.flags.refreshVision = false;
        this.flags.darknessChanged = false;
        this.flags.forceVision = !!forceVision;
        this.flags.forceUpdateLOS = !!forceUpdateLOS;

        this.activeRegions.length = 0;

        const visited = {};
        const refresh = id => {
            const region = this.regions[id];

            if (!region) {
                return { active: false };
            }

            if (visited[id]) {
                return visited[id];
            }

            const data = visited[id] = { ...region.data };
            const parentData = region.data.parent ? refresh(region.data.parent) : inheritedKeys;

            for (const key in inheritedKeys) {
                if (data[key] === undefined) {
                    data[key] = parentData[key];
                }
            }

            data.active = data.active && (parentData.active ?? true);

            if (forceVision !== undefined) {
                data.vision = forceVision;
            }

            region._refresh(data, this.flags);

            if (region.active) {
                this.activeRegions.push(region);
            }

            return data;
        }

        for (const id in this.regions) {
            const region = this.regions[id];

            if (!region.data) {
                region.reset();

                delete this.regions[id];
            } else {
                refresh(id);
            }
        }

        this.activeRegions.sort(LightingRegion.compare);

        const region = this.activeRegions[0];

        this.fogExploration = region?.fogExploration;
        this.revealed = region?.revealed;
        this.vision = region?.vision;
        this.globalLight = region?.globalLight;
        this.globalLightThreshold = region?.globalLightThreshold;
        this.sightLimit = region?.sightLimit;
        this.daylightColor = region?.daylightColor;
        this.darknessColor = region?.darknessColor;
        this.darknessLevel = region?.darknessLevel;
        this.saturationLevel = region?.saturationLevel;
        this.channels = region?.channels;

        for (const region of this.activeRegions) {
            if (this.fogExploration !== region.fogExploration) {
                this.fogExploration = undefined;
            }

            if (this.revealed !== region.revealed) {
                this.revealed = undefined;
            }

            if (this.vision !== region.vision) {
                this.vision = undefined;
            }

            if (this.globalLight !== region.globalLight) {
                this.globalLight = undefined;
            }

            if (this.sightLimit !== region.sightLimit) {
                this.sightLimit = undefined;
            }

            if (this.daylightColor !== region.daylightColor) {
                this.daylightColor = undefined;
                this.channels = undefined;
            }

            if (this.darknessColor !== region.darknessColor) {
                this.darknessColor = undefined;
                this.channels = undefined;
            }

            if (this.darknessLevel !== region.darknessLevel) {
                this.darknessLevel = undefined;
                this.channels = undefined;
            }

            if (this.saturationLevel !== region.saturationLevel) {
                this.saturationLevel = undefined;
            }

            if (this.globalLightThreshold !== region.globalLightThreshold) {
                this.globalLightThreshold = undefined;
            }
        }

        return {
            refreshVision: this.flags.refreshVision,
            darknessChanged: this.flags.darknessChanged
        };
    }
}

class LightingRegion {
    static compare(region1, region2) {
        return region1.elevation - region2.elevation || region1.sort - region2.sort || region1.id.localeCompare(region2.id, "en");
    }

    constructor(id) {
        this.id = id;
        this.data = null;
        this.reset();
    }

    _refresh(data, flags) {
        const active = data.active && !data.hidden;

        if (this.active !== active) {
            this.active = active;

            if (!active) {
                this.reset();

                flags.refreshVision = true;
                flags.darknessChanged = true;
            }
        }

        if (!active) {
            return;
        }

        let updateLOS = flags.forceUpdateLOS;
        let updateFOV = updateLOS && this.data.fit;
        let updateGeometry = false;
        let darknessChanged = false;
        let refreshVision = false;

        if (this.shape !== data.shape) {
            this.shape = data.shape;

            updateFOV = true;
        }

        if (this.fit !== data.fit) {
            this.fit = data.fit;

            updateFOV = true;
        }

        if (!this.origin || this.origin.x !== data.origin.x || this.origin.y !== data.origin.y || this.origin.b !== data.origin.b || this.origin.t !== data.origin.t) {
            this.origin = { ...data.origin };

            updateLOS = true;
        }

        if (this.walls !== data.walls) {
            this.walls = data.walls;

            updateLOS = true;
        }

        if (this.vision !== data.vision) {
            this.vision = data.vision;

            refreshVision = true;
        }

        if (this.fogExploration !== data.fogExploration) {
            this.fogExploration = data.fogExploration;

            refreshVision = true;
        }

        if (this.revealed !== data.revealed) {
            this.revealed = data.revealed;

            refreshVision = true;
        }

        const globalLight = data.globalLight && (data.globalLightThreshold === null || data.darkness <= data.globalLightThreshold);

        if (this.globalLight !== globalLight) {
            this.globalLight = globalLight;

            refreshVision = true;
        }

        if (this.sightLimit !== data.sightLimit) {
            this.sightLimit = data.sightLimit;

            refreshVision = true;
        }

        if (this.daylightColor !== data.daylightColor) {
            this.daylightColor = data.daylightColor;
            this.channels = null;
        }

        if (this.darknessColor !== data.darknessColor) {
            this.darknessColor = data.darknessColor;
            this.channels = null;
        }

        if (this.darknessLevel !== data.darkness) {
            this.darknessLevel = data.darkness;
            this.channels = null;

            darknessChanged = true;
        }

        let saturation = data.saturation;

        if (saturation === null) {
            if (game.system.id === "pf2e" && canvas.sight.rulesBasedVision) {
                saturation = (0.75 - data.darkness) / 0.5;
            } else {
                saturation = 1 - data.darkness;
            }
        }

        this.saturationLevel = saturation = Math.clamped(saturation, 0, 1);

        if (this.elevation !== data.elevation) {
            this.elevation = data.elevation;

            refreshVision = true;
        }

        if (this.sort !== data.z) {
            this.sort = data.z;

            refreshVision = true;
        }

        if (!this.channels || flags.backgroundColor !== undefined) {
            this.version++;
            this.channels = configureChannels({
                darkness: this.darknessLevel,
                backgroundColor: flags.backgroundColor,
                daylightColor: this.daylightColor,
                darknessColor: this.darknessColor
            });
        }

        if (updateFOV) {
            if (this.fit) {
                this.fov = this._fit(this.shape);
            } else {
                this.fov = this.shape.contour.length >= 6 && this.shape.area > 0 ? [this.shape] : [];
            }

            updateGeometry = true;
        }

        if (this.walls && !this.los || !this.walls && this.los) {
            updateLOS = true;
        }

        if (updateLOS) {
            if (this.data.walls) {
                this.los = Region.from(CONFIG.Canvas.losBackend.create({ ...this.origin }, { type: "light" }));

                updateGeometry = true;
            } else if (this.los) {
                this.los = null;

                updateGeometry = true;
            }
        }

        if (updateGeometry) {
            if (this.los) {
                this.domain = [];

                if (this.fov.length > 0 && this.los.contour.length > 0) {
                    const tess = new Tess2();

                    for (const fov of this.fov) {
                        tess.addContours(fov.contour);
                    }

                    tess.addContours(this.los.contour);

                    const result = tess.tesselate({
                        windingRule: Tess2.WINDING_ABS_GEQ_TWO,
                        elementType: Tess2.BOUNDARY_CONTOURS
                    });

                    if (result) {
                        for (let i = 0, n = result.elementCount * 2; i < n; i += 2) {
                            const k = result.elements[i] * 2;
                            const m = result.elements[i + 1] * 2;
                            const points = new Array(m);

                            for (let j = 0; j < m; j++) {
                                points[j] = result.vertices[k + j];
                            }

                            let area = 0;

                            for (let j = 0, x1 = points[m - 2], y1 = points[m - 1]; j < m; j += 2) {
                                const x2 = points[j];
                                const y2 = points[j + 1];

                                area += (x2 - x1) * (y2 + y1);

                                x1 = x2;
                                y1 = y2;
                            }

                            if (area < 0) {
                                this.domain.push(Region.from(new PIXI.Polygon(points)));
                            }
                        }
                    }

                    tess.dispose();
                }
            } else {
                this.domain = this.fov;
            }

            this.contours = this.domain.map(r => r.contour);
            this.geometry = null;
        }

        if (!this.geometry || this.geometry.inset !== this.data.inset) {
            const alignment = 0;
            let contours = this.contours;

            if (this.data.inset > 0 && alignment > 0) {
                const paths = [];

                for (const contour of contours) {
                    const m = contour.length;
                    const path = new Array(m >> 1);

                    for (let j = 0; j < m; j += 2) {
                        path[j >> 1] = new ClipperLib.IntPoint(Math.round(contour[j] * 256), Math.round(contour[j + 1] * 256));
                    }

                    paths.push(path);
                }

                const offset = new ClipperLib.ClipperOffset();

                offset.ArcTolerance = 0.308425 * 256;
                offset.AddPaths(paths, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
                offset.Execute(paths, 256 * this.data.inset * alignment);

                contours = [];

                for (const path of paths) {
                    const n = path.length;
                    const contour = new Array(n << 1);

                    for (let i = 0; i < n; i++) {
                        const point = path[i];

                        contour[(i << 1)] = point.X / 256;
                        contour[(i << 1) + 1] = point.Y / 256;
                    }

                    contours.push(contour);
                }
            }

            this.geometry = new SmoothGeometry(contours, this.data.inset);
        }

        if (updateGeometry || refreshVision) {
            LimitSystem.instance.addRegion(this.id, {
                shape: this.domain,
                limit: this.sightLimit,
                mode: "set",
                index: [0, this.elevation, this.sort]
            });

            refreshVision = true;
            darknessChanged = true;
        }

        if (!this.shader) {
            this.shader = new LightingRegionShader(this);
        }

        if (!this.mesh) {
            this.mesh = new SmoothMesh(this.geometry, this.shader);
            this.mesh.blendMode = PIXI.BLEND_MODES.NORMAL_NPM;
            this.mesh.colorMask = [true, true, true, false];
            this.mesh.cullable = true;
        }

        if (refreshVision) {
            flags.refreshVision = true;
        }

        if (darknessChanged) {
            flags.darknessChanged = true;
        }
    }

    reset() {
        this.active = false;
        this.shape = null;
        this.fit = null;
        this.origin = null;
        this.elevation = null;
        this.sort = null;
        this.walls = null;
        this.vision = undefined;
        this.globalLight = undefined;
        this.sightLimit = undefined;
        this.daylightColor = undefined;
        this.darknessColor = undefined;
        this.darknessLevel = undefined;
        this.saturationLevel = undefined;
        this.channels = undefined;
        this.version = 0;
        this.fov = null;
        this.los = null;
        this.domain = null;
        this.contours = null;
        this.geometry = null;
        this.shader?.destroy();
        this.shader = null;
        this.mesh?.destroy({ children: true });
        this.mesh = null;

        LimitSystem.instance.deleteRegion(this.id);
    }

    drawMesh() {
        const shader = this.shader;

        if (!shader) {
            return null;
        }

        const mesh = this.mesh;

        mesh.geometry = this.geometry;
        mesh.shader = shader;

        const uniforms = shader.uniforms;

        uniforms.uLOS = this.vision ? 1 : 0;
        uniforms.uFOV = this.vision || this.globalLight ? 1 : 0;
        uniforms.uDarknessLevel = this.darknessLevel;
        uniforms.uSaturationLevel = this.saturationLevel;
        uniforms.uColorBackground.set(this.channels.background.rgb);
        uniforms.uColorDarkness.set(this.channels.darkness.rgb);

        return mesh;
    }

    drawSight(fov, los, fog) {
        const geometry = this.geometry.fill;

        fov.draw({ geometry, hole: !this.vision && !this.globalLight });
        los.draw({ geometry, hole: !this.vision });
        fog?.draw({ geometry, hole: !this.fogExploration });
    }

    drawRevealed(revealed) {
        const geometry = this.geometry.fill;

        revealed.draw({ geometry, hole: !this.revealed });
    }

    _fit(region) {
        const vertices = new Map();
        const graph = new Map();
        const { x, y, width, height } = region.bounds;
        const walls = canvas.walls.quadtree?.getObjects(new NormalizedRectangle(x, y, width, height)) ?? [];
        const edges = [];

        for (const wall of walls) {
            const { a, b } = wall.vertices;

            if (a.key === b.key) {
                continue;
            }

            const i = wall.intersectsWith;

            if (i.size === 0) {
                if (region.containsLineSegment(a, b)) {
                    edges.push([a, b]);
                }
            } else {
                if (region.intersectsLineSegment(a, b)) {
                    const p = Array.from(i.values(), v => PolygonVertex.fromPoint(v));

                    p.push(a, b);
                    p.sort((v, w) => v.x - w.x || v.y - w.y);

                    for (let k = 1; k < p.length; k++) {
                        const v = p[k - 1];
                        const w = p[k];

                        if (region.containsLineSegment(v, w)) {
                            edges.push([v, w]);
                        }
                    }
                }
            }

            for (let i = 0; i < edges.length; i++) {
                for (let j = 0; j < 2; j++) {
                    const v = edges[i][j];

                    vertices.set(v.key, v);
                }
            }

            for (const [v, w] of edges) {
                if (v.key === w.key) {
                    continue;
                }

                if (!graph.get(v.key)?.add(w.key)) {
                    graph.set(v.key, new Set([w.key]));
                }

                if (!graph.get(w.key)?.add(v.key)) {
                    graph.set(w.key, new Set([v.key]));
                }
            }
        }

        const queue = [];
        const explored = new Set();

        for (const [key1, neighbors] of graph.entries()) {
            for (const key2 of neighbors) {
                if (key1 > key2) {
                    continue;
                }

                let current = key1;

                do {
                    if (current === key2) {
                        break;
                    }

                    for (const next of graph.get(current)) {
                        if (explored.has(next) || current === key1 && next === key2) {
                            continue;
                        }

                        queue.push(next);
                        explored.add(next);
                    }
                } while ((current = queue.pop()) !== undefined);

                if (current !== key2) {
                    graph.get(key1).delete(key2);
                    graph.get(key2).delete(key1);
                }

                queue.length = 0;
                explored.clear();
            }
        }

        for (const [key, neighbors] of graph.entries()) {
            if (neighbors.size === 0) {
                vertices.delete(key);
            }
        }

        const paths = [];

        while (vertices.size !== 0) {
            let start;

            for (const vertex of vertices.values()) {
                if (!start || start.x > vertex.x || start.x === vertex.x && start.y > vertex.y) {
                    start = vertex;
                }
            }

            if (!start) {
                break;
            }

            const path = [];
            let current = start;
            let last = { x: start.x - 1, y: start.y };

            do {
                path.push(current);

                const x0 = last.x;
                const y0 = last.y;
                const x1 = current.x;
                const y1 = current.y;

                let next;

                for (const key of graph.get(current.key)) {
                    if (key === last.key) {
                        continue;
                    }

                    const vertex = vertices.get(key);

                    if (!vertex) {
                        continue;
                    }

                    if (!next) {
                        next = vertex;

                        continue;
                    }

                    const x2 = next.x;
                    const y2 = next.y;
                    const x3 = vertex.x;
                    const y3 = vertex.y;

                    const d1 = (y0 - y1) * (x2 - x1) + (x1 - x0) * (y2 - y1);
                    const d2 = (y0 - y1) * (x3 - x1) + (x1 - x0) * (y3 - y1);

                    if (d1 <= 0 && d2 >= 0 && d1 !== d2) {
                        continue;
                    }

                    if (d1 >= 0 && d2 <= 0 && d1 !== d2) {
                        next = vertex;

                        continue;
                    }

                    const d3 = (y1 - y2) * (x3 - x1) + (x2 - x1) * (y3 - y1);

                    if (d3 > 0) {
                        continue;
                    }

                    if (d3 < 0) {
                        next = vertex;

                        continue;
                    }

                    const d4 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
                    const d5 = (x3 - x1) * (x3 - x1) + (y3 - y1) * (y3 - y1);

                    if (d5 > d4) {
                        next = vertex;
                    }
                }

                last = current;
                current = next;
            } while (current && current !== start);

            for (const vertex of path) {
                vertices.delete(vertex.key);
            }

            if (current === start && path.length >= 3) {
                paths.push(path.map(vertex => new ClipperLib.IntPoint(vertex.x, vertex.y)));
            }
        }

        const clipper = new ClipperLib.Clipper();

        clipper.AddPaths(paths, ClipperLib.PolyType.ptSubject, true);
        clipper.Execute(ClipperLib.ClipType.ctUnion, paths, ClipperLib.PolyFillType.pftPositive, ClipperLib.PolyFillType.pftEvenOdd);

        const regions = [];

        for (const path of paths) {
            const n = path.length;
            const points = new Array(n << 1);

            for (let i = 0; i < n; i++) {
                const point = path[i];

                points[(i << 1)] = point.X;
                points[(i << 1) + 1] = point.Y;
            }

            const region = Region.from(new PIXI.Polygon(points));

            if (region.contour.length >= 6 && region.area > 0) {
                regions.push(region);
            }
        }

        return regions;
    }
}

function configureChannels({
    darkness,
    backgroundColor,
    daylightColor = CONFIG.Canvas.daylightColor,
    darknessColor = CONFIG.Canvas.darknessColor,
    darknessLightPenalty = CONFIG.Canvas.darknessLightPenalty,
    dark = CONFIG.Canvas.lightLevels.dark,
    black = CONFIG.Canvas.lightLevels.black ?? 0.5,
    dim = CONFIG.Canvas.lightLevels.dim,
    bright = CONFIG.Canvas.lightLevels.bright
} = {}) {
    darkness = darkness ?? canvas.scene.data.darkness;
    backgroundColor = backgroundColor ?? canvas.backgroundColor;

    const channels = { daylight: {}, darkness: {}, scene: {}, canvas: {}, background: {}, dark: {}, black: {}, bright: {}, dim: {} };

    channels.daylight.rgb = foundry.utils.hexToRGB(daylightColor);
    channels.daylight.rgb = channels.daylight.rgb.map(c => Math.max(c, 0.05));
    channels.daylight.hex = foundry.utils.rgbToHex(channels.daylight.rgb);
    channels.darkness.level = darkness;
    channels.darkness.rgb = foundry.utils.hexToRGB(darknessColor);
    channels.darkness.rgb = channels.darkness.rgb.map(c => Math.max(c, 0.05));
    channels.darkness.hex = foundry.utils.rgbToHex(channels.darkness.rgb);
    channels.background.rgb = channels.darkness.rgb.map((c, i) => darkness * c + (1 - darkness) * channels.daylight.rgb[i]);
    channels.background.hex = foundry.utils.rgbToHex(channels.background.rgb);
    channels.scene.rgb = foundry.utils.hexToRGB(backgroundColor);
    channels.scene.hex = foundry.utils.rgbToHex(channels.scene.rgb);
    channels.canvas.rgb = channels.background.rgb.map((c, i) => c * channels.scene.rgb[i]);
    channels.canvas.hex = foundry.utils.rgbToHex(channels.canvas.rgb);
    channels.dark.rgb = channels.darkness.rgb.map(c => (1 + dark) * c);
    channels.dark.hex = foundry.utils.rgbToHex(channels.dark.rgb);
    channels.black.rgb = channels.dark.rgb.map(c => black * c);
    channels.black.hex = foundry.utils.rgbToHex(channels.black.rgb);
    channels.bright.rgb = [1, 1, 1].map((c, i) => Math.max(bright * (1 - darknessLightPenalty * darkness) * c, channels.background.rgb[i]));
    channels.bright.hex = foundry.utils.rgbToHex(channels.bright.rgb);
    channels.dim.rgb = channels.bright.rgb.map((c, i) => dim * c + (1 - dim) * channels.background.rgb[i]);
    channels.dim.hex = foundry.utils.rgbToHex(channels.dim.rgb);

    return channels;
}

class LightingRegionShader extends PIXI.Shader {
    static vertexSrc = `\
        #version 300 es

        precision ${PIXI.settings.PRECISION_VERTEX} float;

        layout(location = 0) in vec2 aVertexPosition;
        layout(location = 1) in lowp float aVertexDepth;

        uniform mat3 projectionMatrix;
        uniform mat3 translationMatrix;

        void main() {
            gl_Position = vec4((projectionMatrix * (translationMatrix * vec3(aVertexPosition, 1.0))).xy, aVertexDepth, 1.0);
        }`;

    static fragmentSrc = `\
        #version 300 es

        precision ${PIXI.settings.PRECISION_FRAGMENT} float;

        uniform float uLOS;
        uniform float uFOV;
        uniform float uDarknessLevel;
        uniform float uSaturationLevel;
        uniform vec3 uColorBackground;
        uniform vec3 uColorDarkness;

        layout(location = 0) out vec4 textures[4];

        void main() {
            float alpha = smoothstep(0.0, 1.0, gl_FragCoord.z);

            textures[0] = vec4(uLOS, uFOV, 0.0, alpha);
            textures[1] = vec4(uDarknessLevel, uSaturationLevel, 1.0, alpha);
            textures[2] = vec4(uColorBackground, alpha);
            textures[3] = vec4(uColorDarkness, alpha);
        }`;


    static get program() {
        if (!this._program) {
            this._program = PIXI.Program.from(this.vertexSrc, this.fragmentSrc);
        }

        return this._program;
    }

    constructor(region) {
        super(LightingRegionShader.program, {
            uLOS: 0,
            uFOV: 0,
            uDarknessLevel: 0,
            uSaturationLevel: 0,
            uColorBackground: new Float32Array(3),
            uColorDarkness: new Float32Array(3)
        });

        this.region = region;
    }
}
