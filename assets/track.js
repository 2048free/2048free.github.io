/* Anonymous gameplay analytics for 2048free (Google Analytics 4, via the gtag snippet in <head>).
 *
 * Games call a tiny API:  GameTrack.init / restart / progress / end / undo / event / flag.
 * Nothing personal is collected: only what happened in a run (score, highest tile, moves, seconds).
 *
 * Events sent
 *   game_start         first real move of a run              (input_method, seconds_to_first_move)
 *   game_progress      a new tile level reached in a run     (level, best_tile, moves, active_seconds ...)
 *   game_end           run finished: result = win | lose     (score, level, best_tile, moves, active_seconds ...)
 *   game_restart       New Game pressed in the middle of a run (where the player gave up)
 *   game_leave         page hidden / closed in the middle of a run (where the player stopped)
 *   exit_without_play  page hidden / closed before any move  (seconds_on_page, article_seen)
 *   game_undo, theme_toggle, autoplay_start, doge_unlock, faq_open, article_view,
 *   menu_click, more_games_click, related_game_click, catalog_click, footer_click, js_error
 *
 * Debugging: open any page with ?track_debug=1 to log every event in the console and to see them in
 * GA4 > Admin > DebugView.  Opt a browser out of tracking with ?notrack=1 (back in with ?notrack=0).
 */
(() => {
  "use strict";

  const DEBUG = /[?&]track_debug=1/.test(location.search);
  const IDLE_CAP_MS = 30000; // a gap longer than this between moves is not counted as playing time
  const PAGE_NAMES = {
    "": "classic", "2048-cupcakes": "cupcakes", "2048-hexagon": "hexagon", "2048-fibonacci": "fibonacci",
    "2048-16x16": "16x16", "2048-reverse": "reverse", "doge-2048": "doge", "flappy-2048": "flappy",
    "2048-games": "catalog", about: "about", "privacy-policy": "privacy",
  };
  const seg = location.pathname.split("/").filter(Boolean)[0] || "";
  const pageName = PAGE_NAMES[seg] || seg || "page";
  const now = () => performance.now();
  const secs = (ms) => Math.max(0, Math.round(ms / 1000));
  const t0 = now();

  let cfg = { game: null, minLevel: 6 };
  let lastInput = "unknown";
  let articleSeen = false;
  let noPlaySent = false;
  let runBase = t0;
  let run = freshRun();

  function freshRun() {
    return { started: false, endedWin: false, endedLose: false, moves: 0, startAt: 0, lastAt: 0, activeMs: 0, reached: 0, level: 0, score: 0, best: 0, extras: {}, leftSent: false, undos: 0 };
  }

  function send(name, extra, beacon) {
    try {
      const p = { game_name: cfg.game || pageName };
      Object.keys(extra || {}).forEach((k) => {
        const v = extra[k];
        if (v === undefined || v === null || (typeof v === "number" && !isFinite(v))) return;
        p[k] = v;
      });
      if (beacon) p.transport_type = "beacon";
      if (DEBUG) { p.debug_mode = true; console.log("[track]", name, p); }
      if (typeof window.gtag === "function") window.gtag("event", name, p);
    } catch (e) { /* analytics must never break the game */ }
  }

  function runParams(extra) {
    return Object.assign({
      moves: run.moves,
      active_seconds: secs(run.activeMs),
      duration_seconds: run.startAt ? secs(now() - run.startAt) : 0,
      score: run.score,
      level: run.level,
      best_tile: run.best,
      undos: run.undos || undefined,
    }, run.extras, extra || {});
  }

  function take(s) {
    if (!s) return;
    if (typeof s.score === "number") run.score = s.score;
    if (typeof s.best === "number") run.best = s.best;
    if (typeof s.level === "number") run.level = s.level;
  }

  function begin() {
    if (run.started) return;
    run.started = true;
    run.startAt = run.lastAt = now();
    send("game_start", { input_method: lastInput, seconds_to_first_move: secs(run.startAt - runBase) });
  }

  const API = {
    init(options) { cfg = Object.assign(cfg, options || {}); },

    // First real action of a run, for games without discrete moves (Flappy).
    begin,

    // Called after every successful move (or every wall passed in Flappy).
    progress(s) {
      take(s);
      if (!run.started) begin();
      const t = now();
      run.activeMs += Math.min(IDLE_CAP_MS, t - run.lastAt);
      run.lastAt = t;
      run.moves += 1;
      run.leftSent = false;
      if (s && typeof s.level === "number" && s.level > run.reached) {
        run.reached = s.level;
        if (s.level >= cfg.minLevel) send("game_progress", runParams());
      }
    },

    end(result, s) {
      take(s);
      if (!run.started) begin();
      const isWin = result === "win";
      if (isWin ? run.endedWin : run.endedLose) return;
      const afterWin = !isWin && run.endedWin;
      if (isWin) run.endedWin = true; else run.endedLose = true;
      run.activeMs += Math.min(IDLE_CAP_MS, now() - run.lastAt);
      run.lastAt = now();
      send("game_end", runParams({ result: isWin ? "win" : "lose", after_win: afterWin ? 1 : undefined }));
    },

    // A new run is starting (New Game, retry, or the first run when the page loads).
    restart() {
      if (run.started && !run.endedWin && !run.endedLose) send("game_restart", runParams({ idle_seconds: secs(now() - run.lastAt) }));
      run = freshRun();
      runBase = now();
    },

    undo() {
      run.undos += 1;
      send("game_undo", { level: run.level, moves: run.moves, undo_count: run.undos });
    },

    event(name, params) { send(name, params); },
    flag(key, value) { run.extras[key] = value; },
  };
  window.GameTrack = API;

  // --- leaving the page -------------------------------------------------
  function onHide(reason) {
    if (!cfg.game) return;
    if (!run.started) {
      if (noPlaySent) return;
      noPlaySent = true;
      send("exit_without_play", { seconds_on_page: secs(now() - t0), article_seen: articleSeen ? 1 : 0, reason }, true);
      return;
    }
    if (run.endedWin || run.endedLose || run.leftSent) return;
    run.leftSent = true;
    send("game_leave", runParams({ reason, idle_seconds: secs(now() - run.lastAt) }), true);
  }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") onHide("hidden"); });
  window.addEventListener("pagehide", () => onHide("pagehide"));

  // --- which input the player uses (read when the first move happens) ---
  window.addEventListener("keydown", () => { lastInput = "keyboard"; }, true);
  window.addEventListener("pointerdown", (e) => { lastInput = e.pointerType === "touch" ? "touch" : e.pointerType === "pen" ? "pen" : "mouse"; }, true);
  window.addEventListener("touchstart", () => { lastInput = "touch"; }, { capture: true, passive: true });

  // --- page level interactions ---
  document.addEventListener("click", (e) => {
    const el = e.target;
    if (!el || !el.closest) return;
    const a = el.closest("a");
    if (a) {
      const target = (a.getAttribute("href") || "").slice(0, 100);
      if (a.closest("#sf-menu")) send("menu_click", { target }, true);
      else if (a.closest(".sf-actions")) send("more_games_click", { target }, true);
      else if (a.closest(".sf-related")) send("related_game_click", { target }, true);
      else if (a.closest(".sf-grid")) send("catalog_click", { target }, true);
      else if (a.closest(".sf-footer")) send("footer_click", { target }, true);
    }
    if (el.closest("#theme-toggle-btn")) setTimeout(() => send("theme_toggle", { to: document.documentElement.getAttribute("data-theme") || "light" }), 0);
  }, true);

  document.addEventListener("toggle", (e) => {
    const d = e.target;
    if (d && d.tagName === "DETAILS" && d.open) {
      const q = d.querySelector("summary");
      send("faq_open", { question: (q ? q.textContent : "").trim().slice(0, 80) });
    }
  }, true);

  const articleEl = document.getElementById("how-to-play");
  if (articleEl && "IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      if (entries.some((en) => en.isIntersecting)) {
        articleSeen = true;
        send("article_view", {});
        io.disconnect();
      }
    }, { threshold: 0.3 });
    io.observe(articleEl);
  }

  // --- errors: a crash is the most likely reason for a very short visit ---
  let errors = 0;
  window.addEventListener("error", (e) => {
    if (errors++ >= 3) return;
    send("js_error", { message: String(e.message || "").slice(0, 90), source: String(e.filename || "").split("/").pop() + ":" + (e.lineno || 0) });
  });
  window.addEventListener("unhandledrejection", (e) => {
    if (errors++ >= 3) return;
    send("js_error", { message: ("promise: " + String((e.reason && e.reason.message) || e.reason || "")).slice(0, 90), source: "promise" });
  });
})();
