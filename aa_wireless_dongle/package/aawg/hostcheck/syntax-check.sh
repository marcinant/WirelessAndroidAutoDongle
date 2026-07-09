#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Host-side syntax check for the aawg C++ sources.
#
# Runs `g++ -fsyntax-only` against every src/*.cpp using PERMISSIVE STUB
# headers for dbus-cxx and protobuf (hostcheck/stubs/). This does NOT build a
# working binary and does NOT validate D-Bus/protobuf semantics — it only
# catches C++ syntax / type / template errors locally, without the Buildroot
# cross-toolchain. The real build still happens via the Buildroot package.
#
# Usage:  hostcheck/syntax-check.sh
# Exit:   non-zero if any translation unit fails to parse.
# ---------------------------------------------------------------------------
set -u

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$(cd "$HERE/../src" && pwd)"
STUBS="$HERE/stubs"

CXX="${CXX:-g++}"
STD="${STD:-c++17}"

# Stub dirs take precedence so <dbus-cxx.h>, <google/protobuf/...>, and
# "proto/*.pb.h" resolve to the stubs. Real src dir is on the path for the
# project's own quote-includes.
INCLUDES=(-I "$STUBS" -I "$SRC")

fail=0
shopt -s nullglob
for f in "$SRC"/*.cpp; do
    name="$(basename "$f")"
    if "$CXX" -std="$STD" -Wall -Wextra -pthread -fsyntax-only "${INCLUDES[@]}" "$f" 2> >(sed 's/^/    /' >&2); then
        echo "OK    $name"
    else
        echo "FAIL  $name"
        fail=1
    fi
done

if [ "$fail" -ne 0 ]; then
    echo ""
    echo "Syntax check FAILED. Note: errors originating inside stub headers are"
    echo "host-check artifacts, not real bugs — cross-check against the Buildroot build."
fi
exit "$fail"
