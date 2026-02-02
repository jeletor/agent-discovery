#!/usr/bin/env node
'use strict';

const { parseServiceEvent, buildServiceTags, calculateTrustScore, SERVICE_KIND } = require('./lib');

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${msg}`);
  } else {
    failed++;
    console.log(`  ❌ ${msg}`);
  }
}

// ─── parseServiceEvent ───

console.log('\n📦 parseServiceEvent');

const mockEvent = {
  kind: SERVICE_KIND,
  id: 'abc123',
  pubkey: 'pk_test',
  created_at: 1706832000,
  content: 'A test service for translation.',
  tags: [
    ['d', 'translation-service'],
    ['name', 'Test Translator'],
    ['c', 'translation'],
    ['c', 'summarization'],
    ['price', '21', 'sats', 'request'],
    ['ln', 'test@getalby.com'],
    ['status', 'active'],
    ['k', '5100'],
    ['t', 'ai'],
    ['t', 'agent'],
    ['t', 'service']
  ],
  sig: 'sig_test'
};

const svc = parseServiceEvent(mockEvent);

assert(svc.pubkey === 'pk_test', 'pubkey extracted');
assert(svc.eventId === 'abc123', 'eventId extracted');
assert(svc.createdAt === 1706832000, 'createdAt extracted');
assert(svc.id === 'translation-service', 'd-tag → id');
assert(svc.name === 'Test Translator', 'name extracted');
assert(svc.capabilities.length === 2, 'two capabilities');
assert(svc.capabilities[0] === 'translation', 'first capability');
assert(svc.capabilities[1] === 'summarization', 'second capability');
assert(svc.price.amount === 21, 'price amount');
assert(svc.price.currency === 'sats', 'price currency');
assert(svc.price.per === 'request', 'price per');
assert(svc.lnAddress === 'test@getalby.com', 'Lightning address');
assert(svc.status === 'active', 'status');
assert(svc.dvmKinds[0] === '5100', 'DVM kind');
assert(svc.hashtags.includes('ai'), 'hashtag ai');
assert(svc.description === 'A test service for translation.', 'description from content');

// Minimal event
const minEvent = {
  kind: SERVICE_KIND,
  id: 'min1',
  pubkey: 'pk_min',
  created_at: 1706832000,
  content: '',
  tags: [['d', 'bare']],
  sig: 'sig_min'
};

const minSvc = parseServiceEvent(minEvent);
assert(minSvc.id === 'bare', 'minimal: id extracted');
assert(minSvc.capabilities.length === 0, 'minimal: no capabilities');
assert(minSvc.price === null, 'minimal: no price');
assert(minSvc.lnAddress === null, 'minimal: no lightning');
assert(minSvc.status === 'active', 'minimal: default status active');

// ─── buildServiceTags ───

console.log('\n🏗️  buildServiceTags');

const tags = buildServiceTags({
  id: 'text-gen',
  name: 'Text Agent',
  capabilities: ['text-generation', 'translation'],
  price: { amount: 50, currency: 'sats', per: 'request' },
  lnAddress: 'agent@domain.com',
  status: 'active',
  dvmKinds: ['5050'],
  hashtags: ['multilingual']
});

const tagMap = {};
for (const t of tags) {
  if (!tagMap[t[0]]) tagMap[t[0]] = [];
  tagMap[t[0]].push(t);
}

assert(tagMap['d'][0][1] === 'text-gen', 'd-tag set');
assert(tagMap['name'][0][1] === 'Text Agent', 'name tag set');
assert(tagMap['c'].length === 2, 'two capability tags');
assert(tagMap['c'][0][1] === 'text-generation', 'first capability tag');
assert(tagMap['price'][0][1] === '50', 'price amount as string');
assert(tagMap['price'][0][2] === 'sats', 'price currency');
assert(tagMap['ln'][0][1] === 'agent@domain.com', 'ln tag');
assert(tagMap['status'][0][1] === 'active', 'status tag');
assert(tagMap['k'][0][1] === '5050', 'DVM kind tag');
assert(tagMap['t'].some(t => t[1] === 'multilingual'), 'custom hashtag');
assert(tagMap['t'].some(t => t[1] === 'agent'), 'auto agent tag');
assert(tagMap['t'].some(t => t[1] === 'service'), 'auto service tag');

// Without optional fields
const minTags = buildServiceTags({ id: 'bare' });
const minTagMap = {};
for (const t of minTags) {
  if (!minTagMap[t[0]]) minTagMap[t[0]] = [];
  minTagMap[t[0]].push(t);
}
assert(minTagMap['d'][0][1] === 'bare', 'minimal: d-tag');
assert(minTagMap['status'][0][1] === 'active', 'minimal: default status');
assert(!minTagMap['price'], 'minimal: no price tag');
assert(!minTagMap['ln'], 'minimal: no ln tag');

// ─── calculateTrustScore ───

console.log('\n🛡️  calculateTrustScore');

const targetPk = 'target_pk_123';

const attestations = [
  {
    kind: 1985,
    pubkey: 'attester_1',
    tags: [
      ['L', 'ai.wot'],
      ['l', 'service-quality', 'ai.wot'],
      ['p', targetPk]
    ],
    created_at: 1706832000
  },
  {
    kind: 1985,
    pubkey: 'attester_2',
    tags: [
      ['L', 'ai.wot'],
      ['l', 'general-trust', 'ai.wot'],
      ['p', targetPk]
    ],
    created_at: 1706832000
  },
  {
    kind: 1985,
    pubkey: 'attester_3',
    tags: [
      ['L', 'ai.wot'],
      ['l', 'work-completed', 'ai.wot'],
      ['p', targetPk]
    ],
    created_at: 1706832000
  },
  // Self-attestation (should be excluded)
  {
    kind: 1985,
    pubkey: targetPk,
    tags: [
      ['L', 'ai.wot'],
      ['l', 'service-quality', 'ai.wot'],
      ['p', targetPk]
    ],
    created_at: 1706832000
  },
  // Duplicate attester (should keep highest weight)
  {
    kind: 1985,
    pubkey: 'attester_1',
    tags: [
      ['L', 'ai.wot'],
      ['l', 'general-trust', 'ai.wot'],
      ['p', targetPk]
    ],
    created_at: 1706831000
  }
];

const trust = calculateTrustScore(attestations, targetPk);

assert(trust.attesters === 3, 'three unique attesters (self excluded)');
// attester_1: service-quality (1.5) > general-trust (0.8) → 15 points
// attester_2: general-trust (0.8) → 8 points
// attester_3: work-completed (1.2) → 12 points
// Total: 35
assert(trust.score === 35, `score is 35 (got ${trust.score})`);
assert(trust.details.length === 3, 'three details entries');

// No attestations
const empty = calculateTrustScore([], 'nobody');
assert(empty.score === 0, 'no attestations → score 0');
assert(empty.attesters === 0, 'no attestations → 0 attesters');

// Only self-attestation
const selfOnly = calculateTrustScore([{
  kind: 1985,
  pubkey: 'me',
  tags: [['L', 'ai.wot'], ['l', 'service-quality', 'ai.wot'], ['p', 'me']],
  created_at: 1706832000
}], 'me');
assert(selfOnly.score === 0, 'self-only → score 0');

// ─── Round-trip: build → parse ───

console.log('\n🔄 Round-trip: buildServiceTags → parseServiceEvent');

const original = {
  id: 'roundtrip-test',
  name: 'Roundtrip Agent',
  capabilities: ['research', 'data-analysis'],
  price: { amount: 100, currency: 'sats', per: 'query' },
  lnAddress: 'rt@test.com',
  status: 'active',
  dvmKinds: ['5050', '5300'],
  hashtags: ['research']
};

const rtTags = buildServiceTags(original);
const rtEvent = {
  kind: SERVICE_KIND,
  id: 'event_rt',
  pubkey: 'pk_rt',
  created_at: 1706900000,
  content: 'Research and data analysis service.',
  tags: rtTags,
  sig: 'sig_rt'
};

const parsed = parseServiceEvent(rtEvent);
assert(parsed.id === 'roundtrip-test', 'rt: id preserved');
assert(parsed.name === 'Roundtrip Agent', 'rt: name preserved');
assert(parsed.capabilities.length === 2, 'rt: capabilities preserved');
assert(parsed.capabilities[0] === 'research', 'rt: first capability');
assert(parsed.price.amount === 100, 'rt: price amount');
assert(parsed.price.per === 'query', 'rt: price per');
assert(parsed.lnAddress === 'rt@test.com', 'rt: lightning address');
assert(parsed.dvmKinds.length === 2, 'rt: DVM kinds preserved');
assert(parsed.hashtags.includes('research'), 'rt: custom hashtag');
assert(parsed.hashtags.includes('agent'), 'rt: auto agent tag');

// ─── Constants ───

console.log('\n📐 Constants');

assert(SERVICE_KIND === 38990, 'SERVICE_KIND is 38990');

// ─── Summary ───

console.log(`\n${'─'.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log('All tests passed! ✅\n');
}
