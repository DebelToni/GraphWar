import {
  EXPLOSION_R,
  GAME_W,
  H,
  MAX_SEGMENT_D2,
  MAX_SHOT_PIXEL_LENGTH,
  MAX_STEPS,
  MIN_STEP,
  SOLDIER_R,
  STEP,
  W
} from "./constants.js";
import { clamp, dist2, distance2Game, gameToPixel, pixelToGame, randomGaussian } from "./utils.js";

export function generateCircles() {
  const count = clamp(Math.round(randomGaussian() * 7 + 15), 5, 28);
  const circles = [];
  for (let i = 0; i < count; i += 1) {
    circles.push({
      x: Math.round(Math.random() * W),
      y: Math.round(Math.random() * H),
      r: clamp(Math.round(Math.abs(randomGaussian() * 25 + 40)), 12, 92)
    });
  }
  return circles;
}

export function generateSoldier(team, terrain, placed) {
  for (let attempt = 0; attempt < 2500; attempt += 1) {
    const x = Math.round((team === 1 ? 0 : W / 2) + SOLDIER_R + Math.random() * (W / 2 - SOLDIER_R * 2));
    const y = Math.round(SOLDIER_R + Math.random() * (H - SOLDIER_R * 2));
    const clearOfTerrain = !soldierCollidesTerrain(x, y, SOLDIER_R + 4, terrain);
    const clearOfSoldiers = placed.every((other) => Math.abs(other.x - x) >= 22 || Math.abs(other.y - y) >= 22);
    if (clearOfTerrain && clearOfSoldiers) return { x, y };
  }
  return { x: team === 1 ? 50 : W - 50, y: H / 2 };
}

export function computeShot(game, fn) {
  const player = currentPlayer(game);
  const soldier = currentSoldier(game);
  const mirror = player.team === 2;
  const startPx = mirror ? W - soldier.x : soldier.x;
  const start = pixelToGame(startPx, soldier.y);
  const rGame = (GAME_W * SOLDIER_R) / W;
  const path = [];
  const hits = [];
  const hitKeys = new Set();
  let fireAngle = soldier.angle || 0;

  if (game.mode === 0) {
    const slope = derivativeX(fn, start.x, 0, 0);
    fireAngle = safeAngle(slope);
    const x = start.x + rGame * Math.cos(fireAngle);
    const y = start.y + rGame * Math.sin(fireAngle);
    const offset = y - fn(x, 0, 0);
    traceExplicit(game, path, hits, hitKeys, mirror, x, y, (nextX) => fn(nextX, 0, 0) + offset);
  } else if (game.mode === 1) {
    const slope = fn(start.x, start.y, 0);
    fireAngle = safeAngle(slope);
    const x = start.x + rGame * Math.cos(fireAngle);
    const y = start.y + rGame * Math.sin(fireAngle);
    traceFirstOrder(game, path, hits, hitKeys, mirror, x, y, fn);
  } else {
    fireAngle = clamp(soldier.angle || 0, -Math.PI / 2, Math.PI / 2);
    const x = start.x + rGame * Math.cos(fireAngle);
    const y = start.y + rGame * Math.sin(fireAngle);
    const dy = Math.tan(clamp(fireAngle, -1.553, 1.553));
    traceSecondOrder(game, path, hits, hitKeys, mirror, x, y, dy, fn);
  }

  return { path, hits, fireAngle, lengthLimited: path.at(-1)?.lengthLimited || false };
}

export function terrainCollides(x, y, terrain) {
  if (x < 0 || x >= W || y < 0 || y >= H) return true;
  let solid = false;
  for (const circle of terrain.circles) {
    if (dist2(x, y, circle.x, circle.y) <= circle.r * circle.r) {
      solid = true;
      break;
    }
  }
  if (!solid) return false;
  return !terrain.holes.some((hole) => dist2(x, y, hole.x, hole.y) <= hole.r * hole.r);
}

export function soldierCollidesTerrain(x, y, radius, terrain) {
  return (
    terrainCollides(x, y, terrain) ||
    terrainCollides(x + radius, y, terrain) ||
    terrainCollides(x - radius, y, terrain) ||
    terrainCollides(x, y + radius, terrain) ||
    terrainCollides(x, y - radius, terrain)
  );
}

export function addExplosionHole(terrain, point) {
  if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) {
    terrain.holes.push({ x: point.x, y: point.y, r: EXPLOSION_R });
  }
}

function traceExplicit(game, path, hits, hitKeys, mirror, x, y, evaluateY) {
  addPathPoint(game, path, hits, hitKeys, mirror, x, y, 0);
  for (let i = 1; i < MAX_STEPS; i += 1) {
    let step = STEP;
    let nx = x + step;
    let ny = evaluateY(nx);
    let guard = 0;
    while (Number.isFinite(ny) && distance2Game(x, y, nx, ny) > MAX_SEGMENT_D2 && step > MIN_STEP && guard < 32) {
      step /= 2;
      nx = x + step;
      ny = evaluateY(nx);
      guard += 1;
    }
    if (!Number.isFinite(ny)) break;
    const point = addPathPoint(game, path, hits, hitKeys, mirror, nx, ny, i);
    x = nx;
    y = ny;
    if (point.collided || point.lengthLimited) break;
  }
}

function traceFirstOrder(game, path, hits, hitKeys, mirror, x, y, fn) {
  addPathPoint(game, path, hits, hitKeys, mirror, x, y, 0);
  for (let i = 1; i < MAX_STEPS; i += 1) {
    let step = STEP;
    let next = rk4First(x, y, step, fn);
    let guard = 0;
    while (Number.isFinite(next.y) && distance2Game(x, y, next.x, next.y) > MAX_SEGMENT_D2 && step > MIN_STEP && guard < 32) {
      step /= 2;
      next = rk4First(x, y, step, fn);
      guard += 1;
    }
    if (!Number.isFinite(next.y)) break;
    const point = addPathPoint(game, path, hits, hitKeys, mirror, next.x, next.y, i);
    x = next.x;
    y = next.y;
    if (point.collided || point.lengthLimited) break;
  }
}

function traceSecondOrder(game, path, hits, hitKeys, mirror, x, y, dy, fn) {
  addPathPoint(game, path, hits, hitKeys, mirror, x, y, 0);
  for (let i = 1; i < MAX_STEPS; i += 1) {
    let step = STEP;
    let next = rk4Second(x, y, dy, step, fn);
    let guard = 0;
    while (Number.isFinite(next.y) && Number.isFinite(next.dy) && distance2Game(x, y, next.x, next.y) > MAX_SEGMENT_D2 && step > MIN_STEP && guard < 32) {
      step /= 2;
      next = rk4Second(x, y, dy, step, fn);
      guard += 1;
    }
    if (!Number.isFinite(next.y) || !Number.isFinite(next.dy)) break;
    const point = addPathPoint(game, path, hits, hitKeys, mirror, next.x, next.y, i);
    x = next.x;
    y = next.y;
    dy = next.dy;
    if (point.collided || point.lengthLimited) break;
  }
}

function addPathPoint(game, path, hits, hitKeys, mirror, gx, gy, step) {
  const internal = gameToPixel(gx, gy);
  const point = { x: mirror ? W - internal.x : internal.x, y: internal.y };
  const previous = path[path.length - 1];
  const totalLength = previous ? previous.totalLength + Math.sqrt(dist2(point.x, point.y, previous.x, previous.y)) : 0;
  point.totalLength = totalLength;
  point.lengthLimited = totalLength >= MAX_SHOT_PIXEL_LENGTH;
  path.push(point);
  collectHits(game, point, hits, hitKeys, step);
  return { collided: terrainCollides(point.x, point.y, game.terrain), lengthLimited: point.lengthLimited };
}

function collectHits(game, point, hits, hitKeys, step) {
  const shooter = currentPlayer(game);
  game.players.forEach((player, playerIndex) => {
    player.soldiers.forEach((soldier, soldierIndex) => {
      if (!soldier.alive) return;
      if (player === shooter && soldierIndex === shooter.currentSoldier) return;
      const key = `${playerIndex}:${soldierIndex}`;
      if (hitKeys.has(key)) return;
      if (dist2(point.x, point.y, soldier.x, soldier.y) <= SOLDIER_R * SOLDIER_R) {
        hitKeys.add(key);
        hits.push({ playerIndex, soldierIndex, step, applied: false });
      }
    });
  });
}

function rk4First(x, y, h, fn) {
  const k1 = fn(x, y, 0);
  const k2 = fn(x + h / 2, y + (h * k1) / 2, 0);
  const k3 = fn(x + h / 2, y + (h * k2) / 2, 0);
  const k4 = fn(x + h, y + h * k3, 0);
  return { x: x + h, y: y + (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4) };
}

function rk4Second(x, y, dy, h, fn) {
  const k11 = dy;
  const k12 = fn(x, y, dy);
  const k21 = dy + (h * k12) / 2;
  const k22 = fn(x + h / 2, y + (h * k11) / 2, dy + (h * k12) / 2);
  const k31 = dy + (h * k22) / 2;
  const k32 = fn(x + h / 2, y + (h * k21) / 2, dy + (h * k22) / 2);
  const k41 = dy + h * k32;
  const k42 = fn(x + h, y + h * k31, dy + h * k32);
  return {
    x: x + h,
    y: y + (h / 6) * (k11 + 2 * k21 + 2 * k31 + k41),
    dy: dy + (h / 6) * (k12 + 2 * k22 + 2 * k32 + k42)
  };
}

function derivativeX(fn, x, y, dy) {
  return (fn(x + STEP, y, dy) - fn(x, y, dy)) / STEP;
}

function safeAngle(slope) {
  if (!Number.isFinite(slope)) return 0;
  return Math.atan(slope);
}

function currentPlayer(game) {
  return game.players[game.currentTurn];
}

function currentSoldier(game) {
  const player = currentPlayer(game);
  return player?.soldiers[player.currentSoldier];
}
