# 第一阶段执行状态

## 已完成

- 国际母仓本地骨架已创建
- HDLP 为什么中心恢复链路已创建
- 本地密钥编号体系与模板已创建
- 轻量底座、模块注册表、仓库适配层、密钥定位器、COS 绑定层脚手架已创建
- 国内镜像同步脚本与示例配置已创建
- GitHub 唯一正式写入面、服务器临时执行面、自动跟传兜底的边界文档已补齐
- 云端执行体、积分止损与执行策略示例配置已补齐

## GitHub 远端检查

- 已确认远端仓库 `qinfendebingshuo/guanghulab-core` 可读取
- 已确认默认分支为 `main`
- 当前阶段开始把 GitHub 作为唯一正式写入面推进，不再把本地当成最终归档位置

## 新加坡服务器基线检查

- 已通过 Lighthouse MCP 确认地域 `ap-singapore` 存在
- 当前 `describe_instances` 在 `ap-singapore` 返回“暂无数据”
- 这表示：当前 Lighthouse 凭据下尚未发现可直接校验的实例，或该服务器不在当前可见范围内
- 因此本轮先完成“执行规则、任务状态、自动跟传与止损策略”落地；真实实例部署仍需等实例出现在当前可见列表后继续执行

## 本地密钥入口

本地密钥目录：`/Users/bingshuolingdianyuanhe/Library/Application Support/GuanghuLab/secrets`

推荐先填写：

- `ZY-INTAKE-PHASE1-001.template.txt`：集中填写入口
- `ssh/ZY-SSH-SG-CORE-001.template.txt`
- `api/ZY-API-LLM-PRIMARY-001.template.txt`
- `dns/ZY-DNS-ROOT-001.template.txt`
- `repo/ZY-REPO-GH-CORE-001.template.txt`

## 下一阶段

- 扩展共享契约与仓库适配层，落地 GitHub 远端读写与批量提交能力
- 实现 `executor-core` 与 `cloud-executor-worker`
- 改造 `base-shell-api` 提供任务提交、状态查询、策略与健康接口