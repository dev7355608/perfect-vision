import { patch } from "../utils/patch.js";

Hooks.once("init", () => {
    if (!game.modules.get("Next-Up")?.active) {
        return;
    }

    patch("Token.prototype.addChild", "WRAPPER", function (wrapped, ...objects) {
        const object = objects[0];

        if (object) {
            setTimeout(() => {
                if (object.NUMaker && object.parent === this) {
                    if (!this._pv_numarker) {
                        this._pv_numarker = new ObjectHUD(this);
                    } else {
                        this._pv_numarker.removeChildren();
                    }

                    let markers;

                    if (game.settings.get("Next-Up", "iconLevel")) {
                        markers = canvas._pv_highlights_overhead.markers.turn;
                    } else {
                        markers = canvas._pv_highlights_underfoot.markers.turn;
                    }

                    markers.addChild(this._pv_numarker);

                    const sprite = new PIXI.Sprite(object.texture);

                    sprite.transform = new SynchronizedTransform(object.transform);
                    sprite.anchor = object.anchor;

                    Object.defineProperty(sprite, "visible", {
                        get() {
                            return object.visible;
                        },
                        set(value) {
                            object.visible = value;
                        }
                    });

                    this._pv_numarker.addChild(sprite);

                    object.renderable = false;

                    const destroy = object.destroy;

                    object.destroy = function (options) {
                        sprite.destroy(options);

                        return destroy.call(this, options);
                    };
                }
            }, 0);
        }

        return wrapped(...objects);
    });

    patch("Token.prototype.destroy", "WRAPPER", function (wrapped, options) {
        if (this._pv_numarker && !this._pv_numarker.destroyed) {
            this._pv_numarker.destroy();
        }

        this._pv_numarker = null;

        wrapped(options);
    });

    patch("BackgroundLayer.prototype.addChild", "WRAPPER", function (wrapped, ...objects) {
        const object = objects[0];

        if (object) {
            setTimeout(() => {
                if (object.isShadow && object.parent === this) {
                    if (!this._pv_nushadows) {
                        this._pv_nushadows = canvas._pv_highlights_underfoot.markers.start.addChild(new ObjectHUD(this));
                    }

                    const sprite = new PIXI.Sprite(object.texture);

                    sprite.transform = new SynchronizedTransform(object.transform);
                    sprite.anchor = object.anchor;
                    sprite.alpha = object.alpha;
                    sprite.width = object.width;
                    sprite.height = object.height;
                    sprite.tint = object.tint;

                    Object.defineProperty(sprite, "visible", {
                        get() {
                            return object.visible;
                        },
                        set(value) {
                            object.visible = value;
                        }
                    });

                    this._pv_nushadows.addChild(sprite);

                    object.renderable = false;

                    const destroy = object.destroy;

                    object.destroy = function (options) {
                        sprite.destroy(options);

                        return destroy.call(this, options);
                    };
                }
            }, 0);
        }

        return wrapped(...objects);
    });

    patch("BackgroundLayer.prototype.tearDown", "WRAPPER", async function (wrapped, ...args) {
        if (this._pv_nushadows && !this._pv_nushadows.destroyed) {
            this._pv_nushadows.destroy();
        }

        this._pv_nushadows = null;

        return await wrapped(...args);
    });
});
