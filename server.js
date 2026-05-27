require('dotenv').config();
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'public', 'data.json');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const CHECKIN_PROMPT = `You are a neutral, emotionally intelligent relationship counselor reviewing a private entry from one partner. Both partners are neurodivergent (ADHD). Collin is introverted, highly analytical, systems-oriented, and values unstructured mental freedom and autonomy. Megan has rejection sensitive dysphoria, people-pleasing tendencies, anxiety, and finds her sense of purpose partly through external experiences and family connection. They have two rescue dogs with complex needs.

When analyzing this entry:
1. Speak directly to the person writing — use "you", not their name in third person. This is private; only they see it.
2. Reflect back what they're actually saying without distortion - separate emotional content from behavioral request
3. Identify cognitive distortions or RSD spirals gently, without framing them as attacks
4. Reframe their core need clearly — what are they actually asking for beneath the surface?
5. Pose 1-2 honest questions they can sit with or bring into a session with their partner
6. Be direct. No therapy-speak filler. No affirmation padding. Treat them as an intelligent adult.
7. Keep responses under 250 words.

When generating a session summary, format as:
Key themes: [2-3 sentences]
Unresolved tensions: [2-3 sentences]
For Collin to bring to therapy: [1 specific actionable thing]
For Megan to bring to therapy: [1 specific actionable thing]`;

const LIVE_PROMPT = `You are a neutral, emotionally intelligent couples counselor facilitating an ongoing live dialogue between Collin and Megan. Both are neurodivergent (ADHD). Collin is introverted, highly analytical, systems-oriented, and values unstructured mental freedom and autonomy. Megan has rejection sensitive dysphoria, people-pleasing tendencies, anxiety, and finds her sense of purpose partly through external experiences and family connection. They have two rescue dogs with complex needs.

A new message has been added to the ongoing thread. Respond as you would in a live session:
1. Acknowledge what was just said in context of the full conversation - name what you're hearing beneath it
2. Reflect anything the other person may not be fully receiving
3. Ask one honest question to move the dialogue forward - address it to a specific person by name
4. Never take sides. Be direct. No filler, no affirmation padding.
5. Under 200 words.

When generating a session summary, format as:
Key themes: [2-3 sentences]
Unresolved tensions: [2-3 sentences]
For Collin to bring to therapy: [1 specific actionable thing]
For Megan to bring to therapy: [1 specific actionable thing]`;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ entries: [] }, null, 2));
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

app.get('/api/data', (req, res) => {
  res.json(loadData());
});

// Single endpoint handles both insert and reply via action field
app.post('/api/data', (req, res) => {
  const { action } = req.body;
  const data = loadData();

  if (action === 'reply') {
    const { entryId, reply } = req.body;
    const entry = data.entries.find(e => e.id === entryId);
    if (!entry) return res.status(404).json({ error: 'Entry not found' });
    if (!entry.replies) entry.replies = [];
    entry.replies.push(reply);
  } else {
    const entry = { ...req.body };
    delete entry.action;
    data.entries.push(entry);
  }

  saveData(data);
  res.json({ success: true });
});

const SESSION_NOTE_PROMPT = `You are wrapping up a couples counseling session between Collin and Megan. You may be given accumulated notes from prior sessions plus today's session. Generate a single updated handoff note that carries all meaningful breakthroughs and unresolved tensions forward — not just today's, but everything worth remembering across all sessions so far.

Format exactly as:
Date: [today's date]
Ongoing patterns: [2-3 sentences — recurring themes across all sessions, updated with today]
Breakthroughs to date: [running list of real shifts, most recent first, dropped when no longer relevant]
Still unresolved: [what keeps coming up without resolution]
For Collin before next session: [1 concrete reflection or action based on full picture]
For Megan before next session: [1 concrete reflection or action based on full picture]
Start next session with: [one specific question that picks up the most important thread]

Be concrete. Under 250 words. This note replaces all prior notes — make it complete enough to stand alone.`;

app.post('/api/analyze', async (req, res) => {
  const { entry, user, moods, context, summaryMode, mode, sessionNoteMode } = req.body;

  let systemPrompt = mode === 'live' ? LIVE_PROMPT : CHECKIN_PROMPT;
  if (sessionNoteMode) systemPrompt = SESSION_NOTE_PROMPT;

  let userMessage;
  if (sessionNoteMode) {
    userMessage = `Generate a session handoff note for this conversation:\n\n${context}`;
  } else if (summaryMode) {
    userMessage = `Generate a session summary for this conversation:\n\n${context}`;
  } else if (mode === 'live') {
    const moodStr = moods && moods.length ? moods.join(', ') : 'not specified';
    userMessage = `Full conversation thread:\n\n${context || '(no prior messages)'}\n\n---\n\n${user} has now written (mood: ${moodStr}):\n"${entry}"`;
  } else {
    const moodStr = moods && moods.length ? moods.join(', ') : 'not specified';
    userMessage = `${user} has written the following (mood: ${moodStr}):\n\n"${entry}"${context ? `\n\nRecent context:\n${context}` : ''}`;
  }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userMessage }]
    });

    res.json({ analysis: response.content[0].text });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Analysis failed. Check your API key.' });
  }
});

app.listen(PORT, () => {
  console.log(`Between Us running at http://localhost:${PORT}`);
});
