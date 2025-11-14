import 'dotenv/config';
import express from 'express';
import { promises as fs } from 'node:fs';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, '..');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(join(__dirname, 'public')));
// Serve video files
app.use('/videos', express.static(resolve(ROOT_DIR, 'pipeline', 'videos')));

// API Routes
app.get('/api/status', async (req, res) => {
  try {
    const queuePath = resolve(ROOT_DIR, 'queue.json');
    const queue = existsSync(queuePath) 
      ? JSON.parse(await fs.readFile(queuePath, 'utf8'))
      : [];

    const scriptsDir = resolve(ROOT_DIR, 'pipeline', 'scripts');
    const audioDir = resolve(ROOT_DIR, 'pipeline', 'audio');
    const videosDir = resolve(ROOT_DIR, 'pipeline', 'videos');
    const metaDir = resolve(ROOT_DIR, 'pipeline', 'meta');

    const stats = {
      queue: {
        total: queue.length,
        queued: queue.filter((q) => q.status === 'queued').length,
        scripted: queue.filter((q) => q.status === 'scripted').length,
        voiced: queue.filter((q) => q.status === 'voiced').length,
        rendered: queue.filter((q) => q.status === 'rendered').length,
        uploaded: queue.filter((q) => q.status === 'uploaded').length
      },
      files: {
        scripts: existsSync(scriptsDir) ? readdirSync(scriptsDir).length : 0,
        audio: existsSync(audioDir) ? readdirSync(audioDir).filter(f => f.endsWith('.mp3')).length : 0,
        videos: existsSync(videosDir) ? readdirSync(videosDir).filter(f => f.endsWith('.mp4')).length : 0,
        meta: existsSync(metaDir) ? readdirSync(metaDir).length : 0
      },
      recent: queue.slice(-10).reverse()
    };

    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/queue', async (req, res) => {
  try {
    const queuePath = resolve(ROOT_DIR, 'queue.json');
    const queue = existsSync(queuePath)
      ? JSON.parse(await fs.readFile(queuePath, 'utf8'))
      : [];
    res.json(queue);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/videos', async (req, res) => {
  try {
    const videosDir = resolve(ROOT_DIR, 'pipeline', 'videos');
    if (!existsSync(videosDir)) {
      return res.json([]);
    }
    const files = readdirSync(videosDir);
    const videoFiles = await Promise.all(
      files
        .filter((f) => f.endsWith('.mp4'))
        .map(async (f) => {
          const id = f.replace('.mp4', '');
          const jsonFile = files.find((j) => j === `${id}.json`);
          let metadata = {};
          if (jsonFile) {
            try {
              const raw = await fs.readFile(resolve(videosDir, jsonFile), 'utf8');
              metadata = JSON.parse(raw);
            } catch (e) {
              // ignore
            }
          }
          const videoPath = resolve(videosDir, f);
          const stats = statSync(videoPath);
          return {
            id,
            filename: f,
            url: `/videos/${f}`,
            path: videoPath,
            size: stats.size,
            metadata
          };
        })
    );
    res.json(videoFiles);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/run/:step', async (req, res) => {
  try {
    const { step } = req.params;
    const { count = 1, category = 'interesting-facts', privacy = 'unlisted' } = req.body;

    let command;
    switch (step) {
      case 'topics':
        command = `node src/topic-generator.js --count=${count} --category="${category}"`;
        break;
      case 'scripts':
        command = 'node src/script-generator.js';
        break;
      case 'tts':
        command = 'node src/tts-generator.js';
        break;
      case 'subtitles':
        command = 'node src/subtitle-sync.js --mode=file';
        break;
      case 'meta':
        command = 'node src/meta-generator.js';
        break;
      case 'full':
        command = `node pipeline/run_all.js --count=${count} --category="${category}" --privacy=${privacy}`;
        break;
      default:
        return res.status(400).json({ error: 'Invalid step' });
    }

    execSync(command, { 
      cwd: ROOT_DIR,
      stdio: 'inherit',
      env: { ...process.env }
    });

    res.json({ success: true, message: `Step ${step} completed` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Shorts Auto Dashboard running at http://localhost:${PORT}`);
});

