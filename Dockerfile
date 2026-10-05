# Stage 1: build the frontend
FROM node:22-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: build the backend
FROM node:22-alpine AS backend-builder
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci
COPY backend/ ./
RUN npm run build

# Stage 3: production image
FROM node:22-alpine
WORKDIR /app

# Install dependencies for both workspaces
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Copy built artifacts
COPY --from=frontend-builder /app/frontend/.next/standalone ./.next/standalone
COPY --from=frontend-builder /app/frontend/.next/static ./.next/static
COPY --from=frontend-builder /app/frontend/public ./public
COPY --from=backend-builder /app/backend/dist ./dist

# Copy workspace packages
COPY --from=backend-builder /app/backend/node_modules ./node_modules
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/shared-types/dist ./packages/shared-types/dist

EXPOSE 3000
ENV NODE_ENV=production
CMD ["node", ".next/standalone/server.js"]
