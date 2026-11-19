import { SAVE_KEY, LEGACY_SAVE_KEY, validateSave } from './save.js';
const pointer = 'hexwild-selected-world',
  prefix = 'hexwild-world:';
export class WorldLibrary {
  constructor(storage) {
    this.storage = storage;
    const last = storage.getItem(pointer);
    this.key = last?.startsWith(prefix) ? last : SAVE_KEY;
  }
  raw(key = this.key) {
    return (
      this.storage.getItem(key) ??
      (key === SAVE_KEY ? this.storage.getItem(LEGACY_SAVE_KEY) : null)
    );
  }
  read(key = this.key) {
    const raw = this.raw(key);
    return raw ? validateSave(JSON.parse(raw)) : null;
  }
  entries() {
    const keys = [SAVE_KEY];
    for (let i = 0; i < this.storage.length; i++) {
      const k = this.storage.key(i);
      if (k.startsWith(prefix)) keys.push(k);
    }
    return keys.flatMap((key) => {
      try {
        const s = this.read(key);
        return s
          ? [
              {
                key,
                seed: s.seed,
                creative: s.creative,
                days: Math.floor(s.time / 600) + 1,
              },
            ]
          : [];
      } catch (error) {
        return [{ key, error: error.message }];
      }
    });
  }
  fresh() {
    this.key =
      this.storage.getItem(SAVE_KEY) || this.storage.getItem(LEGACY_SAVE_KEY)
        ? prefix + crypto.randomUUID()
        : SAVE_KEY;
  }
  write(save) {
    this.storage.setItem(this.key, JSON.stringify(save));
    this.storage.setItem(pointer, this.key);
  }
}
export const worldMenu = `<section class="overlay hidden" id="worlds-overlay"><div class="panel world-menu"><div class="panel-head"><h2>选择世界</h2><button id="worlds-back" aria-label="回到标题">×</button></div><div id="world-list"></div><details id="world-create"><summary>创建新世界</summary><div class="world-form"><label for="seed">世界种子</label><input id="seed" type="number" min="0" max="999999" value="624"><label for="world-mode">模式</label><select id="world-mode"><option value="survival">生存</option><option value="creative">创造</option></select><button id="new-world">进入新世界</button></div></details><div class="library-actions"><button id="import">导入世界</button><button id="export">导出选中世界</button></div><input class="hidden" type="file" id="save-file" accept=".json,application/json"></div></section>`;
