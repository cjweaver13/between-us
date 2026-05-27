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
1. Reflect back what the person is actually saying without distortion - separate emotional content from behavioral request
2. Identify cognitive distortions or RSD spirals gently, without framing them as attacks
3. Reframe their core need in neutral language the other partner can hear without defensiveness
4. Pose 1-2 honest questions directed at the other partner that would move things forward
5. Never take sides. Both perspectives are legitimate even in direct conflict.
6. Be direct. No therapy-speak filler. No affirmation padding. Treat both as intelligent adults.
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

const SESSION_NOTE_PROMPT = `You are wrapping up a couples counseling session between Collin and Megan. Generate a compact handoff note — not a summary for them to read together, but a clinical briefing so the next session can pick up without re-reading everything.

Format exactly as:
Date: [today's date]
Worked through: [2-3 sentences, specific topics covered]
Breakthroughs: [1-2 sentences, or "none clear yet"]
Still unresolved: [1-2 sentences]
For Collin before next session: [1 concrete reflection or action]
For Megan before next session: [1 concrete reflection or action]
Start next session with: [one specific question or topic to open with]

Be concrete and specific. Under 200 words. This is a clinical handoff, not encouragement.`;

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
