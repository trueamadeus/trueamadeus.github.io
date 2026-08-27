/* ══════════════════════════════════════════════════════════════════════
   ЧИТАЛКА. Ванильный JS, без зависимостей, ~7 КБ.

   Правило: без скрипта страница обязана читаться полностью. Всё ниже —
   удобства поверх готового текста, а не условие его показа. Текст, тема
   по системной настройке, содержание и переходы между главами работают
   при выключенном JS.

   Хранилище — localStorage, всегда в try/catch: приватное окно, запрет
   на сайт-данные и превью-режимы бросают исключение прямо на доступе
   к объекту, а не на чтении ключа.
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var KEY = 'ta:';
  var root = document.documentElement;

  /* ------------------------------------------------------- хранилище -- */
  function get(k, dflt) {
    try {
      var v = localStorage.getItem(KEY + k);
      return v === null ? dflt : v;
    } catch (e) { return dflt; }
  }
  function set(k, v) {
    try { localStorage.setItem(KEY + k, v); } catch (e) {}
  }
  function del(k) {
    try { localStorage.removeItem(KEY + k); } catch (e) {}
  }

  /* ----------------------------------------------------- настройки ---- */
  /* Значения уже применены встроенным в <head> загрузчиком — до первой
     отрисовки, чтобы не мигало. Здесь только повторное применение при
     переключении и разметка активных кнопок. */
  var PREFS = {
    theme:   { attr: 'data-theme',   dflt: '',       vals: ['', 'light', 'sepia', 'dark'] },
    font:    { attr: 'data-font',    dflt: '',       vals: ['', 'serif', 'sans'] },
    measure: { attr: 'data-measure', dflt: 'normal', vals: ['narrow', 'normal', 'wide'] },
    just:    { attr: 'data-just',    dflt: '0',      vals: ['0', '1'] }
  };

  function apply(name, value) {
    var p = PREFS[name];
    if (!p) return;
    /* Пустая строка = «как в системе»: атрибут снимается, и решает
       @media (prefers-color-scheme). Так же устроена тема книги. */
    if (value === '') root.removeAttribute(p.attr);
    else root.setAttribute(p.attr, value);
    set(name, value);
    mark(name, value);
  }

  function mark(name, value) {
    var btns = document.querySelectorAll('.chip[data-pref="' + name + '"]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].setAttribute('aria-pressed',
        btns[i].getAttribute('data-val') === value ? 'true' : 'false');
    }
  }

  var SIZE_MIN = 85, SIZE_MAX = 150, SIZE_STEP = 5;

  function setSize(pct) {
    pct = Math.max(SIZE_MIN, Math.min(SIZE_MAX, pct));
    /* Ставится ПЕРЕМЕННАЯ, а не font-size напрямую: корневой размер —
       произведение ползунка на множитель гарнитуры (см. site.css), и
       прямое присваивание затёрло бы компенсацию роста строчных. */
    root.style.setProperty('--fs', pct / 100);
    set('size', pct);
    var out = document.getElementById('size-out');
    if (out) out.textContent = pct + '%';
    return pct;
  }

  /* --------------------------------------------------------- панели --- */
  function panel(btnId, panelId) {
    var btn = document.getElementById(btnId);
    var box = document.getElementById(panelId);
    if (!btn || !box) return null;
    function close() {
      box.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
    }
    function open() {
      closeAll(box);
      box.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
    }
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      box.hidden ? open() : close();
    });
    box.addEventListener('click', function (e) { e.stopPropagation(); });
    return { close: close, box: box };
  }

  var panels = [];
  function closeAll(except) {
    for (var i = 0; i < panels.length; i++) {
      if (panels[i] && panels[i].box !== except) panels[i].close();
    }
  }

  /* ═══════════════════════════════════════════════════════════ старт ═ */
  document.addEventListener('DOMContentLoaded', function () {

    /* --- восстановление отметок в интерфейсе --- */
    for (var name in PREFS) {
      if (Object.prototype.hasOwnProperty.call(PREFS, name)) {
        mark(name, get(name, PREFS[name].dflt));
      }
    }
    var size = parseInt(get('size', '100'), 10) || 100;
    var out = document.getElementById('size-out');
    if (out) out.textContent = size + '%';

    /* --- кнопки настроек --- */
    var chips = document.querySelectorAll('.chip[data-pref]');
    for (var i = 0; i < chips.length; i++) {
      chips[i].addEventListener('click', function () {
        apply(this.getAttribute('data-pref'), this.getAttribute('data-val'));
      });
    }
    var minus = document.getElementById('size-minus');
    var plus = document.getElementById('size-plus');
    if (minus) minus.addEventListener('click', function () {
      size = setSize(size - SIZE_STEP);
    });
    if (plus) plus.addEventListener('click', function () {
      size = setSize(size + SIZE_STEP);
    });

    panels.push(panel('btn-prefs', 'prefs'));
    panels.push(panel('btn-toc', 'toc'));
    document.addEventListener('click', function () { closeAll(null); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeAll(null);
    });

    /* --- полоса прочитанного, прячущаяся шапка --- */
    var bar = document.getElementById('bar');
    var prog = document.getElementById('progress');
    var ticking = false;

    function frame() {
      var y = window.pageYOffset;
      var h = document.documentElement.scrollHeight - window.innerHeight;
      var ratio = h > 0 ? y / h : 0;

      if (prog) prog.style.width = (ratio * 100).toFixed(2) + '%';

      /* ШАПКА НЕ ПРЯЧЕТСЯ. Раньше пряталась при движении вниз — ради
         чистого поля чтения. Плата оказалась выше выгоды: чтобы открыть
         настройки или содержание, требовался лишний жест вверх, а на
         телефоне этот жест ещё и вызывает адресную строку браузера,
         которая меняет высоту окна и налезает на всплывающую панель.
         Навигация ломалась ровно тогда, когда понадобилась.
         Осталась только тонкая черта снизу при отрыве от начала. */
      if (bar) bar.classList.toggle('scrolled', y > 4);

      savePos(ratio);
      ticking = false;
    }
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(frame); }
    }, { passive: true });

    /* --- память места --- */
    var slug = document.body.getAttribute('data-slug') || '';
    var title = document.body.getAttribute('data-title') || '';
    var saveTimer = null;

    function savePos(ratio) {
      if (!slug || ratio <= 0) return;
      if (saveTimer) return;
      saveTimer = setTimeout(function () {
        saveTimer = null;
        set('pos:' + slug, ratio.toFixed(4));
        if (ratio > 0.02 && ratio < 0.985) {
          set('last', JSON.stringify({ slug: slug, title: title, ratio: ratio }));
        } else if (ratio >= 0.985) {
          del('last');
        }
      }, 700);
    }

    /* Возврат к месту предлагается, а не выполняется молча: читатель мог
       прийти из поиска на конкретный раздел, и прыжок был бы кражей. */
    var saved = parseFloat(get('pos:' + slug, '0'));
    if (slug && saved > 0.02 && saved < 0.985 && !location.hash) {
      var pill = document.createElement('button');
      pill.id = 'resume';
      pill.type = 'button';
      pill.innerHTML = '<span>Продолжить · ' + Math.round(saved * 100) +
                       '%</span><span class="x" aria-hidden="true">✕</span>';
      pill.setAttribute('aria-label', 'Вернуться к месту остановки');
      document.body.appendChild(pill);
      var kill = function () { if (pill.parentNode) pill.parentNode.removeChild(pill); };
      pill.addEventListener('click', function (e) {
        if (e.target.classList.contains('x')) { kill(); return; }
        var h = document.documentElement.scrollHeight - window.innerHeight;
        window.scrollTo({ top: h * saved, behavior: 'smooth' });
        kill();
      });
      setTimeout(kill, 12000);
    }

    /* --- «продолжить» на главной --- */
    var hook = document.getElementById('resume-hook');
    if (hook) {
      try {
        var rec = JSON.parse(get('last', 'null'));
        if (rec && rec.slug && rec.title) {
          var a = document.createElement('a');
          a.className = 'btn ghost';
          a.href = '' + rec.slug + '/';
          a.textContent = 'Продолжить: ' + rec.title + ' · ' +
                          Math.round(rec.ratio * 100) + '%';
          hook.appendChild(a);
        }
      } catch (e) {}
    }

    /* --- стрелки между главами --- */
    document.addEventListener('keydown', function (e) {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      var t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      var sel = e.key === 'ArrowLeft' ? '.pager .prev'
              : e.key === 'ArrowRight' ? '.pager .next' : null;
      if (!sel) return;
      var link = document.querySelector(sel);
      if (link && link.href) { location.href = link.href; }
    });

    frame();
  });
})();
