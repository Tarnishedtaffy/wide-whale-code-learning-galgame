# Android 安装预览版

Whale Studio 使用原生 Android WebView 加载 APK 内置的单文件前端，不需要本地服务、外部 CDN 或联网。最低 Android 8.0（API 26），目标 API 35。需要支持现代 JavaScript 的 Android System WebView，旧系统请更新 WebView；未验证出厂旧版 WebView。

## 构建

需要 JDK 17 或 21、Python 3、Android SDK Platform 35；Gradle Wrapper 固定为 8.14.4，Android Gradle Plugin 固定为 8.11.1。首次构建可能下载官方构建工具。

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build_android.ps1
```

产物为 `dist/android/Whale-Studio-0.1.0-preview.apk`。使用本机标准 Android debug 证书签名，供侧载体验，不是应用商店生产发行签名；不同机器重新构建可能需要卸载旧预览版再安装。卸载会清理本地文件，请先导出。

若 Windows JDK 出现 `Unable to establish loopback connection`，且堆栈来自 `UnixDomainSockets.connect`，可以为本次构建使用 TCP 管道回退：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build_android.ps1 -UseTcpPipeWorkaround
```

此开关仅为当前构建进程设置 JDK 属性，不更改系统代理、防火墙或网络配置。

## 封装行为

- 前端从固定的 `https://appassets.androidplatform.net/assets/index.html` 本地响应加载，工作文件保存在应用 WebView 的 localStorage 中。
- 不申请网络、外部存储权限。禁止 WebView 文件访问、内容访问和外部页面导航；原生导出桥只暴露保存文件能力，不提供任意文件路径或代码执行。
- 「导出文件」打开 Android 文档保存窗口，由用户选择目标位置，不依赖 WebView 的 Blob 下载支持。
- 返回键优先关闭弹窗、收起卡牌，再返回编辑页，最后退出应用。横竖屏切换保留当前 WebView；系统栏和软键盘遮挡由原生窗口边距处理。
- AI 仍为本地预设回复；终端仍为有限的 Python 演示解析器，不是完整开发运行环境。
- 自动备份关闭。APK 包含初始示例前端，不包含电脑浏览器中已有的文件或聊天数据。

## 模拟器检查

项目包含无第三方测试依赖的 `SmokeInstrumentation`：检查离线加载、原生导出桥、演示运行、保存后重新加载、真实触摸换牌、翻面、草稿保留和文档导出。导出测试由 Android ActivityMonitor 返回测试文件 URI，写入后校验并清理，仅模拟选择保存位置这一用户动作。

```powershell
cd android
./gradlew.bat assembleDebug assembleDebugAndroidTest lintDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb install -r app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
adb shell am instrument -w io.github.whalestudio.preview.test/io.github.whalestudio.preview.SmokeInstrumentation
```

模拟器通过不代表手机真机验收。生产上架签名、真实 AI 和完整代码执行均不在此预览版本范围内。

## 本次结果

- `assembleDebug`、`assembleDebugAndroidTest`、`lintDebug` 通过；lint 无错误，保留目标 SDK/图标等建议警告。
- Android 16 / API 36 x86_64 模拟器，720×1280、320dpi，系统 WebView 133.0.6943.137。
- `SmokeInstrumentation` 最终输出 PASS：离线启动、原生桥、演示运行、保存后重新加载、原生触摸左划换牌、点击翻面、聊天草稿保留、文档导出。
- 文档导出测试拦截保存 Intent 并提供测试 URI，实际执行原生结果回调与文件写入、读回核对；不把测试替代选择位置的步骤称为完整人工文件选择器验收。
- 修复原生触屏下卡面滚动容器抢占横向手势的问题：在卡面上明确 `touch-action: pan-y`；助手页就绪判断改为实际可见面积，容忍 WebView 的滚动偏移差异。
- 预览 APK 通过 `apksigner verify`（v2 签名），清单不申请权限。真机安装、输入法与系统手势仍待设备验证。
- 打包资产逐字节匹配离线 HTML；本次产物 33,515 字节，SHA-256：`0afd9e64cd99f12dcee41b91b757f001e973dda4c79a8492d615f8520038aa8e`。
- [模拟器安装后截图](screenshots/android-ide-preview.png)。
