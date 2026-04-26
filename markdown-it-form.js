/**
 * markdown-it-form
 * Observable Framework plugin for CSS grid-based forms.
 *
 * Usage in observablehq.config.js:
 *   import markdownItForm from './src/markdown-it-form.js'
 *   export default { markdownIt: md => { markdownItForm(md) } }
 *
 * Syntax:
 *   :::form
 *   | .classname | 1fr | 2fr | 1fr |
 *   | !First name [firstName] (e.g. Jan) | Last name [lastName] | Age |
 *   | Street address [street] |||
 *   | City || Zip |
 *   | Country [country] >> @countryOptions = NL | Gender > M, F, X |
 *   | Active >  | Status [status] = |
 *   :::
 */

// ---------------------------------------------------------------------------
// Cell parser
// ---------------------------------------------------------------------------

/**
 * Derive a field name from a label string.
 * "First name" -> "first_name"
 */
function deriveFieldName(label) {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

/**
 * Parse a single cell string into a field descriptor.
 *
 * Grammar:
 *   [!] label [ [name] ] [ (placeholder) ] [ (> | >>) (opt1,opt2 | @var) [ = default ] ] [ = ]
 *
 * Returns null for empty/whitespace cells (grid spacers).
 */
function parseCell(raw) {
  const src = raw.trim()
  if (!src) return null

  let rest = src
  const field = {
    label: '',
    name: '',
    required: false,
    type: 'text',       // text | radio | select | checkbox | readonly
    placeholder: '',
    options: [],        // string[] for static
    optionsSrc: '',     // @varName for dynamic
    defaultValue: '',
  }

  // Required: leading or trailing !
  if (rest.startsWith('!')) {
    field.required = true
    rest = rest.slice(1).trimStart()
  }

  // Read-only: trailing bare = (no options part)
  // We detect this after parsing the rest, see below.

  // Extract [name] override
  const nameMatch = rest.match(/\[([^\]]+)\]/)
  if (nameMatch) {
    field.name = nameMatch[1].trim()
    rest = rest.replace(nameMatch[0], '').trim()
  }

  // Extract (placeholder)
  const placeholderMatch = rest.match(/\(([^)]+)\)/)
  if (placeholderMatch) {
    field.placeholder = placeholderMatch[1].trim()
    rest = rest.replace(placeholderMatch[0], '').trim()
  }

  // Extract options part: >> or >
  const optMatch = rest.match(/(>>?)(.*)$/)
  if (optMatch) {
    const forced = optMatch[1] === '>>'
    rest = rest.slice(0, optMatch.index).trim()
    let optSrc = optMatch[2].trim()

    // Default value: = value at end of options
    const defMatch = optSrc.match(/=\s*([^,]+)$/)
    if (defMatch) {
      field.defaultValue = defMatch[1].trim()
      optSrc = optSrc.slice(0, defMatch.index).trim()
    }

    if (optSrc.startsWith('@')) {
      // Dynamic source
      field.optionsSrc = optSrc.slice(1).trim()
      field.type = 'select'
    } else if (optSrc === '') {
      // Single bare > with no options = checkbox
      field.type = 'checkbox'
    } else {
      // Static options
      field.options = optSrc.split(',').map(o => o.trim()).filter(Boolean)
      if (forced || field.options.length > 3) {
        field.type = 'select'
      } else {
        field.type = 'radio'
      }
    }
  } else {
    // Check for trailing bare = (readonly)
    if (rest.endsWith('=')) {
      field.type = 'readonly'
      rest = rest.slice(0, -1).trim()
    }
  }

  // Trailing ! also counts as required
  if (rest.endsWith('!')) {
    field.required = true
    rest = rest.slice(0, -1).trim()
  }

  field.label = rest.trim()
  if (!field.name) field.name = deriveFieldName(field.label)

  return field
}

// ---------------------------------------------------------------------------
// HTML emitters
// ---------------------------------------------------------------------------

function escAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function requiredAttr(field) {
  return field.required ? ' required' : ''
}

function emitLabel(field) {
  const req = field.required ? '<span class="form-required" aria-hidden="true">*</span>' : ''
  return `<label for="${escAttr(field.name)}">${escAttr(field.label)}${req}</label>`
}

function emitText(field) {
  return `<div class="form-field">
  ${emitLabel(field)}
  <input type="text" id="${escAttr(field.name)}" name="${escAttr(field.name)}"${field.placeholder ? ` placeholder="${escAttr(field.placeholder)}"` : ''}${field.defaultValue ? ` value="${escAttr(field.defaultValue)}"` : ''}${requiredAttr(field)}>
</div>`
}

function emitReadonly(field) {
  return `<div class="form-field form-field--readonly">
  ${emitLabel(field)}
  <span class="form-value" id="${escAttr(field.name)}" data-name="${escAttr(field.name)}">${escAttr(field.defaultValue)}</span>
</div>`
}

function emitCheckbox(field) {
  const checked = field.defaultValue === 'true' || field.defaultValue === '1' ? ' checked' : ''
  return `<div class="form-field form-field--checkbox">
  <input type="checkbox" id="${escAttr(field.name)}" name="${escAttr(field.name)}"${checked}${requiredAttr(field)}>
  <label for="${escAttr(field.name)}">${escAttr(field.label)}${field.required ? '<span class="form-required" aria-hidden="true">*</span>' : ''}</label>
</div>`
}

function emitRadio(field) {
  const radios = field.options.map(opt => {
    const id = `${field.name}_${deriveFieldName(opt)}`
    const checked = field.defaultValue === opt ? ' checked' : ''
    return `  <label class="form-radio-option"><input type="radio" id="${escAttr(id)}" name="${escAttr(field.name)}" value="${escAttr(opt)}"${checked}${requiredAttr(field)}> ${escAttr(opt)}</label>`
  }).join('\n')
  return `<div class="form-field form-field--radio">
  <span class="form-label">${escAttr(field.label)}${field.required ? '<span class="form-required" aria-hidden="true">*</span>' : ''}</span>
  <div class="form-radio-group">
${radios}
  </div>
</div>`
}

function emitSelect(field) {
  let optionsHtml = ''
  if (field.optionsSrc) {
    // Dynamic — emit empty select, runtime will populate
    optionsHtml = ''
  } else {
    optionsHtml = field.options.map(opt => {
      const selected = field.defaultValue === opt ? ' selected' : ''
      return `  <option value="${escAttr(opt)}"${selected}>${escAttr(opt)}</option>`
    }).join('\n')
  }

  const dynamicAttrs = field.optionsSrc
    ? ` data-options-src="${escAttr(field.optionsSrc)}"`
    : ` data-options="${escAttr(field.options.join(','))}"`

  return `<div class="form-field form-field--select">
  ${emitLabel(field)}
  <select id="${escAttr(field.name)}" name="${escAttr(field.name)}"${dynamicAttrs}${requiredAttr(field)}>
${optionsHtml}
  </select>
</div>`
}

function emitField(field) {
  switch (field.type) {
    case 'readonly': return emitReadonly(field)
    case 'checkbox': return emitCheckbox(field)
    case 'radio':    return emitRadio(field)
    case 'select':   return emitSelect(field)
    default:         return emitText(field)
  }
}

// ---------------------------------------------------------------------------
// Table row / header parser
// ---------------------------------------------------------------------------

/**
 * Split a pipe-delimited row into raw cell strings.
 * "| foo | bar | baz |" -> ["foo", "bar", "baz"]
 */
function splitRow(line) {
  return line
    .replace(/^\||\|$/g, '')  // strip leading/trailing pipe
    .split('|')
}

/**
 * Parse the header row.
 * Returns { cssClass, columns: ['1fr','2fr',...] }
 */
function parseHeader(cells) {
  const columns = []
  let cssClass = ''
  for (const cell of cells) {
    const c = cell.trim()
    if (c.startsWith('.')) {
      cssClass = c.slice(1).trim()
    } else if (c) {
      columns.push(c)
    } else {
      // empty cell in header counts as a column with default size
      columns.push('1fr')
    }
  }
  return { cssClass, columns }
}

/**
 * Parse data rows into grid cells with colspan.
 * Returns array of { raw, colspan } objects per row.
 */
function parseDataRow(cells) {
  const result = []
  let i = 0
  while (i < cells.length) {
    let colspan = 1
    // Count consecutive empty cells after this one = span
    let j = i + 1
    while (j < cells.length && cells[j].trim() === '') {
      colspan++
      j++
    }
    result.push({ raw: cells[i], colspan })
    i = j
  }
  return result
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

/**
 * Render the full :::form block content into HTML.
 */
function renderFormBlock(content) {
  const lines = content.split('\n').map(l => l.trim()).filter(l => l.startsWith('|'))
  if (!lines.length) return '<div class="form-grid"></div>'

  // First line = header
  const headerCells = splitRow(lines[0])
  const { cssClass, columns } = parseHeader(headerCells)
  const colCount = columns.length || 1

  const gridStyle = `grid-template-columns: ${columns.join(' ')}`
  const classAttr = cssClass
    ? `class="form-grid ${escAttr(cssClass)}"`
    : `class="form-grid"`

  let html = `<div ${classAttr} style="${gridStyle}">\n`

  for (let li = 1; li < lines.length; li++) {
    const cells = splitRow(lines[li])
    const parsed = parseDataRow(cells)

    for (const { raw, colspan } of parsed) {
      const field = parseCell(raw)
      const spanStyle = colspan > 1 ? ` style="grid-column: span ${colspan}"` : ''
      const spanClass = colspan > 1 ? ` form-cell--span-${colspan}` : ''

      if (!field) {
        // Empty spacer cell
        html += `  <div class="form-cell form-cell--empty"${spanStyle}></div>\n`
      } else {
        html += `  <div class="form-cell${spanClass}"${spanStyle}>\n`
        html += emitField(field).split('\n').map(l => '    ' + l).join('\n') + '\n'
        html += `  </div>\n`
      }
    }
  }

  html += `</div>\n`
  return html
}

// ---------------------------------------------------------------------------
// Observable Framework runtime stub (emitted once per page)
// ---------------------------------------------------------------------------

const RUNTIME_SCRIPT = `
<script type="module">
(function() {
  // Populate dynamic selects from Observable variables
  function bindDynamicSelects() {
    document.querySelectorAll('select[data-options-src]').forEach(sel => {
      const src = sel.dataset.optionsSrc
      // Try to read from window (static pages) or Observable runtime
      if (typeof window.__observableRuntime !== 'undefined') {
        window.__observableRuntime.observe(src, values => {
          replaceOptions(sel, values)
        })
      }
    })
  }

  window.replaceOptions = function(sel, values) {
    const current = sel.value
    sel.innerHTML = ''
    values.forEach(v => {
      const opt = document.createElement('option')
      opt.value = v
      opt.textContent = v
      if (v === current) opt.selected = true
      sel.appendChild(opt)
    })
  }

  // Expose helper for manual JS use
  window.formSetOptions = function(name, values) {
    document.querySelectorAll('select[name="' + name + '"]').forEach(sel => {
      window.replaceOptions(sel, values)
    })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindDynamicSelects)
  } else {
    bindDynamicSelects()
  }
})()
</script>
`

// ---------------------------------------------------------------------------
// markdown-it container registration
// ---------------------------------------------------------------------------

export default function markdownItForm(md) {
  let runtimeEmitted = false

  md.use(function(md) {
    const defaultFence = md.renderer.rules.fence

    // Register the ::: container rule manually (compatible with
    // @observablehq/framework's markdown-it-container setup)
    const OPEN_RE = /^:::\s*form\s*$/
    const CLOSE_RE = /^:::\s*$/

    md.core.ruler.push('form_container', function(state) {
      const tokens = state.tokens
      let i = 0
      while (i < tokens.length) {
        const tok = tokens[i]
        if (tok.type === 'html_block') {
          i++
          continue
        }
        // Look for inline token containing :::form
        if (tok.type === 'inline' && OPEN_RE.test(tok.content.trim())) {
          // Find closing :::
          let j = i + 1
          const contentLines = []
          while (j < tokens.length) {
            const t = tokens[j]
            if (t.type === 'inline' && CLOSE_RE.test(t.content.trim())) break
            if (t.type === 'inline') contentLines.push(t.content)
            j++
          }
          const formHtml = renderFormBlock(contentLines.join('\n'))
          const runtime = runtimeEmitted ? '' : (runtimeEmitted = true, RUNTIME_SCRIPT)
          const replacement = Object.assign(new state.Token('html_block', '', 0), {
            content: runtime + formHtml
          })
          tokens.splice(i, j - i + 1, replacement)
        }
        i++
      }
    })
  })
}

// Also export the parser/renderer for testing
export { parseCell, parseHeader, parseDataRow, renderFormBlock, deriveFieldName }
