import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import { promises as fs } from 'node:fs';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, '..');

// Helper function to remove emojis and special symbols from text
function removeEmojis(text) {
  if (!text) return text;
  // Remove emojis, symbols, and other pictographic characters
  // Keep Turkish characters (ç, ğ, ı, ö, ş, ü, Ç, Ğ, İ, Ö, Ş, Ü), basic Latin, numbers, and punctuation
  return text
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E0}-\u{1F1FF}]/gu, '') // Unicode emoji ranges
    .replace(/[\u{1F004}\u{1F0CF}\u{1F170}-\u{1F251}\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '') // Additional ranges
    .replace(/[👀👁️🎬🎥🎯🎨🎭🎪🎤🎧🎵🎶🎹🎸🎺🎻🥁🎼🔥💡✨⭐🌟💫🚀🎉🎊🎈🎁🏆🥇🥈🥉💪👍👏🙌🤝💰💸💵💴💶💷💳💎📱📲📞☎️📧📨📩📤📥📦📫📪📬📭📮📯📜📃📄📰🗞️📑🔖🏷️💼📁📂🗂️📅📆🗓️📇📈📉📊📋📌📍📎🖇️✂️📏📐🔒🔓🔐🔑🗝️🔨⚒️🛠️⚙️🔧🔩⚡🔌💻⌨️🖥️🖨️🖱️🖲️💾💿📀🎮🕹️🏁🚩🎌🏴🏳️👠💕]/g, '') // Common specific emojis
    .trim();
}

const app = express();
const PORT = process.env.PORT || 3000;

// Configure multer for file uploads
const upload = multer({
  dest: resolve(ROOT_DIR, 'pipeline', 'temp'),
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB
});

app.use(express.json({ limit: '100mb' }));
app.use(express.static(join(__dirname, 'public')));
// Serve video files
app.use('/videos', express.static(resolve(ROOT_DIR, 'pipeline', 'videos')));
// Serve audio files
app.use('/audio', express.static(resolve(ROOT_DIR, 'pipeline', 'audio')));
// Serve assets
app.use('/assets', express.static(resolve(ROOT_DIR, 'assets')));

// YouTube Trends API endpoint
// YouTube Categories endpoint - Get valid categories for a region
app.get('/api/youtube-categories', async (req, res) => {
  try {
    const apiKey = process.env.YOUTUBE_API_KEY;
    
    if (!apiKey || apiKey === 'your_youtube_api_key_here') {
      return res.json({
        error: 'YOUTUBE_API_KEY not configured',
        categories: []
      });
    }
    
    const region = req.query.region || 'TR';
    const url = `https://www.googleapis.com/youtube/v3/videoCategories?part=snippet&regionCode=${region}&key=${apiKey}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`YouTube API error: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    const categories = data.items.map(cat => ({
      id: cat.id,
      title: cat.snippet.title,
      assignable: cat.snippet.assignable
    }));
    
    res.json({
      success: true,
      region,
      categories
    });
    
  } catch (error) {
    console.error('YouTube Categories error:', error);
    res.status(500).json({ 
      error: error.message,
      categories: []
    });
  }
});

app.get('/api/youtube-trends', async (req, res) => {
  try {
    const apiKey = process.env.YOUTUBE_API_KEY;
    
    if (!apiKey || apiKey === 'your_youtube_api_key_here') {
      return res.json({
        error: 'YOUTUBE_API_KEY not configured',
        message: 'Get your free API key from: https://console.cloud.google.com/apis/credentials',
        trends: []
      });
    }
    
    // Fetch trending videos from YouTube Data API v3
    const region = req.query.region || 'TR'; // Default to Turkey
    const maxResults = req.query.maxResults || 50;
    const categoryId = req.query.categoryId; // Optional category filter
    
    // Build URL with optional category filter
    let url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&chart=mostPopular&regionCode=${region}&maxResults=${maxResults}`;
    
    // Add category filter if specified
    if (categoryId && categoryId !== 'all') {
      url += `&videoCategoryId=${categoryId}`;
    }
    
    url += `&key=${apiKey}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`YouTube API error: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Filter for Shorts (duration < 60 seconds) and format data
    const trends = data.items
      .map(video => {
        // Parse duration (PT1M30S format)
        const duration = video.contentDetails.duration;
        const match = duration.match(/PT(?:(\d+)M)?(?:(\d+)S)?/);
        const minutes = parseInt(match?.[1] || '0');
        const seconds = parseInt(match?.[2] || '0');
        const totalSeconds = minutes * 60 + seconds;
        
        // Extract tags/keywords
        const tags = video.snippet.tags || [];
        const title = video.snippet.title;
        
        // Simple keyword extraction from title
        const titleWords = title.split(' ')
          .filter(word => word.length > 3)
          .slice(0, 5);
        
        return {
          id: video.id,
          title: title,
          description: video.snippet.description.substring(0, 200),
          keywords: [...new Set([...tags.slice(0, 5), ...titleWords])],
          views: parseInt(video.statistics.viewCount || 0),
          likes: parseInt(video.statistics.likeCount || 0),
          duration: totalSeconds,
          thumbnail: video.snippet.thumbnails.medium.url,
          channelTitle: video.snippet.channelTitle,
          publishedAt: video.snippet.publishedAt,
          url: `https://www.youtube.com/shorts/${video.id}`
        };
      })
      .filter(video => video.duration <= 60) // Only Shorts (≤60s)
      .sort((a, b) => b.views - a.views) // Sort by views
      .slice(0, 20); // Top 20
    
    res.json({
      success: true,
      region,
      categoryId: categoryId || 'all',
      count: trends.length,
      trends,
      lastUpdated: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('YouTube Trends error:', error);
    res.status(500).json({ 
      error: error.message,
      trends: []
    });
  }
});

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

app.get('/api/metadata', async (req, res) => {
  try {
    const metaDir = resolve(ROOT_DIR, 'pipeline', 'meta');
    const videosDir = resolve(ROOT_DIR, 'pipeline', 'videos');
    
    if (!existsSync(metaDir)) {
      return res.json([]);
    }
    
    const files = readdirSync(metaDir);
    const metaFiles = await Promise.all(
      files
        .filter((f) => f.endsWith('.json'))
        .map(async (f) => {
          const id = f.replace('.json', '');
          try {
            const raw = await fs.readFile(resolve(metaDir, f), 'utf8');
            const metadata = JSON.parse(raw);
            
            // Check if video exists
            const videoPath = resolve(videosDir, `${id}.mp4`);
            const videoExists = existsSync(videoPath);
            
            return {
              id,
              videoId: id,
              title: metadata.title || 'Başlık bulunamadı',
              description: metadata.description || 'Açıklama bulunamadı',
              tags: metadata.tags || [],
              videoExists,
              videoUrl: videoExists ? `/videos/${id}.mp4` : null,
              createdAt: metadata.createdAt || statSync(resolve(metaDir, f)).mtime
            };
          } catch (e) {
            console.error(`Error reading metadata ${f}:`, e);
            return null;
          }
        })
    );
    
    res.json(metaFiles.filter(m => m !== null).sort((a, b) => 
      new Date(b.createdAt) - new Date(a.createdAt)
    ));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/scripts', async (req, res) => {
  try {
    const scriptsDir = resolve(ROOT_DIR, 'pipeline', 'scripts');
    if (!existsSync(scriptsDir)) {
      return res.json([]);
    }
    const files = readdirSync(scriptsDir).filter(f => f.endsWith('.json'));
    const scripts = await Promise.all(
      files.map(async (f) => {
        try {
          const id = f.replace('.json', '');
          const raw = await fs.readFile(resolve(scriptsDir, f), 'utf8');
          const data = JSON.parse(raw);
          return {
            id,
            filename: f,
            ...data
          };
        } catch (e) {
          return null;
        }
      })
    );
    res.json(scripts.filter(s => s !== null));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/audio', async (req, res) => {
  try {
    const audioDir = resolve(ROOT_DIR, 'pipeline', 'audio');
    if (!existsSync(audioDir)) {
      return res.json([]);
    }
    const files = readdirSync(audioDir);
    const audioFiles = await Promise.all(
      files
        .filter((f) => f.endsWith('.mp3'))
        .map(async (f) => {
          const id = f.replace('.mp3', '');
          const jsonFile = files.find((j) => j === `${id}.json`);
          let metadata = {};
          if (jsonFile) {
            try {
              const raw = await fs.readFile(resolve(audioDir, jsonFile), 'utf8');
              metadata = JSON.parse(raw);
            } catch (e) {
              // ignore
            }
          }
          const audioPath = resolve(audioDir, f);
          const stats = existsSync(audioPath) ? statSync(audioPath) : null;
          return {
            id,
            filename: f,
            url: `/audio/${f}`,
            size: stats?.size || 0,
            metadata
          };
        })
    );
    res.json(audioFiles);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/subtitles/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const videosDir = resolve(ROOT_DIR, 'pipeline', 'videos');
    const srtFile = resolve(videosDir, `${id}.srt`);
    const jsonFile = resolve(videosDir, `${id}.json`);
    
    let srtContent = null;
    let jsonData = null;
    
    if (existsSync(srtFile)) {
      srtContent = await fs.readFile(srtFile, 'utf8');
    }
    
    if (existsSync(jsonFile)) {
      try {
        jsonData = JSON.parse(await fs.readFile(jsonFile, 'utf8'));
      } catch (e) {
        // ignore
      }
    }
    
    res.json({
      id,
      srt: srtContent,
      metadata: jsonData
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/subtitles/:id/download', async (req, res) => {
  try {
    const { id } = req.params;
    const videosDir = resolve(ROOT_DIR, 'pipeline', 'videos');
    const srtFile = resolve(videosDir, `${id}.srt`);
    
    if (!existsSync(srtFile)) {
      return res.status(404).json({ error: 'Subtitle file not found' });
    }
    
    const srtContent = await fs.readFile(srtFile, 'utf8');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${id}.srt"`);
    res.send(srtContent);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/assets', async (req, res) => {
  try {
    const assetsDir = resolve(ROOT_DIR, 'assets');
    if (!existsSync(assetsDir)) {
      return res.json([]);
    }
    const files = readdirSync(assetsDir);
    const videoExts = ['.mp4', '.mov', '.mkv', '.webm'];
    const assets = files
      .filter((f) => videoExts.includes(f.toLowerCase().slice(f.lastIndexOf('.'))))
      .map((f) => {
        const stats = statSync(resolve(assetsDir, f));
        return {
          filename: f,
          url: `/assets/${f}`,
          size: stats.size,
          uploadedAt: stats.mtime
        };
      });
    res.json(assets);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/upload-stock-video', async (req, res) => {
  try {
    const { filename, data } = req.body;
    if (!filename || !data) {
      return res.status(400).json({ error: 'filename and data required' });
    }
    
    const assetsDir = resolve(ROOT_DIR, 'assets');
    await fs.mkdir(assetsDir, { recursive: true });
    
    const base64Data = data.replace(/^data:video\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    const filepath = resolve(assetsDir, filename);
    
    await fs.writeFile(filepath, buffer);
    
    res.json({ success: true, message: 'Video uploaded successfully', filename });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/assets/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    const filepath = resolve(ROOT_DIR, 'assets', filename);
    
    if (!existsSync(filepath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    await fs.unlink(filepath);
    res.json({ success: true, message: 'File deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Wizard Endpoints
app.post('/api/wizard/generate-script', async (req, res) => {
  try {
    const { topic } = req.body;
    if (!topic) {
      return res.status(400).json({ error: 'Topic required' });
    }
    
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'OPENAI_API_KEY not configured' });
    }

    // Call OpenAI to generate script
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'Sen bir YouTube Shorts script yazarısın. 50-75 kelimelik, ilgi çekici TÜRKÇE scriptler oluştur. Çarpıcı bir giriş, 2-3 hızlı gerçek ve güçlü bir CTA ile bitir. Konuşulduğunda 20-30 saniye sürmeli. Sadece script metnini döndür, JSON formatı yok. HER ŞEY TÜRKÇE OLMALI. ÖNEMLİ: Emoji veya özel sembol kullanma, sadece düz metin kullan.'
          },
          {
            role: 'user',
            content: `"${topic}" konusu hakkında bir YouTube Shorts scripti yaz (50-75 kelime, 20-30 saniye, TÜRKÇE). Emoji kullanma, sadece düz metin.`
          }
        ],
        temperature: 0.8
      })
    });
    
    if (!response.ok) {
      throw new Error('OpenAI API error');
    }
    
    const data = await response.json();
    let script = data.choices[0].message.content.trim();
    
    // Remove any emojis that might have been included
    script = removeEmojis(script);
    
    const id = 'wizard-' + Date.now();
    
    res.json({ script, id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/wizard/generate-audio', async (req, res) => {
  try {
    let { scriptId, scriptText } = req.body;
    if (!scriptText) {
      return res.status(400).json({ error: 'Script text required' });
    }
    
    // Remove emojis from script before TTS
    scriptText = removeEmojis(scriptText);
    
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'OPENAI_API_KEY not configured' });
    }

    // Select random voice for variety (mix of male and female voices)
    const voices = ['alloy', 'echo', 'onyx', 'nova', 'shimmer', 'onyx', 'echo']; // onyx & echo are male (repeated for balance)
    const selectedVoice = voices[Math.floor(Math.random() * voices.length)];
    
    console.log(`🎤 Using TTS voice: ${selectedVoice}`);
    
    // Call OpenAI TTS
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'tts-1',
        voice: selectedVoice,
        input: scriptText
      })
    });
    
    if (!response.ok) {
      throw new Error('TTS generation failed');
    }
    
    // Save audio file
    const audioDir = resolve(ROOT_DIR, 'pipeline', 'audio');
    await fs.mkdir(audioDir, { recursive: true });
    
    const audioFilename = `${scriptId}.mp3`;
    const audioPath = resolve(audioDir, audioFilename);
    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(audioPath, buffer);
    
    res.json({
      audioPath: `./pipeline/audio/${audioFilename}`,
      audioUrl: `/audio/${audioFilename}`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/wizard/generate-subtitles', async (req, res) => {
  try {
    let { scriptText, audioPath } = req.body;
    if (!scriptText) {
      return res.status(400).json({ error: 'Script text required' });
    }
    
    // Remove emojis from script before generating subtitles
    scriptText = removeEmojis(scriptText);
    
    // Get audio duration using ffprobe
    let audioDuration = null;
    if (audioPath) {
      try {
        const audioFilePath = resolve(ROOT_DIR, audioPath.replace(/^\.\//, ''));
        const ffprobeCmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioFilePath}"`;
        const durationStr = execSync(ffprobeCmd, { encoding: 'utf8' });
        audioDuration = parseFloat(durationStr.trim());
      } catch (err) {
        console.warn('Could not get audio duration:', err.message);
      }
    }
    
    // Simple word-based subtitle generation
    const words = scriptText.split(/\s+/).filter(w => w.length > 0);
    const wordsPerSubtitle = 5;
    
    // Calculate duration per subtitle based on audio length
    const totalSubtitles = Math.ceil(words.length / wordsPerSubtitle);
    const durationPerSubtitle = audioDuration 
      ? audioDuration / totalSubtitles 
      : 2.0; // fallback to 2 seconds per subtitle
    
    const subtitles = [];
    let currentTime = 0;
    
    for (let i = 0; i < words.length; i += wordsPerSubtitle) {
      const chunk = words.slice(i, i + wordsPerSubtitle).join(' ');
      
      subtitles.push({
        start: currentTime.toFixed(2),
        end: (currentTime + durationPerSubtitle).toFixed(2),
        text: chunk
      });
      
      currentTime += durationPerSubtitle;
    }
    
    res.json({ subtitles });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/wizard/finalize-video', upload.array('videos', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'At least one video file required' });
    }
    
    const { scriptId, audioPath, subtitles } = req.body;
    
    // Use virtual environment Python if available
    const venvPython = resolve(ROOT_DIR, '.venv', 'bin', 'python3');
    const pythonExec = existsSync(venvPython) ? venvPython : 'python3';
    
    // Parse audioPath to absolute path
    const audioFile = audioPath.startsWith('./') 
      ? resolve(ROOT_DIR, audioPath.slice(2))
      : resolve(ROOT_DIR, audioPath);
    
    // Get all uploaded video file paths
    const videoFiles = req.files.map(f => f.path);
    
    // Output video ID
    const videoId = scriptId || 'wizard-' + Date.now();
    
    // Write subtitles to temp file to avoid shell escaping issues
    const tempDir = resolve(ROOT_DIR, 'pipeline', 'temp');
    await fs.mkdir(tempDir, { recursive: true });
    const subtitlesFile = resolve(tempDir, `${videoId}-subtitles.json`);
    await fs.writeFile(subtitlesFile, JSON.stringify(JSON.parse(subtitles)));
    
    // Call Python renderer with multiple videos
    const videosArg = videoFiles.map(v => `"${v}"`).join(' ');
    const command = `${pythonExec} pipeline/wizard_video_renderer.py --videos ${videosArg} --audio "${audioFile}" --subtitles-file "${subtitlesFile}" --output-id "${videoId}"`;
    
    console.log(`Running with ${videoFiles.length} video(s):`, command);
    execSync(command, {
      cwd: ROOT_DIR,
      stdio: 'inherit',
      env: { ...process.env, MOVIEPY_DOTENV: '' }
    });
    
    // Clean up temp files
    for (const videoFile of videoFiles) {
      await fs.unlink(videoFile);
    }
    await fs.unlink(subtitlesFile);
    
    res.json({
      success: true,
      videoId,
      videoUrl: `/videos/${videoId}.mp4`,
      videoCount: videoFiles.length
    });
  } catch (error) {
    console.error('Finalize video error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/wizard/auto-generate-video', upload.none(), async (req, res) => {
  try {
    const { scriptId, audioPath, subtitles, scriptText } = req.body;
    
    // Use virtual environment Python if available
    const venvPython = resolve(ROOT_DIR, '.venv', 'bin', 'python3');
    const pythonExec = existsSync(venvPython) ? venvPython : 'python3';
    
    // Parse audioPath to absolute path
    const audioFile = audioPath.startsWith('./') 
      ? resolve(ROOT_DIR, audioPath.slice(2))
      : resolve(ROOT_DIR, audioPath);
    
    // Output video ID
    const videoId = scriptId || 'wizard-auto-' + Date.now();
    
    // Write subtitles to temp file
    const tempDir = resolve(ROOT_DIR, 'pipeline', 'temp');
    await fs.mkdir(tempDir, { recursive: true });
    const subtitlesFile = resolve(tempDir, `${videoId}-subtitles.json`);
    await fs.writeFile(subtitlesFile, JSON.stringify(JSON.parse(subtitles)));
    
    // Call Python auto-generator with stock videos
    const assetsDir = resolve(ROOT_DIR, 'assets');
    const command = `${pythonExec} pipeline/auto_video_generator.py --audio "${audioFile}" --subtitles-file "${subtitlesFile}" --assets-dir "${assetsDir}" --output-id "${videoId}"`;
    
    console.log('Auto-generating video with stock videos...');
    execSync(command, {
      cwd: ROOT_DIR,
      stdio: 'inherit',
      env: { ...process.env, MOVIEPY_DOTENV: '' }
    });
    
    // Clean up temp files
    await fs.unlink(subtitlesFile);
    
    res.json({
      success: true,
      videoId,
      videoUrl: `/videos/${videoId}.mp4`,
      mode: 'auto'
    });
  } catch (error) {
    console.error('Auto-generate video error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Pexels API ile otomatik video oluşturma
app.post('/api/wizard/pexels-generate-video', upload.none(), async (req, res) => {
  try {
    const { scriptId, audioPath, subtitles, scriptText } = req.body;
    
    // Use virtual environment Python if available
    const venvPython = resolve(ROOT_DIR, '.venv', 'bin', 'python3');
    const pythonExec = existsSync(venvPython) ? venvPython : 'python3';
    
    // Parse audioPath to absolute path
    const audioFile = audioPath.startsWith('./') 
      ? resolve(ROOT_DIR, audioPath.slice(2))
      : resolve(ROOT_DIR, audioPath);
    
    // Output video ID
    const videoId = scriptId || 'wizard-pexels-' + Date.now();
    
    // Write subtitles to temp file
    const tempDir = resolve(ROOT_DIR, 'pipeline', 'temp');
    await fs.mkdir(tempDir, { recursive: true });
    const subtitlesFile = resolve(tempDir, `${videoId}-subtitles.json`);
    await fs.writeFile(subtitlesFile, JSON.stringify(JSON.parse(subtitles)));
    
    // Call Pexels video generator
    const command = `${pythonExec} pipeline/pexels_video_generator.py --audio "${audioFile}" --subtitles-file "${subtitlesFile}" --output-id "${videoId}" --script "${scriptText || ''}" --use-pexels`;
    
    console.log('🎬 Generating video with Pexels API...');
    execSync(command, {
      cwd: ROOT_DIR,
      stdio: 'inherit',
      env: {
        ...process.env,
        MOVIEPY_DOTENV: '',  // Disable MoviePy's .env loading
        PEXELS_API_KEY: process.env.PEXELS_API_KEY || '',
        RAW_VIDEOS_DIR: './pipeline/raw_videos',
        AUDIO_DIR: './pipeline/audio',
        OUTPUT_DIR: './pipeline/videos'
      }
    });
    
    // Clean up temp files
    await fs.unlink(subtitlesFile);
    
    res.json({
      success: true,
      videoId,
      videoUrl: `/videos/${videoId}.mp4`,
      mode: 'pexels'
    });
  } catch (error) {
    console.error('Pexels video generation error:', error);
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
      env: { ...process.env, MOVIEPY_DOTENV: '' }
    });

    res.json({ success: true, message: `Step ${step} completed` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Shorts Auto Dashboard running at http://localhost:${PORT}`);
});

