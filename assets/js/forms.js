/* ============================================================================
   Kontaktformular und Mitgliedsantrag.

   Beide schreiben per REST-Insert direkt in Supabase (contact_submissions /
   membership_applications) — ohne die große supabase-js-Bibliothek zu laden,
   da hier jeweils nur ein einzelner Insert nötig ist. Der anon-Schlüssel darf
   das: Er erlaubt ausschließlich INSERT, siehe supabase/forms-schema.sql.

   Ein leeres Honeypot-Feld ("website") muss leer bleiben — ist es gefüllt,
   wird nichts gespeichert, aber trotzdem "Erfolg" gemeldet, damit Bots nicht
   merken, dass sie erkannt wurden.
   ========================================================================== */
(function () {
  'use strict';

  var lang = (document.documentElement.lang || 'de').slice(0, 2);

  var TEXTE = {
    de: {
      senden: 'Wird gesendet …',
      okKontakt: 'Danke — deine Nachricht ist angekommen. Wir melden uns.',
      okAntrag: 'Danke — dein Antrag ist angekommen. Wir melden uns mit den nächsten Schritten.',
      fehler: 'Das hat nicht geklappt. Bitte später erneut versuchen oder anrufen: 08171 51 110.',
      unkonfiguriert: 'Das Formular ist noch nicht eingerichtet. Bitte ruf uns an oder schreib eine Mail.'
    },
    en: {
      senden: 'Sending …',
      okKontakt: 'Thanks — your message has arrived. We will get back to you.',
      okAntrag: 'Thanks — your application has arrived. We will get back to you with the next steps.',
      fehler: 'That did not work. Please try again later or call us: 08171 51 110.',
      unkonfiguriert: 'This form is not set up yet. Please call or send an email instead.'
    },
    es: {
      senden: 'Enviando …',
      okKontakt: 'Gracias — tu mensaje ha llegado. Nos pondremos en contacto.',
      okAntrag: 'Gracias — tu solicitud ha llegado. Te contactaremos con los siguientes pasos.',
      fehler: 'Eso no ha funcionado. Inténtalo más tarde o llama al 08171 51 110.',
      unkonfiguriert: 'Este formulario aún no está configurado. Llama o escribe un correo, por favor.'
    }
  };
  var T = TEXTE[lang] || TEXTE.de;

  function melden(form, text, art) {
    var status = form.querySelector('[data-form-status]');
    if (!status) return;
    status.textContent = text || '';
    status.className = 'form-status' + (art ? ' form-status--' + art : '');
    status.hidden = !text;
  }

  function boolWert(f, name) { return f.get(name) === 'on' || !!f.get(name); }
  function textWert(f, name) { var v = f.get(name); v = v == null ? '' : String(v).trim(); return v || null; }

  function verdrahten(form, tabelle, payloadBauen, erfolgstext) {
    var URL_SB = form.getAttribute('data-sb-url') || '';
    var KEY_SB = form.getAttribute('data-sb-key') || '';
    var eingerichtet = /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(URL_SB) && KEY_SB.length > 40;

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!eingerichtet) { melden(form, T.unkonfiguriert, 'fehler'); return; }

      var f = new FormData(form);

      // Honeypot: Bots ausbremsen, ohne sie zu warnen.
      if (textWert(f, 'website')) {
        form.reset();
        melden(form, erfolgstext, 'ok');
        return;
      }

      var payload = payloadBauen(f);
      var knopf = form.querySelector('button[type="submit"]');
      if (knopf) knopf.disabled = true;
      melden(form, T.senden);

      fetch(URL_SB + '/rest/v1/' + tabelle, {
        method: 'POST',
        headers: {
          'apikey': KEY_SB,
          'Authorization': 'Bearer ' + KEY_SB,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(payload)
      }).then(function (r) {
        if (knopf) knopf.disabled = false;
        if (!r.ok) throw new Error('HTTP ' + r.status);
        form.reset();
        melden(form, erfolgstext, 'ok');
      }).catch(function () {
        if (knopf) knopf.disabled = false;
        melden(form, T.fehler, 'fehler');
      });
    });
  }

  /* ------------------------------------------------------- Kontaktformular */
  var kontakt = document.getElementById('kontaktformular');
  if (kontakt) {
    verdrahten(kontakt, 'contact_submissions', function (f) {
      return {
        lang: lang,
        name: textWert(f, 'name'),
        email: textWert(f, 'email'),
        telefon: textWert(f, 'telefon'),
        thema: textWert(f, 'thema'),
        nachricht: textWert(f, 'nachricht')
      };
    }, T.okKontakt);
  }

  /* --------------------------------------------------- Mitgliedsantrag */
  var antrag = document.getElementById('antragsformular');
  if (antrag) {
    verdrahten(antrag, 'membership_applications', function (f) {
      return {
        lang: lang,
        mitgliedschaft: textWert(f, 'mitgliedschaft'),
        tarif: textWert(f, 'tarif'),
        beginn: textWert(f, 'beginn'),
        standort: textWert(f, 'standort'),
        vorname: textWert(f, 'vorname'),
        nachname: textWert(f, 'nachname'),
        geburtsdatum: textWert(f, 'geburtsdatum'),
        telefon: textWert(f, 'telefon'),
        email: textWert(f, 'email'),
        strasse: textWert(f, 'strasse'),
        plz: textWert(f, 'plz'),
        ort: textWert(f, 'ort'),
        vertretung_name: textWert(f, 'vertretung_name'),
        vertretung_telefon: textWert(f, 'vertretung_telefon'),
        kontoinhaber: textWert(f, 'kontoinhaber'),
        iban: (textWert(f, 'iban') || '').replace(/\s+/g, '').toUpperCase(),
        bank: textWert(f, 'bank'),
        sepa_mandat: boolWert(f, 'sepa_mandat'),
        satzung_akzeptiert: boolWert(f, 'satzung'),
        consent: boolWert(f, 'consent'),
        whatsapp_gruppe: boolWert(f, 'whatsapp')
      };
    }, T.okAntrag);
  }
})();
