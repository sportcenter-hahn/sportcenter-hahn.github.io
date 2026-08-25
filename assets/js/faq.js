/* ============================================================================
   FAQ-Seite: Suche + Kategoriefilter über assets/data/faq.json
   ========================================================================== */
(function () {
  'use strict';

  var wurzel = document.querySelector('[data-faq]');
  if (!wurzel) return;

  var quelle = wurzel.getAttribute('data-quelle') || 'assets/data/faq.json';
  var suchfeld = wurzel.querySelector('[data-faq-suche]');
  var katNav = wurzel.querySelector('[data-faq-kats]');
  var liste = wurzel.querySelector('[data-faq-liste]');
  var status = wurzel.querySelector('[data-faq-status]');
  var leer = wurzel.querySelector('[data-faq-leer]');

  var daten = null;
  var aktivKat = '';
  var suchTimer = null;

  function sicher(x) {
    return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function norm(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss');
  }

  function plain(html) {
    var d = document.createElement('div');
    d.innerHTML = html || '';
    return d.textContent || d.innerText || '';
  }

  function katName(id) {
    if (!daten) return id;
    for (var i = 0; i < daten.categories.length; i++) {
      if (daten.categories[i].id === id) return daten.categories[i].name;
    }
    return id;
  }

  function treffer(item, q) {
    if (!q) return true;
    var hay = norm(item.question + ' ' + item._plain + ' ' + katName(item.category));
    var teile = q.split(/\s+/).filter(Boolean);
    for (var i = 0; i < teile.length; i++) {
      if (hay.indexOf(teile[i]) === -1) return false;
    }
    return true;
  }

  function filtrieren() {
    var q = norm(suchfeld ? suchfeld.value : '');
    var sichtbar = 0;
    var gruppen = liste.querySelectorAll('[data-faq-gruppe]');
    Array.prototype.forEach.call(gruppen, function (g) {
      var cid = g.getAttribute('data-faq-gruppe');
      var katOk = !aktivKat || aktivKat === cid;
      var items = g.querySelectorAll('[data-faq-item]');
      var gruppeSichtbar = 0;
      Array.prototype.forEach.call(items, function (el) {
        var id = el.getAttribute('data-faq-item');
        var item = daten._byId[id];
        var ok = katOk && item && treffer(item, q);
        el.hidden = !ok;
        if (ok) {
          gruppeSichtbar++;
          sichtbar++;
          if (q) el.open = true;
        } else if (q || aktivKat) {
          el.open = false;
        }
      });
      g.hidden = !katOk || gruppeSichtbar === 0;
    });

    if (status) {
      if (q || aktivKat) {
        status.textContent = sichtbar === 1
          ? '1 Treffer'
          : sichtbar + ' Treffer';
      } else {
        status.textContent = daten.items.length + ' Fragen in ' + daten.categories.length + ' Themen';
      }
    }
    if (leer) leer.hidden = sichtbar > 0;
  }

  function setKat(id) {
    aktivKat = id || '';
    var btns = katNav.querySelectorAll('[data-faq-kat]');
    Array.prototype.forEach.call(btns, function (b) {
      var on = (b.getAttribute('data-faq-kat') || '') === aktivKat;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    filtrieren();
  }

  function zeichnen() {
    var chips = '<button type="button" class="faqp__chip" data-faq-kat="" aria-pressed="true">Alle</button>';
    daten.categories.forEach(function (c) {
      var n = daten.items.filter(function (i) { return i.category === c.id; }).length;
      chips += '<button type="button" class="faqp__chip" data-faq-kat="' +
        sicher(c.id) + '" aria-pressed="false">' + sicher(c.name) +
        ' <span>' + n + '</span></button>';
    });
    katNav.innerHTML = chips;

    var html = '';
    daten.categories.forEach(function (c) {
      var gruppe = daten.items.filter(function (i) { return i.category === c.id; });
      if (!gruppe.length) return;
      html += '<section class="faqp__gruppe" data-faq-gruppe="' + sicher(c.id) + '" id="faq-' + sicher(c.id) + '">';
      html += '<h2 class="faqp__titel">' + sicher(c.name) + '</h2>';
      html += '<div class="faq">';
      gruppe.forEach(function (item) {
        html += '<details data-faq-item="' + sicher(item.id) + '" id="' + sicher(item.id) + '">' +
          '<summary>' + sicher(item.question) + '</summary>' +
          '<div class="ans">' + item.answer + '</div></details>';
      });
      html += '</div></section>';
    });
    liste.innerHTML = html;
    filtrieren();

    // Deep-link: #buchung-3 oder #faq-padel
    var hash = (location.hash || '').replace(/^#/, '');
    if (hash) {
      var ziel = document.getElementById(hash);
      if (ziel) {
        if (ziel.tagName === 'DETAILS') {
          ziel.open = true;
          var kat = ziel.getAttribute('data-faq-item');
          if (kat) {
            var item = daten._byId[kat];
            if (item) setKat(item.category);
          }
        }
        ziel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }

  katNav.addEventListener('click', function (e) {
    var b = e.target.closest('[data-faq-kat]');
    if (!b) return;
    setKat(b.getAttribute('data-faq-kat') || '');
  });

  if (suchfeld) {
    suchfeld.addEventListener('input', function () {
      clearTimeout(suchTimer);
      suchTimer = setTimeout(filtrieren, 120);
    });
    suchfeld.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        suchfeld.value = '';
        filtrieren();
      }
    });
  }

  function schemaEinbauen() {
    var graph = daten.items.map(function (item) {
      return {
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: plain(item.answer).replace(/\s+/g, ' ').trim()
        }
      };
    });
    var alt = document.querySelector('script[data-faq-schema]');
    if (alt) alt.remove();
    var s = document.createElement('script');
    s.type = 'application/ld+json';
    s.setAttribute('data-faq-schema', '1');
    s.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: graph
    });
    document.head.appendChild(s);
  }

  fetch(quelle, { credentials: 'same-origin' })
    .then(function (r) {
      if (!r.ok) throw new Error('FAQ laden fehlgeschlagen');
      return r.json();
    })
    .then(function (json) {
      daten = json;
      daten._byId = {};
      daten.items.forEach(function (item) {
        item._plain = plain(item.answer);
        daten._byId[item.id] = item;
      });
      zeichnen();
      schemaEinbauen();
    })
    .catch(function () {
      if (status) status.textContent = 'Die FAQ konnte gerade nicht geladen werden.';
      if (leer) {
        leer.hidden = false;
        leer.textContent = 'Bitte lade die Seite neu oder schreib uns an mail@sportcenter-hahn.de.';
      }
    });
})();
