/* ============================================================================
   Mitspielerbörse.

   Die Supabase-Bibliothek liegt self-hosted unter assets/js/vendor/ und wird
   erst geladen, wenn das Board in den sichtbaren Bereich kommt — sie ist mit
   rund 53 kB das schwerste Stück der ganzen Seite.

   Geschrieben wird nie direkt in eine Tabelle, sondern über drei Funktionen
   (spiel_anlegen, spiel_beitreten, spiel_absagen). Siehe supabase/schema.sql.

   Fällt Supabase aus, bleibt die Seite bedienbar und zeigt einen Hinweis.
   ========================================================================== */
(function () {
  'use strict';

  var wurzel = document.querySelector('[data-partner]');
  if (!wurzel) return;

  var URL_SB = wurzel.getAttribute('data-sb-url') || '';
  var KEY_SB = wurzel.getAttribute('data-sb-key') || '';
  var LIB    = wurzel.getAttribute('data-sb-lib');

  var lang = (document.documentElement.lang || 'de').slice(0, 2);
  var LOC  = lang === 'en' ? 'en-GB' : (lang === 'es' ? 'es-ES' : 'de-DE');

  var TEXTE = {
    de: {
      sport: { tennis:'Tennis', padel:'Padel', pickleball:'Pickleball', soccer:'Soccer Five', golf:'Golf' },
      ort:   { geretsried:'Geretsried', wolfratshausen:'Wolfratshausen', egal:'Beide Anlagen' },
      niveau:{ offen:'Alle Level', anfaenger:'Anfänger', mittel:'Mittel', fortgeschritten:'Fortgeschritten' },
      heute:'Heute', morgen:'Morgen',
      sucht1:'sucht noch 1 Mitspieler', suchtN:'sucht noch {n} Mitspieler',
      voll:'Vollzählig', dabei:'Ich bin dabei', zusagen:'Zugesagt:',
      schreib:'Schreib {name}:', absagen:'Eintrag zurückziehen',
      leer:'Gerade sucht niemand. Trag den ersten Eintrag ein — es dauert eine halbe Minute.',
      laden:'Anfragen werden geladen …',
      fehler:'Die Mitspielerbörse ist gerade nicht erreichbar. Platz buchen geht trotzdem.',
      unkonfiguriert:'Die Mitspielerbörse ist noch nicht eingerichtet.',
      wegDoppelt:'Unter diesem Vornamen liegt schon eine Zusage vor.',
      wegBelegt:'Die Anfrage ist inzwischen vollzählig.',
      wegViele:'Zu viele Einträge in kurzer Zeit. Bitte später noch einmal.',
      wegZeit:'Bitte einen Zeitpunkt in den nächsten 21 Tagen wählen.',
      wegAllgemein:'Das hat nicht geklappt. Bitte noch einmal versuchen.',
      okAngelegt:'Eingetragen. Du siehst deine Anfrage jetzt im Board.',
      okDabei:'Zugesagt. Melde dich direkt beim Ersteller.',
      okAbgesagt:'Eintrag zurückgezogen.'
    },
    en: {
      sport: { tennis:'Tennis', padel:'Padel', pickleball:'Pickleball', soccer:'Five-a-side', golf:'Golf' },
      ort:   { geretsried:'Geretsried', wolfratshausen:'Wolfratshausen', egal:'Either venue' },
      niveau:{ offen:'Any level', anfaenger:'Beginner', mittel:'Intermediate', fortgeschritten:'Advanced' },
      heute:'Today', morgen:'Tomorrow',
      sucht1:'needs 1 more player', suchtN:'needs {n} more players',
      voll:'Full', dabei:'Count me in', zusagen:'Joined:',
      schreib:'Message {name}:', absagen:'Withdraw entry',
      leer:'Nobody is looking right now. Post the first request — it takes half a minute.',
      laden:'Loading requests …',
      fehler:'The partner board is unavailable right now. Booking a court still works.',
      unkonfiguriert:'The partner board is not set up yet.',
      wegDoppelt:'There is already an entry under that first name.',
      wegBelegt:'That request has just filled up.',
      wegViele:'Too many entries in a short time. Please try again later.',
      wegZeit:'Please pick a time within the next 21 days.',
      wegAllgemein:'That did not work. Please try again.',
      okAngelegt:'Posted. Your request is on the board now.',
      okDabei:'You are in. Get in touch with whoever posted it.',
      okAbgesagt:'Entry withdrawn.'
    },
    es: {
      sport: { tennis:'Tenis', padel:'Pádel', pickleball:'Pickleball', soccer:'Fútbol 5', golf:'Golf' },
      ort:   { geretsried:'Geretsried', wolfratshausen:'Wolfratshausen', egal:'Cualquiera de las dos' },
      niveau:{ offen:'Cualquier nivel', anfaenger:'Principiante', mittel:'Medio', fortgeschritten:'Avanzado' },
      heute:'Hoy', morgen:'Mañana',
      sucht1:'busca 1 jugador más', suchtN:'busca {n} jugadores más',
      voll:'Completo', dabei:'Me apunto', zusagen:'Apuntados:',
      schreib:'Escribe a {name}:', absagen:'Retirar la publicación',
      leer:'Ahora mismo no busca nadie. Publica el primero: se tarda medio minuto.',
      laden:'Cargando solicitudes…',
      fehler:'La bolsa de jugadores no está disponible. Reservar pista sigue funcionando.',
      unkonfiguriert:'La bolsa de jugadores aún no está configurada.',
      wegDoppelt:'Ya hay una inscripción con ese nombre.',
      wegBelegt:'La solicitud acaba de completarse.',
      wegViele:'Demasiadas publicaciones en poco tiempo. Inténtalo más tarde.',
      wegZeit:'Elige una fecha dentro de los próximos 21 días.',
      wegAllgemein:'No ha funcionado. Inténtalo de nuevo.',
      okAngelegt:'Publicado. Ya aparece en el tablón.',
      okDabei:'Apuntado. Ponte en contacto con quien lo publicó.',
      okAbgesagt:'Publicación retirada.'
    }
  };
  var T = TEXTE[lang] || TEXTE.de;

  var liste   = wurzel.querySelector('[data-pf-liste]');
  var status  = wurzel.querySelector('[data-pf-status]');
  var filterS = wurzel.querySelector('[data-pf-filter-sport]');
  var filterO = wurzel.querySelector('[data-pf-filter-ort]');
  var dlgNeu  = wurzel.querySelector('[data-pf-dialog-neu]');
  var dlgJoin = wurzel.querySelector('[data-pf-dialog-join]');
  var knopfNeu = wurzel.querySelector('[data-pf-neu]');

  var sb = null, spiele = [], meineTokens = {}, aktuellesSpiel = null;

  /* -------------------------------------------------- eigene Einträge merken */
  function tokensLesen() {
    try { return JSON.parse(window.localStorage.getItem('pf:tokens') || '{}'); }
    catch (e) { return {}; }
  }
  function tokenMerken(id, token) {
    meineTokens[id] = token;
    try { window.localStorage.setItem('pf:tokens', JSON.stringify(meineTokens)); } catch (e) {}
  }

  /* ------------------------------------------------------------- Anzeige */
  function melden(text, art) {
    status.textContent = text;
    status.className = 'pf__status' + (art ? ' pf__status--' + art : '');
    status.hidden = !text;
  }

  function berlinTag(d) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(d);
  }

  function tagLabel(iso) {
    var d = new Date(iso), heute = new Date();
    var morgen = new Date(heute.getTime() + 86400000);
    if (berlinTag(d) === berlinTag(heute))  return T.heute;
    if (berlinTag(d) === berlinTag(morgen)) return T.morgen;
    return d.toLocaleDateString(LOC, { timeZone: 'Europe/Berlin', weekday: 'short', day: 'numeric', month: 'short' });
  }

  function uhrzeit(iso) {
    return new Date(iso).toLocaleTimeString(LOC, { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' });
  }

  function sicher(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }

  /* Kontakt erst nach der Zusage einblenden — er steht als wa.me- oder
     mailto-Verweis da, je nachdem was eingetragen wurde. */
  function kontaktLink(wert) {
    var w = String(wert).trim();
    if (w.indexOf('@') > 0) return '<a href="mailto:' + sicher(w) + '">' + sicher(w) + '</a>';
    var ziffern = w.replace(/[^\d+]/g, '');
    if (/^(\+|0)\d{6,}$/.test(ziffern)) {
      var wa = ziffern.replace(/^\+/, '').replace(/^0/, '49');
      return '<a href="https://wa.me/' + wa + '" rel="noopener">' + sicher(w) + '</a>';
    }
    return sicher(w);
  }

  function karte(s) {
    var offen = s.plaetze_gesucht - (s.teilnahmen ? s.teilnahmen.length : 0);
    var voll  = offen <= 0;
    var namen = (s.teilnahmen || []).map(function (t) { return sicher(t.vorname); }).join(', ');
    var meins = !!meineTokens[s.id];
    var gezeigt = wurzel.getAttribute('data-pf-offen') === s.id;

    return '<li class="pf__karte' + (voll ? ' pf__karte--voll' : '') + '" data-sport="' +
      (s.sport === 'padel' || s.sport === 'pickleball' ? 'padel' : (s.sport === 'tennis' ? 'tennis' : 'kombi')) + '">' +
      '<div class="pf__kopf">' +
        '<span class="pf__sport">' + sicher(T.sport[s.sport] || s.sport) + '</span>' +
        '<span class="pf__wann"><b>' + sicher(tagLabel(s.beginn)) + '</b> ' +
          sicher(uhrzeit(s.beginn)) + '–' + sicher(uhrzeit(s.ende)) + '</span>' +
      '</div>' +
      '<p class="pf__meta">' + sicher(T.ort[s.ort] || s.ort) + ' · ' +
        sicher(T.niveau[s.niveau] || s.niveau) + '</p>' +
      (s.notiz ? '<p class="pf__notiz">„' + sicher(s.notiz) + '"</p>' : '') +
      '<p class="pf__wer"><b>' + sicher(s.vorname) + '</b> ' +
        (voll ? sicher(T.voll)
              : sicher(offen === 1 ? T.sucht1 : T.suchtN.replace('{n}', offen))) + '</p>' +
      (namen ? '<p class="pf__zusagen">' + sicher(T.zusagen) + ' ' + namen + '</p>' : '') +
      (gezeigt ? '<p class="pf__kontakt">' + sicher(T.schreib.replace('{name}', s.vorname)) +
                 ' ' + kontaktLink(s.kontakt) + '</p>' : '') +
      '<div class="pf__aktion">' +
        (voll || gezeigt ? '' :
          '<button class="btn btn--clay btn--sm" type="button" data-join="' + sicher(s.id) + '">' +
          sicher(T.dabei) + '</button>') +
        (meins ? '<button class="txtlink pf__weg" type="button" data-absagen="' + sicher(s.id) +
                 '">' + sicher(T.absagen) + '</button>' : '') +
      '</div></li>';
  }

  function zeichnen() {
    var fs = filterS ? filterS.value : '', fo = filterO ? filterO.value : '';
    var sichtbar = spiele.filter(function (s) {
      if (fs && s.sport !== fs) return false;
      if (fo && s.ort !== fo && s.ort !== 'egal') return false;
      return new Date(s.ende) > new Date();
    });
    sichtbar.sort(function (a, b) { return new Date(a.beginn) - new Date(b.beginn); });
    liste.innerHTML = sichtbar.length
      ? sichtbar.map(karte).join('')
      : '<li class="pf__leer">' + sicher(T.leer) + '</li>';
  }

  /* ------------------------------------------------------------- Laden */
  function laden() {
    return sb.from('spiele')
      .select('id,sport,ort,beginn,ende,niveau,plaetze_gesucht,vorname,kontakt,notiz,teilnahmen(vorname)')
      .order('beginn', { ascending: true })
      .then(function (r) {
        if (r.error) throw r.error;
        spiele = r.data || [];
        melden('');
        zeichnen();
      });
  }

  function fehlerText(e) {
    var m = (e && (e.message || e.error_description || '')) + '';
    if (m.indexOf('DOPPELT') >= 0) return T.wegDoppelt;
    if (m.indexOf('BELEGT') >= 0) return T.wegBelegt;
    if (m.indexOf('ZU_VIELE') >= 0) return T.wegViele;
    if (m.indexOf('ZEIT_') >= 0) return T.wegZeit;
    return T.wegAllgemein;
  }

  /* ------------------------------------------------------------ Bedienung */
  function verdrahten() {
    if (filterS) filterS.addEventListener('change', zeichnen);
    if (filterO) filterO.addEventListener('change', zeichnen);

    if (knopfNeu && dlgNeu) {
      knopfNeu.addEventListener('click', function () {
        if (dlgNeu.showModal) dlgNeu.showModal(); else dlgNeu.setAttribute('open', '');
      });
    }
    Array.prototype.forEach.call(wurzel.querySelectorAll('[data-pf-schliessen]'), function (b) {
      b.addEventListener('click', function () { b.closest('dialog').close(); });
    });

    liste.addEventListener('click', function (e) {
      var j = e.target.closest('[data-join]');
      if (j) {
        aktuellesSpiel = j.getAttribute('data-join');
        if (dlgJoin.showModal) dlgJoin.showModal(); else dlgJoin.setAttribute('open', '');
        return;
      }
      var a = e.target.closest('[data-absagen]');
      if (a) {
        var id = a.getAttribute('data-absagen');
        sb.rpc('spiel_absagen', { p_token: meineTokens[id] }).then(function (r) {
          if (r.error) return melden(fehlerText(r.error), 'fehler');
          melden(T.okAbgesagt, 'ok');
          laden();
        });
      }
    });

    /* --- neues Spiel --- */
    var formNeu = wurzel.querySelector('[data-pf-form-neu]');
    formNeu.addEventListener('submit', function (e) {
      e.preventDefault();
      var f = new FormData(formNeu);
      var beginn = new Date(f.get('datum') + 'T' + f.get('von') + ':00');
      var ende   = new Date(f.get('datum') + 'T' + f.get('bis') + ':00');
      if (!(ende > beginn)) { melden(T.wegAllgemein, 'fehler'); return; }
      var token = (window.crypto && window.crypto.randomUUID)
        ? window.crypto.randomUUID()
        : String(Date.now()) + '-' + Math.random().toString(16).slice(2);

      var knopf = formNeu.querySelector('button[type="submit"]');
      knopf.disabled = true;
      sb.rpc('spiel_anlegen', {
        p_sport: f.get('sport'), p_ort: f.get('ort'),
        p_beginn: beginn.toISOString(), p_ende: ende.toISOString(),
        p_niveau: f.get('niveau'), p_plaetze: Number(f.get('plaetze')),
        p_vorname: f.get('vorname'), p_kontakt: f.get('kontakt'),
        p_notiz: f.get('notiz') || null, p_token: token
      }).then(function (r) {
        knopf.disabled = false;
        if (r.error) return melden(fehlerText(r.error), 'fehler');
        tokenMerken(r.data, token);
        dlgNeu.close();
        formNeu.reset();
        melden(T.okAngelegt, 'ok');
        laden();
      });
    });

    /* --- zusagen --- */
    var formJoin = wurzel.querySelector('[data-pf-form-join]');
    formJoin.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = new FormData(formJoin).get('vorname');
      var knopf = formJoin.querySelector('button[type="submit"]');
      knopf.disabled = true;
      sb.rpc('spiel_beitreten', { p_spiel: aktuellesSpiel, p_vorname: name }).then(function (r) {
        knopf.disabled = false;
        if (r.error) return melden(fehlerText(r.error), 'fehler');
        wurzel.setAttribute('data-pf-offen', aktuellesSpiel);  // Kontakt freigeben
        dlgJoin.close();
        formJoin.reset();
        melden(T.okDabei, 'ok');
        laden();
      });
    });
  }

  /* ------------------------------------------------------------- Realtime */
  function horchen() {
    sb.channel('boerse')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'spiele' }, laden)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teilnahmen' }, laden)
      .subscribe();
  }

  /* ---------------------------------------------------------------- Start */
  function starten() {
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(URL_SB) || KEY_SB.length < 40) {
      melden(T.unkonfiguriert, 'fehler');
      return;
    }
    var s = document.createElement('script');
    s.src = LIB;
    s.onload = function () {
      try {
        sb = window.supabase.createClient(URL_SB, KEY_SB, { auth: { persistSession: false } });
        meineTokens = tokensLesen();
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
