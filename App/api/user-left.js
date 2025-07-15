// api/user-left.js

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_USER_LEFT;

/**
 * @param {import('@vercel/node').VercelRequest} req
 * @param {import('@vercel/node').VercelResponse} res
 */
export default async function handler(req, res) {
  const logs = [];
  logs.push({ step: 'start', method: req.method, url: req.url });
  if (req.method !== 'POST') {
    logs.push({ step: 'wrong-method', method: req.method });
    return res.status(405).json({ error: 'Method not allowed', logs });
  }

  if (!DISCORD_WEBHOOK_URL) {
    logs.push({ step: 'missing-webhook-url' });
    return res.status(500).json({ error: 'Discord webhook URL not configured', logs });
  }

  try {
    const payload = req.body;
    logs.push({ step: 'got-payload', payload });
    const discordRes = await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: typeof payload === 'string' ? payload : JSON.stringify(payload),
    });
    const text = await discordRes.text();
    logs.push({ step: 'discord-response', status: discordRes.status, text });
    if (!discordRes.ok) {
      logs.push({ step: 'discord-failed', status: discordRes.status });
      return res.status(500).json({ error: 'Discord webhook failed', status: discordRes.status, text, logs });
    }
    logs.push({ step: 'discord-success' });
    return res.status(200).json({ ok: true, discordStatus: discordRes.status, text, logs });
  } catch (err) {
    logs.push({ step: 'exception', error: err.message || err });
    return res.status(500).json({ error: err.message || 'Unknown error', logs });
  }
}