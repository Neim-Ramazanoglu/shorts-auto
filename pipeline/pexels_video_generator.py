"""
Pexels API entegrasyonu ile otomatik video oluşturucu.
Her subtitle için Pexels'den video indirir ve birleştirir.
"""
import argparse
import json
import os
import random
from pathlib import Path

# Disable MoviePy's .env loading BEFORE importing anything else
os.environ['MOVIEPY_DOTENV'] = ''

from pexels_video_fetcher import fetch_video_for_keyword, create_placeholder_video

try:
    from moviepy import AudioFileClip, CompositeVideoClip, TextClip, VideoFileClip, concatenate_videoclips
except ImportError:
    from moviepy.editor import AudioFileClip, CompositeVideoClip, TextClip, VideoFileClip, concatenate_videoclips

ROOT_DIR = Path(__file__).resolve().parents[1]
VIDEOS_DIR = ROOT_DIR / "pipeline" / "videos"
RAW_VIDEOS_DIR = ROOT_DIR / "pipeline" / "raw_videos"


def process_video_clip(video_path):
    """Process a single video: resize, crop to 1080x1920"""
    video_clip = VideoFileClip(str(video_path))
    
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


def extract_keywords_from_script(script_text):
    """Extract potential keywords from script for Pexels search"""
    # Simple keyword extraction - you can improve this
    words = script_text.lower().split()
    # Filter common words
    common_words = {'bir', 've', 'ile', 'için', 'bu', 'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at'}
    keywords = [w for w in words if len(w) > 3 and w not in common_words]
    return keywords[:10] if keywords else ['nature', 'abstract', 'city']


def render_short_with_pexels(video_id, audio_path, subtitles, script_text="", use_pexels=True):
    """
    Render video using Pexels API or local stock videos.
    
    Args:
        video_id: Output video ID
        audio_path: Path to audio file
        subtitles: List of subtitle dicts
        script_text: Full script text for keyword extraction
        use_pexels: If True, fetch from Pexels. If False, use local assets
    """
    audio_clip = AudioFileClip(str(audio_path))
    total_duration = audio_clip.duration
    
    print(f"=== Pexels Video Generator ===")
    print(f"Audio duration: {total_duration:.2f}s")
    print(f"Subtitles: {len(subtitles)}")
    print(f"Use Pexels: {use_pexels}")
    print("="*30)
    
    # Extract keywords for Pexels search
    if use_pexels and script_text:
        keywords = extract_keywords_from_script(script_text)
        print(f"Extracted keywords: {keywords}")
    
    # Create video segments for each subtitle
    video_segments = []
    used_videos = []
    last_successful_video_path = None  # Track last successful video to avoid black screens
    
    for i, sub in enumerate(subtitles):
        start = float(sub['start'])
        end = float(sub['end'])
        segment_duration = end - start
        text = sub.get('text', '')
        
        video_path = None
        
        if use_pexels:
            # Try to fetch from Pexels using subtitle text or keywords
            search_keyword = text.split()[:2]  # Use first 2 words
            search_keyword = ' '.join(search_keyword) if search_keyword else keywords[i % len(keywords)]
            
            print(f"\n  Subtitle {i+1}/{len(subtitles)}: Searching Pexels for '{search_keyword}'")
            video_path = fetch_video_for_keyword(search_keyword)
            
            # If Pexels fails, try with general keywords
            if not video_path and keywords:
                keyword = keywords[i % len(keywords)]
                print(f"  Retrying with keyword: {keyword}")
                video_path = fetch_video_for_keyword(keyword)
        
        # Fallback to local assets if Pexels fails or disabled
        if not video_path:
            assets_dir = ROOT_DIR / "assets"
            if assets_dir.exists():
                stock_videos = list(assets_dir.glob("*.mp4")) + list(assets_dir.glob("*.mov"))
                if stock_videos:
                    video_path = str(random.choice(stock_videos))
                    print(f"  Using local asset: {Path(video_path).name}")
        
        # If still no video, use previous successful video to avoid black screen
        if not video_path and last_successful_video_path:
            video_path = last_successful_video_path
            print(f"  ⚠️  No new video found - continuing previous scene (no black screen)")
        
        # Last resort: create placeholder (only if this is the first segment)
        if not video_path:
            placeholder_path = RAW_VIDEOS_DIR / "placeholder.mp4"
            RAW_VIDEOS_DIR.mkdir(parents=True, exist_ok=True)
            
            if not placeholder_path.exists():
                result = create_placeholder_video(placeholder_path, duration=5)
                if not result:
                    raise ValueError(
                        f"❌ No video found for subtitle {i+1}! "
                        f"Please add stock videos to the 'assets/' folder or configure PEXELS_API_KEY."
                    )
            video_path = str(placeholder_path)
            print(f"  Using placeholder video")
        
        # Update last successful video path
        if video_path and video_path != str(RAW_VIDEOS_DIR / "placeholder.mp4"):
            last_successful_video_path = video_path
        
        # Process the video
        if not video_path or not Path(video_path).exists():
            raise FileNotFoundError(f"Video file not found: {video_path}")
        
        clip = process_video_clip(video_path)
        used_videos.append(clip)
        
        # Loop if needed
        if clip.duration < segment_duration:
            loops_needed = int(segment_duration / clip.duration) + 1
            clip = concatenate_videoclips([clip] * loops_needed)
        
        # Extract segment
        segment = clip.with_start(0).with_duration(segment_duration)
        video_segments.append(segment)
        print(f"  ✓ Segment {i+1}: {segment_duration:.2f}s")
    
    # Concatenate all segments
    print("\n🎬 Merging video segments...")
    final_video_bg = concatenate_videoclips(video_segments, method="compose")
    final_video_bg = final_video_bg.with_duration(total_duration)
    
    # Add subtitles
    print("📝 Adding Turkish subtitles...")
    subtitle_clips = []
    for sub in subtitles:
        try:
            start = float(sub['start'])
            end = float(sub['end'])
            text = sub['text']
            
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
    
    # Composite
    if subtitle_clips:
        final_video = CompositeVideoClip([final_video_bg, *subtitle_clips], size=(1080, 1920))
    else:
        final_video = final_video_bg
    
    # Add audio
    print("🎵 Adding audio...")
    final_video = final_video.with_audio(audio_clip)
    
    # Render
    print("🎥 Rendering final video...")
    VIDEOS_DIR.mkdir(parents=True, exist_ok=True)
    output_path = VIDEOS_DIR / f"{video_id}.mp4"
    
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
    for clip in used_videos:
        try:
            clip.close()
        except:
            pass
    audio_clip.close()
    
    print(f"\n✅ Video saved to {output_path}")
    return str(output_path)


def parse_args():
    parser = argparse.ArgumentParser(description="Generate video with Pexels API")
    parser.add_argument("--audio", required=True, help="Audio file path")
    parser.add_argument("--subtitles-file", required=True, help="Subtitles JSON file")
    parser.add_argument("--output-id", required=True, help="Output video ID")
    parser.add_argument("--script", default="", help="Full script text for keywords")
    parser.add_argument("--use-pexels", action="store_true", help="Fetch videos from Pexels API")
    parser.add_argument("--local-only", action="store_true", help="Use only local assets")
    return parser.parse_args()


def main():
    args = parse_args()
    
    with open(args.subtitles_file, 'r') as f:
        subtitles = json.load(f)
    
    use_pexels = args.use_pexels and not args.local_only
    
    render_short_with_pexels(
        video_id=args.output_id,
        audio_path=args.audio,
        subtitles=subtitles,
        script_text=args.script,
        use_pexels=use_pexels
    )


if __name__ == "__main__":
    main()

