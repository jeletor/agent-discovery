'use strict';

const WebSocket = require('ws');
const { verifyEvent } = require('nostr-tools');
const { DEFAULT_RELAYS, DEFAULT_TIMEOUT_MS } = require('./constants');

/**
 * Connect to a single relay. Returns a WebSocket.
 */
function connectRelay(url, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error(`Connection to ${url} timed out`));
    }, timeoutMs);

    ws.on('open', () => {
      clearTimeout(timer);
      resolve(ws);
    });

    ws.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/**
 * Query a single relay for events matching a filter.
 * Returns array of events. Resolves on EOSE or timeout (returns partial).
 */
async function queryRelay(url, filter, timeoutMs = DEFAULT_TIMEOUT_MS) {
  let ws;
  try {
    ws = await connectRelay(url, timeoutMs);
  } catch (e) {
    return []; // relay unreachable, skip silently
  }

  return new Promise((resolve) => {
    const events = [];
    const subId = 'q_' + Math.random().toString(36).slice(2, 10);
    const timer = setTimeout(() => {
      try { ws.close(); } catch (e) { /* ignore */ }
      resolve(events);
    }, timeoutMs);

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg[0] === 'EVENT' && msg[1] === subId) {
          const event = msg[2];
          if (!verifyEvent(event)) return; // drop events with invalid signatures
          events.push(event);
        } else if (msg[0] === 'EOSE' && msg[1] === subId) {
          clearTimeout(timer);
          try {
            ws.send(JSON.stringify(['CLOSE', subId]));
            ws.close();
          } catch (e) { /* ignore */ }
          resolve(events);
        }
      } catch (e) { /* ignore parse errors */ }
    });

    ws.on('error', () => {
      clearTimeout(timer);
      resolve(events);
    });

    ws.on('close', () => {
      clearTimeout(timer);
      resolve(events);
    });

    ws.send(JSON.stringify(['REQ', subId, filter]));
  });
}

/**
 * Query multiple relays in parallel, deduplicate by event id.
 */
async function queryRelays(filter, relays = DEFAULT_RELAYS, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const results = await Promise.allSettled(
    relays.map(url => queryRelay(url, filter, timeoutMs))
  );

  const seen = new Set();
  const events = [];

  for (const result of results) {
    if (result.status === 'fulfilled') {
      for (const event of result.value) {
        if (!seen.has(event.id)) {
          seen.add(event.id);
          events.push(event);
        }
      }
    }
  }

  return events;
}

/**
 * Publish an event to multiple relays.
 * Returns { successes, failures, total }.
 */
async function publishToRelays(event, relays = DEFAULT_RELAYS, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const results = await Promise.allSettled(
    relays.map(async (url) => {
      const ws = await connectRelay(url, timeoutMs);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          try { ws.close(); } catch (e) { /* ignore */ }
          reject(new Error(`Publish to ${url} timed out`));
        }, timeoutMs);

        ws.on('message', (data) => {
          try {
            const msg = JSON.parse(data.toString());
            if (msg[0] === 'OK') {
              clearTimeout(timer);
              try { ws.close(); } catch (e) { /* ignore */ }
              if (msg[2]) {
                resolve({ relay: url, ok: true });
              } else {
                reject(new Error(msg[3] || 'Rejected by relay'));
              }
            }
          } catch (e) { /* ignore */ }
        });

        ws.on('error', (err) => {
          clearTimeout(timer);
          reject(err);
        });

        ws.send(JSON.stringify(['EVENT', event]));
      });
    })
  );

  const successes = results.filter(r => r.status === 'fulfilled').length;
  const failures = results
    .filter(r => r.status === 'rejected')
    .map(r => r.reason.message);

  return { successes, failures, total: relays.length };
}

module.exports = { connectRelay, queryRelay, queryRelays, publishToRelays };
