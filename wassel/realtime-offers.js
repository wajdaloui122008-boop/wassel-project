(() => {
  // The taxi dashboard is the single renderer for taxi offers.
  // Realtime events only trigger an immediate refresh so the same offer
  // cannot be rendered twice by two independent UI owners.
  window.addEventListener("velto:realtime-offer", () => {
    if (window.__veltoUser?.role === "taxi") {
      window.dispatchEvent(new CustomEvent("velto:refresh-taxi-offers"));
    }
  });
})();
