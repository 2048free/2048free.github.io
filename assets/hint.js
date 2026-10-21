/* Shows a one-line "how to play" pill on top of the board until the first
   move. The game intro text sits above the board and is easy to miss on a
   phone, so the hint lives where the player is already looking.
   Per-game wording: data-hint-touch / data-hint-keys on #board. */
(function () {
  "use strict";
  var board = document.getElementById("board");
  if (!board || document.getElementById("hint")) return; // Flappy has its own hint
  var coarse = false;
  try { coarse = window.matchMedia("(pointer: coarse)").matches; } catch (e) {}
  var text = coarse
    ? board.getAttribute("data-hint-touch") || "Swipe to play"
    : board.getAttribute("data-hint-keys") || "Use the arrow keys to play";
  var el = document.createElement("div");
  el.className = "sf-hint";
  el.setAttribute("aria-hidden", "true");
  el.textContent = text;
  board.appendChild(el);

  // Anything pressed inside the game area counts (board, buttons, direction pad).
  var area = board.closest(".sf-stage") || board;
  var gone = false;
  function dismiss() {
    if (gone) return;
    gone = true;
    el.classList.add("sf-hint-out");
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 300);
    area.removeEventListener("touchstart", dismiss);
    area.removeEventListener("pointerdown", dismiss);
    window.removeEventListener("keydown", onKey);
  }
  function onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^(Arrow|[wasdqe]$)/i.test(e.key)) dismiss();
  }
  area.addEventListener("touchstart", dismiss, { passive: true });
  area.addEventListener("pointerdown", dismiss);
  window.addEventListener("keydown", onKey);
})();
