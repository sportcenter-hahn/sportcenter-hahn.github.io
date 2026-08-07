/**
 * Sportcenter Hahn — E-Mail-Benachrichtigung via Resend
 * Supabase Edge Function (Deno runtime)
 *
 * Auslöser: Database Webhook bei INSERT auf
 *   - public.contact_submissions
 *   - public.membership_applications
 *
 * Umgebungsvariablen (Supabase Dashboard → Edge Functions → Secrets):
 *   RESEND_API_KEY   — API-Key von resend.com
 *   NOTIFY_EMAIL     — Empfänger (z. B. mail@sportcenter-hahn.de)
 *   FROM_EMAIL       — Absender, muss bei Resend verifiziert sein
 *                      z. B. "Sportcenter Hahn <noreply@sportcenter-hahn.de>"
 *   WEBHOOK_SECRET   — Beliebiges Passwort, identisch mit x-webhook-secret Header
 *
 * Deploy:
 *   supabase functions deploy email-notify --no-verify-jwt
 */

const RESEND_URL = 'https://api.resend.com/emails';

interface WebhookPayload {
  type:   'INSERT' | 'UPDATE' | 'DELETE';
  table:  string;
  schema: string;
  record: Record<string, unknown>;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  // Webhook-Secret prüfen (verhindert ungewollte Aufrufe von außen)
  const secret = Deno.env.get('WEBHOOK_SECRET');
  if (secret) {
    const incoming = req.headers.get('x-webhook-secret') ?? '';
    if (incoming !== secret) {
      return new Response('Unauthorized', { status: 401 });
    }
  }

  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  // Nur INSERT-Events bearbeiten
  if (payload.type !== 'INSERT') {
    return new Response('OK (ignoriert)', { status: 200 });
  }

  const { table, record } = payload;
  let subject  = '';
  let htmlBody = '';
  let replyTo  = '';

  /* ── Kontaktanfrage ──────────────────────────────────────── */
  if (table === 'contact_submissions') {
    const name      = str(record.name);
    const email     = str(record.email);
    const telefon   = str(record.telefon, '—');
    const thema     = str(record.thema,   '—');
    const nachricht = str(record.nachricht);

    replyTo  = `${name} <${email}>`;
    subject  = `[Kontakt] ${thema} – ${name}`;
    htmlBody = layout('Neue Kontaktanfrage', `
      <table>
        <tr><td>Name</td><td>${x(name)}</td></tr>
        <tr><td>E-Mail</td><td><a href="mailto:${x(email)}">${x(email)}</a></td></tr>
        <tr><td>Telefon</td><td>${x(telefon)}</td></tr>
        <tr><td>Anliegen</td><td>${x(thema)}</td></tr>
      </table>
      <h3>Nachricht</h3>
      <blockquote>${x(nachricht).replace(/\n/g, '<br>')}</blockquote>
      ${zeitstempel(str(record.created_at))}
    `);

  /* ── Mitgliedschaftsantrag ────────────────────────────────── */
  } else if (table === 'membership_applications') {
    const vorname   = str(record.vorname);
    const nachname  = str(record.nachname);
    const email     = str(record.email);
    const telefon   = str(record.telefon);
    const mitgl     = str(record.mitgliedschaft);
    const tarif     = str(record.tarif,    '—');
    const beginn    = str(record.beginn,   'Nächstmöglicher Termin');
    const standort  = str(record.standort, '—');
    const geb       = str(record.geburtsdatum);
    const strasse   = str(record.strasse);
    const plz       = str(record.plz);
    const ort       = str(record.ort);
    const inhaber   = str(record.kontoinhaber);
    const iban      = str(record.iban);
    const bank      = str(record.bank,  '—');
    const whatsapp  = record.whatsapp_gruppe ? 'Ja' : 'Nein';
    const vertName  = str(record.vertretung_name,   '—');
    const vertTel   = str(record.vertretung_telefon,'—');

    replyTo  = `${vorname} ${nachname} <${email}>`;
    subject  = `[Mitgliedschaft] ${mitgl} (${tarif}) – ${vorname} ${nachname}`;
    htmlBody = layout('Neuer Mitgliedschaftsantrag', `
      <h3>1 · Gewünschte Mitgliedschaft</h3>
      <table>
        <tr><td>Paket</td><td>${x(mitgl)}</td></tr>
        <tr><td>Tarif</td><td>${x(tarif)}</td></tr>
        <tr><td>Gewünschter Beginn</td><td>${x(beginn)}</td></tr>
        <tr><td>Hauptstandort</td><td>${x(standort)}</td></tr>
      </table>

      <h3>2 · Persönliche Daten</h3>
      <table>
        <tr><td>Name</td><td>${x(vorname)} ${x(nachname)}</td></tr>
        <tr><td>Geburtsdatum</td><td>${x(geb)}</td></tr>
        <tr><td>Telefon</td><td>${x(telefon)}</td></tr>
        <tr><td>E-Mail</td><td><a href="mailto:${x(email)}">${x(email)}</a></td></tr>
        <tr><td>Adresse</td><td>${x(strasse)}, ${x(plz)} ${x(ort)}</td></tr>
        <tr><td>WhatsApp-Gruppe</td><td>${whatsapp}</td></tr>
      </table>

      ${vertName !== '—' ? `
      <h3>3 · Gesetzliche Vertretung</h3>
      <table>
        <tr><td>Name</td><td>${x(vertName)}</td></tr>
        <tr><td>Telefon</td><td>${x(vertTel)}</td></tr>
      </table>` : ''}

      <h3>4 · SEPA-Lastschrift</h3>
      <table>
        <tr><td>Kontoinhaber</td><td>${x(inhaber)}</td></tr>
        <tr><td>IBAN</td><td><code>${x(iban)}</code></td></tr>
        <tr><td>Bank</td><td>${x(bank)}</td></tr>
        <tr><td>Mandat</td><td>✓ erteilt</td></tr>
      </table>

      ${zeitstempel(str(record.created_at))}
    `);

  } else {
    return new Response('OK (unbekannte Tabelle)', { status: 200 });
  }

  /* ── Versenden über Resend ──────────────────────────────── */
  const resendKey   = Deno.env.get('RESEND_API_KEY')  ?? '';
  const notifyEmail = Deno.env.get('NOTIFY_EMAIL')    ?? '';
  const fromEmail   = Deno.env.get('FROM_EMAIL')
                      ?? 'Sportcenter Hahn <noreply@sportcenter-hahn.de>';

  if (!resendKey || !notifyEmail) {
    console.error('RESEND_API_KEY oder NOTIFY_EMAIL fehlt!');
    return new Response('Konfigurationsfehler', { status: 500 });
  }

  const res = await fetch(RESEND_URL, {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: fromEmail, to: [notifyEmail], reply_to: replyTo, subject, html: htmlBody }),
  });

  if (!res.ok) {
    const t = await res.text();
    console.error('Resend-Fehler:', res.status, t);
    return new Response('E-Mail-Versand fehlgeschlagen', { status: 502 });
  }

  return new Response('OK', { status: 200 });
});

/* ── Hilfsfunktionen ─────────────────────────────────────── */

function str(v: unknown, fallback = ''): string {
  return v !== null && v !== undefined ? String(v) : fallback;
}

function x(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function zeitstempel(iso: string): string {
  try {
    return `<p class="ts">Eingang: ${new Date(iso).toLocaleString('de-DE')}</p>`;
  } catch { return ''; }
}

function layout(title: string, content: string): string {
  return `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><style>
body{font-family:Arial,sans-serif;color:#222;max-width:640px;margin:0 auto;padding:0}
h2{background:#c8a96e;color:#fff;padding:16px 24px;margin:0;border-radius:4px 4px 0 0}
.body{border:1px solid #e0d8cc;border-top:none;padding:24px;border-radius:0 0 4px 4px}
h3{color:#9a7030;font-size:.85em;text-transform:uppercase;letter-spacing:.05em;margin-top:1.6em}
table{width:100%;border-collapse:collapse;margin:.5em 0}
td{padding:6px 8px;border-bottom:1px solid #f0ebe3;vertical-align:top}
td:first-child{width:38%;color:#666;white-space:nowrap}
blockquote{border-left:3px solid #c8a96e;margin:0;padding:10px 16px;background:#fdf8f0}
code{background:#f5f5f5;padding:2px 6px;border-radius:3px}
.ts{color:#999;font-size:.8em;margin-top:1.5em;border-top:1px solid #eee;padding-top:.8em}
.foot{margin-top:1.5em;font-size:.78em;color:#aaa}
</style></head><body>
<h2>Sportcenter Hahn — ${x(title)}</h2>
<div class="body">${content}
<p class="foot">Automatisch generiert · Antworten direkt an den Absender.</p>
</div></body></html>`;
}
