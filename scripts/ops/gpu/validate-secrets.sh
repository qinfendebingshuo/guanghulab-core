#!/usr/bin/env bash
set -euo pipefail

mode="${ACTION_MODE:-precheck}"

required_common=(
ZY_DEPLOY_SSH_SG_GPU_001_HOST
ZY_DEPLOY_SSH_SG_GPU_001_PORT
ZY_DEPLOY_SSH_SG_GPU_001_USER
ZY_DEPLOY_SSH_SG_GPU_001_PRIVATE_KEY
)

required_bootstrap=(
ZY_DEPLOY_GPU_PROD_CORE_001_PATH
ZY_RUNTIME_GPU_PROD_CORE_001_WORKSPACE
)

required_deploy=(
ZY_RUNTIME_GPU_PROD_CORE_001_DEPLOY_CMD
)

required=()
required+=("${required_common[@]}")

case "$mode" in
precheck)
  ;;
bootstrap|refresh)
  required+=("${required_bootstrap[@]}")
  ;;
deploy)
  required+=("${required_bootstrap[@]}")
  required+=("${required_deploy[@]}")
  ;;
*)
  echo "::error::ACTION_MODE 非法：$mode（允许 precheck/bootstrap/deploy/refresh）"
  exit 1
  ;;
esac

missing=()
for key in "${required[@]}"; do
  if [ -z "${!key:-}" ]; then
    missing+=("$key")
  fi
done

if [ ${#missing[@]} -gt 0 ]; then
  echo "::error::缺少必填密钥：${missing[*]}"
  {
    echo "### ❌ 密钥检查未通过"
    echo "缺少以下密钥："
    for m in "${missing[@]}"; do
      echo "- $m"
    done
  } >> "$GITHUB_STEP_SUMMARY"
  exit 1
fi

if ! [[ "${ZY_DEPLOY_SSH_SG_GPU_001_PORT}" =~ ^[0-9]+$ ]]; then
  echo "::error::ZY_DEPLOY_SSH_SG_GPU_001_PORT 必须是数字"
  exit 1
fi

if ! grep -q "BEGIN" <<< "${ZY_DEPLOY_SSH_SG_GPU_001_PRIVATE_KEY}"; then
  echo "::error::ZY_DEPLOY_SSH_SG_GPU_001_PRIVATE_KEY 格式异常：缺少 BEGIN 边界"
  exit 1
fi

{
  echo "### ✅ 密钥检查通过"
  echo "- 模式: $mode"
  echo "- 主机: ${ZY_DEPLOY_SSH_SG_GPU_001_HOST}"
  echo "- 端口: ${ZY_DEPLOY_SSH_SG_GPU_001_PORT}"
  echo "- 用户: ${ZY_DEPLOY_SSH_SG_GPU_001_USER}"
} >> "$GITHUB_STEP_SUMMARY"
