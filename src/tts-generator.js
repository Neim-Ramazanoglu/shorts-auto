import 'dotenv/config';
import { promises as fs } from 'node:fs';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, '..');
const SCRIPTS_DIR = resolve(ROOT_DIR, 'pipeline', 'scripts');
const AUDIO_DIR = resolve(ROOT_DIR, 'pipeline', 'audio');

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

// Helper function to remove emojis and special symbols from text
function removeEmojis(text) {
  if (!text) return text;
  return text
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E0}-\u{1F1FF}]/gu, '')
    .replace(/[\u{1F004}\u{1F0CF}\u{1F170}-\u{1F251}\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
    .replace(/[👀👁️🎬🎥🎯🎨🎭🎪🎤🎧🎵🎶🎹🎸🎺🎻🥁🎼🔥💡✨⭐🌟💫🚀🎉🎊🎈🎁🏆🥇🥈🥉💪👍👏🙌🤝💰💸💵💴💶💷💳💎📱📲📞☎️📧📨📩📤📥📦📫📪📬📭📮📯📜📃📄📰🗞️📑🔖🏷️💼📁📂🗂️📅📆🗓️📇📈📉📊📋📌📍📎🖇️✂️📏📐🔒🔓🔐🔑🗝️🔨⚒️🛠️⚙️🔧🔩⚡🔌💻⌨️🖥️🖨️🖱️🖲️💾💿📀🎮🕹️🏁🚩🎌🏴🏳️👠💕]/g, '')
    .trim();
}

async function ensureDirs() {
  if (!existsSync(SCRIPTS_DIR)) {
    throw new Error('Missing pipeline/scripts directory. Run script-generator first.');
  }
  if (!existsSync(AUDIO_DIR)) {
    mkdirSync(AUDIO_DIR, { recursive: true });
  }
}

async function loadScripts() {
  const files = await fs.readdir(SCRIPTS_DIR);
  const jsonFiles = files.filter((file) => file.endsWith('.json'));
  const records = [];

  for (const file of jsonFiles) {
    const filePath = resolve(SCRIPTS_DIR, file);
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      const data = JSON.parse(raw);
      records.push({ path: filePath, data });
    } catch (error) {
      console.warn(`Skipping invalid script file ${file}:`, error.message);
    }
  }

  return records;
}

function getRelativePath(absPath) {
  return absPath.startsWith(ROOT_DIR) ? `.${absPath.substring(ROOT_DIR.length)}` : absPath;
}

function estimateDurationSeconds(text, voiceSpeed = 'normal') {
  const words = text?.split(/\s+/).filter(Boolean).length ?? 0;
  const speedMap = {
    fast: 190,
    dramatic: 110,
    normal: 150
  };
  const wordsPerMinute = speedMap[voiceSpeed] ?? speedMap.normal;
  const minutes = words / wordsPerMinute;
  return Number((minutes * 60).toFixed(1));
}

async function withRetry(fn) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const backoff = RETRY_DELAY_MS * attempt;
      console.warn(`Attempt ${attempt} failed: ${error.message}. Retrying in ${backoff}ms...`);
      /* Simple rate-limit handling: wait before retrying to respect provider quotas.
         In production, inspect provider-specific headers (e.g., Retry-After) and
         increase backoff accordingly. */
      await new Promise((resolveDelay) => setTimeout(resolveDelay, backoff));
    }
  }
  throw lastError;
}

async function synthesizeSpeech(provider, scriptRecord) {
  switch (provider) {
    case 'openai':
      return synthesizeWithOpenAI(scriptRecord);
    case 'elevenlabs':
      return synthesizeWithElevenLabsStub(scriptRecord);
    default:
      throw new Error(`Unsupported TTS provider "${provider}". Use "openai" or "elevenlabs".`);
  }
}

async function synthesizeWithOpenAI(scriptRecord) {
  const apiKey = process.env.OPENAI_API_KEY || process.env.TTS_API_KEY;
  if (!apiKey) {
    throw new Error('Missing OPENAI_API_KEY/TTS_API_KEY for OpenAI TTS.');
  }

  // Select random voice for variety (mix of male and female voices)
  const voices = ['alloy', 'echo', 'onyx', 'nova', 'shimmer', 'onyx', 'echo']; // onyx & echo are male (repeated for balance)
  const selectedVoice = voices[Math.floor(Math.random() * voices.length)];
  
  console.log(`🎤 Using TTS voice: ${selectedVoice} for ${scriptRecord.id}`);
  

  // Remove emojis from script before TTS
  const cleanScript = removeEmojis(scriptRecord.script);
  
  const requestPayload = {
    model: 'tts-1',
    voice: selectedVoice,
    format: 'mp3',
    input: cleanScript
  };

  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(requestPayload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI TTS error: ${response.status} ${errorText}`);
  }

  const audioBuffer = Buffer.from(await response.arrayBuffer());

  return {
    buffer: audioBuffer,
    format: 'mp3',
    voiceSettings: {
      provider: 'openai',
      model: requestPayload.model,
      voice: requestPayload.voice,
      format: requestPayload.format
    }
  };
}

async function synthesizeWithElevenLabsStub(scriptRecord) {
  const apiKey = process.env.TTS_API_KEY || 'stub-key';
  if (!apiKey) {
    throw new Error('Missing TTS_API_KEY for ElevenLabs.');
  }

  /* Replace this stub with a real ElevenLabs call, e.g. POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}
     Include rate-limit handling similar to the OpenAI example. */
  const placeholder = `ElevenLabs placeholder audio for ${scriptRecord.id}`;
  return {
    buffer: Buffer.from(placeholder),
    format: 'wav',
    voiceSettings: {
      provider: 'elevenlabs',
      voice: 'Rachel',
      mock: true
    }
  };
}

async function processScripts() {
  await ensureDirs();
  const provider = process.env.TTS_PROVIDER ?? 'openai';
  const scripts = await loadScripts();
  const pending = scripts.filter((item) => item.data?.status !== 'voiced' || !item.data?.audioPath);

  if (!pending.length) {
    console.log('All scripts already voiced.');
    return;
  }

  for (const entry of pending) {
    const record = entry.data;
    if (!record?.id || !record?.script) {
      console.warn(`Skipping malformed script at ${entry.path}`);
      continue;
    }

    try {
      const result = await withRetry(() => synthesizeSpeech(provider, record));
      const audioFile = resolve(AUDIO_DIR, `${record.id}.${result.format}`);
      const metadataFile = resolve(AUDIO_DIR, `${record.id}.json`);

      await fs.writeFile(audioFile, result.buffer);

      const durationSeconds = estimateDurationSeconds(record.script, record.recommendedVoiceSpeed);
      const metadata = {
        durationSeconds,
        voiceSettings: result.voiceSettings,
        generatedAt: new Date().toISOString()
      };
      await fs.writeFile(metadataFile, JSON.stringify(metadata, null, 2), 'utf8');

      record.audioPath = getRelativePath(audioFile);
      record.audioMetadataPath = getRelativePath(metadataFile);
      record.status = 'voiced';
      record.voicedAt = new Date().toISOString();

      await fs.writeFile(entry.path, JSON.stringify(record, null, 2), 'utf8');
      console.log(`Generated audio for ${record.id} -> ${record.audioPath}`);
    } catch (error) {
      console.error(`Failed to voice ${record.id}:`, error.message);
    }
  }
}

processScripts().catch((error) => {
  console.error('TTS generator failed:', error);
  process.exitCode = 1;
});

