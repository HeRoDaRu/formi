// ============================================================
//  FORMI — js/ui.js
//  Render DOM + canvas animado + botones de alimentar
// ============================================================

// ── REFERENCIAS AL DOM ─────────────────────────────────────
const UI = {
  queenStatus: null,
  queenAge: null,
  workerCount: null,
  eggCount: null,
  larvaeCount: null,
  pupaeCount: null,
  sugarBar: null,
  proteinBar: null,
  waterBar: null,
  sugarVal: null,
  proteinVal: null,
  waterVal: null,
  dayCounter: null,
  nestCanvas: null,
  nestCtx: null,
  eventLog: null,
  btnBrood: null,
  btnStorage: null,
  btnTunnel: null,
  offlineOverlay: null,
  offlineMsg: null,
  offlineBar: null,
  gameOverScreen: null,
  feedCooldown: null,
};

// ── INIT ───────────────────────────────────────────────────
function initUI() {
  UI.queenStatus = document.getElementById('queen-status');
  UI.queenAge = document.getElementById('queen-age');
  UI.workerCount = document.getElementById('worker-count');
  UI.eggCount = document.getElementById('egg-count');
  UI.larvaeCount = document.getElementById('larvae-count');
  UI.pupaeCount = document.getElementById('pupae-count');
  UI.sugarBar = document.getElementById('bar-sugar');
  UI.proteinBar = document.getElementById('bar-protein');
  UI.waterBar = document.getElementById('bar-water');
  UI.sugarVal = document.getElementById('val-sugar');
  UI.proteinVal = document.getElementById('val-protein');
  UI.waterVal = document.getElementById('val-water');
  UI.dayCounter = document.getElementById('day-counter');
  UI.nestCanvas = document.getElementById('nest-canvas');
  UI.eventLog = document.getElementById('event-log');
  UI.btnBrood = document.getElementById('btn-brood');
  UI.btnStorage = document.getElementById('btn-storage');
  UI.btnTunnel = document.getElementById('btn-tunnel');
  UI.offlineOverlay = document.getElementById('offline-overlay');
  UI.offlineMsg = document.getElementById('offline-msg');
  UI.offlineBar = document.getElementById('offline-bar');
  UI.gameOverScreen = document.getElementById('game-over');
  UI.feedCooldown = document.getElementById('feed-cooldown');

  if (UI.nestCanvas) {
    UI.nestCtx = UI.nestCanvas.getContext('2d');
    resizeNestCanvas();
    window.addEventListener('resize', resizeNestCanvas);
  }

  // Botones de cámaras
  document.getElementById('chambers - panel')
    ?.addEventListener('click', onChamberClick);

  // Botones de alimentar
  document.getElementById('feed - panel')
    ?.addEventListener('click', onFeedClick);

  // Botones de sistema
  document.getElementById('btn - restart')
    ?.addEventListener('click', onRestart);
  document.getElementById('btn - delete -save')
    ?.addEventListener('click', onDeleteSave);
}

// ── ALIMENTAR ──────────────────────────────────────────────
// El jugador puede alimentar manualmente una vez cada
// FEED_COOLDOWN_MS. Simula preparar la comida y meterla al nido.
const FEED_COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 horas reales
const FEED_AMOUNTS = { sugar: 20, protein: 15, water: 25 };

function onFeedClick(e) {
  const btn = e.target.closest('[data - feed]');
  if (!btn) return;

  const type = btn.dataset.feed;
  const now = Date.now();
  const lastFed = gameState.lastFedTime?.[type] ?? 0;
  const elapsed = now - lastFed;

  if (elapsed < FEED_COOLDOWN_MS) {
    const remaining = Math.ceil((FEED_COOLDOWN_MS - elapsed) / 3600000);
    if (UI.feedCooldown) {
      UI.feedCooldown.textContent =
        `${type === "sugar" ? "Azúcar" : type === "protein" ? "Proteína" : "Agua"}: disponible en ~${remaining}h`;
    }
    return;
  }

  // Aplicar recurso
  const limits = getResourceLimits();
  const amount = FEED_AMOUNTS[type];

  if (type === 'sugar') gameState.sugar = Math.min(limits.sugar, gameState.sugar + amount);
  if (type === 'protein') gameState.protein = Math.min(limits.protein, gameState.protein + amount);
  if (type === 'water') gameState.water = Math.min(limits.water, gameState.water + amount);

  // Guardar timestamp
  if (!gameState.lastFedTime) gameState.lastFedTime = {};
  gameState.lastFedTime[type] = now;

  const label = type === 'sugar' ? 'azúcar' : type === 'protein' ? 'proteína' : 'agua';
  logEvent(`Has alimentado el nido con ${label} (+${amount}).`, 'success');

  if (UI.feedCooldown) UI.feedCooldown.textContent = '';

  render();
  saveGame(true);
}

// ── RENDER PRINCIPAL ───────────────────────────────────────
const _prev = {};

function render() {
  const gs = gameState;
  const limits = getResourceLimits();

  // Día
  _setIfChanged('dayCounter', 'Día ' + gs.gameDay);

  // Reina
  const alive = gs.queen.alive;
  const queenYears = (gs.queen.ageDays / 365).toFixed(1);
  _setIfChanged('queenStatus', alive ? 'Viva' : 'Muerta');
  _setIfChanged('queenAge', queenYears + ' años');

  if (UI.queenStatus) {
    UI.queenStatus.className = 'queen - status ' + (alive ? 'alive' : 'dead');
  }

  // Población
  _setIfChanged('workerCount', _fmt(gs.workers));
  _setIfChanged('eggCount', _fmt(countEggs()));
  _setIfChanged('larvaeCount', _fmt(countLarvae()));
  _setIfChanged('pupaeCount', _fmt(countPupae()));

  // Recursos
  _renderBar('sugar', gs.sugar, limits.sugar);
  _renderBar('protein', gs.protein, limits.protein);
  _renderBar('water', gs.water, limits.water);

  // Cámaras
  _renderChamberButtons();

  // Botones de alimentar (mostrar cooldown restante)
  _renderFeedButtons();

  // Diario
  _renderEventLog();

  // Game over
  if (!alive && gs.workers === 0
    && countEggs() === 0 && countLarvae() === 0 && countPupae() === 0) {
    _showGameOver();
  }
}

function _renderBar(key, current, max) {
  const bar = UI[key + 'Bar'];
  const val = UI[key + 'Val'];
  if (!bar || !val) return;

  const pct = max > 0 ? Math.min(100, (current / max) * 100) : 0;
  const pctStr = pct.toFixed(1) + '%';

  if (_prev[key + 'Pct'] !== pctStr) {
    bar.style.width = pctStr;
    bar.className = 'resource - fill ' + (pct > 40 ? 'ok' : pct > 15 ? 'warn' : 'crit');
    _prev[key + 'Pct'] = pctStr;
  }

  const valStr = Math.floor(current) + ' / ' + max;
  if (_prev[key + 'Val'] !== valStr) {
    val.textContent = valStr;
    _prev[key + 'Val'] = valStr;
  }
}

function _renderChamberButtons() {
  const types = ['brood', 'storage', 'tunnel'];
  for (const type of types) {
    const btn = document.getElementById('btn -' + type);
    if (!btn) continue;

    const reason = canBuildChamber(type);
    btn.disabled = reason !== null;
    btn.title = reason ?? "Construir";

    const count = gameState.chambers[type];
    const def = CONFIG.CHAMBERS[type.toUpperCase()];
    const cost = def.cost ?? {};
    const parts = [];
    if (cost.sugar) parts.push("Az " + cost.sugar);
    if (cost.protein) parts.push("Pr " + cost.protein);
    if (cost.water) parts.push("Ag " + cost.water);

    const countEl = btn.querySelector(".chamber-count");
    const costEl = btn.querySelector(".chamber-cost");
    if (countEl) countEl.textContent = "x" + count;
    if (costEl) costEl.textContent = parts.join(" | ");

  }
}

function _renderFeedButtons() {
  const now = Date.now();
  const types = ['sugar', 'protein', 'water'];
  const panel = document.getElementById('feed - panel');
  if (!panel) return;

  for (const type of types) {
    const btn = panel.querySelector('[data - feed=' + type + ']');
    if (!btn) continue;
    const lastFed = gameState.lastFedTime?.[type] ?? 0;
    const ready = (now - lastFed) >= FEED_COOLDOWN_MS;
    btn.disabled = !ready;

    const amountEl = btn.querySelector(".feed-amount");
    if (amountEl) {
      amountEl.textContent = ready
        ? "+" + FEED_AMOUNTS[type]
        : _formatCooldownShort(FEED_COOLDOWN_MS - (now - lastFed));
    }

  }
}

function _formatCooldownShort(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? h + 'h ' + m + 'm' : m + 'm';
}

function _renderEventLog() {
  if (!UI.eventLog) return;
  const log = gameState.eventLog;
  const firstKey = (log[0]?.day ?? '') + (log[0]?.text ?? '');
  if (_prev.logFirst === firstKey) return;
  _prev.logFirst = firstKey;

  UI.eventLog.innerHTML = log.map(entry => {
    return '<div class="log-entry log-' + entry.type + '">'
      + '<span class="log-day">Día ' + entry.day + '</span>'
      + entry.text
      + '</div>';
  }).join('');
}

// ── CANVAS DEL NIDO ────────────────────────────────────────
const _ants = [];

function resizeNestCanvas() {
  if (!UI.nestCanvas) return;
  const rect = UI.nestCanvas.parentElement.getBoundingClientRect();
  UI.nestCanvas.width = rect.width || 400;
  UI.nestCanvas.height = rect.height || 260;
  _generateAnts();
}

function _generateAnts() {
  _ants.length = 0;
  const count = Math.min(50, Math.max(3, Math.floor(gameState.workers / 4)));
  const w = UI.nestCanvas?.width ?? 400;
  const h = UI.nestCanvas?.height ?? 260;

  for (let i = 0; i < count; i++) {
    _ants.push({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.7,
      vy: (Math.random() - 0.5) * 0.5,
      size: 2.2 + Math.random() * 1.6,
      phase: Math.random() * Math.PI * 2,
    });
  }
}

function renderNest() {
  const ctx = UI.nestCtx;
  if (!ctx) return;

  const w = UI.nestCanvas.width;
  const h = UI.nestCanvas.height;
  const gs = gameState;

  ctx.clearRect(0, 0, w, h);

  // Fondo tierra — más claro que el panel oscuro
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#5a3520');
  grad.addColorStop(0.5, '#4a2a14');
  grad.addColorStop(1, '#3a1e0a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Textura de tierra
  ctx.fillStyle = 'rgba(255, 200, 120, 0.04)';
  for (let i = 0; i < 300; i++) {
    ctx.fillRect(_pseudoRand(i * 7 + 1) * w, _pseudoRand(i * 13 + 3) * h, 1, 1);
  }

  // Cámaras y túneles
  const chambers = _buildChamberLayout(w, h);
  _drawTunnels(ctx, chambers);
  for (const ch of chambers) _drawChamber(ctx, ch);

  // Hormigas
  const target = Math.min(50, Math.max(3, Math.floor(gs.workers / 4)));
  if (Math.abs(_ants.length - target) > 5) _generateAnts();

  const t = Date.now() / 1000;
  for (const ant of _ants) {
    ant.x += ant.vx;
    ant.y += ant.vy;
    if (ant.x < 4 || ant.x > w - 4) ant.vx *= -1;
    if (ant.y < 4 || ant.y > h - 4) ant.vy *= -1;
    _drawAnt(ctx, ant, t);
  }

  // Stats superpuestas
  _drawNestStats(ctx, w, h);
}

function _buildChamberLayout(w, h) {
  const chambers = [];

  // Cámara real — centro superior
  chambers.push({
    x: w * 0.5, y: h * 0.22,
    rx: w * 0.11, ry: h * 0.10,
    label: 'R', color: 'rgba(200,160,40,0.22)', border: 'rgba(230,190,70,0.55)',
  });

  // Cámaras de cría
  const brood = Math.max(1, Math.min(3, gameState.chambers.brood));
  for (let i = 0; i < brood; i++) {
    chambers.push({
      x: w * (0.22 + i * 0.28), y: h * 0.60,
      rx: w * 0.10, ry: h * 0.09,
      label: 'C', color: 'rgba(80,160,60,0.18)', border: 'rgba(100,200,70,0.45)',
    });
  }

  // Almacenes
  const storage = Math.min(2, gameState.chambers.storage);
  for (let i = 0; i < storage; i++) {
    chambers.push({
      x: w * (0.18 + i * 0.64), y: h * 0.83,
      rx: w * 0.09, ry: h * 0.07,
      label: 'A', color: 'rgba(60,100,180,0.18)', border: 'rgba(80,140,220,0.45)',
    });
  }

  return chambers;
}

function _drawTunnels(ctx, chambers) {
  if (chambers.length < 2) return;
  ctx.lineWidth = 5;
  ctx.strokeStyle = 'rgba(160, 90, 30, 0.35)';

  // Túnel vertical desde superficie a cámara real
  ctx.beginPath();
  ctx.moveTo(chambers[0].x, 0);
  ctx.lineTo(chambers[0].x, chambers[0].y - chambers[0].ry);
  ctx.stroke();

  // Conectar cámaras con curvas bezier desde la cámara real
  for (let i = 1; i < chambers.length; i++) {
    const from = chambers[0];
    const to = chambers[i];
    ctx.beginPath();
    ctx.moveTo(from.x, from.y + from.ry);
    ctx.bezierCurveTo(
      from.x, (from.y + to.y) / 2,
      to.x, (from.y + to.y) / 2,
      to.x, to.y - to.ry
    );
    ctx.strokeStyle = 'rgba(140, 80, 25, 0.30)';
    ctx.lineWidth = 4;
    ctx.stroke();
  }
}

function _drawChamber(ctx, ch) {
  ctx.save();
  ctx.translate(ch.x, ch.y);

  ctx.beginPath();
  ctx.ellipse(0, 0, ch.rx, ch.ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = ch.color;
  ctx.fill();
  ctx.strokeStyle = ch.border;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Letra de tipo en lugar de emoji (más fiable cross-platform)
  ctx.font = 'bold ' + Math.floor(ch.ry * 0.7) + 'px "Source Code Pro", monospace';
  ctx.fillStyle = 'rgba(230, 180, 80, 0.7)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(ch.label, 0, 0);

  ctx.restore();
}

function _drawAnt(ctx, ant, t) {
  ctx.save();
  ctx.translate(ant.x, ant.y);
  ctx.rotate(Math.atan2(ant.vy, ant.vx));

  const s = ant.size;

  // Abdomen
  ctx.beginPath();
  ctx.ellipse(-s * 1.4, 0, s * 1.1, s * 0.75, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#c87828'; // ámbar oscuro — visible sobre tierra
  ctx.fill();

  // Tórax
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.7, s * 0.6, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#b86820';
  ctx.fill();

  // Cabeza
  ctx.beginPath();
  ctx.arc(s * 1.3, 0, s * 0.6, 0, Math.PI * 2);
  ctx.fillStyle = '#a85818';
  ctx.fill();

  // Patas (3 pares animados)
  const swing = Math.sin(t * 9 + ant.phase) * 2.5;
  ctx.strokeStyle = 'rgba(80, 40, 10, 0.9)';
  ctx.lineWidth = 0.8;
  for (let i = -1; i <= 1; i++) {
    const lx = i * s * 0.5;
    ctx.beginPath();
    ctx.moveTo(lx, 0);
    ctx.lineTo(lx - 1.5, s * 1.2 + swing * (i || 0.5));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(lx, 0);
    ctx.lineTo(lx + 1.5, -s * 1.2 - swing * (i || 0.5));
    ctx.stroke();
  }

  // Antenas
  ctx.strokeStyle = 'rgba(100, 50, 10, 0.85)';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(s * 1.7, -s * 0.3);
  ctx.lineTo(s * 2.8, -s * 1.3 + swing * 0.3);
  ctx.moveTo(s * 1.7, s * 0.3);
  ctx.lineTo(s * 2.8, s * 1.3 - swing * 0.3);
  ctx.stroke();

  ctx.restore();
}

function _drawNestStats(ctx, w, h) {
  const gs = gameState;
  ctx.font = '11px "Courier New", monospace';
  ctx.fillStyle = 'rgba(240, 200, 120, 0.8)';
  ctx.textAlign = 'left';

  const lines = [
    'Obreras: ' + _fmt(gs.workers),
    'Huevos:  ' + _fmt(countEggs()),
    'Larvas:  ' + _fmt(countLarvae()),
    'Pupas:   ' + _fmt(countPupae()),
  ];

  lines.forEach((line, i) => {
    ctx.fillText(line, 8, h - 8 - (lines.length - 1 - i) * 16);
  });
}

// ── GAME OVER ──────────────────────────────────────────────
function _showGameOver() {
  if (!UI.gameOverScreen) return;
  if (UI.gameOverScreen.classList.contains('visible')) return;

  const daysEl = document.getElementById('gameover - days');
  const peakEl = document.getElementById('gameover - peak');
  const causeEl = document.getElementById('gameover - cause');

  if (daysEl) daysEl.textContent = gameState.stats.daysPlayed;
  if (peakEl) peakEl.textContent = _fmt(gameState.stats.peakWorkers);
  if (causeEl) causeEl.textContent = !gameState.queen.alive
    ? 'la reina murió'
    : 'todas las obreras perecieron';

  UI.gameOverScreen.classList.add('visible');
}

// ── CONSTRUCCIÓN DE CÁMARAS ────────────────────────────────
function onChamberClick(e) {
  const btn = e.target.closest('[data - chamber]');
  if (!btn) return;

  const built = buildChamber(btn.dataset.chamber);
  if (built) {
    render();
    saveGame(true);
  }
}

// ── SISTEMA ────────────────────────────────────────────────
function onRestart() {
  deleteSave();
  UI.gameOverScreen?.classList.remove('visible');
  render();
}

function onDeleteSave() {
  if (!confirm('Borrar la partida.Esta accion no se puede deshacer.')) return;
  deleteSave();
  render();
}

// ── OVERLAY OFFLINE ────────────────────────────────────────
function offlineProgressHandler({ phase, current, total }) {
  if (!UI.offlineOverlay) return;

  if (phase === 'start') {
    UI.offlineOverlay.classList.add('visible');
    if (UI.offlineMsg) UI.offlineMsg.textContent = 'Simulando ' + total + ' dias…';
    if (UI.offlineBar) UI.offlineBar.style.width = '0 %';
  }

  if (phase === 'progress' && UI.offlineBar) {
    UI.offlineBar.style.width = Math.round((current / total) * 100) + '%';
    if (UI.offlineMsg) UI.offlineMsg.textContent = 'Simulando… ' + current + '/' + total;
  }

  if (phase === 'done') {
    if (UI.offlineBar) UI.offlineBar.style.width = '100 %';
    if (UI.offlineMsg) UI.offlineMsg.textContent = 'Listo.';
    setTimeout(() => UI.offlineOverlay?.classList.remove('visible'), 800);
  }
}

// ── HELPERS ────────────────────────────────────────────────
function _fmt(n) {
  return Math.floor(n).toLocaleString('es-ES');
}

function _setIfChanged(key, value) {
  const el = UI[key];
  if (!el) return;
  if (_prev[key] !== value) {
    el.textContent = value;
    _prev[key] = value;
  }
}

function _pseudoRand(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}