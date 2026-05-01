// Local end-to-end test against a fixture. Skips Shopify, hits Claude.
//
// Usage:
//   ANTHROPIC_API_KEY=sk-ant-... node tests/run-fixture.js
//
// Optional: ANTHROPIC_MODEL=claude-opus-4-7 to compare model quality.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  filterDispute,
  filterOrder,
  filterCustomer,
  filterFulfilments,
  filterTransactions,
} from '../lib/filter.js';
import { generateDisputeResponse } from '../lib/claude.js';
import { parseAndValidate } from '../lib/validate.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(here, 'fixtures', 'sample_dispute.json');
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));

const filtered = {
  dispute: filterDispute(fixture.dispute),
  order: filterOrder(fixture.order),
  customer: filterCustomer(fixture.customer),
  fulfilments: filterFulfilments(fixture.fulfilments),
  transactions: filterTransactions(fixture.transactions),
};

console.log('--- filtered context ---');
console.log(JSON.stringify(filtered, null, 2));

const result = await generateDisputeResponse(filtered);
console.log('\n--- claude usage ---');
console.log(result.usage, 'model:', result.model);

const evidence = parseAndValidate(result.raw);
console.log('\n--- validated evidence ---');
console.log(JSON.stringify(evidence, null, 2));
