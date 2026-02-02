'use strict';

const { SERVICE_KIND, DEFAULT_RELAYS, DEFAULT_TIMEOUT_MS } = require('./constants');
const { queryRelays } = require('./relay');
const { parseServiceEvent } = require('./parse');
const { enrichWithTrust } = require('./trust');

/**
 * Find agent services matching criteria.
 * 
 * Uses relay-side filtering where possible (capabilities, pubkeys, hashtags),
 * then post-filters on price and trust score.
 * 
 * Results are sorted by trust score (desc), then creation date (desc).
 * 
 * @param {object} opts - Query options
 * @param {string[]} opts.capabilities - Filter by capability tags
 * @param {number} opts.maxPrice - Maximum price in sats
 * @param {number} opts.minTrust - Minimum ai.wot trust score
 * @param {boolean} opts.includeTrust - Include trust scores (even without minTrust filter)
 * @param {string} opts.status - Filter by status (default: 'active')
 * @param {string[]} opts.pubkeys - Filter by specific pubkeys
 * @param {string[]} opts.hashtags - Filter by hashtags
 * @param {number} opts.limit - Maximum results to return
 * @param {string[]} opts.relays - Override default relays
 * @param {number} opts.timeoutMs - Override default timeout
 */
async function findServices(opts = {}) {
  const {
    capabilities,
    maxPrice,
    minTrust,
    status = 'active',
    relays = DEFAULT_RELAYS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    pubkeys,
    hashtags,
    limit,
    includeTrust = false
  } = opts;

  // Build NIP-01 filter — let the relay do the heavy lifting
  const filter = { kinds: [SERVICE_KIND] };

  if (capabilities && capabilities.length > 0) {
    filter['#c'] = capabilities;
  }
  if (pubkeys && pubkeys.length > 0) {
    filter.authors = pubkeys;
  }
  if (hashtags && hashtags.length > 0) {
    filter['#t'] = hashtags;
  }

  // Query relays
  const events = await queryRelays(filter, relays, timeoutMs);

  // Parse into service objects
  let services = events.map(parseServiceEvent);

  // Dedup: for parameterized replaceable events, keep only the latest per pubkey+d-tag
  const latest = new Map();
  for (const svc of services) {
    const key = `${svc.pubkey}:${svc.id}`;
    const existing = latest.get(key);
    if (!existing || svc.createdAt > existing.createdAt) {
      latest.set(key, svc);
    }
  }
  services = Array.from(latest.values());

  // Filter by status
  if (status) {
    services = services.filter(s => s.status === status);
  }

  // Filter by price (client-side — relays can't do numeric comparisons)
  if (maxPrice !== undefined) {
    services = services.filter(s => !s.price || s.price.amount <= maxPrice);
  }

  // Enrich with trust if requested or if filtering by trust
  if (includeTrust || minTrust !== undefined) {
    services = await enrichWithTrust(services, relays, timeoutMs);
  }

  // Filter by trust
  if (minTrust !== undefined) {
    services = services.filter(s => s.trustScore >= minTrust);
  }

  // Sort: trust (desc) → date (desc)
  services.sort((a, b) => {
    const trustDiff = (b.trustScore || 0) - (a.trustScore || 0);
    if (trustDiff !== 0) return trustDiff;
    return b.createdAt - a.createdAt;
  });

  // Limit
  if (limit) {
    services = services.slice(0, limit);
  }

  return services;
}

/**
 * Get a specific service by pubkey and service id.
 */
async function getService(pubkey, serviceId, opts = {}) {
  const {
    relays = DEFAULT_RELAYS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    includeTrust = true
  } = opts;

  const filter = {
    kinds: [SERVICE_KIND],
    authors: [pubkey],
    '#d': [serviceId]
  };

  const events = await queryRelays(filter, relays, timeoutMs);
  if (events.length === 0) return null;

  // Latest version
  events.sort((a, b) => b.created_at - a.created_at);
  let service = parseServiceEvent(events[0]);

  if (includeTrust) {
    const enriched = await enrichWithTrust([service], relays, timeoutMs);
    service = enriched[0];
  }

  return service;
}

module.exports = { findServices, getService };
