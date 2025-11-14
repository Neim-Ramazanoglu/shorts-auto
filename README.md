# shorts-auto

Automation skeleton for generating, rendering, and uploading vertical shorts.

## Setup
1. Copy `.env.example` to `.env` and fill in the secrets.
2. Install Node deps if/when you add them (`npm install`).
3. Install Python deps: `python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt`.
4. Install FFmpeg so MoviePy/TextClip can render: `brew install ffmpeg` (macOS), `sudo apt install ffmpeg` (Ubuntu/Debian), or download from [ffmpeg.org](https://ffmpeg.org/download.html). Verify with `ffmpeg -version`.

## Modules
- **E2E Orchestrator**: `npm run generate -- --count=30 --category="interesting-facts" --privacy=unlisted` chains the entire pipeline (topics ➝ scripts ➝ audio ➝ video ➝ captions ➝ metadata ➝ upload). Uses `pipeline/run_all.js` and skips items already marked `uploaded`.
- **Render** (`npm run render`): node entry point that can call Python helpers (e.g., MoviePy) inside `pipeline/`.
- **Upload** (`npm run upload`): handles YouTube API auth using `YOUTUBE_CLIENT_SECRETS_PATH`.
- **Topic Generator**: `node src/topic-generator.js --count=30 --category="interesting-facts"` appends seed topics to `queue.json` ready for downstream automation.
- **Script Generator**: `node src/script-generator.js` reads `queue.json`, calls OpenAI to craft 55–120 word shorts scripts, saves them to `pipeline/scripts/{id}.json`, and updates queue status to `scripted`.
- **TTS Generator**: `node src/tts-generator.js` scans `pipeline/scripts/`, calls the configured TTS provider, writes audio to `pipeline/audio/{id}.mp3` plus metadata, then marks scripts as `voiced`.
- **Video Renderer**: `python pipeline/video_renderer.py --audio pipeline/audio/<id>.mp3 --script pipeline/scripts/<id>.json` stitches stock clips + captions + audio into a final 9:16 video at `pipeline/videos/<id>.mp4`.
- **Subtitle Sync**: `node src/subtitle-sync.js --mode=file` (or `--mode=burn`) scans voiced audio, generates SRT/caption JSON via Whisper (API or CLI), and tags the final video metadata as `rendered`.
- **Metadata Generator**: `node src/meta-generator.js` inspects rendered videos and uses OpenAI to craft titles, descriptions, tags, hashtags, and thumbnail copy saved under `pipeline/meta/{id}.json`.
- **YouTube Uploader**: `node src/youtube-uploader.js --privacy=unlisted` reads rendered videos + metadata, authenticates via OAuth, and uploads to the Shorts channel (supports `--dry-run` and `--auth` token bootstrap).

## Structure
- `src/`: Node entry scripts (generate/render/upload stubs to be added later).
- `pipeline/`: orchestration helpers or Python bridges.
- `assets/`: placeholder for stock video, music, and generated media.
- `templates/`: text or JSON templates for captions/scripts.

## LLM Prompt Reference
- **System**: `You are a concise YouTube Shorts writer. You produce tight narratives that captivate immediately, deliver three fast facts, and close with a compelling call-to-action. Every script must feel energetic, modern, and optimized for vertical video voiceover.`
- **User template**:
  ```
  Create a YouTube Shorts script for topic "<topic>".
  Category tags: <tag list>.
  Requirements:
  - 55 to 120 words.
  - Structure: Hook (1 sentence) -> 3 rapid-fire facts or sentences -> Closing CTA like "Follow for more wild facts".
  - Return strict JSON with shape:
  {
    "script": "<full script text>",
    "bullets": ["Hook ...", "Fact ...", "Fact ...", "Fact ...", "CTA ..."],
    "recommendedVoiceSpeed": "normal|fast|dramatic"
  }
  ```

## Audio / TTS Pipeline
- Set `TTS_PROVIDER=openai` (or `elevenlabs`) and ensure `OPENAI_API_KEY`/`TTS_API_KEY` are available.
- Run `node src/tts-generator.js` to batch convert scripted entries into audio files under `pipeline/audio/`.
- OpenAI example: inside `src/tts-generator.js`, `synthesizeWithOpenAI` demonstrates the JSON request (`model: gpt-4o-mini-tts`, `voice: alloy`, `format: mp3`) and saving the streamed response buffer to disk. Use similar headers/body when swapping providers and respect `Retry-After` for rate limits.

## Video Rendering Pipeline
- Requires FFmpeg + ImageMagick fonts accessible to MoviePy for `TextClip`.
- Ensure `assets/` contains at least one stock video (mp4/mov/etc.) and optional background music (suffix `music` for priority).
- From the virtual env run:  
  `python pipeline/video_renderer.py --audio pipeline/audio/topic-123.mp3 --script pipeline/scripts/topic-123.json`
- The renderer selects a matching stock clip, loops/crops to 1080×1920, overlays hook/facts/CTA text, mixes voice with subtle music, and exports `pipeline/videos/topic-123.mp4` at 30 fps.

## Subtitle / Captions Pipeline
- Whisper API: export `OPENAI_API_KEY`; CLI fallback: install `pip install git+https://github.com/openai/whisper.git` and set `WHISPER_CLI_PATH=whisper`.
- Run `node src/subtitle-sync.js --id=topic-123 --mode=burn` to create `pipeline/videos/topic-123.srt`, caption JSON, and optionally burn subs into the MP4 via FFmpeg.
- Use `--mode=file` to keep sidecar SRTs without altering the video; metadata saved at `pipeline/videos/<id>.json` with `status: rendered`.

## Metadata Pipeline
- Requires `OPENAI_API_KEY`.
- After videos are rendered (and optionally subtitled), run `node src/meta-generator.js` to generate click-friendly metadata for each `pipeline/videos/<id>.json` whose status is `rendered`.
- Outputs `pipeline/meta/<id>.json`, updates the video JSON with `metaPath`, and advances status to `ready-for-upload` to signal downstream publishers.

## YouTube Upload Pipeline
- Install Google client: `npm install` (pulls `googleapis`).
- Create OAuth credentials: in Google Cloud Console enable YouTube Data API v3 → create OAuth client (Desktop App) → download JSON and set `YOUTUBE_CLIENT_SECRETS_PATH=/absolute/path/client_secret.json`.
- Generate a refresh token once: `node src/youtube-uploader.js --auth` → follow URL → paste code → tokens saved to `pipeline/uploads/oauth-token.json` (override via `YOUTUBE_TOKEN_PATH`).
- Upload videos: `node src/youtube-uploader.js --privacy=unlisted` (or `--privacy=private/public`). Use `--dry-run=true` to preview payloads without hitting quota. Successful uploads log to `pipeline/uploads/{id}.json` with the resulting `uploadedVideoId`.

## Automation & Scheduling
- **GitHub Actions**: `.github/workflows/generate.yml` runs daily at 07:00 UTC (or on `workflow_dispatch`). Set repository secrets: `OPENAI_API_KEY`, `TTS_API_KEY`, `YOUTUBE_CLIENT_SECRETS_PATH` (base64 or path in Actions), `YOUTUBE_TOKEN_PATH`, plus any optional provider keys. Actions installs FFmpeg/Python deps and executes `npm run generate -- --count=5`.
- **Crontab example** (server-side hourly):  
  `0 * * * * cd /opt/shorts-auto && export OPENAI_API_KEY=*** TTS_API_KEY=*** YOUTUBE_CLIENT_SECRETS_PATH=/opt/shorts-auto/client_secret.json && /usr/bin/npm run generate -- --count=5 --privacy=unlisted >> /var/log/shorts-auto.log 2>&1`
- Always store secrets via CI secret stores (GitHub Secrets, Doppler, AWS SSM, etc.); never commit API keys or OAuth tokens.
# shorts-auto
