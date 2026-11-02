import assert from 'assert';
import { parseFenceOpener, findFenceClose, colonFenceRule } from './markdown-it-fence.js';
import markdownItForm from './markdown-it-form.js';
import markdownItContainers from './markdown-it-containers.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed += 1;
  } catch (e) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${e.message}`);
    failed += 1;
  }
}

const eq = (a, b) => assert.deepStrictEqual(a, b);
const has = (html, substr) => assert(html.includes(substr), `expected to find: ${substr}`);
const hasNot = (html, s) => assert(!html.includes(s), `expected NOT to find: ${s}`);
const count = (html, s) => html.split(s).length - 1;

// ---------------------------------------------------------------------------
// Minimal stand-in for markdown-it's block state and render loop: just enough
// of StateBlock (src, bMarks, eMarks, tShift, getLines, push, line) for the
// colon-fence rules. Lines no rule claims become <p> text.
// ---------------------------------------------------------------------------

function makeState(src) {
  const lines = src.split('\n');
  const state = {
    src, bMarks: [], eMarks: [], tShift: [], tokens: [], line: 0,
    getLines(begin, end, indent) {
      return lines.slice(begin, end)
        .map((l) => l.slice(Math.min(indent, l.length - l.trimStart().length)))
        .join('\n');
    },
    push(type) {
      const token = { type, content: '' };
      state.tokens.push(token);
      return token;
    },
  };
  let pos = 0;
  for (const l of lines) {
    state.bMarks.push(pos);
    state.tShift.push(l.length - l.trimStart().length);
    state.eMarks.push(pos + l.length);
    pos += l.length + 1;
  }
  return { state, lineCount: lines.length };
}

function makeMd() {
  const rules = [];
  const md = {
    block: { ruler: { before: (_anchor, _name, fn) => rules.push(fn) } },
    render(src) {
      const { state, lineCount } = makeState(src);
      let out = '';
      while (state.line < lineCount) {
        const start = state.line;
        const before = state.tokens.length;
        if (rules.some((rule) => rule(state, start, lineCount, false))) {
          out += state.tokens.slice(before).map((t) => t.content).join('');
        } else {
          const text = state.getLines(start, start + 1, 0);
          if (text.trim()) out += `<p>${text}</p>\n`;
          state.line = start + 1;
        }
      }
      return out;
    },
  };
  markdownItForm(md);
  markdownItContainers(md);
  return md;
}

// ---------------------------------------------------------------------------
console.log('\nparseFenceOpener');

test('form opener with 3 colons', () => {
  eq(parseFenceOpener(':::form'), { colons: 3, type: 'form', args: '' });
});

test('card opener with 4 colons and a title', () => {
  eq(parseFenceOpener('::::card "$410_header_1"'), { colons: 4, type: 'card', args: '"$410_header_1"' });
});

test('space between colons and type is allowed', () => {
  eq(parseFenceOpener('::: tabs "Group" .x').type, 'tabs');
});

test('bare closer is not an opener', () => {
  eq(parseFenceOpener(':::'), null);
});

test('two colons is not a fence', () => {
  eq(parseFenceOpener('::form'), null);
});

// ---------------------------------------------------------------------------
console.log('\nfindFenceClose');

const nested = [
  '::::card "A"',   // 0
  ':::form',        // 1
  '| 1fr |',        // 2
  '| X [x] |',      // 3
  ':::',            // 4
  '::::',           // 5
];
const at = (n) => nested[n];

test('outer 4-colon fence skips the inner 3-colon closer', () => {
  eq(findFenceClose(at, 0, nested.length, 4), 5);
});

test('inner 3-colon fence closes on its own closer', () => {
  eq(findFenceClose(at, 1, nested.length, 3), 4);
});

test('unclosed fence returns -1', () => {
  eq(findFenceClose(at, 1, 4, 3), -1);
});

test('closer with trailing spaces still closes', () => {
  eq(findFenceClose((n) => [':::form', '| a |', ':::   '][n], 0, 3, 3), 2);
});

// ---------------------------------------------------------------------------
console.log('\ncolonFenceRule');

test('ignores fence types it does not handle', () => {
  const { state } = makeState(':::card\nx\n:::');
  eq(colonFenceRule(['form'], () => '')(state, 0, 3, false), false);
});

test('silent mode reports a match without consuming lines', () => {
  const { state } = makeState(':::form\n| 1fr |\n:::');
  eq(colonFenceRule(['form'], () => '')(state, 0, 3, true), true);
  eq(state.tokens.length, 0);
  eq(state.line, 0);
});

test('passes the raw body and advances past the closer', () => {
  const { state } = makeState(':::form\n| 1fr |\n| A [a] |\n:::\nafter');
  let seen = null;
  colonFenceRule(['form'], (opener, body) => { seen = body; return 'HTML'; })(state, 0, 5, false);
  eq(seen, '| 1fr |\n| A [a] |');
  eq(state.line, 4);
  eq(state.tokens[0].content, 'HTML');
});

test('unclosed fence is left alone', () => {
  const { state } = makeState(':::form\n| 1fr |');
  eq(colonFenceRule(['form'], () => 'HTML')(state, 0, 2, false), false);
});

// ---------------------------------------------------------------------------
console.log('\nnesting through both plugins');

test('form inside a 4-colon card renders inside the card body', () => {
  const md = makeMd();
  const html = md.render([
    '::::card "Pick data"',
    ':::form',
    '| 1fr | 1fr |',
    '| Location [loc] | Article [art] |',
    ':::',
    '::::',
    'after',
  ].join('\n'));
  has(html, 'card__body');
  has(html, 'form-grid');
  has(html, 'name="loc"');
  assert(html.indexOf('form-grid') > html.indexOf('card__body'), 'form should be inside the card body');
  assert(html.indexOf('<p>after</p>') > html.lastIndexOf('</div>'), 'text after the card stays outside it');
  hasNot(html, ':::');
});

test('two cards in a row each get their own form', () => {
  const md = makeMd();
  const html = md.render([
    '::::card "One"',
    ':::form',
    '| 1fr |',
    '| A [a] |',
    ':::',
    '::::',
    '::::card "Two"',
    ':::form',
    '| 1fr |',
    '| B [b] |',
    ':::',
    '::::',
  ].join('\n'));
  eq(count(html, 'card__body'), 2);
  eq(count(html, 'form-grid"'), 2);
  has(html, 'name="a"');
  has(html, 'name="b"');
});

test('same-length nesting is not supported: inner closer ends the outer card', () => {
  const md = makeMd();
  const html = md.render([
    ':::card "Flat"',
    ':::form',
    '| 1fr |',
    '| A [a] |',
    ':::',
    ':::',
  ].join('\n'));
  hasNot(html, 'form-grid');
});

test('form without blank lines around it', () => {
  const md = makeMd();
  const html = md.render('before\n:::form\n| 1fr |\n| A [a] |\n:::\nafter');
  has(html, '<p>before</p>');
  has(html, 'name="a"');
  has(html, '<p>after</p>');
});

// ---------------------------------------------------------------------------
console.log(`\n${'─'.repeat(40)}`);
console.log(`  ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
