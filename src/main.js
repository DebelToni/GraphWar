import { COLORS, MODE_LABELS, MODE_NAMES, SHOT_SPEED, TURN_TIME } from "./constants.js";
import { compileExpression } from "./math.js";
import { draw } from "./render.js";
import { addExplosionHole, computeShot, generateCircles, generateSoldier } from "./simulation.js";
import { clearSavedState, loadSavedState, saveState as persistState } from "./storage.js";
import { clamp, degToRad, escapeAttr, radToDeg } from "./utils.js";

const $ = (id) => document.getElementById(id);

const els = {};
let setupPlayers = [];
let game = null;
let activeShot = null;
let formulaCursor = 0;
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
    angleValue: $("angleValue"),
    angleSlider: $("angleSlider"),
    angleDownBtn: $("angleDownBtn"),
    angleUpBtn: $("angleUpBtn"),
    fireBtn: $("fireBtn"),
    skipAnimationBtn: $("skipAnimationBtn"),
    newLevelBtn: $("newLevelBtn"),
    backSetupBtn: $("backSetupBtn"),
    messageBox: $("messageBox"),
    formulaButtons: [...document.querySelectorAll(".formula-keypad button")]
  });

  preventMobileGestures();
  bindEvents();

  const saved = loadSavedState();
  if (saved) {
    setupPlayers = saved.setupPlayers || defaultPlayers();
    if (saved.mode !== undefined) els.modeSelect.value = String(saved.mode);
    if (saved.game?.phase === "game") {
      game = saved.game;
      game.turnStarted = Date.now();
      normalizeSavedGame(game);
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
  els.modeSelect.addEventListener("change", saveSetupOnly);
  els.addPlayerBtn.addEventListener("click", addSetupPlayer);
  els.startGameBtn.addEventListener("click", () => startNewMatch());
  els.resetSaveBtn.addEventListener("click", clearSaveAndReset);
  els.resumeGameBtn.addEventListener("click", resumeSavedGame);
  els.fireBtn.addEventListener("click", fireCurrentFunction);
  els.skipAnimationBtn.addEventListener("click", finishActiveShot);
  els.newLevelBtn.addEventListener("click", startNextLevel);
  els.backSetupBtn.addEventListener("click", returnToSetup);
  els.angleSlider.addEventListener("input", () => setCurrentAngle(Number(els.angleSlider.value)));
  els.angleDownBtn.addEventListener("click", () => setCurrentAngle(Number(els.angleSlider.value) - 5));
  els.angleUpBtn.addEventListener("click", () => setCurrentAngle(Number(els.angleSlider.value) + 5));
  els.functionInput.addEventListener("click", rememberFormulaCursor);
  els.functionInput.addEventListener("keyup", rememberFormulaCursor);
  bindFormulaPad();
}

function bindFormulaPad() {
  els.formulaButtons.forEach((button) => {
    button.addEventListener("pointerdown", (event) => event.preventDefault());
    button.addEventListener("click", () => {
      if (!game || activeShot || game.winnerTeam) return;
      if (button.dataset.key) insertFormulaText(button.dataset.key);
      if (button.dataset.wrap) wrapFormulaText(button.dataset.wrap);
      if (button.dataset.action) runFormulaAction(button.dataset.action);
    });
  });
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

function addSetupPlayer() {
  if (setupPlayers.length >= 8) return;
  const next = setupPlayers.length + 1;
  setupPlayers.push({ name: `Player ${next}`, team: next % 2 === 0 ? 2 : 1, soldierCount: 2, color: COLORS[(next - 1) % COLORS.length] });
  renderSetupPlayers();
  saveSetupOnly();
}

function clearSaveAndReset() {
  clearSavedState();
  game = null;
  activeShot = null;
  setupPlayers = defaultPlayers();
  els.modeSelect.value = "0";
  showSetup("Save cleared.");
}

function resumeSavedGame() {
  const saved = loadSavedState();
  if (!saved?.game) return;
  game = saved.game;
  game.turnStarted = Date.now();
  normalizeSavedGame(game);
  showGame("Restored saved local match.");
}

function startNextLevel() {
  if (!game) return;
  setupPlayers = game.players.map((player) => ({
    name: player.name,
    team: player.team,
    soldierCount: player.soldierCount,
    color: player.color
  }));
  els.modeSelect.value = String(game.mode);
  startNewMatch("New level started.");
}

function returnToSetup() {
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
}

function showSetup(message = "") {
  document.body.classList.remove("play-mode");
  els.setupPanel.classList.remove("hidden");
  els.gamePanel.classList.add("hidden");
  const saved = loadSavedState();
  els.resumeGameBtn.classList.toggle("hidden", !saved?.game);
  renderSetupPlayers();
  setMessage(message);
  draw(els.plane, game, activeShot);
}

function showGame(message = "") {
  document.body.classList.add("play-mode");
  els.setupPanel.classList.add("hidden");
  els.gamePanel.classList.remove("hidden");
  syncTurnUI();
  setMessage(message || turnHelpText());
  saveCurrentState();
  draw(els.plane, game, activeShot);
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
      soldier.lastFunction = "";
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
  showGame(message || "Pass the phone to the highlighted player.");
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
  saveCurrentState();
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
  setFormulaDisplay(soldier?.lastFunction || "", (soldier?.lastFunction || "").length);
  els.angleSlider.value = String(Math.round(radToDeg(soldier?.angle || 0)));
  updateAngleText();
  updateControls();
}

function updateControls() {
  const disabled = !game || !!activeShot || !!game.winnerTeam;
  els.fireBtn.disabled = disabled;
  els.functionInput.disabled = disabled;
  els.angleSlider.disabled = disabled || game.mode !== 2;
  els.angleDownBtn.disabled = disabled || game.mode !== 2;
  els.angleUpBtn.disabled = disabled || game.mode !== 2;
  els.formulaButtons.forEach((button) => {
    button.disabled = disabled;
  });
  els.skipAnimationBtn.classList.toggle("hidden", !activeShot);
}

function setCurrentAngle(degrees) {
  if (!game || activeShot) return;
  const soldier = currentSoldier();
  const clamped = clamp(degrees, -90, 90);
  els.angleSlider.value = String(clamped);
  if (soldier) soldier.angle = degToRad(clamped);
  updateAngleText();
  saveCurrentState();
  draw(els.plane, game, activeShot);
}

function updateAngleText() {
  els.angleValue.textContent = `${Math.round(Number(els.angleSlider.value))}°`;
}

function fireCurrentFunction() {
  if (!game || activeShot || game.winnerTeam) return;
  const expression = els.functionInput.value.trim();
  if (!expression) {
    setMessage("Enter a formula with the side buttons.");
    return;
  }

  let compiled;
  try {
    compiled = compileExpression(expression);
  } catch (error) {
    setMessage(`Function error: ${error.message}`);
    return;
  }

  let shot;
  try {
    shot = computeShot(game, compiled);
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
  setMessage(shot.lengthLimited ? "Firing… max graph length will stop this shot." : "Firing…");
  updateControls();
  saveCurrentState();
}

function tick(now) {
  if (activeShot) {
    const progress = clamp((now - activeShot.startedAt) / activeShot.duration, 0, 1);
    activeShot.progressStep = Math.floor(progress * (activeShot.path.length - 1));
    applyHitsThrough(activeShot.progressStep);
    if (progress >= 1) finishActiveShot();
  }
  updateTimer();
  draw(els.plane, game, activeShot);
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
  applyHitsThrough(Number.MAX_SAFE_INTEGER);
  const last = activeShot.path[activeShot.path.length - 1];
  addExplosionHole(game.terrain, last);
  const hitCount = activeShot.hits.length;
  const wasLengthLimited = activeShot.lengthLimited;
  activeShot = null;
  updateControls();

  if (checkWinner()) {
    saveCurrentState();
    return;
  }

  if (hitCount) {
    setMessage(`${hitCount} soldier${hitCount === 1 ? "" : "s"} hit.`);
  } else if (wasLengthLimited) {
    setMessage("Shot reached max graph length and exploded.");
  } else {
    setMessage("Miss. Terrain was opened by the explosion.");
  }
  saveCurrentState();
  pendingTurnTimer = setTimeout(() => nextTurn(true), 700);
}

function updateTimer() {
  if (!game || !els.timerFill) return;
  if (game.winnerTeam || activeShot) return;
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

function insertFormulaText(text) {
  const [start, end] = getFormulaSelection();
  const value = els.functionInput.value;
  setFormula(value.slice(0, start) + text + value.slice(end), start + text.length);
}

function wrapFormulaText(name) {
  const [start, end] = getFormulaSelection();
  const value = els.functionInput.value;
  const selected = value.slice(start, end);
  const next = selected ? `${name}(${selected})` : `${name}()`;
  const cursor = selected ? start + next.length : start + name.length + 1;
  setFormula(value.slice(0, start) + next + value.slice(end), cursor);
}

function runFormulaAction(action) {
  const [start, end] = getFormulaSelection();
  const value = els.functionInput.value;
  if (action === "left") return setFormulaDisplay(value, Math.max(0, start - 1));
  if (action === "right") return setFormulaDisplay(value, Math.min(value.length, end + 1));
  if (action === "clear") return setFormula("", 0);
  if (action === "backspace") {
    if (start !== end) return setFormula(value.slice(0, start) + value.slice(end), start);
    if (start > 0) return setFormula(value.slice(0, start - 1) + value.slice(end), start - 1);
  }
  return undefined;
}

function setFormula(nextValue, cursor) {
  if (nextValue.length > 160) {
    setMessage("Formula is too long.");
    return;
  }
  const soldier = currentSoldier();
  if (soldier) soldier.lastFunction = nextValue;
  setFormulaDisplay(nextValue, cursor);
  saveCurrentState();
}

function setFormulaDisplay(value, cursor) {
  formulaCursor = clamp(cursor, 0, value.length);
  els.functionInput.value = value;
  requestAnimationFrame(() => {
    try {
      els.functionInput.focus({ preventScroll: true });
    } catch {
      els.functionInput.focus();
    }
    els.functionInput.setSelectionRange(formulaCursor, formulaCursor);
  });
}

function getFormulaSelection() {
  const start = els.functionInput.selectionStart ?? formulaCursor;
  const end = els.functionInput.selectionEnd ?? start;
  formulaCursor = end;
  return [start, end];
}

function rememberFormulaCursor() {
  formulaCursor = els.functionInput.selectionEnd ?? formulaCursor;
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
  return `${player.name}: build a formula. Team ${player.team} shoots ${player.team === 1 ? "right" : "left"}.`;
}

function setMessage(text) {
  if (els.messageBox) els.messageBox.textContent = text || "";
}

function saveSetupOnly() {
  persistState({ setupPlayers, mode: Number(els.modeSelect.value), game: null });
  flashSaveStatus();
}

function saveCurrentState() {
  persistState({ setupPlayers, mode: Number(els.modeSelect.value), game });
  flashSaveStatus();
}

function flashSaveStatus() {
  if (!els.saveStatus) return;
  els.saveStatus.textContent = "Saved locally";
  els.saveStatus.style.borderColor = "#e7e08b";
  clearTimeout(saveFlashTimer);
  saveFlashTimer = setTimeout(() => {
    els.saveStatus.style.borderColor = "";
  }, 650);
}

function normalizeSavedGame(savedGame) {
  savedGame.players.forEach((player) => {
    player.soldiers.forEach((soldier) => {
      if (typeof soldier.lastFunction !== "string") soldier.lastFunction = "";
      if (typeof soldier.angle !== "number") soldier.angle = 0;
    });
  });
}
