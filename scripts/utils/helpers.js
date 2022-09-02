/**
 * Test whether the value is a plain object.
 * @param {*} value - The value to be tested.
 * @returns {boolean} True if and only if `value` is a plain object.
 */
export function isPlainObject(value) {
    if (value === null || typeof value !== "object") {
        return false;
    }

    const prototype = Object.getPrototypeOf(value);

    return prototype === null || prototype === Object.prototype;
}

/**
 * Test whether the value is a typed array.
 * @param {*} value - The value to be tested.
 * @returns {boolean} True if and only if the value is a typed array.
 */
export function isTypedArray(value) {
    return ArrayBuffer.isView(value) && !(value instanceof DataView);
}

/**
 * Get the primitive value if it exists, otherwise return the object.
 * @param {*} value
 * @returns {*}
 */
export function unwrapValue(value) {
    return value === null || typeof value !== "object" ? value : value.valueOf();
}

/**
 * Test equality of the two values.
 * @param {*} value1 - The first value.
 * @param {*} value2 - The second value.
 * @returns {boolean} True if and only if the values are equal.
 */
export function sameValue(value1, value2) {
    value1 = unwrapValue(value1);
    value2 = unwrapValue(value2);

    if (Object.is(value1, value2)) {
        return true;
    }

    let type1 = 0;
    let type2 = 0;

    if (isPlainObject(value1)) {
        type1 = 1;
    } else if (Array.isArray(value1) || isTypedArray(value1)) {
        type1 = 2;
    }

    if (isPlainObject(value2)) {
        type2 = 1;
    } else if (Array.isArray(value2) || isTypedArray(value2)) {
        type2 = 2;
    }

    if (type1 !== type2) {
        return false;
    }

    if (type1 === 1) {
        for (const key in value1) {
            if (!(key in value2)) {
                return false;
            }
        }

        for (const key in value2) {
            if (!(key in value1)) {
                return false;
            }
        }

        for (const key in value1) {
            if (!sameValue(value1[key], value2[key])) {
                return false;
            }
        }

        return true;
    }

    if (type1 === 2) {
        const length = value1.length;

        if (length !== value2.length) {
            return false;
        }

        for (let i = 0; i < length; i++) {
            if (!sameValue(value1[i], value2[i])) {
                return false;
            }
        }

        return true;
    }

    return false;
}

/**
 * Clone the value.
 * @param {*} value - The value.
 * @param {boolean} [deep=true] - Clone deep?
 * @returns {*} The cloned value.
 */
export function cloneValue(value, deep = true) {
    if (isPlainObject(value)) {
        const clonedValue = {};

        if (deep) {
            for (const key in value) {
                clonedValue[key] = cloneValue(value[key]);
            }
        } else {
            for (const key in value) {
                clonedValue[key] = value[key];
            }
        }

        return clonedValue;
    }

    if (Array.isArray(value) || isTypedArray(value)) {
        return deep ? Array.from(value, cloneValue) : Array.from(value);
    }

    return unwrapValue(value);
}

/**
 * Clone the data.
 * @param {object} data - The data.
 * @returns {object} The cloned data.
 */
export function cloneData(data) {
    return cloneValue(data, true);
}

/**
 * Override properties in `data` with properties in `overrideData`.
 * @param {object} data - The data.
 * @param {object} overrideData - The override data.
 * @returns {boolean} True if and only if `data` was changed.
 */
export function overrideData(data, overrideData) {
    let changed = false;

    for (const key in overrideData) {
        const overrideValue = overrideData[key];

        if (overrideValue === undefined) {
            continue;
        }

        if (isPlainObject(overrideValue)) {
            const value = data[key];

            if (isPlainObject(value)) {
                overrideData(value, overrideValue);
            } else {
                data[key] = cloneData(overrideValue);
                changed = true;
            }
        } else {
            data[key] = unwrapValue(overrideValue);
            changed = true;
        }
    }

    return changed;
}

/**
 * Inherit properties of `prototypeData` if the entry in `data` is `undefined` or doesn't exist.
 * @param {object} data - The data.
 * @param {object} prototypeData - The data of the prototype.
 * @returns {boolean} True if and only if `data` was changed.
 */
export function inheritData(data, prototypeData) {
    let changed = false;

    for (const key in prototypeData) {
        const prototypeValue = prototypeData[key];

        if (prototypeValue === undefined) {
            continue;
        }

        const value = data[key];

        if (value === undefined) {
            data[key] = unwrapValue(prototypeValue);
            changed = true;
        } else if (isPlainObject(value) && isPlainObject(prototypeValue)) {
            inheritData(value, prototypeValue);
        }
    }

    return changed;
}

/**
 * Apply the changes (`changeData`) to `data`.
 * @param {object} data - The data.
 * @param {object} changeData - The changes to be applied.
 * @param {object} [diffData] - Output the diff of the update to this object.
 * @param {boolean} [update=true] - Should `data` be updated?
 * @returns {boolean} True if and only if the diff is nonempty.
 */
export function updateData(data, changeData, diffData = null, update = true) {
    let changed = false;

    for (const key in changeData) {
        const value = data[key];
        const changeValue = changeData[key];

        if (isPlainObject(value) && isPlainObject(changeValue)) {
            const diffEmpty = diffData !== null && !(key in diffData);

            if (diffEmpty) {
                diffData[key] = {};
            }

            if (updateData(update ? value : {}, changeValue, diffData?.[key], update)) {
                changed = true;
            } else if (diffEmpty) {
                delete diffData[key];
            }
        } else {
            if (!sameValue(value, changeValue)) {
                if (update) {
                    data[key] = cloneData(changeValue);
                }

                if (diffData !== null) {
                    diffData[key] = data[key];
                }

                changed = true;
            }
        }
    }

    return changed;
}

/**
 * Compute the diff of `data` and `changeData`.
 * @param {object} data - The data.
 * @param {object} changeData - The changes to be applied.
 * @param {object} [diffData] - Output the diff of the update to this object.
 * @returns {boolean} True if and only if the diff is nonempty.
 */
export function diffData(data, changeData, diffData = null) {
    return updateData(data, changeData, diffData, false);
}

/**
 * Check if any of the keys is affected by the changes.
 * @param {object} changes - The changes.
 * @param  {...string} keys - The keys to test.
 * @returns {boolean} True if and only if at least one of the keys has been changed.
 */
export function hasChanged(changes, ...keys) {
    outer: for (const key of keys) {
        if (!key) {
            continue;
        }

        for (const part of key.split(".")) {
            changes = changes || {};

            if (part in changes) {
                changes = changes[part];
            } else if (`-=${part}` in changes) {
                return true;
            } else {
                continue outer;
            }
        }

        return true;
    }

    return false;
}

/**
 * Parse the color string.
 * @param {?string} string - The color string.
 * @param {?(Color|string|number|number[])} [fallback] - The fallback color.
 * @returns {Color} The parsed color or `null` if parsing failed and no fallback color was given.
 */
export function parseColor(string, fallback) {
    let color;

    if (typeof string === "string" && /^#[0-9A-F]{6,6}$/i.test(string)) {
        color = foundry.utils.Color.fromString(string);
    } else if (fallback != null && fallback !== "") {
        color = foundry.utils.Color.from(fallback);
    } else {
        color = null;
    }

    return color;
}
