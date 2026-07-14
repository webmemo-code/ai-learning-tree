// serialize.mjs — shared helpers for build + test: stable JSON and a tiny YAML
// parser. Kept separate so the determinism test can import them without running
// build.mjs's CLI side-effects.

// Stable stringify: object keys sorted recursively -> byte-identical output
// regardless of insertion order. Arrays keep their order (geometry order matters).
export function stableStringify(value, indent = 2) {
  const pad = (d) => ' '.repeat(indent * d);
  function walk(val, depth) {
    if (val === null || typeof val !== 'object') return JSON.stringify(val);
    if (Array.isArray(val)) {
      if (val.length === 0) return '[]';
      const items = val.map((x) => pad(depth + 1) + walk(x, depth + 1));
      return '[\n' + items.join(',\n') + '\n' + pad(depth) + ']';
    }
    const keys = Object.keys(val).sort();
    if (keys.length === 0) return '{}';
    const items = keys.map((k) => pad(depth + 1) + JSON.stringify(k) + ': ' + walk(val[k], depth + 1));
    return '{\n' + items.join(',\n') + '\n' + pad(depth) + '}';
  }
  return walk(value, 0);
}

// Tiny YAML parser: flat keys + one level of nesting, scalars/lists-as-inline.
// Handles exactly what tree.config.yml needs (docs/03 §3): owner, seed,
// taxonomy, and one-level maps like `repos:` / `tag-map:`. Not general YAML.
export function parseYaml(text) {
  const root = {};
  const stack = [{ indent: -1, obj: root }];
  for (const raw of text.split('\n')) {
    const noComment = raw.replace(/\s+#.*$/, '');
    if (!noComment.trim()) continue;
    const indent = noComment.length - noComment.trimStart().length;
    const line = noComment.trim();
    if (line === '---' || line.startsWith('- ')) continue; // skip doc markers / top-level lists (unused here)
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const parent = stack[stack.length - 1].obj;
    const m = line.match(/^([^:]+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1].trim().replace(/^["']|["']$/g, '');
    const val = m[2].trim();
    if (val === '') {
      const child = {};
      parent[key] = child;
      stack.push({ indent, obj: child });
    } else {
      parent[key] = coerce(val);
    }
  }
  return root;
}
function coerce(v) {
  v = v.replace(/^["']|["']$/g, '');
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v !== '' && !isNaN(Number(v))) return Number(v);
  return v;
}
