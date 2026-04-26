import { parseOpenerAttrs, splitOnHeadings, renderTabs, renderCards, renderSingleCard } from './markdown-it-containers.js'
import assert from 'assert'

let passed = 0
let failed = 0

function test(name, fn) {
  try {
    fn()
    console.log(`  ✓ ${name}`)
    passed++
  } catch (e) {
    console.error(`  ✗ ${name}`)
    console.error(`    ${e.message}`)
    failed++
  }
}

function eq(a, b)          { assert.deepStrictEqual(a, b) }
function has(html, substr) { assert(html.includes(substr), `expected to find: ${substr}`) }
function hasNot(html, s)   { assert(!html.includes(s), `expected NOT to find: ${s}`) }

// ---------------------------------------------------------------------------
console.log('\nparseOpenerAttrs')
// ---------------------------------------------------------------------------
test('empty string', () => {
  const a = parseOpenerAttrs('')
  eq(a.title, '')
  eq(a.icon, '')
  eq(a.cssClass, '')
  eq(a.cols, 0)
})

test('quoted title', () => {
  const a = parseOpenerAttrs('"My Title"')
  eq(a.title, 'My Title')
})

test('icon', () => {
  const a = parseOpenerAttrs('icon:rocket')
  eq(a.icon, 'rocket')
})

test('class', () => {
  const a = parseOpenerAttrs('.my-class')
  eq(a.cssClass, 'my-class')
})

test('cols', () => {
  const a = parseOpenerAttrs('cols:3')
  eq(a.cols, 3)
})

test('all attrs combined', () => {
  const a = parseOpenerAttrs('"Setup" icon:rocket .highlight cols:2')
  eq(a.title, 'Setup')
  eq(a.icon, 'rocket')
  eq(a.cssClass, 'highlight')
  eq(a.cols, 2)
})

// ---------------------------------------------------------------------------
console.log('\nsplitOnHeadings')
// ---------------------------------------------------------------------------
test('two sections', () => {
  const sections = splitOnHeadings(`## npm\nnpm install\n\n## yarn\nyarn add`)
  eq(sections.length, 2)
  eq(sections[0].title, 'npm')
  eq(sections[1].title, 'yarn')
})

test('body lines collected', () => {
  const sections = splitOnHeadings(`## Tab A\nline 1\nline 2\n\n## Tab B\nline 3`)
  eq(sections[0].body, ['line 1', 'line 2'])
  eq(sections[1].body, ['line 3'])
})

test('leading blank lines trimmed from body', () => {
  const sections = splitOnHeadings(`## Tab\n\n\nsome content`)
  eq(sections[0].body[0], 'some content')
})

test('icon in heading', () => {
  const sections = splitOnHeadings(`## Setup icon:rocket\ncontent`)
  eq(sections[0].title, 'Setup')
  eq(sections[0].icon, 'rocket')
})

test('class in heading', () => {
  const sections = splitOnHeadings(`## Setup .highlight\ncontent`)
  eq(sections[0].cssClass, 'highlight')
})

test('empty content = no sections', () => {
  eq(splitOnHeadings('').length, 0)
})

test('content before first heading ignored', () => {
  const sections = splitOnHeadings(`preamble\n## Tab\ncontent`)
  eq(sections.length, 1)
  eq(sections[0].title, 'Tab')
})

// ---------------------------------------------------------------------------
console.log('\nrenderTabs')
// ---------------------------------------------------------------------------
test('emits tabs-container', () => {
  const html = renderTabs(`## npm\nnpm install\n\n## yarn\nyarn add`, {}, null)
  has(html, 'class="tabs-container"')
})

test('emits tab buttons', () => {
  const html = renderTabs(`## npm\ncontent\n\n## yarn\ncontent`, {}, null)
  has(html, 'role="tab"')
  has(html, '>npm<')
  has(html, '>yarn<')
})

test('first tab is active', () => {
  const html = renderTabs(`## Tab A\ncontent\n\n## Tab B\ncontent`, {}, null)
  has(html, 'tabs-nav__btn--active')
  has(html, 'aria-selected="true"')
})

test('second panel is hidden', () => {
  const html = renderTabs(`## Tab A\ncontent\n\n## Tab B\ncontent`, {}, null)
  has(html, 'tabs-panel--hidden')
  has(html, 'hidden')
})

test('css class on container', () => {
  const html = renderTabs(`## Tab\ncontent`, { cssClass: 'my-tabs' }, null)
  has(html, 'tabs-container my-tabs')
})

test('aria-label from title attr', () => {
  const html = renderTabs(`## Tab\ncontent`, { title: 'Install options' }, null)
  has(html, 'aria-label="Install options"')
})

test('unique group ids across calls', () => {
  const html1 = renderTabs(`## A\nc`, {}, null)
  const html2 = renderTabs(`## B\nc`, {}, null)
  // Extract data-tabs-group values
  const g1 = html1.match(/data-tabs-group="([^"]+)"/)[1]
  const g2 = html2.match(/data-tabs-group="([^"]+)"/)[1]
  assert(g1 !== g2, 'tab group ids should be unique')
})

// ---------------------------------------------------------------------------
console.log('\nrenderCards')
// ---------------------------------------------------------------------------
test('emits cards-grid', () => {
  const html = renderCards(`## A\ncontent`, {}, null)
  has(html, 'class="cards-grid"')
})

test('emits card per section', () => {
  const html = renderCards(`## Card A\ncontent\n\n## Card B\ncontent`, {}, null)
  has(html, 'Card A')
  has(html, 'Card B')
})

test('cols attr sets grid-template-columns', () => {
  const html = renderCards(`## A\ncontent`, { cols: 3 }, null)
  has(html, 'grid-template-columns: repeat(3, 1fr)')
})

test('no cols = no inline style', () => {
  const html = renderCards(`## A\ncontent`, { cols: 0 }, null)
  hasNot(html, 'grid-template-columns')
})

test('icon in card header', () => {
  const html = renderCards(`## Setup icon:rocket\ncontent`, {}, null)
  has(html, 'lucide-rocket')
})

test('css class on grid', () => {
  const html = renderCards(`## A\ncontent`, { cssClass: 'feature-grid' }, null)
  has(html, 'cards-grid feature-grid')
})

// ---------------------------------------------------------------------------
console.log('\nrenderSingleCard')
// ---------------------------------------------------------------------------
test('emits card div', () => {
  const html = renderSingleCard('Some content', { title: 'My Card' }, null)
  has(html, 'class="card"')
  has(html, 'My Card')
})

test('no header when no title or icon', () => {
  const html = renderSingleCard('Just content', {}, null)
  hasNot(html, 'card__header')
})

test('icon in header', () => {
  const html = renderSingleCard('Content', { title: 'Setup', icon: 'rocket' }, null)
  has(html, 'lucide-rocket')
  has(html, 'card__header')
})

test('extra css class on card', () => {
  const html = renderSingleCard('Content', { title: 'T', cssClass: 'highlighted' }, null)
  has(html, 'card highlighted')
})

test('body content rendered', () => {
  const html = renderSingleCard('Hello world', { title: 'T' }, null)
  has(html, 'Hello world')
})

// ---------------------------------------------------------------------------
console.log('\n' + '─'.repeat(40))
console.log(`  ${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
