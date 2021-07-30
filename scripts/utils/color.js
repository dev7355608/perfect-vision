export function srgb2rgb(c, d = null) {
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

    if (d) {
        d[0] = r;
        d[1] = g;
        d[2] = b;
    } else {
        d = [r, g, b];
    }

    return d;
}

export function rgb2srgb(c, d = null) {
    let [r, g, b] = c;

    if (0.0031308 <= r) {
        r = 1.055 * Math.pow(r, 1.0 / 2.4) - 0.055;
    } else {
        r *= 12.92;
    }

    if (0.0031308 <= g) {
        g = 1.055 * Math.pow(g, 1.0 / 2.4) - 0.055;
    } else {
        g *= 12.92;
    }

    if (0.0031308 <= b) {
        b = 1.055 * Math.pow(b, 1.0 / 2.4) - 0.055;
    } else {
        b *= 12.92;
    }

    if (d) {
        d[0] = r;
        d[1] = g;
        d[2] = b;
    } else {
        d = [r, g, b];
    }

    return d;
}

export function srgb2gray(c, d = null) {
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

export function rgb2gray(c, d = null) {
    const [r, g, b] = c;
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;

    d = d ?? [];
    d[2] = d[1] = d[0] = y;

    return d;
}
