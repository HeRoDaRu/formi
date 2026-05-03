// ============================================================
//  FORMICARIUM VIVO — js/colony.js
//
//  Lógica biológica completa de la colonia.
//  Se ejecuta una vez por día de juego simulado.
//
//  Orden de operaciones por tick diario:
//  1. Envejecer reina y comprobar su muerte
//  2. Forrajeo: calcular recursos recogidos
//  3. Reciclaje de cadáveres (necrofagia automática)
//  4. Consumo: descontar recursos de toda la colonia
//  5. Canibalismo de emergencia si falta proteína
//  6. Mortalidad: muertes por vejez y recursos
//  7. Metamorfosis: avanzar lotes egg→larva→pupa→worker
//  8. Puesta de huevos
//  9. Actualizar estadísticas
// ============================================================

// ── TICK PRINCIPAL ─────────────────────────────────────────
function tickDay() {
if (!gameState.queen.alive && gameState.workers === 0) return;

stepQueenAge();

// Si la reina murió este tick, las obreras siguen vivas
// y deben seguir el ciclo hasta extinguirse naturalmente.

stepForaging();
stepNecrophagy();     // reciclar cadáveres del día anterior
stepConsumption();
stepEmergencyCannibalism(); // si falta proteína tras consumo
stepMortality();      // muertes → cadáveres para mañana
stepMetamorphosis();
stepEggLaying();
stepStats();

gameState.gameDay++;
gameState.lastTickTime += CONFIG.MS_PER_DAY;
}

// ── 1. ENVEJECIMIENTO DE LA REINA ──────────────────────────
function stepQueenAge() {
if (!gameState.queen.alive) return;

gameState.queen.ageDays++;

if (gameState.queen.ageDays >= CONFIG.LIFECYCLE.QUEEN_LIFESPAN) {
gameState.queen.alive = false;
logEvent(“👑 La reina ha muerto de vejez. El nido se extinguirá lentamente.”, “danger”);
}
}

// ── 2. FORRAJEO ────────────────────────────────────────────
// Ratio dinámico: sube cuando los recursos escasean.
// Red de feromonas más densa con más obreras = más eficiencia.
function stepForaging() {
const workers = gameState.workers;
if (workers === 0) return;

const f      = CONFIG.FORAGING;
const limits = getResourceLimits();

// Ratio de llenado medio (0..1)
const fillRatio = (
(gameState.sugar   / limits.sugar)   +
(gameState.protein / limits.protein) +
(gameState.water   / limits.water)
) / 3;

// Más déficit → más forrajeras salen
const deficit      = 1 - fillRatio;
const foragerRatio = f.RATIO_MIN + (f.RATIO_MAX - f.RATIO_MIN) * deficit;
const foragers     = Math.floor(workers * foragerRatio);
if (foragers === 0) return;

// Eficiencia por red de feromonas (log escala)
// 10 obreras: x2.0 | 100: x3.0 | 1000: x4.0
const efficiency  = 1 + f.EFFICIENCY_LOG_BASE * Math.log10(Math.max(1, workers));

// Bonus por túneles de forrajeo
const tunnelBonus = 1 + gameState.chambers.tunnel
* CONFIG.CHAMBERS.TUNNEL.foraging_bonus_per_tunnel;

const mult = efficiency * tunnelBonus;

const sugarGained   = foragers * f.SUGAR_PER_FORAGER_DAY   * mult;
const proteinGained = foragers * f.PROTEIN_PER_FORAGER_DAY * mult;
const waterGained   = foragers * f.WATER_PER_FORAGER_DAY   * mult;

gameState.sugar   = Math.min(limits.sugar,   gameState.sugar   + sugarGained);
gameState.protein = Math.min(limits.protein, gameState.protein + proteinGained);
gameState.water   = Math.min(limits.water,   gameState.water   + waterGained);

gameState.stats.totalFoodCollected += sugarGained + proteinGained + waterGained;
}

// ── 3. NECROFAGIA ──────────────────────────────────────────
// Las obreras reciclan automáticamente los cadáveres del día.
// Fuente: evidencia directa de necrofagia en hormigas como
// mecanismo de reciclaje de nitrógeno (Maák et al., 2025).
//
// gameState.pendingCorpses: cadáveres acumulados del tick anterior.
// Cada cadáver de obrera aporta una fracción pequeña de proteína.
// (Una obrera adulta tiene muy poca proteína útil comparado
//  con una larva, pero en masa supone un aporte real.)
function stepNecrophagy() {
const corpses = gameState.pendingCorpses ?? 0;
if (corpses === 0) return;

const limits = getResourceLimits();

// Proteína recuperada por cadáver: ~0.3 unidades
// (obreras adultas tienen menos biomasa útil que larvas)
const proteinRecovered = corpses * 0.3;
gameState.protein = Math.min(limits.protein, gameState.protein + proteinRecovered);

if (proteinRecovered >= 1) {
logEvent(
`🪦 Las obreras han reciclado ${corpses} cadáveres (+${proteinRecovered.toFixed(1)} proteína).`,
“info”
);
}

gameState.pendingCorpses = 0;
}

// ── 4. CONSUMO ─────────────────────────────────────────────
// Toda la colonia consume recursos cada día.
// Si no hay suficiente, el recurso llega a 0 y la mortalidad
// y el canibalismo de emergencia se encargan del resto.
function stepConsumption() {
const R       = CONFIG.RESOURCES;
const workers = gameState.workers;
const larvae  = countLarvae();
const eggs    = countEggs();
const pupae   = countPupae();
const alive   = gameState.queen.alive;

const sugarNeeded =
(alive ? R.SUGAR.per_queen_day   : 0) +
workers * R.SUGAR.per_worker_day +
larvae  * R.SUGAR.per_larva_day  +
eggs    * R.SUGAR.per_egg_day    +
pupae   * R.SUGAR.per_pupa_day;

const proteinNeeded =
(alive ? R.PROTEIN.per_queen_day  : 0) +
workers * R.PROTEIN.per_worker_day +
larvae  * R.PROTEIN.per_larva_day  +
eggs    * R.PROTEIN.per_egg_day    +
pupae   * R.PROTEIN.per_pupa_day;

const waterNeeded =
(alive ? R.WATER.per_queen_day   : 0) +
workers * R.WATER.per_worker_day +
larvae  * R.WATER.per_larva_day  +
eggs    * R.WATER.per_egg_day    +
pupae   * R.WATER.per_pupa_day;

gameState.sugar   = Math.max(0, gameState.sugar   - sugarNeeded);
gameState.protein = Math.max(0, gameState.protein - proteinNeeded);
gameState.water   = Math.max(0, gameState.water   - waterNeeded);

// Avisos de escasez (umbral 10% de capacidad)
const limits = getResourceLimits();
if (gameState.sugar   < limits.sugar   * 0.1) logEvent(“⚠️ Reservas de azúcar críticas.”,   “warning”);
if (gameState.protein < limits.protein * 0.1) logEvent(“⚠️ Reservas de proteína críticas.”, “warning”);
if (gameState.water   < limits.water   * 0.1) logEvent(“⚠️ Reservas de agua críticas.”,     “warning”);
}

// ── 5. CANIBALISMO DE EMERGENCIA ───────────────────────────
// Fuentes científicas:
// - Larvas de último estadio de Lasius niger consumen huevos
//   propios como componente esencial de su dieta (Grasso et al.).
// - Sin proteína externa, la colonia sacrifica huevos y larvas
//   débiles en orden de prioridad para sobrevivir.
// - Los cadáveres de obreras ya se reciclan en stepNecrophagy.
//
// Orden de canibalismo (de menor a mayor coste biológico):
//   Día 1-2 sin proteína → solo necrofagia (ya procesada)
//   Día 3+  sin proteína → consumo de huevos propios
//   Día 6+  sin proteína → consumo de larvas jóvenes
//
// El contador gameState.daysWithoutProtein rastrea la sequía.
function stepEmergencyCannibalism() {
if (gameState.protein > 0) {
// Proteína disponible: resetear contador
gameState.daysWithoutProtein = 0;
return;
}

gameState.daysWithoutProtein = (gameState.daysWithoutProtein ?? 0) + 1;
const days = gameState.daysWithoutProtein;

const limits = getResourceLimits();

// ── Fase 1: días 1-2 → solo necrofagia ───────────────────
// (ya procesada en stepNecrophagy, nada adicional aquí)

// ── Fase 2: día 3+ → consumo de huevos ───────────────────
if (days >= 3 && countEggs() > 0) {
// Cuántos huevos se consumen hoy:
// proporción creciente según días sin proteína, máx 20%/día
const fraction = Math.min(0.20, 0.05 * (days - 2));
const before   = countEggs();
const consumed = consumeBatchFraction(gameState.eggs, fraction);
const actual   = before - countEggs();

```
if (actual > 0) {
  // Cada huevo aporta poca proteína (son pequeños)
  const gained = actual * 0.15;
  gameState.protein = Math.min(limits.protein, gameState.protein + gained);
  logEvent(
    `🥚 Las obreras han consumido ${actual} huevos por falta de proteína (+${gained.toFixed(1)}).`,
    "danger"
  );
  gameState.stats.eggsCannibalised = (gameState.stats.eggsCannibalised ?? 0) + actual;
}
```

}

// ── Fase 3: día 6+ → consumo de larvas jóvenes ───────────
// Solo las larvas más jóvenes (ageDays <= 3): las más débiles
// y con menor inversión biológica acumulada.
if (days >= 6 && countLarvae() > 0) {
const fraction = Math.min(0.15, 0.03 * (days - 5));
const before   = countLarvae();

```
// Consumir preferentemente larvas jóvenes (ageDays bajo)
gameState.larvae.sort((a, b) => a.ageDays - b.ageDays);
consumeBatchFraction(gameState.larvae, fraction);

const actual = before - countLarvae();
if (actual > 0) {
  // Larvas aportan más proteína que huevos
  const gained = actual * 0.8;
  gameState.protein = Math.min(limits.protein, gameState.protein + gained);
  logEvent(
    `🐛 Las obreras han sacrificado ${actual} larvas para sobrevivir (+${gained.toFixed(1)} proteína).`,
    "danger"
  );
  gameState.stats.larvaeCannibalised = (gameState.stats.larvaeCannibalised ?? 0) + actual;
}
```

}

// ── Aviso progresivo ──────────────────────────────────────
if (days === 3) logEvent(“⚠️ Sin proteína: el nido empieza a consumir sus propios huevos.”, “warning”);
if (days === 6) logEvent(“🚨 Crisis severa: las obreras sacrifican larvas para sobrevivir.”, “danger”);
if (days === 10) logEvent(“💀 El nido está en colapso por inanición proteica.”, “danger”);
}

// ── 6. MORTALIDAD ──────────────────────────────────────────
// Fuentes de muerte:
//   a) Vejez natural (distribución estadística uniforme)
//   b) Inanición por azúcar o agua
//   c) Desecación de huevos y larvas sin agua
//   d) Muerte de la reina por recursos críticos (probabilística)
//
// Los cadáveres del día se acumulan en pendingCorpses
// para ser reciclados mañana por stepNecrophagy.
function stepMortality() {
const R = CONFIG.RESOURCES;

// ── a) Vejez natural de obreras ──────────────────────────
// 1/LIFESPAN de las obreras muere cada día por vejez.
const agingDeaths = gameState.workers / CONFIG.LIFECYCLE.WORKER_LIFESPAN;

// ── b) Mortalidad por recursos ────────────────────────────
const noSugar   = gameState.sugar   <= 0;
const noWater   = gameState.water   <= 0;
const noProtein = gameState.protein <= 0;

let mortalityMult = 1.0;
if (noSugar)   mortalityMult += R.SUGAR.starvation_worker_multiplier   - 1; // +1.0 (x2 total)
if (noWater)   mortalityMult += R.WATER.starvation_worker_multiplier   - 1; // +2.0 (x3 total)
if (noProtein) mortalityMult += 0.1; // sin proteína: leve efecto en adultos

const workerDeaths = Math.ceil(agingDeaths * mortalityMult);
const actualDeaths = Math.min(workerDeaths, gameState.workers);

gameState.workers -= actualDeaths;
gameState.stats.totalWorkerDeaths += actualDeaths;

// Acumular cadáveres para reciclaje mañana
gameState.pendingCorpses = (gameState.pendingCorpses ?? 0) + actualDeaths;

if (actualDeaths > 0 && mortalityMult > 1.2) {
logEvent(`💀 ${actualDeaths} obreras han muerto hoy por falta de recursos.`, “danger”);
}

// ── c) Huevos sin agua: se secan ──────────────────────────
// ~30% de los huevos mueren por día sin humedad.
if (noWater && countEggs() > 0) {
const before = countEggs();
consumeBatchFraction(gameState.eggs, 0.30);
const died = before - countEggs();
if (died > 0) logEvent(`💧 ${died} huevos se han secado por falta de agua.`, “danger”);
}

// ── c) Larvas sin agua: mueren rápido ────────────────────
// Las larvas son muy sensibles a la desecación (~40%/día).
if (noWater && countLarvae() > 0) {
const before = countLarvae();
consumeBatchFraction(gameState.larvae, 0.40);
const died = before - countLarvae();
if (died > 0) {
gameState.stats.totalLarvaeStarved = (gameState.stats.totalLarvaeStarved ?? 0) + died;
logEvent(`💧 ${died} larvas han muerto por desecación.`, “danger”);
}
}

// ── d) Muerte de la reina por recursos ────────────────────
// La reina aguanta más que las obreras, pero no indefinidamente.
// Probabilidad diaria de muerte según combinación de carencias.
if (gameState.queen.alive) {
let queenDeathChance = 0;

```
if (noWater && noSugar) queenDeathChance = 0.15; // crisis total
else if (noWater)       queenDeathChance = 0.08;
else if (noSugar)       queenDeathChance = 0.04;

if (queenDeathChance > 0 && Math.random() < queenDeathChance) {
  gameState.queen.alive = false;
  logEvent("👑 La reina ha muerto por falta de recursos. El nido se extinguirá.", "danger");
}
```

}

// ── Avisos de estado ──────────────────────────────────────
if (gameState.workers === 0 && gameState.queen.alive) {
logEvent(“⚠️ No quedan obreras. La reina está completamente sola.”, “warning”);
}
}

// ── 7. METAMORFOSIS ────────────────────────────────────────
// Avanza la edad de cada lote un día.
// Sin proteína: las larvas no crecen (ageDays congelado).
// Cuando un lote supera la duración de su fase, pasa a la siguiente.
// Se respeta la capacidad de cámaras en cada transición.
function stepMetamorphosis() {
const L         = CONFIG.LIFECYCLE;
const noProtein = gameState.protein <= 0;
const capacity  = getNestCapacity();

// ── Pupas → Obreras ──────────────────────────────────────
let newWorkerCount = 0;
const remainingPupae = [];

for (const batch of gameState.pupae) {
batch.ageDays++;
if (batch.ageDays >= L.PUPA_DURATION) {
newWorkerCount += batch.count;
} else {
remainingPupae.push(batch);
}
}
gameState.pupae = remainingPupae;

if (newWorkerCount > 0) {
gameState.workers += newWorkerCount;
gameState.stats.totalWorkersEverBorn += newWorkerCount;
gameState.stats.peakWorkers = Math.max(
gameState.stats.peakWorkers,
gameState.workers
);
logEvent(`🐜 ${newWorkerCount} nuevas obreras han eclosionado.`, “success”);
}

// ── Larvas → Pupas ───────────────────────────────────────
// Sin proteína: ageDays no avanza (crecimiento pausado).
let newPupaeCount = 0;
const remainingLarvae = [];

for (const batch of gameState.larvae) {
if (!noProtein) batch.ageDays++;

```
if (batch.ageDays >= L.LARVA_DURATION) {
  const currentPupae = countPupae() + newPupaeCount;
  const canFit = Math.max(0, capacity.maxPupae - currentPupae);
  const advancing = Math.min(batch.count, canFit);

  newPupaeCount += advancing;
  const leftover = batch.count - advancing;
  if (leftover > 0) {
    // Las que no caben se quedan como larva maduras
    // (ageDays se mantiene en el máximo para avanzar en cuanto haya espacio)
    remainingLarvae.push({ ageDays: batch.ageDays, count: leftover });
  }
} else {
  remainingLarvae.push(batch);
}
```

}
gameState.larvae = remainingLarvae;

if (newPupaeCount > 0) {
addBatch(gameState.pupae, newPupaeCount);
}

if (noProtein && countLarvae() > 0) {
logEvent(“⏸️ Las larvas han detenido su crecimiento: falta proteína.”, “warning”);
}

// ── Huevos → Larvas ──────────────────────────────────────
let newLarvaeCount = 0;
const remainingEggs = [];

for (const batch of gameState.eggs) {
batch.ageDays++;
if (batch.ageDays >= L.EGG_DURATION) {
newLarvaeCount += batch.count;
} else {
remainingEggs.push(batch);
}
}
gameState.eggs = remainingEggs;

if (newLarvaeCount > 0) {
const currentLarvae = countLarvae();
const canFit  = Math.max(0, capacity.maxLarvae - currentLarvae);
const fitting = Math.min(newLarvaeCount, canFit);
const overflow = newLarvaeCount - fitting;

```
if (fitting > 0) addBatch(gameState.larvae, fitting);
if (overflow > 0) {
  logEvent(`⚠️ ${overflow} larvas no caben. Amplía las cámaras de cría.`, "warning");
}
```

}
}

// ── 8. PUESTA DE HUEVOS ────────────────────────────────────
function stepEggLaying() {
if (!gameState.queen.alive) return;
if (gameState.workers === 0) return; // sin obreras no hay cuidado del nido

const el       = CONFIG.EGG_LAYING;
const capacity = getNestCapacity();

const queenBonus = gameState.chambers.queen > 0
? CONFIG.CHAMBERS.QUEEN.egg_laying_bonus
: 0;

const baseRate = Math.min(
el.MAX_PER_DAY,
el.BASE_PER_DAY + gameState.workers * el.COLONY_SCALE_FACTOR
);
const rate = Math.floor(baseRate * (1 + queenBonus));

const currentEggs = countEggs();
const canFit      = Math.max(0, capacity.maxEggs - currentEggs);
const laid        = Math.min(rate, canFit);

if (laid > 0) {
addBatch(gameState.eggs, laid);
gameState.stats.totalEggsLaid += laid;
} else if (canFit === 0 && rate > 0) {
logEvent(“⚠️ Sin espacio para más huevos. Amplía las cámaras de cría.”, “warning”);
}
}

// ── 9. ESTADÍSTICAS ────────────────────────────────────────
function stepStats() {
gameState.stats.daysPlayed++;
}

// ── CONSTRUCCIÓN DE CÁMARAS ────────────────────────────────
function canBuildChamber(type) {
const key = type.toUpperCase();
const def = CONFIG.CHAMBERS[key];
if (!def)          return “Tipo de cámara desconocido.”;
if (def.included)  return “Esta cámara ya está incluida de inicio.”;

if (def.max_count && gameState.chambers[type] >= def.max_count) {
return `Solo puede haber ${def.max_count} cámara(s) de este tipo.`;
}

const cost = def.cost ?? {};
if (cost.sugar   && gameState.sugar   < cost.sugar)   return “No hay suficiente azúcar.”;
if (cost.protein && gameState.protein < cost.protein) return “No hay suficiente proteína.”;
if (cost.water   && gameState.water   < cost.water)   return “No hay suficiente agua.”;

return null;
}

function buildChamber(type) {
const reason = canBuildChamber(type);
if (reason) {
logEvent(`No se puede construir: ${reason}`, “warning”);
return false;
}

const def  = CONFIG.CHAMBERS[type.toUpperCase()];
const cost = def.cost ?? {};

gameState.sugar   -= cost.sugar   ?? 0;
gameState.protein -= cost.protein ?? 0;
gameState.water   -= cost.water   ?? 0;
gameState.chambers[type]++;

logEvent(`🏗️ Nueva ${def.label} construida.`, “success”);
saveGame();
return true;
}

// ── SIMULACIÓN OFFLINE ─────────────────────────────────────
// Sin límite de días. Si la colonia muere, muere.
// Muestra aviso en UI si la simulación es larga.
function simulateOffline(onProgress) {
const daysPending    = calculateOfflineDays();
const daysToSimulate = Math.floor(daysPending);
if (daysToSimulate < 1) return 0;

const HEAVY_THRESHOLD = 30; // días a partir de los cuales avisamos
const isHeavy = daysToSimulate >= HEAVY_THRESHOLD;

if (isHeavy && typeof onProgress === “function”) {
onProgress({ phase: “start”, total: daysToSimulate });
}

for (let i = 0; i < daysToSimulate; i++) {
// Si la colonia está completamente muerta, parar
if (!gameState.queen.alive && gameState.workers === 0
&& countEggs() === 0 && countLarvae() === 0 && countPupae() === 0) {
break;
}

```
tickDay();

// Reportar progreso cada 10 días para que la UI pueda
// mostrar una barra o mensaje sin bloquear el hilo principal.
// (En el futuro esto podría moverse a un Web Worker.)
if (isHeavy && typeof onProgress === "function" && i % 10 === 0) {
  onProgress({ phase: "progress", current: i + 1, total: daysToSimulate });
}
```

}

if (isHeavy && typeof onProgress === “function”) {
onProgress({ phase: “done”, total: daysToSimulate });
}

const type = daysToSimulate > 7 ? “warning” : “info”;
logEvent(
`🕐 Han pasado ${daysToSimulate} día(s) mientras estabas fuera.`,
type
);

return daysToSimulate;
}

// ── UTILIDADES DE LOTES ────────────────────────────────────

// Añade count individuos como lote nuevo (ageDays = 0).
// Si ya hay un lote con ageDays = 0, lo fusiona.
function addBatch(batchArray, count) {
if (count <= 0) return;
const existing = batchArray.find(b => b.ageDays === 0);
if (existing) {
existing.count += count;
} else {
batchArray.push({ ageDays: 0, count });
}
}

// Aplica mortalidad fraccional a todos los lotes.
// Devuelve el array filtrado (elimina lotes vacíos).
// Modifica el array in-place Y devuelve referencia.
function killBatchFraction(batchArray, fraction) {
for (const batch of batchArray) {
batch.count -= Math.floor(batch.count * fraction);
}
const alive = batchArray.filter(b => b.count > 0);
batchArray.length = 0;
alive.forEach(b => batchArray.push(b));
return batchArray;
}

// Como killBatchFraction pero para canibalismo:
// elimina individuos y devuelve cuántos se consumieron.
// Modifica el array in-place.
function consumeBatchFraction(batchArray, fraction) {
let consumed = 0;
for (const batch of batchArray) {
const eating = Math.floor(batch.count * fraction);
batch.count -= eating;
consumed    += eating;
}
// Limpiar lotes vacíos
const alive = batchArray.filter(b => b.count > 0);
batchArray.length = 0;
alive.forEach(b => batchArray.push(b));
return consumed;
}