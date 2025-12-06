#!/usr/bin/env python3
"""
Script to convert video to animated GIF with transparency using AI model (rembg)
Uses a lightweight AI model to remove background, better than traditional chroma keying

Usage:
    python3 video-to-gif-ai.py input.mp4 output.gif [--fps 15] [--scale 0.5]
"""

import os
import sys
import cv2
import numpy as np
from PIL import Image
import argparse

try:
    from rembg import remove
    REMBG_AVAILABLE = True
except ImportError:
    REMBG_AVAILABLE = False


def process_frame_with_ai(frame, target_color_hex=None, threshold=50):
    """
    Remove background from frame using AI model (rembg) with green screen cleanup.
    
    Args:
        frame: Input frame (BGR format from OpenCV)
        target_color_hex: Optional hex color to remove (for green screen cleanup)
        threshold: Color threshold for green screen cleanup
    
    Returns:
        Frame with alpha channel (BGRA format)
    """
    if not REMBG_AVAILABLE:
        raise ImportError("rembg not installed. Install with: pip install rembg")
    
    # Convert BGR to RGB for rembg
    frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    
    # Convert to PIL Image
    pil_image = Image.fromarray(frame_rgb)
    
    # Remove background using AI model
    output = remove(pil_image)
    
    # Convert back to numpy array (RGBA)
    output_array = np.array(output)
    
    # Convert RGBA to BGRA for OpenCV
    bgra = cv2.cvtColor(output_array, cv2.COLOR_RGBA2BGRA)
    
    # Post-process: remove any remaining green screen and ensure transparency
    if target_color_hex:
        # Convert hex to BGR
        hex_color = target_color_hex.lstrip('#')
        r = int(hex_color[0:2], 16)
        g = int(hex_color[2:4], 16)
        b = int(hex_color[4:6], 16)
        target_color_bgr = (b, g, r)  # OpenCV uses BGR
        
        # Remove green pixels that the AI might have missed
        for y in range(bgra.shape[0]):
            for x in range(bgra.shape[1]):
                pixel_bgr = bgra[y, x, :3]
                # Calculate distance from target green color
                color_dist = np.sqrt(np.sum((pixel_bgr.astype(np.float32) - np.array(target_color_bgr, dtype=np.float32)) ** 2))
                
                # If pixel is close to green, make it transparent
                if color_dist < threshold:
                    bgra[y, x, 3] = 0  # Fully transparent
                # Also check for dark/black pixels that should be transparent
                elif np.mean(pixel_bgr) < 30:  # Very dark pixel
                    bgra[y, x, 3] = 0  # Make transparent
    
    return bgra


def video_to_gif_ai(input_path, output_path, fps=15, scale=0.5, target_color_hex=None, threshold=50):
    """
    Convert video to animated GIF with transparency using AI model.
    
    Args:
        input_path: Path to input video file
        output_path: Path to output GIF file
        fps: Frames per second for output GIF
        scale: Scale factor (1.0 = original, 0.5 = half size)
    
    Returns:
        bool: True if successful, False otherwise
    """
    if not REMBG_AVAILABLE:
        print("❌ rembg not found. Please install it:")
        print("   pip install rembg")
        print("   (or pip install --break-system-packages rembg)")
        return False
    
    if not os.path.exists(input_path):
        print(f"❌ Input file not found: {input_path}")
        return False
    
    # Create output directory if needed
    output_dir = os.path.dirname(output_path)
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir, exist_ok=True)
    
    print(f"📹 Converting video to GIF with AI model: {os.path.basename(input_path)}")
    print(f"   Input: {input_path}")
    print(f"   Output: {output_path}")
    print(f"   FPS: {fps}, Scale: {scale}")
    print(f"   Using AI model: rembg (U2Net)")
    if target_color_hex:
        print(f"   Green screen cleanup: {target_color_hex} (threshold: {threshold})")
    
    # Open video
    cap = cv2.VideoCapture(input_path)
    if not cap.isOpened():
        print(f"❌ Could not open video: {input_path}")
        return False
    
    # Get video properties
    original_fps = cap.get(cv2.CAP_PROP_FPS)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    
    # Calculate new dimensions
    new_width = int(width * scale)
    new_height = int(height * scale)
    
    # Calculate frame skip (to match target fps)
    frame_skip = max(1, int(original_fps / fps))
    
    print(f"   Original: {width}x{height} @ {original_fps:.2f} fps")
    print(f"   Output: {new_width}x{new_height} @ {fps} fps")
    print(f"   Processing every {frame_skip} frame(s)")
    
    frames = []
    frame_count = 0
    processed_count = 0
    
    print(f"\n🔄 Processing frames with AI model (this may take a while)...")
    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            
            frame_count += 1
            
            # Skip frames to match target fps
            if frame_count % frame_skip != 0:
                continue
            
            # Process frame with AI
            try:
                processed_frame = process_frame_with_ai(frame, target_color_hex, threshold)
            except Exception as e:
                print(f"⚠️  Error processing frame {frame_count}: {e}")
                # Fallback: create transparent frame
                processed_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2BGRA)
                processed_frame[:, :, 3] = 255  # Fully opaque as fallback
            
            # Resize
            if scale != 1.0:
                processed_frame = cv2.resize(processed_frame, (new_width, new_height), interpolation=cv2.INTER_LANCZOS4)
            
            # Convert to PIL Image
            pil_image = Image.fromarray(cv2.cvtColor(processed_frame, cv2.COLOR_BGRA2RGBA))
            frames.append(pil_image)
            
            processed_count += 1
            if processed_count % 10 == 0:
                print(f"   Processed {processed_count} frames...")
    
    except KeyboardInterrupt:
        print("\n⚠️  Interrupted by user")
        cap.release()
        return False
    
    cap.release()
    
    if len(frames) == 0:
        print("❌ No frames processed!")
        return False
    
    print(f"\n🔄 Creating GIF from {len(frames)} frames...")
    
    # Save as GIF
    try:
        frames[0].save(
            output_path,
            save_all=True,
            append_images=frames[1:],
            duration=int(1000 / fps),  # Duration in milliseconds
            loop=0,
            transparency=0,
            disposal=2  # Clear to background
        )
        print(f"✅ GIF created: {output_path}")
        file_size = os.path.getsize(output_path) / (1024 * 1024)  # Size in MB
        print(f"   File size: {file_size:.2f} MB")
        return True
    except Exception as e:
        print(f"❌ Error creating GIF: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(
        description='Convert video to animated GIF with transparency using AI model'
    )
    parser.add_argument('input', help='Input video file path')
    parser.add_argument('output', help='Output GIF file path')
    parser.add_argument(
        '--fps',
        type=int,
        default=15,
        help='Frames per second for output GIF (default: 15)'
    )
    parser.add_argument(
        '--scale',
        type=float,
        default=0.5,
        help='Scale factor (1.0 = original, 0.5 = half size, default: 0.5)'
    )
    parser.add_argument(
        '--color',
        type=str,
        default=None,
        help='Hex color to remove after AI processing (e.g., #00FD21 for green screen cleanup)'
    )
    parser.add_argument(
        '--threshold',
        type=int,
        default=50,
        help='Color threshold for green screen cleanup (0-255, default: 50)'
    )
    
    args = parser.parse_args()
    
    # Validate color format if provided
    target_color = None
    if args.color:
        if not args.color.startswith('#'):
            target_color = '#' + args.color
        else:
            target_color = args.color
    
    # Convert video to GIF
    success = video_to_gif_ai(
        args.input,
        args.output,
        fps=args.fps,
        scale=args.scale,
        target_color_hex=target_color,
        threshold=args.threshold
    )
    
    if not success:
        sys.exit(1)


if __name__ == '__main__':
    main()

