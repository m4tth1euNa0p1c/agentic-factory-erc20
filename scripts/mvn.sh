#!/usr/bin/env bash
# Maven for backend/: uses the wrapper with a local JDK 25 if present, else the pinned Maven container.
# Usage: scripts/mvn.sh [maven args...]   (default: verify). Testcontainers needs a Docker daemon.
. "$(dirname "$0")/lib.sh"
cd "$ROOT/backend"
args=("$@"); [[ ${#args[@]} -eq 0 ]] && args=(verify)
if command -v java >/dev/null 2>&1 && java -version 2>&1 | grep -qE 'version "2[5-9]'; then
  exec ./mvnw -B -ntp "${args[@]}"
fi
exec docker run --rm -v "$(hostpath "$ROOT/backend"):/src" -w /src -v tela-m2:/root/.m2 \
  -v /var/run/docker.sock:/var/run/docker.sock -e TESTCONTAINERS_HOST_OVERRIDE=host.docker.internal \
  "$MAVEN_IMAGE" mvn -B -ntp "${args[@]}"
