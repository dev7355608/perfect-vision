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
        ui.notifications.error("Perfect Vision requires WebGL 2!", { permanent: true });
    }
});

Hooks.once("ready", () => {
    game.settings.register("perfect-vision", "popup", {
        name: "",
        default: 0,
        type: Number,
        scope: "world",
        config: false,
    });

    if (game.user.isGM && game.settings.get("perfect-vision", "popup") < 1) {
        new Dialog({
            title: "Perfect Vision",
            content: `\
                <large>
                <p><strong>Please read the <a href="https://github.com/dev7355608/perfect-vision/blob/main/README.md#perfect-vision-foundry-vtt-module">documention</a>.</strong></p>
                </large>
                <hr>
                <p>If you haven't heard, Perfect Vision makes it possible to adjust all lighting settings locally; this includes <i>Sight Limit</i> now as well. To learn how to setup mixed indoor/outdoor scenes or to create magical darkness click <a href="https://github.com/dev7355608/perfect-vision/blob/main/README.md#drawing-configuration">here</a>.</p>
                <p><strong>Minor breaking changes:</strong>
                    <ul>
                        <li>The <i>Local (Unrestricted)</i> light type as been removed, because it's a core setting now (<i>Advanved Options -> Constrained By Walls</i>). Any existing lights of this type are <i>not</i> automatically migrated.</p></li>
                        <li>The token's <i>Sight Limit</i> no longer overrides the scene's <i>Sight Limit</i>: for example, if the scene's limit is set to 30 units and the token's limit is set to 60, the token's vision range is 30; in v8 it would have been 60.
                    </ul>`,
            buttons: {
                ok: { icon: '<i class="fas fa-check"></i>', label: "Understood" },
                dont_remind: {
                    icon: '<i class="fas fa-times"></i>',
                    label: "Don't remind me again",
                    callback: () => game.settings.set("perfect-vision", "popup", 1),
                },
            },
        }).render(true);
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
