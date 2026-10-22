#!/usr/bin/env node
/**
 * WHY THIS SCRIPT EXISTS.
 *
 * `npm run dev` binds two ports — the API on 3001 and the frontend on 3000 — and it used to
 * discover a squatter the hard way. The API died with a bare `EADDRINUSE` and no port number
 * anyone could act on, the FRONTEND kept running, and the BROWSER went on talking to whatever
 * had the API's port. That other server answers `200` with a JSON body and no
 * `Access-Control-Allow-Origin`, so the console reported a CORS misconfiguration:
 *
 *   Cross-Origin Request Blocked: The Same Origin Policy disallows reading the remote resource
 *   at http://localhost:3001/api/v1/auth/session. (Reason: CORS header 'Access-Control-Allow-
 *   Origin' missing). Status code: 200.
 *
 * The two symptoms look like two problems, and the CORS one sends you to the CORS allowlist in
 * `backend/src/main.ts`, where the allowlist is CORRECT and the request never reached it. A
 * reader who follows the CORS error never finds the thing that is actually wrong, because the
 * thing that is actually wrong is one process holding a port. (It is the CORS error only when
 * the holder is not another instance of this project's API — an instance of it answers with the
 * same allowlist and no CORS error appears.)
 *
 * So the check runs BEFORE the two servers start, and it names the holder: the port, the PID and
 * the command line. A squatter on the API port is also called out as the cause of the CORS
 * console errors, because that is the connection nobody can see from the browser's side.
 *
 * WHAT IT CHECKS, AND HOW. Each port is probed the way the application binds it — a plain
 * `listen(port)` with no host, which is the wildcard bind both `app.listen(port)` and
 * `next dev` perform. A port that answers this probe is the same port the application would
 * fail on; a port that does not is free.
 *
 * WHAT IT DOES NOT DO. It does not kill anything. Deciding that a process the developer started
 * should be stopped is not this script's call to make, and a script that kills processes to make
 * a check pass is a script that eventually kills the wrong one. It reports and exits non-zero.
 *
 * Run it on its own, or let `npm run dev` run it first:
 *
 *   node scripts/check-dev-ports.mjs
 */
import { createServer } from "node:net";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

/**
 * The API's port.
 *
 * `PORT` is what `backend/src/main.ts` reads, and it is read here too, so that the port this
 * script checks is the port the API will actually try to bind. The default matches the API's own
 * default.
 */
const API_PORT = Number.parseInt(process.env.PORT ?? "3001", 10);

/**
 * The frontend's port.
 *
 * FIXED, and that is deliberate. `next dev` reads `PORT` as well, so a `PORT` in the
 * environment moves BOTH servers onto one port — and when Next's port is not given explicitly it
 * does not fail on a busy port at all: it silently retries on the NEXT port, which for a busy
 * 3000 is 3001, which is the API's port. So the frontend's port is passed to `next dev` as an
 * explicit `--port` by the `dev` script (which makes Next fail loudly instead of drifting), and
 * the value checked here is the one that flag carries.
 *
 * A `PORT` in the environment therefore moves the API only, and the frontend follows it only
 * through `NEXT_PUBLIC_API_URL`, which is the variable the client actually calls the API with
 * (`frontend/src/lib/api.ts`). Moving the API without moving that is a misconfiguration this
 * script cannot see, and it says so below rather than pretending otherwise.
 */
const FRONTEND_PORT = 3000;

/**
 * THE FRONTEND'S PORT IS DECLARED IN TWO PLACES, AND THIS SCRIPT CHECKS THAT THEY AGREE.
 *
 * The port this script probes and the port `next dev` is told to bind are two facts about
 * one thing, and they are written in two files: here, and as `--port` in the `dev:frontend`
 * script in the root `package.json`. Nothing in the toolchain makes them agree, so this
 * script reads the manifest and refuses to run when they do not — a check that probes a port
 * nobody binds is a check that always passes, and it is worse than no check because it says
 * the ports are free.
 *
 * It also checks that `npm run dev` runs this script at all, because a check that the
 * developer has to remember to run is a check that is not run.
 */
function checkTheDevScriptsAgree() {
  const problems = [];

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8"));
  } catch (error) {
    return [`  The root package.json could not be read: ${String(error)}`];
  }

  const scripts = manifest.scripts ?? {};
  const frontend = String(scripts["dev:frontend"] ?? "");
  const dev = String(scripts.dev ?? "");

  const pinned = /--port\s+(\d+)/.exec(frontend);

  if (pinned === null) {
    problems.push(
      "  The `dev:frontend` script does not pin the frontend's port with `--port`. Next's port is not given " +
        "explicitly, it does not fail on a busy port: it retries on the NEXT port, which for a busy 3000 is " +
        "3001 — the API's port.",
    );
  } else if (Number(pinned[1]) !== FRONTEND_PORT) {
    problems.push(
      `  The \`dev:frontend\` script tells Next to bind port ${pinned[1]}, but this script checks port ` +
        `${FRONTEND_PORT}. One of the two is wrong, and the check is checking the port nobody binds.`,
    );
  }

  if (!dev.includes("check-dev-ports")) {
    problems.push(
      "  The `dev` script does not run this check, so the ports are only probed when somebody remembers to.",
    );
  }

  return problems;
}

/**
 * The command lines of the processes holding a port, if the platform can be asked.
 *
 * Two sources are consulted, because neither is sufficient on its own: `lsof` names the
 * executable but does not always see a socket that a parent process handed to a child (the Next
 * dev server is a child of the `next dev` process, and its listener belongs to the child), and
 * `ss` always sees the listener but reports it as `users:(("name",pid=…,fd=…))` and needs that
 * parsed. When neither is installed the port is still reported as occupied — the bind probe
 * already proved that — and the holder is simply unknown.
 */
function describeHolders(port) {
  const pids = new Set();

  for (const pid of lsofHolders(port)) {
    pids.add(pid);
  }

  for (const pid of ssHolders(port)) {
    pids.add(pid);
  }

  return [...pids].map((pid) => ({ pid, command: commandOf(pid) }));
}

/**
 * The PIDs `lsof` reports as LISTENING on a port.
 */
function lsofHolders(port) {
  try {
    const output = execFileSync("lsof", ["-nP", "-ti", `:${port}`, "-sTCP:LISTEN"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return output.split(/\s+/).map((value) => value.trim()).filter((value) => value.length > 0);
  } catch {
    // `lsof` is not installed, or it found nothing.
    return [];
  }
}

/**
 * The PIDs `ss` reports as LISTENING on a port.
 *
 * The local address is the fourth column and ends with `:<port>`; the owning process is named
 * in the last column as `users:(("name",pid=1234,fd=5))`.
 */
function ssHolders(port) {
  try {
    const output = execFileSync("ss", ["-ltnp"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });

    const pids = [];

    for (const line of output.split("\n")) {
      const columns = line.trim().split(/\s+/);
      if (columns.length < 4) {
        continue;
      }

      const localAddress = columns[3];
      if (!localAddress.endsWith(`:${port}`)) {
        continue;
      }

      const match = /pid=(\d+)/.exec(line);
      if (match !== null) {
        pids.push(match[1]);
      }
    }

    return pids;
  } catch {
    // `ss` is not installed.
    return [];
  }
}

/**
 * The command line of a process, or null when it cannot be read.
 */
function commandOf(pid) {
  try {
    return execFileSync("ps", ["-p", pid, "-o", "args="], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Whether a port can be bound.
 *
 * The probe binds and releases, exactly as the application would, and resolves to the error the
 * bind produced. A port that is free resolves to null.
 */
function probe(port) {
  return new Promise((resolve) => {
    const server = createServer();

    server.once("error", (error) => {
      resolve(error.code === "EADDRINUSE" ? "EADDRINUSE" : error.code ?? "EUNKNOWN");
    });

    server.listen(port, () => {
      server.close(() => resolve(null));
    });
  });
}

/**
 * The lines that describe one occupied port, for the developer reading the failure.
 */
function describeOccupied(label, port, holders) {
  const lines = [`  ${label}: port ${port} is already in use.`];

  if (holders.length === 0) {
    lines.push(`    Nothing could be identified as holding it — find it with: lsof -nP -i :${port}`);
  }

  for (const holder of holders) {
    lines.push(`    PID ${holder.pid}${holder.command ? ` — ${holder.command}` : ""}`);
  }

  lines.push(`    Stop it, or point the other server at a different port.`);

  return lines;
}

async function main() {
  const ports = [
    { label: "API", port: API_PORT },
    { label: "frontend", port: FRONTEND_PORT },
  ];

  const problems = checkTheDevScriptsAgree();

  for (const { label, port } of ports) {
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      problems.push(`  ${label}: ${port} is not a port number.`);
      continue;
    }

    const error = await probe(port);
    if (error === null) {
      continue;
    }

    if (error !== "EADDRINUSE") {
      problems.push(`  ${label}: port ${port} could not be probed (${error}).`);
      continue;
    }

    problems.push(...describeOccupied(label, port, describeHolders(port)));
  }

  if (API_PORT === FRONTEND_PORT) {
    problems.push(
      `  The API and the frontend would both bind port ${API_PORT}. PORT moves the API, and the frontend's ` +
        "port is fixed, so set a PORT that is not the frontend's.",
    );
  }

  if (problems.length === 0) {
    console.log(`Dev ports are free: API on ${API_PORT}, frontend on ${FRONTEND_PORT}.`);
    return;
  }

  console.error("\nThe dev environment cannot start:\n");
  for (const problem of problems) {
    console.error(problem);
  }

  const apiOccupied = problems.some((problem) => problem.includes("API: port") && problem.includes("already in use"));
  if (apiOccupied) {
    console.error(
      "\nIf the process on the API's port is not another instance of this project's API, it answers the\n" +
        "browser's requests without CORS headers, which is what the 'Cross-Origin Request Blocked …\n" +
        "(Reason: CORS header \\'Access-Control-Allow-Origin\\' missing)' console errors are. They are this one\n" +
        "problem, not a CORS misconfiguration.",
    );
  }

  console.error("");
  process.exit(1);
}

await main();
