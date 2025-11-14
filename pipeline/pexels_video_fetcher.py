import os
import requests
from pathlib import Path

# Disable MoviePy's .env loading to avoid sandbox issues
os.environ['MOVIEPY_DOTENV'] = ''

try:
    from dotenv import load_dotenv
    # Load environment variables (may fail in sandbox)
    load_dotenv()
except Exception as e:
    print(f"Warning: Could not load .env file: {e}")

PEXELS_API_KEY = os.getenv("PEXELS_API_KEY", "")
RAW_VIDEOS_DIR = os.getenv("RAW_VIDEOS_DIR", "./pipeline/raw_videos")

# Pexels API headers
HEADERS = {"Authorization": PEXELS_API_KEY}


def fetch_video_for_keyword(keyword, output_dir=None):
    """
    Fetch a vertical (portrait) video from Pexels API for given keyword.
    Downloads to RAW_VIDEOS_DIR if not already exists.
    
    Args:
        keyword: Search keyword (e.g., "science", "technology", "space")
        output_dir: Optional custom output directory
    
    Returns:
        Path to downloaded video file, or None if failed
    """
    if not PEXELS_API_KEY or PEXELS_API_KEY == "your_pexels_api_key_here":
        print("⚠️  PEXELS_API_KEY not configured in .env file")
        return None
    
    # Create output directory
    video_dir = Path(output_dir) if output_dir else Path(RAW_VIDEOS_DIR)
    video_dir.mkdir(parents=True, exist_ok=True)
    
    # Check if video already exists
    filename = f"{keyword.replace(' ', '_').replace('/', '_')}.mp4"
    filepath = video_dir / filename
    
    if filepath.exists():
        print(f"✓ Video already exists: {filepath}")
        return str(filepath)
    
    # Search Pexels API
    search_url = f"https://api.pexels.com/videos/search"
    params = {
        "query": keyword,
        "per_page": 5,  # Get multiple results
        "orientation": "portrait"  # Vertical videos for 9:16
    }
    
    try:
        print(f"🔍 Searching Pexels for: {keyword}")
        response = requests.get(search_url, headers=HEADERS, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()
        
        if not data.get("videos") or len(data["videos"]) == 0:
            print(f"⚠️  No videos found for keyword: {keyword}")
            return None
        
        # Find best quality video file (prefer HD)
        video = data["videos"][0]
        video_files = video.get("video_files", [])
        
        # Sort by quality - prefer HD portrait videos
        portrait_files = [vf for vf in video_files if vf.get("width", 0) < vf.get("height", 0)]
        if not portrait_files:
            portrait_files = video_files
        
        # Get highest quality
        best_video = max(portrait_files, key=lambda x: x.get("width", 0) * x.get("height", 0))
        video_url = best_video["link"]
        
        print(f"⬇️  Downloading video: {video['url']}")
        print(f"   Resolution: {best_video.get('width')}x{best_video.get('height')}")
        
        # Download video
        video_response = requests.get(video_url, stream=True, timeout=60)
        video_response.raise_for_status()
        
        total_size = int(video_response.headers.get('content-length', 0))
        downloaded = 0
        
        with open(filepath, "wb") as f:
            for chunk in video_response.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
                    downloaded += len(chunk)
                    if total_size > 0:
                        progress = (downloaded / total_size) * 100
                        print(f"\r   Progress: {progress:.1f}%", end="")
        
        print(f"\n✅ Video downloaded: {filepath}")
        return str(filepath)
        
    except requests.RequestException as e:
        print(f"❌ Error fetching video: {e}")
        return None
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        return None


def create_placeholder_video(output_path, duration=5):
    """
    Create a black placeholder video when Pexels fetch fails.
    """
    try:
        # Disable MoviePy's .env loading
        os.environ['MOVIEPY_DOTENV'] = ''
        
        try:
            from moviepy import ColorClip
        except ImportError:
            from moviepy.editor import ColorClip
        
        print(f"🎬 Creating placeholder video...")
        clip = ColorClip(size=(1080, 1920), color=(0, 0, 0), duration=duration)
        clip.write_videofile(str(output_path), fps=30, logger=None)
        clip.close()
        
        print(f"✅ Placeholder video created: {output_path}")
        return str(output_path)
    except Exception as e:
        print(f"❌ Error creating placeholder: {e}")
        return None


def fetch_multiple_videos(keywords, output_dir=None):
    """
    Fetch multiple videos for a list of keywords.
    
    Args:
        keywords: List of keywords
        output_dir: Optional custom output directory
    
    Returns:
        Dictionary mapping keywords to video paths
    """
    results = {}
    
    for keyword in keywords:
        video_path = fetch_video_for_keyword(keyword, output_dir)
        results[keyword] = video_path
    
    return results


if __name__ == "__main__":
    # Test the fetcher
    import sys
    
    if len(sys.argv) > 1:
        keyword = " ".join(sys.argv[1:])
        video_path = fetch_video_for_keyword(keyword)
        if video_path:
            print(f"\n✅ Success! Video saved to: {video_path}")
        else:
            print(f"\n❌ Failed to fetch video for: {keyword}")
    else:
        print("Usage: python pexels_video_fetcher.py <keyword>")
        print("Example: python pexels_video_fetcher.py technology")

