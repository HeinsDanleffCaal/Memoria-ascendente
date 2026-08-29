/* ================================================================
   MEMORIA ASCENDENTE — lógica del juego
   ----------------------------------------------------------------
   Cómo está organizado este archivo (léelo en este orden):

     1. Referencias al DOM (el objeto `el`)
     2. Estado del juego (el objeto `state`)
     3. Funciones "de cálculo puro" (no tocan el DOM):
        clamp, tilesForLevel, memorizeSecondsForLevel,
        uniqueRandomNumbers, shuffle, scatterLayout
     4. Funciones de almacenamiento (localStorage)
     5. Funciones "de pantalla" (SÍ tocan el DOM):
        updateHeader, showScreen, renderGrid
     6. La máquina de estados del juego:
        startGame -> beginLevel -> startMemorizePhase
                  -> startRecallPhase -> handleTileClick -> endGame
     7. Conexión de los eventos (los addEventListener del final)

   Todo vive dentro de una función que se ejecuta a sí misma
   `(function(){ ... })()`. Esto se llama IIFE (Immediately
   Invoked Function Expression) y su único propósito aquí es
   evitar que `state`, `el` y las demás variables/funciones se
   vuelvan globales y puedan chocar con otro script de la página.
   ================================================================ */
(function(){
  "use strict"; // nos obliga a declarar variables con var/let/const,
                // evita errores silenciosos típicos de JS

  // ¿El usuario pidió "reducir movimiento" en su sistema operativo?
  // Lo comprobamos una sola vez al cargar el script.
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;


  /* ----------------------------------------------------------------
     1. REFERENCIAS AL DOM
     ------------------------------------------------------------
     Buscamos UNA sola vez cada elemento por su id y lo guardamos en
     el objeto `el`. Así, en el resto del archivo escribimos
     el.startBtn en vez de repetir document.getElementById(...)
     cada vez que lo necesitamos.
     ---------------------------------------------------------------- */
  var el = {
    nameInput: document.getElementById('nameInput'),
    nameError: document.getElementById('nameError'),
    startBtn: document.getElementById('startBtn'),
    retryBtn: document.getElementById('retryBtn'),
    hdrName: document.getElementById('hdrName'),
    hdrLevel: document.getElementById('hdrLevel'),
    hdrScore: document.getElementById('hdrScore'),
    screenIntro: document.getElementById('screen-intro'),
    screenGame: document.getElementById('screen-game'),
    screenOver: document.getElementById('screen-over'),
    grid: document.getElementById('grid'),
    phaseLabel: document.getElementById('phaseLabel'),
    phaseCount: document.getElementById('phaseCount'),
    toast: document.getElementById('toast'),
    timerbar: document.getElementById('timerbar'),
    timerFill: document.getElementById('timerFill'),
    overEyebrow: document.getElementById('overEyebrow'),
    overTitle: document.getElementById('overTitle'),
    overLevel: document.getElementById('overLevel'),
    overScore: document.getElementById('overScore'),
    bestLine: document.getElementById('bestLine')
  };


  /* ----------------------------------------------------------------
     2. ESTADO DEL JUEGO
     ------------------------------------------------------------
     Un único objeto con TODO lo que el juego necesita recordar en
     cada momento. Es el patrón "state" típico de cualquier juego o
     aplicación interactiva: en vez de variables sueltas regadas por
     el código, todo el estado vive en un solo lugar fácil de
     inspeccionar (prueba escribir `state` en la consola del
     navegador mientras juegas).
     ---------------------------------------------------------------- */
  var state = {
    name: '',           // nombre del jugador
    level: 1,           // nivel actual
    score: 0,           // puntos acumulados
    numbers: [],         // los números del nivel actual, en el orden en que se muestran
    sorted: [],          // los mismos números, ordenados de menor a mayor
    nextIndex: 0,        // qué posición del array `sorted` toca acertar ahora
    phase: 'intro',       // 'intro' | 'memorize' | 'recall' | 'levelup' | 'over'
    tiles: [],           // los <button> (burbujas) del nivel actual
    memorizeInterval: null // referencia al setTimeout de la fase de memorización
  };


  /* ----------------------------------------------------------------
     3. FUNCIONES DE CÁLCULO PURO
     ------------------------------------------------------------
     "Puras" significa: reciben unos datos, devuelven un resultado,
     y no modifican nada fuera de sí mismas (no tocan el DOM ni el
     `state`). Son las más fáciles de entender y de probar de forma
     aislada.
     ---------------------------------------------------------------- */

  // Obliga a que n quede dentro del rango [min, max]
  function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }

  // ¿Cuántos números tiene el nivel N? Empieza en 4 y sube de 1 en 1,
  // hasta un máximo de 12 (para que el panel no se sature).
  function tilesForLevel(level){ return clamp(4 + (level - 1), 4, 12); }

  // ¿Cuántos segundos dura la fase de memorización en el nivel N?
  // Empieza en 4.5s y se acorta 0.15s por nivel, sin bajar de 1.5s.
  function memorizeSecondsForLevel(level){ return clamp(4.5 - (level - 1) * 0.15, 1.5, 4.5); }

  // Genera `count` números aleatorios del 1 al 99, SIN repetir.
  // Un Set no admite valores duplicados, así que es la forma más
  // simple de garantizar unicidad: seguimos añadiendo números al
  // azar hasta que el Set tenga el tamaño que pedimos.
  function uniqueRandomNumbers(count){
    var set = new Set();
    while(set.size < count){
      set.add(1 + Math.floor(Math.random() * 99));
    }
    return Array.from(set); // convierte el Set en un array normal
  }

  // Debe coincidir con el aspect-ratio de .grid en css/style.css
  // (ancho / alto del "estanque" donde flotan las burbujas).
  var POND_RATIO = 1.7;

  // Baraja un array "en el sitio" (algoritmo de Fisher-Yates).
  // Recorre el array de atrás hacia adelante e intercambia cada
  // elemento con uno elegido al azar entre los que quedan por delante.
  function shuffle(arr){
    for(var i = arr.length - 1; i > 0; i--){
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }

  // ----------------------------------------------------------------
  // scatterLayout(count): calcula dónde va cada burbuja para que se
  // vean esparcidas al azar por el panel SIN superponerse nunca.
  //
  // La idea (técnica llamada "jittered grid" / cuadrícula con
  // desplazamiento aleatorio):
  //   1. Se divide un lienzo de referencia (600 x algo, con la misma
  //      proporción que el contenedor real) en una cuadrícula de
  //      celdas invisibles — suficientes celdas para tener una por
  //      burbuja.
  //   2. Se BARAJA el orden de esas celdas.
  //   3. Cada burbuja recibe una celda distinta, y dentro de esa
  //      celda se le da una posición aleatoria ("jitter"), dejando
  //      un margen para que no toque los bordes de la celda vecina.
  //
  // Como cada burbuja vive en su propia celda, dos burbujas JAMÁS
  // pueden superponerse — a diferencia de "tirar puntos al azar y
  // esperar que no choquen", que puede fallar con pocas burbujas y
  // mucho espacio ocupado.
  //
  // El resultado se expresa en PORCENTAJES (no en píxeles), así que
  // funciona igual sin importar el tamaño real de la pantalla: solo
  // hace falta que el contenedor real tenga el mismo aspect-ratio
  // que usamos aquí (POND_RATIO).
  // ----------------------------------------------------------------
  function scatterLayout(count){
    var REF_W = 600;               // ancho de referencia (unidades arbitrarias)
    var REF_H = REF_W / POND_RATIO; // alto de referencia, según la proporción del panel

    // Elegimos columnas y filas para tener al menos `count` celdas,
    // intentando que la cuadrícula tenga más o menos la misma
    // proporción que el panel (para que las celdas no salgan
    // extremadamente alargadas).
    var cols = Math.max(1, Math.ceil(Math.sqrt(count * POND_RATIO)));
    var rows = Math.max(1, Math.ceil(count / cols));
    while(cols * rows < count) rows++;

    var cellW = REF_W / cols;
    var cellH = REF_H / rows;

    // El diámetro de la burbuja es un 76% de la celda más pequeña
    // (para dejar aire entre burbujas vecinas), con un mínimo y un
    // máximo razonables.
    var diamPx = clamp(Math.min(cellW, cellH) * 0.76, REF_W * 0.10, REF_W * 0.23);
    var sizePct = (diamPx / REF_W) * 100;   // diámetro como % del ancho del panel
    var heightPct = sizePct * POND_RATIO;    // diámetro como % del alto del panel
                                              // (distinto % porque ancho ≠ alto,
                                              // pero en píxeles reales da el mismo
                                              // tamaño: así la burbuja sale circular)
    var margin = diamPx / 2 + 3; // separación mínima entre el centro y el borde de su celda

    // Construimos la lista de celdas (una por cada combinación fila-columna)...
    var cells = [];
    for(var r = 0; r < rows; r++){
      for(var c = 0; c < cols; c++){
        cells.push({ x0: c * cellW, y0: r * cellH, x1: (c + 1) * cellW, y1: (r + 1) * cellH });
      }
    }
    shuffle(cells); // ...y las barajamos, para no asignarlas en orden

    var positions = [];
    for(var i = 0; i < count; i++){
      var cell = cells[i];

      // Posición aleatoria dentro de la celda (con margen a los bordes).
      // Si la celda es demasiado pequeña para el margen, centramos.
      var cx = (cell.x1 - cell.x0) > margin * 2
        ? cell.x0 + margin + Math.random() * (cell.x1 - cell.x0 - margin * 2)
        : (cell.x0 + cell.x1) / 2;
      var cy = (cell.y1 - cell.y0) > margin * 2
        ? cell.y0 + margin + Math.random() * (cell.y1 - cell.y0 - margin * 2)
        : (cell.y0 + cell.y1) / 2;

      positions.push({
        widthPct: sizePct,
        heightPct: heightPct,
        // Convertimos el CENTRO (cx, cy) en la esquina superior-izquierda
        // que espera CSS "left/top", y lo pasamos a porcentaje.
        leftPct: ((cx - diamPx / 2) / REF_W) * 100,
        topPct: ((cy - diamPx / 2) / REF_H) * 100
      });
    }

    return positions;
  }


  /* ----------------------------------------------------------------
     4. ALMACENAMIENTO (localStorage)
     ------------------------------------------------------------
     Guardamos la mejor marca de cada jugador en el navegador, para
     que siga ahí la próxima vez que abra el juego. Como localStorage
     puede fallar (modo incógnito, navegador que lo bloquea, etc.),
     envolvemos cada llamada en try/catch: si falla, el juego sigue
     funcionando, simplemente sin recordar la mejor marca.
     ---------------------------------------------------------------- */
  function safeStorageGet(key){
    try{
      var raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    }catch(e){ return null; }
  }

  function safeStorageSet(key, value){
    try{ window.localStorage.setItem(key, JSON.stringify(value)); }catch(e){ /* ignorar */ }
  }

  // Clave única por jugador (en minúsculas, para que "Heins" y "heins"
  // compartan la misma mejor marca).
  function bestKey(name){ return 'memoria-ascendente:' + name.toLowerCase(); }


  /* ----------------------------------------------------------------
     5. FUNCIONES "DE PANTALLA" (leen `state` y actualizan el DOM)
     ---------------------------------------------------------------- */

  // Refresca el encabezado (nombre, nivel, puntos) con lo que haya
  // en `state` en este momento.
  function updateHeader(){
    el.hdrName.textContent = state.name || '—';
    el.hdrLevel.textContent = String(state.level).padStart(2, '0');
    el.hdrScore.textContent = String(state.score).padStart(4, '0');
  }

  // Muestra una de las tres pantallas y oculta las otras dos.
  // 'intro' | 'game' | 'over'
  function showScreen(name){
    el.screenIntro.hidden = name !== 'intro';
    el.screenGame.hidden = name !== 'game';
    el.screenOver.hidden = name !== 'over';
  }

  // Crea las burbujas del nivel actual dentro de #grid.
  function renderGrid(count){
    el.grid.innerHTML = ''; // vacía el panel del nivel anterior
    state.tiles = [];
    var layout = scatterLayout(count); // una posición por burbuja

    for(var i = 0; i < count; i++){
      var value = state.numbers[i];
      var pos = layout[i];

      var btn = document.createElement('button');
      btn.className = 'tile';
      btn.type = 'button';
      btn.dataset.value = String(value); // guardamos el número en el propio elemento

      // Posición y tamaño (en %), calculados por scatterLayout()
      btn.style.left = pos.leftPct + '%';
      btn.style.top = pos.topPct + '%';
      btn.style.width = pos.widthPct + '%';
      btn.style.height = pos.heightPct + '%';

      // Variables CSS personalizadas por burbuja (--float-delay,
      // --drop-delay): así cada una "flota" y "aparece" en un
      // instante ligeramente distinto, en vez de moverse todas
      // sincronizadas. Se usan en css/style.css con var(--...).
      btn.style.setProperty('--float-delay', (Math.random() * -3.6).toFixed(2) + 's');
      btn.style.setProperty('--drop-delay', (i * 0.04).toFixed(2) + 's');

      btn.setAttribute('aria-label', 'Burbuja');

      // Estructura interna de la burbuja "volteable" (ver la sección 7
      // del CSS para entender cómo se oculta/revela cada cara).
      btn.innerHTML =
        '<span class="tile-inner">' +
          '<span class="tile-face tile-front">' + value + '</span>' +
          '<span class="tile-face tile-back"></span>' +
        '</span>';

      btn.addEventListener('click', function(){ handleTileClick(this); });

      el.grid.appendChild(btn);
      state.tiles.push(btn);
    }
  }


  /* ----------------------------------------------------------------
     6. LA MÁQUINA DE ESTADOS DEL JUEGO
     ------------------------------------------------------------
     Una partida avanza por una secuencia fija de fases. Cada función
     de abajo representa una fase y, al terminar su trabajo, dispara
     la siguiente:

       startGame        (botón "Comenzar")
         -> beginLevel
              -> renderGrid
              -> startMemorizePhase   (se ven los números)
                   -> [pasan N segundos]
                   -> startRecallPhase (se ocultan; hay que tocarlos)
                        -> handleTileClick (por cada burbuja tocada)
                             - si acierta todas -> beginLevel (nivel + 1)
                             - si falla una     -> endGame
     ---------------------------------------------------------------- */

  // Se ejecuta al pulsar "Comenzar". Valida el nombre y arranca la partida.
  function startGame(){
    var raw = el.nameInput.value.trim();
    if(!raw){
      el.nameError.textContent = 'Escribe tu nombre para embarcar en el juego.';
      el.nameInput.focus();
      return; // corta aquí: no arrancamos el juego sin nombre
    }
    el.nameError.textContent = '';

    state.name = raw.slice(0, 20); // por si acaso, cortamos a 20 caracteres
    state.level = 1;
    state.score = 0;
    updateHeader();

    showScreen('game');
    el.timerbar.hidden = false;
    beginLevel();
  }

  // Prepara un nivel nuevo: números aleatorios + su versión ordenada,
  // burbujas en pantalla, y arranca la fase de memorización.
  function beginLevel(){
    var count = tilesForLevel(state.level);
    state.numbers = uniqueRandomNumbers(count);
    state.sorted = state.numbers.slice().sort(function(a, b){ return a - b; });
    state.nextIndex = 0; // el próximo número a acertar es el más pequeño (sorted[0])

    el.toast.textContent = '';
    el.phaseCount.textContent = count + ' número' + (count === 1 ? '' : 's');

    renderGrid(count);
    startMemorizePhase();
  }

  // Fase 1: se muestran los números un rato, con la barra de tiempo
  // corriendo. Al terminar el tiempo, pasa sola a startRecallPhase().
  function startMemorizePhase(){
    state.phase = 'memorize';
    el.phaseLabel.textContent = 'Memoriza el orden';

    state.tiles.forEach(function(t){
      t.classList.remove('is-hidden'); // se ven los números (cara frontal)
      t.disabled = true;               // no se puede tocar todavía
    });

    var seconds = memorizeSecondsForLevel(state.level);

    // Truco para reiniciar una animación CSS desde JS:
    // 1) quitamos la transición y ponemos la barra al 100%
    // 2) forzamos al navegador a "recalcular" leyendo offsetWidth
    //    (si no, el navegador junta los cambios y no se ve el reinicio)
    // 3) volvemos a poner la transición y encogemos la barra a 0
    el.timerFill.style.transition = 'none';
    el.timerFill.style.transform = 'scaleX(1)';
    void el.timerFill.offsetWidth; // "leer" esta propiedad fuerza el reflow
    el.timerFill.style.transition = reduceMotion ? 'none' : 'transform ' + seconds + 's linear';
    el.timerFill.style.transform = 'scaleX(0)';

    if(state.memorizeInterval) clearTimeout(state.memorizeInterval);
    state.memorizeInterval = setTimeout(startRecallPhase, seconds * 1000);
  }

  // Fase 2: se ocultan todas las burbujas (giran a su cara trasera)
  // y se habilitan los clics.
  function startRecallPhase(){
    state.phase = 'recall';
    el.phaseLabel.textContent = 'Toca de menor a mayor';

    state.tiles.forEach(function(t){
      t.classList.add('is-hidden');
      t.disabled = false;
    });
  }

  // Se ejecuta cada vez que el jugador toca una burbuja durante la
  // fase 'recall'. Decide si el toque es correcto o no.
  function handleTileClick(tile){
    // Ignoramos clics fuera de la fase correcta, o en burbujas ya usadas.
    if(state.phase !== 'recall' || tile.disabled) return;

    var value = Number(tile.dataset.value);
    var expected = state.sorted[state.nextIndex]; // el número más pequeño pendiente

    tile.disabled = true; // esta burbuja ya no se puede volver a tocar

    if(value === expected){
      // ACIERTO: se revela el número (gira a la cara frontal, en verde)
      tile.classList.remove('is-hidden');
      tile.classList.add('is-correct');
      tile.setAttribute('aria-label', 'Burbuja correcta: ' + value);

      state.nextIndex++;
      state.score += 10 * state.level; // los niveles altos valen más puntos
      updateHeader();

      // ¿Ya se acertaron TODAS las burbujas del nivel?
      if(state.nextIndex === state.tiles.length){
        state.phase = 'levelup';
        el.toast.textContent = 'Nivel superado. Preparando el siguiente panel…';
        state.tiles.forEach(function(t){ t.disabled = true; });

        // Pequeña pausa antes de generar el siguiente nivel, para que
        // el jugador vea el mensaje de "nivel superado".
        setTimeout(function(){
          state.level++;
          updateHeader();
          beginLevel();
        }, 900);
      }
    }else{
      // ERROR: se revela el número en rojo y termina la partida.
      tile.classList.remove('is-hidden');
      tile.classList.add('is-wrong');
      tile.setAttribute('aria-label', 'Burbuja incorrecta: ' + value);
      endGame();
    }
  }

  // Fin de la partida: revela todas las burbujas restantes (para que
  // el jugador vea la secuencia completa), calcula la mejor marca y
  // muestra la pantalla de resumen.
  function endGame(){
    state.phase = 'over';
    el.timerbar.hidden = true;

    state.tiles.forEach(function(t){
      t.disabled = true;
      t.classList.remove('is-hidden'); // se revelan todos los números
      if(!t.classList.contains('is-correct') && !t.classList.contains('is-wrong')){
        t.classList.add('is-missed'); // las que nunca se llegaron a tocar
      }
    });

    var key = bestKey(state.name);
    var prevBest = safeStorageGet(key);
    var isNewBest = !prevBest || state.score > prevBest.score;
    var best = isNewBest ? { level: state.level, score: state.score } : prevBest;
    if(isNewBest) safeStorageSet(key, best);

    el.overEyebrow.textContent = isNewBest && prevBest ? 'Nueva mejor marca' : 'Fin de la partida';
    el.overTitle.textContent = state.level <= 2
      ? 'Calentando motores.'
      : (state.level <= 5 ? 'Buena memoria.' : 'Memoria de otro nivel.');
    el.overLevel.textContent = String(state.level);
    el.overScore.textContent = String(state.score);
    el.bestLine.innerHTML = 'Mejor marca de <b>' + escapeHtml(state.name) + '</b>: nivel <b>' +
      best.level + '</b> &middot; <b>' + best.score + '</b> puntos.';

    // Esperamos un poco antes de cambiar de pantalla, para que el
    // jugador alcance a ver la burbuja en rojo antes del resumen.
    setTimeout(function(){ showScreen('over'); }, 700);
  }

  // Convierte texto a HTML seguro (evita que un nombre como
  // "<b>hola</b>" se interprete como etiqueta real al insertarlo
  // con innerHTML en el resumen final).
  function escapeHtml(str){
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  // Vuelve a la pantalla de inicio para jugar otra partida.
  function resetToIntro(){
    if(state.memorizeInterval) clearTimeout(state.memorizeInterval);
    state.phase = 'intro';
    state.level = 1;
    state.score = 0;
    el.grid.innerHTML = '';
    el.toast.textContent = '';
    updateHeader();
    showScreen('intro');
  }


  /* ----------------------------------------------------------------
     7. CONEXIÓN DE EVENTOS
     ------------------------------------------------------------
     Aquí es donde el HTML "se conecta" con las funciones de arriba.
     Todo lo anterior son solo definiciones; nada se ejecuta hasta
     que ocurre uno de estos eventos.
     ---------------------------------------------------------------- */
  el.startBtn.addEventListener('click', startGame);
  el.nameInput.addEventListener('keydown', function(e){
    if(e.key === 'Enter') startGame(); // permite arrancar con Enter, no solo con el botón
  });
  el.retryBtn.addEventListener('click', resetToIntro);

  // Pinta el encabezado una vez al cargar la página (nombre "—", nivel 00...)
  updateHeader();

})();
