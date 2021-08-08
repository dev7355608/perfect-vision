import { Board } from "../../core/board.js";
import { Logger } from "../../utils/logger.js";
import { patch } from "../../utils/patch.js";

Hooks.once("setup", () => {
    if (!game.modules.get("fxmaster")?.active) {
        return;
    }

    let filters = [];

    function updateFilters(manager) {
        canvas.background.filters = [];
        canvas.drawings.filters = [];
        canvas.tokens.filters = [];
        canvas.foreground.filters = [];

        if (manager.apply_to.background || manager.apply_to.foreground || manager.apply_to.tokens || manager.apply_to.drawings) {
            if (!manager.apply_to.background || !manager.apply_to.foreground || !manager.apply_to.tokens || !manager.apply_to.drawings) {
                Logger.warn("FXMaster filters cannot be applied to the layers separately");
            }

            manager.apply_to.background = true;
            manager.apply_to.foreground = true;
            manager.apply_to.tokens = true;
            manager.apply_to.drawings = true;
        }

        for (const segment of Object.values(Board.segments)) {
            for (const filter of filters) {
                const index = segment.filters.indexOf(filter);

                if (index >= 0) {
                    segment.filters.splice(index, 1);
                }
            }
        }

        filters = [];

        if (manager.apply_to.background) {
            for (const [key, filter] of Object.entries(manager.filters)) {
                filters.push(filter);

                if (key === "core_underwater") {
                    const segment = Board.stage;

                    segment.filters.push(filter);
                } else if (key === "core_predator" || key === "core_oldfilm") {
                    const segment = Board.getSegment(Board.SEGMENTS.LIGHTING);

                    segment.filters.push(filter);

                    if (manager.apply_to.drawings) {
                        Logger.warn("Perfect Vision does not apply FXMaster's %s filter to the drawings layer", key);
                    }
                } else {
                    const segment = Board.getSegment(Board.SEGMENTS.LIGHTING);

                    segment.filters.unshift(filter);

                    if (manager.apply_to.drawings) {
                        Logger.warn("Perfect Vision does not apply FXMaster's %s filter to the drawings layer", key);
                    }
                }
            }
        }

        for (const filter of filters) {
            filter.resolution = canvas.app.renderer.resolution;
            filter.multisample = PIXI.MSAA_QUALITY.NONE;
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
