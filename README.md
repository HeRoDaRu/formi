# Formi

> *Cría tu colonia de Lasius niger. Un formicario virtual con biología real.*

-----

## Qué es

**Formi** es un juego de simulación basado en navegador en el que cuidas una colonia real de *Lasius niger* (hormiga negra común). No hay mecánicas inventadas: cada valor del juego está basado en datos documentados de laboratorio y registros de aficionados con colonias en interior.

El tiempo corre en tiempo real. Un día en el juego es un día en tu vida. Si te olvidas de alimentar a las hormigas, mueren.

-----

## Biología implementada

|Característica                     |Valor real usado                                        |
|-----------------------------------|--------------------------------------------------------|
|Vida de la reina                   |~15 años (5.475 días)                                   |
|Vida de obrera en interior         |~10 meses (300 días)                                    |
|Ciclo huevo → larva → pupa → obrera|~33 días a 23 °C                                        |
|Puesta de huevos                   |20–80 huevos/día según tamaño de colonia                |
|Ratio de forrajeo                  |20–65 % dinámico según escasez de recursos              |
|Eficiencia de feromonas            |Escala logarítmica con el número de obreras             |
|Sin proteína                       |Las obreras practican canibalismo de emergencia en fases|
|Sin agua                           |Mortalidad acelerada x3; larvas mueren al 40%/día       |
|Necrofagia                         |Los cadáveres se reciclan automáticamente como proteína |

**Fuentes:** Hölldobler & Wilson *The Ants* (1990), AntWiki, Grasso et al. *Insectes Sociaux*, Maák et al. (2025), cuidados documentados en AntKeepers y Exotic-Ants.

-----

## Mecánicas principales

### Recursos

- 🍬 **Azúcar** — energía para obreras y reina
- 🪲 **Proteína** — imprescindible para el desarrollo de larvas
- 💧 **Agua** — el más crítico; sin ella el nido colapsa rápido

Las forrajeras recogen recursos automáticamente. Cuanto mayor es la colonia, más eficiente es la red de feromonas.

### Canibalismo de emergencia

Sin proteína, la colonia se devora a sí misma en orden de coste biológico:

1. **Días 1–2:** necrofagia de cadáveres de obreras
1. **Día 3+:** consumo de huevos propios (fracción creciente)
1. **Día 6+:** sacrificio de larvas jóvenes primero

### Cámaras del nido

|Cámara             |Función                                 |
|-------------------|----------------------------------------|
|👑 Cámara real      |Incluida. +20% puesta de huevos         |
|🥚 Cámara de cría   |Capacidad para huevos, larvas y pupas   |
|📦 Almacén          |Multiplica x1.6 la capacidad de recursos|
|🕳️ Túnel de forrajeo|+10% producción por túnel               |

### Tiempo offline

No hay límite de progreso offline. Si no abres el juego durante días, la simulación avanza sin ti. Si la colonia muere por falta de recursos mientras no jugabas, está muerta cuando regresas. Como en la realidad.

-----

## Estructura del proyecto

```
formi/
├── index.html          — estructura HTML y orden de carga de scripts
├── css/
│   └── style.css       — estilos (tema naturalista oscuro, mobile-first)
└── js/
    ├── config.js       — constantes biológicas inmutables (CONFIG)
    ├── gameState.js    — estado mutable, save/load, sistema de migraciones
    ├── colony.js       — lógica biológica: tick diario, mortalidad, metamorfosis
    ├── ui.js           — render DOM + canvas animado (60 fps)
    └── main.js         — orquestador: loops de lógica y render
```

### Principios de arquitectura

- **CONFIG es inmutable** — todos los valores biológicos viven en `config.js` y nunca se modifican en runtime
- **gameState es la única fuente de verdad mutable** — toda modificación de estado pasa por funciones de `gameState.js` o `colony.js`
- **Modelo de lotes** — huevos, larvas y pupas se agrupan por día de puesta (`{ ageDays, count }`), no por individuo. Con 10.000 en desarrollo el array nunca supera ~33 elementos
- **Dirty-checking en render** — el DOM solo se actualiza cuando un valor cambia, para no degradar el rendimiento con colonias grandes
- **Migraciones encadenadas** — los saves se actualizan entre versiones sin perder datos. Añadir una versión nueva = añadir una función en `MIGRATIONS` en `gameState.js`
- **Canvas separado del tick** — las hormigas se animan a 60 fps vía `requestAnimationFrame`; la lógica del juego corre cada 5 segundos

-----

## Cómo ejecutar

El juego no tiene dependencias ni build tools. Solo necesita un servidor HTTP local porque los scripts se cargan en orden secuencial.

```bash
# Python (cualquier sistema)
python3 -m http.server 8080

# Node.js
npx serve .

# VSCode
# Instala la extensión "Live Server" y pulsa "Go Live"
```

Luego abre `http://localhost:8080` en el navegador.

-----

## Testear con tiempo acelerado

Para no esperar días reales durante el desarrollo, cambia temporalmente en `js/config.js`:

```js
MS_PER_DAY: 60_000,  // 1 minuto real = 1 día de juego
```

Recuerda revertirlo antes de publicar. El `SAVE_KEY` incluye la versión, así que los saves de prueba no colisionan con los de producción si cambias la key.

-----

## Hoja de ruta

- [ ] Suite de tests (`tests.html`) sin npm ni build tools
- [ ] Estadísticas históricas y gráfica de población
- [ ] Eventos aleatorios (plaga de ácaros, escape de obreras)
- [ ] Vuelos nupciales en colonias maduras (producción de reinas aladas)
- [ ] Modo observación: cámara lenta con zoom al canvas
- [ ] Exportar/importar save como JSON

-----

## Créditos

Desarrollado por Hector.
Biología basada en fuentes científicas documentadas.
Construido con HTML5, CSS3 y JavaScript vanilla — sin dependencias.

-----

*“Una colonia de hormigas no es una suma de individuos. Es un organismo.”*
— Hölldobler & Wilson