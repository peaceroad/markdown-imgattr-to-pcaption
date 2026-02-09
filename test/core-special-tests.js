export const runCoreSpecialTests = ({ runCoreTest, assert, setMarkdownImgAttrToPCaption }) => {
  runCoreTest('preserves CRLF line endings', () => {
    const src = 'Paragraph.\r\n\r\n![A caption](image.jpg)\r\n\r\nParagraph.'
    const expected = 'Paragraph.\r\n\r\nFigure. A caption\r\n\r\n![](image.jpg)\r\n\r\nParagraph.'
    const out = setMarkdownImgAttrToPCaption(src)
    assert.strictEqual(out, expected)
    assert.ok(out.includes('\r\n'))
    assert.ok(!out.includes('\n\n'))
  })

  runCoreTest('ignores non-boolean imgTitleCaption option', () => {
    const src = 'Paragraph.\n\n![ALT text](image.jpg "Title text")\n\nParagraph.'
    const expected = 'Paragraph.\n\nFigure. ALT text\n\n![](image.jpg)\n\nParagraph.'
    const out = setMarkdownImgAttrToPCaption(src, { imgTitleCaption: 'false' })
    assert.strictEqual(out, expected)
  })

  runCoreTest('supports disabling both caption modes', () => {
    const src = 'Paragraph.\n\n![ALT text](image.jpg)\n\nParagraph.'
    const out = setMarkdownImgAttrToPCaption(src, { imgAltCaption: false, imgTitleCaption: false })
    assert.strictEqual(out, src)
  })

  runCoreTest('ignores non-boolean autoLangDetection option', () => {
    const src = '段落。\n\n![猫](image.jpg)\n\n段落。'
    const expected = '段落。\n\n図　猫\n\n![](image.jpg)\n\n段落。'
    const out = setMarkdownImgAttrToPCaption(src, {
      labelLang: 'en',
      autoLangDetection: 'false',
    })
    assert.strictEqual(out, expected)
  })
}
