// ============================================================
//  FORMICARIUM VIVO — js/ui.js
//
//  Renderizado del DOM. Separado completamente de la lógica.
//  Nunca modifica gameState directamente: llama a funciones
//  de colony.js y gameState.js.
//
//  Secciones:
//  1. Referencias al DOM
//  2. Render principal (panel de control)
//  3. Vista del nido (corte transversal)
//  4. Diario de eventos
//  5. Modales (construcción, confirmación)
//  6. Pantalla de inicio / game over
//  7. Simulación offline (overlay de progreso)
//  8. Helpers de formato
// ============================================================

// ── 1. REFERENCIAS AL DOM ──────────────────────────────────
// Se inicializan en init() para no asumir que el DOM
// existe en el momento de cargar el script.
const UI = {
// Panel de control
queenStatus:    null,
queenAge:       null,
workerCount:    null,
eggCount:       null,
larvaeCount:    null,
pupaeCount:     null,
sugarBar:       null,
proteinBar:     null,
waterBar:       null,
sugarVal:       null,
proteinVal:     null,
waterVal:       null,
dayCounter:     null,

// Vista del nido
nestCanvas:     null,
nestCtx:        null,

// Diario
eventLog:       null,

// Botones de cámara
btnBrood:       null,
btnStorage:     null,
btnTunnel:      null,

// Overlays
offlineOverlay: null,
offlineMsg:     null,
offlineBar:     null,
gameOverScreen: null,
};

// ── INIT ───────────────────────────────────────────────────
function initUI() {
UI.queenStatus    = document.getElementById(“queen-status”);
UI.queenAge       = document.getElementById(“queen-age”);
UI.workerCount    = document.getElementById(“worker-count”);
UI.eggCount       = document.getElementById(“egg-count”);
UI.larvaeCount    = document.getElementById(“larvae-count”);
UI.pupaeCount     = document.getElementById(“pupae-count”);
UI.sugarBar       = document.getElementById(“bar-sugar”);
UI.proteinBar     = document.getElementById(“bar-protein”);
UI.waterBar       = document.getElementById(“bar-water”);
UI.sugarVal       = document.getElementById(“val-sugar”);
UI.proteinVal     = document.getElementById(“val-protein”);
UI.waterVal       = document.getElementById(“val-water”);
UI.dayCounter     = document.getElementById(“day-counter”);
UI.nestCanvas     = document.getElementById(“nest-canvas”);
UI.eventLog       = document.getElementById(“event-log”);
UI.btnBrood       = document.getElementById(“btn-brood”);
UI.btnStorage     = document.getElementById(“btn-storage”);
UI.btnTunnel      = document.getElementById(“btn-tunnel”);
UI.offlineOverlay = document.getElementById(“offline-overlay”);
UI.offlineMsg     = document.getElementById(“offline-msg”);
UI.offlineBar     = document.getElementById(“offline-bar”);
UI.gameOverScreen = document.getElementById(“game-over”);

if (UI.nestCanvas) {
UI.nestCtx = UI.nestCanvas.getContext(“2d”);
resizeNestCanvas();
window.addEventListener(“resize”, resizeNestCanvas);
}

// Delegación de eventos en botones de cámaras
document.getElementById(“chambers-panel”)
?.addEventListener(“click”, onChamberClick);

// Botón de reinicio (game over screen)
document.getElementById(“btn-restart”)
?.addEventListener(“click”, onRestart);

// Botón de borrar save (settings)
document.getElementById(“btn-delete-save”)
?.addEventListener(“click”, onDeleteSave);
}

// ── 2. RENDER PRINCIPAL ────────────────────────────────────
// Se llama cada tick (cada 5 s) y solo actualiza lo que cambió.
// Usa un objeto _prev para dirty-checking y evitar reflows.
const _prev = {};

function render() {
const gs     = gameState;
const limits = getResourceLimits();

// ── Día ────────────────────────────────────────────────
setIfChanged(“dayCounter”, `Día ${gs.gameDay}`);

// ── Reina ──────────────────────────────────────────────
const queenAlive = gs.queen.alive;
const queenYears = (gs.queen.ageDays / 365).toFixed(1);
setIfChanged(“queenStatus”, queenAlive ? “👑 Viva” : “💀 Muerta”);
setIfChanged(“queenAge”,    `${queenYears} años`);

if (UI.queenStatus) {
UI.queenStatus.className = “queen-status “ + (queenAlive ? “alive” : “dead”);
}

// ── Población ──────────────────────────────────────────
setIfChanged(“workerCount”, fmt(gs.workers));
setIfChanged(“eggCount”,    fmt(countEggs()));
setIfChanged(“larvaeCount”, fmt(countLarvae()));
setIfChanged(“pupaeCount”,  fmt(countPupae()));

// ── Recursos (barras) ──────────────────────────────────
renderResourceBar(“sugar”,   gs.sugar,   limits.sugar);
renderResourceBar(“protein”, gs.protein, limits.protein);
renderResourceBar(“water”,   gs.water,   limits.water);

// ── Botones de cámara (coste y disponibilidad) ─────────
renderChamberButtons();

// ── Vista del nido ─────────────────────────────────────
renderNest();

// ── Diario ─────────────────────────────────────────────
renderEventLog();

// ── Game over ──────────────────────────────────────────
if (!queenAlive && gs.workers === 0
&& countEggs() === 0 && countLarvae() === 0 && countPupae() === 0) {
showGameOver();
}
}

function renderResourceBar(key, current, max) {
const bar = UI[`${key}Bar`];
const val = UI[`${key}Val`];
if (!bar || !val) return;

const pct = max > 0 ? Math.min(100, (current / max) * 100) : 0;
const pctStr = pct.toFixed(1) + “%”;

if (_prev[`${key}Pct`] !== pctStr) {
bar.style.width = pctStr;
// Color según nivel: verde > amarillo > rojo
bar.className = “resource-fill “ + (
pct > 40 ? “ok” : pct > 15 ? “warn” : “crit”
);
_prev[`${key}Pct`] = pctStr;
}

const valStr = `${Math.floor(current)} / ${max}`;
if (_prev[`${key}Val`] !== valStr) {
val.textContent = valStr;
_prev[`${key}Val`] = valStr;
}
}

function renderChamberButtons() {
const types = [“brood”, “storage”, “tunnel”];
for (const type of types) {
const btn = UI[`btn${capitalize(type)}`];
if (!btn) continue;

```
const reason = canBuildChamber(type);
btn.disabled = reason !== null;
btn.title    = reason ?? "Construir";

const count = gameState.chambers[type];
const def   = CONFIG.CHAMBERS[type.toUpperCase()];
btn.querySelector(".chamber-count").textContent = `×${count}`;

// Mostrar coste
const cost = def.cost ?? {};
const costParts = [];
if (cost.sugar)   costParts.push(`🍬${cost.sugar}`);
if (cost.protein) costParts.push(`🪲${cost.protein}`);
if (cost.water)   costParts.push(`💧${cost.water}`);
const costEl = btn.querySelector(".chamber-cost");
if (costEl) costEl.textContent = costParts.join(" ");
```

}
}

// ── 3. VISTA DEL NIDO (CANVAS) ─────────────────────────────
// Dibuja un corte transversal esquemático del formicario.
// Cámaras reales: reina, cría, almacén.
// Las hormigas se mueven animadas para dar vida.

const _ants = []; // posiciones de hormigas animadas

function resizeNestCanvas() {
if (!UI.nestCanvas) return;
const rect = UI.nestCanvas.parentElement.getBoundingClientRect();
UI.nestCanvas.width  = rect.width;
UI.nestCanvas.height = rect.height || 260;
generateAnts();
}

function generateAnts() {
_ants.length = 0;
const count = Math.min(40, Math.max(3, Math.floor(gameState.workers / 5)));
const w = UI.nestCanvas?.width  ?? 300;
const h = UI.nestCanvas?.height ?? 260;

for (let i = 0; i < count; i++) {
_ants.push({
x:   Math.random() * w,
y:   Math.random() * h,
vx:  (Math.random() - 0.5) * 0.6,
vy:  (Math.random() - 0.5) * 0.4,
size: 2 + Math.random() * 1.5,
phase: Math.random() * Math.PI * 2, // para animación de patas
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

// ── Fondo: tierra ────────────────────────────────────────
const grad = ctx.createLinearGradient(0, 0, 0, h);
grad.addColorStop(0,   “#2a1a0e”);
grad.addColorStop(0.4, “#3d2510”);
grad.addColorStop(1,   “#1a0d05”);
ctx.fillStyle = grad;
ctx.fillRect(0, 0, w, h);

// Textura de tierra (puntos aleatorios pero con seed fijo)
ctx.fillStyle = “rgba(255,200,100,0.03)”;
for (let i = 0; i < 200; i++) {
const px = pseudoRand(i * 7 + 1) * w;
const py = pseudoRand(i * 13 + 3) * h;
ctx.fillRect(px, py, 1, 1);
}

// ── Cámaras ──────────────────────────────────────────────
const chambers = buildChamberLayout(w, h);
for (const ch of chambers) {
drawChamber(ctx, ch);
}

// ── Túneles entre cámaras ─────────────────────────────────
drawTunnels(ctx, chambers, w, h);

// ── Hormigas ─────────────────────────────────────────────
// Regenerar si el número de obreras cambió mucho
const targetCount = Math.min(40, Math.max(3, Math.floor(gs.workers / 5)));
if (Math.abs(_ants.length - targetCount) > 5) generateAnts();

const t = Date.now() / 1000;
for (const ant of _ants) {
// Mover
ant.x += ant.vx;
ant.y += ant.vy;
// Rebotar en bordes
if (ant.x < 5 || ant.x > w - 5) ant.vx *= -1;
if (ant.y < 5 || ant.y > h - 5) ant.vy *= -1;

```
drawAnt(ctx, ant, t);
```

}

// ── Estadísticas superpuestas ─────────────────────────────
drawNestStats(ctx, w, h, gs);
}

function buildChamberLayout(w, h) {
// Layout fijo pero escalado al canvas
const chambers = [];

// Cámara real (siempre, arriba-centro)
chambers.push({
id: “queen”, x: w * 0.5, y: h * 0.25,
rx: w * 0.12, ry: h * 0.10,
label: “👑”, color: “rgba(180,140,40,0.25)”,
border: “rgba(220,180,60,0.6)”,
});

// Cámaras de cría (según cantidad)
const broodCount = Math.max(1, gameState.chambers.brood);
for (let i = 0; i < Math.min(broodCount, 3); i++) {
chambers.push({
id: “brood”, x: w * (0.25 + i * 0.25), y: h * 0.6,
rx: w * 0.10, ry: h * 0.09,
label: “🥚”, color: “rgba(100,160,80,0.2)”,
border: “rgba(120,200,80,0.5)”,
});
}

// Almacenes
const storageCount = gameState.chambers.storage;
for (let i = 0; i < Math.min(storageCount, 2); i++) {
chambers.push({
id: “storage”, x: w * (0.15 + i * 0.7), y: h * 0.82,
rx: w * 0.09, ry: h * 0.07,
label: “📦”, color: “rgba(80,120,180,0.2)”,
border: “rgba(100,150,220,0.5)”,
});
}

return chambers;
}

function drawChamber(ctx, ch) {
ctx.save();
ctx.translate(ch.x, ch.y);

// Elipse de la cámara
ctx.beginPath();
ctx.ellipse(0, 0, ch.rx, ch.ry, 0, 0, Math.PI * 2);
ctx.fillStyle = ch.color;
ctx.fill();
ctx.strokeStyle = ch.border;
ctx.lineWidth = 1.5;
ctx.stroke();

// Emoji de la cámara
ctx.font = `${Math.floor(ch.ry * 0.8)}px serif`;
ctx.textAlign = “center”;
ctx.textBaseline = “middle”;
ctx.fillText(ch.label, 0, 0);

ctx.restore();
}

function drawTunnels(ctx, chambers, w, h) {
// Túnel desde superficie hasta cámara real
ctx.beginPath();
ctx.moveTo(w * 0.5, 0);
ctx.lineTo(w * 0.5, chambers[0]?.y ?? h * 0.25);
ctx.strokeStyle = “rgba(180,120,60,0.4)”;
ctx.lineWidth = 4;
ctx.stroke();

// Conectar cámaras entre sí
for (let i = 1; i < chambers.length; i++) {
const from = chambers[0]; // todo conecta con cámara real
const to   = chambers[i];
ctx.beginPath();
ctx.moveTo(from.x, from.y + from.ry);
ctx.bezierCurveTo(
from.x, (from.y + to.y) / 2,
to.x,   (from.y + to.y) / 2,
to.x,   to.y - to.ry
);
ctx.strokeStyle = “rgba(160,100,40,0.35)”;
ctx.lineWidth = 3;
ctx.stroke();
}
}

function drawAnt(ctx, ant, t) {
ctx.save();
ctx.translate(ant.x, ant.y);

const angle = Math.atan2(ant.vy, ant.vx);
ctx.rotate(angle);

// Cuerpo
ctx.fillStyle = “#1a0a00”;
ctx.beginPath();
ctx.ellipse(0, 0, ant.size * 1.4, ant.size * 0.7, 0, 0, Math.PI * 2);
ctx.fill();

// Cabeza
ctx.beginPath();
ctx.arc(ant.size * 1.6, 0, ant.size * 0.65, 0, Math.PI * 2);
ctx.fill();

// Abdomen
ctx.beginPath();
ctx.ellipse(-ant.size * 1.5, 0, ant.size, ant.size * 0.75, 0, 0, Math.PI * 2);
ctx.fill();

// Patas (3 pares, animadas)
ctx.strokeStyle = “rgba(30,15,0,0.9)”;
ctx.lineWidth = 0.7;
const legSwing = Math.sin(t * 8 + ant.phase) * 2;
for (let i = -1; i <= 1; i++) {
const lx = i * ant.size * 0.6;
ctx.beginPath();
ctx.moveTo(lx, 0);
ctx.lineTo(lx - 1, ant.size + legSwing * (i === 0 ? 0 : i));
ctx.stroke();
ctx.beginPath();
ctx.moveTo(lx, 0);
ctx.lineTo(lx + 1, -ant.size - legSwing * (i === 0 ? 0 : -i));
ctx.stroke();
}

// Antenas
ctx.beginPath();
ctx.moveTo(ant.size * 1.9, -ant.size * 0.3);
ctx.lineTo(ant.size * 2.8, -ant.size * 1.2 + legSwing * 0.3);
ctx.moveTo(ant.size * 1.9, ant.size * 0.3);
ctx.lineTo(ant.size * 2.8,  ant.size * 1.2 - legSwing * 0.3);
ctx.strokeStyle = “rgba(40,20,0,0.8)”;
ctx.lineWidth = 0.6;
ctx.stroke();

ctx.restore();
}

function drawNestStats(ctx, w, h, gs) {
ctx.font = “11px ‘Courier New’, monospace”;
ctx.fillStyle = “rgba(200,160,80,0.75)”;
ctx.textAlign = “left”;

const lines = [
`🐜 ${fmt(gs.workers)} obreras`,
`🥚 ${fmt(countEggs())} huevos`,
`🐛 ${fmt(countLarvae())} larvas`,
`🫘 ${fmt(countPupae())} pupas`,
];

lines.forEach((line, i) => {
ctx.fillText(line, 8, h - 8 - (lines.length - 1 - i) * 16);
});
}

// ── 4. DIARIO DE EVENTOS ────────────────────────────────────
function renderEventLog() {
if (!UI.eventLog) return;
const log = gameState.eventLog;

// Solo re-renderizar si hay entradas nuevas
const firstText = log[0]?.text ?? “”;
if (_prev.logFirst === firstText) return;
_prev.logFirst = firstText;

UI.eventLog.innerHTML = log.map(entry => {
const dayLabel = `<span class="log-day">Día ${entry.day}</span>`;
return `<div class="log-entry log-${entry.type}">${dayLabel} ${entry.text}</div>`;
}).join(””);
}

// ── 5. CONSTRUCCIÓN DE CÁMARAS ─────────────────────────────
function onChamberClick(e) {
const btn = e.target.closest(”[data-chamber]”);
if (!btn) return;

const type = btn.dataset.chamber;
const built = buildChamber(type);
if (built) {
render();
saveGame(true);
}
}

// ── 6. PANTALLAS ESPECIALES ────────────────────────────────

function showGameOver() {
if (!UI.gameOverScreen) return;
if (UI.gameOverScreen.classList.contains(“visible”)) return; // ya mostrado

const peak  = gameState.stats.peakWorkers;
const days  = gameState.stats.daysPlayed;
const cause = !gameState.queen.alive ? “la reina murió” : “todas las obreras perecieron”;

document.getElementById(“gameover-days”)?.textContent &&
(document.getElementById(“gameover-days”).textContent = days);
document.getElementById(“gameover-peak”)?.textContent &&
(document.getElementById(“gameover-peak”).textContent = fmt(peak));
document.getElementById(“gameover-cause”)?.textContent &&
(document.getElementById(“gameover-cause”).textContent = cause);

UI.gameOverScreen.classList.add(“visible”);
}

function onRestart() {
deleteSave();
UI.gameOverScreen?.classList.remove(“visible”);
render();
}

function onDeleteSave() {
if (!confirm(”¿Borrar la partida actual? Esta acción no se puede deshacer.”)) return;
deleteSave();
render();
}

// ── 7. OVERLAY DE SIMULACIÓN OFFLINE ──────────────────────
// Se pasa como callback a simulateOffline() en main.js.
function offlineProgressHandler({ phase, current, total }) {
if (!UI.offlineOverlay) return;

if (phase === “start”) {
UI.offlineOverlay.classList.add(“visible”);
UI.offlineMsg.textContent = `Simulando ${total} días...`;
UI.offlineBar.style.width = “0%”;
}

if (phase === “progress”) {
const pct = Math.round((current / total) * 100);
UI.offlineBar.style.width = pct + “%”;
UI.offlineMsg.textContent = `Simulando... ${current}/${total} días`;
}

if (phase === “done”) {
UI.offlineBar.style.width = “100%”;
UI.offlineMsg.textContent = “¡Listo!”;
setTimeout(() => {
UI.offlineOverlay?.classList.remove(“visible”);
}, 800);
}
}

// ── 8. HELPERS ─────────────────────────────────────────────

// Formatea números grandes con separador de miles
function fmt(n) {
return Math.floor(n).toLocaleString(“es-ES”);
}

// Capitaliza primera letra
function capitalize(str) {
return str.charAt(0).toUpperCase() + str.slice(1);
}

// Actualiza textContent solo si cambió (evita reflows innecesarios)
function setIfChanged(key, value) {
const el = UI[key];
if (!el) return;
if (_prev[key] !== value) {
el.textContent = value;
_prev[key] = value;
}
}

// Número pseudo-aleatorio determinista (para textura del canvas)
function pseudoRand(seed) {
const x = Math.sin(seed) * 10000;
return x - Math.floor(x);
}