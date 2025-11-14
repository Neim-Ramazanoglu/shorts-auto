import 'dotenv/config';
import { promises as fs } from 'node:fs';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, basename } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, '..');
const VIDEOS_DIR = resolve(ROOT_DIR, 'pipeline', 'videos');
const META_DIR = resolve(ROOT_DIR, 'pipeline', 'meta');
const SCRIPTS_DIR = resolve(ROOT_DIR, 'pipeline', 'scripts');

const SYSTEM_PROMPT = `Sen viral YouTube Shorts metadata stratejistisin.
Tıklama ve izlenme oranını maksimize etmek için çekici başlıklar, öz açıklamalar ve yüksek sinyal etiketler hazırlıyorsun.
Kısıtlamalar:
- Başlık ≤ 70 karakter, tümü büyük harf spam yok, spesifik ve merak uyandırıcı olmalı.
- Açıklama 150–300 karakter, değer önerisi + CTA içermeli.
- Etiketler: 8 virgülle ayrılmış anahtar kelime, tümü küçük harf.
- Hashtag'ler: 3–5, genel #shorts #ilgincbilgiler ile niş olanları karıştır.
- Thumbnail metni: 3–7 kelime, cesur ton, okunabilir.
ÖNEMLİ: Tüm içerik TÜRKÇE olmalı.`;

async function ensureMetaDir() {
  if (!existsSync(META_DIR)) {
    mkdirSync(META_DIR, { recursive: true });
  }
}

async function listVideoMetadata() {
  if (!existsSync(VIDEOS_DIR)) return [];
  const files = await fs.readdir(VIDEOS_DIR);
  const jsonFiles = files.filter((file) => file.endsWith('.json'));
  const entries = [];
  for (const file of jsonFiles) {
    const fullPath = resolve(VIDEOS_DIR, file);
    try {
      const raw = await fs.readFile(fullPath, 'utf8');
      const data = JSON.parse(raw);
      entries.push({ id: data.id ?? basename(file, '.json'), data });
    } catch (error) {
      console.warn(`Skipping malformed video metadata ${file}:`, error.message);
    }
  }
  return entries;
}

function needsMetadata(videoEntry) {
  if (!videoEntry?.data) return false;
  if (videoEntry.data.status !== 'rendered') return false;
  const targetPath = resolve(META_DIR, `${videoEntry.id}.json`);
  return !existsSync(targetPath);
}

async function loadScriptContext(id) {
  const scriptPath = resolve(SCRIPTS_DIR, `${id}.json`);
  if (!existsSync(scriptPath)) return {};
  try {
    const raw = await fs.readFile(scriptPath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    console.warn(`Failed to parse script data for ${id}:`, error.message);
    return {};
  }
}

function buildUserPrompt(id, videoData, scriptData) {
  const topic = scriptData.topic ?? scriptData.script?.slice(0, 120) ?? 'Bilinmeyen konu';
  const bullets = Array.isArray(scriptData.bullets)
    ? scriptData.bullets.join(' | ')
    : '';
  const tags = Array.isArray(scriptData.tags) ? scriptData.tags.join(', ') : '';
  const descriptionSeed = scriptData.script?.slice(0, 400) ?? '';

  return `Video ID: ${id}
Konu: ${topic}
Etiketler: ${tags}
Script özeti: ${bullets}
Seslendirme özeti: ${descriptionSeed}

Şu JSON formatında döndür (TÜM İÇERİK TÜRKÇE OLMALI):
{
  "title": "<<=70 karakter, Türkçe>",
  "description": "<150-300 karakter, Türkçe>",
  "tags": ["etiket1", "...", "etiket8"],
  "hashtags": ["#shorts", "#...", "..."],
  "thumbnailText": "Cesur 3-7 kelimelik vurgu metni"
}`;
}

async function callOpenAI(messages) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required for metadata generation.');
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.6,
      messages
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI metadata API error: ${response.status} ${errorText}`);
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error('OpenAI response missing metadata content.');
  }

  return JSON.parse(content);
}

function sanitizeMetadata(meta) {
  const normalized = {
    title: meta.title?.trim().slice(0, 70) ?? '',
    description: meta.description?.trim().slice(0, 320) ?? '',
    tags: Array.isArray(meta.tags) ? meta.tags.slice(0, 8) : [],
    hashtags: Array.isArray(meta.hashtags) ? meta.hashtags.slice(0, 5) : [],
    thumbnailText: meta.thumbnailText?.trim().slice(0, 80) ?? ''
  };

  while (normalized.tags.length < 8) {
    normalized.tags.push('shorts');
  }
  if (!normalized.hashtags.length) {
    normalized.hashtags = ['#shorts', '#foryou'];
  }
  return normalized;
}

async function saveMetadata(id, metadata) {
  const targetPath = resolve(META_DIR, `${id}.json`);
  await fs.writeFile(targetPath, JSON.stringify(metadata, null, 2), 'utf8');
  return targetPath;
}

async function updateVideoRecord(id, metaPath) {
  const videoJsonPath = resolve(VIDEOS_DIR, `${id}.json`);
  if (!existsSync(videoJsonPath)) return;
  try {
    const raw = await fs.readFile(videoJsonPath, 'utf8');
    const data = JSON.parse(raw);
    data.metaPath = metaPath.replace(`${ROOT_DIR}/`, './');
    data.metaGeneratedAt = new Date().toISOString();
    data.status = data.status === 'rendered' ? 'ready-for-upload' : data.status;
    await fs.writeFile(videoJsonPath, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.warn(`Unable to update video metadata ${id}:`, error.message);
  }
}

async function processVideos() {
  await ensureMetaDir();
  const videos = await listVideoMetadata();
  const targets = videos.filter(needsMetadata);

  if (!targets.length) {
    console.log('No rendered videos pending metadata.');
    return;
  }

  for (const entry of targets) {
    const id = entry.id;
    try {
      const scriptData = await loadScriptContext(id);
      const userPrompt = buildUserPrompt(id, entry.data, scriptData);
      const response = await callOpenAI([
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
      ]);
      const cleaned = sanitizeMetadata(response);
      const metaPath = await saveMetadata(id, cleaned);
      await updateVideoRecord(id, metaPath);
      console.log(`Metadata generated for ${id} -> ${metaPath}`);
    } catch (error) {
      console.error(`Failed to generate metadata for ${id}:`, error.message);
    }
  }
}

processVideos().catch((error) => {
  console.error('Meta generator failed:', error);
  process.exitCode = 1;
});

