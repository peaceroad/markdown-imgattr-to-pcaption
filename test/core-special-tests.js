export const runCoreSpecialTests = ({ runCoreTest, assert, setMarkdownImgAttrToPCaption }) => {
  runCoreTest('preserves CRLF line endings', () => {
    const src = 'Paragraph.\r\n\r\n![A caption](image.jpg)\r\n\r\nParagraph.'
    const expected = 'Paragraph.\r\n\r\nFigure. A caption\r\n\r\n![](image.jpg)\r\n\r\nParagraph.'
    const out = setMarkdownImgAttrToPCaption(src)
    assert.strictEqual(out, expected)
    assert.ok(out.includes('\r\n'))
    assert.ok(!out.includes('\n\n'))
  })
}