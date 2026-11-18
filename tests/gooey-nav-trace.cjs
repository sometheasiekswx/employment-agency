const assert = require("node:assert/strict");

// Record what the browser sends to the shader. The live React Bits Classic
// demo at reactbits.dev/components/gooey-nav exposes the same uniforms.
function installGooeyTrace() {
  const prototype = window.WebGL2RenderingContext?.prototype;
  if (!prototype) return;

  const names = new WeakMap();
  const pending = new WeakMap();
  const getLocation = prototype.getUniformLocation;
  const setVectors = prototype.uniform4fv;
  const setCount = prototype.uniform1i;
  const draw = prototype.drawArrays;

  window.eaGooeyTrace = { selector: "", frames: [] };
  prototype.getUniformLocation = function (program, name) {
    const location = getLocation.call(this, program, name);
    if (location) names.set(location, name);
    return location;
  };
  prototype.uniform4fv = function (location, value, ...options) {
    const name = names.get(location);
    const { selector } = window.eaGooeyTrace;
    if (
      selector &&
      (name === "uPills" || name === "uDrops") &&
      this.canvas.matches(selector)
    ) {
      if (!pending.has(this)) pending.set(this, {});
      pending.get(this)[name] = Array.from(value);
    }
    setVectors.call(this, location, value, ...options);
  };
  prototype.uniform1i = function (location, value) {
    const frame = pending.get(this);
    if (frame && names.get(location) === "uCount") frame.count = value;
    setCount.call(this, location, value);
  };
  prototype.drawArrays = function (...args) {
    draw.apply(this, args);
    const uniforms = pending.get(this);
    if (!uniforms?.uPills || !uniforms.uDrops) return;

    const { x, y } = this.canvas.getBoundingClientRect();
    const pills = [];
    const drops = [];
    for (let i = 0; i < uniforms.uPills.length; i += 4) {
      const [cx, cy, halfWidth, halfHeight] = uniforms.uPills.slice(i, i + 4);
      if (halfWidth && halfHeight)
        pills.push({ x: x + cx, y: y + cy, halfWidth, halfHeight });
    }
    for (let i = 0; i < uniforms.count * 4; i += 4) {
      const [cx, cy, radius] = uniforms.uDrops.slice(i, i + 3);
      drops.push({ x: x + cx, y: y + cy, radius });
    }
    window.eaGooeyTrace.frames.push({ time: performance.now(), pills, drops });
    pending.delete(this);
  };
}

async function checkGooeyBurst(
  page,
  { canvasSelector, from, to, select, settled },
) {
  const start = await from.boundingBox();
  const end = await to.boundingBox();
  assert.ok(start && end, "Both navigation targets are visible");
  // The clock is installed before the page loads. Advance every animation
  // frame so CPU contention cannot skip the middle of the transition.
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(now + 300);
  await page.evaluate((selector) => {
    const trace = window.eaGooeyTrace;
    trace.selector = selector;
    trace.frames = [];
    trace.originalRandom = Math.random;
    let seed = 51;
    Math.random = () => {
      seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
  }, canvasSelector);
  let frames;
  try {
    await select();
    await page.clock.runFor(1500);
    await settled();
    frames = await page.evaluate(() => window.eaGooeyTrace.frames);
  } finally {
    await page.evaluate(() => {
      const trace = window.eaGooeyTrace;
      trace.selector = "";
      Math.random = trace.originalRandom;
      delete trace.originalRandom;
    });
    await page.clock.resume();
  }

  const fromX = start.x + start.width / 2;
  const toX = end.x + end.width / 2;
  const startY = start.y + start.height / 2;
  const endY = end.y + end.height / 2;
  const dx = toX - fromX;
  const dy = endY - startY;
  const distance = Math.hypot(dx, dy);
  const progress = ({ x, y }) =>
    ((x - fromX) * dx + (y - startY) * dy) / distance ** 2;
  const active = frames.filter(({ drops }) => drops.length);
  const maxParticles = Math.max(0, ...active.map(({ drops }) => drops.length));
  const meanProgress = ({ drops }) =>
    drops.reduce((sum, drop) => sum + progress(drop), 0) / drops.length;

  assert.equal(
    maxParticles,
    15,
    "The Classic transition draws 15 liquid particles",
  );
  assert.ok(
    active.length >= 5,
    "The particle field evolves over multiple rendered frames",
  );
  assert.ok(
    meanProgress(active[0]) < 0.45,
    "Particles emerge from the previous selection",
  );
  assert.ok(
    active.some((frame) => {
      const value = meanProgress(frame);
      return value > 0.45 && value < 0.75;
    }),
    "Particles cross the space between targets",
  );
  assert.ok(
    meanProgress(active.at(-1)) > 0.75,
    "Particles collect at the destination",
  );
  const particleTime = active.at(-1).time - active[0].time;
  assert.ok(
    particleTime >= 325 && particleTime <= 1050,
    `Classic particle flight and absorption: ${particleTime.toFixed(1)}ms`,
  );
  const atTarget = (frame, x, y) =>
    frame.pills.find((pill) => Math.hypot(pill.x - x, pill.y - y) <= 2);
  const origin = atTarget(active[0], fromX, startY);
  assert.ok(
    origin &&
      active.some((frame) => {
        const pill = atTarget(frame, fromX, startY);
        return pill && pill.halfWidth < origin.halfWidth * 0.8;
      }),
    "The source pill shrinks as it releases particles",
  );
  assert.ok(
    active.some(({ drops }) => {
      const between = drops.filter(
        (drop) => progress(drop) > 0.2 && progress(drop) < 0.8,
      );
      return between.some(
        ({ x, y }) =>
          Math.abs((y - startY) * dx - (x - fromX) * dy) / distance >= 6,
      );
    }),
    "Particles follow curved arcs outside the direct line between targets",
  );

  const final = frames.at(-1);
  assert.equal(
    final.drops.length,
    0,
    "Particle state is cleared after the transition",
  );
  assert.equal(
    final.pills.length,
    1,
    "Exactly one pill remains after settling",
  );
  const [{ x, y }] = final.pills;
  assert.ok(
    Math.hypot(x - toX, y - endY) <= 2,
    "The settled pill aligns with the active target",
  );
  assert.ok(
    active.some((frame) => {
      const pill = atTarget(frame, toX, endY);
      return pill && pill.halfWidth < final.pills[0].halfWidth * 0.8;
    }),
    "The destination pill grows as it absorbs particles",
  );
  return {
    maxParticles,
    particleTime: Math.round(particleTime),
    frames: active.length,
  };
}

module.exports = { checkGooeyBurst, installGooeyTrace };
