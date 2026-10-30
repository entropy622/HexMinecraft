import { readFileSync } from 'node:fs';
import { packCloudDetail } from '../../src/cloud-detail-data.js';

export const cloudDetailData = packCloudDetail(
  readFileSync(
    new URL('../../src/assets/photon-worley-bubbly.dat', import.meta.url),
  ),
  readFileSync(
    new URL('../../src/assets/photon-worley-swirley.dat', import.meta.url),
  ),
);
