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

const SYSTEM_PROMPT = `Sen kısa ve öz YouTube Shorts yazarısın.
Hemen dikkat çeken, üç hızlı gerçek sunan ve güçlü bir çağrıyla biten metinler üretiyorsun.
Her script enerjik, modern ve dikey video seslendirmesi için optimize edilmiş olmalı.
ÖNEMLİ: Tüm içerik TÜRKÇE olmalı.`;

function buildUserPrompt(item) {
  const tags = Array.isArray(item.tags) && item.tags.length ? item.tags.join(', ') : 'genel ilgi';
  return `"${item.topic}" konusu için bir YouTube Shorts scripti oluştur.
Kategori etiketleri: ${tags}.
Gereksinimler:
- 55-120 kelime arası.
- Yapı: Giriş (1 cümle) -> 3 hızlı gerçek veya cümle -> Kapanış CTA ("Daha fazlası için takip et" tarzı).
- TÜM İÇERİK TÜRKÇE OLMALI.
- Şu JSON formatında döndür:
{
  "script": "<tam script metni>",
  "bullets": ["Giriş ...", "Gerçek 1 ...", "Gerçek 2 ...", "Gerçek 3 ...", "CTA ..."],
  "recommendedVoiceSpeed": "normal|fast|dramatic"
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
    return JSON.parse(content);
  } catch {
    return {
      script: content,
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

