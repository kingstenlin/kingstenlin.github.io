// ─────────────────────────────────────────────────────────────
//  State
// ─────────────────────────────────────────────────────────────
let singers = [];     // { id, name, part, height, rowIdx }
let rows = [];        // [{ id, slots: [singerId|null, ...], stagger: bool }]
let showHeights = false;
let draggedSingerId = null;
let dragSource = null;
let pendingImport = [];
let nextId = 1;
let activePartFilters = new Set(); // empty = show all

// Slot context menu state
let slotMenuEl = null;
let slotMenuRowId = null;
let slotMenuSlotIdx = null;

const PARTS = {
  S1: { label: 'Soprano 1', color: '#e07b54', light: '#fef0ea', arrow: '↑' },
  S2: { label: 'Soprano 2', color: '#e07b54', light: '#fef0ea', arrow: '↓' },
  A1: { label: 'Alto 1',    color: '#d8ca2f', light: '#efedd2', arrow: '↑' },
  A2: { label: 'Alto 2',    color: '#d8ca2f', light: '#efedd2', arrow: '↓' },
  T1: { label: 'Tenor 1',   color: '#27ae60', light: '#e9f7ef', arrow: '↑' },
  T2: { label: 'Tenor 2',   color: '#27ae60', light: '#e9f7ef', arrow: '↓' },
  B1: { label: 'Bass 1',    color: '#1a6b8a', light: '#e5f3f8', arrow: '↑' },
  B2: { label: 'Bass 2',    color: '#1a6b8a', light: '#e5f3f8', arrow: '↓' },
};

const SECTION_ORDER = ['S1','S2','A1','A2','T1','T2','B1','B2'];

// ─────────────────────────────────────────────────────────────
//  Utility
// ─────────────────────────────────────────────────────────────
function uid() { return 'id_' + (nextId++) + '_' + Math.random().toString(36).slice(2,6); }
function getSinger(id) { return singers.find(s => s.id === id); }
function poolSingers() {
  const placed = new Set(rows.flatMap(r => r.slots).filter(Boolean));
  return singers.filter(s => !placed.has(s.id));
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add('hidden'), 2200);
}

// ─────────────────────────────────────────────────────────────
//  Render
// ─────────────────────────────────────────────────────────────
function render() {
  renderFilterChips();
  renderPool();
  renderStage();
  renderLegend();
}

function renderFilterChips() {
  const container = document.getElementById('filterChips');
  container.innerHTML = '';

  // "All" chip
  const allChip = document.createElement('button');
  allChip.className = 'filter-chip-all' + (activePartFilters.size === 0 ? ' active' : '');
  allChip.textContent = 'All';
  allChip.onclick = () => { activePartFilters.clear(); render(); };
  container.appendChild(allChip);

  SECTION_ORDER.forEach(part => {
    if (!singers.find(s => s.part === part)) return;
    const p = PARTS[part];
    const chip = document.createElement('button');
    chip.className = 'filter-chip' + (activePartFilters.has(part) ? ' active' : '');
    chip.textContent = part;
    chip.style.color = p.color;
    chip.style.background = p.light;
    chip.onclick = () => {
      if (activePartFilters.has(part)) activePartFilters.delete(part);
      else activePartFilters.add(part);
      if (activePartFilters.size === 0) { /* all */ }
      render();
    };
    container.appendChild(chip);
  });
}

function renderPool() {
  const pool = document.getElementById('singerPool');
  pool.innerHTML = '';

  const searchQ = (document.getElementById('poolSearch')?.value || '').trim().toLowerCase();
  let ps = poolSingers();

  // apply part filter
  if (activePartFilters.size > 0) {
    ps = ps.filter(s => activePartFilters.has(s.part));
  }
  // apply search
  if (searchQ) {
    ps = ps.filter(s => s.name.toLowerCase().includes(searchQ));
  }

  if (ps.length === 0) {
    pool.innerHTML = '<div style="color:var(--muted);font-size:0.8rem;text-align:center;padding:12px;">' +
      (searchQ || activePartFilters.size ? 'No matches' : 'All singers placed') + '</div>';
  } else {
    SECTION_ORDER.forEach(part => {
      const group = ps.filter(s => s.part === part);
      if (!group.length) return;
      const lbl = document.createElement('div');
      lbl.className = 'section-label';
      lbl.textContent = PARTS[part].label;
      pool.appendChild(lbl);
      const row = document.createElement('div');
      row.className = 'pool-section-group';
      group.forEach(s => {s.singerRow = null; row.appendChild(makeSingerCard(s, 'pool'))});
      pool.appendChild(row);
    });
  }

  pool.addEventListener('dragover', e => { e.preventDefault(); pool.classList.add('drag-over'); });
  pool.addEventListener('dragleave', () => pool.classList.remove('drag-over'));
  pool.addEventListener('drop', e => {
    e.preventDefault();
    pool.classList.remove('drag-over');
    if (!draggedSingerId) return;
    if (dragSource && typeof dragSource === 'object') {
      const srcRow = rows.find(r => r.id === dragSource.rowId);
      if (srcRow) srcRow.slots[dragSource.slotIdx] = null;
    }
    const tarSinger = singers.find(s => s.id === draggedSingerId);
    if (tarSinger) tarSinger.singerRow = null;
    render();
    showToast(`${getSinger(draggedSingerId)?.name || ''} removed from chart`);
  });
}

function makeSingerCard(singer, source) {
  const p = PARTS[singer.part];
  const card = document.createElement('div');
  card.className = 'singer-card';
  card.dataset.singerId = singer.id;
  card.style.background = p.light;
  card.style.borderColor = p.color;
  card.style.color = "#2a2520";
  card.draggable = true;

  card.innerHTML = `
    <div class="singer-arrow">${p.arrow}</div>
    <div class="singer-name">${singer.name}</div>
    <div class="singer-part">${singer.singerRow ? singer.singerRow : ""}</div>
    ${singer.height ? `<div class="singer-height">${singer.height}</div>` : ''}
    <div class="card-delete" title="Remove singer" onclick="returnSinger(event,'${singer.id}')">✕</div>
  `;

  const hEl = card.querySelector('.singer-height');
  if (hEl) hEl.style.display = showHeights ? '' : 'none';

  card.addEventListener('dragstart', e => {
    draggedSingerId = singer.id;
    dragSource = source;
    setTimeout(() => card.classList.add('dragging'), 0);
    e.dataTransfer.effectAllowed = 'move';
  });
  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    draggedSingerId = null;
    dragSource = null;
  });
  return card;
}

function renderStage() {
  const stage = document.getElementById('stage');
  const frontLabel = stage.querySelector('.stage-front-label');
  const conductorLabel = stage.querySelector('.stage-conductor-label');
  stage.innerHTML = '';
  stage.appendChild(frontLabel);
  stage.appendChild(conductorLabel)
  rows.forEach((row, rowIdx) => {

    // Insert-row zone ABOVE this row (between rows)
    const insertZone = document.createElement('div');
    insertZone.className = 'insert-row-zone';
    insertZone.innerHTML = `
      <div class="insert-row-btns">
        <button class="insert-row-btn" onclick="insertRow(${rowIdx - 1}, false)">+ Insert Row Here</button>
      </div>`;
    stage.prepend(insertZone);

    const rowEl = document.createElement('div');
    rowEl.className = 'riser-row' + (row.stagger ? ' staggered' : '');
    rowEl.dataset.rowId = row.id;

    const ctrl = document.createElement('div');
    ctrl.className = 'riser-controls';
    ctrl.innerHTML = `
      <button class="riser-btn" title="Delete row" onclick="removeRow('${row.id}')">✕</button>
    `;
    rowEl.appendChild(ctrl);

    const rowLabel = document.createElement('div');
    rowLabel.className = 'riser-label';
    rowLabel.textContent = `Row ${rowIdx + 1}`;
    rowEl.appendChild(rowLabel);

    const slotsEl = document.createElement('div');
    slotsEl.className = 'slots-container';

    row.slots.forEach((singerId, slotIdx) => {
      const slot = document.createElement('div');
      slot.className = 'slot';
      

      if (singerId === '__OBSTACLE__') {
        slot.classList.add('obstacle');
        slot.title = 'Obstacle / forced empty';
        // allow right-click or click to remove obstacle
        slot.addEventListener('click', () => openSlotMenu(slot, row.id, slotIdx, 1));
        // right click listener
          slot.addEventListener('contextmenu', (event) => {
            // 1. Stop the browser's default right-click menu from appearing
            event.preventDefault();
            openSlotMenu(slot, row.id, slotIdx, 1)
          });      
        slotsEl.appendChild(slot);
        return;
      }

      if (singerId === '__INVISIBLE__') {
        slot.classList.add('invisible');
        slot.title = 'Invisible tile for staggering';
        // allow right-click or click to remove invis
        slot.addEventListener('click', () => openSlotMenu(slot, row.id, slotIdx, 2));
        // right click listener
          slot.addEventListener('contextmenu', (event) => {
            // 1. Stop the browser's default right-click menu from appearing
            event.preventDefault();
            openSlotMenu(slot, row.id, slotIdx, 2)
          });      
        slotsEl.appendChild(slot);
        return;
      }

      slot.addEventListener('dragover', e => { e.preventDefault(); slot.classList.add('drag-over'); });
      slot.addEventListener('dragleave', () => slot.classList.remove('drag-over'));
      slot.addEventListener('drop', e => {
        e.preventDefault();
        slot.classList.remove('drag-over');
        handleDrop(row.id, slotIdx, singerId);
      });

      const slotDel = document.createElement('div');
      slotDel.className = 'slot-delete';
      slotDel.textContent = '✕';
      slotDel.title = 'Remove slot';
      slotDel.onclick = (e) => { e.stopPropagation(); removeSlot(row.id, slotIdx);};
      slot.appendChild(slotDel);

      // right click listener
          slot.addEventListener('contextmenu', (event) => {
            // 1. Stop the browser's default right-click menu from appearing
            event.preventDefault();
            openSlotMenu(slot, row.id, slotIdx, false)
          });      

      if (singerId) {
        const s = getSinger(singerId);
        if (s) {
          const card = makeSingerCard(s, { rowId: row.id, slotIdx });
          card.style.width = '88px';
          card.style.height = '70px';
          slot.appendChild(card);
          slotDel.style.display = 'none';
          slot.style.border = 'none';
          slot.style.background = 'transparent';
        }
      } else {
        // Empty slot: click opens context menu
        slot.style.cursor = 'pointer';
        slot.addEventListener('click', (e) => {
          if (e.target === slotDel || slotDel.contains(e.target)) return;
          openSlotMenu(slot, row.id, slotIdx, false);
        });
      }

      slotsEl.appendChild(slot);
    });
    const endRowLabel = document.createElement('div');
    endRowLabel.className = 'riser-label';
    endRowLabel.textContent = `Row ${rowIdx + 1}`;
    slotsEl.appendChild(endRowLabel);


    const addSlot = document.createElement('button');
    addSlot.className = 'add-slot-btn';
    addSlot.title = 'Add slot';
    addSlot.innerHTML = '+';
    addSlot.onclick = () => addSlot2Row(row.id);
    slotsEl.appendChild(addSlot);
    rowEl.appendChild(slotsEl);
    stage.prepend(rowEl);

  });

  const insertBottom = document.createElement('div');
  insertBottom.className = 'insert-row-zone';
  insertBottom.innerHTML = `
    <div class="insert-row-btns">
      <button class="insert-row-btn" onclick="insertRow(rows.length - 1, false)">+ Insert Row Here </button>
    </div>`;
  stage.prepend(insertBottom);
  //stage.insertBefore(insertBottom, stage.children[stage.children.length - 2])
    const backOfStage = document.createElement('div')
  backOfStage.className = 'stage-back-label'
  backOfStage.textContent = '▼ BACK OF STAGE ▼'
  stage.prepend(backOfStage)
}

function renderLegend() {
  const leg = document.getElementById('legend');
  leg.innerHTML = '';
  SECTION_ORDER.forEach(part => {
    if (!singers.find(s => s.part === part)) return;
    const p = PARTS[part];
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.innerHTML = `<div class="legend-dot" style="background:${p.color}"></div><span>${p.arrow} ${p.label}</span>`;
    leg.appendChild(item);
  });
}

// ─────────────────────────────────────────────────────────────
//  Slot Context Menu
// ─────────────────────────────────────────────────────────────
function openSlotMenu(slotEl, rowId, slotIdx, isObstacle) {
  // isObstacle = 0 is regular cell, 1 is obstacle, 2 is invisible
  closeSlotMenu();

  slotMenuRowId = rowId;
  slotMenuSlotIdx = slotIdx;

  const menu = document.createElement('div');
  menu.className = 'slot-menu';
  menu.id = 'slotMenu';
  slotMenuEl = menu;

  if (isObstacle === 1) {
    menu.innerHTML = `
      <div class="slot-menu-actions">
        <button class="slot-menu-action" onclick="insertSlot('${rowId}',${slotIdx},'left')">← Insert left</button>
        <button class="slot-menu-action" onclick="insertSlot('${rowId}',${slotIdx},'right')">Insert right →</button>
        <button class="slot-menu-action obstacle-action" onclick="clearObstacle('${rowId}',${slotIdx})">Remove obstacle</button>
        <button class="slot-menu-action danger" onclick="removeSlot('${rowId}',${slotIdx});closeSlotMenu()">Delete slot</button>
      </div>`;
  } else if (isObstacle === 2) {
    menu.innerHTML = `
      <div class="slot-menu-actions">
        <button class="slot-menu-action" onclick="insertSlot('${rowId}',${slotIdx},'left')">← Insert left</button>
        <button class="slot-menu-action" onclick="insertSlot('${rowId}',${slotIdx},'right')">Insert right →</button>
        <button class="slot-menu-action obstacle-action" onclick="clearInvisible('${rowId}',${slotIdx})">Remove invisible</button>
        <button class="slot-menu-action danger" onclick="removeSlot('${rowId}',${slotIdx});closeSlotMenu()">Delete slot</button>
      </div>`;
  }
  else {
    const pool = poolSingers();
    menu.innerHTML = `
      <div class="slot-menu-search">
        <input type="text" id="slotSearchInput" placeholder="Search singer…" autocomplete="off">
      </div>
      <div class="slot-menu-title">Pool</div>
      <div class="slot-menu-results" id="slotMenuResults"></div>
      <div class="slot-menu-actions">
        <button class="slot-menu-action" onclick="insertSlot('${rowId}',${slotIdx},'left')">← Insert left</button>
        <button class="slot-menu-action" onclick="insertSlot('${rowId}',${slotIdx},'right')">Insert right →</button>
        <button class="slot-menu-action obstacle-action" style="min-width:100%;flex-basis:100%;" onclick="markObstacle('${rowId}',${slotIdx})">🚫 Mark as obstacle</button>
        <button class="slot-menu-action obstacle-action" style="min-width:100%;flex-basis:100%;" onclick="markInvisible('${rowId}',${slotIdx})">☁ Mark as invisible</button>
        <button class="slot-menu-action danger" style="min-width:100%;flex-basis:100%;" onclick="removeSlot('${rowId}',${slotIdx});closeSlotMenu()">✕ Delete slot</button>
      </div>`;
  }

  document.body.appendChild(menu);

  // Position near slot
  const rect = slotEl.getBoundingClientRect();
  let top = rect.bottom + 6;
  let left = rect.left;
  if (top + 340 > window.innerHeight) top = rect.top - 340;
  if (left + 244 > window.innerWidth) left = window.innerWidth - 250;
  menu.style.top = top + 'px';
  menu.style.left = left + 'px';

  if (!isObstacle) {
    renderSlotMenuResults('');
    const inp = document.getElementById('slotSearchInput');
    if (inp) {
      inp.focus();
      inp.addEventListener('input', () => renderSlotMenuResults(inp.value));
    }
  }
}

function renderSlotMenuResults(query) {
  const container = document.getElementById('slotMenuResults');
  if (!container) return;
  const q = query.trim().toLowerCase();
  let ps = poolSingers();
  if (q) ps = ps.filter(s => s.name.toLowerCase().includes(q));

  container.innerHTML = '';
  if (ps.length === 0) {
    container.innerHTML = `<div class="slot-menu-empty">${q ? 'No matches' : 'Pool is empty'}</div>`;
    return;
  }
  ps.slice(0, 12).forEach(s => {
    const p = PARTS[s.part];
    const item = document.createElement('div');
    item.className = 'slot-menu-result';
    item.innerHTML = `
      <div class="slot-menu-result-dot" style="background:${p.color}"></div>
      <span>${s.name}</span>
      <span class="slot-menu-result-part">${s.part}</span>`;
    item.onclick = () => {
      placeSingerInSlot(slotMenuRowId, slotMenuSlotIdx, s.id);
      closeSlotMenu();
    };
    container.appendChild(item);
  });
  if (ps.length > 12) {
    const more = document.createElement('div');
    more.className = 'slot-menu-empty';
    more.textContent = `…${ps.length - 12} more — refine search`;
    container.appendChild(more);
  }
}

function closeSlotMenu() {
  if (slotMenuEl) { slotMenuEl.remove(); slotMenuEl = null; }
  slotMenuRowId = null;
  slotMenuSlotIdx = null;
}

function placeSingerInSlot(rowId, slotIdx, singerId) {
  const row = rows.find(r => r.id === rowId);
  if (!row) return;
  row.slots[slotIdx] = singerId;
  refreshSingers(rowId);
  render();
  showToast(`${getSinger(singerId)?.name} placed`);
}

function refreshSingers(rowId) {
  // the insert function doesn't update these properly
  const row = rows.find(r => r.id === rowId);
  if (!row) return;
  var i = 0
  row.slots.forEach((singerId, slotIdx) => {
    if (singerId != null) {
      const s = getSinger(singerId)
      if (s) {
        s.singerRow = i + 1;
      }
    }
    //dont count invisible / obstacle
    if (singerId != '__INVISIBLE__' && singerId != '__OBSTACLE__'){
      i = i + 1
    }
  });
  
  render();
}

function markObstacle(rowId, slotIdx) {
  const row = rows.find(r => r.id === rowId);
  if (row) row.slots[slotIdx] = '__OBSTACLE__';
  refreshSingers(rowId);
  closeSlotMenu();
  render();
}

function clearObstacle(rowId, slotIdx) {
  const row = rows.find(r => r.id === rowId);
  if (row) row.slots[slotIdx] = null;
  refreshSingers(rowId);
  closeSlotMenu();
  render();
}

function markInvisible(rowId, slotIdx) {
  const row = rows.find(r => r.id === rowId);
  if (row) row.slots[slotIdx] = '__INVISIBLE__';
  refreshSingers(rowId);
  closeSlotMenu();
  render();
}

function clearInvisible(rowId, slotIdx) {
  const row = rows.find(r => r.id === rowId);
  if (row) row.slots[slotIdx] = null;
  refreshSingers(rowId);
  closeSlotMenu();
  render();
}

function insertSlot(rowId, slotIdx, side) {
  const row = rows.find(r => r.id === rowId);
  if (!row) { closeSlotMenu(); return; }
  const insertAt = side === 'right' ? slotIdx + 1 : slotIdx;
  row.slots.splice(insertAt, 0, null);
  closeSlotMenu();
  refreshSingers(rowId);
  render();
  showToast(`Slot inserted`);
}



// Close menu on outside click
document.addEventListener('mousedown', (e) => {
  if (slotMenuEl && !slotMenuEl.contains(e.target)) closeSlotMenu();
}, true);

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeSlotMenu();
});

// override command p to print
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
    // 1. Prevent the browser's default print dialog from opening
    event.preventDefault();
    
    // 2. Call your custom async function
    exportPDF()
      .then(() => {
      })
      .catch((error) => {
        console.error('Failed to export PDF:', error);
      });
  }
});


function loadFromLocalStorage() {
  const savedData = localStorage.getItem('choir_seating_chart_state');
  
  if (!savedData) return; // Nothing saved yet, load a blank slate

  try {
    const config = JSON.parse(savedData);
    
    singers = config.singers;
    rows = config.rows;
    nextId = config.nextId;
    showHeights = config.showHeights;
    
    render(); 
    
    showToast('Restored your previous session!');
  } catch (error) {
    console.error("Failed to parse local storage data", error);
    showToast('Error loading saved session.');
  }
}

// Call this automatically when the script loads
document.addEventListener('DOMContentLoaded', loadFromLocalStorage);

// ─────────────────────────────────────────────────────────────
//  Actions
// ─────────────────────────────────────────────────────────────
function addRow(num = 5, stag = false) {
  rows.push({ id: uid(), slots: Array(num).fill(null), stagger: stag });
  render();
}

function insertRow(atIdx, stagger = false) {
  const refRow = (atIdx === -1) ? rows[0] : rows[atIdx]
  const newRow = { id: uid(), slots: Array(refRow.slots.length).fill(null), stagger };
  rows.splice(atIdx + 1, 0, newRow);
  render();
  showToast('Row inserted');
}

function removeRow(rowId) {
  rows = rows.filter(r => r.id !== rowId);
  render();
}

function toggleStagger(rowId) {
  const row = rows.find(r => r.id === rowId);
  if (row) { row.stagger = !row.stagger; render(); }
}

function addSlot2Row(rowId) {
  const row = rows.find(r => r.id === rowId);
  if (row) { row.slots.push(null); render(); }
}

function removeSlot(rowId, slotIdx) {
  const row = rows.find(r => r.id === rowId);
  if (!row) return;
  row.slots.splice(slotIdx, 1);
  refreshSingers(rowId);
  render();
}

function handleDrop(targetRowId, targetSlotIdx, currentOccupant) {
  if (!draggedSingerId) return;
  const targetRow = rows.find(r => r.id === targetRowId);
  if (!targetRow) return;
  if (dragSource && typeof dragSource === 'object') {
    const srcRow = rows.find(r => r.id === dragSource.rowId);
    
    if (srcRow) {
      const replacedSinger = targetRow.slots[targetSlotIdx];
      if (replacedSinger) srcRow.slots[dragSource.slotIdx] = replacedSinger;
      else srcRow.slots[dragSource.slotIdx] = null}
      refreshSingers(dragSource.rowId);
  }
  targetRow.slots[targetSlotIdx] = draggedSingerId;
  refreshSingers(targetRowId);
  
  render();
  showToast(`${getSinger(draggedSingerId)?.name} placed`);
}

function returnSinger(e, singerId) {
  e.stopPropagation();
  e.preventDefault();
  let onStage = rows.some(row => row.slots.includes(singerId));
  if (onStage) {
    rows.forEach(row => { row.slots = row.slots.map(id => id === singerId ? null : id); });
  } else {
    singers = singers.filter(s => s.id !== singerId);
  }
  render();
}

function clearPool() {
  const ps = poolSingers();
  ps.forEach(s => { singers = singers.filter(x => x.id !== s.id); });
  render();
}

function clearStage() {
  rows.forEach(row => { row.slots = row.slots.map(s => s === '__OBSTACLE__' ? '__OBSTACLE__' : null); });
  render();
  showToast('Stage cleared');
}

// ─────────────────────────────────────────────────────────────
//  Reshape Stage
// ─────────────────────────────────────────────────────────────
function openReshapeStage() {
  document.getElementById('reshapeRowCount').value = 5;
  document.getElementById('reshapeSingerCount').value = 50;
  document.getElementById('reshapeStageModal').classList.remove('hidden');
}

function reshapeStage() {
  clearStage();
  rows = []
  const rowct = document.getElementById('reshapeRowCount').value;
  const sct = document.getElementById('reshapeSingerCount').value;
  
  const colct = Math.ceil(sct / rowct);
  for (let i = 0; i < rowct; i++) {
    addRow(colct, 0);
  }

  closeModal('reshapeStageModal');
  render();
}

// ─────────────────────────────────────────────────────────────
//  Add Singer Modal
// ─────────────────────────────────────────────────────────────
function openAddSinger() {
  document.getElementById('singerName').value = '';
  document.getElementById('singerHeightInput').value = '';
  document.getElementById('singerPart').value = 'S1';
  document.getElementById('addSingerModal').classList.remove('hidden');
  setTimeout(() => document.getElementById('singerName').focus(), 50);
}

function addSingerFromForm() {
  const name = document.getElementById('singerName').value.trim();
  const part = document.getElementById('singerPart').value;
  const height = document.getElementById('singerHeightInput').value.trim();
  if (!name) { showToast('Please enter a name'); return; }
  singers.push({ id: uid(), name, part, height, singerRow: null });
  closeModal('addSingerModal');
  render();
  showToast(`Added ${name}`);
}

// ─────────────────────────────────────────────────────────────
//  Import Modal (Excel)
// ─────────────────────────────────────────────────────────────
function openImport() {
  pendingImport = [];
  document.getElementById('importPreview').innerHTML = '';
  document.getElementById('importConfirmBtn').disabled = true;
  document.getElementById('fileInput').value = '';
  document.getElementById('importModal').classList.remove('hidden');
}

const dropZone = document.getElementById('dropZone');
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file) processFile(file);
});

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (file) processFile(file);
}

function normalizePartStr(raw) {
  if (!raw) return null;
  const s = String(raw).trim().toUpperCase().replace(/\s+/g,'');
  const map = {
    'SOPRANO1':'S1','SOPRANO2':'S2','S1':'S1','S2':'S2',
    'ALTO1':'A1','ALTO2':'A2','A1':'A1','A2':'A2',
    'TENOR1':'T1','TENOR2':'T2','T1':'T1','T2':'T2',
    'BASS1':'B1','BASS2':'B2','B1':'B1','B2':'B2',
    'S':'S1','A':'A1','T':'T1','B':'B1',
    'SOPRANO':'S1','ALTO':'A1','TENOR':'T1','BASS':'B1',
  };
  return map[s] || null;
}

function processFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows2 = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      pendingImport = [];
      let skipped = 0;
      rows2.forEach((row, i) => {
        if (i === 0 && typeof row[0] === 'string' && row[0].toLowerCase().includes('name')) return;
        const name = String(row[0] || '').trim() + ' ' + String(row[1] || '').trim();
        const partRaw = row[2];
        const height = String(row[3] || '').trim();
        if (!name) return;
        const part = normalizePartStr(partRaw);
        if (!part) { skipped++; return; }
        pendingImport.push({ name, part, height });
      });

      const preview = document.getElementById('importPreview');
      if (pendingImport.length === 0) {
        preview.innerHTML = '<span style="color:#c0392b;">No valid rows found. Check column format.</span>';
        document.getElementById('importConfirmBtn').disabled = true;
      } else {
        const sample = pendingImport.slice(0, 5);
        preview.innerHTML = `<strong>${pendingImport.length} singers found${skipped ? ` (${skipped} skipped)` : ''}:</strong><br><ul style="margin-top:6px;padding-left:18px;">` +
          sample.map(s => `<li>${s.name} — ${s.part}${s.height ? ` (${s.height})` : ''}</li>`).join('') +
          (pendingImport.length > 5 ? `<li style="color:var(--muted)">…and ${pendingImport.length - 5} more</li>` : '') +
          '</ul>';
        document.getElementById('importConfirmBtn').disabled = false;
      }
    } catch(err) {
      document.getElementById('importPreview').innerHTML = '<span style="color:#c0392b;">Error reading file.</span>';
    }
  };
  reader.readAsArrayBuffer(file);
}

function confirmImport() {
  pendingImport.forEach(p => {
    singers.push({ id: uid(), name: p.name, part: p.part, height: p.height, singerRow: null });
  });
  closeModal('importModal');
  render();
  showToast(`Imported ${pendingImport.length} singers`);
}

// ─────────────────────────────────────────────────────────────
//  Memory: Export / Import Config
// ─────────────────────────────────────────────────────────────
function openMemoryModal() {
  document.getElementById('memoryModal').classList.remove('hidden');
}

function exportConfig() {
  const config = {
    version: 1,
    exportedAt: new Date().toISOString(),
    singers: singers,
    rows: rows,
    nextId: nextId,
    showHeights: showHeights,
  };
  const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'seating-chart-' + new Date().toISOString().slice(0,10) + '.json';
  a.click();
  URL.revokeObjectURL(url);
  showToast('Configuration exported!');
  closeModal('memoryModal');
}

function importConfig(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const config = JSON.parse(ev.target.result);
      if (!config.singers || !config.rows) throw new Error('Invalid config');
      singers = config.singers;
      rows = config.rows;
      rows.forEach(row => { row.stagger = false; });
      nextId = config.nextId || (nextId + 1000);
      showHeights = config.showHeights || false;
      document.getElementById('toggleHeights').checked = showHeights;
      closeModal('memoryModal');
      render();
      showToast('Configuration loaded!');
    } catch(err) {
      showToast('Error: invalid config file');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

// ─────────────────────────────────────────────────────────────
//  About Modal
// ─────────────────────────────────────────────────────────────
function openAbout() {
  document.getElementById('aboutModal').classList.remove('hidden');
}


// ─────────────────────────────────────────────────────────────
//  Close Modal
// ─────────────────────────────────────────────────────────────
function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

// ─────────────────────────────────────────────────────────────
//  Height toggle
// ─────────────────────────────────────────────────────────────
document.getElementById('toggleHeights').addEventListener('change', function() {
  showHeights = this.checked;
  document.querySelectorAll('.singer-height').forEach(el => {
    el.style.display = showHeights ? '' : 'none';
  });
});

// ─────────────────────────────────────────────────────────────
//  Keyboard shortcuts
// ─────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !document.getElementById('addSingerModal').classList.contains('hidden')) {
    addSingerFromForm();
  }
  if (e.key === 'Escape') {
    closeModal('addSingerModal');
    closeModal('importModal');
    closeModal('memoryModal');
    closeModal('aboutModal');
    closeSlotMenu();
  }
});

// ─────────────────────────────────────────────────────────────
//  Export PDF
// ─────────────────────────────────────────────────────────────
async function exportPDF() {
  showToast('Generating PDF…');
  const styleText = Array.from(document.styleSheets)
    .map(ss => {
      try { return Array.from(ss.cssRules).map(r => r.cssText).join('\n'); }
      catch(e) { return ''; }
    }).join('\n');

  const stageEl = document.getElementById('stage');
  const clone = stageEl.cloneNode(true);
  clone.querySelectorAll(
    '.add-row-btn, .add-slot-btn, .riser-controls, .card-delete, .slot-delete, .singer-height, .insert-row-zone'
  ).forEach(el => el.remove());

  const scrollEl = document.querySelector('.stage-scroll');
  const prevOverflow = scrollEl.style.overflow;
  scrollEl.style.overflow = 'visible';
  const fullW = stageEl.scrollWidth;
  const fullH = stageEl.scrollHeight;
  scrollEl.style.overflow = prevOverflow;

  const margin = 60;
  const winW = fullW + margin * 2;
  const winH = fullH + margin * 2;

  const printWin = window.open('', '_blank', `width=${winW},height=${winH},scrollbars=no,toolbar=no,menubar=no`);
  if (!printWin) { showToast('Pop-up blocked — allow pop-ups and try again'); return; }

  printWin.document.write(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Chorus Seating Chart</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=Source+Sans+3:wght@300;400;600&display=swap');
  ${styleText}
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html { background: #f7f4ef; }
  body { margin: ${margin}px; background: #f7f4ef; }
  #stage, .stage { width: max-content !important; min-width: unset !important; overflow: visible !important; flex-shrink: 0; }
  .stage-scroll-inner { min-width: unset !important; margin: 0 !important; }
  .riser-row.staggered { margin-left: 49px; }
  .add-row-btn, .add-slot-btn, .riser-controls, .card-delete, .slot-delete, .singer-height, .insert-row-zone { display: none !important; }
  @page { size: ${winW}px ${winH}px; margin: 0; }
</style></head><body>
${clone.outerHTML}
<script>window.onload=function(){setTimeout(function(){window.print();window.close();},500);};<\/script>
</body></html>`);
  printWin.document.close();
  showToast('Print dialog opened');


  // also save to local storage
  const config = {
    version: 1,
    exportedAt: new Date().toISOString(),
    singers: singers,
    rows: rows,
    nextId: nextId,
    showHeights: showHeights,
  };
  
  // Use a namespaced key for GitHub Pages
  localStorage.setItem('choir_seating_chart_state', JSON.stringify(config));
}

// ─────────────────────────────────────────────────────────────
//  Init
// ─────────────────────────────────────────────────────────────
function init() {
  rows = [
    { id: uid(), slots: [null, null, null, null, null, null], stagger: false },
    { id: uid(), slots: [null, null, null, null, null, null], stagger: false },
    { id: uid(), slots: [null, null, null, null, null, null], stagger: false },
  ];
  render();
}

init();