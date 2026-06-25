import { GAME_W, H, W } from "./constants.js";

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function randomGaussian() {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function degToRad(degrees) {
  return (degrees * Math.PI) / 180;
}

export function radToDeg(radians) {
  return (radians * 180) / Math.PI;
}

export function pixelToGame(px, py) {
  return {
    x: (GAME_W * (px - W / 2)) / W,
    y: (GAME_W * (-py + H / 2)) / W
  };
}

export function gameToPixel(x, y) {
  return {
    x: (W * x) / GAME_W + W / 2,
    y: (-W * y) / GAME_W + H / 2
  };
}

export function distance2Game(x1, y1, x2, y2) {
  return (x1 - x2) ** 2 + (y1 - y2) ** 2;
}

export function dist2(x1, y1, x2, y2) {
  return (x1 - x2) ** 2 + (y1 - y2) ** 2;
}

export function escapeAttr(value) {
  return String(value).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
}
