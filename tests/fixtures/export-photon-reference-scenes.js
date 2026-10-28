import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  referenceScenes,
  referenceSave,
  referenceSettings,
} from './photon-reference-scenes.js';

const directory = resolve(
  process.argv[2] || 'test-results/photon-reference-inputs',
);
await mkdir(directory, { recursive: true });
for (const scene of referenceScenes)
  await writeFile(
    resolve(directory, `${scene.id}.json`),
    JSON.stringify(referenceSave(scene), null, 2) + '\n',
  );
await writeFile(
  resolve(directory, 'settings.json'),
  JSON.stringify(referenceSettings, null, 2) + '\n',
);
console.log(`Eight native saves and fixed display settings: ${directory}`);
