#!/usr/bin/env bun
import { $ } from "bun";

async function run(): Promise<void> {
  await $`pwd`;
  await $`ls`;
  try {
    await $`rm -r data/app.db data/app.db-shm data/app.db-wal`;
  } catch (error) {
    console.log(error);
  }
  await $`bun install`;
  await $`bun --bun run build`;
  await $`HOST=0.0.0.0 bun --bun .output/server/index.mjs`;
}

run();
