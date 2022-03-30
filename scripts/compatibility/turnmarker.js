import { patch } from "../utils/patch.js";

Hooks.once("init", () => {
    if (!game.modules.get("turnmarker")?.active) {
        return;
    }

    // TODO

    patch("Tile.prototype.refresh", "WRAPPER", function (wrapped, ...args) {
        wrapped(...args);

        this._pv_turnmarker?.removeChildren().forEach(c => c.destroy());

        if (this.data.flags?.turnMarker || this.data.flags?.startMarker || this.data.flags?.deckMarker) {
            if (!this._pv_turnmarker) {
                this._pv_turnmarker = new TurnmarkerHUD(this);
            } else {
                this._pv_turnmarker.removeChildren().forEach(c => c.destroy());
            }

            let markers;

            if (this.data.flags.turnMarker) {
                markers = canvas._pv_highlights_underfoot.markers.turn;
            } else if (this.data.flags.startMarker) {
                markers = canvas._pv_highlights_underfoot.markers.start;
            } else {
                markers = canvas._pv_highlights_underfoot.markers.next;
            }

            markers.addChild(this._pv_turnmarker);

            const sprite = this._pv_turnmarker.addChild(this._pv_createSprite());

            sprite.position.x -= this.data.x;
            sprite.position.y -= this.data.y;

            if (this.tile) {
                this.tile.renderable = false;
            }
        } else {
            if (this._pv_turnmarker && !this._pv_turnmarker.destroyed) {
                this._pv_turnmarker.destroy({ children: true });
            }

            this._pv_turnmarker = null;

            if (this.tile) {
                this.tile.renderable = true;
            }
        }

        return this;
    });

    patch("Tile.prototype.destroy", "WRAPPER", function (wrapped, options) {
        if (this._pv_turnmarker && !this._pv_turnmarker.destroyed) {
            this._pv_turnmarker.destroy({ children: true });
        }

        this._pv_turnmarker = null;

        if (this.tile) {
            this.tile.renderable = true;
        }

        wrapped(options);
    });
});

class TurnmarkerHUD extends ObjectHUD {
    updateTransform() {
        if (this.object.tile) {
            this.children.forEach(c => c.rotation = this.object.tile.rotation);
        }

        super.updateTransform();
    }
}
