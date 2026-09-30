# Codex Keyboard（Windows 11）

Codex Keyboard 是 EasyInput V2 与本地 Codex Agent 的局域网语音键盘。Windows 电脑和开发板连接到同一局域网；语音、任务状态和播报都经由本机 Host 完成，不依赖公网中转。

- `S1–S4`：按住说话，松开后识别文字并交给对应的本地 Codex 任务。
- `S5–S8`：按完成顺序播放对应槽位尚未听过的 Codex 回复。
- 左起四灯：显示对应槽位未播放回复的数量，数量越多越亮；全部播放后熄灭。
- 第五灯：显示当前真正运行中的不同任务数量，0–4 级对应自定义颜色和亮度。
- 旋钮：调节开发板音量；短按播报当前音量。
- Windows 桌面端：配置 Wi‑Fi、DashScope API Key、四个任务槽、灯光和语音服务，并查看诊断与任务记录。

## 目录

- `app/desktop/`：Tauri 2 Windows 桌面端源码。
- `app/host/`：跨平台 Host 共享代码。
- `windows-host/`：Windows Host、任务队列、Codex 接入和局域网服务。
- `firmware/`：ESP32-S3 / EasyInput V2 固件源码与离线测试。
- `scripts/`：Windows 启动、测试和发布辅助脚本。
- `docs/`：产品、架构、硬件和验收说明。
- `flow/`：本仓库开发过程记录；跨仓项目总控在上级 `../flow/`。

## 用户安装

从 GitHub Releases 下载 `Codex Keyboard_0.1.14_x64-setup.exe`，双击安装。安装后打开桌面端，按“首次使用设置”完成：

1. 通过 USB 给开发板写入 Wi‑Fi 和配对资料；
2. 填写自己的 DashScope API Key；
3. 绑定本地 Codex 任务到 S1–S4；
4. 点击“配对并启动语音服务”；
5. 在“诊断”确认电脑、开发板、语音服务和任务槽状态。

API Key、设备密钥和本地任务数据库保存在 Windows 当前用户目录，不进入 GitHub。不要把密钥写进命令行、截图或仓库文件。

## 开发与验证

Windows 移植目前先使用独立的 `windows-host/` 和 Windows Tauri 桌面端；Mac 版本说明和真机历史
验收仍保留作为功能基线。首次联调时可以在 PowerShell 执行：

```powershell
.\scripts\start-windows.ps1 -TemporaryData
```

这个命令会使用临时数据目录启动本地 Host 和桌面端，不会连接开发板、调用真实 ASR 或执行 Codex。
如果只想检查 Host，可以执行：

```powershell
.\scripts\start-windows.ps1 -TemporaryData -SkipDesktop
```

运行 Windows 固件离线测试：

```powershell
.\scripts\run-host-tests-windows.ps1
```

这一步只检查电脑上的固件协议和板级逻辑，不需要 USB，也不会烧录开发板。

完整的用户流程见上级项目文档：`../docs/用户使用说明.md`；开发者构建、测试和发布见：`../docs/开发者说明.md`。

## 发布版本

当前推荐版本为 `0.1.14`。安装包和固件哈希见上级 `../docs/发布说明.md`。GitHub 发布时只上传源码仓库和 Releases 安装包，不上传 `target/`、`node_modules/`、数据库、密钥或临时构建目录。

## 来源

本仓从 `Larkspur-Wang/easy-codex-input@52949d33c51bac605a33cb8ff42ee3eeab37021e`
抽取。新仓只保留本地 Wi-Fi 所需的电脑 App、Host、固件和测试；原仓继续独立存在且未被修改。

## 当前状态

Windows 桌面端、Host、任务记录、诊断、四槽 FIFO/四路并行、语音播报和灯光自定义已完成构建与自动化验证。真实设备的网络质量、Codex 桌面 IPC 和不同电脑环境仍应按验收表逐项复核，不能仅凭本地构建替代真机验收。

## 训练营材料

- [学员手册](docs/训练营学员手册.md)
- [飞书手把手教程](https://rx5emoyb8vg.feishu.cn/docx/R7uTdHTbMotf0px4sy6cPu7nn0f)
- [PowerPoint：47 页，含讲稿，2026-09-05 修订](projects/codex-radio_ppt169_20260810/exports/Codex任务电台_课程案例_Lark_47页_20260905.pptx)
- [PDF：同版 47 页，Keynote 导出](projects/codex-radio_ppt169_20260810/exports/Codex任务电台_课程案例_Lark_47页_20260905.pdf)
- [本地教程底稿与图表源码](projects/feishu_tutorial_20260817/draft.md)

课程案例名为《Codex 任务电台：一把键盘，远程开发》。课件共 47 页：41 页主讲与 6 页附录，
包含动机、真实键盘与 App、十个基础概念、开发中的问题和复现练习。
代码仍锁定 `v0.1.0-local-training`；本轮只修订材料，没有重新烧录或运行真机验收。
旧版导出保留在同目录，版本区别见[课件索引](projects/codex-radio_ppt169_20260810/README.md)。
