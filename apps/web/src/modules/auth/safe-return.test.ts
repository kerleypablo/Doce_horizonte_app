import test from 'node:test';
import assert from 'node:assert/strict';
import { safeMcpReviewPath } from './safe-return.ts';
test('retorno de revisao aceita somente caminho interno com UUID', () => {
  const path = '/app/mcp/revisar/123e4567-e89b-12d3-a456-426614174000';
  assert.equal(safeMcpReviewPath(path), path);
  for (const bad of ['https://evil.example', '//evil.example', path + '?next=https://evil.example', '/app/mcp/revisar/' + '-'.repeat(36), null]) assert.equal(safeMcpReviewPath(bad), null);
});
