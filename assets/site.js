(() => {
  "use strict";

  // Google Analytics 4 measurement ID, e.g. "G-ABC123XYZ9". Leave empty to
  // disable tracking; it's the only place the ID needs to be set.
  const GA_ID = "";

  if (GA_ID) {
    const s = document.createElement("script");
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", GA_ID);
  }

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
