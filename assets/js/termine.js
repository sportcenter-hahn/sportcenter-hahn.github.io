/* ============================================================================
   Saison-Kalender.

   Inhalt kommt aus assets/data/termine.json — dort pflegen, nicht hier.
   Titel und Notiz duerfen entweder ein Text sein (gilt fuer alle Sprachen)
   oder ein Objekt {de, en, es}; fehlt eine Sprache, wird Deutsch genommen.
   ========================================================================== */
(function () {
  'use strict';
  var wurzel = document.querySelector('[data-termine]');
  if (!wurzel) return;

  var lang = (document.documentElement.lang || 'de').slice(0, 2);
  var LOC  = lang === 'en' ? 'en-GB' : (lang === 'es' ? 'es-ES' : 'de-DE');
  var T = {
    de: { kat:{turnier:'Turnier',liga:'Liga',event:'Event',jugend:'Jugend',senioren:'Senioren',special:'Special'},
          ort:{geretsried:'Geretsried',wolfratshausen:'Wolfratshausen',beide:'Beide Anlagen'},
          sport:{tennis:'Tennis',padel:'Padel',pickleball:'Pickleball',alle:'Alle Sportarten'},
          leer:'Für diese Auswahl steht nichts an.', laden:'Termine werden geladen …',
          fehler:'Die Termine lassen sich gerade nicht laden.', bis:'bis' },
    en: { kat:{turnier:'Tournament',liga:'League',event:'Event',jugend:'Juniors',senioren:'Seniors',special:'Special'},
          ort:{geretsried:'Geretsried',wolfratshausen:'Wolfratshausen',beide:'Both venues'},
          sport:{tennis:'Tennis',padel:'Padel',pickleball:'Pickleball',alle:'All sports'},
          leer:'Nothing coming up for this selection.', laden:'Loading dates …',
          fehler:'The calendar cannot be loaded right now.', bis:'to' },
    es: { kat:{turnier:'Torneo',liga:'Liga',event:'Evento',jugend:'Juvenil',senioren:'Séniors',special:'Especial'},
          ort:{geretsried:'Geretsried',wolfratshausen:'Wolfratshausen',beide:'Ambas sedes'},
          sport:{tennis:'Tenis',padel:'Pádel',pickleball:'Pickleball',alle:'Todos los deportes'},
          leer:'No hay nada para esta selección.', laden:'Cargando fechas…',
          fehler:'El calendario no se puede cargar ahora.', bis:'al' }
  }[lang] || null;
  if (!T) T = { kat:{}, ort:{}, sport:{}, leer:'', laden:'', fehler:'', bis:'–' };

  var liste  = wurzel.querySelector('[data-t-liste]');
  var status = wurzel.querySelector('[data-t-status]');
  var fSport = wurzel.querySelector('[data-t-sport]');
  var fMonat = wurzel.querySelector('[data-t-monat]');
  var fKat   = wurzel.querySelector('[data-t-kat]');
  var termine = [];

  function txt(w) {
    if (w && typeof w === 'object') return w[lang] || w.de || '';
    return w || '';
  }
  function sicher(x) {
    return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]; });
  }
  function datum(iso) {
    return new Date(iso + 'T12:00:00').toLocaleDateString(LOC, { day:'numeric', month:'short' });
  }
  function monatName(iso) {
    return new Date(iso + 'T12:00:00').toLocaleDateString(LOC, { month:'long', year:'numeric' });
  }

  function monateFuellen() {
    var gesehen = {};
    termine.forEach(function (e) {
      var k = e.von.slice(0, 7);
      if (!gesehen[k]) { gesehen[k] = true;
        var o = document.createElement('option');
        o.value = k; o.textContent = monatName(e.von + '-01'.slice(0,0) + '-01');
        o.textContent = monatName(k + '-01');
        fMonat.appendChild(o);
      }
    });
  }

  function zeichnen() {
    var s = fSport.value, m = fMonat.value, k = fKat.value;
    var heute = new Date().toISOString().slice(0, 10);
    var sicht = termine.filter(function (e) {
      if ((e.bis || e.von) < heute) return false;            // Vergangenes ausblenden
      if (s && e.sport !== s && e.sport !== 'alle') return false;
      if (k && e.kategorie !== k) return false;
      if (m && e.von.slice(0, 7) !== m) return false;
      return true;
    });
    sicht.sort(function (a, b) { return a.von < b.von ? -1 : 1; });

    if (!sicht.length) { liste.innerHTML = '<li class="tm__leer">' + sicher(T.leer) + '</li>'; return; }

    var html = '', letzterMonat = '';
    sicht.forEach(function (e) {
      var mon = e.von.slice(0, 7);
      if (mon !== letzterMonat) {
        letzterMonat = mon;
        html += '<li class="tm__monat">' + sicher(monatName(mon + '-01')) + '</li>';
      }
      var sportKlasse = e.sport === 'padel' || e.sport === 'pickleball' ? 'padel'
                      : (e.sport === 'tennis' ? 'tennis' : 'kombi');
      html += '<li class="tm__eintrag" data-sport="' + sportKlasse + '">' +
        '<span class="tm__datum">' + sicher(datum(e.von)) +
          (e.bis && e.bis !== e.von ? ' <small>' + sicher(T.bis) + ' ' + sicher(datum(e.bis)) + '</small>' : '') +
        '</span>' +
        '<span class="tm__inhalt">' +
          '<span class="tm__kat">' + sicher(T.kat[e.kategorie] || e.kategorie) + '</span>' +
          '<b class="tm__titel">' + sicher(txt(e.titel)) + '</b>' +
          '<span class="tm__meta">' + sicher(T.sport[e.sport] || e.sport) + ' · ' +
            sicher(T.ort[e.ort] || e.ort) + '</span>' +
          (e.notiz ? '<span class="tm__notiz">' + sicher(txt(e.notiz)) + '</span>' : '') +
        '</span></li>';
    });
    liste.innerHTML = html;
  }

  status.textContent = T.laden;
  fetch(wurzel.getAttribute('data-quelle'))
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (d) {
      termine = d.termine || [];
      status.hidden = true;
      monateFuellen();
      [fSport, fMonat, fKat].forEach(function (f) { f.addEventListener('change', zeichnen); });
      zeichnen();
    })
    .catch(function () { status.textContent = T.fehler; });
})();
