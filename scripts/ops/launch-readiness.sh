#!/bin/sh
set -eu

usage() {
  printf 'Usage: scripts/ops/launch-readiness.sh [--target-architecture|--target-arch <arch>] [--record <file>] [--with-drills] [readiness.json]\n'
}

fail() {
  printf 'Error: %s\n' "$1" >&2
  usage >&2
  exit 1
}

READINESS_FILE="infra/launch/readiness.example.json"
CUSTOM_FILE_SPECIFIED=0
WITH_DRILLS=0
TARGET_ARCHITECTURE=""
ARCH_SPECIFIED=0

while [ $# -gt 0 ]; do
  case "$1" in
    --with-drills)
      WITH_DRILLS=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    --target-architecture=*|--target-arch=*)
      if [ "$ARCH_SPECIFIED" -eq 1 ]; then
        fail "Repeated --target-architecture option"
      fi
      RAW_ARCH="${1#*=}"
      TRIMMED_ARCH="$(printf '%s' "$RAW_ARCH" | tr -d '[:space:]')"
      if [ -z "$RAW_ARCH" ] || [ -z "$TRIMMED_ARCH" ]; then
        fail "--target-architecture requires an architecture argument"
      fi
      if [ "$RAW_ARCH" != "single-host-compose-caddy" ] && [ "$RAW_ARCH" != "vercel-managed-production" ]; then
        fail "Invalid target architecture \"$RAW_ARCH\"; expected \"single-host-compose-caddy\" or \"vercel-managed-production\""
      fi
      TARGET_ARCHITECTURE="$RAW_ARCH"
      ARCH_SPECIFIED=1
      shift
      ;;
    --target-architecture|--target-arch)
      if [ "$ARCH_SPECIFIED" -eq 1 ]; then
        fail "Repeated --target-architecture option"
      fi
      if [ $# -lt 2 ]; then
        fail "--target-architecture requires an architecture argument"
      fi
      RAW_ARCH="$2"
      case "$RAW_ARCH" in
        -*)
          fail "--target-architecture requires an architecture argument"
          ;;
      esac
      TRIMMED_ARCH="$(printf '%s' "$RAW_ARCH" | tr -d '[:space:]')"
      if [ -z "$RAW_ARCH" ] || [ -z "$TRIMMED_ARCH" ]; then
        fail "--target-architecture requires an architecture argument"
      fi
      if [ "$RAW_ARCH" != "single-host-compose-caddy" ] && [ "$RAW_ARCH" != "vercel-managed-production" ]; then
        fail "Invalid target architecture \"$RAW_ARCH\"; expected \"single-host-compose-caddy\" or \"vercel-managed-production\""
      fi
      TARGET_ARCHITECTURE="$RAW_ARCH"
      ARCH_SPECIFIED=1
      shift 2
      ;;
    --record=*)
      if [ "$CUSTOM_FILE_SPECIFIED" -eq 1 ]; then
        fail "Too many arguments; expected single readiness JSON path"
      fi
      RAW_FILE="${1#--record=}"
      TRIMMED_FILE="$(printf '%s' "$RAW_FILE" | tr -d '[:space:]')"
      if [ -z "$RAW_FILE" ] || [ -z "$TRIMMED_FILE" ]; then
        fail "--record requires a non-empty file path"
      fi
      READINESS_FILE="$RAW_FILE"
      CUSTOM_FILE_SPECIFIED=1
      shift
      ;;
    --record)
      if [ "$CUSTOM_FILE_SPECIFIED" -eq 1 ]; then
        fail "Too many arguments; expected single readiness JSON path"
      fi
      if [ $# -lt 2 ]; then
        fail "--record requires a non-empty file path"
      fi
      RAW_FILE="$2"
      case "$RAW_FILE" in
        -*)
          fail "--record requires a non-empty file path"
          ;;
      esac
      TRIMMED_FILE="$(printf '%s' "$RAW_FILE" | tr -d '[:space:]')"
      if [ -z "$RAW_FILE" ] || [ -z "$TRIMMED_FILE" ]; then
        fail "--record requires a non-empty file path"
      fi
      READINESS_FILE="$RAW_FILE"
      CUSTOM_FILE_SPECIFIED=1
      shift 2
      ;;
    -*)
      printf 'Error: Unknown option "%s"\n' "$1" >&2
      usage >&2
      exit 1
      ;;
    *)
      if [ "$CUSTOM_FILE_SPECIFIED" -eq 1 ]; then
        fail "Too many arguments; expected single readiness JSON path"
      fi
      TRIMMED_FILE="$(printf '%s' "$1" | tr -d '[:space:]')"
      if [ -z "$1" ] || [ -z "$TRIMMED_FILE" ]; then
        fail "Readiness record path cannot be empty"
      fi
      READINESS_FILE="$1"
      CUSTOM_FILE_SPECIFIED=1
      shift
      ;;
  esac
done

# Architecture auto-detection if not explicitly passed
if [ "$ARCH_SPECIFIED" -eq 0 ]; then
  if [ -f "$READINESS_FILE" ]; then
    DETECTED_ARCH="$(node -e '
      try {
        const data = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
        if (data && typeof data.target_architecture === "string") {
          process.stdout.write(data.target_architecture);
        }
      } catch {}
    ' "$READINESS_FILE" 2>/dev/null || true)"
    if [ "$DETECTED_ARCH" = "vercel-managed-production" ] || [ "$DETECTED_ARCH" = "single-host-compose-caddy" ]; then
      TARGET_ARCHITECTURE="$DETECTED_ARCH"
    else
      TARGET_ARCHITECTURE="single-host-compose-caddy"
    fi
  else
    TARGET_ARCHITECTURE="single-host-compose-caddy"
  fi
fi

if [ "$TARGET_ARCHITECTURE" = "vercel-managed-production" ]; then
  node scripts/vercel/check-vercel-config.js
  scripts/ops/scan-secrets.sh
  node --test scripts/ops/check-launch-readiness.spec.js

  if [ "$WITH_DRILLS" -eq 1 ]; then
    scripts/ops/run-launch-drills.sh --dry-run --target-architecture vercel-managed-production || {
      printf 'launch-readiness: unified drills failed; see the dossier at backups/launch-evidence-dossier-*.json\n' >&2
      exit 1
    }
  fi

  node scripts/ops/check-launch-readiness.js "$READINESS_FILE"
else
  scripts/ops/check-production-templates.sh
  scripts/ops/scan-secrets.sh
  scripts/ops/check-docker-runtime.sh
  node --test scripts/ops/check-launch-readiness.spec.js

  if [ "$WITH_DRILLS" -eq 1 ]; then
    scripts/ops/run-launch-drills.sh --dry-run || {
      printf 'launch-readiness: unified drills failed; see the dossier at backups/launch-evidence-dossier-*.json\n' >&2
      exit 1
    }
  fi

  node scripts/ops/check-launch-readiness.js "$READINESS_FILE"
fi
