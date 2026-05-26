'use strict';

/* ═══════════════════════════════════════════════
   SANDBOX — app.js
   ═══════════════════════════════════════════════ */

const STATUSES = ['sandbox', 'dev', 'finalizada', 'descartada'];
const STATUS_LABELS = {
  sandbox:    'Sandbox',
  dev:        'Em Desenvolvimento',
  finalizada: 'Finalizada',
  descartada: 'Descartada',
};

/* ── COLUMN COLOR DEFAULTS & MAP ── */
const K_COL_COLORS = 'sandbox-v3-col-colors';
const COL_COLOR_DEFAULTS = {
  sandbox:    '#8B7DD8',
  dev:        '#5A9EDF',
  finalizada: '#4EB882',
  descartada: '#BDBBB4',
};
// Maps status key → CSS variable name
const COL_CSS_VAR = {
  sandbox:    '--c-sandbox',
  dev:        '--c-dev',
  finalizada: '--c-done',
  descartada: '--c-disc',
};
let colColors = {};

const PALETTE = [
  '#6366F1', '#A855F7', '#EC4899', '#EF4444',
  '#F97316', '#EAB308', '#22C55E', '#14B8A6',
  '#3B82F6', '#06B6D4', '#84CC16', '#64748B',
];

const CX_LABELS = ['—', 'Simples',  'Moderado', 'Complexo'];
const IM_LABELS = ['—', 'Baixo',    'Médio',    'Alto'];

/* ── STATE ── */
let ideias        = [];
let categories    = {};
let activeFilters = new Set();
let filtersOpen   = false;
let editingId     = null;
let dragId        = null;
let didDrag       = false;
let dropInfo      = null;

/* ── UNDO STATE ── */
let deletedIdeia  = null;
let undoTimeout   = null;

/* ── STORAGE ── */
const K_IDEAS = 'sandbox-v3-ideas';
const K_CATS  = 'sandbox-v3-cats';

function load() {
  try { ideias     = JSON.parse(localStorage.getItem(K_IDEAS)      || '[]'); } catch { ideias = []; }
  try { categories = JSON.parse(localStorage.getItem(K_CATS)       || '{}'); } catch { categories = {}; }
  try { colColors  = JSON.parse(localStorage.getItem(K_COL_COLORS) || '{}'); } catch { colColors = {}; }
}
function save()        { localStorage.setItem(K_IDEAS,      JSON.stringify(ideias)); }
function saveCats()    { localStorage.setItem(K_CATS,       JSON.stringify(categories)); }
function saveColColors() { localStorage.setItem(K_COL_COLORS, JSON.stringify(colColors)); }

/* Apply stored column colors to CSS variables so all card shadows + dots update */
function applyColColors() {
  Object.entries(COL_CSS_VAR).forEach(([status, cssVar]) => {
    const color = colColors[status] || COL_COLOR_DEFAULTS[status];
    document.documentElement.style.setProperty(cssVar, color);
    // Also update the col-dot's inline background so it tracks the var
    const dot = document.getElementById('col-dot-' + status);
    if (dot) dot.style.background = color;
  });
}
function genId()    { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

/* ── HELPERS ── */
function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function escQ(s) { return String(s || '').replace(/'/g, "\\'"); }
function parseTags(str) {
  return String(str || '').split(',').map(t => t.trim()).filter(Boolean);
}
function colItems(status) {
  return ideias.filter(i => i.status === status)
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
}
function maxOrder(status) {
  return ideias.filter(i => i.status === status)
    .reduce((m, i) => Math.max(m, i.sortOrder || 0), -1);
}

/* ── CATEGORIES ── */
function ensureCategory(tag) {
  if (!categories[tag]) {
    const idx = Object.keys(categories).length % PALETTE.length;
    categories[tag] = PALETTE[idx];
    saveCats();
  }
  return categories[tag];
}

function getAllTags() {
  const set = new Set();
  ideias.forEach(i => parseTags(i.tags).forEach(t => set.add(t)));
  return [...set].sort();
}

/* ── FILTER TOGGLE ── */
function toggleFilters() {
  filtersOpen = !filtersOpen;
  const wrap = document.getElementById('filter-wrap');
  const btn  = document.getElementById('filter-toggle-btn');
  wrap.classList.toggle('hidden', !filtersOpen);
  btn.classList.toggle('active', filtersOpen);
}

/* ── FILTER BAR ── */
function renderFilterBar() {
  const bar  = document.getElementById('filter-bar');
  const tags = getAllTags();
  tags.forEach(t => ensureCategory(t));

  const allActive = activeFilters.size === 0;
  let html = `<button class="f-chip f-chip--all${allActive ? ' active' : ''}" onclick="clearFilters()">Todas</button>`;

  tags.forEach(tag => {
    const color    = categories[tag] || '#888';
    const isActive = activeFilters.has(tag);
    const style    = isActive
      ? `background:${color}22; border-color:${color}; color:${color}`
      : '';

    html += `
      <button class="f-chip${isActive ? ' active' : ''}" style="${style}"
        onclick="toggleFilter('${escQ(tag)}')">
        <span class="chip-dot" style="background:${color}"></span>
        ${esc(tag)}
      </button>`;
  });

  bar.innerHTML = html;

  // Update filter count badge
  const badge = document.getElementById('filter-count');
  if (activeFilters.size > 0) {
    badge.textContent = activeFilters.size;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

function toggleFilter(tag) {
  activeFilters.has(tag) ? activeFilters.delete(tag) : activeFilters.add(tag);
  renderFilterBar();
  applyFilters();
}

function clearFilters() {
  activeFilters.clear();
  renderFilterBar();
  applyFilters();
}

function applyFilters() {
  document.querySelectorAll('.card').forEach(el => {
    if (activeFilters.size === 0) { el.classList.remove('filtered-out'); return; }
    const idea = ideias.find(i => i.id === el.dataset.id);
    const tags = idea ? parseTags(idea.tags) : [];
    el.classList.toggle('filtered-out', !tags.some(t => activeFilters.has(t)));
  });
}

/* ── COLUMN COLOR PICKER ── */
function toggleColColorPicker(e, status) {
  e.stopPropagation();
  const existing = document.querySelector('.col-cpicker');
  const sameStatus = existing && existing.dataset.status === status;
  closeColColorPicker();
  if (sameStatus) return;

  // position:fixed — getBoundingClientRect() returns visual pixels, CSS uses layout pixels → divide by zoom
  const zoom    = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
  const dot     = e.currentTarget;
  const rect    = dot.getBoundingClientRect();
  const vpW     = window.innerWidth;   // CSS / layout pixels
  const topPx   = rect.bottom / zoom + 6;
  const leftPx  = Math.max(4, Math.min(rect.left / zoom, vpW / zoom - 164));

  const current = colColors[status] || COL_COLOR_DEFAULTS[status];
  const picker  = document.createElement('div');
  picker.className      = 'col-cpicker';
  picker.dataset.status = status;
  picker.style.cssText  = `position:fixed;top:${topPx}px;left:${leftPx}px;z-index:600;`;
  picker.innerHTML = `<div class="color-grid">${PALETTE.map(c =>
    `<div class="color-swatch${c === current ? ' selected' : ''}" style="background:${c}"
      onclick="setColColor('${status}','${c}')"></div>`
  ).join('')}</div>`;

  document.body.appendChild(picker);
}

function closeColColorPicker() {
  document.querySelectorAll('.col-cpicker').forEach(el => el.remove());
}

function setColColor(status, color) {
  colColors[status] = color;
  saveColColors();
  applyColColors();
  closeColColorPicker();
  // Refresh filter bar (chips use col colors indirectly via categories)
  renderFilterBar();
}

/* ── TAGS MODAL ── */
function openTagsModal() {
  renderTagsList();
  document.getElementById('tags-overlay').classList.remove('hidden');
}

function closeTagsModal() {
  document.getElementById('tags-overlay').classList.add('hidden');
  closeColorPicker(); // closes any open inline picker
}

function handleTagsOverlayClick(e) {
  if (e.target.id === 'tags-overlay') closeTagsModal();
}

function getAllManagedTags() {
  // Union of tags on ideas + manually added tags in categories
  const set = new Set(getAllTags());
  Object.keys(categories).forEach(t => set.add(t));
  return [...set].sort();
}

function renderTagsList() {
  const container = document.getElementById('tags-list');
  const tags = getAllManagedTags();

  if (!tags.length) {
    container.innerHTML = '<p class="tags-empty">Nenhuma tag ainda.<br>Use o campo acima para adicionar.</p>';
    return;
  }

  container.innerHTML = tags.map(tag => {
    const color = categories[tag] || '#888';
    const count = ideias.filter(i => parseTags(i.tags).includes(tag)).length;
    const usageLabel = count > 0
      ? `${count} ideia${count !== 1 ? 's' : ''}`
      : 'Sem uso';
    const swatches = PALETTE.map(c =>
      `<div class="color-swatch${c === color ? ' selected' : ''}" style="background:${c}"
        onclick="setTagColor('${escQ(tag)}','${c}')"></div>`
    ).join('');
    return `
      <div class="tag-item">
        <div class="tag-row">
          <div class="tag-color-wrap">
            <div class="tag-color-dot" style="background:${color}"
              onclick="toggleInlineColorPicker(event,'${escQ(tag)}')" title="Mudar cor"></div>
          </div>
          <span class="tag-row-name" onclick="startEditTagName(event,'${escQ(tag)}')" title="Clique para editar">${esc(tag)}</span>
          <span class="tag-usage">${usageLabel}</span>
          ${count === 0 ? `<button class="tag-remove-btn" onclick="removeTag('${escQ(tag)}')" title="Remover tag">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
              <line x1="1" y1="1" x2="11" y2="11"/><line x1="11" y1="1" x2="1" y2="11"/>
            </svg>
          </button>` : ''}
        </div>
        <div class="tag-color-grid-wrap hidden" data-tag="${escQ(tag)}">
          <div class="color-grid">${swatches}</div>
        </div>
      </div>`;
  }).join('');
}

function addNewTag() {
  const input = document.getElementById('new-tag-input');
  const name  = input.value.trim();
  if (!name) { input.focus(); return; }

  // Check for duplicate
  if (categories[name]) {
    input.style.borderColor = '#B91C1C';
    input.style.boxShadow   = '0 0 0 3px rgba(185,28,28,0.15)';
    setTimeout(() => { input.style.borderColor = ''; input.style.boxShadow = ''; }, 1800);
    return;
  }

  ensureCategory(name);
  input.value = '';
  input.focus();
  renderTagsList();
  renderFilterBar();
}

function removeTag(tag) {
  delete categories[tag];
  saveCats();
  renderTagsList();
  renderFilterBar();
}

/* ── COLOR PICKER (inline expand — no positioning tricks, immune to zoom/overflow) ── */
function toggleInlineColorPicker(e, tag) {
  e.stopPropagation();
  const tagsList = document.getElementById('tags-list');
  if (!tagsList) return;

  // Find the grid wrap for this specific tag
  let targetWrap = null;
  tagsList.querySelectorAll('.tag-color-grid-wrap').forEach(w => {
    if (w.dataset.tag === tag) targetWrap = w;
  });
  if (!targetWrap) return;

  const isOpen = !targetWrap.classList.contains('hidden');
  closeColorPicker(); // close any other open picker
  if (!isOpen) targetWrap.classList.remove('hidden');
}

function closeColorPicker() {
  // Hide all inline color grids
  document.querySelectorAll('.tag-color-grid-wrap').forEach(el => el.classList.add('hidden'));
  // Compat: remove any floating pickers if somehow present
  document.querySelectorAll('.inline-cpicker').forEach(el => el.remove());
  const old = document.getElementById('color-popup');
  if (old) old.remove();
}

function setTagColor(tag, color) {
  categories[tag] = color;
  saveCats();
  closeColorPicker();
  renderTagsList();
  renderFilterBar();
  renderAll();
}

/* ── TAGS CHIP PICKER (idea modal) ── */
let pickerSelectedTags = new Set();

function initTagsPicker(currentTagsStr) {
  pickerSelectedTags = new Set(parseTags(currentTagsStr || ''));
  renderTagsPicker();

  // Wire up the "create new tag" mini input
  const newInput = document.getElementById('f-tag-new');
  if (!newInput) return;
  const fresh = newInput.cloneNode(true); // remove stale listeners
  newInput.replaceWith(fresh);
  fresh.addEventListener('keydown', ev => {
    if (ev.key !== 'Enter') return;
    ev.preventDefault();
    const name = fresh.value.trim();
    if (!name) return;
    ensureCategory(name);
    pickerSelectedTags.add(name);
    fresh.value = '';
    syncTagsHiddenInput();
    renderTagsPicker();
  });
}

function renderTagsPicker() {
  const container = document.getElementById('tags-picker');
  if (!container) return;
  const allTags = getAllManagedTags();

  if (!allTags.length) {
    container.innerHTML = '<span class="tags-picker-empty">Nenhuma tag ainda — crie uma abaixo</span>';
    syncTagsHiddenInput();
    return;
  }

  container.innerHTML = allTags.map(tag => {
    const color      = categories[tag] || '#888';
    const isSelected = pickerSelectedTags.has(tag);
    const style      = isSelected
      ? `background:${color}22;border-color:${color};color:${color}`
      : '';
    return `<button type="button" class="tag-pick-chip${isSelected ? ' selected' : ''}"
      style="${style}" onclick="toggleTagPick('${escQ(tag)}')">
      <span class="tag-pick-dot" style="background:${color}"></span>
      ${esc(tag)}
    </button>`;
  }).join('');

  syncTagsHiddenInput();
}

function toggleTagPick(tag) {
  pickerSelectedTags.has(tag)
    ? pickerSelectedTags.delete(tag)
    : pickerSelectedTags.add(tag);
  renderTagsPicker();
}

function syncTagsHiddenInput() {
  const hidden = document.getElementById('f-tags');
  if (hidden) hidden.value = [...pickerSelectedTags].join(', ');
}

/* ── INLINE TAG NAME EDITING ── */
function startEditTagName(e, oldName) {
  e.stopPropagation();
  const span = e.currentTarget;
  const input = document.createElement('input');
  input.type      = 'text';
  input.value     = oldName;
  input.className = 'tag-name-edit';
  input.addEventListener('blur',    () => finishEditTagName(input, oldName));
  input.addEventListener('keydown', ev => {
    if (ev.key === 'Enter')  { ev.preventDefault(); input.blur(); }
    if (ev.key === 'Escape') { ev.stopPropagation(); renderTagsList(); }
  });
  span.replaceWith(input);
  input.focus();
  input.select();
}

function finishEditTagName(input, oldName) {
  const newName = input.value.trim();
  if (!newName || newName === oldName) { renderTagsList(); return; }
  if (categories[newName] !== undefined) {
    // Name already exists — flash red and revert
    input.style.borderColor = '#B91C1C';
    input.style.boxShadow   = '0 0 0 3px rgba(185,28,28,0.15)';
    setTimeout(() => renderTagsList(), 1200);
    return;
  }
  // Rename the tag everywhere
  const color = categories[oldName];
  delete categories[oldName];
  categories[newName] = color;
  ideias.forEach(idea => {
    const tags = parseTags(idea.tags);
    const idx  = tags.indexOf(oldName);
    if (idx !== -1) { tags[idx] = newName; idea.tags = tags.join(', '); }
  });
  saveCats(); save();
  renderTagsList(); renderFilterBar(); renderAll();
}

/* (tags autocomplete removed — replaced by chip picker above) */

/* ── DELETE WITH HAND-DRAWN CONFIRM ── */
function showDeleteConfirm(e, id) {
  e.stopPropagation();
  closeHdConfirm(); // remove any open confirm first

  const card = document.getElementById('card-' + id);
  if (!card) return;

  const box = document.createElement('div');
  box.className = 'card-confirm';
  box.innerHTML = `
    <p class="hd-confirm-msg">Excluir essa ideia?</p>
    <div class="hd-confirm-btns">
      <button class="hd-btn hd-btn-yes">Excluir</button>
      <button class="hd-btn hd-btn-no" onclick="closeHdConfirm()">Cancelar</button>
    </div>
  `;
  box.querySelector('.hd-btn-yes').addEventListener('click', () => confirmDelete(id));
  // Elevate the card above its siblings so the popup isn't hidden behind the next card
  card.style.zIndex = '20';
  card.appendChild(box);
}

function closeHdConfirm() {
  document.querySelectorAll('.card-confirm').forEach(el => {
    // Reset the parent card's z-index when closing
    const card = el.closest('.card');
    if (card) card.style.zIndex = '';
    el.remove();
  });
  const overlay = document.getElementById('hd-overlay');
  if (overlay) overlay.classList.add('hidden');
}

function handleHdOverlayClick(e) {
  if (e.target.id === 'hd-overlay') closeHdConfirm();
}

function confirmDelete(id) {
  closeHdConfirm();
  const idea = ideias.find(i => i.id === id);
  if (!idea) return;

  // Soft delete — keep in memory for undo
  deletedIdeia = { ...idea };
  ideias = ideias.filter(i => i.id !== id);
  save();
  renderAll();
  showUndoToast();
}

/* ── UNDO TOAST ── */
function showUndoToast() {
  const toast = document.getElementById('undo-toast');
  toast.classList.remove('hidden');

  // Restart the progress bar animation
  const bar = document.getElementById('undo-bar');
  bar.style.animation = 'none';
  void bar.offsetWidth; // reflow
  bar.style.animation = '';

  clearTimeout(undoTimeout);
  undoTimeout = setTimeout(() => {
    deletedIdeia = null;
    hideUndoToast();
  }, 10000);
}

function hideUndoToast() {
  document.getElementById('undo-toast').classList.add('hidden');
}

function undoDelete() {
  if (!deletedIdeia) return;
  clearTimeout(undoTimeout);
  ideias.push(deletedIdeia);
  deletedIdeia = null;
  save();
  renderAll();
  hideUndoToast();
}

/* ── RENDER ── */
function renderDots(val, type) {
  return [1, 2, 3].map(n =>
    `<span class="ind-dot ${type} ${n <= val ? 'on' : 'off'}"></span>`
  ).join('');
}

function renderTagChips(tags) {
  return tags.map(t => {
    const color = categories[t] || '#888';
    return `<span class="tag-chip" style="background:${color}1A;color:${color}">${esc(t)}</span>`;
  }).join('');
}

function renderAll() {
  STATUSES.forEach(renderColumn);
  renderStats();
  renderFilterBar();
  bindColEvents();
  if (activeFilters.size > 0) applyFilters();
}

function renderColumn(status) {
  const col   = document.getElementById('col-' + status);
  const count = document.getElementById('count-' + status);
  const items = colItems(status);
  count.textContent = items.length;
  col.innerHTML = '';

  if (!items.length) {
    col.innerHTML = '<div class="empty-col">Clique em + para adicionar<br>ou arraste um card aqui</div>';
    return;
  }

  items.forEach(ideia => {
    const lineBefore = document.createElement('div');
    lineBefore.className = 'drop-line';
    lineBefore.dataset.before = ideia.id;
    col.appendChild(lineBefore);

    const tags  = parseTags(ideia.tags);
    const hasCx = (ideia.complexidade || 0) > 0;
    const hasIm = (ideia.impacto      || 0) > 0;

    const card = document.createElement('div');
    card.className  = 'card';
    card.id         = 'card-' + ideia.id;
    card.dataset.id = ideia.id;
    card.draggable  = true;

    card.innerHTML = `
      <div class="card-actions">
        <button class="card-dup" onclick="duplicateIdeia(event,'${ideia.id}')" title="Duplicar">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <rect x="4.5" y="4.5" width="7" height="7" rx="1.5"/>
            <path d="M1.5 8.5V2.5a1 1 0 0 1 1-1h6"/>
          </svg>
        </button>
        <button class="card-del" onclick="showDeleteConfirm(event,'${ideia.id}')" title="Excluir">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="1.5,3 11.5,3"/>
            <path d="M4,3V2a.5.5,0,0,1,.5-.5h4A.5.5,0,0,1,9,2V3"/>
            <path d="M2.5,3l.7,7.5a.5.5,0,0,0,.5.5h5.6a.5.5,0,0,0,.5-.5L10.5,3"/>
          </svg>
        </button>
      </div>
      <div class="card-title">${esc(ideia.titulo)}</div>
      ${ideia.descricao ? `<div class="card-desc">${esc(ideia.descricao)}</div>` : ''}
      ${tags.length ? `<div class="card-tags">${renderTagChips(tags)}</div>` : ''}
      ${(hasCx || hasIm) ? `
        <div class="card-indicators">
          ${hasCx ? `<div class="ind-group"><span class="ind-label">Complexidade</span><div class="ind-dots">${renderDots(ideia.complexidade, 'ind')}</div></div>` : ''}
          ${hasIm ? `<div class="ind-group"><span class="ind-label">Impacto</span><div class="ind-dots">${renderDots(ideia.impacto, 'ind')}</div></div>` : ''}
        </div>` : ''}
    `.trim();

    card.addEventListener('dragstart', e => onDragStart(e, ideia.id));
    card.addEventListener('dragend',   onDragEnd);
    card.addEventListener('dragover',  e => onDragOverCard(e, ideia.id, status));
    card.addEventListener('click',     e => onCardClick(e, ideia.id));
    col.appendChild(card);
  });

  const lineAfter = document.createElement('div');
  lineAfter.className = 'drop-line';
  lineAfter.dataset.afterStatus = status;
  col.appendChild(lineAfter);
}

function renderStats() {
  const total = ideias.length;
  const dev   = ideias.filter(i => i.status === 'dev').length;
  const done  = ideias.filter(i => i.status === 'finalizada').length;
  document.getElementById('stats').innerHTML =
    `<div class="stat"><strong>${total}</strong> Total</div>` +
    `<div class="stat"><strong>${dev}</strong> Em dev</div>` +
    `<div class="stat"><strong>${done}</strong> Finalizadas</div>`;
}

/* ── DRAG & DROP ── */
function clearDropUI() {
  document.querySelectorAll('.drop-line').forEach(el => el.classList.remove('visible'));
  document.querySelectorAll('.col-body').forEach(el => el.classList.remove('drag-over-empty'));
}

function onDragStart(e, id) {
  dragId = id; didDrag = false;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', id);
  requestAnimationFrame(() => {
    const el = document.getElementById('card-' + id);
    if (el) el.classList.add('dragging');
  });
}

function onDragEnd() {
  if (dragId) {
    const el = document.getElementById('card-' + dragId);
    if (el) el.classList.remove('dragging');
  }
  dragId = null; dropInfo = null; clearDropUI();
}

function onDragOverCard(e, cardId, status) {
  e.preventDefault(); e.stopPropagation(); didDrag = true;
  if (cardId === dragId) return;
  const card = document.getElementById('card-' + cardId); if (!card) return;
  const { top, height } = card.getBoundingClientRect();
  const pos = e.clientY < top + height / 2 ? 'before' : 'after';
  dropInfo = { cardId, pos, colStatus: status };
  clearDropUI();
  const sib = pos === 'before' ? card.previousElementSibling : card.nextElementSibling;
  if (sib?.classList.contains('drop-line')) sib.classList.add('visible');
}

function bindColEvents() {
  document.querySelectorAll('.col-body').forEach(col => {
    const fresh = col.cloneNode(true);
    col.replaceWith(fresh);
  });

  document.querySelectorAll('.col-body').forEach(col => {
    const status = col.dataset.status;

    col.addEventListener('dragover', e => {
      e.preventDefault(); didDrag = true;
      if (!dropInfo || dropInfo.colStatus !== status) {
        clearDropUI();
        dropInfo = { cardId: null, pos: 'end', colStatus: status };
        const last = col.querySelector(`.drop-line[data-after-status="${status}"]`);
        if (last) last.classList.add('visible');
        else col.classList.add('drag-over-empty');
      }
    });

    col.addEventListener('dragleave', e => {
      if (!col.contains(e.relatedTarget)) { clearDropUI(); dropInfo = null; }
    });

    col.addEventListener('drop', e => {
      e.preventDefault();
      const id = e.dataTransfer.getData('text/plain') || dragId;
      if (!id) return;
      clearDropUI();
      performDrop(id, status, dropInfo?.cardId, dropInfo?.pos ?? 'end');
      dropInfo = null;
    });

    col.querySelectorAll('.card').forEach(card => {
      const cid = card.dataset.id;
      card.addEventListener('dragstart', e => onDragStart(e, cid));
      card.addEventListener('dragend',   onDragEnd);
      card.addEventListener('dragover',  e => onDragOverCard(e, cid, status));
      card.addEventListener('click',     e => onCardClick(e, cid));
    });
  });
}

function performDrop(draggedId, newStatus, targetId, pos) {
  const dragged = ideias.find(i => i.id === draggedId); if (!dragged) return;
  ideias = ideias.filter(i => i.id !== draggedId);

  let col = ideias
    .filter(i => i.status === newStatus)
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

  if (!targetId || pos === 'end') {
    col.push(dragged);
  } else {
    const idx = col.findIndex(i => i.id === targetId);
    col.splice(idx === -1 ? col.length : pos === 'before' ? idx : idx + 1, 0, dragged);
  }

  col.forEach((item, i) => { item.sortOrder = i; item.status = newStatus; });
  ideias = [...ideias.filter(i => i.status !== newStatus), ...col];
  save(); renderAll();
}

function duplicateIdeia(e, id) {
  e.stopPropagation();
  const orig = ideias.find(i => i.id === id);
  if (!orig) return;
  const copy = {
    ...orig,
    id:           genId(),
    titulo:       orig.titulo + ' (cópia)',
    sortOrder:    (orig.sortOrder || 0) + 0.5,
    criadoEm:     Date.now(),
    atualizadoEm: Date.now(),
  };
  ideias.push(copy);
  // Normalize sort orders in the column
  const col = ideias
    .filter(i => i.status === copy.status)
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  col.forEach((item, i) => { item.sortOrder = i; });
  save();
  renderAll();
}

function onCardClick(e, id) {
  if (didDrag) { didDrag = false; return; }
  if (e.target.closest('.card-del'))     return;
  if (e.target.closest('.card-dup'))     return;
  if (e.target.closest('.card-confirm')) return; // don't open edit when confirm is showing
  openEdit(id);
}

/* ── DOT PICKERS ── */
function initDotPickers(cxVal, imVal) {
  setupPicker('pick-cx', 'cx', cxVal || 0);
  setupPicker('pick-im', 'im', imVal || 0);
}

function setupPicker(pickerId, type, initVal) {
  const container = document.getElementById(pickerId);
  container.dataset.val = initVal;
  updatePickerUI(container, type);

  container.querySelectorAll('.dp').forEach(btn => {
    const fresh = btn.cloneNode(true);
    btn.replaceWith(fresh);
  });
  container.querySelectorAll('.dp').forEach(btn => {
    btn.addEventListener('click', () => {
      const n   = parseInt(btn.dataset.n);
      const cur = parseInt(container.dataset.val);
      container.dataset.val = cur === n ? 0 : n;
      updatePickerUI(container, type);
    });
  });
}

function updatePickerUI(container, type) {
  const val    = parseInt(container.dataset.val);
  const labels = type === 'cx' ? CX_LABELS : IM_LABELS;
  container.querySelectorAll('.dp').forEach((btn, i) => {
    btn.classList.toggle('on', i < val);
  });
  const lbl = document.getElementById('lbl-' + type);
  if (lbl) lbl.textContent = labels[val] || '—';
}

function getPickerVal(pickerId) {
  return parseInt(document.getElementById(pickerId)?.dataset.val) || 0;
}

/* ── MODAL ── */
function openModal(defaultStatus) {
  editingId = null;
  document.getElementById('modal-title').textContent = 'Nova ideia';
  document.getElementById('f-titulo').value = '';
  document.getElementById('f-desc').value   = '';
  document.getElementById('f-status').value = defaultStatus || 'sandbox';
  initDotPickers(0, 0);
  initTagsPicker('');
  document.getElementById('overlay').classList.remove('hidden');
  setTimeout(() => document.getElementById('f-titulo').focus(), 60);
}

function openEdit(id) {
  const o = ideias.find(i => i.id === id); if (!o) return;
  editingId = id;
  document.getElementById('modal-title').textContent = 'Editar ideia';
  document.getElementById('f-titulo').value = o.titulo    || '';
  document.getElementById('f-desc').value   = o.descricao || '';
  document.getElementById('f-status').value = o.status    || 'sandbox';
  initDotPickers(o.complexidade || 0, o.impacto || 0);
  initTagsPicker(o.tags || '');
  document.getElementById('overlay').classList.remove('hidden');
  setTimeout(() => document.getElementById('f-titulo').focus(), 60);
}

function closeModal() {
  document.getElementById('overlay').classList.add('hidden');
  editingId = null;
}

function handleOverlayClick(e) {
  if (e.target.id === 'overlay') closeModal();
}

function saveIdeia() {
  const titulo = document.getElementById('f-titulo').value.trim();
  if (!titulo) {
    const el = document.getElementById('f-titulo');
    el.focus();
    el.style.borderColor = '#B91C1C';
    el.style.boxShadow   = '0 0 0 3px rgba(185,28,28,0.15)';
    setTimeout(() => { el.style.borderColor = ''; el.style.boxShadow = ''; }, 2200);
    return;
  }

  const newStatus = document.getElementById('f-status').value;
  const tags      = document.getElementById('f-tags').value.trim();

  parseTags(tags).forEach(t => ensureCategory(t));

  const data = {
    titulo,
    descricao:    document.getElementById('f-desc').value.trim(),
    tags,
    status:       newStatus,
    complexidade: getPickerVal('pick-cx'),
    impacto:      getPickerVal('pick-im'),
    atualizadoEm: Date.now(),
  };

  if (editingId) {
    const idx = ideias.findIndex(i => i.id === editingId);
    if (idx !== -1) ideias[idx] = { ...ideias[idx], ...data };
  } else {
    ideias.push({
      id:        genId(),
      sortOrder: maxOrder(newStatus) + 1,
      criadoEm:  Date.now(),
      ...data,
    });
  }

  save(); renderAll(); closeModal();
}

/* ── GLOBAL EVENTS ── */
document.addEventListener('click', e => {
  // Close inline tag color grid when clicking outside the dot or the grid itself
  if (!e.target.closest('.tag-color-dot') &&
      !e.target.closest('.tag-color-grid-wrap')) {
    closeColorPicker();
  }
  // Close column color picker when clicking outside the col-dot or the picker
  if (!e.target.closest('.col-dot-edit') &&
      !e.target.closest('.col-cpicker')) {
    closeColColorPicker();
  }
  // Close card-confirm when clicking outside both the confirm and the delete button
  if (!e.target.closest('.card-confirm') &&
      !e.target.closest('.card-del')) {
    closeHdConfirm();
  }
});

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  closeModal(); closeTagsModal(); closeHdConfirm(); closeColorPicker(); closeColColorPicker();
});

/* ── SEED ── */
function seedIfEmpty() {
  if (ideias.length) return;
  ideias = [
    {
      id: genId(), status: 'sandbox', sortOrder: 0,
      titulo:      'Resumo semanal de sinais de lojistas',
      descricao:   'Digest automático com os principais sinais da semana — GMV, ativações, tickets de suporte.',
      tags:        'Automação, Sales',
      complexidade: 1, impacto: 3,
      criadoEm: Date.now(), atualizadoEm: Date.now(),
    },
    {
      id: genId(), status: 'dev', sortOrder: 0,
      titulo:      'Alerta de oportunidade de upsell',
      descricao:   'Monitora sinais e notifica o rep quando um merchant atinge critérios de upgrade.',
      tags:        'AI, Alto Impacto',
      complexidade: 2, impacto: 3,
      criadoEm: Date.now() - 86400000, atualizadoEm: Date.now(),
    },
  ];
  save();
}

/* ── STICKY OFFSET ── */
function updateStickyOffset() {
  const h = document.querySelector('.sticky-top')?.offsetHeight || 0;
  document.documentElement.style.setProperty('--sticky-h', h + 'px');
}

/* ── INIT ── */
load();
applyColColors(); // apply any saved column colors before first paint
seedIfEmpty();
renderAll();
updateStickyOffset();
window.addEventListener('resize', updateStickyOffset);
