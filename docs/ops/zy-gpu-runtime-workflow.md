# ZY GPU Runtime Workflow（手动触发）

本工作流用于：
- GPU服务器有货后，快速注入最新密钥并完成部署；
- 端口/IP变化后，无需改代码，只更新 Secrets 再触发；
- 误操作时先做预检并返回可读报错；
- 失败默认最多重试 3 次，自动止损。

## 1. 工作流入口

GitHub Actions -> `ZY GPU Runtime Manual Flow`

手动触发参数：
- `action_mode`：`precheck` | `bootstrap` | `deploy` | `refresh`
- `max_retries`：默认 `3`
- `dry_run`：`true` 时只探测，不执行部署

## 2. 必填密钥

- `ZY_DEPLOY_SSH_SG_GPU_001_HOST`
- `ZY_DEPLOY_SSH_SG_GPU_001_PORT`
- `ZY_DEPLOY_SSH_SG_GPU_001_USER`
- `ZY_DEPLOY_SSH_SG_GPU_001_PRIVATE_KEY`
- `ZY_DEPLOY_GPU_PROD_CORE_001_PATH`
- `ZY_RUNTIME_GPU_PROD_CORE_001_WORKSPACE`
- `ZY_RUNTIME_GPU_PROD_CORE_001_DEPLOY_CMD`

## 3. 可选密钥

- `ZY_RUNTIME_GPU_PROD_CORE_001_BOOTSTRAP_CMD`
- `ZY_RUNTIME_GPU_PROD_CORE_001_PULL_MODEL_CMD`
- `ZY_RUNTIME_GPU_PROD_CORE_001_BACKUP_CMD`
- `ZY_STORAGE_COS_CN_CORE_001_SECRET_ID`
- `ZY_STORAGE_COS_CN_CORE_001_SECRET_KEY`
- `ZY_STORAGE_COS_CN_CORE_001_BUCKET`
- `ZY_STORAGE_COS_CN_CORE_001_REGION`

## 4. 推荐触发顺序

1) 第一次配置：
- 先跑 `precheck`（确认密钥齐全）
- 再跑 `bootstrap`（初始化环境）
- 最后跑 `deploy`（正式部署）

2) 端口/IP变化：
- 更新 4 个 SSH 类密钥（HOST/PORT/USER/PRIVATE_KEY）
- 跑 `refresh`（会重新探测并执行更新）

## 5. 可读报错规则

- 缺少密钥：直接报具体 `secret name`
- 端口格式错：提示 `PORT 必须是数字`
- 私钥格式错：提示 `PRIVATE_KEY 缺少 BEGIN/END`
- SSH连不上：提示检查 `HOST/PORT/USER/PRIVATE_KEY`
- 连续失败：达到上限后自动停止

## 6. 你只要做什么

你只需要：
1. 在仓库 Secrets 按命名填值；
2. 在 Actions 里点对应模式触发；
3. 如果失败，看 Summary 里的报错名；
4. 改对应密钥后再点一次。
