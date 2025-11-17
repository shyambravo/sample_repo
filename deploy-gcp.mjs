#!/usr/bin/env node
/**
 * Cross-platform deployment script for GCP
 * Steps:
 * 1) Prompt for inputs (project, zone, instance name, machine type, port)
 * 2) Compress working directory (tar.gz preferred; falls back to zip on Windows)
 * 3) Copy archive to VM
 * 4) Build & run Dockerized server on VM
 * 5) Fetch server public IP
 * 6) Hit /health endpoint
 *
 * Requirements:
 * - gcloud CLI installed and authenticated
 * - Project and zone accessible to current account
 */

import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { exec as execCb } from 'node:child_process';
import { promisify } from 'node:util';
import { platform } from 'node:os';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const exec = promisify(execCb);

async function runCommand(command, options = {}) {
  // Stream output for user visibility, also return stdout on success
  const { stdout, stderr } = await exec(command, {
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 64,
    ...options,
  });
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  return stdout?.trim?.() ?? '';
}

async function commandExists(command) {
  try {
    const isWindows = process.platform === 'win32';
    const checkCmd = isWindows ? `where ${command}` : `command -v ${command}`;
    await exec(checkCmd, { windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

function getWorkspaceRoot() {
  return resolve(process.cwd());
}

function ensureDir(dirPath) {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

async function createArchive({ workspaceRoot, outDir }) {
  const archiveBase = `deploy-${Date.now()}`;
  const isWindows = process.platform === 'win32';
  const hasTar = await commandExists('tar');
  ensureDir(outDir);

  if (hasTar) {
    const outFile = join(outDir, `${archiveBase}.tar.gz`);
    // Exclude large/unnecessary paths; keep source minimal for deployment
    const excludes = [
      // exclude the temp output dir to avoid archiving the archive itself
      '--exclude=.deploy',
      '--exclude=.deploy/*',
      '--exclude=client/node_modules',
      '--exclude=server/node_modules',
      '--exclude=.git',
      '--exclude=.gitignore',
      '--exclude=.DS_Store',
      '--exclude=**/.next',
      '--exclude=**/.vite',
      '--exclude=**/dist',
      '--exclude=**/build',
      '--exclude=**/coverage',
      '--exclude=**/.turbo',
      '--exclude=**/.cache',
    ].join(' ');
    
    // On Windows (bsdtar), use -L flag to follow symlinks
    // On Linux/Mac (GNU tar), use --dereference for the same effect
    const symlinkFlag = isWindows ? '-L' : '--dereference';
    const cmd = `tar ${symlinkFlag} -czf "${outFile}" ${excludes} -C "${workspaceRoot}" .`;
    await runCommand(cmd);
    return { archivePath: outFile, archiveName: basename(outFile), archiveType: 'tar.gz' };
  }

  // Fallback to ZIP via PowerShell on Windows
  if (isWindows) {
    const outFile = join(outDir, `${archiveBase}.zip`);
    const psCmd = [
      'powershell',
      '-NoProfile',
      '-Command',
      // Compress-Archive -Path <root>\* -DestinationPath <out> -Force
      `Compress-Archive -Path "${join(workspaceRoot, '*')}" -DestinationPath "${outFile}" -Force`,
    ].join(' ');
    await runCommand(psCmd);
    return { archivePath: outFile, archiveName: basename(outFile), archiveType: 'zip' };
  }

  throw new Error('Could not find tar on this system; please install tar or run on a system with tar available.');
}

async function promptForInputs() {
  const rl = createInterface({ input, output });
  const defaults = {
    zone: 'us-central1-a',
    machineType: 'e2-micro',
    diskSizeGb: '20',
    serverPort: '3000',
    imageFamily: 'debian-12',
    imageProject: 'debian-cloud',
    networkTag: 'warehouse-sim',
  };

  try {
    const projectId = (await rl.question('GCP Project ID: ')).trim();
    if (!projectId) throw new Error('Project ID is required.');

    const zone = (await rl.question(`Zone [${defaults.zone}]: `)).trim() || defaults.zone;
    const instanceName = (await rl.question('New Instance Name (e.g., warehouse-sim-1): ')).trim();
    if (!instanceName) throw new Error('Instance name is required.');
    const machineType = (await rl.question(`Machine Type [${defaults.machineType}]: `)).trim() || defaults.machineType;
    const diskSizeGb = (await rl.question(`Boot Disk Size GB [${defaults.diskSizeGb}]: `)).trim() || defaults.diskSizeGb;
    const serverPort = (await rl.question(`Server Port [${defaults.serverPort}]: `)).trim() || defaults.serverPort;

    console.log('\n--- Environment Variables (optional, press Enter to skip) ---');
    const litellmBaseUrl = (await rl.question('LITELLM_BASE_URL: ')).trim();
    const litellmApiKey = (await rl.question('LITELLM_API_KEY: ')).trim();
    const litellmModel = (await rl.question('LITELLM_MODEL [gpt-4o-mini]: ')).trim() || 'gpt-4o-mini';

    return {
      projectId,
      zone,
      instanceName,
      machineType,
      diskSizeGb,
      serverPort,
      imageFamily: defaults.imageFamily,
      imageProject: defaults.imageProject,
      networkTag: defaults.networkTag,
      env: {
        LITELLM_BASE_URL: litellmBaseUrl,
        LITELLM_API_KEY: litellmApiKey,
        LITELLM_MODEL: litellmModel,
      },
    };
  } finally {
    rl.close();
  }
}

async function ensureGcloudAvailable() {
  if (!(await commandExists('gcloud'))) {
    throw new Error('gcloud CLI is not installed or not on PATH. Please install and authenticate (gcloud auth login).');
  }
}

async function createInstanceIfNeeded({ projectId, zone, instanceName, machineType, diskSizeGb, imageFamily, imageProject, networkTag }) {
  // Try to describe first to see if it exists
  try {
    await runCommand(`gcloud compute instances describe ${instanceName} --project ${projectId} --zone ${zone} --format="get(name)"`);
    console.log(`Instance "${instanceName}" already exists. Skipping creation.`);
    return;
  } catch {
    // proceed to creation
  }
  console.log(`Creating instance "${instanceName}" in ${zone}...`);
  const createCmd = [
    'gcloud compute instances create', instanceName,
    `--project=${projectId}`,
    `--zone=${zone}`,
    `--machine-type=${machineType}`,
    `--boot-disk-size=${diskSizeGb}GB`,
    `--image-family=${imageFamily}`,
    `--image-project=${imageProject}`,
    `--tags=${networkTag}`,
  ].join(' ');
  await runCommand(createCmd);
}

async function ensureFirewallRule({ projectId, serverPort, networkTag }) {
  const ruleName = `allow-${networkTag}-${serverPort}`;
  try {
    await runCommand(`gcloud compute firewall-rules describe ${ruleName} --project ${projectId} --format="get(name)"`);
    console.log(`Firewall rule "${ruleName}" already exists.`);
    return;
  } catch {
    // create
  }
  console.log(`Creating firewall rule "${ruleName}" to allow tcp:${serverPort}...`);
  const fwCmd = [
    'gcloud compute firewall-rules create', ruleName,
    `--project=${projectId}`,
    `--allow=tcp:${serverPort}`,
    `--direction=INGRESS`,
    `--priority=1000`,
    `--network=default`,
    `--target-tags=${networkTag}`,
    `--source-ranges=0.0.0.0/0`,
  ].join(' ');
  await runCommand(fwCmd);
}

async function ensureSshFirewallRule({ projectId, networkTag }) {
  const ruleName = `allow-${networkTag}-ssh`;
  try {
    await runCommand(`gcloud compute firewall-rules describe ${ruleName} --project ${projectId} --format="get(name)"`);
    console.log(`SSH firewall rule "${ruleName}" already exists.`);
    return;
  } catch {
    // create
  }
  console.log(`Creating SSH firewall rule "${ruleName}" to allow tcp:22...`);
  const fwCmd = [
    'gcloud compute firewall-rules create', ruleName,
    `--project=${projectId}`,
    `--allow=tcp:22`,
    `--direction=INGRESS`,
    `--priority=1000`,
    `--network=default`,
    `--target-tags=${networkTag}`,
    `--source-ranges=0.0.0.0/0`,
  ].join(' ');
  await runCommand(fwCmd);
}

async function ensureIapFirewallRule({ projectId, networkTag }) {
  const ruleName = `allow-${networkTag}-iap`;
  try {
    await runCommand(`gcloud compute firewall-rules describe ${ruleName} --project ${projectId} --format="get(name)"`);
    console.log(`IAP firewall rule "${ruleName}" already exists.`);
    return;
  } catch {
    // create
  }
  console.log(`Creating IAP firewall rule "${ruleName}" to allow IAP tunnel...`);
  const fwCmd = [
    'gcloud compute firewall-rules create', ruleName,
    `--project=${projectId}`,
    `--allow=tcp:22`,
    `--direction=INGRESS`,
    `--priority=1000`,
    `--network=default`,
    `--target-tags=${networkTag}`,
    `--source-ranges=35.235.240.0/20`,
  ].join(' ');
  await runCommand(fwCmd);
}

async function copyArchiveToInstance({ projectId, zone, instanceName, archivePath, archiveName }) {
  console.log('Copying archive to VM via IAP tunnel...');
  const scpBase = [
    'gcloud compute scp',
    `--project=${projectId}`,
    `--zone=${zone}`,
    `--tunnel-through-iap`,
    `"${archivePath}"`,
    `${instanceName}:${archiveName}`,
  ].join(' ');

  // Retry a few times in case the SSH service is not yet ready
  const maxAttempts = 8;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await runCommand(scpBase);
      return;
    } catch (err) {
      if (attempt === maxAttempts) throw err;
      const details = err?.stderr || err?.stdout || err?.message || '';
      console.log(`scp attempt ${attempt}/${maxAttempts} failed. ${details ? `Reason: ${details.trim()}` : ''} Retrying in 5s...`);
      await sleep(5000);
    }
  }
}

async function runRemote({ projectId, zone, instanceName, command }) {
  const sshCmd = [
    'gcloud compute ssh', instanceName,
    `--project=${projectId}`,
    `--zone=${zone}`,
    `--tunnel-through-iap`,
    `--command`, `"${command.replace(/"/g, '\\"')}"`,
  ].join(' ');
  await runCommand(sshCmd);
}

async function waitForSsh({ projectId, zone, instanceName, attempts = 20, intervalMs = 5000 }) {
  console.log('Waiting for SSH to become available on the instance...');
  for (let i = 1; i <= attempts; i += 1) {
    try {
      await runRemote({ projectId, zone, instanceName, command: 'true' });
      console.log('SSH is available.');
      return;
    } catch {
      console.log(`SSH not ready (attempt ${i}/${attempts}). Retrying in ${Math.round(intervalMs / 1000)}s...`);
      await sleep(intervalMs);
    }
  }
  throw new Error('SSH did not become available in time.');
}

async function tryStartInstance({ projectId, zone, instanceName }) {
  try {
    await runCommand(`gcloud compute instances start ${instanceName} --project ${projectId} --zone ${zone}`);
  } catch {
    // ignore if already running
  }
}

async function getWindowsHostkeyFlag({ projectId, zone, instanceName }) {
  if (process.platform !== 'win32') return '';
  try {
    const dry = await runCommand(
      `gcloud compute ssh ${instanceName} --project ${projectId} --zone ${zone} --dry-run`,
    );
    // Look for -hostkey "<value>" or -hostkey <value>
    const match = dry.match(/-hostkey\s+("([^"]+)"|(\S+))/);
    if (match) {
      const value = match[2] || match[3] || '';
      return value ? `-hostkey "${value}"` : '';
    }
  } catch {
    // ignore
  }
  return '';
}

async function setupAndRunOnInstance({ projectId, zone, instanceName, archiveName, archiveType, serverPort, env }) {
  console.log('Preparing VM and starting Dockerized server...');
  // Update packages and install docker & unzip
  await runRemote({ projectId, zone, instanceName, command: 'sudo apt-get update -y' });
  await runRemote({ projectId, zone, instanceName, command: 'sudo apt-get install -y docker.io unzip' });
  await runRemote({ projectId, zone, instanceName, command: 'sudo systemctl enable --now docker' });
  await runRemote({ projectId, zone, instanceName, command: 'mkdir -p ~/app' });

  // Verify archive exists
  console.log('Verifying archive on VM...');
  await runRemote({ projectId, zone, instanceName, command: `ls -lh ~/${archiveName}` });

  if (archiveType === 'tar.gz') {
    await runRemote({
      projectId, zone, instanceName,
      command: `tar -xzf ~/${archiveName} -C ~/app`,
    });
  } else {
    await runRemote({
      projectId, zone, instanceName,
      command: `unzip -o ~/${archiveName} -d ~/app`,
    });
  }

  // Build and run the server container
  await runRemote({
    projectId, zone, instanceName,
    command: `bash -lc 'cd ~/app/server && sudo docker rm -f warehouse-server || true'`,
  });
  await runRemote({
    projectId, zone, instanceName,
    command: `bash -lc 'cd ~/app/server && sudo docker build -t warehouse-server .'`,
  });

  // Build docker run command with environment variables
  const envFlags = [];
  envFlags.push(`-e PORT=${serverPort}`);
  if (env.LITELLM_BASE_URL) envFlags.push(`-e LITELLM_BASE_URL="${env.LITELLM_BASE_URL}"`);
  if (env.LITELLM_API_KEY) envFlags.push(`-e LITELLM_API_KEY="${env.LITELLM_API_KEY}"`);
  if (env.LITELLM_MODEL) envFlags.push(`-e LITELLM_MODEL="${env.LITELLM_MODEL}"`);

  const dockerRunCmd = `sudo docker run -d --name warehouse-server -p ${serverPort}:${serverPort} ${envFlags.join(' ')} --restart unless-stopped warehouse-server`;
  await runRemote({
    projectId, zone, instanceName,
    command: dockerRunCmd,
  });
}

async function getInstanceIp({ projectId, zone, instanceName }) {
  const out = await runCommand(
    `gcloud compute instances describe ${instanceName} --project ${projectId} --zone ${zone} --format="get(networkInterfaces[0].accessConfigs[0].natIP)"`
  );
  return out.trim();
}

async function probeHealth({ ip, port, attempts = 12, intervalMs = 5000 }) {
  const url = `http://${ip}:${port}/health`;
  for (let i = 1; i <= attempts; i += 1) {
    try {
      const res = await fetch(url, { method: 'GET' });
      if (res.ok) {
        const body = await res.text();
        return { ok: true, status: res.status, body };
      }
    } catch {
      // ignore and retry
    }
    console.log(`Health check attempt ${i}/${attempts} failed. Retrying in ${Math.round(intervalMs / 1000)}s...`);
    await sleep(intervalMs);
  }
  return { ok: false, status: 0, body: '' };
}

async function main() {
  console.log('Validating prerequisites...');
  await ensureGcloudAvailable();

  const answers = await promptForInputs();
  const workspaceRoot = getWorkspaceRoot();
  const outDir = join(workspaceRoot, '.deploy');
  ensureDir(outDir);

  console.log('Creating project archive...');
  const { archivePath, archiveName, archiveType } = await createArchive({ workspaceRoot, outDir });

  try {
    await createInstanceIfNeeded(answers);
    await tryStartInstance({ projectId: answers.projectId, zone: answers.zone, instanceName: answers.instanceName });
    await ensureIapFirewallRule({ projectId: answers.projectId, networkTag: answers.networkTag });
    await ensureFirewallRule({ projectId: answers.projectId, serverPort: answers.serverPort, networkTag: answers.networkTag });
    await waitForSsh({ projectId: answers.projectId, zone: answers.zone, instanceName: answers.instanceName });
    await copyArchiveToInstance({ projectId: answers.projectId, zone: answers.zone, instanceName: answers.instanceName, archivePath, archiveName });
    await setupAndRunOnInstance({
      projectId: answers.projectId,
      zone: answers.zone,
      instanceName: answers.instanceName,
      archiveName,
      archiveType,
      serverPort: answers.serverPort,
      env: answers.env,
    });

    console.log('Fetching instance public IP...');
    const ip = await getInstanceIp({ projectId: answers.projectId, zone: answers.zone, instanceName: answers.instanceName });
    console.log(`Instance IP: ${ip}`);

    console.log('Probing health endpoint...');
    const result = await probeHealth({ ip, port: answers.serverPort });
    if (result.ok) {
      console.log(`Health check succeeded with status ${result.status}. URL: http://${ip}:${answers.serverPort}/health`);
      console.log(`Body: ${result.body}`);
    } else {
      console.error('Health check failed after multiple attempts. Please SSH into the VM and inspect Docker logs:\n  sudo docker logs warehouse-server -n 200');
      process.exitCode = 1;
    }
  } finally {
    // Clean local archive
    try {
      if (existsSync(archivePath)) rmSync(archivePath, { force: true });
    } catch {
      // ignore
    }
  }
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});


