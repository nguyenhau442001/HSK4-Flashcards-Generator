// ---- Level configuration ----
const LEVELS = {
  hsk1: { label: 'HSK1', dataUrl: 'database/text/hsk1_vocabularies.json', available: true, total: 150 },
  hsk2: { label: 'HSK2', dataUrl: 'database/text/hsk2_vocabularies.json', available: true, total: 150 },
  hsk3: { label: 'HSK3', dataUrl: 'database/text/hsk3_vocabularies.json', available: true, total: 300 },
  hsk4: { label: 'HSK4', dataUrl: 'database/text/hsk4_vocabularies.json', available: true, total: 600 },
  hsk5: { label: 'HSK5', dataUrl: 'database/text/hsk5_vocabularies.json', available: true, total: 1300 },
  hsk6: { label: 'HSK6', dataUrl: 'database/text/hsk6_vocabularies.json', available: true, total: 2500 },
};

let currentLevel = null;
let WORDS = [];
let order = [];
let filteredOrder = [];
let idx = 0;
let progress = {};
let showPinyin = true;
let currentFilter = 'all';
let transitionTimer = null;
let celebrationShown = false;

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
renderLevelProgress();

function renderLevelProgress() {
  Object.keys(LEVELS).forEach(level => {
    const total = LEVELS[level].total;
    let known = 0;
    try {
      const raw = localStorage.getItem('hsk_' + level + '_progress_v2');
      if (raw) {
        const data = JSON.parse(raw);
        Object.values(data).forEach(v => { if (v === 'known') known++; });
      }
    } catch (e) {}
    const pct = total > 0 ? (known / total * 100) : 0;
    const bar = document.getElementById('bar-' + level);
    const text = document.getElementById('text-' + level);
    if (bar) bar.style.width = pct + '%';
    if (text) text.textContent = known + ' / ' + total + ' đã nhớ';
  });
}

function goBackToPicker() {
  document.getElementById('screenPicker').style.display = '';
  document.getElementById('screenCards').style.display = 'none';
  currentLevel = null;
  const overlay = document.getElementById('celebrationOverlay');
  if (overlay) overlay.remove();
  renderLevelProgress();
}

async function selectLevel(level) {
  celebrationShown = false;
  currentLevel = level;
  document.getElementById('screenPicker').style.display = 'none';
  document.getElementById('screenCards').style.display = '';
  document.getElementById('cardArea').innerHTML = `
    <div class="skel-bar"></div>
    <div class="skel-card">
      <div class="skel-line skel-hanzi"></div>
      <div class="skel-line skel-pinyin"></div>
      <div class="skel-line skel-hint"></div>
    </div>
    <div class="skel-nav">
      <div class="skel-line skel-nav-btn"></div>
      <div class="skel-line skel-nav-mid"></div>
      <div class="skel-line skel-nav-btn"></div>
    </div>
    <div class="skel-actions">
      <div class="skel-line skel-action-btn"></div>
      <div class="skel-line skel-action-btn"></div>
    </div>`;

  // Yield to the browser's paint pipeline so the skeleton renders at least one frame
  // before the fetch begins — necessary for local file:// loads where fetch is instant.
  await new Promise(r => requestAnimationFrame(r));
  await new Promise(r => requestAnimationFrame(r));

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
    <div class="progress-bar-track">
      <div class="progress-bar-fill" id="progressBar"></div>
    </div>
    <div class="card" id="card">
      <div class="swipe-badge swipe-badge--known" id="swipeBadgeKnown">✓ Đã nhớ</div>
      <div class="swipe-badge swipe-badge--unknown" id="swipeBadgeUnknown">✗ Chưa nhớ</div>
      <div id="cardContent" class="card-content">
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
  initSwipe();
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
  render('fade');
}
function updateStats() {
  let known = 0, unknown = 0;
  Object.values(progress).forEach(v => { if (v === 'known') known++; else if (v === 'unknown') unknown++; });
  document.getElementById('s-total').textContent = WORDS.length;
  document.getElementById('s-known').textContent = known;
  document.getElementById('s-unknown').textContent = unknown;
  document.getElementById('s-unseen').textContent = WORDS.length - known - unknown;
}
function updateProgress(current, total) {
  document.getElementById('progress').textContent = total === 0 ? '0 / 0' : current + ' / ' + total;
  const bar = document.getElementById('progressBar');
  if (bar) bar.style.width = (total === 0 ? 0 : (current / total * 100)) + '%';
}
function render(animate) {
  if (transitionTimer) { clearTimeout(transitionTimer); transitionTimer = null; }

  const content = document.getElementById('cardContent');
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function applyContent() {
    if (content) content.className = 'card-content';
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
      updateProgress(0, 0);
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
    updateProgress(idx % filteredOrder.length + 1, filteredOrder.length);
    updateStats();
    if (animate && content && !prefersReduced) {
      if (animate === 'next') content.classList.add('enter-right');
      else if (animate === 'prev') content.classList.add('enter-left');
      else content.classList.add('enter-fade');
    }
  }

  if (!animate || !content || prefersReduced) {
    applyContent();
    return;
  }

  content.className = 'card-content';
  if (animate === 'next') content.classList.add('exit-left');
  else if (animate === 'prev') content.classList.add('exit-right');
  else content.classList.add('exit-fade');

  transitionTimer = setTimeout(() => {
    transitionTimer = null;
    applyContent();
  }, 150);
}
function initSwipe() {
  const card = document.getElementById('card');
  if (!card) return;

  const COMMIT_PX = 90;
  const LOCK_PX = 8;

  let startX = 0, startY = 0, dx = 0, dy = 0;
  let active = false, locked = null, committed = false;

  function prefersReduced() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  function getBadges() {
    return [document.getElementById('swipeBadgeKnown'), document.getElementById('swipeBadgeUnknown')];
  }
  function clearBadges() {
    getBadges().forEach(b => { if (b) b.style.opacity = '0'; });
  }
  function resetCard() {
    card.style.transition = '';
    card.style.transform = '';
    card.style.opacity = '';
    clearBadges();
  }
  function applyDrag(x) {
    if (prefersReduced()) return;
    card.style.transform = `translateX(${x}px) rotate(${x / 18}deg)`;
    card.style.opacity = String(Math.max(0.55, 1 - Math.abs(x) / 450));
    const [bk, bu] = getBadges();
    const op = String(Math.min(1, Math.max(0, (Math.abs(x) - 20) / 60)));
    if (bk) bk.style.opacity = x > 20  ? op : '0';
    if (bu) bu.style.opacity = x < -20 ? op : '0';
  }
  function commitSwipe(dir) {
    if (committed) return;
    committed = true;
    if (prefersReduced()) {
      resetCard();
      if (dir === 'right') markKnown(); else markUnknown();
      committed = false;
      return;
    }
    const flyX = dir === 'right' ? 600 : -600;
    card.style.transition = 'transform 220ms ease, opacity 220ms ease';
    card.style.transform = `translateX(${flyX}px) rotate(${dir === 'right' ? 22 : -22}deg)`;
    card.style.opacity = '0';
    setTimeout(() => {
      card.style.transition = 'none';
      card.style.transform = '';
      card.style.opacity = '0';
      clearBadges();
      if (dir === 'right') markKnown(); else markUnknown();
      // Sync card fade-in with render()'s 150ms exit-then-swap timer so new content
      // arrives as the card becomes visible — no double animation.
      setTimeout(() => {
        card.style.transition = 'opacity 180ms ease';
        card.style.opacity = '';
        committed = false;
        setTimeout(() => { card.style.transition = ''; }, 180);
      }, 150);
    }, 220);
  }
  function springBack() {
    if (prefersReduced()) { resetCard(); return; }
    card.style.transition = 'transform 280ms cubic-bezier(0.25,0.46,0.45,0.94), opacity 200ms ease';
    card.style.transform = '';
    card.style.opacity = '';
    clearBadges();
    setTimeout(() => { card.style.transition = ''; }, 280);
  }

  card.addEventListener('pointerdown', e => {
    if (filteredOrder.length === 0 || committed) return;
    if (e.target.closest('.sound-btn')) return;
    card.style.transition = '';
    startX = e.clientX; startY = e.clientY;
    dx = 0; dy = 0; active = true; locked = null;
  });
  card.addEventListener('pointermove', e => {
    if (!active) return;
    dx = e.clientX - startX; dy = e.clientY - startY;
    if (!locked && (Math.abs(dx) > LOCK_PX || Math.abs(dy) > LOCK_PX)) {
      locked = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v';
    }
    if (locked === 'h') {
      card.setPointerCapture(e.pointerId);
      applyDrag(dx);
    }
  }, { passive: false });
  function onEnd() {
    if (!active) return;
    active = false;
    if (!locked) { flip(); return; }
    if (locked === 'v') return;
    if (Math.abs(dx) >= COMMIT_PX) commitSwipe(dx > 0 ? 'right' : 'left');
    else springBack();
  }
  card.addEventListener('pointerup', onEnd);
  card.addEventListener('pointercancel', () => { active = false; springBack(); });
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
function nextCard() { if (filteredOrder.length===0) return; idx = (idx + 1) % filteredOrder.length; render('next'); }
function prevCard() { if (filteredOrder.length===0) return; idx = (idx - 1 + filteredOrder.length) % filteredOrder.length; render('prev'); }
function markKnown() {
  if (filteredOrder.length===0) return;
  const wIdx = filteredOrder[idx % filteredOrder.length];
  progress[WORDS[wIdx].id] = 'known';
  saveProgress();
  checkCelebration();
  if (currentFilter !== 'all') advanceAfterMark(wIdx); else nextCard();
}
function checkCelebration() {
  if (celebrationShown || WORDS.length === 0) return;
  const known = Object.values(progress).filter(v => v === 'known').length;
  if (known === WORDS.length) {
    celebrationShown = true;
    showCelebration();
  }
}
function showCelebration() {
  const overlay = document.createElement('div');
  overlay.id = 'celebrationOverlay';
  overlay.className = 'celebration-overlay';
  overlay.innerHTML = `
    <div class="celebration-box">
      <div class="celebration-trophy">🏆</div>
      <div class="celebration-title">Xuất sắc!</div>
      <div class="celebration-msg">Bạn đã nhớ tất cả <strong>${WORDS.length}</strong> từ vựng <strong>${LEVELS[currentLevel].label}</strong>!</div>
      <button class="celebration-btn" onclick="document.getElementById('celebrationOverlay').remove()">Tiếp tục ôn luyện</button>
    </div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const colors = ['var(--accent)', 'var(--success-text)', 'var(--info-text)', 'var(--danger-text)'];
    for (let i = 0; i < 28; i++) {
      const p = document.createElement('div');
      p.className = 'confetti-piece';
      const size = 5 + Math.random() * 6;
      p.style.cssText = `left:${3 + Math.random() * 94}%;width:${size}px;height:${size + Math.random() * 7}px;background:${colors[i % colors.length]};animation-delay:${(Math.random() * 0.5).toFixed(2)}s;animation-duration:${(1 + Math.random() * 0.7).toFixed(2)}s;border-radius:${Math.random() > 0.4 ? '50%' : '2px'};`;
      overlay.appendChild(p);
    }
  }
  document.body.appendChild(overlay);
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
  if (filteredOrder.length === 0) { idx = 0; render('fade'); return; }
  if (filteredOrder.includes(prevWIdx)) {
    idx = (prevIdx + 1) % filteredOrder.length;
  } else {
    idx = Math.min(prevIdx, filteredOrder.length - 1);
  }
  render('fade');
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
// ---- Theme ----
function toggleTheme() {
  const current = document.documentElement.dataset.theme ||
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = current === 'dark' ? 'light' : 'dark';
  localStorage.setItem('hsk_theme', next);
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.documentElement.classList.add('theme-transition');
    setTimeout(() => document.documentElement.classList.remove('theme-transition'), 200);
  }
  document.documentElement.dataset.theme = next;
  document.getElementById('themeToggle').textContent = next === 'dark' ? '☀️' : '🌙';
}
(function () {
  const effective = document.documentElement.dataset.theme ||
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.getElementById('themeToggle').textContent = effective === 'dark' ? '☀️' : '🌙';
})();

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
