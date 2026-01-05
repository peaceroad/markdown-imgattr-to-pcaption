import assert from 'assert'
import fs from 'fs'
import path from 'path'
import setMarkdownImgAttrToPCaption from '../index.js'

let __dirname = path.dirname(new URL(import.meta.url).pathname)
const isWindows = (process.platform === 'win32')
if (isWindows) {
  __dirname = __dirname.replace(/^\/+/, '').replace(/\//g, '\\')
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
