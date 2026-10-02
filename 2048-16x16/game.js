(() => {
  "use strict";

  const SIZE = 16;
  const WIN_VALUE = 268435456; // 2^28 — scaled up from the classic 2048 win
  // tile in rough proportion to how much bigger this board is (256 cells
  // instead of 16), matching the win tile used by the 16x16 variant this
  // project takes its board size from.
  const BEST_SCORE_KEY = "game2048_16x16_best_score";
  // Shared by every page on the site so the chosen theme follows the player.
  const THEME_KEY = "2048free_theme";
  const SWIPE_THRESHOLD = 24;
  const ABBREVIATE_FROM = 100000;

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
  const autoPlaySelect = document.getElementById("auto-play-select");
  const autoPlayBtn = document.getElementById("auto-play-btn");

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
    const frag = document.createDocumentFragment();
    for (let i = 0; i < SIZE * SIZE; i++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      frag.appendChild(cell);
    }
    gridBgEl.appendChild(frag);
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

  function spawnRandomTile() {
    const empties = getEmptyCells();
    if (empties.length === 0) return;
    const spot = empties[Math.floor(Math.random() * empties.length)];
    const value = Math.random() < 0.9 ? 2 : 4;
    createTile(spot.r, spot.c, value);
  }

  function startNewGame() {
    stopAutoPlay();
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
    // Never scrolling outranks keeping the board above some "readable" size,
    // so there's no minimum floor here beyond 0 — in a pathologically tiny
    // embed the board shrinks to whatever's actually left in boardWrapEl
    // rather than force an overflow the way a fixed floor would.
    const fitSize = Math.max(0, Math.min(boardWrapEl.clientWidth, boardWrapEl.clientHeight, 500));
    boardEl.style.width = `${fitSize}px`;
    boardEl.style.height = `${fitSize}px`;

    // With 16 cells per row there are 15 gaps to fit instead of 3, so the
    // same per-gap size as the classic 4x4 board would eat a much bigger
    // share of the board — keep gaps a fixed share of the board's total
    // size instead, spread across however many gaps this grid actually has.
    const gap = Math.max(0.5, (fitSize * 0.07) / (SIZE - 1));
    boardEl.style.setProperty("--gap", `${gap}px`);

    const fitSizeForOverlay = fitSize;
    boardEl.style.setProperty("--overlay-title-size", `${Math.max(10, fitSizeForOverlay * 0.064)}px`);
    boardEl.style.setProperty("--overlay-title-gap", `${Math.max(2, fitSizeForOverlay * 0.032)}px`);
    boardEl.style.setProperty("--overlay-box-padding", `${Math.max(2, fitSizeForOverlay * 0.032)}px`);
    boardEl.style.setProperty("--overlay-btn-size", `${Math.max(8, fitSizeForOverlay * 0.03)}px`);
    boardEl.style.setProperty("--overlay-btn-padding", `${Math.max(1, fitSizeForOverlay * 0.02)}px ${Math.max(3, fitSizeForOverlay * 0.036)}px`);
    boardEl.style.setProperty("--overlay-actions-gap", `${Math.max(2, fitSizeForOverlay * 0.02)}px`);

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

  // Values here can reach 268,435,456 (9 digits) in cells barely 15-30px
  // wide, so anything at or above ABBREVIATE_FROM is shown as e.g. "268M"
  // instead — full digits would either overflow the tile or force the font
  // down past legibility.
  function displayText(value) {
    if (value < ABBREVIATE_FROM) return String(value);
    const tiers = [
      [1e9, "B"],
      [1e6, "M"],
      [1e3, "K"],
    ];
    for (const [divisor, suffix] of tiers) {
      if (value >= divisor) {
        const scaled = value / divisor;
        const rounded = scaled >= 100 ? Math.round(scaled) : Math.round(scaled * 10) / 10;
        return rounded + suffix;
      }
    }
    return String(value);
  }

  function fontSizeForText(text) {
    const len = text.length;
    const ratio = len <= 2 ? 0.5 : len === 3 ? 0.42 : len === 4 ? 0.36 : len === 5 ? 0.28 : 0.22;
    return Math.max(6, cellSize * ratio);
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

      const text = displayText(tile.value);
      el.textContent = text;
      el.style.fontSize = `${fontSizeForText(text)}px`;
      el.dataset.value = String(tile.value);
      el.dataset.super = tile.value > 2048 ? "true" : "false";

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
    const rows = Array.from({ length: SIZE }, (_, i) => i);
    const cols = Array.from({ length: SIZE }, (_, i) => i);
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
    stopAutoPlay();
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
          if (targetTile.value === tile.value && !mergedThisMove.has(targetId) && !mergedThisMove.has(tileId)) {
            cells[curR][curC] = null;
            targetTile.value *= 2;
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
    stopAutoPlay();
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

  // --- Auto Play bot ---
  // Four simple, original scripted patterns (not a lookahead solver) that
  // each drive the same move() used by keyboard/swipe input, so every move
  // they make is a completely normal, undo-able move.
  let autoPlayTimer = null;
  let autoPlaySide = 0;
  let autoPlaySwirlIndex = 0;
  let autoPlayLastSignature = null;
  let autoPlayStuckTicks = 0;

  function boardSignature() {
    let sig = "";
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const id = cells[r][c];
        sig += id ? tiles.get(id).value : 0;
        sig += ",";
      }
    }
    return sig;
  }

  function stepCorner() {
    move("up");
    setTimeout(() => move(autoPlaySide === 0 ? "left" : "right"), 30);
  }

  function stepSwing() {
    if (autoPlaySide === 0) {
      move("up");
      setTimeout(() => move("down"), 30);
    } else {
      move("left");
      setTimeout(() => move("right"), 30);
    }
  }

  function stepSwirl() {
    const order = ["up", "right", "down", "left"];
    move(order[autoPlaySwirlIndex]);
    autoPlaySwirlIndex = (autoPlaySwirlIndex + 1) % order.length;
  }

  function stepRandom() {
    const order = ["up", "down", "left", "right"];
    move(order[Math.floor(Math.random() * order.length)]);
  }

  const AUTO_PLAY_STEPS = { corner: stepCorner, swing: stepSwing, swirl: stepSwirl, random: stepRandom };

  function autoPlayTick() {
    if (!overlayEl.hidden) return;
    const signature = boardSignature();
    if (signature === autoPlayLastSignature) {
      autoPlayStuckTicks++;
      if (autoPlayStuckTicks >= 2) {
        autoPlaySide = 1 - autoPlaySide;
        autoPlayStuckTicks = 0;
      }
    } else {
      autoPlayStuckTicks = 0;
    }
    autoPlayLastSignature = signature;
    AUTO_PLAY_STEPS[autoPlaySelect.value]();
  }

  function startAutoPlay() {
    stopAutoPlay();
    autoPlaySide = 0;
    autoPlaySwirlIndex = 0;
    autoPlayStuckTicks = 0;
    autoPlayLastSignature = null;
    autoPlayTimer = setInterval(autoPlayTick, 140);
    autoPlayBtn.textContent = "■ Stop";
    autoPlayBtn.classList.add("running");
    autoPlaySelect.disabled = true;
  }

  function stopAutoPlay() {
    if (autoPlayTimer) {
      clearInterval(autoPlayTimer);
      autoPlayTimer = null;
    }
    autoPlayBtn.textContent = "▶ Start";
    autoPlayBtn.classList.remove("running");
    autoPlaySelect.disabled = false;
  }

  autoPlayBtn.addEventListener("click", () => {
    if (autoPlayTimer) stopAutoPlay();
    else startAutoPlay();
  });

  // A focused <select> would swallow the arrow keys (they'd change the pattern
  // instead of moving tiles), so hand focus back to the page once a pattern is picked.
  autoPlaySelect.addEventListener("change", () => autoPlaySelect.blur());

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
  startNewGame();
})();
