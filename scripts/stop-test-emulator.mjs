/**
 * Stop a Firestore emulator that `firebase emulators:exec` left running.
 *
 * On Windows, emulators:exec prints "Firestore Emulator has exited upon
 * receiving signal: SIGINT" and then leaves the Java process listening anyway.
 * The tests have passed by then, so nothing looks wrong, until the next run
 * dies with "port taken". This runs after test:emulated and test:rules.
 *
 * Deliberately narrow. It only touches a process that is listening on the
 * *test* emulator's port (read from firebase.itest.json, so it can never be the
 * dev emulator on 8080 holding browsable data) and whose command line says it
 * is the Firestore emulator. Anything else on that port is left alone and
 * reported.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const config = JSON.parse(readFileSync(new URL("../firebase.itest.json", import.meta.url), "utf8"));
const port = config.emulators?.firestore?.port;

if (typeof port !== "number") {
  console.error("stop-test-emulator: no firestore port in firebase.itest.json");
  process.exit(1);
}

function run(command, args) {
  try {
    return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return "";
  }
}

/** PIDs listening on the port. */
function listeners() {
  if (process.platform === "win32") {
    return [
      ...new Set(
        run("netstat", ["-ano", "-p", "TCP"])
          .split(/\r?\n/)
          .filter((line) => /LISTENING/.test(line) && new RegExp(`:${port}\\s`).test(line))
          .map((line) => Number(line.trim().split(/\s+/).pop()))
          .filter((pid) => Number.isInteger(pid) && pid > 0),
      ),
    ];
  }
  return run("lsof", ["-ti", `tcp:${port}`, "-sTCP:LISTEN"])
    .split(/\s+/)
    .map(Number)
    .filter((pid) => Number.isInteger(pid) && pid > 0);
}

function commandLine(pid) {
  if (process.platform === "win32") {
    return run("powershell", [
      "-NoProfile",
      "-Command",
      `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`,
    ]).trim();
  }
  return run("ps", ["-o", "command=", "-p", String(pid)]).trim();
}

for (const pid of listeners()) {
  const command = commandLine(pid);
  if (!/cloud-firestore-emulator/.test(command)) {
    console.log(`stop-test-emulator: pid ${pid} holds :${port} but is not the emulator; left alone`);
    continue;
  }
  try {
    process.kill(pid);
    console.log(`stop-test-emulator: stopped the Firestore emulator emulators:exec left on :${port}`);
  } catch (error) {
    console.log(`stop-test-emulator: could not stop pid ${pid}: ${error.message}`);
  }
}
