import "./settings.js"
import "./config.js";
import "./controls.js";
import "./canvas.js";
import "./drawings.js";
import "./foreground.js";
import "./point-source/index.js";
import "./lighting.js";
import "./sight.js";
import "./templates.js";
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

    const next = 4;
    let current = game.settings.get("perfect-vision", "popup");

    if (game.user.isGM && current < next) {
        const templates = {
            false: `<details><summary><strong>%HEAD%</strong></summary>%BODY%</details><hr>`,
            true: `<h3><strong>%HEAD%</strong></h3>%BODY%<hr>`,
        };

        let content = `\
            <large>
            <p><strong>Please read the <a href="https://github.com/dev7355608/perfect-vision/blob/main/README.md#perfect-vision-foundry-vtt-module">documention</a>.</strong></p>
            </large>
            <hr>
            <p>If you haven't heard, Perfect Vision makes it possible to adjust all lighting settings locally; this includes <i>Sight Limit</i> as well. To learn how to setup mixed indoor/outdoor scenes or how to create magical darkness click <a href="https://github.com/dev7355608/perfect-vision/blob/main/README.md#drawing-configuration">here</a>.</p>
            <hr>`;

        content += templates[current < 4]
            .replace("%HEAD%", "v3.4 (GM Vision Improvements)")
            .replace("%BODY%", `\
                <p>In case you didn't know: you can toggle <i>GM Vision</i> with CTRL+G (default).</p> 
                <ul>
                    <li>The brightness of <i>GM Vision</i> is now adjustable: hover with the cursor over the eye icon in the scene controls and scroll up/down to adjust the brightness.</li>
                    <li>Fixed <i>GM Vision</i> not working properly in lighting areas.</li>
                </ul>`);

        content += templates[current < 3]
            .replace("%HEAD%", "v3.3 (PF2e Rules-Based Vision Compatibility)")
            .replace("%BODY%", `\
                <p><i>All of these changes concern only the PF2e system's rules-based vision.</i></p>
                <ul>
                    <li>Fixed darkvision not working in lighting areas.</li>
                    <li>Darkvision of fetchlings is no longer monochrome.</li>
                    <li>Low-light vision and darkvision are no longer abruptly toggled on once the <i>Darkness Level</i> exceeds 0.25. The brightness now smoothly increases as the <i>Darkness Level</i> increases; maximum brightness is attained at 0.75 <i>Darkness Level</i>.</li>
                    <li>Automatic <i>Saturation Level</i> behaves a little bit different now: saturation starts to decrease at 0.25 <i>Darkness Level</i> and reaches maximum desaturation at 0.75 <i>Darkness Level</i>.</li>
                    <li>A token is now truly blind if it has the blinded condition: the token's <i>Sight Limit</i> is automatically set according to the blinded condition.</li>
                </ul>`);

        content += templates[current < 2]
            .replace("%HEAD%", "v3.2 (Sight Limit: Lights and Templates)")
            .replace("%BODY%", `\
                <ul>
                    <li>Added the <i>Sight Limit</i> setting to templates and light sources.</li>
                </ul>`);

        content += templates[current < 1]
            .replace("%HEAD%", "v3.0/v3.1 (Sight Limit: Drawings)")
            .replace("%BODY%", `\
                    <ul>
                        <li>Added the <i>Sight Limit</i> setting to the drawings configuration.</li>
                    </ul>
                    <p><strong>Minor breaking changes:</strong></p>
                    <ul>
                        <li>The <i>Local (Unrestricted)</i> light type as been removed, because it's a core setting now (<i>Advanced Options -> Constrained By Walls</i>). Any existing lights of this type are <i>not</i> automatically migrated.</li>
                        <li>The token's <i>Sight Limit</i> no longer overrides the scene's <i>Sight Limit</i>: for example, if the scene's limit is set to 30 units and the token's limit is set to 60, the token's vision range is 30; in v8 it would have been 60.
                    </ul>`);

        new Dialog({
            title: "Perfect Vision",
            content,
            buttons: {
                ok: { icon: '<i class="fas fa-check"></i>', label: "Understood" },
                dont_remind: {
                    icon: '<i class="fas fa-times"></i>',
                    label: "Don't remind me again",
                    callback: () => game.settings.set("perfect-vision", "popup", next),
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

function onTick() {
    if (canvas?.ready) {
        Framebuffer.updateAll();
    }
}

function onResize() {
    Framebuffer.invalidateAll(true);
}

Hooks.on("canvasInit", () => {
    canvas.app.renderer.off("resize", onResize);
    canvas.app.renderer.on("resize", onResize);

    canvas.app.ticker.remove(onTick);
    canvas.app.ticker.add(onTick, undefined, PIXI.UPDATE_PRIORITY.LOW + 1);
});

Hooks.on("canvasReady", () => {
    Framebuffer.invalidateAll(true);
});

Hooks.on("canvasPan", () => {
    Framebuffer.invalidateAll(true);
});
