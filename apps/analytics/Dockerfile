FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/analytics/package.json apps/analytics/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages packages
RUN npm ci
COPY . .
RUN npm run build --workspace @learning-in-chaos/analytics

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001 ANALYTICS_DATABASE=/data/analytics.sqlite
RUN apk add --no-cache su-exec && mkdir -p /data && chown node:node /data
COPY --from=build --chown=node:node /app/apps/analytics/dist ./dist
COPY --from=build --chown=node:node /app/node_modules ./node_modules
USER node
CMD ["node", "dist/main.js"]
