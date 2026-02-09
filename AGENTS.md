# AGENTS.md

## Purpose

This file documents the current implementation workflow so contributors can keep behavior consistent across `index.js` and `script/set-img-figure-caption.js`.

## Project map

- `index.js`: Markdown text transformer (markdown -> markdown)
- `script/caption-common.js`: shared label/lang detection + label-prefix utilities
- `script/set-img-figure-caption.js`: Browser DOM helper (`img` -> `figure/figcaption`)
- `test/test.js`: fixture-based transformer tests + DOM helper tests
- `test/examples-*.txt`: input/output fixtures for markdown transformer

## Core workflow: `index.js`

### Entry point

- Function: `setMarkdownImgAttrToPCaption(markdown, option)`
- Output keeps original line-ending style (`\n` / `\r\n`).

### Processing steps

1. Normalize runtime options.
   - Defaults: `imgAltCaption: true`, `imgTitleCaption: false`, `labelLang: 'en'`, `autoLangDetection: true`.
   - Boolean flags accept boolean values only; non-boolean values are ignored.
   - If `imgTitleCaption` is enabled, `imgAltCaption` is disabled.
2. Split markdown into lines and scan line-by-line.
3. Skip fenced code blocks.
   - backtick fences (\`\`\`)
   - tilde fences (~~~)
   - dollar math fences (`$$ ... $$`, `$$$$ ... $$$$`, etc.)
4. Treat a line as eligible only when:
   - line is a single-line image syntax, and
   - both previous/next lines are blank.
5. On the first eligible image only, optionally run `autoLangDetection`.
6. Build label metadata once (`labelLang` + optional `labelSet`).
7. Transform each eligible image via `modLine`:
   - Case A: caption already has label (`captionMarkRegImg`) -> keep caption label as-is.
   - Case B: label without joint (`labelOnlyReg`) -> keep label, normalize image alt.
   - Case C: no label -> prepend generated label prefix (`buildLabelPrefix`).
8. If no line changed, return original markdown as-is.
9. Otherwise join lines back with preserved line breaks.

### Supported single-line image forms

- `![alt](url "title")`
- `![alt](url 'title')`
- `![alt](url (title))`

### Detection and label rules

- Label detection regex source: `p7d-markdown-it-p-captions` via `getMarkRegForLanguages`.
- `autoLangDetection`:
  - `ja` if Japanese code points are found.
  - `en` if ASCII letters are found and no conflicting non-ASCII letters.
  - otherwise fallback to existing `labelLang`.

## Core workflow: `script/set-img-figure-caption.js`

### Entry point

- Function: `setImgFigureCaption(option = {})`
- Purpose: mirror markdown-transformer caption behavior directly on DOM.

### Processing steps

1. Normalize options and merge optional frontmatter meta (`readMeta`).
   - Runtime flags are boolean-only (`imgAltCaption`, `imgTitleCaption`, `autoLangDetection`, `readMeta`, `observe`).
   - Frontmatter flags are applied only when values are actual booleans.
2. If caption mode is disabled (`imgAltCaption` and `imgTitleCaption` both false), return.
3. Resolve runtime label options with `autoLangDetection` cache.
4. Collect target images by `scope`:
   - `all`: all images (default).
   - `standalone`: images without significant siblings + images already inside `figure`.
   - `figure-only`: only images already inside `figure`.
5. Process target images:
   - Build caption result using same 3 cases as markdown transformer.
   - Apply image attribute updates.
   - Wrap/update `<figure><figcaption>`.
   - Skip disconnected image nodes (`img.isConnected === false`).

### Observe mode (`observe: true`)

- Maintains at most one active observer per `document` (`activeObserverByDocument`).
- Replacing behavior:
  - re-calling with `observe: true` disconnects previous observer.
  - calling with `observe: false` disconnects existing observer.
- Uses internal source cache (`sourceValueByImage`: `WeakMap`) so re-runs are stable without adding DOM attributes.
- Uses own-mutation guard (`ownAttributeMutationByImage`) to avoid reacting to helper-triggered `alt`/`title` updates.
- On external `alt`/`title` mutation:
  - syncs source cache,
  - schedules reprocess,
  - resets auto-language when first image changes.
- On image tree change (`childList`) and meta change:
  - may trigger full reprocess (`pendingAll`) and language cache reset.
  - for `scope: 'standalone'`, child-list sibling changes also queue affected sibling `img` nodes for reevaluation.

## Behavior parity contract

Keep these aligned between `index.js` and DOM helper:

- Shared label/lang utilities from `script/caption-common.js`
- No-label prefix generation (`labelLang`, `autoLangDetection`, `labelSet`)
- `imgTitleCaption` precedence over `imgAltCaption`
- Label-without-joint handling

## Compatibility notes

- This project depends on `p7d-markdown-it-p-captions@^0.21.0`.
- `script/caption-common.js` is the single place that uses `getMarkRegForLanguages(...)`.
- Do not import removed legacy `markReg` export.
- Boolean-like strings are not treated as option flags.

## Out of scope (for now)

- Complex `alt` text forms that rely on raw `](` patterns are not supported.
- Multi-line image link syntax is not supported (`![alt]( ... )` split across lines).
- Non-inline image styles (for example some reference-style edge cases) are out of scope.

## Tests

Run:

```bash
npm test
```

Coverage currently includes:

- Markdown transformer fixtures (`test/examples*.txt`)
- DOM helper behavior
  - wrapping/updating/removing captions
  - scope filtering (`all` / `standalone` / `figure-only`)
  - observer replacement and teardown
  - first-image language re-detection
  - source sync on external attribute edits

## Performance guardrails

- Avoid duplicate regex matches for the same image line.
- Prefer boolean `.test()` when full regex match data is not needed.
- Keep auto-language detection cached and reset only when needed.
- Avoid global rescans during observe updates unless required (`pendingAll`).
