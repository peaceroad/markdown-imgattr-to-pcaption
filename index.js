const setMarkdownImgAttrToPCaption = (markdown, option) => {

  const opt = {
    imgAltCaption : true,
    imgTitleCaption: false,
    labelLang: 'ja',
    }
    if (option !== undefined) {
      if (option.imgTitleCaption) {
        opt.imgTitleCaption = option.imgTitleCaption
      }
      if (option.labelLang) {
        opt.labelLang = option.labelLang
      }
    }
    if (opt.imgTitleCaption) opt.imgAltCaption = false

    let n = 0
    let lines = markdown.split(/\r\n|\n/)
    let lineBreaks = markdown.match(/\r\n|\n/g);
    let isBackquoteCodeBlock = false
    let isTildeCodeBlock = false
    const br = lineBreaks ? lineBreaks[0] : ''
  
    if(lines.length === 0) return markdown
  
    while (n < lines.length) {
      let isPrevBreakLine = false
      let isNextBreakLine = false
      if (lines[n].match(/^[ \t]*```/)) {
        if (isBackquoteCodeBlock) {
          isBackquoteCodeBlock = false
        } else {
          isBackquoteCodeBlock = true
        }
      }
      if (lines[n].match(/^[ \t]*~~~/)) {
        if (isTildeCodeBlock) {
          isTildeCodeBlock = false
        } else {
          isTildeCodeBlock = true
        }
      }
      if (isBackquoteCodeBlock || isTildeCodeBlock) {
        n++
        continue
      }
  
      if (n === 0) {
        isPrevBreakLine = true
      } else {
        isPrevBreakLine = /^[ \t]*$/.test(lines[n-1])
      }
      if (n === lines.length -1) {
        isNextBreakLine = true
      } else {
        isNextBreakLine = /^[ \t]*$/.test(lines[n+1])
      }
      if (isPrevBreakLine && isNextBreakLine) {
        lines[n] = modLines(n ,lines, br, opt)
      }
      n++
    }
  
    n = 0
    markdown = ''
    while (n < lines.length) {
      if (n === lines.length - 1) {
        markdown += lines[n]
        break
      }
      markdown += lines[n] + lineBreaks[n]
      n++
    }
    return markdown
  }
  
  const modLines = (n, lines, br, opt) => {
  
    const markAfterNum = '[A-Z0-9]{1,6}(?:[.-][A-Z0-9]{1,6}){0,5}';
    const joint = '[.:．。：　]';
    const jointFullWidth = '[．。：　]';
    const jointHalfWidth = '[.:]';
  
    const markAfterEn = '(?:' +
      ' *(?:' +
        jointHalfWidth + '(?:(?=[ ]+)|$)|' +
        jointFullWidth + '|' +
        '(?=[ ]+[^0-9a-zA-Z])' +
      ')|' +
      ' *' + '(' + markAfterNum + ')(?:' +
        jointHalfWidth + '(?:(?=[ ]+)|$)|' +
        jointFullWidth + '|' +
        '(?=[ ]+[^a-z])|$' +
      ')|' +
      '[.](' + markAfterNum + ')(?:' +
        joint + '|(?=[ ]+[^a-z])|$' +
      ')' +
    ')';
    const markAfterJa = '(?:' +
    ' *(?:' +
      jointHalfWidth + '(?:(?=[ ]+)|$)|' +
      jointFullWidth + '|' +
      '(?=[ ]+)' +
    ')|' +
    ' *' + '(' + markAfterNum + ')(?:' +
      jointHalfWidth + '(?:(?=[ ]+)|$)|' +
      jointFullWidth + '|' +
      '(?=[ ]+)|$' +
    ')' +
  ')';
  
    const labelEn = '(?:[fF][iI][gG](?:[uU][rR][eE])?|[iI][lL]{2}[uU][sS][tT]|[pP][hH][oO][tT][oO])';
    const labelJa = '(?:図|イラスト|写真)';
  
    const markReg = {
      //fig(ure)?, illust, photo
      "img": new RegExp('^(?:' + labelEn + markAfterEn + '|' + labelJa + markAfterJa +
      ')'),
    }
    const markRegWithNoJoint = {
      "img": new RegExp('^(' + labelEn + '|' + labelJa + ')([ .]?' + markAfterNum + ')?$'),
    }
  
    let reg = /^([ \t]*?)!\[ *?(.*?) *?\]\(([^ ]*?)( +"(.*?)")?\)( *(?:{.*?})?)$/
  
    const imgLine = lines[n].match(reg)
    if (!imgLine) return lines[n]
    //console.log(imgLine)
  
    let hasLabel
    if (opt.imgAltCaption) hasLabel = imgLine[2].match(new RegExp(markReg.img))
    if (opt.imgTitleCaption) hasLabel = imgLine[5].match(new RegExp(markReg.img))
    let hasLabelWithNoJoint
    if (opt.imgAltCaption) hasLabelWithNoJoint = imgLine[2].match(new RegExp(markRegWithNoJoint.img))
    if (opt.imgTitleCaption) hasLabelWithNoJoint = imgLine[5].match(new RegExp(markRegWithNoJoint.img))

    lines[n] = imgLine[1]
    if (hasLabel) {
      //console.log('With label::')
      if (opt.imgAltCaption) {
        lines[n] += imgLine[2]
      } else if (opt.imgTitleCaption) {
        lines[n] += imgLine[5]
      }
      lines[n] += br + br +  imgLine[1] + '!['
      if (opt.imgTitleCaption) lines[n] += imgLine[2]
      lines[n] += ']'
    } else if (hasLabelWithNoJoint) {
      //console.log('With label (no joint)::')
      //console.log(hasLabelWithNoJoint)
      if (opt.imgAltCaption) {
        lines[n] += imgLine[2]
      } else if (opt.imgTitleCaption) {
        lines[n] += imgLine[5]
      }
      lines[n] += br + br +  imgLine[1] + '![' + hasLabelWithNoJoint[0].replace(new RegExp(joint + '$')) + ']'
    } else {
      //console.log('No label::')
      if (opt.labelLang === 'ja') {
        if (opt.imgAltCaption) {
          if (imgLine[2]) {
            lines[n] += '図　' + imgLine[2] + br + br + imgLine[1] + '![]'
          } else {
            lines[n] += '図' + br + br + imgLine[1] + '![]'
          }
        } else if (opt.imgTitleCaption) {
          if (imgLine[5]) {
            lines[n] += '図　' + imgLine[5] + br + br + imgLine[1] + '![' + imgLine[2] + ']'
          } else {
            lines[n] += '図' + br + br + imgLine[1] + '![' + imgLine[2] + ']'
          }
        }
      } else if (opt.labelLang === 'en') {
        if (opt.imgAltCaption) {
          if (imgLine[2]) {
            lines[n] += 'Figure. ' + imgLine[2] + br + br + imgLine[1] +'![]'
          } else {
            lines[n] += 'Figure.' + br + br + imgLine[1] +'![]'
          }
        } else if (opt.imgTitleCaption) {
          if (imgLine[5]) {
            lines[n] += 'Figure. ' + imgLine[5] + br + br + imgLine[1] + '![' + imgLine[2] + ']'
          } else {
            lines[n] += 'Figure. ' + br + br + imgLine[1] + '![' + imgLine[2] + ']'
          }
        }
      }
    }
    lines[n] += '(' + imgLine[3] + ')' + imgLine[6]
    return lines[n]
  }

  export default setMarkdownImgAttrToPCaption