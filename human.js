// human.js
// Small Telegram helper so the script can "ask a human" (you) for help.
//
// Needs two env vars:
//   TG_TOKEN = bot token from @BotFather
//   TG_CHAT  = your personal chat ID (only messages from this chat are accepted)
//
// Uses the built-in fetch / FormData / Blob of Node 18+. No extra packages.

'use strict';

// Time (Unix seconds) when we last sent you something.
// Replies older than this are treated as "old messages" and ignored.
let askedAt = 0;

function isConfigured() {
  return Boolean(process.env.TG_TOKEN && process.env.TG_CHAT);
}

function apiUrl(method) {
  return `https://api.telegram.org/bot${process.env.TG_TOKEN}/${method}`;
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

// Call a Telegram API method and return its "result" (throws on error).
async function callTelegram(method, body, timeoutMs = 30000) {
  const isForm = body instanceof FormData;
  const res = await fetch(apiUrl(method), {
    method: 'POST',
    headers: isForm ? undefined : { 'Content-Type': 'application/json' },
    body: isForm ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = await res.json();
  if (!data.ok) {
    throw new Error(`Telegram ${method} failed: ${data.description}`);
  }
  return data.result;
}

// Send a plain text message to you.
async function sendMessage(text) {
  if (!isConfigured()) {
    console.log('[telegram not configured] ' + text);
    return;
  }
  askedAt = nowSeconds();
  await callTelegram('sendMessage', { chat_id: process.env.TG_CHAT, text });
}

// Take a screenshot of the page and send it to you with a caption.
async function sendShot(page, caption) {
  if (!isConfigured()) {
    console.log('[telegram not configured] ' + caption);
    return;
  }

  let image;
  try {
    image = await page.screenshot();
  } catch (err) {
    // The page may be broken or closed. Still tell the human what happened.
    await sendMessage(`${caption}\n\n(Screenshot failed: ${err.message})`);
    return;
  }

  askedAt = nowSeconds();
  const form = new FormData();
  form.append('chat_id', String(process.env.TG_CHAT));
  form.append('caption', String(caption).slice(0, 1000)); // Telegram limit is 1024
  form.append('photo', new Blob([image], { type: 'image/png' }), 'naukri.png');
  await callTelegram('sendPhoto', form, 60000);
}

// Wait for you to reply on Telegram. Returns the reply text.
// - Ignores messages sent before our last question (old messages).
// - Ignores messages from any chat except TG_CHAT (strangers cannot control the bot).
async function waitForReply(timeoutMs = 300000) {
  if (!isConfigured()) {
    throw new Error('Telegram is not configured (TG_TOKEN / TG_CHAT missing), cannot wait for a reply.');
  }

  const since = askedAt || nowSeconds();
  const deadline = Date.now() + timeoutMs;
  let offset = 0;

  while (Date.now() < deadline) {
    // Long polling: Telegram holds the request open until a message arrives (max 25 s here).
    const waitSeconds = Math.max(1, Math.min(25, Math.floor((deadline - Date.now()) / 1000)));

    let updates;
    try {
      updates = await callTelegram(
        'getUpdates',
        { offset, timeout: waitSeconds, allowed_updates: ['message'] },
        (waitSeconds + 15) * 1000
      );
    } catch (err) {
      console.log('Telegram poll error, retrying: ' + err.message);
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }

    for (const update of updates) {
      offset = update.update_id + 1; // mark this update as read
      const msg = update.message;
      if (!msg || typeof msg.text !== 'string') continue;
      if (String(msg.chat.id) !== String(process.env.TG_CHAT)) continue; // not you
      if (msg.date < since) continue; // old message
      return msg.text.trim();
    }
  }

  throw new Error(`No Telegram reply within ${Math.round(timeoutMs / 1000)} seconds.`);
}

module.exports = { sendShot, sendMessage, waitForReply };
