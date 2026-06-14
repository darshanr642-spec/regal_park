# ── Frontend: Expo Web Export → Nginx ────────────────────
FROM node:20-alpine AS build

WORKDIR /app

# Install deps (cached layer)
COPY frontend/package.json frontend/yarn.lock ./
RUN yarn install --frozen-lockfile --network-timeout 120000

# Copy source
COPY frontend/ .

# Build web bundle
ENV EXPO_PUBLIC_BACKEND_URL=""
RUN npx expo export --platform web --output-dir dist

# ── Production: Nginx static serving ────────────────────
FROM nginx:1.27-alpine AS production

# Custom nginx config
COPY infrastructure/nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget -q --spider http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
