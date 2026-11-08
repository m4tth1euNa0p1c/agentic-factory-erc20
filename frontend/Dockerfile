# syntax=docker/dockerfile:1
FROM node:24.15-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY angular.json tsconfig*.json ./
COPY public ./public
COPY src ./src
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.30.0-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/frontend/browser /usr/share/nginx/html
# The base image already runs as nginx (uid 101); explicit for scanners (Trivy DS-0002) and reviewers.
USER 101
EXPOSE 8080
HEALTHCHECK --interval=5s --timeout=3s --retries=20 CMD wget -qO- --header="Host: localhost" http://127.0.0.1:8080/ >/dev/null || exit 1
