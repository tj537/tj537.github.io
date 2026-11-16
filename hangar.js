// Hangar station: the field picker and the cloud of words orbiting the scene.
// The keyword lists in the HTML are the source of truth; the cloud only mirrors them.

const DEFAULT_HINT = 'Pick a field – or just enjoy the view.';
const INTRO_SECONDS = 1.8;

// One tilted orbit per field, so the four groups cross like planet paths.
const ORBITS = [
  { radius: 1.0, tilt: 1.22, roll: -0.32, speed: 0.07 },
  { radius: 0.8, tilt: 1.32, roll: 0.24, speed: -0.09 },
  { radius: 0.62, tilt: 1.12, roll: 0.58, speed: 0.11 },
  { radius: 0.9, tilt: 1.38, roll: -0.08, speed: -0.06 },
];

export function initHangar({ reduced, coarse }) {
  const fields = [...document.querySelectorAll('.field')];
  const hint = document.querySelector('.field-hint');
  const cloud = document.querySelector('.cloud');
  let picked = -1;

  function pick(i) {
    picked = i === picked ? -1 : i;
    fields.forEach((f, k) => f.querySelector('.field-btn').setAttribute('aria-pressed', String(k === picked)));
    hint.textContent = picked < 0 ? DEFAULT_HINT : fields[picked].querySelector('.field-text').textContent;
    hint.style.setProperty('--c', picked < 0 ? '' : fields[picked].style.getPropertyValue('--c'));
  }
  fields.forEach((f, i) => f.querySelector('.field-btn').addEventListener('click', () => pick(i)));

  if (!cloud) return { setVisible() {} };

  const words = fields.flatMap((f, g) => {
    const items = [...f.querySelectorAll('.field-words li')];
    const color = f.style.getPropertyValue('--c');
    return items.map((li, k) => {
      const el = document.createElement('span');
      el.textContent = li.textContent;
      el.style.setProperty('--c', color);
      cloud.append(el);
      return {
        el,
        group: g,
        angle: (k / items.length) * Math.PI * 2 + g * 0.9,
        radius: ORBITS[g].radius * (0.92 + ((k * 37) % 17) / 100),
        focus: 0,
      };
    });
  });

  const view = { cx: 0, cy: 0, rx: 0, ry: 0 };
  function layout() {
    const w = innerWidth, h = innerHeight;
    if (w <= 760) Object.assign(view, { cx: w * 0.5, cy: h * 0.25, rx: w * 0.34, ry: h * 0.12 });
    else Object.assign(view, { cx: w * 0.68, cy: h * 0.47, rx: Math.min(w * 0.27, 520), ry: h * 0.34 });
  }
  addEventListener('resize', layout);
  layout();

  const pointer = { x: 0, y: 0 };
  if (!coarse && !reduced) {
    addEventListener('pointermove', (e) => {
      pointer.x = e.clientX / innerWidth - 0.5;
      pointer.y = e.clientY / innerHeight - 0.5;
    });
  }

  let visible = false;
  let running = false;
  let intro = reduced ? 1 : 0;
  let last = 0;
  const drift = { x: 0, y: 0 };

  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (!reduced) intro = Math.min(1, intro + dt / INTRO_SECONDS);
    const spread = 1 - (1 - intro) ** 3;
    drift.x += (pointer.x * 28 - drift.x) * 0.05;
    drift.y += (pointer.y * 18 - drift.y) * 0.05;

    for (const w of words) {
      const o = ORBITS[w.group];
      if (!reduced) w.angle += o.speed * dt * (picked < 0 ? 1 : 0.4);
      w.focus += ((picked < 0 ? 0 : picked === w.group ? 1 : -1) - w.focus) * 0.08;

      // point on a circle, tilted around X, then rolled around Z
      const x = Math.cos(w.angle) * w.radius * spread;
      const z0 = Math.sin(w.angle) * w.radius * spread;
      const y0 = -z0 * Math.sin(o.tilt);
      const z = z0 * Math.cos(o.tilt) + Math.sin(w.angle) * 0.35;
      const sx = x * Math.cos(o.roll) - y0 * Math.sin(o.roll);
      const sy = x * Math.sin(o.roll) + y0 * Math.cos(o.roll);

      const depth = Math.max(0, Math.min(1, (z + 1) / 2)); // 1 = closest
      const scale = (0.62 + depth * 0.6) * (1 + Math.max(0, w.focus) * 0.3);
      const base = 0.18 + depth * 0.72;
      const opacity = w.focus >= 0 ? base + (1 - base) * w.focus : base * (1 + w.focus * 0.85);

      w.el.style.transform = `translate3d(${view.cx + sx * view.rx + drift.x}px, ${view.cy + sy * view.ry + drift.y}px, 0) translate(-50%, -50%) scale(${scale.toFixed(3)})`;
      w.el.style.opacity = (opacity * intro).toFixed(3);
      w.el.style.zIndex = String(Math.round(depth * 100));
      w.el.classList.toggle('lit', w.focus > 0.5);
    }
    running = visible;
    if (running) requestAnimationFrame(frame);
  }

  return {
    setVisible(on) {
      visible = on;
      cloud.classList.toggle('on', on);
      if (on && !running) {
        running = true;
        last = performance.now();
        requestAnimationFrame(frame);
      }
    },
  };
}
