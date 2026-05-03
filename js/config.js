// ============================================================
//  FORMICARIUM VIVO — js/config.js
//  LASIUS NIGER — CONSTANTES BIOLÓGICAS
//
//  Todas las cifras están basadas en datos reales de laboratorio
//  y registros de aficionados con colonias en interior (~23°C).
//  Fuentes: Hölldobler & Wilson “The Ants” (1990), AntWiki,
//  AntStore DE, foros de Exotic-Ants y FormicaShop.
//
//  IMPORTANTE: Este fichero es INMUTABLE en runtime.
//  Toda mutación de estado va a gameState.js.
// ============================================================

const CONFIG = Object.freeze({

// ── IDENTIDAD ──────────────────────────────────────────────
GAME_NAME:  “Formicarium Vivo”,
SPECIES:    “Lasius niger”,
SAVE_KEY:   “formicarium_vivo_v1”,

// ── TIEMPO ─────────────────────────────────────────────────
TICK_INTERVAL_MS: 5000,       // el loop principal corre cada 5 s
MS_PER_DAY:       86_400_000, // milisegundos en un día real exacto

// ── CICLO DE VIDA (días reales a ~23 °C) ───────────────────
// Fuente: AntWiki “Lasius niger”, datos de cría controlada.
LIFECYCLE: Object.freeze({

```
// Metamorfosis completa: huevo → larva → pupa → obrera
EGG_DURATION:   9,   // días. Rango real: 8-10. Usamos media.
LARVA_DURATION: 12,  // días. Rango real: 10-14. Usamos media.
PUPA_DURATION:  12,  // días. Rango real: 10-14. Usamos media.
// Total desarrollo: ~33 días desde huevo hasta obrera.

// Obreras en interior sin estrés térmico ni sequía:
// registros de aficionados documentan 10-14 meses.
// Usamos la media documentada más citada: 300 días (~10 meses).
WORKER_LIFESPAN: 300,

// Reina: hasta 15-20 años documentados en cautividad.
// Usamos 15 años (5475 días) como valor conservador.
QUEEN_LIFESPAN:  5475,

// La reina llega al jugador ya fecundada, tras el vuelo nupcial.
// Una reina de primer año ya tiene ~1 año de vida consumido.
QUEEN_START_AGE: 365,
```

}),

// ── PUESTA DE HUEVOS ───────────────────────────────────────
// Fuente: observaciones directas en colonias de aficionados.
// Colonias jóvenes: 15-30 huevos/día.
// Colonias maduras (500+ obreras): hasta 80-100/día.
EGG_LAYING: Object.freeze({
BASE_PER_DAY:         20,   // huevos/día con colonia joven
MAX_PER_DAY:          80,   // techo absoluto (reina en pico)
COLONY_SCALE_FACTOR:  0.05, // +0.05 huevos/día por obrera adicional
// Fórmula en colony.js:
//   rate = min(MAX, BASE + workers * SCALE_FACTOR)
// Ejemplos:
//   10 obreras  → 20.5 huevos/día
//   100 obreras → 25   huevos/día
//   500 obreras → 45   huevos/día
//   1200 obreras → 80  huevos/día (techo)
}),

// ── RECURSOS ───────────────────────────────────────────────
// Unidades calibradas para que 10 obreras consuman aproximadamente
// lo que 10 forrajeras producen → equilibrio frágil al inicio,
// que mejora con escala (como en la realidad).
RESOURCES: Object.freeze({

```
SUGAR: Object.freeze({
  label:              "Azúcar",
  emoji:              "🍬",
  per_queen_day:      2.0,
  per_worker_day:     0.5,
  per_larva_day:      0.3,
  per_egg_day:        0.0,
  per_pupa_day:       0.0,
  starvation_worker_multiplier: 2.0,
  starvation_queen_multiplier:  1.5,
}),

PROTEIN: Object.freeze({
  label:              "Proteína",
  emoji:              "🪲",
  per_queen_day:      0.5,
  per_worker_day:     0.1,
  per_larva_day:      1.2,
  per_egg_day:        0.0,
  per_pupa_day:       0.0,
  larva_growth_paused_when_empty: true,
  starvation_queen_multiplier:    1.3,
}),

WATER: Object.freeze({
  label:              "Agua",
  emoji:              "💧",
  per_queen_day:      1.0,
  per_worker_day:     0.3,
  per_larva_day:      0.4,
  per_egg_day:        0.05,
  per_pupa_day:       0.1,
  starvation_worker_multiplier: 3.0,
  starvation_queen_multiplier:  2.5,
  starvation_larva_multiplier:  4.0,
}),
```

}),

// ── FORRAJEO DINÁMICO ──────────────────────────────────────
// El ratio de forrajeras se ajusta según nivel de recursos.
// Si almacenes vacíos → más obreras salen. Si llenos → menos.
//
// Fórmula en colony.js:
//   deficit = 1 - avg_fill_ratio   // 0..1
//   forager_ratio = RATIO_MIN + (RATIO_MAX - RATIO_MIN) * deficit
FORAGING: Object.freeze({
RATIO_MIN:  0.20,
RATIO_MAX:  0.65,

```
SUGAR_PER_FORAGER_DAY:   1.8,
PROTEIN_PER_FORAGER_DAY: 0.7,
WATER_PER_FORAGER_DAY:   1.4,

// Bonus por red de feromonas: más obreras = rutas más eficientes
// multiplier = 1 + LOG_BASE * log10(max(1, workers))
EFFICIENCY_LOG_BASE: 1.0,

BASE_MAX_SUGAR:   200,
BASE_MAX_PROTEIN: 150,
BASE_MAX_WATER:   250,
```

}),

// ── CÁMARAS DEL NIDO ───────────────────────────────────────
CHAMBERS: Object.freeze({

```
QUEEN: Object.freeze({
  id:               "queen",
  label:            "Cámara real",
  emoji:            "👑",
  max_count:        1,
  included:         true,
  egg_laying_bonus: 0.20,
}),

BROOD: Object.freeze({
  id:                     "brood",
  label:                  "Cámara de cría",
  emoji:                  "🥚",
  max_eggs_per_chamber:   60,
  max_larvae_per_chamber: 40,
  max_pupae_per_chamber:  30,
  cost: Object.freeze({ sugar: 60, protein: 25, water: 10 }),
}),

STORAGE: Object.freeze({
  id:                 "storage",
  label:              "Almacén",
  emoji:              "📦",
  storage_multiplier: 1.6,
  cost: Object.freeze({ sugar: 40, water: 15 }),
}),

TUNNEL: Object.freeze({
  id:                        "tunnel",
  label:                     "Túnel de forrajeo",
  emoji:                     "🕳️",
  foraging_bonus_per_tunnel: 0.10,
  cost: Object.freeze({ sugar: 80, protein: 10 }),
}),
```

}),

// ── ESTADO INICIAL ─────────────────────────────────────────
// Reina fecundada en tubo de ensayo con primeras nanitics.
// Situación típica al comprar una colonia inicial en el hobby.
INITIAL_STATE: Object.freeze({
workers:  3,
eggs:     8,
larvae:   0,
pupae:    0,
sugar:    15,
protein:  8,
water:    25,
chambers: Object.freeze({ queen: 1, brood: 1, storage: 0, tunnel: 0 }),
}),

});