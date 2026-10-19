# One multi-stage build for every service; docker-compose picks a target per service.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY apps/api/package.json apps/api/
COPY apps/agent/package.json apps/agent/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages packages
COPY apps apps
RUN npm run build -w @tutor/core \
 && npm run build -w @tutor/api \
 && npm run build -w @tutor/agent \
 && npm run build -w @tutor/web

FROM deps AS prod-deps
RUN npm prune --omit=dev --no-audit --no-fund

FROM node:22-bookworm-slim AS node-runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps /app/node_modules node_modules
COPY --from=build /app/packages/core/package.json packages/core/package.json
COPY --from=build /app/packages/core/dist packages/core/dist

FROM node-runtime AS api
COPY --from=build /app/apps/api/package.json apps/api/package.json
COPY --from=build /app/apps/api/dist apps/api/dist
COPY db/migrations db/migrations
USER node
EXPOSE 4000
CMD ["node", "apps/api/dist/main.js"]

FROM node-runtime AS agent
COPY --from=build /app/apps/agent/package.json apps/agent/package.json
COPY --from=build /app/apps/agent/dist apps/agent/dist
USER node
CMD ["node", "apps/agent/dist/main.js", "start"]

FROM nginxinc/nginx-unprivileged:1.27-alpine AS web
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY apps/web/security-headers.conf /etc/nginx/security-headers.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
