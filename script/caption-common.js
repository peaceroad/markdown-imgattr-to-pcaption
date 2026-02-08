import { markAfterNum, getMarkRegForLanguages, joint } from 'p7d-markdown-it-p-captions'
import langSets from 'p7d-markdown-it-p-captions/lang.js'

const asciiOnlyReg = /^[\x00-\x7F]*$/
export const whitespaceOnlyReg = /^[\s\u3000]+$/
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

export const labelOnlyReg = buildLabelOnlyReg()
export const jointSuffixReg = new RegExp(joint + '$')
const captionMarkReg = getMarkRegForLanguages(Object.keys(langSets))
export const captionMarkRegImg = captionMarkReg ? captionMarkReg.img : null

const isAsciiOnly = (value) => asciiOnlyReg.test(value)
const isAsciiLetterCode = (code) => (
  (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)
)

const isJapaneseCodePoint = (code) => {
  return (
    (code >= 0x3040 && code <= 0x30ff) ||
    (code >= 0x31f0 && code <= 0x31ff) ||
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0xff66 && code <= 0xff9f)
  )
}

export const detectAutoLang = (value) => {
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

export const resolveLabelConfig = (opt) => {
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

export const buildLabelPrefix = (labelConfig, hasCaption) => {
  const labelText = labelConfig.label || ''
  const labelJoint = labelConfig.joint || ''
  const space = labelConfig.space || ''
  let prefix = labelText

  if (labelJoint) {
    const jointIsWhitespace = whitespaceOnlyReg.test(labelJoint)
    if (hasCaption || !jointIsWhitespace) {
      if (!prefix.endsWith(labelJoint)) {
        prefix += labelJoint
      }
    }
  }

  if (hasCaption && space) {
    if (!prefix.endsWith(space)) {
      if (!(space === labelJoint && prefix.endsWith(labelJoint))) {
        prefix += space
      }
    }
  }
  return prefix
}
