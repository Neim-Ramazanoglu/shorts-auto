import argparse
import json
import random
from pathlib import Path

try:
    # MoviePy 2.x
    from moviepy import AudioFileClip, CompositeAudioClip, CompositeVideoClip, TextClip, VideoFileClip
    from moviepy import audio_fx as afx
    from moviepy import video_fx as vfx
except ImportError:
    # MoviePy 1.x fallback
    from moviepy.editor import (
        AudioFileClip,
        CompositeAudioClip,
        CompositeVideoClip,
        TextClip,
        VideoFileClip,
        afx,
        vfx,
    )

ROOT_DIR = Path(__file__).resolve().parents[1]
ASSETS_DIR = ROOT_DIR / "assets"
SCRIPTS_DIR = ROOT_DIR / "pipeline" / "scripts"
AUDIO_DIR = ROOT_DIR / "pipeline" / "audio"
VIDEOS_DIR = ROOT_DIR / "pipeline" / "videos"

VIDEO_EXTENSIONS = {".mp4", ".mov", ".mkv", ".webm"}
AUDIO_EXTENSIONS = {".mp3", ".wav", ".m4a", ".aac"}


def list_asset_files(extensions):
    return [path for path in ASSETS_DIR.glob("*") if path.suffix.lower() in extensions]


def select_stock_clip(tags):
    clips = list_asset_files(VIDEO_EXTENSIONS)
    if not clips:
        raise FileNotFoundError(
            "No stock video clips found in /assets. Add at least one video file."
        )

    if tags:
        tagged = [
            clip
            for clip in clips
            if any(tag.lower() in clip.name.lower() for tag in tags)
        ]
        if tagged:
            return random.choice(tagged)

    return random.choice(clips)


def select_background_music():
    music_files = [
        path for path in list_asset_files(AUDIO_EXTENSIONS) if "music" in path.name.lower()
    ]
    if music_files:
        return random.choice(music_files)

    # fallback: allow any audio file that is not obviously a voice track
    generic_audio = [
        path
        for path in list_asset_files(AUDIO_EXTENSIONS)
        if "voice" not in path.name.lower()
    ]
    return random.choice(generic_audio) if generic_audio else None


def fit_clip_to_vertical(clip, duration):
    looped = clip.fx(vfx.loop, duration=duration + 0.25)
    if looped.duration < duration:
        looped = looped.fx(vfx.loop, duration=duration + 1)

    resized = looped.resize(height=1920)
    if resized.w < 1080:
        # create blurred background to fill sides
        blurred = (
            resized.fx(vfx.gaussian_blur, sigma=15)
            .resize((1080, 1920))
            .set_opacity(0.6)
        )
        foreground = resized.resize(width=900)
        foreground = foreground.set_position("center")
        return CompositeVideoClip([blurred, foreground], size=(1080, 1920))

    cropped = resized.crop(
        width=1080, height=1920, x_center=resized.w / 2, y_center=resized.h / 2
    )
    return cropped


def build_text_blocks(script_data):
    bullets = script_data.get("bullets") or []
    hook = bullets[0] if bullets else script_data.get("script", "").split(".")[0]
    facts = bullets[1:-1] if len(bullets) > 2 else bullets[1:]
    cta = bullets[-1] if bullets else "Follow for more!"

    blocks = []
    if hook:
        blocks.append(("HOOK", hook.strip()))
    if facts:
        for idx, fact in enumerate(facts, start=1):
            blocks.append((f"FACT {idx}", fact.strip()))
    else:
        blocks.append(("FACT", script_data.get("topic", "Rapid fact burst!")))
    blocks.append(("CTA", cta.strip()))
    return blocks


def create_text_clip(text, start, duration, label):
    caption = f"{label}:\n{text}"
    clip = (
        TextClip(
            caption,
            fontsize=70 if label == "HOOK" else 58,
            font="Arial-Bold",
            color="white",
            stroke_color="black",
            stroke_width=2,
            method="caption",
            align="center",
            size=(900, None),
        )
        .on_color(
            size=(980, None),
            color=(0, 0, 0),
            pos=("center", "center"),
            col_opacity=0.45,
        )
        .set_position(("center", 200 if label == "HOOK" else "center"))
        .set_start(start)
        .set_duration(duration)
    )
    return clip


def build_text_layer(script_data, duration):
    blocks = build_text_blocks(script_data)
    section_duration = max(2.5, duration / len(blocks))
    clips = []
    current_start = 0.0

    for label, text in blocks:
        clip = create_text_clip(text, current_start, section_duration, label)
        clips.append(clip)
        current_start += section_duration * 0.9  # slight overlap for smoother transitions

    return clips


def mix_audio_tracks(voice_clip, background_path):
    tracks = [voice_clip]
    if background_path:
        music = AudioFileClip(str(background_path))
        music_loop = moviepy_audio.fx.all.audio_loop(
            music.volumex(0.25), duration=voice_clip.duration
        )
        tracks.append(music_loop)
    return CompositeAudioClip(tracks)


def render_video(args):
    script_path = Path(args.script).resolve()
    audio_path = Path(args.audio).resolve()

    if not script_path.exists():
        raise FileNotFoundError(f"Script file not found: {script_path}")
    if not audio_path.exists():
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    with open(script_path, "r", encoding="utf-8") as fp:
        script_data = json.load(fp)

    topic_id = script_data.get("id") or script_path.stem

    voice_audio = AudioFileClip(str(audio_path))
    stock_clip_path = select_stock_clip(script_data.get("tags"))
    stock_clip = VideoFileClip(str(stock_clip_path))
    background_clip = fit_clip_to_vertical(stock_clip, voice_audio.duration)

    text_layers = build_text_layer(script_data, voice_audio.duration)

    bg_music_path = select_background_music()
    mixed_audio = mix_audio_tracks(voice_audio, bg_music_path)

    final_clip = CompositeVideoClip(
        [background_clip, *text_layers], size=(1080, 1920)
    ).set_audio(mixed_audio)

    VIDEOS_DIR.mkdir(parents=True, exist_ok=True)
    output_path = VIDEOS_DIR / f"{topic_id}.mp4"

    final_clip.write_videofile(
        str(output_path),
        codec="libx264",
        audio_codec="aac",
        fps=30,
        preset="medium",
        threads=4,
    )

    final_clip.close()
    background_clip.close()
    stock_clip.close()
    voice_audio.close()

    print(f"Rendered video saved to {output_path}")


def parse_args():
    parser = argparse.ArgumentParser(description="Render a vertical short from audio + script.")
    parser.add_argument("--audio", required=True, help="Path to the narrated audio file.")
    parser.add_argument(
        "--script",
        required=True,
        help="Path to the script JSON generated by script-generator.",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    VIDEOS_DIR.mkdir(parents=True, exist_ok=True)
    render_video(args)


if __name__ == "__main__":
    main()

