#!/usr/bin/env node
/**
 * kill-port — free TCP ports by killing whatever is listening on them.
 *
 * Cross-platform:
 *   - Windows: netstat -ano + taskkill /F /PID
 *   - Unix:    lsof -ti tcp:<port> -sTCP:LISTEN + kill -9
 *   - WSL:     also reaches across the WSL/Windows boundary via
 *              powershell.exe + Get-NetTCPConnection, since WSL's
 *              lsof/netstat are blind to host-side listeners (the
 *              classic "[::1]:1420 already in use" false-negative).
 *
 * Silent when the port is free. Exits 0 even if nothing was killed so it
 * can sit behind `predev`/`pretauri` without blocking startup on a cold run.
 *
 * Usage: node scripts/kill-port.mjs <port> [port...]
 */
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import process from "node:process";

const isWindows = process.platform === "win32";

/** WSL detection — covers both WSL1 and WSL2. */
function isWSL() {
  if (isWindows) return false;
  // WSL sets WSL_DISTRO_NAME in env (WSL2) and stamps /proc/version with
  // "Microsoft" (WSL1/2). Either is sufficient on its own.
  if (process.env.WSL_DISTRO_NAME) return true;
  try {
    return /microsoft/i.test(readFileSync("/proc/version", "utf8"));
  } catch {
    return false;
  }
}
const inWSL = isWSL();

const ports = process.argv
  .slice(2)
  .map((p) => Number.parseInt(p, 10))
  .filter((n) => Number.isFinite(n) && n > 0 && n < 65536);

if (ports.length === 0) {
  console.error("[kill-port] no valid ports given; expected integers 1-65535");
  process.exit(0);
}

/** @returns {string[]} PIDs currently LISTENING on `port`. */
function pidsOnPort(port) {
  if (isWindows) {
    let out = "";
    try {
      // `-p TCP` would hide IPv6-only LISTENING entries (e.g. [::1]:1420),
      // which still block a fresh bind on Windows. Omit it.
      out = execFileSync("netstat", ["-ano"], { encoding: "utf8" });
    } catch {
      return [];
    }
    const pids = new Set();
    // Lines look like:  TCP    0.0.0.0:1420    0.0.0.0:0    LISTENING    12345
    const re = new RegExp(`[:.]${port}\\s.*LISTENING\\s+(\\d+)\\s*$`, "i");
    for (const line of out.split(/\r?\n/)) {
      const m = line.match(re);
      if (m) pids.add(m[1]);
    }
    return [...pids];
  }

  try {
    const out = execFileSync("lsof", ["-ti", `tcp:${port}`, "-sTCP:LISTEN"], {
      encoding: "utf8",
    });
    return out.split(/\s+/).filter(Boolean);
  } catch {
    return [];
  }
}

function killPid(pid) {
  if (isWindows) {
    const r = spawnSync("taskkill", ["/F", "/PID", pid], { stdio: "ignore" });
    return r.status === 0;
  }
  const r = spawnSync("kill", ["-9", pid], { stdio: "ignore" });
  return r.status === 0;
}

/**
 * Reach across the WSL/Windows boundary and kill host-side LISTENING
 * processes on any of the given ports. No-op outside WSL.
 * Batched into a single powershell.exe call so we pay the spawn cost once.
 * @returns {boolean} true if any host-side process was killed.
 */
function killWindowsSideOnPorts(targetPorts) {
  if (!inWSL || targetPorts.length === 0) return false;
  // Port values are validated to be safe integers above; safe to interpolate.
  const portList = targetPorts.join(",");
  const ps = [
    `$ErrorActionPreference = 'SilentlyContinue'`,
    `$ports = @(${portList})`,
    `Get-NetTCPConnection -LocalPort $ports -State Listen -ErrorAction SilentlyContinue | ForEach-Object {`,
    `  $pid_ = $_.OwningProcess`,
    `  $name = (Get-Process -Id $pid_ -ErrorAction SilentlyContinue).ProcessName`,
    `  if ($pid_) {`,
    `    Write-Host "[kill-port][wsl] killing Windows PID $pid_ ($name) on $($_.LocalAddress):$($_.LocalPort)"`,
    `    Stop-Process -Id $pid_ -Force -ErrorAction SilentlyContinue`,
    `  }`,
    `}`,
  ].join("\n");
  const r = spawnSync("powershell.exe", ["-NoProfile", "-Command", ps], {
    encoding: "utf8",
  });
  const out = r.stdout || "";
  if (out) process.stdout.write(out);
  return /killing Windows PID/.test(out);
}

let killedAny = false;
for (const port of ports) {
  const pids = pidsOnPort(port);
  if (pids.length === 0) {
    console.log(`[kill-port] port ${port} free`);
    continue;
  }
  for (const pid of pids) {
    if (killPid(pid)) {
      console.log(`[kill-port] killed PID ${pid} on port ${port}`);
      killedAny = true;
    } else {
      console.warn(`[kill-port] failed to kill PID ${pid} on port ${port}`);
    }
  }
}

// WSL only: also clear host-side listeners lsof can't see. Always run when
// in WSL — the local view is always blind to Windows processes, so the
// per-port "free" lines above don't actually prove the port is bindable.
if (killWindowsSideOnPorts(ports)) {
  killedAny = true;
}

// Brief settle so the OS actually releases the socket before the next
// command (vite / tauri dev) tries to bind strictPort: true.
if (killedAny) {
  await new Promise((r) => setTimeout(r, 250));
}
