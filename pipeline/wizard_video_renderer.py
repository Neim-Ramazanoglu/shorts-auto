import argparse
import json
import os
from pathlib import Path

# Disable MoviePy's .env loading to avoid permission issues
os.environ['MOVIEPY_DOTENV'] = ''

try:
    # MoviePy 2.x
    from moviepy import AudioFileClip, CompositeVideoClip, TextClip, VideoFileClip, concatenate_videoclips
except ImportError:
    # MoviePy 1.x fallback
    from moviepy.editor import AudioFileClip, CompositeVideoClip, TextClip, VideoFileClip, concatenate_videoclips

ROOT_DIR = Path(__file__).resolve().parents[1]
VIDEOS_DIR = ROOT_DIR / "pipeline" / "videos"


def process_video_clip(video_path):
    """
    Process a single video: resize, crop to 1080x1920
    """
    video_clip = VideoFileClip(str(video_path))
    
    # Resize and crop video to 1080x1920 (9:16 aspect ratio)
    try:
        # MoviePy 2.x
        video_resized = video_clip.resized(height=1920)
        if video_resized.w < 1080:
            video_resized = video_resized.resized(width=1080)
        
        video_cropped = video_resized.cropped(
            x1=(video_resized.w - 1080) / 2,
            y1=0,
            x2=(video_resized.w + 1080) / 2,
            y2=1920
        )
    except AttributeError:
        # MoviePy 1.x fallback
        video_resized = video_clip.resize(height=1920)
        if video_resized.w < 1080:
            video_resized = video_resized.resize(width=1080)
        
        video_cropped = video_resized.crop(
            width=1080,
            height=1920,
            x_center=video_resized.w / 2,
            y_center=video_resized.h / 2
        )
    
    return video_cropped


def render_wizard_video(video_paths, audio_path, subtitles, output_id):
    """
    Combine multiple user-uploaded videos with generated audio and subtitles.
    Videos are split into equal segments and crossfaded together.
    """
    audio_clip = AudioFileClip(str(audio_path))
    total_duration = audio_clip.duration
    
    # Process all videos
    print(f"Processing {len(video_paths)} video(s)...")
    processed_clips = [process_video_clip(vp) for vp in video_paths]
    
    # Calculate duration per video clip
    clip_duration = total_duration / len(processed_clips)
    crossfade_duration = 0.5  # 0.5 seconds crossfade between clips
    
    # Extract clips from each video
    video_segments = []
    for i, clip in enumerate(processed_clips):
        # Get a segment from the middle of the video (better quality usually)
        start_time = max(0, (clip.duration - clip_duration) / 2)
        end_time = min(clip.duration, start_time + clip_duration)
        
        # If video is too short, loop it
        if clip.duration < clip_duration:
            loops_needed = int(clip_duration / clip.duration) + 1
            clip = concatenate_videoclips([clip] * loops_needed)
        
        segment = clip.with_start(0).with_duration(clip_duration)
        video_segments.append(segment)
        print(f"  ✓ Video {i+1}/{len(processed_clips)}: {clip_duration:.2f}s segment extracted")
    
    # Concatenate all video segments
    print("Merging video segments...")
    if len(video_segments) == 1:
        # Single video
        final_video_bg = video_segments[0]
    else:
        # Multiple videos: concatenate with smooth transitions
        # Use method="compose" for smooth transitions
        final_video_bg = concatenate_videoclips(video_segments, method="compose")
    
    # Ensure exact duration match
    final_video_bg = final_video_bg.with_duration(total_duration)
    
    # Create subtitle clips
    print("Adding subtitles...")
    subtitle_clips = []
    for sub in subtitles:
        try:
            start = float(sub['start'])
            end = float(sub['end'])
            text = sub['text']
            
            # Create text clip with Turkish character support
            # Using full font path for Turkish characters
            txt_clip = TextClip(
                text=text,
                font_size=55,
                color='white',
                font='/System/Library/Fonts/Supplemental/Arial Bold.ttf',  # Tam path - Türkçe karakter desteği
                stroke_color='black',
                stroke_width=3,
                method='caption',
                text_align='center',
                size=(950, 300),  # Yükseklik belirtildi - alt kısım kesik olmasın
            )
            
            # Add timing and position (biraz daha yukarıda)
            txt_clip = (
                txt_clip
                .with_position(('center', 1400))  # 1500'den 1400'e düşürüldü
                .with_start(start)
                .with_duration(end - start)
            )
            subtitle_clips.append(txt_clip)
        except Exception as e:
            print(f"  Warning: Failed to create subtitle: {e}")
            continue
    
    print(f"  ✓ {len(subtitle_clips)} subtitles created")
    
    # Composite video with subtitles
    if subtitle_clips:
        final_video = CompositeVideoClip([final_video_bg, *subtitle_clips], size=(1080, 1920))
    else:
        final_video = final_video_bg
    
    # Add audio (MoviePy 2.x uses with_audio)
    print("Adding audio...")
    final_video = final_video.with_audio(audio_clip)
    
    # Save output
    print("Rendering final video...")
    VIDEOS_DIR.mkdir(parents=True, exist_ok=True)
    output_path = VIDEOS_DIR / f"{output_id}.mp4"
    
    final_video.write_videofile(
        str(output_path),
        codec="libx264",
        audio_codec="aac",
        fps=30,
        preset="medium",
        threads=4,
    )
    
    # Cleanup
    final_video.close()
    for clip in processed_clips:
        clip.close()
    audio_clip.close()
    
    print(f"\n✓ Video saved to {output_path}")
    return str(output_path)


def parse_args():
    parser = argparse.ArgumentParser(description="Render wizard video with subtitles and multiple video sources")
    parser.add_argument("--videos", nargs='+', required=True, help="One or more user uploaded video paths")
    parser.add_argument("--audio", required=True, help="Generated audio path")
    parser.add_argument("--subtitles-file", required=True, help="Subtitles JSON file path")
    parser.add_argument("--output-id", required=True, help="Output video ID")
    return parser.parse_args()


def main():
    args = parse_args()
    with open(args.subtitles_file, 'r') as f:
        subtitles = json.load(f)
    
    print(f"=== Wizard Video Renderer ===")
    print(f"Videos: {len(args.videos)}")
    print(f"Audio: {args.audio}")
    print(f"Output ID: {args.output_id}")
    print("="*30)
    
    render_wizard_video(args.videos, args.audio, subtitles, args.output_id)


if __name__ == "__main__":
    main()

