import { Vector3, DataUtils } from 'three';
import { axialToWorld } from '../../src/core.js';

export function architectureProbe(g) {
  const f = g.distantTerrain,
    r = g.renderer;
  f.captureKey = null;
  f.render(r, g.camera);
  const p = axialToWorld(-80, 79),
    ndc = new Vector3(p.x, 60.5, p.z).project(g.camera),
    x = Math.floor((ndc.x * 0.5 + 0.5) * f.target.width),
    y = Math.floor((ndc.y * 0.5 + 0.5) * f.target.height),
    pixel = new Uint16Array(4);
  if (x < 0 || y < 0 || x >= f.target.width || y >= f.target.height)
    throw Error('Glass sample outside viewport');
  r.readRenderTargetPixels(f.target, x, y, 1, 1, pixel);
  return {
    glass: Array.from(pixel, DataUtils.fromHalfFloat),
    point: [x, y],
    size: [f.target.width, f.target.height],
    gl: r.getContext().getError(),
    vertices: [...f.tiles.values()].reduce(
      (n, e) => n + e.mesh.geometry.attributes.position.count,
      0,
    ),
    geometryBytes: [...f.tiles.values()].reduce(
      (n, e) =>
        n +
        Object.values(e.mesh.geometry.attributes).reduce(
          (s, a) => s + a.array.byteLength,
          0,
        ) +
        e.mesh.geometry.index.array.byteLength,
      0,
    ),
    dataBytes: [...f.tiles.values()].reduce(
      (n, e) =>
        n +
        Object.values(e.tile)
          .filter(ArrayBuffer.isView)
          .reduce((s, a) => s + a.byteLength, 0),
      0,
    ),
    fineCells: [...f.tiles.values()].reduce(
      (n, e) => n + e.tile.fineDetails.length / 2,
      0,
    ),
  };
}
