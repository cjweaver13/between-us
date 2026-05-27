// ---- Config ----
const MOODS = ['frustrated', 'anxious', 'hopeful', 'disconnected', 'understood', 'overwhelmed', 'grateful', 'stuck'];
const PROMPTS = [
  'Something I need you to hear...',
  'I\'ve been holding onto...',
  'What I actually meant was...',
  'Today I felt like...',
  'What would help me right now...'
];

// ---- State ----
let currentUser = null;
let entries = [];
let pollInterval = null;
let inactivityTimer = null;
const INACTIVITY_MS = 5 * 60 * 1000; // 5 minutes

// ---- Init ----
document.addEventListener('DOMContentLoaded', () => {
  const saved = localStorage.getItem('bu_user');
  if (saved) setUser(saved);

  buildMoodChips();
  buildPromptChips();
  bindEvents();
});

function bindEvents() {
  document.querySelectorAll('.user-btn').forEach(btn => {
    btn.addEventListener('click', () => setUser(btn.dataset.user));
  });

  document.getElementById('switch-user').addEventListener('click', () => {
    stopPolling();
    localStorage.removeItem('bu_user');
    currentUser = null;
    document.getElementById('app').classList.add('hidden');
    document.getElementById('user-select').classList.remove('hidden');
  });

  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  document.getElementById('submit-btn').addEventListener('click', submitEntry);
  document.getElementById('summary-btn').addEventListener('click', generateSessionSummary);

  // Session
  document.getElementById('end-session-btn').addEventListener('click', endSession);
  document.getElementById('session-submit').addEventListener('click', submitSessionMessage);
  document.getElementById('session-text').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitSessionMessage();
    }
  });
  document.getElementById('session-text').addEventListener('input', () => {
    const ta = document.getElementById('session-text');
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  });
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

  document.getElementById('session-speaking-as').innerHTML =
    `Speaking as: <strong class="${name.toLowerCase()}">${name}</strong> &nbsp;·&nbsp; Shift+Enter for new line`;

  // Pre-load entries from server in background
  fetch('/api/data').then(r => r.json()).then(d => {
    entries = d.entries || [];
    syncLocal();
  }).catch(() => {
    const local = localStorage.getItem('bu_entries');
    entries = local ? JSON.parse(local) : [];
  });
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
  document.getElementById('session-tab').classList.toggle('hidden', tab !== 'session');

  if (tab === 'session') {
    loadAndRenderSession();
    startPolling();
  } else {
    stopPolling();
    stopInactivityTimer();
  }
}

// ---- Write Tab: Submit Entry ----
async function submitEntry() {
  const text = document.getElementById('entry-text').value.trim();
  if (!text) return;

  const selectedMoods = [...document.querySelectorAll('#mood-chips .chip.selected')].map(c => c.textContent);
  const feedback = document.getElementById('write-feedback');
  const analysisDiv = document.getElementById('write-analysis');
  const btn = document.getElementById('submit-btn');
  btn.disabled = true;
  analysisDiv.classList.add('hidden');
  feedback.className = 'feedback analyzing';
  feedback.textContent = 'Analyzing your entry...';

  const context = entries.slice(-6).map(e =>
    `${e.user} (${e.moods.join(', ') || 'no mood'}): ${e.text.slice(0, 200)}`
  ).join('\n');

  try {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entry: text, user: currentUser, moods: selectedMoods, context, mode: 'checkin' })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    const entry = {
      id: crypto.randomUUID(),
      type: 'checkin',
      user: currentUser,
      text,
      moods: selectedMoods,
      analysis: data.analysis,
      timestamp: new Date().toISOString(),
      mode: 'checkin',
      replies: []
    };

    await saveEntry(entry);
    entries.push(entry);
    syncLocal();

    document.getElementById('entry-text').value = '';
    document.querySelectorAll('#mood-chips .chip.selected').forEach(c => c.classList.remove('selected'));

    const label = document.createElement('div');
    label.className = 'write-analysis-label';
    label.textContent = 'Analysis';
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'write-analysis-delete';
    deleteBtn.textContent = 'Delete entry';
    deleteBtn.addEventListener('click', async () => {
      await fetch('/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id: entry.id })
      });
      entries = entries.filter(e => e.id !== entry.id);
      syncLocal();
      analysisDiv.classList.add('hidden');
    });
    const labelRow = document.createElement('div');
    labelRow.className = 'write-analysis-label-row';
    labelRow.appendChild(label);
    labelRow.appendChild(deleteBtn);
    const bodyEl = document.createElement('div');
    bodyEl.className = 'write-analysis-text';
    bodyEl.textContent = data.analysis;
    analysisDiv.innerHTML = '';
    analysisDiv.appendChild(labelRow);
    analysisDiv.appendChild(bodyEl);
    analysisDiv.classList.remove('hidden');

    feedback.className = 'feedback success';
    feedback.textContent = 'Saved privately.';
    setTimeout(() => feedback.classList.add('hidden'), 3000);

  } catch (err) {
    feedback.className = 'feedback error';
    feedback.textContent = err.message || 'Something went wrong.';
  } finally {
    btn.disabled = false;
  }
}

// ---- Session Tab ----
async function loadAndRenderSession() {
  try {
    const res = await fetch('/api/data');
    const data = await res.json();
    entries = data.entries || [];
    syncLocal();
  } catch (_) {
    const local = localStorage.getItem('bu_entries');
    entries = local ? JSON.parse(local) : [];
  }
  renderSession();
}

function renderSession() {
  const chatArea = document.getElementById('chat-area');
  const atBottom = chatArea.scrollHeight - chatArea.scrollTop - chatArea.clientHeight < 80;

  chatArea.innerHTML = '';

  // Show last session note as context card if it exists
  const lastNote = [...entries].reverse().find(e => e.type === 'session-note');
  if (lastNote) {
    const card = document.createElement('div');
    card.className = 'session-note-card';
    const label = document.createElement('div');
    label.className = 'session-note-label';
    label.textContent = 'Last Session Note';
    const text = document.createElement('div');
    text.className = 'session-note-text';
    text.textContent = lastNote.text;
    const date = document.createElement('div');
    date.className = 'session-note-date';
    date.textContent = formatTime(lastNote.timestamp);
    card.appendChild(label);
    card.appendChild(text);
    card.appendChild(date);
    chatArea.appendChild(card);
  }

  const visible = entries.filter(e => e.type !== 'summary' && e.type !== 'session-note' && e.type !== 'checkin');

  // Show End Session and Summary buttons only if there are messages
  document.getElementById('end-session-btn').classList.toggle('hidden', visible.length === 0);
  document.getElementById('summary-btn').classList.toggle('hidden', visible.length < 2);

  if (!visible.length) {
    const empty = document.createElement('div');
    empty.className = 'session-empty';
    empty.textContent = 'Start the session by writing the first message below.';
    chatArea.appendChild(empty);
    return;
  }

  visible.forEach(entry => {
    // User bubble
    const row = document.createElement('div');
    row.className = `bubble-row ${entry.user.toLowerCase()}`;

    const meta = document.createElement('div');
    meta.className = 'bubble-meta';
    meta.textContent = `${entry.user} · ${formatTime(entry.timestamp)}`;

    const bubble = document.createElement('div');
    bubble.className = `bubble ${entry.user.toLowerCase()}`;
    bubble.textContent = entry.text;

    row.appendChild(meta);
    row.appendChild(bubble);

    if (entry.moods && entry.moods.length) {
      const moodEl = document.createElement('div');
      moodEl.className = 'bubble-mood-tag';
      moodEl.textContent = entry.moods.join(' · ');
      row.appendChild(moodEl);
    }

    chatArea.appendChild(row);

    // Counselor response
    if (entry.analysis) {
      const aiRow = document.createElement('div');
      aiRow.className = 'bubble-row ai-row';

      const aiMeta = document.createElement('div');
      aiMeta.className = 'bubble-meta';
      aiMeta.textContent = 'Counselor';

      const aiBubble = document.createElement('div');
      aiBubble.className = 'bubble ai';
      aiBubble.textContent = entry.analysis;

      aiRow.appendChild(aiMeta);
      aiRow.appendChild(aiBubble);
      chatArea.appendChild(aiRow);
    }
  });

  if (atBottom) chatArea.scrollTop = chatArea.scrollHeight;
}

async function submitSessionMessage() {
  const text = document.getElementById('session-text').value.trim();
  if (!text) return;

  const feedback = document.getElementById('session-feedback');
  const btn = document.getElementById('session-submit');
  btn.disabled = true;
  feedback.className = 'feedback analyzing';
  feedback.textContent = 'Counselor is reading the thread...';

  // Token-efficient context: last session note + last 20 messages (not full history)
  const lastNote = [...entries].reverse().find(e => e.type === 'session-note');
  const recentMessages = entries
    .filter(e => e.type !== 'summary' && e.type !== 'session-note')
    .slice(-20)
    .map(e => {
      let line = `${e.user}: "${e.text.slice(0, 400)}"`;
      if (e.analysis) line += `\n[Counselor: ${e.analysis.slice(0, 200)}]`;
      return line;
    }).join('\n\n');

  const context = lastNote
    ? `Previous session note:\n${lastNote.text}\n\n---\n\nCurrent session:\n${recentMessages}`
    : recentMessages;

  // Reset inactivity timer since user is active
  resetInactivityTimer();

  try {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entry: text, user: currentUser, moods: [], context, mode: 'live' })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    const entry = {
      id: crypto.randomUUID(),
      user: currentUser,
      text,
      moods: [],
      analysis: data.analysis,
      timestamp: new Date().toISOString(),
      mode: 'live',
      replies: []
    };

    await saveEntry(entry);
    entries.push(entry);
    syncLocal();

    document.getElementById('session-text').value = '';
    document.getElementById('session-text').style.height = 'auto';
    feedback.classList.add('hidden');
    renderSession();

  } catch (err) {
    feedback.className = 'feedback error';
    feedback.textContent = err.message || 'Something went wrong.';
  } finally {
    btn.disabled = false;
  }
}

// ---- End Session ----
async function endSession() {
  const btn = document.getElementById('end-session-btn');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  const sessionMessages = entries
    .filter(e => e.type !== 'summary' && e.type !== 'session-note')
    .map(e => {
      let line = `${e.user}: "${e.text}"`;
      if (e.analysis) line += `\n[Counselor: ${e.analysis}]`;
      return line;
    }).join('\n\n');

  // Include previous note so the new one rolls up all prior breakthroughs
  const lastNote = [...entries].reverse().find(e => e.type === 'session-note');
  const context = lastNote
    ? `Accumulated notes from all prior sessions:\n${lastNote.text}\n\n---\n\nToday's session:\n${sessionMessages}`
    : sessionMessages;

  try {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionNoteMode: true, context, user: 'both', moods: [], mode: 'live' })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    const note = {
      id: crypto.randomUUID(),
      type: 'session-note',
      user: 'both',
      text: data.analysis,
      timestamp: new Date().toISOString(),
      replies: []
    };

    await saveEntry(note);
    entries.push(note);
    syncLocal();
    renderSession();

    btn.textContent = 'Session Saved';
    setTimeout(() => {
      btn.textContent = 'End Session';
      btn.disabled = false;
    }, 3000);

  } catch (err) {
    btn.textContent = 'End Session';
    btn.disabled = false;
    alert('Could not save session note: ' + err.message);
  }
}

function resetInactivityTimer() {
  // Placeholder — inactivity nudge removed per user preference
}

function stopInactivityTimer() {
  if (inactivityTimer) { clearTimeout(inactivityTimer); inactivityTimer = null; }
}

// Auto-refresh the session every 10 seconds so both people see new messages
function startPolling() {
  stopPolling();
  pollInterval = setInterval(async () => {
    try {
      const res = await fetch('/api/data');
      const data = await res.json();
      const fresh = data.entries || [];
      if (fresh.length !== entries.length) {
        entries = fresh;
        syncLocal();
        renderSession();
      }
    } catch (_) {}
  }, 10000);
}

function stopPolling() {
  if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
}

function syncLocal() {
  localStorage.setItem('bu_entries', JSON.stringify(entries));
}

// ---- Summary ----
async function generateSessionSummary() {
  const btn = document.getElementById('summary-btn');
  btn.disabled = true;
  btn.textContent = 'Generating...';

  const context = entries
    .filter(e => e.type !== 'checkin')
    .map(e => `${e.user}: ${e.text.slice(0, 300)}${e.analysis ? '\n[Analysis: ' + e.analysis.slice(0, 200) + ']' : ''}`)
    .join('\n\n---\n\n');

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
    renderSession();
  } catch (err) {
    alert('Summary failed: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Summary';
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
  } catch (_) {}
}

// ---- Utils ----
function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}
