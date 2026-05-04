// ============================================================
//  FORMI — js/main.js
//
//  Punto de entrada. Orquesta:
//  - Carga del save
//  - Simulación offline
//  - Loop de lógica (tick cada 5s)
//  - Loop de render canvas (60fps, separado de la lógica)
//  - Guardado periódico
// ============================================================

// ── ARRANQUE ───────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initUI();

  const hasSave = loadGame();

  if (hasSave) {
    // Simular días offline antes de mostrar nada
    const days = simulateOffline(offlineProgressHandler);
    if (days === 0) {
      // Menos de un día: no hay overlay, render directo
      render();
    } else {
      // El overlay ya se mostró durante la simulación
      render();
    }
  } else {
    // Nueva partida: mostrar hint de bienvenida
    logEvent('🐜 Bienvenido a Formi. Tu reina ha llegado.', 'success');
    logEvent('💡 Construye cámaras de cría para dar espacio al nido.', 'info');
    render();
  }

  startLogicLoop();
  startRenderLoop();
});

// ── LOOP DE LÓGICA ─────────────────────────────────────────
// Corre cada TICK_INTERVAL_MS (5s).
// Calcula cuántos días reales han pasado desde el último tick
// y simula ese tiempo (normalmente fracción de día, acumulada).
//
// Usamos tiempo acumulado fraccionario para que días que
// tardan más de 24h en completarse no se pierdan.
let _fractionalDayAccumulator = 0;
let _logicInterval = null;

function startLogicLoop() {
  _logicInterval = setInterval(() => {
    const now = Date.now();
    const elapsedMs = now - gameState.lastTickTime;
    const elapsedDays = elapsedMs / CONFIG.MS_PER_DAY;

    _fractionalDayAccumulator += elapsedDays;

    // Procesar todos los días completos acumulados
    const daysToProcess = Math.floor(_fractionalDayAccumulator);
    if (daysToProcess >= 1) {
      for (let i = 0; i < daysToProcess; i++) {
        tickDay();
      }
      _fractionalDayAccumulator -= daysToProcess;
    }

    // Actualizar lastTickTime aunque no haya procesado días
    // (para que el acumulador no se dispare si el tab queda en background)
    gameState.lastTickTime = now;

    render();
    saveGame();

  }, CONFIG.TICK_INTERVAL_MS);
}

// ── LOOP DE RENDER (60fps) ─────────────────────────────────
// Solo redibuja el canvas del nido (hormigas animadas).
// El panel de control (DOM) solo se actualiza en el loop de lógica.
let _lastFrameTime = 0;
let _orderUiAccum = 0;

function startRenderLoop() {
  _lastFrameTime = performance.now();
  function frame(now) {
    const dt = now - _lastFrameTime;
    _lastFrameTime = now;

    // Avanzar órdenes en tiempo real
    tickTasks(dt);

    // Refrescar el panel de órdenes ~4 veces/seg para que la barra avance
    _orderUiAccum += dt;
    if (_orderUiAccum > 250) {
      _orderUiAccum = 0;
      _renderOrders();
    }

    renderNest(); // solo el canvas, no el DOM completo
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// ── VISIBILIDAD DE PESTAÑA ─────────────────────────────────
// Cuando el tab vuelve a ser visible, recalculamos el tiempo
// offline y resincronizamos el acumulador.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    const days = simulateOffline(offlineProgressHandler);
    if (days > 0) render();
    // Resetear acumulador para no sumar doble
    _fractionalDayAccumulator = 0;
    gameState.lastTickTime = Date.now();
  }
});