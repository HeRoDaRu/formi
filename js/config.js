// ============================================================
//  LASIUS NIGER — BIOLOGICAL CONSTANTS
//  Todas las cifras están basadas en datos reales de laboratorio.
//  Fuentes: Hölldobler & Wilson “The Ants”, AntWiki, registros
//  de aficionados con colonias en interior.
// ============================================================

const CONFIG = Object.freeze({

// — IDENTIDAD —
SPECIES: “Lasius niger”,
SAVE_KEY: “lasius_niger_v1”,

// — TIEMPO —
// El juego usa timestamps reales. 1 segundo real = 1 segundo de juego.
// El tick se ejecuta cada N ms para calcular progreso acumulado.
TICK_INTERVAL_MS: 5000,          // cada 5 segundos recalcula estado
MS_PER_DAY: 86_400_000,          // milisegundos en un día real

// — CICLO DE VIDA (en días reales) —
LIFECYCLE: {
// Huevo → larva → pupa → obrera
EGG_DURATION:    8,   // días como huevo
LARVA_DURATION: 12,   // días como larva (necesita proteína)
PUPA_DURATION:  10,   // días como pupa (no consume recursos)
// Total metamorfosis: ~30 días

```
WORKER_LIFESPAN: 365, // días de vida de una obrera en interior
                       // (en exterior pueden morir antes; interior
                       //  alarga la esperanza de vida notablemente)

QUEEN_LIFESPAN: 5475, // días = ~15 años. La reina de partida
                       // empieza con 1 año de vida ya consumido
                       // (fundación típica tras vuelo nupcial)
QUEEN_START_AGE: 365, // días de edad al inicio del juego
```

},

// — PUESTA DE HUEVOS —
// Una reina de Lasius niger en condiciones óptimas pone entre
// 15 y 30 huevos/día en verano, menos en otras épocas.
// Como el nido está en interior (temperatura estable), usamos
// una tasa base constante modulada por el tamaño de la colonia.
EGG_LAYING: {
BASE_PER_DAY: 10,         // huevos/día con colonia pequeña
MAX_PER_DAY:  30,         // techo absoluto por capacidad reina
COLONY_SCALE_FACTOR: 0.02, // +0.02 huevos/día por cada obrera
// (más obreras = mejor cuidado = más huevos)
// Fórmula: min(MAX, BASE + workers * SCALE_FACTOR)
},

// — RECURSOS —
RESOURCES: {
// Azúcar: fuente de energía rápida
SUGAR: {
label:          “Azúcar”,
emoji:          “🍬”,
// Consumo diario por individuo (en unidades de juego)
per_worker_day: 0.5,   // obreras consumen poco azúcar
per_larva_day:  0.2,   // larvas también necesitan algo
per_queen_day:  2.0,   // la reina consume más (producción de huevos)
// Sin azúcar: obreras mueren 2x más rápido
starvation_multiplier: 2.0,
},

```
// Proteína: insectos, necesaria para larvas (no para adultos adultos)
PROTEIN: {
  label:          "Proteína",
  emoji:          "🪲",
  per_larva_day:  1.0,   // las larvas NECESITAN proteína para crecer
  per_worker_day: 0.1,   // obreras adultas necesitan muy poca
  per_queen_day:  0.5,
  // Sin proteína: larvas no crecen (se pausan en esa fase)
  larva_growth_pause: true,
},

// Agua: imprescindible, especialmente en interior con calefacción
WATER: {
  label:          "Agua",
  emoji:          "💧",
  per_worker_day: 0.3,
  per_larva_day:  0.2,
  per_queen_day:  1.0,
  // Sin agua: toda la colonia muere 3x más rápido (crítico)
  starvation_multiplier: 3.0,
},
```

},

// — FORRAJEO —
// Las obreras salen a buscar comida. Cuanto mayor es la colonia,
// más eficiente es el sistema de feromonas → más comida traen.
FORAGING: {
// Fracción de obreras que forrajean (resto cuida el nido)
FORAGER_RATIO: 0.4,

```
// Recursos base por forrajera por día
SUGAR_PER_FORAGER_DAY:   2.0,
PROTEIN_PER_FORAGER_DAY: 0.8,
WATER_PER_FORAGER_DAY:   1.5,

// Bonus logarítmico por tamaño de colonia (red de feromonas)
// Fórmula: 1 + EFFICIENCY_LOG_BASE * log10(workers)
// Con 10 obreras: +1x, con 100: +2x, con 1000: +3x
EFFICIENCY_LOG_BASE: 1.0,

// Límite de almacenamiento (para que la gestión importe)
MAX_SUGAR:   500,
MAX_PROTEIN: 300,
MAX_WATER:   400,
```

},

// — CÁMARAS DEL NIDO —
// El jugador puede ampliar el nido comprando cámaras.
// Cada cámara tiene un tipo y una capacidad.
CHAMBERS: {
BROOD: {
id:       “brood”,
label:    “Cámara de cría”,
emoji:    “🥚”,
max_eggs_per_chamber:   50,
max_larvae_per_chamber: 30,
max_pupae_per_chamber:  20,
base_cost: { sugar: 50, protein: 20 },
},
STORAGE: {
id:     “storage”,
label:  “Almacén”,
emoji:  “📦”,
// Cada cámara de almacén multiplica el límite de recursos
storage_multiplier: 1.5,
base_cost: { sugar: 30 },
},
QUEEN: {
id:       “queen”,
label:    “Cámara real”,
emoji:    “👑”,
// Solo se puede tener 1. Viene de inicio.
max_count: 1,
egg_laying_bonus: 0.2, // +20% huevos/día
base_cost: null, // incluida de inicio
},
},

// — ESTADO INICIAL —
// Simula recibir una reina fecundada recién fundada
// (típico en el hobby: recibes la reina tras el vuelo nupcial
//  con sus primeros huevos o nanitics)
INITIAL_STATE: {
workers:  3,    // 3 nanitics (primeras obreras, más pequeñas)
eggs:     5,
larvae:   0,
pupae:    0,
sugar:    20,
protein:  10,
water:    30,
chambers: { brood: 1, storage: 1, queen: 1 },
},

});
