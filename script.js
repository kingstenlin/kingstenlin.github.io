//TODO: save configurations (export singers, probably)
//TODO: overhaul menu system to be a two click thing?
//TODO: clicking empty stage tile should open a search feature to add someone
//SUPERTODO: number the cards
//SUPERTODO: make pool filterable!!
// ─────────────────────────────────────────────────────────────
//  State 
// ─────────────────────────────────────────────────────────────
let singers = [];     // { id, name, part, height }
let rows = [];        // [{ id, slots: [singerId|null, ...], stagger: bool }]
let showHeights = false;
let draggedSingerId = null;
let dragSource = null; // 'pool' | { rowId, slotIdx }
let pendingImport = [];
let nextId = 1;

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
function uid() { return 'id_' + (nextId++); }
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
  renderPool();
  renderStage();
  renderLegend();
}

function renderPool() {
    //TODO: add search bar, filter
  const pool = document.getElementById('singerPool');
  pool.innerHTML = '';
  const ps = poolSingers();
  if (ps.length === 0) {
    pool.innerHTML = '<div style="color:var(--muted);font-size:0.8rem;text-align:center;padding:12px;">All singers placed</div>';
    return;
  }
  SECTION_ORDER.forEach(part => {
    const group = ps.filter(s => s.part === part);
    if (!group.length) return;
    const lbl = document.createElement('div');
    lbl.className = 'section-label';
    lbl.textContent = PARTS[part].label;
    pool.appendChild(lbl);
    const row = document.createElement('div');
    row.className = 'pool-section-group';
    group.forEach(s => {
      row.appendChild(makeSingerCard(s, 'pool'));
    });
    pool.appendChild(row);
  });

 
  pool.addEventListener('dragover', e => { e.preventDefault(); pool.classList.add('drag-over'); });
  pool.addEventListener('dragleave', () => pool.classList.remove('drag-over'));
  pool.addEventListener('drop', e => {
    e.preventDefault();
    pool.classList.remove('drag-over');

    if (!draggedSingerId) return;
    if (dragSource && typeof dragSource === 'object') {
      const srcRow = rows.find(r => r.id === dragSource.rowId);
      if (srcRow) srcRow.slots[dragSource.slotIdx] = null;
      console.log(draggedSingerId);
      console.log(dragSource);
      console.log(srcRow);
    }

    render();
    showToast(`${getSinger(draggedSingerId)?.name} removed from chart`);
    
  });
}

function makeSingerCard(singer, source) {
  const p = PARTS[singer.part];
  const card = document.createElement('div');
  card.className = 'singer-card';
  card.dataset.singerId = singer.id;
  card.style.background = p.light;
  card.style.borderColor = p.color;
  card.style.color = p.color;
  card.draggable = true;

  card.innerHTML = `
    <div class="singer-arrow">${p.arrow}</div>
    <div class="singer-name">${singer.name}</div>
    <div class="singer-part">${singer.part}</div>
    ${singer.height ? `<div class="singer-height no-print">${singer.height}</div>` : ''}
    <div class="card-delete" title="Remove singer" onclick="returnSinger(event,'${singer.id}')">✕</div>
  `;

  // hide height if toggle off
  const hEl = card.querySelector('.singer-height');
  if (hEl) hEl.style.display = showHeights ? '' : 'none';

  // drag events
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
  // keep front label
  const frontLabel = stage.querySelector('.stage-front-label');
  stage.innerHTML = '';
  stage.appendChild(frontLabel);

  rows.forEach((row, rowIdx) => {
    const rowEl = document.createElement('div');
    rowEl.className = 'riser-row';
    rowEl.dataset.rowId = row.id;

    // Row controls
    const ctrl = document.createElement('div');
    ctrl.className = 'riser-controls';
    ctrl.innerHTML = `
      <button class="riser-btn" title="Delete row" onclick="removeRow('${row.id}')">✕</button>
      <button class="riser-btn" title="${row.stagger ? 'Remove stagger' : 'Toggle stagger'}" onclick="toggleStagger('${row.id}')">${row.stagger ? '⇥' : '⇤'}</button>
    `;
    rowEl.appendChild(ctrl);

    const rowLabel = document.createElement('div');
    rowLabel.className = 'riser-label';
    rowLabel.textContent = `Row ${rowIdx + 1}`;
    rowEl.appendChild(rowLabel);

    const slotsEl = document.createElement('div');
    slotsEl.className = 'slots-container';

    row.slots.forEach((singerId, slotIdx) => {

        if (row.stagger && (slotIdx == 0)) {
            const dummyslot = document.createElement('div');
            dummyslot.className = 'dummyslot';
            const dummyph = document.createElement('span');
            //dummyph.style.cssText = 'font-size:0.65rem;color:var(--muted);text-align:center;pointer-events:none;';
            //dummyph.textContent = 'dummy';
            dummyslot.appendChild(dummyph);;
            slotsEl.appendChild(dummyslot);
        }
        
      const slot = document.createElement('div');
      slot.className = 'slot';

      // drop events
      slot.addEventListener('dragover', e => { e.preventDefault(); slot.classList.add('drag-over'); });
      slot.addEventListener('dragleave', () => slot.classList.remove('drag-over'));
      slot.addEventListener('drop', e => {
        e.preventDefault();
        slot.classList.remove('drag-over');
        handleDrop(row.id, slotIdx, singerId);
      });

      // slot delete (empty slots)
      const slotDel = document.createElement('div');
      slotDel.className = 'slot-delete';
      slotDel.textContent = '✕';
      slotDel.title = 'Remove slot';
      slotDel.onclick = (e) => { e.stopPropagation(); removeSlot(row.id, slotIdx); };
      slot.appendChild(slotDel);

      if (singerId) {
        const s = getSinger(singerId);
        if (s) {
          const card = makeSingerCard(s, { rowId: row.id, slotIdx });
          card.style.width = '88px';
          card.style.height = '70px';
          slot.appendChild(card);
          slotDel.style.display = 'none'; // hide slot X when occupied
          slot.style.border = 'none';
          slot.style.background = 'transparent';
        }
      } else {
        // empty slot placeholder text
        const ph = document.createElement('span');
        ph.style.cssText = 'font-size:0.65rem;color:var(--muted);text-align:center;pointer-events:none;';
        ph.textContent = '';
        slot.appendChild(ph);
      }

      slotsEl.appendChild(slot);
    });

    

    // Add slot button
    const addSlot = document.createElement('button');
    addSlot.className = 'add-slot-btn';
    addSlot.title = 'Add slot';
    addSlot.innerHTML = '+';
    addSlot.onclick = () => addSlot2Row(row.id);
    slotsEl.appendChild(addSlot);

    rowEl.appendChild(slotsEl);
    stage.prepend(rowEl);
  });

  // Add row button
  const addRowBtn = document.createElement('button');
  addRowBtn.className = 'add-row-btn';
  addRowBtn.innerHTML = '+ Add Row';
  addRowBtn.onclick = addRow;
  stage.prepend(addRowBtn);
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
//  Actions
// ─────────────────────────────────────────────────────────────



function addRow(num = 5, stag = false) {
  rows.push({ id: uid(), slots: Array(num).fill(null), stagger: stag });
  render();
}

function removeRow(rowId) {
  const row = rows.find(r => r.id === rowId);
  if (!row) return;
  // singers go back to pool automatically (not placed)
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
  render();
}

function handleDrop(targetRowId, targetSlotIdx, currentOccupant) {
  if (!draggedSingerId) return;
  const targetRow = rows.find(r => r.id === targetRowId);
  if (!targetRow) return;

  // If dragged from a stage slot, clear it first
  if (dragSource && typeof dragSource === 'object') {
    const srcRow = rows.find(r => r.id === dragSource.rowId);
    if (srcRow) srcRow.slots[dragSource.slotIdx] = null;
  }

  // If target already has someone, send them back (swap to pool)
  // just clear the old slot — they'll appear in pool
  targetRow.slots[targetSlotIdx] = draggedSingerId;
  render();
  showToast(`${getSinger(draggedSingerId)?.name} placed`);
}

function returnSinger(e, singerId) {
  e.stopPropagation();
  e.preventDefault();

  let stageBool = false //see if this singer is on stage
  rows.forEach(row => { 
    row.slots.forEach(id => {
      if (id === singerId) {
        stageBool = true;
      } 
    });

  });
  if (stageBool) {
    rows.forEach(row => { //if on stage, put in pool
      row.slots = row.slots.map(id => id === singerId ? null : id);
    });
  } else singers = singers.filter(s => s.id !== singerId); //else remove entirely
  render();
}


function clearPool() {
  const ps = poolSingers();
  ps.forEach(s => { singers = singers.filter(x => x.id !== s.id); });
  render();
}

function clearStage() {
  rows.forEach(row => { row.slots = row.slots.map(() => null); });
  render();
  showToast('Stage cleared');
}

// reshape stage modal

function openReshapeStage() {
  document.getElementById('reshapeRowCount').value = 5;
  document.getElementById('reshapeSingerCount').value = 50;
  document.getElementById('reshapeStageModal').classList.remove('hidden');

}

function reshapeStage() {
  clearStage();
  rows = rows.filter(r => r.id == -123)
  const rowct = document.getElementById('reshapeRowCount').value;
  const sct = document.getElementById('reshapeSingerCount').value;
  
  const colct = Math.ceil(sct / rowct);
  for (let i = 0; i < rowct; i++) {
    addRow(colct, i % 2 == 0 ? false : true);
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
  singers.push({ id: uid(), name, part, height });
  closeModal('addSingerModal');
  render();
  showToast(`Added ${name}`);
}

// ─────────────────────────────────────────────────────────────
//  Import Modal
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
        if (i === 0 && typeof row[0] === 'string' && row[0].toLowerCase().includes('name')) return; // header
        const name = String(row[0] || '').trim();
        const partRaw = row[1];
        const height = String(row[2] || '').trim();
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
      document.getElementById('importPreview').innerHTML = '<span style="color:#c0392b;">Error reading file. Please use .xlsx, .xls, or .csv.</span>';
    }
  };
  reader.readAsArrayBuffer(file);
}

function confirmImport() {
  pendingImport.forEach(p => {
    singers.push({ id: uid(), name: p.name, part: p.part, height: p.height });
  });
  closeModal('importModal');
  render();
  showToast(`Imported ${pendingImport.length} singers`);
}

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
//  Keyboard
// ─────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !document.getElementById('addSingerModal').classList.contains('hidden')) {
    addSingerFromForm();
  }
  if (e.key === 'Escape') {
    closeModal('addSingerModal');
    closeModal('importModal');
  }
});

// ─────────────────────────────────────────────────────────────
//  Init: seed a couple of default rows
// ─────────────────────────────────────────────────────────────
function init() {
  rows = [
    { id: uid(), slots: [null, null, null, null, null, null], stagger: false },
    { id: uid(), slots: [null, null, null, null, null, null], stagger: true },
    { id: uid(), slots: [null, null, null, null, null, null], stagger: false },
  ];
  render();
}

init();