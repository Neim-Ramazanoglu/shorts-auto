import 'dotenv/config';
import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, '..');
const QUEUE_PATH = resolve(ROOT_DIR, 'queue.json');

const CATEGORY_SEEDS = {
  general: [
    'Daily motivation boost',
    'Morning productivity ritual',
    'Quick creativity exercise',
    'Rapid wellness check-in',
    'Time-saving tech tip'
  ],
  'interesting-facts': [
    'Surprising space facts you can share in 30 seconds',
    'Strange animal adaptations you have never heard of',
    'Hidden history behind common objects',
    'Unbelievable facts about the human body',
    'Record-breaking scientific discoveries'
  ],
  productivity: [
    'Two-minute focus method',
    'Keyboard shortcuts that save hours',
    'Micro habits for deep work',
    'Desk setup tweaks for posture',
    'Planning ritual for Sundays'
  ],
  history: [
    '30-second recap of the printing press revolution',
    'Unknown heroes of World War II',
    'How the Silk Road shaped global trade',
    'Origins of everyday inventions',
    'Ancient myths explained quickly'
  ],
  'islam-tarihi': [
    'Hz. Muhammed\'in hicret yolculuğu',
    'Endülüs medeniyetinin altın çağı',
    'İstanbul\'un fethinin bilinmeyen detayları',
    'Abbasi halifeliğinin bilimsel katkıları',
    'Osmanlı\'nın ilk fetihleri',
    'Mekke\'nin fethi ve sonuçları',
    'İslam\'ın yayılışında önemli anlar',
    'Halifeler dönemindeki önemli olaylar'
  ],
  'dini-icerikler': [
    'Kur\'an\'dan ilham verici ayetler',
    'Peygamber kıssalarından dersler',
    'İslam\'da sabır ve şükür',
    'Namazın manevi faydaları',
    'Zekat ve sadakanın önemi',
    'Hac ve umre hakkında bilinmeyenler',
    'İslam ahlakı ve günlük hayat',
    'Dua ve zikirlerin gücü',
    'İslam\'da kadın hakları',
    'Modern dünyada İslami değerler'
  ]
};

function parseArgs(argv) {
  return argv.reduce((acc, arg) => {
    if (!arg.startsWith('--')) return acc;
    const [key, value = 'true'] = arg.slice(2).split('=');
    acc[key] = value;
    return acc;
  }, {});
}

function pickTopic(category) {
  const normalized = category && CATEGORY_SEEDS[category]
    ? category
    : 'general';

  const topics = CATEGORY_SEEDS[normalized] ?? CATEGORY_SEEDS.general;
  return topics[Math.floor(Math.random() * topics.length)];
}

function toTags(topic, category) {
  const slugged = topic
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .split(' ')
    .filter(Boolean);
  const unique = Array.from(new Set([category, ...slugged].filter(Boolean)));
  return unique.slice(0, 6);
}

async function ensureQueueFile() {
  if (!existsSync(QUEUE_PATH)) {
    await fs.writeFile(QUEUE_PATH, '[]', 'utf8');
    console.log(`Created new queue file at ${QUEUE_PATH}`);
  }
}

async function readQueue() {
  await ensureQueueFile();
  const data = await fs.readFile(QUEUE_PATH, 'utf8');
  try {
    return JSON.parse(data);
  } catch {
    console.warn('queue.json was invalid JSON. Resetting file.');
    return [];
  }
}

async function writeQueue(entries) {
  await fs.writeFile(QUEUE_PATH, JSON.stringify(entries, null, 2), 'utf8');
}

function buildEntries(count, category) {
  const now = Date.now();
  return Array.from({ length: count }, (_, index) => {
    const topic = pickTopic(category);
    return {
      id: `topic-${now}-${index}`,
      topic,
      tags: toTags(topic, category),
      priority: Math.ceil(Math.random() * 3),
      createdAt: new Date().toISOString(),
      status: 'queued'
    };
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const count = Math.max(1, parseInt(args.count ?? '1', 10));
  const category = args.category ?? 'general';

  const queue = await readQueue();
  const entries = buildEntries(count, category);
  const enrichedEntries = entries.map((entry) => ({
    ...entry,
    topic: entry.topic,
    tags: entry.tags.length ? entry.tags : [category]
  }));

  const nextQueue = queue.concat(enrichedEntries);
  await writeQueue(nextQueue);

  console.log(`Appended ${enrichedEntries.length} topic(s) to queue.json:`);
  enrichedEntries.forEach((entry) => {
    console.log(`- [${entry.id}] ${entry.topic} (${entry.tags.join(', ')})`);
  });
}

main().catch((error) => {
  console.error('Failed to generate topics:', error);
  process.exitCode = 1;
});

