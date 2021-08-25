import { AlphaObject } from "../../../display/alpha.js";
import { WeakPool } from "../../../utils/cache.js";

class AlphaObjectPool extends WeakPool {
    constructor() {
        super({
            create(object, options) {
                const alpha = AlphaObject.from(object, options);

                if (object.parent) {
                    alpha.position.x += object.parent.x;
                    alpha.position.y += object.parent.y;
                }

                return alpha;
            },
            update(alpha, object, options) {
                alpha.configure(object, options);

                if (object.parent) {
                    alpha.position.x += object.parent.x;
                    alpha.position.y += object.parent.y;
                }
            },
            destroy(alpha) {
                alpha.destroy(true)
            }
        });
    }
}

export class CachedAlphaObject {
    static pool = new AlphaObjectPool();

    static create(object, options) {
        return this.pool.create(object, options);
    }
}
