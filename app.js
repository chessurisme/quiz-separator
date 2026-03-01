/* ════════════════════════════════════════════════════════
   app.js  |  Quiz Separator
════════════════════════════════════════════════════════ */

/* ── Constants ──────────────────────────────────────── */
const TARGETS = { easy: 5, medium: 3, hard: 2 };

const KEY_POOL     = 'qs_pool_v3';
const KEY_IMPORTED = 'qs_imported_v3';
const KEY_PACKS    = 'qs_packs_v3';
const KEY_SETTINGS = 'qs_settings_v3';

/* ── State ──────────────────────────────────────────── */

// All questions, including leftovers awaiting decision.
// Each question has: question, choices, references, difficulty,
//                    _poolId (internal), _quizId, _quizName
let pool = [];

// Metadata of every imported quiz file
let importedQuizzes = [];

// Packs ready for download: [{ filename, questions[], easy, medium, hard }]
let generatedPacks = [];

// Leftover questions after last generation (still in pool, tagged)
// null means no leftover pending
let leftoverIds = null; // Set of _poolId strings

// User-editable settings
let settings = {
  startingNumber:   1,  // next qp-xxxx number
  unfinishedNumber: 1,  // next qp-unfinished-xxx number
};

/* ── Storage ────────────────────────────────────────── */
function loadStorage() {
  try {
    const p = localStorage.getItem(KEY_POOL);
    const i = localStorage.getItem(KEY_IMPORTED);
    const pk = localStorage.getItem(KEY_PACKS);
    const s = localStorage.getItem(KEY_SETTINGS);
    const lo = localStorage.getItem('qs_leftover_ids_v3');

    if (p)  pool            = JSON.parse(p);
    if (i)  importedQuizzes = JSON.parse(i);
    if (pk) generatedPacks  = JSON.parse(pk);
    if (s)  settings        = { ...settings, ...JSON.parse(s) };

    // Restore leftoverIds as a Set
    if (lo) {
      const ids = JSON.parse(lo);
      leftoverIds = ids && ids.length > 0 ? new Set(ids) : null;
    }
  } catch (_) { /* ignore corrupt data */ }
}

function saveStorage() {
  localStorage.setItem(KEY_POOL,     JSON.stringify(pool));
  localStorage.setItem(KEY_IMPORTED, JSON.stringify(importedQuizzes));
  localStorage.setItem(KEY_PACKS,    JSON.stringify(generatedPacks));
  localStorage.setItem(KEY_SETTINGS, JSON.stringify(settings));

  // Save leftoverIds as array
  if (leftoverIds && leftoverIds.size > 0) {
    localStorage.setItem('qs_leftover_ids_v3', JSON.stringify([...leftoverIds]));
  } else {
    localStorage.removeItem('qs_leftover_ids_v3');
  }
}

/* ── Helpers ────────────────────────────────────────── */
function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// Safe HTML escaping
function esc(str) {
  const el = document.createElement('div');
  el.textContent = String(str ?? '');
  return el.innerHTML;
}

// Difficulty badge HTML
function badge(diff) {
  const d = (diff || 'unknown').toLowerCase();
  const cls = ['easy', 'medium', 'hard'].includes(d) ? d : 'unknown';
  return `<span class="badge badge-${cls}">${esc(d)}</span>`;
}

// A → B → C
function letter(i) { return String.fromCharCode(65 + i); }

// Pool stats helper — works on any array of questions
function statsOf(arr) {
  return {
    easy:   arr.filter(q => q.difficulty === 'easy').length,
    medium: arr.filter(q => q.difficulty === 'medium').length,
    hard:   arr.filter(q => q.difficulty === 'hard').length,
  };
}

// How many complete packs can we build right now?
function maxPacks() {
  // Exclude questions already tagged as leftover
  const available = leftoverIds
    ? pool.filter(q => !leftoverIds.has(q._poolId))
    : pool;
  const s = statsOf(available);
  return Math.min(
    Math.floor(s.easy   / TARGETS.easy),
    Math.floor(s.medium / TARGETS.medium),
    Math.floor(s.hard   / TARGETS.hard)
  );
}

// Filename helpers
function packFilename(offset) {
  const n = settings.startingNumber + offset;
  return `qp-${String(n).padStart(4, '0')}`;
}

function unfinishedFilename() {
  const n = settings.unfinishedNumber;
  return `qp-unfinished-${String(n).padStart(3, '0')}`;
}

// Strip internal keys before exporting
function clean(q) {
  const { _poolId, _quizId, _quizName, ...rest } = q;
  return rest;
}

// Download a JSON file
function downloadJSON(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `${filename}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ── File import ─────────────────────────────────────── */
async function handleFiles(fileList) {
  for (const file of fileList) {
    if (!file.name.endsWith('.json') && file.type !== 'application/json') {
      toast(`"${file.name}" is not a JSON file`, 'error');
      continue;
    }
    await importFile(file);
  }
}

async function importFile(file) {
  let text;
  try { text = await file.text(); }
  catch (_) { toast(`Cannot read "${file.name}"`, 'error'); return; }

  let quiz;
  try { quiz = JSON.parse(text); }
  catch (_) { toast(`Invalid JSON in "${file.name}"`, 'error'); return; }

  if (!Array.isArray(quiz.questions) || quiz.questions.length === 0) {
    toast(`"${file.name}" has no questions array`, 'error');
    return;
  }

  const quizId   = quiz.id   || uid();
  const quizName = quiz.name || file.name.replace(/\.json$/i, '');

  if (importedQuizzes.find(q => q.id === quizId)) {
    toast(`"${quizName}" is already in the pool`, 'warning');
    return;
  }

  // Attach internal tracking fields
  const tagged = quiz.questions.map((q, i) => ({
    question:   q.question   || '',
    choices:    Array.isArray(q.choices) ? q.choices : [],
    references: q.references || '',
    difficulty: (q.difficulty || 'unknown').toLowerCase(),
    _poolId:  `${quizId}_${i}_${uid()}`,
    _quizId:  quizId,
    _quizName: quizName,
  }));

  pool.push(...tagged);
  importedQuizzes.push({ id: quizId, name: quizName, questions: quiz.questions });
  saveStorage();
  render();
  toast(`"${quizName}" merged — ${tagged.length} question${tagged.length !== 1 ? 's' : ''} added to pool`, 'success');
}

/* ── Pack generation ─────────────────────────────────── */
function generatePacks() {
  // Work only with non-leftover questions
  const usable = leftoverIds
    ? pool.filter(q => !leftoverIds.has(q._poolId))
    : pool;

  const byDiff = {
    easy:   usable.filter(q => q.difficulty === 'easy'),
    medium: usable.filter(q => q.difficulty === 'medium'),
    hard:   usable.filter(q => q.difficulty === 'hard'),
  };

  const count = Math.min(
    Math.floor(byDiff.easy.length   / TARGETS.easy),
    Math.floor(byDiff.medium.length / TARGETS.medium),
    Math.floor(byDiff.hard.length   / TARGETS.hard)
  );

  if (count === 0) {
    showShortageModal(statsOf(usable));
    return;
  }

  // Build all packs (store original questions for undo, clean for display/download)
  const packs = [];
  for (let i = 0; i < count; i++) {
    const e = byDiff.easy.slice(i * TARGETS.easy,   (i + 1) * TARGETS.easy);
    const m = byDiff.medium.slice(i * TARGETS.medium, (i + 1) * TARGETS.medium);
    const h = byDiff.hard.slice(i * TARGETS.hard,   (i + 1) * TARGETS.hard);
    const allQuestions = [...e, ...m, ...h];

    packs.push({
      filename:  packFilename(generatedPacks.length + i),
      questions: allQuestions.map(clean),
      _original: allQuestions, // Keep original with metadata for undo
      easy:   e.length,
      medium: m.length,
      hard:   h.length,
    });
  }

  // Identify used question IDs
  const usedCount = { easy: count * TARGETS.easy, medium: count * TARGETS.medium, hard: count * TARGETS.hard };
  const usedIds = new Set([
    ...byDiff.easy.slice(0, usedCount.easy),
    ...byDiff.medium.slice(0, usedCount.medium),
    ...byDiff.hard.slice(0, usedCount.hard),
  ].map(q => q._poolId));

  // Remove used questions from pool
  pool = pool.filter(q => !usedIds.has(q._poolId));

  // Compute leftover (questions that remain after extraction)
  const remainAfter = leftoverIds
    ? pool.filter(q => !leftoverIds.has(q._poolId))
    : pool.filter(q => !usedIds.has(q._poolId));

  const leftoverAfter = remainAfter; // whatever wasn't used
  if (leftoverAfter.length > 0) {
    leftoverIds = new Set(leftoverAfter.map(q => q._poolId));
  } else {
    leftoverIds = null;
  }

  // Advance file numbering
  settings.startingNumber += count;

  generatedPacks.push(...packs);
  saveStorage();
  render();

  toast(`✓ Generated ${count} quiz pack${count !== 1 ? 's' : ''}!`, 'success');

  setTimeout(() => {
    document.getElementById('sec-results').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 120);
}

/* ── Download ─────────────────────────────────────────── */
function downloadPack(idx) {
  const pack = generatedPacks[idx];
  if (!pack) return;
  downloadJSON(pack.filename, pack.questions);
  toast(`Downloaded ${pack.filename}.json`, 'success');
}

function downloadAll() {
  if (!generatedPacks.length) return;

  const dlAllBtn = document.getElementById('dl-all-btn');
  const originalText = dlAllBtn.innerHTML;
  const packCount = generatedPacks.length;

  // Disable button and show progress
  dlAllBtn.disabled = true;
  dlAllBtn.innerHTML = '⏳&ensp;Downloading...';

  generatedPacks.forEach((pack, i) => {
    setTimeout(() => downloadJSON(pack.filename, pack.questions), i * 180);
  });

  // Show completion message after all downloads are initiated
  const totalTime = (generatedPacks.length - 1) * 180 + 100;
  setTimeout(() => {
    dlAllBtn.disabled = false;
    dlAllBtn.innerHTML = originalText;
    toast(`✅ All ${packCount} pack${packCount !== 1 ? 's' : ''} downloaded!`, 'success');

    // Clean up generated packs after download
    generatedPacks = [];
    saveStorage();
    render();
  }, totalTime);
}

function downloadLeftover() {
  if (!leftoverIds) return;
  const leftQ = pool.filter(q => leftoverIds.has(q._poolId));
  const fname = unfinishedFilename();
  downloadJSON(fname, leftQ.map(clean));

  // Remove from pool and clear leftover state
  pool = pool.filter(q => !leftoverIds.has(q._poolId));
  settings.unfinishedNumber += 1;
  leftoverIds = null;
  saveStorage();
  render();
  toast(`Downloaded ${fname}.json`, 'success');
}

function saveLeftoverToPool() {
  // Questions stay in pool (they're already there), just clear the leftover marker
  leftoverIds = null;
  saveStorage();
  render();
  toast('Leftover questions kept in pool — import more to complete future packs', 'success');
}

function cancelGeneration() {
  if (!generatedPacks.length) return;
  showConfirmModal(
    'Cancel Generation?',
    'This will delete all generated packs and return their questions to the pool.',
    () => {
      // Restore all original questions from generated packs back to pool
      generatedPacks.forEach(pack => {
        if (pack._original) {
          pool.push(...pack._original);
        }
      });

      // Reset generation state
      generatedPacks = [];
      leftoverIds = null;

      saveStorage();
      render();
      toast('Generation cancelled — all questions returned to pool', 'info');
    }
  );
}

function discardLeftover() {
  if (!leftoverIds) return;
  pool = pool.filter(q => !leftoverIds.has(q._poolId));
  leftoverIds = null;
  saveStorage();
  render();
  toast('Leftover questions discarded', 'warning');
}

/* ── Quiz management ─────────────────────────────────── */
function removeQuiz(id) {
  const quiz = importedQuizzes.find(q => q.id === id);
  const name = quiz ? quiz.name : 'Quiz';

  // Remove from pool (only non-leftover or we also handle leftover cleanup)
  if (leftoverIds) {
    pool.filter(q => q._quizId === id).forEach(q => leftoverIds.delete(q._poolId));
    if (leftoverIds.size === 0) leftoverIds = null;
  }
  pool = pool.filter(q => q._quizId !== id);
  importedQuizzes = importedQuizzes.filter(q => q.id !== id);

  saveStorage();
  render();
  toast(`"${name}" removed from pool`, 'warning');
}

function clearAll() {
  showConfirmModal(
    'Clear Everything?',
    'Removes all imported quizzes, the question pool, and generated packs. This cannot be undone.',
    () => {
      pool = [];
      importedQuizzes = [];
      generatedPacks  = [];
      leftoverIds     = null;
      saveStorage();
      render();
      toast('Everything cleared', 'warning');
    }
  );
}

/* ── Render ──────────────────────────────────────────── */
function render() {
  renderImported();
  renderPool();
  renderResults();
  updateNamingPreview();
}

/* Imported quiz list */
function renderImported() {
  const section = document.getElementById('imported-section');
  const list = document.getElementById('imported-list');

  if (!importedQuizzes.length) {
    list.innerHTML = '';
    section.classList.add('hidden');
    return;
  }

  section.classList.remove('hidden');

  list.innerHTML = importedQuizzes.map(quiz => {
    const qs     = quiz.questions || [];

    // Get questions currently in pool for this quiz (excluding leftovers)
    const poolQuestions = pool.filter(q =>
      q._quizId === quiz.id && (!leftoverIds || !leftoverIds.has(q._poolId))
    );

    // Count available questions by difficulty
    const easy   = poolQuestions.filter(q => q.difficulty === 'easy').length;
    const medium = poolQuestions.filter(q => q.difficulty === 'medium').length;
    const hard   = poolQuestions.filter(q => q.difficulty === 'hard').length;

    const inPool = poolQuestions.length;
    const totalQ = qs.length;

    // Show count of available vs total
    const poolNote = inPool < totalQ
      ? `<span class="quiz-entry__count" style="color:var(--medium);">${inPool}/${totalQ} available</span>`
      : `<span class="quiz-entry__count">${totalQ}Q</span>`;

    // Show only questions not in leftovers when rendering preview
    const previewQuestions = qs.map((q, i) => {
      const poolQ = pool.find(pq => pq._quizId === quiz.id && pq.question === q.question);
      if (!poolQ || (leftoverIds && leftoverIds.has(poolQ._poolId))) {
        return null; // Skip leftover questions in preview
      }
      return q;
    }).filter(Boolean);

    const bodyHTML = previewQuestions.map((q, i) => qItemHTML(q, i)).join('');

    return `
      <div class="quiz-entry" data-quiz-id="${esc(quiz.id)}">
        <div class="quiz-entry__row">
          <div class="quiz-entry__icon">📋</div>
          <div class="quiz-entry__name" title="${esc(quiz.name)}">${esc(quiz.name)}</div>
          <div class="quiz-entry__meta">
            ${easy   > 0 ? `<span class="badge badge-easy">${easy}E</span>`     : ''}
            ${medium > 0 ? `<span class="badge badge-medium">${medium}M</span>` : ''}
            ${hard   > 0 ? `<span class="badge badge-hard">${hard}H</span>`     : ''}
            ${poolNote}
          </div>
          <button class="quiz-entry__remove" data-remove="${esc(quiz.id)}" title="Remove">✕</button>
          <svg class="quiz-entry__chevron" width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <div class="quiz-entry__body">${bodyHTML}</div>
      </div>`;
  }).join('');

  // Toggle expand
  list.querySelectorAll('.quiz-entry__row').forEach(row => {
    row.addEventListener('click', e => {
      if (e.target.closest('[data-remove]')) return;
      row.closest('.quiz-entry').classList.toggle('is-open');
    });
  });

  // Remove buttons
  list.querySelectorAll('[data-remove]').forEach(btn => {
    btn.addEventListener('click', () => removeQuiz(btn.dataset.remove));
  });
}

/* Pool stats */
function renderPool() {
  const statsEl  = document.getElementById('pool-stats');
  const genBtn   = document.getElementById('generate-btn');

  // Available questions (exclude pending leftover from count)
  const available = leftoverIds
    ? pool.filter(q => !leftoverIds.has(q._poolId))
    : pool;

  const s = statsOf(available);
  const packs = Math.min(
    Math.floor(s.easy   / TARGETS.easy),
    Math.floor(s.medium / TARGETS.medium),
    Math.floor(s.hard   / TARGETS.hard)
  );

  if (pool.length === 0 && !leftoverIds) {
    statsEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">📭</div>
        <div class="empty-state__text">Import quiz JSON files above to fill the pool</div>
      </div>`;
    genBtn.disabled = true;
    genBtn.textContent = '⚡ Generate Quiz Packs';
    return;
  }

  // Build difficulty blocks
  const blockHTML = (type, count) => {
    const target = TARGETS[type];
    const ok = count >= target;
    return `
      <div class="pool-block pool-block--${type}">
        <div class="pool-block__count">${count}</div>
        <div class="pool-block__label">${type}</div>
        <div class="pool-block__need">${ok ? `✓ ${target} per pack` : `Need ${target} per pack`}</div>
      </div>`;
  };

  // Projection or warning
  let projHTML = '';
  if (packs > 0) {
    const totalQ  = packs * (TARGETS.easy + TARGETS.medium + TARGETS.hard);
    const startN  = settings.startingNumber;
    const endN    = startN + packs - 1;
    const range   = packs === 1
      ? `qp-${String(startN).padStart(4,'0')}`
      : `qp-${String(startN).padStart(4,'0')} → qp-${String(endN).padStart(4,'0')}`;

    projHTML = `
      <div class="pool-projection">
        <div class="pool-projection__num">${packs}</div>
        <div>
          <div class="pool-projection__label">
            complete pack${packs !== 1 ? 's' : ''} ready to generate
          </div>
          <div class="pool-projection__sub">${totalQ} questions · ${range}</div>
        </div>
      </div>`;
  } else {
    const missing = [];
    if (s.easy   < TARGETS.easy)   missing.push(`${TARGETS.easy   - s.easy} more easy`);
    if (s.medium < TARGETS.medium) missing.push(`${TARGETS.medium - s.medium} more medium`);
    if (s.hard   < TARGETS.hard)   missing.push(`${TARGETS.hard   - s.hard} more hard`);

    projHTML = `
      <div class="pool-alert pool-alert--warning">
        <span>⚠️</span>
        <span>Need ${missing.join(', ')} question${missing.length !== 1 ? 's' : ''} to generate a full pack.</span>
      </div>`;
  }

  // Leftover notice
  let leftoverNotice = '';
  if (leftoverIds && leftoverIds.size > 0) {
    const leftQ = pool.filter(q => leftoverIds.has(q._poolId));
    const ls = statsOf(leftQ);
    leftoverNotice = `
      <div class="pool-alert pool-alert--warning">
        <span>🔁</span>
        <span>
          <strong>${leftQ.length} leftover question${leftQ.length !== 1 ? 's' : ''}</strong> from last generation await a decision
          (${ls.easy}E · ${ls.medium}M · ${ls.hard}H).
          Scroll down to handle them.
        </span>
      </div>`;
  }

  statsEl.innerHTML = `
    <div class="pool-blocks">
      ${blockHTML('easy',   s.easy)}
      ${blockHTML('medium', s.medium)}
      ${blockHTML('hard',   s.hard)}
    </div>
    ${projHTML}
    ${leftoverNotice}`;

  genBtn.disabled = packs === 0;
  genBtn.innerHTML = packs > 0
    ? `⚡ Generate ${packs} Quiz Pack${packs !== 1 ? 's' : ''}`
    : '⚡ Generate Quiz Packs';
}

/* Results */
function renderResults() {
  const sec      = document.getElementById('sec-results');
  const sub      = document.getElementById('results-sub');
  const grid     = document.getElementById('packs-grid');
  const leftPanel = document.getElementById('leftover-panel');

  if (!generatedPacks.length && !leftoverIds) {
    sec.classList.add('hidden');
    return;
  }

  sec.classList.remove('hidden');
  sub.textContent = generatedPacks.length
    ? `${generatedPacks.length} pack${generatedPacks.length !== 1 ? 's' : ''} generated — preview or download`
    : 'Handle leftover questions below';

  // Render pack cards
  if (generatedPacks.length) {
    grid.innerHTML = generatedPacks.map((pack, idx) => packCardHTML(pack, idx)).join('');

    grid.querySelectorAll('.pack-card__header').forEach(h => {
      h.addEventListener('click', e => {
        if (e.target.closest('.pack-card__dl')) return;
        h.closest('.pack-card').classList.toggle('is-open');
      });
    });

    grid.querySelectorAll('[data-dl-idx]').forEach(btn => {
      btn.addEventListener('click', () => downloadPack(Number(btn.dataset.dlIdx)));
    });

    // Cancel generation button
    const cancelBtn = document.getElementById('cancel-gen-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', cancelGeneration);
    }
  } else {
    grid.innerHTML = '';
  }

  // Leftover panel
  if (leftoverIds && leftoverIds.size > 0) {
    const leftQ = pool.filter(q => leftoverIds.has(q._poolId));
    const ls    = statsOf(leftQ);
    const fname = unfinishedFilename();

    leftPanel.classList.remove('hidden');
    leftPanel.innerHTML = `
      <div class="section-divider">Leftover Questions</div>
      <div class="leftover-panel">
        <div class="leftover-panel__head">
          <span style="font-size:22px;">⚠️</span>
          <span class="leftover-panel__title">
            ${leftQ.length} question${leftQ.length !== 1 ? 's' : ''} couldn't fill a complete pack
          </span>
          <div class="leftover-panel__badges">
            ${ls.easy   > 0 ? `<span class="badge badge-easy">${ls.easy}E</span>`     : ''}
            ${ls.medium > 0 ? `<span class="badge badge-medium">${ls.medium}M</span>` : ''}
            ${ls.hard   > 0 ? `<span class="badge badge-hard">${ls.hard}H</span>`     : ''}
          </div>
        </div>
        <div class="leftover-panel__body">
          <p class="leftover-panel__desc">
            These questions didn't make it into a complete 5E + 3M + 2H pack.
            Choose what to do with them — or import more quizzes to eventually fill another pack.
          </p>
          <div class="leftover-panel__actions">
            <button class="btn btn-warning" id="btn-dl-leftover">
              ⬇&ensp;Download as <code style="font-size:11px;font-family:monospace;">${esc(fname)}.json</code>
            </button>
            <button class="btn btn-outline" id="btn-save-leftover">
              💾&ensp;Keep in pool for next time
            </button>
            <button class="btn btn-danger btn-sm" id="btn-discard-leftover">
              🗑&ensp;Discard
            </button>
          </div>
        </div>
      </div>`;

    document.getElementById('btn-dl-leftover').addEventListener('click', downloadLeftover);
    document.getElementById('btn-save-leftover').addEventListener('click', saveLeftoverToPool);
    document.getElementById('btn-discard-leftover').addEventListener('click', () => {
      showConfirmModal(
        'Discard leftover questions?',
        'These questions will be permanently removed from the pool. This cannot be undone.',
        discardLeftover
      );
    });
  } else {
    leftPanel.classList.add('hidden');
    leftPanel.innerHTML = '';
  }
}

/* Pack card HTML */
function packCardHTML(pack, idx) {
  const questionsHTML = pack.questions.map((q, i) => qItemHTML(q, i)).join('');
  return `
    <div class="pack-card">
      <div class="pack-card__header">
        <span class="pack-name">${esc(pack.filename)}</span>
        <div class="pack-card__badges">
          <span class="badge badge-easy">${pack.easy}E</span>
          <span class="badge badge-medium">${pack.medium}M</span>
          <span class="badge badge-hard">${pack.hard}H</span>
        </div>
        <button class="pack-card__dl" data-dl-idx="${idx}" title="Download ${esc(pack.filename)}.json">⬇</button>
        <svg class="pack-card__chevron" width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div class="pack-card__body">${questionsHTML}</div>
    </div>`;
}

/* Question item HTML — shared by both quiz preview and pack preview */
function qItemHTML(q, i) {
  const choices = (q.choices || []).map((c, ci) => `
    <li class="q-choice">
      <span class="q-letter">${letter(ci)}.</span>
      ${esc(c)}
    </li>`).join('');

  return `
    <div class="q-item">
      <div class="q-row">
        <div class="q-num">${i + 1}.</div>
        <div class="q-body">
          <div class="q-text">${esc(q.question || '')}</div>
          <ul class="q-choices">${choices}</ul>
          <div class="q-footer">
            ${badge(q.difficulty)}
            ${q.references ? `<span class="q-ref">Ref: ${esc(q.references)}</span>` : ''}
          </div>
        </div>
      </div>
    </div>`;
}

/* Naming preview in generate controls */
function updateNamingPreview() {
  const inp   = document.getElementById('start-num');
  const range = document.getElementById('naming-range');

  if (inp && inp.value != settings.startingNumber) {
    inp.value = settings.startingNumber;
  }

  if (range) {
    const packs = maxPacks();
    if (packs > 1) {
      const start = settings.startingNumber;
      const end   = start + packs - 1;
      range.textContent =
        `→ qp-${String(start).padStart(4,'0')} … qp-${String(end).padStart(4,'0')}`;
    } else if (packs === 1) {
      range.textContent = `→ qp-${String(settings.startingNumber).padStart(4,'0')}`;
    } else {
      range.textContent = '';
    }
  }
}

/* ── Modals ──────────────────────────────────────────── */
function showModal(html) {
  document.getElementById('modal-box').innerHTML = html;
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

function showShortageModal(stats) {
  const rows = ['easy', 'medium', 'hard'].map(type => {
    const have  = stats[type];
    const need  = TARGETS[type];
    const short = need - have;
    return `
      <div class="shortage-row shortage-row--${type}">
        <div class="shortage-row__left">
          ${badge(type)}
          <span class="shortage-type">${type}</span>
          <span style="font-size:12px;color:var(--muted);">— have ${have}, need ${need}</span>
        </div>
        ${short > 0
          ? `<span class="shortage-need">+${short} needed</span>`
          : `<span class="shortage-need" style="color:var(--easy)">✓</span>`}
      </div>`;
  }).join('');

  showModal(`
    <h2 class="modal__title">⚠️ Can't Generate Yet</h2>
    <p class="modal__subtitle">
      The pool doesn't have enough questions to form even one complete pack
      (${TARGETS.easy} Easy + ${TARGETS.medium} Medium + ${TARGETS.hard} Hard).
      Import more quizzes and try again.
    </p>
    <div class="modal__body">
      <div class="shortage-list">${rows}</div>
    </div>
    <div class="modal__footer">
      <button class="btn btn-primary" id="modal-ok">Got it</button>
    </div>`);

  document.getElementById('modal-ok').addEventListener('click', closeModal);
}

function showConfirmModal(title, message, onConfirm) {
  showModal(`
    <h2 class="modal__title">${esc(title)}</h2>
    <p class="modal__subtitle">${esc(message)}</p>
    <div class="modal__footer">
      <button class="btn btn-outline" id="modal-cancel">Cancel</button>
      <button class="btn btn-danger"  id="modal-confirm">Confirm</button>
    </div>`);

  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-confirm').addEventListener('click', () => {
    closeModal();
    onConfirm();
  });
}

/* ── Toast ───────────────────────────────────────────── */
function toast(message, type = 'info') {
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const el    = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.innerHTML = `<span>${icons[type] || ''}</span><span>${esc(message)}</span>`;
  document.getElementById('toast-rack').appendChild(el);

  setTimeout(() => {
    el.classList.add('toast--out');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }, 3500);
}

/* ── Events ──────────────────────────────────────────── */
function bindEvents() {
  const dz       = document.getElementById('drop-zone');
  const fileIn   = document.getElementById('file-input');
  const browse   = document.getElementById('browse-link');
  const genBtn   = document.getElementById('generate-btn');
  const dlAllBtn = document.getElementById('dl-all-btn');
  const clearBtn = document.getElementById('clear-all-btn');
  const startNum = document.getElementById('start-num');
  const overlay  = document.getElementById('modal-overlay');

  // Drop zone
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag-over'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
  dz.addEventListener('drop', e => {
    e.preventDefault();
    dz.classList.remove('drag-over');
    handleFiles([...e.dataTransfer.files]);
  });
  dz.addEventListener('click', () => fileIn.click());
  dz.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') fileIn.click(); });
  browse.addEventListener('click', e => { e.stopPropagation(); fileIn.click(); });
  fileIn.addEventListener('change', () => {
    handleFiles([...fileIn.files]);
    fileIn.value = '';
  });

  // Generate + Download all
  genBtn.addEventListener('click', generatePacks);
  dlAllBtn.addEventListener('click', downloadAll);

  // Clear all
  clearBtn.addEventListener('click', clearAll);

  // Starting number input — update in real-time
  startNum.addEventListener('input', () => {
    const v = parseInt(startNum.value, 10);
    if (v > 0) {
      settings.startingNumber = v;
      updateNamingPreview();
      saveStorage();
    }
  });

  startNum.addEventListener('change', () => {
    const v = parseInt(startNum.value, 10);
    if (!v || v <= 0) {
      startNum.value = settings.startingNumber;
      updateNamingPreview();
    }
  });

  // Modal overlay click-to-close
  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeModal();
  });
}

/* ── Init ────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  loadStorage();
  bindEvents();
  render();
});
