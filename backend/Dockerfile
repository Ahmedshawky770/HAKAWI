FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/shared-types/dist ./packages/shared-types/dist

COPY backend/package.json backend/package-lock.json* ./backend/
WORKDIR /app/backend
RUN npm ci
COPY backend/ ./
RUN npm run build

FROM node:22-alpine
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/packages/shared-types ./packages/shared-types

EXPOSE 3001
ENV NODE_ENV=production
CMD ["node", "dist/main.js"]
