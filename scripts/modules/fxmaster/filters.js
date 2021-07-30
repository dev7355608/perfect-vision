import { Board } from "../../core/board.js";
import { Logger } from "../../utils/logger.js";
import { patch } from "../../utils/patch.js";

Hooks.once("setup", () => {
    if (!game.modules.get("fxmaster")?.active) {
        return;
    }

    let filters = [];

    function updateFilters(manager) {
        canvas.background.filters = null;
        canvas.drawings.filters = null;
        canvas.tokens.filters = null;
        canvas.foreground.filters = null;

        if (manager.apply_to.background || manager.apply_to.foreground || manager.apply_to.tokens) {
            if (!manager.apply_to.background || !manager.apply_to.foreground || !manager.apply_to.tokens) {
                Logger.warn("FXMaster filters cannot be applied to the background, foreground, and tokens layer separately (WIP)");
            }

            manager.apply_to.background = true;
            manager.apply_to.foreground = true;
            manager.apply_to.tokens = true;
        }

        if (manager.apply_to.drawings) {
            Logger.warn("FXMaster filters cannot be applied to the drawings layer (WIP)");
        }

        manager.apply_to.drawings = false;

        if (Board.stage.filters?.length !== 0) {
            for (const filter of filters) {
                const index = Board.stage.filters.indexOf(filter);

                if (index >= 0) {
                    Board.stage.filters.splice(index, 1);
                }
            }
        }

        if (manager.apply_to.background) {
            filters = [...Object.values(manager.filters)];

            for (const filter of filters) {
                filter.resolution = canvas.app.renderer.resolution;
                filter.multisample = canvas.app.renderer.multisample;
            }

            Board.stage.filters.push(...filters);
        } else {
            filters = [];
        }
    }

    patch("FXMASTER.filters.activate", "POST", function () {
        updateFilters(this);
    });

    patch("FXMASTER.filters.update", "POST", async function (result) {
        await result;

        updateFilters(this);
    });
});
