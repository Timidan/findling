FROM ubuntu:24.04 AS base

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

ENV DEBIAN_FRONTEND=noninteractive \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8 \
    PATH=/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

# Keep the media toolchain in the same immutable base as the application.  On
# Ubuntu 24.04 the archive provides the ffmpeg 6.x series used by Findling.
RUN apt-get update \
    && apt-get install --no-install-recommends --yes \
      ca-certificates \
      curl \
      ffmpeg \
      fontconfig \
      fonts-dejavu-core \
      fonts-liberation2 \
      tini \
      xz-utils \
      yt-dlp \
    && rm -rf /var/lib/apt/lists/*

# Ubuntu 24.04 currently ships a yt-dlp release that YouTube no longer accepts.
# Install a reviewed upstream release over the distro entrypoint and verify the
# exact asset before it enters the immutable runtime image. Keep the distro
# package above because it supplies the Python runtime and supporting modules.
RUN set -eux; \
    yt_dlp_version=2026.07.04; \
    yt_dlp_sha256=495be29ff4d9d4e9be7eabdfef225221e5d5282e77f2f505abc6dca80349f3fd; \
    curl --fail --silent --show-error --location \
      "https://github.com/yt-dlp/yt-dlp/releases/download/${yt_dlp_version}/yt-dlp" \
      --output /tmp/yt-dlp; \
    printf '%s  %s\n' "$yt_dlp_sha256" /tmp/yt-dlp | sha256sum --check --status; \
    install --mode=0755 /tmp/yt-dlp /usr/local/bin/yt-dlp; \
    rm -f /tmp/yt-dlp; \
    test "$(yt-dlp --version)" = "$yt_dlp_version"

RUN test "$(ffmpeg -version | sed -n '1s/^ffmpeg version \([0-9][0-9]*\)\..*/\1/p')" = "6" \
    && command -v ffprobe \
    && command -v yt-dlp \
    && ffmpeg -hide_banner -filters 2>&1 | grep '[[:space:]]drawtext[[:space:]]' >/dev/null \
    && test -f /usr/share/fonts/truetype/dejavu/DejaVuSans.ttf

# Install the exact upstream Node release and verify it against Node's signed
# release checksums before it enters the image.
RUN set -eux; \
    node_version=22.23.1; \
    node_archive="node-v${node_version}-linux-x64.tar.xz"; \
    curl --fail --silent --show-error --location \
      "https://nodejs.org/dist/v${node_version}/${node_archive}" \
      --output "/tmp/${node_archive}"; \
    curl --fail --silent --show-error --location \
      "https://nodejs.org/dist/v${node_version}/SHASUMS256.txt" \
      --output /tmp/SHASUMS256.txt; \
    cd /tmp; \
    grep " ${node_archive}$" SHASUMS256.txt | sha256sum --check --status -; \
    tar --extract --file "/tmp/${node_archive}" --xz --strip-components=1 --directory /usr/local; \
    rm -f "/tmp/${node_archive}" /tmp/SHASUMS256.txt; \
    test "$(node --version)" = "v${node_version}"

RUN npm install --global --no-fund --no-audit pnpm@11.3.0 \
    && test "$(pnpm --version)" = "11.3.0"

RUN groupadd --system --gid 10001 findling \
    && useradd --system --uid 10001 --gid findling --create-home \
      --home-dir /home/findling --shell /usr/sbin/nologin findling \
    && install --directory --owner=findling --group=findling \
      /app /app/.next/cache /var/lib/findling /tmp/findling-clips

WORKDIR /app

FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS build

ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_SUPABASE_URL

# These are the only build-time inputs.  Both values are intentionally public
# Next.js configuration; secrets remain runtime-only environment variables.
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL} \
    NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM base AS runtime

ENV NODE_ENV=production

# Keep Next's regular server output (rather than opting into standalone
# tracing) and retain TypeScript sources/scripts for the profile-gated
# maintenance jobs that run through tsx.
COPY --from=build --chown=findling:findling /app/.next ./.next
COPY --from=build --chown=findling:findling /app/node_modules ./node_modules
COPY --from=build --chown=findling:findling /app/package.json ./package.json
COPY --from=build --chown=findling:findling /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=build --chown=findling:findling /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=build --chown=findling:findling /app/public ./public
COPY --from=build --chown=findling:findling /app/scripts ./scripts
COPY --from=build --chown=findling:findling /app/src ./src
COPY --from=build --chown=findling:findling /app/tsconfig.json ./tsconfig.json
COPY --from=build --chown=findling:findling /app/next.config.ts ./next.config.ts

USER findling:findling

EXPOSE 3000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["pnpm", "start"]
