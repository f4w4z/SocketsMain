// Utility for sending Discord notifications via webhook
/**
 * Sends a Discord notification via webhook. Accepts either a string (plain message) or an object (embed/payload).
 * @param webhookUrl Discord webhook URL
 * @param payload Either a message string or a Discord webhook payload object
 */
export async function sendDiscordNotification(webhookUrl: string, payload: string | object) {
  if (!webhookUrl) return;
  try {
    let body: any;
    if (typeof payload === 'string') {
      body = { content: payload };
    } else {
      body = payload;
    }
    await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    // Optionally log error to console for debugging
    console.error('Discord webhook failed:', error);
  }
}

/**
 * Helper to send a Discord embed notification easily.
 * @param webhookUrl Discord webhook URL
 * @param embed Discord embed object
 * @param content Optional plain text message
 */
export async function sendDiscordEmbedNotification(webhookUrl: string, embed: object, content?: string) {
  const payload: any = {
    embeds: [embed],
  };
  if (content) payload.content = content;
  await sendDiscordNotification(webhookUrl, payload);
}


// For unload events: ensures delivery even during page unload
export function sendBeaconNotification(webhookUrl: string, messageOrPayload: string | object) {
  if (!webhookUrl) return;
  let payload: string;
  if (typeof messageOrPayload === 'string') {
    payload = JSON.stringify({ content: messageOrPayload });
  } else {
    payload = JSON.stringify(messageOrPayload);
  }
  if (navigator.sendBeacon) {
    const blob = new Blob([payload], { type: 'application/json' });
    navigator.sendBeacon(webhookUrl, blob);
  } else {
    // Fallback to fetch if sendBeacon is not available
    fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true
    });
  }
}
