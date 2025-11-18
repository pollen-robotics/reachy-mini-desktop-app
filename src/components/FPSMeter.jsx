import React, { useState, useEffect, useRef } from 'react';
import { Box, Typography } from '@mui/material';
import useAppStore from '../store/useAppStore';

/**
 * Performance Monitor Component
 * Displays FPS, memory usage, and other performance metrics
 * Similar to official dev tools performance monitors
 */
export default function FPSMeter() {
  const { darkMode } = useAppStore();
  const [fps, setFps] = useState(0);
  const [memory, setMemory] = useState({ used: 0, total: 0, percentage: 0 });
  const frameCount = useRef(0);
  const lastTime = useRef(performance.now());
  const animationFrameId = useRef(null);
  const memoryIntervalId = useRef(null);

  // Format bytes to human readable format
  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  // Get memory info if available
  const getMemoryInfo = () => {
    // Try Chrome/Edge performance.memory API
    if (performance.memory) {
      const used = performance.memory.usedJSHeapSize;
      const total = performance.memory.totalJSHeapSize;
      const limit = performance.memory.jsHeapSizeLimit;
      const percentage = Math.round((used / limit) * 100);
      return { used, total: limit, percentage };
    }
    
    // Try to estimate from performance timing (less accurate)
    if (performance.memory === undefined && performance.now) {
      // Fallback: estimate based on navigation timing if available
      // This is a rough estimate and not as accurate
      return null;
    }
    
    return null;
  };

  useEffect(() => {
    // FPS measurement
    const measureFPS = () => {
      frameCount.current += 1;
      const currentTime = performance.now();
      const deltaTime = currentTime - lastTime.current;

      // Update FPS every second
      if (deltaTime >= 1000) {
        const currentFPS = Math.round((frameCount.current * 1000) / deltaTime);
        setFps(currentFPS);
        frameCount.current = 0;
        lastTime.current = currentTime;
      }

      animationFrameId.current = requestAnimationFrame(measureFPS);
    };

    animationFrameId.current = requestAnimationFrame(measureFPS);

    // Memory measurement (update every 500ms)
    const updateMemory = () => {
      const memInfo = getMemoryInfo();
      if (memInfo) {
        setMemory(memInfo);
      } else {
        // Reset to 0 if not available
        setMemory({ used: 0, total: 0, percentage: 0 });
      }
    };

    updateMemory(); // Initial update
    memoryIntervalId.current = setInterval(updateMemory, 500);

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
      if (memoryIntervalId.current) {
        clearInterval(memoryIntervalId.current);
      }
    };
  }, []);

  const hasMemoryInfo = memory.used > 0;

  return (
    <Box
      sx={{
        position: 'fixed',
        bottom: 12,
        left: 12,
        bgcolor: darkMode ? 'rgba(26, 26, 26, 0.9)' : 'rgba(255, 255, 255, 0.9)',
        backdropFilter: 'blur(10px)',
        border: darkMode ? '1px solid rgba(255, 255, 255, 0.15)' : '1px solid rgba(0, 0, 0, 0.15)',
        borderRadius: '8px',
        px: 1.5,
        py: 1,
        zIndex: 10000,
        pointerEvents: 'none',
        minWidth: hasMemoryInfo ? '140px' : '70px',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 0.5,
        }}
      >
        {/* FPS */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              bgcolor: fps >= 55 ? '#22c55e' : fps >= 30 ? '#eab308' : '#ef4444',
              flexShrink: 0,
            }}
          />
          <Typography
            sx={{
              fontSize: 10,
              fontWeight: 600,
              color: darkMode ? '#f5f5f5' : '#333',
              fontFamily: 'SF Mono, Monaco, Menlo, monospace',
              letterSpacing: '0.05em',
            }}
          >
            {fps} FPS
          </Typography>
        </Box>

        {/* Memory */}
        {hasMemoryInfo && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                bgcolor: memory.percentage < 70 ? '#22c55e' : memory.percentage < 90 ? '#eab308' : '#ef4444',
                flexShrink: 0,
              }}
            />
            <Typography
              sx={{
                fontSize: 10,
                fontWeight: 600,
                color: darkMode ? '#f5f5f5' : '#333',
                fontFamily: 'SF Mono, Monaco, Menlo, monospace',
                letterSpacing: '0.05em',
              }}
            >
              {formatBytes(memory.used)} / {formatBytes(memory.total)}
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}

