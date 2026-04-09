# ReRead.js

ReRead.js is a JavaScript library for editing text patterns in a more readable and maintainable way than standard regular expressions, with the ability to
- import from and export to regular expression code;
- add comments and break up the pattern into multiple lines;
- create custom named tokens for common and/or complex patterns.

Table below shows sample regular expressions (middle), along with how they would be represented in the ReRead editor (left) and sample matching text (right):
| ReRead | Regular Expression | Sample Matching Text
| --- | --- | --- |
| abc | `abc` | abc |
| <span style="background-color: rgba(65, 160, 255, 0.4);color: #eee;  border-radius: 999em;padding:0 0.5em; mix-blend-mode: difference;" title="zero or more spaces or tabs or newlines">whitespace?</span><span style="color: #c678dd;    mix-blend-mode: difference;">⦅</span><span>hello</span><span style="border: 0.5px solid #c678dd; background-color: rgba(128, 128, 128, 0.15);  color: #c678dd;   border-radius: 100%;   aspect-ratio: 1 / 1; overflow: hidden; padding: 2px; display: inline-flex; align-items: center; justify-content: center; vertical-align: top; mix-blend-mode: difference;" title="𝙤𝙧 operator (i.e., disjunction); used to indicate valid alternatives (e.g., HELLO𝙤𝙧HI)">𝙤𝙧</span><span>hi</span><span style="color: #c678dd;    mix-blend-mode: difference;">⦆</span><span style="background-color: rgba(65, 160, 255, 0.4);color: #eee;  border-radius: 999em;padding:0 0.5em; mix-blend-mode: difference;" title="zero or more spaces or tabs or newlines">whitespace?</span> | `^[\s]*(hello\|hi)[\s]*$` | hello, hi |
| <span style="background-color: rgba(65, 160, 255, 0.62);color: #eee; border-radius: 999em;padding:0 0.5em; mix-blend-mode: difference;">var</span><span style="background-color: rgba(65, 160, 255, 0.4);color: #eee; border-radius: 999em;padding:0 0.5em; mix-blend-mode: difference;" title="zero or more spaces">spaces?</span>=<span style="background-color: rgba(65, 160, 255, 0.4);color: #eee; border-radius: 999em;padding:0 0.5em; mix-blend-mode: difference;" title="zero or more spaces">spaces?</span><span style="background-color: rgba(65, 160, 255, 0.62);color: #eee; border-radius: 999em;padding:0 0.5em; mix-blend-mode: difference;" title="quoted text">"..."</span> | `^[a-zA-Z_][a-zA-Z0-9_]\*[ ]\*=[ ]\*(?<!\\)"(\\"\|[^"\n])\*"$` | my_var1 = "hello" |
| <span style="background-color: rgba(42, 100, 200, 0.62);color: #eee; border-radius: 999em;padding:0 0.5em; border: 0.5px solid #ccc; mix-blend-mode: difference;" title="text similar to 'inheritance'">≈inheritance</span> | `^(?i:($≈inheritance\|(ii?nn?hh?ee?rr?ii?tt?aa?nn?cc?ee?\|i.?heritance\|in.?eritance\|inh.?ritance\|inhe.?itance\|inher.?tance\|inheri.?ance\|inherit.?nce\|inherita.?ce\|inheritan.?e\|inheritanc.?\|inheritance.)))$` | inheritancce |


Check out the [Demo 👈](https://rereadjs.github.io/src/demo/index.html).

Did you find a bug? Do you have suggestions?  
Please add your issue to the [issue tracker](https://github.com/rereadjs/rereadjs.github.io/issues).


## Usage

### Basic Usage

Import as module:
```javascript
import { rereadEditor } from 'https://cdn.jsdelivr.net/gh/rereadjs/rereadjs.github.io@1.0/src/reread.min.js';
```

Create a new ReRead editor:
```javascript
// create editor and append it to some parentElement
const rr_editor = rereadEditor(parentElement, {
  height: '20em',
  width: '80em'
});
```

Import regular expression string into ReRead editor:
```javascript
const regexString = '(hello|hi) world';
rr_editor.fromRe(regexString);
```

Export ReRead content to regular expression string:
```javascript
const regexString = rr_editor.toRe();
```

Export ReRead content to a JS compiled regular expression object:
```javascript
const regex = rr_editor.toRegExp();
```

Add onchange event listener (fires every time ReRead editor content changes):
```javascript
const rr_editor = rereadEditor(parentElement, {
  height: '20em'
});
rr_editor.onchange = (editor) => {
  console.log('ReRead editor content changed.');
  console.log('Editor content: ', editor.getValue());
  console.log('Regular expression string: ', editor.toRe());
};
```

See [demo](src/demo) for a complete example.
Demo source code: [https://github.com/rereadjs/rereadjs.github.io/tree/main/src/demo](https://github.com/rereadjs/rereadjs.github.io/tree/main/src/demo)

---
## API Reference

### `rereadEditor(element, options)`

Creates a new ReRead editor instance.

**Parameters:**

- `element`: The DOM element where the editor will be appended to
- `options`: Configuration options
  - `height`: Editor height (default: '20em')
  - `width`: Editor width (default: '100%')
  - `resize`: Enable resizing (default: 'both')
  - `value`: Initial value (default: `[]`; expected array of tokens, where each token is either a string or an object with `text` and `token` properties)
  - `onchange`: Event listener that fires every time ReRead editor content changes (expected value: `function(editor) => void`)
  - `onfocus`: Event listener that fires when ReRead editor gains focus (expected value: `function(editor) => void`)
  - `oncursor`: Event listener that fires when cursor position changes (expected value: `function(editor) => void`)
  - `onclick`: Event listener that fires when ReRead editor is clicked (expected value: `function(event, editor) => void`)
  - `onmousedown`: Event listener that fires when ReRead editor is mousedown (expected value: `function(event, editor) => void`)
  - `onmouseup`: Event listener that fires when ReRead editor is mouseup (expected value: `function(event, editor) => void`)
  - `onmouseover`: Event listener that fires when ReRead editor is mouseover (expected value: `function(event, editor) => void`)
  - `onmouseout`: Event listener that fires when ReRead editor is mouseout (expected value: `function(event, editor) => void`)

**Returns:**

- `editor`: The ReRead editor instance

---
### `editor.setValue(value)`

Sets the value of the editor.

**Parameters:**

- `value`: Array of tokens. Each token can be a string or an object with `text` and `token` properties.

---
### `editor.getValue()`

Gets the current value of the editor as an array of tokens.

**Returns:**

- `value`: The current value as an array of tokens.

---
### `editor.toRe()`

Converts the ReRead value to a regular expression string.

**Returns:**

- `regexString`: The regular expression string

---
### `editor.fromRe(regexString)`

Converts a regular expression string to ReRead value.

**Parameters:**

- `regexString`: The regular expression string

---
### `editor.toRegExp()`

Converts the ReRead value to a RegExp object.

**Returns:**

- `regex`: The RegExp object

---
### `editor.onchange`

Event listener that fires every time ReRead editor content changes.
Bind this to a function that will be called every time ReRead editor content changes.
The bound function will receive the editor instance as an argument.

**Parameters:**

- `editor`: The editor instance


---
## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Contact

For questions or support, please [open an issue](https://github.com/rereadjs/rereadjs.github.io/issues) on the GitHub repository.
This is a side-project; please don't be too harsh in your feedback. ❤️

## Acknowledgments

- [CodeMirror](https://codemirror.net/) - Code editor for the visual interface of regular expressions and test strings used in [demo/index.html](demo/index.html)
- [JavaScript RegExp](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions) - JavaScript regular expression documentation

## Support

If you find this library useful, please consider giving it a star on GitHub! ⭐
