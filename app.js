(() => {
  "use strict";

  const SAVE_KEY = "graphwar-local-v1";
  const W = 770;
  const H = 450;
  const GAME_W = 50;
  const SOLDIER_R = 7;
  const EXPLOSION_R = 12;
  const STEP = 0.01;
  const MIN_STEP = 0.00001;
  const MAX_SEGMENT_D2 = 0.001;
  const MAX_STEPS = 20000;
  const TURN_TIME = 60000;
  const SHOT_SPEED = 1500;
  const COLORS = ["#f54f4f", "#4f8cff", "#ffd34f", "#bd77ff", "#49d992", "#ff8bd1", "#ff9a48", "#5ee7ff"];
  const MODE_NAMES = ["Normal Function", "First Order ODE", "Second Order ODE"];
  const MODE_LABELS = ["Function y = f(x)", "Derivative y' = f(x, y)", "Acceleration y'' = f(x, y, y')"];
  const DEFAULTS = ["sin(x)", "-y/3", "-0.05"];
  const PRESETS = [
    ["0", "x/3", "sin(x)", "(x*x)/50", "-x/2", "abs(x)/4"],
    ["0", "-y/3", "sin(x)", "1/(x+y)", "cos(x)/2", "-x/10"],
    ["0", "-0.05", "-y/3", "-0.1*y-0.2*y'", "sin(x)/6", "-y"]
  ];

  const $ = (id) => document.getElementById(id);
  const els = {};
  let setupPlayers = [];
  let game = null;
  let activeShot = null;
  let pendingTurnTimer = null;
  let saveFlashTimer = null;

  window.addEventListener("DOMContentLoaded", init);

  function init() {
    Object.assign(els, {
      setupPanel: $("setupPanel"),
      gamePanel: $("gamePanel"),
      modeSelect: $("modeSelect"),
      playersList: $("playersList"),
      addPlayerBtn: $("addPlayerBtn"),
      startGameBtn: $("startGameBtn"),
      resetSaveBtn: $("resetSaveBtn"),
      resumeGameBtn: $("resumeGameBtn"),
      plane: $("plane"),
      saveStatus: $("saveStatus"),
      modeLabel: $("modeLabel"),
      turnTitle: $("turnTitle"),
      timerFill: document.querySelector("#timerBar span"),
      turnMeta: $("turnMeta"),
      functionLabel: $("functionLabel"),
      functionInput: $("functionInput"),
      presetButtons: $("presetButtons"),
      angleValue: $("angleValue"),
      angleSlider: $("angleSlider"),
      angleDownBtn: $("angleDownBtn"),
      angleUpBtn: $("angleUpBtn"),
      fireBtn: $("fireBtn"),
      skipAnimationBtn: $("skipAnimationBtn"),
      newLevelBtn: $("newLevelBtn"),
      backSetupBtn: $("backSetupBtn"),
      messageBox: $("messageBox")
    });

    preventMobileGestures();
    bindEvents();

    const saved = loadSavedState();
    if (saved) {
      setupPlayers = saved.setupPlayers || defaultPlayers();
      if (saved.mode !== undefined) els.modeSelect.value = String(saved.mode);
      if (saved.game && saved.game.phase === "game") {
        game = saved.game;
        game.turnStarted = Date.now();
        showGame("Restored saved local match.");
      } else {
        showSetup();
      }
    } else {
      setupPlayers = defaultPlayers();
      showSetup();
    }

    requestAnimationFrame(tick);
  }

  function bindEvents() {
    els.modeSelect.addEventListener("change", () => {
      saveSetupOnly();
      renderPresets();
    });
    els.addPlayerBtn.addEventListener("click", () => {
      if (setupPlayers.length >= 8) return;
      const next = setupPlayers.length + 1;
      setupPlayers.push({ name: `Player ${next}`, team: next % 2 === 0 ? 2 : 1, soldierCount: 2, color: COLORS[(next - 1) % COLORS.length] });
      renderSetupPlayers();
      saveSetupOnly();
    });
    els.startGameBtn.addEventListener("click", startNewMatch);
    els.resetSaveBtn.addEventListener("click", () => {
      localStorage.removeItem(SAVE_KEY);
      game = null;
      activeShot = null;
      setupPlayers = defaultPlayers();
      els.modeSelect.value = "0";
      showSetup("Save cleared.");
    });
    els.resumeGameBtn.addEventListener("click", () => {
      const saved = loadSavedState();
      if (saved && saved.game) {
        game = saved.game;
        game.turnStarted = Date.now();
        showGame("Restored saved local match.");
      }
    });
    els.fireBtn.addEventListener("click", fireCurrentFunction);
    els.functionInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") fireCurrentFunction();
    });
    els.skipAnimationBtn.addEventListener("click", finishActiveShot);
    els.newLevelBtn.addEventListener("click", () => {
      if (!game) return;
      const mode = game.mode;
      setupPlayers = game.players.map((player) => ({
        name: player.name,
        team: player.team,
        soldierCount: player.soldierCount,
        color: player.color
      }));
      els.modeSelect.value = String(mode);
      startNewMatch("New level started.");
    });
    els.backSetupBtn.addEventListener("click", () => {
      if (game) {
        setupPlayers = game.players.map((player) => ({
          name: player.name,
          team: player.team,
          soldierCount: player.soldierCount,
          color: player.color
        }));
        els.modeSelect.value = String(game.mode);
      }
      game = null;
      activeShot = null;
      showSetup("Back to setup.");
      saveSetupOnly();
    });
    els.angleSlider.addEventListener("input", () => setCurrentAngle(Number(els.angleSlider.value)));
    els.angleDownBtn.addEventListener("click", () => setCurrentAngle(Number(els.angleSlider.value) - 5));
    els.angleUpBtn.addEventListener("click", () => setCurrentAngle(Number(els.angleSlider.value) + 5));
  }

  function preventMobileGestures() {
    document.addEventListener("gesturestart", (event) => event.preventDefault(), { passive: false });
    document.addEventListener("gesturechange", (event) => event.preventDefault(), { passive: false });
    els.plane.addEventListener("touchstart", (event) => event.preventDefault(), { passive: false });
    els.plane.addEventListener("touchmove", (event) => event.preventDefault(), { passive: false });
  }

  function defaultPlayers() {
    return [
      { name: "Player 1", team: 1, soldierCount: 2, color: COLORS[0] },
      { name: "Player 2", team: 2, soldierCount: 2, color: COLORS[1] }
    ];
  }

  function showSetup(message = "") {
    els.setupPanel.classList.remove("hidden");
    els.gamePanel.classList.add("hidden");
    const saved = loadSavedState();
    els.resumeGameBtn.classList.toggle("hidden", !(saved && saved.game));
    renderSetupPlayers();
    setMessage(message);
    draw();
  }

  function showGame(message = "") {
    els.setupPanel.classList.add("hidden");
    els.gamePanel.classList.remove("hidden");
    syncTurnUI();
    setMessage(message || turnHelpText());
    saveState();
    draw();
  }

  function renderSetupPlayers() {
    els.playersList.innerHTML = "";
    setupPlayers.forEach((player, index) => {
      const row = document.createElement("div");
      row.className = "player-row";
      row.innerHTML = `
        <label class="field">
          <span><i class="color-dot" style="background:${player.color}"></i>Name</span>
          <input class="player-name" value="${escapeAttr(player.name)}" maxlength="18" />
        </label>
        <label class="field">
          <span>Team</span>
          <select class="player-team">
            <option value="1" ${player.team === 1 ? "selected" : ""}>Team 1</option>
            <option value="2" ${player.team === 2 ? "selected" : ""}>Team 2</option>
          </select>
        </label>
        <label class="field">
          <span>Soldiers</span>
          <select class="player-soldiers">
            ${[1, 2, 3, 4].map((count) => `<option value="${count}" ${player.soldierCount === count ? "selected" : ""}>${count}</option>`).join("")}
          </select>
        </label>
        <button class="danger remove-player" type="button" ${setupPlayers.length <= 2 ? "disabled" : ""}>Remove</button>
      `;
      row.querySelector(".player-name").addEventListener("input", (event) => {
        setupPlayers[index].name = event.target.value.trim() || `Player ${index + 1}`;
        saveSetupOnly();
      });
      row.querySelector(".player-team").addEventListener("change", (event) => {
        setupPlayers[index].team = Number(event.target.value);
        saveSetupOnly();
      });
      row.querySelector(".player-soldiers").addEventListener("change", (event) => {
        setupPlayers[index].soldierCount = Number(event.target.value);
        saveSetupOnly();
      });
      row.querySelector(".remove-player").addEventListener("click", () => {
        setupPlayers.splice(index, 1);
        renderSetupPlayers();
        saveSetupOnly();
      });
      els.playersList.appendChild(row);
    });
  }

  function startNewMatch(message = "") {
    const teams = new Set(setupPlayers.map((player) => Number(player.team)));
    if (teams.size < 2) {
      setMessage("Put at least one player on each team.");
      return;
    }

    const terrain = { circles: generateCircles(), holes: [] };
    const players = setupPlayers.map((player, index) => ({
      name: player.name || `Player ${index + 1}`,
      team: Number(player.team),
      soldierCount: Number(player.soldierCount),
      color: player.color || COLORS[index % COLORS.length],
      currentSoldier: -1,
      soldiers: []
    }));

    const placed = [];
    players.forEach((player) => {
      for (let i = 0; i < player.soldierCount; i += 1) {
        const soldier = generateSoldier(player.team, terrain, placed);
        soldier.alive = true;
        soldier.angle = 0;
        soldier.lastFunction = DEFAULTS[Number(els.modeSelect.value)];
        player.soldiers.push(soldier);
        placed.push(soldier);
      }
    });

    game = {
      phase: "game",
      mode: Number(els.modeSelect.value),
      terrain,
      players,
      currentTurn: Math.floor(Math.random() * players.length) - 1,
      turnStarted: Date.now(),
      winnerTeam: null
    };
    activeShot = null;
    nextTurn(false);
    showGame(message || "Pass the device to the highlighted player and fire a function.");
  }

  function generateCircles() {
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

  function generateSoldier(team, terrain, placed) {
    for (let attempt = 0; attempt < 2500; attempt += 1) {
      const x = Math.round((team === 1 ? 0 : W / 2) + SOLDIER_R + Math.random() * (W / 2 - SOLDIER_R * 2));
      const y = Math.round(SOLDIER_R + Math.random() * (H - SOLDIER_R * 2));
      const clearOfTerrain = !soldierCollidesTerrain(x, y, SOLDIER_R + 4, terrain);
      const clearOfSoldiers = placed.every((other) => Math.abs(other.x - x) >= 22 || Math.abs(other.y - y) >= 22);
      if (clearOfTerrain && clearOfSoldiers) return { x, y };
    }
    return { x: team === 1 ? 50 : W - 50, y: H / 2 };
  }

  function nextTurn(advance = true) {
    if (!game || checkWinner()) return;
    if (pendingTurnTimer) clearTimeout(pendingTurnTimer);
    pendingTurnTimer = null;

    for (let i = 0; i < game.players.length; i += 1) {
      game.currentTurn = (game.currentTurn + 1 + game.players.length) % game.players.length;
      const player = game.players[game.currentTurn];
      if (advancePlayerSoldier(player, advance)) break;
    }
    game.turnStarted = Date.now();
    activeShot = null;
    syncTurnUI();
    setMessage(turnHelpText());
    saveState();
  }

  function advancePlayerSoldier(player, advance) {
    if (!player.soldiers.some((soldier) => soldier.alive)) return false;
    if (!advance && player.currentSoldier >= 0 && player.soldiers[player.currentSoldier]?.alive) return true;

    for (let i = 0; i < player.soldiers.length; i += 1) {
      player.currentSoldier = (player.currentSoldier + 1 + player.soldiers.length) % player.soldiers.length;
      if (player.soldiers[player.currentSoldier].alive) return true;
    }
    return false;
  }

  function syncTurnUI() {
    if (!game) return;
    const player = currentPlayer();
    const soldier = currentSoldier();
    els.modeLabel.textContent = MODE_NAMES[game.mode];
    els.functionLabel.textContent = MODE_LABELS[game.mode];
    els.turnTitle.textContent = game.winnerTeam ? `Team ${game.winnerTeam} wins` : `${player.name}'s turn`;
    els.turnTitle.style.color = player.color;
    els.turnMeta.textContent = game.winnerTeam
      ? "Start a new level or go back to setup."
      : `Team ${player.team} • Soldier ${player.currentSoldier + 1}/${player.soldiers.length}`;
    els.functionInput.value = soldier?.lastFunction || DEFAULTS[game.mode];
    els.functionInput.placeholder = DEFAULTS[game.mode];
    els.angleSlider.value = String(Math.round(radToDeg(soldier?.angle || 0)));
    updateAngleText();
    renderPresets();
    updateControls();
  }

  function renderPresets() {
    const mode = game ? game.mode : Number(els.modeSelect.value);
    els.presetButtons.innerHTML = "";
    PRESETS[mode].forEach((preset) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "secondary";
      button.textContent = preset;
      button.addEventListener("click", () => {
        els.functionInput.value = preset;
        els.functionInput.focus();
      });
      els.presetButtons.appendChild(button);
    });
  }

  function updateControls() {
    const disabled = !game || !!activeShot || !!game.winnerTeam;
    els.fireBtn.disabled = disabled;
    els.functionInput.disabled = disabled;
    els.angleSlider.disabled = disabled || game.mode !== 2;
    els.angleDownBtn.disabled = disabled || game.mode !== 2;
    els.angleUpBtn.disabled = disabled || game.mode !== 2;
    els.skipAnimationBtn.classList.toggle("hidden", !activeShot);
  }

  function setCurrentAngle(degrees) {
    if (!game || activeShot) return;
    const soldier = currentSoldier();
    const clamped = clamp(degrees, -90, 90);
    els.angleSlider.value = String(clamped);
    if (soldier) soldier.angle = degToRad(clamped);
    updateAngleText();
    saveState();
    draw();
  }

  function updateAngleText() {
    els.angleValue.textContent = `${Math.round(Number(els.angleSlider.value))}°`;
  }

  function fireCurrentFunction() {
    if (!game || activeShot || game.winnerTeam) return;
    const expression = els.functionInput.value.trim() || DEFAULTS[game.mode];
    let compiled;
    try {
      compiled = compileExpression(expression);
      compiled(0.37, 0.11, 0.03);
    } catch (error) {
      setMessage(`Function error: ${error.message}`);
      return;
    }

    let shot;
    try {
      shot = computeShot(compiled);
    } catch (error) {
      setMessage(`Shot error: ${error.message}`);
      return;
    }

    if (shot.path.length < 2) {
      setMessage("That function ended immediately. Try something defined near your soldier.");
      return;
    }

    const soldier = currentSoldier();
    soldier.lastFunction = expression;
    soldier.angle = shot.fireAngle;
    activeShot = {
      ...shot,
      startedAt: performance.now(),
      duration: clamp((shot.path.length / SHOT_SPEED) * 1000, 650, 8000),
      progressStep: 0
    };
    setMessage("Firing…");
    updateControls();
    saveState();
  }

  function computeShot(fn) {
    const player = currentPlayer();
    const soldier = currentSoldier();
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
      let x = start.x + rGame * Math.cos(fireAngle);
      let y = start.y + rGame * Math.sin(fireAngle);
      const offset = y - fn(x, 0, 0);
      traceExplicit(path, hits, hitKeys, mirror, x, y, (nextX) => fn(nextX, 0, 0) + offset);
    } else if (game.mode === 1) {
      const slope = fn(start.x, start.y, 0);
      fireAngle = safeAngle(slope);
      let x = start.x + rGame * Math.cos(fireAngle);
      let y = start.y + rGame * Math.sin(fireAngle);
      traceFirstOrder(path, hits, hitKeys, mirror, x, y, fn);
    } else {
      fireAngle = clamp(soldier.angle || 0, -Math.PI / 2, Math.PI / 2);
      let x = start.x + rGame * Math.cos(fireAngle);
      let y = start.y + rGame * Math.sin(fireAngle);
      let dy = Math.tan(clamp(fireAngle, -1.553, 1.553));
      traceSecondOrder(path, hits, hitKeys, mirror, x, y, dy, fn);
    }

    return { path, hits, fireAngle };
  }

  function traceExplicit(path, hits, hitKeys, mirror, x, y, evaluateY) {
    addPathPoint(path, hits, hitKeys, mirror, x, y, 0);
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
      const point = addPathPoint(path, hits, hitKeys, mirror, nx, ny, i);
      x = nx;
      y = ny;
      if (point.collided) break;
    }
  }

  function traceFirstOrder(path, hits, hitKeys, mirror, x, y, fn) {
    addPathPoint(path, hits, hitKeys, mirror, x, y, 0);
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
      const point = addPathPoint(path, hits, hitKeys, mirror, next.x, next.y, i);
      x = next.x;
      y = next.y;
      if (point.collided) break;
    }
  }

  function traceSecondOrder(path, hits, hitKeys, mirror, x, y, dy, fn) {
    addPathPoint(path, hits, hitKeys, mirror, x, y, 0);
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
      const point = addPathPoint(path, hits, hitKeys, mirror, next.x, next.y, i);
      x = next.x;
      y = next.y;
      dy = next.dy;
      if (point.collided) break;
    }
  }

  function addPathPoint(path, hits, hitKeys, mirror, gx, gy, step) {
    const internal = gameToPixel(gx, gy);
    const point = { x: mirror ? W - internal.x : internal.x, y: internal.y };
    path.push(point);
    collectHits(point, hits, hitKeys, step);
    return { collided: terrainCollides(point.x, point.y, game.terrain) };
  }

  function collectHits(point, hits, hitKeys, step) {
    const shooter = currentPlayer();
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

  function tick(now) {
    if (activeShot) {
      const progress = clamp((now - activeShot.startedAt) / activeShot.duration, 0, 1);
      activeShot.progressStep = Math.floor(progress * (activeShot.path.length - 1));
      applyHitsThrough(activeShot.progressStep);
      if (progress >= 1) finishActiveShot();
    }
    updateTimer();
    draw();
    requestAnimationFrame(tick);
  }

  function applyHitsThrough(step) {
    if (!activeShot) return;
    activeShot.hits.forEach((hit) => {
      if (hit.applied || hit.step > step) return;
      const soldier = game.players[hit.playerIndex].soldiers[hit.soldierIndex];
      soldier.alive = false;
      hit.applied = true;
    });
  }

  function finishActiveShot() {
    if (!activeShot || !game) return;
    applyHitsThrough(MAX_STEPS + 1);
    const last = activeShot.path[activeShot.path.length - 1];
    if (last && Number.isFinite(last.x) && Number.isFinite(last.y)) {
      game.terrain.holes.push({ x: last.x, y: last.y, r: EXPLOSION_R });
    }
    const hitCount = activeShot.hits.length;
    activeShot = null;
    updateControls();

    if (checkWinner()) {
      saveState();
      return;
    }

    setMessage(hitCount ? `${hitCount} soldier${hitCount === 1 ? "" : "s"} hit.` : "Miss. Terrain was opened by the explosion.");
    saveState();
    pendingTurnTimer = setTimeout(() => nextTurn(true), 700);
  }

  function updateTimer() {
    if (!game || game.winnerTeam || activeShot) {
      els.timerFill.style.width = game && game.winnerTeam ? "100%" : els.timerFill.style.width;
      return;
    }
    const remaining = Math.max(0, TURN_TIME - (Date.now() - game.turnStarted));
    els.timerFill.style.width = `${(remaining / TURN_TIME) * 100}%`;
    if (remaining <= 0) {
      setMessage("Time up. Turn skipped.");
      nextTurn(true);
    }
  }

  function checkWinner() {
    if (!game) return false;
    const aliveTeams = new Set();
    game.players.forEach((player) => {
      if (player.soldiers.some((soldier) => soldier.alive)) aliveTeams.add(player.team);
    });
    if (aliveTeams.size <= 1) {
      game.winnerTeam = aliveTeams.values().next().value || null;
      setMessage(game.winnerTeam ? `Team ${game.winnerTeam} wins!` : "No soldiers left.");
      syncTurnUI();
      return true;
    }
    return false;
  }

  function draw() {
    if (!els.plane) return;
    const ctx = els.plane.getContext("2d");
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);
    drawGrid(ctx);
    if (game) drawTerrain(ctx, game.terrain);
    drawAxes(ctx);
    if (activeShot) drawShot(ctx);
    if (game) drawSoldiers(ctx);
    if (game?.winnerTeam) drawWinner(ctx);
  }

  function drawGrid(ctx) {
    ctx.save();
    ctx.strokeStyle = "rgba(0,0,0,0.06)";
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
    ctx.strokeStyle = "rgba(0,0,0,0.75)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, H / 2);
    ctx.lineTo(W, H / 2);
    ctx.moveTo(W / 2, 0);
    ctx.lineTo(W / 2, H);
    ctx.stroke();
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillText("-25", 4, H / 2 - 5);
    ctx.fillText("25", W - 22, H / 2 - 5);
    ctx.fillText("15", W / 2 + 5, 14);
    ctx.fillText("-15", W / 2 + 5, H - 6);
    ctx.restore();
  }

  function drawShot(ctx) {
    const player = currentPlayer();
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

  function drawSoldiers(ctx) {
    game.players.forEach((player, playerIndex) => {
      player.soldiers.forEach((soldier, soldierIndex) => {
        const isCurrent = playerIndex === game.currentTurn && soldierIndex === player.currentSoldier && soldier.alive && !game.winnerTeam;
        ctx.save();
        if (!soldier.alive) {
          ctx.strokeStyle = "rgba(90,90,90,0.75)";
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
          ctx.fillStyle = "rgba(155,232,112,0.9)";
          ctx.beginPath();
          ctx.moveTo(soldier.x, soldier.y - 23);
          ctx.lineTo(soldier.x - 8, soldier.y - 34);
          ctx.lineTo(soldier.x + 8, soldier.y - 34);
          ctx.closePath();
          ctx.fill();
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
        ctx.fillStyle = "rgba(0,0,0,0.7)";
        ctx.font = "12px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(player.name, soldier.x, soldier.y - 15);
        ctx.restore();
      });
    });
  }

  function drawWinner(ctx) {
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.56)";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.font = "700 42px system-ui, sans-serif";
    ctx.fillText(`Team ${game.winnerTeam} wins!`, W / 2, H / 2);
    ctx.font = "18px system-ui, sans-serif";
    ctx.fillText("Start a new level to play again", W / 2, H / 2 + 36);
    ctx.restore();
  }

  function terrainCollides(x, y, terrain) {
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

  function soldierCollidesTerrain(x, y, radius, terrain) {
    return (
      terrainCollides(x, y, terrain) ||
      terrainCollides(x + radius, y, terrain) ||
      terrainCollides(x - radius, y, terrain) ||
      terrainCollides(x, y + radius, terrain) ||
      terrainCollides(x, y - radius, terrain)
    );
  }

  function currentPlayer() {
    return game.players[game.currentTurn];
  }

  function currentSoldier() {
    const player = currentPlayer();
    return player?.soldiers[player.currentSoldier];
  }

  function turnHelpText() {
    if (!game) return "";
    const player = currentPlayer();
    return `${player.name}, enter a function and fire. Team ${player.team} shoots ${player.team === 1 ? "right" : "left"}.`;
  }

  function setMessage(text) {
    if (els.messageBox) els.messageBox.textContent = text || "";
  }

  function saveSetupOnly() {
    saveState({ setupOnly: true });
  }

  function saveState(options = {}) {
    const payload = {
      setupPlayers,
      mode: Number(els.modeSelect.value),
      game: options.setupOnly ? null : game,
      savedAt: Date.now()
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
    if (els.saveStatus) {
      els.saveStatus.textContent = "Saved locally";
      els.saveStatus.style.borderColor = "rgba(155, 232, 112, 0.75)";
      clearTimeout(saveFlashTimer);
      saveFlashTimer = setTimeout(() => {
        els.saveStatus.style.borderColor = "";
      }, 650);
    }
  }

  function loadSavedState() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function pixelToGame(px, py) {
    return {
      x: (GAME_W * (px - W / 2)) / W,
      y: (GAME_W * (-py + H / 2)) / W
    };
  }

  function gameToPixel(x, y) {
    return {
      x: (W * x) / GAME_W + W / 2,
      y: (-W * y) / GAME_W + H / 2
    };
  }

  function derivativeX(fn, x, y, dy) {
    const h = STEP;
    return (fn(x + h, y, dy) - fn(x, y, dy)) / h;
  }

  function safeAngle(slope) {
    if (!Number.isFinite(slope)) return 0;
    return Math.atan(slope);
  }

  function distance2Game(x1, y1, x2, y2) {
    return (x1 - x2) ** 2 + (y1 - y2) ** 2;
  }

  function dist2(x1, y1, x2, y2) {
    return (x1 - x2) ** 2 + (y1 - y2) ** 2;
  }

  function randomGaussian() {
    let u = 0;
    let v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function degToRad(degrees) {
    return (degrees * Math.PI) / 180;
  }

  function radToDeg(radians) {
    return (radians * 180) / Math.PI;
  }

  function escapeAttr(value) {
    return String(value).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
  }

  function compileExpression(source) {
    const parser = new ExpressionParser(source);
    const fn = parser.parse();
    return (x, y, dy) => fn({ x, y, dy });
  }

  class ExpressionParser {
    constructor(source) {
      this.source = source;
      this.tokens = tokenize(source);
      this.index = 0;
    }

    parse() {
      if (!this.tokens.length) throw new Error("empty expression");
      const expr = this.parseAdditive();
      if (this.peek()) throw new Error(`unexpected '${this.peek().value}'`);
      return expr;
    }

    parseAdditive() {
      let left = this.parseMultiplicative();
      while (this.match("+") || this.match("-")) {
        const operator = this.previous().value;
        const right = this.parseMultiplicative();
        const oldLeft = left;
        left = operator === "+" ? (env) => oldLeft(env) + right(env) : (env) => oldLeft(env) - right(env);
      }
      return left;
    }

    parseMultiplicative() {
      let left = this.parsePower();
      while (true) {
        if (this.match("*") || this.match("/")) {
          const operator = this.previous().value;
          const right = this.parsePower();
          const oldLeft = left;
          left = operator === "*" ? (env) => oldLeft(env) * right(env) : (env) => oldLeft(env) / right(env);
        } else if (startsPrimary(this.peek())) {
          const right = this.parsePower();
          const oldLeft = left;
          left = (env) => oldLeft(env) * right(env);
        } else {
          break;
        }
      }
      return left;
    }

    parsePower() {
      let left = this.parseUnary();
      if (this.match("^")) {
        const right = this.parsePower();
        const oldLeft = left;
        left = (env) => Math.pow(oldLeft(env), right(env));
      }
      return left;
    }

    parseUnary() {
      if (this.match("+")) return this.parseUnary();
      if (this.match("-")) {
        const value = this.parseUnary();
        return (env) => -value(env);
      }
      return this.parsePrimary();
    }

    parsePrimary() {
      const token = this.advance();
      if (!token) throw new Error("unexpected end");

      if (token.type === "number") return () => token.value;

      if (token.value === "(") {
        const expr = this.parseAdditive();
        if (!this.match(")")) throw new Error("missing ')'");
        return expr;
      }

      if (token.type === "id") {
        const name = token.value;
        if (name === "x") return (env) => env.x;
        if (name === "y") return (env) => env.y;
        if (name === "dy" || name === "yp" || name === "y'") return (env) => env.dy;
        if (name === "pi") return () => Math.PI;
        if (name === "e") return () => Math.E;
        if (FUNCTIONS[name]) {
          let arg;
          if (this.match("(")) {
            arg = this.parseAdditive();
            if (!this.match(")")) throw new Error("missing ')'");
          } else {
            arg = this.parseUnary();
          }
          return (env) => FUNCTIONS[name](arg(env));
        }
      }

      throw new Error(`unknown token '${token.value}'`);
    }

    match(value) {
      if (this.peek()?.value !== value) return false;
      this.index += 1;
      return true;
    }

    advance() {
      const token = this.peek();
      if (token) this.index += 1;
      return token;
    }

    previous() {
      return this.tokens[this.index - 1];
    }

    peek() {
      return this.tokens[this.index];
    }
  }

  const FUNCTIONS = {
    sqrt: Math.sqrt,
    log: Math.log10,
    abs: Math.abs,
    sin: Math.sin,
    sen: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    tg: Math.tan,
    ln: Math.log,
    exp: Math.exp
  };

  function tokenize(source) {
    const tokens = [];
    const names = ["sqrt", "log", "abs", "sin", "sen", "cos", "tan", "tg", "ln", "exp", "dy", "yp", "pi", "x", "y", "e"];
    let i = 0;
    while (i < source.length) {
      const char = source[i];
      if (/\s/.test(char)) {
        i += 1;
        continue;
      }
      if (char === "y" && source[i + 1] === "'") {
        tokens.push({ type: "id", value: "y'" });
        i += 2;
        continue;
      }
      if (/[0-9.]/.test(char)) {
        const match = source.slice(i).match(/^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/);
        if (!match) throw new Error(`bad number near '${source.slice(i)}'`);
        tokens.push({ type: "number", value: Number(match[0]) });
        i += match[0].length;
        continue;
      }
      if ("+-*/^()".includes(char)) {
        tokens.push({ type: "op", value: char });
        i += 1;
        continue;
      }
      const lower = source.slice(i).toLowerCase();
      const name = names.find((candidate) => lower.startsWith(candidate));
      if (name) {
        tokens.push({ type: "id", value: name });
        i += name.length;
        continue;
      }
      throw new Error(`unsupported character '${char}'`);
    }
    return tokens;
  }

  function startsPrimary(token) {
    return !!token && (token.type === "number" || token.type === "id" || token.value === "(");
  }
})();
