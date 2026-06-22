// ---- Level configuration ----
const LEVELS = {
  hsk1: { label: 'HSK1', dataUrl: 'database/text/hsk1_vocabularies.json', available: true },
  hsk2: { label: 'HSK2', dataUrl: 'database/text/hsk2_vocabularies.json', available: true },
  hsk3: { label: 'HSK3', dataUrl: 'database/text/hsk3_vocabularies.json', available: true },
  hsk4: { label: 'HSK4', dataUrl: 'database/text/hsk4_vocabularies.json', available: true },
  hsk5: { label: 'HSK5', dataUrl: 'database/text/hsk5_vocabularies.json', available: true },
  hsk6: { label: 'HSK6', dataUrl: 'database/text/hsk6_vocabularies.json', available: true },
};

let currentLevel = null;
let WORDS = [];
let order = [];
let filteredOrder = [];
let idx = 0;
let progress = {};
let showPinyin = true;
let currentFilter = 'all';

function storageKey(suffix) {
  return 'hsk_' + currentLevel + '_' + suffix + '_v2';
}

// ---- Level picker wiring ----
document.querySelectorAll('.level-card').forEach(card => {
  const level = card.dataset.level;
  const cfg = LEVELS[level];
  if (!cfg.available) {
    card.classList.add('disabled');
    return;
  }
  card.addEventListener('click', () => selectLevel(level));
});

function goBackToPicker() {
  document.getElementById('screenPicker').style.display = '';
  document.getElementById('screenCards').style.display = 'none';
  currentLevel = null;
}

async function selectLevel(level) {
  currentLevel = level;
  document.getElementById('screenPicker').style.display = 'none';
  document.getElementById('screenCards').style.display = '';
  document.getElementById('cardArea').innerHTML = '<div class="loading-text">Đang tải dữ liệu...</div>';

  try {
    const res = await fetch(LEVELS[level].dataUrl);
    if (!res.ok) throw new Error('fetch failed');
    WORDS = await res.json();
  } catch (e) {
    document.getElementById('cardArea').innerHTML = '<div class="error-text">Không thể tải dữ liệu. Vui lòng thử lại.</div>';
    return;
  }

  order = Array.from({length: WORDS.length}, (_, i) => i);
  progress = {};
  showPinyin = true;
  currentFilter = 'all';
  idx = 0;

  loadState();
  buildCardArea();
  renderFilters();
  render();
}

function loadState() {
  try {
    const p = localStorage.getItem(storageKey('progress'));
    if (p) progress = JSON.parse(p);
  } catch (e) {}
  try {
    const pref = localStorage.getItem(storageKey('prefs'));
    if (pref) {
      const parsed = JSON.parse(pref);
      if (typeof parsed.showPinyin === 'boolean') showPinyin = parsed.showPinyin;
      if (Array.isArray(parsed.order) && parsed.order.length === WORDS.length) order = parsed.order;
    }
  } catch (e) {}
  filteredOrder = order.slice();
}
function saveProgress() {
  try { localStorage.setItem(storageKey('progress'), JSON.stringify(progress)); } catch (e) {}
}
function savePrefs() {
  try { localStorage.setItem(storageKey('prefs'), JSON.stringify({ showPinyin, order })); } catch (e) {}
}

function buildCardArea() {
  document.getElementById('cardArea').innerHTML = `
    <div class="card" id="card" onclick="flip()">
      <div class="hanzi" id="hanzi"></div>
      <div class="pinyin-row">
        <div class="pinyin" id="pinyin"></div>
        <button class="sound-btn" id="soundBtn" onclick="event.stopPropagation(); speakWord()">🔊</button>
      </div>
      <div class="meaning" id="meaning"></div>
      <div class="example-box" id="exampleBox">
        <div class="ex-label">Ví dụ</div>
        <div class="ex-line ex-zh" id="exZh"></div>
        <div class="ex-line ex-py" id="exPy"></div>
        <div class="ex-line ex-vi" id="exVi"></div>
      </div>
      <div class="hint" id="hint">Nhấn vào thẻ để xem nghĩa và ví dụ</div>
    </div>

    <div class="nav-row">
      <button onclick="prevCard()">← Trước</button>
      <span class="progress-text" id="progress">1 / ${WORDS.length}</span>
      <button onclick="nextCard()">Tiếp →</button>
    </div>

    <div class="action-row">
      <button class="btn-unknown" onclick="markUnknown()">Chưa nhớ</button>
      <button class="btn-known" onclick="markKnown()">Đã nhớ</button>
    </div>

    <div class="bottom-row">
      <button onclick="exportUnknown()">⬇ Xuất danh sách chưa nhớ</button>
      <button onclick="exportProgress()">💾 Lưu tiến trình (.json)</button>
      <button onclick="document.getElementById('importFile').click()">📂 Nạp tiến trình</button>
      <button onclick="resetProgress()">↺ Xóa toàn bộ tiến trình</button>
    </div>
    <input type="file" id="importFile" accept="application/json" style="display:none" onchange="importProgress(event)">

    <div class="export-box" id="exportBox"></div>
  `;
  const btn = document.getElementById('pinyinToggle');
  btn.textContent = showPinyin ? '👁 Đang hiện pinyin' : '🙈 Chế độ thử thách: ẩn pinyin';
  btn.classList.toggle('on', !showPinyin);
}

function renderFilters() {
  const row = document.getElementById('filterRow');
  row.innerHTML = '';
  const filters = [
    {key:'all', label:'Tất cả'},
    {key:'unseen', label:'Chưa học'},
    {key:'unknown', label:'Chưa nhớ'},
    {key:'known', label:'Đã nhớ'}
  ];
  filters.forEach(f => {
    const b = document.createElement('button');
    b.className = 'filter-btn' + (currentFilter === f.key ? ' active' : '');
    b.textContent = f.label;
    b.onclick = () => setFilter(f.key);
    row.appendChild(b);
  });
}
function setFilter(key) {
  currentFilter = key;
  if (key === 'all') filteredOrder = order.slice();
  else if (key === 'unseen') filteredOrder = order.filter(i => !progress[WORDS[i].id]);
  else filteredOrder = order.filter(i => progress[WORDS[i].id] === key);
  idx = 0;
  renderFilters();
  render();
}
function updateStats() {
  let known = 0, unknown = 0;
  Object.values(progress).forEach(v => { if (v === 'known') known++; else if (v === 'unknown') unknown++; });
  document.getElementById('s-total').textContent = WORDS.length;
  document.getElementById('s-known').textContent = known;
  document.getElementById('s-unknown').textContent = unknown;
  document.getElementById('s-unseen').textContent = WORDS.length - known - unknown;
}
function render() {
  const exBox = document.getElementById('exampleBox');
  if (exBox) exBox.classList.remove('show');
  const soundBtn = document.getElementById('soundBtn');
  if (soundBtn) soundBtn.classList.remove('show');
  if (filteredOrder.length === 0) {
    document.getElementById('hanzi').textContent = '';
    document.getElementById('pinyin').textContent = '';
    document.getElementById('meaning').textContent = 'Không có từ trong bộ lọc này';
    document.getElementById('meaning').classList.add('show');
    document.getElementById('hint').textContent = '';
    document.getElementById('progress').textContent = '0 / 0';
    updateStats();
    return;
  }
  const wIdx = filteredOrder[idx % filteredOrder.length];
  const w = WORDS[wIdx];
  document.getElementById('hanzi').textContent = w.hanzi;
  document.getElementById('pinyin').textContent = showPinyin ? w.pinyin : '';
  const m = document.getElementById('meaning');
  m.textContent = w.meaning;
  m.classList.remove('show');
  document.getElementById('exZh').innerHTML = w.example_zh;
  document.getElementById('exPy').innerHTML = w.example_py;
  document.getElementById('exVi').innerHTML = w.example_vi;
  document.getElementById('hint').textContent = 'Nhấn vào thẻ để xem nghĩa và ví dụ';
  document.getElementById('progress').textContent = (idx % filteredOrder.length + 1) + ' / ' + filteredOrder.length;
  updateStats();
}
function flip() {
  if (filteredOrder.length === 0) return;
  const m = document.getElementById('meaning');
  const ex = document.getElementById('exampleBox');
  const willShow = !m.classList.contains('show');
  m.classList.toggle('show');
  ex.classList.toggle('show', willShow);
  document.getElementById('soundBtn').classList.toggle('show', willShow);
  if (willShow && !showPinyin) {
    const wIdx = filteredOrder[idx % filteredOrder.length];
    document.getElementById('pinyin').textContent = WORDS[wIdx].pinyin;
  } else if (!willShow && !showPinyin) {
    document.getElementById('pinyin').textContent = '';
  }
  document.getElementById('hint').textContent = willShow ? 'Nhấn lại để ẩn' : 'Nhấn vào thẻ để xem nghĩa và ví dụ';
}
function speakWord() {
  if (filteredOrder.length === 0) return;
  const wIdx = filteredOrder[idx % filteredOrder.length];
  const utter = new SpeechSynthesisUtterance(WORDS[wIdx].hanzi);
  utter.lang = 'zh-CN';
  speechSynthesis.cancel();
  speechSynthesis.speak(utter);
}
function nextCard() { if (filteredOrder.length===0) return; idx = (idx + 1) % filteredOrder.length; render(); }
function prevCard() { if (filteredOrder.length===0) return; idx = (idx - 1 + filteredOrder.length) % filteredOrder.length; render(); }
function markKnown() {
  if (filteredOrder.length===0) return;
  const wIdx = filteredOrder[idx % filteredOrder.length];
  progress[WORDS[wIdx].id] = 'known';
  saveProgress();
  if (currentFilter !== 'all') advanceAfterMark(wIdx); else nextCard();
}
function markUnknown() {
  if (filteredOrder.length===0) return;
  const wIdx = filteredOrder[idx % filteredOrder.length];
  progress[WORDS[wIdx].id] = 'unknown';
  saveProgress();
  if (currentFilter !== 'all') advanceAfterMark(wIdx); else nextCard();
}
function advanceAfterMark(prevWIdx) {
  const prevIdx = idx;
  if (currentFilter === 'unseen') filteredOrder = order.filter(i => !progress[WORDS[i].id]);
  else filteredOrder = order.filter(i => progress[WORDS[i].id] === currentFilter);
  renderFilters();
  if (filteredOrder.length === 0) { idx = 0; render(); return; }
  if (filteredOrder.includes(prevWIdx)) {
    idx = (prevIdx + 1) % filteredOrder.length;
  } else {
    idx = Math.min(prevIdx, filteredOrder.length - 1);
  }
  render();
}
function togglePinyin() {
  showPinyin = !showPinyin;
  const btn = document.getElementById('pinyinToggle');
  btn.textContent = showPinyin ? '👁 Đang hiện pinyin' : '🙈 Chế độ thử thách: ẩn pinyin';
  btn.classList.toggle('on', !showPinyin);
  savePrefs();
  render();
}
function shuffleDeck() {
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  savePrefs();
  setFilter(currentFilter);
}
function resetProgress() {
  if (!confirm('Xóa toàn bộ tiến trình đã lưu trên trình duyệt này cho cấp độ này?')) return;
  progress = {};
  saveProgress();
  setFilter(currentFilter);
}
function exportUnknown() {
  const box = document.getElementById('exportBox');
  const unknownWords = WORDS.filter(w => progress[w.id] === 'unknown');
  if (unknownWords.length === 0) {
    box.textContent = 'Chưa có từ nào được đánh dấu "Chưa nhớ".';
  } else {
    box.textContent = unknownWords.map(w => w.hanzi + ' (' + w.pinyin + ') - ' + w.meaning).join('\n');
  }
  box.classList.add('show');
}
function exportProgress() {
  const data = JSON.stringify({ level: currentLevel, progress, order, showPinyin }, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'hsk_progress_' + currentLevel + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
function importProgress(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = JSON.parse(e.target.result);
      if (data.level && data.level !== currentLevel) {
        if (!confirm('File này thuộc cấp độ ' + data.level.toUpperCase() + ', không phải ' + currentLevel.toUpperCase() + '. Vẫn nạp?')) return;
      }
      if (data.progress) progress = data.progress;
      if (Array.isArray(data.order) && data.order.length === WORDS.length) order = data.order;
      if (typeof data.showPinyin === 'boolean') showPinyin = data.showPinyin;
      saveProgress();
      savePrefs();
      const btn = document.getElementById('pinyinToggle');
      btn.textContent = showPinyin ? '👁 Đang hiện pinyin' : '🙈 Chế độ thử thách: ẩn pinyin';
      btn.classList.toggle('on', !showPinyin);
      setFilter(currentFilter);
      alert('Đã nạp tiến trình thành công!');
    } catch (err) {
      alert('File không hợp lệ.');
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}
