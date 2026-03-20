import {
  analyzeCaptionStart,
  getGeneratedLabelDefaults,
  getMarkRegStateForLanguages,
} from 'p7d-markdown-it-p-captions'

export const whitespaceOnlyReg = /^[\s\u3000]+$/
const unicodeLetterReg = (() => {
  try {
    return new RegExp('\\p{L}', 'u')
  } catch {
    return null
  }
})()

const FALLBACK_LABEL_CONFIG = Object.freeze({
  label: 'Figure',
  joint: '.',
  space: ' ',
})
const DEFAULT_MARK_REG_STATE = getMarkRegStateForLanguages()
const ENGLISH_MARK_REG_STATE = getMarkRegStateForLanguages(['en'])
const DEFAULT_GENERATED_LABEL_DEFAULTS_BY_LANG = DEFAULT_MARK_REG_STATE.generatedLabelDefaultsByLang || Object.create(null)
const ENGLISH_GENERATED_LABEL_DEFAULTS = getGeneratedLabelDefaults('img', '', ENGLISH_MARK_REG_STATE)
const defaultLabelConfigCache = new Map()

export const CAPTION_RUNTIME_OPTION_DEFAULTS = Object.freeze({
  imgAltCaption: true,
  imgTitleCaption: false,
  labelLang: 'en',
  autoLangDetection: true,
  labelSet: null,
})

export const normalizeCaptionText = (value) => {
  if (typeof value !== 'string') return ''
  return value.trim()
}

export const analyzeCaptionText = (value) => {
  const captionText = normalizeCaptionText(value)
  if (!captionText) {
    return {
      captionText: '',
      hasLabel: false,
    }
  }
  const captionAnalysis = analyzeCaptionStart(captionText, {
    markRegState: DEFAULT_MARK_REG_STATE,
    preferredMark: 'img',
  })

  return {
    captionText,
    hasLabel: !!captionAnalysis,
  }
}

export const normalizeCaptionRuntimeOption = (option, defaults = CAPTION_RUNTIME_OPTION_DEFAULTS) => {
  const opt = {
    imgAltCaption: true,
    imgTitleCaption: false,
    labelLang: 'en',
    autoLangDetection: true,
    labelSet: null,
    ...defaults,
  }
  if (!option || typeof option !== 'object') {
    if (opt.imgTitleCaption) opt.imgAltCaption = false
    return opt
  }

  if (typeof option.imgAltCaption === 'boolean') {
    opt.imgAltCaption = option.imgAltCaption
  }
  if (typeof option.imgTitleCaption === 'boolean') {
    opt.imgTitleCaption = option.imgTitleCaption
  }
  if (typeof option.labelLang === 'string') {
    const labelLang = option.labelLang.trim()
    if (labelLang) {
      opt.labelLang = labelLang
    }
  }
  if (option.labelSet && typeof option.labelSet === 'object') {
    opt.labelSet = option.labelSet
  }
  if (typeof option.autoLangDetection === 'boolean') {
    opt.autoLangDetection = option.autoLangDetection
  }
  if (opt.imgTitleCaption) opt.imgAltCaption = false
  return opt
}

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

const detectSimpleAutoLang = (value, currentLabelLang = '') => {
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
  if (!hasAsciiLetter) return null
  if (
    typeof currentLabelLang === 'string' &&
    currentLabelLang &&
    currentLabelLang !== 'en' &&
    currentLabelLang !== 'ja'
  ) {
    return currentLabelLang
  }
  return 'en'
}

export const detectAutoLang = (value, currentLabelLang = '') => {
  const detected = detectSimpleAutoLang(value, currentLabelLang)
  if (detected) return detected
  const preferredLanguages = (typeof currentLabelLang === 'string' && currentLabelLang)
    ? [currentLabelLang]
    : null
  const defaults = getGeneratedLabelDefaults('img', value, DEFAULT_MARK_REG_STATE, preferredLanguages)
  if (!defaults) return null
  const langs = DEFAULT_MARK_REG_STATE.languages
  for (let i = 0; i < langs.length; i++) {
    const lang = langs[i]
    const generatedDefaults = DEFAULT_GENERATED_LABEL_DEFAULTS_BY_LANG[lang]
    if (generatedDefaults && generatedDefaults.img === defaults) {
      return lang
    }
  }
  return null
}

const normalizeLabelConfig = (value) => {
  if (!value || typeof value !== 'object') return null
  const config = {}
  let hasConfig = false
  const labelValue = (typeof value.label === 'string')
    ? value.label
    : (typeof value.lable === 'string' ? value.lable : undefined)
  if (labelValue !== undefined) {
    config.label = labelValue
    hasConfig = true
  }
  if (Object.prototype.hasOwnProperty.call(value, 'joint')) {
    config.joint = String(value.joint)
    hasConfig = true
  }
  if (Object.prototype.hasOwnProperty.call(value, 'space')) {
    config.space = String(value.space)
    hasConfig = true
  }
  if (!hasConfig) return null
  return config
}

const applyLabelConfig = (base, override) => {
  if (!override) return
  if (Object.prototype.hasOwnProperty.call(override, 'label')) {
    base.label = override.label
  }
  if (Object.prototype.hasOwnProperty.call(override, 'joint')) {
    base.joint = override.joint
  }
  if (Object.prototype.hasOwnProperty.call(override, 'space')) {
    base.space = override.space
  }
}

const cloneLabelConfig = (value) => ({
  label: value.label,
  joint: value.joint,
  space: value.space,
})

const getCachedGeneratedLabelDefaults = (labelLang) => {
  if (typeof labelLang !== 'string' || !labelLang) return null
  const cached = defaultLabelConfigCache.get(labelLang)
  if (cached !== undefined) {
    return cached
  }
  const defaults = getGeneratedLabelDefaults(
    'img',
    '',
    getMarkRegStateForLanguages([labelLang]),
  )
  defaultLabelConfigCache.set(labelLang, defaults || null)
  return defaults || null
}

const getDefaultLabelConfig = (labelLang) => {
  const langDefaults = getCachedGeneratedLabelDefaults(labelLang)
  if (langDefaults) return cloneLabelConfig(langDefaults)
  if (ENGLISH_GENERATED_LABEL_DEFAULTS) return cloneLabelConfig(ENGLISH_GENERATED_LABEL_DEFAULTS)
  return cloneLabelConfig(FALLBACK_LABEL_CONFIG)
}

export const resolveLabelConfig = (opt) => {
  const config = getDefaultLabelConfig(opt.labelLang)
  let mapConfig = null
  let singleConfig = null
  if (opt.labelSet && typeof opt.labelSet === 'object') {
    singleConfig = normalizeLabelConfig(opt.labelSet)
    if (!singleConfig) {
      mapConfig = normalizeLabelConfig(opt.labelSet[opt.labelLang])
    }
  }
  applyLabelConfig(config, mapConfig)
  applyLabelConfig(config, singleConfig)

  if (!config.label) {
    config.label = FALLBACK_LABEL_CONFIG.label
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
