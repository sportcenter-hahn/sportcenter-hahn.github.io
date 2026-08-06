/* ============================================================================
   Schläger-Finder.

   Drei Fragen, danach bis zu drei Empfehlungen. Die Schlaegerdaten stehen in
   assets/data/schlaeger.json — dort pflegen. Bewertet wird einfach: passendes
   Niveau zaehlt doppelt, passender Stil einfach. Das reicht fuer eine ehrliche
   Empfehlung und ist nachvollziehbar, wenn jemand die Datei anpasst.
   ========================================================================== */
(function () {
  'use strict';
  var wurzel = document.querySelector('[data-finder]');
  if (!wurzel) return;

  var lang = (document.documentElement.lang || 'de').slice(0, 2);
  var T = {
    de: { passt:'Passt zu deiner Auswahl', nichts:'Zu dieser Kombination führen wir gerade nichts Passendes. Komm im Shop vorbei — wir finden etwas.',
          fehler:'Die Schlägerdaten lassen sich gerade nicht laden.', nochmal:'Neu anfangen',
          fuer:'Für', ausprobieren:'Im Shop ausprobieren' },
    en: { passt:'Matches your answers', nichts:'We do not currently stock anything for that combination. Drop by the shop — we will find something.',
          fehler:'The racket data cannot be loaded right now.', nochmal:'Start again',
          fuer:'For', ausprobieren:'Try it in the shop' },
    es: { passt:'Encaja con tus respuestas', nichts:'Ahora mismo no tenemos nada para esa combinación. Pásate por la tienda y lo vemos.',
          fehler:'Los datos de las palas no se pueden cargar ahora.', nochmal:'Empezar de nuevo',
          fuer:'Para', ausprobieren:'Probarla en la tienda' }
  }[lang] || null;
  if (!T) T = { passt:'', nichts:'', fehler:'', nochmal:'', fuer:'', ausprobieren:'' };

  var form     = wurzel.querySelector('[data-finder-form]');
  var ergebnis = wurzel.querySelector('[data-finder-ergebnis]');
  var neu      = wurzel.querySelector('[data-finder-neu]');
  var daten    = null;

  function sicher(x) {
    return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]; });
  }

  function empfehlen(sport, niveau, stil) {
    return (daten.schlaeger || [])
      .filter(function (s) { return s.sport === sport; })
      .map(function (s) {
        var p = 0;
        if (s.niveau.indexOf(niveau) >= 0) p += 2;
        if (s.stil.indexOf(stil) >= 0) p += 1;
        return { s: s, p: p };
      })
      .filter(function (x) { return x.p > 0; })
      .sort(function (a, b) { return b.p - a.p; })
      .slice(0, 3)
      .map(function (x) { return x.s; });
  }

  function karte(s) {
    var bild = s.bild
      ? '<div class="fd__bild"><img src="' + sicher(s.bild) + '" alt="' + sicher(s.name) +
        '" width="360" height="360" loading="lazy"></div>'
      : '<div class="fd__bild fd__bild--leer" aria-hidden="true">' + sicher(s.name.replace('Head ', '')) + '</div>';
    return '<li class="fd__karte">' + bild +
      '<div class="fd__text">' +
        '<h3>' + sicher(s.name) + '</h3>' +
        '<p class="fd__kurz">' + sicher(s.kurz) + '</p>' +
        '<p class="fd__grund">' + sicher(s.begruendung) + '</p>' +
        '<p class="fd__preis">' + sicher(s.preis || '') + '</p>' +
        (s.link ? '<a class="txtlink" href="' + sicher(s.link) + '" rel="noopener">' +
                  sicher(T.ausprobieren) + '</a>' : '') +
      '</div></li>';
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var f = new FormData(form);
    var treffer = empfehlen(f.get('sport'), f.get('niveau'), f.get('stil'));
    ergebnis.innerHTML = treffer.length
      ? '<p class="fd__hut">' + sicher(T.passt) + '</p><ul class="fd__liste">' +
        treffer.map(karte).join('') + '</ul>'
      : '<p class="fd__hut">' + sicher(T.nichts) + '</p>';
    ergebnis.hidden = false;
    neu.hidden = false;
    ergebnis.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  neu.addEventListener('click', function () {
    form.reset(); ergebnis.hidden = true; neu.hidden = true;
    form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  fetch(wurzel.getAttribute('data-quelle'))
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (d) { daten = d; form.hidden = false; })
    .catch(function () {
      ergebnis.innerHTML = '<p class="fd__hut">' + sicher(T.fehler) + '</p>';
      ergebnis.hidden = false;
    });
})();
