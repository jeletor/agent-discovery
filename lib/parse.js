'use strict';

const { SERVICE_KIND } = require('./constants');

/**
 * Parse a raw Nostr event (kind 38990) into a structured service object.
 */
function parseServiceEvent(event) {
  const service = {
    pubkey: event.pubkey,
    eventId: event.id,
    createdAt: event.created_at,
    id: null,
    name: null,
    capabilities: [],
    price: null,
    lnAddress: null,
    status: 'active',
    description: event.content || '',
    hashtags: [],
    dvmKinds: [],
    raw: event
  };

  for (const tag of event.tags) {
    switch (tag[0]) {
      case 'd':
        service.id = tag[1];
        break;
      case 'c':
        service.capabilities.push(tag[1]);
        break;
      case 'price':
        service.price = {
          amount: parseInt(tag[1], 10),
          currency: tag[2] || 'sats',
          per: tag[3] || 'request'
        };
        break;
      case 'ln':
        service.lnAddress = tag[1];
        break;
      case 'status':
        service.status = tag[1];
        break;
      case 'name':
        service.name = tag[1];
        break;
      case 't':
        service.hashtags.push(tag[1]);
        break;
      case 'k':
        service.dvmKinds.push(tag[1]);
        break;
    }
  }

  return service;
}

/**
 * Build Nostr event tags from service options.
 */
function buildServiceTags(opts) {
  const tags = [];

  // d-tag (required — makes it parameterized replaceable)
  tags.push(['d', opts.id]);

  // Display name
  if (opts.name) {
    tags.push(['name', opts.name]);
  }

  // Capabilities
  if (opts.capabilities) {
    for (const cap of opts.capabilities) {
      tags.push(['c', cap]);
    }
  }

  // Pricing
  if (opts.price) {
    const priceTag = ['price', String(opts.price.amount)];
    if (opts.price.currency) priceTag.push(opts.price.currency);
    if (opts.price.per) priceTag.push(opts.price.per);
    tags.push(priceTag);
  }

  // Lightning address
  if (opts.lnAddress) {
    tags.push(['ln', opts.lnAddress]);
  }

  // Status
  tags.push(['status', opts.status || 'active']);

  // DVM kind interop
  if (opts.dvmKinds) {
    for (const k of opts.dvmKinds) {
      tags.push(['k', String(k)]);
    }
  }

  // Hashtags
  if (opts.hashtags) {
    for (const tag of opts.hashtags) {
      tags.push(['t', tag]);
    }
  }

  // Always tag for discoverability
  tags.push(['t', 'agent']);
  tags.push(['t', 'service']);

  return tags;
}

module.exports = { parseServiceEvent, buildServiceTags };
