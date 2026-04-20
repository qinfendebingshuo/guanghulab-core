#!/usr/bin/env bash
set -euo pipefail
echo '=== PS APT/DPKG ==='
ps -eo pid,ppid,etime,cmd | grep -E 'apt|dpkg|unattended' | grep -v grep || true
echo '=== LOCK HOLDERS ==='
fuser -v /var/lib/dpkg/lock /var/lib/dpkg/lock-frontend /var/cache/apt/archives/lock || true
echo '=== SYSTEMD ==='
systemctl --no-pager --full status apt-daily.service apt-daily-upgrade.service unattended-upgrades.service 2>/dev/null || true
