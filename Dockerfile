# ---- Stage 1: сборка фронта ----
FROM node:20-alpine AS frontend_builder

WORKDIR /frontend

# Устанавливаем зависимости фронта
COPY front/package*.json ./
RUN npm ci

# Копируем исходники фронта
COPY front ./

# Важно: API внутри браузера должно ходить на /api,
# а не на http://localhost:3000/api
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN npm run build
# Результат: /frontend/dist (index.html + assets)


# ---- Stage 2: сборка backend-а ----
FROM node:20-alpine AS backend_builder

WORKDIR /backend

# зависимости backend-а
COPY back/package*.json ./
COPY back/tsconfig.json ./
RUN npm ci

# исходники backend-а
COPY back/src ./src
COPY back/db ./db

# Кладём уже собранный фронт в папку,
# откуда backend его будет раздавать (/app/frontend-build)
COPY --from=frontend_builder /frontend/dist ./frontend-build

# Компилируем TypeScript в dist/
RUN npm run build


# ---- Stage 3: runtime ----
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV TZ=Europe/Moscow
ENV PORT=3000

# Ставим только prod-зависимости backend-а
COPY back/package*.json ./
RUN npm ci --omit=dev

# Копируем собранный backend и фронт
COPY --from=backend_builder /backend/dist ./dist
COPY --from=backend_builder /backend/frontend-build ./frontend-build
COPY --from=backend_builder /backend/db ./db

EXPOSE 3000

CMD ["node", "dist/index.js"]
