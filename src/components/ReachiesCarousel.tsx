import { useState, useEffect, useMemo } from 'react';
import { Box } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';

// Load all images from reachies/small-top-sided folder dynamically with Vite
const imageModules = import.meta.glob('../assets/reachies/small-top-sided/*.png', { eager: true });

export interface ReachiesCarouselProps {
  width?: number;
  height?: number;
  interval?: number;
  /** DEPRECATED, use fadeInDuration and fadeOutDuration */
  transitionDuration?: number;
  fadeInDuration?: number;
  fadeOutDuration?: number;
  zoom?: number;
  verticalAlign?: 'top' | 'center' | 'bottom' | string;
  darkMode?: boolean;
  sx?: SxProps<Theme>;
}

/**
 * Component that loads all PNG images from reachies/small-top-sided folder,
 * stores them in memory and displays them in sequence with overlapping fade transition.
 *
 * Images are loaded dynamically and displayed one after another
 * in a fixed frame, with a fade in/out transition between each image.
 */
export default function ReachiesCarousel({
  width = 100,
  height = 100,
  interval = 1000, // Display duration of each image in ms (faster)
  transitionDuration = 150, // Fade transition duration in ms (very sharp) - DEPRECATED, use fadeInDuration and fadeOutDuration
  fadeInDuration = 350, // Fade-in duration for incoming image (slower, Apple/Google style)
  fadeOutDuration = 120, // Fade-out duration for outgoing image (faster, Apple/Google style)
  zoom = 1.8, // Zoom factor to enlarge the sticker
  verticalAlign = 'center', // Vertical alignment: 'top', 'center', 'bottom', or percentage (e.g.: '60%')
  darkMode = false,
  sx = {},
}: ReachiesCarouselProps) {
  // Extract URLs of loaded images and sort them for consistent order
  const imagePaths = useMemo<string[]>(() => {
    const paths = Object.values(imageModules)
      .map((mod: unknown) => {
        // With eager: true, module is already loaded, access .default
        return typeof mod === 'object' && mod !== null && 'default' in mod
          ? (mod as { default: string }).default
          : (mod as string);
      })
      .filter((p): p is string => Boolean(p)) // Filter null/undefined values
      .sort(); // Sort for consistent order

    return paths;
  }, []);

  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [previousIndex, setPreviousIndex] = useState<number | null>(null);
  const [isTransitioning, setIsTransitioning] = useState<boolean>(false);
  const [fadeOutComplete, setFadeOutComplete] = useState<boolean>(false);

  // Preload all images in memory for smooth transitions
  useEffect(() => {
    imagePaths.forEach(imagePath => {
      const img = new Image();
      img.src = imagePath;
    });
  }, [imagePaths]);

  // Function to get a random index different from current
  const getRandomIndex = (currentIdx: number, total: number): number => {
    if (total <= 1) return 0;
    let newIndex: number;
    do {
      newIndex = Math.floor(Math.random() * total);
    } while (newIndex === currentIdx && total > 1);
    return newIndex;
  };

  // Automatically change image with overlap and random selection
  useEffect(() => {
    if (imagePaths.length > 0) {
      const timer = setInterval(() => {
        // Save previous index BEFORE changing to guarantee crossfade
        const prevIdx = currentIndex;
        setPreviousIndex(prevIdx);
        setIsTransitioning(true);
        setFadeOutComplete(false); // Reset at start of transition

        // Select a random image different from current
        const newIndex = getRandomIndex(currentIndex, imagePaths.length);
        setCurrentIndex(newIndex);

        // Outgoing image starts disappearing after a delay to create more overlap
        // Both images remain visible together longer
        const overlapDelay = Math.min(fadeInDuration * 0.4, fadeOutDuration * 2); // 40% of fade-in or 2x fade-out
        setTimeout(() => {
          setFadeOutComplete(true);
        }, overlapDelay);

        // Reset transition state after longest duration (fade-in)
        setTimeout(
          () => {
            setIsTransitioning(false);
            setPreviousIndex(null);
            setFadeOutComplete(false);
          },
          Math.max(fadeInDuration, fadeOutDuration)
        );
      }, interval);

      return () => clearInterval(timer);
    }
    return undefined;
  }, [imagePaths.length, interval, currentIndex, fadeInDuration, fadeOutDuration]);

  if (imagePaths.length === 0) {
    return (
      <Box
        sx={{
          width,
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          ...(sx as object),
        }}
      />
    );
  }

  return (
    <Box
      sx={{
        position: 'relative',
        width,
        height,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden', // Prevent zoom overflow
        ...(sx as object),
      }}
    >
      {imagePaths.map((imageSrc, index) => {
        const isActive = index === currentIndex;
        const isPrevious = index === previousIndex && isTransitioning;

        // Calculate vertical position according to alignment
        let topValue: number | string;
        let transformY: string;
        if (verticalAlign === 'top') {
          topValue = 0;
          transformY = '0';
        } else if (verticalAlign === 'bottom') {
          topValue = '100%';
          transformY = '-100%';
        } else if (typeof verticalAlign === 'string' && verticalAlign.includes('%')) {
          // Custom percentage
          topValue = verticalAlign;
          transformY = '-50%';
        } else {
          // Default: center
          topValue = '50%';
          transformY = '-50%';
        }

        // Crossfade style Apple/Google: outgoing disappears faster than incoming appears
        const baseOpacity = darkMode ? 0.8 : 0.9;
        let opacity = 0;
        let transitionStyle = 'none';

        // Crossfade logic: both images must be visible simultaneously
        if (isActive) {
          // Incoming image: slow and progressive fade-in (premium style)
          opacity = baseOpacity;
          transitionStyle = `opacity ${fadeInDuration}ms cubic-bezier(0.4, 0, 0.2, 1)`; // Smooth ease-out
        } else if (isPrevious) {
          // Outgoing image: fast fade-out (disappears quickly to make room)
          // Starts visible, then disappears after fadeOutDuration
          opacity = fadeOutComplete ? 0 : baseOpacity;
          transitionStyle = `opacity ${fadeOutDuration}ms cubic-bezier(0.4, 0, 1, 1)`; // More aggressive ease-out
        }
        // Otherwise opacity stays at 0 (invisible)

        return (
          <Box
            key={`${imageSrc}-${index}`} // Unique key to force re-render
            component="img"
            src={imageSrc}
            alt={`Reachy ${index + 1}`}
            sx={{
              position: 'absolute',
              width: width * zoom,
              height: height * zoom,
              objectFit: 'cover',
              objectPosition: 'center top', // Align top of image to top
              opacity,
              transform: `translate(-50%, ${transformY})`, // No scale
              transition: transitionStyle,
              pointerEvents: 'none',
              // Position zoomed image with custom vertical alignment
              left: '50%',
              top: topValue,
              zIndex: isActive ? 2 : isPrevious ? 1 : 0, // Active image on top
              willChange: 'opacity', // GPU optimization
              backfaceVisibility: 'hidden', // Avoid rendering artifacts
              WebkitBackfaceVisibility: 'hidden',
            }}
          />
        );
      })}
    </Box>
  );
}
