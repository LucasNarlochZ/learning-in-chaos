FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/analytics/package.json apps/analytics/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages packages
RUN npm ci
COPY . .
ARG VITE_ANALYTICS_URL=/api
ENV VITE_ANALYTICS_URL=$VITE_ANALYTICS_URL
RUN npm run build

FROM nginx:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
