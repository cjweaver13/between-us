const Anthropic = require('@anthropic-ai/sdk');

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

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const { entry, user, moods, context, summaryMode, mode } = JSON.parse(event.body);
  const systemPrompt = mode === 'live' ? LIVE_PROMPT : CHECKIN_PROMPT;

  let userMessage;
  if (summaryMode) {
    userMessage = `Generate a session summary for this conversation:\n\n${context}`;
  } else if (mode === 'live') {
    const moodStr = moods && moods.length ? moods.join(', ') : 'not specified';
    userMessage = `Full conversation thread:\n\n${context || '(no prior messages)'}\n\n---\n\n${user} has now written (mood: ${moodStr}):\n"${entry}"`;
  } else {
    const moodStr = moods && moods.length ? moods.join(', ') : 'not specified';
    userMessage = `${user} has written the following (mood: ${moodStr}):\n\n"${entry}"${context ? `\n\nRecent context:\n${context}` : ''}`;
  }

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userMessage }]
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ analysis: response.content[0].text })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Analysis failed.' }) };
  }
};
