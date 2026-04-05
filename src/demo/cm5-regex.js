
import "https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.5/codemirror.min.js";
import "https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.5/addon/mode/simple.min.js";

const MODE_NAME = "regex";

CodeMirror.defineSimpleMode(MODE_NAME, {
  // common classes: keyword, atom, def,
  //  variable-2, variable-3, string, string-2, number,
  //  operator, strikethrough, type, comment, builtin, bracket, tag, meta, em, strong
  start: [
    // Character Set / Class (Highest Priority: switches state)
    { regex: /\[/, token: "bracket strong", next: "charClass" }, 
    // Escapes (Metacharacters and Classes)
    // \d, \D, \w, \W, \s, \S, \b, \B, \uXXXX, \xXX, \cI, \1, \t, etc.
    { regex: /\\[bdswBDWS0ntvrfxu]/, token: "string" }, 
    // Lookaheads/Lookbehinds/Non-capturing groups
    { regex: /\(\?[:!=<][^)]*/, token: "meta", next: "group" }, 
    // Grouping / Capturing
    { regex: /[\(\)]/, token: "bracket" },
    // Quantifiers
    { regex: /[\*\+\?]|(\{\d+(,\d*)?\})/, token: "number" }, 
    // Anchors and Alternation
    { regex: /[\^\|\$]/, token: "keyword" },
    // Literal Characters (Any character not matched above)
    { regex: /./, token: null }
  ],
  // State for inside a Character Set [...]
  charClass: [
    // End of Character Set: switches back
    { regex: /\]/, token: "bracket strong", pop: true, next: "start" },
    // Set Negation
    { regex: /\^/, token: "string-2 strong" }, 
    // Ranges (literal hyphen) or other special chars (e.g., .)
    { regex: /[.-]/, token: "string-2 strong" },
    // Escapes inside the set (must still be respected)
    { regex: /\\./, token: "atom" }, 
    // Fallback: Everything else is a literal character
    { regex: /./, token: null }
  ],
  // Simple state to handle group content (optional, to ensure closing ')' is found)
  group: [
    { regex: /\)/, token: "bracket", pop: true, next: "start" },
    { regex: /./, token: null }
  ]
});
