/**
 * markdown-it-fence
 * Shared colon-fence block rule for :::form, :::tabs, :::cards and :::card.
 *
 * A fence opens with 3 or more colons followed by a type name, and closes on a
 * line with only the SAME number of colons. Fences nest by length, as in
 * markdown-it-container and pandoc fenced divs:
 *
 *   ::::card "Pick data"
 *   :::form
 *   | 1fr | 1fr |
 *   | Location [loc] | Article [art] |
 *   :::
 *   ::::
 *
 * The inner ":::" closes the form, never the card. Nesting two fences of the
 * same length is not supported: give the outer one more colons.
 *
 * Being a block rule (not a core rule over paragraph tokens) means fence lines
 * don't need blank lines around them, and the body reaches the renderer as raw
 * source lines.
 */

const OPEN_RE = /^(:{3,})\s*([A-Za-z][\w-]*)(.*)$/;
const CLOSE_RE = /^(:{3,})\s*$/;

// Returns { colons, type, args } for an opener line, or null.
function parseFenceOpener(line) {
  const m = line.trim().match(OPEN_RE);
  if (!m) return null;
  return { colons: m[1].length, type: m[2], args: m[3].trim() };
}

// Index of the line that closes a fence of `colons` colons opened at `start`,
// or -1 when it is not closed before `end`. lineAt(n) returns line n's text.
function findFenceClose(lineAt, start, end, colons) {
  for (let n = start + 1; n < end; n += 1) {
    const m = lineAt(n).trim().match(CLOSE_RE);
    if (m && m[1].length === colons) return n;
  }
  return -1;
}

// markdown-it block rule. `types` lists the fence types this rule handles;
// render(opener, body, env) returns the HTML for one fence. env is markdown-it's
// render environment; pass it on to any nested md.render so host state (such as
// Observable Framework's page context) is shared with the fence body.
function colonFenceRule(types, render) {
  return (state, startLine, endLine, silent) => {
    const lineText = (n) => state.src.slice(state.bMarks[n] + state.tShift[n], state.eMarks[n]);

    const opener = parseFenceOpener(lineText(startLine));
    if (!opener || !types.includes(opener.type)) return false;

    const closeLine = findFenceClose(lineText, startLine, endLine, opener.colons);
    if (closeLine < 0) return false; // unclosed fence stays plain text
    if (silent) return true;

    const body = state.getLines(startLine + 1, closeLine, state.tShift[startLine], false);
    const token = state.push('html_block', '', 0);
    token.content = render(opener, body, state.env);
    token.map = [startLine, closeLine + 1];
    state.line = closeLine + 1;
    return true;
  };
}

export {
  OPEN_RE,
  CLOSE_RE,
  parseFenceOpener,
  findFenceClose,
  colonFenceRule,
};
