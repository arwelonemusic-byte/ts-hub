// The flat drawing frame of the board: world units (hex radii, see
// sim/hex.js) to pixels of a canvas, cam = { x, y, scale }: the world point
// at the canvas's top left and pixels per unit. The marks on the 3D ground,
// the counters and the bangs are drawn this way (hexmap.js, world3d.js). The
// camera the player moves is the 3D view's (world3d.js createWorld().camera).

export function toScreen(cam, wx, wy) {
  return { x: (wx - cam.x) * cam.scale, y: (wy - cam.y) * cam.scale };
}
