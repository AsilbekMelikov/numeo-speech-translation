FROM node:20-alpine as builder

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

FROM node:20-alpine as production

WORKDIR /app

COPY package.json package-lock.json ./

ENV NODE_ENV=production

RUN npm ci --only=production && npm cache clean --force
COPY --from=builder /app/dist ./dist

CMD ["npm", "start"]