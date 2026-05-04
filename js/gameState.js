// ============================================================
//  FORMI — js/gameState.js
//
//  Estado mutable del juego. Todo lo que cambia en runtime
//  vive aquí. CONFIG es inmutable; gameState es la verdad
//  actual de la colonia.
//
//  Sistema de guardado:
//  - Persiste en localStorage como JSON.
//  - Usa timestamps reales (Date.now()) para tiempo offline.
//  - Sin límite de progreso offline: si la colonia muere por
//    falta de recursos mientras no jugabas, muere. Como en
//    la realidad.
//  - Sistema de migraciones encadenadas: los saves de versiones
//    anteriores se actualizan sin perder datos.
//
//  Modelo de población por LOTES:
//  - Huevos, larvas y pupas se agrupan por día de puesta/eclosión.
//  - Cada lote: { ageDays: number, count: number }
//  - Con 10.000 en desarrollo: ~33 objetos, no 10.000.
//  - Obreras adultas: un único contador (su muerte es por edad
//    media estadística, no individual — ver colony.js).
// ============================================================

// ── VERSIÓN DEL ESQUEMA ────────────────────────────────────
// Número entero que sube con cada cambio estructural del estado.
// NUNCA bajar este número. SIEMPRE añadir una migración al subir.
const SCHEMA_VERSION = 1;

// ── MIGRACIONES ────────────────────────────────────────────
// Cada clave es el número de versión AL QUE migra esa función.
// Si el save está en v1 y el juego está en v3,
// se aplican: MIGRATIONS[2] → MIGRATIONS[3] en orden.
const MIGRATIONS = {
  // Ejemplo para futuras versiones:
  // 2: (state) => {
  //   state.chambers.tunnel = state.chambers.tunnel ?? 0;
  //   return state;
  // },
};

// ── ESTADO INICIAL LIMPIO ──────────────────────────────────
function createFreshState() {
  const init = CONFIG.INITIAL_STATE;
  const now = Date.now();

  return {

    // ── Meta ────────────────────────────────────────────────
    schemaVersion: SCHEMA_VERSION,
    lastSaveTime: now,
    lastTickTime: now,  // timestamp del último tick procesado
    gameDay: 0,    // días de juego transcurridos (entero)

    // ── Reina ───────────────────────────────────────────────
    queen: {
      alive: true,
      ageDays: CONFIG.LIFECYCLE.QUEEN_START_AGE,
    },

    // ── Población adulta ────────────────────────────────────
    // Obreras adultas: un contador + edad media acumulada.
    // La mortalidad es estadística: cada día muere una fracción
    // proporcional a 1/WORKER_LIFESPAN (distribución uniforme).
    // Esto es una aproximación válida con colonias grandes.
    workers: init.workers,

    // ── Población en desarrollo (LOTES) ─────────────────────
    // Cada lote representa individuos puestos/eclosionados
    // el mismo día. { ageDays: number, count: number }
    //
    // ageDays se incrementa cada día de juego.
    // Cuando ageDays supera la duración de esa fase, el lote
    // avanza a la siguiente (egg→larva→pupa→worker).
    //
    // Con colonias de miles: el array nunca supera ~33 elementos
    // (un lote por día del ciclo completo de ~33 días).
    eggs: [{ ageDays: 0, count: init.eggs }],
    larvae: [],
    pupae: [],

    // ── Recursos ────────────────────────────────────────────
    sugar: init.sugar,
    protein: init.protein,
    water: init.water,

    // ── Cámaras ─────────────────────────────────────────────
    chambers: {
      queen: init.chambers.queen,
      brood: init.chambers.brood,
      storage: init.chambers.storage,
      tunnel: init.chambers.tunnel,
    },

    // ── Estadísticas ────────────────────────────────────────
    // Solo informativas. No afectan a la lógica del juego.
    stats: {
      totalWorkersEverBorn: init.workers,
      totalEggsLaid: init.eggs,
      totalWorkerDeaths: 0,
      totalLarvaeStarved: 0,  // larvas muertas por falta de agua
      peakWorkers: init.workers,
      totalFoodCollected: 0,
      daysPlayed: 0,
    },

    // ── Diario del nido ─────────────────────────────────────
    // Eventos recientes para mostrar al jugador.
    // Orden: más reciente primero.
    eventLog: [
      {
        day: 0,
        text: "La reina ha llegado. El nido comienza.",
        type: "info",
      }
    ],

    // ── Flags ───────────────────────────────────────────────
    pendingCorpses: 0,
    daysWithoutProtein: 0,
    lastFedTime: { sugar: 0, protein: 0, water: 0 },

    // ── Flags ───────────────────────────────────────────────
    ui: {
      firstVisit: true,
      offlineWarningShown: false,
    },

  };
}

// ── ESTADO GLOBAL ──────────────────────────────────────────
let gameState = createFreshState();

// ── LÍMITES DINÁMICOS DE RECURSOS ──────────────────────────
function getResourceLimits() {
  const f = CONFIG.FORAGING;
  const storageCount = gameState.chambers.storage;
  const tunnelCount = gameState.chambers.tunnel;

  const storageMult = Math.pow(
    CONFIG.CHAMBERS.STORAGE.storage_multiplier,
    storageCount
  );

  // Los túneles amplían solo el agua (más acceso al exterior)
  const waterTunnelBonus = tunnelCount * 0.15;

  return {
    sugar: Math.floor(f.BASE_MAX_SUGAR * storageMult),
    protein: Math.floor(f.BASE_MAX_PROTEIN * storageMult),
    water: Math.floor(f.BASE_MAX_WATER * (storageMult + waterTunnelBonus)),
  };
}

// ── CAPACIDAD DE CRÍA ──────────────────────────────────────
function getNestCapacity() {
  const ch = CONFIG.CHAMBERS.BROOD;
  const count = Math.max(1, gameState.chambers.brood);
  return {
    maxEggs: ch.max_eggs_per_chamber * count,
    maxLarvae: ch.max_larvae_per_chamber * count,
    maxPupae: ch.max_pupae_per_chamber * count,
  };
}

// ── CONTADORES DE POBLACIÓN ────────────────────────────────
// Suma todos los lotes de una fase.
function countEggs() { return gameState.eggs.reduce((s, b) => s + b.count, 0); }
function countLarvae() { return gameState.larvae.reduce((s, b) => s + b.count, 0); }
function countPupae() { return gameState.pupae.reduce((s, b) => s + b.count, 0); }

// ── GUARDADO ───────────────────────────────────────────────
// Guardado debounced: se llama frecuente pero solo escribe
// a localStorage si han pasado al menos SAVE_DEBOUNCE_MS.
const SAVE_DEBOUNCE_MS = 10_000; // máximo 1 escritura cada 10 s
let _lastWriteTime = 0;

function saveGame(force = false) {
  const now = Date.now();
  if (!force && (now - _lastWriteTime) < SAVE_DEBOUNCE_MS) return;

  try {
    gameState.lastSaveTime = now;
    localStorage.setItem(CONFIG.SAVE_KEY, JSON.stringify(gameState));
    _lastWriteTime = now;
  } catch (e) {
    console.warn('[Formicarium] No se pudo guardar:', e.message);
  }
}

// ── CARGA ──────────────────────────────────────────────────
// Devuelve true si se restauró una partida existente.
function loadGame() {
  try {
    const raw = localStorage.getItem(CONFIG.SAVE_KEY);
    if (!raw) return false;

    const saved = JSON.parse(raw);

    // Migrar si es necesario
    const migrated = migrateSave(saved);
    if (!migrated) return false; // migración falló, empezar de cero

    gameState = migrated;
    return true;

  } catch (e) {
    console.warn('[Formicarium] Error al cargar save:', e.message);
    return false;
  }
}

// ── BORRADO ────────────────────────────────────────────────
function deleteSave() {
  localStorage.removeItem(CONFIG.SAVE_KEY);
  gameState = createFreshState();
}

// ── SISTEMA DE MIGRACIONES ─────────────────────────────────
function migrateSave(saved) {
  let version = saved.schemaVersion ?? 0;

  // Si el save es más nuevo que el juego: no tocar (downgrade)
  if (version > SCHEMA_VERSION) {
    console.warn('[Formicarium] Save más nuevo que el juego. Se descarta.');
    return null;
  }

  // Aplicar migraciones encadenadas hasta alcanzar SCHEMA_VERSION
  while (version < SCHEMA_VERSION) {
    version++;
    if (MIGRATIONS[version]) {
      try {
        saved = MIGRATIONS[version](saved);
        saved.schemaVersion = version;
        console.info(`[Formicarium] Save migrado a schema v${version}.`);
      } catch (e) {
        console.warn(`[Formicarium] Migración v${version} falló:`, e.message);
        return null;
      }
    } else {
      // No hay función de migración para esta versión:
      // asumimos que es compatible (solo se añadieron campos nuevos).
      saved.schemaVersion = version;
    }
  }

  // Merge defensivo final: garantiza que todos los campos
  // del estado fresco existen en el save (por si una migración
  // no añadió un campo nuevo).
  const fresh = createFreshState();
  return deepMerge(fresh, saved);
}

// ── PROGRESO OFFLINE ───────────────────────────────────────
// Sin límite. Si la colonia muere offline, muere.
function calculateOfflineDays() {
  const now = Date.now();
  const elapsedMs = now - gameState.lastTickTime;
  return elapsedMs / CONFIG.MS_PER_DAY; // puede ser fracción de día
}

// ── LOG DE EVENTOS ─────────────────────────────────────────
const MAX_LOG_ENTRIES = 60;

function logEvent(text, type = 'info') {
  // Evitar entradas duplicadas consecutivas
  if (gameState.eventLog[0]?.text === text) return;

  gameState.eventLog.unshift({
    day: gameState.gameDay,
    text,
    type, // 'info' | 'warning' | 'danger' | 'success'
  });

  if (gameState.eventLog.length > MAX_LOG_ENTRIES) {
    gameState.eventLog.length = MAX_LOG_ENTRIES;
  }
}

// ── DEEP MERGE ─────────────────────────────────────────────
// Usa `base` como estructura de referencia.
// Sobreescribe con valores de `override` donde coincidan.
// Campos nuevos en base (no en override) se mantienen frescos.
// Campos en override que no existen en base se ignoran.
function deepMerge(base, override) {
  // Casos base
  if (override === undefined || override === null) return base;
  if (typeof base !== 'object' || base === null) return override;

  // Arrays: en este juego los arrays del save son la fuente de verdad
  // (lotes de huevos/larvas/pupas y eventLog tienen datos reales).
  if (Array.isArray(base)) {
    return Array.isArray(override) ? override : base;
  }

  const result = { ...base };
  for (const key of Object.keys(base)) {
    if (key in override) {
      result[key] = deepMerge(base[key], override[key]);
    }
    // Si la clave no está en override, mantiene el valor fresco de base
  }
  return result;
}