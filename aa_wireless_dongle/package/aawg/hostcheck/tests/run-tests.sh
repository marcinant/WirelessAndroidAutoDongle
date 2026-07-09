#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Build and run the host-side unit tests for aawg.
#
# These compile against the permissive stub headers (hostcheck/stubs) so they
# run on a plain dev PC with no dbus-cxx / protobuf / Bluetooth. They validate
# pure logic (message framing, handshake ordering), NOT D-Bus/protobuf/USB
# semantics — those still require the real hardware.
#
# Usage:  hostcheck/tests/run-tests.sh
# Exit:   non-zero if any test fails to build or fails at runtime.
# ---------------------------------------------------------------------------
set -u

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$(cd "$HERE/../../src" && pwd)"
STUBS="$(cd "$HERE/../stubs" && pwd)"

CXX="${CXX:-g++}"
STD="${STD:-c++17}"
INCLUDES=(-I "$STUBS" -I "$SRC")

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

fail=0
shopt -s nullglob
for test_src in "$HERE"/*_test.cpp; do
    name="$(basename "$test_src" .cpp)"
    bin="$TMP/$name"
    printf 'Building %s ... ' "$name"
    if ! "$CXX" -std="$STD" -Wall -Wextra -pthread "${INCLUDES[@]}" "$test_src" -o "$bin" 2> >(sed 's/^/    /' >&2); then
        echo "BUILD FAILED"
        fail=1
        continue
    fi
    echo "ok"
    if ! "$bin"; then
        echo "  -> $name FAILED"
        fail=1
    fi
    echo ""
done

if [ "$fail" -ne 0 ]; then
    echo "TESTS FAILED"
else
    echo "TESTS PASSED"
fi
exit "$fail"
