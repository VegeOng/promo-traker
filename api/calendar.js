// /api/calendar.js
// 读取 Google Calendar 未来 3 天行程

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const apiKey = process.env.GOOGLE_CALENDAR_API_KEY;
  const calendarId = 'ohy4896@gmail.com';

  // 马来西亚时间 UTC+8
  const now = new Date();
  const myt = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const todayStr = myt.toISOString().split('T')[0]; // YYYY-MM-DD in MYT
  const in4DaysStr = new Date(myt.getTime() + 4 * 86400000).toISOString().split('T')[0];
  const timeMin = `${todayStr}T00:00:00+08:00`;
  const timeMax = `${in4DaysStr}T23:59:59+08:00`;

  try {
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?key=${apiKey}&timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime&maxResults=20`;
    const r = await fetch(url);
    const data = await r.json();

    if (!r.ok) {
      return res.status(r.status).json({ error: data.error?.message || 'Calendar API error' });
    }

    const events = (data.items || []).map(e => ({
      title: e.summary || '(无标题)',
      start: e.start?.dateTime || e.start?.date,
      end: e.end?.dateTime || e.end?.date,
      location: e.location || '',
      description: e.description || '',
      allDay: !!e.start?.date && !e.start?.dateTime,
    }));

    return res.status(200).json({ events });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
