import { H, SOLDIER_R, W } from "./constants.js";
import { gameToPixel } from "./utils.js";

export function draw(canvas, game, activeShot) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  drawGrid(ctx);
  if (game) drawTerrain(ctx, game.terrain);
  drawAxes(ctx);
  if (activeShot) drawShot(ctx, game, activeShot);
  if (game) drawSoldiers(ctx, game);
  if (game?.winnerTeam) drawWinner(ctx, game.winnerTeam);
}

function drawGrid(ctx) {
  ctx.save();
  ctx.strokeStyle = "rgba(0,0,0,0.08)";
  ctx.lineWidth = 1;
  for (let x = -25; x <= 25; x += 5) {
    const px = gameToPixel(x, 0).x;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, H);
    ctx.stroke();
  }
  for (let y = -15; y <= 15; y += 5) {
    const py = gameToPixel(0, y).y;
    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(W, py);
    ctx.stroke();
  }
  ctx.restore();
}

function drawTerrain(ctx, terrain) {
  ctx.save();
  ctx.fillStyle = "#050505";
  terrain.circles.forEach((circle) => {
    ctx.beginPath();
    ctx.arc(circle.x, circle.y, circle.r, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.fillStyle = "#ffffff";
  terrain.holes.forEach((hole) => {
    ctx.beginPath();
    ctx.arc(hole.x, hole.y, hole.r, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

function drawAxes(ctx) {
  ctx.save();
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, H / 2);
  ctx.lineTo(W, H / 2);
  ctx.moveTo(W / 2, 0);
  ctx.lineTo(W / 2, H);
  ctx.stroke();
  ctx.fillStyle = "#1f1f1f";
  ctx.font = "12px 'Courier New', monospace";
  ctx.fillText("-25", 4, H / 2 - 5);
  ctx.fillText("25", W - 22, H / 2 - 5);
  ctx.fillText("15", W / 2 + 5, 14);
  ctx.fillText("-15", W / 2 + 5, H - 6);
  ctx.restore();
}

function drawShot(ctx, game, activeShot) {
  const player = game.players[game.currentTurn];
  const end = Math.max(1, activeShot.progressStep);
  ctx.save();
  ctx.strokeStyle = player.color;
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(activeShot.path[0].x, activeShot.path[0].y);
  for (let i = 1; i <= end && i < activeShot.path.length; i += 1) {
    ctx.lineTo(activeShot.path[i].x, activeShot.path[i].y);
  }
  ctx.stroke();
  const last = activeShot.path[Math.min(end, activeShot.path.length - 1)];
  ctx.fillStyle = player.color;
  ctx.beginPath();
  ctx.arc(last.x, last.y, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawSoldiers(ctx, game) {
  game.players.forEach((player, playerIndex) => {
    player.soldiers.forEach((soldier, soldierIndex) => {
      const isCurrent = playerIndex === game.currentTurn && soldierIndex === player.currentSoldier && soldier.alive && !game.winnerTeam;
      ctx.save();
      if (!soldier.alive) {
        ctx.strokeStyle = "rgba(70,70,70,0.85)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(soldier.x - 6, soldier.y - 6);
        ctx.lineTo(soldier.x + 6, soldier.y + 6);
        ctx.moveTo(soldier.x + 6, soldier.y - 6);
        ctx.lineTo(soldier.x - 6, soldier.y + 6);
        ctx.stroke();
        ctx.restore();
        return;
      }

      if (isCurrent) {
        ctx.fillStyle = "#f2e35b";
        ctx.beginPath();
        ctx.moveTo(soldier.x, soldier.y - 23);
        ctx.lineTo(soldier.x - 8, soldier.y - 34);
        ctx.lineTo(soldier.x + 8, soldier.y - 34);
        ctx.closePath();
        ctx.fill();
        drawAngleNeedle(ctx, soldier, player.team);
      }

      ctx.fillStyle = player.color;
      ctx.strokeStyle = "#111";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(soldier.x, soldier.y, SOLDIER_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#202020";
      ctx.fillRect(soldier.x - 7, soldier.y - 10, 14, 5);
      ctx.fillStyle = "rgba(0,0,0,0.78)";
      ctx.font = "12px 'Courier New', monospace";
      ctx.textAlign = "center";
      ctx.fillText(player.name, soldier.x, soldier.y - 15);
      ctx.restore();
    });
  });
}

function drawAngleNeedle(ctx, soldier, team) {
  const direction = team === 1 ? 1 : -1;
  const angle = soldier.angle || 0;
  const length = 20;
  ctx.strokeStyle = "#c42020";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(soldier.x, soldier.y);
  ctx.lineTo(soldier.x + direction * Math.cos(angle) * length, soldier.y - Math.sin(angle) * length);
  ctx.stroke();
}

function drawWinner(ctx, winnerTeam) {
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.58)";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.font = "700 42px 'Courier New', monospace";
  ctx.fillText(`Team ${winnerTeam} wins!`, W / 2, H / 2);
  ctx.font = "18px 'Courier New', monospace";
  ctx.fillText("Start a new level to play again", W / 2, H / 2 + 36);
  ctx.restore();
}
