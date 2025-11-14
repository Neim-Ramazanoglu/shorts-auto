import 'dotenv/config';
import { promises as fs, existsSync, createReadStream, readdirSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { basename, dirname, resolve, join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, '..');
const AUDIO_DIR = resolve(ROOT_DIR, 'pipeline', 'audio');
const SCRIPTS_DIR = resolve(ROOT_DIR, 'pipeline', 'scripts');
const VIDEOS_DIR = resolve(ROOT_DIR, 'pipeline', 'videos');

const SUPPORTED_AUDIO_EXTS = ['.mp3', '.wav', '.m4a', '.aac'];

function parseArgs(argv) {
  return argv.reduce((acc, arg) => {
    if (!arg.startsWith('--')) return acc;
    const [key, value = 'true'] = arg.slice(2).split('=');
    acc[key] = value;
    return acc;
  }, {});
}

function listAudioFiles({ audio, id }) {
  if (audio) {
    return [resolve(audio)];
  }
  if (id) {
    const possible = SUPPORTED_AUDIO_EXTS
      .map((ext) => resolve(AUDIO_DIR, `${id}${ext}`))
      .find((file) => existsSync(file));
    return possible ? [possible] : [];
  }
  return SUPPORTED_AUDIO_EXTS.flatMap((ext) => globDir(AUDIO_DIR, ext));
}

function globDir(directory, extension) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((entry) => entry.endsWith(extension))
    .map((entry) => resolve(directory, entry));
}

function idFromPath(filePath) {
  const fileName = basename(filePath);
  const dotIndex = fileName.lastIndexOf('.');
  return dotIndex === -1 ? fileName : fileName.slice(0, dotIndex);
}

function formatTimestamp(seconds) {
  const ms = Math.floor((seconds % 1) * 1000);
  const totalSeconds = Math.floor(seconds);
  const s = totalSeconds % 60;
  const m = Math.floor(totalSeconds / 60) % 60;
  const h = Math.floor(totalSeconds / 3600);
  const pad = (num, size = 2) => String(num).padStart(size, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

function segmentsToSrt(segments) {
  return segments
    .map((segment, index) => {
      const start = formatTimestamp(segment.start);
      const end = formatTimestamp(segment.end);
      const text = segment.text?.trim() ?? '';
      return `${index + 1}\n${start} --> ${end}\n${text}\n`;
    })
    .join('\n');
}

function srtToJson(srtContent) {
  const entries = [];
  const blocks = srtContent.split(/\n{2,}/).map((block) => block.trim());
  for (const block of blocks) {
    if (!block) continue;
    const lines = block.split('\n');
    if (lines.length < 3) continue;
    const timeMatch = lines[1].match(
      /(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})/
    );
    if (!timeMatch) continue;
    entries.push({
      index: Number(lines[0]),
      start: timeMatch[1],
      end: timeMatch[2],
      text: lines.slice(2).join('\n')
    });
  }
  return entries;
}

async function getAudioDuration(audioPath) {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=nk=1:nw=1',
      audioPath
    ]);
    return parseFloat(stdout.trim());
  } catch (error) {
    console.warn('Failed to read duration via ffprobe, defaulting to 60s.', error);
    return 60;
  }
}

async function whisperViaApi(audioPath) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }

  const formData = new FormData();
  formData.append('file', createReadStream(audioPath));
  formData.append('model', 'whisper-1');
  formData.append('response_format', 'verbose_json');

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    body: formData
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI Whisper error: ${response.status} ${text}`);
  }

  const payload = await response.json();
  const segments = payload.segments?.map((segment) => ({
    start: segment.start,
    end: segment.end,
    text: segment.text
  }));
  return segments?.length ? segments : null;
}

async function whisperViaCli(audioPath) {
  const cli = process.env.WHISPER_CLI_PATH || 'whisper';
  const outputDir = await fs.mkdtemp(resolve(ROOT_DIR, '.tmp-whisper-'));
  await execFileAsync(cli, [
    audioPath,
    '--model',
    process.env.WHISPER_MODEL || 'base',
    '--output_format',
    'json',
    '--output_dir',
    outputDir
  ]);
  const jsonName = `${basename(audioPath)}.json`;
  const jsonPath = join(outputDir, jsonName);
  try {
    const raw = await fs.readFile(jsonPath, 'utf8');
    const data = JSON.parse(raw);
    if (Array.isArray(data.segments)) {
      return data.segments.map((segment) => ({
        start: segment.start,
        end: segment.end,
        text: segment.text
      }));
    }
  } finally {
    await fs.rm(outputDir, { recursive: true, force: true });
  }
  return null;
}

async function transcribeAudio(audioPath) {
  try {
    const viaApi = await whisperViaApi(audioPath);
    if (viaApi) return viaApi;
  } catch (error) {
    console.warn('Whisper API failed:', error.message);
  }

  try {
    const viaCli = await whisperViaCli(audioPath);
    if (viaCli) return viaCli;
  } catch (error) {
    console.warn('Whisper CLI failed:', error.message);
  }

  return null;
}

function segmentsFromScript(scriptData, duration) {
  const sentences =
    scriptData?.bullets?.length > 0
      ? scriptData.bullets
      : scriptData?.script
      ? scriptData.script.split(/(?<=[.!?])\s+/)
      : ['Follow for more!'];
  const sliceCount = sentences.length || 1;
  const chunk = duration / sliceCount;
  return sentences.map((sentence, index) => ({
    start: Math.max(0, index * chunk),
    end: Math.min(duration, (index + 1) * chunk),
    text: sentence.trim()
  }));
}

async function burnSubtitles(videoPath, srtPath) {
  const tempPath = `${videoPath}.tmp.mp4`;
  const subtitleFilter = `subtitles=${srtPath.replace(/\\/g, '/')}`;
  await execFileAsync('ffmpeg', [
    '-y',
    '-i',
    videoPath,
    '-vf',
    subtitleFilter,
    '-c:a',
    'copy',
    tempPath
  ]);
  await fs.rename(tempPath, videoPath);
}

async function updateMetadata(id, videoPath, subtitlePath) {
  const metadataPath = resolve(VIDEOS_DIR, `${id}.json`);
  const metadata = {
    id,
    videoPath,
    subtitlePath,
    status: 'rendered',
    updatedAt: new Date().toISOString()
  };
  await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');
  return metadataPath;
}

async function updateScriptRecord(id, subtitlePath) {
  const scriptPath = resolve(SCRIPTS_DIR, `${id}.json`);
  if (!existsSync(scriptPath)) return;
  try {
    const raw = await fs.readFile(scriptPath, 'utf8');
    const data = JSON.parse(raw);
    data.subtitlePath = subtitlePath.replace(`${ROOT_DIR}/`, './');
    data.status = data.status === 'voiced' ? 'rendered' : data.status;
    await fs.writeFile(scriptPath, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.warn(`Unable to update script record ${id}:`, error.message);
  }
}

async function processAudioFile(audioPath, options) {
  const id = idFromPath(audioPath);
  const videoPath = resolve(VIDEOS_DIR, `${id}.mp4`);
  if (!existsSync(videoPath)) {
    console.warn(`Video not found for ${id}, skipping subtitle sync.`);
    return;
  }

  const duration = await getAudioDuration(audioPath);
  const scriptPath = resolve(SCRIPTS_DIR, `${id}.json`);
  let scriptData = {};
  if (existsSync(scriptPath)) {
    const raw = await fs.readFile(scriptPath, 'utf8');
    scriptData = JSON.parse(raw);
  }

  let segments = null;
  if (options.provider !== 'none') {
    segments = await transcribeAudio(audioPath);
  }

  if (!segments || !segments.length) {
    console.log(`Falling back to script-based timings for ${id}`);
    segments = segmentsFromScript(scriptData, duration);
  }

  const srtContent = segmentsToSrt(segments);
  const srtPath = resolve(VIDEOS_DIR, `${id}.srt`);
  await fs.writeFile(srtPath, srtContent, 'utf8');

  if (options.mode === 'burn') {
    await burnSubtitles(videoPath, srtPath);
  }

  await updateMetadata(id, videoPath.replace(`${ROOT_DIR}/`, './'), srtPath.replace(`${ROOT_DIR}/`, './'));
  await updateScriptRecord(id, srtPath);

  const captionsJson = srtToJson(srtContent);
  const captionJsonPath = resolve(VIDEOS_DIR, `${id}.captions.json`);
  await fs.writeFile(captionJsonPath, JSON.stringify(captionsJson, null, 2), 'utf8');

  console.log(
    `Subtitles ready for ${id}: ${options.mode === 'burn' ? 'burned into video' : 'SRT sidecar'}`
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const mode = args.mode === 'burn' ? 'burn' : 'file';
  const provider = args.provider ?? 'whisper';
  const audioPaths = listAudioFiles({ audio: args.audio, id: args.id });

  if (!audioPaths.length) {
    console.log('No audio files found to subtitle.');
    return;
  }

  for (const audioPath of audioPaths) {
    try {
      await processAudioFile(audioPath, { mode, provider });
    } catch (error) {
      console.error(`Subtitle sync failed for ${audioPath}:`, error.message);
    }
  }
}

main().catch((error) => {
  console.error('Subtitle sync crashed:', error);
  process.exitCode = 1;
});

