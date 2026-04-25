FROM node:22-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
WORKDIR /app

COPY . .

RUN npx vite build --config apps/frontend/vite.config.ts --outDir /app/apps/frontend/dist
RUN npx esbuild apps/server/src/local.ts --bundle --platform=node --format=esm --sourcemap --packages=external --outfile=apps/server/dist/local.js
RUN npx esbuild apps/server/src/lambda.ts --bundle --platform=node --format=esm --sourcemap --packages=external --outfile=apps/server/dist/lambda.js

FROM node:22-alpine AS runtime
WORKDIR /app

# Install nginx from Alpine package repositories.
RUN apk add --no-cache nginx
RUN rm -f /var/log/nginx/* && ln -s /dev/stdout /var/log/nginx/access.log && ln -s /dev/stderr /var/log/nginx/error.log
RUN rm -rf /run/nginx && mkdir -p /run && ln -s /var/lib/nginx/tmp /run/nginx
ENV NODE_ENV=production
ENV PORT=3000

# Frontend static build output.
COPY --from=build /app/apps/frontend/dist /usr/share/nginx/html

# Bundled Node server output.
COPY --from=build /app/apps/server/dist /app/server
COPY --from=deps /app/node_modules /app/node_modules

# nginx and startup configuration.
COPY docker/nginx.conf /etc/nginx/http.d/default.conf
COPY docker/start.sh /usr/local/bin/start.sh
RUN chmod +x /usr/local/bin/start.sh
RUN adduser -D -H appuser

EXPOSE 80

CMD ["/usr/local/bin/start.sh"]