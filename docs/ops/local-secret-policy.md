# 本地密钥策略

## 目标

在仓库之外建立一个稳定、固定、可被人格体重复定位的本地密钥根目录。真实密钥只存在于这个目录及服务器环境变量中。

## 固定路径

- macOS 默认根目录：`/Users/bingshuolingdianyuanhe/Library/Application Support/GuanghuLab/secrets`

## 规则

- 仓库内只保存模板、说明、编号规则和示例配置
- 模板可由脚本自动生成并打开给用户填写
- 缺失密钥时，错误信息必须指出具体编号和具体文件路径
- 不在日志、异常或文档中回显真实密钥值
- 服务端执行体优先从环境变量读取仓库写入凭据与执行策略，不把服务端真实凭据回写仓库

## 分类目录

- `ssh/`：服务器连接信息与 SSH 相关密钥说明
- `api/`：模型 API 等第三方能力凭据
- `dns/`：域名、托管商、证书与解析关系
- `repo/`：仓库访问、仓库写入与同步相关凭据

## 服务端装载建议

- `GUANGHU_GITHUB_TOKEN`：GitHub 仓库写入令牌
- `GUANGHU_GITHUB_OWNER`：仓库所属账号或组织
- `GUANGHU_GITHUB_REPO`：仓库名
- `GUANGHU_GITHUB_BRANCH`：默认写入分支
- `GUANGHU_EXECUTION_STATE_DIR`：执行状态目录
- `GUANGHU_TEMP_WORKSPACE_DIR`：临时工作区根目录

## 权限要求

- 目录仅当前用户可读写
- 模板初始可见，真实密钥填写后继续保持本地，不入仓库
- 服务器环境变量只在执行时加载，不写入文档、日志、摘要或仓库文件