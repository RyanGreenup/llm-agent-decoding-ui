FROM oven/bun:1 AS base
RUN apt-get update && apt-get install -y pandoc && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

EXPOSE 3075
CMD ["npm", "run", "start"]
