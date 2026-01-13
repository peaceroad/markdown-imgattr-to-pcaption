const whitespaceOnlyReg = /^[\s\u3000]+$/

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
  if (!opt.imgAltCaption && !opt.imgTitleCaption) return ''
  const alt = getAttr(img, 'alt')
  const title = getAttr(img, 'title')
  if (opt.imgAltCaption && opt.imgTitleCaption) {
    if (opt.preferAlt) return alt || title
    return title || alt
  }
  if (opt.imgAltCaption) return alt
  if (opt.imgTitleCaption) return title
  return ''
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
    const captionText = getCaptionText(img, opt)
    updateFigure(img, captionText, opt)
    processed.push(img)
  }
  return processed
}

export default async function setImgFigureCaption(option = {}) {
  if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return []

  const opt = {
    imgAltCaption: false,
    imgTitleCaption: false,
    preferAlt: true,
    figureClass: 'f-img',
    readMeta: false,
    observe: false,
  }
  Object.assign(opt, option)
  const optionOverrides = new Set(Object.keys(option || {}))

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
    if (!currentOpt.imgAltCaption && !currentOpt.imgTitleCaption) return []
    const images = targets
      ? Array.from(targets)
      : Array.from(document.querySelectorAll('img'))
    return processImages(images, currentOpt)
  }

  if (!opt.observe || typeof MutationObserver !== 'function') {
    return runProcess()
  }

  let scheduled = false
  let running = false
  let pending = false
  let pendingAll = false
  const pendingImages = new Set()
  let observer = null

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
    if (!nodes) return
    for (const node of nodes) {
      if (!isElementNode(node)) continue
      if (node.tagName === 'FIGCAPTION') continue
      if (isImageNode(node)) {
        pendingImages.add(node)
        continue
      }
      if (node.querySelectorAll) {
        const images = node.querySelectorAll('img')
        for (const image of images) pendingImages.add(image)
      }
    }
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

  if (!observer) {
    const root = document.documentElement || document.body
    if (root) {
      observer = new MutationObserver((mutations) => {
        let shouldSchedule = false
        let metaChanged = false
        for (const mutation of mutations) {
          if (!mutation) continue
          if (mutation.type === 'attributes') {
            const target = mutation.target
            if (isImageNode(target) && ['alt', 'title'].includes(mutation.attributeName)) {
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
            collectImagesFromNodes(mutation.addedNodes)
            if (pendingImages.size > 0) shouldSchedule = true
            if (hasMetaInNodes(mutation.addedNodes)) {
              metaChanged = true
              shouldSchedule = true
            }
          }
          if (mutation.removedNodes && mutation.removedNodes.length > 0) {
            if (hasMetaInNodes(mutation.removedNodes)) {
              metaChanged = true
              shouldSchedule = true
            }
          }
        }
        if (metaChanged) {
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
    }
  }

  return runProcess()
}
