// ---- Config ----
const MOODS = ['frustrated', 'anxious', 'hopeful', 'disconnected', 'understood', 'overwhelmed', 'grateful', 'stuck'];
const PROMPTS = [
  'Something I need you to hear...',
  'I\'ve been holding onto...',
  'What I actually meant was...',
  'Today I felt like...',
  'What would help me right now...'
];

const MODE_DESC = {
  checkin: 'AI responds to your entry on its own — like a private check-in.',
  live: 'AI reads the full thread and responds as a counselor to the ongoing dialogue.'
};

// ---- State ----
let currentUser = null;
let currentMode = localStorage.getItem('bu_mode') || 'checkin';
let entries = [];

// ---- Init ----
document.addEventListener('DOMContentLoaded', () => {
  const saved = localStorage.getItem('bu_user');
  if (saved) setUser(saved);

  buildMoodChips();
  buildPromptChips();
  applyMode(currentMode);
  bindEvents();
});

function bindEvents() {
  document.querySelectorAll('.user-btn').forEach(btn => {
    btn.addEventListener('click', () => setUser(btn.dataset.user));
  });

  document.getElementById('switch-user').addEventListener('click', () => {
    localStorage.removeItem('bu_user');
    currentUser = null;
    document.getElementById('app').classList.add('hidden');
    document.getElementById('user-select').classList.remove('hidden');
  });

  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  document.getElementById('submit-btn').addEventListener('click', submitEntry);
  document.getElementById('summary-btn').addEventListener('click', generateSummary);

  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentMode = btn.dataset.mode;
      localStorage.setItem('bu_mode', currentMode);
      applyMode(currentMode);
    });
  });
}

function applyMode(mode) {
  document.querySelectorAll('.mode-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === mode);
  });
  document.getElementById('mode-desc').textContent = MODE_DESC[mode];
}

function setUser(name) {
  currentUser = name;
  localStorage.setItem('bu_user', name);

  document.getElementById('user-select').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');

  const badge = document.getElementById('user-badge');
  badge.textContent = name;
  badge.className = 'user-badge ' + name.toLowerCase();

  document.getElementById('app').className = 'screen as-' + name.toLowerCase();

  loadThread();
}

// ---- Chips ----
function buildMoodChips() {
  const container = document.getElementById('mood-chips');
  MOODS.forEach(mood => {
    const chip = document.createElement('button');
    chip.className = 'chip';
    chip.textContent = mood;
    chip.addEventListener('click', () => chip.classList.toggle('selected'));
    container.appendChild(chip);
  });
}

function buildPromptChips() {
  const container = document.getElementById('prompt-chips');
  PROMPTS.forEach(prompt => {
    const chip = document.createElement('button');
    chip.className = 'chip';
    chip.textContent = prompt;
    chip.addEventListener('click', () => {
      const ta = document.getElementById('entry-text');
      ta.value = (ta.value ? ta.value.trimEnd() + '\n\n' : '') + prompt + ' ';
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    });
    container.appendChild(chip);
  });
}

// ---- Tab Switching ----
function switchTab(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.getElementById('write-tab').classList.toggle('hidden', tab !== 'write');
  document.getElementById('thread-tab').classList.toggle('hidden', tab !== 'thread');
  if (tab === 'thread') loadThread();
}

// ---- Submit Entry ----
async function submitEntry() {
  const text = document.getElementById('entry-text').value.trim();
  if (!text) return;

  const selectedMoods = [...document.querySelectorAll('#mood-chips .chip.selected')].map(c => c.textContent);

  const feedback = document.getElementById('write-feedback');
  const btn = document.getElementById('submit-btn');
  btn.disabled = true;
  feedback.className = 'feedback analyzing';
  feedback.textContent = currentMode === 'live' ? 'Counselor is reading the full thread...' : 'Analyzing your entry...';

  // Build context based on mode
  let context;
  if (currentMode === 'live') {
    // Full thread for live counseling — AI needs the whole conversation
    context = entries.map(e => {
      let line = `${e.user}: "${e.text.slice(0, 400)}"`;
      if (e.analysis) line += `\n[Counselor: ${e.analysis.slice(0, 200)}]`;
      return line;
    }).join('\n\n');
  } else {
    // Recent context only for check-in mode
    context = entries.slice(-6).map(e =>
      `${e.user} (${e.moods.join(', ') || 'no mood'}): ${e.text.slice(0, 200)}`
    ).join('\n');
  }

  try {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entry: text, user: currentUser, moods: selectedMoods, context, mode: currentMode })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    const entry = {
      id: crypto.randomUUID(),
      user: currentUser,
      text,
      moods: selectedMoods,
      analysis: data.analysis,
      timestamp: new Date().toISOString(),
      mode: currentMode,
      replies: []
    };

    await saveEntry(entry);
    entries.push(entry);
    syncLocal();

    // Reset form
    document.getElementById('entry-text').value = '';
    document.querySelectorAll('#mood-chips .chip.selected').forEach(c => c.classList.remove('selected'));

    feedback.className = 'feedback success';
    feedback.textContent = 'Saved. Check the Thread tab.';
    setTimeout(() => feedback.classList.add('hidden'), 3000);

  } catch (err) {
    feedback.className = 'feedback error';
    feedback.textContent = err.message || 'Something went wrong.';
  } finally {
    btn.disabled = false;
  }
}

// ---- Data ----
async function saveEntry(entry) {
  try {
    await fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'insert', ...entry })
    });
  } catch (_) {
    // Server unavailable (Netlify without Supabase configured) — localStorage only
  }
}

async function loadThread() {
  const loading = document.getElementById('thread-loading');
  loading.classList.remove('hidden');

  try {
    const res = await fetch('/api/data');
    const data = await res.json();
    entries = data.entries || [];
    syncLocal();
  } catch (_) {
    const local = localStorage.getItem('bu_entries');
    entries = local ? JSON.parse(local) : [];
  }

  loading.classList.add('hidden');
  renderThread();
}

function syncLocal() {
  localStorage.setItem('bu_entries', JSON.stringify(entries));
}

// ---- Thread Render ----
function renderThread() {
  const list = document.getElementById('thread-list');
  const empty = document.getElementById('empty-thread');
  const summaryBtn = document.getElementById('summary-btn');

  list.innerHTML = '';

  if (!entries.length) {
    empty.classList.remove('hidden');
    summaryBtn.classList.add('hidden');
    return;
  }

  empty.classList.add('hidden');
  summaryBtn.classList.toggle('hidden', entries.length < 2);

  entries.forEach(entry => list.appendChild(buildEntryCard(entry)));
}

function buildEntryCard(entry) {
  const isSummary = entry.type === 'summary';
  const card = document.createElement('div');
  card.className = `entry-card ${isSummary ? 'summary' : entry.user.toLowerCase()}`;

  // Header
  const header = document.createElement('div');
  header.className = 'entry-header';

  const author = document.createElement('span');
  author.className = 'entry-author';
  author.textContent = isSummary ? 'Session Summary' : entry.user;

  const time = document.createElement('span');
  time.className = 'entry-time';
  time.textContent = formatTime(entry.timestamp);

  header.appendChild(author);
  header.appendChild(time);

  // Live thread badge
  if (!isSummary && entry.mode === 'live') {
    const badge = document.createElement('span');
    badge.className = 'mode-badge';
    badge.textContent = 'Live Thread';
    header.appendChild(badge);
  }

  card.appendChild(header);

  // Moods
  if (!isSummary && entry.moods && entry.moods.length) {
    const moodRow = document.createElement('div');
    moodRow.className = 'entry-moods';
    entry.moods.forEach(m => {
      const tag = document.createElement('span');
      tag.className = 'mood-tag';
      tag.textContent = m;
      moodRow.appendChild(tag);
    });
    card.appendChild(moodRow);
  }

  // Body
  const body = document.createElement('div');
  body.className = isSummary ? 'summary-body' : 'entry-body';
  body.textContent = entry.text;
  card.appendChild(body);

  // AI Analysis
  if (!isSummary && entry.analysis) {
    const analysisCard = document.createElement('div');
    analysisCard.className = 'analysis-card';
    const label = document.createElement('div');
    label.className = 'analysis-label';
    label.textContent = entry.mode === 'live' ? 'Counselor' : 'Analysis';
    const text = document.createElement('div');
    text.className = 'analysis-text';
    text.textContent = entry.analysis;
    analysisCard.appendChild(label);
    analysisCard.appendChild(text);
    card.appendChild(analysisCard);
  }

  // Replies
  if (!isSummary) {
    const repliesEl = document.createElement('div');
    repliesEl.className = 'replies';

    if (entry.replies && entry.replies.length) {
      entry.replies.forEach(r => {
        repliesEl.appendChild(buildReplyItem(r));
      });
    }

    const form = buildReplyForm(entry.id, repliesEl);
    repliesEl.appendChild(form);
    card.appendChild(repliesEl);
  }

  return card;
}

function buildReplyItem(reply) {
  const item = document.createElement('div');
  item.className = 'reply-item';
  const rAuthor = document.createElement('div');
  rAuthor.className = 'reply-author ' + reply.user.toLowerCase();
  rAuthor.textContent = reply.user;
  const rText = document.createElement('div');
  rText.className = 'reply-text';
  rText.textContent = reply.text;
  item.appendChild(rAuthor);
  item.appendChild(rText);
  return item;
}

function buildReplyForm(entryId, repliesEl) {
  const form = document.createElement('div');
  form.className = 'reply-form';

  const input = document.createElement('textarea');
  input.className = 'reply-input';
  input.placeholder = 'Add a reply...';
  input.rows = 1;
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = input.scrollHeight + 'px';
  });

  const btn = document.createElement('button');
  btn.className = 'reply-submit';
  btn.textContent = 'Reply';
  btn.addEventListener('click', () => postReply(entryId, input, repliesEl, btn, form));

  form.appendChild(input);
  form.appendChild(btn);
  return form;
}

async function postReply(entryId, input, repliesEl, btn, form) {
  const text = input.value.trim();
  if (!text) return;

  btn.disabled = true;
  const reply = {
    id: crypto.randomUUID(),
    user: currentUser,
    text,
    timestamp: new Date().toISOString()
  };

  const entry = entries.find(e => e.id === entryId);
  if (entry) {
    if (!entry.replies) entry.replies = [];
    entry.replies.push(reply);
    syncLocal();
  }

  try {
    await fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reply', entryId, reply })
    });
  } catch (_) {}

  const item = buildReplyItem(reply);
  repliesEl.insertBefore(item, form);

  input.value = '';
  input.style.height = 'auto';
  btn.disabled = false;
}

// ---- Summary ----
async function generateSummary() {
  const btn = document.getElementById('summary-btn');
  btn.disabled = true;
  btn.textContent = 'Generating...';

  const context = entries.map(e =>
    `${e.user}: ${e.text.slice(0, 300)}${e.analysis ? '\n[Analysis: ' + e.analysis.slice(0, 200) + ']' : ''}`
  ).join('\n\n---\n\n');

  try {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ summaryMode: true, context, user: 'both', moods: [], mode: 'checkin' })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    const summary = {
      id: crypto.randomUUID(),
      type: 'summary',
      text: data.analysis,
      timestamp: new Date().toISOString()
    };

    await saveEntry(summary);
    entries.push(summary);
    syncLocal();
    renderThread();
  } catch (err) {
    alert('Summary failed: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Generate Session Summary';
  }
}

// ---- Utils ----
function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}
