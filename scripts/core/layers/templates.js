import { Board } from "../board.js";
import { patch } from "../../utils/patch.js";

Hooks.once("init", () => {
    patch("TemplateLayer.layerOptions", "POST", function (options) {
        return mergeObject(options, {
            zIndex: SightLayer.layerOptions.zIndex + 50
        });
    });

    patch("MeasuredTemplate.prototype.draw", "POST", async function (result) {
        await result;

        Board.place(this.document.uuid, !this._original ? this.template : null, "templates");

        return this;
    });

    patch("MeasuredTemplate.prototype.destroy", "PRE", function () {
        Board.unplace(this.document.uuid);

        return arguments;
    });
});
