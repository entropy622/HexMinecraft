// Independent scalar reading of Photon 6e67b36 final.fsh, after its display
// conversion. No production CAS import. Edges repeat and zero channels are 0.
export function oracleCas(image, width, height, x, y, intensity) {
  const taps = [];
  for (let j = -1; j <= 1; j++)
    for (let i = -1; i <= 1; i++)
      taps.push(
        image[
          Math.max(0, Math.min(height - 1, y + j)) * width +
            Math.max(0, Math.min(width - 1, x + i))
        ],
      );
  return [0, 1, 2].map((channel) => {
    const all = taps.map((c) => c[channel]),
      cross = [all[1], all[3], all[4], all[5], all[7]];
    const lower = Math.min(...cross) + Math.min(...all),
      upper = Math.max(...cross) + Math.max(...all);
    const proximity =
      upper === 0
        ? 0
        : Math.max(0, Math.min(1, Math.min(lower, 2 - upper) / upper));
    const shaped = 2 * proximity - proximity * proximity;
    const weight = -shaped / (11 - 6 * intensity);
    const numerator = all[4] + weight * (all[1] + all[3] + all[5] + all[7]);
    return Math.max(0, Math.min(1, numerator)) / (1 + 4 * weight);
  });
}
