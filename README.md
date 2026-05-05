# LITANY AGAINST FEAR

A browser artwork that displays the Bene Gesserit litany.

## How It Works

The background is a WebGL2 shader.

The shader is intentionally plain: one giant triangle, no mesh, no
scene. Every visible thing is decided per pixel in the shader.

The fragment shader starts by turning `gl_FragCoord` into a centered UV space, normalized by viewport height. That keeps the storm from stretching strangely when the window changes shape. Before the scene is drawn, the UVs get a small noise-based bend, like the lens or the air itself is being pushed around.

The dust field is built from a few ingredients:

- `hash21` and `hash22` make stable pseudo-random values from grid positions
- `noise` smooths those values into value noise
- `fbm` stacks a few rotated octaves so the fog feels less computer-flat
- `cameraOffset` adds the handheld sway
- `projectedGrains` turns random grid cells into bright grains and streaks,
  then pushes their direction between wind and an outward rush

The shader has two clocks. `uTime` is plain elapsed time. `uMotionTime` is allowed to slow down. As the litany approaches the end, JS raises `uCalm`, and `uMotionTime` advances less and less.
The CSS text can keep finishing its sentence while the storm itself slows to a stop.

The audio is procedural too. [audio.js](./audio.js) uses Web Audio for looped wind noise, sand hiss, a low rumble, tiny filtered noise clicks for grains hitting the lens, and a quiet two-note tone that appears near the end. It follows the same `progress` and `calm` values as the shader, so the sound loses force with the image instead of feeling like a separate track.

The whole sequence runs once. When it has ended, a click
or the spacebar starts it again.
