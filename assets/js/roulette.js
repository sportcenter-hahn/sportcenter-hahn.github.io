/* ============================================================================
   Padel Match Roulette.

   Anders als die Mitspielerbörse: Die Spiele legt die Verwaltung an, Termin und
   Court stehen fest. Ein Spiel findet statt, sobald genau vier Zusagen da sind.

   Die Supabase-Bibliothek liegt self-hosted unter assets/js/vendor/ und wird
   erst geladen, wenn der Bereich in den sichtbaren Bereich kommt.
   Geschrieben wird nur über padel_beitreten / padel_zurueckziehen.
   ========================================================================== */
(function () {
  'use strict';

  var wurzel = document.querySelector('[data-roulette]');
  if (!wurzel) return;

  var PLAETZE = 4;
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
      keins:'Gerade ist kein Spiel offen. Schau später noch einmal — oder trag dich in der Mitspielerbörse ein.',
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
      wuerfeln:'Zufälliges Padel-Match vorschlagen', nochmal:'Nochmal würfeln'
    },
    en: {
      heute:'Today', morgen:'Tomorrow', court:'Court', ort:'Geretsried',
      spieler:'{a} / {b} players', dabei:'Count me in', raus:'Withdraw',
      offen:'Places left', voll:'Full — going ahead', vorbei:'Past',
      fehltNoch:'{n} more needed', fehltNochN:'{n} more needed',
      keins:'No open match right now. Look again later — or post on the partner board.',
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
      wuerfeln:'Suggest a random padel match', nochmal:'Spin again'
    },
    es: {
      heute:'Hoy', morgen:'Mañana', court:'Pista', ort:'Geretsried',
      spieler:'{a} / {b} jugadores', dabei:'Me apunto', raus:'Retirar mi apunte',
      offen:'Quedan plazas', voll:'Completo: se juega', vorbei:'Pasado',
      fehltNoch:'Falta {n}', fehltNochN:'Faltan {n}',
      keins:'Ahora mismo no hay ningún partido abierto. Vuelve más tarde o publica en la bolsa de jugadores.',
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
      wuerfeln:'Proponer un partido al azar', nochmal:'Volver a girar'
    }
  };
  var T = TEXTE[lang] || TEXTE.de;

  var status   = wurzel.querySelector('[data-pr-status]');
  var buehne   = wurzel.querySelector('[data-pr-buehne]');
  var knopf    = wurzel.querySelector('[data-pr-wuerfeln]');
  var liste    = wurzel.querySelector('[data-pr-liste]');
  var dlg      = wurzel.querySelector('[data-pr-dialog]');
  var formJoin = wurzel.querySelector('[data-pr-form]');

  var sb = null, spiele = [], meine = {}, aktuell = null, gewuerfelt = null;

  /* --------------------------------------------------- eigene Zusagen merken */
  function tokensLesen() {
    try { return JSON.parse(window.localStorage.getItem('pr:tokens') || '{}'); }
    catch (e) { return {}; }
  }
  function tokenMerken(matchId, token) {
    meine[matchId] = token;
    try { window.localStorage.setItem('pr:tokens', JSON.stringify(meine)); } catch (e) {}
  }
  function tokenLoeschen(matchId) {
    delete meine[matchId];
    try { window.localStorage.setItem('pr:tokens', JSON.stringify(meine)); } catch (e) {}
  }

  /* ---------------------------------------------------------------- Anzeige */
  function melden(text, art) {
    status.textContent = text || '';
    status.className = 'pr__status' + (art ? ' pr__status--' + art : '');
    status.hidden = !text;
  }
  function sicher(x) {
    return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]; });
  }
  function berlinTag(d) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(d);
  }
  function tagLabel(iso) {
    var d = new Date(iso), heute = new Date();
    var morgen = new Date(heute.getTime() + 86400000);
    if (berlinTag(d) === berlinTag(heute))  return T.heute;
    if (berlinTag(d) === berlinTag(morgen)) return T.morgen;
    return d.toLocaleDateString(LOC, { timeZone:'Europe/Berlin', weekday:'short', day:'numeric', month:'short' });
  }
  function uhr(iso) {
    return new Date(iso).toLocaleTimeString(LOC, { timeZone:'Europe/Berlin', hour:'2-digit', minute:'2-digit' });
  }
  function ende(s) {
    return new Date(new Date(s.beginn).getTime() + (s.dauer_min || 90) * 60000).toISOString();
  }

  function zustand(s) {
    var zahl = (s.padel_zusagen || []).length;
    if (new Date(s.beginn) < new Date()) return 'vorbei';
    if (zahl >= PLAETZE) return 'voll';
    return 'offen';
  }

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
      '<p class="pr__ort">' + sicher(T.ort) + (s.court ? ' · ' + sicher(T.court) + ' ' + sicher(s.court) : '') + '</p>' +
      (s.info ? '<p class="pr__info">' + sicher(s.info) + '</p>' : '') +
      '<div class="pr__zaehler">' +
        '<span class="pr__punkte" aria-hidden="true">' + punkte + '</span>' +
        '<span class="pr__zahl">' + sicher(T.spieler.replace('{a}', zahl).replace('{b}', PLAETZE)) + '</span>' +
      '</div>' +
      (namen ? '<p class="pr__namen">' + namen + '</p>' : '') +
      '<div class="pr__aktion">' +
        (z === 'offen' && !meins
          ? '<button class="btn btn--clay btn--sm" type="button" data-join="' + sicher(s.id) + '">' +
            sicher(T.dabei) + '</button>' +
            '<span class="pr__fehlt">' +
            sicher((fehlt === 1 ? T.fehltNoch : T.fehltNochN).replace('{n}', fehlt)) + '</span>'
          : '') +
        (meins ? '<button class="txtlink pr__raus" type="button" data-raus="' + sicher(s.id) + '">' +
                 sicher(T.raus) + '</button>' : '') +
      '</div></article>';
  }

  function zeichnen() {
    var jetzt = new Date();
    var sortiert = spiele.slice().sort(function (a, b) { return new Date(a.beginn) - new Date(b.beginn); });
    liste.innerHTML = sortiert.length
      ? sortiert.map(function (s) { return '<li>' + karte(s) + '</li>'; }).join('')
      : '<li class="pr__leer">' + sicher(T.leer) + '</li>';

    // Bühne aktualisieren, falls das gewürfelte Spiel noch da ist
    if (gewuerfelt) {
      var akt = spiele.filter(function (s) { return s.id === gewuerfelt; })[0];
      buehne.innerHTML = akt ? karte(akt, true) : '';
      buehne.hidden = !akt;
    }
    var offen = spiele.filter(function (s) { return zustand(s) === 'offen'; });
    knopf.disabled = offen.length === 0;
    knopf.textContent = gewuerfelt ? T.nochmal : T.wuerfeln;
  }

  function wuerfeln() {
    // Voll, vorbei und bereits zugesagt fallen raus.
    var pool = spiele.filter(function (s) {
      return zustand(s) === 'offen' && !meine[s.id] && s.id !== gewuerfelt;
    });
    if (!pool.length) {
      pool = spiele.filter(function (s) { return zustand(s) === 'offen' && !meine[s.id]; });
    }
    if (!pool.length) { melden(T.keins, 'fehler'); buehne.hidden = true; gewuerfelt = null; return; }
    melden('');
    var treffer = pool[Math.floor(Math.random() * pool.length)];
    gewuerfelt = treffer.id;
    buehne.innerHTML = karte(treffer, true);
    buehne.hidden = false;
    buehne.classList.remove('pr__buehne--rein');
    void buehne.offsetWidth;                       // Neustart der Animation erzwingen
    buehne.classList.add('pr__buehne--rein');
    knopf.textContent = T.nochmal;
  }

  /* ------------------------------------------------------------------ Daten */
  function laden() {
    return sb.from('padel_matches')
      .select('id,beginn,dauer_min,court,info,padel_zusagen(id,vorname)')
      .order('beginn', { ascending: true })
      .then(function (r) {
        if (r.error) throw r.error;
        spiele = r.data || [];
        melden('');
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

  /* -------------------------------------------------------------- Bedienung */
  function verdrahten() {
    knopf.addEventListener('click', wuerfeln);

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
          tokenLoeschen(id);
          melden(T.okRaus, 'ok');
          laden();
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
        dlg.close();
        formJoin.reset();
        var vorher = spiele.filter(function (s) { return s.id === aktuell; })[0];
        var jetztVoll = vorher && (vorher.padel_zusagen || []).length + 1 >= PLAETZE;
        melden(jetztVoll ? T.okVoll : T.okDabei, 'ok');
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
  knopf.textContent = T.wuerfeln;
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (ein) {
      if (ein[0].isIntersecting) { io.disconnect(); starten(); }
    }, { rootMargin: '300px' });
    io.observe(wurzel);
  } else { starten(); }
})();
