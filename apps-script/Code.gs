/**
 * Exeter Trailer Hire: booking requests → Accept → Google Calendar, with bank-transfer payment.
 *
 * Runs as a Google Apps Script web app in the owner's Google account (free).
 *   - The website posts each enquiry here.
 *   - The owner gets an email with Accept / Decline buttons.
 *   - Accept: adds the hire to the "Trailer bookings" calendar and emails the customer
 *     the amount due and bank-transfer details (or gives the owner a ready WhatsApp message).
 *   - Mark as paid → receipt to customer. Deposit returned → thank-you + review link.
 *   - Every booking is logged in a Google Sheet.
 *   - The website reads booked dates from here to cross them out on its calendar.
 *
 * Private settings (Project Settings → Script properties), filled in by the owner:
 *   BANK_ACCOUNT_NAME, BANK_SORT_CODE, BANK_ACCOUNT_NUMBER   (needed for payment emails)
 *   REVIEW_LINK      optional: Google "Ask for reviews" link, sent after the deposit is returned
 *   OWNER_EMAIL      optional: where enquiries go (default: the Google account running this script)
 * setup() fills in SHEET_ID and CALENDAR_ID automatically.
 */

// ── Prices: keep in step with src/config.ts on the website ─────────────────
const PRICING = { day: 65, weekend: 80, weekdays: 100, extraDay: 15, deposit: 150 };
const BUSINESS = {
  name: 'Exeter Trailer Hire',
  phone: '07391 051035',
  whatsapp: '447391051035',
  site: 'https://exetertrailerhire.co.uk',
};
const CALENDAR_NAME = 'Trailer bookings';
const SHEET_NAME = 'Exeter Trailer Hire – Bookings';
const TZ = 'Europe/London';
const MAX_HIRE_DAYS = 120;

const COLS = ['ID', 'Token', 'Received', 'Status', 'Name', 'Phone', 'Email', 'Start', 'End', 'Days',
  'Hire £', 'Deposit £', 'Total due £', 'Pricing', 'Vehicle', 'Message', 'Event ID',
  'Accepted', 'Paid', 'Deposit returned', 'Declined'];
const STATUS = {
  NEW: 'New request',
  ACCEPTED: 'Accepted – awaiting payment',
  PAID: 'Paid',
  COMPLETE: 'Complete – deposit returned',
  DECLINED: 'Declined',
};

// ── One-off setup: run this once from the editor ───────────────────────────
function setup() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('SHEET_ID')) {
    const ss = SpreadsheetApp.create(SHEET_NAME);
    ss.getSheets()[0].setName('Bookings').appendRow(COLS);
    ss.getSheets()[0].setFrozenRows(1);
    props.setProperty('SHEET_ID', ss.getId());
  }
  if (!props.getProperty('CALENDAR_ID')) {
    const existing = CalendarApp.getCalendarsByName(CALENDAR_NAME)[0];
    const cal = existing || CalendarApp.createCalendar(CALENDAR_NAME, { color: CalendarApp.Color.GREEN });
    props.setProperty('CALENDAR_ID', cal.getId());
  }
  Logger.log('Sheet: https://docs.google.com/spreadsheets/d/' + props.getProperty('SHEET_ID'));
  Logger.log('Calendar: ' + CALENDAR_NAME);
  ['BANK_ACCOUNT_NAME', 'BANK_SORT_CODE', 'BANK_ACCOUNT_NUMBER'].forEach((k) => {
    if (!props.getProperty(k)) Logger.log('Still to add in Project Settings → Script properties: ' + k);
  });
}

// ── Web endpoints ───────────────────────────────────────────────────────────
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.action === 'availability') return json_(availability_());
  if (p.action === 'review') return reviewPage_(p.id, p.t, p.do);
  return HtmlService.createHtmlOutput('<p>Exeter Trailer Hire bookings service is running.</p>');
}

function doPost(e) {
  let data = {};
  try {
    data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    data = (e && e.parameter) || {};
  }
  const result = handleEnquiry_(data);
  return json_(result);
}

// ── New enquiry from the website ───────────────────────────────────────────
function handleEnquiry_(d) {
  if (d.botcheck || d['bot-field']) return { ok: true }; // spam trap: pretend success
  const clean = (v, n) => String(v || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
  const name = clean(d.name, 100);
  const phone = clean(d.phone, 40);
  const email = clean(d.email, 120);
  const vehicle = clean(d.vehicle, 200);
  const message = clean(d.message, 1000);
  const start = parseISO_(d.start);
  const end = parseISO_(d.end || d.start);
  if (!name || phone.replace(/[^\d+]/g, '').length < 10) return { ok: false, error: 'missing name or phone' };
  if (!start || !end || end < start) return { ok: false, error: 'bad dates' };
  if (daysBetween_(start, end) > MAX_HIRE_DAYS) return { ok: false, error: 'hire too long' };
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: 'bad email' };

  const est = estimate_(start, end);
  const id = 'ETH-' + Utilities.formatDate(new Date(), TZ, 'yyMMdd') + '-' + Math.floor(1000 + Math.random() * 9000);
  const token = 't' + Utilities.getUuid().replace(/-/g, '');
  const row = {
    ID: id, Token: token, Received: new Date(), Status: STATUS.NEW,
    Name: name, Phone: phone, Email: email, Start: iso_(start), End: iso_(end), Days: est.days,
    'Hire £': est.total, 'Deposit £': PRICING.deposit, 'Total due £': est.total + PRICING.deposit,
    Pricing: est.basis, Vehicle: vehicle, Message: message,
  };
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const asText = { Token: 1, Phone: 1, Start: 1, End: 1 };
    sheet_().appendRow(COLS.map((c) => (c in row ? (asText[c] ? "'" + row[c] : row[c]) : '')));
  } finally {
    lock.releaseLock();
  }
  sendOwnerNewRequest_(row);
  return { ok: true, id: id };
}

// ── Owner action page (opened from the email buttons) ──────────────────────
function reviewPage_(id, token, act) {
  const found = findRow_(id, token);
  if (!found) return page_('<h1>Link not recognised</h1><p>This booking link is invalid or out of date.</p>');
  const b = found.data;
  const labels = { accept: 'Accept booking', decline: 'Decline request', paid: 'Mark as paid', returned: 'Mark deposit returned' };
  if (!labels[act]) return page_('<h1>Unknown action</h1>');
  let warn = '';
  if (act === 'accept') {
    const clashes = clashes_(parseISO_(b.Start), parseISO_(b.End), b['Event ID']);
    if (clashes.length) warn = `<p class="warn">⚠️ These dates overlap: ${clashes.map(esc_).join(', ')}</p>`;
  }
  const html = `
    <h1>${esc_(labels[act])}?</h1>
    ${summaryHtml_(b)}
    ${warn}
    <button id="go" onclick="go()">${esc_(labels[act])}</button>
    <p id="out"></p>
    <script>
      function go() {
        var btn = document.getElementById('go');
        btn.disabled = true; btn.textContent = 'Working…';
        google.script.run
          .withSuccessHandler(function (r) { document.getElementById('out').innerHTML = r; btn.style.display = 'none'; })
          .withFailureHandler(function (e) { document.getElementById('out').textContent = 'Something went wrong: ' + e.message; btn.disabled = false; btn.textContent = ${JSON.stringify(labels[act])}; })
          .ownerAction(${JSON.stringify(id)}, ${JSON.stringify(token)}, ${JSON.stringify(act)});
      }
    </script>`;
  return page_(html);
}

/** Called from the owner action page. Returns HTML to show. */
function ownerAction(id, token, act) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const found = findRow_(id, token);
    if (!found) return 'Booking not found.';
    const b = found.data;
    const now = new Date();
    const start = parseISO_(b.Start);
    const end = parseISO_(b.End);

    if (act === 'accept') {
      if (b.Status !== STATUS.NEW) return `Already handled (status: ${esc_(b.Status)}).`;
      const ev = calendar_().createAllDayEvent(`⏳ Awaiting payment – ${b.Name}`, start, addDays_(end, 1), {
        description: eventDescription_(b),
      });
      setCells_(found.row, { Status: STATUS.ACCEPTED, 'Event ID': ev.getId(), Accepted: now });
      clearCache_();
      b.Status = STATUS.ACCEPTED;
      let out = `<p class="ok">✅ Accepted and added to your “${esc_(CALENDAR_NAME)}” calendar.</p>`;
      if (b.Email) {
        sendCustomer_(b.Email, `Your trailer hire is confirmed – ${b.ID}`, customerAcceptedHtml_(b));
        out += `<p>The customer has been emailed the amount due and bank-transfer details.</p>`;
      } else {
        out += `<p>No customer email was given. Send them the payment details:</p>
          <p><a class="btn" href="${whatsappLink_(b.Phone, paymentText_(b))}">Send payment details on WhatsApp</a></p>`;
      }
      if (!bankDetails_()) out += `<p class="warn">Your bank details aren’t set up yet, so the payment message asks the customer to wait for them. Add them in Script properties.</p>`;
      out += `<p>When the money arrives: <a class="btn" href="${actionUrl_(b.ID, b.Token, 'paid')}">Mark as paid</a></p>`;
      return out;
    }

    if (act === 'decline') {
      if (b.Status !== STATUS.NEW) return `Already handled (status: ${esc_(b.Status)}).`;
      setCells_(found.row, { Status: STATUS.DECLINED, Declined: now });
      if (b.Email) sendCustomer_(b.Email, 'Your trailer hire request', customerDeclinedHtml_(b));
      return `<p class="ok">Declined.${b.Email ? ' The customer has been emailed.' : ''}</p>
        ${b.Email ? '' : `<p><a class="btn" href="${whatsappLink_(b.Phone, declineText_(b))}">Let them know on WhatsApp</a></p>`}`;
    }

    if (act === 'paid') {
      if (b.Status !== STATUS.ACCEPTED) return `Can’t mark as paid (status: ${esc_(b.Status)}).`;
      const ev = b['Event ID'] ? calendar_().getEventById(b['Event ID']) : null;
      if (ev) ev.setTitle(`✅ Paid – ${b.Name}`);
      setCells_(found.row, { Status: STATUS.PAID, Paid: now });
      if (b.Email) sendCustomer_(b.Email, `Payment received – ${b.ID}`, customerPaidHtml_(b));
      return `<p class="ok">✅ Marked as paid${ev ? ' and the calendar updated' : ''}.${b.Email ? ' Receipt sent.' : ''}</p>
        <p>After the trailer comes back: <a class="btn" href="${actionUrl_(b.ID, b.Token, 'returned')}">Mark deposit returned</a></p>`;
    }

    if (act === 'returned') {
      if (b.Status !== STATUS.PAID) return `Can’t mark deposit returned (status: ${esc_(b.Status)}).`;
      const ev = b['Event ID'] ? calendar_().getEventById(b['Event ID']) : null;
      if (ev) ev.setTitle(`✔️ Complete – ${b.Name}`);
      setCells_(found.row, { Status: STATUS.COMPLETE, 'Deposit returned': now });
      const review = PropertiesService.getScriptProperties().getProperty('REVIEW_LINK') || '';
      if (b.Email) sendCustomer_(b.Email, 'Thanks for hiring with Exeter Trailer Hire', customerThanksHtml_(b, review));
      return `<p class="ok">✔️ All done. Deposit marked as returned.${b.Email ? ' Thank-you email sent.' : ''}</p>
        ${b.Email ? '' : `<p><a class="btn" href="${whatsappLink_(b.Phone, thanksText_(b, review))}">Send a thank-you on WhatsApp</a></p>`}`;
    }
    return 'Unknown action.';
  } finally {
    lock.releaseLock();
  }
}

// ── Availability for the website calendar ──────────────────────────────────
function availability_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('availability');
  if (hit) return JSON.parse(hit);
  const today = startOfDay_(new Date());
  const until = addDays_(today, 400);
  const busy = {};
  calendar_().getEvents(today, until).forEach((ev) => {
    let d = startOfDay_(ev.getStartTime());
    const endExclusive = ev.isAllDayEvent() ? startOfDay_(ev.getEndTime()) : addDays_(startOfDay_(new Date(ev.getEndTime().getTime() - 1)), 1);
    for (; d < endExclusive; d = addDays_(d, 1)) if (d >= today) busy[iso_(d)] = true;
  });
  const out = { ok: true, busy: Object.keys(busy).sort() };
  cache.put('availability', JSON.stringify(out), 300);
  return out;
}
function clearCache_() {
  CacheService.getScriptCache().remove('availability');
}
function clashes_(start, end, ignoreEventId) {
  return calendar_().getEvents(start, addDays_(end, 1))
    .filter((ev) => ev.getId() !== ignoreEventId)
    .map((ev) => ev.getTitle());
}

// ── Emails ─────────────────────────────────────────────────────────────────
function sendOwnerNewRequest_(b) {
  const to = PropertiesService.getScriptProperties().getProperty('OWNER_EMAIL') || Session.getEffectiveUser().getEmail();
  const html = emailShell_(`
    <h2 style="margin:0 0 12px">New trailer hire request</h2>
    ${summaryHtml_(b)}
    <p style="margin:24px 0">
      ${button_('✅ Accept', actionUrl_(b.ID, b.Token, 'accept'), '#1f4d36')}
      &nbsp; ${button_('❌ Decline', actionUrl_(b.ID, b.Token, 'decline'), '#8a8f8b')}
    </p>
    <p>Call <a href="tel:${esc_(b.Phone)}">${esc_(b.Phone)}</a> ·
       <a href="${whatsappLink_(b.Phone, `Hi ${b.Name}, thanks for your trailer hire enquiry for ${prettyRange_(b)}.`)}">WhatsApp</a>
       ${b.Email ? ` · <a href="mailto:${esc_(b.Email)}">Email</a>` : ''}</p>`);
  const mail = {
    to: to,
    subject: `New hire request: ${b.Name}, ${prettyRange_(b)} (£${b['Hire £']})`,
    htmlBody: html,
    name: `${BUSINESS.name} website`,
  };
  if (b.Email) mail.replyTo = b.Email;
  MailApp.sendEmail(mail);
}
function sendCustomer_(to, subject, html) {
  MailApp.sendEmail({ to: to, subject: subject, htmlBody: emailShell_(html), name: BUSINESS.name });
}
function customerAcceptedHtml_(b) {
  const bank = bankDetails_();
  return `
    <h2 style="margin:0 0 12px">Your trailer hire is confirmed</h2>
    <p>Hi ${esc_(firstName_(b.Name))}, thanks for booking the 16ft car transporter.</p>
    ${summaryHtml_(b, true)}
    <h3>Payment by bank transfer</h3>
    <p>Please pay <strong>£${b['Total due £']}</strong> (hire £${b['Hire £']} + £${b['Deposit £']} refundable deposit) before you collect the trailer.</p>
    ${bank ? bankTableHtml_(bank, b.ID) : `<p>We’ll send our bank details to you shortly. Please use reference <strong>${esc_(b.ID)}</strong>.</p>`}
    <p>Your £${b['Deposit £']} deposit is returned when the trailer comes back on time.</p>
    <p>Any questions, call or WhatsApp ${esc_(BUSINESS.phone)}.</p>`;
}
function customerPaidHtml_(b) {
  return `
    <h2 style="margin:0 0 12px">Payment received – thank you</h2>
    <p>Hi ${esc_(firstName_(b.Name))}, we’ve received your payment of £${b['Total due £']} (reference ${esc_(b.ID)}).</p>
    ${summaryHtml_(b, true)}
    <p>Remember to bring your driving licence when you collect. Any questions, call or WhatsApp ${esc_(BUSINESS.phone)}.</p>`;
}
function customerDeclinedHtml_(b) {
  return `
    <p>Hi ${esc_(firstName_(b.Name))}, thanks for your enquiry. Sorry, the trailer isn’t available for ${esc_(prettyRange_(b))}.</p>
    <p>If other dates would work, have a look at the calendar at <a href="${BUSINESS.site}/#book">${BUSINESS.site.replace('https://', '')}</a> or call ${esc_(BUSINESS.phone)}.</p>`;
}
function customerThanksHtml_(b, review) {
  return `
    <p>Hi ${esc_(firstName_(b.Name))}, thanks for hiring with ${BUSINESS.name}. Your £${b['Deposit £']} deposit has been returned.</p>
    ${review ? `<p>If you have a moment, a quick Google review would really help a small local business:</p><p>${button_('Leave a review', review, '#b4461b')}</p>` : ''}
    <p>Hope to see you again!</p>`;
}

// ── Message text for WhatsApp ──────────────────────────────────────────────
function paymentText_(b) {
  const bank = bankDetails_();
  let t = `Hi ${firstName_(b.Name)}, your trailer hire for ${prettyRange_(b)} is confirmed. Please pay £${b['Total due £']} (hire £${b['Hire £']} + £${b['Deposit £']} refundable deposit) by bank transfer before collection.`;
  if (bank) t += `\nAccount name: ${bank.name}\nSort code: ${bank.sort}\nAccount number: ${bank.number}`;
  t += `\nReference: ${b.ID}\nThanks, ${BUSINESS.name}`;
  return t;
}
function declineText_(b) {
  return `Hi ${firstName_(b.Name)}, thanks for your enquiry. Sorry, the trailer isn't available for ${prettyRange_(b)}. Other dates: ${BUSINESS.site}/#book`;
}
function thanksText_(b, review) {
  return `Hi ${firstName_(b.Name)}, thanks for hiring with ${BUSINESS.name}! Your deposit has been returned.${review ? ` If you have a moment, a Google review would really help: ${review}` : ''}`;
}

// ── HTML helpers ───────────────────────────────────────────────────────────
function summaryHtml_(b, forCustomer) {
  const rows = [
    ['Reference', b.ID],
    ['Dates', `${prettyDate_(b.Start)} – ${prettyDate_(b.End)} (${b.Days} day${b.Days == 1 ? '' : 's'})`],
    ['Hire', `£${b['Hire £']} (${b.Pricing})`],
    ['Deposit', `£${b['Deposit £']} (refundable)`],
    ['Total to pay', `£${b['Total due £']}`],
  ];
  if (!forCustomer) {
    rows.splice(1, 0, ['Name', b.Name], ['Phone', b.Phone], ['Email', b.Email || '—']);
    if (b.Vehicle) rows.push(['Moving', b.Vehicle]);
    if (b.Message) rows.push(['Message', b.Message]);
    rows.push(['Status', b.Status]);
  }
  return `<table style="border-collapse:collapse;font-size:15px">${rows.map(([k, v]) =>
    `<tr><td style="padding:4px 16px 4px 0;color:#5b675f;vertical-align:top">${esc_(k)}</td><td style="padding:4px 0"><strong>${esc_(v)}</strong></td></tr>`).join('')}</table>`;
}
function bankTableHtml_(bank, ref) {
  return `<table style="border-collapse:collapse;font-size:15px;background:#f5f0e6;border-radius:8px">
    ${[['Account name', bank.name], ['Sort code', bank.sort], ['Account number', bank.number], ['Reference', ref]].map(([k, v]) =>
      `<tr><td style="padding:6px 16px;color:#5b675f">${k}</td><td style="padding:6px 16px"><strong>${esc_(v)}</strong></td></tr>`).join('')}
  </table>`;
}
function button_(label, href, bg) {
  return `<a href="${esc_(href)}" style="display:inline-block;padding:12px 22px;border-radius:999px;background:${bg};color:#fff;text-decoration:none;font-weight:600">${esc_(label)}</a>`;
}
function emailShell_(inner) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#16261d;max-width:560px;line-height:1.5">${inner}
    <p style="margin-top:28px;color:#5b675f;font-size:13px">${BUSINESS.name} · ${BUSINESS.phone} · <a href="${BUSINESS.site}">${BUSINESS.site.replace('https://', '')}</a></p></div>`;
}
function page_(inner) {
  return HtmlService.createHtmlOutput(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
    <style>body{font-family:Arial,Helvetica,sans-serif;color:#16261d;background:#f5f0e6;max-width:560px;margin:24px auto;padding:0 16px;line-height:1.5}
    button,.btn{display:inline-block;padding:14px 24px;border:0;border-radius:999px;background:#1f4d36;color:#fff;font-size:16px;font-weight:600;text-decoration:none;cursor:pointer}
    button:disabled{opacity:.6}.ok{color:#1f4d36;font-weight:600}.warn{color:#9a3412;font-weight:600}td{padding:4px 12px 4px 0}</style>
    </head><body>${inner}</body></html>`)
    .setTitle(BUSINESS.name + ' – booking')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
function esc_(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ── Sheet / calendar / settings helpers ────────────────────────────────────
function sheet_() {
  return SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID')).getSheets()[0];
}
function calendar_() {
  return CalendarApp.getCalendarById(PropertiesService.getScriptProperties().getProperty('CALENDAR_ID'));
}
function findRow_(id, token) {
  if (!id || !token) return null;
  const values = sheet_().getDataRange().getValues();
  const header = values[0];
  for (let r = 1; r < values.length; r++) {
    if (values[r][0] === id) {
      const data = {};
      header.forEach((h, i) => (data[h] = values[r][i]));
      if (String(data.Token) !== String(token)) return null;
      data.Start = typeof data.Start === 'string' ? data.Start : iso_(data.Start);
      data.End = typeof data.End === 'string' ? data.End : iso_(data.End);
      return { row: r + 1, data: data };
    }
  }
  return null;
}
function setCells_(rowNumber, updates) {
  const sh = sheet_();
  const header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  Object.keys(updates).forEach((k) => {
    const col = header.indexOf(k) + 1;
    if (col > 0) sh.getRange(rowNumber, col).setValue(updates[k]);
  });
}
function bankDetails_() {
  const p = PropertiesService.getScriptProperties();
  const name = p.getProperty('BANK_ACCOUNT_NAME');
  const sort = p.getProperty('BANK_SORT_CODE');
  const number = p.getProperty('BANK_ACCOUNT_NUMBER');
  return name && sort && number ? { name: name, sort: sort, number: number } : null;
}
function actionUrl_(id, token, act) {
  return `${ScriptApp.getService().getUrl()}?action=review&id=${encodeURIComponent(id)}&t=${encodeURIComponent(token)}&do=${act}`;
}
function whatsappLink_(phone, text) {
  let n = String(phone || '').replace(/[^\d+]/g, '');
  if (n.startsWith('+')) n = n.slice(1);
  else if (n.startsWith('0')) n = '44' + n.slice(1);
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
}
function eventDescription_(b) {
  return [`Ref: ${b.ID}`, `Phone: ${b.Phone}`, b.Email ? `Email: ${b.Email}` : '', `Hire: £${b['Hire £']} (${b.Pricing})`,
    `Deposit: £${b['Deposit £']}`, `Total due: £${b['Total due £']}`, b.Vehicle ? `Moving: ${b.Vehicle}` : '', b.Message ? `Notes: ${b.Message}` : '']
    .filter(Boolean).join('\n');
}
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ── Dates and prices (same rules as the website) ───────────────────────────
function parseISO_(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return d.getMonth() === +m[2] - 1 ? d : null;
}
function iso_(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function addDays_(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}
function startOfDay_(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function daysBetween_(a, b) {
  return Math.round((startOfDay_(b) - startOfDay_(a)) / 86400000) + 1;
}
function estimate_(start, end) {
  const days = daysBetween_(start, end);
  const option = (label, base, baseDays) => {
    const extra = days - baseDays;
    return { days: days, total: base + PRICING.extraDay * extra, basis: extra > 0 ? `${label} + ${extra} extra day${extra > 1 ? 's' : ''}` : label };
  };
  const options = [option('Day rate', PRICING.day, 1)];
  let weekend = false, week = false;
  for (let d = start; d <= end; d = addDays_(d, 1)) {
    if (d.getDay() === 6 && addDays_(d, 1) <= end) weekend = true;
    if (d.getDay() === 1 && addDays_(d, 4) <= end) week = true;
  }
  if (weekend) options.push(option('Weekend rate', PRICING.weekend, 2));
  if (week) options.push(option('Mon–Fri rate', PRICING.weekdays, 5));
  return options.reduce((a, b) => (b.total <= a.total ? b : a));
}
function prettyDate_(s) {
  const d = parseISO_(s);
  return d ? Utilities.formatDate(d, TZ, 'EEE d MMM yyyy') : String(s);
}
function prettyRange_(b) {
  return b.Start === b.End ? prettyDate_(b.Start) : `${prettyDate_(b.Start)} – ${prettyDate_(b.End)}`;
}
function firstName_(n) {
  return String(n || '').trim().split(/\s+/)[0] || 'there';
}
