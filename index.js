import {
  analyzeCaptionText,
  buildLabelPrefix,
  detectAutoLang,
  normalizeCaptionText,
  normalizeCaptionRuntimeOption,
  resolveLabelConfig,
} from './script/caption-common.js'

const imageLineReg = /^([ \t]*?)!\[(.*?)\]\((.+)\)( *(?:{.*?})?)$/
const blankLineReg = /^[ \t]*$/
const imageTitleReg = /^(.*?)[ \t]+("((?:\\"|[^"])*)"|'((?:\\'|[^'])*)')[ \t]*$/
const imageParenTitleReg = /^(.*?)[ \t]+\(((?:\\\(|\\\)|[^()])*)\)[ \t]*$/

const parseFenceOpen = (line) => {
  let n = 0
  while (n < line.length) {
    const ch = line[n]
    if (ch !== ' ' && ch !== '\t') break
    n++
  }
  if (n >= line.length) return null
  const fenceChar = line[n]
  if (fenceChar !== '`' && fenceChar !== '~') return null
  let count = 0
  while (n < line.length && line[n] === fenceChar) {
    count++
    n++
  }
  if (count < 3) return null
  return { fenceChar, fenceLength: count }
}

const isFenceClose = (line, fenceChar, minLength) => {
  let n = 0
  while (n < line.length) {
    const ch = line[n]
    if (ch !== ' ' && ch !== '\t') break
    n++
  }
  let markerCount = 0
  while (n < line.length && line[n] === fenceChar) {
    markerCount++
    n++
  }
  if (markerCount < minLength) return false
  while (n < line.length) {
    const ch = line[n]
    if (ch !== ' ' && ch !== '\t') return false
    n++
  }
  return true
}

const parseDollarFenceOpen = (line) => {
  let n = 0
  while (n < line.length) {
    const ch = line[n]
    if (ch !== ' ' && ch !== '\t') break
    n++
  }
  if (n >= line.length || line[n] !== '$') return null

  let count = 0
  while (n < line.length && line[n] === '$') {
    count++
    n++
  }
  if (count < 2) return null

  while (n < line.length) {
    const ch = line[n]
    if (ch !== ' ' && ch !== '\t') return null
    n++
  }
  return { fenceLength: count }
}

const isDollarFenceClose = (line, minLength) => {
  let n = 0
  while (n < line.length) {
    const ch = line[n]
    if (ch !== ' ' && ch !== '\t') break
    n++
  }
  let markerCount = 0
  while (n < line.length && line[n] === '$') {
    markerCount++
    n++
  }
  if (markerCount < minLength) return false
  while (n < line.length) {
    const ch = line[n]
    if (ch !== ' ' && ch !== '\t') return false
    n++
  }
  return true
}

const parseImageHrefAndTitle = (rawValue) => {
  if (typeof rawValue !== 'string') return null
  let hrefPart = rawValue
  let title = ''

  const hasQuotedTitleCandidate = hrefPart.includes('"') || hrefPart.includes('\'')
  if (hasQuotedTitleCandidate) {
    const titleMatch = hrefPart.match(imageTitleReg)
    if (titleMatch) {
      hrefPart = titleMatch[1]
      title = titleMatch[3] !== undefined ? titleMatch[3] : (titleMatch[4] || '')
    }
  }
  if (title === '' && hrefPart.endsWith(')') && hrefPart.includes('(')) {
    const parenTitleMatch = hrefPart.match(imageParenTitleReg)
    if (parenTitleMatch) {
      hrefPart = parenTitleMatch[1]
      title = parenTitleMatch[2] || ''
    }
  }

  const href = hrefPart.trim()
  if (!href) return null
  if (!(href.startsWith('<') && href.endsWith('>')) && /[ \t]/.test(href)) {
    return null
  }

  return { href, title }
}

const parseImageLine = (line) => {
  const matched = line.match(imageLineReg)
  if (!matched) return null
  const parsed = parseImageHrefAndTitle(matched[3])
  if (!parsed) return null
  return {
    indent: matched[1] || '',
    alt: matched[2] || '',
    href: parsed.href,
    title: parsed.title,
    attrs: matched[4] || '',
  }
}

const getCaptionText = (imgLine, opt) => {
  if (opt.imgTitleCaption) {
    return imgLine.title || ''
  }
  return imgLine.alt || ''
}

const getCaptionTextForDetection = (imgLine, opt) => {
  const captionText = normalizeCaptionText(getCaptionText(imgLine, opt))
  if (captionText) {
    return captionText
  }
  return normalizeCaptionText(imgLine.alt || '')
}

const setMarkdownImgAttrToPCaption = (markdown, option) => {
  if (typeof markdown !== 'string') {
    throw new TypeError('setMarkdownImgAttrToPCaption: markdown must be a string')
  }
  const opt = normalizeCaptionRuntimeOption(option)
  if (!opt.imgAltCaption && !opt.imgTitleCaption) return markdown
  if (markdown.indexOf('![') === -1 || markdown.indexOf('](') === -1) return markdown

  const lines = markdown.split(/\r\n|\n/)
  const blankLines = []
  for (let n = 0; n < lines.length; n++) {
    blankLines[n] = blankLineReg.test(lines[n])
  }
  let activeFenceChar = ''
  let activeFenceLength = 0
  let activeDollarFenceLength = 0
  let br = '\n'
  const firstLfIndex = markdown.indexOf('\n')
  if (firstLfIndex > 0 && markdown[firstLfIndex - 1] === '\r') {
    br = '\r\n'
  }

  let labelMeta = null
  let autoLangChecked = !opt.autoLangDetection
  let changed = false

  for (let n = 0; n < lines.length; n++) {
    const line = lines[n]
    if (activeFenceChar) {
      if (isFenceClose(line, activeFenceChar, activeFenceLength)) {
        activeFenceChar = ''
        activeFenceLength = 0
      }
      continue
    }
    if (activeDollarFenceLength > 0) {
      if (isDollarFenceClose(line, activeDollarFenceLength)) {
        activeDollarFenceLength = 0
      }
      continue
    }

    const fenceOpen = parseFenceOpen(line)
    if (fenceOpen) {
      activeFenceChar = fenceOpen.fenceChar
      activeFenceLength = fenceOpen.fenceLength
      continue
    }
    const dollarFenceOpen = parseDollarFenceOpen(line)
    if (dollarFenceOpen) {
      activeDollarFenceLength = dollarFenceOpen.fenceLength
      continue
    }

    const isPrevBreakLine = (n === 0) ? true : blankLines[n - 1]
    const isNextBreakLine = (n === lines.length - 1) ? true : blankLines[n + 1]
    if (!isPrevBreakLine || !isNextBreakLine) continue
    if (line.indexOf('![') === -1 || line.indexOf('](') === -1) continue

    const imgLine = parseImageLine(line)
    if (!imgLine) continue

    if (!autoLangChecked) {
      const rawText = getCaptionTextForDetection(imgLine, opt)
      if (rawText) {
        const detected = detectAutoLang(rawText, opt.labelLang)
        if (detected) {
          opt.labelLang = detected
        }
      }
      autoLangChecked = true
    }
    if (!labelMeta) {
      labelMeta = resolveLabelConfig(opt)
    }
    const nextLine = modLine(imgLine, br, opt, labelMeta)
    if (nextLine !== line) {
      lines[n] = nextLine
      changed = true
    }
  }
  if (!changed) return markdown

  const lineBreaks = markdown.match(/\r\n|\n/g) || []
  const output = new Array(lines.length * 2 - 1)
  let outIndex = 0
  for (let n = 0; n < lines.length; n++) {
    output[outIndex] = lines[n]
    outIndex++
    if (n < lines.length - 1) {
      output[outIndex] = lineBreaks[n] || br
      outIndex++
    }
  }
  return output.join('')
}
  
const modLine = (imgLine, br, opt, labelMeta) => {
  const { captionText, hasLabel } = analyzeCaptionText(getCaptionText(imgLine, opt))

  let output = imgLine.indent
  if (hasLabel) {
    if (opt.imgAltCaption) {
      output += captionText
    } else if (opt.imgTitleCaption) {
      output += captionText
    }
    output += br + br + imgLine.indent + '!['
    if (opt.imgTitleCaption) output += imgLine.alt
    output += ']'
  } else {
    const hasCaption = captionText !== ''
    const labelPrefix = buildLabelPrefix(labelMeta, hasCaption)
    if (opt.imgAltCaption) {
      if (hasCaption) {
        output += labelPrefix + captionText + br + br + imgLine.indent + '![]'
      } else {
        output += labelPrefix + br + br + imgLine.indent + '![]'
      }
    } else if (opt.imgTitleCaption) {
      if (hasCaption) {
        output += labelPrefix + captionText + br + br + imgLine.indent + '![' + imgLine.alt + ']'
      } else {
        output += labelPrefix + br + br + imgLine.indent + '![' + imgLine.alt + ']'
      }
    }
  }
  output += '(' + imgLine.href + ')' + imgLine.attrs
  return output
}

export default setMarkdownImgAttrToPCaption
