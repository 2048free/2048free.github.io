(() => {
  "use strict";

  const SIZE = 4;
  const WIN_VALUE = 2048;
  const TIER_COUNT = 11; // doges for 2, 4, 8 ... 2048
  const BEST_SCORE_KEY = "gamedoge2048_best_score";
  // Shared by every page on the site so the chosen theme follows the player.
  const THEME_KEY = "2048free_theme";
  const UNLOCKED_KEY = "gamedoge2048_unlocked";
  const SWIPE_THRESHOLD = 24;

  const DIRECTIONS = {
    up: { dr: -1, dc: 0 },
    down: { dr: 1, dc: 0 },
    left: { dr: 0, dc: -1 },
    right: { dr: 0, dc: 1 },
  };

  // ---------------------------------------------------------------------
  // Doge artwork — original vector drawings, one per tier, built from a
  // shared base head plus a few accessories so the 11 doges read as one
  // family that gets fancier as the number grows.
  // ---------------------------------------------------------------------
  const EARS =
    '<path d="M17 42 L20 12 Q21 7 26 10 L45 25 Z" fill="#e0912f"/>' +
    '<path d="M83 42 L80 12 Q79 7 74 10 L55 25 Z" fill="#e0912f"/>' +
    '<path d="M23 35 L25 18 L38 27 Z" fill="#f9cfae"/>' +
    '<path d="M77 35 L75 18 L62 27 Z" fill="#f9cfae"/>';
  const HEAD = '<ellipse cx="50" cy="58" rx="37" ry="33" fill="#f2a94b"/>';
  const MASK = '<path d="M15 62 Q31 53 50 66 Q69 53 85 62 Q87 90 50 93 Q13 90 15 62 Z" fill="#fff1dc"/>';
  const BROWS = '<circle cx="35" cy="42" r="3.4" fill="#fff1dc"/><circle cx="65" cy="42" r="3.4" fill="#fff1dc"/>';
  const NOSE =
    '<ellipse cx="50" cy="69" rx="6.2" ry="4.3" fill="#2a1810"/>' +
    '<ellipse cx="48.4" cy="67.6" rx="1.8" ry="1" fill="#6b4a38"/>';
  const MOUTH =
    '<path d="M50 73 L50 77 M50 77 Q44 83 37 78 M50 77 Q56 83 63 78" stroke="#2a1810" stroke-width="1.9" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
  const TONGUE = '<path d="M44.5 79.5 Q50 95 55.5 79.5 Q50 83 44.5 79.5Z" fill="#ff7b90"/>';
  const BLUSH =
    '<circle cx="26" cy="66" r="5" fill="#ff8fa3" opacity="0.55"/><circle cx="74" cy="66" r="5" fill="#ff8fa3" opacity="0.55"/>';

  const EYES = {
    open:
      '<ellipse cx="36" cy="53" rx="4.4" ry="5.4" fill="#34200f"/><ellipse cx="64" cy="53" rx="4.4" ry="5.4" fill="#34200f"/>' +
      '<circle cx="37.4" cy="51" r="1.5" fill="#fff"/><circle cx="65.4" cy="51" r="1.5" fill="#fff"/>',
    wink:
      '<path d="M30 54 Q36 48 42 54" stroke="#34200f" stroke-width="2.8" fill="none" stroke-linecap="round"/>' +
      '<ellipse cx="64" cy="53" rx="4.4" ry="5.4" fill="#34200f"/><circle cx="65.4" cy="51" r="1.5" fill="#fff"/>',
    happy:
      '<path d="M30 54 Q36 47 42 54" stroke="#34200f" stroke-width="2.8" fill="none" stroke-linecap="round"/>' +
      '<path d="M58 54 Q64 47 70 54" stroke="#34200f" stroke-width="2.8" fill="none" stroke-linecap="round"/>',
    shades:
      '<rect x="25" y="46" width="23" height="13" rx="4" fill="#15110f"/><rect x="52" y="46" width="23" height="13" rx="4" fill="#15110f"/>' +
      '<path d="M48 51 H52" stroke="#15110f" stroke-width="3"/>' +
      '<path d="M29 49.5 H35 M56 49.5 H62" stroke="#fff" stroke-opacity="0.55" stroke-width="1.6" stroke-linecap="round"/>',
    star:
      '<path transform="translate(36 53) scale(0.9)" d="M0 -7 L2.1 -2.2 L7.3 -2.2 L3.1 1 L4.6 6 L0 3 L-4.6 6 L-3.1 1 L-7.3 -2.2 L-2.1 -2.2Z" fill="#ffd23f" stroke="#a86b00" stroke-width="1.2"/>' +
      '<path transform="translate(64 53) scale(0.9)" d="M0 -7 L2.1 -2.2 L7.3 -2.2 L3.1 1 L4.6 6 L0 3 L-4.6 6 L-3.1 1 L-7.3 -2.2 L-2.1 -2.2Z" fill="#ffd23f" stroke="#a86b00" stroke-width="1.2"/>',
  };

  const EXTRAS = {
    hat:
      '<path d="M36 28 L50 -4 L64 28 Z" fill="#ff5fa2"/>' +
      '<path d="M41 20 L59 20 M44 12 L56 12" stroke="#fff" stroke-width="2.4" opacity="0.85"/>' +
      '<circle cx="50" cy="-4" r="4.6" fill="#ffe45e"/>',
    bow:
      '<path d="M50 95 L33 86 L33 104 Z" fill="#e04a4a"/><path d="M50 95 L67 86 L67 104 Z" fill="#e04a4a"/>' +
      '<circle cx="50" cy="95" r="4.4" fill="#b73030"/>',
    chain:
      '<path d="M24 80 Q50 108 76 80" stroke="#f5c02e" stroke-width="3.2" fill="none"/>' +
      '<circle cx="50" cy="99" r="7.2" fill="#ffd23f" stroke="#b97d00" stroke-width="1.6"/>' +
      '<circle cx="50" cy="99" r="3.6" fill="none" stroke="#b97d00" stroke-width="1.4"/>',
    crown:
      '<path d="M31 29 L33 8 L42 19 L50 5 L58 19 L67 8 L69 29 Z" fill="#ffd23f" stroke="#b97d00" stroke-width="1.6" stroke-linejoin="round"/>' +
      '<path d="M31 29 H69" stroke="#b97d00" stroke-width="2"/>' +
      '<circle cx="50" cy="22" r="2.4" fill="#ff5a5f"/><circle cx="39" cy="24" r="1.8" fill="#4aa8ff"/><circle cx="61" cy="24" r="1.8" fill="#4cd964"/>',
  };

  function sparkle(x, y, s, fill) {
    return `<path transform="translate(${x} ${y}) scale(${s})" d="M0 -6 Q1 -1 6 0 Q1 1 0 6 Q-1 1 -6 0 Q-1 -1 0 -6Z" fill="${fill}"/>`;
  }

  const SPARKLES_DEFAULT =
    sparkle(12, 26, 1.1, "#ffe45e") + sparkle(90, 20, 0.9, "#ffffff") +
    sparkle(92, 82, 1.1, "#ffe45e") + sparkle(8, 80, 0.8, "#ffffff");
  const SPARKLES_COIN =
    sparkle(18, 30, 1.1, "#fff6bf") + sparkle(84, 24, 0.9, "#ffffff") +
    sparkle(88, 78, 1.1, "#fff6bf") + sparkle(14, 74, 0.8, "#ffffff");

  const AURA = (() => {
    const colors = ["#ff5a5f", "#ff9f43", "#ffd93d", "#4cd964", "#4aa8ff", "#a06bff"];
    return colors
      .map((color, i) => {
        const r = 56 - i * 2.2;
        return `<path d="M${50 - r} 58 A${r} ${r} 0 0 1 ${50 + r} 58" stroke="${color}" stroke-width="2.4" fill="none"/>`;
      })
      .join("");
  })();

  const COIN =
    '<circle cx="50" cy="50" r="60" fill="#ffe27a" fill-opacity="0.35" stroke="#e8b013" stroke-width="5"/>' +
    '<circle cx="50" cy="50" r="53" fill="none" stroke="#fff3b0" stroke-width="1.6" stroke-dasharray="3 4"/>';

  const DOGE_CONFIG = [
    null,
    { eyes: "open" },
    { eyes: "wink" },
    { eyes: "happy", tongue: true },
    { eyes: "open", extras: ["hat"] },
    { eyes: "shades" },
    { eyes: "happy", blush: true, extras: ["bow"] },
    { eyes: "wink", tongue: true, extras: ["chain"] },
    { eyes: "happy", aura: true },
    { eyes: "open", extras: ["crown"] },
    { eyes: "star", tongue: true, sparkles: SPARKLES_DEFAULT },
    { eyes: "shades", extras: ["crown"], coin: true, sparkles: SPARKLES_COIN },
  ];

  const DOGE_SVG = DOGE_CONFIG.map((cfg) => {
    if (!cfg) return "";
    const viewBox = cfg.coin ? "-14 -14 128 128" : "-8 -14 116 122";
    let body = "";
    if (cfg.coin) body += COIN;
    if (cfg.aura) body += AURA;
    body += EARS + HEAD + MASK + BROWS;
    if (cfg.blush) body += BLUSH;
    body += EYES[cfg.eyes] + NOSE;
    if (cfg.tongue) body += TONGUE;
    body += MOUTH;
    (cfg.extras || []).forEach((name) => { body += EXTRAS[name]; });
    if (cfg.sparkles) body += cfg.sparkles;
    return `<svg viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">${body}</svg>`;
  });

  function tierForValue(value) {
    return Math.min(TIER_COUNT, Math.max(1, Math.round(Math.log2(value))));
  }

  // ---------------------------------------------------------------------
  // Doge talk
  // ---------------------------------------------------------------------
  const SAYINGS = [
    "such merge", "much wow", "very tile", "so combine", "many doge", "wow",
    "such skill", "very smart", "much points", "so good", "amaze", "such math",
    "very double", "so shiny", "much fluff", "such gamer", "very focus", "so cozy",
    "great job", "much swipe",
  ];
  const SAY_COLORS = ["#ff6b6b", "#ffb703", "#7bd957", "#38c9f5", "#b78bff", "#ff7ac8", "#ffffff"];

  const boardEl = document.getElementById("board");
  const boardWrapEl = boardEl.parentElement;
  const gridBgEl = document.getElementById("grid-bg");
  const tileLayerEl = document.getElementById("tile-layer");
  const speechLayerEl = document.getElementById("speech-layer");
  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");
  const overlayEl = document.getElementById("overlay");
  const overlayTitleEl = document.getElementById("overlay-title");
  const overlayContinueBtn = document.getElementById("overlay-continue-btn");
  const overlayRetryBtn = document.getElementById("overlay-retry-btn");
  const newGameBtn = document.getElementById("new-game-btn");
  const themeToggleBtn = document.getElementById("theme-toggle-btn");
  const undoBtn = document.getElementById("undo-btn");
  const dogeGridEl = document.getElementById("doge-grid");
  const dogeProgressEl = document.getElementById("doge-progress");

  let cells = [];
  let tiles = new Map();
  let nextTileId = 1;
  let score = 0;
  let best = Number(localStorage.getItem(BEST_SCORE_KEY)) || 0;
  let unlocked = Math.min(TIER_COUNT, Number(localStorage.getItem(UNLOCKED_KEY)) || 0);
  let hasWon = false;
  let keepPlayingAfterWin = false;
  let isBusy = false;
  let pendingMoveTimeout = null;
  let cellSize = 0;
  let gapSize = 0;
  let lastSnapshot = null;

  function showSay(text) {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    speechLayerEl.innerHTML = "";
    const el = document.createElement("div");
    el.className = "say";
    el.textContent = text;
    el.style.color = SAY_COLORS[Math.floor(Math.random() * SAY_COLORS.length)];
    speechLayerEl.appendChild(el);
    const bw = boardEl.clientWidth;
    const bh = boardEl.clientHeight;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    el.style.left = `${Math.max(0, Math.random() * (bw - w))}px`;
    el.style.top = `${Math.max(0, bh * 0.06 + Math.random() * (bh * 0.8 - h))}px`;
    el.addEventListener("animationend", () => el.remove());
  }

  function randomSaying() {
    return SAYINGS[Math.floor(Math.random() * SAYINGS.length)];
  }

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

  function spawnRandomTile() {
    const empties = getEmptyCells();
    if (empties.length === 0) return;
    const spot = empties[Math.floor(Math.random() * empties.length)];
    const value = Math.random() < 0.9 ? 2 : 4;
    createTile(spot.r, spot.c, value);
    unlockTier(tierForValue(value), false);
  }

  function unlockTier(tier, announce) {
    if (tier <= unlocked) return;
    unlocked = tier;
    localStorage.setItem(UNLOCKED_KEY, String(unlocked));
    renderCollection();
    if (announce) showSay(tier >= TIER_COUNT ? "all doges! wow!" : "new doge! wow");
  }

  function startNewGame() {
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
    speechLayerEl.innerHTML = "";
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
    // Never scrolling outranks keeping the board readable, so there is no
    // minimum floor beyond 0 — see the sibling projects for why.
    const fitSize = Math.max(0, Math.min(boardWrapEl.clientWidth, boardWrapEl.clientHeight, 500));
    boardEl.style.width = `${fitSize}px`;
    boardEl.style.height = `${fitSize}px`;

    const gap = Math.max(0.5, fitSize * 0.028);
    boardEl.style.setProperty("--gap", `${gap}px`);
    boardEl.style.setProperty("--say-size", `${Math.max(9, fitSize * 0.07)}px`);

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

  function badgeFontSize(digitCount) {
    const ratio = digitCount <= 2 ? 0.2 : digitCount === 3 ? 0.18 : digitCount === 4 ? 0.16 : 0.13;
    return cellSize * ratio;
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

      const tier = tierForValue(tile.value);
      if (el.dataset.renderedValue !== String(tile.value)) {
        el.innerHTML = `<div class="doge-art">${DOGE_SVG[tier]}</div><span class="doge-num">${tile.value}</span>`;
        el.dataset.renderedValue = String(tile.value);
        el.setAttribute("role", "img");
        el.setAttribute("aria-label", `Doge ${tile.value}`);
      }
      el.dataset.tier = String(tier);
      el.dataset.super = tile.value > WIN_VALUE ? "true" : "false";
      const num = el.querySelector(".doge-num");
      const fontSize = badgeFontSize(String(tile.value).length);
      num.style.fontSize = `${fontSize}px`;
      num.style.display = fontSize < 5 ? "none" : "";

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
    speechLayerEl.innerHTML = "";
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
    let highestMergedTier = 0;

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
            highestMergedTier = Math.max(highestMergedTier, tierForValue(targetTile.value));
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

    if (mergedThisMove.size > 0) {
      if (highestMergedTier > unlocked) unlockTier(highestMergedTier, true);
      else showSay(randomSaying());
    }

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
    if (kind === "win") {
      overlayTitleEl.textContent = "Such Win! 🎉";
      overlayContinueBtn.hidden = false;
    } else {
      overlayTitleEl.textContent = "So Sad! Game Over";
      overlayContinueBtn.hidden = true;
    }
    overlayEl.hidden = false;
  }

  function hideOverlay() {
    overlayEl.hidden = true;
  }

  function renderCollection() {
    dogeGridEl.innerHTML = "";
    for (let tier = 1; tier <= TIER_COUNT; tier++) {
      const li = document.createElement("li");
      const isUnlocked = tier <= unlocked;
      if (!isUnlocked) li.className = "locked";
      const art = document.createElement("span");
      art.className = "legend-art";
      art.style.background = `var(--tier-${tier})`;
      art.innerHTML = DOGE_SVG[tier];
      const label = document.createElement("span");
      label.className = "legend-label";
      label.textContent = isUnlocked ? String(2 ** tier) : "?";
      li.appendChild(art);
      li.appendChild(label);
      dogeGridEl.appendChild(li);
    }
    dogeProgressEl.textContent =
      unlocked >= TIER_COUNT
        ? "You have unlocked all 11 doges. Such collector!"
        : `${unlocked} of ${TIER_COUNT} doges unlocked.`;
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
  renderCollection();
  bestEl.textContent = String(best);
  startNewGame();
})();
