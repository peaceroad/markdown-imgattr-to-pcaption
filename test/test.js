import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import setMarkdownImgAttrToPCaption from '../index.js'
import setImgFigureCaption from '../script/set-img-figure-caption.js'
import { runCoreSpecialTests } from './core-special-tests.js'
import { runDomTests } from './dom-tests.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

class TestElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase()
    this.nodeType = 1
    this.ownerDocument = ownerDocument
    this.parentNode = null
    this.childNodes = []
    this._attributes = new Map()
    this.textContent = ''
  }

  getAttribute(name) {
    return this._attributes.has(name) ? this._attributes.get(name) : null
  }

  setAttribute(name, value) {
    this._attributes.set(name, String(value))
  }

  removeAttribute(name) {
    this._attributes.delete(name)
  }

  hasAttribute(name) {
    return this._attributes.has(name)
  }

  appendChild(node) {
    if (node.parentNode) {
      node.parentNode.removeChild(node)
    }
    this.childNodes.push(node)
    node.parentNode = this
    return node
  }

  insertBefore(node, refNode) {
    if (node.parentNode) {
      node.parentNode.removeChild(node)
    }
    if (!refNode) {
      return this.appendChild(node)
    }
    const index = this.childNodes.indexOf(refNode)
    if (index === -1) {
      return this.appendChild(node)
    }
    this.childNodes.splice(index, 0, node)
    node.parentNode = this
    return node
  }

  removeChild(node) {
    const index = this.childNodes.indexOf(node)
    if (index === -1) return null
    this.childNodes.splice(index, 1)
    node.parentNode = null
    return node
  }

  closest(selector) {
    const target = selector.toUpperCase()
    let current = this
    while (current) {
      if (current.tagName === target) return current
      current = current.parentNode
    }
    return null
  }

  _matches(selector) {
    const lower = selector.toLowerCase()
    if (lower === 'img' || lower === 'figcaption' || lower === 'figure') {
      return this.tagName === lower.toUpperCase()
    }
    if (lower === 'meta[name="markdown-frontmatter"]') {
      return this.tagName === 'META' && this.getAttribute('name') === 'markdown-frontmatter'
    }
    return false
  }

  _collect(selector, bucket) {
    for (const child of this.childNodes) {
      if (child && child.nodeType === 1) {
        if (child._matches(selector)) {
          bucket.push(child)
        }
        child._collect(selector, bucket)
      }
    }
  }

  querySelectorAll(selector) {
    const results = []
    this._collect(selector, results)
    return results
  }

  querySelector(selector) {
    const results = this.querySelectorAll(selector)
    return results.length > 0 ? results[0] : null
  }
}

class TestDocument {
  constructor() {
    this.body = new TestElement('body', this)
    this.documentElement = this.body
  }

  createElement(tagName) {
    return new TestElement(tagName, this)
  }

  querySelectorAll(selector) {
    return this.body.querySelectorAll(selector)
  }

  querySelector(selector) {
    return this.body.querySelector(selector)
  }
}

class TestMutationObserver {
  static instances = []

  constructor(callback) {
    this.callback = callback
    this.disconnected = false
    TestMutationObserver.instances.push(this)
  }

  observe() {}

  disconnect() {
    this.disconnected = true
  }

  trigger(mutations) {
    this.callback(mutations)
  }

  static reset() {
    TestMutationObserver.instances = []
  }
}

let hasFailure = false

const markFailure = () => {
  hasFailure = true
}

const trimSingleEdgeNewline = (value) => {
  if (typeof value !== 'string') return ''
  let next = value
  if (next.startsWith('\n')) next = next.slice(1)
  if (next.endsWith('\n')) next = next.slice(0, -1)
  return next
}

const readFixtureCases = (fixturePath) => {
  const fixtureContent = fs.readFileSync(fixturePath, 'utf-8').replace(/\r\n/g, '\n')
  const sections = fixtureContent.split(/\n*\[Input\]\n/)
  const cases = []

  for (let n = 1; n < sections.length; n++) {
    const parts = sections[n].split(/\n+\[Output[^\]]*?\]\n?/)
    const inputMarkdown = trimSingleEdgeNewline(parts[0] || '')
    const outputMarkdown = trimSingleEdgeNewline(parts[1] || '')
    cases.push({ inputMarkdown, outputMarkdown })
  }

  return cases
}

const fixtureSuites = {
  default: {
    file: path.join(__dirname, 'examples.txt'),
    option: {},
  },
  imgTitleAttr: {
    file: path.join(__dirname, 'examples-img-title-attr.txt'),
    option: { imgTitleCaption: true },
  },
  labelLang: {
    file: path.join(__dirname, 'examples-label-lang.txt'),
    option: { labelLang: 'ja', autoLangDetection: false },
  },
  autoLangDetection: {
    file: path.join(__dirname, 'examples-auto-lang-detection.txt'),
    option: { autoLangDetection: true },
  },
  labelSet: {
    file: path.join(__dirname, 'examples-label-set.txt'),
    option: {
      labelSet: { label: '図', joint: '：', space: '　' },
    },
  },
  labelSetMap: {
    file: path.join(__dirname, 'examples-label-set-map.txt'),
    option: {
      labelLang: 'en',
      labelSet: {
        en: { label: 'Fig', joint: ':', space: ' ' },
      },
    },
  },
  labelSetFallback: {
    file: path.join(__dirname, 'examples-label-set-fallback.txt'),
    option: {
      labelLang: 'fr',
      autoLangDetection: false,
      labelSet: {
        en: { label: 'Fig', joint: ':', space: ' ' },
        ja: { label: '図', joint: '　', space: '' },
      },
    },
  },
  edgeDefault: {
    file: path.join(__dirname, 'examples-edge-default.txt'),
    option: {},
  },
  edgeImgTitleAutoLang: {
    file: path.join(__dirname, 'examples-edge-img-title-auto-lang.txt'),
    option: { imgTitleCaption: true, autoLangDetection: true },
  },
}

const runFixtureSuite = (suiteName, suiteDef) => {
  const fixtureCases = readFixtureCases(suiteDef.file)
  console.log('[' + suiteName + '] >>> ' + suiteDef.file)

  for (let n = 0; n < fixtureCases.length; n++) {
    const caseNo = n + 1
    const testCase = fixtureCases[n]
    console.log('Test: ' + caseNo + ' >>>')

    const converted = setMarkdownImgAttrToPCaption(testCase.inputMarkdown, suiteDef.option)
    try {
      assert.strictEqual(converted, testCase.outputMarkdown)
    } catch (error) {
      markFailure()
      console.log('incorrect:')
      console.log('H: ' + converted + '\n\nC: ' + testCase.outputMarkdown)
      if (error && error.stack) {
        console.log(error.stack)
      }
    }
  }
}

const runCoreTest = (name, fn) => {
  try {
    fn()
    console.log('[coreSpecial] ' + name + ' >>>')
  } catch (error) {
    markFailure()
    console.log('[coreSpecial] failed: ' + name)
    console.log(error && error.message ? error.message : error)
  }
}

const runDomTest = async (name, fn) => {
  try {
    await fn()
    console.log('[dom] ' + name + ' >>>')
  } catch (error) {
    markFailure()
    console.log('[dom] failed: ' + name)
    console.log(error && error.message ? error.message : error)
  }
}

const withDocument = async (fn) => {
  const previousDocument = global.document
  const doc = new TestDocument()
  global.document = doc
  try {
    await fn(doc)
  } finally {
    if (previousDocument === undefined) {
      delete global.document
    } else {
      global.document = previousDocument
    }
  }
}

const withMutationObserver = async (fn) => {
  const previousMutationObserver = global.MutationObserver
  const previousRequestAnimationFrame = global.requestAnimationFrame
  TestMutationObserver.reset()
  global.MutationObserver = TestMutationObserver
  global.requestAnimationFrame = (callback) => {
    callback()
    return 1
  }

  try {
    await fn(TestMutationObserver)
  } finally {
    if (previousMutationObserver === undefined) {
      delete global.MutationObserver
    } else {
      global.MutationObserver = previousMutationObserver
    }
    if (previousRequestAnimationFrame === undefined) {
      delete global.requestAnimationFrame
    } else {
      global.requestAnimationFrame = previousRequestAnimationFrame
    }
  }
}

for (const suiteName of Object.keys(fixtureSuites)) {
  runFixtureSuite(suiteName, fixtureSuites[suiteName])
}

runCoreSpecialTests({ runCoreTest, assert, setMarkdownImgAttrToPCaption })

await runDomTests({
  runDomTest,
  withDocument,
  withMutationObserver,
  assert,
  setImgFigureCaption,
})

if (hasFailure) {
  process.exitCode = 1
} else {
  console.log('\nPassed all test.')
}
