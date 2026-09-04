#!/usr/bin/env bash
# Chromium 실행에 필요한 시스템 라이브러리를 root 없이 준비한다.
#
# 원래는 `sudo npx playwright install-deps chromium` 한 줄이면 되지만, root를 쓸 수
# 없는 환경(권한 없는 컨테이너 등)을 위해 같은 .deb들을 사용자 디렉터리에 풀어두고
# LD_LIBRARY_PATH로 물린다. root 권한이 있다면 이 스크립트 대신 install-deps를 쓰는
# 편이 낫다.
#
#   bash scripts/setup-browser-sysroot.sh
#
# 결과: ~/.local/share/chromium-sysroot/root 아래에 라이브러리와 폰트가 놓이고,
# scripts/browser.mjs가 이 디렉터리를 자동으로 찾아 브라우저에 넘긴다.
set -euo pipefail

SYSROOT="${CHROMIUM_SYSROOT:-$HOME/.local/share/chromium-sysroot}"
DEBS="$SYSROOT/debs"
ROOT="$SYSROOT/root"

mkdir -p "$DEBS" "$ROOT"

echo "1/3 필요한 패키지 목록 확인"
mapfile -t PKGS < <(npx playwright install-deps --dry-run chromium 2>/dev/null \
  | sed -n '2,$p' | sed 's/^ *//' | grep -E '^[a-z0-9]')

if [ "${#PKGS[@]}" -eq 0 ]; then
  echo "  빠진 패키지가 없습니다. 준비 완료."
  exit 0
fi
echo "  ${#PKGS[@]}개 필요"

echo "2/3 .deb 내려받기 (root 불필요)"
(cd "$DEBS" && apt-get download "${PKGS[@]}")

echo "3/3 압축 풀기 -> $ROOT"
for deb in "$DEBS"/*.deb; do
  dpkg-deb -x "$deb" "$ROOT"
done

# fontconfig 설정은 /usr/share/fonts 같은 절대 경로를 가리키므로, 풀어놓은
# 위치를 보도록 최소한의 설정 파일로 덮어쓴다. 이게 없으면 헤드리스 렌더링에서
# 글자가 통째로 빠진다.
mkdir -p "$ROOT/etc/fonts"
cat > "$ROOT/etc/fonts/fonts.conf" <<CONF
<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">
<fontconfig>
  <dir>$ROOT/usr/share/fonts</dir>
  <cachedir>$SYSROOT/fontcache</cachedir>
  <match target="pattern">
    <edit name="family" mode="prepend"><string>DejaVu Sans</string></edit>
  </match>
</fontconfig>
CONF
mkdir -p "$SYSROOT/fontcache"

echo
echo "완료. 'npm run browser'로 확인하세요."
