// Injected via Playwright context.add_init_script — runs before page scripts on every navigation.
// Provides: a synthetic cursor (Playwright video has NO OS cursor), a step caption,
// an optional API-call log panel, and app-tour suppression.
//
// Public API on window:
//   window.__caption(text)      -> update the bottom-center caption
//   window.__logOn = true|false -> enable/disable the API-call panel (start false to hide bootstrap noise)
//   window.__logFilter          -> substring a request URL must contain to be logged (default '/agent/api/')
(() => {
  try {
    // App-tour suppression (SkyPortal keys; change per app). Prevents overlays intercepting clicks.
    localStorage.setItem('hasAlreadySeenAgentOnboarding', 'true');
    localStorage.setItem('skyportal_tour_state', JSON.stringify({ completed: true, skipped: true }));
  } catch (e) {}

  const boot = () => {
    if (!document.body) return setTimeout(boot, 15);
    if (document.getElementById('__cursor')) return;
    window.__logOn = false;
    window.__logFilter = window.__logFilter || '/agent/api/';

    // ---- step caption (bottom center) ----
    const cap = document.createElement('div');
    cap.id = '__caption';
    cap.style.cssText = ['position:fixed', 'bottom:26px', 'left:50%', 'transform:translateX(-50%)', 'z-index:2147483647',
      'background:rgba(9,12,18,0.94)', 'color:#eaf2ff', 'border:1px solid #2b3a4f', 'border-radius:999px',
      'padding:11px 22px', 'font-family:ui-sans-serif,system-ui,sans-serif', 'font-size:15px', 'font-weight:600',
      'box-shadow:0 8px 30px rgba(0,0,0,0.5)', 'max-width:76vw', 'text-align:center'].join(';');
    document.body.appendChild(cap);
    window.__caption = (t) => { cap.textContent = t; };

    // ---- synthetic cursor + click ripple ----
    const cur = document.createElement('div');
    cur.id = '__cursor';
    cur.style.cssText = ['position:fixed', 'left:0', 'top:0', 'z-index:2147483647', 'pointer-events:none',
      'width:24px', 'height:24px', 'margin-left:-3px', 'margin-top:-2px', 'filter:drop-shadow(0 2px 3px rgba(0,0,0,0.55))'].join(';');
    cur.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M5 3 L5 19 L9.2 15.2 L12 21 L14.4 20 L11.6 14.2 L17 14 Z" fill="#ffffff" stroke="#111827" stroke-width="1.3" stroke-linejoin="round"/></svg>';
    document.body.appendChild(cur);
    let cx = window.innerWidth / 2, cy = window.innerHeight / 2;
    cur.style.transform = 'translate(' + cx + 'px,' + cy + 'px)';
    document.addEventListener('mousemove', (e) => { cx = e.clientX; cy = e.clientY; cur.style.transform = 'translate(' + cx + 'px,' + cy + 'px)'; }, true);
    document.addEventListener('mousedown', () => {
      const r = document.createElement('div');
      r.style.cssText = 'position:fixed;z-index:2147483646;pointer-events:none;border-radius:50%;border:2px solid #38bdf8;left:0;top:0;transform:translate(' + cx + 'px,' + cy + 'px)';
      document.body.appendChild(r);
      r.animate([{ opacity: 0.9, width: '10px', height: '10px', marginLeft: '-5px', marginTop: '-5px' },
                 { opacity: 0, width: '40px', height: '40px', marginLeft: '-20px', marginTop: '-20px' }], { duration: 420, easing: 'ease-out' });
      setTimeout(() => r.remove(), 460);
    }, true);

    // ---- optional API-call log panel (top-right) ----
    const panel = document.createElement('div');
    panel.id = '__apilog';
    panel.style.cssText = ['position:fixed', 'top:14px', 'right:14px', 'width:432px', 'z-index:2147483647',
      'background:rgba(9,12,18,0.95)', 'border:1px solid #2b3a4f', 'border-radius:10px', 'overflow:hidden',
      'font-family:ui-monospace,Menlo,monospace', 'box-shadow:0 8px 30px rgba(0,0,0,0.5)', 'display:none'].join(';');
    panel.innerHTML = '<div style="padding:9px 12px;background:#12203a;color:#8fd0ff;font-size:12px;font-weight:700;border-bottom:1px solid #2b3a4f">API CALLS → BACKEND</div><div id="__apirows" style="padding:6px 8px;display:flex;flex-direction:column;gap:5px;max-height:74vh;overflow:auto"></div>';
    document.body.appendChild(panel);
    const addRow = (m, p, s, ms) => {
      panel.style.display = 'block';
      const ok = s >= 200 && s < 300, color = ok ? '#4ade80' : (s ? '#f87171' : '#fbbf24');
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:8px;font-size:11.5px;color:#cdd9e6;background:rgba(255,255,255,0.02);border-radius:6px;padding:5px 7px';
      row.innerHTML = '<span style="color:#7aa2c8;font-weight:700;min-width:52px">' + m + '</span><span style="flex:1;color:#e6eef7;word-break:break-all">' + p + '</span><span style="color:' + color + ';font-weight:700;min-width:30px;text-align:right">' + (s || 'ERR') + '</span><span style="color:#6b7a8c;min-width:44px;text-align:right">' + ms + 'ms</span>';
      document.getElementById('__apirows').prepend(row);
    };
    const of = window.fetch;
    window.fetch = function (input, init) {
      const url = (typeof input === 'string') ? input : (input && input.url) || '';
      const method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
      const t0 = performance.now();
      const pr = of.apply(this, arguments);
      if (window.__logOn && url.indexOf(window.__logFilter) !== -1) {
        let path = url; try { path = new URL(url, location.origin).pathname; } catch (e) {}
        pr.then(r => addRow(method, path, r.status, Math.round(performance.now() - t0)))
          .catch(() => addRow(method, path, 0, Math.round(performance.now() - t0)));
      }
      return pr;
    };
  };
  boot();
})();
