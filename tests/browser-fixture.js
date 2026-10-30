import { test as base, expect } from '@playwright/test';

// Pointer lock is a browser/device boundary. Native headless Chrome on Windows
// can confine the user's desktop cursor, so tests emulate only that API.
// The game still receives its normal lock/unlock events and relative input.
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      let locked = null;
      Object.defineProperty(document, 'pointerLockElement', {
        get: () => locked,
      });
      Element.prototype.requestPointerLock = async function () {
        locked = this;
        document.dispatchEvent(new Event('pointerlockchange'));
      };
      document.exitPointerLock = () => {
        if (!locked) return;
        locked = null;
        document.dispatchEvent(new Event('pointerlockchange'));
      };
    });
    await use(page);
  },
});
export { expect };

// Context restoration and completed shader preparation are separate events.
// Scenario checks must wait for both before counting restored render frames.
export async function waitForRecoveredRenderer(page) {
  const ready = await page.evaluate(async () => {
    const g = window.__hexwild.graphics;
    if (g.renderer.getContext().isContextLost())
      await new Promise((resolve) =>
        g.renderer.domElement.addEventListener(
          'webglcontextrestored',
          resolve,
          {
            once: true,
          },
        ),
      );
    return g.recovery;
  });
  expect(ready).toBe(true);
}
