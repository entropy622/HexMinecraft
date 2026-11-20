// Import the shipped pack with the actual Bedrock codec, then save an editable project.
import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { unzipSync, strFromU8 } from 'three/addons/libs/fflate.module.js';
const pack = process.argv[2] || 'public/models/pearl-dragon.zip';
const project = process.argv[3] || 'art/models/pearl-dragon.bbmodel';
const files = unzipSync(await readFile(pack));
const read = (path) => JSON.parse(strFromU8(files[path]));
const manifest = read('ysm.json'),
  p = manifest.files.player;
const payload = {
  geo: read(p.model.main),
  anim: read(p.animation.main),
  skin: Buffer.from(files[p.texture[0]]).toString('base64'),
};
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage();
  page.on('requestfailed', (request) => {
    if (request.resourceType() === 'script')
      console.error(request.url(), request.failure()?.errorText);
  });
  page.on('pageerror', (error) => console.error(error.message));
  await page.goto(process.env.BLOCKBENCH_URL || 'https://web.blockbench.net/', {
    waitUntil: 'commit',
    timeout: 60000,
  });
  await page.waitForFunction(() => window.Codecs?.bedrock, null, {
    timeout: 120000,
  });
  const result = await page.evaluate(async ({ geo, anim, skin }) => {
    newProject(Formats.bedrock);
    Codecs.bedrock.parse(geo, 'pearl-dragon.geo.json');
    const texture = new Texture({ name: 'pearl.png' })
      .fromDataURL('data:image/png;base64,' + skin)
      .add(false);
    await texture.img.decode();
    Animator.loadFile({
      path: 'pearl.animation.json',
      name: 'pearl.animation.json',
      content: JSON.stringify(anim),
    });
    Project.name = 'Pearl Dragon';
    const maya = Codecs.project.compile({ raw: true, bitmaps: true });
    const doc = typeof maya === 'string' ? JSON.parse(maya) : maya;
    const native = JSON.parse(Codecs.bedrock.compile())[
      'minecraft:geometry'
    ][0];
    Codecs.project.load(JSON.parse(JSON.stringify(doc)), {
      path: 'Pearl Dragon.bbmodel',
      no_file: true,
    });
    await Texture.all[0].img.decode();
    const reopened = JSON.parse(Codecs.bedrock.compile())[
      'minecraft:geometry'
    ][0];
    if (
      JSON.stringify(reopened.bones) !== JSON.stringify(native.bones) ||
      Animation.all.length !== doc.animations.length ||
      Texture.all[0].img.naturalWidth !==
        geo['minecraft:geometry'][0].description.texture_width
    )
      throw Error(
        'Reopening the editable project changed its rig, animations or atlas.',
      );
    return {
      version: Blockbench.version,
      doc,
      roundtrip: native.bones.reduce((n, b) => n + (b.cubes?.length || 0), 0),
    };
  }, payload);
  const { doc } = result,
    count = payload.geo['minecraft:geometry'][0].bones.reduce(
      (n, b) => n + (b.cubes?.length || 0),
      0,
    );
  if (
    result.roundtrip !== count ||
    doc.elements.length !== count ||
    doc.animations.length !== Object.keys(payload.anim.animations).length ||
    !doc.textures[0].source?.startsWith('data:image/png')
  )
    throw Error(
      'Blockbench round trip lost geometry, animations or embedded skin.',
    );
  await mkdir('art/models', { recursive: true });
  await writeFile(project, JSON.stringify(doc));
  console.log(
    'Blockbench',
    result.version,
    count,
    'cubes',
    doc.animations.length,
    'clips, embedded PNG',
  );
} finally {
  await browser.close();
}
