let state = null;
// I don't make trash
let cacher = {
  x: 0,
  y: 0,
};

const simulate = (state, update) => {
  const {
    sabViewParticles,
    particleOffsetStart,
    particleOffsetEnd,
    particleStride,
  } = state;

  const {
    delta,
    width,
    height,
    touches,
    particleGrid
  } = update;

  const start = particleOffsetStart;
  const end = particleOffsetEnd;
  const decay = 1 / (1 + delta * 1);
  for (let i = start; i < end; i++) {
    const pi = i * particleStride;
    let x = sabViewParticles[pi];
    let y = sabViewParticles[pi + 1];
    let dx = sabViewParticles[pi + 2] * decay;
    let dy = sabViewParticles[pi + 3] * decay;
    let sx = sabViewParticles[pi + 4];
    let sy = sabViewParticles[pi + 5];

    for (let touch of touches) {
      const tx = touch.x;
      const ty = touch.y;
      forceInvSqr(tx, ty, x, y, 2583000 * 15);
      dx += cacher.x * delta * 3;
      dy += cacher.y * delta * 3;
    }

    forceSqr(sx, sy, x, y, 0.5);
    dx += cacher.x * delta * 1;
    dy += cacher.y * delta * 1;

    x += dx * delta;
    y += dy * delta;
    sabViewParticles[pi] = x;
    sabViewParticles[pi + 1] = y;
    sabViewParticles[pi + 2] = dx;
    sabViewParticles[pi + 3] = dy;

    if (x < 0 || x >= width) continue;
    if (y < 0 || y >= height) continue;
    const pCountIndex = (y | 0) * width + (x | 0);
    particleGrid[pCountIndex]++;
  }

};

function clamp(n) {
  n &= -(n >= 0);
  return n | ((255 - n) >> 31);
}

function forceInvSqr(x1, y1, x2, y2, m = 25830000) {
  const dx = x1 - x2;
  const dy = y1 - y2;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const dirX = dx / dist;
  const dirY = dy / dist;
  const force = Math.min(1200, m / (dist * dist));
  cacher.x = force * dirX;
  cacher.y = force * dirY;
}

function forceInvCube(x1, y1, x2, y2, m = 25830000) {
  const dx = x1 - x2;
  const dy = y1 - y2;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const dirX = dx / dist;
  const dirY = dy / dist;
  const force = Math.min(12000, m / (dist * dist * dist));
  cacher.x = force * dirX;
  cacher.y = force * dirY;
}

function forceSqr(x1, y1, x2, y2, d = 999999) {
  const dx = x1 - x2;
  const dy = y1 - y2;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (d <= dist) {
    const dirX = dx / dist;
    const dirY = dy / dist;
    const force = Math.min(12000, dist * dist);
    cacher.x = force * dirX;
    cacher.y = force * dirY;
    return;
  }
  cacher.x = 0;
  cacher.y = 0;
}

onmessage = (event) => {
  if (state) {
    simulate(state, event.data);
  } else {
    state = event.data;
  }

  postMessage({});
};
