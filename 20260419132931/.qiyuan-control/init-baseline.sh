#!/usr/bin/env bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

wait_for_apt() {
  for i in $(seq 1 120); do
    if fuser /var/lib/dpkg/lock >/dev/null 2>&1 || \
       fuser /var/lib/dpkg/lock-frontend >/dev/null 2>&1 || \
       fuser /var/cache/apt/archives/lock >/dev/null 2>&1 || \
       pgrep -x apt >/dev/null 2>&1 || \
       pgrep -x apt-get >/dev/null 2>&1 || \
       pgrep -x dpkg >/dev/null 2>&1; then
      echo "Waiting for apt/dpkg lock release... attempt ${i}" >&2
      sleep 10
    else
      return 0
    fi
  done
  echo "Timed out waiting for apt/dpkg lock release" >&2
  return 1
}

wait_for_apt
apt-get update
wait_for_apt
apt-get -y upgrade
wait_for_apt
apt-get install -y nginx docker.io ufw certbot python3-certbot-nginx curl git jq

systemctl enable --now nginx
systemctl enable --now docker
usermod -aG docker ubuntu || true

cp /etc/ssh/sshd_config /etc/ssh/sshd_config.bak.$(date +%Y%m%d%H%M%S)
sed -ri 's/^#?PasswordAuthentication\s+.*/PasswordAuthentication no/' /etc/ssh/sshd_config || true
sed -ri 's/^#?PermitRootLogin\s+.*/PermitRootLogin no/' /etc/ssh/sshd_config || true
sed -ri 's/^#?PubkeyAuthentication\s+.*/PubkeyAuthentication yes/' /etc/ssh/sshd_config || true
grep -q '^PasswordAuthentication' /etc/ssh/sshd_config || echo 'PasswordAuthentication no' >> /etc/ssh/sshd_config
grep -q '^PermitRootLogin' /etc/ssh/sshd_config || echo 'PermitRootLogin no' >> /etc/ssh/sshd_config
grep -q '^PubkeyAuthentication' /etc/ssh/sshd_config || echo 'PubkeyAuthentication yes' >> /etc/ssh/sshd_config
systemctl reload ssh || systemctl reload sshd || true

ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo '=== INVENTORY:PACKAGES ==='
dpkg-query -W -f='${Package} ${Version}\n' nginx docker.io ufw certbot python3-certbot-nginx curl git jq 2>/dev/null || true
echo '=== INVENTORY:SERVICES_ENABLED ==='
systemctl is-enabled nginx docker ssh || true
echo '=== INVENTORY:SERVICES_ACTIVE ==='
systemctl is-active nginx docker ssh || true
echo '=== INVENTORY:UFW ==='
ufw status verbose || true
echo '=== INVENTORY:DOCKER ==='
docker --version || true
echo '=== INVENTORY:NGINX ==='
nginx -v 2>&1 || true
