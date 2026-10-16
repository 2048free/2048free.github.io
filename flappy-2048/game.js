(() => {
  "use strict";

  // --- Tuning ---------------------------------------------------------
  // All distances are in grid cells (the board is 4 cells across) and all
  // times in seconds, so the feel is identical on every screen size.
  const GRID = 4;
  const BIRD_X = 0.9;            // bird's fixed horizontal position
  const BIRD_HIT = 0.45;         // hitbox side, the middle of the tile, so near-misses are forgiven
  const WALL_INSET = 0.04;       // walls are a touch smaller than their tile
  const GRAVITY = 17;
  const FLAP_VY = -4.6;
  const MAX_FALL = 9.5;
  const WALL_SPACING = 3.4;
  const FIRST_WALL_X = 5.4;
  const BASE_SPEED = 2;          // wall scroll speed at the start
  const SPEED_STEP = 0.025;      // extra speed per wall passed
  const MAX_SPEED = 3.6;
  const PASSES_PER_MERGE = 5;
  const WIN_VALUE = 2048;
  const GRACE_SECONDS = 1;
  const OVER_RESTART_DELAY = 700; // ms before a flap may restart after a loss
  const SIM_STEP = 1 / 120;

  const BEST_SCORE_KEY = "gameflappy2048_best_score";
  // Shared by every page on the site so the chosen theme follows the player.
  const THEME_KEY = "2048free_theme";

  const boardEl = document.getElementById("board");
  const boardWrapEl = boardEl.parentElement;
  const gridBgEl = document.getElementById("grid-bg");
  const tileLayerEl = document.getElementById("tile-layer");
  const hintEl = document.getElementById("hint");
  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");
  const overlayEl = document.getElementById("overlay");
  const overlayTitleEl = document.getElementById("overlay-title");
  const overlaySubEl = document.getElementById("overlay-sub");
  const overlayContinueBtn = document.getElementById("overlay-continue-btn");
  const overlayRetryBtn = document.getElementById("overlay-retry-btn");
  const newGameBtn = document.getElementById("new-game-btn");
  const themeToggleBtn = document.getElementById("theme-toggle-btn");
  const stageEl = document.querySelector(".sf-stage") || boardWrapEl;

  // ready | playing | paused | over | won
  let state = "ready";
  let bird = { y: 1.5, vy: 0 };
  let walls = [];
  let passes = 0;
  let value = 2;
  let best = Number(localStorage.getItem(BEST_SCORE_KEY)) || 0;
  let hasWon = false;
  let grace = 0;
  let bobClock = 0;
  let overAt = 0;
  let endTimer = null;

  let cellSize = 0;
  let gapSize = 0;
  let pitch = 0;
  let birdEl = null;
  let faceEl = null;
  let renderedValue = null;

  // --- Layout ---------------------------------------------------------
  function buildGridBackground() {
    gridBgEl.innerHTML = "";
    for (let i = 0; i < GRID * GRID; i++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      gridBgEl.appendChild(cell);
    }
  }

  function measureBoard() {
    // Never scrolling outranks keeping the board readable, so there's no
    // minimum floor beyond 0.
    const fitSize = Math.max(0, Math.min(boardWrapEl.clientWidth, boardWrapEl.clientHeight, 500));
    boardEl.style.width = `${fitSize}px`;
    boardEl.style.height = `${fitSize}px`;

    const gap = Math.max(0.5, fitSize * 0.028);
    boardEl.style.setProperty("--gap", `${gap}px`);
    boardEl.style.setProperty("--hint-size", `${Math.max(8, fitSize * 0.04)}px`);

    boardEl.style.setProperty("--overlay-title-size", `${Math.max(10, fitSize * 0.064)}px`);
    boardEl.style.setProperty("--overlay-title-gap", `${Math.max(2, fitSize * 0.032)}px`);
    boardEl.style.setProperty("--overlay-box-padding", `${Math.max(2, fitSize * 0.032)}px`);
    boardEl.style.setProperty("--overlay-btn-size", `${Math.max(8, fitSize * 0.03)}px`);
    boardEl.style.setProperty("--overlay-btn-padding", `${Math.max(1, fitSize * 0.02)}px ${Math.max(3, fitSize * 0.036)}px`);
    boardEl.style.setProperty("--overlay-actions-gap", `${Math.max(2, fitSize * 0.02)}px`);
    boardEl.style.setProperty("--overlay-sub-size", `${Math.max(8, fitSize * 0.034)}px`);
    // The extra score line is the first thing to go when room is tight, so
    // the retry button always stays inside the clipped overlay.
    overlaySubEl.hidden = fitSize < 200 || !overlaySubEl.textContent;

    const cell0 = gridBgEl.children[0].getBoundingClientRect();
    const cell1 = gridBgEl.children[1].getBoundingClientRect();
    cellSize = cell0.width;
    gapSize = cell1.left - cell0.right;
    pitch = cellSize + gapSize;

    sizePiece(birdEl);
    walls.forEach((wall) => wall.els.forEach(sizePiece));
    updateBirdFace(true);
  }

  function sizePiece(el) {
    if (!el) return;
    el.style.width = `${cellSize}px`;
    el.style.height = `${cellSize}px`;
  }

  // --- World ----------------------------------------------------------
  function speedFor(passed) {
    return Math.min(MAX_SPEED, BASE_SPEED + passed * SPEED_STEP);
  }

  function createWall(x) {
    const gap = Math.floor(Math.random() * (GRID - 1)); // gap fills rows gap and gap+1
    const rows = [];
    for (let r = 0; r < GRID; r++) {
      if (r < gap || r > gap + 1) rows.push(r);
    }
    const els = rows.map(() => {
      const el = document.createElement("div");
      el.className = "piece pipe";
      sizePiece(el);
      tileLayerEl.appendChild(el);
      return el;
    });
    return { x, gap, rows, els, passed: false };
  }

  function removeWall(wall) {
    wall.els.forEach((el) => el.remove());
  }

  function resetWorld() {
    clearTimeout(endTimer);
    tileLayerEl.innerHTML = "";
    walls = [];
    for (let i = 0; i < 3; i++) walls.push(createWall(FIRST_WALL_X + i * WALL_SPACING));

    birdEl = document.createElement("div");
    birdEl.className = "piece bird";
    faceEl = document.createElement("div");
    faceEl.className = "face";
    birdEl.appendChild(faceEl);
    tileLayerEl.appendChild(birdEl);
    sizePiece(birdEl);
    renderedValue = null;

    bird = { y: (GRID - 1) / 2, vy: 0 };
    passes = 0;
    value = 2;
    hasWon = false;
    grace = 0;
    bobClock = 0;
    updateScoreDisplay();
    updateBirdFace(true);
  }

  function updateScoreDisplay() {
    scoreEl.textContent = String(passes);
    if (passes > best) {
      best = passes;
      localStorage.setItem(BEST_SCORE_KEY, String(best));
    }
    bestEl.textContent = String(best);
  }

  function fontSizeForDigits(digitCount) {
    const ratio = digitCount <= 2 ? 0.5 : digitCount === 3 ? 0.42 : digitCount === 4 ? 0.34 : 0.27;
    return Math.max(8, cellSize * ratio);
  }

  function updateBirdFace(force) {
    if (!birdEl) return;
    const text = String(value);
    if (force || renderedValue !== value) {
      faceEl.textContent = text;
      birdEl.dataset.value = text;
      birdEl.dataset.super = value > WIN_VALUE ? "true" : "false";
      renderedValue = value;
    }
    faceEl.style.fontSize = `${fontSizeForDigits(text.length)}px`;
    birdEl.style.setProperty("--progress", String((passes % PASSES_PER_MERGE) / PASSES_PER_MERGE));
  }

  function restartAnimation(el, className) {
    el.classList.remove(className);
    void el.offsetWidth;
    el.classList.add(className);
  }

  // --- Simulation -----------------------------------------------------
  function overlaps(wall) {
    const half = (1 - BIRD_HIT) / 2;
    const bx0 = BIRD_X + half;
    const bx1 = bx0 + BIRD_HIT;
    const by0 = bird.y + half;
    const by1 = by0 + BIRD_HIT;
    const wx0 = wall.x + WALL_INSET;
    const wx1 = wall.x + 1 - WALL_INSET;
    if (bx1 <= wx0 || bx0 >= wx1) return false;
    return wall.rows.some((r) => by1 > r + WALL_INSET && by0 < r + 1 - WALL_INSET);
  }

  function onWallPassed() {
    passes += 1;
    updateScoreDisplay();
    if (passes % PASSES_PER_MERGE === 0) {
      value *= 2;
      updateBirdFace();
      restartAnimation(faceEl, "merged");
      if (value === WIN_VALUE && !hasWon) {
        hasWon = true;
        state = "won";
        endTimer = setTimeout(() => {
          if (state === "won") showOverlay("win");
        }, 300);
      }
    } else {
      updateBirdFace();
    }
  }

  function crash() {
    state = "over";
    overAt = Date.now();
    birdEl.classList.add("crashed");
    endTimer = setTimeout(() => {
      if (state === "over") showOverlay("lose");
    }, 450);
  }

  function step(dt) {
    if (state === "ready") {
      bobClock += dt;
      bird.y = (GRID - 1) / 2 + Math.sin(bobClock * 3.2) * 0.1;
      return;
    }
    if (state !== "playing") return;

    bird.vy = Math.min(MAX_FALL, bird.vy + GRAVITY * dt);
    bird.y += bird.vy * dt;
    // Floor and ceiling are safe: the bird just stops against them.
    if (bird.y < 0) {
      bird.y = 0;
      if (bird.vy < 0) bird.vy = 0;
    }
    if (bird.y > GRID - 1) {
      bird.y = GRID - 1;
      if (bird.vy > 0) bird.vy = 0;
    }

    const speed = speedFor(passes);
    walls.forEach((wall) => {
      wall.x -= speed * dt;
    });

    for (const wall of walls) {
      if (!wall.passed && wall.x + 1 < BIRD_X) {
        wall.passed = true;
        onWallPassed();
        if (state !== "playing") break;
      }
    }

    if (walls.length && walls[0].x < -1.2) {
      removeWall(walls.shift());
      walls.push(createWall(walls[walls.length - 1].x + WALL_SPACING));
    }

    if (grace > 0) {
      grace = Math.max(0, grace - dt);
      if (grace === 0) birdEl.classList.remove("grace");
    } else if (state === "playing" && walls.some(overlaps)) {
      crash();
    }
  }

  function render() {
    if (!birdEl) return;
    const tilt = Math.max(-18, Math.min(26, bird.vy * 2.6));
    birdEl.style.transform = `translate(${BIRD_X * pitch}px, ${bird.y * pitch}px) rotate(${state === "ready" ? 0 : tilt}deg)`;
    walls.forEach((wall) => {
      wall.els.forEach((el, i) => {
        el.style.transform = `translate(${wall.x * pitch}px, ${wall.rows[i] * pitch}px)`;
      });
    });
  }

  let lastTs = 0;
  let accumulator = 0;
  function frame(ts) {
    const elapsed = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0;
    lastTs = ts;
    accumulator += elapsed;
    while (accumulator >= SIM_STEP) {
      step(SIM_STEP);
      accumulator -= SIM_STEP;
    }
    render();
    requestAnimationFrame(frame);
  }

  // --- State changes --------------------------------------------------
  function setHint(text) {
    hintEl.hidden = !text;
    if (text) hintEl.textContent = text;
  }

  function startNewGame() {
    resetWorld();
    state = "ready";
    hideOverlay();
    setHint("Tap or press Space to flap");
    measureBoard();
    render();
  }

  function pause() {
    if (state !== "playing") return;
    state = "paused";
    setHint("Paused — tap to resume");
  }

  function flap() {
    switch (state) {
      case "ready":
        state = "playing";
        setHint("");
        bird.vy = FLAP_VY;
        restartAnimation(faceEl, "flap");
        break;
      case "playing":
        bird.vy = FLAP_VY;
        restartAnimation(faceEl, "flap");
        break;
      case "paused":
        state = "playing";
        setHint("");
        startGrace();
        bird.vy = FLAP_VY;
        restartAnimation(faceEl, "flap");
        break;
      case "over":
        if (Date.now() - overAt > OVER_RESTART_DELAY) startNewGame();
        break;
      default:
        break;
    }
  }

  function startGrace() {
    grace = GRACE_SECONDS;
    birdEl.classList.add("grace");
  }

  function showOverlay(kind) {
    if (kind === "win") {
      overlayTitleEl.textContent = "You Win! 🎉";
      overlaySubEl.textContent = `Walls passed: ${passes}`;
      overlayContinueBtn.hidden = false;
    } else {
      overlayTitleEl.textContent = "Game Over!";
      overlaySubEl.textContent = `Walls passed: ${passes}`;
      overlayContinueBtn.hidden = true;
    }
    overlaySubEl.hidden = boardEl.clientWidth < 200;
    overlayEl.hidden = false;
  }

  function hideOverlay() {
    overlayEl.hidden = true;
  }

  function keepFlying() {
    hideOverlay();
    state = "playing";
    startGrace();
    bird.vy = FLAP_VY;
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

  // --- Input ----------------------------------------------------------
  const FLAP_KEYS = new Set([" ", "Spacebar", "ArrowUp", "w", "W"]);

  // The page scrolls (the article sits below the game), so Space / Up only
  // flap while the board is actually on screen — once the player has scrolled
  // down to read, those keys scroll the page like normal.
  function boardInView() {
    const rect = boardEl.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < window.innerHeight;
  }

  window.addEventListener("keydown", (e) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (!FLAP_KEYS.has(e.key)) return;
    if (e.target.closest && e.target.closest("input, textarea, select, [contenteditable]")) return;
    if (!boardInView()) return;
    e.preventDefault();
    flap();
  });

  // Tapping the board flaps at once (pointerdown, so there is no click delay).
  boardEl.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (e.target.closest && e.target.closest("button, a, .overlay")) return;
    flap();
  });

  // The rest of the game area (around the board) flaps too, but only on a real
  // tap or click — a swipe that starts there scrolls the page instead.
  stageEl.addEventListener("click", (e) => {
    if (boardEl.contains(e.target)) return;
    if (e.target.closest && e.target.closest("button, a, .overlay")) return;
    flap();
  });

  // Scrolling down to read the article must not leave the tile falling into a
  // wall: pause as soon as less than half of the board is on screen.
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (entry && entry.intersectionRatio < 0.5) pause();
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1] }
    ).observe(boardEl);
  }

  // Buttons keep keyboard focus after a click, which would make the next
  // Space press both flap and re-click the button.
  document.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => btn.blur());
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pause();
  });

  newGameBtn.addEventListener("click", startNewGame);
  overlayRetryBtn.addEventListener("click", startNewGame);
  overlayContinueBtn.addEventListener("click", keepFlying);

  // --- Resize handling ---
  let resizeRaf = null;
  const resizeObserver = new ResizeObserver(() => {
    if (resizeRaf) cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
      measureBoard();
      render();
    });
  });
  resizeObserver.observe(boardWrapEl);

  // --- Init ---
  buildGridBackground();
  bestEl.textContent = String(best);
  startNewGame();
  requestAnimationFrame(frame);
})();
