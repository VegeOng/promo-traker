// /api/calendar.js
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const apiKey = process.env.GOOGLE_CALENDAR_API_KEY;
  const calendarId = 'ohy4896@gmail.com';

  const now = new Date();
  const myt = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const todayStr = myt.toISOString().split('T')[0];
  const in4DaysStr = new Date(myt.getTime() + 4 * 86400000).toISOString().split('T')[0];
  const timeMin = `${todayStr}T00:00:00+08:00`;
  const timeMax = `${in4DaysStr}T23:59:59+08:00`;

  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?key=${apiKey}&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime&maxResults=20`;

  try {
    const r = await fetch(url);
    const data = await r.json();

    // Debug: return full response if error
    if (!r.ok) {
      return res.status(200).json({ 
        debug: true,
        status: r.status,
        error: data.error,
        url_used: url.replace(apiKey, 'HIDDEN'),
        timeMin,
        timeMax,
      });
    }

    const events = (data.items || []).map(e => ({
      title: e.summary || '(无标题)',
      start: e.start?.dateTime || e.start?.date,
      end: e.end?.dateTime || e.end?.date,
      location: e.location || '',
      allDay: !!e.start?.date && !e.start?.dateTime,
    }));

    return res.status(200).json({ events, count: events.length, timeMin, timeMax });
  } catch (error) {
    return res.status(200).json({ error: error.message, stack: error.stack });
  }
}
