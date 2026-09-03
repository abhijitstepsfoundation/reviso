FROM node:22-slim AS frontend
WORKDIR /fe
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

FROM node:22-slim AS backend
WORKDIR /be
COPY backend/package*.json ./
RUN npm install
COPY backend/ ./
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
COPY backend/package*.json ./
RUN npm install --omit=dev
COPY --from=backend /be/dist ./dist
COPY --from=frontend /fe/dist ./public
EXPOSE 8080
CMD ["node", "dist/index.js"]
