#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
: "${DEPLOY_PROJECT_NAME:?DEPLOY_PROJECT_NAME is required}"
: "${MEDIA_BACKUP_DIR:?MEDIA_BACKUP_DIR must be an absolute backup directory}"
: "${MEDIA_STORAGE_DIR:?MEDIA_STORAGE_DIR must be the absolute media directory}"
: "${AVATAR_DIR:?AVATAR_DIR must be the absolute avatar directory}"

[[ "$MEDIA_BACKUP_DIR" == /* && "$MEDIA_BACKUP_DIR" != "/" ]] || { printf 'MEDIA_BACKUP_DIR must be absolute and non-root\n' >&2; exit 1; }
[[ "$MEDIA_STORAGE_DIR" == /* && "$MEDIA_STORAGE_DIR" != "/" ]] || { printf 'MEDIA_STORAGE_DIR must be absolute and non-root\n' >&2; exit 1; }
[[ "$AVATAR_DIR" == /* && "$AVATAR_DIR" != "/" ]] || { printf 'AVATAR_DIR must be absolute and non-root\n' >&2; exit 1; }
[[ "$DEPLOY_PROJECT_NAME" =~ ^[A-Za-z0-9._-]+$ ]] || { printf 'invalid DEPLOY_PROJECT_NAME\n' >&2; exit 1; }

mkdir -p -- "$MEDIA_BACKUP_DIR"
timestamp="$(date -u +%Y%m%d%H%M%S)"
prefix="$MEDIA_BACKUP_DIR/$DEPLOY_PROJECT_NAME-$timestamp"
manifest_tmp="$prefix-media-manifest.json.tmp"
media_tmp="$prefix-media.tar.gz.tmp"
avatar_tmp="$prefix-avatars.tar.gz.tmp"
checksum_tmp="$prefix-media-SHA256SUMS.txt.tmp"
trap 'rm -f -- "$manifest_tmp" "$media_tmp" "$avatar_tmp" "$checksum_tmp"' EXIT

node "$SCRIPT_DIR/media-manifest.mjs" "$manifest_tmp"
tar -czf "$media_tmp" -C "$MEDIA_STORAGE_DIR" .
tar -czf "$avatar_tmp" -C "$AVATAR_DIR" .
(
  cd -- "$MEDIA_BACKUP_DIR"
  sha256sum "$(basename -- "$media_tmp")" "$(basename -- "$avatar_tmp")" "$(basename -- "$manifest_tmp")"
) >"$checksum_tmp"

mv -- "$manifest_tmp" "$prefix-media-manifest.json"
mv -- "$media_tmp" "$prefix-media.tar.gz"
mv -- "$avatar_tmp" "$prefix-avatars.tar.gz"
sed -i 's/\.tmp//g' "$checksum_tmp"
mv -- "$checksum_tmp" "$prefix-media-SHA256SUMS.txt"
trap - EXIT
printf '[media-backup] created %s media backup set\n' "$prefix"

