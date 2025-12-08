import React, { useState, useEffect, useRef } from 'react';
import { Box, Typography, CircularProgress, Accordion, AccordionSummary, AccordionDetails } from '@mui/material';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import PlaylistAddCheckIcon from '@mui/icons-material/PlaylistAddCheck';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FullscreenOverlay from '@components/FullscreenOverlay';
import LogConsole from '../../LogConsole';
import useAppStore from '../../../../store/useAppStore';

/**
 * Fullscreen overlay for app installation
 * Displays app details, progress and logs
 */
export default function InstallOverlay({ appInfo, jobInfo, darkMode, jobType = 'install', resultState = null, installStartTime = null }) {
  const { unlockInstall } = useAppStore();
  const [elapsedTime, setElapsedTime] = useState(0);
  const [logsExpanded, setLogsExpanded] = useState(false);
  const intervalRef = useRef(null);
  
  // ✅ Persist logs and progress across jobInfo changes
  // This ensures logs and steps don't disappear when job is temporarily removed from activeJobs
  const persistedLogsRef = useRef([]);
  const maxProgressRef = useRef(0);
  const currentAppNameRef = useRef(null);
  
  // resultState can be: null (in progress), 'success', 'failed'
  // jobType: 'install' or 'remove'
  // installStartTime: timestamp from store representing when installation actually started

  // ✅ Reset persisted data when a NEW installation starts (different app)
  useEffect(() => {
    if (appInfo?.name && appInfo.name !== currentAppNameRef.current) {
      // New installation: reset persisted data
      currentAppNameRef.current = appInfo.name;
      persistedLogsRef.current = [];
      maxProgressRef.current = 0;
    }
  }, [appInfo?.name]);

  // ✅ Accumulate logs and track maximum progress (never lose data)
  useEffect(() => {
    if (jobInfo?.logs && Array.isArray(jobInfo.logs) && jobInfo.logs.length > 0) {
      // Use the latest logs from jobInfo (they are already in order)
      // Keep the maximum length we've seen
      if (jobInfo.logs.length >= persistedLogsRef.current.length) {
        // New logs are longer or equal: use them (they include previous logs)
        persistedLogsRef.current = [...jobInfo.logs];
      } else {
        // JobInfo logs are shorter (job was reset): keep our persisted logs
        // But merge any new unique logs
        const newLogs = jobInfo.logs.filter(log => !persistedLogsRef.current.includes(log));
        if (newLogs.length > 0) {
          persistedLogsRef.current = [...persistedLogsRef.current, ...newLogs];
        }
      }
      
      // Update max progress (never decrease)
      const currentProgress = persistedLogsRef.current.length;
      if (currentProgress > maxProgressRef.current) {
        maxProgressRef.current = currentProgress;
      }
    }
  }, [jobInfo?.logs]);

  // Timer to display elapsed time - Continue until result is shown
  // Use installStartTime from store if available, otherwise use overlay mount time as fallback
  const overlayStartTimeRef = useRef(null);
  
  useEffect(() => {
    if (!appInfo) {
      setElapsedTime(0);
      overlayStartTimeRef.current = null;
      return;
    }
    
    // Initialize overlay start time on mount (fallback if installStartTime not available yet)
    if (!overlayStartTimeRef.current) {
      overlayStartTimeRef.current = Date.now();
    }
    
    // Use installStartTime from store if available (more accurate), otherwise use overlay mount time
    const startTime = installStartTime || overlayStartTimeRef.current;
    
    // Calculate elapsed time from start time
    const updateElapsedTime = () => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      setElapsedTime(elapsed);
    };
    
    // Update immediately
    updateElapsedTime();
    
    // Update every second, but only if still in progress
    if (resultState === null) {
      intervalRef.current = setInterval(updateElapsedTime, 1000);
    } else {
      // If result is shown, calculate final time once and stop
      updateElapsedTime();
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [appInfo, installStartTime, resultState]);

  if (!appInfo) return null;

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const isInstalling = jobType === 'install';
  
  // ✅ Use persisted data: never lose logs or decrease progress
  const currentLogs = jobInfo?.logs && jobInfo.logs.length > 0 
    ? jobInfo.logs 
    : persistedLogsRef.current;
  
  // ✅ Detect installation phase instead of counting all logs
  // This gives a clearer indication of progress than raw log count
  const detectPhase = (logs) => {
    if (!logs || logs.length === 0) {
      return { phase: 'Preparing', step: 0 };
    }
    
    const logsText = logs.join(' ').toLowerCase();
    const logCount = logs.length;
    
    // Detect phases based on log content
    if (logsText.includes('completed') || logsText.includes('success')) {
      return { phase: 'Finalizing', step: 4 };
    }
    if (logsText.includes('configuring') || logsText.includes('setting up') || logsText.includes('installing dependencies')) {
      return { phase: 'Configuring', step: 3 };
    }
    if (logsText.includes('installing') || logsText.includes('copying') || logsText.includes('extracting')) {
      return { phase: 'Installing', step: 2 };
    }
    if (logsText.includes('downloading') || logsText.includes('fetching') || logsText.includes('retrieving')) {
      return { phase: 'Downloading', step: 1 };
    }
    
    // Default: show progress based on log count (but cap it)
    return { phase: 'Processing', step: Math.min(5, Math.floor(logCount / 10) + 1) };
  };
  
  const phaseInfo = detectPhase(currentLogs);
  const latestLogs = currentLogs.length > 0 ? currentLogs.slice(-5) : []; // Display last 5 logs when collapsed
  const allLogs = currentLogs; // All logs when expanded
  
  // Determine if showing final result or progress
  const isShowingResult = resultState !== null;

  return (
    <FullscreenOverlay
      open={!!appInfo}
      onClose={() => {
        // Allow manual close - unlock install state when overlay is closed
        unlockInstall();
      }}
      darkMode={darkMode}
      zIndex={10003} // Above DiscoverModal (10002)
      showCloseButton={isShowingResult && resultState === 'failed'} // Show close button only on error
      centered={true} // Center both horizontally and vertically
    >
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 2,
          maxWidth: '500px',
          width: '90%',
        }}
      >
        {/* Icon - Changes based on state */}
        {isShowingResult && resultState === 'failed' ? (
          // ❌ Error state only - MUI icon
          <Box
            sx={{
              width: 120,
              height: 120,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '60px',
              bgcolor: 'rgba(239, 68, 68, 0.1)',
              border: '3px solid rgba(239, 68, 68, 0.3)',
            }}
          >
              <ErrorOutlineIcon 
                sx={{ 
                  fontSize: 64, 
                  color: '#ef4444',
                }} 
              />
          </Box>
        ) : (
          // 🔄 Progress (app icon with pulse)
          <Box
            sx={{
              fontSize: 64,
              width: 100,
              height: 100,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '24px',
              bgcolor: darkMode ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)',
              border: `2px solid ${darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'}`,
              animation: 'pulse 2s ease-in-out infinite',
              '@keyframes pulse': {
                '0%, 100%': { transform: 'scale(1)' },
                '50%': { transform: 'scale(1.05)' },
              },
            }}
          >
            {appInfo.extra?.cardData?.emoji || appInfo.icon || '📦'}
          </Box>
        )}

        {/* Title - Changes based on state */}
        {isShowingResult && resultState === 'failed' ? (
          // ❌ Error message only (no success state)
          <Box sx={{ textAlign: 'center' }}>
            <Typography
              sx={{
                fontSize: 24,
                fontWeight: 600,
                color: '#ef4444',
                mb: 0.5,
                animation: 'fadeInScale 0.5s ease',
                '@keyframes fadeInScale': {
                  from: { opacity: 0, transform: 'scale(0.9)' },
                  to: { opacity: 1, transform: 'scale(1)' },
                },
              }}
            >
              {isInstalling ? 'Installation Failed' : 'Uninstallation Failed'}
            </Typography>
            <Typography
              sx={{
                fontSize: 16,
                fontWeight: 500,
                color: darkMode ? '#999' : '#666',
              }}
            >
              {appInfo.name}
            </Typography>
          </Box>
        ) : (
          // 🔄 Normal title (progress)
          <Box sx={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 0.25, mb: -0.5 }}>
            <Typography
              sx={{
                fontSize: 10,
                fontWeight: 500,
                color: darkMode ? '#666' : '#aaa',
                letterSpacing: '1px',
                textTransform: 'uppercase',
              }}
            >
              {isInstalling ? 'Installing' : 'Uninstalling'}
            </Typography>
            <Typography
              sx={{
                fontSize: 24,
                fontWeight: 600,
                color: darkMode ? '#f5f5f5' : '#333',
                letterSpacing: '-0.3px',
              }}
            >
              {appInfo.name}
            </Typography>
          </Box>
        )}

        {/* Continue showing logs and time even in success state */}
        <>
          {/* Description + Metadata - Show only during progress, hide on success */}
          {!isShowingResult && (
            <Box sx={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Typography
                sx={{
                  fontSize: 13,
                  color: darkMode ? '#aaa' : '#666',
                  lineHeight: 1.5,
                  maxWidth: '420px',
                }}
              >
                {appInfo.description || 'No description'}
              </Typography>
              
              {/* Author + Downloads (sans stars) */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, justifyContent: 'center', flexWrap: 'wrap' }}>
                {appInfo.author && (
                  <Typography
                    sx={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: darkMode ? '#888' : '#999',
                    }}
                  >
                    by {appInfo.author}
                  </Typography>
                )}
                
                {appInfo.downloads !== undefined && (
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.5,
                      px: 1,
                      py: 0.25,
                      borderRadius: '8px',
                      bgcolor: darkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
                    }}
                  >
                    <Typography
                      sx={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: darkMode ? '#888' : '#666',
                      }}
                    >
                      {appInfo.downloads} downloads
                    </Typography>
                  </Box>
                )}
              </Box>
            </Box>
          )}

          {/* Elapsed time + Steps - Only visible during progress, not in result state */}
          {!isShowingResult && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                mt: 1.5,
              }}
            >
              {/* Elapsed time tag */}
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  px: 2,
                  py: 1,
                  borderRadius: '10px',
                  bgcolor: darkMode ? 'rgba(255, 149, 0, 0.08)' : 'rgba(255, 149, 0, 0.05)',
                  border: `1px solid ${darkMode ? 'rgba(255, 149, 0, 0.2)' : 'rgba(255, 149, 0, 0.15)'}`,
                }}
              >
                <CircularProgress size={14} thickness={5} sx={{ color: '#FF9500' }} />
                <Typography
                  sx={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#FF9500',
                    fontFamily: 'monospace',
                  }}
                >
                  {formatTime(elapsedTime)}
                </Typography>
              </Box>
              
              {/* Phase indicator */}
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.75,
                  px: 1.5,
                  py: 1,
                  borderRadius: '10px',
                  bgcolor: darkMode ? 'rgba(255, 149, 0, 0.08)' : 'rgba(255, 149, 0, 0.05)',
                  border: `1px solid ${darkMode ? 'rgba(255, 149, 0, 0.2)' : 'rgba(255, 149, 0, 0.15)'}`,
                }}
              >
                <PlaylistAddCheckIcon sx={{ fontSize: 14, color: '#FF9500' }} />
                <Typography
                  sx={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#FF9500',
                    fontFamily: 'monospace',
                  }}
                >
                  {phaseInfo.phase}
                </Typography>
              </Box>
            </Box>
          )}

          {/* Recent logs - Accordion (collapsed by default) */}
          <Accordion
            expanded={logsExpanded}
            onChange={(e, expanded) => setLogsExpanded(expanded)}
              sx={{
                width: '100%',
                maxWidth: '460px',
              bgcolor: 'transparent !important',
              boxShadow: 'none !important',
              '&:before': { display: 'none' },
              '&.Mui-expanded': { margin: 0 },
            }}
          >
            <AccordionSummary
              expandIcon={
                <ExpandMoreIcon 
                  sx={{ 
                    color: darkMode ? '#888' : '#999',
                    fontSize: 18,
                  }} 
                />
              }
              sx={{
                minHeight: 'auto !important',
                py: 1,
                px: 1.5,
                borderRadius: '12px',
                bgcolor: darkMode ? 'rgba(0, 0, 0, 0.2)' : 'rgba(0, 0, 0, 0.02)',
                border: `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)'}`,
                '&:hover': {
                  bgcolor: darkMode ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.04)',
                },
                '&.Mui-expanded': {
                  minHeight: 'auto !important',
                  borderBottomLeftRadius: 0,
                  borderBottomRightRadius: 0,
                },
                '& .MuiAccordionSummary-content': {
                  margin: '8px 0 !important',
                  '&.Mui-expanded': {
                    margin: '8px 0 !important',
                  },
                },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                <Typography
                  sx={{
                    fontSize: 11,
                    fontWeight: 500,
                    color: darkMode ? '#aaa' : '#666',
                  }}
                >
                  {logsExpanded ? 'Hide logs' : 'Show logs'}
                </Typography>
                {!logsExpanded && latestLogs.length > 0 && (
                  <Typography
                    sx={{
                      fontSize: 10,
                      color: darkMode ? '#666' : '#999',
                      ml: 'auto',
                    }}
                  >
                    {latestLogs.length} {latestLogs.length === 1 ? 'recent log' : 'recent logs'}
                  </Typography>
                )}
              </Box>
            </AccordionSummary>
            <AccordionDetails
              sx={{
                p: 0,
                border: `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)'}`,
                borderTop: 'none',
                borderBottomLeftRadius: '12px',
                borderBottomRightRadius: '12px',
                bgcolor: darkMode ? 'rgba(0, 0, 0, 0.2)' : 'rgba(0, 0, 0, 0.02)',
              }}
            >
              <LogConsole
                logs={allLogs}
                darkMode={darkMode}
                includeStoreLogs={false}
                maxHeight="140px"
                showTimestamp={false}
                simpleStyle={true}
                compact={false}
                sx={{
                  bgcolor: 'transparent',
                  border: 'none',
                  borderRadius: 0,
                      }}
                    />
            </AccordionDetails>
          </Accordion>

          {/* Instruction - Show only during progress */}
          {!isShowingResult && isInstalling && (
              <Typography
                sx={{
                  fontSize: 11,
                  color: darkMode ? '#666' : '#999',
                  fontStyle: 'italic',
                  mt: 1,
                }}
              >
                This may take up to 1 minute...
              </Typography>
            )}
          </>
      </Box>
    </FullscreenOverlay>
  );
}

