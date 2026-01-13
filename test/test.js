import assert from 'assert'
import fs from 'fs'
import path from 'path'
import setMarkdownImgAttrToPCaption from '../index.js'
import setImgFigureCaption from '../script/set-img-figure-caption.js'

let __dirname = path.dirname(new URL(import.meta.url).pathname)
const isWindows = (process.platform === 'win32')
if (isWindows) {
  __dirname = __dirname.replace(/^\/+/, '').replace(/\//g, '\\')
}

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

let hasFailure = false

const check = (name, ex) => {
  const exCont = fs.readFileSync(ex, 'utf-8').trim()
  let ms = [];
  let ms0 = exCont.split(/\n*\[Input\]\n/)
  let n = 1;
  while(n < ms0.length) {
    let mhs = ms0[n].split(/\n+\[Output[^\]]*?\]\n/)
    let i = 1
    while (i < 2) {
      if (mhs[i] === undefined) {
        mhs[i] = ''
      } else {
        mhs[i] = mhs[i].replace(/$/,'\n')
      }
      i++
    }
    ms[n] = {
      inputMarkdown: mhs[0].trim(),
      outputMarkdown: mhs[1].trim(),
    };
    n++
  }

  n = 1
  while(n < ms.length) {
    //if (n !== 10) { n++; continue }
    console.log('Test: ' + n + ' >>>')
    const m = ms[n].inputMarkdown
    let h
    let option = {}
    if (name === 'default') {
        h = setMarkdownImgAttrToPCaption(m)
      }
  

      if (name === 'imgTitleAttr') {
        h = setMarkdownImgAttrToPCaption(m, {imgTitleCaption: true})
      }

      if (name === 'labelLang') {
        h = setMarkdownImgAttrToPCaption(m, {labelLang: 'ja', autoLangDetection: false})
      }

      if (name === 'autoLangDetection') {
        h = setMarkdownImgAttrToPCaption(m, {autoLangDetection: true})
      }

      if (name === 'labelSet') {
        h = setMarkdownImgAttrToPCaption(m, {
          labelSet: { label: '図', joint: '：', space: '　' }
        })
      }

      if (name === 'labelSetMap') {
        h = setMarkdownImgAttrToPCaption(m, {
          labelLang: 'en',
          labelSet: {
            en: { label: 'Fig', joint: ':', space: ' ' }
          }
        })
      }

      if (name === 'labelSetFallback') {
        h = setMarkdownImgAttrToPCaption(m, {
          labelLang: 'fr',
          autoLangDetection: false,
          labelSet: {
            en: { label: 'Fig', joint: ':', space: ' ' },
            ja: { label: '図', joint: '　', space: '' }
          }
        })
      }

    try {
      assert.strictEqual(h, ms[n].outputMarkdown)
    } catch(e) {
      hasFailure = true
      console.log('incorrect: ')
      //console.log(m)
      //console.log('::convert ->')
      console.log('H: ' + h +'\n\nC: ' + ms[n].outputMarkdown)
    }
    n++
  }
}


const example = {
    default: __dirname + path.sep + 'examples.txt',
    imgTitleAttr: __dirname + path.sep + 'examples-img-title-attr.txt',
    labelLang: __dirname + path.sep + 'examples-label-lang.txt',
    autoLangDetection: __dirname + path.sep + 'examples-auto-lang-detection.txt',
    labelSet: __dirname + path.sep + 'examples-label-set.txt',
    labelSetMap: __dirname + path.sep + 'examples-label-set-map.txt',
    labelSetFallback: __dirname + path.sep + 'examples-label-set-fallback.txt',
}
for (let ex in example) {
  console.log('[Test] ' + ex)
  check(ex, example[ex])
}

if (hasFailure) {
  process.exitCode = 1
}

const runDomTest = async (name, fn) => {
  try {
    await fn()
    console.log('DOM Test: ' + name + ' >>>')
  } catch (error) {
    hasFailure = true
    console.log('DOM Test failed: ' + name)
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

await runDomTest('wraps image and caption', async () => {
  await withDocument(async (doc) => {
    const img = doc.createElement('img')
    img.setAttribute('alt', 'Caption')
    doc.body.appendChild(img)

    await setImgFigureCaption({ imgAltCaption: true })

    const figure = doc.body.querySelector('figure')
    assert.ok(figure, 'figure should be created')
    const figcaption = figure.querySelector('figcaption')
    assert.ok(figcaption, 'figcaption should be created')
    assert.strictEqual(figcaption.textContent, 'Caption')
    assert.strictEqual(figure.childNodes[0].tagName, 'IMG')
  })
})

await runDomTest('updates existing caption', async () => {
  await withDocument(async (doc) => {
    const figure = doc.createElement('figure')
    const img = doc.createElement('img')
    img.setAttribute('alt', 'New caption')
    const caption = doc.createElement('figcaption')
    caption.textContent = 'Old caption'
    figure.appendChild(img)
    figure.appendChild(caption)
    doc.body.appendChild(figure)

    await setImgFigureCaption({ imgAltCaption: true })

    const figcaption = figure.querySelector('figcaption')
    assert.ok(figcaption, 'figcaption should exist')
    assert.strictEqual(figcaption.textContent, 'New caption')
  })
})

await runDomTest('removes caption when blank', async () => {
  await withDocument(async (doc) => {
    const figure = doc.createElement('figure')
    const img = doc.createElement('img')
    img.setAttribute('alt', '')
    const caption = doc.createElement('figcaption')
    caption.textContent = 'To remove'
    figure.appendChild(img)
    figure.appendChild(caption)
    doc.body.appendChild(figure)

    await setImgFigureCaption({ imgAltCaption: true })

    const figcaption = figure.querySelector('figcaption')
    assert.strictEqual(figcaption, null)
  })
})

if (hasFailure) {
  process.exitCode = 1
}
