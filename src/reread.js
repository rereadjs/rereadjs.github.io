
export const NAME = 'ReRead Editor';
export const VERSION = '1.0.260405';


/** --- Utility functions --- */
function isEnclosed(str, start = '(', end = ')', escape = '\\') {
  if (str.length < 2 || (!str.startsWith(start)) || (!str.endsWith(end))) {
    return false;
  }
  let depth = 1, isEscaped = false;
  for (let i = 1; i < str.length; i++) {
    const char = str[i];
    if (isEscaped) { // leaving escape mode
      isEscaped = false;
      continue;
    }
    if (char === escape) { // entering escape mode
      isEscaped = true;
      continue;
    }
    if (char === start) { // found start char
      depth++;
    } else if (char === end) { // found end char
      depth--;
      if (i === str.length - 1) break;
      if (depth <= 0) return false;
    }
  }
  return depth === 0;
}
function debounce(func, wait) {
  let timeout;
  return function () {
    const context = this, args = arguments;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), wait);
  };
}
const div = options => {
  const d = document.createElement('div');
  if (options?.children) {
    options.children.forEach(c => d.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    delete options.children;
  }
  if (options) {
    for (let opt in options) {
      d[opt] = options[opt];
    }
  }
  return d;
}
const input = options => {
  const d = document.createElement('input');
  if (options) {
    for (let opt in options) {
      d[opt] = options[opt];
    }
  }
  d.style.fontFamily = 'monospace';
  d.style.fieldSizing = 'content';
  d.style.minWidth = '2em';
  return d;
}
const toggle = options => {
  if (!options) options = {};
  let { children, selection, onclick } = options;
  if (!selection) selection = 0;
  delete options.children;
  delete options.onclick;
  const d = div(options);
  d.classList.add('rr-toggle');
  if (children && children.length) {
    children.forEach((c, i) => {
      let node;
      if (c?.nodeType) {
        node = d.appendChild(c);
      } else {
        node = d.appendChild(document.createElement('button'));
        node.innerText = c.toString();
      }
      if (selection === i) node.classList.add('selected');
    });
  };
  d.onclick = e => {
    const selected = e.currentTarget.querySelector('.selected');
    if (e.target === selected) return;
    selected.classList.remove('selected');
    e.target.classList.add('selected');
    if (onclick) onclick(e);
  }
  return d;
}

// convert plain text to re (escape all special chars)
function textToRe(str) {
  // escape \^$.*+?()[]{}| (other control chars [-/<>:=!] are context-based, should not be escaped)
  return str.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
}

// remove duplicates
function uniqueChars(str) {
  return [...new Set(str)].toSorted().join('');
}

// convert a word to a fuzzy regular expression string
function getFuzzyReStr(word) {
  const chars = word.split('');
  const parts = [];
  parts.push(chars.map(c => textToRe(c + c) + '?').join(''));
  for (let i = 1; i < chars.length; i++) {
    const prefix = textToRe(chars.slice(0, i).join(''));
    const suffix = textToRe(chars.slice(i + 1).join(''));
    parts.push(prefix + '.?' + suffix);
  }
  parts.push(word + '.');
  return '(' + parts.join('|') + ')';
}

// Helper to escape HTML characters.
const escapeHTML = s => (s + '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[m]));

// Compute plain-text value from segments.
const segmentsToValue = segs => segs.map(s => s.text).join('');

// Convert an individual segment into HTML.
function segmentToHtml(seg) {
  const escaped = escapeHTML(seg.text);
  const hintAttr = seg.hint ? ` title="${escapeHTML(seg.hint)}"` : '';
  let dataAttr = '';
  if (seg.data) {
    for (const prop in seg.data) {
      dataAttr += ` data-${prop}="${seg.data[prop].replaceAll('"', '&quot;')}"`;
    }
  }
  if (seg.token) return `<span class="${seg.token}" contenteditable="false"${hintAttr}${dataAttr}>${escaped}</span>`;
  return `<span>${escaped}</span>`;
}

// Helper for ArrowUp/Down navigation.
function getLineInfo(val, offset) {
  const start = val.lastIndexOf('\n', offset - 1) + 1;
  const nextNL = val.indexOf('\n', start);
  const end = nextNL === -1 ? val.length : nextNL;
  return { start, end, col: offset - start, nextNL };
}

// Convert a DOM range (relative to input) into a plain-text offset.
// Traverse editor DOM nodes to calculate character positions or extract content.
function traverse(node, input, callback) {
  for (let i = 0; i <= node.childNodes.length; i++) {
    if (callback(node, i, null, 0)) return true;
    const child = node.childNodes[i];
    if (!child) break;
    let len = -1;
    if (child.nodeType === Node.TEXT_NODE) len = child.nodeValue.length;
    else if (child.nodeType === Node.ELEMENT_NODE) {
      if (child.getAttribute('contenteditable') === 'false') len = child.textContent.length;
      else if (child.tagName === 'BR') len = (child !== input.lastChild ? 1 : 0);
    }
    if (len !== -1) { if (callback(node, i, child, len)) return true; }
    else if (traverse(child, input, callback)) return true;
  }
}

// Convert a DOM container/offset into a plain-text offset.
function posToOffset(input, container, offset) {
  if (!container) return 0;
  let charCount = 0;
  traverse(input, input, (parent, i, child, len) => {
    if (parent === container && i === offset) return true;
    if (child === container) { charCount += offset; return true; }
    if (len > 0) charCount += len;
  });
  return charCount;
}

// Convert a DOM range (relative to input) into a plain-text offset (start position).
function rangeToOffset(input, range) {
  return posToOffset(input, range?.startContainer, range?.startOffset);
}

// Cross-browser helper to get a Range from mouse coordinates.
function getRangeFromPoint(x, y) {
  if (document.caretRangeFromPoint) return document.caretRangeFromPoint(x, y);
  if (document.caretPositionFromPoint) {
    const pos = document.caretPositionFromPoint(x, y);
    if (!pos) return null;
    const range = document.createRange();
    range.setStart(pos.offsetNode, pos.offset);
    range.collapse(true);
    return range;
  }
  return null;
}

// Splice segments: replace the plain-text range [start, end) with newSegs.
function spliceSegments(segs, start, end, newSegs) {
  const result = [];
  let pos = 0, inserted = false;
  for (const seg of segs) {
    const len = seg.text.length, s = pos, e = pos + len;
    pos = e;
    if (e <= start) { result.push(seg); continue; }
    if (s >= end) {
      if (!inserted) { result.push(...newSegs); inserted = true; }
      result.push(seg); continue;
    }
    if (!seg.token) {
      const before = seg.text.slice(0, Math.max(0, start - s));
      const after = seg.text.slice(Math.min(len, end - s));
      if (before) result.push({ text: before, ...(seg.hint && { hint: seg.hint }) });
      if (!inserted) { result.push(...newSegs); inserted = true; }
      if (after) result.push({ text: after, ...(seg.hint && { hint: seg.hint }) });
    } else {
      if (!inserted) { result.push(...newSegs); inserted = true; }
      // Tokens are atomic, but we still need to decide if we keep them.
      // If we are here, it means the token was NOT replaced (e <= start or s >= end was true for others)
      // Actually, if we are in this loop and s < end and e > start, we are replacing it.
      // The logic for tokens is simpler: they are either in or out.
    }
  }
  if (!inserted) result.push(...newSegs);
  return result;
}

// Extract a slice of segments between [start, end).
function extractSegments(segs, start, end) {
  if (start === end) return [];
  const result = [];
  let pos = 0;
  for (const seg of segs) {
    const len = seg.text.length, s = pos, e = pos + len;
    pos = e;
    if (e <= start || s >= end) continue;
    if (!seg.token) result.push({ text: seg.text.slice(Math.max(0, start - s), Math.min(len, end - s)), ...(seg.hint && { hint: seg.hint }) });
    else result.push({ ...seg });
  }
  return result;
}

const segmentsToHtml = (segs, wrap = false) => {
  const html = segs.map(s => segmentToHtml(s)).join('');
  if (wrap) return `<pre style="white-space:pre;margin:0;display:inline;">${html}</pre>`;
  return html + (segs.at(-1)?.text?.endsWith('\n') ? '<br>' : '');
};

function getBackgroundColor(element) {
  let color = window.getComputedStyle(element).backgroundColor;
  if (color === 'rgba(0, 0, 0, 0)' || color === 'transparent') {
    return getBackgroundColor(element.parentElement);
  }
  return color;
}
function isDark(color) {
  const rgb = color.match(/\d+/g);
  return parseInt(rgb[0]) < 128 && parseInt(rgb[1]) < 128 && parseInt(rgb[2]) < 128;
}

function normalizeKeyDescriptor(str) {
  const parts = str.toUpperCase().split(/[+-]|\s+/);
  let ctrl = false, shift = false, alt = false, key = '';
  for (let p of parts) {
    p = p.trim();
    if (!p) continue;
    if (p === 'CTRL' || p === 'CONTROL') ctrl = true;
    else if (p === 'SHIFT') shift = true;
    else if (p === 'ALT') alt = true;
    else key = (p === 'SPACE' ? ' ' : p);
  }
  return (ctrl ? 'Ctrl+' : '') + (shift ? 'Shift+' : '') + (alt ? 'Alt+' : '') + key;
}

function restrictInput(input, regex = /[^a-zA-Z0-9 -]/g) {
  input.addEventListener('input', (e) => {
    const start = e.target.selectionStart;
    const end = e.target.selectionEnd;
    const val = e.target.value;
    const newVal = val.replace(regex, '');
    if (val !== newVal) {
      e.target.value = newVal;
      const prefix = val.slice(0, start);
      const newStart = prefix.replace(regex, '').length;
      const selection = val.slice(start, end);
      const newEnd = newStart + selection.replace(regex, '').length;
      e.target.setSelectionRange(newStart, newEnd);
    }
  });
}

export function injectTheme(rules, classPrefix, id) {
  let style = id && document.getElementById(id);
  if (!style) { style = document.createElement('style'); if (id) style.id = id; document.head.appendChild(style); }
  style.textContent = Object.entries(rules).map(([sel, dec]) => {
    if (classPrefix) sel = sel.replace(/\.([a-zA-Z0-9_-]+)/g, `.${classPrefix}$1`);
    const css = Object.entries(dec).map(([p, v]) => `  ${p.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()}: ${v};`).join('\n');
    return `${sel} {\n${css}\n}`;
  }).join('\n\n');
}


/** --- Constants --- */

// special symbols for the reread editor
const GROUP_START = "⦅";
const GROUP_END = "⦆";
const UNICODE_WRAP = ":";
const APPROXIMATE_MATCH = "≈";
const CUSTOM_PREFIX = "⍟";
const CHAR_NEWLINE = "⤶";
const CHAR_TAB = "⇥";
const CHAR_SPACE = "␣";
const DISJUNCTION = "𝙤𝙧";

const CASE_SENSITIVITY_BUTTON_NAME = 'Aa';
const CASE_INSENSITIVE_HINT = 'Ignoring case. Click to enable case-sensitivity.';
const CASE_SENSITIVE_HINT = 'Case-sensitive. Click to disable case-sensitivity.';
const CASE_INHERITABLE_HINT = 'Case-sensitivity inherited. Click to toggle.';

// css classes
const CLASS = {
  TOKEN: 'rr-token',
  COMMENT: 'rr-comment',
  NEWLINE: 'rr-newline',
  SYMBOL: 'rr-symbol',
  OPERATOR: 'rr-operator',
  CHAR: 'rr-char',
  TEXT: 'rr-text',
  TEXT_MAYBE: 'rr-text-maybe',
  CUSTOM: 'rr-custom',
  CUSTOM_CHARSET: 'rr-charset',
  CHARSET_NEGATIVE: 'rr-charset-negative',
  QUANT: 'rr-count',
  QUANT_LAZY: 'rr-count-lazy',
  CASE_BUTTON: 'rr-case-button',
  OPTION: 'rr-menu-option',
  ERROR: 'rr-error',
};

// display names for pattern categories
const CATEGORIES = {
  GENERAL: {
    name: '⁝',
    // hint: 'General options'
  },
  OPTIONAL_TEXT: {
    name: '¿Abc?',
    hint: 'Optional text patterns (i.e., text that may or may not appear).',
  },
  TEXT: {
    name: 'Abc',
    hint: 'Common text patterns.',
  },
  CHARACTER: {
    name: 'A',
    hint: 'Special characters (e.g., tab) and character classes (e.g., alphanumeric).',
  },
  COUNT: {
    name: 'A⨯',
    hint: `Quantifiers (number of occurrences of preceding character or group). After inserting a quantifier, click it to edit.`,
  },
  CUSTOM: {
    name: CUSTOM_PREFIX + '/' + APPROXIMATE_MATCH,
    hint: 'Custom and approximate text patterns.',
  },
};

// common regular expression patterns
const RE_COMMENT_OPEN = '(?=|';
const RE_COMMENT_CLOSE = ')';
const RE_NEWLINE = '(?=|\\n)';
const RE_UNKNOWN_CHAR_REGEX = /\[.*?\]/y;
const RE_CUSTOM_QUANT_REGEX = /\{.*?\}\??/y;
const RE_UNICODE_PATTERN = /\\p\{(.*?)\}/y;
const RE_NM_QUANT_REGEX = /^\{(\d+),(\d+)?\}\??$/;
const RE_N_QUANT_REGEX = /^\{(\d+)\}\??$/;
const RE_FLAG_GROUP_REGEX = /\(\?(?![=!<>])[^:]*:/y;
const RE_CUSTOM_TEXT = new RegExp(`\\(\\$((?:${CUSTOM_PREFIX}|${APPROXIMATE_MATCH})?[\\w ]+)\\||\\(\\?<(\\w+)>`, 'yu');

// unicode class names
const UNICODE_CLASS_NAMES = {
  "L": "Letter",
  "Ll": "Lowercase_Letter",
  "Lu": "Uppercase_Letter",
  "Lt": "Titlecase_Letter",
  "LC": "Cased_Letter",
  "Lm": "Modifier_Letter",
  "Lo": "Other_Letter",
  "M": "Mark",
  "Mn": "Nonspacing_Mark",
  "Mc": "Spacing_Mark",
  "Me": "Enclosing_Mark",
  "N": "Number",
  "Nd": "Decimal_Number",
  "Nl": "Letter_Number",
  "No": "Other_Number",
  "P": "Punctuation",
  "Pc": "Connector_Punctuation",
  "Pd": "Dash_Punctuation",
  "Ps": "Open_Punctuation",
  "Pe": "Close_Punctuation",
  "Pi": "Initial_Punctuation",
  "Pf": "Final_Punctuation",
  "Po": "Other_Punctuation",
  "S": "Symbol",
  "Sm": "Math_Symbol",
  "Sc": "Currency_Symbol",
  "Sk": "Modifier_Symbol",
  "So": "Other_Symbol",
  "Z": "Separator",
  "Zs": "Space_Separator",
  "Zl": "Line_Separator",
  "Zp": "Paragraph_Separator",
  "C": "Other",
  "Cc": "Control",
  "Cf": "Format",
  "Cs": "Surrogate",
  "Co": "Private_Use",
  "Cn": "Unassigned"
};


/** --- ReRead Spec --- */

const REREAD_GROUP_START = {
  rr: GROUP_START,
  class: CLASS.SYMBOL,
  re: "(",
  altre: ["(?:", "(?i:", "(?-i:"],
};
const REREAD_GROUP_END = {
  rr: GROUP_END,
  class: CLASS.SYMBOL,
  re: ")",
};

const REREAD_CHARACTER_SETS = [
  {
    "re": "[\\s\\S]",
    "altre": ["[\\S\\s]", "[^]", "\\p{Any}", "[\\W\\w]", "[\\w\\W]", "[\\D\\d]", "[\\d\\D]"],
    "char": "any char",
    "text": "any text",
    "optional": "any text?",
    "hint": "any character (including whitespace)",
    "hint_text": "one or more characters of any kind, including whitespace",
    "hint_optional": "zero or more characters of any kind, including whitespace"
  },
  {
    "re": "[.]",
    "altre": ["."],
    "char": "inline char",
    "text": "inline text",
    "optional": "inline text?",
    "hint": "any character except newline",
    "hint_text": "one or more of any character except newlines",
    "hint_optional": "zero or more of any character except newlines"
  },
  {
    "re": "(\\r?\\n)",
    "altre": ["\\r\\n", "\r\n", "\\r?\\n", "\r?\n", "[\\n]", "[\\r]", "[\\n\\r]", "[\\r\\n]", "\\n", "\n", "\\r", "\r", "(\\r|\\n)", "(\\n|\\r\\n)", "(\\r|\\n|\\r\\n)", "(\\n|\\r|\\r\\n)", "(\\n|\\r\\n|\\r)", "(\\r|\\r\\n|\\n)"],
    "char": "⤶",
    "hint": "newline (i.e., line break)"
  },
  {
    "re": "[\\t]",
    "altre": ["[\t]", "\\t", "\t"],
    "char": "tab",
    "hint": "tab character"
  },
  {
    "re": "[ ]",
    "altre": [" "],
    "text": "spaces",
    "optional": "spaces?",
    "hint_text": "one or more spaces",
    "hint_optional": "zero or more spaces"
  },
  {
    "re": "[ \\t]",
    "altre": ["[\\t ]"],
    "char": "space/tab",
    "text": "spaces/tabs",
    "optional": "spaces/tabs?",
    "hint": "space or tab character",
    "hint_text": "one or more space or tab characters",
    "hint_optional": "zero or more space or tab characters"
  },
  {
    "re": "[\\s]",
    "altre": ["\\s", "[^\\S]"],
    "char": "whitespace",
    "text": "whitespace",
    "optional": "whitespace?",
    "hint": "whitespace character (space, tab, newline)",
    "hint_text": "one or more spaces or tabs or newlines",
    "hint_optional": "zero or more spaces or tabs or newlines"
  },
  {
    "re": "[\\S]",
    "altre": ["\\S", "[^\\s]"],
    "char": "not whitespace",
    "text": "not whitespace",
    "optional": "not whitespace?",
    "hint": "any character except space, tab, or newline",
    "hint_text": "one or more of any character except spaces, tabs, or newlines",
    "hint_optional": "zero or more of any character except spaces, tabs, or newlines"
  },

  {
    "re": "[\\p{L}]",
    "altre": ["\\p{L}", "[^\\P{L}]", "\\p{Letter}", "[^\\P{Letter}]"],
    "char": "letter",
    "text": "letters",
    "optional": "letters?",
    "hint": "any letter (including international letters)",
    "hint_text": "one or more letters (including international letters)",
    "hint_optional": "zero or more letters (including international letters)",
    "sec": "alphanumeric",
    "unicode": true
  },
  {
    "re": "[A-Za-z]",
    "altre": ["[a-zA-Z]"],
    "char": "A-z",
    "text": "english",
    "optional": "english?",
    "hint": "any english letter",
    "hint_text": "one or more english letters",
    "hint_optional": "zero or more english letters",
    "sec": "alphanumeric"
  },
  {
    "re": "[\\p{Ll}]",
    "altre": ["\\p{Ll}", "[^\\P{Ll}]", "\\p{Lowercase_Letter}", "[^\\P{Lowercase_Letter}]"],
    "char": "lower",
    "text": "lower",
    "optional": "lower?",
    "hint": "any lowercase letter (including international letters)",
    "hint_text": "one or more lowercase letters (including international letters)",
    "hint_optional": "zero or more lowercase letters (including international letters)",
    "sec": "alphanumeric",
    "unicode": true
  },
  {
    "re": "[a-z]",
    "char": "a-z",
    "text": "lower en",
    "optional": "lower en?",
    "hint": "any lowercase english letter",
    "hint_text": "one or more lowercase english letters",
    "hint_optional": "zero or more lowercase english letters",
    "sec": "alphanumeric"
  },
  {
    "re": "[\\p{Lu}]",
    "altre": ["\\p{Lu}", "[^\\P{Lu}]", "\\p{Uppercase_Letter}", "[^\\P{Uppercase_Letter}]"],
    "char": "upper",
    "text": "upper",
    "optional": "upper?",
    "hint": "any uppercase letter (including international letters)",
    "hint_text": "one or more uppercase letters (including international letters)",
    "hint_optional": "zero or more uppercase letters (including international letters)",
    "sec": "alphanumeric",
    "unicode": true
  },
  {
    "re": "[A-Z]",
    "char": "A-Z",
    "text": "upper en",
    "optional": "upper en?",
    "hint": "any uppercase english letter",
    "hint_text": "one or more uppercase english letters",
    "hint_optional": "zero or more uppercase english letters",
    "sec": "alphanumeric"
  },
  {
    "re": "[\\d]",
    "altre": ["\\d", "[0-9]", "[^\\D]"],
    "char": "digit",
    "text": "digits",
    "optional": "digits?",
    "hint": "any digit 0-9",
    "hint_text": "one or more digits 0-9",
    "hint_optional": "zero or more digits 0-9",
    "sec": "alphanumeric"
  },
  {
    "re": "[\\p{N}]",
    "altre": ["\\p{N}", "[^\\P{N}]", "\\p{Number}", "[^\\P{Number}]"],
    "char": "numeric",
    "text": "numeric",
    "optional": "numeric?",
    "hint": "any numeric character (including roman numerals IVXLCDM, and non-standard and international numeric chars like ½ and १)",
    "hint_text": "one or more numeric characters (including roman numerals IVXLCDM, and non-standard and international numeric chars like ½ and १)",
    "hint_optional": "zero or more numeric characters (including roman numerals IVXLCDM, and non-standard and international numeric chars like ½ and १)",
    "sec": "alphanumeric",
    "unicode": true
  },
  {
    "re": "[\\dA-Fa-f]",
    "altre": ["[A-Fa-f\\d]", "[a-fA-F\\d]", "[A-F\\da-f]", "[a-f\\dA-F]", "[\\da-fA-F]", "[0-9a-fA-F]", "[a-f0-9A-F]", "[A-F0-9a-f]", "[0-9A-Fa-f]", "[a-fA-F0-9]", "[A-Fa-f0-9]"],
    "char": "hex",
    "text": "hex",
    "optional": "hex?",
    "hint": "any hexadecimal character (0-9, a-f, A-F)",
    "hint_text": "one or more hexadecimal characters (0-9, a-f, A-F)",
    "hint_optional": "zero or more hexadecimal characters (0-9, a-f, A-F)",
    "sec": "alphanumeric"
  },
  {
    "re": "[01]",
    "altre": ["[0-1]", "[10]"],
    "char": "0-1",
    "text": "binary",
    "optional": "binary?",
    "hint": "0 or 1",
    "hint_text": "one or more binary digits (0s or 1s)",
    "hint_optional": "zero or more binary digits (0s or 1s)",
    "sec": "alphanumeric"
  },
  {
    "re": "[\\p{L}\\d]",
    "altre": ["[\\d\\p{L}]", "[\\p{L}0-9]", "[0-9\\p{L}]"],
    "char": "letter/digit",
    "text": "letters/digits",
    "optional": "letters/digits?",
    "hint": "any letter (including international letters) or digit 0-9",
    "hint_text": "one or more letters (including international letters) or digits 0-9",
    "hint_optional": "zero or more letters (including international letters) or digits 0-9",
    "sec": "alphanumeric",
    "unicode": true
  },
  {
    "re": "[\\p{L}\\p{N}]",
    "altre": ["[\\p{N}\\p{L}]", "[\\p{Letter}\\p{Number}]", "[\\p{Number}\\p{Letter}]"],
    "char": "alphanumeric",
    "text": "alphanumeric",
    "optional": "alphanumeric?",
    "hint": "any alphanumeric character (including international letters and non-standard numeric chars like ½)",
    "hint_text": "one or more alphanumeric characters (including international letters and non-standard numeric chars like ½)",
    "hint_optional": "zero or more alphanumeric characters (including international letters and non-standard numeric chars like ½)",
    "sec": "alphanumeric",
    "unicode": true
  },
  {
    "re": "[A-Za-z\\d]",
    "altre": ["[\\da-zA-Z]", "[a-z\\dA-Z]", "[A-Z\\da-z]", "[\\dA-Za-z]", "[a-zA-Z\\d]", "[A-Za-z0-9]", "[a-zA-Z0-9]", "[0-9A-Za-z]", "[A-Z0-9a-z]", "[a-z0-9A-Z]", "[0-9a-zA-Z]"],
    "char": "A-z0-9",
    "text": "english/digits",
    "optional": "english/digits?",
    "hint": "any english letter or a digit",
    "hint_text": "one or more english letters or digits 0-9",
    "hint_optional": "zero or more english letters or digits 0-9",
    "sec": "alphanumeric"
  },
  {
    "re": "[\\w]",
    "altre": ["\\w", "[^\\W]", "[A-Za-z\\d_]", "[\\da-zA-Z_]", "[a-z\\dA-Z_]", "[A-Z\\da-z_]", "[\\dA-Za-z_]", "[a-zA-Z\\d_]", "[A-Za-z0-9_]", "[a-zA-Z0-9_]", "[0-9A-Za-z_]", "[A-Z0-9a-z_]", "[a-z0-9A-Z_]", "[0-9a-zA-Z_]", "[_A-Za-z\\d]", "[_\\da-zA-Z]", "[_a-z\\dA-Z]", "[_A-Z\\da-z]", "[_\\dA-Za-z]", "[_a-zA-Z\\d]", "[_A-Za-z0-9]", "[_a-zA-Z0-9]", "[_0-9A-Za-z]", "[_A-Z0-9a-z]", "[_a-z0-9A-Z]", "[_0-9a-zA-Z]", "[A-Z_a-z\\d]", "[\\d_a-zA-Z]", "[a-z_\\dA-Z]", "[A-Z_\\da-z]", "[\\d_A-Za-z]", "[a-z_A-Z\\d]", "[A-Z_a-z0-9]", "[a-z_A-Z0-9]", "[0-9_A-Za-z]", "[A-Z_0-9a-z]", "[a-z_0-9A-Z]", "[0-9_a-zA-Z]", "[A-Za-z_\\d]", "[\\da-z_A-Z]", "[a-z\\d_A-Z]", "[A-Z\\d_a-z]", "[\\dA-Z_a-z]", "[a-zA-Z_\\d]", "[A-Za-z_0-9]", "[a-zA-Z_0-9]", "[0-9A-Z_a-z]", "[A-Z0-9_a-z]", "[a-z0-9_A-Z]", "[0-9a-z_A-Z]"],
    "char": "A-z0-9_",
    "hint": "any english letter or a digit or underscore",
    "sec": "alphanumeric"
  },

  {
    "re": "[\\p{P}]",
    "altre": ["\\p{P}", "[^\\P{P}]"],
    "char": "punctuation",
    "text": "punctuation",
    "optional": "punctuation?",
    "hint": "any punctuation character",
    "hint_text": "one or more punctuation characters",
    "hint_optional": "zero or more punctuation characters",
    "sec": "other",
    "unicode": true
  },
  {
    "re": "[\\p{S}]",
    "altre": ["\\p{S}", "[^\\P{S}]"],
    "char": "symbol",
    "text": "symbols",
    "optional": "symbols?",
    "hint": "any symbol",
    "hint_text": "one or more symbols",
    "hint_optional": "zero or more symbols",
    "sec": "other",
    "unicode": true
  },
  {
    "re": "[\\p{Emoji}]",
    "altre": ["\\p{Emoji}", "[^\\P{Emoji}]"],
    "char": "emoji",
    "text": "emojis",
    "optional": "emojis?",
    "hint": "any emoji",
    "hint_text": "one or more emojis",
    "hint_optional": "zero or more emojis",
    "sec": "other",
    "unicode": true
  },
  {
    "re": "[\\p{P}\\p{S}\\p{E}]",
    "altre": ["[\\p{P}\\p{E}\\p{S}]", "[\\p{S}\\p{P}\\p{E}]", "[\\p{S}\\p{E}\\p{P}]", "[\\p{E}\\p{P}\\p{S}]", "[\\p{E}\\p{S}\\p{P}]"],
    "char": "special char",
    "text": "special chars",
    "optional": "special chars?",
    "hint": "any special character (punctuation, symbol, or emoji)",
    "hint_text": "one or more special characters (punctuations, symbols, or emojis)",
    "hint_optional": "zero or more special characters (punctuations, symbols, or emojis)",
    "sec": "other",
    "unicode": true
  },
  {
    "re": "[\\P{L}]",
    "altre": ["\\P{L}", "[^\\p{L}]"],
    "char": "not letter",
    "text": "not letters",
    "optional": "not letters?",
    "hint": "any character that is not a letter",
    "hint_text": "one or more characters that are not letters",
    "hint_optional": "zero or more characters that are not letters",
    "sec": "other",
    "unicode": true
  },
  {
    "re": "[^A-Za-z]",
    "altre": ["[^a-zA-Z]"],
    "char": "not A-z",
    "text": "not english",
    "optional": "not english?",
    "hint": "any character that is not an english letter A-z",
    "hint_text": "one or more characters that are not english letters A-z",
    "hint_optional": "zero or more characters that are not english letters A-z",
    "sec": "other"
  },
  {
    "re": "[^\\p{L}\\d]",
    "altre": ["[^\\d\\p{L}]", "[^\\p{L}0-9]", "[^0-9\\p{L}]"],
    "char": "not letter/digit",
    "text": "not letters/digits",
    "optional": "not letters/digits?",
    "hint": "any character that is not a letter or digit",
    "hint_text": "one or more characters that are not letters or digits",
    "hint_optional": "zero or more characters that are not letters or digits",
    "sec": "other",
    "unicode": true
  },
  {
    "re": "[^\\p{L}\\p{N}]",
    "altre": ["[^\\p{N}\\p{L}]"],
    "char": "not alphanumeric",
    "text": "not alphanumeric",
    "optional": "not alphanumeric?",
    "hint": "any character that is not alphanumeric",
    "hint_text": "one or more characters that are not alphanumeric",
    "hint_optional": "zero or more characters that are not alphanumeric",
    "sec": "other",
    "unicode": true
  },
  {
    "re": "[^A-Za-z\\d]",
    "altre": ["[^a-zA-Z\\d]", "[^\\dA-Za-z]", "[^A-Z\\da-z]", "[^a-z\\dA-Z]", "[^\\da-zA-Z]", "[^A-Za-z0-9]", "[^a-zA-Z0-9]", "[^0-9A-Za-z]", "[^A-Z0-9a-z]", "[^a-z0-9A-Z]", "[^0-9a-zA-Z]"],
    "char": "not A-z0-9",
    "text": "not english/digits",
    "optional": "not english/digits?",
    "hint": "any character that is not an english letter or a digit",
    "hint_text": "one or more characters that are not english letters and not digits",
    "hint_optional": "zero or more characters that are not english letters and not digits",
    "sec": "other"
  },
  {
    "re": "[\\W]",
    "altre": ["\\W", "[^\\w]", "[^A-Za-z\\d_]", "[^\\da-zA-Z_]", "[^a-z\\dA-Z_]", "[^A-Z\\da-z_]", "[^\\dA-Za-z_]", "[^a-zA-Z\\d_]", "[^A-Za-z0-9_]", "[^a-zA-Z0-9_]", "[^0-9A-Za-z_]", "[^A-Z0-9a-z_]", "[^a-z0-9A-Z_]", "[^0-9a-zA-Z_]", "[^_A-Za-z\\d]", "[^_\\da-zA-Z]", "[^_a-z\\dA-Z]", "[^_A-Z\\da-z]", "[^_\\dA-Za-z]", "[^_a-zA-Z\\d]", "[^_A-Za-z0-9]", "[^_a-zA-Z0-9]", "[^_0-9A-Za-z]", "[^_A-Z0-9a-z]", "[^_a-z0-9A-Z]", "[^_0-9a-zA-Z]", "[^A-Z_a-z\\d]", "[^\\d_a-zA-Z]", "[^a-z_\\dA-Z]", "[^A-Z_\\da-z]", "[^\\d_A-Za-z]", "[^a-z_A-Z\\d]", "[^A-Z_a-z0-9]", "[^a-z_A-Z0-9]", "[^0-9_A-Za-z]", "[^A-Z_0-9a-z]", "[^a-z_0-9A-Z]", "[^0-9_a-zA-Z]", "[^A-Za-z_\\d]", "[^\\da-z_A-Z]", "[^a-z\\d_A-Z]", "[^A-Z\\d_a-z]", "[^\\dA-Z_a-z]", "[^a-zA-Z_\\d]", "[^A-Za-z_0-9]", "[^a-zA-Z_0-9]", "[^0-9A-Z_a-z]", "[^A-Z0-9_a-z]", "[^a-z0-9_A-Z]", "[^0-9a-z_A-Z]"],
    "char": "not A-z0-9_",
    "hint": "any character that is not an english letter or a digit or underscore",
    "sec": "other"
  },
  {
    "re": "[\\D]",
    "altre": ["[^\\d]", "\\D"],
    "char": "not digit",
    "text": "not digits",
    "optional": "not digits?",
    "hint": "any character that is not a digit",
    "hint_text": "one or more characters that are not digits",
    "hint_optional": "zero or more characters that are not digits",
    "sec": "other"
  }
];

const REREAD_COMMON_PATTERNS = [
  {
    "re": "-?\\d+",
    "text": "integer",
    "hint_text": "one or more digits, optionally preceded by a negative sign"
  },
  {
    "re": "-?\\d+(\\.\\d+)?",
    "text": "number",
    "hint_text": "any standard number (e.g., -12.34, 0.5, 3); does not match scientific notation; does not capture numbers starting with a period (.2 doesn't match, but 0.2 matches)"
  },
  {
    "re": "[a-zA-Z_][a-zA-Z0-9_]*",
    "text": "var",
    "hint_text": "valid variable name (letters A-z, digits 0-9, underscores _, cannot start with a digit)"
  },
  {
    "re": "[a-zA-Z_$][a-zA-Z0-9_$]*",
    "text": "js var",
    "hint_text": "valid javascript variable name (letters A-z, digits 0-9, underscores _, dollar signs $, cannot start with a digit)"
  },
  {
    "re": "(?<!\\\\)\"(\\\\\"|[^\"\\n])*\"",
    "text": "\"...\"",
    "hint_text": "text in double quotes (e.g., \"hello world\")"
  },
  {
    "re": "(?<!\\\\)'(\\\\'|[^'\\n])*'",
    "text": "'...'",
    "hint_text": "text in single quotes (e.g., 'hello world')"
  },
  {
    "re": "\\b[^.\\s@]+(\\.[^.\\s@]+)*@([^.\\s@]+\\.)+[^.\\s@]{2,63}\\b",
    "text": "email",
    "hint_text": "email address (e.g., hello@example.com)"
  },
  {
    "re": "(https?:\\/\\/\\[[0-9a-fA-F:.]+((%|%25)\\w+)?\\]|(https?:\\/\\/)?(localhost|((25[0-5]|2[0-4]\\d|[01]?\\d?\\d)\\.){3}(25[0-5]|2[0-4]\\d|[01]?\\d?\\d)|([\\p{L}\\d]([-\\p{L}\\d]*[\\p{L}\\d])?\\.)+[\\p{L}\\d]{2,63})\\b)(:\\d+)?(\\/([\\p{L}\\d\\-._~:\\/?#\\[\\]@!$&'()*+,;=]|%[0-9A-Fa-f]{2})*)?",
    "text": "url",
    "hint_text": "URL (e.g., https://www.example.com/path?query=value)",
    "unicode": true
  },
  {
    "re": "((25[0-5]|2[0-4]\\d|[01]?\\d?\\d)\\.){3}(25[0-5]|2[0-4]\\d|[01]?\\d?\\d)",
    "text": "ip",
    "hint_text": "IPv4 address (e.g., 192.168.1.1)"
  },
  {
    "re": "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}",
    "text": "uuid",
    "hint_text": "UUID (e.g., 123e4567-e89b-12d3-a456-426655440000)"
  },
  {
    "re": "([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})",
    "text": "MAC",
    "hint_text": "MAC address (e.g., 00:11:22:33:44:55)"
  },
  {
    "re": "<[a-zA-Z][a-zA-Z0-9]*(\\s+[^>]*)?>",
    "text": "<tag ...>",
    "hint_text": "HTML/XML opening tag (e.g., <div id=\"main\">)"
  },
  {
    "re": "<\\/[a-zA-Z][a-zA-Z0-9]*>",
    "text": "</tag>",
    "hint_text": "HTML/XML closing tag (e.g., </div>)"
  },
  {
    "re": "#([0-9a-fA-F]{3}){1,2}",
    "text": "hex color",
    "hint_text": "hexadecimal color code (e.g., #FFF or #FFFFFF)"
  },
  {
    "re": "\\d{4}-\\d{2}-\\d{2}",
    "text": "YYYY-MM-DD",
    "hint_text": "date in YYYY-MM-DD format (e.g., 2023-10-27)"
  },
  {
    "re": "(0?[1-9]|1[0-2])[\\/](0?[1-9]|[12]\\d|3[01])[\\/](\\d{2})?\\d{2}",
    "text": "M/D/YY",
    "hint_text": "date in M/D/YY or MM/DD/YYYY format (e.g., 1/1/23 or 01/01/2023)"
  },
  {
    "re": "(0?[1-9]|[12]\\d|3[01])[\\/](0?[1-9]|1[0-2])[\\/](\\d{2})?\\d{2}",
    "text": "D/M/YY",
    "hint_text": "date in D/M/YY or DD/MM/YYYY format (e.g., 1/1/23 or 01/01/2023)"
  },
  {
    "re": "(0?[0-9]|1[0-9]|2[0-3]):[0-5][0-9]",
    "text": "hh:mm",
    "hint_text": "time in hh:mm format (e.g., 14:30 or 1:59)"
  },
  {
    "re": "(0?[0-9]|1[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]",
    "text": "hh:mm:ss",
    "hint_text": "time in hh:mm:ss format (e.g., 14:30:45 or 1:59:59)"
  },
  {
    "re": "(0?[0-9]|1[0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]\\.[0-9]{3}",
    "text": "hh:mm:ss.SSS",
    "hint_text": "time in hh:mm:ss.SSS format (e.g., 14:30:45.123 or 1:59:59.999)"
  }
];

const REREAD_QUANTIFIERS_GREEDY = [
  // greedy quantifiers
  {
    re: "*",
    altre: ["{0,}"],
    name: "0+",
    hint: "zero or more instances of preceding character or group (more is preferred)",
    cat: CATEGORIES.COUNT,
    sec: 'x+'
  },
  {
    re: "+",
    altre: ["{1,}"],
    name: "1+",
    hint: "one or more instances of preceding character or group (more is preferred)",
    cat: CATEGORIES.COUNT,
    class: CLASS.QUANT,
    sec: 'x+'
  },
  ...[2, 3, 4, 5].map(x => ({
    re: `{${x},}`,
    name: `${x}+`,
    hint: `${x} or more instances of preceding character or group (more is preferred)`,
    cat: CATEGORIES.COUNT,
    class: CLASS.QUANT,
    sec: 'x+'
  })),

  {
    re: "?",
    altre: ["{0,1}"],
    name: "0-1",
    hint: "zero or one instances of preceding character or group (one is preferred)",
    cat: CATEGORIES.COUNT,
    class: CLASS.QUANT,
    sec: 'x-y'
  },
  ...[2, 3, 4].map(x => ({
    re: `{0,${x}}`,
    name: `0-${x}`,
    hint: `between 0 and ${x} instances of preceding character or group (more is preferred)`,
    cat: CATEGORIES.COUNT,
    class: CLASS.QUANT,
    sec: 'x-y'
  })),
  ...[3, 4].map(x => ({
    re: `{2,${x}}`,
    name: `2-${x}`,
    hint: `between 2 and ${x} instances of preceding character or group (more is preferred)`,
    cat: CATEGORIES.COUNT,
    class: CLASS.QUANT,
    sec: 'x-y'
  })),

];

const REREAD_QUANTIFIERS_EXACT = [2, 3, 4, 5, 6, 7, 8, 9, 10].map(x => ({
  re: `{${x}}`,
  name: `${x}`,
  hint: `exactly ${x} instances of preceding character or group`,
  cat: CATEGORIES.COUNT,
  class: CLASS.QUANT,
  sec: 'x'
}));

const NEWLINE_PATTERN = REREAD_CHARACTER_SETS.find(p => p.re === '\\n' || p.altre?.includes('\\n'));
const REREAD_HARD_NEWLINE = {
  re: NEWLINE_PATTERN.re + RE_NEWLINE,
  rr: "⤶\n",
  class: CLASS.CHAR,
  altre: NEWLINE_PATTERN.altre?.map(re => re + RE_NEWLINE),
};

const REREAD = [
  // unsupported
  { re: '\\b', error: 'Unsupported regular expression: Boundary character \\b' },
  { re: '\\B', error: 'Unsupported regular expression: Boundary character \\B' },
  { re: '\\k', error: 'Unsupported regular expression: Backreference character \\k' },
  ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(x => ({
    re: `\\${x}`, error: `Unsupported regular expression: Backreference or octal sequence \\${x}`
  })),
  { re: '(?=', error: 'Unsupported regular expression: Lookahead functionality (?=)' },
  { re: '(?!', error: 'Unsupported regular expression: Lookahead functionality (?!)' },
  { re: '(?<=', error: 'Unsupported regular expression: Lookbehind functionality (?<=)' },
  { re: '(?<!', error: 'Unsupported regular expression: Lookbehind functionality (?<!)' },
  { re: '(?<', error: 'Unsupported regular expression: Named capture group (?<Name>)' },
  { re: '\\c', error: 'Unsupported regular expression: Control character \\c' },
  { re: '\\x', error: 'Unsupported regular expression: Hexadecimal escape \\x' },
  { re: '\\u', error: 'Unsupported regular expression: Unicode escape \\u' },

  // group start/end
  REREAD_GROUP_START,
  REREAD_GROUP_END,

  // disjunction
  {
    re: "|",
    name: DISJUNCTION,
    // name: "or",
    rr: DISJUNCTION,
    // rr: "𝙤𝙧",
    hint: `${DISJUNCTION} operator (i.e., disjunction); used to indicate valid alternatives (e.g., HELLO${DISJUNCTION}HI)`,
    example: `\"(HELLO${DISJUNCTION}HI) WORLD\" will match either \"HELLO WORLD\" or \"HI WORLD\"`,
    class: CLASS.OPERATOR,
  },

  // newline with commented newline
  REREAD_HARD_NEWLINE,

  // characters
  ...REREAD_CHARACTER_SETS.filter(p => p.char).map(p => ({
    name: p.char,
    cat: CATEGORIES.CHARACTER,
    re: p.re,
    altre: p.altre,
    hint: p.hint,
    sec: p.sec,
    class: CLASS.CHAR,
  })),
  // text
  ...REREAD_CHARACTER_SETS.filter(p => p.text).map(p => ({
    name: p.text,
    cat: CATEGORIES.TEXT,
    re: p.re + '+',
    altre: p.altre?.map(re => re + '+'),
    hint: p.hint_text,
    sec: p.sec,
    class: CLASS.TEXT,
  })),
  // optional text
  ...REREAD_CHARACTER_SETS.filter(p => p.optional).map(p => ({
    name: p.optional,
    cat: CATEGORIES.OPTIONAL_TEXT,
    re: p.re + '*',
    altre: p.altre?.map(re => re + '*'),
    hint: p.hint_optional,
    sec: p.sec,
    class: CLASS.TEXT_MAYBE,
  })),
  // common text patterns
  ...REREAD_COMMON_PATTERNS.map(p => ({
    name: p.text,
    cat: CATEGORIES.TEXT,
    re: p.re,
    altre: p.altre,
    needsParen: true,
    hint: p.hint_text,
    sec: 'token',
    class: CLASS.TEXT,
  })),

  // exact and greedy quantifiers
  ...REREAD_QUANTIFIERS_EXACT.map(p => {
    return {
      ...p,
      class: CLASS.QUANT,
    }
  }),
  ...REREAD_QUANTIFIERS_GREEDY.map(p => {
    return {
      ...p,
      class: CLASS.QUANT,
    }
  }),

  // lazy quantifiers
  ...REREAD_QUANTIFIERS_GREEDY.map(p => {
    return {
      class: CLASS.QUANT_LAZY,
      re: p.re + '?',
      altre: p.altre?.map(re => re + '?'),
      rr: p.name,
      hint: p.hint.replaceAll('more is preferred', 'less is preferred').replaceAll('one is preferred', 'zero is preferred'),
    }
  }),


];

const RE_DICT = {};
for (const p of REREAD) {
  if (p.re) {
    if (!RE_DICT[p.re]) RE_DICT[p.re] = p;
    if (p.altre) p.altre.forEach(a => { if (!RE_DICT[a]) RE_DICT[a] = p });
  }
}
const sortedKnownRe = Object.keys(RE_DICT).toSorted((re1, re2) => re1.length > re2.length ? -1 : 1);

// help/documentation html
const HELP = /* html */`
<div style="font-size: 110%; font-weight: bold;">${NAME} (${VERSION})</div>
<p>This is a text pattern editor that produces regular expressions.</p>

<b>Notes</b>
<ul>
  <li>Hover over any colored token or button to see a tooltip with more information.</li>
  <li>Click any token with a border to edit it.</li>
</ul>

<b>Export to and Import from Regular Expressions</b>
<ul>
  <li>Hit Ctrl+Shift+C (export-copy) to convert the entire pattern in editor to a regular expression and copy it to the clipboard.</li>
  <li>Hit Ctrl+Shift+V (import-paste) to replace editor content with a text pattern based on the regular expression from the clipboard.</li>
  <li>When importing from a regular expression
    <ul>
      <li>non-capturing groups (?:...), most group flags (?igm-igm:...), and start/end anchors (^ and $) are ignored (see details below);</li>
      <li>lookahead, lookbehind, backreference, and named capture group functionality is not supported (will display error).</li>
    </ul>
  </li>
</ul>

<b>Line Breaks</b>
<ul>
  <li>When you hit Enter, newline character <span class="${CLASS.CHAR} ${CLASS.TOKEN}">${CHAR_NEWLINE}</span> is added to the text pattern in the editor, and a physical line-break is inserted.</li>
  <li>When you hit Shift+Enter (or select the <span class="${CLASS.CHAR} ${CLASS.TOKEN}">${CHAR_NEWLINE}</span> from the toolbar), newline character <span class="${CLASS.CHAR} ${CLASS.TOKEN}">${CHAR_NEWLINE}</span> is added to the text pattern in the editor, but no physical line-break is inserted.</li>
  <li>You can add a line-break without inserting a newline character by hitting Alt+Enter. Such line-breaks are ignored in the regular expression (i.e., will not be a part of the text pattern).</li>
</ul>

<b>Start/End of Text</b>
<ul>
  <li>This editor automatically inserts anchors to ensure the pattern matches the entire text. If you desire alternate behavior (i.e., allowing any text before or after your pattern), you must insert the [any text?] pattern (hit Alt+A or choose [any text?] from the toolbar under ${CATEGORIES.OPTIONAL_TEXT.name}) before/after the rest of the pattern.</li>
  <li>When importing from a regular expression, all start/end anchors (i.e., ^ and $) are ignored.</li>
</ul>

<b>Case Sensitivity and other Regular Expression flags</b>
<ul>
  <li>By default, the editor produces patterns that ignore case sensitivity. Click the [${CASE_SENSITIVITY_BUTTON_NAME}] button in the toolbar to toggle case-sensitivity.</li>
  <li>Case-sensitivity setting is global to the entire pattern. Custom text patterns (i.e., those beggining with <span class="${CLASS.TEXT} ${CLASS.TOKEN}">${CUSTOM_PREFIX}</span>) may optionally have their own case-sensitivity settings.</li>
  <li>When importing from a regular expression, most group flags (i.e., (?igm-igm:...) are ignored, with the exception of the top-level case-sensitivity flag (i.e., (?i:...) or (?-i:...)) and case-sensitivy flags inside custom named text patterns.</li>
</ul>

<b>Comments</b>
<ul>
  <li>You can add a comment to the text pattern by hitting Alt+/ (or clicking the Comment button in the toolbar). Comments are ignored in the regular expression (i.e., will not be a part of the text pattern).</li>
</ul>

<b>All Keyboard Shortcuts</b>
<ul>
  <li>Ctrl+C: Copy selected editor content to the clipboard.</li>
  <li>Ctrl+V: Paste clipboard content to editor.</li>
  <li>Ctrl+Shift+C: Export entire pattern as a regular expression; copy to clipboard.</li>
  <li>Ctrl+Shift+V: Import regular expression from clipboard; replace editor content with imported pattern.</li>
  <li>Ctrl+Z: Undo the last change.</li>
  <li>Ctrl+Shift+Z: Redo the last change.</li>
  <li>Enter: Insert <span class="${CLASS.CHAR} ${CLASS.TOKEN}">${RE_DICT['\\n'].name}</span> (newline character), and move cursor to next line.</li>
  <li>Shift+Enter: Insert <span class="${CLASS.CHAR} ${CLASS.TOKEN}">${RE_DICT['\\n'].name}</span> (newline character).</li>
  <li>Alt+Enter: Insert a line break (i.e., newline character that is not a part of the text pattern).</li>
  <li>Shift+Space: Insert <span class="${CLASS.TEXT_MAYBE} ${CLASS.TOKEN}">${RE_DICT[' *'].name}</span> (zero or more spaces).</li>
  <li>Tab: Insert <span class="${CLASS.CHAR} ${CLASS.TOKEN}">${RE_DICT['\\t'].name}</span> (tab character).</li>
  <li>Shift+Tab: Insert <span class="${CLASS.TEXT_MAYBE} ${CLASS.TOKEN}">${RE_DICT['[\\s]*'].name}</span> (zero or more of any whitespace character: spaces, tabs, newlines).</li>
  <li>Alt+A: Insert <span class="${CLASS.TEXT_MAYBE} ${CLASS.TOKEN}">${RE_DICT['[\\s\\S]*'].name}</span> (zero or more of any character).</li>
  <li>Alt+Shift+A: Insert <span class="${CLASS.TEXT} ${CLASS.TOKEN}">${RE_DICT['[\\s\\S]+'].name}</span> (one or more of any character).</li>
  <li>Alt+C: Insert <span class="${CLASS.CHAR} ${CLASS.TOKEN}">${RE_DICT['[\\s\\S]'].name}</span> (any character).</li>
  <li>Alt+O: Insert <span class="${CLASS.OPERATOR} ${CLASS.TOKEN}">${DISJUNCTION}</span> (i.e., disjunction).</li>
  <li>Alt+[: Add grouping parentheses <span class="${CLASS.SYMBOL} ${CLASS.TOKEN}">${GROUP_START}${GROUP_END}</span> around current selection.</li>
  <li>Alt+]: Insert end of group parenthesis <span class="${CLASS.SYMBOL} ${CLASS.TOKEN}">${GROUP_END}</span>.</li>
  <li>Alt+0: Insert <span class="${CLASS.QUANT} ${CLASS.TOKEN}">${RE_DICT['*'].name}</span> (zero or more instances of the preceding token or group).</li>
  <li>Alt+1: Insert <span class="${CLASS.QUANT} ${CLASS.TOKEN}">${RE_DICT['+'].name}</span> (one or more instances of the preceding token or group).</li>
  <li>Alt+2: Insert <span class="${CLASS.QUANT} ${CLASS.TOKEN}">${RE_DICT['{2,}'].name}</span> (two or more instances of the preceding token or group).</li>
  <li>Alt+3: Insert <span class="${CLASS.QUANT} ${CLASS.TOKEN}">${RE_DICT['{3,}'].name}</span> (three or more instances of the preceding token or group).</li>
  <li>Alt+4: Insert <span class="${CLASS.QUANT} ${CLASS.TOKEN}">${RE_DICT['{4,}'].name}</span> (four or more instances of the preceding token or group).</li>
  <li>Alt+5: Insert <span class="${CLASS.QUANT} ${CLASS.TOKEN}">${RE_DICT['{5,}'].name}</span> (five or more instances of the preceding token or group).</li>
  <li>Alt+Shift+2: Insert <span class="${CLASS.QUANT} ${CLASS.TOKEN}">${RE_DICT['{2}'].name}</span> (two instances of the preceding token or group).</li>
  <li>Alt+Shift+3: Insert <span class="${CLASS.QUANT} ${CLASS.TOKEN}">${RE_DICT['{3}'].name}</span> (three instances of the preceding token or group).</li>
  <li>Alt+Shift+4: Insert <span class="${CLASS.QUANT} ${CLASS.TOKEN}">${RE_DICT['{4}'].name}</span> (four instances of the preceding token or group).</li>
  <li>Alt+Shift+5: Insert <span class="${CLASS.QUANT} ${CLASS.TOKEN}">${RE_DICT['{5}'].name}</span> (five instances of the preceding token or group).</li>
  <li>Alt+/: Insert comment (comments are ignored in the regular expression).</li>
</ul>
`;


/** --- ReRead Buttons and Actions --- */

// buttons for inserting reread patterns
const rereadBtns = [
  // case button
  {
    name: CASE_SENSITIVITY_BUTTON_NAME,
    hint: CASE_INSENSITIVE_HINT,
    class: CLASS.CASE_BUTTON,
    action: editor => {
      if (editor.caseInheritance) {
        if (editor.caseButton.classList.contains('selected')) {
          editor.caseButton.classList.remove('selected');
          editor.caseButton.classList.add('deselected');
        } else if (editor.caseButton.classList.contains('deselected')) {
          editor.caseButton.classList.remove('deselected');
        } else {
          editor.caseButton.classList.add('selected');
        }
      } else {
        editor.caseButton.classList.toggle('selected');
      }
      editor.caseButton.title = editor.caseButton.classList.contains('selected') ? CASE_SENSITIVE_HINT : editor.caseButton.classList.contains('deselected') ? CASE_INHERITABLE_HINT : CASE_INSENSITIVE_HINT;
      editor.update();
    },
  },

  // group button
  {
    name: `${GROUP_START} ${GROUP_END}`,
    hint: 'group',
    // class: CLASS.SYMBOL,
    cat: CATEGORIES.operator,
    action: editor => {
      const selected = editor.getSelection();
      const { start, end } = editor.replaceSelection([
        makeToken(REREAD_GROUP_START),
        ...selected,
        makeToken(REREAD_GROUP_END)
      ]);
      if (!selected.length) {
        editor.setCursorOffset(start + REREAD_GROUP_START.rr.length);
      }
      editor.focus();
    },
  },

  // all reread token buttons
  ...REREAD.filter(p => p.name),

  // custom token button
  {
    name: CUSTOM_PREFIX + 'custom',
    hint: 'custom text pattern',
    class: CLASS.CUSTOM,
    cat: CATEGORIES.CUSTOM,
    action: editor => {
      const rrSegments = editor.getSelection();
      const { start } = editor.replaceSelection(makeToken({
        rr: CUSTOM_PREFIX + (rrSegments[0]?.text || 'custom text pattern'),
        data: { re: rrToRe(rrSegments).slice(1, -1) },
        class: CLASS.CUSTOM,
        hint: 'custom text pattern',
      }));
      setTimeout(() => editCustom(editor, editor.getTokenAt(start)), 100);
      // editor.focus();
    },
  },

  // approximate match button
  {
    name: APPROXIMATE_MATCH + 'approximate',
    hint: 'approximate match',
    class: CLASS.CUSTOM,
    cat: CATEGORIES.CUSTOM,
    action: editor => {
      const txt = editor.getSelection()[0]?.text || '';
      const { start } = editor.replaceSelection(makeToken({
        rr: APPROXIMATE_MATCH + txt,
        data: { re: getFuzzyReStr(txt) },
        class: CLASS.CUSTOM,
        hint: 'something similar to "' + txt + '"',
      }));
      setTimeout(() => editCustom(editor, editor.getTokenAt(start)), 100);
      // editor.focus();
    },
  },

  // custom charset button
  {
    name: '[custom]',
    hint: 'custom character set',
    class: CLASS.CUSTOM_CHARSET,
    cat: CATEGORIES.CHARACTER,
    action: editor => {
      const txt = editor.getSelection()[0]?.text || '';
      const rr = txt ? uniqueChars(txt) : 'abc';
      const { start } = editor.replaceSelection(makeToken({
        rr,
        data: { re: customCharNameToRe(rr) },
        class: CLASS.CUSTOM_CHARSET,
        hint: 'any of the characters: ' + rr,
      }));
      setTimeout(() => editCustomCharset(editor, editor.getTokenAt(start)), 100);
    },
  },

  // comment button
  {
    name: `COMMENT`,
    hint: 'add a comment (the comment will be ignored for pattern matching)',
    action: insertComment,
  },

  // help/documentation
  {
    name: 'ⓘ',
    // name: 'ℹ️ Help & Documentation',
    hint: 'help/documentation',
    class: CLASS.OPTION,
    // cat: CATEGORIES.GENERAL,
    // sec: 'help',
    action: editor => {
      // const editorContainer = editor.getContainer();
      // const rect = editorContainer.getBoundingClientRect();
      const widget = popupWidget(editor, null, [
        div({ innerHTML: HELP, style: "white-space: normal; overflow:auto; padding: 0.5em;" }),
      ]);
      widget.classList.add('rr-centered-popup');
      const okButton = div({ className: 'rr-button', textContent: 'OK', onclick: () => widget.close(false), style: 'margin-top: 1em; min-width: 4em;' });
      widget.appendChild(okButton);
      okButton.tabIndex = -1;
      okButton.focus();
      // widget.style.flexDirection = 'column';
      // widget.style.alignItems = 'flex-start';
      widget.tabIndex = -1;
      widget.onkeydown = e => {
        widget.close(false);
        e.preventDefault();
        e.stopPropagation();
      };
      const onblur = (e) => { if (!(widget.contains(e.relatedTarget) || e.relatedTarget === widget)) widget.close(false); };
      widget.onblur = onblur;
      okButton.onblur = onblur;
    },
  },
];

// assign default actions for all buttons without actions
function defaultAction(pattern) {
  return function (editor) {
    editor.replaceSelection(makeToken(pattern));
    // editor.focus();
  };
}
function defaultGroupAction(pattern) {
  return function (editor) {
    const selection = editor.getSelection();
    if (!selection.length) {
      editor.replaceSelection(makeToken(pattern));
    } else if (selection.length === 1 && (selection[0].token || selection[0].text.length === 1)) {
      editor.replaceSelection([selection[0], makeToken(pattern)]);
    } else {
      editor.replaceSelection([
        makeToken(REREAD_GROUP_START),
        ...selection,
        makeToken(REREAD_GROUP_END),
        makeToken(pattern)
      ]);
    }
    editor.focus();
  };
}
for (const btn of rereadBtns) {
  if (!btn.action) {
    if (btn.cat === CATEGORIES.COUNT) {
      btn.action = defaultGroupAction(btn);
    } else {
      btn.action = defaultAction(btn);
    }
  }
}

// create a button bar
function addButton(btnOpt, editor) {
  const buttonRow = editor.buttonRow;
  const btn = div({
    // className: 'rr-button ' + (btnOpt.class || btnOpt.cat?.class),
    // className: 'rr-button ' + (btnOpt.cat?.name ? (btnOpt.class || btnOpt.cat?.class) : ''),
    className: 'rr-button ' + ((btnOpt.cat?.name || btnOpt.class === CLASS.CASE_BUTTON) ? (btnOpt.class || btnOpt.cat?.class) : ''),
    innerText: btnOpt.name,
    title: [btnOpt.hint, btnOpt.example].filter(a => a).join('; '),
    onclick: () => btnOpt.action(editor, btn)
  });
  if (btnOpt.cat?.name) {
    if (!buttonRow._buttonCategories[btnOpt.cat.name]) {
      const catBtn = div({ className: btnOpt.cat.class + ' rr-dropdown-button rr-button' });
      catBtn.innerText = btnOpt.cat.name + '  🞃';
      const catMenuContainer = catBtn.appendChild(div({ className: 'rr-button-menu' }));
      catMenuContainer.innerHTML = btnOpt.cat.hint || '';
      buttonRow._buttonCategories[btnOpt.cat.name] = {
        default: catMenuContainer.appendChild(div({ className: 'rr-button-row' }))
      };
      buttonRow.appendChild(catBtn);
    }
    if (btnOpt.sec && !buttonRow._buttonCategories[btnOpt.cat.name][btnOpt.sec]) {
      buttonRow._buttonCategories[btnOpt.cat.name][btnOpt.sec] = buttonRow._buttonCategories[btnOpt.cat.name].default.parentElement.appendChild(div({ className: 'rr-button-row' }));
    }
    buttonRow._buttonCategories[btnOpt.cat.name][btnOpt.sec || 'default'].appendChild(btn);
  } else {
    buttonRow.appendChild(btn);
  }
}
function rereadButtonBar(editor) {
  editor.buttonRow = div({ className: 'rr-button-row rr-button-bar' });
  editor.buttonRow._buttonCategories = {};
  rereadBtns.forEach(btnOpt => addButton(btnOpt, editor));
  editor.caseButton = editor.buttonRow.querySelector(`.${CLASS.CASE_BUTTON}`);
  return editor.buttonRow;
}
function addCustomTokenButton(editor, name, re) {
  if (!editor._customTokens) editor._customTokens = {};
  if (editor._customTokens[name]) {
    editor._customTokens[name] = re;
    return;
  }
  editor._customTokens[name] = re;
  const isApproximate = name.startsWith(APPROXIMATE_MATCH);
  addButton({
    name,
    class: CLASS.CUSTOM,
    cat: CATEGORIES.CUSTOM,
    sec: isApproximate ? 'approximate' : 'custom',
    action: editor => {
      editor.replaceSelection(makeToken({
        rr: name,
        data: { re: editor._customTokens[name] },
        class: CLASS.CUSTOM,
        hint: isApproximate ? `something similar to "${name.slice(APPROXIMATE_MATCH.length)}"` : name,
      }));
    },
  }, editor);
}


/** --- Pattern Conversion and Matching Functions --- */

const makeToken = pattern => {
  return {
    ...pattern,
    text: pattern.rr || pattern.name,
    token: pattern.class + ' ' + CLASS.TOKEN,
  }
}

// convert regular expression string to reread string
const quantExactHint = (n) => `${n} instances of preceding character or group`;
const quantRangeHint = (n1, n2, lazy) => `between ${n1} and ${n2} instances of preceding character or group (${lazy ? 'less' : 'more'} is preferred)`;
const quantMoreHint = (n, lazy) => `${n} or more instances of preceding character or group (${lazy ? 'less' : 'more'} is preferred)`;
const customQuantReToRr = (reStr) => {
  let match = reStr.match(RE_NM_QUANT_REGEX);
  if (match) {
    let lazy = reStr.endsWith('?');
    let rrStr = match[1];
    let hint;
    if (match[2]) {
      rrStr += '-' + match[2];
      hint = quantRangeHint(match[1], match[2], lazy);
    } else {
      rrStr += '+';
      hint = quantMoreHint(match[1], lazy);
    }
    return makeToken({
      rr: rrStr,
      class: (lazy ? CLASS.QUANT_LAZY : CLASS.QUANT),
      hint
    });
  }
  match = reStr.match(RE_N_QUANT_REGEX);
  if (match) {
    return makeToken({
      rr: match[1],
      class: CLASS.QUANT,
      hint: quantExactHint(match[1])
    });
  }
  throw new Error(`Unsupported regular expression: ${reStr}`);
}
const customCharReToName = (chars) => {
  chars = chars.replaceAll('\\n', CHAR_NEWLINE)
    .replaceAll('\\r', '')
    .replaceAll('\\t', CHAR_TAB)
    .replaceAll(' ', CHAR_SPACE)
    .replaceAll('\\s', CHAR_SPACE + CHAR_NEWLINE + CHAR_TAB)
    .replaceAll('\\d', '0123456789')
    .replaceAll('\\w', '0123456789_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ')
    .replace(/\\(.)/g, '$1');
  return uniqueChars(chars);
}
const customCharNameToRe = (name, isNegative = false) => {
  return (isNegative ? '[^' : '[') +
    textToRe(name)
      .replaceAll('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz', '\\w')
      .replaceAll('0123456789', '\\d')
      .replaceAll(CHAR_SPACE, ' ')
      .replaceAll(CHAR_NEWLINE, '\\n')
      .replaceAll(CHAR_TAB, '\\t') +
    ']';
}
const customCharReToRr = (reStr) => {
  let chars = reStr.slice(1, -1);
  let isNegative = false;
  if (chars.startsWith('^')) {
    chars = chars.slice(1);
    isNegative = true;
  }
  let rr = customCharReToName(chars);
  return makeToken({
    rr,
    data: { re: reStr },
    class: CLASS.CUSTOM_CHARSET + (isNegative ? ' ' + CLASS.CHARSET_NEGATIVE : ''),
    hint: `any ${isNegative ? 'except ' : 'of'} the characters: ${rr}`
  });
}
export function reToRr(reStr) {
  if (!reStr) return '';
  reStr = reStr.replaceAll('\n', '\\n').replaceAll('\r', '\\r').replaceAll('\t', '\\t');
  // check if it's a valid regular expression
  new RegExp(reStr, 'u');
  // create rr segments
  let rrSegments = [];
  let i = 0;
  let text = '';
  function pushText() {
    if (!text) return;
    rrSegments.push({ text });
    text = '';
  }
  function pushToken(pattern) {
    pushText();
    rrSegments.push(makeToken(pattern));
  }
  while (i < reStr.length) {
    let match;
    // check for newline
    if (reStr.startsWith(RE_NEWLINE, i)) {
      pushToken({ rr: '\n', class: CLASS.NEWLINE });
      i += RE_NEWLINE.length;
      continue;
    }
    // check for comment
    if (reStr.startsWith(RE_COMMENT_OPEN, i)) {
      let comment = '';
      for (let j = i + RE_COMMENT_OPEN.length; j < reStr.length; j++) {
        if (reStr[j] === '\\') {
          comment += reStr[j + 1];
          j++;
        } else if (reStr.startsWith(RE_COMMENT_CLOSE, j)) {
          pushToken({ rr: comment, class: CLASS.COMMENT });
          i = j + RE_COMMENT_CLOSE.length;
          break;
        } else {
          comment += reStr[j];
        }
      }
      continue;
    }
    // check for custom text
    RE_CUSTOM_TEXT.lastIndex = i;
    match = RE_CUSTOM_TEXT.exec(reStr);
    if (match) {
      i += match[0].length;
      let customReStr = '', openParenCount = 1, escaped = false;
      while (openParenCount) {
        if (escaped) {
          escaped = false;
        } else {
          if (reStr[i] === '\\') escaped = true;
          else if (reStr[i] === '(') openParenCount++;
          else if (reStr[i] === ')') openParenCount--;
        }
        if (openParenCount) customReStr += reStr[i];
        i++;
      }
      let rr = match[1] || match[2];
      if (!(rr.startsWith(CUSTOM_PREFIX) || rr.startsWith(APPROXIMATE_MATCH))) {
        rr = CUSTOM_PREFIX + rr;
      }
      pushToken({ rr, class: CLASS.CUSTOM, data: { re: customReStr } });
      continue;
    }
    // check for flags
    RE_FLAG_GROUP_REGEX.lastIndex = i;
    match = RE_FLAG_GROUP_REGEX.exec(reStr);
    if (match) {
      if (match[0] !== '(?i:' && match[0] !== '(?-i:' && match[0] !== '(?:') {
        throw new Error(`Unsupported regular expression: Unsupported inline flag(s): ${match[0]} at [${i}].`);
      }
      pushToken({ rr: GROUP_START, class: CLASS.SYMBOL });
      i += match[0].length;
      continue;
    }
    // check for known reread patterns
    for (const re of sortedKnownRe) {
      const pattern = RE_DICT[re];
      if (reStr.startsWith(re, i)) {
        if (pattern.error) throw new Error(pattern.error + ` at [${i}].`);
        pushToken(pattern);
        i += re.length;
        match = true;
        break;
      } else if (reStr.startsWith('(' + re + ')', i)) {
        if (pattern.error) throw new Error(pattern.error + ` at [${i}].`);
        pushToken(pattern);
        i += re.length + 2;
        match = true;
        break;
      }
    }
    if (!match) {
      // check for unknown unicode pattern
      RE_UNICODE_PATTERN.lastIndex = i;
      match = RE_UNICODE_PATTERN.exec(reStr);
      if (match) {
        pushToken({ rr: UNICODE_WRAP + (UNICODE_CLASS_NAMES[match[1]] || match[1]) + UNICODE_WRAP, class: CLASS.CHAR });
        i += match[0].length;
        continue;
      }
      // check for unknown char pattern
      RE_UNKNOWN_CHAR_REGEX.lastIndex = i;
      match = RE_UNKNOWN_CHAR_REGEX.exec(reStr);
      if (match) {
        const matchStart = i;
        let matchEnd;
        while (!matchEnd) {
          if (reStr[i] === '\\') {
            i += 2;
            continue;
          }
          if (reStr[i] === ']') {
            matchEnd = i;
            break;
          }
          i++;
        }
        const reChars = reStr.slice(matchStart, matchEnd + 1);
        if (reChars.includes('\\S')) {
          throw new Error(`Unsupported character \\S in custom character set: ${reChars} at [${matchStart}].`);
        }
        if (reChars.includes('\\W')) {
          throw new Error(`Unsupported character \\W in custom character set: ${reChars} at [${matchStart}].`);
        }
        if (reChars.includes('\\D')) {
          throw new Error(`Unsupported character \\D in custom character set: ${reChars} at [${matchStart}].`);
        }
        pushToken(customCharReToRr(reChars));
        i = matchEnd + 1;
        continue;
      }
      // check for unknown quantifier pattern
      RE_CUSTOM_QUANT_REGEX.lastIndex = i;
      match = RE_CUSTOM_QUANT_REGEX.exec(reStr);
      if (match) {
        pushToken(customQuantReToRr(match[0]));
        i += match[0].length;
        continue;
      }
      // process char
      const char = reStr[i];
      // check for escaped chars
      if (char === '\\') {
        // next character is escaped, add it literally
        text += reStr[i + 1];
        i += 2;
        continue;
      }
      // ignore ^$
      if (char === '^' || char === '$') {
        i++;
        continue;
      }
      // any other character
      text += char;
      i++;
    }
  }
  pushText();
  if (reStr.startsWith('^')) reStr = reStr.slice(1);
  if (reStr.endsWith('$')) reStr = reStr.slice(0, -1);
  if (isEnclosed(reStr)) {
    rrSegments = rrSegments.slice(1, -1);
    rrSegments.caseSensitive = reStr.startsWith('(?i:') ? false : reStr.startsWith('(?-i:') ? true : undefined;
  }
  return rrSegments;
}


// convert reread string to a regular expression string
function customQuantRrToRe(rrStr) {
  return '{' + rrStr.replace(/\+|\-/, ',') + '}';
}
export function rrToRe(rrSegments, decor = true) {
  let reStr = '';
  function addText(text) {
    if (!text) return;
    reStr += textToRe(text);
  }
  for (let segment of rrSegments) {
    if (typeof segment === 'string') {
      addText(segment);
    } else if (!segment.token) {
      addText(segment.text);
    } else if (segment.token.includes(CLASS.NEWLINE)) {
      if (decor) reStr += RE_NEWLINE;
    } else if (segment.token.includes(CLASS.COMMENT)) {
      if (decor) reStr += '(?=|' + textToRe(segment.text) + ')';
    } else {
      let pattern = REREAD.find(p => segment.token.includes(p.class) && (p.name === segment.text || p.rr === segment.text));
      if (pattern?.re) {
        reStr += pattern.re;
        continue;
      }
      // check for unknown unicode class
      if (segment.text.startsWith(UNICODE_WRAP)) {
        reStr += '\\p{' + segment.text.slice(UNICODE_WRAP.length, -UNICODE_WRAP.length) + '}';
        continue;
      }
      // check for unknown char
      if (segment.token.includes(CLASS.CUSTOM_CHARSET)) {
        reStr += segment.data.re;
        continue;
      }
      // check for unknown quantifier
      if (segment.token.includes(CLASS.QUANT)) {
        reStr += customQuantRrToRe(segment.text);
        continue;
      }
      if (segment.token.includes(CLASS.QUANT_LAZY)) {
        reStr += customQuantRrToRe(segment.text) + '?';
        continue;
      }
      // check for unknown custom re
      if (segment.token.includes(CLASS.CUSTOM) && segment.data.re) {
        reStr += `($${segment.text}|${segment.data.re})`;
        continue;
      }
    }
  }
  if (rrSegments.caseSensitive === undefined) return `^(${reStr})$`;
  return `^(?${rrSegments.caseSensitive ? '-i:' : 'i:'}${reStr})$`;
}


/** --- ReRead Editor --- */

// keyboard shortcuts
const rereadKeyMap = {
  "Shift-Enter": function (editor) {
    editor.replaceSelection(makeToken(RE_DICT['\n']));
  },
  "Alt-Enter": function (editor) {
    editor.replaceSelection(makeToken({ rr: '\n', class: CLASS.NEWLINE }));
  },
  "Alt-/": function (editor) {
    insertComment(editor);
  },
  "Alt-[": function (editor) {
    const selection = editor.getSelection();
    const { end } = editor.replaceSelection([makeToken(REREAD_GROUP_START), ...selection, makeToken(REREAD_GROUP_END)]);
    if (!selection.length) editor.setCursorOffset(end + GROUP_START.length);
  },
  "Alt-]": function (editor) {
    editor.replaceSelection(makeToken(REREAD_GROUP_END));
  },
  "Alt-A": function (editor) {
    editor.replaceSelection(makeToken(RE_DICT['[\\s\\S]*']));
  },
  "Alt-Shift-A": function (editor) {
    editor.replaceSelection(makeToken(RE_DICT['[\\s\\S]+']));
  },
  "Alt-C": function (editor) {
    editor.replaceSelection(makeToken(RE_DICT['[\\s\\S]']));
  },
  "Alt-O": function (editor) {
    editor.replaceSelection(makeToken(RE_DICT['|']));
  },
  "Alt-Shift-@": function (editor) {
    editor.replaceSelection(makeToken(RE_DICT['{2}']));
  },
  "Alt-Shift-#": function (editor) {
    editor.replaceSelection(makeToken(RE_DICT['{3}']));
  },
  "Alt-Shift-$": function (editor) {
    editor.replaceSelection(makeToken(RE_DICT['{4}']));
  },
  "Alt-Shift-%": function (editor) {
    editor.replaceSelection(makeToken(RE_DICT['{5}']));
  },
  "Shift-Space": function (editor) {
    editor.replaceSelection(makeToken(RE_DICT['[ ]*']));
  },
  "Tab": function (editor) {
    editor.replaceSelection(makeToken(RE_DICT['\\t']));
  },
  "Shift-Tab": function (editor) {
    editor.replaceSelection(makeToken(RE_DICT['[\\s]*']));
  },
  "Ctrl-Shift-C": function (editor) {
    const re = editor.toRe();
    navigator.clipboard.writeText(re);
  },
  "Ctrl-Shift-V": function (editor) {
    navigator.clipboard.readText().then(text => {
      editor.fromRe(text);
    });
  },
};
'012345'.split('').forEach(digit => {
  rereadKeyMap[`Alt-${digit}`] = function (editor) {
    editor.replaceSelection(makeToken(RE_DICT[`{${digit},}`]));
  };
});

// click handlers
const rereadClickMap = {
  [CLASS.COMMENT]: (editor, tokenElement, x, y) => {
    editComment(editor, tokenElement, x, y);
  },
  [CLASS.CUSTOM]: (editor, tokenElement, x, y) => {
    editCustom(editor, tokenElement, x, y);
  },
  [CLASS.CUSTOM_CHARSET]: (editor, tokenElement, x, y) => {
    editCustomCharset(editor, tokenElement, x, y);
  },
  [CLASS.QUANT]: (editor, tokenElement, x, y) => {
    editQuant(editor, tokenElement, x, y);
  },
  [CLASS.QUANT_LAZY]: (editor, tokenElement, x, y) => {
    editQuant(editor, tokenElement, x, y);
  },
};

// popup widgets
var openWidget;
function popupWidget(editor, position, content = []) {
  if (openWidget) return;
  openWidget = true;
  const cursorOffset = editor.getCursorOffset();
  const container = editor.getContainer();
  const containerRect = container.getBoundingClientRect();
  const widget = div({ className: 'rr-widget', children: content });
  container.appendChild(widget);
  if (position) {
    let x, y;
    if (position?.getBoundingClientRect) {
      const rect = position.getBoundingClientRect();
      x = rect.left + container.scrollLeft + 2;
      y = rect.bottom + container.scrollTop - 2;
    } else {
      x = position?.x || 2;
      y = position?.y || 2;
    }
    widget.style.left = x + 'px';
    widget.style.top = y + 'px';
    setTimeout(() => {
      // make sure widget is visible
      const widgetRect = widget.getBoundingClientRect();
      if (widgetRect.bottom > window.innerHeight) {
        widget.style.top = (containerRect.bottom - widgetRect.height - 2) + 'px';
      }
      if (widgetRect.right > window.innerWidth) {
        widget.style.left = (containerRect.right - widgetRect.width - 2) + 'px';
      }
    }, 10);
  }
  widget.close = (updateEditor = true) => {
    if (!document.body.contains(widget)) return;
    try {
      widget.remove();
      editor.focus();
      if (updateEditor) editor.update();
      editor.setCursorOffset(cursorOffset);
      openWidget = false;
    } catch (err) { }
  };
  return widget;
}

function editCustom(editor, tokenElement) {
  if (tokenElement.textContent.startsWith(APPROXIMATE_MATCH)) {
    const widget = popupWidget(editor, tokenElement);
    widget.tabIndex = -1;
    const textInput = input({
      type: 'text', value: tokenElement.innerText.slice(APPROXIMATE_MATCH.length),
      oninput: (e) => {
        tokenElement.innerText = APPROXIMATE_MATCH + e.target.value;
        tokenElement.dataset.re = getFuzzyReStr(e.target.value);
      },
      onkeydown: (e) => {
        if (e.key === 'Enter' || e.key === 'Escape') {
          e.preventDefault();
          widget.close(true);
        }
      }
    });
    widget.appendChild(div({ children: ['Approximate text: ', textInput] }));
    widget.appendChild(div({ className: 'rr-button', style: 'min-width: 5em;', onclick: () => widget.close(true), textContent: 'OK' }));
    textInput.focus();
    widget.addEventListener('focusout', (e) => {
      setTimeout(() => {
        if (!widget.contains(document.activeElement)) widget.close(true);
      }, 100);
    });
    textInput.setSelectionRange(0, textInput.value.length);
  } else {
    const widget = popupWidget(editor, tokenElement, [
      div({ textContent: 'Custom token', style: 'font-size: 110%; font-weight: bold;' }),
    ]);
    widget.style.alignItems = 'flex-start';
    widget.tabIndex = -1;
    let name = tokenElement.innerText;
    if (name.startsWith(CUSTOM_PREFIX)) name = name.slice(CUSTOM_PREFIX.length);
    const nameInput = input({
      type: 'text', placeholder: 'pattern name', value: name, style: 'min-width: 10em;'
    });
    restrictInput(nameInput, /[^a-zA-Z0-9 -]/g);
    const okButton = div({
      className: 'rr-button', style: 'min-width: 5em;', textContent: 'OK', onclick: () => {
        const val = rrInput.getValue();
        if (!(val.length && val.some(t => t.text.length))) {
          tokenElement.innerText = '';
          tokenElement.dataset.re = '';
          widget.close(true);
          return;
        }
        if (!nameInput.value) return;
        name = CUSTOM_PREFIX + nameInput.value;
        const reStr = rrInput.toRe().slice(1, -1);
        const multipleInstances = [...editor.getInput().querySelectorAll(`.${CLASS.CUSTOM}`)]
          .filter(t => t.innerText === name);
        if (multipleInstances.length > 1) {
          if (!confirm(`Multiple instances of "${nameInput.value}" exist. Update all of them?`)) {
            nameInput.focus();
            return;
          }
          multipleInstances.forEach(instance => {
            instance.dataset.re = reStr;
          });
        }
        tokenElement.innerText = name;
        tokenElement.dataset.re = reStr;
        addCustomTokenButton(editor, name, reStr);
        widget.close(true);
      }
    });
    const cancelButton = div({ className: 'rr-button', style: 'min-width: 5em;', textContent: 'Cancel', onclick: () => widget.close(false) });
    widget.appendChild(div({ children: ['Name: ', nameInput] }));
    widget.appendChild(div({ textContent: 'Text Pattern:' }));
    const rrInput = rereadEditor(widget, { width: '90%', caseInheritance: true });
    rrInput.fromRe(tokenElement.dataset.re || '');
    widget.appendChild(div({ children: [okButton, cancelButton], style: 'margin-top: .5em; display: flex; gap: 0.5em; margin-left: 1em' }));
    nameInput.focus();
    widget.addEventListener('focusout', (e) => {
      setTimeout(() => {
        if (!widget.contains(document.activeElement)) widget.close(false);
      }, 100);
    });
    nameInput.setSelectionRange(0, nameInput.value.length);
  }
}

function editCustomCharset(editor, tokenElement) {
  let isNegative = tokenElement.classList.contains(CLASS.CHARSET_NEGATIVE);
  const widget = popupWidget(editor, tokenElement);
  widget.tabIndex = -1;
  const label = div();
  const setLabel = () => {
    label.textContent = isNegative ? 'Match any except these characters:' : 'Match any of these characters:';
  }
  setLabel();
  const textInput = input({
    type: 'text', value: tokenElement.innerText,
    oninput: (e) => {
      // make sure all chars are unique
      const originalValue = e.target.value;
      const uniqueCharValue = uniqueChars(originalValue);
      if (uniqueCharValue !== originalValue) {
        e.target.value = uniqueCharValue;
        e.target.setSelectionRange(uniqueCharValue.length, uniqueCharValue.length);
      }
      // change value and re
      tokenElement.innerText = e.target.value;
      tokenElement.dataset.re = customCharNameToRe(e.target.value, isNegative);
      tokenElement.title = (isNegative ? 'any except ' : 'any of ') + 'the characters: ' + e.target.value;
    },
    onkeydown: (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        widget.close(true);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        textInput.value += CHAR_NEWLINE;
        textInput.oninput(e);
      } else if (e.key === 'Tab') {
        e.preventDefault();
        textInput.value += CHAR_TAB;
        textInput.oninput(e);
      } else if (e.key === ' ') {
        e.preventDefault();
        textInput.value += CHAR_SPACE;
        textInput.oninput(e);
      }
    }
  });
  const negativeToggle = toggle({
    children: ['must match', 'must not match'],
    selection: isNegative ? 1 : 0,
    onclick: e => {
      isNegative = !isNegative;
      setLabel();
      if (isNegative) {
        tokenElement.classList.add(CLASS.CHARSET_NEGATIVE);
      } else {
        tokenElement.classList.remove(CLASS.CHARSET_NEGATIVE);
      }
      tokenElement.dataset.re = customCharNameToRe(textInput.value, isNegative);
      tokenElement.title = (isNegative ? 'any except ' : 'any of ') + 'the characters: ' + textInput.value;
    }
  });
  widget.appendChild(label);
  widget.appendChild(textInput);
  // widget.appendChild(div({ innerHTML: '&nbsp;' }));
  widget.appendChild(negativeToggle);
  // widget.appendChild(div({ innerHTML: '&nbsp;' }));
  widget.appendChild(div({ className: 'rr-button', style: 'min-width: 5em;', onclick: () => widget.close(true), textContent: 'OK' }));
  textInput.focus();
  widget.addEventListener('focusout', (e) => {
    setTimeout(() => {
      if (!widget.contains(document.activeElement)) widget.close(true);
    }, 100);
  });
  textInput.setSelectionRange(0, textInput.value.length);
}

function editQuant(editor, tokenElement) {
  const widget = popupWidget(editor, tokenElement);
  widget.tabIndex = -1;
  const quantText = tokenElement.innerText;
  if (quantText.endsWith('+') || quantText.includes('-')) { // quant range
    const isLazy = tokenElement.classList.contains(CLASS.QUANT_LAZY);
    let [min, max] = quantText.split('-');
    min = parseInt(min);
    max = parseInt(max);
    const numQuantToRr = (min, max) => (max && max > min) ? min + '-' + max : min + '+';
    const getHint = (min, max) => (max && max > min) ?
      quantRangeHint(min, max, tokenElement.classList.contains(CLASS.QUANT_LAZY)) :
      quantMoreHint(min, tokenElement.classList.contains(CLASS.QUANT_LAZY));
    const minInput = input({
      type: 'number', min: '0', step: '1', value: min,
      oninput: e => {
        min = parseInt(e.target.value);
        if (isNaN(min)) return;
        maxInput.min = min + 1;
        if (max && (max < min)) maxInput.value = max = '';
        tokenElement.innerText = numQuantToRr(min, max);
        tokenElement.title = getHint(min, max);
      },
      onkeydown: e => {
        if (e.key === 'Escape') {
          e.preventDefault();
          widget.close(true);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          maxInput.focus();
        }
      }
    });
    const maxInput = input({
      type: 'number', min, step: '1', placeholder: '∞', value: max,
      oninput: e => {
        max = parseInt(e.target.value);
        if (isNaN(max) || !max) maxInput.value = max = '';
        else if (max < min) maxInput.classList.add('invalid');
        else maxInput.classList.remove('invalid');
        tokenElement.innerText = numQuantToRr(min, max);
        tokenElement.title = getHint(min, max);
      },
      onkeydown: e => {
        if (e.key === 'Escape' || e.key === 'Enter') {
          e.preventDefault();
          widget.close(true);
        }
      }
    });
    const moreOrLess = toggle({
      children: ['match more', 'match less'],
      selection: isLazy ? 1 : 0,
      onclick: e => {
        if (e.target.innerText === 'match more') {
          tokenElement.classList.remove(CLASS.QUANT_LAZY);
          tokenElement.classList.add(CLASS.QUANT);
        } else {
          tokenElement.classList.remove(CLASS.QUANT);
          tokenElement.classList.add(CLASS.QUANT_LAZY);
        }
        tokenElement.title = getHint(min, max);
      }
    });
    widget.appendChild(div({ children: ['Number of instances: ', minInput, ' to ', maxInput] }));
    widget.appendChild(moreOrLess);
    const onBlur = e => {
      if (e.relatedTarget === widget) e.currentTarget.focus();
      else if (!widget.contains(e.relatedTarget)) widget.close(true);
    }
    minInput.onblur = onBlur;
    maxInput.onblur = onBlur;
    moreOrLess.querySelectorAll('button').forEach(btn => btn.onblur = onBlur);
    minInput.focus();
  } else { // quant number
    let val = parseInt(quantText);
    const valInput = input({
      type: 'number', min: '1', step: '1', value: val,
      oninput: e => {
        tokenElement.innerText = e.target.value;
        tokenElement.title = quantExactHint(e.target.value);
      },
      onkeydown: e => {
        if (e.key === 'Enter' || e.key === 'Escape') {
          e.preventDefault();
          widget.close(true);
        }
      }
    });
    widget.appendChild(div({ children: ['Number of instances: ', valInput] }));
    valInput.onblur = e => {
      if (e.relatedTarget === widget) valInput.focus();
      else widget.close(true);
    };
    valInput.focus();
  }
  widget.appendChild(div({ className: 'rr-button', style: 'min-width: 5em;', onclick: () => widget.close(true), textContent: 'OK' }));
}

function editComment(editor, tokenElement) {
  const widget = popupWidget(editor, tokenElement, [
    div({ textContent: 'Comment:' }),
  ]);
  widget.tabIndex = -1;
  const commentInput = input({
    type: 'text', value: tokenElement.innerText.trim(), style: 'width: 20em',
    oninput: (e) => {
      tokenElement.innerText = e.target.value;
    },
    onkeydown: (e) => {
      if (e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        widget.close(true);
      }
    }
  });
  widget.appendChild(commentInput);
  widget.appendChild(div({ className: 'rr-button', style: 'min-width: 5em;', onclick: () => widget.close(true), textContent: 'OK' }));
  commentInput.focus();
  commentInput.onblur = e => {
    if (e.relatedTarget === widget) commentInput.focus();
    else widget.close(true);
  };
  commentInput.setSelectionRange(0, commentInput.value.length);
}

function insertComment(editor) {
  const selection = editor.getSelection();
  if (selection.length > 0) {
    editor.replaceSelection(makeToken({ rr: selection.map(s => s.text).join(''), class: CLASS.COMMENT }));
  } else {
    const { start } = editor.replaceSelection(makeToken({ rr: ' ', class: CLASS.COMMENT }));
    setTimeout(() => editComment(editor, editor.getTokenAt(start)), 100);
  }
  editor.focus();
}

// generic token editor
function tokenEditor(parent, options = {}) {
  const state = {
    segments: [],
    value: '',
    history: [],
    historyPtr: -1,
    keyMap: {},
    debouncedChange: null,
  };
  let lastRange = null;
  const triggerChange = () => {
    if (options.debounce) {
      if (!state.debouncedChange) state.debouncedChange = debounce(() => publicAPI.onchange?.(publicAPI), options.debounce);
      state.debouncedChange();
    } else {
      publicAPI.onchange?.(publicAPI);
    }
  };

  const container = document.createElement('div');
  container.className = 'rr-editor ' + (options.class || '');
  Object.assign(container.style, { position: 'relative', overflow: 'auto', whiteSpace: 'pre' });
  if (options.width) container.style.width = options.width;
  if (options.height) container.style.height = options.height;
  if (options.resize) container.style.resize = options.resize === true ? 'both' : options.resize;
  if (!options.defaultNewline) options.defaultNewline = { text: '\n', token: 'rr-newline' };

  const input = document.createElement('div');
  Object.assign(input, { tabIndex: 0, contentEditable: true, spellcheck: false });
  Object.assign(input.style, { outline: 'none', minHeight: '100%', padding: '5px', boxSizing: 'border-box' });
  container.appendChild(input);
  if (parent) parent.appendChild(container);

  const ghostCaret = document.createElement('div');
  Object.assign(ghostCaret.style, { position: 'absolute', width: '2px', backgroundColor: "var(--caret-color)", pointerEvents: 'none', display: 'none', zIndex: '1000' });
  container.appendChild(ghostCaret);

  // dark/light theme
  let lastParentColor;
  function updateTheme() {
    // check if container in dom
    if (!(container.parentElement && document.body.contains(container))) {
      clearInterval(themeInterval);
      return;
    }
    const parentColor = getBackgroundColor(container.parentElement);
    if (parentColor === lastParentColor) return;
    lastParentColor = parentColor;
    if (isDark(parentColor)) container.setAttribute('dark-theme', '');
    else container.removeAttribute('dark-theme');
  }
  const themeInterval = setInterval(updateTheme, 200);

  function domToSegments(rootNode) {
    const segs = [];
    const pushText = str => {
      str = str.replace(/\r/g, '');
      if (!str) return;
      const parts = str.split(/(\n)/);
      for (const p of parts) {
        if (p === '\n') segs.push(options.defaultNewline);
        else if (p) {
          if (segs.length && !segs[segs.length - 1].token) segs[segs.length - 1].text += p;
          else segs.push({ text: p });
        }
      }
    };
    traverse(rootNode, rootNode, (parent, i, child, len) => {
      if (!child) return;
      if (child.nodeType === Node.TEXT_NODE) pushText(child.nodeValue);
      else if (child.nodeType === Node.ELEMENT_NODE) {
        if (child.getAttribute('contenteditable') === 'false') {
          const hint = child.getAttribute('title');
          if (child.classList.contains('rr-newline')) segs.push({ text: '\n', token: 'rr-newline' });
          else if (child.textContent) {
            const data = Object.entries(child.dataset);
            if (data.length) {
              segs.push({ text: child.textContent, token: child.className, data: Object.fromEntries(data), ...(hint && { hint }) });
            } else {
              segs.push({ text: child.textContent, token: child.className, ...(hint && { hint }) });
            }
          }
        } else if (child.tagName === 'BR' && len > 0) {
          segs.push({ text: '\n', token: 'rr-newline' });
        }
      }
    });
    return segs;
  }

  function parseHtml(html) {
    const m = html.match(/<!--StartFragment-->([\s\S]*)<!--EndFragment-->/);
    if (m) html = m[1];
    const div = document.createElement('div');
    div.innerHTML = html;
    return domToSegments(div);
  }

  const render = (segs) => {
    const html = segmentsToHtml(segs);
    if (input.innerHTML !== html) input.innerHTML = html;
    state.segments = segs;
    state.value = segmentsToValue(segs);
  };

  const getCursorOffset = (useFocus = true) => {
    const sel = window.getSelection();
    if (sel.rangeCount && input.contains(sel.getRangeAt(0).commonAncestorContainer)) {
      return useFocus ? posToOffset(input, sel.focusNode, sel.focusOffset) : posToOffset(input, sel.anchorNode, sel.anchorOffset);
    }
    return rangeToOffset(input, lastRange);
  };

  const setCursorOffset = (offset, skipScroll = false, focus = false, extend = false) => {
    const range = document.createRange();
    let charCount = 0, found = false;
    traverse(input, input, (parent, i, child, len) => {
      if (charCount === offset) { range.setStart(parent, i); range.collapse(true); found = true; return true; }
      if (!child) return;
      if (len > 0 && charCount < offset) {
        if (child.nodeType === Node.TEXT_NODE && charCount + len >= offset) {
          range.setStart(child, offset - charCount);
          range.collapse(true); found = true; return true;
        } else if (child.nodeType !== Node.TEXT_NODE && charCount + len > offset) {
          // Offset is strictly inside a non-text token. Move to the start of it.
          range.setStart(parent, i);
          range.collapse(true); found = true; return true;
        }
      }
      charCount += len;
    });
    if (!found) { range.selectNodeContents(input); range.collapse(false); }
    if (extend) {
      const sel = window.getSelection();
      if (sel.rangeCount) {
        sel.extend(range.startContainer, range.startOffset);
        lastRange = sel.getRangeAt(0).cloneRange();
      } else {
        setCursorOffset(offset, skipScroll, focus, false);
      }
    } else {
      lastRange = range.cloneRange();
      if (focus || document.activeElement === input) {
        const sel = window.getSelection();
        sel.removeAllRanges(); sel.addRange(range);
      }
    }
    if (focus || document.activeElement === input) {
      if (!skipScroll) setTimeout(() => {
        const rect = publicAPI.getCursorPosition();
        if (!rect) return;
        const cr = container.getBoundingClientRect();
        if (rect.bottom > cr.bottom) container.scrollTop += rect.bottom - cr.bottom;
        else if (rect.top < cr.top) container.scrollTop -= cr.top - rect.top;
        if (rect.right > cr.right) container.scrollLeft += rect.right - cr.right;
        else if (rect.left < cr.left) container.scrollLeft -= cr.left - rect.left;
      }, 0);
    }
  };

  const saveHistory = (cursor = getCursorOffset()) => {
    if (state.historyPtr < state.history.length - 1) state.history.length = state.historyPtr + 1;
    state.history.push({ segments: [...state.segments], value: state.value, cursor });
    state.historyPtr++;
  };

  const commit = (newSegs, cursor = getCursorOffset(), focus = true) => {
    render(newSegs);
    setCursorOffset(cursor, false, focus);
    saveHistory(cursor);
    triggerChange();
  };

  const update = () => {
    const newSegs = domToSegments(input);
    commit(newSegs);
    publicAPI.oncursor?.(publicAPI);
  };

  const getSelectionOffsets = () => {
    const sel = window.getSelection();
    if (sel.rangeCount && input.contains(sel.getRangeAt(0).commonAncestorContainer)) {
      const r = sel.getRangeAt(0);
      return { start: posToOffset(input, r.startContainer, r.startOffset), end: posToOffset(input, r.endContainer, r.endOffset) };
    }
    return lastRange ? { start: posToOffset(input, lastRange.startContainer, lastRange.startOffset), end: posToOffset(input, lastRange.endContainer, lastRange.endOffset) } : { start: state.value.length, end: state.value.length };
  };

  const insert = (start, end, content, focus = true) => {
    let rawSegs = Array.isArray(content) ? content : [content];
    let newSegs = [];
    for (let s of rawSegs) {
      if (typeof s === 'string') s = { text: s };
      const text = s.text?.replace(/\r/g, '');
      if (!text) continue;
      if (s.token) {
        newSegs.push({ ...s, text });
      } else {
        const parts = text.split(/(\n)/);
        for (const p of parts) {
          if (!p) continue;
          if (p === '\n') newSegs.push(options.defaultNewline);
          else newSegs.push({ text: p });
        }
      }
    }
    const offset = start + segmentsToValue(newSegs).length;
    commit(spliceSegments(state.segments, start, end, newSegs), offset, focus);
    return { start, end };
  };

  input.addEventListener('input', update);

  input.addEventListener('keydown', (e) => {
    const keyStr = (e.ctrlKey ? 'Ctrl+' : '') + (e.shiftKey ? 'Shift+' : '') + (e.altKey ? 'Alt+' : '') + e.key.toUpperCase();
    if (state.keyMap[keyStr]) { state.keyMap[keyStr](publicAPI); e.preventDefault(); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const { start, col, nextNL } = getLineInfo(state.value, getCursorOffset());
      const prevNL = state.value.lastIndexOf('\n', start - 2);
      if (e.key === 'ArrowUp') {
        if (start === 0) {
          if (col > 0) setCursorOffset(0);
          return;
        }
        const prevLine = getLineInfo(state.value, prevNL + 1);
        setCursorOffset(prevLine.start + Math.min(col, prevLine.end - prevLine.start), false, false, e.shiftKey);
      } else {
        if (nextNL === -1) {
          if (col < state.value.length) setCursorOffset(state.value.length, false, false, e.shiftKey);
          return;
        }
        const nextLine = getLineInfo(state.value, nextNL + 1);
        setCursorOffset(nextLine.start + Math.min(col, nextLine.end - nextLine.start), false, false, e.shiftKey);
      }
      publicAPI.oncursor?.(publicAPI);
    }
    else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      const { start, end } = getLineInfo(state.value, getCursorOffset());
      setCursorOffset(e.key === 'Home' ? start : end, false, false, e.shiftKey);
      publicAPI.oncursor?.(publicAPI);
    }
    else if (e.key === 'Enter') { e.preventDefault(); publicAPI.replaceSelection(options.defaultNewline); }
    else if (keyStr === 'Ctrl+Z') { e.preventDefault(); publicAPI.undo(); }
    else if (keyStr === 'Ctrl+Shift+Z' || keyStr === 'Ctrl+Y') { e.preventDefault(); publicAPI.redo(); }
  });

  document.addEventListener('selectionchange', () => {
    if (document.activeElement !== input) return;
    const sel = window.getSelection();
    if (!sel.rangeCount) { lastRange = null; return; }
    const range = sel.getRangeAt(0);
    if (!input.contains(range.commonAncestorContainer)) return;

    let node = range.startContainer;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
    if (node?.getAttribute?.('contenteditable') === 'false') {
      // const goToEnd = (range.startContainer.nodeType === Node.TEXT_NODE && range.startOffset >= range.startContainer.nodeValue.length / 2) || (range.startContainer === node && range.startOffset > 0);
      const newRange = document.createRange();
      // goToEnd ? newRange.setStartAfter(node) : newRange.setStartBefore(node);
      newRange.setStartBefore(node);
      newRange.collapse(true);
      sel.removeAllRanges(); sel.addRange(newRange);
      lastRange = sel.getRangeAt(0).cloneRange();
    } else {
      lastRange = range.cloneRange();
    }
    publicAPI.oncursor?.(publicAPI);
    if (state.historyPtr >= 0) state.history[state.historyPtr].cursor = getCursorOffset();
  });

  input.addEventListener('copy', (e) => {
    const { start, end } = getSelectionOffsets();
    if (start === end) return;
    e.preventDefault();
    const segs = extractSegments(state.segments, start, end);
    e.clipboardData.setData('text/plain', segmentsToValue(segs));
    e.clipboardData.setData('text/html', segmentsToHtml(segs, true));
  });

  input.addEventListener('cut', (e) => {
    const { start, end } = getSelectionOffsets();
    if (start === end) return;
    e.preventDefault();
    const segs = extractSegments(state.segments, start, end);
    e.clipboardData.setData('text/plain', segmentsToValue(segs));
    e.clipboardData.setData('text/html', segmentsToHtml(segs, true));
    commit(spliceSegments(state.segments, start, end, []), start);
  });

  input.addEventListener('paste', (e) => {
    e.preventDefault();
    const cd = e.clipboardData;
    const html = cd.getData('text/html');
    if (html) {
      const segs = parseHtml(html);
      if (segs.length) {
        const { start, end } = getSelectionOffsets();
        commit(spliceSegments(state.segments, start, end, segs), start + segmentsToValue(segs).length);
        return;
      }
    }
    publicAPI.replaceSelection(cd.getData('text/plain').replace(/\r/g, ''));
  });

  let internalDrag = false, dragStart = null;
  input.addEventListener('dragstart', (e) => {
    const { start, end } = getSelectionOffsets();
    if (start === end) return;
    internalDrag = true; dragStart = { start, end };
    const segs = extractSegments(state.segments, start, end);
    e.dataTransfer.setData('text/plain', segmentsToValue(segs));
    e.dataTransfer.setData('text/html', segmentsToHtml(segs, true));
    e.dataTransfer.effectAllowed = 'move';
  });

  input.addEventListener('dragover', (e) => {
    e.preventDefault(); e.dataTransfer.dropEffect = 'move';
    const range = getRangeFromPoint(e.clientX, e.clientY);
    if (range) {
      let node = range.startContainer;
      if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
      const rect = (node?.getAttribute?.('contenteditable') === 'false') ? node.getBoundingClientRect() : (() => {
        const span = document.createElement('span'); span.textContent = '\u200b';
        try { range.insertNode(span); const r = span.getBoundingClientRect(); span.remove(); input.normalize(); return r; } catch (ex) { return null; }
      })();
      if (rect) {
        const cr = container.getBoundingClientRect();
        const useEnd = (node?.getAttribute?.('contenteditable') === 'false' && e.clientX > rect.left + rect.width / 2);
        ghostCaret.style.left = (useEnd ? rect.right : rect.left) - cr.left + container.scrollLeft + 'px';
        ghostCaret.style.top = rect.top - cr.top + container.scrollTop + 'px';
        ghostCaret.style.height = rect.height + 'px';
        ghostCaret.style.display = 'block';
        return;
      }
    }
    ghostCaret.style.display = 'none';
  });

  input.addEventListener('drop', (e) => {
    e.preventDefault(); ghostCaret.style.display = 'none';
    const range = getRangeFromPoint(e.clientX, e.clientY);
    if (!range) return;
    let offset = rangeToOffset(input, range), pasted = [];
    const html = e.dataTransfer.getData('text/html');
    if (html) pasted = parseHtml(html);
    else { const t = e.dataTransfer.getData('text/plain').replace(/\r/g, ''); if (t) pasted = [{ text: t }]; }
    if (!pasted.length) return;
    let segs = state.segments;
    if (internalDrag && dragStart) {
      segs = spliceSegments(segs, dragStart.start, dragStart.end, []);
      if (offset > dragStart.end) offset -= (dragStart.end - dragStart.start);
      else if (offset > dragStart.start) offset = dragStart.start;
    }
    commit(spliceSegments(segs, offset, offset, pasted), offset + segmentsToValue(pasted).length);
  });

  input.addEventListener('dragend', () => { internalDrag = false; ghostCaret.style.display = 'none'; });
  input.addEventListener('focus', () => publicAPI.onfocus?.(publicAPI));

  const mouseHandler = (e, handler) => {
    if (!handler) return;
    const range = getRangeFromPoint(e.clientX, e.clientY);
    if (!range) return;
    const offset = rangeToOffset(input, range);
    let cur = e.target;
    while (cur && cur !== input) {
      if (cur.getAttribute?.('contenteditable') === 'false' && !cur.classList.contains('rr-newline')) {
        e.targetTokenElement = cur;
        break;
      }
      cur = cur.parentNode;
    }
    if (offset !== -1) handler(e, publicAPI, offset);
  };

  const publicAPI = {
    getContainer: () => container,
    getInput: () => input,
    getHTML: () => input.innerHTML,
    getValue: () => state.segments,
    setValue: (v, focus = false) => insert(0, state.value.length, v, focus),
    update,
    insert,
    append: (c) => insert(state.value.length, state.value.length, c),
    getSelection: () => { const { start, end } = getSelectionOffsets(); return extractSegments(state.segments, start, end); },
    replaceSelection: (c) => {
      const { start, end } = getSelectionOffsets();
      return insert(start, end, c);
    },
    getTokenAt: (offset) => {
      let cur = 0;
      for (const node of input.childNodes) {
        const len = node.nodeType === Node.TEXT_NODE ? node.nodeValue.length : node.textContent.length;
        if (offset >= cur && offset < cur + len && node.nodeType === Node.ELEMENT_NODE && node.getAttribute('contenteditable') === 'false' && !node.classList.contains('rr-newline')) return node;
        cur += len; if (cur > offset) break;
      }
    },
    setTokenTextAt: (offset, text) => {
      const t = publicAPI.getTokenAt(offset); if (!t) return;
      const start = rangeToOffset(input, (() => { const r = document.createRange(); r.selectNode(t); return r; })());
      const hint = t.getAttribute('title');
      commit(spliceSegments(state.segments, start, start + t.textContent.length, [{ text, token: t.className, ...(hint && { hint }) }]));
    },
    removeTokenAt: (offset) => {
      const t = publicAPI.getTokenAt(offset); if (!t) return;
      const start = rangeToOffset(input, (() => { const r = document.createRange(); r.selectNode(t); return r; })());
      commit(spliceSegments(state.segments, start, start + t.textContent.length, []));
    },
    undo: () => { if (state.historyPtr > 0) { state.historyPtr--; const s = state.history[state.historyPtr]; render(s.segments); setCursorOffset(s.cursor); triggerChange(); } },
    redo: () => { if (state.historyPtr < state.history.length - 1) { state.historyPtr++; const s = state.history[state.historyPtr]; render(s.segments); setCursorOffset(s.cursor); triggerChange(); } },
    focus: () => input.focus(),
    getCursorOffset,
    setCursorOffset,
    getCursorPosition: () => {
      const sel = window.getSelection(); if (!sel.rangeCount || !input.contains(sel.getRangeAt(0).commonAncestorContainer)) return null;
      const span = document.createElement('span'); span.textContent = '\u200b';
      sel.getRangeAt(0).insertNode(span); const rect = span.getBoundingClientRect(); span.remove(); input.normalize(); return rect;
    },
    setKeyMap: (map) => {
      state.keyMap = {}; if (!map) return;
      for (const k in map) state.keyMap[normalizeKeyDescriptor(k)] = map[k];
    },
    onchange: null, onfocus: null, oncursor: null, onclick: null, onmousedown: null, onmouseup: null, onmouseover: null, onmouseout: null,
  };

  ['click', 'mousedown', 'mouseup', 'mouseover', 'mouseout'].forEach(ev => {
    const publicEventName = 'on' + ev;
    input.addEventListener(ev, e => mouseHandler(e, publicAPI[publicEventName]));
    if (options[publicEventName]) publicAPI[publicEventName] = options[publicEventName];
  });
  ['change', 'focus', 'cursor'].forEach(ev => {
    const publicEventName = 'on' + ev;
    if (options[publicEventName]) publicAPI[publicEventName] = options[publicEventName];
  });
  if (options.keyMap) publicAPI.setKeyMap(options.keyMap);

  publicAPI.setValue(options.value || '');
  setCursorOffset(0);
  triggerChange();
  publicAPI.oncursor?.(publicAPI);
  return publicAPI;
}

// reread editor (customized token editor)
export function rereadEditor(parent, options = {}) {
  options.keyMap = rereadKeyMap;
  options.defaultNewline = makeToken(REREAD_HARD_NEWLINE);
  if (options.debounce === undefined) options.debounce = 200;
  const container = div({ className: 'rr-editor-container' });
  parent.appendChild(container);
  const editor = tokenEditor(container, options);
  editor.caseInheritance = options.caseInheritance;
  container.appendChild(rereadButtonBar(editor));
  editor.fromRe = (reStr) => {
    try {
      const rrSegments = reToRr(reStr);
      if (rrSegments.caseSensitive) editor.caseButton.classList.add('selected');
      else editor.caseButton.classList.remove('selected');
      if (options.caseInheritance && rrSegments.caseSensitive === undefined) editor.caseButton.classList.add('deselected');
      editor.caseButton.title = editor.caseButton.classList.contains('selected') ? CASE_SENSITIVE_HINT : editor.caseButton.classList.contains('deselected') ? CASE_INHERITABLE_HINT : CASE_INSENSITIVE_HINT;
      editor.setValue(rrSegments);
      rrSegments.forEach(seg => {
        if (seg.class === CLASS.CUSTOM) {
          addCustomTokenButton(editor, seg.text, seg.data.re);
        }
      });
      return true;
    } catch (err) {
      editor.setValue({ token: 'rr-error rr-token', text: `Error importing regular expression (click to dismiss):\n${err.message}` });
      editor._originalOnCursor = editor.oncursor;
      editor.oncursor = (editor) => {
        editor.setValue(editor.getValue().filter(seg => !seg?.token?.includes('rr-error')));
        editor.oncursor = editor._originalOnCursor;
      }
      return false;
    }
  }
  editor.toRe = () => {
    const rrSegments = editor.getValue();
    rrSegments.caseSensitive = editor.caseButton.classList.contains('selected') ? true : editor.caseButton.classList.contains('deselected') ? undefined : false;
    const reStr = rrToRe(rrSegments);
    return reStr;
  }
  editor.toRegExp = () => {
    return new RegExp(editor.toRe());
  }
  editor.onclick = (e, editor, offset) => {
    const tokenElement = e.targetTokenElement;
    if (!tokenElement) return;
    for (const tokenClass in rereadClickMap) {
      if (tokenElement.classList.contains(tokenClass)) {
        rereadClickMap[tokenClass](editor, tokenElement, e.clientX, e.clientY);
        return;
      }
    }
  }
  return editor;
}


/** --- CSS theme --- */

const rrButtonTheme = {
  ".rr-button-bar": {
    "font-size": "0.8rem",
  },
  ".rr-button": {
    "padding": ".1em .75em",
    "border-radius": "4px !important",
    "color": "#ccc",
    "position": "relative",
    "display": "inline-flex",
    "justify-content": "center",
    "align-items": "center",
    "background-color": "#444",
    "border": "none",
    "cursor": "pointer",
  },
  ".rr-button:hover": {
    "outline": "1px solid #888",
  },
  ".rr-button:active": {
    "background-color": "#888",
  },
  ".rr-button-row": {
    "display": "flex",
    "flex-wrap": "wrap",
    "gap": "0.25em"
  },
  ".rr-button-row > .rr-button > .rr-button-menu": {
    "visibility": "hidden",
    "z-index": "10",
    "padding": "1em",
    "background-color": "#eee",
    "box-shadow": "rgba(0, 0, 0, 0.35) 0px 5px 15px",
    "color": "black",
    "position": "absolute",
    "top": "100%",
    "left": "0px",
    "width": "max-content",
    "max-width": "300px",
    "display": "flex",
    "flex-direction": "column",
    "gap": "0.5em"
  },
  "[dark-theme] + .rr-button-row > .rr-button > .rr-button-menu": {
    "background-color": "#282c34",
    "color": "#eee",
  },
  ".rr-button-row > .rr-button:hover > .rr-button-menu": {
    "visibility": "visible"
  },
  ".rr-button-menu .rr-button-row:not(:last-child)": {
    "padding-bottom": "0.5em",
    "border-bottom": "1px dashed #888"
  },
  ["." + CLASS.CASE_BUTTON]: {
    "--btn-bg-color": "#eee",
    "--btn-txt-color": "#55b",
    "font-family": '"Arial Narrow"',
    "margin-right": ".25em",
    "margin-left": ".25em",
    "background-color": "var(--btn-bg-color) !important",
    "color": "var(--btn-txt-color) !important",
    "border": "solid 1px var(--btn-txt-color) !important",
  },
  ["." + CLASS.CASE_BUTTON + ".selected"]: {
    "background-color": "var(--btn-txt-color) !important",
    "color": "var(--btn-bg-color) !important",
  },
  ["." + CLASS.CASE_BUTTON + ".deselected"]: {
    "background-color": "gray !important",
    "color": "black !important",
    "text-decoration": "line-through !important",
  },
  ["." + CLASS.OPTION]: {
    "background-color": "transparent !important",
    "color": "#eee",
    "mix-blend-mode": "difference",
    "width": "100%",
    "justify-content": "flex-start",
  },
}

const rrWidgetTheme = {
  ".rr-widget": {
    "position": 'fixed',
    "z-index": '1000',
    "background-color": 'rgb(200,200,205)',
    "color": 'black',
    "font-size": '0.8rem',
    "padding": '.5em 1em',
    "border-radius": '3px',
    "display": 'flex',
    "flex-direction": 'column',
    "align-items": 'center',
    "gap": '.2em',
    "box-shadow": 'rgba(0, 0, 0, 0.35) 0px 5px 15px',
    "border": 'solid 1px #888',
    "max-width": '90vw',
    "max-height": '90vh',
  },
  "[dark-theme] .rr-widget": {
    "background-color": 'rgb(50,50,60)',
    "color": '#ccc',
  },
  ".rr-widget input:not([type='button']):not([type='submit'])": {
    "border": 'none',
    "outline": 'none',
    "font-size": '0.8rem',
    "border-radius": '3px',
    "max-width": '20em',
  },
  ".rr-widget input:invalid": {
    "color": '#f99',
    "text-decoration": 'line-through',
  },
  ".rr-toggle :first-child": {
    "border-radius": '5px 0 0 5px',
  },
  ".rr-toggle :last-child": {
    "border-radius": '0 5px 5px 0',
  },
  ".rr-toggle button": {
    "border": 'none',
    "outline": 'none',
    "padding": '.2em .5em',
    "font-size": '0.8rem',
    "cursor": 'pointer',
  },
  ".rr-toggle button.selected": {
    "background-color": '#222',
    "color": '#eee',
  },
  ".rr-widget.rr-centered-popup": {
    "top": '50vh',
    "left": '50vw',
    "transform": 'translate(-50%, -50%)',
    "overflow": 'auto',
    "width": 'max-content',
    "height": 'max-content',
  },
}

const rrTheme = {
  // all tokens
  ["." + CLASS.TOKEN]: {
    "font-size": "80%",
    "margin-left": ".75px"
  },
  // newline
  ["." + CLASS.NEWLINE]: {
    "display": 'contents',
  },
  // comment
  ["." + CLASS.COMMENT]: {
    "padding-left": ".2em",
    "padding-right": ".2em",
    "color": "gray",
    "font-style": "italic",
    "border": "1px solid gray",
    "cursor": 'pointer',
  },
  // symbols
  ["." + CLASS.SYMBOL]: {
    "color": "#c678dd",
    "mix-blend-mode": 'difference',
  },
  // other tokens
  ["." + CLASS.OPERATOR]: {
    "border": '0.5px solid #c678dd',
    "background-color": "rgba(128, 128, 128, 0.15)",
    "color": "#c678dd",
    "border-radius": "100%",
    "aspect-ratio": "1 / 1",
    "overflow": "hidden",
    "padding": "2px",
    "display": "inline-flex",
    "align-items": "center",
    "justify-content": "center",
    "vertical-align": "top",
    "mix-blend-mode": 'difference',
  },
  ["." + CLASS.CHAR]: {
    "background-color": "rgba(98, 120, 221, 0.62)",
    "color": "#ddd",
    "border-radius": "1px",
    "padding": "0 0.5em",
    "mix-blend-mode": 'difference',
  },
  ["." + CLASS.TEXT]: {
    "background-color": "rgba(65, 160, 255, 0.62)",
    "color": "#eee",
    "border-radius": "999em",
    "padding": "0 0.5em",
    "mix-blend-mode": 'difference',
  },
  ["." + CLASS.TEXT_MAYBE]: {
    "background-color": "rgba(65, 160, 255, 0.4)",
    "color": "#eee",
    "border-radius": "999em",
    "padding": "0 0.5em",
    "mix-blend-mode": 'difference',
  },
  ["." + CLASS.CUSTOM]: {
    "background-color": "rgba(42, 100, 200, 0.62)",
    "color": "#eee",
    "border-radius": "999em",
    "padding": "0 0.5em",
    "cursor": "pointer",
    "border": '0.5px solid #ccc',
    "mix-blend-mode": 'difference',
  },
  ["." + CLASS.QUANT]: {
    "background": 'linear-gradient(to right, rgba(198, 120, 221, 0.2), rgba(198, 120, 221, 0.8))',
    "color": "#eee",
    "padding": "0 0.5em",
    "border-radius": "0 999em 999em 0",
    "cursor": "pointer",
    "border": '0.5px solid #ccc',
    "mix-blend-mode": 'difference',
  },
  ["." + CLASS.CUSTOM_CHARSET]: {
    "background-color": "rgba(98, 120, 221, 0.62)",
    "color": "#eee",
    "border-radius": "1px",
    "padding": "0 0.5em",
    "cursor": "pointer",
    "mix-blend-mode": 'difference',
  },
  ["." + CLASS.CUSTOM_CHARSET + "." + CLASS.TOKEN]: {
    "border": '0.5px solid #ccc',
  },
  ["." + CLASS.CUSTOM_CHARSET + "." + CLASS.CHARSET_NEGATIVE]: {
    "text-decoration": 'line-through',
    "text-decoration-thickness": '2px',
  },
  ["." + CLASS.QUANT_LAZY]: {
    "background": 'linear-gradient(to right, rgba(198, 120, 221, 0.8), rgba(198, 120, 221, 0.2))',
    "color": "#eee",
    "padding": "0 0.5em",
    "border-radius": "0 999em 999em 0",
    "cursor": "pointer",
    "border": '0.5px solid #ccc',
    "mix-blend-mode": 'difference',
  },
  [`.${CLASS.QUANT}:hover, .${CLASS.QUANT_LAZY}:hover, .${CLASS.CUSTOM}:hover, .${CLASS.CUSTOM_CHARSET}:hover, .${CLASS.COMMENT}:hover`]: {
    "outline": '0.5px solid #ccc',
  },
  [`.${CLASS.ERROR}`]: {
    "background-color": 'rgba(255, 0, 0, 0.5)',
    "padding": '0 0.5em',
    "cursor": 'pointer',
    "border": '0.5px solid #ccc',
    "display": 'block',
    "white-space": 'pre-wrap',
  }
}

const rrEditorTheme = {
  ".rr-editor-container": {
    "display": 'flex',
    "flex-direction": 'column',
    "gap": '0.15em',
  },
  ".rr-editor": {
    "--caret-color": "#007bff",
    "font-family": "Menlo, Consolas, 'DejaVu Sans Mono', monospace",
    "font-weight": "350",
    "color": "#333",
    "background-color": "#eee",
    "outline": '1px solid #ccc',
    "height": '5em',
    "resize": 'both',
    "caret-color": "var(--caret-color)",
    "caret-width": '2px',
  },
  ".rr-editor[dark-theme]": {
    "--caret-color": "#9cf",
    "color": "#abb2bf",
    "background-color": "#282c34",
    "outline": '1px solid #ccc',
  },
  ".rr-error-message": {
    "color": '#d63638',
    "font-size": '0.8rem',
  },
  "[dark-theme] ~ .rr-error-message": {
    "color": '#ff6b6b',
  }
};

injectTheme(rrEditorTheme);
injectTheme(rrButtonTheme);
injectTheme(rrWidgetTheme);
injectTheme(rrTheme);
