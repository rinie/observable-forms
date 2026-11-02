# observable-forms

Observable Framework markdown-it plugins for `:::form`, `:::tabs`, `:::cards`, and `:::card` containers.

## Installation

Copy the plugin files into your Observable Framework project (e.g. `src/`) and wire them up in `observablehq.config.js`:

```js
import markdownItDocmd from './src/markdown-it-docmd.js'

export default {
  markdownIt: md => markdownItDocmd(md)
}
```

You can also register the plugins individually:

```js
import markdownItForm       from './src/markdown-it-form.js'
import markdownItContainers from './src/markdown-it-containers.js'

export default {
  markdownIt: md => {
    markdownItForm(md)
    markdownItContainers(md)
  }
}
```

Add the stylesheets to your project:

```js
// observablehq.config.js
export default {
  style: ['src/styles/form.css', 'src/styles/containers.css'],
  markdownIt: md => markdownItDocmd(md),
}
```

---

## Syntax reference

### `:::form` — CSS grid form

```markdown
:::form
| .classname | 1fr | 2fr | 1fr |
| !First name [firstName] (e.g. Jan) | Last name [lastName] | Age |
| Street address [street] |||
| City || Zip |
| Country [country] >> @countryOptions = NL | Gender > M, F, X |
| Active >  | Status [status] = |
| Locked [locked] > = true ~ | Category > A, B, C ~ |
:::
```

**Row 1 — header:** defines the CSS grid column sizes. A cell starting with `.` sets an extra CSS class on the container; all other cells are column widths (`1fr`, `200px`, etc.).

**Rows 2+ — fields:** each pipe-delimited cell becomes a form field. Empty cells (consecutive `||`) create colspan spans. A bare `.` cell is a HARD spacer - unlike an empty cell, it never gets absorbed into a preceding field's colspan, so it always renders its own independent blank grid cell. Useful when each markdown row is meant to be a genuine visual row break at a fixed column count (pad a shorter row out with `.` cells instead of letting it silently merge into the next row's content).

#### Cell grammar

```
[!] label [ [name] ] [ (placeholder) ] [ (> | >>) options [ = default ] [ ~ ] ] [ = ] [ ~ ]
```

| Syntax | Meaning |
|---|---|
| `!Label` or `Label!` | Required field |
| `[name]` | Explicit field name (derived from label otherwise) |
| `(placeholder)` | Input placeholder text |
| `> opt1, opt2` | Radio buttons (≤ 3 options) |
| `>> opt1, opt2` | Select dropdown (forced) |
| `> opt1, opt2, opt3, opt4` | Select dropdown (auto, > 3 options) |
| `>> @varName` | Dynamic select, populated at runtime |
| `> = default` | Checkbox (bare `>`) |
| `= value` | Checkbox with default checked state |
| `Label =` | Readonly display field |
| `Label ~` / `... > ... ~` | Disabled - a real, greyed-out control (any type except `readonly`) |

`~` always comes last: after any default value (`> = true ~`, `>> @varName = NL ~`) for checkbox/radio/select, or in a plain text field's `=` position (`Label [name] ~`). Distinct from `Label =` (readonly) - `~` keeps the real `<input>`/`<select>`/radio group in the DOM with the `disabled` attribute, `=` replaces it with a plain `<span>`.

---

### `:::tabs` — tabbed panels

```markdown
::: tabs "Group label" .my-class
## npm
npm install @docmd/core

## yarn
yarn add @docmd/core
:::
```

Each `##` heading becomes a tab. Clicking a tab also syncs other tab groups on the page that share the same tab label.

---

### `:::cards` — responsive card grid

```markdown
::: cards cols:3 .feature-grid
## Fast icon:zap
Processes 10k records per second.

## Flexible icon:settings
Configurable at every layer.
:::
```

Each `##` heading becomes a card. The `cols:N` attribute sets a fixed column count; without it the grid auto-fills using `minmax(220px, 1fr)`.

---

### `:::card` — single card

```markdown
::: card "My Card" icon:rocket .highlighted
Card body content goes here.
:::
```

---

### Opener attributes (tabs, cards, card)

| Attribute | Example | Effect |
|---|---|---|
| Quoted string | `"My Label"` | Title for tabs group label or card header |
| `icon:name` | `icon:rocket` | Lucide icon (requires lucide sprite in page) |
| `.classname` | `.highlight` | Extra CSS class on the container element |
| `cols:N` | `cols:3` | Fixed column count (cards only) |

---

## Architecture

### How the plugins hook into markdown-it

Both plugins register a **block rule** (`md.block.ruler.before('fence', …)`) built by the shared `colonFenceRule` in `markdown-it-fence.js`. The rule matches an opener line of 3 or more colons plus a type name, finds the closer with the **same number of colons**, and emits the whole range as one `html_block` token. The body reaches the renderer as raw source lines, so fence lines need no blank lines around them.

Fences nest by colon count, as in markdown-it-container and pandoc fenced divs. Card, cards and tabs bodies are rendered with `md.render`, so a shorter fence inside them is picked up by the same rules:

```markdown
::::card "Pick data"
:::form
| 1fr | 1fr |
| Location [loc] | Article [art] |
:::
::::
```

The inner `:::` closes the form, never the card. Two nested fences of the same length are not supported; give the outer one more colons.

```
md source
   │
   ▼ markdown-it block parser
   │  colonFenceRule: opener ":::form" / "::::card" …
   │  closer = next line with the same colon count
   │  body (raw lines) → renderFormBlock / renderSingleCard(md.render(body))
   ▼
html_block(rendered HTML)
```

Earlier versions used a `md.core.ruler` pass over paragraph tokens instead. That pass matched exactly three colons, so it couldn't nest, and the first bare `:::` closed any block.

### markdown-it-form

**Pipeline:**

```
pipe-table lines
   │
   ▼ parseHeader()        → { cssClass, columns[] }
   ▼ parseDataRow()       → [{ raw, colspan }]
   ▼ parseCell()          → field descriptor
   ▼ emitField()          → HTML string
   ▼ renderFormBlock()    → <div class="form-grid"> ... </div>
```

**`parseCell`** reads a single pipe-cell string through a series of regex extractions (name override `[x]`, placeholder `(x)`, options `>` / `>>`, default `= x`, required `!`, disabled `~`) and returns a plain object describing the field type and attributes.

**Field types:**

| Type | Trigger | Output |
|---|---|---|
| `text` | plain label | `<input type="text">` |
| `readonly` | trailing `=` | `<span class="form-value">` |
| `checkbox` | bare `>` | `<input type="checkbox">` |
| `radio` | `> opt1, opt2` (≤ 3) | `<input type="radio">` group |
| `select` | `>>` or > 3 options or `@var` | `<select>` |

**Dynamic selects** emit `data-options-src="varName"` and are wired up at runtime by a small `<script type="module">` injected once per page. The script reads from `window.__observableRuntime` (Observable Framework's reactive runtime) to populate the `<select>` when the named variable changes.

**Colspan** is detected by counting consecutive empty cells after each non-empty one and emitting `style="grid-column: span N"`.

---

### markdown-it-containers

**Pipeline:**

```
::: type [attrs]
## Section heading [icon:x] [.class]
body content
## Another section
more content
:::
   │
   ▼ parseOpenerAttrs()   → { title, icon, cssClass, cols }
   ▼ splitOnHeadings()    → [{ title, icon, cssClass, body[] }]
   ▼ renderTabs / renderCards / renderSingleCard
   ▼ html_block token
```

**`parseOpenerAttrs`** extracts four optional attributes from the opener line using independent regex passes (no grammar, order-independent).

**`splitOnHeadings`** scans the block body for `##` headings, collecting lines between them into sections. Section headings also accept `icon:name` and `.class` inline attributes.

**Tab sync:** clicking a tab fires a DOM event that searches all other `.tabs-container` elements on the page for buttons with matching text content and activates them. This cross-group sync is handled by the `TABS_RUNTIME` inline script, emitted once per page.

**Unique tab group IDs** are generated with a module-level counter (`tabGroupCounter`). This counter resets on each Observable Framework hot-reload since the module is re-evaluated.

---

### markdown-it-docmd

Thin composition layer — calls `markdownItForm(md)` then `markdownItContainers(md)`. Both plugins are independent and can be registered separately.

---

### CSS theming

Both stylesheets use CSS custom properties for all visual tokens so they compose with Observable Framework's theme system:

| Property | Default | Used by |
|---|---|---|
| `--form-gap` | `0.75rem 1rem` | form grid gap |
| `--form-border` | `#ccc` | input/select/readonly borders |
| `--form-radius` | `4px` | input/select border-radius |
| `--form-focus` | `#4a90d9` | focus outline colour |
| `--form-required-color` | `#c00` | required `*` and border accent |
| `--form-input-bg` | `#fff` | input/select background |
| `--form-disabled-bg` | `#f2f2f2` | disabled input/select background |
| `--tabs-border` | `#ddd` | tabs container/nav border |
| `--tabs-radius` | `6px` | tabs container border-radius |
| `--tabs-nav-bg` | `#f5f5f5` | tab nav bar background |
| `--tabs-active-color` | `#1a6fc4` | active tab text + underline |
| `--tabs-active-bg` | `#fff` | active tab button background |
| `--tabs-panel-bg` | `#fff` | tab panel background |
| `--tabs-panel-padding` | `1rem 1.25rem` | tab panel padding |
| `--card-border` | `#ddd` | card border |
| `--card-radius` | `6px` | card border-radius |
| `--card-bg` | `#fff` | card background |
| `--card-header-bg` | `#f5f5f5` | card header background |
| `--card-title-color` | `#222` | card title text |
| `--card-body-padding` | `0.85rem 1rem` | card body padding |
| `--card-min-width` | `220px` | min card width in auto grid |
| `--cards-gap` | `1rem` | gap between cards |

---

## File layout

```
markdown-it-form.js        :::form plugin
markdown-it-containers.js  :::tabs / :::cards / :::card plugin
markdown-it-docmd.js       unified entry point (registers both)
markdown-it-fence.js       shared colon-fence block rule (nesting by colon count)
form.css                   form-grid stylesheet
containers.css             tabs + cards stylesheet
test-form.js               Node.js test suite for form plugin
test-containers.js         Node.js test suite for containers plugin
test-fence.js              Node.js test suite for fences and nesting
```

## Running tests

```sh
node test-form.js
node test-containers.js
node test-fence.js
```

`test-fence.js` drives both plugins through a minimal stand-in for markdown-it's block state, so it runs without `node_modules`.

No build step or test framework required — uses Node's built-in `assert` module.
