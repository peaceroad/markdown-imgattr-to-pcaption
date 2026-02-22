import {
  buildLabelPrefix,
  captionMarkRegImg,
  detectAutoLang,
  jointSuffixReg,
  labelOnlyReg,
  resolveLabelConfig,
  whitespaceOnlyReg,
} from './caption-common.js'

const activeObserverByDocument = new WeakMap()
const sourceValueByImage = new WeakMap()
let ownAttributeMutationByImage = new WeakMap()
const NO_OWN_MUTATION = Symbol('no-own-mutation')
let ownAttributeMutationCleanupTimer = null
const OBSERVABLE_IMAGE_ATTRIBUTES = ['alt', 'title']

const normalizeScope = (value) => {
  if (typeof value !== 'string') return 'all'
  const normalized = value.trim().toLowerCase()
  if (normalized === 'all' || normalized === 'standalone' || normalized === 'figure-only') {
    return normalized
  }
  return 'all'
}

const normalizeObserveAttributes = (value) => {
  if (!Array.isArray(value)) return null
  let hasAlt = false
  let hasTitle = false
  for (const item of value) {
    if (typeof item !== 'string') continue
    const attrName = item.trim().toLowerCase()
    if (attrName === 'alt') {
      hasAlt = true
      continue
    }
    if (attrName === 'title') {
      hasTitle = true
    }
  }
  const attrs = []
  for (const attrName of OBSERVABLE_IMAGE_ATTRIBUTES) {
    if (attrName === 'alt' && hasAlt) attrs.push(attrName)
    if (attrName === 'title' && hasTitle) attrs.push(attrName)
  }
  return attrs
}

const normalizeRuntimeOption = (option = {}) => {
  const opt = {
    imgAltCaption: true,
    imgTitleCaption: false,
    labelLang: 'en',
    autoLangDetection: true,
    labelSet: null,
    figureClass: 'f-img',
    readMeta: false,
    observe: false,
    scope: 'all',
    observeAttributes: ['alt', 'title'],
    observeMetaContent: true,
    observeChildList: true,
    observeDebounceMs: 0,
  }
  if (!option || typeof option !== 'object') return opt

  if (typeof option.imgAltCaption === 'boolean') {
    opt.imgAltCaption = option.imgAltCaption
  }
  if (typeof option.imgTitleCaption === 'boolean') {
    opt.imgTitleCaption = option.imgTitleCaption
  }
  if (typeof option.autoLangDetection === 'boolean') {
    opt.autoLangDetection = option.autoLangDetection
  }
  if (typeof option.readMeta === 'boolean') {
    opt.readMeta = option.readMeta
  }
  if (typeof option.observe === 'boolean') {
    opt.observe = option.observe
  }
  if (typeof option.observeMetaContent === 'boolean') {
    opt.observeMetaContent = option.observeMetaContent
  }
  if (typeof option.observeChildList === 'boolean') {
    opt.observeChildList = option.observeChildList
  }
  if (typeof option.observeDebounceMs === 'number' &&
      Number.isFinite(option.observeDebounceMs) &&
      option.observeDebounceMs >= 0) {
    opt.observeDebounceMs = Math.floor(option.observeDebounceMs)
  }
  if (Object.prototype.hasOwnProperty.call(option, 'scope')) {
    opt.scope = normalizeScope(option.scope)
  }
  if (Object.prototype.hasOwnProperty.call(option, 'observeAttributes')) {
    const observeAttributes = normalizeObserveAttributes(option.observeAttributes)
    if (observeAttributes !== null) {
      opt.observeAttributes = observeAttributes
    }
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
  if (typeof option.figureClass === 'string') {
    opt.figureClass = option.figureClass
  }

  if (opt.imgTitleCaption) opt.imgAltCaption = false
  return opt
}

const isBlank = (value) => {
  if (!value) return true
  return whitespaceOnlyReg.test(value)
}

const isElementNode = (node) => node && node.nodeType === 1
const isImageNode = (node) => isElementNode(node) && node.tagName === 'IMG'

const isWhitespaceTextNode = (node) => (
  node && node.nodeType === 3 && whitespaceOnlyReg.test(node.textContent || '')
)

const hasOnlyImageContent = (img) => {
  if (!img || !img.parentNode || !img.parentNode.childNodes) return false
  for (const node of img.parentNode.childNodes) {
    if (!node || node === img) continue
    if (isWhitespaceTextNode(node)) continue
    if (node.nodeType === 8) continue
    return false
  }
  return true
}

const isStandaloneImage = (img) => {
  if (!isImageNode(img)) return false
  const parent = img.parentNode
  if (!isElementNode(parent)) return false
  if (parent.tagName === 'FIGURE') return true
  return hasOnlyImageContent(img)
}

const isScopedImage = (img, scope) => {
  if (!isImageNode(img)) return false
  if (scope === 'all') return true
  if (scope === 'figure-only') {
    return typeof img.closest === 'function' && Boolean(img.closest('figure'))
  }
  return isStandaloneImage(img)
}

const collectScopedImages = (scope, targets = null) => {
  if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return []
  if (!targets) {
    if (scope === 'all') {
      return Array.from(document.querySelectorAll('img'))
    }
    if (scope === 'figure-only') {
      return Array.from(document.querySelectorAll('figure img'))
    }
  }
  const rawImages = targets
    ? (Array.isArray(targets) ? targets : Array.from(targets))
    : Array.from(document.querySelectorAll('img'))
  const images = []
  for (const img of rawImages) {
    if (!isImageNode(img)) continue
    if (typeof img.isConnected === 'boolean' && !img.isConnected) continue
    if (scope !== 'all' && !isScopedImage(img, scope)) continue
    images.push(img)
  }
  return images
}

const findFirstScopedImage = (scope) => {
  if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return null
  if (scope === 'all') {
    return typeof document.querySelector === 'function' ? document.querySelector('img') : null
  }
  if (scope === 'figure-only') {
    return typeof document.querySelector === 'function' ? document.querySelector('figure img') : null
  }
  const images = document.querySelectorAll('img')
  for (const img of images) {
    if (typeof img.isConnected === 'boolean' && !img.isConnected) continue
    if (!isScopedImage(img, scope)) continue
    return img
  }
  return null
}

const getAttr = (element, name) => {
  const value = element.getAttribute(name)
  return value == null ? '' : value
}

const getStoredSourceValue = (element, name) => {
  const sourceState = sourceValueByImage.get(element)
  if (!sourceState) return ''
  const value = sourceState[name]
  return value == null ? '' : value
}

const setStoredSourceValue = (element, name, value) => {
  if (!element) return
  const nextValue = value == null ? '' : String(value)
  const sourceState = sourceValueByImage.get(element) || {}
  if (sourceState[name] === nextValue) return
  sourceState[name] = nextValue
  sourceValueByImage.set(element, sourceState)
}

const getAttrWithSource = (element, name) => {
  const value = getAttr(element, name)
  if (value !== '') return value
  return getStoredSourceValue(element, name)
}

const setAttrIfChanged = (element, name, value) => {
  if (!element || typeof element.setAttribute !== 'function') return false
  const current = getAttr(element, name)
  const nextValue = value == null ? '' : String(value)
  if (current === nextValue) return false
  element.setAttribute(name, nextValue)
  return true
}

const syncSourceAttr = (element, name) => {
  setStoredSourceValue(element, name, getAttr(element, name))
}

const markOwnAttributeMutation = (element, name, expectedValue) => {
  if (!element) return
  const state = ownAttributeMutationByImage.get(element) || {}
  state[name] = expectedValue
  ownAttributeMutationByImage.set(element, state)
  if (ownAttributeMutationCleanupTimer === null) {
    ownAttributeMutationCleanupTimer = setTimeout(() => {
      ownAttributeMutationByImage = new WeakMap()
      ownAttributeMutationCleanupTimer = null
    }, 0)
  }
}

const consumeOwnAttributeMutation = (element, name) => {
  const state = ownAttributeMutationByImage.get(element)
  if (!state || !Object.prototype.hasOwnProperty.call(state, name)) {
    return NO_OWN_MUTATION
  }
  const expectedValue = state[name]
  delete state[name]
  if (!Object.prototype.hasOwnProperty.call(state, 'alt') &&
      !Object.prototype.hasOwnProperty.call(state, 'title')) {
    ownAttributeMutationByImage.delete(element)
  } else {
    ownAttributeMutationByImage.set(element, state)
  }
  return expectedValue
}

const removeAttr = (element, name) => {
  if (!element) return false
  if (typeof element.removeAttribute === 'function') {
    if (element.getAttribute(name) != null) {
      element.removeAttribute(name)
      return true
    }
    return false
  }
  if (typeof element.setAttribute === 'function') {
    if (getAttr(element, name) === '') return false
    element.setAttribute(name, '')
    return true
  }
  return false
}

const setTextIfChanged = (element, value) => {
  if (!element) return
  const nextValue = value == null ? '' : String(value)
  if (element.textContent === nextValue) return
  element.textContent = nextValue
}

const createCaption = (documentRef, text) => {
  const caption = documentRef.createElement('figcaption')
  caption.textContent = text
  return caption
}

const readMetaFrontmatter = (readMeta, cacheState = null) => {
  if (!readMeta) return null
  if (typeof document === 'undefined' || typeof document.querySelector !== 'function') return null
  const metaTag = document.querySelector('meta[name="markdown-frontmatter"]')
  if (!metaTag) return null
  const content = metaTag.getAttribute('content')
  if (!content) return null

  if (cacheState && cacheState.hasValue && cacheState.content === content) {
    return cacheState.parsed
  }

  const parseJson = (value) => {
    try {
      return JSON.parse(value)
    } catch {
      return null
    }
  }
  let parsed = parseJson(content)
  if (!parsed && content.includes('&quot;')) {
    parsed = parseJson(content.replace(/&quot;/g, '"'))
  }
  const parsedObject = (parsed && typeof parsed === 'object') ? parsed : null
  if (cacheState) {
    cacheState.hasValue = true
    cacheState.content = content
    cacheState.parsed = parsedObject
  }
  return parsedObject
}

const applyMetaOptions = (targetOpt, meta, overrideFlags) => {
  if (!meta || typeof meta !== 'object') return
  const extensionSettings = meta._extensionSettings && typeof meta._extensionSettings === 'object'
    ? meta._extensionSettings
    : null

  const setFlag = (key, isOverridden) => {
    if (isOverridden) return
    const directValue = (Object.prototype.hasOwnProperty.call(meta, key) && typeof meta[key] === 'boolean')
      ? meta[key]
      : null
    if (directValue !== null) {
      targetOpt[key] = directValue
      return
    }
    if (!extensionSettings || !Object.prototype.hasOwnProperty.call(extensionSettings, key)) return
    const extValue = typeof extensionSettings[key] === 'boolean' ? extensionSettings[key] : null
    if (extValue !== null) {
      targetOpt[key] = extValue
    }
  }

  setFlag('imgAltCaption', overrideFlags.imgAltCaption)
  setFlag('imgTitleCaption', overrideFlags.imgTitleCaption)
}


const getCaptionText = (img, opt) => {
  if (opt.imgTitleCaption) {
    return getAttrWithSource(img, 'title')
  }
  if (opt.imgAltCaption) {
    return getAttrWithSource(img, 'alt')
  }
  return ''
}

const getCaptionTextForDetection = (img, opt) => {
  const captionText = getCaptionText(img, opt)
  if (captionText) {
    return captionText
  }
  return getAttrWithSource(img, 'alt')
}

const resolveRuntimeOptionsWithCache = (opt, detectionState, firstImage) => {
  const runtimeOpt = { ...opt }
  if (runtimeOpt.imgTitleCaption) runtimeOpt.imgAltCaption = false

  if (runtimeOpt.autoLangDetection) {
    const detectionMode = runtimeOpt.imgTitleCaption ? 'title' : 'alt'
    const firstImageChanged = detectionState.firstImage !== firstImage
    if (detectionState.mode !== detectionMode || firstImageChanged) {
      detectionState.mode = detectionMode
      detectionState.checked = false
      detectionState.detected = null
      detectionState.firstImage = firstImage || null
    }

    if (!detectionState.checked && firstImage) {
      const rawText = getCaptionTextForDetection(firstImage, runtimeOpt).trim()
      if (rawText) {
        const detected = detectAutoLang(rawText)
        if (detected) {
          detectionState.detected = detected
        }
      }
      detectionState.checked = true
    }

    if (detectionState.detected) {
      runtimeOpt.labelLang = detectionState.detected
    }
  } else if (detectionState.mode !== 'off') {
    detectionState.mode = 'off'
    detectionState.checked = false
    detectionState.detected = null
    detectionState.firstImage = null
  }

  runtimeOpt.labelMeta = resolveLabelConfig(runtimeOpt)
  return runtimeOpt
}

const buildCaptionResult = (img, opt) => {
  const rawAlt = getAttr(img, 'alt')
  const rawTitle = getAttr(img, 'title')
  const alt = getAttrWithSource(img, 'alt')
  const captionText = getCaptionText(img, opt)
  const hasLabel = Boolean(captionText && captionMarkRegImg && captionMarkRegImg.test(captionText))
  const hasLabelWithNoJoint = (!hasLabel && captionText && labelOnlyReg)
    ? captionText.match(labelOnlyReg)
    : null

  let outputCaption = ''
  let nextAlt = alt
  let clearTitle = false

  if (hasLabel) {
    outputCaption = captionText
    if (opt.imgAltCaption) {
      nextAlt = ''
    } else if (opt.imgTitleCaption) {
      clearTitle = true
    }
  } else if (hasLabelWithNoJoint) {
    outputCaption = captionText
    nextAlt = hasLabelWithNoJoint[0].replace(jointSuffixReg, '')
    if (opt.imgTitleCaption) {
      clearTitle = true
    }
  } else {
    const hasCaption = captionText !== ''
    const labelPrefix = buildLabelPrefix(opt.labelMeta, hasCaption)
    outputCaption = hasCaption ? labelPrefix + captionText : labelPrefix
    if (opt.imgAltCaption) {
      nextAlt = ''
    } else if (opt.imgTitleCaption) {
      clearTitle = true
    }
  }

  return {
    captionText: outputCaption,
    nextAlt,
    clearTitle,
    sourceAlt: rawAlt,
    sourceTitle: rawTitle,
  }
}

const applyImageAttributes = (img, captionResult) => {
  if (!img || !captionResult) return
  const currentSourceAlt = getStoredSourceValue(img, 'alt')
  const currentSourceTitle = getStoredSourceValue(img, 'title')
  if (captionResult.sourceAlt !== '' || currentSourceAlt === '') {
    setStoredSourceValue(img, 'alt', captionResult.sourceAlt)
  }
  if (captionResult.sourceTitle !== '' || currentSourceTitle === '') {
    setStoredSourceValue(img, 'title', captionResult.sourceTitle)
  }
  if (setAttrIfChanged(img, 'alt', captionResult.nextAlt)) {
    markOwnAttributeMutation(img, 'alt', captionResult.nextAlt == null ? '' : String(captionResult.nextAlt))
  }
  if (captionResult.clearTitle) {
    if (removeAttr(img, 'title')) {
      markOwnAttributeMutation(img, 'title', img.getAttribute('title'))
    }
  }
}

const updateFigure = (img, captionText, opt) => {
  const figure = img.closest('figure')
  if (figure) {
    const figcaption = figure.querySelector('figcaption')
    if (!captionText || isBlank(captionText)) {
      if (figcaption && figcaption.parentNode) {
        figcaption.parentNode.removeChild(figcaption)
      }
      return
    }
    if (figcaption) {
      setTextIfChanged(figcaption, captionText)
    } else {
      figure.appendChild(createCaption(figure.ownerDocument, captionText))
    }
    return
  }

  if (!captionText || isBlank(captionText)) return
  const parent = img.parentNode
  if (!parent) return
  const figureEl = img.ownerDocument.createElement('figure')
  if (opt.figureClass) {
    figureEl.className = opt.figureClass
  }
  parent.insertBefore(figureEl, img)
  figureEl.appendChild(img)
  figureEl.appendChild(createCaption(figureEl.ownerDocument, captionText))
}

const processImages = (images, opt) => {
  for (const img of images) {
    const captionResult = buildCaptionResult(img, opt)
    applyImageAttributes(img, captionResult)
    updateFigure(img, captionResult.captionText, opt)
  }
  return images
}

const resolveFirstImageForDetection = (scope, detectionState) => {
  const cachedFirstImage = detectionState.firstImage
  const cachedConnected = cachedFirstImage && (
    typeof cachedFirstImage.isConnected !== 'boolean' || cachedFirstImage.isConnected
  )
  if (cachedConnected) {
    return cachedFirstImage
  }
  return findFirstScopedImage(scope)
}

export default async function setImgFigureCaption(option = {}) {
  if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return []

  const optionObject = option && typeof option === 'object' ? option : {}
  const opt = normalizeRuntimeOption(optionObject)
  const overrideFlags = {
    imgAltCaption: typeof optionObject.imgAltCaption === 'boolean',
    imgTitleCaption: typeof optionObject.imgTitleCaption === 'boolean',
  }
  const autoLangDetectionState = {
    mode: '',
    checked: false,
    detected: null,
    firstImage: null,
  }
  const metaFrontmatterCache = {
    hasValue: false,
    content: '',
    parsed: null,
  }

  const buildContext = () => {
    if (!opt.readMeta) return opt
    const meta = readMetaFrontmatter(true, metaFrontmatterCache)
    if (!meta) return opt
    const currentOpt = { ...opt }
    applyMetaOptions(currentOpt, meta, overrideFlags)
    if (currentOpt.imgTitleCaption) currentOpt.imgAltCaption = false
    return currentOpt
  }

  const runProcess = (targets = null) => {
    const currentOpt = buildContext()
    if (!currentOpt.imgAltCaption && !currentOpt.imgTitleCaption) return []
    const images = collectScopedImages(currentOpt.scope, targets)
    if (images.length === 0) return []
    const firstImage = currentOpt.autoLangDetection
      ? resolveFirstImageForDetection(currentOpt.scope, autoLangDetectionState)
      : null
    const runtimeOpt = resolveRuntimeOptionsWithCache(currentOpt, autoLangDetectionState, firstImage)
    return processImages(images, runtimeOpt)
  }

  let scheduled = false
  let scheduleTimeoutId = null
  let scheduleAnimationFrameId = null
  let running = false
  let pending = false
  let pendingAll = false
  const pendingImages = new Set()

  const resetAutoLangDetectionState = () => {
    autoLangDetectionState.mode = ''
    autoLangDetectionState.checked = false
    autoLangDetectionState.detected = null
    autoLangDetectionState.firstImage = null
  }

  const clearScheduledProcess = () => {
    scheduled = false
    if (scheduleTimeoutId !== null) {
      clearTimeout(scheduleTimeoutId)
      scheduleTimeoutId = null
    }
    if (scheduleAnimationFrameId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(scheduleAnimationFrameId)
      scheduleAnimationFrameId = null
    }
  }

  const scheduleProcess = () => {
    const debounceMs = opt.observeDebounceMs
    if (debounceMs > 0) {
      if (scheduleTimeoutId !== null) {
        clearTimeout(scheduleTimeoutId)
      }
      scheduleTimeoutId = setTimeout(() => {
        scheduleTimeoutId = null
        runProcessLoop()
      }, debounceMs)
      return
    }

    if (scheduled) return
    scheduled = true
    const run = () => {
      scheduled = false
      scheduleAnimationFrameId = null
      scheduleTimeoutId = null
      runProcessLoop()
    }
    if (typeof requestAnimationFrame === 'function') {
      scheduleAnimationFrameId = requestAnimationFrame(run)
    } else {
      scheduleTimeoutId = setTimeout(run, 50)
    }
  }

  const runProcessLoop = () => {
    if (running) {
      pending = true
      return
    }
    running = true
    do {
      pending = false
      const targets = pendingAll ? null : Array.from(pendingImages)
      pendingAll = false
      pendingImages.clear()
      runProcess(targets)
    } while (pending)
    running = false
  }

  const isMetaNode = (node) => {
    if (!opt.readMeta || !isElementNode(node)) return false
    return node.tagName === 'META'
      && node.getAttribute('name') === 'markdown-frontmatter'
  }

  const queueImageIfScoped = (img) => {
    if (!isImageNode(img)) return false
    if (opt.scope !== 'all' && !isScopedImage(img, opt.scope)) return false
    pendingImages.add(img)
    return true
  }

  const collectScopedImagesFromChildListTarget = (target) => {
    if (opt.scope !== 'standalone') return false
    if (!isElementNode(target)) return false
    if (!target.childNodes || target.childNodes.length === 0) return false
    let found = false
    for (const child of target.childNodes) {
      if (queueImageIfScoped(child)) found = true
    }
    return found
  }

  const inspectMutationNodes = (nodes, queueImages, trackAnyImage) => {
    let queuedScopedImage = false
    let hasAnyImage = false
    let hasMeta = false
    if (!nodes) {
      return { queuedScopedImage, hasAnyImage, hasMeta }
    }
    for (const node of nodes) {
      if (!isElementNode(node)) continue
      if (node.tagName === 'FIGCAPTION') continue

      if (isImageNode(node)) {
        if (trackAnyImage) hasAnyImage = true
        if (queueImages && queueImageIfScoped(node)) {
          queuedScopedImage = true
        }
      } else if (node.querySelectorAll && queueImages) {
        const images = node.querySelectorAll('img')
        for (const image of images) {
          if (queueImageIfScoped(image)) {
            queuedScopedImage = true
          }
        }
      } else if (trackAnyImage && node.querySelector && node.querySelector('img')) {
        hasAnyImage = true
      }

      if (!hasMeta && opt.readMeta && (
        isMetaNode(node) ||
        (node.querySelector && node.querySelector('meta[name="markdown-frontmatter"]'))
      )) {
        hasMeta = true
      }
    }
    return { queuedScopedImage, hasAnyImage, hasMeta }
  }

  const observeImageAttributeSet = new Set(opt.observeAttributes)
  const observeMetaContent = opt.readMeta && opt.observeMetaContent
  const observeAttributesEnabled = observeImageAttributeSet.size > 0 || observeMetaContent
  const observeChildListEnabled = opt.observeChildList
  const attributeFilter = []
  for (const attrName of opt.observeAttributes) {
    attributeFilter.push(attrName)
  }
  if (observeMetaContent) attributeFilter.push('content')

  const activeObserverState = activeObserverByDocument.get(document)
  const disconnectActiveObserver = (state) => {
    if (!state) return
    if (typeof state.cancelPending === 'function') {
      state.cancelPending()
    }
    if (state.observer && typeof state.observer.disconnect === 'function') {
      state.observer.disconnect()
    }
  }
  if (!opt.observe || typeof MutationObserver !== 'function') {
    if (activeObserverState) {
      disconnectActiveObserver(activeObserverState)
      activeObserverByDocument.delete(document)
    }
    return runProcess()
  }

  const root = document.documentElement || document.body
  if (!root || (!observeAttributesEnabled && !observeChildListEnabled)) {
    if (activeObserverState) {
      disconnectActiveObserver(activeObserverState)
      activeObserverByDocument.delete(document)
    }
    return runProcess()
  }

  if (activeObserverState) {
    disconnectActiveObserver(activeObserverState)
  }

  const observer = new MutationObserver((mutations) => {
    let shouldSchedule = false
    let metaChanged = false
    let imageTreeChanged = false
    for (const mutation of mutations) {
      if (!mutation) continue
      if (mutation.type === 'attributes') {
        if (!observeAttributesEnabled) continue
        const target = mutation.target
        const attrName = mutation.attributeName
        if (!attrName) continue
        if (isImageNode(target) && observeImageAttributeSet.has(attrName)) {
          if (typeof target.isConnected === 'boolean' && !target.isConnected) {
            continue
          }
          if (!isScopedImage(target, opt.scope)) {
            continue
          }
          const expectedOwnValue = consumeOwnAttributeMutation(target, attrName)
          const currentValue = target.getAttribute(attrName)
          if (expectedOwnValue !== NO_OWN_MUTATION && currentValue === expectedOwnValue) {
            continue
          }
          syncSourceAttr(target, attrName)
          const firstImage = opt.autoLangDetection
            ? resolveFirstImageForDetection(opt.scope, autoLangDetectionState)
            : null
          if (firstImage && firstImage === target) {
            resetAutoLangDetectionState()
            pendingAll = true
            pendingImages.clear()
          }
          pendingImages.add(target)
          shouldSchedule = true
          continue
        }
        if (observeMetaContent && isMetaNode(target) && attrName === 'content') {
          metaChanged = true
          shouldSchedule = true
          continue
        }
        continue
      }
      if (mutation.type !== 'childList' || !observeChildListEnabled) continue
      if (mutation.addedNodes && mutation.addedNodes.length > 0) {
        const addedInfo = inspectMutationNodes(mutation.addedNodes, true, false)
        if (addedInfo.queuedScopedImage) {
          imageTreeChanged = true
          shouldSchedule = true
        }
        if (addedInfo.hasMeta) {
          metaChanged = true
          shouldSchedule = true
        }
      }
      if (mutation.removedNodes && mutation.removedNodes.length > 0) {
        const removedInfo = inspectMutationNodes(
          mutation.removedNodes,
          false,
          opt.autoLangDetection
        )
        if (removedInfo.hasAnyImage) {
          imageTreeChanged = true
          shouldSchedule = true
        }
        if (removedInfo.hasMeta) {
          metaChanged = true
          shouldSchedule = true
        }
      }
      if (collectScopedImagesFromChildListTarget(mutation.target)) {
        imageTreeChanged = true
        shouldSchedule = true
      }
    }
    if (metaChanged || (imageTreeChanged && opt.autoLangDetection)) {
      resetAutoLangDetectionState()
      pendingAll = true
      pendingImages.clear()
    }
    if (shouldSchedule && (pendingAll || pendingImages.size > 0)) {
      scheduleProcess()
    }
  })

  const observeConfig = { subtree: true }
  if (observeChildListEnabled) {
    observeConfig.childList = true
  }
  if (observeAttributesEnabled) {
    observeConfig.attributes = true
    observeConfig.attributeFilter = attributeFilter
  }
  observer.observe(root, observeConfig)
  activeObserverByDocument.set(document, { observer, cancelPending: clearScheduledProcess })

  return runProcess()
}
