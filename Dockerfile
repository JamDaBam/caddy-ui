FROM node:20-bookworm AS deps
WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY shared/package.json shared/package.json
RUN npm install

FROM deps AS build
COPY . .
RUN npm run build

FROM caddy:2.8.4 AS caddy-bin

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=caddy-bin /usr/bin/caddy /usr/bin/caddy
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/frontend/dist ./frontend/dist
COPY --from=build /app/backend/package.json ./backend/package.json
COPY --from=build /app/shared/package.json ./shared/package.json
COPY package.json ./
RUN npm install --omit=dev --workspaces --include-workspace-root=false
EXPOSE 3001
CMD ["npm", "run", "start", "-w", "backend"]
