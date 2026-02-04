'use strict';

const { verifyEvent } = require('nostr-tools');
const { ATTESTATION_KIND, WOT_NAMESPACE, TRUST_WEIGHTS } = require('./constants');
const { queryRelays } = require('./relay');

/**
 * Fetch ai.wot attestations (NIP-32 kind 1985) targeting a pubkey.
 */
async function fetchAttestations(pubkey, relays, timeoutMs) {
  const filter = {
    kinds: [ATTESTATION_KIND],
    '#L': [WOT_NAMESPACE],
    '#p': [pubkey]
  };

  const events = await queryRelays(filter, relays, timeoutMs);
  return events.filter(e => verifyEvent(e));
}

/**
 * Calculate a basic trust score from attestations.
 * 
 * Scoring: 10 points per unique attester, weighted by attestation type.
 * Self-attestations are excluded. Only the highest-weight attestation
 * per attester is counted.
 * 
 * This is a simplified version of the full ai-wot scoring algorithm
 * (no temporal decay, no hop dampening, no zap weighting).
 * For production trust scoring, use the `ai-wot` package directly.
 */
function calculateTrustScore(attestations, targetPubkey) {
  const attesters = new Map(); // attester pubkey -> best attestation

  for (const event of attestations) {
    // Skip self-attestations
    if (event.pubkey === targetPubkey) continue;

    // Extract attestation type from NIP-32 label
    let type = 'general-trust';
    for (const tag of event.tags) {
      if (tag[0] === 'l' && tag[2] === WOT_NAMESPACE) {
        type = tag[1];
        break;
      }
    }

    const weight = TRUST_WEIGHTS[type] || 0.8;
    const existing = attesters.get(event.pubkey);

    if (!existing || weight > existing.weight) {
      attesters.set(event.pubkey, {
        weight,
        type,
        createdAt: event.created_at
      });
    }
  }

  let score = 0;
  for (const [, att] of attesters) {
    score += att.weight * 10;
  }

  return {
    score: Math.round(score),
    attesters: attesters.size,
    details: Array.from(attesters.entries()).map(([pk, att]) => ({
      pubkey: pk,
      type: att.type,
      weight: att.weight
    }))
  };
}

/**
 * Enrich an array of services with trust scores.
 * Fetches attestations for each unique pubkey in parallel.
 */
async function enrichWithTrust(services, relays, timeoutMs) {
  const pubkeys = [...new Set(services.map(s => s.pubkey))];
  const trustMap = new Map();

  await Promise.allSettled(
    pubkeys.map(async (pk) => {
      const attestations = await fetchAttestations(pk, relays, timeoutMs);
      trustMap.set(pk, calculateTrustScore(attestations, pk));
    })
  );

  return services.map(s => {
    const trust = trustMap.get(s.pubkey) || { score: 0, attesters: 0, details: [] };
    return {
      ...s,
      trust,
      trustScore: trust.score
    };
  });
}

module.exports = { fetchAttestations, calculateTrustScore, enrichWithTrust };
