#!/usr/bin/env python3
"""
Script to convert video to animated GIF with transparency using OpenCV
Advanced chroma keying with edge cleanup to remove green halo

Usage:
    python3 video-to-gif-opencv.py input.mp4 output.gif [--color #00FD21] [--threshold 40] [--fps 15] [--scale 0.5]
"""

import os
import sys
import cv2
import numpy as np
from PIL import Image
import argparse


def hex_to_bgr(hex_color):
    """Convert hex color (#RRGGBB) to BGR tuple for OpenCV."""
    hex_color = hex_color.lstrip('#')
    r = int(hex_color[0:2], 16)
    g = int(hex_color[2:4], 16)
    b = int(hex_color[4:6], 16)
    return (b, g, r)  # OpenCV uses BGR


def remove_green_screen_opencv(frame, target_color_bgr, threshold, edge_threshold_multiplier=2.0):
    """
    Remove green screen using OpenCV with advanced edge cleanup.
    
    Args:
        frame: Input frame (BGR format)
        target_color_bgr: Target color in BGR format
        threshold: Color threshold (0-255)
        edge_threshold_multiplier: Multiplier for edge detection threshold (higher = more aggressive)
    
    Returns:
        Frame with alpha channel (BGRA format)
    """
    # Convert to HSV for better color detection
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    
    # Convert target color to HSV
    target_bgr = np.uint8([[target_color_bgr]])
    target_hsv = cv2.cvtColor(target_bgr, cv2.COLOR_BGR2HSV)[0][0]
    
    # Create mask for green color with tolerance
    # Use more aggressive threshold for initial detection
    hue_tolerance = min(threshold // 2, 30)  # Limit hue tolerance
    lower_hue1 = np.array([
        max(0, int(target_hsv[0]) - hue_tolerance), 
        max(0, int(target_hsv[1]) - threshold), 
        max(0, int(target_hsv[2]) - threshold)
    ])
    upper_hue1 = np.array([
        min(179, int(target_hsv[0]) + hue_tolerance), 
        min(255, int(target_hsv[1]) + threshold), 
        min(255, int(target_hsv[2]) + threshold)
    ])
    
    # Also check in BGR space for better edge detection
    lower_bgr = np.array([max(0, target_color_bgr[0] - threshold), 
                          max(0, target_color_bgr[1] - threshold), 
                          max(0, target_color_bgr[2] - threshold)])
    upper_bgr = np.array([min(255, target_color_bgr[0] + threshold), 
                         min(255, target_color_bgr[1] + threshold), 
                         min(255, target_color_bgr[2] + threshold)])
    
    # Create masks
    mask_hsv = cv2.inRange(hsv, lower_hue1, upper_hue1)
    mask_bgr = cv2.inRange(frame, lower_bgr, upper_bgr)
    
    # Combine masks
    mask = cv2.bitwise_or(mask_hsv, mask_bgr)
    
    # Clean up mask with morphological operations to remove noise
    kernel = np.ones((3, 3), np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=3)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=3)
    
    # Erode mask more aggressively to remove green edges
    mask = cv2.erode(mask, kernel, iterations=2)
    
    # Dilate back slightly
    mask = cv2.dilate(mask, kernel, iterations=1)
    
    # Apply Gaussian blur to mask edges for smoother transition
    mask = cv2.GaussianBlur(mask, (5, 5), 0)
    
    # Invert mask (we want to keep non-green areas)
    mask = 255 - mask
    
    # Create BGRA frame
    bgra = cv2.cvtColor(frame, cv2.COLOR_BGR2BGRA)
    
    # Apply mask to alpha channel
    bgra[:, :, 3] = mask
    
    # IMPORTANT: Remove all black/dark pixels that should be transparent
    # Check for dark pixels (likely background)
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    dark_mask = gray < 50  # Very dark pixels
    bgra[:, :, 3][dark_mask] = 0  # Make them fully transparent
    
    # Also remove pixels that are too close to black in the original frame
    pixel_brightness = np.mean(frame, axis=2)
    very_dark = pixel_brightness < 40
    bgra[:, :, 3][very_dark] = 0
    
    # Advanced edge cleanup: remove green spill on edges with multiple passes
    # Find edges of the mask
    edges = cv2.Canny(mask, 50, 150)
    
    # Dilate edges to create a wider edge region
    edge_kernel = np.ones((3, 3), np.uint8)
    edges = cv2.dilate(edges, edge_kernel, iterations=3)
    
    # Create a wider edge region for cleanup
    edge_region = cv2.dilate(edges, edge_kernel, iterations=2)
    
    # First pass: aggressive cleanup on edges
    edge_pixels = np.where(edge_region > 0)
    for y, x in zip(edge_pixels[0], edge_pixels[1]):
        if y >= frame.shape[0] or x >= frame.shape[1]:
            continue
        pixel_bgr = frame[y, x]
        # Calculate distance from target color
        color_dist = np.sqrt(np.sum((pixel_bgr.astype(np.float32) - np.array(target_color_bgr, dtype=np.float32)) ** 2))
        edge_threshold = threshold * edge_threshold_multiplier
        if color_dist < edge_threshold:
            # Reduce alpha aggressively for green pixels on edges
            current_alpha = int(bgra[y, x, 3])
            # More aggressive reduction for pixels closer to green
            reduction = int(100 * (1 - color_dist / edge_threshold))
            bgra[y, x, 3] = max(0, current_alpha - reduction)
    
    # Second pass: Aggressive despill and edge cleanup
    # Use vectorized operations for speed
    pixels_bgr = frame.astype(np.float32)
    target_bgr_float = np.array(target_color_bgr, dtype=np.float32)
    
    # Calculate distance from green for all pixels
    color_dist = np.sqrt(np.sum((pixels_bgr - target_bgr_float) ** 2, axis=2))
    max_dist = threshold * 2.5  # Maximum distance to consider
    
    # Create spill mask
    spill_mask = color_dist < max_dist
    spill_amount = np.clip(1.0 - (color_dist / max_dist), 0.0, 1.0)
    
    # Apply despill to all pixels with green spill
    bgra_float = bgra.astype(np.float32)
    
    # Reduce green component aggressively
    bgra_float[:, :, 1][spill_mask] *= (1.0 - spill_amount[spill_mask] * 0.8)  # Reduce green up to 80%
    # Boost red and blue to compensate
    bgra_float[:, :, 2][spill_mask] = np.clip(bgra_float[:, :, 2][spill_mask] + spill_amount[spill_mask] * 25, 0, 255)
    bgra_float[:, :, 0][spill_mask] = np.clip(bgra_float[:, :, 0][spill_mask] + spill_amount[spill_mask] * 20, 0, 255)
    
    # Reduce alpha for pixels with significant green spill
    significant_spill = spill_amount > 0.2
    bgra_float[:, :, 3][significant_spill] = np.clip(bgra_float[:, :, 3][significant_spill] - spill_amount[significant_spill] * 150, 0, 255)
    
    # Convert back to uint8
    bgra = bgra_float.astype(np.uint8)
    
    # Final pass: remove any remaining green pixels on edges AND black pixels
    # Find edges using Canny
    gray = cv2.cvtColor(bgra[:, :, :3], cv2.COLOR_BGRA2GRAY)
    edges = cv2.Canny(gray, 50, 150)
    edge_kernel = np.ones((5, 5), np.uint8)
    edge_region = cv2.dilate(edges, edge_kernel, iterations=2)
    
    # On edges, aggressively remove green
    edge_pixels = np.where(edge_region > 0)
    for y, x in zip(edge_pixels[0], edge_pixels[1]):
        if y >= frame.shape[0] or x >= frame.shape[1]:
            continue
        pixel_bgr = frame[y, x].astype(np.float32)
        color_dist_edge = np.sqrt(np.sum((pixel_bgr - target_bgr_float) ** 2))
        if color_dist_edge < threshold * 2.0:
            bgra[y, x, 3] = 0  # Make fully transparent
    
    # Final cleanup: remove ALL black/dark pixels that are still visible
    # This ensures no black background remains
    final_dark_mask = np.mean(bgra[:, :, :3], axis=2) < 50
    bgra[:, :, 3][final_dark_mask] = 0
    
    # Also remove pixels where RGB values are all very low (black background)
    black_mask = (bgra[:, :, 0] < 30) & (bgra[:, :, 1] < 30) & (bgra[:, :, 2] < 30)
    bgra[:, :, 3][black_mask] = 0
    
    return bgra


def video_to_gif_opencv(input_path, output_path, target_color_hex, threshold=40, fps=15, scale=0.5, edge_threshold_multiplier=2.0):
    """
    Convert video to animated GIF with transparency using OpenCV.
    
    Args:
        input_path: Path to input video file
        output_path: Path to output GIF file
        target_color_hex: Hex color to remove (e.g., '#00FD21')
        threshold: Color threshold (0-255)
        fps: Frames per second for output GIF
        scale: Scale factor (1.0 = original, 0.5 = half size)
    
    Returns:
        bool: True if successful, False otherwise
    """
    if not os.path.exists(input_path):
        print(f"❌ Input file not found: {input_path}")
        return False
    
    # Check if OpenCV is available
    try:
        import cv2
    except ImportError:
        print("❌ OpenCV not found. Please install it:")
        print("   pip install opencv-python")
        return False
    
    # Create output directory if needed
    output_dir = os.path.dirname(output_path)
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir, exist_ok=True)
    
    # Convert hex color to BGR
    target_color_bgr = hex_to_bgr(target_color_hex)
    
    print(f"📹 Converting video to GIF with OpenCV: {os.path.basename(input_path)}")
    print(f"   Input: {input_path}")
    print(f"   Output: {output_path}")
    print(f"   Removing color {target_color_hex} (threshold: {threshold})")
    print(f"   FPS: {fps}, Scale: {scale}")
    
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
    
    print(f"\n🔄 Processing frames...")
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        
        frame_count += 1
        
        # Skip frames to match target fps
        if frame_count % frame_skip != 0:
            continue
        
        # Process frame
        processed_frame = remove_green_screen_opencv(frame, target_color_bgr, threshold, edge_threshold_multiplier)
        
        # Resize
        if scale != 1.0:
            processed_frame = cv2.resize(processed_frame, (new_width, new_height), interpolation=cv2.INTER_LANCZOS4)
        
            # Convert to PIL Image
            # Ensure transparent pixels are truly transparent (alpha = 0)
            rgba = cv2.cvtColor(processed_frame, cv2.COLOR_BGRA2RGBA)
            
            # Final check: set RGB to 0 for fully transparent pixels to avoid black artifacts
            alpha = rgba[:, :, 3]
            fully_transparent = alpha == 0
            rgba[fully_transparent, 0] = 0  # R = 0
            rgba[fully_transparent, 1] = 0  # G = 0
            rgba[fully_transparent, 2] = 0  # B = 0
            
            pil_image = Image.fromarray(rgba)
            frames.append(pil_image)
        
        processed_count += 1
        if processed_count % 10 == 0:
            print(f"   Processed {processed_count} frames...")
    
    cap.release()
    
    if len(frames) == 0:
        print("❌ No frames processed!")
        return False
    
    print(f"\n🔄 Creating GIF from {len(frames)} frames...")
    
    # Save as GIF
    try:
        # Save as GIF with proper transparency handling
        # Use optimize=False to preserve transparency better
        frames[0].save(
            output_path,
            save_all=True,
            append_images=frames[1:],
            duration=int(1000 / fps),  # Duration in milliseconds
            loop=0,
            transparency=0,  # Use first transparent color as transparent
            disposal=2,  # Clear to background
            optimize=False  # Don't optimize to preserve transparency
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
        description='Convert video to animated GIF with transparency using OpenCV'
    )
    parser.add_argument('input', help='Input video file path')
    parser.add_argument('output', help='Output GIF file path')
    parser.add_argument(
        '--color',
        type=str,
        default='#00FD21',
        help='Hex color to remove (default: #00FD21)'
    )
    parser.add_argument(
        '--threshold',
        type=int,
        default=40,
        help='Color threshold 0-255 (default: 40)'
    )
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
        '--edge-threshold',
        type=float,
        default=2.5,
        help='Edge threshold multiplier for aggressive edge cleanup (default: 2.5, higher = more aggressive)'
    )
    
    args = parser.parse_args()
    
    # Validate color format
    if not args.color.startswith('#'):
        args.color = '#' + args.color
    
    # Convert video to GIF
    success = video_to_gif_opencv(
        args.input,
        args.output,
        target_color_hex=args.color,
        threshold=args.threshold,
        fps=args.fps,
        scale=args.scale,
        edge_threshold_multiplier=args.edge_threshold
    )
    
    if not success:
        sys.exit(1)


if __name__ == '__main__':
    main()

