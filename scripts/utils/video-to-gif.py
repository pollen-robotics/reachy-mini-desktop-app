#!/usr/bin/env python3
"""
Script to convert video to animated GIF with transparency
Removes white/black background and creates transparent GIF

Usage:
    python3 video-to-gif.py input.mp4 output.gif [--color white|black] [--threshold 40] [--fps 30] [--scale 1.0]
"""

import os
import sys
import subprocess
import argparse


def check_ffmpeg():
    """Check if FFmpeg is available."""
    try:
        subprocess.run(['ffmpeg', '-version'], capture_output=True, check=True)
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False


def video_to_gif(input_path, output_path, color='white', threshold=40, fps=30, scale=1.0, custom_color=None):
    """
    Convert video to animated GIF with transparency.
    
    Args:
        input_path: Path to input video file
        output_path: Path to output GIF file
        color: Color to remove ('white', 'black', or 'custom')
        threshold: Tolerance threshold (0-255)
        fps: Frames per second for output GIF
        scale: Scale factor (1.0 = original size, 0.5 = half size)
        custom_color: Custom hex color to remove (e.g., '#00FF2A' or '0x00FF2A')
    
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
    
    # Determine the color to remove
    if custom_color:
        # Remove '#' if present and convert to 0x format
        hex_color = custom_color.replace('#', '0x')
        color_name = custom_color
        color_value = hex_color
    elif color == 'white':
        color_name = 'white'
        color_value = '0xFFFFFF'
    elif color == 'black':
        color_name = 'black'
        color_value = '0x000000'
    else:
        color_name = color
        color_value = '0xFFFFFF'  # Default to white
    
    print(f"📹 Converting video to GIF: {os.path.basename(input_path)}")
    print(f"   Input: {input_path}")
    print(f"   Output: {output_path}")
    print(f"   Removing {color_name} background (threshold: {threshold})")
    print(f"   FPS: {fps}, Scale: {scale}")
    
    # Step 1: Create palette with transparency
    palette_path = output_path.replace('.gif', '_palette.png')
    
    # FFmpeg filter to remove background and create palette
    # Technique: Progressive colorkey passes with minimal blend to preserve sharpness
    # Use lower threshold first to preserve image, then aggressive cleanup
    similarity1 = min(0.99, (threshold - 10) / 255.0 + 0.1)  # More conservative first pass
    similarity2 = min(0.99, (threshold + 25) / 255.0 + 0.1)  # Aggressive edge cleanup
    blend = 0.01  # Minimal blend to avoid blurring
    filter_complex = (
        f"[0:v]colorkey={color_value}:similarity={similarity1}:blend={blend}[ck1];"
        f"[ck1]colorkey={color_value}:similarity={similarity2}:blend=0.0[ck2];"
        f"[ck2]scale=iw*{scale}:ih*{scale}:flags=lanczos,"
        f"fps={fps},"
        f"palettegen=reserve_transparent=1[palette]"
    )
    
    # Generate palette
    palette_cmd = [
        'ffmpeg',
        '-i', input_path,
        '-vf', filter_complex,
        '-y',
        palette_path
    ]
    
    # Step 2: Create GIF using palette
    # Technique: Progressive colorkey passes with minimal blend to preserve sharpness
    # Use lower threshold first to preserve image, then aggressive cleanup
    similarity1 = min(0.99, (threshold - 10) / 255.0 + 0.1)  # More conservative first pass
    similarity2 = min(0.99, (threshold + 25) / 255.0 + 0.1)  # Aggressive edge cleanup
    blend = 0.01  # Minimal blend to avoid blurring
    gif_filter = (
        f"[0:v]colorkey={color_value}:similarity={similarity1}:blend={blend}[ck1];"
        f"[ck1]colorkey={color_value}:similarity={similarity2}:blend=0.0[ck2];"
        f"[ck2]scale=iw*{scale}:ih*{scale}:flags=lanczos,"
        f"fps={fps}[ck3];"
        f"[ck3][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle[out]"
    )
    
    gif_cmd = [
        'ffmpeg',
        '-i', input_path,
        '-i', palette_path,
        '-filter_complex', gif_filter,
        '-map', '[out]',
        '-y',
        output_path
    ]
    
    try:
        # Step 1: Generate palette
        print(f"\n🔄 Step 1/2: Generating palette with transparency...")
        result = subprocess.run(palette_cmd, capture_output=True, text=True, check=True)
        print(f"✅ Palette created: {palette_path}")
        
        # Step 2: Create GIF
        print(f"\n🔄 Step 2/2: Creating animated GIF...")
        result = subprocess.run(gif_cmd, capture_output=True, text=True, check=True)
        print(f"✅ GIF created: {output_path}")
        
        # Clean up palette file
        if os.path.exists(palette_path):
            os.remove(palette_path)
            print(f"🧹 Cleaned up temporary palette file")
        
        print(f"\n✅ Success! GIF created: {output_path}")
        file_size = os.path.getsize(output_path) / (1024 * 1024)  # Size in MB
        print(f"   File size: {file_size:.2f} MB")
        return True
        
    except subprocess.CalledProcessError as e:
        print(f"❌ FFmpeg error:")
        print(f"   {e.stderr}")
        # Clean up palette if it exists
        if os.path.exists(palette_path):
            os.remove(palette_path)
        return False
    except Exception as e:
        print(f"❌ Error: {e}")
        if os.path.exists(palette_path):
            os.remove(palette_path)
        return False


def main():
    parser = argparse.ArgumentParser(
        description='Convert video to animated GIF with transparency'
    )
    parser.add_argument('input', help='Input video file path')
    parser.add_argument('output', help='Output GIF file path')
    parser.add_argument(
        '--color',
        choices=['white', 'black', 'custom'],
        default='white',
        help='Background color to remove (default: white)'
    )
    parser.add_argument(
        '--custom-color',
        type=str,
        default=None,
        help='Custom hex color to remove (e.g., #00FF2A or 0x00FF2A)'
    )
    parser.add_argument(
        '--threshold',
        type=int,
        default=40,
        help='Tolerance threshold 0-255 (default: 40, lower = more strict)'
    )
    parser.add_argument(
        '--fps',
        type=int,
        default=30,
        help='Frames per second for output GIF (default: 30)'
    )
    parser.add_argument(
        '--scale',
        type=float,
        default=1.0,
        help='Scale factor (1.0 = original, 0.5 = half size, default: 1.0)'
    )
    
    args = parser.parse_args()
    
    # Check FFmpeg
    if not check_ffmpeg():
        print("❌ FFmpeg not found. Please install FFmpeg first.")
        print("   macOS: brew install ffmpeg")
        print("   Linux: sudo apt install ffmpeg")
        sys.exit(1)
    
    # Convert video to GIF
    success = video_to_gif(
        args.input,
        args.output,
        color=args.color if not args.custom_color else 'custom',
        threshold=args.threshold,
        fps=args.fps,
        scale=args.scale,
        custom_color=args.custom_color
    )
    
    if not success:
        sys.exit(1)


if __name__ == '__main__':
    main()

