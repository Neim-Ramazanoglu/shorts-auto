import 'dotenv/config';
import { promises as fs } from 'node:fs';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, '..');
const QUEUE_PATH = resolve(ROOT_DIR, 'queue.json');
const SCRIPTS_DIR = resolve(ROOT_DIR, 'pipeline', 'scripts');

// Helper function to remove emojis and special symbols from text
function removeEmojis(text) {
  if (!text) return text;
  return text
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E0}-\u{1F1FF}]/gu, '')
    .replace(/[\u{1F004}\u{1F0CF}\u{1F170}-\u{1F251}\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
    .replace(/[👀👁️🎬🎥🎯🎨🎭🎪🎤🎧🎵🎶🎹🎸🎺🎻🥁🎼🔥💡✨⭐🌟💫🚀🎉🎊🎈🎁🏆🥇🥈🥉💪👍👏🙌🤝💰💸💵💴💶💷💳💎📱📲📞☎️📧📨📩📤📥📦📫📪📬📭📮📯📜📃📄📰🗞️📑🔖🏷️💼📁📂🗂️📅📆🗓️📇📈📉📊📋📌📍📎🖇️✂️📏📐🔒🔓🔐🔑🗝️🔨⚒️🛠️⚙️🔧🔩⚡🔌💻⌨️🖥️🖨️🖱️🖲️💾💿📀🎮🕹️🏁🚩🎌🏴🏳️👠💕]/g, '')
    .trim();
}

const SYSTEM_PROMPT = `Sen YouTube Shorts scriptleri yazan bir yaratıcı içerik üreticisisin.
20-30 saniyelik videolar için optimize edilmiş, 50-75 kelimelik scriptler oluşturuyorsun.
Hemen ilgi çeken çarpıcı bir giriş, 2-3 hızlı gerçek ve güçlü bir CTA ile bitiriyorsun.
Her script enerjik, dinamik ve YouTube Shorts/TikTok formatına özel olmalı.
ÖNEMLİ: Tüm içerik TÜRKÇE olmalı ve 75 kelimeyi AŞMA!
ÖNEMLİ: Emoji veya özel sembol kullanma, sadece düz metin kullan.`;

function buildUserPrompt(item) {
  const tags = Array.isArray(item.tags) && item.tags.length ? item.tags.join(', ') : 'genel ilgi';
  return `"${item.topic}" konusu için bir YouTube Shorts scripti oluştur.
Kategori etiketleri: ${tags}.
Gereksinimler:
- 50-75 kelime (MAX 75 kelime) - YouTube Shorts için 20-30 saniye hedefi.
- Yapı: Çarpıcı giriş (8-12 kelime) -> 2-3 hızlı gerçek (35-50 kelime) -> Güçlü CTA (8-10 kelime).
- TÜM İÇERİK TÜRKÇE OLMALI.
- Emoji veya özel sembol kullanma, sadece düz metin kullan.
- Şu JSON formatında döndür:
{
  "script": "<tam script metni>",
  "bullets": ["Giriş ...", "Gerçek 1 ...", "Gerçek 2 ...", "Gerçek 3 ...", "CTA ..."],
  "recommendedVoiceSpeed": "normal"
}`;
}

async function ensureQueueFile() {
  if (!existsSync(QUEUE_PATH)) {
    await fs.writeFile(QUEUE_PATH, '[]', 'utf8');
    console.log(`Created queue placeholder at ${QUEUE_PATH}`);
  }
}

async function readQueue() {
  await ensureQueueFile();
  const data = await fs.readFile(QUEUE_PATH, 'utf8');
  try {
    return JSON.parse(data);
  } catch (error) {
    console.warn('queue.json is invalid JSON; resetting.', error);
    return [];
  }
}

async function writeQueue(entries) {
  await fs.writeFile(QUEUE_PATH, JSON.stringify(entries, null, 2), 'utf8');
}

async function ensureScriptsDir() {
  if (!existsSync(SCRIPTS_DIR)) {
    mkdirSync(SCRIPTS_DIR, { recursive: true });
  }
}

async function callLLM(item) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('Missing OPENAI_API_KEY. Please set it in your environment.');
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.7,
      max_tokens: 400,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(item) }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error('OpenAI response missing content.');
  }

  try {
    const parsed = JSON.parse(content);
    // Remove emojis from script and bullets
    if (parsed.script) {
      parsed.script = removeEmojis(parsed.script);
    }
    if (Array.isArray(parsed.bullets)) {
      parsed.bullets = parsed.bullets.map(b => removeEmojis(b));
    }
    return parsed;
  } catch {
    return {
      script: removeEmojis(content),
      bullets: [],
      recommendedVoiceSpeed: 'normal'
    };
  }
}

async function processQueue() {
  await ensureScriptsDir();
  const queue = await readQueue();
  const queuedItems = queue.filter((item) => item.status === 'queued');

  if (!queuedItems.length) {
    console.log('No queued topics found.');
    return;
  }

  for (const item of queuedItems) {
    try {
      const llmResult = await callLLM(item);
      const scriptRecord = {
        id: item.id,
        script: llmResult.script ?? '',
        bullets: Array.isArray(llmResult.bullets) ? llmResult.bullets : [],
        recommendedVoiceSpeed: llmResult.recommendedVoiceSpeed ?? 'normal',
        createdAt: new Date().toISOString()
      };

      const scriptPath = resolve(SCRIPTS_DIR, `${item.id}.json`);
      await fs.writeFile(scriptPath, JSON.stringify(scriptRecord, null, 2), 'utf8');

      item.status = 'scripted';
      item.scriptPath = scriptPath.replace(`${ROOT_DIR}/`, './');

      console.log(`Scripted ${item.id} -> ${item.scriptPath}`);
    } catch (error) {
      console.error(`Failed to script ${item.id}:`, error.message);
    }
  }

  await writeQueue(queue);
}

processQueue().catch((error) => {
  console.error('Script generator failed:', error);
  process.exitCode = 1;
});

