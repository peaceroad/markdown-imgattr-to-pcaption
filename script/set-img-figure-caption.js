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

const normalizeBoolean = (value) => {
  if (value === true) return true
  if (value === false) return false
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    if (trimmed.toLowerCase() === 'true') return true
    if (trimmed.toLowerCase() === 'false') return false
    return true
  }
  return null
}

const isBlank = (value) => {
  if (!value) return true
  return whitespaceOnlyReg.test(value)
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
  const sourceState = sourceValueByImage.get(element) || {}
  sourceState[name] = value == null ? '' : String(value)
  sourceValueByImage.set(element, sourceState)
}

const getAttrWithSource = (element, name) => {
  const value = getAttr(element, name)
  if (value !== '') return value
  return getStoredSourceValue(element, name)
}

const setAttrIfChanged = (element, name, value) => {
  if (!element || typeof element.setAttribute !== 'function') return
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

const readMetaFrontmatter = (readMeta) => {
  if (!readMeta) return null
  if (typeof document === 'undefined' || typeof document.querySelector !== 'function') return null
  const metaTag = document.querySelector('meta[name="markdown-frontmatter"]')
  if (!metaTag) return null
  const content = metaTag.getAttribute('content')
  if (!content) return null
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
  return parsed && typeof parsed === 'object' ? parsed : null
}

const applyMetaOptions = (targetOpt, meta, optionOverrides) => {
  if (!meta || typeof meta !== 'object') return
  const extensionSettings = meta._extensionSettings && typeof meta._extensionSettings === 'object'
    ? meta._extensionSettings
    : null

  const setFlag = (key) => {
    if (optionOverrides.has(key)) return
    const directValue = Object.prototype.hasOwnProperty.call(meta, key)
      ? normalizeBoolean(meta[key])
      : null
    if (directValue !== null) {
      targetOpt[key] = directValue
      return
    }
    if (!extensionSettings || !Object.prototype.hasOwnProperty.call(extensionSettings, key)) return
    const extValue = normalizeBoolean(extensionSettings[key])
    if (extValue !== null) {
      targetOpt[key] = extValue
    }
  }

  setFlag('imgAltCaption')
  setFlag('imgTitleCaption')
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
    markOwnAttributeMutation(img, 'alt', getAttr(img, 'alt'))
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
  if (!images) return []
  const processed = []
  for (const img of images) {
    if (!img || img.nodeType !== 1 || img.tagName !== 'IMG') continue
    if (typeof img.isConnected === 'boolean' && !img.isConnected) continue
    const captionResult = buildCaptionResult(img, opt)
    applyImageAttributes(img, captionResult)
    updateFigure(img, captionResult.captionText, opt)
    processed.push(img)
  }
  return processed
}

export default async function setImgFigureCaption(option = {}) {
  if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return []

  const opt = {
    imgAltCaption: true,
    imgTitleCaption: false,
    labelLang: 'en',
    autoLangDetection: true,
    labelSet: null,
    figureClass: 'f-img',
    readMeta: false,
    observe: false,
  }
  Object.assign(opt, option)
  const optionOverrides = new Set(Object.keys(option || {}))
  const autoLangDetectionState = {
    mode: '',
    checked: false,
    detected: null,
    firstImage: null,
  }

  const buildContext = () => {
    const currentOpt = { ...opt }
    const meta = readMetaFrontmatter(currentOpt.readMeta)
    if (meta) {
      applyMetaOptions(currentOpt, meta, optionOverrides)
    }
    return { opt: currentOpt }
  }

  const runProcess = (targets = null) => {
    const { opt: currentOpt } = buildContext()
    if (currentOpt.imgTitleCaption) currentOpt.imgAltCaption = false
    if (!currentOpt.imgAltCaption && !currentOpt.imgTitleCaption) return []
    const firstImage = currentOpt.autoLangDetection ? document.querySelector('img') : null
    const runtimeOpt = resolveRuntimeOptionsWithCache(currentOpt, autoLangDetectionState, firstImage)
    const images = targets ? Array.from(targets) : Array.from(document.querySelectorAll('img'))
    if (images.length === 0) return []
    return processImages(images, runtimeOpt)
  }

  let scheduled = false
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

  const scheduleProcess = () => {
    if (scheduled) return
    scheduled = true
    const run = () => {
      scheduled = false
      runProcessLoop()
    }
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(run)
    } else {
      setTimeout(run, 50)
    }
  }

  const runProcessLoop = async () => {
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

  const isElementNode = (node) => node && node.nodeType === 1
  const isMetaNode = (node) => {
    if (!opt.readMeta || !isElementNode(node)) return false
    return node.tagName === 'META'
      && node.getAttribute('name') === 'markdown-frontmatter'
  }
  const isImageNode = (node) => isElementNode(node) && node.tagName === 'IMG'

  const collectImagesFromNodes = (nodes) => {
    let found = false
    if (!nodes) return false
    for (const node of nodes) {
      if (!isElementNode(node)) continue
      if (node.tagName === 'FIGCAPTION') continue
      if (isImageNode(node)) {
        pendingImages.add(node)
        found = true
        continue
      }
      if (node.querySelectorAll) {
        const images = node.querySelectorAll('img')
        if (images.length > 0) found = true
        for (const image of images) pendingImages.add(image)
      }
    }
    return found
  }

  const hasImageInNodes = (nodes) => {
    if (!nodes) return false
    for (const node of nodes) {
      if (!isElementNode(node)) continue
      if (node.tagName === 'FIGCAPTION') continue
      if (isImageNode(node)) return true
      if (node.querySelector && node.querySelector('img')) return true
    }
    return false
  }

  const hasMetaInNodes = (nodes) => {
    if (!opt.readMeta || !nodes) return false
    for (const node of nodes) {
      if (!isElementNode(node)) continue
      if (isMetaNode(node)) return true
      if (node.querySelector && node.querySelector('meta[name="markdown-frontmatter"]')) return true
    }
    return false
  }

  const attributeFilter = ['alt', 'title']
  if (opt.readMeta) attributeFilter.push('content')

  const activeObserverState = activeObserverByDocument.get(document)
  if (!opt.observe || typeof MutationObserver !== 'function') {
    if (activeObserverState && activeObserverState.observer) {
      activeObserverState.observer.disconnect()
      activeObserverByDocument.delete(document)
    }
    return runProcess()
  }

  const root = document.documentElement || document.body
  if (root) {
    if (activeObserverState && activeObserverState.observer) {
      activeObserverState.observer.disconnect()
    }

    const observer = new MutationObserver((mutations) => {
      let shouldSchedule = false
      let metaChanged = false
      let imageTreeChanged = false
      for (const mutation of mutations) {
        if (!mutation) continue
        if (mutation.type === 'attributes') {
          const target = mutation.target
          if (isImageNode(target) &&
              (mutation.attributeName === 'alt' || mutation.attributeName === 'title')) {
            if (typeof target.isConnected === 'boolean' && !target.isConnected) {
              continue
            }
            const expectedOwnValue = consumeOwnAttributeMutation(target, mutation.attributeName)
            const currentValue = target.getAttribute(mutation.attributeName)
            if (expectedOwnValue !== NO_OWN_MUTATION && currentValue === expectedOwnValue) {
              continue
            }
            if (mutation.attributeName === 'alt') {
              syncSourceAttr(target, 'alt')
            } else {
              syncSourceAttr(target, 'title')
            }
            const firstImage = opt.autoLangDetection ? document.querySelector('img') : null
            if (firstImage && firstImage === target) {
              resetAutoLangDetectionState()
              pendingAll = true
              pendingImages.clear()
            }
            pendingImages.add(target)
            shouldSchedule = true
            continue
          }
          if (isMetaNode(target) && mutation.attributeName === 'content') {
            metaChanged = true
            shouldSchedule = true
            continue
          }
          continue
        }
        if (mutation.type !== 'childList') continue
        if (mutation.addedNodes && mutation.addedNodes.length > 0) {
          if (collectImagesFromNodes(mutation.addedNodes)) {
            imageTreeChanged = true
            shouldSchedule = true
          }
          if (hasMetaInNodes(mutation.addedNodes)) {
            metaChanged = true
            shouldSchedule = true
          }
        }
        if (mutation.removedNodes && mutation.removedNodes.length > 0) {
          if (hasImageInNodes(mutation.removedNodes)) {
            imageTreeChanged = true
            shouldSchedule = true
          }
          if (hasMetaInNodes(mutation.removedNodes)) {
            metaChanged = true
            shouldSchedule = true
          }
        }
      }
      if (metaChanged || (imageTreeChanged && opt.autoLangDetection)) {
        resetAutoLangDetectionState()
        pendingAll = true
        pendingImages.clear()
      }
      if (shouldSchedule) scheduleProcess()
    })
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter,
    })
    activeObserverByDocument.set(document, { observer })
  }

  return runProcess()
}
