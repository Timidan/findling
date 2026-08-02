#!/usr/bin/env bash
set -Eeuo pipefail

# Validate an already-staged destination stack. This script never starts,
# restarts, stops, or removes a production container.

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
COMPOSE_PROJECT_DIR="${COMPOSE_PROJECT_DIR:-$ROOT_DIR}"
COMPOSE_FILE="${COMPOSE_FILE:-$COMPOSE_PROJECT_DIR/compose.yaml}"
FINDLING_ENV_FILE="${FINDLING_ENV_FILE:-$ROOT_DIR/findling.env}"
FINDLING_IMAGE_REF="${FINDLING_IMAGE_REF:-}"
PUBLIC_ENDPOINT="${PUBLIC_ENDPOINT:-}"

# Compose uses FINDLING_ENV_FILE for `${FINDLING_ENV_FILE:-./findling.env}`
# interpolation in compose.yaml. Export it before any child process starts;
# `--env-file` alone does not make a variable available to interpolation.
export FINDLING_ENV_FILE

failures=0
warnings=0

pass() { printf 'PASS %s\n' "$*"; }
warn() { warnings=$((warnings + 1)); printf 'WARN %s\n' "$*" >&2; }
fail() { failures=$((failures + 1)); printf 'FAIL %s\n' "$*" >&2; }

require_command() {
	local command_name="$1"
	if command -v "$command_name" >/dev/null 2>&1; then
		pass "host command available: $command_name"
	else
		fail "host command missing: $command_name"
	fi
}

require_command docker
require_command curl

image_ref_kind=""

classify_image_ref() {
	local candidate="$1"
	if [[ "$candidate" =~ ^[a-z0-9][a-z0-9._:/-]*@sha256:[0-9a-f]{64}$ ]]; then
		printf 'registry'
	elif [[ "$candidate" =~ ^sha256:[0-9a-f]{64}$ ]]; then
		printf 'local'
	else
		printf 'invalid'
	fi
}

if [[ ! -f "$FINDLING_ENV_FILE" ]]; then
	fail "FINDLING_ENV_FILE does not exist: $FINDLING_ENV_FILE"
elif [[ ! -f "$COMPOSE_FILE" ]]; then
	fail "Compose file not found: $COMPOSE_FILE"
else
	# Do not print `docker compose config`: it can contain secret values.
	if docker compose --project-directory "$COMPOSE_PROJECT_DIR" --file "$COMPOSE_FILE" --env-file "$FINDLING_ENV_FILE" --profile ops config >/dev/null 2>&1; then
		pass "Compose config renders"
		compose_images="$(docker compose --project-directory "$COMPOSE_PROJECT_DIR" --file "$COMPOSE_FILE" --env-file "$FINDLING_ENV_FILE" --profile ops config --images 2>/dev/null || true)"
		mapfile -t configured_images < <(printf '%s\n' "$compose_images" | sed '/^[[:space:]]*$/d' | sort -u)
		if [[ "${#configured_images[@]}" -ne 1 ]]; then
			fail "Compose did not resolve one unique application image"
		else
			resolved_image_ref="${configured_images[0]}"
			if [[ -n "$FINDLING_IMAGE_REF" && "$FINDLING_IMAGE_REF" != "$resolved_image_ref" ]]; then
				fail "shell FINDLING_IMAGE_REF differs from the Compose-resolved image"
			else
				FINDLING_IMAGE_REF="$resolved_image_ref"
				export FINDLING_IMAGE_REF
				image_ref_kind="$(classify_image_ref "$FINDLING_IMAGE_REF")"
				if [[ "$image_ref_kind" == "invalid" ]]; then
					fail "FINDLING_IMAGE_REF must be an immutable digest reference"
				elif [[ "$image_ref_kind" == "local" ]]; then
					pass "Compose proves local immutable image reference support"
				else
					pass "Compose resolves the configured immutable image reference"
				fi
			fi
		fi
	else
		fail "Compose config failed (secret-bearing output suppressed)"
	fi
fi

compose() {
	docker compose --project-directory "$COMPOSE_PROJECT_DIR" --file "$COMPOSE_FILE" --env-file "$FINDLING_ENV_FILE" "$@"
}

image_id=""
if [[ "$failures" -eq 0 ]]; then
	image_id="$(docker image inspect "$FINDLING_IMAGE_REF" --format '{{.Id}}' 2>/dev/null || true)"
	if [[ -z "$image_id" ]]; then
		fail "immutable image is not present; pull or load it before validation"
	elif [[ "$image_ref_kind" == "local" ]]; then
		if [[ "$image_id" == "$FINDLING_IMAGE_REF" ]]; then
			pass "local image ID matches FINDLING_IMAGE_REF"
		else
			fail "local image ID does not match FINDLING_IMAGE_REF"
		fi
	else
		expected_digest="${FINDLING_IMAGE_REF##*@}"
		repo_digests="$(docker image inspect "$FINDLING_IMAGE_REF" --format '{{range .RepoDigests}}{{println .}}{{end}}' 2>/dev/null || true)"
		if grep -Fq -- "@$expected_digest" <<<"$repo_digests"; then
			pass "local image has the configured repository digest"
		else
			fail "local image repository digest does not match FINDLING_IMAGE_REF"
		fi
	fi
fi

container_id=""
if [[ "$failures" -eq 0 ]]; then
	container_id="$(compose ps -q findling 2>/dev/null || true)"
	if [[ -z "$container_id" ]]; then
		fail "findling service has no staged container"
	else
		state="$(docker inspect --format '{{.State.Status}}' "$container_id" 2>/dev/null || true)"
		if [[ "$state" == "running" ]]; then
			pass "findling container is running"
		else
			fail "findling container is not running"
		fi

		container_image_id="$(docker inspect --format '{{.Image}}' "$container_id" 2>/dev/null || true)"
		if [[ -n "$image_id" && "$container_image_id" == "$image_id" ]]; then
			pass "running findling container matches the immutable image"
		else
			fail "running findling container does not match the immutable image"
		fi

		health_state="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container_id" 2>/dev/null || true)"
		case "$health_state" in
			healthy) pass "findling container healthcheck is healthy" ;;
			unhealthy) fail "findling container healthcheck is unhealthy" ;;
			starting) warn "findling container healthcheck is still starting" ;;
			none) warn "findling container has no Docker healthcheck; HTTP health probe is required" ;;
			*) fail "findling container health state is unavailable" ;;
		esac
	fi
fi

if [[ -n "$container_id" ]]; then
	if compose exec -T findling sh -ceu '
		for binary in node pnpm ffmpeg ffprobe yt-dlp; do
			command -v "$binary" >/dev/null 2>&1 || {
				echo "missing runtime binary: $binary" >&2
				exit 1
			}
		done
	' >/dev/null 2>&1; then
		pass "runtime binaries present: node, pnpm, ffmpeg, ffprobe, yt-dlp"
	else
		fail "one or more runtime binaries are missing (details suppressed)"
	fi

	if compose exec -T findling sh -ceu '
		set -- /var/lib/findling "${CLIP_TMP_DIR:-/var/lib/findling/clip-tmp}" "${FINDLING_TRANSFORMERS_CACHE_DIR:-/var/lib/findling/transformers-cache}"
		for path in "$@"; do
			case "$path" in
				/var/lib/findling|/var/lib/findling/*|/tmp/findling-clips|/tmp/findling-clips/*) ;;
				*) echo "runtime path is outside the approved writable roots" >&2; exit 1 ;;
			esac
			mkdir -p -- "$path"
			test -d "$path" && test -w "$path" || {
				echo "path is not a writable directory" >&2
				exit 1
			}
			probe="$path/.findling-smoke-write.$$"
			(umask 077 && : >"$probe") && rm -f -- "$probe" || exit 1
		done
	' >/dev/null 2>&1; then
		pass "mounted runtime paths are writable"
	else
		fail "one or more mounted runtime paths are not writable (details suppressed)"
	fi
fi

check_health_payload() {
	local source_name="$1" http_code="$2" body="$3" payload_status
	if [[ "$http_code" != "200" ]]; then
		fail "$source_name health endpoint returned HTTP ${http_code:-no response}"
		return
	fi

	# The status field is a fixed, shallow JSON string. Extract only that field
	# so no health details (which may include provider error text) are printed.
	payload_status="$(sed -nE 's/.*"status"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p' <<<"$body" | head -n 1)"
	[[ -n "$payload_status" ]] || payload_status="missing"
	case "$payload_status" in
		ok) pass "$source_name health returned HTTP 200 with status ok" ;;
		degraded) warn "$source_name health returned HTTP 200 but payload status is degraded; inspect checks before cutover" ;;
		error) fail "$source_name health payload status is error" ;;
		*) fail "$source_name health payload is missing a valid status" ;;
	esac
}

check_service_health() {
	local raw http_code body marker="__FINDLING_HTTP_STATUS__"
	# No host port is published by Compose. Probe loopback from the app container
	# instead, keeping the response body in a shell variable without printing it.
	raw="$(compose exec -T findling sh -ceu 'curl -sS --max-time 20 -w "\\n__FINDLING_HTTP_STATUS__%{http_code}" http://127.0.0.1:3000/api/healthz' 2>/dev/null || true)"
	if [[ "$raw" != *$'\n'"$marker"* ]]; then
		fail "staged findling health probe returned no HTTP status"
		return
	fi
	http_code="${raw##*$'\n'$marker}"
	body="${raw%$'\n'$marker*}"
	check_health_payload "staged findling" "$http_code" "$body"
}

check_http_health() {
	local endpoint="$1" body http_code payload_status
	body="$(mktemp)"
	http_code="$(curl -sS --max-time 20 -o "$body" -w '%{http_code}' "${endpoint%/}/api/healthz" || true)"
	if [[ "$http_code" != "200" ]]; then
		fail "public health endpoint returned HTTP ${http_code:-no response}"
		rm -f -- "$body"
		return
	fi

	payload_status="$(cat "$body")"
	rm -f -- "$body"
	check_health_payload "public" "$http_code" "$payload_status"
}

if [[ "$failures" -eq 0 && -n "$container_id" ]]; then
	check_service_health
elif [[ "$failures" -eq 0 ]]; then
	fail "HTTP health probe skipped because the app container is unavailable"
fi

if [[ -n "$PUBLIC_ENDPOINT" ]]; then
	previous_failures="$failures"
	check_http_health "${PUBLIC_ENDPOINT%/}"
	if [[ "$failures" -eq "$previous_failures" ]]; then
		pass "optional public endpoint checked"
	fi
else
	printf 'INFO public endpoint check skipped (set PUBLIC_ENDPOINT=https://findling.timidan.xyz to enable)\n'
fi

if [[ "$failures" -gt 0 ]]; then
	printf 'Smoke test failed: %d failure(s), %d warning(s).\n' "$failures" "$warnings" >&2
	exit 1
fi
printf 'Smoke test passed: %d warning(s).\n' "$warnings"
