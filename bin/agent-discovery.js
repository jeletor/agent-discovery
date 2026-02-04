#!/usr/bin/env node
'use strict';

const { createDirectory } = require('../lib');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const command = args[0];

function parseFlags(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true;
      if (val !== true) i++;
      // Comma-separated → array
      if (typeof val === 'string' && val.includes(',')) {
        flags[key] = val.split(',');
      } else {
        flags[key] = val;
      }
    }
  }
  return flags;
}

function loadSecretKey() {
  if (process.env.NOSTR_SECRET_KEY) return process.env.NOSTR_SECRET_KEY;

  const keyPaths = [
    process.env.NOSTR_KEYS_FILE,
    path.join(process.cwd(), 'nostr-keys.json'),
    path.join(process.env.HOME || '', '.nostr-keys.json')
  ].filter(Boolean);

  for (const p of keyPaths) {
    try {
      const data = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (data.secretKeyHex) return data.secretKeyHex;
      if (data.privateKey) return data.privateKey;
    } catch (e) { /* skip */ }
  }

  return null;
}

function asArray(val) {
  if (!val) return undefined;
  if (Array.isArray(val)) return val;
  return [val];
}

async function main() {
  const flags = parseFlags(args.slice(1));
  const dir = createDirectory({
    relays: asArray(flags.relays),
    timeoutMs: flags.timeout ? parseInt(flags.timeout) : undefined
  });

  switch (command) {
    case 'publish': {
      if (flags.key) {
        console.warn('Warning: passing --key via CLI exposes your secret in the process list. Consider using NOSTR_SECRET_KEY env var or --key-file instead.');
      }
      const sk = flags.key || loadSecretKey();
      if (!sk) {
        console.error('Error: No secret key. Set NOSTR_SECRET_KEY env or use --key <hex>');
        process.exit(1);
      }
      if (!flags.id) {
        console.error('Error: --id <service-id> is required');
        process.exit(1);
      }

      const result = await dir.publish({
        id: flags.id,
        name: flags.name,
        capabilities: asArray(flags.capabilities) || [],
        price: flags.price ? {
          amount: parseInt(flags.price),
          currency: 'sats',
          per: flags.per || 'request'
        } : undefined,
        lnAddress: flags.ln,
        description: flags.desc || '',
        status: flags.status || 'active',
        hashtags: asArray(flags.tags) || [],
        dvmKinds: asArray(flags.dvm) || []
      }, sk);

      console.log(`✅ Published service "${flags.id}"`);
      console.log(`   Event: ${result.eventId}`);
      console.log(`   Pubkey: ${result.pubkey}`);
      console.log(`   Relays: ${result.successes}/${result.total} succeeded`);
      if (result.failures.length > 0) {
        console.log(`   Failures: ${result.failures.join(', ')}`);
      }
      break;
    }

    case 'find': {
      // Allow positional: agent-discovery find translation,text-generation
      const positional = args[1] && !args[1].startsWith('--') ? args[1].split(',') : undefined;
      const capabilities = positional || asArray(flags.capabilities);

      const services = await dir.find({
        capabilities,
        maxPrice: flags.maxprice ? parseInt(flags.maxprice) : undefined,
        minTrust: flags.mintrust ? parseInt(flags.mintrust) : undefined,
        status: flags.status,
        includeTrust: flags.trust === true || flags.mintrust !== undefined,
        limit: flags.limit ? parseInt(flags.limit) : undefined,
        hashtags: asArray(flags.tags)
      });

      if (services.length === 0) {
        console.log('No services found.');
        return;
      }

      console.log(`Found ${services.length} service(s):\n`);
      for (const svc of services) {
        const header = svc.name || svc.id || 'unnamed';
        console.log(`  ${header}`);
        console.log(`  ├─ pubkey: ${svc.pubkey.slice(0, 16)}...`);
        console.log(`  ├─ capabilities: ${svc.capabilities.join(', ') || 'none listed'}`);
        if (svc.price) {
          console.log(`  ├─ price: ${svc.price.amount} ${svc.price.currency}/${svc.price.per}`);
        }
        if (svc.lnAddress) {
          console.log(`  ├─ lightning: ${svc.lnAddress}`);
        }
        if (svc.trust) {
          console.log(`  ├─ trust: score ${svc.trustScore} (${svc.trust.attesters} attester(s))`);
        }
        console.log(`  ├─ status: ${svc.status}`);
        if (svc.description) {
          console.log(`  └─ ${svc.description.slice(0, 120)}`);
        } else {
          console.log(`  └─ (no description)`);
        }
        console.log('');
      }
      break;
    }

    case 'get': {
      const pubkey = args[1];
      const serviceId = args[2] || flags.id;
      if (!pubkey || !serviceId) {
        console.error('Usage: agent-discovery get <pubkey> <service-id>');
        process.exit(1);
      }

      const svc = await dir.get(pubkey, serviceId, {
        includeTrust: flags.trust !== false
      });

      if (!svc) {
        console.log('Service not found.');
        return;
      }

      // Print without the raw event
      console.log(JSON.stringify(svc, (key, val) => key === 'raw' ? undefined : val, 2));
      break;
    }

    case 'remove': {
      if (flags.key) {
        console.warn('Warning: passing --key via CLI exposes your secret in the process list. Consider using NOSTR_SECRET_KEY env var or --key-file instead.');
      }
      const sk = flags.key || loadSecretKey();
      if (!sk) {
        console.error('Error: No secret key. Set NOSTR_SECRET_KEY env or use --key <hex>');
        process.exit(1);
      }
      const serviceId = args[1] || flags.id;
      if (!serviceId) {
        console.error('Usage: agent-discovery remove <service-id>');
        process.exit(1);
      }

      const result = await dir.remove(serviceId, sk);
      console.log(`✅ Removed service "${serviceId}"`);
      console.log(`   Event: ${result.eventId}`);
      console.log(`   Relays: ${result.successes}/${result.total} succeeded`);
      break;
    }

    case 'help':
    default:
      console.log(`agent-discovery — Decentralized agent service discovery on Nostr

Usage: agent-discovery <command> [options]

Commands:
  publish    Publish a service announcement
  find       Search for agent services
  get        Get details of a specific service
  remove     Deactivate a service listing
  help       Show this help

Publish:
  agent-discovery publish --id <id> --capabilities <cap1,cap2> [options]

  --id <id>                Service identifier (required, becomes d-tag)
  --name <name>            Display name
  --capabilities <list>    Comma-separated capabilities
  --price <sats>           Price per request in sats
  --per <unit>             Price unit (request, month, query — default: request)
  --ln <address>           Lightning address for payments
  --desc <text>            Human-readable description
  --status <status>        active or inactive (default: active)
  --tags <list>            Comma-separated hashtags
  --dvm <kinds>            NIP-90 DVM kinds (for interop)
  --key <hex>              Nostr secret key (or set NOSTR_SECRET_KEY)

Find:
  agent-discovery find [capabilities] [options]

  --capabilities <list>    Filter by capabilities (or use positional arg)
  --maxprice <sats>        Maximum price in sats
  --mintrust <score>       Minimum ai.wot trust score
  --trust                  Include trust scores in results
  --status <status>        Filter by status (default: active)
  --limit <n>              Max results
  --tags <list>            Filter by hashtags

Get:
  agent-discovery get <pubkey> <service-id> [--trust]

Remove:
  agent-discovery remove <service-id> [--key <hex>]

Environment:
  NOSTR_SECRET_KEY    Nostr secret key (hex)
  NOSTR_KEYS_FILE     Path to JSON file with secretKeyHex field

Event Kind: 38990 (parameterized replaceable)
Protocol:   https://github.com/jeletor/agent-discovery
`);
      break;
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
