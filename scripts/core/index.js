import "./settings.js"
import "./config/index.js";
import "./controls.js";
import "./canvas.js";
import "./drawings.js";
import "./foreground.js";
import "./lighting.js";
import "./limit-system.js";
import "./point-source/index.js";
import "./polygon.js";
import "./sight.js";
import "./templates.js";
import "./tiles.js";
import "./tokens.js";
import "./walls.js";
import "./weather.js";

import { patch } from "../utils/patch.js";

// TODO: remove in v10
PlaceableObject.prototype.cullable = true;
ObjectHUD.prototype.cullable = true;

Hooks.once("init", () => {
    // TODO: remove in v10 (https://gitlab.com/foundrynet/foundryvtt/-/issues/6696)

    function destroyPreviewObjects(objects) {
        objects?.forEach(c => {
            if (!c.destroyed) {
                const o = c._original;

                if (o) {
                    if ("locked" in o.data) {
                        o.data.locked = false;
                    }

                    o.alpha = 1.0;
                }

                c.destroy({ children: true });
            }
        });
    }

    patch("PlaceablesLayer.prototype.clearPreviewContainer", "OVERRIDE", function () {
        if (!this.preview) return;

        // Restore the original state
        for (let c of this.preview.children) {
            c.visible = false;
            const o = c._original;
            if (o) {
                if ("locked" in o.data) o.data.locked = false;
                o.alpha = 1.0;
            }
        }

        // Remove and destroy previews
        this.preview.removeChildren().forEach(c => c.destroy({ children: true }));
    });

    patch("PlaceablesLayer.prototype.deactivate", "WRAPPER", function (wrapped, ...args) {
        const previewObjects = this.preview ? Array.from(this.preview.children) : null;

        wrapped(...args);

        destroyPreviewObjects(previewObjects);
    });

    patch("PlaceablesLayer.prototype._onDragLeftStart", "WRAPPER", async function (wrapped, ...args) {
        const previewObjects = this.preview ? Array.from(this.preview.children) : null;

        await wrapped(...args);

        if (this.options.canDragCreate) {
            destroyPreviewObjects(previewObjects);
        }
    });

    patch("TileConfig.prototype.close", "WRAPPER", async function (wrapped, ...args) {
        const previewObjects = this.object.layer?.preview ? Array.from(this.object.layer.preview.children) : null;

        await wrapped(...args);

        destroyPreviewObjects(previewObjects);
    });

    patch("NoteConfig.prototype.close", "WRAPPER", async function (wrapped, ...args) {
        const previewObjects = canvas.notes.preview ? Array.from(canvas.notes.preview.children) : null;

        await wrapped(...args);

        if (!this.object.id) {
            destroyPreviewObjects(previewObjects);
        }
    });

    patch("AmbientSoundConfig.prototype.close", "WRAPPER", async function (wrapped, ...args) {
        const previewObjects = canvas.sounds.preview ? Array.from(canvas.sounds.preview.children) : null;

        await wrapped(...args);

        if (!this.object.id) {
            destroyPreviewObjects(previewObjects);
        }
    });

    // TODO: remove in v10 (https://gitlab.com/foundrynet/foundryvtt/-/issues/7122)
    patch("TextureLoader.prototype.load", "OVERRIDE", async function (sources, { message, expireCache = false } = {}) {
        const seen = new Set();
        const promises = [];
        const progress = { message: message, loaded: 0, failed: 0, total: 0, pct: 0 };
        for (const src of sources) {
            // De-dupe load requests
            if (seen.has(src)) continue;
            seen.add(src);

            let promise;
            const cached = this.getCache(src);
            if (cached) {
                // Load from cache
                promise = Promise.resolve(cached);
            } else {
                // Load uncached textures
                promise = VideoHelper.hasVideoExtension(src) ? this.loadVideoTexture(src) : this.loadImageTexture(src);
            }
            promises.push(promise.then(() => this._onProgress(src, progress)).catch(err => this._onError(src, progress, err)));
        }
        progress.total = promises.length;

        // Expire any cached textures
        if (expireCache) this.expireCache();

        // Load all media
        return Promise.all(promises);
    });
});

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

    const next = 9;
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
            <p>If you haven't heard, Perfect Vision makes it possible to adjust all lighting and vision settings locally. To learn how to setup mixed indoor/outdoor scenes or how to create magical darkness click <a href="https://github.com/dev7355608/perfect-vision/blob/main/README.md#drawing-configuration">here</a>.</p>
            <hr>
            `;

        content += templates[current < 9]
            .replace("%HEAD%", "v3.9 (Fog Exploration & Reveal Fog)")
            .replace("%BODY%", `\
                <ul>
                    <li>Added the lighting drawing option <i>Fog Exploration</i>, which allows you to enable or disable <i>Fog Exploration</i> locally.</li>
                    <li>Added the scene setting and lighting drawing option <i>Reveal Fog</i>. If enabled, the fog of war in the scene or area is revealed. The fog is revealed even if <i>Fog Exploration</i> is disabled. Revealing the fog doesn't explore it automatically. Explored areas are always revealed.</li>
                </ul>`);
        content += templates[current < 8]
            .replace("%HEAD%", "v3.8 (Fit To Walls)")
            .replace("%BODY%", `\
                <ul>
                    <li>
                        Added the lighting drawing option <i>Fit To Walls</i>. If enabled, the the area is automatically fit to the underlying walls structure.
                        This makes setting up interior lighting so much quicker: draw a rectangle (or any other shape) around the building/room, enable <i>Fit To Walls</i>, and done!
                    </li>
                    <li>Check out the <a href="https://github.com/dev7355608/advanced-drawing-tools">Advanced Drawing Tools</a> module: it allows you to edit polygon drawings, which comes in handy if you mess up your lighting drawings.</a>
                </ul>
                <p><strong>Minor breaking change:</strong></p>
                <ul>
                    <li>The lighting drawing setting <i>Constrained By Walls</i> is no longer a property that is inherited from the parent.</li>
                </ul>`);
        content += templates[current < 7]
            .replace("%HEAD%", "v3.7 (Roof Lighting)")
            .replace("%BODY%", `\
                <ul>
                    <li>
                        The lighting of roof tiles can be configured now. Before this update a roof would appear dark if it covered a dark interior in a daylight scene.
                        Now roofs are illuminated according to the scene's lighting settings by default. This can be changed to any other lighting settings:
                        in the tile configuration under the <i>Overhead</i> tab you find the <i>Roof Lighting</i> setting that allows you to choose any drawing's lighting settings.
                    </li>
                    <li>Should you use <i>Better Roofs'</i> mask mode <i>Cutout Tile on Vision</i> for your roofs, you can safely change the occlusion mode to <i>Roof</i> now even though <i>Better Roofs</i> doesn't support/recommend it.</li>
                    <li>Fixed some tile occlusion alpha issues.</li>
                </ul>`);
        content += templates[current < 6]
            .replace("%HEAD%", "v3.6 (Drawing Configuration Improvements)")
            .replace("%BODY%", `\
                <ul>
                    <li>
                        The lighting configuration of drawings has been improved: unless the <i>Override</i> box is checked, the corresponding UI elements are disabled and set to the inherited values of the parent.
                        This change should make it a lot easier to see what the lighting/vision settings actually are without looking at the settings of the scene/parents.
                    </li>
                    <li>Fixed incorrect <i>Saturation Level</i> inheritance.</li>
                    <li>Fixed various <i>Sight Limit</i> bugs.</li>
                </ul>`);

        content += templates[current < 5]
            .replace("%HEAD%", "v3.5 (Sight Limit Changes)")
            .replace("%BODY%", `\
                <p>Some of these <i>Sight Limit</i> changes are technically minor breaking changes, but in most cases that shouldn't change anything unless you have overlapping sight limited areas in your scene.</p>
                <ul>
                    <li>The <i>Sight Limit</i> of templates no longer overrides limits of underlying areas that are lower than the limit of the template.</li>
                    <li>The <i>Sight Limit</i> behavior of light sources changed:
                        <ul>
                            <li>Dark light sources (<i>Luminosity</i> < 0) limit sight, but don't override limits of underlying areas that are lower than the limit of the light anymore.</li>
                            <li>Normal light sources (<i>Luminosity</i> &#8805; 0) un-limit sight, which means that in the area of such a light source tokens can see at least as far as the limit unless changed by a light with higher <i>Priority</i>.</li>
                        </ul>
                    </li>
                    <li>It is now possible to set the <i>Sight Limit</i> of token light sources as well.</li>
                    <li><i>Sight Limit</i> wasn't working properly with <i>Levels</i>. This has been corrected.</li>
                    <li>Exposed the core light setting <i>Priority</i>, that allows you to change the order (z-index) of light sources; for example, a normal light source that is rendered above a dark light source would remove the darkness; in combination with <i>Sight Limit</i> it would remove the sight restrictions of the dark light source as well (<i>Daylight</i> vs. <i>Darkness</i> spell).</li>
                </ul>`);

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
import { LightingSystem } from "./lighting-system.js";
import { SightSystem } from "./sight-system.js";
import { LimitSystem } from "./limit-system.js";

class PerfectVision {
    static Framebuffer = Framebuffer;
    static MonoFilter = MonoFilter;
    static LightingSystem = LightingSystem;
    static SightSystem = SightSystem;
    static LimitSystem = LimitSystem;

    static get debug() {
        return Framebuffer.debug;
    }

    static set debug(value) {
        Framebuffer.debug = value;
    }
}

PerfectVision.debug = false;

self.PerfectVision = PerfectVision;
