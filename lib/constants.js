'use strict';

// Kind 38990: Parameterized replaceable event for agent service announcements
// In the 30000-39999 range (NIP-01 parameterized replaceable)
// Each agent can update their listing; uniqueness = pubkey + kind + d-tag
const SERVICE_KIND = 38990;

const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://relay.snort.social'
];

const DEFAULT_TIMEOUT_MS = 15000;

// ai.wot constants (NIP-32 labels)
const ATTESTATION_KIND = 1985;
const WOT_NAMESPACE = 'ai.wot';

const TRUST_WEIGHTS = {
  'service-quality': 1.5,
  'identity-continuity': 1.0,
  'general-trust': 0.8,
  'work-completed': 1.2
};

module.exports = {
  SERVICE_KIND,
  DEFAULT_RELAYS,
  DEFAULT_TIMEOUT_MS,
  ATTESTATION_KIND,
  WOT_NAMESPACE,
  TRUST_WEIGHTS
};
