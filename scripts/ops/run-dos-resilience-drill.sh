#!/usr/bin/env bash
set -euo pipefail
# Offline repository assertions, or a separately authorized bounded login exercise.
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"
DRY_RUN=0
EVIDENCE_DIR=backups
EVIDENCE_FILE=""
API_URL="${API_URL-http://localhost:3001}"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --evidence-dir|--evidence-file|--api-url)
      [ "$#" -ge 2 ] && [ -n "$2" ] && [[ "$2" != -* ]] || {
        printf 'Error: %s requires a non-empty value\n' "$1" >&2; exit 1;
      }
      case "$1" in
        --evidence-dir) EVIDENCE_DIR="$2" ;;
        --evidence-file) EVIDENCE_FILE="$2" ;;
        --api-url) API_URL="$2" ;;
      esac
      shift 2 ;;
    --help|-h)
      cat <<'HELP'
Usage: scripts/ops/run-dos-resilience-drill.sh [options]
  --dry-run                 Offline repository checks; zero network requests
  --evidence-dir <dir>      Evidence directory (default: backups)
  --evidence-file <file>    Exact JSON destination
  --api-url <origin>        HTTP(S) API origin (default: http://localhost:3001)
  --help, -h                Show help
Without --dry-run this performs a live exercise requiring separate operator authorization.
HELP
      exit 0 ;;
    *) echo 'Error: Unknown option' >&2; exit 1 ;;
  esac
done
API_URL="$(node - "$API_URL" <<'NODE'
const {safeUrl} = require('./scripts/ops/launch-target-evidence');
try {
  const url = new URL(safeUrl(process.argv[2]));
  if (url.pathname !== '/' || /[?#]/.test(process.argv[2])) throw Error();
  process.stdout.write(url.origin);
} catch { console.error('Error: API URL must be a safe HTTP(S) origin'); process.exit(1); }
NODE
)"
START_TIME_MS="$(node -e 'process.stdout.write(String(Date.now()))')"
umask 077
PRIVATE_DIR="$(mktemp -d)"
PUBLISH_TMP=""
cleanup() {
  rm -rf -- "$PRIVATE_DIR"
  if [ -n "$PUBLISH_TMP" ]; then rm -f -- "$PUBLISH_TMP"; fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP
if [ -z "$EVIDENCE_FILE" ]; then
  EVIDENCE_FILE="${EVIDENCE_DIR}/dos-resilience-evidence-$(node -e 'process.stdout.write(require("node:crypto").randomUUID())').json"
fi
mkdir -p -- "$(dirname "$EVIDENCE_FILE")"
# Invalidate any previous receipt before work; interrupted runs cannot reuse success.
rm -f -- "$EVIDENCE_FILE"
FAILURES=()
fail() { FAILURES+=("$1"); printf 'Failed: %s\n' "$1" >&2; }
STATIC_JSON="$(node <<'NODE'
const fs = require('node:fs');
const has = (file, patterns) => {
  try { const text = fs.readFileSync(file, 'utf8'); return patterns.every(p => p.test(text)); }
  catch { return false; }
};
const env = 'server/src/config/env.validation.ts';
const layers = {
  layer1_edge_ingress: {passed: has('infra/caddy/Caddyfile.example', [
    /max_size.*ACRES_MAX_REQUEST_BODY/, /read_timeout.*ACRES_API_READ_TIMEOUT/,
    /write_timeout.*ACRES_API_WRITE_TIMEOUT/, /dial_timeout.*ACRES_API_DIAL_TIMEOUT/])},
  layer2_in_process_throttling: {passed:
    has(env, [/RATE_LIMIT_DEFAULT_LIMIT/, /RATE_LIMIT_STRICT_LIMIT/]) &&
    has('server/src/security/security.module.ts', [/AcresThrottlerGuard/]) &&
    ['auth/auth', 'forms/forms'].every(p => has(`server/src/${p}.controller.ts`, [/@StrictThrottle\(\)/])) &&
    ['health/health', 'metrics/metrics'].every(p => has(`server/src/${p}.controller.ts`, [/@SkipThrottle\(\)/])) &&
    has('server/src/common/api-exception.filter.ts', [/TOO_MANY_REQUESTS.*'RATE_LIMITED'/])},
  layer3_graphql_bounds: {passed:
    has('server/src/app.setup.ts', [/express.json.*graphqlMaxBytes/]) &&
    has('server/src/graphql/graphql-limits.ts', [/graphqlMaxDepth/, /graphqlMaxAliases/,
      /graphqlMaxCost/, /graphqlMaxNodes/, /operationCount !== 1/])},
  layer4_storage_bounds: {passed: has(env, [/UPLOAD_MAX_BYTES/, /52428800/, /CLAMAV_HOST/, /STORAGE_BUCKET.*quarantine/])},
  layer5_anti_enumeration: {passed: has('server/src/auth/auth.service.ts', [/dummy-password-check/])},
};
process.stdout.write(JSON.stringify(layers));
NODE
)"
if ! node -e 'process.exit(Object.values(JSON.parse(process.argv[1])).every(l=>l.passed===true)?0:1)' "$STATIC_JSON"; then
  fail 'Repository protection assertions failed'
fi
MODE=simulated
BURST_MODE=skipped
BURST_PASSED=null
ATTEMPTED=0
THROTTLED=0
AUTH_REJECTED=0
UNEXPECTED=0
TRANSPORT=0
PRE=false
CSRF=false
POST=false
# All curl calls ignore ambient .curlrc, have bounded time/body, and never follow redirects.
request() {
  if ! STATUS="$(curl -q --silent --connect-timeout 2 --max-time 5 --max-filesize 65536 \
      --output "$PRIVATE_DIR/body" --write-out '%{http_code}' "$@" 2>/dev/null)"; then
    return 1
  fi
  [[ "$STATUS" =~ ^[1-5][0-9][0-9]$ ]]
}
health() {
  request "$API_URL/health" && [ "$STATUS" = 200 ] && node - "$PRIVATE_DIR/body" <<'NODE'
const {readBoundedJson} = require('./scripts/ops/launch-target-evidence');
try {
  const b=readBoundedJson(process.argv[2]);
  process.exit(b.ok===true && !Object.hasOwn(b,'error') && b.data?.status==='ok' && b.data?.service==='acres-api' &&
    Number.isFinite(b.data?.uptimeSeconds) && b.data.uptimeSeconds>=0 ? 0 : 1);
} catch { process.exit(1); }
NODE
}
if [ "$DRY_RUN" -eq 1 ]; then
  echo 'Offline repository checks. Live rate limiting was not exercised.'
else
  MODE=live
  BURST_MODE=live
  BURST_PASSED=false
  if [ "${#FAILURES[@]}" -eq 0 ]; then
    if health; then PRE=true; else fail 'Pre-burst Acres health probe failed'; fi
  fi
  if [ "$PRE" = true ]; then
    if request --cookie-jar "$PRIVATE_DIR/cookies" --cookie "$PRIVATE_DIR/cookies" "$API_URL/api/v1/auth/csrf" &&
       [ "$STATUS" = 200 ] && node - "$PRIVATE_DIR/body" "$PRIVATE_DIR/headers" "$PRIVATE_DIR/cookies" "$API_URL" <<'NODE'
const fs=require('node:fs');
const {readBoundedJson}=require('./scripts/ops/launch-target-evidence');
try {
  const b=readBoundedJson(process.argv[2]);
  const token=b.data?.csrfToken;
  if(b.ok!==true || Object.hasOwn(b,'error') || b.data?.headerName!=='x-csrf-token' || typeof token!=='string' ||
      token.length===0 || token.length>8192 || /[\x00-\x20\x7f]/.test(token)) throw Error();
  const host=new URL(process.argv[5]).hostname;
  const cookies=fs.readFileSync(process.argv[4],'utf8').split('\n');
  if(!cookies.some(line => {
    const c=line.replace(/^#HttpOnly_/, '').split('\t');
    return c.length===7 && c[0]===host && c[2]==='/' && c[5] && c[6];
  })) throw Error();
  fs.writeFileSync(process.argv[3], `Content-Type: application/json\nx-csrf-token: ${token}\n`, {mode:0o600});
} catch { process.exit(1); }
NODE
    then CSRF=true; else fail 'CSRF handshake failed'; fi
  fi
  if [ "$CSRF" = true ]; then
    for ((i=0; i<15; i++)); do
      ATTEMPTED=$((ATTEMPTED+1))
      if ! request --cookie "$PRIVATE_DIR/cookies" --cookie-jar "$PRIVATE_DIR/cookies" \
          --header "@$PRIVATE_DIR/headers" --request POST \
          --data '{"email":"probe@acres.local","password":"bad-password"}' "$API_URL/api/v1/auth/login"; then
        TRANSPORT=$((TRANSPORT+1)); fail 'Login transport or status failure'; break
      fi
      if CODE="$(node - "$PRIVATE_DIR/body" "$STATUS" <<'NODE'
const {readBoundedJson}=require('./scripts/ops/launch-target-evidence');
try {
  const b=readBoundedJson(process.argv[2]);
  const expected=process.argv[3]==='401'?'INVALID_CREDENTIALS':process.argv[3]==='429'?'RATE_LIMITED':null;
  if(!expected || b.ok!==false || Object.hasOwn(b,'data') || b.error?.code!==expected || typeof b.error?.message!=='string' || !b.error.message) throw Error();
  process.stdout.write(expected);
} catch { process.exit(1); }
NODE
)"; then
        if [ "$CODE" = RATE_LIMITED ]; then THROTTLED=$((THROTTLED+1)); else AUTH_REJECTED=$((AUTH_REJECTED+1)); fi
      else
        UNEXPECTED=$((UNEXPECTED+1)); fail 'Unexpected login response'; break
      fi
    done
    # Stop on unexpected traffic; do not issue further requests to a suspect target.
    if [ "${#FAILURES[@]}" -eq 0 ]; then
      if health; then POST=true; else fail 'Post-burst Acres health probe failed'; fi
      if [ "$THROTTLED" -eq 0 ]; then fail 'No validated throttle within 15 requests'; fi
    fi
  fi
  if [ "${#FAILURES[@]}" -eq 0 ]; then BURST_PASSED=true; fi
fi
FAILURES_JSON="$(node -e 'process.stdout.write(JSON.stringify(process.argv.slice(1)))' "${FAILURES[@]}")"
PUBLISH_TMP="$(mktemp "$(dirname "$EVIDENCE_FILE")/.dos-evidence.XXXXXXXX")"
if ! node - "$PUBLISH_TMP" "$START_TIME_MS" "$MODE" "$API_URL" "$STATIC_JSON" \
    "$BURST_MODE" "$BURST_PASSED" "$ATTEMPTED" "$THROTTLED" "$AUTH_REJECTED" \
    "$UNEXPECTED" "$TRANSPORT" "$PRE" "$CSRF" "$POST" "$FAILURES_JSON" <<'NODE'
const fs=require('node:fs');
const {targetId}=require('./scripts/ops/launch-target-evidence');
const [file,start,mode,origin,staticRaw,burstTestMode,passed,attempted,throttled,auth,unexpected,transport,pre,csrf,post,failuresRaw]=process.argv.slice(2);
const failures=JSON.parse(failuresRaw);
const evidence={timestamp:new Date().toISOString(),durationMs:Date.now()-Number(start),
  drill_type:'dos_resilience_drill',status:failures.length?'failed':'success',mode,
  apiTargetId:mode==='live'?targetId(origin):null,
  layers:{...JSON.parse(staticRaw),layer6_rate_limiter_burst:{
    burstTestMode,passed:JSON.parse(passed),attemptedRequests:Number(attempted),
    throttledRequests:Number(throttled),authRejectedRequests:Number(auth),
    unexpectedResponses:Number(unexpected),transportFailures:Number(transport),
    preHealthPassed:pre==='true',csrfHandshakePassed:csrf==='true',postHealthPassed:post==='true',
  }},failures};
try { fs.writeFileSync(file,JSON.stringify(evidence,null,2)); }
catch { console.error('Evidence publication failed'); process.exit(1); }
NODE
then echo 'Evidence publication failed' >&2; exit 1; fi
mv -f -- "$PUBLISH_TMP" "$EVIDENCE_FILE"
PUBLISH_TMP=""
if [ "${#FAILURES[@]}" -gt 0 ]; then exit 1; fi
if [ "$DRY_RUN" -eq 0 ]; then echo 'Passed: repository assertions and bounded login throttle/health observation'; fi
