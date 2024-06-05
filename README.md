# markdown-imgattr-to-pcaption

Change img alt attribute to figure caption paragraph for p7d-markdown-it-p-captions.

```
import setMarkdownImgAttrToPCaption from '@peaceroad/markdown-imgattr-to-pcaption'

setMarkdownImgAttrToPCaption(markdownCont)
```

```
[Input]
段落。段落。段落。

![キャプション](image.jpg)

段落。段落。段落。


[Output]
段落。段落。段落。

図　キャプション

![](image.jpg)

段落。段落。段落。


[Input]
段落。段落。段落。

![図 キャプション](image.jpg)

段落。段落。段落。

[Output]
段落。段落。段落。

図 キャプション

![](image.jpg)

段落。段落。段落。



[Input]
段落。段落。段落。

![図1 キャプション](image.jpg)

段落。段落。段落。

[Output]
段落。段落。段落。

図1 キャプション

![](image.jpg)

段落。段落。段落。
```

## Option

### imgTitleCaption

```
[Input]
段落。段落。段落。

![ALT](image.jpg "キャプション")

段落。段落。段落。


[Output]
段落。段落。段落。

図　キャプション

![ALT](image.jpg)

段落。段落。段落。
```