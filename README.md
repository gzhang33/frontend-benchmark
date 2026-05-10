# Frontend Benchmark

LLM 模型前端代码生成能力的可视化对比评测工具。

## 功能

- **多模型并行对比** — 2~4 分屏同时生成，直观对比模型输出质量
- **检查点评分** — 为每个用例定义检查点，按通过/部分/失败三级评分
- **盲评模式** — 随机隐藏模型名称，消除偏见
- **批量运行** — 勾选用例一键批量生成，自动记录结果
- **自定义用例** — 添加自己的测试提示词
- **自定义模型** — 接入任意 OpenAI 兼容 API
- **数据持久化** — 基于 IndexedDB，评分和投票本地存储
- **导出结果** — JSON 格式导出所有评分和投票数据

## 快速开始

```bash
# 需要 Node.js 运行开发服务器
node server.js

# 打开浏览器访问
# http://127.0.0.1:3456
```

## 项目结构

```
benchmark/
├── index.html          # 主页面
├── css/
│   └── style.css       # 样式
├── js/
│   ├── config.js       # 配置常量与 localStorage 工具
│   ├── utils.js        # 通用工具函数
│   ├── api.js          # API 配置与自定义模型管理
│   ├── ui.js           # 主界面交互（标签页、侧栏、列表、自定义用例）
│   ├── panes.js        # 分屏面板创建与管理
│   ├── generate.js     # LLM 生成逻辑（SSE 流式）
│   ├── blind.js        # 盲评模式
│   ├── session.js      # 评测会话管理
│   ├── scoring.js      # 评分抽屉与评分保存
│   ├── batch.js        # 批量运行（Worker Queue 并发）
│   ├── views.js        # 统计与历史页面
│   └── app.js          # 入口初始化
├── lib/
│   └── store.js        # IndexedDB 封装
├── prompts.json        # 内置测试用例与模型配置
├── server.js           # 开发服务器
├── tests/
│   ├── playwright.config.js
│   └── e2e-setup.js    # E2E 测试 Mock 服务器
├── docs/
│   └── design-spec.html
├── .editorconfig
├── .env.example
├── .gitignore
└── package.json
```

## 技术栈

- 纯 HTML/CSS/JS，无构建步骤
- IndexedDB (BenchmarkStore) 本地持久化
- Highlight.js 代码高亮
- Tailwind CSS CDN
- Node.js 开发服务器（带 LLM 代理）
- Playwright E2E 测试

## 配置

### 自定义模型

在界面上点击「配置」按钮，填入：
- Base URL（OpenAI 兼容 API 地址）
- API Key
- 模型 ID
- 显示名称

支持快速填充：OpenAI、DeepSeek、Gemini、Anthropic、智谱 GLM、通义千问、Groq、Together、Mistral、硅基流动、OpenRouter。

### 测试用例

编辑 `prompts.json` 添加内置用例，或在界面上通过「+」按钮添加自定义用例。

## License

MIT
