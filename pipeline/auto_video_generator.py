import argparse
import json
import os
import random
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


def auto_generate_video(audio_path, subtitles, assets_dir, output_id):
    """
    Auto-generate video from stock videos in assets directory.
    Randomly selects videos for each subtitle and combines them.
    """
    audio_clip = AudioFileClip(str(audio_path))
    total_duration = audio_clip.duration
    
    # Get all stock videos from assets directory
    assets_path = Path(assets_dir)
    if not assets_path.exists():
        raise FileNotFoundError(f"Assets directory not found: {assets_dir}")
    
    stock_videos = list(assets_path.glob("*.mp4")) + list(assets_path.glob("*.mov"))
    if len(stock_videos) == 0:
        raise FileNotFoundError(f"No stock videos found in {assets_dir}")
    
    print(f"Found {len(stock_videos)} stock videos")
    print(f"Generating video from {len(subtitles)} subtitles...")
    
    # Calculate duration per subtitle
    if len(subtitles) == 0:
        raise ValueError("No subtitles provided")
    
    # Create video segments for each subtitle
    video_segments = []
    last_successful_clip = None  # Track last successful clip to avoid black screens
    
    for i, sub in enumerate(subtitles):
        start = float(sub['start'])
        end = float(sub['end'])
        segment_duration = end - start
        
        # Randomly select a stock video
        try:
            stock_video = random.choice(stock_videos)
            print(f"  Subtitle {i+1}/{len(subtitles)}: Using {stock_video.name} ({segment_duration:.2f}s)")
            
            # Process the stock video
            clip = process_video_clip(stock_video)
            last_successful_clip = clip  # Update last successful
        except Exception as e:
            # If processing fails and we have a previous clip, use it
            if last_successful_clip:
                print(f"  ⚠️  Error processing video, continuing previous scene: {e}")
                clip = last_successful_clip
            else:
                raise  # First segment failed, can't continue
        
        # If stock video is shorter than needed, loop it
        if clip.duration < segment_duration:
            loops_needed = int(segment_duration / clip.duration) + 1
            clip = concatenate_videoclips([clip] * loops_needed)
        
        # Extract the segment we need
        segment = clip.with_start(0).with_duration(segment_duration)
        video_segments.append(segment)
    
    # Concatenate all segments
    print("Merging video segments...")
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
            txt_clip = TextClip(
                text=text,
                font_size=55,
                color='white',
                font='/System/Library/Fonts/Supplemental/Arial Bold.ttf',
                stroke_color='black',
                stroke_width=3,
                method='caption',
                text_align='center',
                size=(950, 300),
            )
            
            # Add timing and position
            txt_clip = (
                txt_clip
                .with_position(('center', 1400))
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
    
    # Add audio
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
    for segment in video_segments:
        segment.close()
    audio_clip.close()
    
    print(f"\n✓ Video saved to {output_path}")
    return str(output_path)


def parse_args():
    parser = argparse.ArgumentParser(description="Auto-generate video from stock videos")
    parser.add_argument("--audio", required=True, help="Audio file path")
    parser.add_argument("--subtitles-file", required=True, help="Subtitles JSON file path")
    parser.add_argument("--assets-dir", required=True, help="Assets directory with stock videos")
    parser.add_argument("--output-id", required=True, help="Output video ID")
    return parser.parse_args()


def main():
    args = parse_args()
    with open(args.subtitles_file, 'r') as f:
        subtitles = json.load(f)
    
    print(f"=== Auto Video Generator ===")
    print(f"Audio: {args.audio}")
    print(f"Assets Dir: {args.assets_dir}")
    print(f"Output ID: {args.output_id}")
    print(f"Subtitles: {len(subtitles)}")
    print("="*30)
    
    auto_generate_video(args.audio, subtitles, args.assets_dir, args.output_id)


if __name__ == "__main__":
    main()

