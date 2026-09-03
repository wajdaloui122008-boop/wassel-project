(() => {
  const root = document.documentElement;
  let raf = 0;
  let px = 50;
  let py = 30;

  const apply = () => {
    raf = 0;
    root.style.setProperty('--lg-mx', `${px}%`);
    root.style.setProperty('--lg-my', `${py}%`);
  };

  const move = (event) => {
    const x = event.clientX / window.innerWidth;
    const y = event.clientY / window.innerHeight;
    px = Math.max(0, Math.min(100, x * 100));
    py = Math.max(0, Math.min(100, y * 100));
    if (!raf) raf = requestAnimationFrame(apply);
  };

  window.addEventListener('pointermove', move, { passive: true });

  document.addEventListener('pointerdown', (event) => {
    const glass = event.target.closest('.topbar, .glass-panel, .order-card, .role-card, .btn-ghost, .btn-oauth, .category-tab, .payment-option, .auth-tab');
    if (!glass) return;
    glass.classList.add('glass-pressed');
    window.setTimeout(() => glass.classList.remove('glass-pressed'), 420);
  }, { passive: true });

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.topbar, .glass-panel, .order-card, .role-card, .btn-ghost, .btn-oauth, .category-tab, .payment-option, .auth-tab').forEach((el) => {
      el.addEventListener('pointerenter', () => el.classList.add('glass-hover'), { passive: true });
      el.addEventListener('pointerleave', () => el.classList.remove('glass-hover'), { passive: true });
    });
  });
})();
