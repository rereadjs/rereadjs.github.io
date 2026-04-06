# ReRead.js

ReRead.js is a JavaScript library for editing text patterns in a more readable and maintainable way than standard regular expressions, with the ability to
- import from and export to regular expression code;
- add comments and break up the pattern into multiple lines;
- create custom named tokens for common and/or complex patterns.



## Usage

### Basic Usage

Import as module:
```javascript
import { rereadEditor } from 'https://cdn.jsdelivr.net/gh/rereadjs/rereadjs.github.io@1.0/src/reread.min.js';
```

Create a new ReRead editor:
```javascript
// place into some parentElement
const rr_editor = rereadEditor(parentElement, {
  height: '20em'
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
rr_editor.onchange = () => {
  console.log('ReRead editor content changed');
};
```

See [demo](src/demo) for a complete example.


---
## API Reference

---
### `rereadEditor(element, options)`

Creates a new ReRead editor instance.

**Parameters:**

- `element`: The DOM element where the editor will be placed
- `options`: Configuration options
  - `height`: Editor height (default: '20em')
  - `width`: Editor width (default: '100%')
  - `resize`: Enable resizing (default: 'both')

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


================

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Contact

For questions or support, please open an issue on the GitHub repository.
This is a side-project; please don't be too harsh in your feedback.

## Acknowledgments

- [CodeMirror](https://codemirror.net/) - Code editor for the visual interface of regular expressions and test strings used in [demo/index.html](demo/index.html)
- [JavaScript RegExp](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions) - JavaScript regular expression documentation

## Support

If you find this library useful, please consider giving it a star on GitHub! ⭐
