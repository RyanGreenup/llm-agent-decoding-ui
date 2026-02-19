FROM node:22-slim AS base
RUN apt-get update && apt-get install -y pandoc && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 3075
CMD ["npm", "run", "start"]
