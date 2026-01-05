import { markAfterNum, markReg, joint } from 'p7d-markdown-it-p-captions'
import langSets from 'p7d-markdown-it-p-captions/lang.js'

const imageLineReg = /^([ \t]*?)!\[ *?(.*?) *?\]\(([^ ]*?)( +"(.*?)")?\)( *(?:{.*?})?)$/
const backquoteFenceReg = /^[ \t]*```/
const tildeFenceReg = /^[ \t]*~~~/
const blankLineReg = /^[ \t]*$/
const asciiOnlyReg = /^[\x00-\x7F]*$/
const whitespaceOnlyReg = /^[\s\u3000]+$/
const unicodeLetterReg = (() => {
  try {
    return new RegExp('\\p{L}', 'u')
  } catch {
    return null
  }
})()

const DEFAULT_LABEL_CONFIG_MAP = {
  en: { label: 'Figure', joint: '.', space: ' ' },
  ja: { label: '図', joint: '　', space: '' },
}

const buildLabelOnlyReg = () => {
  const langs = Object.keys(langSets)
  if (langs.length === 0) return null

  const patterns = []
  for (const lang of langs) {
    const data = langSets[lang]
    if (!data || !data.markReg || !data.markReg.img) continue
    let pattern = data.markReg.img
    if (data.type && data.type['inter-word-space']) {
      pattern = pattern.replace(/([a-z])/g, (match) => '[' + match + match.toUpperCase() + ']')
    }
    patterns.push(pattern)
  }

  if (patterns.length === 0) return null
  return new RegExp('^(' + patterns.join('|') + ')([ .]?' + markAfterNum + ')?$')
}

const labelOnlyReg = buildLabelOnlyReg()
const jointSuffixReg = new RegExp(joint + '$')

const getCaptionText = (imgLine, opt) => {
  if (opt.imgTitleCaption) {
    return imgLine[5] || ''
  }
  return imgLine[2] || ''
}

const getCaptionTextForDetection = (imgLine, opt) => {
  const captionText = getCaptionText(imgLine, opt)
  if (captionText) {
    return captionText
  }
  return imgLine[2] || ''
}

const isAsciiOnly = (value) => asciiOnlyReg.test(value)
const isAsciiLetterCode = (code) => (
  (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)
)

const isJapaneseCodePoint = (code) => {
  return (
    (code >= 0x3040 && code <= 0x30ff) || // Hiragana + Katakana
    (code >= 0x31f0 && code <= 0x31ff) || // Katakana extensions
    (code >= 0x4e00 && code <= 0x9fff) || // CJK Unified Ideographs
    (code >= 0xff66 && code <= 0xff9f)    // Half-width Katakana
  )
}

const containsJapanese = (value) => {
  for (const ch of value) {
    const code = ch.codePointAt(0)
    if (code !== undefined && isJapaneseCodePoint(code)) {
      return true
    }
  }
  return false
}

const detectAutoLang = (value) => {
  let hasAsciiLetter = false
  for (const ch of value) {
    const code = ch.codePointAt(0)
    if (code === undefined) continue
    if (isJapaneseCodePoint(code)) return 'ja'
    if (code <= 0x7f) {
      if (isAsciiLetterCode(code)) {
        hasAsciiLetter = true
      }
      continue
    }
    if (unicodeLetterReg) {
      if (unicodeLetterReg.test(ch)) return null
    } else if (ch.toLowerCase() !== ch.toUpperCase()) {
      return null
    }
  }
  return hasAsciiLetter ? 'en' : null
}

const getInterWordSpace = (labelLang, labelText) => {
  const lang = langSets[labelLang]
  if (lang && lang.type) {
    return Boolean(lang.type['inter-word-space'])
  }
  return isAsciiOnly(labelText)
}

const normalizeLabelConfig = (value) => {
  if (!value || typeof value !== 'object') return null
  const config = {}
  const labelValue = (typeof value.label === 'string')
    ? value.label
    : (typeof value.lable === 'string' ? value.lable : undefined)
  if (labelValue !== undefined) {
    config.label = labelValue
  }
  if (Object.prototype.hasOwnProperty.call(value, 'joint')) {
    config.joint = String(value.joint)
  }
  if (Object.prototype.hasOwnProperty.call(value, 'space')) {
    config.space = String(value.space)
  }
  if (Object.keys(config).length === 0) return null
  return config
}

const mergeLabelConfig = (base, override) => {
  if (!override) return base
  const merged = { ...base }
  if (Object.prototype.hasOwnProperty.call(override, 'label')) {
    merged.label = override.label
  }
  if (Object.prototype.hasOwnProperty.call(override, 'joint')) {
    merged.joint = override.joint
  }
  if (Object.prototype.hasOwnProperty.call(override, 'space')) {
    merged.space = override.space
  }
  return merged
}

const getDefaultLabelConfig = (labelLang) => {
  const base = DEFAULT_LABEL_CONFIG_MAP[labelLang] || DEFAULT_LABEL_CONFIG_MAP.en
  return { label: base.label, joint: base.joint, space: base.space }
}

const resolveLabelConfig = (opt) => {
  let config = getDefaultLabelConfig(opt.labelLang)
  let mapConfig = null
  let singleConfig = null
  if (opt.labelSet && typeof opt.labelSet === 'object') {
    singleConfig = normalizeLabelConfig(opt.labelSet)
    if (!singleConfig) {
      mapConfig = normalizeLabelConfig(opt.labelSet[opt.labelLang])
    }
  }
  config = mergeLabelConfig(config, mapConfig)
  config = mergeLabelConfig(config, singleConfig)

  if (!config.label) {
    config.label = DEFAULT_LABEL_CONFIG_MAP.en.label
  }

  if (config.joint === undefined || config.space === undefined) {
    const interWordSpace = getInterWordSpace(opt.labelLang, config.label)
    if (config.joint === undefined) {
      config.joint = interWordSpace ? '.' : '　'
    }
    if (config.space === undefined) {
      config.space = interWordSpace ? ' ' : '　'
    }
  }
  return config
}

const buildLabelPrefix = (labelConfig, hasCaption) => {
  const labelText = labelConfig.label || ''
  const joint = labelConfig.joint || ''
  const space = labelConfig.space || ''
  let prefix = labelText

  if (joint) {
    const jointIsWhitespace = whitespaceOnlyReg.test(joint)
    if (hasCaption || !jointIsWhitespace) {
      if (!prefix.endsWith(joint)) {
        prefix += joint
      }
    }
  }

  if (hasCaption && space) {
    if (!prefix.endsWith(space)) {
      if (!(space === joint && prefix.endsWith(joint))) {
        prefix += space
      }
    }
  }
  return prefix
}

const buildLabelMeta = (opt) => {
  return resolveLabelConfig(opt)
}

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
    let isBackquoteCodeBlock = false
    let isTildeCodeBlock = false
    const br = lineBreaks[0] || '\n'

    let labelMeta = null
    let autoLangChecked = !opt.autoLangDetection
  
    if(lines.length === 0) return markdown
  
    for (let n = 0; n < lines.length; n++) {
      const line = lines[n]
      if (backquoteFenceReg.test(line)) {
        isBackquoteCodeBlock = !isBackquoteCodeBlock
      }
      if (tildeFenceReg.test(line)) {
        isTildeCodeBlock = !isTildeCodeBlock
      }
      if (isBackquoteCodeBlock || isTildeCodeBlock) {
        continue
      }
  
      const isPrevBreakLine = (n === 0) ? true : blankLineReg.test(lines[n-1])
      const isNextBreakLine = (n === lines.length -1) ? true : blankLineReg.test(lines[n+1])
      if (isPrevBreakLine && isNextBreakLine) {
        if (line.indexOf('![') !== -1 && line.indexOf('](') !== -1) {
          if (!autoLangChecked) {
            const imgLine = line.match(imageLineReg)
            if (imgLine) {
              const rawText = getCaptionTextForDetection(imgLine, opt).trim()
              if (rawText) {
                const detected = detectAutoLang(rawText)
                if (detected) {
                  opt.labelLang = detected
                }
              }
              autoLangChecked = true
            }
          }
          if (!labelMeta && (!opt.autoLangDetection || autoLangChecked)) {
            labelMeta = buildLabelMeta(opt)
          }
          if (labelMeta) {
            lines[n] = modLines(n ,lines, br, opt, labelMeta)
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
  
  const modLines = (n, lines, br, opt, labelMeta) => {
    const imgLine = lines[n].match(imageLineReg)
    if (!imgLine) return lines[n]
    //console.log(imgLine)
  
    const captionText = getCaptionText(imgLine, opt)
    const hasLabel = captionText ? captionText.match(markReg.img) : null
    const hasLabelWithNoJoint = captionText && labelOnlyReg ? captionText.match(labelOnlyReg) : null

    lines[n] = imgLine[1]
    if (hasLabel) {
      //console.log('With label::')
      if (opt.imgAltCaption) {
        lines[n] += imgLine[2]
      } else if (opt.imgTitleCaption) {
        lines[n] += imgLine[5]
      }
      lines[n] += br + br +  imgLine[1] + '!['
      if (opt.imgTitleCaption) lines[n] += imgLine[2]
      lines[n] += ']'
    } else if (hasLabelWithNoJoint) {
      //console.log('With label (no joint)::')
      //console.log(hasLabelWithNoJoint)
      if (opt.imgAltCaption) {
        lines[n] += imgLine[2]
      } else if (opt.imgTitleCaption) {
        lines[n] += imgLine[5]
      }
      lines[n] += br + br +  imgLine[1] + '![' + hasLabelWithNoJoint[0].replace(jointSuffixReg, '') + ']'
    } else {
      //console.log('No label::')
      const hasCaption = captionText !== ''
      const labelPrefix = buildLabelPrefix(labelMeta, hasCaption)
      if (opt.imgAltCaption) {
        if (hasCaption) {
          lines[n] += labelPrefix + captionText + br + br + imgLine[1] + '![]'
        } else {
          lines[n] += labelPrefix + br + br + imgLine[1] + '![]'
        }
      } else if (opt.imgTitleCaption) {
        if (hasCaption) {
          lines[n] += labelPrefix + captionText + br + br + imgLine[1] + '![' + imgLine[2] + ']'
        } else {
          lines[n] += labelPrefix + br + br + imgLine[1] + '![' + imgLine[2] + ']'
        }
      }
    }
    lines[n] += '(' + imgLine[3] + ')' + imgLine[6]
    return lines[n]
  }

  export default setMarkdownImgAttrToPCaption
