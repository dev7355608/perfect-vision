import { CanvasFramebuffer } from "./canvas-framebuffer.js";
import { LightingFramebuffer } from "./lighting-framebuffer.js";
import { LightingSystem } from "./lighting-system.js";
import { RayCastingSystem } from "./ray-casting-system.js";

globalThis.PerfectVision = class PerfectVision {
    /**
     * @type {LightingFramebuffer}
     * @readonly
     * @internal
     */
    static LightingFramebuffer = LightingFramebuffer;

    /**
     * @type {LightingSystem}
     * @readonly
     * @internal
     */
    static LightingSystem = LightingSystem;

    /**
     * @type {RayCastingSystem}
     * @readonly
     * @internal
     */
    static RayCastingSystem = RayCastingSystem;

    /**
     * Print debug messages?
     * @type {boolean}
     */
    static #debug = false;

    /**
     * Print debug messages?
     * @type {boolean}
     */
    static get debug() {
        return this.#debug;
    }

    static set debug(value) {
        this.#debug = value;

        CanvasFramebuffer.debug = value;
        LightingSystem.debug = value;
        RayCastingSystem.debug = value;
    }

    /** @internal */
    static testVisibility = undefined;
}

Hooks.once("devModeReady", ({ registerPackageDebugFlag, getPackageDebugValue }) => {
    registerPackageDebugFlag("perfect-vision");

    PerfectVision.debug = !!getPackageDebugValue("perfect-vision");
});

import "./ambient-light.js";
import "./delimiter-effects.js";
import "./detection-mode.js";
import "./illumination-effects-filter.js";
import "./lighting-drawing.js";
import "./lighting-scene.js";
import "./lighting-uniforms.js";
import "./lighting.js";
import "./point-source-mesh.js";
import "./point-source-polygon.js";
import "./point-source-shader.js";
import "./point-source-uniforms.js";
import "./primary-group-shader.js";
import "./template.js";
import "./tile.js";
import "./token.js";
import "./visibility.js";
import "./visibility-filter.js";
