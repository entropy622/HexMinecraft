import { copyStack, stackSize } from './inventory.js';
import { takeSlot } from './container-actions.js';
import {
  cursorMarkup,
  stackContent,
  stackTitle,
  paletteStack,
  containerPreview,
} from './inventory-ui.js';

// DOM gestures are separate from stack transactions. Rendering can replace any
// panel while a drag is active; references always resolve against current state.
export class InventoryControls {
  constructor(session, options) {
    this.session = session;
    this.options = options;
    this.hover = null;
    this.gesture = null;
    this.lastClick = null;
    this.position = { x: 0, y: 0 };
    this.cursor = document.createElement('div');
    this.cursor.id = 'inventory-cursor';
    this.cursor.setAttribute('aria-hidden', 'true');
    this.tooltip = document.createElement('div');
    this.tooltip.id = 'inventory-tooltip';
    this.tooltip.setAttribute('role', 'tooltip');
    this.status = document.createElement('div');
    this.status.className = 'sr-only';
    this.status.setAttribute('aria-live', 'polite');
    document.body.append(this.cursor, this.tooltip, this.status);
    document.addEventListener('pointerdown', (e) => this.down(e), true);
    document.addEventListener('pointermove', (e) => this.move(e));
    document.addEventListener('pointerup', (e) => this.up(e));
    document.addEventListener('pointercancel', () => this.cancel());
    window.addEventListener('blur', () => this.cancel());
    document.addEventListener('contextmenu', (e) => {
      if (
        this.active() &&
        (e.target.closest('[data-inv-slot], [data-creative-item]') ||
          this.session.cursor)
      )
        e.preventDefault();
    });
    document.addEventListener('keydown', (e) => this.key(e), true);
    document.addEventListener('click', (e) => {
      if (!this.active() || e.detail !== 0) return;
      const ref = e.target.closest('[data-inv-slot]')?.dataset.invSlot;
      if (!ref) return;
      e.preventDefault();
      if (e.shiftKey) this.options.quickMove(ref);
      else this.session.click(ref, this.touchMode === 'single');
      this.changed();
    });
    document.addEventListener('focusin', (e) => {
      if (this.active() && e.target.matches('[data-inv-slot]'))
        this.hover = e.target.dataset.invSlot;
    });
    document.addEventListener('input', (e) => {
      if (e.target.id !== 'creative-search') return;
      const query = e.target.value.trim().toLowerCase();
      document.querySelectorAll('[data-creative-item]').forEach((b) => {
        b.hidden = !b.dataset.search.includes(query);
      });
    });
    this.touchMode = 'normal';
  }
  active() {
    return this.options.active();
  }
  refAt(x, y) {
    return document.elementFromPoint(x, y)?.closest('[data-inv-slot]')?.dataset
      .invSlot;
  }
  remember(e) {
    this.position = { x: e.clientX, y: e.clientY };
    this.cursor.style.left = e.clientX + 'px';
    this.cursor.style.top = e.clientY + 'px';
  }
  down(e) {
    if (!this.active() || ![0, 1, 2].includes(e.button)) return;
    const touchMode = e.target.closest('[data-inventory-mode]');
    if (touchMode) {
      this.touchMode = touchMode.dataset.inventoryMode;
      document
        .querySelectorAll('[data-inventory-mode]')
        .forEach((b) =>
          b.setAttribute('aria-pressed', String(b === touchMode)),
        );
      return;
    }
    const palette = e.target.closest('[data-creative-item]');
    if (palette) {
      e.preventDefault();
      if (
        this.session.cursor &&
        this.session.cursor.item !== palette.dataset.creativeItem
      )
        this.options.settle();
      this.session.cursor = paletteStack(palette.dataset.creativeItem);
      this.session.origin = null;
      this.remember(e);
      this.changed();
      return;
    }
    const button = e.target.closest('[data-inv-slot]');
    if (!button) {
      if (this.session.cursor && e.target.matches('.overlay')) {
        e.preventDefault();
        this.dropCursor(e.button === 2 ? 1 : Infinity);
      }
      return;
    }
    e.preventDefault();
    this.remember(e);
    this.gesture = null;
    this.clearPreview();
    const ref = button.dataset.invSlot,
      slot = this.session.resolve(ref);
    this.hover = ref;
    const old = slot?.get();
    if (e.button === 1) {
      if (this.options.creative() && old) {
        this.options.settle();
        this.session.cursor = copyStack(old, stackSize(old.item));
        this.changed();
      }
      return;
    }
    if (
      e.shiftKey ||
      (e.pointerType === 'touch' && this.touchMode === 'quick')
    ) {
      const now = performance.now();
      if (
        e.button === 0 &&
        this.lastClick?.quick &&
        this.lastClick.ref === ref &&
        now - this.lastClick.time < 250
      ) {
        this.options.quickMoveAll(ref, this.lastClick.stack);
        this.lastClick = null;
      } else {
        this.lastClick = { ref, time: now, quick: true, stack: copyStack(old) };
        this.options.quickMove(ref);
      }
      this.changed();
      return;
    }
    const right =
      e.button === 2 ||
      (e.pointerType === 'touch' && this.touchMode === 'single');
    const now = performance.now();
    if (
      !right &&
      !this.lastClick?.quick &&
      this.lastClick?.button === 0 &&
      this.lastClick?.ref === ref &&
      now - this.lastClick.time < 250 &&
      this.session.cursor?.item === this.lastClick.item
    ) {
      this.session.gather(this.options.visible());
      this.lastClick = null;
      this.changed();
      return;
    }
    this.lastClick = {
      ref,
      time: now,
      button: e.button,
      item: this.session.cursor?.item || old?.item,
    };
    if (!this.session.cursor) {
      if (this.session.click(ref, right)) this.changed();
    } else {
      this.gesture = {
        ref,
        right,
        x: e.clientX,
        y: e.clientY,
        id: e.pointerId,
        button: e.button,
        refs: this.session.canDistribute(ref) ? [ref] : [],
        moved: false,
        crossed: false,
      };
    }
  }
  move(e) {
    if (!this.active()) return;
    this.remember(e);
    const ref = this.refAt(e.clientX, e.clientY);
    this.hover = ref || null;
    const g = this.gesture;
    if (g && g.id === e.pointerId) {
      g.moved ||= Math.hypot(e.clientX - g.x, e.clientY - g.y) > 5;
      if (ref && ref !== g.ref) g.crossed = true;
      if (
        ref &&
        !g.refs.includes(ref) &&
        this.session.canDistribute(ref) &&
        g.refs.length < this.session.cursor.count
      )
        g.refs.push(ref);
      this.preview();
    }
    this.showTooltip();
  }
  up(e) {
    const g = this.gesture;
    if (!g || g.id !== e.pointerId || g.button !== e.button) return;
    this.gesture = null;
    this.clearPreview();
    if (!this.active()) return;
    const ref = this.refAt(e.clientX, e.clientY);
    if (g.moved && g.crossed) this.session.distribute(g.refs, g.right);
    else if (ref === g.ref) this.session.click(g.ref, g.right);
    this.changed(g.refs);
  }
  clearPreview() {
    document.querySelectorAll('.drag-target').forEach((b) => {
      b.classList.remove('drag-target');
      b.querySelector('.drag-preview')?.remove();
    });
  }
  preview() {
    this.clearPreview();
    const g = this.gesture;
    if (!g?.moved || !g.crossed || !this.session.cursor) return;
    const plan = this.session.distribution(g.refs, g.right);
    for (const p of plan) {
      if (!p.count) continue;
      const button = document.querySelector(`[data-inv-slot="${p.ref}"]`);
      if (!button) continue;
      button.classList.add('drag-target');
      const preview = document.createElement('span');
      preview.className = 'drag-preview';
      preview.setAttribute('aria-hidden', 'true');
      preview.innerHTML = stackContent(copyStack(this.session.cursor, p.total));
      button.append(preview);
    }
    const remaining =
      this.session.cursor.count - plan.reduce((n, p) => n + p.count, 0);
    this.cursor.innerHTML = remaining
      ? cursorMarkup(copyStack(this.session.cursor, remaining))
      : '';
  }
  key(e) {
    if (
      !this.active() ||
      e.isComposing ||
      e.target.matches('input, textarea, select')
    )
      return;
    const ref = this.hover || document.activeElement?.dataset.invSlot;
    if (!ref || e.repeat) return;
    let handled = false;
    // A keyboard transaction must not leave an old drag plan live on mouse-up.
    const action =
      (['Space', 'Enter'].includes(e.code) &&
        e.target.matches('[data-inv-slot]')) ||
      (/^Digit[1-9]$/.test(e.code) && !this.session.cursor) ||
      e.code === 'KeyQ';
    if (action) {
      this.gesture = null;
      this.lastClick = null;
      this.clearPreview();
    }
    if (
      ['Space', 'Enter'].includes(e.code) &&
      e.target.matches('[data-inv-slot]')
    ) {
      handled = true;
      if (e.shiftKey) this.options.quickMove(ref);
      else this.session.click(ref, this.touchMode === 'single');
    } else if (/^Digit[1-9]$/.test(e.code) && !this.session.cursor) {
      handled = true;
      this.options.swapHotbar(ref, Number(e.code.slice(5)) - 1);
    } else if (e.code === 'KeyQ') {
      handled = true;
      if (this.session.cursor) this.dropCursor(e.ctrlKey ? Infinity : 1);
      else {
        const stack = takeSlot(
          this.session.resolve(ref),
          e.ctrlKey || this.session.resolve(ref)?.whole ? Infinity : 1,
        );
        if (stack) this.options.drop(stack);
      }
    }
    if (handled) {
      e.preventDefault();
      e.stopImmediatePropagation();
      this.changed();
    }
  }
  dropCursor(count) {
    if (!this.session.cursor) return;
    const n = Math.min(count, this.session.cursor.count);
    this.options.drop(copyStack(this.session.cursor, n));
    this.session.cursor.count -= n;
    if (!this.session.cursor.count) this.session.cursor = null;
    this.changed();
  }
  showTooltip() {
    const stack =
      this.active() && !this.session.cursor && this.hover
        ? this.session.resolve(this.hover)?.get()
        : null;
    this.tooltip.replaceChildren();
    const hint =
      this.active() && !this.session.cursor && this.hover
        ? document.querySelector(
            `.overlay:not(.hidden) [data-inv-slot="${this.hover}"]`,
          )?.dataset.invHint
        : '';
    if (!stack && !hint) {
      this.tooltip.hidden = true;
      return;
    }
    this.tooltip.hidden = false;
    (stack ? stackTitle(stack) : hint).split('\n').forEach((line, i) => {
      const el = document.createElement(i ? 'span' : 'strong');
      el.textContent = line;
      this.tooltip.append(el);
    });
    if (stack)
      this.tooltip.insertAdjacentHTML('beforeend', containerPreview(stack));
    const { x, y } = this.position;
    this.tooltip.style.left =
      Math.max(4, Math.min(x + 18, innerWidth - this.tooltip.offsetWidth - 8)) +
      'px';
    this.tooltip.style.top =
      Math.max(
        4,
        Math.min(y - 12, innerHeight - this.tooltip.offsetHeight - 8),
      ) + 'px';
  }
  changed(refs = [this.hover]) {
    this.options.changed(refs);
    this.refresh();
    this.status.textContent = this.session.cursor
      ? '拿着 ' +
        stackTitle(this.session.cursor).split('\n')[0] +
        ' ×' +
        this.session.cursor.count
      : '游标为空';
  }
  refresh() {
    this.cursor.innerHTML = this.active()
      ? cursorMarkup(this.session.cursor)
      : '';
    document.body.classList.toggle(
      'carrying-stack',
      this.active() && !!this.session.cursor,
    );
    document
      .querySelectorAll('[data-inventory-mode]')
      .forEach((b) =>
        b.setAttribute(
          'aria-pressed',
          String(b.dataset.inventoryMode === this.touchMode),
        ),
      );
    this.showTooltip();
    if (this.gesture) this.preview();
  }
  cancel() {
    this.gesture = null;
    this.lastClick = null;
    this.clearPreview();
    this.refresh();
  }
}
