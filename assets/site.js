(() => {
  "use strict";

  // Google Analytics is loaded by the Google tag snippet at the top of each
  // page's <head>, as Google recommends — not from here.

  // --- Dropdown menu behind the ☰ 2048 logo button ---
  const toggle = document.getElementById("sf-menu-toggle");
  const menu = document.getElementById("sf-menu");
  if (!toggle || !menu) return;

  function setOpen(open) {
    menu.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
  }

  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    setOpen(menu.hidden);
  });

  document.addEventListener("click", (e) => {
    if (!menu.hidden && !menu.contains(e.target)) setOpen(false);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !menu.hidden) {
      setOpen(false);
      toggle.focus();
    }
  });

  // In-page links (How to play → #how-to-play) should close the menu as they scroll.
  menu.addEventListener("click", (e) => {
    if (e.target.closest("a")) setOpen(false);
  });
})();
