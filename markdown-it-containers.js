/**
 * markdown-it-containers
 * Observable Framework plugin for :::tabs and :::cards containers.
 *
 * Syntax:
 *
 * ::: tabs
 * ## npm
 * npm install @docmd/core
 *
 * ## yarn
 * yarn add @docmd/core
 * :::
 *
 * ::: cards
 * ## Feature A
 * Description of feature A.
 *
 * ## Feature B icon:rocket
 * Description of feature B.
 * :::
 *
 * ::: card "Title" icon:rocket .my-class
 * Single card content.
 * :::
 *
 * Opener attributes (all optional, space-separated after type keyword):
 *   "Title"      quoted string  — card title / tabs group label
 *   icon:name    Lucide icon name
 *   .classname   extra CSS class on container
 *   cols:N       number of columns for :::cards grid (default: auto)
 */

// ---------------------------------------------------------------------------
// Attribute parser for opener line
// e.g. 'cards "My Group" icon:grid .my-class cols:3'
// ---------------------------------------------------------------------------

function parseOpenerAttrs(attrStr) {
  const attrs = { title: '', icon: '', cssClass: '', cols: 0 }
  if (!attrStr) return attrs

  // Quoted title
  const titleMatch = attrStr.match(/"([^"]*)"/)
  if (titleMatch) {
    attrs.title = titleMatch[1]
    attrStr = attrStr.replace(titleMatch[0], '')
  }

  // icon:name
  const iconMatch = attrStr.match(/\bicon:([\w-]+)/)
  if (iconMatch) {
    attrs.icon = iconMatch[1]
    attrStr = attrStr.replace(iconMatch[0], '')
  }

  // cols:N
  const colsMatch = attrStr.match(/\bcols:(\d+)/)
  if (colsMatch) {
    attrs.cols = parseInt(colsMatch[1], 10)
    attrStr = attrStr.replace(colsMatch[0], '')
  }

  // .classname
  const classMatch = attrStr.match(/\.([\w-]+)/)
  if (classMatch) {
    attrs.cssClass = classMatch[1]
    attrStr = attrStr.replace(classMatch[0], '')
  }

  return attrs
}

// ---------------------------------------------------------------------------
// Section splitter
// Splits block content on ## headings into [{title, attrs, body}]
// ---------------------------------------------------------------------------

function splitOnHeadings(content) {
  const lines = content.split('\n')
  const sections = []
  let current = null

  for (const line of lines) {
    const headingMatch = line.match(/^##\s+(.*)$/)
    if (headingMatch) {
      if (current) sections.push(current)
      const headingText = headingMatch[1]
      // Parse inline attrs from heading: "Title icon:x .class"
      const attrs = parseOpenerAttrs(headingText)
      // Title = everything left after stripping attrs
      const cleanTitle = headingText
        .replace(/icon:[\w-]+/, '')
        .replace(/\.[\w-]+/, '')
        .trim()
      current = { title: cleanTitle || attrs.title, icon: attrs.icon, cssClass: attrs.cssClass, body: [] }
    } else if (current) {
      current.body.push(line)
    }
  }
  if (current) sections.push(current)

  // Trim leading/trailing blank lines from each body
  for (const s of sections) {
    while (s.body.length && !s.body[0].trim()) s.body.shift()
    while (s.body.length && !s.body[s.body.length - 1].trim()) s.body.pop()
  }

  return sections
}

// ---------------------------------------------------------------------------
// Lucide icon SVG stub
// Returns an inline <svg use> referencing the lucide sprite if available,
// or a simple text fallback. Observable Framework users can import the
// lucide sprite separately.
// ---------------------------------------------------------------------------

function iconHtml(name) {
  if (!name) return ''
  return `<svg class="container-icon" aria-hidden="true" width="16" height="16"><use href="#lucide-${escAttr(name)}"/></svg>`
}

function escAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// ---------------------------------------------------------------------------
// Tabs renderer
// ---------------------------------------------------------------------------

let tabGroupCounter = 0

function renderTabs(content, attrs, md) {
  const sections = splitOnHeadings(content)
  if (!sections.length) return '<div class="tabs-container"></div>'

  const groupId = `tabs-${++tabGroupCounter}`
  const extraClass = attrs.cssClass ? ` ${escAttr(attrs.cssClass)}` : ''

  let html = `<div class="tabs-container${extraClass}" data-tabs-group="${escAttr(groupId)}">\n`

  // Tab button bar
  html += `  <div class="tabs-nav" role="tablist"${attrs.title ? ` aria-label="${escAttr(attrs.title)}"` : ''}>\n`
  sections.forEach((s, i) => {
    const tabId = `${groupId}-tab-${i}`
    const panelId = `${groupId}-panel-${i}`
    const active = i === 0 ? ' tabs-nav__btn--active' : ''
    html += `    <button class="tabs-nav__btn${active}" role="tab" id="${tabId}" aria-controls="${panelId}" aria-selected="${i === 0}">${iconHtml(s.icon)}${escHtml(s.title)}</button>\n`
  })
  html += `  </div>\n`

  // Tab panels
  sections.forEach((s, i) => {
    const tabId = `${groupId}-tab-${i}`
    const panelId = `${groupId}-panel-${i}`
    const hidden = i === 0 ? '' : ' hidden'
    const bodyMd = s.body.join('\n')
    const bodyHtml = md ? md.render(bodyMd) : escHtml(bodyMd)
    html += `  <div class="tabs-panel${hidden ? ' tabs-panel--hidden' : ''}" role="tabpanel" id="${panelId}" aria-labelledby="${tabId}"${hidden}>\n`
    html += bodyHtml.split('\n').map(l => '    ' + l).join('\n') + '\n'
    html += `  </div>\n`
  })

  html += `</div>\n`
  return html
}

// ---------------------------------------------------------------------------
// Single card renderer (shared by :::card and :::cards items)
// ---------------------------------------------------------------------------

function renderCard(title, icon, cssClass, bodyHtml) {
  const extraClass = cssClass ? ` ${escAttr(cssClass)}` : ''
  let html = `<div class="card${extraClass}">\n`
  if (title || icon) {
    html += `  <div class="card__header">${iconHtml(icon)}<span class="card__title">${escHtml(title)}</span></div>\n`
  }
  html += `  <div class="card__body">\n`
  html += bodyHtml.split('\n').map(l => '    ' + l).join('\n') + '\n'
  html += `  </div>\n`
  html += `</div>\n`
  return html
}

// ---------------------------------------------------------------------------
// Cards grid renderer
// ---------------------------------------------------------------------------

function renderCards(content, attrs, md) {
  const sections = splitOnHeadings(content)
  if (!sections.length) return '<div class="cards-grid"></div>'

  const cols = attrs.cols || 0
  const extraClass = attrs.cssClass ? ` ${escAttr(attrs.cssClass)}` : ''
  const colsStyle = cols ? ` style="grid-template-columns: repeat(${cols}, 1fr)"` : ''

  let html = `<div class="cards-grid${extraClass}"${colsStyle}>\n`
  for (const s of sections) {
    const bodyHtml = md ? md.render(s.body.join('\n')) : escHtml(s.body.join('\n'))
    html += renderCard(s.title, s.icon, s.cssClass, bodyHtml)
      .split('\n').map(l => '  ' + l).join('\n') + '\n'
  }
  html += `</div>\n`
  return html
}

// ---------------------------------------------------------------------------
// Single :::card block renderer
// ---------------------------------------------------------------------------

function renderSingleCard(content, attrs, md) {
  const bodyHtml = md ? md.render(content.trim()) : escHtml(content.trim())
  return renderCard(attrs.title, attrs.icon, attrs.cssClass, bodyHtml)
}

// ---------------------------------------------------------------------------
// Runtime script (tabs interactivity, emitted once per page)
// ---------------------------------------------------------------------------

const TABS_RUNTIME = `
<script type="module">
(function() {
  function initTabs(container) {
    const buttons = container.querySelectorAll('[role="tab"]')
    const panels  = container.querySelectorAll('[role="tabpanel"]')

    buttons.forEach((btn, i) => {
      btn.addEventListener('click', () => {
        buttons.forEach(b => {
          b.setAttribute('aria-selected', 'false')
          b.classList.remove('tabs-nav__btn--active')
        })
        panels.forEach(p => {
          p.hidden = true
          p.classList.add('tabs-panel--hidden')
        })
        btn.setAttribute('aria-selected', 'true')
        btn.classList.add('tabs-nav__btn--active')
        panels[i].hidden = false
        panels[i].classList.remove('tabs-panel--hidden')

        // Sync same-label tabs across page
        const label = btn.textContent.trim()
        document.querySelectorAll('.tabs-container').forEach(other => {
          if (other === container) return
          const otherBtns   = other.querySelectorAll('[role="tab"]')
          const otherPanels = other.querySelectorAll('[role="tabpanel"]')
          otherBtns.forEach((ob, oi) => {
            if (ob.textContent.trim() === label) {
              otherBtns.forEach(b => {
                b.setAttribute('aria-selected', 'false')
                b.classList.remove('tabs-nav__btn--active')
              })
              otherPanels.forEach(p => {
                p.hidden = true
                p.classList.add('tabs-panel--hidden')
              })
              ob.setAttribute('aria-selected', 'true')
              ob.classList.add('tabs-nav__btn--active')
              otherPanels[oi].hidden = false
              otherPanels[oi].classList.remove('tabs-panel--hidden')
            }
          })
        })
      })
    })
  }

  function init() {
    document.querySelectorAll('.tabs-container').forEach(initTabs)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
</script>
`

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export default function markdownItContainers(md) {
  let tabsRuntimeEmitted = false

  const CONTAINER_RE = /^:::\s*(tabs|cards|card)(.*)?$/
  const CLOSE_RE     = /^:::\s*$/

  md.core.ruler.push('containers', function(state) {
    const tokens = state.tokens
    let i = 0

    while (i < tokens.length) {
      const tok = tokens[i]
      if (tok.type !== 'inline') { i++; continue }

      const openMatch = tok.content.trim().match(CONTAINER_RE)
      if (!openMatch) { i++; continue }

      const type    = openMatch[1]           // tabs | cards | card
      const attrStr = (openMatch[2] || '').trim()
      const attrs   = parseOpenerAttrs(attrStr)

      // Collect content lines until closing :::
      const contentLines = []
      let j = i + 1
      while (j < tokens.length) {
        const t = tokens[j]
        if (t.type === 'inline' && CLOSE_RE.test(t.content.trim())) break
        if (t.type === 'inline') contentLines.push(t.content)
        j++
      }

      const content = contentLines.join('\n')
      let html = ''
      let runtime = ''

      if (type === 'tabs') {
        html = renderTabs(content, attrs, md)
        if (!tabsRuntimeEmitted) {
          runtime = TABS_RUNTIME
          tabsRuntimeEmitted = true
        }
      } else if (type === 'cards') {
        html = renderCards(content, attrs, md)
      } else if (type === 'card') {
        html = renderSingleCard(content, attrs, md)
      }

      const replacement = Object.assign(new state.Token('html_block', '', 0), {
        content: runtime + html
      })
      tokens.splice(i, j - i + 1, replacement)
      i++
    }
  })
}

export { parseOpenerAttrs, splitOnHeadings, renderTabs, renderCards, renderSingleCard }
