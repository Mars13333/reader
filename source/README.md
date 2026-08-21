# 原文放置目录

运行 `book:auto` 前，把你合法取得的完整原文保存到本目录。

- 支持 UTF-8 编码的 `.txt` 和 `.md`。
- 原文文件默认不会被 Git 跟踪，也不会复制到单本书目录。
- 新建书籍时用 `--source` 填写本目录内的文件名，例如：

```powershell
npm run book:auto -- --title "简单致富" --author "J. L. 柯林斯" --audience "泛读书用户" --source "简单致富：实现财务自由与富足人生的路线图.txt"
```

自动流程会记录原文的项目相对路径和 SHA-256。制作过程中不要替换或修改该文件；恢复运行时会再次校验。


恢复同一本新书时无需再次传 --source：
```
npm run book:auto -- --resume --book "book-004-百年孤独"
```