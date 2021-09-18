import "./settings.js"
import "./config.js";
import "./controls.js";
import "./canvas.js";
import "./drawings.js";
import "./foreground.js";
import "./point-source/index.js";
import "./lighting.js";
import "./sight.js";
import "./tiles.js";
import "./tokens.js";
import "./walls.js";
import "./weather.js";

Hooks.once("canvasInit", () => {
    if (canvas.app.renderer.context.webGLVersion !== 2) {
        ui.notifications.error("Perfect Vision requires WebGL 2!");
    }
});

import { Framebuffer } from "../utils/framebuffer.js";
import { MonoFilter } from "./mono.js";

class PerfectVision {
    static Framebuffer = Framebuffer;
    static MonoFilter = MonoFilter;

    static get debug() {
        return Framebuffer.debug;
    }

    static set debug(value) {
        Framebuffer.debug = value;
    }
}

PerfectVision.debug = false;

self.PerfectVision = PerfectVision;
