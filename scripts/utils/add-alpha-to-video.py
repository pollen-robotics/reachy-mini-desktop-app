#!/usr/bin/env python3
"""
Script to add alpha channel to video by removing white/black background
Creates a copy of the input file and processes it.

Usage:
    python3 add-alpha-to-video.py input.mp4 output.mp4 [--color white|black] [--threshold 30]
"""

import os
import sys
import subprocess
import shutil
import argparse


def check_ffmpeg():
    """Check if FFmpeg is available."""
    try:
        subprocess.run(['ffmpeg', '-version'], capture_output=True, check=True)
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False


def add_alpha_channel_ffmpeg(input_path, output_path, color='white', threshold=30):
    """
    Add alpha channel to video by removing white or black background using FFmpeg.
    
    Args:
        input_path: Path to input video file
        output_path: Path to output video file (will be created)
        color: Color to remove ('white' or 'black')
        threshold: Tolerance threshold (0-255)
    
    Returns:
        bool: True if successful, False otherwise
    """
    if not os.path.exists(input_path):
        print(f"❌ Input file not found: {input_path}")
        return False
    
    # Create output directory if needed
    output_dir = os.path.dirname(output_path)
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir, exist_ok=True)
    
    print(f"📹 Processing video: {os.path.basename(input_path)}")
    print(f"   Input: {input_path}")
    print(f"   Output: {output_path}")
    print(f"   Removing {color} background (threshold: {threshold})")
    
    # FFmpeg filter to remove white/black background and add alpha
    # Use the simplest and most reliable method: colorkey with proper parameters
    if color == 'white':
        # Remove white background using colorkey
        # similarity: 0.0-1.0, higher = more aggressive (remove more similar colors)
        # For white removal: threshold 200 means remove pixels with RGB > 55 (very aggressive)
        # Convert threshold to similarity: higher threshold = higher similarity needed
        similarity = min(0.99, (255 - threshold) / 255.0 + 0.1)  # Add 0.1 to be more aggressive
        filter_complex = (
            f"[0:v]colorkey=0xFFFFFF:similarity={similarity}:blend=0.0,format=yuva420p"
        )
    else:  # black
        # Remove black background
        similarity = min(0.99, threshold / 255.0 + 0.1)
        filter_complex = (
            f"[0:v]colorkey=0x000000:similarity={similarity}:blend=0.0,format=yuva420p"
        )
    
    # FFmpeg command for WebM VP9 with alpha
    webm_output = output_path.replace('.mp4', '.webm')
    webm_cmd = [
        'ffmpeg',
        '-i', input_path,
        '-vf', filter_complex,
        '-c:v', 'libvpx-vp9',
        '-pix_fmt', 'yuva420p',
        '-auto-alt-ref', '0',
        '-lag-in-frames', '0',
        '-crf', '30',
        '-b:v', '0',
        '-y',  # Overwrite output file
        webm_output
    ]
    
    # FFmpeg command for HEVC with alpha (for Safari/WebKit)
    # Try hevc_videotoolbox first (macOS hardware encoder with alpha support)
    # Fallback to libx265 if videotoolbox not available
    import platform
    if platform.system() == 'Darwin':  # macOS
        hevc_cmd = [
            'ffmpeg',
            '-i', input_path,
            '-vf', filter_complex,
            '-c:v', 'hevc_videotoolbox',
            '-pix_fmt', 'yuva420p',
            '-b:v', '5M',
            '-tag:v', 'hvc1',
            '-y',  # Overwrite output file
            output_path
        ]
    else:
        # For Linux/Windows, try libx265 with alpha support
        # Note: may not work if libx265 doesn't support alpha
        hevc_cmd = [
            'ffmpeg',
            '-i', input_path,
            '-vf', filter_complex,
            '-c:v', 'libx265',
            '-pix_fmt', 'yuva420p',
            '-preset', 'slow',
            '-crf', '28',
            '-tag:v', 'hvc1',
            '-y',  # Overwrite output file
            output_path
        ]
    
    try:
        # First, create WebM version
        print(f"\n🔄 Encoding WebM VP9 with alpha...")
        result = subprocess.run(webm_cmd, capture_output=True, text=True, check=True)
        print(f"✅ WebM created: {webm_output}")
        
        # Then, create HEVC version
        print(f"\n🔄 Encoding HEVC with alpha...")
        result = subprocess.run(hevc_cmd, capture_output=True, text=True, check=True)
        print(f"✅ HEVC created: {output_path}")
        
        print(f"\n✅ Success! Both formats created:")
        print(f"   - {webm_output} (for Chrome/Firefox)")
        print(f"   - {output_path} (for Safari/WebKit)")
        return True
        
    except subprocess.CalledProcessError as e:
        print(f"❌ FFmpeg error:")
        print(f"   {e.stderr}")
        return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(
        description='Add alpha channel to video by removing white/black background'
    )
    parser.add_argument('input', help='Input video file path')
    parser.add_argument('output', help='Output video file path (will create .mp4 and .webm)')
    parser.add_argument(
        '--color',
        choices=['white', 'black'],
        default='white',
        help='Background color to remove (default: white)'
    )
    parser.add_argument(
        '--threshold',
        type=int,
        default=30,
        help='Tolerance threshold 0-255 (default: 30)'
    )
    
    args = parser.parse_args()
    
    # Check FFmpeg
    if not check_ffmpeg():
        print("❌ FFmpeg not found. Please install FFmpeg first.")
        print("   macOS: brew install ffmpeg")
        print("   Linux: sudo apt install ffmpeg")
        sys.exit(1)
    
    # Process video
    success = add_alpha_channel_ffmpeg(
        args.input,
        args.output,
        color=args.color,
        threshold=args.threshold
    )
    
    if not success:
        sys.exit(1)


if __name__ == '__main__':
    main()

