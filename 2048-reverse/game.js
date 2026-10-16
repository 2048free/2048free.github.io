(() => {
  "use strict";

  const GameTrack = window.GameTrack || { init() {}, begin() {}, progress() {}, end() {}, restart() {}, undo() {}, event() {}, flag() {} };

  const SIZE = 4;
  const WIN_VALUE = 2; // merging down to a 2 tile wins, instead of up to 2048
  // New tiles spawn as big, not small — the entire board keeps flooding
  // with the same two giants you're trying to shrink away.
  const SPAWN_VALUES = [2048, 1024];
  const SPAWN_WEIGHTS = [0.9, 0.1];
  // Halving 2 would give a fractional 1-tile's half (0.5), which breaks the
  // powers-of-two board — 1 is this game's floor, a tile too small to split
  // further, the mirror image of how 2048 has no ceiling in the original.
  const MIN_VALUE = 1;
  const BEST_SCORE_KEY = "game2048_reverse_best_score";
  // Shared by every page on the site so the chosen theme follows the player.
  const THEME_KEY = "2048free_theme";
  const SWIPE_THRESHOLD = 24;

  const DIRECTIONS = {
    up: { dr: -1, dc: 0 },
    down: { dr: 1, dc: 0 },
    left: { dr: 0, dc: -1 },
    right: { dr: 0, dc: 1 },
  };

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

  let cells = [];
  let tiles = new Map();
  let nextTileId = 1;
  let score = 0;
  let best = Number(localStorage.getItem(BEST_SCORE_KEY)) || 0;
  let hasWon = false;
  let keepPlayingAfterWin = false;
  let isBusy = false;
  let pendingMoveTimeout = null;
  let cellSize = 0;
  let gapSize = 0;
  let lastSnapshot = null;

  function buildGridBackground() {
    gridBgEl.innerHTML = "";
    for (let i = 0; i < SIZE * SIZE; i++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      gridBgEl.appendChild(cell);
    }
  }

  function emptyGrid() {
    return Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
  }

  function createTile(row, col, value) {
    const tile = { id: nextTileId++, row, col, value, merged: false };
    tiles.set(tile.id, tile);
    cells[row][col] = tile.id;
    return tile;
  }

  function getEmptyCells() {
    const empties = [];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (!cells[r][c]) empties.push({ r, c });
      }
    }
    return empties;
  }

  function randomSpawnValue() {
    const roll = Math.random();
    let cumulative = 0;
    for (let i = 0; i < SPAWN_VALUES.length; i++) {
      cumulative += SPAWN_WEIGHTS[i];
      if (roll < cumulative) return SPAWN_VALUES[i];
    }
    return SPAWN_VALUES[SPAWN_VALUES.length - 1];
  }

  function spawnRandomTile() {
    const empties = getEmptyCells();
    if (empties.length === 0) return;
    const spot = empties[Math.floor(Math.random() * empties.length)];
    createTile(spot.r, spot.c, randomSpawnValue());
  }

  function startNewGame() {
    GameTrack.restart();
    clearTimeout(pendingMoveTimeout);
    cells = emptyGrid();
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
    const fitSize = Math.max(0, Math.min(boardWrapEl.clientWidth, boardWrapEl.clientHeight, 500));
    boardEl.style.width = `${fitSize}px`;
    boardEl.style.height = `${fitSize}px`;

    const gap = Math.max(0.5, fitSize * 0.028);
    boardEl.style.setProperty("--gap", `${gap}px`);

    boardEl.style.setProperty("--overlay-title-size", `${Math.max(10, fitSize * 0.064)}px`);
    boardEl.style.setProperty("--overlay-title-gap", `${Math.max(2, fitSize * 0.032)}px`);
    boardEl.style.setProperty("--overlay-box-padding", `${Math.max(2, fitSize * 0.032)}px`);
    boardEl.style.setProperty("--overlay-btn-size", `${Math.max(8, fitSize * 0.03)}px`);
    boardEl.style.setProperty("--overlay-btn-padding", `${Math.max(1, fitSize * 0.02)}px ${Math.max(3, fitSize * 0.036)}px`);
    boardEl.style.setProperty("--overlay-actions-gap", `${Math.max(2, fitSize * 0.02)}px`);

    const cell0 = gridBgEl.children[0].getBoundingClientRect();
    const cell1 = gridBgEl.children[1].getBoundingClientRect();
    cellSize = cell0.width;
    gapSize = cell1.left - cell0.right;
  }

  function positionTileElement(el, row, col) {
    el.style.left = `${col * (cellSize + gapSize)}px`;
    el.style.top = `${row * (cellSize + gapSize)}px`;
    el.style.width = `${cellSize}px`;
    el.style.height = `${cellSize}px`;
  }

  function fontSizeForDigits(digitCount) {
    const ratio = digitCount <= 2 ? 0.5 : digitCount === 3 ? 0.42 : digitCount === 4 ? 0.34 : 0.27;
    return Math.max(8, cellSize * ratio);
  }

  // The classic gradient runs from plain beige at 2 up to vivid gold at
  // 2048. Here the roles are swapped — 2048 is the common, ever-spawning
  // tile and 2 is the hard-won rare one — so this maps a real tile value to
  // whichever classic tier should color it, mirrored around the 2..2048
  // range (2048*2 / value), rather than inventing a new palette.
  function colorTierFor(value) {
    return (2048 * 2) / value;
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
        el.className = "tile";
        el.dataset.id = String(tile.id);
        tileLayerEl.appendChild(el);
        positionTileElement(el, tile.row, tile.col);
      }

      el.textContent = String(tile.value);
      el.dataset.colorTier = String(colorTierFor(tile.value));
      el.dataset.super = tile.value <= MIN_VALUE ? "true" : "false";
      el.style.fontSize = `${fontSizeForDigits(String(tile.value).length)}px`;

      void el.offsetWidth;
      positionTileElement(el, tile.row, tile.col);

      el.classList.remove("new", "merged");
      if (isNewEl) {
        el.classList.add("new");
      }
      if (tile.merged) {
        el.classList.add("merged");
        tile.merged = false;
      }
    });

    tileLayerEl.querySelectorAll(".tile").forEach((el) => {
      const id = Number(el.dataset.id);
      if (!seenIds.has(id)) el.remove();
    });

    if (skipAnimation) {
      requestAnimationFrame(() => requestAnimationFrame(() => tileLayerEl.classList.remove("no-transition")));
    }
  }

  function buildTraversalOrder(vector) {
    const rows = [0, 1, 2, 3];
    const cols = [0, 1, 2, 3];
    if (vector.dr === 1) rows.reverse();
    if (vector.dc === 1) cols.reverse();
    return { rows, cols };
  }

  function inBounds(r, c) {
    return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
  }

  function captureSnapshot() {
    return {
      cells: cells.map((row) => row.slice()),
      tiles: new Map([...tiles].map(([id, tile]) => [id, { ...tile }])),
      nextTileId,
      score,
      hasWon,
      keepPlayingAfterWin,
    };
  }

  function undo() {
    if (isBusy || !lastSnapshot) return;
    GameTrack.undo();
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

  function move(direction) {
    if (isBusy || !overlayEl.hidden) return;
    const snapshotBeforeMove = captureSnapshot();
    const vector = DIRECTIONS[direction];
    const { rows, cols } = buildTraversalOrder(vector);
    const mergedThisMove = new Set();
    let moved = false;

    for (const r of rows) {
      for (const c of cols) {
        const tileId = cells[r][c];
        if (!tileId) continue;
        const tile = tiles.get(tileId);

        let curR = r;
        let curC = c;

        while (true) {
          const nr = curR + vector.dr;
          const nc = curC + vector.dc;
          if (!inBounds(nr, nc)) break;

          const targetId = cells[nr][nc];
          if (!targetId) {
            cells[curR][curC] = null;
            curR = nr;
            curC = nc;
            cells[curR][curC] = tileId;
            moved = true;
            continue;
          }

          const targetTile = tiles.get(targetId);
          // A tile at the floor value never merges again, even into
          // another floor tile — see the MIN_VALUE comment above.
          if (
            targetTile.value === tile.value &&
            targetTile.value > MIN_VALUE &&
            !mergedThisMove.has(targetId) &&
            !mergedThisMove.has(tileId)
          ) {
            cells[curR][curC] = null;
            targetTile.value /= 2;
            targetTile.merged = true;
            mergedThisMove.add(targetId);
            tiles.delete(tileId);
            score += targetTile.value;
            moved = true;
            if (targetTile.value === WIN_VALUE && !hasWon) {
              hasWon = true;
            }
          }
          break;
        }

        if (tiles.has(tileId)) {
          tile.row = curR;
          tile.col = curC;
        }
      }
    }

    if (!moved) return;

    lastSnapshot = snapshotBeforeMove;
    undoBtn.disabled = false;
    GameTrack.progress(trackState());

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

  function canMove() {
    if (getEmptyCells().length > 0) return true;
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const tileId = cells[r][c];
        if (!tileId) continue;
        const value = tiles.get(tileId).value;
        if (value <= MIN_VALUE) continue;
        const neighbors = [
          [r + 1, c],
          [r, c + 1],
        ];
        for (const [nr, nc] of neighbors) {
          if (inBounds(nr, nc)) {
            const neighborId = cells[nr][nc];
            if (neighborId && tiles.get(neighborId).value === value) return true;
          }
        }
      }
    }
    return false;
  }

  function showOverlay(kind) {
    GameTrack.end(kind === "win" ? "win" : "lose", trackState());
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
  const KEY_MAP = {
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
    w: "up",
    s: "down",
    a: "left",
    d: "right",
    W: "up",
    S: "down",
    A: "left",
    D: "right",
  };

  // The page scrolls (the article sits below the game), so only claim the
  // keys while the board is actually on screen — once the player has
  // scrolled down to read, arrows scroll the page like normal.
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

  // --- Touch / swipe input ---
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
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      if (Math.max(absDx, absDy) < SWIPE_THRESHOLD) return;

      if (absDx > absDy) {
        move(dx > 0 ? "right" : "left");
      } else {
        move(dy > 0 ? "down" : "up");
      }
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
  // --- Analytics (anonymous gameplay events, see assets/track.js) ---
  function trackState() {
    let best = Infinity;
    tiles.forEach((tile) => { if (tile.value < best) best = tile.value; });
    if (!isFinite(best)) best = 0;
    return { score, best, level: best ? Math.round(Math.log2(4096 / best)) : 0 };
  }
  GameTrack.init({ game: "reverse", minLevel: 6 });
  startNewGame();
})();
