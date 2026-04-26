/**
 * markdown-it-docmd
 * Unified plugin for Observable Framework.
 * Registers :::form, :::tabs, :::cards, :::card containers.
 *
 * Usage in observablehq.config.js:
 *
 *   import markdownItDocmd from './src/markdown-it-docmd.js'
 *
 *   export default {
 *     markdownIt: md => markdownItDocmd(md)
 *   }
 */

import markdownItForm       from './markdown-it-form.js'
import markdownItContainers from './markdown-it-containers.js'

export default function markdownItDocmd(md) {
  markdownItForm(md)
  markdownItContainers(md)
}
