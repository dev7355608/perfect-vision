[![Latest Version](https://img.shields.io/github/v/release/dev7355608/perfect-vision?display_name=tag&sort=semver&label=Latest%20Version)](https://github.com/dev7355608/perfect-vision/releases/latest)
![Foundry Version](https://img.shields.io/endpoint?url=https://foundryshields.com/version?url=https%3A%2F%2Fraw.githubusercontent.com%2Fdev7355608%2Fperfect-vision%2Fmain%2Fmodule.json)
[![Forge Installs](https://img.shields.io/badge/dynamic/json?label=Forge%20Installs&query=package.installs&suffix=%25&url=https%3A%2F%2Fforge-vtt.com%2Fapi%2Fbazaar%2Fpackage%2Fperfect-vision&colorB=blueviolet)](https://forge-vtt.com/bazaar#package=perfect-vision)
[![License](https://img.shields.io/github/license/dev7355608/perfect-vision?label=License)](LICENSE)

# Perfect Vision (Foundry VTT Module)

Perfect Vision provides additional lighting and vision settings and lets allows you to control lighting and vision locally within the shape of a drawing.
It gives you the ability to control the maximum vision and detection ranges within the area of drawings, lights, templates, and scenes.

Perfect Vision adds/exposes the following lighting and vision settings.
- **Global Illumination**: The global light source is fully configurable with all the usual light options.
- **Animation Resolution**: Controls the scale of the animation of the light source.
- **Daylight/Darkness Color**: The illumination colors at Darkness Level 0 and 1 respectively.
- **Reveal Fog of War**: Reveal the fog of war for all users. This does not override the saved fog exploration progress.
- **Vision Limitation**: Configure the maximum range that tokens can see.
- **Vision Range (In light)**: Controls the maximum distance a token can see in illuminated areas.

A drawing allows you to change the lighting within the shape of the drawing; see *Lighting* tab of the drawing config. With the *Fit To Walls* option you can quickly fit the shape to the underlying wall structure; this is a lot faster than tracing the boundary of the structure with the polygon tool. For polygon drawings I recommend the [Advanced Drawing Tools](https://github.com/dev7355608/advanced-drawing-tools) module, which makes it possible to modify polygons in case you make a mistake or need to change the shape. Each roof/level tile inherits the lighting settings of the drawing linked to it; see the *Lighting* setting in the *Overhead* tab of the tile config. By default roofs/levels use the lighting settings of the scene.

Perfect Vision improves the token visibility test such that tokens close to a wall won't be visible through the wall on the other side it. It also includes multiple performance improvements; most notably fog exploration optimizations, which eliminate lags/freezes almost entirely that occur when the fog exploration is saved.
