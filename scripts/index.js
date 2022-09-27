import "./changelog.js";
import "./config/index.js";
import "./controls.js";
import "./core/index.js";
import "./hud.js";
import "./migration.js";
import "./pixi.js";
import "./settings.js";

import { Console } from "./utils/console.js";
import { Notifications } from "./utils/notifications.js";

Hooks.once("setup", () => {
    if (game.settings.get("core", "noCanvas")) {
        return;
    }

    Hooks.once("canvasInit", () => {
        if (!game.modules.get("lib-wrapper")?.active) {
            Notifications.error(
                `libWrapper is required!`,
                { permanent: true, console: false }
            );
            Console.error("libWrapper is not enabled");
        }

        if (canvas.app.renderer.context.webGLVersion !== 2) {
            Notifications.error(
                `WebGL 2.0 is required!\
                <p>If you're on an iPad or iPhone and your OS is version 14.5 or later, you can enable WebGL 2.0 \
                in Safari by navigating to <i>Settings → Safari → Advanced → Experimental Features</i>. \
                There enable the <i>WebGL 2.0</i> setting.</p>`,
                { permanent: true, console: false }
            );
            Console.error("WebGL 2.0 is not supported or disabled");
        }

        if (typeof WebAssembly !== "object") {
            Notifications.error(
                `WebAssembly is required!\
                <p>If you use Edge, you need to disable <i>Enhanced Security Mode</i>. \
                If you select <i class="fa-solid fa-circle-info"></i> to the left of \
                the address bar, an expanded menu will appear. There turn off \
                the <i>Enhance security for this site</i> setting.`,
                { permanent: true, console: false }
            );
            Console.error("WebAssembly is not supported or disabled");
        }
    });
});
