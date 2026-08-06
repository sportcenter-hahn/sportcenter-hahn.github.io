/* ============================================================================
   Wetter am Platz — Open-Meteo.

   Kein Schlüssel, kein Konto, keine Cookies: ein reiner API-Aufruf gegen
   api.open-meteo.com. Geladen wird erst, wenn das Widget in den sichtbaren
   Bereich kommt; die Antwort liegt 45 Minuten im Zwischenspeicher, damit ein
   Seitenwechsel keinen neuen Aufruf auslöst.

   Beschriftungen richten sich nach <html lang="…">, damit die englische und
   spanische Fassung nicht plötzlich Deutsch anzeigen.

   Datenquelle: Open-Meteo, CC BY 4.0 — die Quellenangabe steht im Markup.
   ========================================================================== */
(function () {
  'use strict';

  var boxen = document.querySelectorAll('[data-wetter]');
  if (!boxen.length) return;

  /* Endpunkt. Der freie Zugang von Open-Meteo gilt für nicht-gewerbliche
     Nutzung. Für den gewerblichen Betrieb bietet Open-Meteo einen kosten-
     pflichtigen Zugang an — dann hier umstellen und den Schlüssel eintragen:
       var API    = 'https://customer-api.open-meteo.com/v1/forecast';
       var APIKEY = 'DEIN_SCHLUESSEL';
     Siehe README, Abschnitt 19. */
  var API = 'https://api.open-meteo.com/v1/forecast';
  var APIKEY = '';

  var HALTBAR = 45 * 60 * 1000;
  var speicher = {};                       // Rückfallebene ohne localStorage

  var TEXTE = {
    de: {
      regen: 'Regen', wind: 'Wind', auf: 'Sonnenaufgang', unter: 'Sonnenuntergang',
      heute: 'Heute', morgen: 'Morgen', stand: 'Stand', gefuehlt: 'gefühlt',
      fehler: 'Die Wetterdaten sind gerade nicht abrufbar. Das Buchen funktioniert trotzdem.',
      lage: {
        0:'Klar', 1:'Überwiegend klar', 2:'Teils bewölkt', 3:'Bedeckt',
        45:'Nebel', 51:'Niesel', 56:'Gefrierender Niesel', 61:'Regen',
        66:'Gefrierender Regen', 71:'Schnee', 77:'Schneegriesel',
        80:'Regenschauer', 85:'Schneeschauer', 95:'Gewitter', 96:'Gewitter mit Hagel'
      }
    },
    en: {
      regen: 'Rain', wind: 'Wind', auf: 'Sunrise', unter: 'Sunset',
      heute: 'Today', morgen: 'Tomorrow', stand: 'Updated', gefuehlt: 'feels like',
      fehler: 'Weather data is unavailable right now. Booking still works.',
      lage: {
        0:'Clear', 1:'Mostly clear', 2:'Partly cloudy', 3:'Overcast',
        45:'Fog', 51:'Drizzle', 56:'Freezing drizzle', 61:'Rain',
        66:'Freezing rain', 71:'Snow', 77:'Snow grains',
        80:'Rain showers', 85:'Snow showers', 95:'Thunderstorm', 96:'Thunderstorm with hail'
      }
    },
    es: {
      regen: 'Lluvia', wind: 'Viento', auf: 'Amanecer', unter: 'Atardecer',
      heute: 'Hoy', morgen: 'Mañana', stand: 'Actualizado', gefuehlt: 'sensación',
      fehler: 'Los datos meteorológicos no están disponibles ahora. Reservar sigue funcionando.',
      lage: {
        0:'Despejado', 1:'Poco nuboso', 2:'Parcialmente nublado', 3:'Cubierto',
        45:'Niebla', 51:'Llovizna', 56:'Llovizna helada', 61:'Lluvia',
        66:'Lluvia helada', 71:'Nieve', 77:'Cinarra',
        80:'Chubascos', 85:'Chubascos de nieve', 95:'Tormenta', 96:'Tormenta con granizo'
      }
    }
  };

  var lang = (document.documentElement.lang || 'de').slice(0, 2);
  var T = TEXTE[lang] || TEXTE.de;
  var LOC = lang === 'en' ? 'en-GB' : (lang === 'es' ? 'es-ES' : 'de-DE');

  /* WMO-Code auf Gruppe abbilden — die Gruppe liefert Text und Symbol. */
  function gruppe(code) {
    if (code === 0) return 0;
    if (code === 1) return 1;
    if (code === 2) return 2;
    if (code === 3) return 3;
    if (code === 45 || code === 48) return 45;
    if (code >= 51 && code <= 55) return 51;
    if (code === 56 || code === 57) return 56;
    if (code >= 61 && code <= 65) return 61;
    if (code === 66 || code === 67) return 66;
    if (code >= 71 && code <= 75) return 71;
    if (code === 77) return 77;
    if (code >= 80 && code <= 82) return 80;
    if (code === 85 || code === 86) return 85;
    if (code === 95) return 95;
    if (code >= 96) return 96;
    return 3;
  }

  var SONNE  = '<circle cx="12" cy="12" r="4.6"/><path d="M12 2v2.4M12 19.6V22M2 12h2.4M19.6 12H22' +
               'M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M19.1 4.9l-1.7 1.7M6.6 17.4l-1.7 1.7"/>';
  var WOLKE  = '<path d="M7.2 19h9.9a3.9 3.9 0 0 0 .3-7.8 5.6 5.6 0 0 0-10.7-1.2A4.5 4.5 0 0 0 7.2 19z"/>';
  var HALB   = '<circle cx="8.4" cy="8" r="3.3"/><path d="M8.4 1.6v1.6M2 8h1.6M3.9 3.5l1.1 1.1' +
               'M12.9 3.5l-1.1 1.1"/><path d="M10 20.6h7.4a3.3 3.3 0 0 0 .3-6.6 4.8 4.8 0 0 0-9.1-1A3.8 3.8 0 0 0 10 20.6z"/>';

  function symbol(g, klasse) {
    var inhalt;
    if (g === 0)       inhalt = SONNE;
    else if (g === 1 || g === 2) inhalt = HALB;
    else if (g === 3)  inhalt = WOLKE;
    else if (g === 45) inhalt = WOLKE + '<path d="M4 21h9M7 23h10"/>';
    else if (g === 51 || g === 56) inhalt = WOLKE + '<path d="M9.5 21v1.4M14 21v1.4"/>';
    else if (g === 61 || g === 66 || g === 80) inhalt = WOLKE + '<path d="M9 20.6l-1 2.6M13 20.6l-1 2.6M17 20.6l-1 2.6"/>';
    else if (g === 71 || g === 77 || g === 85) inhalt = WOLKE + '<path d="M9 22h.01M13 22h.01M17 22h.01M11 23.4h.01M15 23.4h.01"/>';
    else if (g === 95 || g === 96) inhalt = WOLKE + '<path d="M13.4 20l-2.6 2.4h2.6L11.4 25"/>';
    else inhalt = WOLKE;
    return '<svg class="' + klasse + '" width="24" height="24" viewBox="0 0 24 26" fill="none" ' +
           'stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" ' +
           'aria-hidden="true">' + inhalt + '</svg>';
  }

  function lesen(k) {
    var o = speicher[k];
    if (!o) {
      try { var r = window.localStorage.getItem(k); if (r) o = JSON.parse(r); } catch (e) { /* egal */ }
    }
    return (o && Date.now() - o.t < HALTBAR) ? o.d : null;
  }

  function schreiben(k, d) {
    var o = { t: Date.now(), d: d };
    speicher[k] = o;
    try { window.localStorage.setItem(k, JSON.stringify(o)); } catch (e) { /* Privatmodus */ }
  }

  function holen(url) {
    var ctrl = window.AbortController ? new AbortController() : null;
    var frist = ctrl ? setTimeout(function () { ctrl.abort(); }, 9000) : null;
    return fetch(url, ctrl ? { signal: ctrl.signal } : undefined).then(function (r) {
      if (frist) clearTimeout(frist);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function uhr(iso) { return iso ? iso.slice(11, 16) : '–'; }   // Zeit gilt am Platz, nicht beim Besucher

  function tagName(datum, index) {
    if (index === 0) return T.heute;
    if (index === 1) return T.morgen;
    // Mittag statt Mitternacht, damit die Zeitzone den Wochentag nicht verschiebt
    return new Date(datum + 'T12:00:00').toLocaleDateString(LOC, { weekday: 'short' });
  }

  function zeichnen(box, d) {
    var g = gruppe(d.current.weather_code);
    var stunde = d.current.time.slice(0, 13) + ':00';
    var i = d.hourly.time.indexOf(stunde);
    var regen = i >= 0 ? d.hourly.precipitation_probability[i] : d.daily.precipitation_probability_max[0];

    var tage = '';
    for (var n = 0; n < d.daily.time.length; n++) {
      tage += '<li class="wx__day">' +
        '<span class="wx__dayname">' + tagName(d.daily.time[n], n) + '</span>' +
        symbol(gruppe(d.daily.weather_code[n]), 'wx__dayicon') +
        '<span class="wx__daymax">' + Math.round(d.daily.temperature_2m_max[n]) + '°</span>' +
        '<span class="wx__daymin">' + Math.round(d.daily.temperature_2m_min[n]) + '°</span>' +
        '<span class="wx__dayrain">' + Math.round(d.daily.precipitation_probability_max[n] || 0) + '%</span>' +
        '</li>';
    }

    box.querySelector('.wx__now').innerHTML =
      '<span class="wx__icon">' + symbol(g, 'wx__iconsvg') + '</span>' +
      '<span class="wx__temp">' + Math.round(d.current.temperature_2m) + '°</span>' +
      '<span class="wx__lage">' + (T.lage[g] || '') + '</span>' +
      '<span class="wx__zahlen">' +
        '<b>' + Math.round(regen || 0) + ' %</b><small>' + T.regen + '</small>' +
        '<b>' + Math.round(d.current.wind_speed_10m) + ' km/h</b><small>' + T.wind + '</small>' +
      '</span>';

    box.querySelector('.wx__sun').innerHTML =
      ['0', '1'].map(function (k) {
        var idx = Number(k);
        return '<li><span class="wx__sunday">' + (idx ? T.morgen : T.heute) + '</span>' +
               '<span>&#9650; ' + uhr(d.daily.sunrise[idx]) + '</span>' +
               '<span>&#9660; ' + uhr(d.daily.sunset[idx]) + '</span></li>';
      }).join('');

    box.querySelector('.wx__days').innerHTML = tage;
    box.querySelector('.wx__stand').textContent = T.stand + ' ' + uhr(d.current.time);
    box.querySelector('.wx__laden').hidden = true;
    box.querySelector('.wx__body').hidden = false;
  }

  function fehler(box) {
    box.querySelector('.wx__laden').hidden = true;
    var f = box.querySelector('.wx__fehler');
    f.textContent = T.fehler;
    f.hidden = false;
  }

  function laden(box) {
    var lat = box.getAttribute('data-lat'), lon = box.getAttribute('data-lon');
    if (!/^-?\d+(\.\d+)?$/.test(lat) || !/^-?\d+(\.\d+)?$/.test(lon)) return fehler(box);

    var url = API + '?latitude=' + lat + '&longitude=' + lon +
      '&current=temperature_2m,weather_code,wind_speed_10m' +
      '&hourly=precipitation_probability' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset' +
      '&timezone=Europe%2FBerlin&forecast_days=7' +
      (APIKEY ? '&apikey=' + encodeURIComponent(APIKEY) : '');

    var vorrat = lesen('wx:' + lat + ',' + lon);
    if (vorrat) { try { return zeichnen(box, vorrat); } catch (e) { /* weiter zum Abruf */ } }

    if (!window.fetch) return fehler(box);
    holen(url).then(function (d) {
      schreiben('wx:' + lat + ',' + lon, d);
      zeichnen(box, d);
    }).catch(function () { fehler(box); });
  }

  Array.prototype.forEach.call(boxen, function (box) {
    if (!('IntersectionObserver' in window)) { laden(box); return; }
    var io = new IntersectionObserver(function (eintraege) {
      if (eintraege[0].isIntersecting) { io.disconnect(); laden(box); }
    }, { rootMargin: '250px' });
    io.observe(box);
  });
})();
