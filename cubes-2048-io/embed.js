/* Cubes 2048 IO is an embedded game, so the page cannot see its moves.
   The game (about 4 MB) loads only after the player presses Play, which keeps the page light
   and gives one reliable analytics signal: embed_interact. This file also handles full screen
   and the theme toggle. */
(function () {
  "use strict";
  var GameTrack = window.GameTrack || { init: function () {}, embedInteract: function () {} };
  GameTrack.init({ game: "cubes", embedded: true });

  var wrap = document.getElementById("frame-wrap");
  var frame = document.getElementById("game-frame");
  var playBtn = document.getElementById("frame-play");
  var note = document.getElementById("frame-note");
  var fsBtn = document.getElementById("fullscreen-btn");
  var themeBtn = document.getElementById("theme-toggle-btn");

  var started = false;
  function start() {
    if (started) return;
    started = true;
    GameTrack.embedInteract();
    if (note) note.classList.remove("is-gone");
    frame.addEventListener("load", function () {
      if (note) note.classList.add("is-gone");
    });
    frame.src = frame.getAttribute("data-src");
    frame.hidden = false;
    playBtn.hidden = true;
  }
  playBtn.addEventListener("click", function () {
    start();
    // The click that pressed Play was on this page, so give the game focus for keyboard and pointer use.
    try { frame.focus(); } catch (e) {}
  });

  var requestFs = wrap.requestFullscreen || wrap.webkitRequestFullscreen;
  if (!requestFs) {
    fsBtn.hidden = true;
  } else {
    fsBtn.addEventListener("click", function () {
      start();
      try {
        var p = requestFs.call(wrap);
        if (p && p.catch) p.catch(function () {});
      } catch (e) {}
    });
  }

  var THEME_KEY = "2048free_theme";
  themeBtn.addEventListener("click", function () {
    var next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
  });
})();
