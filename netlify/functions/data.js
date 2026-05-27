const { createClient } = require('@supabase/supabase-js');

function getClient() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
}

exports.handler = async (event) => {
  const supabase = getClient();

  if (event.httpMethod === 'GET') {
    const { data, error } = await supabase
      .from('entries')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };

    const entries = data.map(row => ({
      id: row.id,
      user: row.user_name,
      text: row.text,
      moods: row.moods || [],
      analysis: row.analysis,
      timestamp: row.created_at,
      type: row.entry_type !== 'entry' ? row.entry_type : undefined,
      mode: row.mode || 'checkin',
      replies: row.replies || []
    }));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries })
    };
  }

  if (event.httpMethod === 'POST') {
    const body = JSON.parse(event.body);

    if (body.action === 'delete') {
      const { error } = await supabase.from('entries').delete().eq('id', body.id);
      if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
      return { statusCode: 200, body: JSON.stringify({ success: true }) };
    }

    if (body.action === 'reply') {
      const { entryId, reply } = body;

      const { data: row } = await supabase
        .from('entries')
        .select('replies')
        .eq('id', entryId)
        .single();

      const replies = [...(row?.replies || []), reply];
      const { error } = await supabase.from('entries').update({ replies }).eq('id', entryId);

      if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
      return { statusCode: 200, body: JSON.stringify({ success: true }) };
    }

    // Insert new entry
    const { error } = await supabase.from('entries').insert({
      id: body.id,
      user_name: body.user || 'unknown',
      text: body.text,
      moods: body.moods || [],
      analysis: body.analysis || null,
      entry_type: ['summary', 'session-note', 'checkin'].includes(body.type) ? body.type : 'entry',
      mode: body.mode || 'checkin',
      replies: body.replies || []
    });

    if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  }

  return { statusCode: 405, body: 'Method Not Allowed' };
};
