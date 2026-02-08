export const runDomTests = async ({
  runDomTest,
  withDocument,
  withMutationObserver,
  assert,
  setImgFigureCaption,
}) => {
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
      assert.strictEqual(figcaption.textContent, 'Figure. Caption')
      assert.strictEqual(figure.childNodes[0].tagName, 'IMG')
      assert.strictEqual(img.getAttribute('alt'), '')
      assert.strictEqual(img.getAttribute('data-pcaption-alt-source'), null)
      assert.strictEqual(img.getAttribute('data-pcaption-title-source'), null)
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
      assert.strictEqual(figcaption.textContent, 'Figure. New caption')
      assert.strictEqual(img.getAttribute('alt'), '')
    })
  })

  await runDomTest('keeps label-only caption when blank', async () => {
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
      assert.ok(figcaption, 'figcaption should exist')
      assert.strictEqual(figcaption.textContent, 'Figure.')
    })
  })

  await runDomTest('uses title caption and clears title attribute', async () => {
    await withDocument(async (doc) => {
      const img = doc.createElement('img')
      img.setAttribute('alt', 'ALT text')
      img.setAttribute('title', 'A title caption')
      doc.body.appendChild(img)

      await setImgFigureCaption({ imgTitleCaption: true, autoLangDetection: false, labelLang: 'en' })

      const figure = doc.body.querySelector('figure')
      assert.ok(figure, 'figure should be created')
      const figcaption = figure.querySelector('figcaption')
      assert.ok(figcaption, 'figcaption should be created')
      assert.strictEqual(figcaption.textContent, 'Figure. A title caption')
      assert.strictEqual(img.getAttribute('alt'), 'ALT text')
      assert.strictEqual(img.getAttribute('title'), null)
    })
  })

  await runDomTest('skips processing when both caption modes are disabled', async () => {
    await withDocument(async (doc) => {
      const img = doc.createElement('img')
      img.setAttribute('alt', 'Caption')
      doc.body.appendChild(img)

      await setImgFigureCaption({ imgAltCaption: false, imgTitleCaption: false })

      const figure = doc.body.querySelector('figure')
      assert.strictEqual(figure, null)
      assert.strictEqual(img.getAttribute('alt'), 'Caption')
    })
  })

  await runDomTest('applies custom figureClass', async () => {
    await withDocument(async (doc) => {
      const img = doc.createElement('img')
      img.setAttribute('alt', 'Caption')
      doc.body.appendChild(img)

      await setImgFigureCaption({ imgAltCaption: true, figureClass: 'custom-figure' })

      const figure = doc.body.querySelector('figure')
      assert.ok(figure, 'figure should be created')
      assert.strictEqual(figure.className, 'custom-figure')
    })
  })

  await runDomTest('applies labelSet override in DOM helper', async () => {
    await withDocument(async (doc) => {
      const img = doc.createElement('img')
      img.setAttribute('alt', 'Caption')
      doc.body.appendChild(img)

      await setImgFigureCaption({
        imgAltCaption: true,
        autoLangDetection: false,
        labelLang: 'en',
        labelSet: { label: 'Fig', joint: ':', space: ' ' },
      })

      const figcaption = img.closest('figure').querySelector('figcaption')
      assert.strictEqual(figcaption.textContent, 'Fig: Caption')
    })
  })

  await runDomTest('readMeta can disable caption conversion', async () => {
    await withDocument(async (doc) => {
      const meta = doc.createElement('meta')
      meta.setAttribute('name', 'markdown-frontmatter')
      meta.setAttribute('content', JSON.stringify({ imgAltCaption: false, imgTitleCaption: false }))
      doc.body.appendChild(meta)

      const img = doc.createElement('img')
      img.setAttribute('alt', 'Caption')
      doc.body.appendChild(img)

      await setImgFigureCaption({ readMeta: true })

      const figure = doc.body.querySelector('figure')
      assert.strictEqual(figure, null)
    })
  })

  await runDomTest('explicit options override readMeta flags', async () => {
    await withDocument(async (doc) => {
      const meta = doc.createElement('meta')
      meta.setAttribute('name', 'markdown-frontmatter')
      meta.setAttribute('content', JSON.stringify({ imgAltCaption: false, imgTitleCaption: false }))
      doc.body.appendChild(meta)

      const img = doc.createElement('img')
      img.setAttribute('alt', 'Caption')
      doc.body.appendChild(img)

      await setImgFigureCaption({ readMeta: true, imgAltCaption: true })

      const figure = doc.body.querySelector('figure')
      assert.ok(figure, 'figure should be created')
    })
  })

  await runDomTest('parses readMeta when content uses &quot;', async () => {
    await withDocument(async (doc) => {
      const meta = doc.createElement('meta')
      meta.setAttribute('name', 'markdown-frontmatter')
      meta.setAttribute('content', '{&quot;imgAltCaption&quot;:false,&quot;imgTitleCaption&quot;:false}')
      doc.body.appendChild(meta)

      const img = doc.createElement('img')
      img.setAttribute('alt', 'Caption')
      doc.body.appendChild(img)

      await setImgFigureCaption({ readMeta: true })

      const figure = doc.body.querySelector('figure')
      assert.strictEqual(figure, null)
    })
  })

  await runDomTest('readMeta can use _extensionSettings fallback', async () => {
    await withDocument(async (doc) => {
      const meta = doc.createElement('meta')
      meta.setAttribute('name', 'markdown-frontmatter')
      meta.setAttribute('content', JSON.stringify({
        _extensionSettings: { imgAltCaption: false, imgTitleCaption: false },
      }))
      doc.body.appendChild(meta)

      const img = doc.createElement('img')
      img.setAttribute('alt', 'Caption')
      doc.body.appendChild(img)

      await setImgFigureCaption({ readMeta: true })

      const figure = doc.body.querySelector('figure')
      assert.strictEqual(figure, null)
    })
  })

  await runDomTest('readMeta parses string booleans', async () => {
    await withDocument(async (doc) => {
      const meta = doc.createElement('meta')
      meta.setAttribute('name', 'markdown-frontmatter')
      meta.setAttribute('content', JSON.stringify({ imgAltCaption: 'false' }))
      doc.body.appendChild(meta)

      const img = doc.createElement('img')
      img.setAttribute('alt', 'Caption')
      doc.body.appendChild(img)

      await setImgFigureCaption({ readMeta: true })

      const figure = doc.body.querySelector('figure')
      assert.strictEqual(figure, null)
    })
  })

  await runDomTest('title mode falls back to alt for auto language detection when title is empty', async () => {
    await withDocument(async (doc) => {
      const img = doc.createElement('img')
      img.setAttribute('alt', '猫')
      img.setAttribute('title', '')
      doc.body.appendChild(img)

      await setImgFigureCaption({ imgTitleCaption: true, autoLangDetection: true })

      const figcaption = img.closest('figure').querySelector('figcaption')
      assert.strictEqual(figcaption.textContent, '図')
      assert.strictEqual(img.getAttribute('alt'), '猫')
    })
  })

  await runDomTest('observe mode does not miss external alt updates right after init', async () => {
    await withMutationObserver(async (ObserverClass) => {
      await withDocument(async (doc) => {
        const img = doc.createElement('img')
        img.setAttribute('alt', 'Initial')
        doc.body.appendChild(img)

        await setImgFigureCaption({ imgAltCaption: true, observe: true })

        const observer = ObserverClass.instances[0]
        img.setAttribute('alt', 'External')
        observer.trigger([
          {
            type: 'attributes',
            target: img,
            attributeName: 'alt',
          },
        ])

        const figcaption = img.closest('figure').querySelector('figcaption')
        assert.strictEqual(figcaption.textContent, 'Figure. External')
      })
    })
  })

  await runDomTest('observe mode reprocesses when meta frontmatter content changes', async () => {
    await withMutationObserver(async (ObserverClass) => {
      await withDocument(async (doc) => {
        const meta = doc.createElement('meta')
        meta.setAttribute('name', 'markdown-frontmatter')
        meta.setAttribute('content', JSON.stringify({ imgAltCaption: false }))
        doc.body.appendChild(meta)

        const img = doc.createElement('img')
        img.setAttribute('alt', 'Caption')
        doc.body.appendChild(img)

        await setImgFigureCaption({ readMeta: true, observe: true })
        assert.strictEqual(doc.body.querySelector('figure'), null)

        const observer = ObserverClass.instances[0]
        meta.setAttribute('content', JSON.stringify({ imgAltCaption: true }))
        observer.trigger([
          {
            type: 'attributes',
            target: meta,
            attributeName: 'content',
          },
        ])

        const figure = doc.body.querySelector('figure')
        assert.ok(figure, 'figure should be created after meta content update')
        const figcaption = figure.querySelector('figcaption')
        assert.strictEqual(figcaption.textContent, 'Figure. Caption')
      })
    })
  })

  await runDomTest('replaces previous observer on repeated observe calls', async () => {
    await withMutationObserver(async (ObserverClass) => {
      await withDocument(async (doc) => {
        const img = doc.createElement('img')
        img.setAttribute('alt', 'Caption')
        doc.body.appendChild(img)

        await setImgFigureCaption({ imgAltCaption: true, observe: true })
        assert.strictEqual(ObserverClass.instances.length, 1)
        const firstObserver = ObserverClass.instances[0]
        assert.strictEqual(firstObserver.disconnected, false)

        await setImgFigureCaption({ imgAltCaption: true, observe: true })
        assert.strictEqual(ObserverClass.instances.length, 2)
        assert.strictEqual(firstObserver.disconnected, true)
      })
    })
  })

  await runDomTest('disconnects observer when observe is disabled', async () => {
    await withMutationObserver(async (ObserverClass) => {
      await withDocument(async (doc) => {
        const img = doc.createElement('img')
        img.setAttribute('alt', 'Caption')
        doc.body.appendChild(img)

        await setImgFigureCaption({ imgAltCaption: true, observe: true })
        assert.strictEqual(ObserverClass.instances.length, 1)
        const firstObserver = ObserverClass.instances[0]
        assert.strictEqual(firstObserver.disconnected, false)

        await setImgFigureCaption({ imgAltCaption: true, observe: false })
        assert.strictEqual(firstObserver.disconnected, true)
      })
    })
  })

  await runDomTest('re-detects language when first image changes in observe mode', async () => {
    await withMutationObserver(async (ObserverClass) => {
      await withDocument(async (doc) => {
        const imgJa = doc.createElement('img')
        imgJa.setAttribute('alt', '猫')
        const imgEn = doc.createElement('img')
        imgEn.setAttribute('alt', 'Dog')
        doc.body.appendChild(imgJa)
        doc.body.appendChild(imgEn)

        await setImgFigureCaption({ imgAltCaption: true, observe: true })

        const jaBefore = imgJa.closest('figure').querySelector('figcaption')
        const enBefore = imgEn.closest('figure').querySelector('figcaption')
        assert.strictEqual(jaBefore.textContent, '図　猫')
        assert.strictEqual(enBefore.textContent, '図　Dog')

        const observer = ObserverClass.instances[0]
        const imgFirst = doc.createElement('img')
        imgFirst.setAttribute('alt', 'Cat')
        doc.body.insertBefore(imgFirst, doc.body.childNodes[0])
        observer.trigger([{ type: 'childList', addedNodes: [imgFirst], removedNodes: [] }])

        const firstCaption = imgFirst.closest('figure').querySelector('figcaption')
        const jaAfter = imgJa.closest('figure').querySelector('figcaption')
        const enAfter = imgEn.closest('figure').querySelector('figcaption')
        assert.strictEqual(firstCaption.textContent, 'Figure. Cat')
        assert.strictEqual(jaAfter.textContent, 'Figure. 猫')
        assert.strictEqual(enAfter.textContent, 'Figure. Dog')
      })
    })
  })

  await runDomTest('syncs source when alt is externally cleared in observe mode', async () => {
    await withMutationObserver(async (ObserverClass) => {
      await withDocument(async (doc) => {
        const img = doc.createElement('img')
        img.setAttribute('alt', 'Caption')
        doc.body.appendChild(img)

        await setImgFigureCaption({ imgAltCaption: true, observe: true })
        await new Promise((resolve) => setTimeout(resolve, 0))

        const observer = ObserverClass.instances[0]
        img.setAttribute('alt', '')
        observer.trigger([
          {
            type: 'attributes',
            target: img,
            attributeName: 'alt',
          },
        ])

        const figcaption = img.closest('figure').querySelector('figcaption')
        assert.strictEqual(figcaption.textContent, 'Figure.')
      })
    })
  })
}
