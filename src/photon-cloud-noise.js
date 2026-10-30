// Unmodified Photon 6e67b36 noise volumes. See public/licenses/PHOTON-NOTICE.md.
import bubblyUrl from './assets/photon-worley-bubbly.dat?url&inline';
import swirleyUrl from './assets/photon-worley-swirley.dat?url&inline';
import { packCloudDetail } from './cloud-detail-data.js';

const bytes = (url) =>
  Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), (c) =>
    c.charCodeAt(0),
  );

// One immutable CPU volume shared by graphics owners; each owner retains its
// own Three texture lifetime. No seed-dependent generation or second fetch.
export const photonCloudDetail = packCloudDetail(
  bytes(bubblyUrl),
  bytes(swirleyUrl),
);
