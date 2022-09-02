[![Latest Version](https://img.shields.io/github/v/release/dev7355608/perfect-vision?display_name=tag&sort=semver&label=Latest%20Version)](https://github.com/dev7355608/perfect-vision/releases/latest)
![Foundry Version](https://img.shields.io/endpoint?url=https://foundryshields.com/version?url=https%3A%2F%2Fraw.githubusercontent.com%2Fdev7355608%2Fperfect-vision%2Fmain%2Fmodule.json)
[![Forge Installs](https://img.shields.io/badge/dynamic/json?label=Forge%20Installs&query=package.installs&suffix=%25&url=https%3A%2F%2Fforge-vtt.com%2Fapi%2Fbazaar%2Fpackage%2Fperfect-vision&colorB=blueviolet)](https://forge-vtt.com/bazaar#package=perfect-vision)
[![License](https://img.shields.io/github/license/dev7355608/perfect-vision?label=License)](LICENSE)

# Perfect Vision (Foundry VTT Module)

Perfect Vision offers additional lighting and vision settings and allows you control lighting and vision locally within the shape of a drawing.
It gives you the ability control the maximum range tokens can see based on vision type and detection mode within the area of drawings, lights, templates, or scenes.

Perfect Vision adds/exposes the following lighting and vision settings.
- **Global Illumination**: The global light source is completely configurable with all the usual light options.
- **Animation Resolution**: Control the scale of the animation of a light source.
- **Daylight/Darkness Color**: The colors of illumination at Darkness Level 0 and 1 respectively.
- **Reveal Fog of War**: Reveal the fog of war for all users. This does not override the saved fog exploration progress.
- **Vision Limitation**: Configure the maximum range that tokens can see based on vision type and detection modes.

A drawing, if enabled, allows you to control lighting and vision within the shape of the drawing. The drawings have a similar behavior as roof tiles: they block lighting below the drawings elevation. With the *Fit To Walls* option you can constrain the area of effect of the drawing to the underlying wall structure, which is a lot faster then using the polygon tool. For polygon drawings I recommend the [Advanced Drawing Tools](https://github.com/dev7355608/advanced-drawing-tools) module, which makes it possible to edit polygons in case you make a mistake or need to change the shape.

Perfect Vision adds the *Lighting* setting in the *Overhead* tab of the tile configuration, which allows you to choose the lighting and vision settings of the area on and above a roof/level tile. By default roofs/levels use the lighting settings of the scene. This setting as no effect if the tile isn't an overhead roof/level tile.

Perfect Vision improves the token visibility test such that tokens close a wall won't be visible on the other side through the wall.
