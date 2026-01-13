# markdown-imgattr-to-pcaption

Change img alt attribute to figure caption paragraph for p7d-markdown-it-p-captions.

```
import setMarkdownImgAttrToPCaption from '@peaceroad/markdown-imgattr-to-pcaption'

setMarkdownImgAttrToPCaption(markdownCont)
```

## Browser DOM helper (live preview)

This package also provides a DOM helper to turn image alt/title into `<figure><figcaption>` on the fly.
It is useful for live preview environments that do not re-run markdown-it on each edit.
This helper does not insert label prefixes; it uses the raw alt/title text as the caption.

```html
<script type="module">
import setImgFigureCaption from '@peaceroad/markdown-imgattr-to-pcaption/script/set-img-figure-caption.js'

await setImgFigureCaption({
  imgAltCaption: true,
  imgTitleCaption: false,
  observe: true
})
</script>
```

### DOM helper options

- `imgAltCaption` (boolean|string): use `alt` text as caption (strings are treated as true)
- `imgTitleCaption` (boolean|string): use `title` text as caption (strings are treated as true)
- `preferAlt` (boolean): when both are enabled, prefer alt (default true)
- `figureClass` (string): class name for created figures (default `f-img`)
- `readMeta` (boolean): read `<meta name="markdown-frontmatter">` and apply `imgAltCaption` / `imgTitleCaption`
- `observe` (boolean): re-run on DOM changes (MutationObserver)

```
[Input]
段落。段落。段落。

![キャプション](image.jpg)

段落。段落。段落。


[Output]
段落。段落。段落。

図　キャプション

![](image.jpg)

段落。段落。段落。


[Input]
段落。段落。段落。

![図 キャプション](image.jpg)

段落。段落。段落。

[Output]
段落。段落。段落。

図 キャプション

![](image.jpg)

段落。段落。段落。



[Input]
段落。段落。段落。

![図1 キャプション](image.jpg)

段落。段落。段落。

[Output]
段落。段落。段落。

図1 キャプション

![](image.jpg)

段落。段落。段落。
```

## Option

### imgTitleCaption

Default: false.

```
[Input]
段落。段落。段落。

![ALT](image.jpg "キャプション")

段落。段落。段落。


[Output]
段落。段落。段落。

図　キャプション

![ALT](image.jpg)

段落。段落。段落。
```

### labelLang

Default: 'en'.

```
[Input]
段落。段落。段落。

![キャプション](image.jpg)

段落。段落。段落。


[Output]
段落。段落。段落。

図　キャプション

![](image.jpg)

段落。段落。段落。
```

### autoLangDetection

Default: true. To force a specific `labelLang`, set `autoLangDetection: false`.
When `autoLangDetection` is true, it can override an explicitly set `labelLang` (it is treated as the fallback when detection cannot decide).

Detect `labelLang` from the first image caption line. If the caption text contains Japanese characters, it sets `labelLang: 'ja'`. Otherwise, if the caption contains ASCII letters, it sets `labelLang: 'en'` (symbols/emoji are ignored). If the caption contains non-ASCII letters such as accents, the existing `labelLang` is left unchanged.

Example (non-ASCII letters keep the current `labelLang`):

```
[Input]
段落。

![Café](image.jpg)

段落。

[Output]
段落。

Figure. Café

![](image.jpg)

段落。
```
Only `ja` and `en` are auto-detected. For other languages, set `labelLang` explicitly (and use `labelSet` as needed) or leave auto-detection off.
Detection runs only once on the first eligible image line; subsequent images do not affect the language choice.

### labelSet

Override the auto-inserted label, joint, and space for captions without labels (useful for other languages).
`labelSet` accepts either a single config for the current `labelLang` or a per-language map.
If a matching language entry is not found, the default (English) label config is used.

```
setMarkdownImgAttrToPCaption(markdownCont, {
  labelSet: { label: '図', joint: '：', space: '　' }
})
```

```
setMarkdownImgAttrToPCaption(markdownCont, {
  labelSet: {
    en: { label: 'Figure', joint: '.', space: ' ' },
    ja: { label: '図', joint: '　', space: '' },
    fr: { label: 'Fig', joint: '.', space: ' ' },
  }
})
```

## Notes

- Only converts images that are on a single line and surrounded by blank lines. Inline images or list items are not changed.
- Skips fenced code blocks (``` or ~~~).
- Label detection uses `p7d-markdown-it-p-captions` label patterns (en/ja by default). `labelSet` only affects auto-inserted labels when no label is detected.
- `autoLangDetection` inspects the first eligible image line and uses the caption text (title when `imgTitleCaption: true`, otherwise alt). If the caption text is empty, it falls back to alt.
