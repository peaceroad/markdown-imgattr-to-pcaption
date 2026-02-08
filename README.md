# markdown-imgattr-to-pcaption

Convert image alt/title text into caption paragraphs that work with
`p7d-markdown-it-p-captions`.

## Install

```bash
npm i @peaceroad/markdown-imgattr-to-pcaption
```

## Markdown transformer (`index.js`)

### Usage

```js
import setMarkdownImgAttrToPCaption from '@peaceroad/markdown-imgattr-to-pcaption'

const out = setMarkdownImgAttrToPCaption(markdown)
```

### Example

Input:

```md
Paragraph.

![A caption](image.jpg)

Paragraph.
```

Output:

```md
Paragraph.

Figure. A caption

![](image.jpg)

Paragraph.
```

### Options

- `imgTitleCaption` (`boolean`, default: `false`)
  - Use image `title` as caption source.
  - When enabled, `imgAltCaption` behavior is disabled.
- `labelLang` (`string`, default: `en`)
  - Default label language (`en`/`ja` out of the box).
- `autoLangDetection` (`boolean`, default: `true`)
  - Detect language from the first eligible image caption.
  - `ja` if Japanese characters exist.
  - `en` if ASCII letters exist.
  - Otherwise keeps the current `labelLang`.
- `labelSet` (`object|null`, default: `null`)
  - Override generated `label` / `joint` / `space`.
  - Supports single config or per-language map.

Single config example:

```js
setMarkdownImgAttrToPCaption(markdown, {
  labelSet: { label: '図', joint: '：', space: '　' }
})
```

Per-language config example:

```js
setMarkdownImgAttrToPCaption(markdown, {
  labelSet: {
    en: { label: 'Figure', joint: '.', space: ' ' },
    ja: { label: '図', joint: '　', space: '' },
    fr: { label: 'Fig', joint: '.', space: ' ' },
  }
})
```

### Conversion rules

- Converts only single-line image syntax surrounded by blank lines.
- Skips fenced code blocks (``` and ~~~).
- Skips display math fence blocks using `$` markers (`$$ ... $$`, `$$$$ ... $$$$`, etc.).
- Uses `p7d-markdown-it-p-captions` label patterns for label detection.
- `autoLangDetection` runs once on the first eligible image.

## Browser DOM helper (`script/set-img-figure-caption.js`)

### Usage

```html
<script type="module">
import setImgFigureCaption from '@peaceroad/markdown-imgattr-to-pcaption/script/set-img-figure-caption.js'

await setImgFigureCaption({
  imgAltCaption: true,
  imgTitleCaption: false,
  observe: true,
})
</script>
```

### Behavior

- Mirrors label/caption decisions from markdown transformer.
- In `observe` mode, keeps one observer per document.
- Uses internal source cache for stable reprocessing without extra DOM attributes.
- Re-detects language when first-image context changes.

### Options

- `imgAltCaption` (`boolean|string`, default: `true`)
- `imgTitleCaption` (`boolean|string`, default: `false`)
- `labelLang` (`string`, default: `en`)
- `autoLangDetection` (`boolean`, default: `true`)
- `labelSet` (`object|null`, default: `null`)
- `figureClass` (`string`, default: `f-img`)
- `readMeta` (`boolean`, default: `false`)
- `observe` (`boolean`, default: `false`)

## Limitations

- Only single-line inline image syntax is supported.
  - Supported forms include `![alt](url "title")` and `![alt](url (title))`.
- Multi-line image link syntax is out of scope.
- Complex `alt` text patterns that rely on raw `](` are out of scope.
- Indented code blocks (4 spaces or tab) are out of scope.
  - Use fenced code blocks if you need guaranteed skip behavior.
- Some non-inline image styles (for example reference-style edge cases) are out of scope.

## Related plugin

If you use markdown-it figure/caption flows, see:

- `@peaceroad/markdown-it-figure-with-p-caption`
