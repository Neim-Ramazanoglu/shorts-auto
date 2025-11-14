#!/usr/bin/env node
import 'dotenv/config';
import { execSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, '..');
const SCRIPTS_DIR = resolve(ROOT_DIR, 'pipeline', 'scripts');
const AUDIO_DIR = resolve(ROOT_DIR, 'pipeline', 'audio');
const VIDEOS_DIR = resolve(ROOT_DIR, 'pipeline', 'videos');

const AUDIO_EXTS = ['.mp3', '.wav', '.m4a', '.aac'];

function parseArgs(argv) {
  return argv.reduce((acc, arg) => {
    if (!arg.startsWith('--')) return acc;
    const [key, value = 'true'] = arg.slice(2).split('=');
    acc[key] = value;
    return acc;
  }, {});
}

function run(command, env = {}) {
  console.log(`\n▶ ${command}`);
  execSync(command, {
    cwd: ROOT_DIR,
    stdio: 'inherit',
    env: { ...process.env, ...env }
  });
}

async function loadScriptRecords() {
  if (!existsSync(SCRIPTS_DIR)) return [];
  const files = await fs.readdir(SCRIPTS_DIR);
  const jsonFiles = files.filter((file) => file.endsWith('.json'));
  const records = [];
  for (const file of jsonFiles) {
    const path = resolve(SCRIPTS_DIR, file);
    try {
      const raw = await fs.readFile(path, 'utf8');
      const data = JSON.parse(raw);
      records.push({ id: data.id ?? file.replace('.json', ''), path, data });
    } catch (error) {
      console.warn(`Skipping malformed script ${file}:`, error.message);
    }
  }
  return records;
}

function resolveRelativePath(relPath) {
  if (!relPath) return null;
  if (relPath.startsWith('./')) {
    return resolve(ROOT_DIR, relPath.slice(2));
  }
  return resolve(ROOT_DIR, relPath);
}

function findAudioForId(id) {
  for (const ext of AUDIO_EXTS) {
    const candidate = resolve(AUDIO_DIR, `${id}${ext}`);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function videoExists(id) {
  return existsSync(resolve(VIDEOS_DIR, `${id}.mp4`));
}

async function renderPendingVideos(pythonExec = 'python3') {
  const scripts = await loadScriptRecords();
  const candidates = scripts.filter((record) => {
    if (record.data?.status === 'uploaded') return false;
    if (record.data?.status !== 'voiced' && record.data?.status !== 'rendered') {
      return false;
    }
    if (videoExists(record.id)) return false;
    return true;
  });

  if (!candidates.length) {
    console.log('No pending scripts require video rendering.');
    return;
  }

  for (const record of candidates) {
    const audioPath =
      resolveRelativePath(record.data.audioPath) ?? findAudioForId(record.id);
    if (!audioPath || !existsSync(audioPath)) {
      console.warn(`Missing audio for ${record.id}, skipping.`);
      continue;
    }
    const scriptPath = record.path;
    try {
      run(
        `${pythonExec} pipeline/video_renderer.py --audio "${audioPath}" --script "${scriptPath}"`
      );
    } catch (error) {
      console.error(`Video render failed for ${record.id}:`, error.message);
    }
  }
}

async function orchestrate() {
  const args = parseArgs(process.argv.slice(2));
  const count = args.count ?? '1';
  const category = args.category ? ` --category="${args.category}"` : '';
  
  // Use virtual environment Python if available
  const venvPython = resolve(ROOT_DIR, '.venv', 'bin', 'python3');
  const pythonExec = existsSync(venvPython) ? venvPython : (args.python ?? 'python3');
  
  const privacy = args.privacy ?? 'unlisted';
  const dryRun = args['dry-run'] === 'true' ? ' --dry-run=true' : '';

  console.log(`\n🚀 Starting full pipeline with count=${count}, category=${args.category || 'default'}`);
  
  run(`node src/topic-generator.js --count=${count}${category}`);
  run('node src/script-generator.js');
  run('node src/tts-generator.js');
  
  console.log(`\n🎬 Rendering videos with Python: ${pythonExec}`);
  await renderPendingVideos(pythonExec);
  
  run('node src/subtitle-sync.js');
  run('node src/meta-generator.js');
  run(`node src/youtube-uploader.js --privacy=${privacy}${dryRun}`);
  
  console.log(`\n✅ Pipeline complete!`);
}

orchestrate().catch((error) => {
  console.error('run_all orchestrator failed:', error);
  process.exitCode = 1;
});

