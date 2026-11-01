# SeeThrough

**See how your software works.**

SeeThrough 是一个 **DeepSeek Harness（DSH）插件**：将本地软件项目整理成可探索的 3D 工厂，让你从整体进入组件，沿着关系理解软件，并随时在原对话中向 Agent 提问。

图与 Agent 配合工作：你可以指着组件问，Agent 可以查阅对应代码，聚焦或高亮相关部件，结合画面解释。

> **Beta · 0.4.0-beta.1** — 适合小型项目。已验证的宿主版本为 **DSH 0.2.1-rc.3，macOS**。其他宿主版本及 Windows/Linux 尚未完成验收。它不是 DeepSeek 网页聊天或手机 App 的插件，也不是 DeepSeek 官方项目。

## 下载与安装

1. 打开 **[Releases](https://github.com/LeoParkerOu/SeeThrough/releases)**，下载 `seethrough-0.4.0-beta.1.tgz`。这是已经编译好的插件，使用者不需要安装 Node.js 或编译源码。也可以下载同版本 ZIP，解压后取出其中的 `.tgz`。
2. 确保 DSH 已经能够正常与模型对话。在 DSH 左侧打开 **插件 → 添加插件**。
3. 将下载的 `.tgz` **完整本地路径**填入“包名或地址”，点击安装并启用。Mac 访达中选中文件后，按 **Option + Command + C** 复制完整路径。若 DSH 提示需要重启，按提示重启。
4. 打开一个有本地项目目录的 DSH 会话，点击输入区附近的 **打开 SeeThrough**。
5. 在原对话明确告诉 Agent 想看的项目，例如：**“请用 SeeThrough 帮我看看当前项目，先画出主要流程。”** 如果不是当前目录，请提供项目的完整路径。
6. 等待首次制图。之后可以从“已保存的图”恢复，无需每次重新生成。

**请选择 Releases 中的 `.tgz`，不要将 GitHub 的 “Source code.zip” 或 “Download ZIP” 作为插件安装包。** 源码归档需要先构建。

插件标识为 `@leoparkerou/dsh-seethrough`，没有发布到 npm 注册表，安装时请填写文件路径，不要只填包名。

如果你装过早期 `@local/dsh-factory-probe` 测试版，请先禁用或卸载旧版并重启，再启用 SeeThrough。两者使用相同的工具和路由，不能同时启用；本机已有图库沿用保留。

## 第一次可以这样试

- “带我看看用户提交信息后，数据经过哪些步骤，最后保存在哪里。”
- 右键一个组件，选 **@组件**，补充：“这个部分负责什么？请结合代码和图解释。”
- “为什么这条路径会失败？把相关判断高亮出来。”
- 修改代码后：“请核对并更新当前图，让它与最新实现一致。”

只打开画布不会自动扫描或绘图。你明确选择项目后才开始生成。首次生成及后续解释使用 **DSH 中已配置的模型与额度**，可能需要数分钟；插件本身不需要独立 API Key，不提供免费模型服务。

## 如何探索

- **全景与局部：** 缩放进入厂房内部，查看更细的职责；用“项目全景”回到整体。
- **平移、缩放、旋转：** 触控板两指移动平移、捏合缩放，Option（⌥）加两指移动旋转；可使用“复位角度”。不同设备的手势体验可能不同。
- **查看与提问：** 单击查看详情；右键菜单可进入局部、查看关联、查看可能影响范围或把组件加入原会话草稿。草稿由你确认发送。
- **问题视角：** 当图包含预设关键视角时，可以按问题查看对应范围与步骤。首次生成的图不保证包含这些视角。
- **回到源码：** 组件保留代码引用与核验状态，代码变化后可以要求 Agent 重新检查。

图表达的是代码职责和关系，**不是实时运行监控**。高亮或连线不能证明一次请求实际执行过；关联范围也不是对具体代码修改的完整影响分析。Agent 的说明可能出错，请在关键决策前核对代码和运行结果。

## 数据与权限

- 分析上限：单次项目快照最多 **500 个可分析文件、5 MiB 文本**。依赖目录、生成物及部分敏感配置会被排除；这不等于通用的秘密检测。
- 图与源码关联存放在本机 `~/.dsh-component-factory/graphs/`；索引和启用状态存放在同一上级目录。可以用 `DSH_FACTORY_STATE_DIR` 指定存储目录。
- 源码关联文件含源码片段，图库索引含本机项目路径。分享图库应按分享源码处理。
- 为生成和解释图，选中项目的相关代码会进入 DSH Agent 的模型上下文，按你配置的模型服务处理。仅选择你允许该服务读取的项目。
- 图 Agent 使用专用工具读取所选项目、写图和操作画布；主 Agent 保留 DSH 原有的代码操作权限。插件不改变主 Agent 的权限模型。
- SeeThrough 不附带私有项目、账号配置或模型凭证，没有独立遥测服务。

## 常见问题

**没有打开按钮？** 确认插件已启用，按宿主提示重启，在一个有效的项目会话中查看输入区附近。单独展开侧栏不等于启动插件。

**打开后没有图？** 在原对话明确选择项目。首次制图会调用模型；失败时查看画布提示，确认模型可用、项目范围正确，再重试。

**代码修改后图不一致？** 要求原 Agent 核对并同步当前图。引用状态通过不保证语义完全正确。

**升级或卸载？** 在 DSH 插件页禁用或卸载该插件，再安装新 `.tgz`。卸载插件不会删除本机图库，也不影响业务项目运行。

## 从源码开发

需要 Node.js 22+、npm，以及用于打包的 Python 3。宿主 SDK 和 React 由 DSH 提供，不在插件中重新分发。

```sh
git clone https://github.com/LeoParkerOu/SeeThrough.git
cd SeeThrough
npm ci --omit=peer
npm test
npm run release
```

`dist/` 中生成 `.tgz`、便于转发的 ZIP 和 `SHA256SUMS.txt`。打包使用明确的文件清单，不包含开发依赖、业务数据或测试记录。普通使用者直接下载安装包即可。

[开发说明](docs/DEVELOPMENT.md) · [版本记录](CHANGELOG.md) · [反馈问题](https://github.com/LeoParkerOu/SeeThrough/issues)

## 开源与致谢

项目代码采用 [MIT License](LICENSE)。Three.js 用于三维渲染与相机控制，其许可证保留在 [THIRD_PARTY_LICENSES.txt](THIRD_PARTY_LICENSES.txt)。DSH 提供宿主、模型配置与 Agent 能力。

设计调研参考了 [Understand Anything](https://github.com/mtcto/understand-anything)、[codeSee](https://github.com/Kaka-cheaper/codeSee) 与 [OpenFlowKit](https://github.com/openflowkit/openflowkit) 等项目中的语义图和交互机制；这些参考不代表本插件直接分发了它们的完整实现。
