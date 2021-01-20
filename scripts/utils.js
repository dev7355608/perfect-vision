export function grayscale(c, d = null) {
    let [r, g, b] = c;

    if (0.04045 <= r) {
        r = Math.pow((r + 0.055) / 1.055, 2.4);
    } else {
        r /= 12.92;
    }
    if (0.04045 <= g) {
        g = Math.pow((g + 0.055) / 1.055, 2.4);
    } else {
        g /= 12.92;
    }

    if (0.04045 <= b) {
        b = Math.pow((b + 0.055) / 1.055, 2.4);
    } else {
        b /= 12.92;
    }

    let y = 0.2126 * r + 0.7152 * g + 0.0722 * b;

    if (0.0031308 <= y) {
        y = 1.055 * Math.pow(y, 1.0 / 2.4) - 0.055;
    } else {
        y *= 12.92;
    }

    d = d ?? [];
    d[2] = d[1] = d[0] = y;
    return d;
}
