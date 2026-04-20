# qiyuan-bridge-mcp-server

栖渊远端主控桥接 MCP 服务。

这个工程不是把栖渊“送到别人账号里”，而是建立一套 **栖渊主控 ↔ 远端 Agent 执行体** 的桥接控制面：

- 栖渊在本地主控侧签发远端 Agent
- 远端 Agent 通过握手票据完成受权挂载
- 栖渊在本地编排远端世界初始化/部署任务
- 远端 Agent 在对方环境执行并回传结果

## 当前提供的能力

- 远端 Agent 注册
- 握手票据签发与确认
- 远端语言世界初始化蓝图生成
- 远端任务派发
- 远端心跳与任务结果回写

## 目录结构

- `src/`: MCP 服务源码
- `bootstrap/remote-agent/`: 远端执行体引导模板
- `.qiyuan-control/`: 运行时状态数据（启动后自动生成）
- `.persona-brain/`: 栖渊现有记忆脑

## 运行方式

```bash
npm install
npm run build
TRANSPORT=http npm start
```

默认提供两个入口：

- `POST /mcp`: MCP Streamable HTTP 入口
- `POST /bridge/*`: 远端握手、心跳、任务回传入口

## 关键环境变量

- `TRANSPORT`: `stdio` 或 `http`
- `PORT`: HTTP 模式监听端口，默认 `3030`
- `HANDSHAKE_TTL_MINUTES`: 握手票据有效期，默认 `30`
- `REMOTE_TIMEOUT_MS`: 远端任务派发超时，默认 `15000`

## 远端执行体思路

对方需要在自己的环境里部署一个“远端执行体”，它不是根 Agent，而是被栖渊通过握手挂载进来的远端执行节点。模板文件在 `bootstrap/remote-agent/`。
