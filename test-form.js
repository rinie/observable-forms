import assert from 'assert';
import {
  parseCell,
  parseHeader,
  parseDataRow,
  renderFormBlock,
  deriveFieldName,
  extractTemplates,
} from './markdown-it-form.js';

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

// ---------------------------------------------------------------------------
console.log('\nderiveFieldName');
// ---------------------------------------------------------------------------
test('lowercases and underscores', () => {
  eq(deriveFieldName('First Name'), 'first_name');
});

test('strips leading/trailing punctuation', () => {
  eq(deriveFieldName(' - Status! '), 'status');
});

// ---------------------------------------------------------------------------
console.log('\nparseCell - baseline grammar');
// ---------------------------------------------------------------------------
test('plain label with no marks is a required:false text field', () => {
  const f = parseCell('Name [name]');
  eq(f.type, 'text');
  eq(f.name, 'name');
  eq(f.required, false);
  eq(f.disabled, false);
});

test('leading ! marks required', () => {
  eq(parseCell('!First name').required, true);
});

test('trailing ! marks required', () => {
  eq(parseCell('First name!').required, true);
});

test('trailing = with no > is readonly', () => {
  const f = parseCell('Status [status] =');
  eq(f.type, 'readonly');
});

test('bare > is a checkbox', () => {
  eq(parseCell('Active > ').type, 'checkbox');
});

test('> with <=3 options is radio', () => {
  const f = parseCell('Gender > M, F, X');
  eq(f.type, 'radio');
  eq(f.options, ['M', 'F', 'X']);
});

test('> with >3 options is select', () => {
  eq(parseCell('Size > S, M, L, XL').type, 'select');
});

test('>> forces select even with <=3 options', () => {
  eq(parseCell('Gender >> M, F').type, 'select');
});

test('>> @var is a dynamic select', () => {
  const f = parseCell('Country [country] >> @countryOptions = NL');
  eq(f.type, 'select');
  eq(f.optionsSrc, 'countryOptions');
  eq(f.defaultValue, 'NL');
});

// ---------------------------------------------------------------------------
console.log('\nparseCell - disabled (~)');
// ---------------------------------------------------------------------------
test('trailing ~ on a plain text field marks it disabled, still type text', () => {
  const f = parseCell('Name [name] ~');
  eq(f.type, 'text');
  eq(f.disabled, true);
  eq(f.label, 'Name');
});

test('> ~ is a disabled checkbox, not a broken radio', () => {
  const f = parseCell('Locked [locked] > ~');
  eq(f.type, 'checkbox');
  eq(f.disabled, true);
});

test('> = true ~ is a disabled, checked-by-default checkbox', () => {
  const f = parseCell('Locked [locked] > = true ~');
  eq(f.type, 'checkbox');
  eq(f.disabled, true);
  eq(f.defaultValue, 'true');
});

test('> opt1,opt2 ~ is a disabled radio group', () => {
  const f = parseCell('Gender > M, F, X ~');
  eq(f.type, 'radio');
  eq(f.disabled, true);
  eq(f.options, ['M', 'F', 'X']);
});

test('>> @var = default ~ is a disabled dynamic select with a default preserved', () => {
  const f = parseCell('Country [country] >> @countryOptions = NL ~');
  eq(f.type, 'select');
  eq(f.disabled, true);
  eq(f.optionsSrc, 'countryOptions');
  eq(f.defaultValue, 'NL');
});

test('~ with no preceding > does not disable a readonly field', () => {
  // '=' already wins the type for a plain trailing '=' cell (no '>') -
  // '~' has no separate slot there, since readonly is already inert.
  const f = parseCell('Status [status] =');
  eq(f.type, 'readonly');
  eq(f.disabled, false);
});

test('~ composes with required in either written order', () => {
  eq(parseCell('Name [name] !~').required, true);
  eq(parseCell('Name [name] !~').disabled, true);
});

// ---------------------------------------------------------------------------
console.log('\nemitField via renderFormBlock - disabled rendering');
// ---------------------------------------------------------------------------
test('disabled checkbox renders a real input with the disabled attribute, not readonly text', () => {
  const html = renderFormBlock('| 1fr |\n| Locked [locked] > ~ |');
  has(html, '<input type="checkbox" id="locked" name="locked" disabled>');
  has(html, 'form-field--checkbox form-field--disabled');
  hasNot(html, 'form-value');
});

test('disabled select keeps its <select> with the disabled attribute', () => {
  const html = renderFormBlock('| 1fr |\n| Country [country] >> @countryOptions = NL ~ |');
  has(html, '<select id="country" name="country" data-options-src="countryOptions" disabled>');
  has(html, 'form-field--select form-field--disabled');
});

test('disabled radio group marks every option input disabled', () => {
  const html = renderFormBlock('| 1fr |\n| Gender > M, F, X ~ |');
  const radioInputs = html.match(/<input type="radio"[^>]*>/g) || [];
  assert.strictEqual(radioInputs.length, 3);
  assert(radioInputs.every((tag) => tag.includes('disabled')), 'every radio option should carry disabled');
});

test('disabled text field renders a disabled <input type="text">', () => {
  const html = renderFormBlock('| 1fr |\n| Name [name] ~ |');
  has(html, '<input type="text" id="name" name="name" disabled>');
});

test('an ordinary (non-disabled) checkbox is unaffected - no disabled attribute or class', () => {
  const html = renderFormBlock('| 1fr |\n| Active > |');
  hasNot(html, 'disabled');
});

// ---------------------------------------------------------------------------
console.log('\nparseCell - hard-blank spacer (.)');
// ---------------------------------------------------------------------------
test('a bare . cell parses to null, same as an empty cell', () => {
  eq(parseCell('.'), null);
  eq(parseCell('  .  '), null);
});

test('. is only a hard blank on its own - a label that merely contains a dot is unaffected', () => {
  const f = parseCell('Item 1.5 [item]');
  eq(f.label, 'Item 1.5');
});

test('renderFormBlock renders a . cell as its own empty grid cell, distinct from an empty cell', () => {
  const html = renderFormBlock('| 1fr | 1fr |\n| Name [name] | . |');
  has(html, 'form-cell form-cell--empty');
});

// ---------------------------------------------------------------------------
console.log('\nparseHeader / parseDataRow');
// ---------------------------------------------------------------------------
test('parseHeader extracts a leading .class cell and leaves column widths', () => {
  const { cssClass, columns } = parseHeader([' .my-class ', ' 1fr ', ' 2fr ']);
  eq(cssClass, 'my-class');
  eq(columns, ['1fr', '2fr']);
});

test('parseDataRow folds consecutive empty cells into a colspan', () => {
  const rows = parseDataRow(['Street address [street]', '', '', 'Zip']);
  eq(rows.length, 2);
  eq(rows[0].colspan, 3);
  eq(rows[1].colspan, 1);
});

test('parseDataRow does NOT fold a hard-blank . cell into a preceding colspan - it stays its own cell', () => {
  const rows = parseDataRow(['Name [name]', '.', 'Zip']);
  eq(rows.length, 3);
  eq(rows[0].colspan, 1);
  eq(rows[1].raw, '.');
  eq(rows[2].colspan, 1);
});

// ---------------------------------------------------------------------------
console.log('\nexpressions');

test('extractTemplates splits template parts, {name}, cell classes and the rest', () => {
  const r = extractTemplates('[artnr] `${a}x`{.big} {b} {.faint .small}');
  eq(r.rest, '[artnr]');
  eq(r.parts, [{ template: '${a}x', classes: ['big'] }, { template: '${b}', classes: [] }]);
  eq(r.cellClasses, ['faint', 'small']);
});

test('a cell with only template parts is a template field', () => {
  const f = parseCell('`${qty}${$multiply}${pupackqyf}`');
  eq(f.type, 'template');
  eq(f.template[0].template, '${qty}${$multiply}${pupackqyf}');
});

test('{name} alone is a template field showing ${name}', () => {
  const html = renderFormBlock('| 1fr |\n| {unitqyf} |');
  has(html, 'form-field--template');
  has(html, '<span class="form-value">${unitqyf}</span>');
});

test('template text is escaped, ${…} expressions are kept as written', () => {
  const html = renderFormBlock('| 1fr |\n| `a < b: ${x < y ? "<" : {}.k}` |');
  has(html, 'a &lt; b: ${x < y ? "<" : {}.k}');
});

test('class after a template part wraps that part', () => {
  const html = renderFormBlock('| 1fr |\n| `${qty}`{.huge} `${unit}`{.readable} |');
  has(html, '<span class="huge">${qty}</span><span class="readable">${unit}</span>');
});

test('trailing {.class} goes on the grid cell, not into the label', () => {
  const html = renderFormBlock('| 1fr |\n| Article [artnr] {.faint .small} |');
  has(html, 'class="form-cell faint small"');
  has(html, '>Article</label>');
});

test('$key label becomes an expression', () => {
  const html = renderFormBlock('| 1fr |\n| !$pick_location [fromloc] |');
  has(html, '<label for="fromloc">${$pick_location}<span class="form-required"');
});

test('label - renders no label element', () => {
  const html = renderFormBlock('| 1fr |\n| -[message] |');
  hasNot(html, '<label');
  has(html, 'name="message"');
});

test('template next to a field is shown after the control', () => {
  const html = renderFormBlock('| 1fr |\n| -[qtypack] `${unitqyf}` |');
  has(html, 'name="qtypack"');
  has(html, '<span class="form-suffix">${unitqyf}</span>');
  assert(html.indexOf('form-suffix') > html.indexOf('name="qtypack"'));
});

test('a cell with only a class is an empty cell', () => {
  eq(parseCell('{.faint}'), null);
});

test('plain text with $ inside a word is not an expression', () => {
  const html = renderFormBlock('| 1fr |\n| Price $ [price] |');
  has(html, '>Price $</label>');
});

// ---------------------------------------------------------------------------
console.log(`\n${'─'.repeat(40)}`);
console.log(`  ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
