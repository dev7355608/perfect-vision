# Perfect Vision (Foundry VTT Module)

Darkvision rules for Dungeons & Dragons 5e, Pathfinder 2e, and other systems. The vision rules are also fully customizable!

Also included are other light-related improvements. For example, dim/bright vision doesn't ruin animated lights anymore by making the darker areas of the light brighter. Now an animated light looks the same whether or not the token has dim/bright vision.

## Features

### Global Illumination Light

A scene with *Global Illumination* is rendered by default in dim light entirely, more precisely each token is given infinite dim vision. This setting gives you three choices: *None*, *Dim Light*, and *Bright Light*. If set to *Dim (Bright) Light*, the entire scene is illuminated with *dim (bright) light* and, if set to *None*, the scene is illuminated according to the scene's *Darkness Level* only. You can set it in the module settings for all scenes as well as for each scene individually. You can find the scene-specific setting next to the *Global Illumination* setting in the scene configuration.

### Improved GM Vision

If the *Darkness Level* of the scene is very high, it can be very difficult for the GM to see in unilluminated areas of the map. If this setting enabled, the visibility in darkness is improved massively for the GM while the lit areas of the scene are still rendered normally.

### Vision Rules

There are the following presets to choose from: *Dungeons & Dragons 5e*, *Dungeons & Dragons 3.5e*, *Pathfinder 2e*, and *Foundry VTT*. You may also select *Custom* and set your own rules. It is also possible to set rules for each token individually. You can find these token-specific settings in the token configuration under the *Vision* tab.

#### Custom

*Dim (Bright) Vision in Darkness* controls what dim (bright) vision looks like in darkness, i.e., in areas that are not illuminated by light sources. *Dim (Bright) Vision in Dim Light* controls how dim (bright) vision interacts with dim light, i.e., if dim light becomes bright light or not.

*Scene Darkness* is the level of darkness in areas without light sources. It's the darkness controlled by *Darkness Level* in the scene configuration. *Total Darkness* means no vision.

Select an option with *monochrome* to create vision without color in darkness. It's grayscale vision as long as the *Monochrome Vision Color* is white.

#### Foundry VTT

Foundry's default dim and bright vision.

#### Dungeons & Dragons 3.5e

Bright vision is *darkvision*.

#### Dungeons & Dragons 5e

Dim vision is *darkvision*, and bright vision is Foundry's default.

#### Pathfinder 2e

Dim vision is *low-light vision*, and bright vision is *darkvision*.

### Monochrome Vision Color

Set this color to anything other than white to make monochrome vision stand out visibly in darkness. For example, choose a green tone to make it look like night vision goggles. This setting affects only scenes without *Global Illumination*. You can also choose a color for each token individually in the token configuration under the *Vision* tab.

### Monochrome Token Icons

If enabled, token icons are affected by monochrome vision. Otherwise, they are not.

### Monochrome Special Effects

If enabled, FXMaster's and Token Magic FX's special effects are affected by monochrome vision. Otherwise, they are not.