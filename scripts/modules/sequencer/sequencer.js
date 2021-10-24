import { Board } from "../../core/board.js";
import { patch } from "../../utils/patch.js";

Hooks.once("init", () => {
    if (!game.modules.get("sequencer")?.active) {
        return;
    }

    patch("BackgroundLayer.prototype.addChild", "POST", function (result, ...objects) {
        for (const object of objects) {
            if (object.parentName === "sequencer") {
                Board.place("sequencer.background", object, Board.LAYERS.BACKGROUND + 10, 1);
            }
        }

        return result;
    });

    patch("BackgroundLayer.prototype.tearDown", "WRAPPER", async function (wrapped, ...args) {
        Board.unplace("sequencer.background");

        return await wrapped(...args);
    });

    patch("Token.prototype.addChild", "POST", function (result, ...objects) {
        if (this.id && !this._original) {
            for (const object of objects) {
                if (object.parentName === "sequencer") {
                    if (object.below) {
                        Board.place(`Token#${this.id}.sequencer.below`, object, Board.LAYERS.UNDERFOOT_EFFECTS + 1, Board.Z_INDICES.PARENT);
                    } else {
                        Board.place(`Token#${this.id}.sequencer.above`, object, Board.LAYERS.OVERHEAD_EFFECTS + 1, Board.Z_INDICES.PARENT);
                    }
                }
            }
        }

        return result;
    });

    patch("Token.prototype.destroy", "PRE", function () {
        Board.unplace(`Token#${this.id}.sequencer.below`);
        Board.unplace(`Token#${this.id}.sequencer.above`);

        return arguments;
    });

    patch("Tile.prototype.addChild", "POST", function (result, ...objects) {
        if (this.id && !this._original) {
            for (const object of objects) {
                if (object.parentName === "sequencer") {
                    if (object.below) {
                        Board.place(`Tile#${this.id}.sequencer.below`, object, (this._pv_overhead ? Board.LAYERS.OVERHEAD_TILES : Board.LAYERS.UNDERFOOT_TILES) - 1, Board.Z_INDICES.PARENT);
                    } else {
                        Board.place(`Tile#${this.id}.sequencer.above`, object, (this._pv_overhead ? Board.LAYERS.OVERHEAD_TILES : Board.LAYERS.UNDERFOOT_TILES) + 1, Board.Z_INDICES.PARENT);
                    }
                }
            }
        }

        return result;
    });

    patch("Tile.prototype.refresh", "POST", function () {
        if (this.id && !this._original) {
            for (const object of this.children) {
                if (object.parentName === "sequencer") {
                    if (object.below) {
                        Board.place(`Tile#${this.id}.sequencer.below`, object, (this._pv_overhead ? Board.LAYERS.OVERHEAD_TILES : Board.LAYERS.UNDERFOOT_TILES) - 1, Board.Z_INDICES.PARENT);
                    } else {
                        Board.place(`Tile#${this.id}.sequencer.above`, object, (this._pv_overhead ? Board.LAYERS.OVERHEAD_TILES : Board.LAYERS.UNDERFOOT_TILES) + 1, Board.Z_INDICES.PARENT);
                    }
                }
            }
        }

        return this;
    });

    patch("Tile.prototype.destroy", "PRE", function () {
        Board.unplace(`Tile#${this.id}.sequencer.below`);
        Board.unplace(`Tile#${this.id}.sequencer.above`);

        return arguments;
    });

    patch("MeasuredTemplate.prototype.addChild", "POST", function (result, ...objects) {
        if (this.id && !this._original) {
            for (const object of objects) {
                if (object.parentName === "sequencer") {
                    if (object.below) {
                        Board.place(`MeasuredTemplate#${this.id}.sequencer.below`, object, Board.LAYERS.TEMPLATES - 1, Board.Z_INDICES.PARENT);
                    } else {
                        Board.place(`MeasuredTemplate#${this.id}.sequencer.above`, object, Board.LAYERS.TEMPLATES + 1, Board.Z_INDICES.PARENT);
                    }
                }
            }
        }

        return result;
    });

    patch("MeasuredTemplate.prototype.destroy", "PRE", function () {
        Board.unplace(`MeasuredTemplate#${this.id}.sequencer.below`);
        Board.unplace(`MeasuredTemplate#${this.id}.sequencer.above`);

        return arguments;
    });
});
