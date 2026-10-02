(() => {
  "use strict";

  // --- Hex geometry (cube coordinates: x + y + z = 0) ---
  // Board radius 2 = 19 cells (the "Big" board size on the sites this is
  // inspired by, which ships with no power-ups — matching the simplified
  // feature set this build targets: just Undo and New Game). See
  // computeLayout() below for how (x,y,z) maps to pixels.
  const RADIUS = 2;
  const WIN_VALUE = 2048;
  const BEST_SCORE_KEY = "game2048hexagon_best_score";
  // Shared by every page on the site so the chosen theme follows the player.
  const THEME_KEY = "2048free_theme";
  const SWIPE_THRESHOLD = 24;

  // The six neighbor directions in cube coordinates. Screen-space unit
  // vectors (for swipe detection) are derived from the same flat-top-hexagon
  // geometry computeLayout() uses: columns run vertically, so there is no
  // pure "left"/"right", only the four diagonals plus straight up/down.
  const DIRECTIONS = {
    up: { x: 0, y: 1, z: -1, screen: [0, -1] },
    down: { x: 0, y: -1, z: 1, screen: [0, 1] },
    upperRight: { x: 1, y: 0, z: -1, screen: [0.866, -0.5] },
    lowerRight: { x: 1, y: -1, z: 0, screen: [0.866, 0.5] },
    upperLeft: { x: -1, y: 1, z: 0, screen: [-0.866, -0.5] },
    lowerLeft: { x: -1, y: 0, z: 1, screen: [-0.866, 0.5] },
  };

  // Q/W/E/A/S/D double as the six direction keys, matching their physical
  // layout on the keyboard (QWE along the top, ASD along the bottom).
  // Arrow keys only have four keys for six directions, so they're wired as
  // a partial alternative — up/down plus the two "upper" diagonals; the two
  // "lower" diagonals stay reachable only via A/D.
  const KEY_MAP = {
    q: "upperLeft", Q: "upperLeft",
    w: "up", W: "up",
    e: "upperRight", E: "upperRight",
    a: "lowerLeft", A: "lowerLeft",
    s: "down", S: "down",
    d: "lowerRight", D: "lowerRight",
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "upperLeft",
    ArrowRight: "upperRight",
  };

  function cellKey(x, y, z) {
    return x + "," + y + "," + z;
  }

  function generateCells(radius) {
    const list = [];
    for (let x = -radius; x <= radius; x++) {
      const yMin = Math.max(-radius, -radius - x);
      const yMax = Math.min(radius, radius - x);
      for (let y = yMin; y <= yMax; y++) {
        list.push({ x, y, z: -x - y });
      }
    }
    return list;
  }

  const ALL_CELLS = generateCells(RADIUS);
  function inBounds(x, y, z) {
    return Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) <= RADIUS;
  }

  // Maps every cell to its pixel box for a given hex circumradius `r` (the
  // distance from a hex's center to one of its corners; hex width = 2r,
  // height = r*sqrt(3)). Columns (constant x) are laid out left to right;
  // the center column is tallest, and each column out from center is
  // offset by half a hex-height and one cell shorter — the classic
  // flat-top hex-board layout.
  function computeLayout(r) {
    const colSpacing = 1.5 * r;
    const rowSpacing = r * Math.sqrt(3);
    const hexW = 2 * r;
    const hexH = rowSpacing;
    const positions = new Map();
    for (const { x, y, z } of ALL_CELLS) {
      const left = (x + RADIUS) * colSpacing;
      const topmax = RADIUS - Math.max(0, x);
      const top = (Math.abs(x) * rowSpacing) / 2 + (topmax - y) * rowSpacing;
      positions.set(cellKey(x, y, z), { left, top, width: hexW, height: hexH });
    }
    return {
      positions,
      boardWidth: (3 * RADIUS + 2) * r,
      boardHeight: (2 * RADIUS + 1) * rowSpacing,
      hexH,
    };
  }

  const boardEl = document.getElementById("board");
  const boardWrapEl = boardEl.parentElement;
  const gridBgEl = document.getElementById("grid-bg");
  const tileLayerEl = document.getElementById("tile-layer");
  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");
  const overlayEl = document.getElementById("overlay");
  const overlayTitleEl = document.getElementById("overlay-title");
  const overlayContinueBtn = document.getElementById("overlay-continue-btn");
  const overlayRetryBtn = document.getElementById("overlay-retry-btn");
  const newGameBtn = document.getElementById("new-game-btn");
  const themeToggleBtn = document.getElementById("theme-toggle-btn");
  const undoBtn = document.getElementById("undo-btn");

  let cells = new Map(); // cellKey -> tileId
  let tiles = new Map(); // tileId -> { x, y, z, value, merged }
  let nextTileId = 1;
  let score = 0;
  let best = Number(localStorage.getItem(BEST_SCORE_KEY)) || 0;
  let hasWon = false;
  let keepPlayingAfterWin = false;
  let isBusy = false;
  let pendingMoveTimeout = null;
  let lastSnapshot = null;
  let layout = null;

  function buildGridBackground() {
    gridBgEl.innerHTML = "";
    for (const { x, y, z } of ALL_CELLS) {
      const cell = document.createElement("div");
      cell.className = "hex-cell";
      cell.dataset.key = cellKey(x, y, z);
      const shape = document.createElement("div");
      shape.className = "hex-shape";
      cell.appendChild(shape);
      gridBgEl.appendChild(cell);
    }
  }

  function createTile(x, y, z, value) {
    const tile = { id: nextTileId++, x, y, z, value, merged: false };
    tiles.set(tile.id, tile);
    cells.set(cellKey(x, y, z), tile.id);
    return tile;
  }

  function getEmptyCells() {
    return ALL_CELLS.filter((c) => !cells.has(cellKey(c.x, c.y, c.z)));
  }

  function spawnRandomTile() {
    const empties = getEmptyCells();
    if (empties.length === 0) return;
    const spot = empties[Math.floor(Math.random() * empties.length)];
    const value = Math.random() < 0.9 ? 2 : 4;
    createTile(spot.x, spot.y, spot.z, value);
  }

  function startNewGame() {
    clearTimeout(pendingMoveTimeout);
    cells = new Map();
    tiles = new Map();
    nextTileId = 1;
    score = 0;
    hasWon = false;
    keepPlayingAfterWin = false;
    isBusy = false;
    lastSnapshot = null;
    undoBtn.disabled = true;
    tileLayerEl.innerHTML = "";
    hideOverlay();
    spawnRandomTile();
    spawnRandomTile();
    updateScoreDisplay();
    render();
  }

  function updateScoreDisplay() {
    scoreEl.textContent = String(score);
    if (score > best) {
      best = score;
      localStorage.setItem(BEST_SCORE_KEY, String(best));
    }
    bestEl.textContent = String(best);
  }

  function measureBoard() {
    // Never scrolling outranks keeping the board a "readable" size, so
    // there is no minimum floor here beyond 0 — in a pathologically tiny
    // embed the board shrinks to whatever's left rather than force an
    // overflow. See the sibling 2048 project's skill notes for why a
    // floor here would reintroduce exactly the scrollbar this app must
    // never show.
    const MAX_R = 60;
    const availW = boardWrapEl.clientWidth;
    const availH = boardWrapEl.clientHeight;
    const rFromWidth = availW / (3 * RADIUS + 2);
    const rFromHeight = availH / ((2 * RADIUS + 1) * Math.sqrt(3));
    const r = Math.max(0, Math.min(rFromWidth, rFromHeight, MAX_R));

    layout = computeLayout(r);
    boardEl.style.width = `${layout.boardWidth}px`;
    boardEl.style.height = `${layout.boardHeight}px`;

    // Same overlay-scaling trick as the square-grid 2048 games: the
    // win/game-over title and buttons must scale with the board's own
    // real size, not viewport width, or they can end up bigger than a
    // height-squeezed board and push "New Game" out of the clickable area.
    const fitSize = Math.min(layout.boardWidth, layout.boardHeight);
    boardEl.style.setProperty("--overlay-title-size", `${Math.max(10, fitSize * 0.09)}px`);
    boardEl.style.setProperty("--overlay-title-gap", `${Math.max(2, fitSize * 0.045)}px`);
    boardEl.style.setProperty("--overlay-box-padding", `${Math.max(2, fitSize * 0.045)}px`);
    boardEl.style.setProperty("--overlay-btn-size", `${Math.max(8, fitSize * 0.042)}px`);
    boardEl.style.setProperty("--overlay-btn-padding", `${Math.max(1, fitSize * 0.028)}px ${Math.max(3, fitSize * 0.05)}px`);
    boardEl.style.setProperty("--overlay-actions-gap", `${Math.max(2, fitSize * 0.028)}px`);

    for (const el of gridBgEl.children) {
      const pos = layout.positions.get(el.dataset.key);
      el.style.left = `${pos.left}px`;
      el.style.top = `${pos.top}px`;
      el.style.width = `${pos.width}px`;
      el.style.height = `${pos.height}px`;
    }
  }

  function positionTileElement(el, x, y, z) {
    const pos = layout.positions.get(cellKey(x, y, z));
    el.style.left = `${pos.left}px`;
    el.style.top = `${pos.top}px`;
    el.style.width = `${pos.width}px`;
    el.style.height = `${pos.height}px`;
  }

  // Sized off the actual measured hex height, not viewport vw units, so it
  // still fits when the board is constrained by height (or the min-size
  // floor) and ends up much smaller than its width would otherwise suggest.
  function fontSizeForDigits(digitCount) {
    const ratio = digitCount <= 2 ? 0.44 : digitCount === 3 ? 0.36 : digitCount === 4 ? 0.3 : 0.24;
    return Math.max(8, layout.hexH * ratio);
  }

  function render(skipAnimation) {
    measureBoard();
    if (skipAnimation) tileLayerEl.classList.add("no-transition");
    const seenIds = new Set();

    tiles.forEach((tile) => {
      seenIds.add(tile.id);
      let el = tileLayerEl.querySelector(`[data-id="${tile.id}"]`);
      const isNewEl = !el;
      if (isNewEl) {
        el = document.createElement("div");
        el.className = "hex-tile";
        el.dataset.id = String(tile.id);
        const shape = document.createElement("div");
        shape.className = "hex-shape";
        el.appendChild(shape);
        tileLayerEl.appendChild(el);
        positionTileElement(el, tile.x, tile.y, tile.z);
      }

      const shape = el.firstChild;
      shape.textContent = String(tile.value);
      el.dataset.value = String(tile.value);
      el.dataset.super = tile.value > WIN_VALUE ? "true" : "false";
      shape.style.fontSize = `${fontSizeForDigits(String(tile.value).length)}px`;

      void el.offsetWidth;
      positionTileElement(el, tile.x, tile.y, tile.z);

      el.classList.remove("new", "merged");
      if (isNewEl) el.classList.add("new");
      if (tile.merged) {
        el.classList.add("merged");
        tile.merged = false;
      }
    });

    tileLayerEl.querySelectorAll(".hex-tile").forEach((el) => {
      const id = Number(el.dataset.id);
      if (!seenIds.has(id)) el.remove();
    });

    if (skipAnimation) {
      requestAnimationFrame(() => requestAnimationFrame(() => tileLayerEl.classList.remove("no-transition")));
    }
  }

  function rankInDirection(tile, vector) {
    return tile.x * vector.x + tile.y * vector.y + tile.z * vector.z;
  }

  function captureSnapshot() {
    return {
      cells: new Map(cells),
      tiles: new Map([...tiles].map(([id, tile]) => [id, { ...tile }])),
      nextTileId,
      score,
      hasWon,
      keepPlayingAfterWin,
    };
  }

  function undo() {
    if (isBusy || !lastSnapshot) return;
    clearTimeout(pendingMoveTimeout);
    isBusy = false;
    cells = lastSnapshot.cells;
    tiles = lastSnapshot.tiles;
    nextTileId = lastSnapshot.nextTileId;
    score = lastSnapshot.score;
    hasWon = lastSnapshot.hasWon;
    keepPlayingAfterWin = lastSnapshot.keepPlayingAfterWin;
    lastSnapshot = null;
    undoBtn.disabled = true;
    hideOverlay();
    scoreEl.textContent = String(score);
    bestEl.textContent = String(best);
    render(true);
  }

  function move(directionName) {
    if (isBusy || !overlayEl.hidden) return;
    const vector = DIRECTIONS[directionName];
    if (!vector) return;
    const snapshotBeforeMove = captureSnapshot();
    const mergedThisMove = new Set();
    let moved = false;

    // Process tiles already furthest along the chosen direction first —
    // the cube-coordinate generalization of the square game's row/col
    // traversal-order reversal — so they settle before anything behind
    // them tries to push into their cell.
    const orderedTileIds = [...tiles.keys()].sort(
      (idA, idB) => rankInDirection(tiles.get(idB), vector) - rankInDirection(tiles.get(idA), vector)
    );

    for (const tileId of orderedTileIds) {
      const tile = tiles.get(tileId);
      if (!tile) continue;
      let curX = tile.x, curY = tile.y, curZ = tile.z;

      while (true) {
        const nx = curX + vector.x, ny = curY + vector.y, nz = curZ + vector.z;
        if (!inBounds(nx, ny, nz)) break;

        const targetKey = cellKey(nx, ny, nz);
        const targetId = cells.get(targetKey);
        if (!targetId) {
          cells.delete(cellKey(curX, curY, curZ));
          curX = nx; curY = ny; curZ = nz;
          cells.set(cellKey(curX, curY, curZ), tileId);
          moved = true;
          continue;
        }

        const targetTile = tiles.get(targetId);
        if (targetTile.value === tile.value && !mergedThisMove.has(targetId) && !mergedThisMove.has(tileId)) {
          cells.delete(cellKey(curX, curY, curZ));
          targetTile.value *= 2;
          targetTile.merged = true;
          mergedThisMove.add(targetId);
          tiles.delete(tileId);
          score += targetTile.value;
          moved = true;
          if (targetTile.value === WIN_VALUE && !hasWon) hasWon = true;
        }
        break;
      }

      if (tiles.has(tileId)) {
        tile.x = curX; tile.y = curY; tile.z = curZ;
      }
    }

    if (!moved) return;

    lastSnapshot = snapshotBeforeMove;
    undoBtn.disabled = false;

    updateScoreDisplay();
    render();

    isBusy = true;
    pendingMoveTimeout = setTimeout(() => {
      spawnRandomTile();
      render();
      isBusy = false;

      if (hasWon && !keepPlayingAfterWin) {
        showOverlay("win");
      } else if (!canMove()) {
        showOverlay("lose");
      }
    }, 110);
  }

  // Only half of the six directions are needed to check every adjacent
  // pair exactly once across a full board scan — the other three are each
  // some other cell's "half", the same trick the square game uses with
  // just [right, down] out of its four directions.
  const HALF_DIRECTIONS = [DIRECTIONS.up, DIRECTIONS.upperRight, DIRECTIONS.lowerRight];

  function canMove() {
    if (cells.size < ALL_CELLS.length) return true;
    for (const { x, y, z } of ALL_CELLS) {
      const tileId = cells.get(cellKey(x, y, z));
      if (!tileId) continue;
      const value = tiles.get(tileId).value;
      for (const d of HALF_DIRECTIONS) {
        const nx = x + d.x, ny = y + d.y, nz = z + d.z;
        if (!inBounds(nx, ny, nz)) continue;
        const neighborId = cells.get(cellKey(nx, ny, nz));
        if (neighborId && tiles.get(neighborId).value === value) return true;
      }
    }
    return false;
  }

  function showOverlay(kind) {
    if (kind === "win") {
      overlayTitleEl.textContent = "You Win! 🎉";
      overlayContinueBtn.hidden = false;
    } else {
      overlayTitleEl.textContent = "Game Over!";
      overlayContinueBtn.hidden = true;
    }
    overlayEl.hidden = false;
  }

  function hideOverlay() {
    overlayEl.hidden = true;
  }

  // --- Theme toggle (defaults to light; never follows system preference) ---
  // The sun/moon SVGs are both always in the DOM; which one shows is a pure
  // CSS rule keyed off [data-theme] (see style.css), so this only needs to
  // set the attribute.
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
  }

  applyTheme(localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light");

  themeToggleBtn.addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  });

  // --- Keyboard input ---
  // The page scrolls (the article sits below the game), so only claim the
  // direction keys while the board is actually on screen — once the player
  // has scrolled down to read, arrows scroll the page like normal.
  function boardInView() {
    const rect = boardEl.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < window.innerHeight;
  }

  window.addEventListener("keydown", (e) => {
    // Leave browser shortcuts alone (Ctrl+D bookmark, Ctrl+S save, Alt+Left back...).
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const direction = KEY_MAP[e.key];
    if (!direction) return;
    if (e.target.closest && e.target.closest("input, textarea, select, [contenteditable]")) return;
    if (!boardInView()) return;
    e.preventDefault();
    move(direction);
  });

  // --- Touch / swipe input (all six directions) ---
  let touchStartX = 0;
  let touchStartY = 0;
  let touchActive = false;

  // Swipes are captured on the board only (it has touch-action: none), so a
  // swipe anywhere else on the page scrolls down to the article as usual.
  boardEl.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length !== 1) return;
      touchActive = true;
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    },
    { passive: true }
  );

  boardEl.addEventListener(
    "touchmove",
    (e) => {
      if (!touchActive) return;
      e.preventDefault();
    },
    { passive: false }
  );

  boardEl.addEventListener(
    "touchend",
    (e) => {
      if (!touchActive) return;
      touchActive = false;
      const touch = e.changedTouches[0];
      const dx = touch.clientX - touchStartX;
      const dy = touch.clientY - touchStartY;
      if (Math.hypot(dx, dy) < SWIPE_THRESHOLD) return;

      // Pick whichever of the six screen-space direction vectors the swipe
      // is most aligned with (largest dot product) — simpler and more
      // robust than bucketing by angle with wraparound.
      let bestName = null;
      let bestDot = -Infinity;
      for (const [name, d] of Object.entries(DIRECTIONS)) {
        const dot = dx * d.screen[0] + dy * d.screen[1];
        if (dot > bestDot) {
          bestDot = dot;
          bestName = name;
        }
      }
      if (bestName) move(bestName);
    },
    { passive: true }
  );

  boardEl.addEventListener("touchcancel", () => {
    touchActive = false;
  });

  // --- Buttons ---
  newGameBtn.addEventListener("click", startNewGame);
  overlayRetryBtn.addEventListener("click", startNewGame);
  undoBtn.addEventListener("click", undo);
  overlayContinueBtn.addEventListener("click", () => {
    keepPlayingAfterWin = true;
    hideOverlay();
  });

  // --- Resize handling ---
  let resizeRaf = null;
  const resizeObserver = new ResizeObserver(() => {
    if (resizeRaf) cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => render(true));
  });
  resizeObserver.observe(boardWrapEl);

  // --- Init ---
  buildGridBackground();
  bestEl.textContent = String(best);
  startNewGame();
})();
