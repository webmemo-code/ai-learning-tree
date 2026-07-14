// test-ceremony.mjs — the planting ceremony's CI check, checked (ADR-0006 §2).
// Run: node grove/test-ceremony.mjs
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { validateCeremony, parseGroveYml } from './template/tools/validate-ceremony.mjs';

let passed = 0, failed = 0;
function ok(cond, label, extra = '') {
  if (cond) passed++;
  else { failed++; console.error(`✗ ${label}${extra ? '  [' + extra + ']' : ''}`); }
}
const valid = (r) => r.ok;
const failsWith = (r, re) => !r.ok && r.errors.some(e => re.test(e));

const P1 = '{"kind":"planted","tree":"alice/tree","url":"https://raw.githubusercontent.com/alice/tree/main/data/tree.json","clearing":"commons","ts":"2026-08-01T00:00:00Z"}';
const P2 = '{"kind":"planted","tree":"bob/tree","url":"https://bob.github.io/tree/tree.json","clearing":"commons","ts":"2026-08-02T00:00:00Z"}';

// ---------- the happy ceremony ----------
ok(valid(validateCeremony({ baseText: '', headText: P1 + '\n', actor: 'alice' })), 'first planting into an empty grove is valid');
ok(valid(validateCeremony({ baseText: P1 + '\n', headText: P1 + '\n' + P2 + '\n', actor: 'bob' })), 'appending one line is valid');
ok(valid(validateCeremony({ baseText: P1 + '\n', headText: P1 + '\n' + P2 + '\n', actor: 'BOB' })), 'actor match is case-insensitive');
ok(valid(validateCeremony({
  baseText: P1 + '\n',
  headText: P1 + '\n{"kind":"clearing","id":"acme-guild","label":"ACME"}\n',
  actor: 'keeper',
})), 'a keeper declaring a clearing is valid');

// ---------- append-only ----------
ok(failsWith(validateCeremony({ baseText: P1 + '\n' + P2 + '\n', headText: P2 + '\n' + P1 + '\n' }), /append-only/), 'reordering history is rejected');
ok(failsWith(validateCeremony({ baseText: P1 + '\n', headText: P1.replace('alice', 'mallory') + '\n' }), /append-only/), 'editing an existing line is rejected');
ok(failsWith(validateCeremony({ baseText: P1 + '\n' + P2 + '\n', headText: P1 + '\n' }), /append-only/), 'deleting history is rejected');

// ---------- well-formedness of new lines ----------
const with1 = (line, actor = 'alice') => validateCeremony({ baseText: '', headText: line + '\n', actor });
ok(failsWith(with1('{"kind":"planted","tree":"not a repo id","url":"https://raw.githubusercontent.com/x/y/tree.json","ts":"2026-08-01T00:00:00Z"}'), /owner\/repo/), 'malformed tree id is rejected');
ok(failsWith(with1('{"kind":"planted","tree":"alice/tree","ts":"2026-08-01T00:00:00Z"}'), /needs the published/), 'missing url is rejected');
ok(failsWith(with1('{"kind":"planted","tree":"alice/tree","url":"https://raw.githubusercontent.com/mallory/tree/main/tree.json","ts":"2026-08-01T00:00:00Z"}'), /own GitHub owner/), 'url under someone else\'s account is rejected');
ok(failsWith(with1('{"kind":"planted","tree":"alice/tree","url":"http://raw.githubusercontent.com/alice/tree/main/tree.json","ts":"2026-08-01T00:00:00Z"}'), /own GitHub owner/), 'plain-http url is rejected');
ok(failsWith(with1('{"kind":"planted","tree":"alice/tree","url":"https://evil.example/alice/tree.json","ts":"2026-08-01T00:00:00Z"}'), /own GitHub owner/), 'foreign-host url is rejected');
ok(failsWith(with1('{"kind":"planted","tree":"alice/tree","url":"https://raw.githubusercontent.com/alice/tree/main/tree.json"}'), /ISO timestamp/), 'missing ts is rejected');
ok(failsWith(with1('{"kind":"clearing","id":"Not A Slug"}'), /lowercase slugs/), 'non-slug clearing id is rejected');
ok(failsWith(with1('nonsense'), /invalid JSON/), 'garbage lines are rejected');

// ---------- authorship ----------
ok(failsWith(validateCeremony({ baseText: P1 + '\n', headText: P1 + '\n' + P2 + '\n', actor: 'mallory' }), /does not own this tree/), 'planting someone else\'s tree is flagged for the keeper');
ok(failsWith(validateCeremony({
  baseText: P1 + '\n',
  headText: P1 + '\n{"kind":"felled","tree":"alice/tree","ts":"2026-09-01T00:00:00Z"}\n',
  actor: 'mallory',
}), /does not own this tree/), 'felling someone else\'s tree is flagged for the keeper');

// ---------- the whole log must still place ----------
ok(failsWith(validateCeremony({ baseText: P1 + '\n', headText: P1 + '\n' + P1 + '\n', actor: 'alice' }), /already planted/), 'duplicate planting is rejected via placeGrove');
ok(failsWith(validateCeremony({
  baseText: '',
  headText: '{"kind":"planted","tree":"alice/tree","url":"https://raw.githubusercontent.com/alice/tree/main/tree.json","clearing":"ghost","ts":"2026-08-01T00:00:00Z"}\n',
  actor: 'alice',
}), /unknown clearing/), 'planting into an undeclared clearing is rejected');
ok(failsWith(validateCeremony({
  baseText: P1 + '\n',
  headText: P1 + '\n' + P2 + '\n',
  actor: 'bob',
  config: { clearingCapacity: 1 },
}), /full/), 'grove.yml capacity is enforced');

// ---------- grove.yml parsing ----------
{
  const cfg = parseGroveYml(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'template/grove.yml'), 'utf8'));
  ok(cfg.plotPitch === 32 && cfg.clearingCapacity === 256 && cfg.placeVersion === '1.0.0', 'template grove.yml parses to the documented defaults', JSON.stringify(cfg));
}

// ---------- drift guard: the vendored copies must stay byte-identical ----------
{
  const here = dirname(fileURLToPath(import.meta.url));
  for (const [canonical, vendored] of [
    ['place.mjs', 'template/tools/place.mjs'],
    ['walk-app.mjs', 'template/walk/walk-app.mjs'],
  ]) {
    ok(readFileSync(join(here, canonical), 'utf8') === readFileSync(join(here, vendored), 'utf8'),
      `${vendored} is byte-identical to grove/${canonical} (update both together)`);
  }
}

console.log(failed ? `\n✗ ${failed} failed, ${passed} passed` : `\n✓ all green — ${passed} passed, 0 failed`);
process.exit(failed ? 1 : 0);
