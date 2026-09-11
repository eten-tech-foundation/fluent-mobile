#!/usr/bin/env bash
# Shared helpers for Maestro scripts (sourced — do not exec directly).
# shellcheck shell=bash

maestro_java_major() {
  local line major
  line="$(java -version 2>&1 | head -1 || true)"
  # e.g. openjdk version "17.0.12"  or  java version "1.8.0_392"
  if [[ "${line}" =~ version\ \"1\.([0-9]+) ]]; then
    major="${BASH_REMATCH[1]}"
  elif [[ "${line}" =~ version\ \"([0-9]+) ]]; then
    major="${BASH_REMATCH[1]}"
  else
    return 1
  fi
  printf '%s\n' "${major}"
}

# Fail unless java is on PATH and major version >= 17. Prints the version line on success.
maestro_require_java_17() {
  if ! command -v java >/dev/null 2>&1; then
    echo "error: java not found. Install a JDK 17+ and set JAVA_HOME." >&2
    return 1
  fi
  local major
  if ! major="$(maestro_java_major)"; then
    echo "error: could not parse java major version from: $(java -version 2>&1 | head -1)" >&2
    return 1
  fi
  if [[ "${major}" -lt 17 ]]; then
    echo "error: Java ${major} found; Maestro requires JDK 17+." >&2
    return 1
  fi
  java -version 2>&1 | head -3
  return 0
}

# Resolve exactly one online adb device. Echoes the serial; fails if none or many.
# Honors ANDROID_SERIAL when set (must be online).
maestro_resolve_android_serial() {
  if ! command -v adb >/dev/null 2>&1; then
    echo "error: adb not found. Install Android platform-tools." >&2
    return 1
  fi
  adb start-server >/dev/null 2>&1 || true

  local devices
  devices="$(adb devices | awk 'NR>1 && $2=="device" {print $1}')"
  if [[ -z "${devices}" ]]; then
    echo "error: no device/emulator online." >&2
    return 1
  fi

  if [[ -n "${ANDROID_SERIAL:-}" ]]; then
    if printf '%s\n' "${devices}" | grep -Fxq -- "${ANDROID_SERIAL}"; then
      printf '%s\n' "${ANDROID_SERIAL}"
      return 0
    fi
    echo "error: ANDROID_SERIAL=${ANDROID_SERIAL} is not an online device." >&2
    echo "Online: $(echo "${devices}" | tr '\n' ' ')" >&2
    return 1
  fi

  local count
  count="$(printf '%s\n' "${devices}" | grep -c .)"
  if [[ "${count}" -gt 1 ]]; then
    echo "error: multiple Android devices online — set ANDROID_SERIAL to one of:" >&2
    printf '%s\n' "${devices}" | sed 's/^/  /' >&2
    return 1
  fi

  printf '%s\n' "${devices}"
}
