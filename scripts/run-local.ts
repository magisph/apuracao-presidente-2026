import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { localLock } from "../src/collector/local-lock.ts";
await mkdir("data", { recursive: true });
const release = localLock("data/local-lock.sqlite");
const children = ["coordinator", "g0", "g1", "g2", "g3", "g4"].map((shard) =>
  spawn(
    process.execPath,
    ["--experimental-strip-types", "scripts/collect.ts"],
    {
      cwd: process.cwd(),
      env: { ...process.env, COLLECTOR_SHARD: shard },
      stdio: "inherit",
      windowsHide: true,
    },
  ),
);
let stopping = false;
const stop = () => {
  stopping = true;
  for (const c of children) c.kill("SIGTERM");
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
try {
  await Promise.all(
    children.map(
      (c) =>
        new Promise<void>((resolve) =>
          c.on("exit", () => {
            if (!stopping) stop();
            resolve();
          }),
        ),
    ),
  );
} finally {
  release();
}
