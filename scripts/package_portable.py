"""Bundle the standalone IDE without build dependencies or external assets."""
from pathlib import Path
import hashlib
import json
import zipfile

root = Path(__file__).resolve().parents[1]
out = root / "dist" / "portable"
out.mkdir(parents=True, exist_ok=True)
html = (root / "ide.html").read_text(encoding="utf-8")
css = (root / "ide.css").read_text(encoding="utf-8")
js = (root / "ide.js").read_text(encoding="utf-8")
assert html.count('<link rel="stylesheet" href="ide.css">') == 1
assert html.count('<script src="ide.js"></script>') == 1
assert "</script" not in js.lower()
html = html.replace('<link rel="stylesheet" href="ide.css">', '<style>\n' + css + '\n</style>')
html = html.replace('<script src="ide.js"></script>', '<script>\n' + js + '\n</script>')
html = html.replace('<p>原有学习页面仍可从 <a href="mobile.html">这里打开 ↗</a>。</p>', '<p>Whale Studio 独立离线版，无需服务器或安装依赖。</p>')
artifact = out / "Whale-Studio.html"
artifact.write_text(html, encoding="utf-8")
readme = """Whale Studio · 可分享离线版

解压后用浏览器打开 index.html，无需启动本地服务器。
也可以只转发同目录提供的 Whale-Studio.html 单文件，用浏览器打开即可。
手机请下载到设备，再选择浏览器打开；部分聊天软件的内置预览不执行网页脚本。
若手机不支持直接打开本地 HTML，请使用部署后的网址或 Android APK。

本版本是纯前端原型：AI 使用本地演示回复，终端仅包含基础 Python 演示，
不是完整 Python 解释器或真实系统 Shell。离线打包不会改变这些边界。
文件保存在当前浏览器中，不会同步给其他设备；本地文件地址下的存储支持
取决于浏览器，重要代码请通过文件面板导出。分享程序不会包含你的浏览器文件与聊天记录。

网站部署：将 index.html 上传到静态网站托管服务即可，不需要构建。
APK：需要 Android WebView 容器和签名，HTML 文件本身不是安装包。
"""
archive = out / "Whale-Studio-portable.zip"
with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("index.html", html)
    z.writestr("使用说明.txt", readme)
manifest = {
    p.name: {"bytes": p.stat().st_size, "sha256": hashlib.sha256(p.read_bytes()).hexdigest()}
    for p in (artifact, archive)
}
(out / "checksums.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(manifest, ensure_ascii=False, indent=2))
