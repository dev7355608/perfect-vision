import { Board } from "../board.js";
import { patch } from "../../utils/patch.js";

Hooks.once("init", () => {
    patch("TemplateLayer.layerOptions", "POST", function (options) {
        return foundry.utils.mergeObject(options, {
            zIndex: SightLayer.layerOptions.zIndex + 50
        });
    });

    patch("MeasuredTemplate.prototype.draw", "POST", async function (result) {
        await result;

        if (this.id && !this._original && this.parent !== canvas.templates.preview) {
            Board.place(`MeasuredTemplate#${this.id}.template`, this.template, Board.LAYERS.TEMPLATES, Board.Z_INDICES.PARENT);
        }

        return this;
    });

    patch("MeasuredTemplate.prototype.destroy", "PRE", function () {
        Board.unplace(`MeasuredTemplate#${this.id}.template`);

        return arguments;
    });
});
