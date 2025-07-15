// Utility to send notepad content to a Discord webhook (bookie)
// Sends plain text notepad content to a Discord webhook (bookie).
// `roomId` is kept for backward compatibility but no longer used.
export async function sendToBookieWebhook(webhookUrl: string, content: string, _roomId?: string) {
  if (!webhookUrl) throw new Error('Webhook URL not set');
  
  // Strip HTML tags from content
  let plainText = content.replace(/<[^>]*>?/gm, '').replace(/&nbsp;/g, ' ').trim();
  // Fallback if stripping leaves an empty string
  if (!plainText) plainText = '(empty)';
  
  // Discord message content limit is 2000 chars, so send as a file if too long
  if (plainText.length <= 2000) {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: plainText }),
    });
  } else {
    // Send as txt file attachment
    const form = new FormData();
    const file = new Blob([plainText], { type: 'text/plain' });
    form.append('file', file, `notepad-content.txt`);
    form.append('payload_json', JSON.stringify({ content: 'Notepad content (see attached file)' }));
    await fetch(webhookUrl, {
      method: 'POST',
      body: form,
    });
  }
}
