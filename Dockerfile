FROM oven/bun:1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends pandoc && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun --bun run build

EXPOSE 3075
CMD ["bun", "--bun", "run", ".output/server/index.mjs"]
