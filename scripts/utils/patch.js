import { Logger } from "./logger.js";

const wrappers = {};

export function patch(target, type, func) {
    Logger.debug("Patching %s (%s)", target, type);

    let wrapper = wrappers[target];

    if (!wrapper) {
        if (type === "PRE") {
            wrapper = function (wrapped, ...args) {
                return wrapped(...func.apply(this, args));
            };
            wrapper.type = "WRAPPER";
        } else if (type === "POST") {
            wrapper = function (wrapped, ...args) {
                return func.call(this, wrapped(...args), ...args);
            };
            wrapper.type = "WRAPPER";
        } else if (type === "WRAPPER" || type === "MIXED") {
            wrapper = function (wrapped, ...args) {
                return func.call(this, wrapped, ...args);
            };
            wrapper.type = type;
        } else if (type === "OVERRIDE") {
            wrapper = func;
            wrapper.type = "OVERRIDE";
        }
    } else {
        libWrapper.unregister("perfect-vision", target);

        const wrap = wrapper;

        if (wrapper.type !== "OVERRIDE") {
            if (type === "PRE") {
                wrapper = function (wrapped, ...args) {
                    return wrap.call(this, wrapped, ...func.apply(this, args));
                };
                wrapper.type = "WRAPPER";
            } else if (type === "POST") {
                wrapper = function (wrapped, ...args) {
                    return func.call(this, wrap.call(this, wrapped, ...args), ...args);
                };
                wrapper.type = "WRAPPER";
            } else if (type === "WRAPPER" || type === "MIXED") {
                wrapper = function (wrapped, ...args) {
                    return func.call(this, (...args) => wrap.call(this, wrapped, ...args), ...args);
                };
                wrapper.type = type;
            } else if (type === "OVERRIDE") {
                wrapper = function (...args) {
                    return wrap.call(this, func.bind(this), ...args);
                };
                wrapper.type = "OVERRIDE";
            }
        } else {
            console.assert(type !== "OVERRIDE", "OVERRIDE cannot be registered more than once!");

            if (type === "PRE") {
                wrapper = function (...args) {
                    return wrap.apply(this, func.apply(this, args));
                };
            } else if (type === "POST") {
                wrapper = function (...args) {
                    return func.call(this, wrap.apply(this, args), ...args);
                };
            } else if (type === "WRAPPER" || type === "MIXED") {
                wrapper = function (...args) {
                    return func.call(this, wrap.bind(this), ...args);
                };
            }

            wrapper.type = "OVERRIDE";
        }
    }

    wrappers[target] = wrapper;

    libWrapper.register("perfect-vision", target, wrapper, wrapper.type);
}
