FROM node:22-alpine AS builder
WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

FROM node:22-alpine
WORKDIR /app/frontend

ENV NODE_ENV=production
EXPOSE 3000

COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --omit=dev

COPY --from=builder /app/frontend/.next/standalone ./
COPY --from=builder /app/frontend/.next/static ./.next/static
COPY --from=builder /app/frontend/public ./public

CMD ["node", ".next/standalone/server.js"]
