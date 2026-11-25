/*
 * GoTrack! – Oberfläche.
 * Alle Texte aus Nutzerdaten werden ausschließlich per textContent eingefügt (kein innerHTML).
 */
(function () {
  'use strict';

  const L = window.GoLogic;
  const I18N = window.GoI18n;
  const APP_NAME = 'GoTrack!';
  const STORAGE_KEY = 'gotrack-data';

  const ACCENTS = ['#4f7cff', '#7c5cff', '#e0457b', '#f2704a', '#e3a21a', '#2bab6f', '#1fa3b8', '#5b6577'];
  // Bewusst nur einfache Emojis (keine zusammengesetzten Familien-/Hautton-Folgen), damit nichts zerschnitten wird.
  const EMOJIS = [
    '🎯', '⭐', '✨', '🏆', '🚀', '💡', '🎉', '🎁', '💎', '🔥',
    '✈️', '🌍', '🏝️', '🗺️', '🧳', '🚗', '🚆', '🚢', '⛰️', '🏕️', '🌅', '🗼',
    '🏠', '🔑', '🛋️', '❤️', '💍', '👶', '🐶', '🐱', '🎂', '🥂',
    '💼', '💰', '📈', '🎓', '📚', '✏️', '💻', '📱', '🛠️', '🧠',
    '💪', '🏃', '🚴', '🏊', '🧘', '⚽', '🏀', '🎾', '⛷️', '🥗', '😴', '🩺',
    '🎨', '🎵', '🎸', '🎹', '🎤', '🎬', '📷', '📖', '🎮', '🧩', '🍳', '🧶',
    '🌱', '🌳', '🌸', '☀️', '🌙', '❄️', '💧', '🍀', '🦋', '🐾', '♻️', '🌈',
    '✅', '📌', '🏁', '🔔', '🙏', '💬', '🔒', '❓'
  ];

  const state = {
    data: null,
    lang: 'en',
    view: { type: 'overview', id: null },
    historyFilter: 'all',
    expanded: new Set(), // aufgeklappte Ziele
    expandedSteps: new Set(), // aufgeklappte Schritt-Details
    focusAddStep: null,
    focusNewGoal: false,
    focusEntry: null,
    scrollToGoal: null,
    saveChain: Promise.resolve(),
    pendingTimer: null,
    readOnly: false,
    info: null
  };

  // ---------- Übersetzung ----------

  const t = (key, params) => I18N.translate(state.lang, key, params);
  const count = (kind, n) => t('count.' + kind, { n });
  const systemLocale = () => (state.info && state.info.locale) || navigator.language || 'en';

  function dateLocale() {
    if (state.lang === 'de') return 'de-DE';
    return /^en/i.test(systemLocale()) ? systemLocale() : 'en-GB';
  }

  function fmtDate(iso) {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(dateLocale(), { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function applyLanguage() {
    const setting = state.data ? state.data.settings.language : 'auto';
    state.lang = L.resolveLanguage(setting, systemLocale());
    document.documentElement.lang = state.lang;
  }

  const errorText = (e) => (e && e.code && I18N.dictionaries.en['err.' + e.code] ? t('err.' + e.code) : (e && e.message) || String(e));

  // ---------- Speicher: Electron (Datei) oder Browser (localStorage, z. B. für eine spätere Web-Version) ----------

  const storage = window.api
    ? {
        load: () => window.api.load(),
        save: (text) => window.api.save(text),
        exportFile: (text, name, labels) => window.api.exportFile(text, name, labels),
        importFile: (labels) => window.api.importFile(labels)
      }
    : {
        load: async () => ({ text: localStorage.getItem(STORAGE_KEY), notice: null }),
        save: async (text) => {
          localStorage.setItem(STORAGE_KEY, text);
          return true;
        },
        exportFile: async (text, name) => {
          const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
          const a = document.createElement('a');
          a.href = url;
          a.download = name;
          document.body.append(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          return { ok: true, path: name };
        },
        importFile: () =>
          new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json,application/json';
            input.addEventListener('change', async () => {
              const file = input.files && input.files[0];
              if (!file) return resolve({ ok: false, canceled: true });
              try {
                resolve({ ok: true, text: await file.text() });
              } catch (e) {
                resolve({ ok: false, error: 'read_failed', detail: String(e && e.message) });
              }
            });
            input.addEventListener('cancel', () => resolve({ ok: false, canceled: true }));
            input.click();
          })
      };

  // ---------- kleine Helfer ----------

  function append(node, children) {
    for (const child of children) {
      if (child === null || child === undefined || child === false) continue;
      if (Array.isArray(child)) append(node, child);
      else node.append(child);
    }
  }

  function h(tag, props, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props || {})) {
      if (value === null || value === undefined || value === false) continue;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key === 'style') for (const [k, v] of Object.entries(value)) node.style.setProperty(k, v);
      else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
      else if (key === 'value' || key === 'checked' || key === 'disabled') node[key] = value;
      else node.setAttribute(key, value === true ? '' : String(value));
    }
    append(node, children);
    return node;
  }

  const pad = (n) => String(n).padStart(2, '0');

  function dateStamp() {
    const d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  let toastTimer = null;
  function toast(message) {
    const el = document.getElementById('toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 4500);
  }

  const findCategory = (id) => state.data.categories.find((c) => c.id === id);
  const listName = () => state.data.settings.listName || APP_NAME;

  // ---------- Speichern ----------

  function saveNow() {
    clearTimeout(state.pendingTimer);
    state.pendingTimer = null;
    if (state.readOnly) return;
    const text = JSON.stringify(state.data);
    state.saveChain = state.saveChain
      .then(() => storage.save(text))
      .catch((err) => toast(t('err.save', { msg: err && err.message ? err.message : String(err) })));
  }

  function saveSoon() {
    clearTimeout(state.pendingTimer);
    state.pendingTimer = setTimeout(saveNow, 400);
  }

  window.addEventListener('pagehide', () => {
    if (state.pendingTimer) saveNow();
  });

  function commit() {
    saveNow();
    render();
  }

  // ---------- Design anwenden ----------

  function applySettings() {
    const s = state.data.settings;
    const root = document.documentElement;
    const theme = s.theme === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : s.theme;
    root.dataset.theme = theme;
    root.dataset.density = s.density;
    root.style.setProperty('--accent', s.accent);
    root.style.setProperty('--accent-contrast', L.readableTextColor(s.accent));
    root.style.setProperty('--font-scale', String(s.fontScale));
    root.style.setProperty('--radius', s.radius + 'px');
  }

  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (state.data && state.data.settings.theme === 'system') applySettings();
  });

  // ---------- Dialoge ----------

  // buttons: [{ label, kind, value, submit }]. Ein "submit"-Button löst auch Enter aus und liefert getResult().
  // getResult() darf undefined zurückgeben, wenn die Eingabe noch ungültig ist (Dialog bleibt dann offen).
  // Rückgabe: Ergebnis, der value des gedrückten Buttons – oder null bei Escape/Klick daneben.
  function modal({ title, message, content, buttons, getResult }) {
    return new Promise((resolve) => {
      if (state.drawerOpen) {
        state.drawerOpen = false;
        document.getElementById('app').classList.remove('drawer-open');
      }
      let finished = false;
      let downOnBackdrop = false;
      const dlg = h('dialog', { class: 'modal' });
      const finish = (value) => {
        if (finished) return;
        finished = true;
        dlg.close();
        dlg.remove();
        resolve(value);
      };
      const buttonEls = buttons.map((b) =>
        h('button', {
          type: b.submit ? 'submit' : 'button',
          class: 'btn ' + (b.kind || ''),
          text: b.label,
          onClick: b.submit ? null : () => finish(b.value === undefined ? null : b.value)
        })
      );
      const form = h(
        'form',
        {
          class: 'modal-form',
          onSubmit: (e) => {
            e.preventDefault();
            const result = getResult ? getResult() : true;
            if (result === undefined) return;
            finish(result);
          }
        },
        h('h2', { text: title }),
        message ? h('p', { class: 'muted', text: message }) : null,
        content || null,
        h('div', { class: 'modal-actions' }, buttonEls)
      );
      dlg.append(form);
      dlg.addEventListener('cancel', (e) => {
        e.preventDefault();
        finish(null);
      });
      dlg.addEventListener('mousedown', (e) => {
        downOnBackdrop = e.target === dlg;
      });
      dlg.addEventListener('click', (e) => {
        if (e.target === dlg && downOnBackdrop) finish(null);
      });
      document.body.append(dlg);
      dlg.showModal();
    });
  }

  const cancelButton = () => ({ label: t('common.cancel'), value: null });

  function field(label, control) {
    return h('label', { class: 'field' }, h('span', { class: 'field-label', text: label }), control);
  }

  function alertBox(title, message) {
    return modal({ title, message, buttons: [{ label: t('common.ok'), kind: 'primary', value: true }] });
  }

  async function confirmBox({ title, message, confirmLabel, danger }) {
    const result = await modal({
      title,
      message,
      buttons: [
        { label: t('common.cancel'), value: false },
        { label: confirmLabel || t('common.ok'), kind: danger ? 'danger solid' : 'primary', submit: true }
      ]
    });
    return result === true;
  }

  // Rückgabe: Text, null bei Abbruch. Mit allowEmpty ist auch '' (leer) ein gültiges Ergebnis.
  function askText({ title, label, value, placeholder, confirmLabel, allowEmpty, maxlength, multiline }) {
    const attrs = { maxlength: String(maxlength || 300), value: value || '', placeholder: placeholder || '' };
    const input = multiline ? h('textarea', { rows: '5', ...attrs }) : h('input', { type: 'text', ...attrs });
    return modal({
      title,
      content: field(label, input),
      buttons: [cancelButton(), { label: confirmLabel || t('common.save'), kind: 'primary', submit: true }],
      getResult: () => {
        const text = input.value.trim();
        if (!text && !allowEmpty) {
          input.focus();
          return undefined;
        }
        return text;
      }
    });
  }

  // Symbol einer Kategorie: Emoji oder – wenn leer – ein Punkt wie bei einer Aufzählung.
  function iconEl(icon, className) {
    if (icon) return h('span', { class: className, text: icon, 'aria-hidden': 'true' });
    return h('span', { class: className + ' icon-dot-wrap', 'aria-hidden': 'true' }, h('span', { class: 'icon-dot' }));
  }

  function categoryDialog(existing) {
    const defaultColor = ACCENTS[state.data.categories.length % ACCENTS.length];
    let icon = existing ? existing.icon : '🎯';

    const name = h('input', { type: 'text', maxlength: '80', value: existing ? existing.name : '', placeholder: t('cat.namePlaceholder') });
    const color = h('input', { type: 'color', value: existing ? existing.color : defaultColor, 'aria-label': t('cat.color') });
    const preview = h('span', { class: 'icon-preview' });
    const iconInput = h('input', {
      type: 'text',
      class: 'icon-input',
      value: icon,
      autocomplete: 'off',
      spellcheck: 'false',
      placeholder: '•',
      'aria-label': t('cat.symbol'),
      onInput: (e) => {
        // Immer nur EIN Zeichen: ein neu getipptes ersetzt das alte, Eingefügtes wird auf das erste gekürzt.
        icon = L.singleIconFromInput(icon, e.target.value);
        e.target.value = icon;
        refreshIcon();
      }
    });
    const grid = h(
      'div',
      { class: 'emoji-grid' },
      EMOJIS.map((e) =>
        h('button', {
          type: 'button',
          class: 'emoji-btn',
          text: e,
          'aria-label': t('cat.symbolAria', { e }),
          onClick: () => {
            icon = e;
            iconInput.value = e;
            refreshIcon();
          }
        })
      )
    );
    function refreshIcon() {
      preview.replaceChildren(iconEl(icon, 'preview-glyph'));
      grid.querySelectorAll('.emoji-btn').forEach((b) => b.classList.toggle('active', b.textContent === icon));
    }
    const noSymbol = h('button', {
      type: 'button',
      class: 'btn small',
      text: t('cat.noSymbol'),
      onClick: () => {
        icon = '';
        iconInput.value = '';
        refreshIcon();
      }
    });
    refreshIcon();

    return modal({
      title: existing ? t('cat.editTitle') : t('cat.newTitle'),
      content: h(
        'div',
        { class: 'settings-grid' },
        field(t('cat.name'), name),
        h(
          'div',
          { class: 'field' },
          h('span', { class: 'field-label', text: t('cat.symbol') }),
          h('div', { class: 'row center' }, preview, iconInput, noSymbol, h('div', { class: 'spacer' }), color)
        ),
        h('div', { class: 'field' }, h('span', { class: 'field-label', text: t('cat.symbolHint') }), grid)
      ),
      buttons: [cancelButton(), { label: existing ? t('common.save') : t('common.create'), kind: 'primary', submit: true }],
      getResult: () => {
        const n = name.value.trim();
        if (!n) {
          name.focus();
          return undefined;
        }
        return { name: n, icon: L.firstGrapheme(icon), color: color.value };
      }
    });
  }

  function goalDialog(goal) {
    const title = h('input', { type: 'text', maxlength: '200', value: goal.title });
    return modal({
      title: t('goal.editTitle'),
      content: h('div', { class: 'settings-grid' }, field(t('goal.editLabel'), title)),
      buttons: [cancelButton(), { label: t('common.save'), kind: 'primary', submit: true }],
      getResult: () => {
        const v = title.value.trim();
        if (!v) {
          title.focus();
          return undefined;
        }
        return { title: v };
      }
    });
  }

  function entryDialog(entry) {
    const text = h('textarea', { rows: '6', maxlength: '5000', value: entry.text });
    const date = h('input', { type: 'date', value: L.dateInputValue(entry.at) });
    return modal({
      title: t('notes.editTitle'),
      content: h('div', { class: 'settings-grid' }, field(t('notes.textLabel'), text), field(t('notes.dateLabel'), date)),
      buttons: [cancelButton(), { label: t('common.save'), kind: 'primary', submit: true }],
      getResult: () => {
        const v = text.value.trim();
        if (!v) {
          text.focus();
          return undefined;
        }
        return { text: v, at: L.isoFromDateInput(date.value, entry.at) || entry.at };
      }
    });
  }

  async function openSettings() {
    const s = state.data.settings;
    let reopen = false;

    const selectEl = (options, current, onChange) => {
      const sel = h(
        'select',
        { onChange: (e) => onChange(e.target.value, sel) },
        options.map(([v, text]) => h('option', { value: v, text }))
      );
      sel.value = current;
      return sel;
    };

    // Sprachwechsel: Dialog schließt und öffnet sich in der neuen Sprache erneut.
    const langSel = selectEl(
      [
        ['auto', t('settings.langAuto')],
        ['de', 'Deutsch'],
        ['en', 'English']
      ],
      s.language,
      (v, sel) => {
        s.language = v;
        applyLanguage();
        reopen = true;
        sel.form.requestSubmit();
      }
    );

    const nameInput = h('input', {
      type: 'text',
      maxlength: '40',
      value: s.listName,
      placeholder: APP_NAME,
      onInput: (e) => {
        s.listName = e.target.value;
      }
    });

    const themeSel = selectEl(
      [
        ['system', t('theme.system')],
        ['light', t('theme.light')],
        ['dark', t('theme.dark')]
      ],
      s.theme,
      (v) => {
        s.theme = v;
        applySettings();
      }
    );
    const densitySel = selectEl(
      [
        ['compact', t('density.compact')],
        ['normal', t('density.normal')],
        ['roomy', t('density.roomy')]
      ],
      s.density,
      (v) => {
        s.density = v;
        applySettings();
      }
    );

    const swatches = h('div', { class: 'swatches' });
    const accentInput = h('input', {
      type: 'color',
      value: s.accent,
      'aria-label': t('settings.accentCustom'),
      onInput: (e) => setAccent(e.target.value)
    });
    function markSwatches() {
      swatches.querySelectorAll('.swatch').forEach((b, i) => b.classList.toggle('active', ACCENTS[i] === s.accent));
    }
    function setAccent(color) {
      s.accent = color;
      applySettings();
      markSwatches();
    }
    ACCENTS.forEach((c) =>
      swatches.append(
        h('button', {
          type: 'button',
          class: 'swatch',
          style: { '--sw': c },
          title: c,
          'aria-label': t('settings.accentAria', { c }),
          onClick: () => {
            setAccent(c);
            accentInput.value = c;
          }
        })
      )
    );

    const fontLabel = h('span', { class: 'field-label' });
    const radiusLabel = h('span', { class: 'field-label' });
    const fontRange = h('input', {
      type: 'range',
      min: '0.85',
      max: '1.4',
      step: '0.05',
      value: String(s.fontScale),
      onInput: (e) => {
        s.fontScale = Number(e.target.value);
        applySettings();
        updateLabels();
      }
    });
    const radiusRange = h('input', {
      type: 'range',
      min: '0',
      max: '24',
      step: '2',
      value: String(s.radius),
      onInput: (e) => {
        s.radius = Number(e.target.value);
        applySettings();
        updateLabels();
      }
    });
    function updateLabels() {
      fontLabel.textContent = t('settings.font', { n: Math.round(s.fontScale * 100) });
      radiusLabel.textContent = t('settings.radius', { n: s.radius });
    }
    updateLabels();
    markSwatches();

    const resetBtn = h('button', {
      type: 'button',
      class: 'btn small',
      text: t('settings.reset'),
      onClick: () => {
        const keep = { language: s.language, listName: s.listName };
        Object.assign(s, L.DEFAULT_SETTINGS, keep);
        applySettings();
        themeSel.value = s.theme;
        densitySel.value = s.density;
        accentInput.value = s.accent;
        fontRange.value = String(s.fontScale);
        radiusRange.value = String(s.radius);
        updateLabels();
        markSwatches();
      }
    });

    const where = window.api && window.api.mobile
      ? [h('p', { class: 'path', text: t('settings.dataFile', { path: (state.info && state.info.dataPath) || '' }) })]
      : window.api
      ? [
          h('p', { class: 'path', text: t('settings.dataFile', { path: (state.info && state.info.dataPath) || '' }) }),
          h('button', { type: 'button', class: 'btn small', text: t('settings.showFolder'), onClick: () => window.api.showDataFolder() })
        ]
      : [h('p', { class: 'path', text: t('settings.dataBrowser') })];

    const content = h(
      'div',
      { class: 'settings-grid' },
      field(t('settings.language'), langSel),
      field(t('settings.listName'), nameInput),
      field(t('settings.theme'), themeSel),
      h('div', { class: 'field' }, h('span', { class: 'field-label', text: t('settings.accent') }), h('div', { class: 'row center' }, swatches, accentInput)),
      h('div', { class: 'field' }, fontLabel, fontRange),
      h('div', { class: 'field' }, radiusLabel, radiusRange),
      field(t('settings.density'), densitySel),
      h('div', {}, resetBtn),
      h('div', { class: 'field' }, where)
    );

    // Änderungen wirken sofort; egal wie der Dialog geschlossen wird, sie bleiben erhalten.
    await modal({
      title: t('settings.title'),
      content,
      buttons: [{ label: t('common.done'), kind: 'primary', submit: true }]
    });
    s.listName = s.listName.trim().slice(0, 40);
    saveNow();
    render();
    if (reopen) openSettings();
  }

  // ---------- Aktionen ----------

  function setView(type, id) {
    state.view = { type, id: id || null };
    state.drawerOpen = false;
    render({ resetScroll: true });
  }

  async function renameList() {
    const value = await askText({
      title: t('brand.dialogTitle'),
      label: t('brand.dialogLabel'),
      value: state.data.settings.listName,
      placeholder: APP_NAME,
      allowEmpty: true,
      maxlength: 40
    });
    if (value === null) return;
    state.data.settings.listName = value;
    commit();
  }

  async function addCategory() {
    const result = await categoryDialog(null);
    if (!result) return;
    const cat = { id: L.uid(), name: result.name, icon: result.icon, color: result.color, goals: [] };
    state.data.categories.push(cat);
    saveNow();
    setView('category', cat.id);
  }

  async function editCategory(cat) {
    const result = await categoryDialog(cat);
    if (!result) return;
    cat.name = result.name;
    cat.icon = result.icon;
    cat.color = result.color;
    commit();
  }

  async function deleteCategory(cat) {
    const n = cat.goals.length;
    const ok = await confirmBox({
      title: t('cat.deleteTitle'),
      message: n ? t('cat.deleteText', { name: cat.name, goals: count('goalsOf', n) }) : t('cat.deleteTextEmpty', { name: cat.name }),
      confirmLabel: t('common.delete'),
      danger: true
    });
    if (!ok) return;
    state.data.categories.splice(state.data.categories.indexOf(cat), 1);
    saveNow();
    setView('overview');
  }

  async function editGoal(goal) {
    const result = await goalDialog(goal);
    if (!result) return;
    goal.title = result.title;
    commit();
  }

  async function deleteGoal(cat, goal) {
    const ok = await confirmBox({
      title: t('goal.deleteTitle'),
      message: t('goal.deleteText', { title: goal.title }),
      confirmLabel: t('common.delete'),
      danger: true
    });
    if (!ok) return;
    cat.goals.splice(cat.goals.indexOf(goal), 1);
    state.expanded.delete(goal.id);
    commit();
  }

  async function editStep(step) {
    const text = await askText({ title: t('step.editTitle'), label: t('step.editLabel'), value: step.text });
    if (!text) return;
    step.text = text;
    commit();
  }

  async function editEntry(entry) {
    const result = await entryDialog(entry);
    if (!result) return;
    entry.text = result.text;
    entry.at = result.at;
    commit();
  }

  async function deleteEntry(owner, entry) {
    const ok = await confirmBox({
      title: t('notes.deleteTitle'),
      message: t('notes.deleteText'),
      confirmLabel: t('common.delete'),
      danger: true
    });
    if (!ok) return;
    owner.entries.splice(owner.entries.indexOf(entry), 1);
    commit();
  }

  function moveIn(array, index, direction) {
    if (L.moveItem(array, index, direction)) commit();
  }

  function newGoal(title) {
    return {
      id: L.uid(),
      title,
      description: '',
      done: false,
      steps: [],
      entries: [],
      createdAt: new Date().toISOString(),
      completedAt: null
    };
  }

  function newStep(text) {
    return { id: L.uid(), text, done: false, doneAt: null, description: '', entries: [] };
  }

  // Springt zu einem Ziel (und ggf. zum Schritt) in seiner Kategorie.
  function openGoal(categoryId, goalId, stepId) {
    state.expanded.add(goalId);
    if (stepId) state.expandedSteps.add(stepId);
    state.scrollToGoal = goalId;
    setView('category', categoryId);
  }

  // Ziel als blauer, unterstrichener Link (führt zum Ziel).
  function goalLink(categoryId, goalId, title, stepId) {
    return h('button', {
      type: 'button',
      class: 'goal-link',
      title: t('history.open'),
      text: title,
      onClick: () => openGoal(categoryId, goalId, stepId)
    });
  }

  // Ersetzt {name}-Platzhalter eines Textes durch Knoten (z. B. Links).
  function tplNodes(key, parts) {
    return t(key)
      .split(/(\{\w+\})/)
      .map((piece) => {
        const m = /^\{(\w+)\}$/.exec(piece);
        if (!m) return piece;
        return m[1] in parts ? parts[m[1]] : piece;
      });
  }

  function closeDrawer() {
    state.drawerOpen = false;
    document.getElementById('app').classList.remove('drawer-open');
  }

  async function doExport() {
    closeDrawer();
    const text = JSON.stringify(L.createExport(state.data), null, 2);
    const result = await storage.exportFile(text, 'gotrack-' + dateStamp() + '.json', {
      title: t('export.dialogTitle'),
      filter: t('export.filter')
    });
    if (result && result.ok) toast(t('export.done', { path: result.path || t('export.saved') }));
    else if (result && !result.canceled) alertBox(t('export.failTitle'), t('err.' + (result.error || 'save_failed'), { detail: result.detail || '' }));
  }

  async function doImport() {
    closeDrawer();
    const result = await storage.importFile({
      title: t('import.dialogTitle'),
      filter: t('import.filter'),
      allFiles: t('import.allFiles')
    });
    if (!result || result.canceled) return;
    if (!result.ok) {
      alertBox(t('import.failTitle'), t('err.' + (result.error || 'read_failed'), { detail: result.detail || '' }));
      return;
    }
    let incoming;
    try {
      incoming = L.parseImport(result.text);
    } catch (e) {
      alertBox(t('import.failTitle'), errorText(e));
      return;
    }
    const choice = await modal({
      title: t('import.title'),
      message: t('import.summary', {
        cats: count('categories', incoming.categories.length),
        goals: count('goalsOf', L.countGoals(incoming))
      }),
      content: h('div', { class: 'settings-grid' }, h('p', { text: t('import.mergeInfo') }), h('p', { text: t('import.replaceInfo') })),
      buttons: [
        cancelButton(),
        { label: t('import.replace'), kind: 'danger', value: 'replace' },
        { label: t('import.merge'), kind: 'primary', value: 'merge' }
      ]
    });
    if (!choice) return;
    if (choice === 'merge') {
      const merged = L.mergeData(state.data, incoming);
      state.data = merged.data;
      toast(t('import.merged', { c: merged.added.categories, g: merged.added.goals, u: merged.updated.goals }));
    } else {
      state.data = incoming;
      state.expanded.clear();
      state.expandedSteps.clear();
      applyLanguage();
      applySettings();
      toast(t('import.replaced'));
    }
    saveNow();
    setView('overview');
  }

  function loadExample() {
    state.data.categories.push(...L.createExampleData(state.lang).categories);
    saveNow();
    setView('overview');
  }

  // ---------- Darstellung ----------

  function progressBar(pct, big) {
    return h(
      'div',
      {
        class: 'progress' + (big ? ' big' : ''),
        role: 'progressbar',
        'aria-valuemin': '0',
        'aria-valuemax': '100',
        'aria-valuenow': String(pct)
      },
      h('div', { class: 'progress-fill', style: { width: pct + '%' } })
    );
  }

  function iconBtn(symbol, title, onClick, disabled, extraClass) {
    return h('button', {
      type: 'button',
      class: 'icon-btn' + (extraClass ? ' ' + extraClass : ''),
      title,
      'aria-label': title,
      disabled: !!disabled,
      onClick,
      text: symbol
    });
  }

  function navItem({ iconNode, name, pct, plain, color, active, onClick }) {
    return h(
      'button',
      {
        type: 'button',
        class: 'nav-item' + (active ? ' active' : ''),
        'aria-current': active ? 'page' : null,
        style: color ? { '--cat': color } : null,
        onClick
      },
      iconNode,
      h('span', { class: 'nav-name', text: name }),
      pct === undefined ? null : h('span', { class: 'nav-pct', text: plain ? String(pct) : pct + ' %' })
    );
  }

  const textIcon = (symbol) => h('span', { class: 'nav-icon', text: symbol, 'aria-hidden': 'true' });

  // Handy-Layout: Seitenleiste wird zum ausfahrbaren Menü (am PC ist diese Leiste ausgeblendet).
  function toggleDrawer() {
    state.drawerOpen = !state.drawerOpen;
    document.getElementById('app').classList.toggle('drawer-open', state.drawerOpen);
  }

  function renderTopbar() {
    return h(
      'header',
      { class: 'topbar' },
      h('button', { type: 'button', class: 'icon-btn topbar-menu', 'aria-label': t('nav.menu'), text: '☰', onClick: toggleDrawer }),
      h('img', { class: 'brand-mark', src: 'logo.png', alt: '', width: '28', height: '28', draggable: 'false' }),
      h('span', { class: 'topbar-title', text: listName() })
    );
  }

  function renderSidebar() {
    const d = state.data;
    return h(
      'aside',
      { class: 'sidebar' },
      h(
        'button',
        { type: 'button', class: 'brand', title: t('brand.rename'), 'aria-label': t('brand.rename') + ': ' + listName(), onClick: renameList },
        h('img', { class: 'brand-mark', src: 'logo.png', alt: '', width: '32', height: '32', draggable: 'false' }),
        h('span', { class: 'brand-name', text: listName() }),
        h('span', { class: 'brand-edit', 'aria-hidden': 'true', text: '✎' })
      ),
      h(
        'nav',
        { class: 'cat-list', 'aria-label': t('nav.categories') },
        navItem({ iconNode: textIcon('🏠'), name: t('nav.overview'), active: state.view.type === 'overview', onClick: () => setView('overview') }),
        navItem({ iconNode: textIcon('🚧'), name: t('nav.inProgress'), pct: L.openGoalGroups(d).reduce((n, g) => n + g.items.length, 0), plain: true, active: state.view.type === 'inprogress', onClick: () => setView('inprogress') }),
        navItem({ iconNode: textIcon('🏆'), name: t('nav.achieved'), pct: L.achievedGoals(d).length, plain: true, active: state.view.type === 'achieved', onClick: () => setView('achieved') }),
        navItem({ iconNode: textIcon('🕘'), name: t('nav.history'), active: state.view.type === 'history', onClick: () => setView('history') }),
        h(
          'div',
          { class: 'nav-head' },
          h('span', { text: t('nav.categories') }),
          h('button', { type: 'button', class: 'icon-btn', title: t('nav.newCategory'), 'aria-label': t('nav.newCategory'), onClick: addCategory, text: '+' })
        ),
        d.categories.map((cat) =>
          navItem({
            iconNode: iconEl(cat.icon, 'nav-icon'),
            name: cat.name,
            pct: L.categoryStats(cat).percent,
            color: cat.color,
            active: state.view.type === 'category' && state.view.id === cat.id,
            onClick: () => setView('category', cat.id)
          })
        )
      ),
      h(
        'div',
        { class: 'sidebar-foot' },
        h('button', { type: 'button', class: 'nav-item', onClick: doExport }, textIcon('⬇'), h('span', { class: 'nav-name', text: t('nav.export') })),
        h('button', { type: 'button', class: 'nav-item', onClick: doImport }, textIcon('⬆'), h('span', { class: 'nav-name', text: t('nav.import') })),
        h('button', { type: 'button', class: 'nav-item', onClick: openSettings }, textIcon('⚙'), h('span', { class: 'nav-name', text: t('nav.settings') }))
      )
    );
  }

  function renderMain() {
    if (state.view.type === 'history') return renderHistory();
    if (state.view.type === 'inprogress') return renderInProgress();
    if (state.view.type === 'achieved') return renderAchieved();
    if (state.view.type === 'category') {
      const cat = findCategory(state.view.id);
      if (cat) return renderCategory(cat);
      state.view = { type: 'overview', id: null };
    }
    return renderOverview();
  }

  const reachedText = (done, total) => t('progress.reached', { done, goals: count('goalsOf', total) });

  function renderOverview() {
    const d = state.data;
    const all = L.overallStats(d);
    const page = h(
      'div',
      { class: 'page' },
      h(
        'div',
        { class: 'page-head' },
        h('div', { class: 'title-row' }, h('h1', { text: t('nav.overview') })),
        d.categories.length
          ? h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn', onClick: addCategory, text: '+ ' + t('nav.newCategory') }))
          : null
      )
    );

    if (d.categories.length === 0) {
      page.append(
        h(
          'div',
          { class: 'empty' },
          h('div', { class: 'empty-emoji', 'aria-hidden': 'true', text: '🌱' }),
          h('h2', { text: t('overview.emptyTitle') }),
          h('p', { class: 'muted', text: t('overview.emptyText') }),
          h(
            'div',
            { class: 'actions' },
            h('button', { type: 'button', class: 'btn primary', onClick: addCategory, text: t('overview.createFirst') }),
            h('button', { type: 'button', class: 'btn', onClick: loadExample, text: t('overview.loadExample') })
          )
        )
      );
      return h('main', { class: 'main' }, page);
    }

    page.append(
      h(
        'section',
        { class: 'summary' },
        h(
          'div',
          { class: 'summary-top' },
          h('div', {}, h('div', { class: 'muted', text: t('progress.total') }), h('div', { class: 'summary-pct', text: all.percent + ' %' })),
          h('div', { class: 'muted', text: all.total ? reachedText(all.completed, all.total) : t('progress.none') })
        ),
        progressBar(all.percent, true)
      ),
      h(
        'div',
        { class: 'grid' },
        d.categories.map((cat) => {
          const st = L.categoryStats(cat);
          return h(
            'button',
            { type: 'button', class: 'card', style: { '--cat': cat.color }, onClick: () => setView('category', cat.id) },
            h('div', { class: 'card-top' }, iconEl(cat.icon, 'card-icon'), h('span', { class: 'card-title', text: cat.name }), h('span', { class: 'pct', text: st.percent + ' %' })),
            progressBar(st.percent),
            h('div', { class: 'muted', text: st.total ? reachedText(st.completed, st.total) : t('progress.none') })
          );
        })
      )
    );
    return h('main', { class: 'main' }, page);
  }

  // ---------- Verlauf & Listen ----------

  function pageHead(title, subtitle) {
    return h('div', { class: 'page-head' }, h('div', {}, h('div', { class: 'title-row' }, h('h1', { text: title })), h('p', { class: 'muted', text: subtitle })));
  }

  function emptyBox(symbol, text) {
    return h('div', { class: 'empty' }, h('div', { class: 'empty-emoji', 'aria-hidden': 'true', text: symbol }), h('p', { class: 'muted', text: text }));
  }

  function renderInProgress() {
    const groups = L.openGoalGroups(state.data);
    const page = h('div', { class: 'page' }, pageHead(t('inprogress.title'), t('inprogress.subtitle')));
    if (groups.length === 0) {
      page.append(emptyBox('🚧', t('inprogress.empty')));
      return h('main', { class: 'main' }, page);
    }
    for (const group of groups) {
      const cat = group.category;
      page.append(
        h(
          'section',
          { class: 'list-group', style: { '--cat': cat.color } },
          h('h2', { class: 'list-group-title' }, iconEl(cat.icon, 'list-group-icon'), h('span', { text: cat.name })),
          h(
            'ul',
            { class: 'bullets' },
            group.items.map((it) =>
              h('li', {}, goalLink(cat.id, it.goal.id, it.goal.title), h('span', { class: 'bullet-meta', text: it.progress + ' %' }))
            )
          )
        )
      );
    }
    return h('main', { class: 'main' }, page);
  }

  function renderAchieved() {
    const items = L.achievedGoals(state.data);
    const page = h('div', { class: 'page' }, pageHead(t('achieved.title'), t('achieved.subtitle')));
    if (items.length === 0) {
      page.append(emptyBox('🏆', t('achieved.empty')));
      return h('main', { class: 'main' }, page);
    }
    page.append(
      h(
        'ul',
        { class: 'bullets' },
        items.map((it) =>
          h(
            'li',
            { style: { '--cat': it.category.color } },
            goalLink(it.category.id, it.goal.id, it.goal.title),
            h('span', { class: 'bullet-meta', text: t('achieved.on', { date: fmtDate(it.goal.completedAt) }) + ' · ' + it.category.name })
          )
        )
      )
    );
    return h('main', { class: 'main' }, page);
  }

  function renderHistory() {
    const all = L.buildHistory(state.data);
    const counts = { all: all.length, goal: 0, step: 0, entry: 0 };
    for (const ev of all) counts[ev.type === 'step' || ev.type === 'entry' ? ev.type : 'goal'] += 1;
    const filter = state.historyFilter;
    const kind = (ev) => (ev.type === 'step' || ev.type === 'entry' ? ev.type : 'goal');
    const shown = filter === 'all' ? all : all.filter((e) => kind(e) === filter);

    const chips = [
      ['all', t('history.all')],
      ['goal', t('history.goals')],
      ['step', t('history.steps')],
      ['entry', t('history.notes')]
    ].map(([key, label]) =>
      h('button', {
        type: 'button',
        class: 'chip' + (filter === key ? ' active' : ''),
        'aria-pressed': String(filter === key),
        text: label + ' (' + counts[key] + ')',
        onClick: () => {
          state.historyFilter = key;
          render();
        }
      })
    );

    const page = h('div', { class: 'page' }, pageHead(t('history.title'), t('history.subtitle')), h('div', { class: 'chips' }, chips));

    if (shown.length === 0) {
      page.append(emptyBox('🕘', t('history.empty')));
      return h('main', { class: 'main' }, page);
    }

    const list = h('ul', { class: 'bullets history-list' });
    for (const ev of shown) {
      const glink = goalLink(ev.categoryId, ev.goalId, ev.goalTitle, ev.type === 'entry' ? ev.stepId : null);
      let line;
      if (ev.type === 'created') line = tplNodes('history.goalCreated', { goal: glink });
      else if (ev.type === 'reached') line = tplNodes('history.goalReached', { goal: glink });
      else if (ev.type === 'step') line = tplNodes('history.stepDone', { step: h('strong', { text: ev.stepText }), goal: glink });
      else if (ev.stepId) line = tplNodes('history.noteStep', { step: h('strong', { text: ev.stepText }), goal: glink });
      else line = tplNodes('history.noteGoal', { goal: glink });
      const snippet = ev.type === 'entry' && ev.text ? (ev.text.length > 200 ? ev.text.slice(0, 200) + '…' : ev.text) : null;
      list.append(
        h(
          'li',
          { style: { '--cat': ev.categoryColor } },
          h('span', { class: 'hist-date', text: fmtDate(ev.at) }),
          h('span', { class: 'hist-line' }, line, h('span', { class: 'bullet-meta', text: ' · ' + ev.categoryName })),
          snippet ? h('div', { class: 'hist-text', text: snippet }) : null
        )
      );
    }
    page.append(list);
    return h('main', { class: 'main' }, page);
  }

  // ---------- Kategorie, Ziele, Schritte ----------

  function renderCategory(cat) {
    const st = L.categoryStats(cat);
    const index = state.data.categories.indexOf(cat);

    const goalInput = h('input', {
      type: 'text',
      maxlength: '200',
      placeholder: t('goal.addPlaceholder'),
      'aria-label': t('goal.newAria'),
      'data-new-goal': '1'
    });
    const addForm = h(
      'form',
      {
        class: 'add-row',
        onSubmit: (e) => {
          e.preventDefault();
          const title = goalInput.value.trim();
          if (!title) return;
          cat.goals.push(newGoal(title));
          state.focusNewGoal = true;
          commit();
        }
      },
      goalInput,
      h('button', { type: 'submit', class: 'btn primary', text: t('common.add') })
    );

    const page = h(
      'div',
      { class: 'page', style: { '--cat': cat.color } },
      h(
        'div',
        { class: 'page-head' },
        h('div', { class: 'title-row' }, iconEl(cat.icon, 'big-icon'), h('h1', { text: cat.name })),
        h(
          'div',
          { class: 'actions' },
          iconBtn('↑', t('category.up'), () => moveIn(state.data.categories, index, -1), index === 0),
          iconBtn('↓', t('category.down'), () => moveIn(state.data.categories, index, 1), index === state.data.categories.length - 1),
          h('button', { type: 'button', class: 'btn', text: t('common.edit'), onClick: () => editCategory(cat) }),
          h('button', { type: 'button', class: 'btn danger', text: t('common.delete'), onClick: () => deleteCategory(cat) })
        )
      ),
      h(
        'section',
        { class: 'summary' },
        h(
          'div',
          { class: 'summary-top' },
          h('div', { class: 'summary-pct', text: st.percent + ' %' }),
          h('div', { class: 'muted', text: st.total ? reachedText(st.completed, st.total) : t('progress.none') })
        ),
        progressBar(st.percent, true)
      ),
      addForm,
      cat.goals.length
        ? h('div', { class: 'goals' }, cat.goals.map((goal, i) => renderGoal(cat, goal, i)))
        : h('p', { class: 'muted', text: t('category.noGoals') })
    );
    return h('main', { class: 'main' }, page);
  }

  function renderGoal(cat, goal, index) {
    const pct = L.goalProgress(goal);
    const open = state.expanded.has(goal.id);
    const hasSteps = goal.steps.length > 0;
    const doneCount = goal.steps.filter((s) => s.done).length;
    const complete = pct === 100;
    const meta = hasSteps
      ? t('goal.stepsDone', { done: doneCount, steps: count('stepsOf', goal.steps.length) })
      : complete
        ? t('goal.reached')
        : t('goal.noSteps');

    const head = h(
      'div',
      { class: 'goal-head' },
      hasSteps
        ? null
        : h('input', {
            type: 'checkbox',
            checked: goal.done,
            'aria-label': t('goal.markReached', { title: goal.title }),
            onChange: (e) => {
              L.setGoalDone(goal, e.target.checked);
              commit();
            }
          }),
      h(
        'button',
        {
          type: 'button',
          class: 'goal-toggle',
          'aria-expanded': String(open),
          onClick: () => {
            if (state.expanded.has(goal.id)) state.expanded.delete(goal.id);
            else state.expanded.add(goal.id);
            render();
          }
        },
        h('div', { class: 'goal-main' }, h('div', { class: 'goal-title', text: goal.title }), h('div', { class: 'goal-meta', text: meta })),
        h('span', { class: 'pct', text: pct + ' %' }),
        h('span', { class: 'chev', 'aria-hidden': 'true', text: '›' })
      )
    );

    return h(
      'article',
      { class: 'goal' + (complete ? ' complete' : ''), 'data-goal-id': goal.id },
      head,
      progressBar(pct),
      open ? renderGoalBody(cat, goal, index) : null
    );
  }

  function descriptionBox(owner, placeholder, aria, rows) {
    return h('textarea', {
      rows: String(rows),
      maxlength: '5000',
      placeholder,
      'aria-label': aria,
      value: owner.description,
      onInput: (e) => {
        owner.description = e.target.value;
        saveSoon();
      },
      onBlur: () => {
        if (state.pendingTimer) saveNow();
      }
    });
  }

  // Notizen & Erinnerungen (mit Datum) für ein Ziel oder einen Schritt.
  function renderNotes(owner) {
    const input = h('textarea', {
      rows: '3',
      maxlength: '5000',
      placeholder: t('notes.placeholder'),
      'aria-label': t('notes.title'),
      'data-entry-input': owner.id,
      onKeydown: (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault();
          add();
        }
      }
    });
    const add = () => {
      const text = input.value.trim();
      if (!text) {
        input.focus();
        return;
      }
      owner.entries.push({ id: L.uid(), text, at: new Date().toISOString() });
      state.focusEntry = owner.id;
      commit();
    };

    const sorted = owner.entries.slice().sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    return h(
      'section',
      { class: 'notes' },
      h('h4', { text: t('notes.title') }),
      sorted.length
        ? h(
            'ul',
            { class: 'note-list' },
            sorted.map((entry) =>
              h(
                'li',
                { class: 'note' },
                h(
                  'div',
                  { class: 'note-head' },
                  h('span', { class: 'note-date', text: fmtDate(entry.at) }),
                  h(
                    'div',
                    { class: 'note-actions' },
                    iconBtn('✎', t('notes.edit'), () => editEntry(entry)),
                    iconBtn('✕', t('notes.delete'), () => deleteEntry(owner, entry), false, 'danger')
                  )
                ),
                h('p', { class: 'note-text', text: entry.text })
              )
            )
          )
        : h('p', { class: 'muted small', text: t('notes.empty') }),
      input,
      h('div', { class: 'notes-actions' }, h('button', { type: 'button', class: 'btn small', text: t('notes.add'), onClick: add }))
    );
  }

  function renderStepDetails(goal, step) {
    const dateRow = step.done
      ? h(
          'label',
          { class: 'field inline' },
          h('span', { class: 'field-label', text: t('step.doneOn') }),
          h('input', {
            type: 'date',
            value: step.doneAt ? L.dateInputValue(step.doneAt) : '',
            onChange: (e) => {
              if (!e.target.value) return;
              step.doneAt = L.isoFromDateInput(e.target.value, step.doneAt);
              L.refreshGoal(goal);
              commit();
            }
          })
        )
      : null;
    return h('div', { class: 'step-details' }, descriptionBox(step, t('step.descPlaceholder'), t('step.descAria'), 2), dateRow, renderNotes(step));
  }

  function renderStep(goal, step, i) {
    const last = goal.steps.length - 1;
    const open = state.expandedSteps.has(step.id);
    const hasExtra = !!step.description || step.entries.length > 0;
    return h(
      'li',
      { class: 'step' },
      h(
        'div',
        { class: 'step-row' },
        h('input', {
          type: 'checkbox',
          checked: step.done,
          'aria-label': step.text,
          onChange: (e) => {
            L.setStepDone(goal, step, e.target.checked);
            commit();
          }
        }),
        h('span', {
          class: 'step-text' + (step.done ? ' done' : ''),
          text: step.text,
          onClick: () => {
            L.setStepDone(goal, step, !step.done);
            commit();
          }
        }),
        step.done && step.doneAt ? h('span', { class: 'step-date', text: fmtDate(step.doneAt) }) : null,
        h(
          'button',
          {
            type: 'button',
            class: 'icon-btn notes-btn' + (hasExtra ? ' has' : '') + (open ? ' on' : ''),
            title: t('step.details'),
            'aria-label': t('step.details'),
            'aria-expanded': String(open),
            onClick: () => {
              if (state.expandedSteps.has(step.id)) state.expandedSteps.delete(step.id);
              else state.expandedSteps.add(step.id);
              render();
            },
            text: '📝'
          }
        ),
        h(
          'div',
          { class: 'step-actions' },
          iconBtn('↑', t('step.up'), () => moveIn(goal.steps, i, -1), i === 0),
          iconBtn('↓', t('step.down'), () => moveIn(goal.steps, i, 1), i === last),
          iconBtn('✎', t('step.edit'), () => editStep(step)),
          iconBtn(
            '✕',
            t('step.delete'),
            () => {
              goal.steps.splice(i, 1);
              state.expandedSteps.delete(step.id);
              L.refreshGoal(goal);
              commit();
            },
            false,
            'danger'
          )
        )
      ),
      open ? renderStepDetails(goal, step) : null
    );
  }

  // Erstellt-/Erreicht-Datum: jederzeit änderbar.
  function goalDates(goal) {
    const dateField = (label, iso, onSet) =>
      h(
        'label',
        { class: 'field inline' },
        h('span', { class: 'field-label', text: label }),
        h('input', {
          type: 'date',
          value: iso ? L.dateInputValue(iso) : '',
          onChange: (e) => {
            if (!e.target.value) return;
            onSet(L.isoFromDateInput(e.target.value, iso));
            commit();
          }
        })
      );
    return h(
      'div',
      { class: 'goal-dates' },
      dateField(t('goal.createdLabel'), goal.createdAt, (v) => L.setGoalCreatedDate(goal, v)),
      L.goalProgress(goal) === 100 && goal.completedAt ? dateField(t('goal.dateLabel'), goal.completedAt, (v) => L.setGoalReachedDate(goal, v)) : null
    );
  }

  function renderGoalBody(cat, goal, index) {
    const stepInput = h('input', {
      type: 'text',
      maxlength: '300',
      placeholder: t('step.addPlaceholder'),
      'aria-label': t('step.newAria'),
      'data-add-step': goal.id
    });
    const addForm = h(
      'form',
      {
        class: 'add-row',
        onSubmit: (e) => {
          e.preventDefault();
          const text = stepInput.value.trim();
          if (!text) return;
          goal.steps.push(newStep(text));
          L.refreshGoal(goal);
          state.focusAddStep = goal.id;
          commit();
        }
      },
      stepInput,
      h('button', { type: 'submit', class: 'btn', text: t('common.add') })
    );

    const steps = goal.steps.length
      ? h('ul', { class: 'steps' }, goal.steps.map((step, i) => renderStep(goal, step, i)))
      : h('p', { class: 'muted', text: t('step.hint') });

    return h(
      'div',
      { class: 'goal-body' },
      steps,
      addForm,
      descriptionBox(goal, t('goal.descPlaceholder'), t('goal.descAria'), 3),
      renderNotes(goal),
      h(
        'div',
        { class: 'goal-actions' },
        goalDates(goal),
        h(
          'div',
          { class: 'actions' },
          iconBtn('↑', t('goal.up'), () => moveIn(cat.goals, index, -1), index === 0),
          iconBtn('↓', t('goal.down'), () => moveIn(cat.goals, index, 1), index === cat.goals.length - 1),
          h('button', { type: 'button', class: 'btn small', text: t('common.edit'), onClick: () => editGoal(goal) }),
          h('button', { type: 'button', class: 'btn small danger', text: t('common.delete'), onClick: () => deleteGoal(cat, goal) })
        )
      )
    );
  }

  function render(options) {
    const root = document.getElementById('app');
    const oldMain = root.querySelector('.main');
    const oldList = root.querySelector('.cat-list');
    const mainScroll = oldMain && !(options && options.resetScroll) ? oldMain.scrollTop : 0;
    const listScroll = oldList ? oldList.scrollTop : 0;

    root.replaceChildren(renderTopbar(), renderSidebar(), h('div', { class: 'drawer-backdrop', onClick: toggleDrawer }), renderMain());
    root.classList.toggle('drawer-open', !!state.drawerOpen);

    const main = root.querySelector('.main');
    const list = root.querySelector('.cat-list');
    if (main) main.scrollTop = mainScroll;
    if (list) list.scrollTop = listScroll;

    const focusOn = (selector) => {
      const el = root.querySelector(selector);
      if (el) el.focus();
    };
    if (state.focusAddStep) {
      focusOn('[data-add-step="' + CSS.escape(state.focusAddStep) + '"]');
      state.focusAddStep = null;
    }
    if (state.focusEntry) {
      focusOn('[data-entry-input="' + CSS.escape(state.focusEntry) + '"]');
      state.focusEntry = null;
    }
    if (state.focusNewGoal) {
      focusOn('[data-new-goal]');
      state.focusNewGoal = false;
    }
    if (state.scrollToGoal) {
      const el = root.querySelector('[data-goal-id="' + CSS.escape(state.scrollToGoal) + '"]');
      if (el) el.scrollIntoView({ block: 'start' });
      state.scrollToGoal = null;
    }
  }

  function renderFatal(message) {
    const root = document.getElementById('app');
    root.classList.remove('app');
    const children = [h('h1', { text: t('err.loadTitle') }), h('p', { text: message }), h('p', { class: 'muted', text: t('err.untouched') })];
    if (window.api && !window.api.mobile) {
      children.push(h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn', text: t('settings.showFolder'), onClick: () => window.api.showDataFolder() })));
    }
    root.replaceChildren(h('div', { class: 'fatal' }, children));
  }

  // ---------- Start ----------

  async function init() {
    document.title = APP_NAME;
    let loaded = null;
    try {
      state.info = window.api ? await window.api.info() : null;
      state.lang = L.resolveLanguage('auto', systemLocale());
      loaded = await storage.load();
      state.data = loaded && loaded.text ? L.normalizeData(JSON.parse(loaded.text)) : L.createEmptyData();
    } catch (e) {
      // Nie mit leeren Daten weiterarbeiten, wenn eine vorhandene Datei nicht gelesen werden konnte.
      state.readOnly = true;
      renderFatal(errorText(e));
      return;
    }
    applyLanguage();
    applySettings();
    render();
    if (loaded && loaded.notice === 'backup') toast(t('notice.backup'));
    else if (loaded && loaded.notice === 'corrupt') toast(loaded.keptAs ? t('notice.corruptKept', { path: loaded.keptAs }) : t('notice.corrupt'));
  }

  init();
})();
