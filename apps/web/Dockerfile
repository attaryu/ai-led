# Build context is the repo root (not apps/web), same reason as
# apps/backend/Dockerfile: apps/web is an npm workspace member, so its
# lockfile is the root one, not a standalone copy.
FROM node:24-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run build --workspace apps/web

FROM node:24-alpine AS production-deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
RUN npm ci --omit=dev --workspace apps/web

FROM node:24-alpine
WORKDIR /repo
COPY --from=production-deps /repo/node_modules ./node_modules
COPY --from=production-deps /repo/package.json ./package.json
COPY --from=production-deps /repo/apps/web/package.json ./apps/web/package.json
COPY --from=build /repo/apps/web/build ./apps/web/build
WORKDIR /repo/apps/web
CMD ["npm", "run", "start"]
