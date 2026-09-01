#!/usr/bin/env bash
set -Eeuo pipefail

cat >&2 <<'MESSAGE'
[setup-ssl] This legacy script is intentionally retired.

It previously installed acme.sh, stopped/started a global Nginx instance and
overwrote a fixed site file. Those operations can affect unrelated projects and
cannot be made part of an application release rollback.

Issue/renew certificates and install Nginx configuration as a separate host
maintenance transaction: discover exact binaries, verify versions, back up the
existing certificate and site configuration, run nginx -t, then reload the
already-owned unit explicitly. Use docs/nginx-site.conf.template and keep its
upstream host/port equal to DEPLOY_WEB_HOST/DEPLOY_WEB_PORT.
MESSAGE
exit 2
