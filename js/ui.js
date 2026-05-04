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
  document.getElementById('chambers-panel')
    ?.addEventListener('click', onChamberClick);

  // Botones de alimentar
  document.getElementById('feed-panel')
    ?.addEventListener('click', onFeedClick);

  // Botones de sistema
  document.getElementById('btn-restart')
    ?.addEventListener('click', onRestart);
  // btn-delete-save usa onclick inline en index.html → window.formiResetGame

  // Botones de órdenes
  document.getElementById('orders-queue-panel')
    ?.addEventListener('click', onOrderQueueClick);
  document.getElementById('orders-active')
    ?.addEventListener('click', onActiveOrderClick);

  // Pan / zoom del nido
  _initNestControls();
}

// ── ALIMENTAR ──────────────────────────────────────────────
// El jugador puede alimentar manualmente una vez cada
// FEED_COOLDOWN_MS. Simula preparar la comida y meterla al nido.
const FEED_COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 horas reales
const FEED_AMOUNTS = { sugar: 20, protein: 15, water: 25 };

function onFeedClick(e) {
  const btn = e.target.closest('[data-feed]');
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
    UI.queenStatus.className = 'queen-status ' + (alive ? 'alive' : 'dead');
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

  // Órdenes
  _renderOrders();

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
    bar.className = 'resource-fill ' + (pct > 40 ? 'ok' : pct > 15 ? 'warn' : 'crit');
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
    const btn = document.getElementById('btn-' + type);
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
  const panel = document.getElementById('feed-panel');
  if (!panel) return;

  for (const type of types) {
    const btn = panel.querySelector('[data-feed="' + type + '"]');
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
// Población visual organizada por espacio (cámara o túnel).
// Las hormigas no flotan libres: cada una pertenece a una cámara
// o recorre un túnel concreto.
const _residents = [];   // hormigas dentro de una cámara
const _foragers = [];    // hormigas patrullando túneles internos
const _surfaceWalkers = []; // hormigas que salen al exterior y vuelven (gather-*)
const _brood = [];       // huevos / larvas / pupas estáticos
let _layout = null;      // { w, h, chambers, tunnels }
let _popSig = '';        // firma del estado para regenerar población

function resizeNestCanvas() {
  if (!UI.nestCanvas) return;
  const rect = UI.nestCanvas.parentElement.getBoundingClientRect();
  UI.nestCanvas.width = rect.width || 400;
  UI.nestCanvas.height = rect.height || 260;
  _layout = null;
  _popSig = '';
  _view.fit = true;
}

// ── VISTA (PAN / ZOOM) ─────────────────────────────────────
const _view = { scale: 1, ox: 0, oy: 0, fit: true };
const _MIN_SCALE = 0.15;
const _MAX_SCALE = 4;

function _fitView() {
  if (!_layout || !UI.nestCanvas) return;
  const cs = _layout.chambers;
  if (cs.length === 0) { _view.scale = 1; _view.ox = 0; _view.oy = 0; return; }
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const c of cs) {
    minX = Math.min(minX, c.x - c.rx);
    maxX = Math.max(maxX, c.x + c.rx);
    minY = Math.min(minY, c.y - c.ry);
    maxY = Math.max(maxY, c.y + c.ry);
  }
  // Margen para túnel vertical, superficie y aire
  const padTop = 220, pad = 40;
  minY -= padTop; maxY += pad; minX -= pad; maxX += pad;

  const w = UI.nestCanvas.width;
  const h = UI.nestCanvas.height;
  const sx = w / (maxX - minX);
  const sy = h / (maxY - minY);
  const s = Math.max(_MIN_SCALE, Math.min(_MAX_SCALE, Math.min(sx, sy)));
  _view.scale = s;
  _view.ox = (w - (maxX + minX) * s) / 2;
  _view.oy = (h - (maxY + minY) * s) / 2;
  _view.fit = false;
}

function _zoomBy(factor, anchorX, anchorY) {
  const w = UI.nestCanvas?.width ?? 0;
  const h = UI.nestCanvas?.height ?? 0;
  const ax = anchorX ?? w / 2;
  const ay = anchorY ?? h / 2;
  const newScale = Math.max(_MIN_SCALE, Math.min(_MAX_SCALE, _view.scale * factor));
  const k = newScale / _view.scale;
  // Mantener el punto bajo el cursor estable
  _view.ox = ax - (ax - _view.ox) * k;
  _view.oy = ay - (ay - _view.oy) * k;
  _view.scale = newScale;
  _view.fit = false;
}

function _initNestControls() {
  const cv = UI.nestCanvas;
  if (!cv) return;

  document.getElementById('nest-zoom-in')
    ?.addEventListener('click', () => _zoomBy(1.3));
  document.getElementById('nest-zoom-out')
    ?.addEventListener('click', () => _zoomBy(1 / 1.3));
  document.getElementById('nest-fit')
    ?.addEventListener('click', () => { _view.fit = true; });

  let dragging = false;
  let lastX = 0, lastY = 0;

  const start = (x, y) => { dragging = true; lastX = x; lastY = y; cv.classList.add('dragging'); };
  const move = (x, y) => {
    if (!dragging) return;
    _view.ox += (x - lastX);
    _view.oy += (y - lastY);
    lastX = x; lastY = y;
    _view.fit = false;
  };
  const end = () => { dragging = false; cv.classList.remove('dragging'); };

  cv.addEventListener('mousedown', e => start(e.clientX, e.clientY));
  window.addEventListener('mousemove', e => move(e.clientX, e.clientY));
  window.addEventListener('mouseup', end);

  cv.addEventListener('wheel', e => {
    e.preventDefault();
    const rect = cv.getBoundingClientRect();
    const ax = e.clientX - rect.left;
    const ay = e.clientY - rect.top;
    _zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12, ax, ay);
  }, { passive: false });

  // Touch: arrastre con un dedo, pinch con dos
  let pinchDist = 0;
  cv.addEventListener('touchstart', e => {
    if (e.touches.length === 1) {
      start(e.touches[0].clientX, e.touches[0].clientY);
    } else if (e.touches.length === 2) {
      dragging = false;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchDist = Math.hypot(dx, dy);
    }
  }, { passive: false });
  cv.addEventListener('touchmove', e => {
    e.preventDefault();
    if (e.touches.length === 1 && dragging) {
      move(e.touches[0].clientX, e.touches[0].clientY);
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const d = Math.hypot(dx, dy);
      if (pinchDist > 0) {
        const rect = cv.getBoundingClientRect();
        const ax = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
        const ay = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
        _zoomBy(d / pinchDist, ax, ay);
      }
      pinchDist = d;
    }
  }, { passive: false });
  cv.addEventListener('touchend', () => { end(); pinchDist = 0; });
}

function _populationSignature() {
  const gs = gameState;
  const broodTotal = countEggs() + countLarvae() + countPupae();
  const taskHash = (gs.tasks ?? []).map(t => t.type + ':' + t.assigned).join(',');
  return [
    UI.nestCanvas?.width | 0,
    UI.nestCanvas?.height | 0,
    gs.queen.alive ? 1 : 0,
    Math.floor(gs.workers / 10),
    Math.floor(broodTotal / 20),
    gs.chambers.brood, gs.chambers.storage, gs.chambers.tunnel,
    taskHash,
  ].join('|');
}

function _ensurePopulation() {
  const sig = _populationSignature();
  if (sig === _popSig && _layout) return;
  _popSig = sig;
  _generatePopulation();
  if (_view.fit) _fitView();
}

function _generatePopulation() {
  _residents.length = 0;
  _foragers.length = 0;
  _surfaceWalkers.length = 0;
  _brood.length = 0;

  const w = UI.nestCanvas?.width ?? 400;
  const h = UI.nestCanvas?.height ?? 260;
  const chambers = _buildChamberLayout();
  const tunnels = _buildTunnels(chambers);
  _layout = { w, h, chambers, tunnels };

  const gs = gameState;
  const royal = chambers.find(c => c.role === 'royal');
  const broodChambers = chambers.filter(c => c.role === 'brood');

  if (royal && gs.queen.alive) {
    _residents.push(_makeResident(royal, { isQueen: true }));
  }

  // Cría visible
  const eggs = countEggs();
  const larvae = countLarvae();
  const pupae = countPupae();
  const visualPerType = (n) => Math.min(8, Math.ceil(Math.log2(n + 1) * 2));
  if (broodChambers.length > 0) {
    const placeBrood = (count, type) => {
      for (let i = 0; i < count; i++) {
        const ch = broodChambers[i % broodChambers.length];
        _brood.push(_makeBrood(ch, type, i));
      }
    };
    placeBrood(visualPerType(eggs), 'egg');
    placeBrood(visualPerType(larvae), 'larva');
    placeBrood(visualPerType(pupae), 'pupa');
  }

  // ── Reparto visual según tareas activas ───────────────────
  const tasks = gs.tasks ?? [];
  const totalAssigned = tasks.reduce((s, t) => s + (t.assigned || 0), 0);
  const VISUAL_CAP = 28;
  const compress = (n) => totalAssigned > 0
    ? Math.max(0, Math.min(VISUAL_CAP, Math.round(n * VISUAL_CAP / Math.max(VISUAL_CAP, totalAssigned))))
    : 0;

  for (const task of tasks) {
    const def = TASK_DEFS[task.type];
    if (!def || task.assigned <= 0) continue;
    const visualCount = Math.max(1, compress(task.assigned));

    if (def.kind === 'directive' && task.type !== 'patrol') {
      // gather-*: salen al exterior y vuelven
      for (let i = 0; i < visualCount; i++) {
        if (royal) _surfaceWalkers.push(_makeSurfaceWalker(royal, def.resource, i));
      }
    } else if (task.type === 'patrol') {
      // Patrullar: caminan los túneles internos
      if (tunnels.length > 0) {
        for (let i = 0; i < visualCount; i++) {
          _foragers.push({
            tunnelIndex: i % tunnels.length,
            t: Math.random(),
            dir: Math.random() < 0.5 ? 1 : -1,
            speed: 0.0015 + Math.random() * 0.002,
            size: 2.4 + Math.random() * 0.8,
            phase: Math.random() * Math.PI * 2,
            x: 0, y: 0, vx: 1, vy: 0,
          });
        }
      }
    } else if (def.kind === 'project') {
      // dig-tunnel / build-*: cluster en una "obra" pegada al borde del nido
      const site = _pickBuildSite(chambers);
      for (let i = 0; i < visualCount; i++) {
        const ant = _makeResident(site, { builder: true });
        _residents.push(ant);
      }
    }
  }

  // Obreras ociosas: enfermeras dispersas en cámaras existentes
  const idleWorkers = Math.max(0, gs.workers - totalAssigned);
  const idleVis = Math.min(8, Math.ceil(Math.log2(idleWorkers + 1)));
  for (let i = 0; i < idleVis; i++) {
    const pool = i % 2 === 0 && broodChambers.length > 0
      ? broodChambers
      : (royal ? [royal] : broodChambers);
    if (pool.length === 0) break;
    const ch = pool[i % pool.length];
    _residents.push(_makeResident(ch));
  }
}

function _pickBuildSite(chambers) {
  const sorted = [...chambers].sort((a, b) => b.y - a.y);
  const anchor = sorted[0] || chambers[0];
  const sign = anchor.x >= 0 ? 1 : -1;
  return {
    id: 'site',
    role: 'site',
    x: anchor.x + sign * 110,
    y: anchor.y + 90,
    rx: 36, ry: 28,
    label: '', color: 'rgba(0,0,0,0)', border: 'rgba(0,0,0,0)',
  };
}

function _makeSurfaceWalker(royal, resource, idx) {
  return {
    resource: resource || 'sugar',
    phase: idx % 4 === 0 ? 'inside' : 'going-up',
    t: Math.random() * 0.4,
    phaseTimer: 0.5 + Math.random() * 1.5,
    size: 2.3 + Math.random() * 0.9,
    phaseAnim: Math.random() * Math.PI * 2,
    carrying: false,
    x: royal.x, y: royal.y - royal.ry * 0.5,
    vx: 0, vy: -0.3,
    waitX: 0, waitY: 0,
  };
}

function _makeResident(chamber, opts = {}) {
  const angle = Math.random() * Math.PI * 2;
  const r = Math.sqrt(Math.random()) * 0.7;
  const speedMul = opts.builder ? 1.8 : 1;
  return {
    chamberId: chamber.id,
    chamber: opts.builder ? chamber : null, // builder: cámara fantasma
    x: chamber.x + Math.cos(angle) * chamber.rx * r,
    y: chamber.y + Math.sin(angle) * chamber.ry * r,
    vx: (Math.random() - 0.5) * 0.5 * speedMul,
    vy: (Math.random() - 0.5) * 0.4 * speedMul,
    size: opts.isQueen ? 4.2 : 2.2 + Math.random() * 1.4,
    phase: Math.random() * Math.PI * 2,
    isQueen: !!opts.isQueen,
    builder: !!opts.builder,
  };
}

function _makeBrood(chamber, type, seed) {
  // Posiciones determinísticas por seed para que no salten al regenerar
  const a = _pseudoRand(seed * 31 + chamber.x) * Math.PI * 2;
  const r = _pseudoRand(seed * 17 + chamber.y) * 0.65 + 0.1;
  return {
    chamberId: chamber.id,
    x: chamber.x + Math.cos(a) * chamber.rx * r,
    y: chamber.y + Math.sin(a) * chamber.ry * r,
    type,
  };
}

function _buildTunnels(chambers) {
  const byId = new Map(chambers.map(c => [c.id, c]));
  const tunnels = [];
  for (const ch of chambers) {
    if (!ch.parentId) continue;
    const parent = byId.get(ch.parentId);
    if (!parent) continue;

    const dx = ch.x - parent.x;
    const dy = ch.y - parent.y;
    const angle = Math.atan2(dy, dx);

    // Puntos de salida/entrada en el borde de cada cámara (no en el centro)
    const p0 = {
      x: parent.x + Math.cos(angle) * parent.rx * 0.95,
      y: parent.y + Math.sin(angle) * parent.ry * 0.95,
    };
    const p3 = {
      x: ch.x - Math.cos(angle) * ch.rx * 0.95,
      y: ch.y - Math.sin(angle) * ch.ry * 0.95,
    };

    // Curva con ondulación lateral perpendicular al eje
    const seed = Math.abs(ch.x * 31 + ch.y * 17);
    const wobbleAmp = (_pseudoRand(seed) - 0.5) * 70;
    const perpX = -Math.sin(angle);
    const perpY =  Math.cos(angle);
    const mx = (p0.x + p3.x) / 2;
    const my = (p0.y + p3.y) / 2;
    const p1 = {
      x: p0.x + (mx - p0.x) * 0.55 + perpX * wobbleAmp,
      y: p0.y + (my - p0.y) * 0.55 + perpY * wobbleAmp,
    };
    const p2 = {
      x: p3.x + (mx - p3.x) * 0.55 + perpX * wobbleAmp * 0.6,
      y: p3.y + (my - p3.y) * 0.55 + perpY * wobbleAmp * 0.6,
    };

    tunnels.push({ from: parent, to: ch, p0, p1, p2, p3 });
  }
  return tunnels;
}

function _sampleBezier(tn, t) {
  const u = 1 - t;
  const b0 = u * u * u;
  const b1 = 3 * u * u * t;
  const b2 = 3 * u * t * t;
  const b3 = t * t * t;
  return {
    x: b0 * tn.p0.x + b1 * tn.p1.x + b2 * tn.p2.x + b3 * tn.p3.x,
    y: b0 * tn.p0.y + b1 * tn.p1.y + b2 * tn.p2.y + b3 * tn.p3.y,
  };
}

function renderNest() {
  const ctx = UI.nestCtx;
  if (!ctx) return;

  const w = UI.nestCanvas.width;
  const h = UI.nestCanvas.height;

  // Fondo y textura en coordenadas de PANTALLA
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#5a3520');
  grad.addColorStop(0.5, '#4a2a14');
  grad.addColorStop(1, '#3a1e0a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = 'rgba(255, 200, 120, 0.04)';
  for (let i = 0; i < 300; i++) {
    ctx.fillRect(_pseudoRand(i * 7 + 1) * w, _pseudoRand(i * 13 + 3) * h, 1, 1);
  }

  _ensurePopulation();
  if (_view.fit) _fitView();
  const { chambers, tunnels } = _layout;
  const chamberById = new Map(chambers.map(c => [c.id, c]));

  // A partir de aquí, todo en coordenadas de MUNDO
  ctx.setTransform(_view.scale, 0, 0, _view.scale, _view.ox, _view.oy);

  _drawWorldBackground(ctx);
  _drawTunnels(ctx, chambers);
  for (const ch of chambers) _drawChamber(ctx, ch);

  for (const b of _brood) _drawBrood(ctx, b);

  const t = Date.now() / 1000;

  for (const ant of _residents) {
    const ch = ant.builder ? ant.chamber : chamberById.get(ant.chamberId);
    if (!ch) continue;
    ant.x += ant.vx;
    ant.y += ant.vy;
    _constrainToChamber(ant, ch);
    _drawAnt(ctx, ant, t);
  }

  // Forrajeras de superficie (gather-*): exit → forage → return
  if (_surfaceWalkers.length > 0 && chambers.length > 0) {
    const royal = chambers[0];
    const entrancePath = {
      p0: { x: royal.x, y: royal.y - royal.ry },
      p1: { x: royal.x + 8, y: royal.y - royal.ry - 30 },
      p2: { x: royal.x - 12, y: _SURFACE_Y + 40 },
      p3: { x: royal.x, y: _SURFACE_Y },
    };
    const dt = 1 / 60;
    for (const w of _surfaceWalkers) {
      if (w.phase === 'inside') {
        // Pequeño paseo dentro de la real antes de salir
        w.x += w.vx; w.y += w.vy;
        _constrainToChamber(w, royal);
        w.phaseTimer -= dt;
        if (w.phaseTimer <= 0) { w.phase = 'going-up'; w.t = 0; w.carrying = false; }
      } else if (w.phase === 'going-up') {
        w.t = Math.min(1, w.t + 0.012);
        const pt = _sampleBezier(entrancePath, w.t);
        const ah = _sampleBezier(entrancePath, Math.min(1, w.t + 0.02));
        w.vx = ah.x - pt.x; w.vy = ah.y - pt.y;
        w.x = pt.x; w.y = pt.y;
        if (w.t >= 1) {
          w.phase = 'outside';
          w.phaseTimer = 1.5 + Math.random() * 2;
          const ang = (Math.random() - 0.5) * Math.PI * 0.9 - Math.PI / 2;
          const dist = 30 + Math.random() * 60;
          w.waitX = royal.x + Math.cos(ang) * dist;
          w.waitY = _SURFACE_Y - 10 - Math.random() * 50;
        }
      } else if (w.phase === 'outside') {
        const tx = w.waitX, ty = w.waitY;
        const dx = tx - w.x, dy = ty - w.y;
        w.vx = dx * 0.06 + (Math.random() - 0.5) * 0.4;
        w.vy = dy * 0.06 + (Math.random() - 0.5) * 0.3;
        w.x += w.vx; w.y += w.vy;
        w.phaseTimer -= dt;
        if (w.phaseTimer <= 0) { w.phase = 'going-down'; w.t = 1; w.carrying = true; }
      } else if (w.phase === 'going-down') {
        w.t = Math.max(0, w.t - 0.012);
        const pt = _sampleBezier(entrancePath, w.t);
        const ah = _sampleBezier(entrancePath, Math.max(0, w.t - 0.02));
        w.vx = ah.x - pt.x; w.vy = ah.y - pt.y;
        w.x = pt.x; w.y = pt.y;
        if (w.t <= 0) {
          w.phase = 'inside';
          w.phaseTimer = 0.6 + Math.random() * 1.2;
          // Soltar la carga al llegar
          w.carrying = false;
        }
      }
      _drawAnt(ctx, w, t);
      if (w.carrying) _drawCarryDot(ctx, w);
    }
  }

  for (const f of _foragers) {
    const tn = tunnels[f.tunnelIndex];
    if (!tn) continue;
    f.t += f.speed * f.dir;
    if (f.t > 1) { f.t = 1; f.dir = -1; }
    if (f.t < 0) { f.t = 0; f.dir = 1; }
    const a = _sampleBezier(tn, f.t);
    const b = _sampleBezier(tn, Math.min(1, Math.max(0, f.t + 0.01 * f.dir)));
    f.x = a.x; f.y = a.y;
    f.vx = (b.x - a.x) || f.dir; f.vy = (b.y - a.y) || 0;
    _drawAnt(ctx, f, t);
  }

  // Stats superpuestas en pantalla
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  _drawNestStats(ctx, w, h);
}

function _constrainToChamber(ant, ch) {
  const dx = (ant.x - ch.x) / ch.rx;
  const dy = (ant.y - ch.y) / ch.ry;
  if (dx * dx + dy * dy > 0.85 * 0.85) {
    // Empujar hacia el centro y reflejar velocidad
    const nx = ant.x - ch.x;
    const ny = ant.y - ch.y;
    const len = Math.hypot(nx, ny) || 1;
    ant.vx = -nx / len * (0.4 + Math.random() * 0.3);
    ant.vy = -ny / len * (0.3 + Math.random() * 0.3);
    ant.x += ant.vx;
    ant.y += ant.vy;
  }
}

function _drawCarryDot(ctx, ant) {
  const c = ant.resource === 'sugar' ? '#e6d8a8'
          : ant.resource === 'protein' ? '#a83020'
          : '#5688c4';
  ctx.save();
  ctx.translate(ant.x, ant.y);
  ctx.rotate(Math.atan2(ant.vy, ant.vx));
  ctx.fillStyle = c;
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.arc(ant.size * 1.9, -ant.size * 0.5, 1.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function _drawBrood(ctx, b) {
  ctx.save();
  ctx.translate(b.x, b.y);
  if (b.type === 'egg') {
    ctx.fillStyle = 'rgba(245, 235, 200, 0.92)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 1.6, 1.1, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (b.type === 'larva') {
    ctx.fillStyle = 'rgba(240, 220, 170, 0.92)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 2.4, 1.2, 0, 0, Math.PI * 2);
    ctx.fill();
  } else { // pupa
    ctx.fillStyle = 'rgba(200, 170, 110, 0.95)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 2.6, 1.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120, 90, 50, 0.6)';
    ctx.lineWidth = 0.6;
    ctx.stroke();
  }
  ctx.restore();
}

function _buildChamberLayout() {
  // Coordenadas de mundo. Las cámaras se distribuyen como un árbol
  // ramificado a partir de la cámara real, alternando lados, con
  // pequeñas variaciones para que el nido no parezca una rejilla.
  const chambers = [];

  chambers.push({
    id: 'royal', role: 'royal',
    x: 0, y: 0, rx: 80, ry: 60,
    label: 'R', color: 'rgba(200,160,40,0.22)', border: 'rgba(230,190,70,0.55)',
    parentId: null,
  });

  // Lista de cámaras a colocar (mezcla cría y almacén para que las
  // ramas no queden con todo el mismo tipo)
  const queue = [];
  const broodCount = Math.max(1, gameState.chambers.brood);
  const storageCount = gameState.chambers.storage;
  const total = broodCount + storageCount;
  let bi = 0, si = 0;
  for (let i = 0; i < total; i++) {
    const remB = broodCount - bi;
    const remS = storageCount - si;
    // Alterna intentando proporcionar la mezcla
    const useBrood = remS === 0 || (remB > 0 && (remB / Math.max(1, remB + remS)) > _pseudoRand(i * 41));
    if (useBrood) {
      queue.push({
        role: 'brood', label: 'C',
        color: 'rgba(80,160,60,0.18)', border: 'rgba(100,200,70,0.45)',
        baseRx: 68, baseRy: 52,
      });
      bi++;
    } else {
      queue.push({
        role: 'storage', label: 'A',
        color: 'rgba(60,100,180,0.18)', border: 'rgba(80,140,220,0.45)',
        baseRx: 62, baseRy: 48,
      });
      si++;
    }
  }

  // Distribución por ramas alternas (izq/der) con cada cámara colgando
  // de la última de su rama (o de la real si es la primera).
  const lastInBranch = { L: 'royal', R: 'royal' };
  const depthInBranch = { L: 0, R: 0 };

  for (let i = 0; i < queue.length; i++) {
    const q = queue[i];
    const branch = i % 2 === 0 ? 'L' : 'R';
    const sign = branch === 'L' ? -1 : 1;
    depthInBranch[branch]++;
    const depth = depthInBranch[branch];

    const parent = chambers.find(c => c.id === lastInBranch[branch]);

    // Ángulo desde la vertical (20°-45°) — varía por cámara
    const angleDeg = 22 + _pseudoRand(i * 7 + branch.charCodeAt(0)) * 22;
    const angle = angleDeg * Math.PI / 180;
    const dist = 165 + _pseudoRand(i * 13) * 55;

    // Si es la primera cámara de la rama, la separa más para alejarla de la real
    const firstInBranch = depth === 1;
    const r = firstInBranch ? dist + 30 : dist;

    const dx = sign * Math.sin(angle) * r;
    const dy = Math.cos(angle) * r * 0.92;
    const wobbleX = (_pseudoRand(i * 17) - 0.5) * 30;
    const wobbleY = (_pseudoRand(i * 19) - 0.5) * 25;

    const sizeJitter = 0.88 + _pseudoRand(i * 23) * 0.28;

    const id = q.role + '-' + i;
    chambers.push({
      id, role: q.role,
      x: parent.x + dx + wobbleX,
      y: parent.y + dy + wobbleY,
      rx: q.baseRx * sizeJitter,
      ry: q.baseRy * sizeJitter,
      label: q.label, color: q.color, border: q.border,
      parentId: parent.id,
    });
    lastInBranch[branch] = id;
  }

  return chambers;
}

const _SURFACE_Y = -150;

function _drawWorldBackground(ctx) {
  const Y = _SURFACE_Y;

  // Cielo arriba de la superficie
  const sky = ctx.createLinearGradient(0, Y - 600, 0, Y);
  sky.addColorStop(0, '#7da4c8');
  sky.addColorStop(1, '#c9b489');
  ctx.fillStyle = sky;
  ctx.fillRect(-6000, Y - 600, 12000, 600);

  // Línea de superficie (topsoil oscuro)
  ctx.fillStyle = '#2c1808';
  ctx.fillRect(-6000, Y, 12000, 14);
  ctx.fillStyle = 'rgba(80, 50, 20, 0.5)';
  ctx.fillRect(-6000, Y + 14, 12000, 6);

  // Briznas de hierba
  ctx.strokeStyle = '#4a8030';
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 220; i++) {
    const x = (i - 110) * 28 + (_pseudoRand(i * 5) - 0.5) * 18;
    const h = 5 + _pseudoRand(i * 7) * 9;
    const sway = (_pseudoRand(i * 11) - 0.5) * 4;
    ctx.beginPath();
    ctx.moveTo(x, Y);
    ctx.quadraticCurveTo(x + sway / 2, Y - h * 0.6, x + sway, Y - h);
    ctx.stroke();
  }

  // Raíces que bajan de la superficie
  ctx.strokeStyle = 'rgba(70, 42, 18, 0.55)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 14; i++) {
    const rx = (i - 7) * 220 + (_pseudoRand(i * 23) - 0.5) * 80;
    ctx.beginPath();
    ctx.moveTo(rx, Y + 2);
    const c1x = rx + (_pseudoRand(i * 31) - 0.5) * 60;
    const c2x = rx + (_pseudoRand(i * 37) - 0.5) * 100;
    ctx.bezierCurveTo(c1x, Y + 80, c2x, Y + 180, rx + (i % 2 ? 30 : -30), Y + 280);
    ctx.stroke();
    // Pequeña raíz lateral
    ctx.beginPath();
    ctx.moveTo(c1x, Y + 80);
    ctx.lineTo(c1x + (i % 2 ? 30 : -30), Y + 110);
    ctx.stroke();
  }

  // Piedras/granos esparcidos por el suelo
  for (let i = 0; i < 90; i++) {
    const x = (_pseudoRand(i * 13) - 0.5) * 2400;
    const y = Y + 40 + _pseudoRand(i * 17) * 1500;
    const r = 1.2 + _pseudoRand(i * 19) * 2.6;
    ctx.fillStyle = _pseudoRand(i * 29) > 0.6
      ? 'rgba(190, 150, 95, 0.32)'
      : 'rgba(120, 80, 40, 0.32)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Estratos de tierra (líneas suaves horizontales)
  ctx.strokeStyle = 'rgba(60, 30, 12, 0.18)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    const sy = Y + 120 + i * 220 + _pseudoRand(i * 41) * 30;
    ctx.beginPath();
    ctx.moveTo(-3000, sy);
    for (let x = -2900; x <= 3000; x += 80) {
      ctx.lineTo(x, sy + (_pseudoRand(x * 0.01 + i) - 0.5) * 6);
    }
    ctx.stroke();
  }
}

function _drawTunnels(ctx, chambers) {
  if (chambers.length < 1) return;
  const royal = chambers[0];

  const drawPath = (drawFn) => {
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1a0c04'; ctx.lineWidth = 16; drawFn();
    ctx.strokeStyle = '#5a3416'; ctx.lineWidth = 10; drawFn();
    ctx.strokeStyle = 'rgba(220, 170, 100, 0.18)'; ctx.lineWidth = 2.5; drawFn();
  };

  // Túnel de entrada desde la superficie hasta la cámara real
  drawPath(() => {
    ctx.beginPath();
    ctx.moveTo(royal.x, _SURFACE_Y);
    ctx.bezierCurveTo(
      royal.x - 12, _SURFACE_Y + 40,
      royal.x + 8,  royal.y - royal.ry - 30,
      royal.x,      royal.y - royal.ry
    );
    ctx.stroke();
  });

  // Galerías entre cámaras (siguiendo el árbol parentId)
  const tunnels = _layout?.tunnels ?? [];
  for (const tn of tunnels) {
    drawPath(() => {
      ctx.beginPath();
      ctx.moveTo(tn.p0.x, tn.p0.y);
      ctx.bezierCurveTo(tn.p1.x, tn.p1.y, tn.p2.x, tn.p2.y, tn.p3.x, tn.p3.y);
      ctx.stroke();
    });
  }
}

function _drawChamber(ctx, ch) {
  ctx.save();
  ctx.translate(ch.x, ch.y);

  // Aura exterior (sombra carved en la tierra)
  const halo = ctx.createRadialGradient(0, 0, ch.rx * 0.4, 0, 0, ch.rx * 1.35);
  halo.addColorStop(0, 'rgba(0,0,0,0)');
  halo.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.ellipse(0, 0, ch.rx * 1.35, ch.ry * 1.35, 0, 0, Math.PI * 2);
  ctx.fill();

  // Hueco de la cámara (degradado interior cavado)
  const inner = ctx.createRadialGradient(0, -ch.ry * 0.3, ch.rx * 0.15, 0, 0, ch.rx);
  inner.addColorStop(0, '#3a2010');
  inner.addColorStop(1, '#150c04');
  ctx.beginPath();
  ctx.ellipse(0, 0, ch.rx, ch.ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = inner;
  ctx.fill();

  // Tinte del rol (sutil)
  ctx.beginPath();
  ctx.ellipse(0, 0, ch.rx * 0.96, ch.ry * 0.96, 0, 0, Math.PI * 2);
  ctx.fillStyle = ch.color;
  ctx.fill();

  // Borde carved
  ctx.strokeStyle = ch.border;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.ellipse(0, 0, ch.rx, ch.ry, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Decoración de rol
  if (ch.role === 'royal') _decorateRoyal(ctx, ch);
  if (ch.role === 'storage') _decorateStorage(ctx, ch);
  if (ch.role === 'brood') _decorateBrood(ctx, ch);

  // Etiqueta sutil
  ctx.font = 'bold ' + Math.floor(ch.ry * 0.42) + 'px "Source Code Pro", monospace';
  ctx.fillStyle = 'rgba(230, 180, 80, 0.35)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(ch.label, 0, -ch.ry * 0.7);

  ctx.restore();
}

function _decorateRoyal(ctx, ch) {
  const g = ctx.createRadialGradient(0, 0, ch.rx * 0.05, 0, 0, ch.rx * 0.7);
  g.addColorStop(0, 'rgba(255, 220, 130, 0.40)');
  g.addColorStop(1, 'rgba(255, 220, 130, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 0, ch.rx * 0.7, ch.ry * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
}

function _decorateStorage(ctx, ch) {
  const limits = getResourceLimits();
  const ratio = (cur, max) => max > 0 ? Math.min(1, cur / max) : 0;
  const piles = [
    { x: -ch.rx * 0.5, color: '#e6d8a8', edge: '#a89060', r: ratio(gameState.sugar, limits.sugar) },
    { x: 0,             color: '#a83020', edge: '#601810', r: ratio(gameState.protein, limits.protein) },
    { x: ch.rx * 0.5,  color: '#5688c4', edge: '#2c4878', r: ratio(gameState.water, limits.water) },
  ];
  for (const p of piles) {
    const rad = 4 + p.r * 14;
    // Sombra debajo
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(p.x, ch.ry * 0.4, rad * 1.05, rad * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    // Pila
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.ellipse(p.x, ch.ry * 0.32, rad, rad * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = p.edge;
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }
}

function _decorateBrood(ctx, ch) {
  // Lecho de hojas/musgo en la base de la cámara
  ctx.fillStyle = 'rgba(60, 100, 50, 0.35)';
  ctx.beginPath();
  ctx.ellipse(0, ch.ry * 0.45, ch.rx * 0.85, ch.ry * 0.25, 0, 0, Math.PI * 2);
  ctx.fill();
  // Pequeñas motas claras (cría)
  ctx.fillStyle = 'rgba(245, 230, 190, 0.55)';
  for (let i = 0; i < 5; i++) {
    const ang = _pseudoRand(i * 7 + ch.x) * Math.PI * 2;
    const r = _pseudoRand(i * 11 + ch.y) * 0.55 + 0.1;
    ctx.beginPath();
    ctx.arc(Math.cos(ang) * ch.rx * r, ch.ry * 0.45 + Math.sin(ang) * ch.ry * 0.15, 0.9, 0, Math.PI * 2);
    ctx.fill();
  }
}

function _drawAnt(ctx, ant, t) {
  ctx.save();
  ctx.translate(ant.x, ant.y);
  ctx.rotate(Math.atan2(ant.vy, ant.vx));

  const s = ant.size;
  const queen = !!ant.isQueen;

  // Halo dorado para la reina
  if (queen) {
    ctx.beginPath();
    ctx.arc(-s * 0.4, 0, s * 2.4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(240, 200, 90, 0.18)';
    ctx.fill();
  }

  // Abdomen
  ctx.beginPath();
  ctx.ellipse(-s * 1.4, 0, s * 1.1, s * 0.75, 0, 0, Math.PI * 2);
  ctx.fillStyle = queen ? '#5a2a08' : '#c87828';
  ctx.fill();

  // Tórax
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.7, s * 0.6, 0, 0, Math.PI * 2);
  ctx.fillStyle = queen ? '#4a2206' : '#b86820';
  ctx.fill();

  // Cabeza
  ctx.beginPath();
  ctx.arc(s * 1.3, 0, s * 0.6, 0, Math.PI * 2);
  ctx.fillStyle = queen ? '#3a1a04' : '#a85818';
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

  const daysEl = document.getElementById('gameover-days');
  const peakEl = document.getElementById('gameover-peak');
  const causeEl = document.getElementById('gameover-cause');

  if (daysEl) daysEl.textContent = gameState.stats.daysPlayed;
  if (peakEl) peakEl.textContent = _fmt(gameState.stats.peakWorkers);
  if (causeEl) causeEl.textContent = !gameState.queen.alive
    ? 'la reina murió'
    : 'todas las obreras perecieron';

  UI.gameOverScreen.classList.add('visible');
}

// ── CONSTRUCCIÓN DE CÁMARAS ────────────────────────────────
function onChamberClick(e) {
  const btn = e.target.closest('[data-chamber]');
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
  location.reload();
}

function onDeleteSave() {
  window.formiResetGame();
}

// Reset total accesible globalmente (también usado por el onclick inline
// del botón "Borrar partida guardada", para que no dependa del listener).
window.formiResetGame = function () {
  if (!window.confirm('Borrar la partida. Esta accion no se puede deshacer.')) return;
  try {
    // Borra TODAS las claves de localStorage relacionadas con Formi
    // (cualquier versión pasada o futura) para no dejar restos.
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k === (window.CONFIG?.SAVE_KEY || 'formi_v1') || k.startsWith('formi'))) {
        toRemove.push(k);
      }
    }
    toRemove.forEach(k => localStorage.removeItem(k));
  } catch (e) {
    console.warn('No se pudo borrar localStorage:', e);
  }
  // Recarga sin caché para garantizar que se arranca de cero
  location.reload();
};

// ── OVERLAY OFFLINE ────────────────────────────────────────
function offlineProgressHandler({ phase, current, total }) {
  if (!UI.offlineOverlay) return;

  if (phase === 'start') {
    UI.offlineOverlay.classList.add('visible');
    if (UI.offlineMsg) UI.offlineMsg.textContent = 'Simulando ' + total + ' dias…';
    if (UI.offlineBar) UI.offlineBar.style.width = '0%';
  }

  if (phase === 'progress' && UI.offlineBar) {
    UI.offlineBar.style.width = Math.round((current / total) * 100) + '%';
    if (UI.offlineMsg) UI.offlineMsg.textContent = 'Simulando… ' + current + '/' + total;
  }

  if (phase === 'done') {
    if (UI.offlineBar) UI.offlineBar.style.width = '100%';
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

// ── ÓRDENES ────────────────────────────────────────────────
function onOrderQueueClick(e) {
  const btn = e.target.closest('[data-order]');
  if (!btn) return;
  addTask(btn.dataset.order);
  render();
}

function onActiveOrderClick(e) {
  const row = e.target.closest('.order-row');
  if (!row) return;
  const id = parseInt(row.dataset.id, 10);
  if (!Number.isFinite(id)) return;

  if (e.target.closest('.order-cancel')) {
    cancelTask(id);
  } else if (e.target.closest('.order-add')) {
    adjustTaskWorkers(id, 1);
  } else if (e.target.closest('.order-sub')) {
    adjustTaskWorkers(id, -1);
  } else {
    return;
  }
  render();
}

function _renderOrders() {
  const totalEl = document.getElementById('orders-total');
  const availEl = document.getElementById('orders-available');
  const listEl = document.getElementById('orders-active');
  if (!listEl) return;

  const available = getAvailableWorkers();
  if (totalEl) totalEl.textContent = _fmt(gameState.workers);
  if (availEl) availEl.textContent = _fmt(available);

  // Habilitar / deshabilitar botones de cola
  const queue = document.getElementById('orders-queue-panel');
  if (queue) {
    for (const btn of queue.querySelectorAll('[data-order]')) {
      const def = TASK_DEFS[btn.dataset.order];
      if (!def) { btn.disabled = true; continue; }
      const blocked = def.canQueue && !def.canQueue();
      const noResources = def.cost && (
        (def.cost.sugar ?? 0) > gameState.sugar ||
        (def.cost.protein ?? 0) > gameState.protein ||
        (def.cost.water ?? 0) > gameState.water
      );
      btn.disabled = blocked || noResources;
      btn.title = blocked ? 'No disponible' : (noResources ? 'Recursos insuficientes' : '');
    }
  }

  const tasks = gameState.tasks ?? [];
  if (tasks.length === 0) {
    listEl.innerHTML = '';
    return;
  }

  listEl.innerHTML = tasks.map(t => {
    const def = TASK_DEFS[t.type];
    if (!def) return '';
    const pct = t.kind === 'project'
      ? Math.min(100, (t.progress / t.total) * 100)
      : 100;
    const meta = t.kind === 'project'
      ? Math.floor(pct) + '%'
      : '+' + (t.assigned * def.rate).toFixed(2) + '/s';
    return ''
      + '<div class="order-row ' + t.kind + '" data-id="' + t.id + '">'
      +   '<span class="order-label">'
      +     '<span>' + def.emoji + '</span>'
      +     '<span>' + def.label + '</span>'
      +   '</span>'
      +   '<div>'
      +     '<div class="order-progress-track">'
      +       '<div class="order-progress-fill" style="width:' + pct.toFixed(1) + '%"></div>'
      +     '</div>'
      +   '</div>'
      +   '<div class="order-meta">'
      +     '<button class="order-sub" title="Quitar obrera">\u2212</button>'
      +     '<span>' + t.assigned + '\u{1F41C}</span>'
      +     '<button class="order-add" title="A\u00f1adir obrera">+</button>'
      +     '<span>' + meta + '</span>'
      +     '<button class="order-cancel" title="Cancelar">\u00d7</button>'
      +   '</div>'
      + '</div>';
  }).join('');
}