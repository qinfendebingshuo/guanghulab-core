# ZY GPU 工作流启用步骤（一次性）

由于当前自动提交 token 对 `.github/workflows/*` 写入权限受限，先采用模板启用：

## 一次性启用

1. 打开仓库文件：`docs/ops/workflows/zy-gpu-runtime.yml`
2. 复制全部内容
3. 在 GitHub 仓库新建文件：`.github/workflows/zy-gpu-runtime.yml`
4. 提交后，进入 Actions 即可看到 `ZY GPU Runtime Manual Flow`

## 后续使用

- 每次只更新 Secrets（比如 HOST/PORT 变更）
- 然后手动触发工作流：
  - `precheck`：只检查
  - `bootstrap`：初始化环境
  - `deploy`：正式部署
  - `refresh`：重载并备份

## 失败止损

- 工作流最多重试 `max_retries` 次（默认3）
- 超过次数自动停止，避免无限重试

## 人类可读报错

- 缺密钥：直接显示具体 secret 名称
- 端口错误：提示端口必须数字
- 私钥格式错：提示缺少 BEGIN/END
- SSH失败：提示检查 HOST/PORT/USER/PRIVATE_KEY
