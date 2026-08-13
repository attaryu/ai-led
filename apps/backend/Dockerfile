# Build context is the repo root (not apps/backend) so npm workspaces
# can resolve the packages/db link.
FROM node:24-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/backend/package.json apps/backend/package.json
COPY packages/db/package.json packages/db/package.json
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run generate --workspace packages/db
RUN npm run build --workspace apps/backend

FROM node:24-alpine
WORKDIR /repo
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/package.json ./package.json
COPY --from=build /repo/apps/backend/package.json ./apps/backend/package.json
COPY --from=build /repo/apps/backend/dist ./apps/backend/dist
COPY --from=build /repo/packages/db ./packages/db
WORKDIR /repo/apps/backend
CMD ["node", "dist/main.js"]
