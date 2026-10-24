import { spawn } from "node:child_process";

// Restarts a crashed collector within the same cycle; a clean exit (deadline or stop) ends supervision.
const minutes = Number(process.env.COLLECTOR_MINUTES ?? 345),
  delay = Number(process.env.RESTART_DELAY_MS ?? 30000),
  script = process.env.SUPERVISED_SCRIPT ?? "scripts/collect.ts";
if (!Number.isFinite(minutes) || minutes <= 0) throw Error("invalid collection duration");
const end = Date.now() + minutes * 60000;
let child: ReturnType<typeof spawn> | null = null, stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => { stopping = true; child?.kill(signal); });
let code = 0;
for (;;) {
  const remaining = (end - Date.now()) / 60000;
  child = spawn(process.execPath, ["--experimental-strip-types", script, ...process.argv.slice(2)], {
    stdio: "inherit", env: { ...process.env, COLLECTOR_MINUTES: remaining.toFixed(3) },
  });
  code = await new Promise<number>(resolve => child!.on("exit", (c, signal) => resolve(c ?? (signal ? 1 : 0))));
  if (code === 0 || stopping || (end - Date.now()) / 60000 <= 0.5) break;
  console.error(`Coletor encerrou com código ${code}; reinício em ${delay} ms.`);
  await new Promise(r => setTimeout(r, delay));
}
process.exitCode = code;
