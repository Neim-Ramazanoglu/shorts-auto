import 'dotenv/config';
import { promises as fs, existsSync, mkdirSync, createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, basename } from 'node:path';
import readline from 'node:readline';
import { google } from 'googleapis';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, '..');
const VIDEOS_DIR = resolve(ROOT_DIR, 'pipeline', 'videos');
const META_DIR = resolve(ROOT_DIR, 'pipeline', 'meta');
const UPLOADS_DIR = resolve(ROOT_DIR, 'pipeline', 'uploads');
const VIDEOS_JSON_DIR = resolve(ROOT_DIR, 'pipeline', 'videos');
const SCRIPTS_DIR = resolve(ROOT_DIR, 'pipeline', 'scripts');

const SCOPES = ['https://www.googleapis.com/auth/youtube.upload'];
const DEFAULT_PRIVACY = 'private';

function parseArgs(argv) {
  return argv.reduce((acc, arg) => {
    if (!arg.startsWith('--')) return acc;
    const [key, value = 'true'] = arg.slice(2).split('=');
    acc[key] = value;
    return acc;
  }, {});
}

function ensureDir(dirPath) {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

async function readJSON(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function writeJSON(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function getVideoIdFromPath(videoPath) {
  const name = basename(videoPath);
  return name.replace(/\.mp4$/i, '');
}

async function listVideos(filterId) {
  if (!existsSync(VIDEOS_DIR)) return [];
  const files = await fs.readdir(VIDEOS_DIR);
  const mp4s = files.filter((file) => file.endsWith('.mp4'));
  const targets = filterId
    ? mp4s.filter((file) => file === `${filterId}.mp4`)
    : mp4s;
  return targets.map((file) => resolve(VIDEOS_DIR, file));
}

async function loadMetaForId(id) {
  const metaPath = resolve(META_DIR, `${id}.json`);
  if (!existsSync(metaPath)) {
    throw new Error(`Missing metadata for ${id}. Expected ${metaPath}`);
  }
  return readJSON(metaPath);
}

function getTokenPath() {
  return (
    process.env.YOUTUBE_TOKEN_PATH ??
    resolve(ROOT_DIR, 'pipeline', 'uploads', 'oauth-token.json')
  );
}

async function loadClientCredentials() {
  const secretsPath =
    process.env.YOUTUBE_CLIENT_SECRETS_PATH ??
    resolve(ROOT_DIR, 'client_secret.json');
  if (!existsSync(secretsPath)) {
    throw new Error(
      `YOUTUBE_CLIENT_SECRETS_PATH not found. Provide OAuth client JSON from Google Cloud: ${secretsPath}`
    );
  }
  return readJSON(secretsPath);
}

async function authorize(interactive = false) {
  const credentials = await loadClientCredentials();
  const clientInfo = credentials.installed ?? credentials.web;
  if (!clientInfo) {
    throw new Error('Client secrets JSON missing "installed" or "web" keys.');
  }

  const { client_id, client_secret, redirect_uris } = clientInfo;
  const oauth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris?.[0]
  );

  const tokenPath = getTokenPath();
  if (existsSync(tokenPath) && !interactive) {
    const token = await readJSON(tokenPath);
    oauth2Client.setCredentials(token);
    return oauth2Client;
  }

  if (!interactive && !existsSync(tokenPath)) {
    throw new Error(
      `Missing OAuth token. Run "node src/youtube-uploader.js --auth" to generate one.`
    );
  }

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent'
  });
  console.log('Authorize this app by visiting:', authUrl);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const code = await new Promise((resolvePromise) => {
    rl.question('Enter the code from that page here: ', (answer) => {
      rl.close();
      resolvePromise(answer.trim());
    });
  });

  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  ensureDir(dirname(tokenPath));
  await writeJSON(tokenPath, tokens);
  console.log(`Tokens saved to ${tokenPath}`);
  return oauth2Client;
}

async function uploadVideo({ videoPath, meta, privacyStatus, dryRun, auth }) {
  const id = getVideoIdFromPath(videoPath);
  const uploadsLog = resolve(UPLOADS_DIR, `${id}.json`);

  if (existsSync(uploadsLog) && dryRun !== 'true') {
    console.log(`Upload record exists for ${id}, skipping.`);
    return;
  }

  if (dryRun === 'true') {
    console.log(
      `[DRY RUN] Would upload ${id} with title="${meta.title}" privacy=${privacyStatus}`
    );
    return;
  }

  const youtube = google.youtube({ version: 'v3', auth });

  try {
    const response = await youtube.videos.insert({
      part: ['snippet', 'status'],
      notifySubscribers: false,
      requestBody: {
        snippet: {
          title: meta.title,
          description: meta.description,
          tags: meta.tags,
          categoryId: '22'
        },
        status: {
          privacyStatus
        }
      },
      media: {
        body: createReadStream(videoPath)
      }
    });

    const uploadedVideoId = response.data.id;
    console.log(`Uploaded ${id} -> https://youtube.com/watch?v=${uploadedVideoId}`);

    ensureDir(UPLOADS_DIR);
    await writeJSON(uploadsLog, {
      id,
      uploadedVideoId,
      timestamp: new Date().toISOString(),
      privacyStatus,
      metaPath: meta._path,
      videoPath: videoPath.replace(`${ROOT_DIR}/`, './')
    });
    await markVideoStatus(id, uploadedVideoId);
  } catch (error) {
    const reason = error?.errors?.[0]?.reason ?? error.message;
    if (reason?.includes('quota')) {
      console.error(
        `Quota error while uploading ${id}. Retry later or request higher quota.`
      );
    } else {
      console.error(`Failed to upload ${id}:`, reason);
    }
  }
}

async function markVideoStatus(id, uploadedVideoId) {
  const videoJsonPath = resolve(VIDEOS_JSON_DIR, `${id}.json`);
  if (existsSync(videoJsonPath)) {
    try {
      const raw = await fs.readFile(videoJsonPath, 'utf8');
      const data = JSON.parse(raw);
      data.status = 'uploaded';
      data.uploadedVideoId = uploadedVideoId;
      data.uploadedAt = new Date().toISOString();
      await fs.writeFile(videoJsonPath, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
      console.warn(`Unable to update video JSON for ${id}:`, error.message);
    }
  }

  const scriptPath = resolve(SCRIPTS_DIR, `${id}.json`);
  if (existsSync(scriptPath)) {
    try {
      const raw = await fs.readFile(scriptPath, 'utf8');
      const data = JSON.parse(raw);
      data.status = 'uploaded';
      data.uploadedVideoId = uploadedVideoId;
      data.uploadedAt = new Date().toISOString();
      await fs.writeFile(scriptPath, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
      console.warn(`Unable to update script JSON for ${id}:`, error.message);
    }
  }
}

async function processUploads(args) {
  const dryRun = args['dry-run'] === 'true' ? 'true' : 'false';
  const privacyStatus = args.privacy ?? DEFAULT_PRIVACY;
  const filterId = args.id;

  ensureDir(META_DIR);
  ensureDir(VIDEOS_DIR);
  ensureDir(UPLOADS_DIR);

  const videos = await listVideos(filterId);
  if (!videos.length) {
    console.log('No rendered videos found to upload.');
    return;
  }

  const auth = args['dry-run'] === 'true' ? null : await authorize(false);

  for (const videoPath of videos) {
    const id = getVideoIdFromPath(videoPath);
    try {
      const meta = await loadMetaForId(id);
      meta._path = resolve(META_DIR, `${id}.json`).replace(`${ROOT_DIR}/`, './');
      await uploadVideo({ videoPath, meta, privacyStatus, dryRun, auth });
    } catch (error) {
      console.error(`Skipping ${id}:`, error.message);
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.auth === 'true') {
    await authorize(true);
    return;
  }
  await processUploads(args);
}

main().catch((error) => {
  console.error('YouTube uploader failed:', error);
  process.exitCode = 1;
});

