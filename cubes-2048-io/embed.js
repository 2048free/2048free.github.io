/* Cubes 2048 IO is an embedded game, so the page cannot see its moves.
   This file only does the page-side work: loading note, full screen, theme toggle,
   and one analytics signal (first click or touch inside the frame). */
(function () {
  "use strict";
  var GameTrack = window.GameTrack || { init: function () {}, embedInteract: function () {} };
  GameTrack.init({ game: "cubes", embedded: true });

  var wrap = document.getElementById("frame-wrap");
  var frame = document.getElementById("game-frame");
  var note = document.getElementById("frame-note");
  var fsBtn = document.getElementById("fullscreen-btn");
  var themeBtn = document.getElementById("theme-toggle-btn");

  // The embedded game grabs focus by itself when it loads, so focus alone does not mean the
  // player did anything. Once it has settled, hand focus back to the page and arm the watcher:
  // from then on, focus returning to the frame means a real click or touch.
  var armed = false;
  var watcher = null;
  function checkFocus() {
    if (!armed || document.activeElement !== frame) return;
    GameTrack.embedInteract();
    if (watcher) { clearInterval(watcher); watcher = null; }
  }
  frame.addEventListener("load", function () {
    if (note) note.classList.add("is-gone");
    setTimeout(function () {
      try { frame.blur(); window.focus(); } catch (e) {}
      armed = true;
    }, 3000);
  });
  window.addEventListener("blur", function () { setTimeout(checkFocus, 0); });
  // Some browsers do not fire blur when focus moves into a cross-origin frame, so also look once a second.
  watcher = setInterval(checkFocus, 1000);

  var requestFs = wrap.requestFullscreen || wrap.webkitRequestFullscreen;
  if (!requestFs) {
    fsBtn.hidden = true;
  } else {
    fsBtn.addEventListener("click", function () {
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
