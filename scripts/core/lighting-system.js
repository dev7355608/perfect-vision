import { PointSourceGeometry } from "./point-source/geometry.js";
import { PointSourceMesh } from "./point-source/mesh.js";
import { Region } from "../utils/region.js";
import { LimitSystem } from "./limit-system.js";
import { Tess2 } from "../utils/tess2.js";

const inheritedKeys = {
    walls: false, vision: false, globalLight: false, globalLightThreshold: null, sightLimit: Infinity,
    daylightColor: CONFIG.Canvas.daylightColor, darknessColor: CONFIG.Canvas.darknessColor,
    darkness: 0, saturation: null
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

    addRegion(id, { shape, active = true, hidden = false, parent = null, origin = null, z = 0, inset = 0,
        walls, vision, globalLight, globalLightThreshold, sightLimit,
        daylightColor, darknessColor, darkness, saturation }) {
        let region = this.regions[id];

        if (!region) {
            this.regions[id] = region = new LightingRegion(id);
        }

        shape = Region.from(shape);
        region.data = {
            active, hidden, parent, shape, z, inset, origin, walls, vision, globalLight, globalLightThreshold,
            sightLimit, daylightColor, darknessColor, darkness, saturation
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
        }

        if ("z" in changes) {
            changes.z = changes.z ?? 0;
        }

        if ("inset" in changes) {
            changes.inset = changes.inset ?? 0;
        }

        if ("origin" in changes) {
            changes.origin = changes.origin ?? null;
        }

        for (const key in changes) {
            if (region.data[key] !== changes[key]) {
                region.data[key] = changes[key];
                changed = true;
            }
        }

        if (changed) {
            this.dirty = true;
        }

        return changed;
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
        let result;

        for (const region of this.activeRegions) {
            if (region.los && !region.los.containsPoint(point)) {
                continue;
            }

            if (region.fov.containsPoint(point)) {
                result = region;
            }
        }

        return result;
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

        this.walls = region?.walls;
        this.vision = region?.vision;
        this.globalLight = region?.globalLight;
        this.sightLimit = region?.sightLimit;
        this.daylightColor = region?.daylightColor;
        this.darknessColor = region?.darknessColor;
        this.darknessLevel = region?.darknessLevel;
        this.saturationLevel = region?.saturationLevel;
        this.channels = region?.channels;

        for (const region of this.activeRegions) {
            if (this.walls !== region.walls) {
                this.walls = undefined;
            }

            if (this.vision !== region.vision) {
                this.vision = undefined;
            }

            if (this.globalLight !== region.globalLight) {
                this.globalLight = undefined;
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
        }

        return {
            refreshVision: this.flags.refreshVision,
            darknessChanged: this.flags.darknessChanged
        };
    }
}

class LightingRegion {
    static compare(region1, region2) {
        return region1.zIndex - region2.zIndex || region1.id.localeCompare(region2.id, "en");
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

        let updateFOV = false;
        let updateLOS = flags.forceUpdateLOS;
        let darknessChanged = false;
        let refreshVision = false;

        if (this.shape !== data.shape) {
            this.shape = this.fov = data.shape;

            updateFOV = true;
            updateLOS = true;
        }

        if (this.origin?.x !== data.origin?.x || this.origin?.y !== data.origin?.y) {
            this.origin = data.origin;

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

        if (this.zIndex !== data.z) {
            this.zIndex = data.z;

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

        if (this.data.walls && !this.los || !this.data.walls && this.los) {
            updateLOS = true;
        }

        if (updateLOS) {
            if (this.data.walls) {
                this.los = Region.from(CONFIG.Canvas.losBackend.create({ x: this.data.origin.x, y: this.data.origin.y, z: null }, { type: "light" }));
            } else if (this.los) {
                this.los = null;
            }
        }

        if (updateFOV || updateLOS) {
            this.clos1 = [];
            this.clos2 = [];

            if (this.los) {
                const tess = new Tess2();

                tess.addContours(this.fov.contour);
                tess.addContours(this.los.contour);

                const result = tess.tesselate({
                    windingRule: Tess2.WINDING_ABS_GEQ_TWO,
                    elementType: Tess2.BOUNDARY_CONTOURS,
                    polySize: 3,
                    vertexSize: 2
                });

                if (result) {
                    for (let i = 0, n = result.elementCount * 2; i < n; i += 2) {
                        const k = result.elements[i] * 2;
                        const m = result.elements[i + 1] * 2;
                        const points1 = new Array(m);

                        for (let j = 0; j < m; j++) {
                            points1[j] = result.vertices[k + j];
                        }

                        let area = 0;

                        for (let i = 0, x1 = points1[m - 2], y1 = points1[m - 1]; i < m; i += 2) {
                            const x2 = points1[i];
                            const y2 = points1[i + 1];

                            area += (x2 - x1) * (y2 + y1);

                            x1 = x2;
                            y1 = y2;
                        }

                        if (area < 0) { // TODO
                            this.clos1.push(points1);

                            const points2 = new Array(m);

                            for (let i = m - 2; i >= 0; i -= 2) {
                                points2[i] = points1[m - i - 2];
                                points2[i + 1] = points1[m - i - 1];
                            }

                            this.clos2.push(points2);
                        }
                    }
                }

                tess.dispose();
            } else {
                const points1 = this.fov.contour;
                const m = points1.length;

                this.clos1.push(points1);

                const points2 = new Array(m);

                for (let i = m - 2; i >= 0; i -= 2) {
                    points2[i] = points1[m - i - 2];
                    points2[i + 1] = points1[m - i - 1];
                }

                this.clos2.push(points2);
            }
        }

        if (!this.geometry || this.geometry.fov !== this.fov || this.geometry.los !== this.los || this.geometry.inset !== this.data.inset) {
            this.geometry = new PointSourceGeometry(this.fov, this.los, this.data.inset);
        }

        if (updateFOV || updateLOS || refreshVision) {
            LimitSystem.instance.addRegion(this.id, {
                shape: this.fov,
                mask: this.los,
                limit: this.sightLimit,
                mode: "set",
                index: [0, this.zIndex]
            });

            refreshVision = true;
            darknessChanged = true;
        }

        if (!this.shader) {
            this.shader = new LightingRegionShader(this);
        }

        if (!this.mesh) {
            this.mesh = new PointSourceMesh(this.geometry, this.shader);
            this.mesh.blendMode = PIXI.BLEND_MODES.NORMAL_NPM;
            this.mesh.colorMask.alpha = false;
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
        this.origin = null;
        this.zIndex = null;
        this.walls = undefined;
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
        this.geometry = null;
        this.shader?.destroy();
        this.shader = null;
        this.mesh?.destroy();
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
        mesh.zIndex = this.data.z;

        const uniforms = shader.uniforms;

        uniforms.uLOS = this.vision ? 1 : 0;
        uniforms.uFOV = this.vision || this.globalLight ? 1 : 0;
        uniforms.uDarknessLevel = this.darknessLevel;
        uniforms.uSaturationLevel = this.saturationLevel;
        uniforms.uColorBackground.set(this.channels.background.rgb);
        uniforms.uColorDarkness.set(this.channels.darkness.rgb);

        return mesh;
    }

    drawSight(fov, los, inset = false) {
        const geometry = this.geometry;
        const segments = geometry.segments;

        fov.pushMask({ geometry: segments.fov });

        if (inset && (this.vision || this.globalLight)) {
            fov.pushMask({ geometry: segments.edges, hole: true });
        }

        los.pushMask({ geometry: segments.fov });

        if (inset && this.vision) {
            los.pushMask({ geometry: segments.edges, hole: true });
        }

        if (this.los) {
            fov.draw({ geometry: segments.los, hole: !this.vision && !this.globalLight });
            los.draw({ geometry: segments.los, hole: !this.vision });
        } else {
            fov.draw({ hole: !this.vision && !this.globalLight });
            los.draw({ hole: !this.vision });
        }

        fov.popMasks();
        los.popMasks();
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
