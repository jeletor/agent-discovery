'use strict';

const { publishService, removeService } = require('./publish');
const { findServices, getService } = require('./query');
const { enrichWithTrust, fetchAttestations, calculateTrustScore } = require('./trust');
const { parseServiceEvent, buildServiceTags } = require('./parse');
const { SERVICE_KIND, DEFAULT_RELAYS, DEFAULT_TIMEOUT_MS } = require('./constants');

/**
 * Create a directory instance with preconfigured relays and timeout.
 * 
 * @example
 * const { createDirectory } = require('agent-discovery');
 * const dir = createDirectory();
 * 
 * // Find translation agents
 * const agents = await dir.find({ capabilities: ['translation'] });
 * 
 * // Publish your service
 * await dir.publish({
 *   id: 'text-gen',
 *   capabilities: ['text-generation', 'translation'],
 *   price: { amount: 21, currency: 'sats', per: 'request' },
 *   lnAddress: 'me@getalby.com',
 *   description: 'Text generation powered by Claude.'
 * }, secretKeyHex);
 */
function createDirectory(opts = {}) {
  const relays = opts.relays || DEFAULT_RELAYS;
  const timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;

  return {
    /**
     * Find services matching criteria.
     * @param {object} queryOpts - See findServices() for options
     */
    find: (queryOpts = {}) => findServices({
      relays,
      timeoutMs,
      ...queryOpts
    }),

    /**
     * Get a specific service by pubkey and id.
     */
    get: (pubkey, serviceId, getOpts = {}) => getService(pubkey, serviceId, {
      relays,
      timeoutMs,
      ...getOpts
    }),

    /**
     * Publish a service announcement.
     * @param {object} serviceOpts - Service definition
     * @param {string|Uint8Array} secretKey - Nostr secret key
     */
    publish: (serviceOpts, secretKey) => publishService(
      serviceOpts,
      secretKey,
      relays,
      timeoutMs
    ),

    /**
     * Remove a service (publishes inactive replacement).
     * @param {string} serviceId - The d-tag of the service to remove
     * @param {string|Uint8Array} secretKey - Nostr secret key
     */
    remove: (serviceId, secretKey) => removeService(
      serviceId,
      secretKey,
      relays,
      timeoutMs
    ),

    /** Configured relays */
    relays,
    /** Event kind used for service announcements */
    kind: SERVICE_KIND
  };
}

module.exports = {
  // High-level API
  createDirectory,

  // Direct functions
  publishService,
  removeService,
  findServices,
  getService,

  // Trust
  enrichWithTrust,
  fetchAttestations,
  calculateTrustScore,

  // Parsing
  parseServiceEvent,
  buildServiceTags,

  // Constants
  SERVICE_KIND,
  DEFAULT_RELAYS
};
