/* ============================================================
   Poda Barbers — interactions + client-side booking system
   ============================================================ */
(function () {
  'use strict';

  /* ---------- Data ---------- */
  // Durations power the live time-slot engine. Prices are indicative
  // placeholders — the shop confirms exact pricing.
  var SERVICES = [
    { name: 'Custom Cut',          dur: 30, price: 18, icon: '✂', feat: true },
    { name: 'Fade Cut',            dur: 40, price: 20, icon: '⚡', feat: true },
    { name: 'Beard Trim',          dur: 20, price: 12, icon: '🧔', feat: true },
    { name: 'Hot Towel Shave',     dur: 30, price: 22, icon: '🪒', feat: true },
    { name: 'Scissor Cut',         dur: 40, price: 20 },
    { name: 'Razor Cut',           dur: 35, price: 20 },
    { name: 'Buzzcut',             dur: 20, price: 12 },
    { name: "Children's Cut",      dur: 25, price: 14 },
    { name: 'Curly Hair Cut',      dur: 40, price: 22 },
    { name: 'Hair Shape-Up',       dur: 15, price: 8  },
    { name: 'Head Shave',          dur: 30, price: 16 },
    { name: 'Straight Razor Shave',dur: 35, price: 24 },
    { name: 'Shave',               dur: 25, price: 15 },
    { name: 'Beard Maintenance',   dur: 25, price: 15 },
    { name: 'Beard Conditioning',  dur: 20, price: 12 },
    { name: 'Eyebrow Trimming',    dur: 10, price: 6  },
    { name: 'Waxing',              dur: 15, price: 8  },
    { name: 'Shampoo & Condition', dur: 15, price: 8  },
    { name: 'Groom Package',       dur: 60, price: 38 }
  ];

  // Opening hours by weekday (0 = Sun … 6 = Sat), 24h decimal.
  var HOURS = {
    0: { open: 10, close: 16 }, // Sun
    1: { open: 9,  close: 19 }, // Mon
    2: { open: 9,  close: 19 },
    3: { open: 9,  close: 19 },
    4: { open: 9,  close: 19 },
    5: { open: 9,  close: 19 },
    6: { open: 9,  close: 17 }  // Sat
  };
  var SLOT_STEP = 20; // minutes between slot starts
  var STORE_KEY = 'poda_bookings_v1';

  var DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  var $ = function (s, ctx) { return (ctx || document).querySelector(s); };
  var $$ = function (s, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(s)); };

  /* ---------- Small helpers ---------- */
  function fmtTime(mins) {
    var h = Math.floor(mins / 60), m = mins % 60;
    var ap = h >= 12 ? 'pm' : 'am';
    var h12 = h % 12; if (h12 === 0) h12 = 12;
    return h12 + (m ? ':' + String(m).padStart(2, '0') : '') + ap;
  }
  function pad(n) { return String(n).padStart(2, '0'); }
  function dateKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function readStore() { try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { return {}; } }
  function writeStore(o) { try { localStorage.setItem(STORE_KEY, JSON.stringify(o)); } catch (e) {} }

  // Stable pseudo-random 0..1 from a string (so "taken" slots don't jump around).
  function seeded(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return ((h >>> 0) % 1000) / 1000;
  }

  /* ---------- Open-now status ---------- */
  function openStatus(now) {
    now = now || new Date();
    var day = now.getDay();
    var h = HOURS[day];
    var mins = now.getHours() * 60 + now.getMinutes();
    var openM = h.open * 60, closeM = h.close * 60;
    if (mins >= openM && mins < closeM) {
      return { open: true, text: 'Open now · until ' + fmtTime(closeM) };
    }
    // find next opening
    for (var i = 0; i <= 7; i++) {
      var d = (day + i) % 7;
      var hh = HOURS[d];
      if (i === 0 && mins < hh.open * 60) {
        return { open: false, text: 'Opens today at ' + fmtTime(hh.open * 60) };
      }
      if (i > 0) {
        var label = i === 1 ? 'tomorrow' : DOW[d];
        return { open: false, text: 'Opens ' + label + ' at ' + fmtTime(hh.open * 60) };
      }
    }
    return { open: false, text: 'Closed' };
  }

  function renderOpenStatus() {
    var st = openStatus();
    var pill = $('#open-pill'), txt = $('#open-text');
    if (pill && txt) {
      txt.textContent = st.text;
      pill.classList.toggle('is-open', st.open);
      pill.classList.toggle('is-closed', !st.open);
    }
    var today = new Date().getDay();
    $$('#hours-table tr').forEach(function (tr) {
      tr.classList.toggle('today', Number(tr.getAttribute('data-day')) === today);
    });
    // Quick-book card
    var qbToday = $('#qb-today');
    if (qbToday) {
      var h = HOURS[today];
      qbToday.textContent = fmtTime(h.open * 60) + ' – ' + fmtTime(h.close * 60);
    }
    var qbNext = $('#qb-next');
    if (qbNext) {
      var next = firstAvailable();
      qbNext.textContent = next ? next.label : 'Call the shop';
    }
  }

  /* ---------- Slot engine ---------- */
  function slotsFor(date, durationMin) {
    var day = date.getDay();
    var h = HOURS[day];
    if (!h) return [];
    var out = [];
    var start = h.open * 60, end = h.close * 60;
    var now = new Date();
    var isToday = dateKey(date) === dateKey(now);
    var nowMins = now.getHours() * 60 + now.getMinutes();
    var store = readStore();
    var booked = store[dateKey(date)] || [];
    for (var t = start; t + (durationMin || 20) <= end; t += SLOT_STEP) {
      if (isToday && t <= nowMins + 30) continue; // 30-min lead time
      var key = dateKey(date) + '@' + t;
      var taken = booked.indexOf(t) !== -1 || seeded(key) < 0.28; // some pre-booked for realism
      out.push({ mins: t, label: fmtTime(t), taken: taken });
    }
    return out;
  }

  function firstAvailable() {
    var d = new Date();
    for (var i = 0; i < 14; i++) {
      var day = new Date(d.getFullYear(), d.getMonth(), d.getDate() + i);
      var s = slotsFor(day, 30).filter(function (x) { return !x.taken; });
      if (s.length) {
        var when = i === 0 ? 'Today' : (i === 1 ? 'Tomorrow' : DOW[day.getDay()]);
        return { label: when + ' ' + s[0].label, date: day, mins: s[0].mins };
      }
    }
    return null;
  }

  /* ---------- Render menu ---------- */
  function renderServices() {
    var feat = $('#featured-services');
    if (feat) {
      feat.innerHTML = SERVICES.filter(function (s) { return s.feat; }).map(function (s, i) {
        return '<button class="mirror" data-svc="' + s.name + '">' +
          '<span class="mirror-oval">' +
            '<span class="mirror-icon">' + s.icon + '</span>' +
            '<span class="mirror-name">' + s.name + '</span>' +
            '<span class="mirror-price">£' + s.price + '</span>' +
            '<span class="mirror-dur">' + s.dur + ' min</span>' +
            '<span class="mirror-book">Tap to book</span>' +
          '</span>' +
          '<span class="mirror-handle"></span>' +
          '<svg class="mirror-sprig" width="26" height="30" viewBox="0 0 26 30" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M13 0v26"/><path d="M13 8c-4 0-7-2-8-5M13 8c4 0 7-2 8-5M13 15c-4 0-7-2-8-5M13 15c4 0 7-2 8-5M13 22c-4 0-7-2-8-5M13 22c4 0 7-2 8-5"/></svg>' +
        '</button>';
      }).join('');
    }
    var grid = $('#menu-grid');
    if (grid) {
      grid.innerHTML = SERVICES.map(function (s) {
        return '<button class="menu-item" data-svc="' + s.name + '">' +
          '<span><span class="mi-name">' + s.name + '</span><br><span class="mi-dur">' + s.dur + ' min</span></span>' +
          '<span class="mi-dots"></span>' +
          '<span class="mi-price">£' + s.price + '</span>' +
        '</button>';
      }).join('');
    }
  }

  /* ============================================================
     Booking modal
     ============================================================ */
  var modal = $('#booking-modal');
  var state = { service: null, date: null, mins: null };

  function openModal(serviceName) {
    state = { service: null, date: null, mins: null };
    buildServicePicker();
    goStep(1);
    if (serviceName) {
      var svc = SERVICES.filter(function (s) { return s.name === serviceName; })[0];
      if (svc) selectService(svc);
    }
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }
  function closeModal() {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  function goStep(n) {
    $$('.mstep', modal).forEach(function (p) { p.classList.toggle('is-active', Number(p.getAttribute('data-panel')) === n); });
    $$('.step', modal).forEach(function (s) {
      var sn = Number(s.getAttribute('data-step'));
      s.classList.toggle('is-active', sn === n);
      s.classList.toggle('is-done', sn < n);
    });
    var body = $('.modal-body', modal);
    if (body) body.scrollTop = 0;
  }

  function buildServicePicker() {
    var wrap = $('#svc-picker');
    wrap.innerHTML = SERVICES.map(function (s) {
      return '<button class="svc-opt" data-svc="' + s.name + '">' +
        '<span><span class="so-name">' + s.name + '</span><br><span class="so-dur">' + s.dur + ' min</span></span>' +
        '<span class="so-price">£' + s.price + '</span>' +
      '</button>';
    }).join('');
    $$('.svc-opt', wrap).forEach(function (b) {
      b.addEventListener('click', function () {
        var svc = SERVICES.filter(function (s) { return s.name === b.getAttribute('data-svc'); })[0];
        selectService(svc);
      });
    });
  }

  function selectService(svc) {
    state.service = svc;
    $('#dt-sub').textContent = svc.name + ' · ' + svc.dur + ' min · £' + svc.price;
    buildDateStrip();
    goStep(2);
  }

  function buildDateStrip() {
    var strip = $('#date-strip');
    var today = new Date();
    var html = '';
    for (var i = 0; i < 14; i++) {
      var d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
      html += '<button class="date-cell" data-i="' + i + '">' +
        '<span class="dc-dow">' + (i === 0 ? 'Today' : DOW[d.getDay()]) + '</span>' +
        '<span class="dc-num">' + d.getDate() + '</span>' +
        '<span class="dc-mon">' + MON[d.getMonth()] + '</span>' +
      '</button>';
    }
    strip.innerHTML = html;
    $$('.date-cell', strip).forEach(function (c) {
      c.addEventListener('click', function () {
        $$('.date-cell', strip).forEach(function (x) { x.classList.remove('is-active'); });
        c.classList.add('is-active');
        var i = Number(c.getAttribute('data-i'));
        var d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
        selectDate(d);
      });
    });
    // auto-select first day with availability
    var first = 0;
    for (var j = 0; j < 14; j++) {
      var dd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + j);
      if (slotsFor(dd, state.service.dur).some(function (s) { return !s.taken; })) { first = j; break; }
    }
    var cell = strip.children[first];
    if (cell) cell.click();
  }

  function selectDate(d) {
    state.date = d; state.mins = null;
    var label = DOW[d.getDay()] + ' ' + d.getDate() + ' ' + MON[d.getMonth()];
    $('#slots-day-label').textContent = label;
    var slots = slotsFor(d, state.service.dur);
    var wrap = $('#slots');
    if (!slots.length) {
      wrap.innerHTML = '<p class="slots-empty">Closed this day — please pick another date.</p>';
      return;
    }
    var avail = slots.filter(function (s) { return !s.taken; });
    if (!avail.length) {
      wrap.innerHTML = '<p class="slots-empty">Fully booked — try another date or call 01273 568126.</p>';
      return;
    }
    wrap.innerHTML = slots.map(function (s) {
      return '<button class="slot' + (s.taken ? ' is-taken' : '') + '" data-mins="' + s.mins + '"' + (s.taken ? ' disabled' : '') + '>' + s.label + '</button>';
    }).join('');
    $$('.slot', wrap).forEach(function (b) {
      if (b.classList.contains('is-taken')) return;
      b.addEventListener('click', function () {
        state.mins = Number(b.getAttribute('data-mins'));
        showDetails();
      });
    });
  }

  function showDetails() {
    var d = state.date;
    var when = DOW[d.getDay()] + ' ' + d.getDate() + ' ' + MON[d.getMonth()] + ' · ' + fmtTime(state.mins);
    $('#summary-line').innerHTML = '<strong>' + state.service.name + '</strong> · ' + state.service.dur + ' min · £' + state.service.price + '<br>' + when;
    $('#form-error').hidden = true;
    goStep(3);
  }

  function makeRef() {
    return 'PB-' + Math.random().toString(36).slice(2, 6).toUpperCase() + Math.floor(Math.random() * 90 + 10);
  }

  function confirmBooking(data) {
    var d = state.date;
    // persist so the slot shows as taken next time
    var store = readStore();
    var k = dateKey(d);
    store[k] = store[k] || [];
    if (store[k].indexOf(state.mins) === -1) store[k].push(state.mins);
    writeStore(store);

    var ref = makeRef();
    state.ref = ref;
    var when = DOW[d.getDay()] + ' ' + d.getDate() + ' ' + MON[d.getMonth()] + ' ' + d.getFullYear() + ' · ' + fmtTime(state.mins);
    $('#confirm-card').innerHTML =
      row('Reference', ref, 'cc-ref') +
      row('Service', state.service.name + ' (' + state.service.dur + ' min)') +
      row('When', when) +
      row('Name', data.name) +
      row('Phone', data.phone) +
      row('Estimated', '£' + state.service.price);
    goStep(4);

    function row(l, v, cls) {
      return '<div class="cc-row ' + (cls || '') + '"><span class="cc-label">' + l + '</span><span class="cc-value">' + v + '</span></div>';
    }
  }

  function downloadICS() {
    var d = state.date;
    var start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(state.mins / 60), state.mins % 60);
    var end = new Date(start.getTime() + state.service.dur * 60000);
    function z(dt) { return dt.getUTCFullYear() + pad(dt.getUTCMonth() + 1) + pad(dt.getUTCDate()) + 'T' + pad(dt.getUTCHours()) + pad(dt.getUTCMinutes()) + '00Z'; }
    var ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Poda Barbers//Booking//EN', 'BEGIN:VEVENT',
      'UID:' + (state.ref || makeRef()) + '@podabarbers',
      'DTSTAMP:' + z(new Date()), 'DTSTART:' + z(start), 'DTEND:' + z(end),
      'SUMMARY:Poda Barbers — ' + state.service.name,
      'DESCRIPTION:Appointment at Poda Barbers. Ref ' + (state.ref || '') + '. Call 01273 568126 to change.',
      'LOCATION:Poda Barbers, Hove, East Sussex', 'END:VEVENT', 'END:VCALENDAR'
    ].join('\r\n');
    var blob = new Blob([ics], { type: 'text/calendar' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'poda-barbers-appointment.ics';
    document.body.appendChild(a); a.click(); a.remove();
  }

  /* ---------- Wire up ---------- */
  function init() {
    renderServices();
    renderOpenStatus();
    setInterval(renderOpenStatus, 60000);

    // any [data-book] opens the modal
    document.addEventListener('click', function (e) {
      var bookBtn = e.target.closest('[data-book]');
      if (bookBtn) { e.preventDefault(); openModal(); return; }

      var svcBtn = e.target.closest('[data-svc]');
      if (svcBtn && !e.target.closest('#svc-picker')) { e.preventDefault(); openModal(svcBtn.getAttribute('data-svc')); return; }

      if (e.target.closest('[data-close]')) { closeModal(); return; }

      var goto = e.target.closest('[data-goto]');
      if (goto) { goStep(Number(goto.getAttribute('data-goto'))); return; }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal.classList.contains('is-open')) closeModal();
    });

    var form = $('#book-form');
    if (form) form.addEventListener('submit', function (e) {
      e.preventDefault();
      var fd = new FormData(form);
      var name = (fd.get('name') || '').trim();
      var phone = (fd.get('phone') || '').trim();
      var err = $('#form-error');
      if (!name || !phone) { err.textContent = 'Please add your name and phone number.'; err.hidden = false; return; }
      if (!/[0-9]{6,}/.test(phone.replace(/\s/g, ''))) { err.textContent = 'Please enter a valid phone number.'; err.hidden = false; return; }
      confirmBooking({ name: name, phone: phone, email: fd.get('email'), notes: fd.get('notes') });
      form.reset();
    });

    var ics = $('#ics-btn');
    if (ics) ics.addEventListener('click', downloadICS);

    // mobile nav
    var toggle = $('#nav-toggle'), nav = $('#main-nav');
    if (toggle && nav) {
      toggle.addEventListener('click', function () {
        var open = nav.classList.toggle('open');
        toggle.classList.toggle('open', open);
        toggle.setAttribute('aria-expanded', String(open));
      });
      $$('a', nav).forEach(function (a) { a.addEventListener('click', function () { nav.classList.remove('open'); toggle.classList.remove('open'); }); });
    }

    var y = $('#year'); if (y) y.textContent = new Date().getFullYear();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
