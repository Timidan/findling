# Findling on LuxVPS

This directory is the destination-side operational boundary for Findling. The
Compose stack is expected at `/home/agentops/findling/deploy/luxvps/compose.yaml`
and is invoked with `FINDLING_ENV_FILE=/home/agentops/findling/deploy/luxvps/findling.env`.
The `ops` profile exposes the one-shot `validate`, `reconcile`, and `cleanup`
services; `findling` is the long-running web service. Do not put real values in
`findling.env.example`.

Durable state is **not** the local Docker volume: it is the external Supabase
Postgres/pgvector database plus the Supabase Storage `moments` bucket. The
`/var/lib/findling` volume contains reconstructable caches and working files.
The only optional seed worth retaining there is the transformers model cache;
it may be downloaded again after a rebuild.

## Image handoff

The destination accepts an immutable `FINDLING_IMAGE_REF` only. A mutable tag
(`latest`, a commit tag, or an unqualified repository name) is not a deployment
artifact. The Compose stack has no production build fallback: it must pull or
load the reviewed image before any `validate` or `up` command.

Build the image reproducibly from a recorded source commit on an isolated build
host. This repository does not assume that an existing CI pipeline is available;
if CI is used, record the same provenance and artifact evidence:

```bash
SOURCE_COMMIT="$(git rev-parse HEAD)"
BUILD_TAG="findling:build-${SOURCE_COMMIT}"
NEXT_PUBLIC_APP_URL="${NEXT_PUBLIC_APP_URL:?set the exact public app URL before building}"
NEXT_PUBLIC_SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:?set the exact Supabase URL before building}"
docker build --pull --file Dockerfile \
  --build-arg NEXT_PUBLIC_APP_URL="$NEXT_PUBLIC_APP_URL" \
  --build-arg NEXT_PUBLIC_SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" \
  --tag "$BUILD_TAG" .
SOURCE_IMAGE_ID="$(docker image inspect "$BUILD_TAG" --format '{{.Id}}')"
printf 'source_commit=%s\nlocal_image_id=%s\nNEXT_PUBLIC_APP_URL=%s\nNEXT_PUBLIC_SUPABASE_URL=%s\n' \
  "$SOURCE_COMMIT" "$SOURCE_IMAGE_ID" "$NEXT_PUBLIC_APP_URL" "$NEXT_PUBLIC_SUPABASE_URL" \
  > "findling-image-${SOURCE_COMMIT}.provenance"
```

Set the two `NEXT_PUBLIC_*` variables to the exact public values intended for
this deployment; they are the only build arguments and the same values are
recorded in the provenance file. Do not pass secrets as build arguments or bake
`findling.env` into an image. Retain the source commit, local image ID, exact
public build values, build log, and provenance file with the migration record.

Choose one approved delivery path:

1. **Approved OCI registry (preferred for repeated deployments):** tag and
   push the local image to the approved registry, resolve its immutable
   `RepoDigest`, and set the full reference (repository plus digest):

   ```bash
   REGISTRY_IMAGE="registry.example.invalid/team/findling"
   docker tag "$BUILD_TAG" "$REGISTRY_IMAGE:$SOURCE_COMMIT"
   docker push "$REGISTRY_IMAGE:$SOURCE_COMMIT"
   # Resolve the pushed RepoDigest using the approved registry tooling.
   export FINDLING_IMAGE_REF="${REGISTRY_IMAGE}@sha256:<64 lowercase hex digest>"
   docker pull "$FINDLING_IMAGE_REF"
   docker image inspect "$FINDLING_IMAGE_REF" --format '{{.RepoDigests}}'
   ```

   Replace the example registry and digest with the approved values; do not
   leave angle-bracket placeholders in the live shell or env file.
2. **Registryless handoff (when an approved registry is not available):** save
   the exact image, transfer the archive through the approved secure channel,
   load it on the destination, and compare image IDs before setting the local
   immutable reference:

   ```bash
   docker save "$BUILD_TAG" | gzip > "findling-image-${SOURCE_COMMIT}.tar.gz"
   sha256sum "findling-image-${SOURCE_COMMIT}.tar.gz" > \
     "findling-image-${SOURCE_COMMIT}.tar.gz.sha256"
   # Securely transfer the archive, checksum, and provenance files; on the
   # destination, verify the archive before loading it:
   sha256sum --check "findling-image-${SOURCE_COMMIT}.tar.gz.sha256"
   docker load < "findling-image-${SOURCE_COMMIT}.tar.gz"
   SOURCE_IMAGE_ID="$(awk -F= '$1 == "local_image_id" { print $2 }' \
     "findling-image-${SOURCE_COMMIT}.provenance")"
   DEST_IMAGE_ID="$(docker image inspect "$BUILD_TAG" --format '{{.Id}}')"
   test "$DEST_IMAGE_ID" = "$SOURCE_IMAGE_ID"
   export FINDLING_IMAGE_REF="$DEST_IMAGE_ID"
   ```

   A local image ID is accepted only in the exact `sha256:<64 lowercase hex>`
   form and only after `docker compose --profile ops config --images` resolves
   that exact value. If the runtime's Compose/validate path does not prove
   local-digest support, publish the image to the approved registry instead.

An OCI registry is optional because it is only an artifact distribution and
digest-discovery mechanism; Findling does not call a registry at runtime. The
secure `docker save`/transfer/`docker load` path is the registryless fallback,
so adopting a registry is not a new application dependency.

## Prepare

Do this before touching the old host.

1. Record the current source deployment, image digest, DNS TTL, public endpoint,
   scheduler entries, and the last successful media/payment/OAuth smoke results.
2. Confirm ownership of the external Supabase project and `moments` bucket.
   Take a fresh, restorable Supabase Postgres/pgvector backup and obtain an
   explicit **external Supabase backup confirmation**. A local volume copy is
   not a database backup.
3. Complete the [Image handoff](#image-handoff) from the reviewed source
   commit. Record the source commit and local image ID, then choose either the
   approved registry RepoDigest or the verified registryless archive path. Do
   not assume an existing CI pipeline or use a mutable tag as the artifact.
4. Prepare the destination directories and a restricted service account:

   ```bash
   sudo install -d -o agentops -g agentops -m 0750 /home/agentops/findling/deploy/luxvps/logs
   sudo install -m 0600 -o agentops -g agentops \
     /home/agentops/findling/deploy/luxvps/findling.env.example \
     /home/agentops/findling/deploy/luxvps/findling.env
   ```

   Compose creates the named `/var/lib/findling` volume; do not create a host
   bind-mount directory for it.

5. Transfer secrets through the approved secure channel, not chat, shell
   history, image layers, or this repository. Populate every marker in
   `findling.env` and run `pnpm deploy:check` (plus `--require-youtube` when
   YouTube is part of the cutover). Never print the file or pass it to a
   diagnostic command that echoes its environment.
6. **Preserve `YOUTUBE_TOKEN_ENC_KEY` exactly.** Copy the existing production
   value byte-for-byte, including case and whitespace semantics. Existing
   encrypted YouTube refresh tokens cannot be decrypted after a key rotation.
   If the old value is unavailable, stop and plan token re-authorisation; do
   not invent a replacement during migration.

## Stage

Stage the destination with no traffic yet.

1. Place `compose.yaml` and this directory at `/home/agentops/findling`.
   Before **any** `validate` or `up`, pull the selected `FINDLING_IMAGE_REF`
   from its approved registry, or load the verified archive, then inspect and
   compare its RepoDigest/image ID with the handoff record. Set the exact
   immutable reference in the invoking shell and in `findling.env`; never use a
   tag fallback:

   ```bash
   export FINDLING_IMAGE_REF="registry.example.invalid/team/findling@sha256:<64 lowercase hex digest>"
   export FINDLING_ENV_FILE=/home/agentops/findling/deploy/luxvps/findling.env
   docker pull "$FINDLING_IMAGE_REF"  # use docker load for registryless handoff
   docker image inspect "$FINDLING_IMAGE_REF" --format '{{.RepoDigests}} {{.Id}}'
   ```

   Replace the example reference with the approved value before running the
   commands. Keep `findling.env` outside the image and ensure only the service
   account can read it.
2. Create or attach the shared Docker network **`public_proxy`**. Obtain an
   explicit approval for this network attachment; do not silently connect the
   app to an unrelated proxy network.
3. Render the candidate stack without starting or stopping production:

   ```bash
   cd /home/agentops/findling/deploy/luxvps
   export FINDLING_ENV_FILE=/home/agentops/findling/deploy/luxvps/findling.env
   docker compose --env-file "$FINDLING_ENV_FILE" --profile ops config >/dev/null
   docker compose --env-file "$FINDLING_ENV_FILE" --profile ops run --rm validate
   ```

4. Start the destination web service only after the stage gate approves the
   image, env file, network, and external backup. `findling` must be reachable
   on its internal port 3000; do not publish a second public host port:

   ```bash
   docker compose --env-file "$FINDLING_ENV_FILE" up -d findling
   ```

5. Run `./smoke-test.sh`. It only inspects an already staged stack: it does not
   run `up`, `down`, `restart`, or remove a production container. It suppresses
   Compose config and health bodies so secrets are not printed.

## Validate

Validate the staged destination before cutover.

Run the following against the staged destination and retain the evidence:

```bash
cd /home/agentops/findling/deploy/luxvps
export FINDLING_ENV_FILE=/home/agentops/findling/deploy/luxvps/findling.env
export FINDLING_IMAGE_REF="registry.example.invalid/team/findling@sha256:<64 lowercase hex digest>"
./smoke-test.sh
FINDLING_IMAGE_REF="$FINDLING_IMAGE_REF" \
  docker compose --env-file /home/agentops/findling/deploy/luxvps/findling.env \
  --profile ops run --rm validate
```

Replace the example digest with the approved value recorded during image
handoff. A registryless handoff may set `FINDLING_IMAGE_REF` to the verified
local `sha256:<64 lowercase hex>` ID only after the Compose support check.

`/api/healthz` can legitimately return **HTTP 200 while degraded**: the body
has a `status` field and non-critical embedding/media checks may be degraded.
Treat `status=error`, a non-200 response, or a failed critical check as a
cutover failure. A 200/degraded response requires an operator decision and a
recorded explanation; it is not proof that media processing is ready.

Before final cutover, require successful end-to-end smokes for all of these:

- media: YouTube OAuth/import, `yt-dlp` section download, ffprobe duration,
  ffmpeg clip/poster/preview, and Supabase `moments` upload/read;
- payment/x402: a real testnet Gateway verify/settle and receipt, with the
  payer, seller, and settlement state recorded (a `no_match` service result is
  distinct from payment settlement);
- OAuth: sign-in/session and the YouTube callback/refresh-token path;
- token decryption: restart the staged service and decrypt an existing token
  using the preserved `YOUTUBE_TOKEN_ENC_KEY`.

Also confirm the staged `reconcile` and `cleanup` one-shots can render and run
against the external database without mutating production scheduler state.

## Cutover

Use the following explicit approval gates.

Cutover is a change window, not an implicit consequence of a passing smoke.
Obtain each approval and record its timestamp/owner:

1. **Secure secret transfer gate:** destination `findling.env` was transferred
   through the approved channel, mode 0600, and `YOUTUBE_TOKEN_ENC_KEY` was
   compared byte-for-byte with the source.
2. **External Supabase backup gate:** the fresh backup/restore check is
   confirmed by the Supabase owner.
3. **Proxy/network gate:** create or attach `public_proxy`; approve the Caddy
   site change from `Caddyfile.snippet` (`findling.timidan.xyz` → `findling:3000`)
   and reload Caddy with the config validator. The snippet deliberately has an
   80 MB body limit and 180 s upstream dial/read/write timeouts.
4. **Scheduler gate:** disable the source reconcile/cleanup scheduler, verify
   no source job is running, then install `findling.cron` as the `agentops`
   user crontab on the destination (or add the `agentops` username column when
   using `/etc/cron.d`).
   Never leave source and destination schedulers enabled together. The cron
   entries use a common non-blocking `flock` lock on the destination; the
   disable/verify/install sequence is still required because hosts cannot share
   a filesystem lock.
5. **DNS gate:** approve the DNS change (or TTL/record confirmation) to the
   destination proxy, then verify the public endpoint and TLS certificate.

After the gates, run the public health and the media/payment/OAuth/token
smokes again. Monitor logs under `deploy/luxvps/logs` and reconcile results for
the first scheduler intervals.

## Rollback

If a cutover smoke or monitor fails, stop routing new traffic first and record
the failure without deleting durable state:

1. Revert DNS/Caddy to the approved source endpoint and verify TLS and health.
2. Disable the destination cron immediately; leave the source scheduler
   disabled until the source web service is serving again, then re-enable only
   the source scheduler after confirming no destination jobs are active.
3. Keep the external Supabase database and `moments` bucket untouched. Do not
   restore a database backup over newer writes unless the data owner approves a
   specific point-in-time recovery.
4. Preserve destination logs, image digest, Compose config result, health
   payload status, and smoke evidence for diagnosis. Reconstructable
   `/var/lib/findling` caches may be discarded; the transformers model is the
   only optional seed and can be fetched again.
5. A retry requires a new stage/validate approval and a fresh scheduler/DNS
   cutover gate. Do not leave both schedulers enabled during investigation.

The scheduler template is intentionally not installed by this repository. A
human operator must perform the disable/install switch after the explicit gate.
