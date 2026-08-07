/* ============================================================================
   Padel Match Roulette — Rad mit den Tagen des Monats.

   Aufbau, Logik von Darstellung getrennt:
     KAL   reine Datumsrechnung, fasst kein DOM an
     RAD   baut das SVG und rechnet Winkel, kennt keine Spieldaten
     spin  Animation; zielt auf einen VORHER feststehenden Index
     Rest  Laden, Liste, Zusage-Dialog, Realtime (unveraendert uebernommen)

   Zufall: Die Auswahl entsteht im Browser ueber crypto.getRandomValues.
   Das ist hier zulaessig, weil das Ergebnis keine Spielrelevanz im Sinne von
   Gewinn, Wettbewerb oder Punkten hat — es schlaegt einen Termin vor. Alles
   Verbindliche (genau vier Zusagen, keine Doppelanmeldung, kein abgelaufener
   Termin) erzwingt Postgres, siehe supabase/schema-padel.sql. Wer den Zufall
   im Browser manipuliert, bekommt nichts, was ein Klick in die Liste nicht
   auch gaebe.
   ========================================================================== */
(function () {
  'use strict';

  var wurzel = document.querySelector('[data-roulette]');
  if (!wurzel) return;

  var PLAETZE = 4;
  var ZONE    = 'Europe/Berlin';

  /* Ein Monat hat 28 bis 31 Felder, aber selten mehr als eine Handvoll offener
     Spiele. Bei freier Ziehung landete die Kugel fast immer auf einem leeren
     Tag. Deshalb zieht sie nur unter Tagen mit offenem Spiel; alle uebrigen
     Tage bleiben sichtbar, aber erkennbar nicht verfuegbar.
     Auf false setzen, um ueber alle Tage des Monats zu ziehen. */
  var NUR_SPIELTAGE = true;

  var URL_SB = wurzel.getAttribute('data-sb-url') || '';
  var KEY_SB = wurzel.getAttribute('data-sb-key') || '';
  var LIB    = wurzel.getAttribute('data-sb-lib');

  var lang = (document.documentElement.lang || 'de').slice(0, 2);
  var LOC  = lang === 'en' ? 'en-GB' : (lang === 'es' ? 'es-ES' : 'de-DE');

  var TEXTE = {
    de: {
      heute:'Heute', morgen:'Morgen', court:'Court', ort:'Geretsried',
      spieler:'{a} / {b} Spielern', dabei:'Ich bin dabei', raus:'Zusage zurückziehen',
      offen:'Noch Plätze frei', voll:'Voll — findet statt', vorbei:'Vorbei',
      fehltNoch:'Es fehlt noch {n}', fehltNochN:'Es fehlen noch {n}',
      leer:'Zurzeit sind keine Spiele eingetragen.',
      laden:'Spiele werden geladen …',
      fehler:'Die Spiele lassen sich gerade nicht laden. Platz buchen geht trotzdem.',
      unkonfiguriert:'Das Padel Match Roulette ist noch nicht eingerichtet.',
      wegDoppelt:'Unter diesem Vornamen liegt schon eine Zusage für dieses Spiel vor.',
      wegVoll:'Das Spiel ist inzwischen voll.', wegVorbei:'Der Termin ist bereits vorbei.',
      wegWeg:'Dieses Spiel gibt es nicht mehr.',
      wegAllgemein:'Das hat nicht geklappt. Bitte noch einmal versuchen.',
      okDabei:'Zugesagt. Wir sehen uns auf dem Court.',
      okVoll:'Zugesagt — und damit ist das Spiel voll. Es findet statt.',
      okRaus:'Zusage zurückgezogen.',
      spin:'Roulette starten', laeuft:'Die Kugel rollt …', nochmal:'Nochmal drehen',
      keineTage:'In diesem Monat ist kein Spiel offen. Wechsle den Monat oder schau in die Liste.',
      ergebnis:'Die Roulette hat den {d} ausgewählt.',
      keinSpiel:'Für diesen Tag ist aktuell kein Spiel hinterlegt.'
    },
    en: {
      heute:'Today', morgen:'Tomorrow', court:'Court', ort:'Geretsried',
      spieler:'{a} / {b} players', dabei:'Count me in', raus:'Withdraw',
      offen:'Places left', voll:'Full — going ahead', vorbei:'Past',
      fehltNoch:'{n} more needed', fehltNochN:'{n} more needed',
      leer:'No matches listed at the moment.',
      laden:'Loading matches …',
      fehler:'Matches cannot be loaded right now. Booking a court still works.',
      unkonfiguriert:'The Padel Match Roulette is not set up yet.',
      wegDoppelt:'There is already an entry under that first name for this match.',
      wegVoll:'That match has just filled up.', wegVorbei:'That date has already passed.',
      wegWeg:'That match no longer exists.',
      wegAllgemein:'That did not work. Please try again.',
      okDabei:'You are in. See you on court.',
      okVoll:'You are in — and that makes four. The match is going ahead.',
      okRaus:'Entry withdrawn.',
      spin:'Spin the wheel', laeuft:'The ball is rolling …', nochmal:'Spin again',
      keineTage:'No open match this month. Change month or check the list below.',
      ergebnis:'The wheel picked {d}.',
      keinSpiel:'No match is listed for that day.'
    },
    es: {
      heute:'Hoy', morgen:'Mañana', court:'Pista', ort:'Geretsried',
      spieler:'{a} / {b} jugadores', dabei:'Me apunto', raus:'Retirar mi apunte',
      offen:'Quedan plazas', voll:'Completo: se juega', vorbei:'Pasado',
      fehltNoch:'Falta {n}', fehltNochN:'Faltan {n}',
      leer:'De momento no hay partidos publicados.',
      laden:'Cargando partidos…',
      fehler:'Los partidos no se pueden cargar ahora. Reservar pista sigue funcionando.',
      unkonfiguriert:'El Padel Match Roulette aún no está configurado.',
      wegDoppelt:'Ya hay un apunte con ese nombre para este partido.',
      wegVoll:'El partido acaba de completarse.', wegVorbei:'La fecha ya ha pasado.',
      wegWeg:'Ese partido ya no existe.',
      wegAllgemein:'No ha funcionado. Inténtalo de nuevo.',
      okDabei:'Apuntado. Nos vemos en la pista.',
      okVoll:'Apuntado, y con eso ya sois cuatro. El partido se juega.',
      okRaus:'Apunte retirado.',
      spin:'Girar la ruleta', laeuft:'La bola está rodando…', nochmal:'Girar otra vez',
      keineTage:'Este mes no hay ningún partido abierto. Cambia de mes o mira la lista.',
      ergebnis:'La ruleta ha elegido el {d}.',
      keinSpiel:'No hay ningún partido para ese día.'
    }
  };
  var T = TEXTE[lang] || TEXTE.de;

  /* ==========================================================================
     KAL — Datumsrechnung, durchgehend in der Zeitzone der Anlage. Damit sieht
     ein Besucher aus Spanien denselben Tag wie einer aus Geretsried.
     ====================================================================== */
  var KAL = {
    tageImMonat: function (j, m) { return new Date(Date.UTC(j, m + 1, 0)).getUTCDate(); },
    iso: function (j, m, t) {
      return j + '-' + ('0' + (m + 1)).slice(-2) + '-' + ('0' + t).slice(-2);
    },
    schluessel: function (d) {
      return new Intl.DateTimeFormat('en-CA', { timeZone: ZONE }).format(d);
    },
    monatName: function (j, m) {
      return new Date(Date.UTC(j, m, 15)).toLocaleDateString(LOC,
        { timeZone: 'UTC', month: 'long', year: 'numeric' });
    },
    langesDatum: function (isoTag) {
      var t = isoTag.split('-');
      return new Date(Date.UTC(+t[0], +t[1] - 1, +t[2])).toLocaleDateString(LOC,
        { timeZone: 'UTC', day: 'numeric', month: 'long' });
    }
  };

  /* ==========================================================================
     RAD — SVG und Winkelmathematik. Kennt nur Felder { tag, verfuegbar }.
     Winkel werden vom 12-Uhr-Punkt im Uhrzeigersinn gemessen, dort steht
     auch der feste Zeiger.
     ====================================================================== */
  var RAD = {
    M:150, RA:143, RI:104, RBAHN:95, RBAHN_INNEN:80, RNABE:70,
    felder: [], segment: 0,

    punkt: function (r, grad) {
      var b = (grad - 90) * Math.PI / 180;
      return [(this.M + r * Math.cos(b)).toFixed(2), (this.M + r * Math.sin(b)).toFixed(2)];
    },
    sektor: function (ra, ri, a1, a2) {
      var p1 = this.punkt(ra, a1), p2 = this.punkt(ra, a2),
          p3 = this.punkt(ri, a2), p4 = this.punkt(ri, a1);
      var gross = (a2 - a1) > 180 ? 1 : 0;
      return 'M' + p1 + 'A' + ra + ',' + ra + ' 0 ' + gross + ' 1 ' + p2 +
             'L' + p3 + 'A' + ri + ',' + ri + ' 0 ' + gross + ' 0 ' + p4 + 'Z';
    },
    segMitte: function (i) { return i * this.segment + this.segment / 2; },

    bauen: function (box, felder) {
      this.felder  = felder;
      this.segment = 360 / felder.length;
      var teile = [], i, mitte, tp, dp, gedreht;

      for (i = 0; i < felder.length; i++) {
        teile.push('<path class="rad__seg' +
          (felder[i].verfuegbar ? ' rad__seg--frei' : '') + (i % 2 ? ' rad__seg--b' : '') +
          '" data-seg="' + i + '" d="' +
          this.sektor(this.RA, this.RI, i * this.segment, (i + 1) * this.segment) + '"></path>');
      }
      for (i = 0; i < felder.length; i++) {
        mitte = this.segMitte(i);
        tp = this.punkt((this.RA + this.RI) / 2 + 3, mitte);
        /* Zahlen radial ausrichten; in der unteren Haelfte um 180 Grad drehen,
           damit sie nicht auf dem Kopf stehen. */
        gedreht = (mitte > 90 && mitte < 270) ? mitte + 180 : mitte;
        teile.push('<text class="rad__zahl' + (felder[i].verfuegbar ? ' rad__zahl--frei' : '') +
          '" x="' + tp[0] + '" y="' + tp[1] + '" text-anchor="middle" dominant-baseline="central"' +
          ' transform="rotate(' + gedreht.toFixed(2) + ',' + tp[0] + ',' + tp[1] + ')">' +
          felder[i].tag + '</text>');
        if (felder[i].verfuegbar) {
          dp = this.punkt(this.RI + 7, mitte);
          teile.push('<circle class="rad__punkt" cx="' + dp[0] + '" cy="' + dp[1] + '" r="2.6"></circle>');
        }
      }

      box.innerHTML =
        '<svg class="rad__svg" viewBox="0 0 300 300" role="img" aria-label="Roulette-Rad mit den Tagen des Monats">' +
          '<circle class="rad__rand" cx="150" cy="150" r="147"></circle>' +
          '<g data-rad-dreh>' + teile.join('') + '</g>' +
          '<circle class="rad__bahn" cx="150" cy="150" r="' + this.RBAHN + '"></circle>' +
          '<circle class="rad__nabe" cx="150" cy="150" r="' + this.RNABE + '"></circle>' +
          '<text class="rad__marke" x="150" y="145" text-anchor="middle">PADEL</text>' +
          '<text class="rad__marke rad__marke--klein" x="150" y="163" text-anchor="middle">ROULETTE</text>' +
          '<circle class="rad__kugel" data-rad-kugel cx="150" cy="' + (150 - this.RBAHN) + '" r="6.5"></circle>' +
          '<path class="rad__zeiger" d="M150,3 L141,26 L159,26 Z"></path>' +
        '</svg>';
    },

    /* Zielwinkel, damit die Mitte von Segment idx unter dem Zeiger steht. */
    zielRad: function (idx, aktuell, umdrehungen) {
      var basis = ((-this.segMitte(idx)) % 360 + 360) % 360;
      var jetzt = ((aktuell % 360) + 360) % 360;
      var delta = ((basis - jetzt) % 360 + 360) % 360;
      return aktuell + 360 * umdrehungen + delta;
    },
    /* Kugel laeuft gegenlaeufig und endet exakt bei 0 Grad, also am Zeiger. */
    zielKugel: function (aktuell, umdrehungen) {
      return aktuell - (((aktuell % 360) + 360) % 360) - 360 * umdrehungen;
    },
    setzen: function (radWinkel, kugelWinkel, kugelRadius) {
      var g = wurzel.querySelector('[data-rad-dreh]');
      var k = wurzel.querySelector('[data-rad-kugel]');
      if (g) g.setAttribute('transform', 'rotate(' + radWinkel.toFixed(3) + ',150,150)');
      if (k) {
        var p = this.punkt(kugelRadius, ((kugelWinkel % 360) + 360) % 360);
        k.setAttribute('cx', p[0]); k.setAttribute('cy', p[1]);
      }
    },
    markieren: function (idx) {
      Array.prototype.forEach.call(wurzel.querySelectorAll('.rad__seg'), function (s) {
        s.classList.toggle('rad__seg--treffer', Number(s.getAttribute('data-seg')) === idx);
      });
    }
  };

  /* ------------------------------------------------------------- Zustand */
  var status   = wurzel.querySelector('[data-pr-status]');
  var buehne   = wurzel.querySelector('[data-pr-buehne]');
  var knopf    = wurzel.querySelector('[data-pr-wuerfeln]');
  var liste    = wurzel.querySelector('[data-pr-liste]');
  var dlg      = wurzel.querySelector('[data-pr-dialog]');
  var formJoin = wurzel.querySelector('[data-pr-form]');
  var radBox   = wurzel.querySelector('[data-pr-rad]');
  var monLabel = wurzel.querySelector('[data-pr-monat]');
  var monZur   = wurzel.querySelector('[data-pr-monat-zurueck]');
  var monVor   = wurzel.querySelector('[data-pr-monat-vor]');
  var ansage   = wurzel.querySelector('[data-pr-ansage]');

  var sb = null, spiele = [], meine = {}, aktuell = null;
  var radWinkel = 0, kugelWinkel = 0, dreht = false;

  var heuteIso = KAL.schluessel(new Date());
  var jahr  = Number(heuteIso.slice(0, 4));
  var monat = Number(heuteIso.slice(5, 7)) - 1;

  function tokensLesen() {
    try { return JSON.parse(window.localStorage.getItem('pr:tokens') || '{}'); }
    catch (e) { return {}; }
  }
  function tokenMerken(id, tok) {
    meine[id] = tok;
    try { window.localStorage.setItem('pr:tokens', JSON.stringify(meine)); } catch (e) {}
  }
  function tokenLoeschen(id) {
    delete meine[id];
    try { window.localStorage.setItem('pr:tokens', JSON.stringify(meine)); } catch (e) {}
  }
  function melden(text, art) {
    status.textContent = text || '';
    status.className = 'pr__status' + (art ? ' pr__status--' + art : '');
    status.hidden = !text;
  }
  function sicher(x) {
    return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]; });
  }
  function uhr(iso) {
    return new Date(iso).toLocaleTimeString(LOC, { timeZone:ZONE, hour:'2-digit', minute:'2-digit' });
  }
  function ende(s) {
    return new Date(new Date(s.beginn).getTime() + (s.dauer_min || 90) * 60000).toISOString();
  }
  function tagLabel(iso) {
    var d = new Date(iso), h = new Date();
    if (KAL.schluessel(d) === KAL.schluessel(h)) return T.heute;
    if (KAL.schluessel(d) === KAL.schluessel(new Date(h.getTime() + 86400000))) return T.morgen;
    return d.toLocaleDateString(LOC, { timeZone:ZONE, weekday:'short', day:'numeric', month:'short' });
  }
  function zustand(s) {
    if (new Date(s.beginn) < new Date()) return 'vorbei';
    if ((s.padel_zusagen || []).length >= PLAETZE) return 'voll';
    return 'offen';
  }

  /* ------------------------- Felder des Monats aus den Spieldaten ableiten */
  function felderBauen() {
    var n = KAL.tageImMonat(jahr, monat), felder = [], i, tagIso, nachTag = {};
    spiele.forEach(function (s) {
      if (zustand(s) !== 'offen') return;
      var k = KAL.schluessel(new Date(s.beginn));
      (nachTag[k] = nachTag[k] || []).push(s);
    });
    for (i = 1; i <= n; i++) {
      tagIso = KAL.iso(jahr, monat, i);
      felder.push({ tag:i, datum:tagIso, spiele:nachTag[tagIso] || [],
                    verfuegbar:(nachTag[tagIso] || []).length > 0 });
    }
    return felder;
  }

  function monatZeichnen() {
    var felder = felderBauen();
    monLabel.textContent = KAL.monatName(jahr, monat);
    RAD.bauen(radBox, felder);
    RAD.setzen(radWinkel, kugelWinkel, RAD.RBAHN);
    var frei = felder.filter(function (f) { return f.verfuegbar; });
    knopf.disabled = dreht || (NUR_SPIELTAGE && frei.length === 0);
    knopf.textContent = T.spin;
    buehne.hidden = true; buehne.innerHTML = '';
    melden(NUR_SPIELTAGE && frei.length === 0 ? T.keineTage : '',
           NUR_SPIELTAGE && frei.length === 0 ? 'fehler' : null);
  }

  /* --------------------------------------------------------------- Spin */
  function zufall(max) {
    /* Gleichverteilt, ohne Modulo-Verzerrung. */
    if (window.crypto && window.crypto.getRandomValues) {
      var grenze = Math.floor(0xFFFFFFFF / max) * max, a = new Uint32Array(1);
      do { window.crypto.getRandomValues(a); } while (a[0] >= grenze);
      return a[0] % max;
    }
    return Math.floor(Math.random() * max);
  }
  function easeOutQuart(t) { return 1 - Math.pow(1 - t, 4); }

  function spin() {
    if (dreht) return;                              /* zweiter Klick prallt ab */
    var felder = felderBauen();
    var pool = NUR_SPIELTAGE ? felder.filter(function (f) { return f.verfuegbar; }) : felder;
    if (!pool.length) { melden(T.keineTage, 'fehler'); return; }

    /* Das Ergebnis steht VOR der Animation fest. Die Animation zielt darauf,
       sie erzeugt es nicht — Bild und Ergebnis koennen nicht auseinanderlaufen. */
    var treffer = pool[zufall(pool.length)];
    var idx = felder.indexOf(treffer);

    dreht = true;
    knopf.disabled = true;
    knopf.textContent = T.laeuft;
    buehne.hidden = true;
    melden('');
    RAD.markieren(-1);

    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      radWinkel   = RAD.zielRad(idx, radWinkel, 0);
      kugelWinkel = RAD.zielKugel(kugelWinkel, 0);
      RAD.setzen(radWinkel, kugelWinkel, RAD.RBAHN_INNEN);
      fertig(felder, idx);
      return;
    }

    var dauer    = 4200 + zufall(1600);             /* 4,2 bis 5,8 Sekunden */
    var radStart = radWinkel;
    var radEnde  = RAD.zielRad(idx, radWinkel, 4 + zufall(3));
    var kugStart = kugelWinkel;
    var kugEnde  = RAD.zielKugel(kugelWinkel, 7 + zufall(3));
    var t0 = null;

    function schritt(zeit) {
      if (t0 === null) t0 = zeit;
      var t = Math.min((zeit - t0) / dauer, 1);
      radWinkel   = radStart + (radEnde - radStart) * easeOutQuart(t);
      kugelWinkel = kugStart + (kugEnde - kugStart) * easeOutQuart(Math.min(t * 1.06, 1));
      /* Die Kugel faellt im letzten Viertel von der Aussenbahn nach innen. */
      var fall = t < 0.75 ? 0 : (t - 0.75) / 0.25;
      RAD.setzen(radWinkel, kugelWinkel,
                 RAD.RBAHN - (RAD.RBAHN - RAD.RBAHN_INNEN) * easeOutQuart(fall));
      if (t < 1) { window.requestAnimationFrame(schritt); }
      else { radWinkel = radEnde; kugelWinkel = kugEnde; fertig(felder, idx); }
    }
    window.requestAnimationFrame(schritt);
  }

  function fertig(felder, idx) {
    dreht = false;
    knopf.disabled = false;
    knopf.textContent = T.nochmal;
    RAD.markieren(idx);
    var feld = felder[idx];
    var lesbar = KAL.langesDatum(feld.datum);
    buehne.innerHTML = '<p class="pr__treffer">' + sicher(T.ergebnis.replace('{d}', lesbar)) + '</p>' +
      (feld.spiele.length
        ? feld.spiele.map(function (s) { return karte(s, true); }).join('')
        : '<p class="pr__leer">' + sicher(T.keinSpiel) + '</p>');
    buehne.hidden = false;
    if (ansage) {
      ansage.textContent = T.ergebnis.replace('{d}', lesbar) +
        (feld.spiele.length ? '' : ' ' + T.keinSpiel);
    }
  }

  /* ------------------------------------------------- Karten, Liste, Daten */
  function karte(s, gross) {
    var zahl = (s.padel_zusagen || []).length;
    var z = zustand(s);
    var fehlt = PLAETZE - zahl;
    var namen = (s.padel_zusagen || []).map(function (t) { return sicher(t.vorname); }).join(', ');
    var meins = !!meine[s.id];
    var punkte = '';
    for (var i = 0; i < PLAETZE; i++) {
      punkte += '<span class="pr__punkt' + (i < zahl ? ' pr__punkt--voll' : '') + '"></span>';
    }
    return '<article class="pr__karte pr__karte--' + z + (gross ? ' pr__karte--gross' : '') + '">' +
      '<div class="pr__kopf">' +
        '<span class="pr__wann"><b>' + sicher(tagLabel(s.beginn)) + '</b>' +
          sicher(uhr(s.beginn)) + '–' + sicher(uhr(ende(s))) + '</span>' +
        '<span class="pr__marke pr__marke--' + z + '">' +
          sicher(z === 'voll' ? T.voll : (z === 'vorbei' ? T.vorbei : T.offen)) + '</span>' +
      '</div>' +
      '<p class="pr__ort">' + sicher(T.ort) +
        (s.court ? ' · ' + sicher(T.court) + ' ' + sicher(s.court) : '') + '</p>' +
      (s.info ? '<p class="pr__info">' + sicher(s.info) + '</p>' : '') +
      '<div class="pr__zaehler">' +
        '<span class="pr__punkte" aria-hidden="true">' + punkte + '</span>' +
        '<span class="pr__zahl">' + sicher(T.spieler.replace('{a}', zahl).replace('{b}', PLAETZE)) + '</span>' +
      '</div>' +
      (namen ? '<p class="pr__namen">' + namen + '</p>' : '') +
      '<div class="pr__aktion">' +
        (z === 'offen' && !meins
          ? '<button class="btn btn--clay btn--sm" type="button" data-join="' + sicher(s.id) + '">' +
            sicher(T.dabei) + '</button><span class="pr__fehlt">' +
            sicher((fehlt === 1 ? T.fehltNoch : T.fehltNochN).replace('{n}', fehlt)) + '</span>'
          : '') +
        (meins ? '<button class="txtlink pr__raus" type="button" data-raus="' + sicher(s.id) + '">' +
                 sicher(T.raus) + '</button>' : '') +
      '</div></article>';
  }

  function zeichnen() {
    var sortiert = spiele.slice().sort(function (a, b) { return new Date(a.beginn) - new Date(b.beginn); });
    liste.innerHTML = sortiert.length
      ? sortiert.map(function (s) { return '<li>' + karte(s) + '</li>'; }).join('')
      : '<li class="pr__leer">' + sicher(T.leer) + '</li>';
    if (!dreht) monatZeichnen();
  }

  function laden() {
    return sb.from('padel_matches')
      .select('id,beginn,dauer_min,court,info,padel_zusagen(id,vorname)')
      .order('beginn', { ascending: true })
      .then(function (r) {
        if (r.error) throw r.error;
        spiele = r.data || [];
        zeichnen();
      });
  }

  function fehlerText(e) {
    var m = ((e && (e.message || '')) + '');
    if (m.indexOf('DOPPELT') >= 0) return T.wegDoppelt;
    if (m.indexOf('VOLL') >= 0)    return T.wegVoll;
    if (m.indexOf('VORBEI') >= 0)  return T.wegVorbei;
    if (m.indexOf('WEG') >= 0)     return T.wegWeg;
    return T.wegAllgemein;
  }

  function verdrahten() {
    knopf.addEventListener('click', spin);
    monZur.addEventListener('click', function () {
      if (dreht) return;
      monat--; if (monat < 0) { monat = 11; jahr--; }
      radWinkel = 0; kugelWinkel = 0; monatZeichnen();
    });
    monVor.addEventListener('click', function () {
      if (dreht) return;
      monat++; if (monat > 11) { monat = 0; jahr++; }
      radWinkel = 0; kugelWinkel = 0; monatZeichnen();
    });
    Array.prototype.forEach.call(wurzel.querySelectorAll('[data-pr-schliessen]'), function (b) {
      b.addEventListener('click', function () { b.closest('dialog').close(); });
    });

    function klick(e) {
      var j = e.target.closest('[data-join]');
      if (j) {
        aktuell = j.getAttribute('data-join');
        if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
        return;
      }
      var r = e.target.closest('[data-raus]');
      if (r) {
        var id = r.getAttribute('data-raus');
        sb.rpc('padel_zurueckziehen', { p_token: meine[id] }).then(function (res) {
          if (res.error) return melden(fehlerText(res.error), 'fehler');
          tokenLoeschen(id); melden(T.okRaus, 'ok'); laden();
        });
      }
    }
    liste.addEventListener('click', klick);
    buehne.addEventListener('click', klick);

    formJoin.addEventListener('submit', function (e) {
      e.preventDefault();
      var f = new FormData(formJoin);
      var token = (window.crypto && window.crypto.randomUUID)
        ? window.crypto.randomUUID()
        : String(Date.now()) + '-' + Math.random().toString(16).slice(2);
      var btn = formJoin.querySelector('button[type="submit"]');
      btn.disabled = true;
      sb.rpc('padel_beitreten', {
        p_match: aktuell, p_vorname: f.get('vorname'),
        p_kontakt: f.get('kontakt'), p_token: token
      }).then(function (res) {
        btn.disabled = false;
        if (res.error) return melden(fehlerText(res.error), 'fehler');
        tokenMerken(aktuell, token);
        dlg.close(); formJoin.reset();
        var vorher = spiele.filter(function (s) { return s.id === aktuell; })[0];
        var voll = vorher && (vorher.padel_zusagen || []).length + 1 >= PLAETZE;
        melden(voll ? T.okVoll : T.okDabei, 'ok');
        laden();
      });
    });
  }

  function horchen() {
    sb.channel('padel-roulette')
      .on('postgres_changes', { event:'*', schema:'public', table:'padel_matches' }, laden)
      .on('postgres_changes', { event:'*', schema:'public', table:'padel_zusagen' }, laden)
      .subscribe();
  }

  function starten() {
    monatZeichnen();                                /* Rad steht sofort, auch ohne Daten */
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(URL_SB) || KEY_SB.length < 40) {
      melden(T.unkonfiguriert, 'fehler');
      knopf.disabled = true;
      return;
    }
    var s = document.createElement('script');
    s.src = LIB;
    s.onload = function () {
      try {
        sb = window.supabase.createClient(URL_SB, KEY_SB, { auth: { persistSession: false } });
        meine = tokensLesen();
        verdrahten();
        laden().then(horchen).catch(function () { melden(T.fehler, 'fehler'); });
      } catch (e) { melden(T.fehler, 'fehler'); }
    };
    s.onerror = function () { melden(T.fehler, 'fehler'); };
    document.head.appendChild(s);
  }

  melden(T.laden);
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (ein) {
      if (ein[0].isIntersecting) { io.disconnect(); starten(); }
    }, { rootMargin: '300px' });
    io.observe(wurzel);
  } else { starten(); }
})();
