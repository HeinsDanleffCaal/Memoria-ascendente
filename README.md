# Memoria Ascendente

Juego de memoria numérica: aparece un grupo de burbujas con números, se ocultan,
y hay que tocarlas de nuevo en el mismo orden en que estaban — de la más
pequeña a la más grande — antes de equivocarte.

Este proyecto está pensado también como material de estudio: el código está
dividido en tres archivos clásicos (HTML / CSS / JS) y comentado paso a paso
para que puedas leerlo, tocarlo y entender por qué funciona cada parte.

## Estructura del proyecto

```
memoria-ascendente/
├── index.html          Estructura de la página (el "esqueleto")
├── css/
│   └── style.css        Toda la apariencia visual (el "estilo")
├── js/
│   └── script.js         Toda la lógica del juego (el "comportamiento")
└── README.md            Este archivo
```

Esta separación en tres archivos —HTML, CSS y JS cada uno en el suyo— es el
patrón más común en proyectos web reales: cada lenguaje tiene una
responsabilidad distinta y así es más fácil encontrar y cambiar cosas sin
que un archivo gigante se vuelva imposible de leer.

## Cómo ejecutarlo

No necesita ningún servidor, framework ni instalación: es HTML, CSS y
JavaScript "vanilla" (sin librerías).

**Opción rápida:** haz doble clic en `index.html` y se abre en tu navegador
por defecto.

**Desde VS Code:**

1. Abre la carpeta `memoria-ascendente` con `Archivo → Abrir carpeta...`.
2. En el panel de archivos, clic derecho sobre `index.html` → **"Revelar en
   el explorador de archivos"** y ábrelo con doble clic, o desde la terminal
   integrada (`` Ctrl+` ``): `start index.html` (Windows), `open index.html`
   (Mac) o `xdg-open index.html` (Linux).
3. Si prefieres que se recargue solo cada vez que guardas un cambio: instala
   la extensión **Live Server** (de Ritwick Dey), clic derecho sobre
   `index.html` → **"Open with Live Server"**.

## Cómo funciona el juego (la "máquina de estados")

Una partida avanza por una secuencia fija de fases, y `js/script.js` tiene
una función por cada una:

```
startGame()              el botón "Comenzar": valida el nombre y arranca
   └─ beginLevel()        genera los números del nivel y las burbujas
        └─ startMemorizePhase()   se ven los números un rato (con cronómetro)
             └─ startRecallPhase()   se ocultan; hay que tocarlas en orden
                  └─ handleTileClick()   se ejecuta con cada burbuja tocada
                        ├─ si acierta todas   → beginLevel() (nivel + 1)
                        └─ si falla una       → endGame()
```

El estado completo de la partida (nombre, nivel, puntos, qué número toca
ahora...) vive en un solo objeto, `state`, al principio de `script.js`. Es
buena costumbre abrir la consola del navegador (F12) mientras juegas y
escribir `state` para ver cómo cambia en cada fase.

## Conceptos para estudiar en este código

**HTML**
- Tres `<section class="screen">` en el mismo documento; solo una se ve a la
  vez gracias al atributo `hidden`, que JavaScript activa o desactiva.
- El tablero (`#grid`) empieza vacío en el HTML: las burbujas las crea
  `renderGrid()` en JavaScript con `document.createElement`.

**CSS**
- **Variables CSS** (`:root { --accent: ...; }`): todos los colores se
  declaran una vez y se reutilizan con `var(--accent)`. Cambiar el color del
  juego es editar una sola línea.
- **La burbuja "volteable" en 3D**: cada burbuja tiene una cara con el
  número y una cara "vacía", superpuestas, usando `backface-visibility` y
  `rotateY()`. Es la misma técnica que se usa para las cartas que se dan
  vuelta en cualquier juego de memoria en la web. Está explicada con detalle
  en los comentarios de `css/style.css`, sección 7.
- **`clamp(mínimo, preferido, máximo)`**: usado para que los textos y el
  tamaño de letra de las burbujas se adapten al ancho de pantalla sin
  quedar ni gigantes ni ilegibles.
- **`aspect-ratio`**: mantiene la proporción del panel de burbujas sin
  necesidad de fijar una altura en píxeles.
- **`prefers-reduced-motion`**: una media query que respeta si la persona
  desactivó las animaciones en su sistema operativo.

**JavaScript**
- **Un objeto de estado (`state`)** en vez de variables sueltas: el patrón
  más simple para que una app interactiva sepa "en qué momento está".
- **Funciones puras vs. funciones que tocan el DOM**: `clamp`,
  `tilesForLevel`, `uniqueRandomNumbers` o `scatterLayout` solo calculan y
  devuelven datos; `renderGrid`, `updateHeader` o `showScreen` son las que
  modifican la página. Separar ambos tipos hace el código más fácil de
  razonar y de probar.
- **`Set` para generar números únicos**: un Set nunca admite duplicados, así
  que es la forma más simple de generar N números al azar sin repetir.
- **El algoritmo de Fisher-Yates** (función `shuffle`): la manera estándar
  de barajar un array de forma uniformemente aleatoria.
- **`scatterLayout()`**: el algoritmo que reparte las burbujas por el panel
  sin que se superpongan, dividiendo el espacio en una cuadrícula invisible
  y barajando las celdas. Está comentado en detalle en `js/script.js`.
- **`localStorage` con `try/catch`**: para recordar la mejor marca de cada
  jugador entre partidas, protegido por si el navegador lo bloquea (por
  ejemplo, en una ventana privada).
- **`addEventListener`**: cómo se conectan los clics y las teclas del
  usuario con las funciones que reaccionan a ellos.

## Ideas para practicar modificando el código

Una buena forma de aprender es cambiar cosas pequeñas y ver qué pasa:

- Cambia los valores de `--accent` y `--bg` en `css/style.css` para darle
  otra paleta de colores al juego.
- En `js/script.js`, cambia `tilesForLevel()` para que el juego empiece con
  6 números en vez de 4.
- Añade un sistema de "vidas" (por ejemplo, 3 errores permitidos antes de
  `endGame()`, en vez de uno).
- Cambia el rango de números en `uniqueRandomNumbers()` (por ejemplo, de 1
  a 999) y ajusta el tamaño de letra si hace falta.
- Agrega un selector de dificultad en la pantalla de inicio que cambie el
  punto de partida de `state.level`.
