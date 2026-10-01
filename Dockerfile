FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001 DATABASE_PATH=/app/data/cafezinho.sqlite
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
COPY package.json ./
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 3001
CMD ["node", "dist-server/index.js"]
