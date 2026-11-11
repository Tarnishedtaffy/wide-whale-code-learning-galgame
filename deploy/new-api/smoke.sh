#!/usr/bin/env bash
# 冒烟测试：验证 Caddy 注入令牌后，/v1 接口可用
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -f .env ]; then
  echo ".env 不存在，请先运行 start.sh 并填写配置。" >&2
  exit 1
fi
set -a; . ./.env; set +a

assert_status() {
  local expected="$1"
  shift
  local actual
  actual=$(curl -sS -o /dev/null -w "%{http_code}" "$@")
  if [ "$actual" != "$expected" ]; then
    echo "HTTP 状态不符：期望 $expected，实际 $actual" >&2
    exit 1
  fi
}

echo "== 1. 服务状态 =="
curl -fsS "http://127.0.0.1:3000/api/status"; echo

echo "== 2. 匿名 API 必须 401，管理面板必须 403 =="
assert_status 401 -X POST "https://${DOMAIN}/v1/chat/completions"
assert_status 401 "https://${DOMAIN}/v1/models"
assert_status 403 "https://${DOMAIN}/console"
assert_status 404 "https://${DOMAIN}/v1/unknown"
assert_status 204 -X OPTIONS -H "Origin: ${ALLOW_ORIGIN}" "https://${DOMAIN}/v1/chat/completions"
assert_status 403 -X OPTIONS -H "Origin: https://invalid.example" "https://${DOMAIN}/v1/chat/completions"

read -r -s -p "站点登录密码（不保存）: " SITE_PASSWORD
echo
trap 'unset SITE_PASSWORD' EXIT
echo "== 3. 登录后拉模型列表（不使用模型 key 登录）=="
curl -fsS "https://${DOMAIN}/v1/models" \
  --user "${SITE_USER}:${SITE_PASSWORD}" \
  -H "Origin: ${ALLOW_ORIGIN}"; echo

echo "== 4. 经 Caddy 真实问答 =="
curl -fsS "https://${DOMAIN}/v1/chat/completions" \
  --user "${SITE_USER}:${SITE_PASSWORD}" \
  -H "Content-Type: application/json" \
  -H "Origin: ${ALLOW_ORIGIN}" \
  -d '{"model":"mnk-chat","messages":[{"role":"user","content":"只回答两个字：可以"}],"max_tokens":16}'
echo
