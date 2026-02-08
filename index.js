import {
  buildLabelPrefix,
  captionMarkRegImg,
  detectAutoLang,
  jointSuffixReg,
  labelOnlyReg,
  resolveLabelConfig,
} from './script/caption-common.js'

const imageLineReg = /^([ \t]*?)!\[ *?(.*?) *?\]\((.+)\)( *(?:{.*?})?)$/
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

  const titleMatch = hrefPart.match(imageTitleReg)
  if (titleMatch) {
    hrefPart = titleMatch[1]
    title = titleMatch[3] !== undefined ? titleMatch[3] : (titleMatch[4] || '')
  } else {
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
  const captionText = getCaptionText(imgLine, opt)
  if (captionText) {
    return captionText
  }
  return imgLine.alt || ''
}

const buildLabelMeta = (opt) => resolveLabelConfig(opt)

const setMarkdownImgAttrToPCaption = (markdown, option) => {

  const opt = {
    imgAltCaption : true,
    imgTitleCaption: false,
    labelLang: 'en',
    autoLangDetection: true,
    labelSet: null, // { label: '図', joint: '：', space: '　' } or { ja: { label: '図', joint: '　', space: '' }, en: { label: 'Figure', joint: '.', space: ' ' } }
    }
    if (option && typeof option === 'object') {
      if (option.imgTitleCaption) {
        opt.imgTitleCaption = option.imgTitleCaption
      }
      if (option.labelLang) {
        opt.labelLang = option.labelLang
      }
      if (option.labelSet && typeof option.labelSet === 'object') {
        opt.labelSet = option.labelSet
      }
      if (Object.prototype.hasOwnProperty.call(option, 'autoLangDetection')) {
        opt.autoLangDetection = Boolean(option.autoLangDetection)
      }
    }
    if (opt.imgTitleCaption) opt.imgAltCaption = false

    const lines = markdown.split(/\r\n|\n/)
    const lineBreaks = markdown.match(/\r\n|\n/g) || []
    let activeFenceChar = ''
    let activeFenceLength = 0
    let activeDollarFenceLength = 0
    const br = lineBreaks[0] || '\n'

    let labelMeta = null
    let autoLangChecked = !opt.autoLangDetection
  
    if(lines.length === 0) return markdown
  
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
  
      const isPrevBreakLine = (n === 0) ? true : blankLineReg.test(lines[n-1])
      const isNextBreakLine = (n === lines.length -1) ? true : blankLineReg.test(lines[n+1])
      if (isPrevBreakLine && isNextBreakLine) {
        if (line.indexOf('![') !== -1 && line.indexOf('](') !== -1) {
          const imgLine = parseImageLine(line)
          if (!imgLine) {
            continue
          }
          if (!autoLangChecked) {
            const rawText = getCaptionTextForDetection(imgLine, opt).trim()
            if (rawText) {
              const detected = detectAutoLang(rawText)
              if (detected) {
                opt.labelLang = detected
              }
            }
            autoLangChecked = true
          }
          if (!labelMeta && (!opt.autoLangDetection || autoLangChecked)) {
            labelMeta = buildLabelMeta(opt)
          }
          if (labelMeta) {
            lines[n] = modLine(imgLine, br, opt, labelMeta)
          }
        }
      }
    }
  
    const output = []
    for (let n = 0; n < lines.length; n++) {
      output.push(lines[n])
      if (n < lines.length - 1) {
        output.push(lineBreaks[n] || br)
      }
    }
    return output.join('')
  }
  
const modLine = (imgLine, br, opt, labelMeta) => {
  const captionText = getCaptionText(imgLine, opt)
    const hasLabel = Boolean(captionText && captionMarkRegImg && captionMarkRegImg.test(captionText))
    const hasLabelWithNoJoint = (!hasLabel && captionText && labelOnlyReg)
      ? captionText.match(labelOnlyReg)
      : null

    let output = imgLine.indent
    if (hasLabel) {
      //console.log('With label::')
      if (opt.imgAltCaption) {
        output += imgLine.alt
      } else if (opt.imgTitleCaption) {
        output += imgLine.title
      }
      output += br + br +  imgLine.indent + '!['
      if (opt.imgTitleCaption) output += imgLine.alt
      output += ']'
    } else if (hasLabelWithNoJoint) {
      //console.log('With label (no joint)::')
      //console.log(hasLabelWithNoJoint)
      if (opt.imgAltCaption) {
        output += imgLine.alt
      } else if (opt.imgTitleCaption) {
        output += imgLine.title
      }
      output += br + br +  imgLine.indent + '![' + hasLabelWithNoJoint[0].replace(jointSuffixReg, '') + ']'
    } else {
      //console.log('No label::')
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
