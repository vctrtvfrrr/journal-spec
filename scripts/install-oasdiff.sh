#!/usr/bin/env sh
set -eu

version=1.36.0
bin_dir="$(dirname "$0")/../bin"

if [ -x "$bin_dir/oasdiff" ] && "$bin_dir/oasdiff" --version | grep -q "$version"; then
  exit 0
fi

case "$(uname -s)-$(uname -m)" in
  Linux-x86_64) platform=linux_amd64 ;;
  Linux-aarch64 | Linux-arm64) platform=linux_arm64 ;;
  *) echo "Unsupported platform: $(uname -s)-$(uname -m)" >&2; exit 1 ;;
esac

archive="oasdiff_${version}_${platform}.tar.gz"
base_url="https://github.com/oasdiff/oasdiff/releases/download/v${version}"
work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT

curl -fsSL -o "$work_dir/$archive" "$base_url/$archive"
curl -fsSL -o "$work_dir/checksums.txt" "$base_url/checksums.txt"
(cd "$work_dir" && grep " $archive\$" checksums.txt | sha256sum -c - >/dev/null)

mkdir -p "$bin_dir"
tar -xzf "$work_dir/$archive" -C "$work_dir" oasdiff
mv "$work_dir/oasdiff" "$bin_dir/oasdiff"
