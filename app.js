/* ═══════════════════════════════════════════════════════════
   SANDBOX DE IDEIAS — app.js
   ═══════════════════════════════════════════════════════════ */

'use strict';

const STATUSES = ['sandbox', 'dev', 'finalizada', 'descartada'];
const STATUS_LABELS = {
  sandbox:     'Sandbox',
  dev:         'Em Desenvolvimento',
  finalizada:  'Finalizada',
  descartada:  'Descartada',
};

let ideias    = [];
let editingId = null;
let dragId    = null;
let didDrag   = false;
let dropInfo  = null;  // { cardId, pos: 'before'|'after'|'end', colStatus }


/* ═══════════════════════════════════════════════════════════
   STORAGE
   ═══════════════════════════════════════════════════════════ */

const STORAGE_KEY = 'sandbox-ideias-v1';

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) ideias = JSON.parse(raw);
  } catch (_) {
    ideias = [];
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ideias));
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}


/* ═══════════════════════════════════════════════════════════
   TAGS
   ═══════════════════════════════════════════════════════════ */

function parseTags(str) {
  return String(str || '').split(',').map(t => t.trim()).filter(Boolean);
}

/**
 * Deterministic color index 0-6 based on tag string.
 * Same tag always gets the same color.
 */
function chipIndex(tag) {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) & 0xffff;
  return h % 7;
}

function renderChips(tags) {
  return tags
    .map(t => `<span class="chip chip-${chipIndex(t)}">${esc(t)}</span>`)
    .join('');
}


/* ═══════════════════════════════════════════════════════════
   QUICK-ADD PARSING
   "Minha ideia #AI #Sales" → { title: "Minha ideia", tags: ["AI", "Sales"] }
   ═══════════════════════════════════════════════════════════ */

function parseQuickInput(raw) {
  const tags = [];
  const title = raw
    .replace(/#(\S+)/g, (_, t) => { tags.push(t); return ''; })
    .replace(/\s+/g, ' ')
    .trim();
  return { title, tags };
}


/* ═══════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════ */

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function colItems(status) {
  return ideias
    .filter(i => i.status === status)
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
}

function maxOrder(status) {
  return ideias
    .filter(i => i.status === status)
    .reduce((m, i) => Math.max(m, i.sortOrder || 0), -1);
}


/* ═══════════════════════════════════════════════════════════
   RENDER
   ═══════════════════════════════════════════════════════════ */

function renderAll() {
  STATUSES.forEach(renderColumn);
  renderStats();
  bindColEvents();
}

function renderColumn(status) {
  const col   = document.getElementById('col-' + status);
  const count = document.getElementById('count-' + status);
  const items = colItems(status);

  count.textContent = items.length;
  col.innerHTML = '';

  if (!items.length) {
    col.innerHTML = '<div class="empty-col">Arraste um card aqui<br>ou use a barra acima</div>';
    return;
  }

  items.forEach(ideia => {
    // ── Drop indicator (before card) ──
    const lineBefore = document.createElement('div');
    lineBefore.className = 'drop-line';
    lineBefore.dataset.before = ideia.id;
    col.appendChild(lineBefore);

    // ── Card ──
    const tags = parseTags(ideia.tags);
    const card = document.createElement('div');
    card.className  = 'card';
    card.id         = 'card-' + ideia.id;
    card.dataset.id = ideia.id;
    card.draggable  = true;

    card.innerHTML = `
      <button class="card-menu" title="Opções" onclick="openCtx(event,'${ideia.id}')">⋯</button>
      <div class="card-title">${esc(ideia.titulo)}</div>
      ${ideia.descricao ? `<div class="card-desc">${esc(ideia.descricao)}</div>` : ''}
      ${tags.length ? `<div class="card-chips">${renderChips(tags)}</div>` : ''}
    `.trim();

    card.addEventListener('dragstart', e => onDragStart(e, ideia.id));
    card.addEventListener('dragend',   onDragEnd);
    card.addEventListener('dragover',  e => onDragOverCard(e, ideia.id, status));
    card.addEventListener('click',     e => onCardClick(e, ideia.id));

    col.appendChild(card);
  });

  // ── Drop indicator after last card ──
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
    `<div class="stat"><strong>${total}</strong> total</div>` +
    `<div class="stat"><strong>${dev}</strong> em dev</div>` +
    `<div class="stat"><strong>${done}</strong> finalizadas</div>`;
}


/* ═══════════════════════════════════════════════════════════
   DRAG & DROP
   ═══════════════════════════════════════════════════════════ */

function clearDropUI() {
  document.querySelectorAll('.drop-line').forEach(el => el.classList.remove('visible'));
  document.querySelectorAll('.col-body').forEach(el => el.classList.remove('drag-over-empty'));
}

function onDragStart(e, id) {
  dragId  = id;
  didDrag = false;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', id);
  // slight delay so the ghost image captures non-dimmed state
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
  dragId   = null;
  dropInfo = null;
  clearDropUI();
}

function onDragOverCard(e, cardId, status) {
  e.preventDefault();
  e.stopPropagation();
  didDrag = true;
  if (cardId === dragId) return;

  const card = document.getElementById('card-' + cardId);
  if (!card) return;

  const { top, height } = card.getBoundingClientRect();
  const pos = e.clientY < top + height / 2 ? 'before' : 'after';

  dropInfo = { cardId, pos, colStatus: status };
  clearDropUI();

  const sibling = pos === 'before'
    ? card.previousElementSibling
    : card.nextElementSibling;

  if (sibling?.classList.contains('drop-line')) {
    sibling.classList.add('visible');
  }
}

/**
 * Re-bind column-level drag events after each render
 * (cloneNode trick removes stale listeners).
 */
function bindColEvents() {
  document.querySelectorAll('.col-body').forEach(col => {
    const fresh = col.cloneNode(true);
    col.replaceWith(fresh);
  });

  document.querySelectorAll('.col-body').forEach(col => {
    const status = col.dataset.status;

    col.addEventListener('dragover', e => {
      e.preventDefault();
      didDrag = true;

      // Only update dropInfo if we're not already hovering a specific card
      if (!dropInfo || dropInfo.colStatus !== status) {
        clearDropUI();
        dropInfo = { cardId: null, pos: 'end', colStatus: status };
        const lastLine = col.querySelector(`.drop-line[data-after-status="${status}"]`);
        if (lastLine) lastLine.classList.add('visible');
        else col.classList.add('drag-over-empty');
      }
    });

    col.addEventListener('dragleave', e => {
      if (!col.contains(e.relatedTarget)) {
        clearDropUI();
        dropInfo = null;
      }
    });

    col.addEventListener('drop', e => {
      e.preventDefault();
      const id = e.dataTransfer.getData('text/plain') || dragId;
      if (!id) return;
      clearDropUI();
      performDrop(id, status, dropInfo?.cardId, dropInfo?.pos ?? 'end');
      dropInfo = null;
    });

    // Re-bind card-level events after cloneNode
    col.querySelectorAll('.card').forEach(card => {
      const cid = card.dataset.id;
      card.addEventListener('dragstart', e => onDragStart(e, cid));
      card.addEventListener('dragend',   onDragEnd);
      card.addEventListener('dragover',  e => onDragOverCard(e, cid, status));
      card.addEventListener('click',     e => onCardClick(e, cid));
    });
  });
}

function performDrop(draggedId, newStatus, targetCardId, pos) {
  const dragged = ideias.find(i => i.id === draggedId);
  if (!dragged) return;

  // Remove from current position
  ideias = ideias.filter(i => i.id !== draggedId);

  // Get ordered items in the target column (after removal)
  let col = ideias
    .filter(i => i.status === newStatus)
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

  if (!targetCardId || pos === 'end') {
    col.push(dragged);
  } else {
    const idx = col.findIndex(i => i.id === targetCardId);
    if (idx === -1) {
      col.push(dragged);
    } else {
      col.splice(pos === 'before' ? idx : idx + 1, 0, dragged);
    }
  }

  // Re-assign sortOrder contiguously
  col.forEach((item, i) => {
    item.sortOrder = i;
    item.status    = newStatus;
  });

  // Merge back
  ideias = [
    ...ideias.filter(i => i.status !== newStatus),
    ...col,
  ];

  save();
  renderAll();
}

function onCardClick(e, id) {
  if (didDrag) { didDrag = false; return; }
  if (e.target.classList.contains('card-menu')) return;
  openEdit(id);
}


/* ═══════════════════════════════════════════════════════════
   QUICK ADD
   ═══════════════════════════════════════════════════════════ */

document.getElementById('quick-input').addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const raw = e.target.value.trim();
  if (!raw) return;

  const { title, tags } = parseQuickInput(raw);
  if (!title) return;

  ideias.push({
    id:           genId(),
    titulo:       title,
    descricao:    '',
    tags:         tags.join(', '),
    status:       'sandbox',
    sortOrder:    maxOrder('sandbox') + 1,
    criadoEm:     Date.now(),
    atualizadoEm: Date.now(),
    // detail fields (empty by default)
    problema: '', quem: '', proximo: '', complexidade: '', impacto: '',
  });

  save();
  renderAll();
  e.target.value = '';
  e.target.focus();
});

// Click anywhere on the quick-add box to focus the input
document.getElementById('quick-add-box').addEventListener('click', () => {
  document.getElementById('quick-input').focus();
});


/* ═══════════════════════════════════════════════════════════
   MODAL
   ═══════════════════════════════════════════════════════════ */

function onStatusChange() {
  const s = document.getElementById('f-status').value;
  document.getElementById('extra-fields').classList.toggle('hidden', s === 'sandbox');
}

function openModal(id) {
  editingId = id || null;

  const delBtn = document.getElementById('btn-delete');
  document.getElementById('modal-title').textContent = id ? 'Editar ideia' : 'Nova ideia';
  id ? delBtn.classList.remove('hidden') : delBtn.classList.add('hidden');

  if (id) {
    const o = ideias.find(i => i.id === id);
    if (!o) return;
    document.getElementById('f-titulo').value    = o.titulo       || '';
    document.getElementById('f-descricao').value = o.descricao    || '';
    document.getElementById('f-tags').value      = o.tags         || '';
    document.getElementById('f-status').value    = o.status       || 'sandbox';
    document.getElementById('f-problema').value  = o.problema     || '';
    document.getElementById('f-quem').value      = o.quem         || '';
    document.getElementById('f-proximo').value   = o.proximo      || '';
    document.getElementById('f-cx').value        = o.complexidade || '';
    document.getElementById('f-im').value        = o.impacto      || '';
  } else {
    ['f-titulo', 'f-descricao', 'f-tags', 'f-problema', 'f-quem', 'f-proximo']
      .forEach(fid => { document.getElementById(fid).value = ''; });
    document.getElementById('f-cx').value     = '';
    document.getElementById('f-im').value     = '';
    document.getElementById('f-status').value = 'sandbox';
  }

  onStatusChange();
  document.getElementById('overlay').classList.remove('hidden');
  setTimeout(() => document.getElementById('f-titulo').focus(), 60);
}

function openEdit(id) { openModal(id); }

function closeModal() {
  document.getElementById('overlay').classList.add('hidden');
  editingId = null;
}

function closeModalOutside(e) {
  if (e.target.id === 'overlay') closeModal();
}

function saveIdeia() {
  const titulo = document.getElementById('f-titulo').value.trim();
  if (!titulo) {
    const el = document.getElementById('f-titulo');
    el.focus();
    el.style.borderColor = '#DC2626';
    el.style.boxShadow   = '0 0 0 3px #FEE2E2';
    setTimeout(() => { el.style.borderColor = ''; el.style.boxShadow = ''; }, 2200);
    return;
  }

  const newStatus = document.getElementById('f-status').value;
  const data = {
    titulo,
    descricao:    document.getElementById('f-descricao').value.trim(),
    tags:         document.getElementById('f-tags').value.trim(),
    status:       newStatus,
    problema:     document.getElementById('f-problema').value.trim(),
    quem:         document.getElementById('f-quem').value.trim(),
    proximo:      document.getElementById('f-proximo').value.trim(),
    complexidade: document.getElementById('f-cx').value,
    impacto:      document.getElementById('f-im').value,
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

  save();
  renderAll();
  closeModal();
}

function deleteIdeia() {
  if (!editingId) return;
  if (!confirm('Excluir esta ideia?')) return;
  ideias = ideias.filter(i => i.id !== editingId);
  save();
  renderAll();
  closeModal();
}


/* ═══════════════════════════════════════════════════════════
   CONTEXT MENU
   ═══════════════════════════════════════════════════════════ */

function openCtx(e, id) {
  e.stopPropagation();
  const o = ideias.find(i => i.id === id);
  if (!o) return;

  const menu = document.getElementById('ctx-menu');
  menu.innerHTML =
    `<div class="ctx-item" onclick="openEdit('${id}');closeCtx()">✏️&nbsp; Editar</div>` +
    `<div class="ctx-sep"></div>` +
    `<div class="ctx-label">Mover para</div>` +
    STATUSES
      .filter(s => s !== o.status)
      .map(s => `<div class="ctx-item" onclick="moveIdeia('${id}','${s}');closeCtx()">${STATUS_LABELS[s]}</div>`)
      .join('') +
    `<div class="ctx-sep"></div>` +
    `<div class="ctx-item danger" onclick="quickDelete('${id}')">🗑️&nbsp; Excluir</div>`;

  const rect = e.target.getBoundingClientRect();
  const top  = rect.bottom + 4;
  const left = Math.min(rect.left, window.innerWidth - 200);
  menu.style.top  = top  + 'px';
  menu.style.left = left + 'px';
  menu.classList.remove('hidden');
}

function closeCtx() {
  document.getElementById('ctx-menu').classList.add('hidden');
}

function moveIdeia(id, status) {
  const idx = ideias.findIndex(i => i.id === id);
  if (idx === -1) return;
  ideias[idx].status       = status;
  ideias[idx].sortOrder    = maxOrder(status) + 1;
  ideias[idx].atualizadoEm = Date.now();
  save();
  renderAll();
}

function quickDelete(id) {
  closeCtx();
  if (!confirm('Excluir esta ideia?')) return;
  ideias = ideias.filter(i => i.id !== id);
  save();
  renderAll();
}


/* ═══════════════════════════════════════════════════════════
   EXPORT / IMPORT
   ═══════════════════════════════════════════════════════════ */

function exportData() {
  const json = JSON.stringify(ideias, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), {
    href:     url,
    download: `sandbox-${new Date().toISOString().slice(0, 10)}.json`,
  });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function importData(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const imported = JSON.parse(ev.target.result);
      if (!Array.isArray(imported)) throw new Error('formato inválido');
      if (confirm(`Importar ${imported.length} ideias? Os dados atuais serão substituídos.`)) {
        ideias = imported;
        save();
        renderAll();
      }
    } catch (_) {
      alert('Arquivo inválido. Use um JSON exportado pelo Sandbox.');
    }
    e.target.value = '';
  };
  reader.readAsText(file);
}


/* ═══════════════════════════════════════════════════════════
   GLOBAL KEYBOARD SHORTCUTS
   ═══════════════════════════════════════════════════════════ */

document.addEventListener('keydown', e => {
  const inInput = e.target.matches('input, textarea, select');
  const modalOpen = !document.getElementById('overlay').classList.contains('hidden');

  if (e.key === 'Escape') {
    closeModal();
    closeCtx();
    return;
  }

  // 'n' = new idea (when modal is closed and not typing)
  if (e.key === 'n' && !inInput && !modalOpen) {
    openModal();
    return;
  }

  // '/' = focus quick-add (when modal is closed)
  if (e.key === '/' && !inInput && !modalOpen) {
    e.preventDefault();
    document.getElementById('quick-input').focus();
  }
});

document.addEventListener('click', e => {
  if (!e.target.closest('#ctx-menu') && !e.target.classList.contains('card-menu')) {
    closeCtx();
  }
});


/* ═══════════════════════════════════════════════════════════
   SEED DATA (only on first open)
   ═══════════════════════════════════════════════════════════ */

function seedIfEmpty() {
  if (ideias.length) return;

  ideias = [
    {
      id: genId(), status: 'sandbox', sortOrder: 0,
      titulo: 'Resumo semanal de sinais de lojistas',
      descricao: 'Toda segunda me pergunto: quais lojistas cresceram, quais travaram? Um digest automático com os principais sinais da semana — GMV, ativações, tickets de suporte.',
      tags: 'Automação, Sales',
      criadoEm: Date.now(), atualizadoEm: Date.now(),
      problema: '', quem: '', proximo: '', complexidade: '', impacto: '',
    },
    {
      id: genId(), status: 'dev', sortOrder: 0,
      titulo: 'Alerta de oportunidade de upsell',
      descricao: 'Monitora sinais de crescimento e notifica o rep de Sales quando um merchant atinge critérios de upgrade.',
      tags: 'AI, Alto Impacto',
      problema: 'Time de Sales não vê quando agir',
      quem: 'Sales Mid Market',
      proximo: 'Validar no HubSpot',
      complexidade: 'M', impacto: 'G',
      criadoEm: Date.now() - 86400000, atualizadoEm: Date.now(),
    },
  ];

  save();
}


/* ═══════════════════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════════════════ */

load();
seedIfEmpty();
renderAll();

// Auto-focus the quick-add input on load
document.getElementById('quick-input').focus();
