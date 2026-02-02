'use strict';

const { finalizeEvent } = require('nostr-tools');
const { SERVICE_KIND, DEFAULT_RELAYS, DEFAULT_TIMEOUT_MS } = require('./constants');
const { buildServiceTags } = require('./parse');
const { publishToRelays } = require('./relay');

/**
 * Convert a hex string to Uint8Array.
 */
function hexToBytes(hex) {
  if (hex instanceof Uint8Array) return hex;
  if (typeof hex !== 'string') throw new Error('Secret key must be a hex string or Uint8Array');
  return Uint8Array.from(Buffer.from(hex, 'hex'));
}

/**
 * Publish a service announcement to Nostr relays.
 * 
 * @param {object} opts - Service definition
 * @param {string} opts.id - Unique service identifier (d-tag)
 * @param {string[]} opts.capabilities - What this agent can do
 * @param {object} opts.price - { amount, currency, per }
 * @param {string} opts.lnAddress - Lightning address for payments
 * @param {string} opts.name - Display name
 * @param {string} opts.description - Human-readable description
 * @param {string} opts.status - 'active' or 'inactive'
 * @param {string[]} opts.hashtags - Additional tags for discoverability
 * @param {string[]} opts.dvmKinds - NIP-90 DVM kinds this service handles
 * @param {string|Uint8Array} secretKey - Nostr secret key (hex or bytes)
 * @param {string[]} relays - Relay URLs
 * @param {number} timeoutMs - Timeout per relay
 */
async function publishService(opts, secretKey, relays = DEFAULT_RELAYS, timeoutMs = DEFAULT_TIMEOUT_MS) {
  if (!opts.id) throw new Error('Service id is required');
  if (!secretKey) throw new Error('Secret key is required');

  const sk = hexToBytes(secretKey);
  const tags = buildServiceTags(opts);

  const event = finalizeEvent({
    kind: SERVICE_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: opts.description || ''
  }, sk);

  const result = await publishToRelays(event, relays, timeoutMs);

  return {
    eventId: event.id,
    pubkey: event.pubkey,
    ...result
  };
}

/**
 * Remove a service by publishing an inactive replacement.
 * Parameterized replaceable events are replaced by a newer event
 * with the same pubkey + kind + d-tag.
 */
async function removeService(serviceId, secretKey, relays = DEFAULT_RELAYS, timeoutMs = DEFAULT_TIMEOUT_MS) {
  if (!serviceId) throw new Error('Service id is required');
  if (!secretKey) throw new Error('Secret key is required');

  const sk = hexToBytes(secretKey);

  const event = finalizeEvent({
    kind: SERVICE_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['d', serviceId],
      ['status', 'inactive']
    ],
    content: ''
  }, sk);

  const result = await publishToRelays(event, relays, timeoutMs);

  return {
    eventId: event.id,
    pubkey: event.pubkey,
    ...result
  };
}

module.exports = { publishService, removeService };
