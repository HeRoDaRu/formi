// ============================================================
//  FORMICARIUM VIVO — js/gameState.js
//
//  Estado mutable del juego. Todo lo que cambia en runtime
//  vive aquí. CONFIG es inmutable; gameState es la verdad
//  actual de la colonia.
//
//  Sistema de guardado:
//  - Se guarda en localStorage como JSON.
//  - Usa timestamps reales (Date.now()) para calcular tiempo
//    transcurrido entre sesiones (progreso offline).
//  - Si el SAVE_KEY cambia (nueva versión), el save anterior
//    se descarta automáticamente.
// ============================================================

// ── ESTRUCTURA BASE DEL ESTADO ─────────────────────────────
// Función que devuelve un estado limpio basado en CONFIG.
// Usada tanto para nueva partida como para resetear en tests.

function createFreshState() {
const init = CONFIG.INITIAL_STATE;
const now  = Date.now();

return {

```
// ── Meta ────────────────────────────────────────────────
version:      CONFIG.SAVE_KEY,
lastSaveTime: now,   // timestamp del último guardado
lastTickTime: now,   // timestamp del último tick procesado
gameDay:      0,     // días transcurridos desde el inicio

// ── Reina ───────────────────────────────────────────────
queen: {
  alive:   true,
  ageDays: CONFIG.LIFECYCLE.QUEEN_START_AGE, // llega ya con 1 año
},

// ── Población ───────────────────────────────────────────
workers: init.workers,

// Huevos, larvas y pupas se almacenan como arrays de objetos
// para poder rastrear la edad individual de cada uno.
// Cada elemento: { ageDays: number }
eggs:   Array.from({ length: init.eggs },   () => ({ ageDays: 0 })),
larvae: [],
pupae:  [],

// ── Recursos ────────────────────────────────────────────
sugar:   init.sugar,
protein: init.protein,
water:   init.water,

// ── Cámaras ─────────────────────────────────────────────
// Número de cámaras de cada tipo construidas.
chambers: {
  queen:   init.chambers.queen,
  brood:   init.chambers.brood,
  storage: init.chambers.storage,
  tunnel:  init.chambers.tunnel,
},

// ── Estadísticas (no afectan lógica, solo informativas) ──
stats: {
  totalWorkersEverBorn: init.workers, // nanitics iniciales cuentan
  totalEggsLaid:        init.eggs,
  totalWorkerDeaths:    0,
  peakWorkers:          init.workers,
  totalFoodCollected:   0,            // suma de todos los recursos
},

// ── Log de eventos ───────────────────────────────────────
// Últimos N eventos para mostrar en el diario del nido.
eventLog: [
  {
    day:  0,
    text: "La reina ha llegado. El nido comienza.",
    type: "info",
  }
],

// ── Flags de UI ──────────────────────────────────────────
ui: {
  firstVisit: true, // muestra tutorial la primera vez
},
```

};
}

// ── ESTADO GLOBAL ──────────────────────────────────────────
// Variable mutable única. Toda la lógica del juego la modifica.
let gameState = createFreshState();

// ── LÍMITES DINÁMICOS DE RECURSOS ──────────────────────────
// Calculados a partir del número de cámaras de almacén.
function getResourceLimits() {
const f  = CONFIG.FORAGING;
const ch = CONFIG.CHAMBERS;
const storageCount = gameState.chambers.storage;

// Multiplicador acumulado por cámaras de almacén
// Con 0 almacenes: x1.0 (base)
// Con 1 almacén:   x1.6
// Con 2 almacenes: x2.56
const mult = Math.pow(ch.STORAGE.storage_multiplier, storageCount);

// Bonus plano por túneles (más acceso al exterior = más agua disponible)
const tunnelBonus = gameState.chambers.tunnel * 0.15;

return {
sugar:   Math.floor(f.BASE_MAX_SUGAR   * mult),
protein: Math.floor(f.BASE_MAX_PROTEIN * mult),
water:   Math.floor(f.BASE_MAX_WATER   * (mult + tunnelBonus)),
};
}

// ── CAPACIDAD DEL NIDO ─────────────────────────────────────
// Cuántos individuos en desarrollo caben según cámaras de cría.
function getNestCapacity() {
const ch    = CONFIG.CHAMBERS.BROOD;
const count = gameState.chambers.brood;
return {
maxEggs:   ch.max_eggs_per_chamber   * count,
maxLarvae: ch.max_larvae_per_chamber * count,
maxPupae:  ch.max_pupae_per_chamber  * count,
};
}

// ── GUARDADO ───────────────────────────────────────────────
function saveGame() {
try {
gameState.lastSaveTime = Date.now();
localStorage.setItem(CONFIG.SAVE_KEY, JSON.stringify(gameState));
} catch (e) {
// localStorage puede fallar si está lleno o en modo privado
console.warn(”[Formicarium] No se pudo guardar:”, e.message);
}
}

// ── CARGA ──────────────────────────────────────────────────
// Devuelve true si se cargó una partida existente.
// Devuelve false si se empezó de cero (save no encontrado o
// versión incompatible).
function loadGame() {
try {
const raw = localStorage.getItem(CONFIG.SAVE_KEY);
if (!raw) return false;

```
const saved = JSON.parse(raw);

// Validación de versión: si el save es de otra versión, descartamos.
if (saved.version !== CONFIG.SAVE_KEY) {
  console.info("[Formicarium] Save de versión anterior descartado.");
  return false;
}

// Merge defensivo: si el save tiene campos que el estado fresco
// no tiene (o viceversa), los completamos para no romper nada.
const fresh = createFreshState();
gameState = deepMerge(fresh, saved);

return true;
```

} catch (e) {
console.warn(”[Formicarium] Error al cargar save:”, e.message);
return false;
}
}

// ── BORRADO ────────────────────────────────────────────────
function deleteSave() {
localStorage.removeItem(CONFIG.SAVE_KEY);
gameState = createFreshState();
}

// ── PROGRESO OFFLINE ───────────────────────────────────────
// Calcula cuántos días reales pasaron desde el último tick
// y devuelve el número de días a simular.
// Se llama al inicio de la sesión, antes del primer tick.
function calculateOfflineDays() {
const now         = Date.now();
const elapsedMs   = now - gameState.lastTickTime;
const elapsedDays = elapsedMs / CONFIG.MS_PER_DAY;

// Límite de progreso offline: 7 días.
// Más de eso sería demasiado para simular de golpe y
// también es biológicamente cuestionable (la colonia necesita
// atención activa del jugador para sobrevivir semanas sin recursos).
const MAX_OFFLINE_DAYS = 7;
return Math.min(elapsedDays, MAX_OFFLINE_DAYS);
}

// ── LOG DE EVENTOS ─────────────────────────────────────────
const MAX_LOG_ENTRIES = 50;

function logEvent(text, type = “info”) {
gameState.eventLog.unshift({
day:  gameState.gameDay,
text,
type, // “info” | “warning” | “danger” | “success”
});

// Mantener solo los últimos N eventos
if (gameState.eventLog.length > MAX_LOG_ENTRIES) {
gameState.eventLog.length = MAX_LOG_ENTRIES;
}
}

// ── UTILIDAD: DEEP MERGE ───────────────────────────────────
// Merge recursivo que usa `base` como estructura de referencia
// y sobreescribe con valores de `override` donde existan.
// Garantiza que saves viejos no rompan estados nuevos.
function deepMerge(base, override) {
if (typeof base !== “object” || base === null) return override ?? base;
if (typeof override !== “object” || override === null) return base;

const result = Array.isArray(base) ? […base] : { …base };

for (const key of Object.keys(override)) {
if (key in base) {
result[key] = deepMerge(base[key], override[key]);
} else {
// Campo del save que ya no existe en la estructura nueva → ignorar
// (no lo copiamos para no contaminar el estado)
}
}

// Campos nuevos en base que no existían en el save → los mantenemos
// con su valor fresco (ya están en result desde el spread inicial)

return result;
}