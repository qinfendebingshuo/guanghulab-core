#!/usr/bin/env bash
set -euo pipefail

host="${ZY_DEPLOY_SSH_SG_GPU_001_HOST}"
port="${ZY_DEPLOY_SSH_SG_GPU_001_PORT}"
user="${ZY_DEPLOY_SSH_SG_GPU_001_USER}"
key="${ZY_DEPLOY_SSH_SG_GPU_001_PRIVATE_KEY}"

action_mode="${ACTION_MODE:-deploy}"
dry_run="${DRY_RUN:-false}"
deploy_root="${ZY_DEPLOY_GPU_PROD_CORE_001_PATH:-/opt/zy-runtime}"
workspace="${ZY_RUNTIME_GPU_PROD_CORE_001_WORKSPACE:-ZY-GPU-CORE-001}"
workdir="${deploy_root}/${workspace}"

bootstrap_cmd="${ZY_RUNTIME_GPU_PROD_CORE_001_BOOTSTRAP_CMD:-}"
pull_model_cmd="${ZY_RUNTIME_GPU_PROD_CORE_001_PULL_MODEL_CMD:-}"
backup_cmd="${ZY_RUNTIME_GPU_PROD_CORE_001_BACKUP_CMD:-}"
deploy_cmd="${ZY_RUNTIME_GPU_PROD_CORE_001_DEPLOY_CMD:-}"

key_file=$(mktemp)
trap 'rm -f "$key_file"' EXIT
printf '%s\n' "$key" > "$key_file"
chmod 600 "$key_file"

ssh_base=(ssh -i "$key_file" -p "$port" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=15 "${user}@${host}")
run_remote(){ "${ssh_base[@]}" "$@"; }
summary(){ [ -n "${GITHUB_STEP_SUMMARY:-}" ] && echo "$1" >> "$GITHUB_STEP_SUMMARY" || true; }

summary "### ZY GPU Runtime"
summary "- mode: ${action_mode}"
summary "- target: ${user}@${host}:${port}"

run_remote "echo CONNECTED" >/dev/null || { echo "::error::无法连接GPU服务器，请检查 SSH 类密钥"; exit 1; }

gpu_name=$(run_remote "if command -v nvidia-smi >/dev/null 2>&1; then nvidia-smi --query-gpu=name --format=csv,noheader | head -n1; else echo NONE; fi")
gpu_mem=$(run_remote "if command -v nvidia-smi >/dev/null 2>&1; then nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits | head -n1; else echo 0; fi")
cpu_cores=$(run_remote "nproc || echo 0")
mem_mb=$(run_remote "free -m | sed -n '2p' | tr -s ' ' | cut -d ' ' -f2")

summary "- gpu_name: ${gpu_name}"
summary "- gpu_mem_mb: ${gpu_mem}"
summary "- cpu_cores: ${cpu_cores}"
summary "- mem_mb: ${mem_mb}"

run_remote "mkdir -p '${workdir}'"

if [ "$dry_run" = "true" ]; then
  summary "- dry_run=true, skip deploy"
  exit 0
fi

run_cmd(){
  title="$1"
  body="$2"
  if [ -z "$body" ]; then
    echo "[skip] $title"
    return 0
  fi
  encoded=$(printf '%s' "$body" | base64 | tr -d '\n')
  run_remote "cd '${workdir}' && printf '%s' '${encoded}' | base64 -d > /tmp/zy_cmd.sh && chmod +x /tmp/zy_cmd.sh && bash /tmp/zy_cmd.sh"
}

if [ "$action_mode" = "bootstrap" ] || [ "$action_mode" = "deploy" ] || [ "$action_mode" = "refresh" ]; then
  run_cmd bootstrap_cmd "$bootstrap_cmd"
  run_cmd pull_model_cmd "$pull_model_cmd"
fi

if [ "$action_mode" = "deploy" ] || [ "$action_mode" = "refresh" ]; then
  if [ -z "$deploy_cmd" ]; then
    echo "::error::缺少 ZY_RUNTIME_GPU_PROD_CORE_001_DEPLOY_CMD"
    exit 1
  fi
  run_cmd deploy_cmd "$deploy_cmd"
fi

if [ "$action_mode" = "refresh" ]; then
  run_cmd backup_cmd "$backup_cmd"
fi

summary "### done"
summary "- workdir: ${workdir}"
