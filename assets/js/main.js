/* STC Oberland · Sportcenter Hahn — 3 kB Vanilla-JS, keine Abhängigkeiten. */
(function () {
  'use strict';
  document.documentElement.classList.remove('no-js');

  /* ---- Mobil-Navigation ---- */
  var burger = document.querySelector('.burger');
  var mobnav = document.getElementById('mobnav');
  if (burger && mobnav) {
    burger.addEventListener('click', function () {
      var open = mobnav.classList.toggle('open');
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    mobnav.addEventListener('click', function (e) {
      if (e.target.closest('a')) {
        mobnav.classList.remove('open');
        burger.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ---- Scroll-Reveals ---- */
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var rv = document.querySelectorAll('.rv');
  if (reduce || !('IntersectionObserver' in window)) {
    for (var i = 0; i < rv.length; i++) rv[i].classList.add('in');
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.06 });
    for (var j = 0; j < rv.length; j++) {
      rv[j].style.transitionDelay = Math.min(j % 5, 4) * 65 + 'ms';
      io.observe(rv[j]);
    }
  }

  /* ---- FAQ: immer nur eine Antwort offen ---- */
  var faqs = document.querySelectorAll('.faq details');
  faqs.forEach(function (d) {
    d.addEventListener('toggle', function () {
      if (d.open) faqs.forEach(function (o) { if (o !== d) o.open = false; });
    });
  });

  /* ---- Klick-zum-Laden: Buchungssystem und Videos ----
     Vor dem Klick verlässt kein einziger Request die Seite.
     Erst der bewusste Klick lädt den Drittanbieter (Art. 6 Abs. 1 lit. a DSGVO). */
  document.querySelectorAll('[data-embed]').forEach(function (box) {
    var btn = box.querySelector('[data-embed-start]');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var frame = document.createElement('iframe');
      frame.src = box.getAttribute('data-embed');
      frame.title = box.getAttribute('data-embed-title') || 'Eingebetteter Inhalt';
      frame.loading = 'lazy';
      frame.setAttribute('allow', 'accelerometer; encrypted-media; picture-in-picture; fullscreen');
      frame.setAttribute('allowfullscreen', '');
      frame.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
      box.innerHTML = '';
      box.appendChild(frame);
    });
  });

  /* ---- Jahr im Footer ---- */
  var y = document.getElementById('jahr');
  if (y) y.textContent = new Date().getFullYear();
})();

/* ============================================================================
   Tennisbälle im Hero der Startseite.

   Verhalten: Sie liegen still herum. Kommt der Zeiger nah, bekommen sie einen
   Stoß und rollen mit Reibung aus, stoßen sich gegenseitig an und prallen von
   den Rändern ab. Sobald alles ruht, wird die Animationsschleife beendet —
   im Leerlauf kostet das Ganze exakt nichts.

   Läuft nur, wenn es einen Hero mit data-balls gibt und der Besucher keine
   reduzierte Bewegung eingestellt hat.
   ========================================================================== */
(function () {
  'use strict';
  var hero = document.querySelector('[data-balls]');
  if (!hero || !window.requestAnimationFrame) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var TAU = Math.PI * 2,
      FILZ = '#C8D95B',           // Tennisball, gedämpft
      NAHT = '#F2F3EF',
      REIBUNG = 0.945,            // Ausrollen
      ABPRALL = 0.55,             // Energieverlust an der Bande
      REICHWEITE = 95;            // ab hier reagiert ein Ball auf den Zeiger

  var cv = document.createElement('canvas');
  cv.className = 'hero__balls';
  cv.setAttribute('aria-hidden', 'true');
  // Lage zusätzlich inline setzen. Ohne Positionierung wäre das Canvas ein
  // normales Element im Textfluss und würde den Heroinhalt nach unten drücken.
  // Inline heißt: das funktioniert auch dann, wenn das Stylesheet fehlt,
  // veraltet im Cache liegt oder von einer Erweiterung blockiert wird.
  cv.style.position = 'absolute';
  cv.style.top = '0';
  cv.style.left = '0';
  cv.style.zIndex = '2';
  cv.style.display = 'block';
  cv.style.pointerEvents = 'none';
  hero.insertBefore(cv, hero.firstChild);
  var ctx = cv.getContext('2d');

  var W = 0, H = 0, dpr = 1, baelle = [], raf = null, sichtbar = true,
      zx = -9999, zy = -9999;

  function messen() {
    var altW = W, altH = H;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = hero.clientWidth; H = hero.clientHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (altW && altH && baelle.length) {          // Positionen mitskalieren
      for (var i = 0; i < baelle.length; i++) {
        baelle[i].x *= W / altW; baelle[i].y *= H / altH;
      }
    }
  }

  function verteilen() {
    // Startlage bewusst in der unteren Hälfte: dort steht kein Fließtext,
    // der durch einen hellen Ball dahinter an Kontrast verlieren könnte.
    var n = W < 700 ? 5 : (W < 1100 ? 7 : 9);
    baelle = [];
    for (var i = 0; i < n; i++) {
      var r = 9 + Math.random() * 7;
      baelle.push({
        x: r + Math.random() * (W - 2 * r),
        y: H * 0.48 + Math.random() * (H * 0.44 - r),
        vx: 0, vy: 0, r: r, w: Math.random() * TAU
      });
    }
  }

  function anstossen(kraft) {
    for (var i = 0; i < baelle.length; i++) {
      var b = baelle[i], dx = b.x - zx, dy = b.y - zy;
      var d = Math.sqrt(dx * dx + dy * dy);
      var grenze = REICHWEITE + b.r;
      if (d < grenze && d > 0.01) {
        var f = (1 - d / grenze) * kraft * (14 / b.r);   // kleine Bälle fliegen weiter
        b.vx += dx / d * f; b.vy += dy / d * f;
      }
    }
  }

  function schritt() {
    var i, j, b, bewegt = false;

    for (i = 0; i < baelle.length; i++) {
      b = baelle[i];
      b.x += b.vx; b.y += b.vy;
      b.vx *= REIBUNG; b.vy *= REIBUNG;
      b.w += b.vx / b.r;                                  // Rollen statt Rutschen

      if (b.x < b.r)      { b.x = b.r;      b.vx = -b.vx * ABPRALL; }
      if (b.x > W - b.r)  { b.x = W - b.r;  b.vx = -b.vx * ABPRALL; }
      if (b.y < b.r)      { b.y = b.r;      b.vy = -b.vy * ABPRALL; }
      if (b.y > H - b.r)  { b.y = H - b.r;  b.vy = -b.vy * ABPRALL; }

      if (Math.abs(b.vx) < 0.02) b.vx = 0;
      if (Math.abs(b.vy) < 0.02) b.vy = 0;
      if (b.vx || b.vy) bewegt = true;
    }

    for (i = 0; i < baelle.length; i++) {                 // Bälle untereinander
      for (j = i + 1; j < baelle.length; j++) {
        var a = baelle[i], c = baelle[j];
        var dx = c.x - a.x, dy = c.y - a.y;
        var d = Math.sqrt(dx * dx + dy * dy), min = a.r + c.r;
        if (d < min && d > 0.01) {
          var nx = dx / d, ny = dy / d, ueber = (min - d) / 2;
          a.x -= nx * ueber; a.y -= ny * ueber;
          c.x += nx * ueber; c.y += ny * ueber;
          var p = (a.vx - c.vx) * nx + (a.vy - c.vy) * ny;
          if (p > 0) {
            a.vx -= p * nx * 0.5; a.vy -= p * ny * 0.5;
            c.vx += p * nx * 0.5; c.vy += p * ny * 0.5;
            bewegt = true;
          }
        }
      }
    }

    zeichnen();
    raf = (bewegt && sichtbar) ? requestAnimationFrame(schritt) : null;
  }

  function zeichnen() {
    ctx.clearRect(0, 0, W, H);
    for (var i = 0; i < baelle.length; i++) {
      var b = baelle[i];
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.w);
      ctx.beginPath();
      ctx.arc(0, 0, b.r, 0, TAU);
      ctx.globalAlpha = 0.32;
      ctx.fillStyle = FILZ;
      ctx.fill();
      ctx.clip();                                   // Nähte enden am Ballrand
      ctx.globalAlpha = 0.42;
      ctx.strokeStyle = NAHT;
      ctx.lineWidth = Math.max(1, b.r * 0.14);
      ctx.beginPath(); ctx.arc(-b.r * 1.05, 0, b.r * 1.12, -0.95, 0.95); ctx.stroke();
      ctx.beginPath(); ctx.arc(b.r * 1.05, 0, b.r * 1.12, Math.PI - 0.95, Math.PI + 0.95); ctx.stroke();
      ctx.restore();
    }
  }

  function starten() { if (!raf && sichtbar) raf = requestAnimationFrame(schritt); }

  function zeiger(e, kraft) {
    var r = hero.getBoundingClientRect();
    zx = e.clientX - r.left; zy = e.clientY - r.top;
    anstossen(kraft); starten();
  }

  hero.addEventListener('pointermove', function (e) { zeiger(e, 2.4); }, { passive: true });
  hero.addEventListener('pointerdown', function (e) { zeiger(e, 6.5); }, { passive: true });
  hero.addEventListener('pointerleave', function () { zx = zy = -9999; });

  var timer;
  window.addEventListener('resize', function () {
    clearTimeout(timer);
    timer = setTimeout(function () { messen(); zeichnen(); }, 150);
  });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (eintraege) {
      sichtbar = eintraege[0].isIntersecting;
      if (sichtbar) starten();
    }, { threshold: 0 }).observe(hero);
  }

  messen(); verteilen(); zeichnen();
})();

/* ============================================================================
   Wall Rally — Nachladen erst auf Klick.

   Auf der Seite steht nur das Markup. Die rund 3 kB Spiellogik werden erst
   geholt, wenn jemand wirklich spielen will. Wer die Seite nur überfliegt,
   lädt kein einziges Byte davon.
   ========================================================================== */
(function () {
  'use strict';
  var box = document.querySelector('[data-game]');
  if (!box) return;
  var start = box.querySelector('[data-game-start]');
  if (!start) return;

  start.addEventListener('click', function () {
    var beschriftung = start.textContent;
    start.disabled = true;
    start.textContent = 'Lädt …';
    var s = document.createElement('script');
    s.src = box.getAttribute('data-game');
    s.onload = function () {
      if (window.wallRally) { window.wallRally(); }
      else { start.disabled = false; start.textContent = beschriftung; }
    };
    s.onerror = function () {
      start.disabled = false;
      start.textContent = 'Nochmal versuchen';
    };
    document.body.appendChild(s);
  }, { once: true });
})();

/* ============================================================================
   Buchungsfenster als Overlay.

   Jeder Knopf mit data-book öffnet das Eversports-Widget in einem <dialog>.
   Der iframe entsteht erst beim Öffnen und wird beim Schließen wieder entfernt
   — vor dem Klick geht kein Request an Eversports, danach läuft nichts weiter.

   <dialog> bringt Fokusfalle und Escape von Haus aus mit. Browser ohne
   showModal() bekommen einen neuen Tab.
   ========================================================================== */
(function () {
  'use strict';
  var knoepfe = document.querySelectorAll('[data-book]');
  if (!knoepfe.length) return;

  var dlg = null, ausloeser = null;

  function bauen() {
    dlg = document.createElement('dialog');
    dlg.className = 'bookdlg';
    dlg.setAttribute('aria-label', 'Platzbuchung');
    dlg.innerHTML =
      '<div class="bookdlg__bar">' +
        '<span class="bookdlg__title"></span>' +
        '<button type="button" class="bookdlg__close" aria-label="Buchungsfenster schließen">' +
          '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
          'stroke-width="2.2" stroke-linecap="round" aria-hidden="true">' +
          '<path d="M6 6l12 12M18 6L6 18"/></svg>' +
        '</button>' +
      '</div><div class="bookdlg__body"></div>';
    document.body.appendChild(dlg);
    dlg.querySelector('.bookdlg__close').addEventListener('click', function () { dlg.close(); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener('close', function () {
      dlg.querySelector('.bookdlg__body').innerHTML = '';   // iframe abräumen
      if (ausloeser) ausloeser.focus();
    });
  }

  Array.prototype.forEach.call(knoepfe, function (b) {
    b.addEventListener('click', function () {
      var url = b.getAttribute('data-book');
      var titel = b.getAttribute('data-book-title') || 'Platz buchen';
      if (typeof HTMLDialogElement === 'undefined' ||
          typeof document.createElement('dialog').showModal !== 'function') {
        window.open(url, '_blank', 'noopener');
        return;
      }
      if (!dlg) bauen();
      ausloeser = b;
      dlg.querySelector('.bookdlg__title').textContent = titel;
      var f = document.createElement('iframe');
      f.src = url;
      f.title = titel;
      f.setAttribute('allow', 'payment; fullscreen; clipboard-write');
      f.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
      dlg.querySelector('.bookdlg__body').appendChild(f);
      dlg.showModal();
    });
  });
})();

/* ============================================================================
   Instagram-Feed (Behold) — Nachladen erst auf Klick.

   Behold liefert ein Modulskript von w.behold.so. Bis zum Klick verlässt kein
   Request die Seite; danach wird das Skript einmalig eingehängt und rüstet das
   <behold-widget>-Element nach.

   Soll der Feed sofort laden, in build.py INSTA_FEED_SOFORT auf True setzen —
   dann entsteht dieses Markup gar nicht erst.
   ========================================================================== */
(function () {
  'use strict';
  var box = document.querySelector('[data-insta]');
  if (!box) return;
  var start = box.querySelector('[data-insta-start]');
  if (!start) return;

  start.addEventListener('click', function () {
    var feed = box.getAttribute('data-insta');
    if (!/^[A-Za-z0-9_-]+$/.test(feed)) return;      // nur erwartbare Kennungen
    start.disabled = true;
    start.textContent = 'Lädt …';

    var widget = document.createElement('behold-widget');
    widget.setAttribute('feed-id', feed);
    box.classList.remove('instafeed--gate');
    box.innerHTML = '';
    box.appendChild(widget);

    if (!window.__bhldScript) {
      window.__bhldScript = true;
      var s = document.createElement('script');
      s.type = 'module';
      s.src = 'https://w.behold.so/widget.js';
      document.head.appendChild(s);
    }
  }, { once: true });
})();

/* ============================================================================
   Hell/Dunkel umschalten.

   Das Thema selbst setzt schon das Inline-Skript im <head>, bevor gerendert
   wird. Hier hängt nur die Bedienung dran: Klick wechselt, die Wahl bleibt im
   localStorage. Wer noch nie geklickt hat, folgt weiterhin der Systemeinstellung.
   ========================================================================== */
(function () {
  'use strict';
  var knoepfe = document.querySelectorAll('[data-theme-toggle]');
  if (!knoepfe.length) return;
  var wurzel = document.documentElement;

  function melden() {
    var dunkel = wurzel.getAttribute('data-theme') === 'dark';
    Array.prototype.forEach.call(knoepfe, function (b) {
      b.setAttribute('aria-pressed', dunkel ? 'true' : 'false');
    });
  }

  Array.prototype.forEach.call(knoepfe, function (b) {
    b.addEventListener('click', function () {
      var neu = wurzel.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      wurzel.setAttribute('data-theme', neu);
      try { window.localStorage.setItem('theme', neu); } catch (e) { /* Privatmodus */ }
      melden();
    });
  });

  // Systemwechsel weiterreichen, solange niemand selbst gewählt hat.
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var reagieren = function (e) {
      var gewaehlt = null;
      try { gewaehlt = window.localStorage.getItem('theme'); } catch (err) {}
      if (gewaehlt === 'dark' || gewaehlt === 'light') return;
      wurzel.setAttribute('data-theme', e.matches ? 'dark' : 'light');
      melden();
    };
    if (mq.addEventListener) mq.addEventListener('change', reagieren);
    else if (mq.addListener) mq.addListener(reagieren);
  }

  melden();
})();
