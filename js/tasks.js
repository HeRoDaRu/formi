// ============================================================
//  FORMI — js/tasks.js
//  Sistema de órdenes: el jugador asigna obreras a trabajos.
//  Dos tipos:
//   - "project": tarea con progreso 0..total. Al completarse
//                aplica un efecto (construir cámara) y se elimina.
//   - "directive": tarea continua. Aporta un beneficio por
//                  segundo mientras esté activa. Se cancela
//                  manualmente.
//  El progreso es en tiempo real (no por tick diario).
// ============================================================

const TASK_DEFS = {
  'dig-tunnel': {
    kind: 'project',
    label: 'Excavar túnel',
    emoji: '\u{1F573}',
    points: 60,            // segundos × obreras = puntos para terminar
    defaultWorkers: 5,
    cost: { sugar: 80, protein: 10, water: 0 },
    canQueue: () => true,
    onComplete: () => {
      gameState.chambers.tunnel++;
      logEvent('\u{1F573} Nuevo t\u00fanel excavado.', 'success');
    },
  },
  'build-brood': {
    kind: 'project',
    label: 'Construir cámara de cría',
    emoji: '\u{1F95A}',
    points: 90,
    defaultWorkers: 6,
    cost: { sugar: 60, protein: 25, water: 10 },
    canQueue: () => true,
    onComplete: () => {
      gameState.chambers.brood++;
      logEvent('\u{1F95A} Nueva c\u00e1mara de cr\u00eda construida.', 'success');
    },
  },
  'build-storage': {
    kind: 'project',
    label: 'Construir almacén',
    emoji: '\u{1F4E6}',
    points: 75,
    defaultWorkers: 6,
    cost: { sugar: 40, protein: 0, water: 15 },
    canQueue: () => gameState.chambers.storage < 2,
    onComplete: () => {
      gameState.chambers.storage++;
      logEvent('\u{1F4E6} Nuevo almac\u00e9n construido.', 'success');
    },
  },
  'gather-sugar': {
    kind: 'directive',
    label: 'Recolectar azúcar',
    emoji: '\u{1F36C}',
    rate: 0.45,            // unidades por obrera por segundo
    resource: 'sugar',
    defaultWorkers: 4,
    cost: null,
  },
  'gather-protein': {
    kind: 'directive',
    label: 'Cazar proteína',
    emoji: '\u{1FAB2}',
    rate: 0.25,
    resource: 'protein',
    defaultWorkers: 4,
    cost: null,
  },
  'gather-water': {
    kind: 'directive',
    label: 'Traer agua',
    emoji: '\u{1F4A7}',
    rate: 0.55,
    resource: 'water',
    defaultWorkers: 4,
    cost: null,
  },
  'patrol': {
    kind: 'directive',
    label: 'Patrullar nido',
    emoji: '\u{1F6E1}',
    rate: 0.15,
    resource: 'protein',   // patrullas traen presas pequeñas
    defaultWorkers: 3,
    cost: null,
  },
};

function getTaskDef(type) {
  return TASK_DEFS[type] || null;
}

function getAvailableWorkers() {
  const tasks = gameState.tasks ?? [];
  const assigned = tasks.reduce((s, t) => s + (t.assigned || 0), 0);
  return Math.max(0, gameState.workers - assigned);
}

function addTask(type) {
  const def = getTaskDef(type);
  if (!def) return false;

  if (def.canQueue && !def.canQueue()) {
    logEvent('No se puede emitir esa orden ahora.', 'warning');
    return false;
  }

  // Una directiva por tipo: si ya existe, no duplicar (sumar más obreras)
  if (def.kind === 'directive') {
    const existing = gameState.tasks.find(t => t.type === type);
    if (existing) {
      const extra = Math.min(def.defaultWorkers, getAvailableWorkers());
      if (extra > 0) {
        existing.assigned += extra;
        logEvent(`${def.label}: +${extra} obreras.`, 'info');
        saveGame(true);
      } else {
        logEvent('No quedan obreras libres.', 'warning');
      }
      return true;
    }
  }

  // Verificar y cobrar coste (sólo proyectos)
  if (def.cost) {
    const c = def.cost;
    if ((c.sugar ?? 0) > gameState.sugar) { logEvent('Falta az\u00facar.', 'warning'); return false; }
    if ((c.protein ?? 0) > gameState.protein) { logEvent('Falta prote\u00edna.', 'warning'); return false; }
    if ((c.water ?? 0) > gameState.water) { logEvent('Falta agua.', 'warning'); return false; }
    gameState.sugar -= c.sugar ?? 0;
    gameState.protein -= c.protein ?? 0;
    gameState.water -= c.water ?? 0;
  }

  const available = getAvailableWorkers();
  const assigned = Math.min(def.defaultWorkers, available);
  if (assigned === 0 && gameState.workers > 0) {
    logEvent(`${def.label}: encolada sin obreras (asigna manualmente).`, 'info');
  }

  gameState.tasks.push({
    id: gameState.taskNextId++,
    type,
    kind: def.kind,
    assigned,
    progress: 0,
    total: def.kind === 'project' ? def.points : 0,
  });

  logEvent(`${def.emoji} Orden: ${def.label} (${assigned} obreras).`, 'info');
  saveGame(true);
  return true;
}

function cancelTask(id) {
  const idx = gameState.tasks.findIndex(t => t.id === id);
  if (idx < 0) return false;
  const task = gameState.tasks[idx];
  const def = getTaskDef(task.type);

  // Reembolsar parte del coste si el proyecto está poco avanzado
  if (def?.kind === 'project' && def.cost && task.progress < task.total) {
    const refundFactor = 0.5 * (1 - task.progress / task.total);
    const c = def.cost;
    gameState.sugar += Math.floor((c.sugar ?? 0) * refundFactor);
    gameState.protein += Math.floor((c.protein ?? 0) * refundFactor);
    gameState.water += Math.floor((c.water ?? 0) * refundFactor);
  }

  gameState.tasks.splice(idx, 1);
  logEvent(`Orden cancelada: ${def?.label ?? task.type}.`, 'info');
  saveGame(true);
  return true;
}

function adjustTaskWorkers(id, delta) {
  const task = gameState.tasks.find(t => t.id === id);
  if (!task) return;
  if (delta > 0) {
    const room = getAvailableWorkers();
    task.assigned += Math.min(delta, room);
  } else {
    task.assigned = Math.max(0, task.assigned + delta);
  }
}

// Avanza todas las órdenes activas. Llamado desde el render loop.
function tickTasks(dtMs) {
  if (!gameState.tasks || gameState.tasks.length === 0) return;
  const dt = dtMs / 1000;
  if (dt <= 0) return;

  // Si la mortalidad redujo workers por debajo del total asignado,
  // escalamos proporcionalmente el trabajo efectivo.
  const totalAssigned = gameState.tasks.reduce((s, t) => s + (t.assigned || 0), 0);
  const factor = totalAssigned > gameState.workers && totalAssigned > 0
    ? gameState.workers / totalAssigned
    : 1;

  const limits = getResourceLimits();
  const completed = [];

  for (const task of gameState.tasks) {
    if (task.assigned <= 0) continue;
    const def = getTaskDef(task.type);
    if (!def) continue;
    const effective = task.assigned * factor;

    if (def.kind === 'project') {
      task.progress += effective * dt;
      if (task.progress >= task.total) {
        task.progress = task.total;
        completed.push(task.id);
      }
    } else {
      const gain = effective * def.rate * dt;
      const res = def.resource;
      if (res && limits[res] != null) {
        gameState[res] = Math.min(limits[res], gameState[res] + gain);
      }
    }
  }

  for (const id of completed) {
    const idx = gameState.tasks.findIndex(t => t.id === id);
    if (idx < 0) continue;
    const task = gameState.tasks[idx];
    const def = getTaskDef(task.type);
    try { def.onComplete?.(); } catch (e) { console.warn(e); }
    gameState.tasks.splice(idx, 1);
  }

  if (completed.length > 0) saveGame(true);
}
