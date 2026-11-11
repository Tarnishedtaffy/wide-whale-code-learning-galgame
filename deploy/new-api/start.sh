#!/usr/bin/env bash
# 一键启动 new-api + Caddy
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v docker >/dev/null 2>&1; then
  echo "未检测到 docker，请先安装 Docker Engine 与 compose 插件。" >&2
  exit 1
fi

if [ ! -f .env ]; then
  cp .env.example .env
  echo "已生成 .env，请先填写域名、令牌、SITE_USER / SITE_PASSWORD_HASH 和 SESSION_SECRET 再运行。" >&2
  exit 1
fi

set -a; . ./.env; set +a
for k in DOMAIN ALLOW_ORIGIN ACME_EMAIL SESSION_SECRET SITE_USER SITE_PASSWORD_HASH NEWAPI_TOKEN; do
  if [ -z "${!k:-}" ]; then
    echo ".env 缺少 $k，请填写后重试。" >&2
    if [ "$k" = "NEWAPI_TOKEN" ]; then
      echo "  首次部署：先执行 docker compose up -d new-api，再建 SSH 隧道进面板创建令牌，" >&2
      echo "  把 sk- 填进 .env 的 NEWAPI_TOKEN，然后重新运行本脚本。" >&2
    fi
    if [ "$k" = "SITE_PASSWORD_HASH" ]; then
      echo "  运行 docker run --rm -it caddy:2-alpine caddy hash-password，结果用单引号写入 .env。" >&2
    fi
    exit 1
  fi
done

mkdir -p data site

# 把学习应用同步到 Caddy 静态目录，保证页面与 /v1 同域，前端不用配任何地址
APP_SRC="../../study-loop"
if [ -f "$APP_SRC/index.html" ]; then
  echo "==> 同步静态站点到 ./site"
  if ! grep -q 'mode: "local",' "$APP_SRC/index.html"; then
    echo "未找到 AI 模式配置，停止部署。" >&2
    exit 1
  fi
  sed 's/mode: "local",/mode: "proxy",/' "$APP_SRC/index.html" > site/index.html
  if [ -d "$APP_SRC/bgm" ]; then
    cp -rf "$APP_SRC/bgm" site/
  fi
else
  echo "未找到 $APP_SRC/index.html，停止部署。" >&2
  exit 1
fi

echo "==> 拉取镜像"
docker compose pull

echo "==> 校验 Caddy 配置"
docker compose run --rm --no-deps caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile

echo "==> 启动"
docker compose up -d

echo "==> 等待 new-api 就绪"
for i in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3000/api/status >/dev/null 2>&1; then
    echo "new-api 已就绪：http://127.0.0.1:3000"
    break
  fi
  sleep 2
  [ "$i" = "30" ] && { echo "启动超时，查看日志：docker compose logs --tail=50 new-api"; exit 1; }
done

echo
echo "下一步："
echo "  1) 本机建隧道：ssh -L 3000:127.0.0.1:3000 user@这台服务器"
echo "  2) 浏览器打开：http://127.0.0.1:3000  首次登录后立刻改强密码（不要使用默认口令）"
echo "  3) 确认专用令牌只允许 mnk-chat 且已设置有限额度"
echo "  4) 浏览器打开 https://${DOMAIN}，使用 SITE_USER 与站点密码登录"
echo "  5) 运行 bash smoke.sh 验证匿名访问被拒绝、登录后模型可用"
