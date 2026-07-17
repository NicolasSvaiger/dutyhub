# ============================================
# PlantonHub Frontend - Multi-stage Dockerfile
# ============================================

# Stage 1: Build the application
FROM node:26-alpine AS build
WORKDIR /app

# Copy package files for dependency installation (cached layer)
COPY package.json package-lock.json* ./

# Não baixa binários do Playwright durante o build da imagem — E2E roda
# fora do container do frontend (na imagem oficial mcr.microsoft.com/playwright).
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# Install dependencies. `npm ci` é preferível (reproducível), mas quando o
# package.json ganha uma dependência nova antes de o lockfile ser atualizado
# no host, `npm ci` falha. Usamos fallback pra `npm install` nesses casos —
# ele regenera o lockfile dentro do container e o build prossegue.
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Stage 2: Serve with Nginx
FROM nginx:alpine AS runtime

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy build output from build stage
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
