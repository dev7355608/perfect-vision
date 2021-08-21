export class Lighting {
    static findArea(x, y) {
        let result = canvas.lighting;

        if (canvas.lighting._pv_areas) {
            for (const area of canvas.lighting._pv_areas) {
                if (area.skipRender) {
                    continue;
                }

                if ((!area._pv_los || area._pv_los.contains(x, y)) && area._pv_fov.contains(x, y)) {
                    result = area;
                }
            }
        }

        return result;
    }
}
