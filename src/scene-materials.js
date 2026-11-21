// Child events also cover groups assembled outside the scene and attached later.
export class SceneMaterials {
  constructor(apply) {
    this.apply = apply;
    this.seen = new WeakSet();
    this.objects = new WeakSet();
    this.added = (event) => this.watch(event.child);
  }
  register(material) {
    if (Array.isArray(material)) {
      for (const item of material) this.register(item);
    } else if (material && !this.seen.has(material)) {
      this.apply(material);
      this.seen.add(material);
    }
  }
  watch(root) {
    root.traverse((object) => {
      if (!this.objects.has(object)) {
        this.objects.add(object);
        object.addEventListener('childadded', this.added);
        owners.set(object, this);
      }
      this.register(object.material);
    });
  }
}
const owners = new WeakMap();
export function setSceneMaterial(object, material) {
  owners.get(object)?.register(material);
  object.material = material;
}
