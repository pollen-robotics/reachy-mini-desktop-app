import React from 'react';
import { Box, Typography, Button, Chip, Collapse, CircularProgress } from '@mui/material';
import PlayArrowOutlinedIcon from '@mui/icons-material/PlayArrowOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import StopCircleOutlinedIcon from '@mui/icons-material/StopCircleOutlined';
import DiscoverAppsButton from '../discover/Button';
import ReachiesCarousel from '@components/ReachiesCarousel';

/**
 * Section displaying installed apps with call-to-actions for discovery and creation
 */
export default function InstalledAppsSection({
  installedApps,
  darkMode,
  expandedApp,
  setExpandedApp,
  startingApp,
  currentApp,
  isBusy,
  isJobRunning,
  handleStartApp,
  handleUninstall,
  getJobInfo,
  stopCurrentApp,
  onOpenDiscover, // Callback to open Discover modal
  onOpenCreateTutorial, // Callback to open Create App Tutorial modal
}) {

  return (
    <Box sx={{ px: 3, mb: 0 }}>
      {/* No apps installed yet - Full height, centered */}
      {installedApps.length === 0 && (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            px: 3,
            py: 3.5,
            borderRadius: '14px',
            bgcolor: 'transparent',
            border: darkMode 
              ? '1px dashed rgba(255, 255, 255, 0.3)' 
              : '1px dashed rgba(0, 0, 0, 0.3)',
            gap: 1.5,
            minHeight: '280px', // Fixed height to match apps container
          }}
        >
          {/* Reachies Carousel - Scrolling images */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mb: 0.25,
            }}
          >
            <ReachiesCarousel 
              width={100}
              height={100}
              interval={750}
              transitionDuration={150}
              zoom={1.6}
              verticalAlign="60%"
              darkMode={darkMode}
            />
          </Box>
              
          <Typography
            sx={{
              fontSize: 14,
              color: darkMode ? '#aaa' : '#666',
              fontWeight: 700,
              textAlign: 'center',
            }}
          >
            No apps installed yet...
          </Typography>

          {/* Discover apps button */}
          <DiscoverAppsButton onClick={onOpenDiscover} darkMode={darkMode} />
          
          {/* Build your own link */}
          <Typography
            component="button"
            onClick={onOpenCreateTutorial}
            sx={{
              fontSize: 11,
              fontWeight: 500,
              color: darkMode ? '#666' : '#999',
              textDecoration: 'underline',
              textDecorationColor: darkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)',
              textUnderlineOffset: '2px',
              cursor: 'pointer',
              bgcolor: 'transparent',
              border: 'none',
              p: 0,
              mt: -0.5,
              transition: 'all 0.2s ease',
              '&:hover': {
                color: darkMode ? '#888' : '#777',
                textDecorationColor: darkMode ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.3)',
              },
            }}
          >
            or build your own
          </Typography>
        </Box>
      )}

      {/* Installed Apps List */}
      {installedApps.length > 0 && (
        <>
          <Box 
            sx={{ 
              display: 'flex', 
              flexDirection: 'column', 
              gap: 1, 
              mb: 0,
              minHeight: '280px', // Same height as empty state box
              borderRadius: '14px',
              bgcolor: 'transparent',
              border: darkMode 
                ? '1px solid rgba(255, 255, 255, 0.08)' 
                : '1px solid rgba(0, 0, 0, 0.08)',
              p: 2,
            }}
          >
          {installedApps.map(app => {
            const isExpanded = expandedApp === app.name;
            const isRemoving = isJobRunning(app.name, 'remove');
            
            // Handle all current app states (with protections)
            // ✅ Production-grade: Handle all AppState enum values from API
            // AppState: "starting" | "running" | "done" | "stopping" | "error"
            const isThisAppCurrent = currentApp && currentApp.info && currentApp.info.name === app.name;
            const appState = isThisAppCurrent && currentApp.state ? currentApp.state : null;
            const isCurrentlyRunning = appState === 'running';
            const isAppStarting = appState === 'starting';
            const isAppStopping = appState === 'stopping';
            const isAppDone = appState === 'done';
            const isAppError = appState === 'error';
            const hasAppError = isThisAppCurrent && (currentApp.error || isAppError);
            
            const isStarting = startingApp === app.name || isAppStarting;
            
            return (
              <Box
                key={app.name}
                sx={{
                  borderRadius: '14px',
                  bgcolor: darkMode ? 'rgba(255, 255, 255, 0.02)' : 'white',
                  border: `1px solid ${isExpanded ? '#FF9500' : (darkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)')}`,
                  // ✅ No transition on bgcolor/border to avoid animation on dark mode change
                  transition: 'opacity 0.25s ease, filter 0.25s ease',
                  overflow: 'hidden',
                  boxShadow: 'none',
                  opacity: isRemoving ? 0.5 : (isBusy && !isCurrentlyRunning ? 0.4 : 1),
                  filter: (isBusy && !isCurrentlyRunning) ? 'grayscale(50%)' : 'none',
                }}
              >
                {/* Header */}
                <Box
                  sx={{
                    p: 2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    bgcolor: isExpanded 
                      ? (darkMode ? 'rgba(255, 149, 0, 0.05)' : 'rgba(255, 149, 0, 0.03)') 
                      : 'transparent',
                  }}
                  onClick={() => setExpandedApp(isExpanded ? null : app.name)}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flex: 1 }}>
                    <Box
                      sx={{
                        fontSize: 28,
                        width: 52,
                        height: 52,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '12px',
                        bgcolor: darkMode ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)',
                        border: `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'}`,
                        flexShrink: 0,
                      }}
                    >
                      {app.extra?.cardData?.emoji || app.icon || '📦'}
                    </Box>
                    
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.3 }}>
                        <Typography
                          sx={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: darkMode ? '#f5f5f5' : '#333',
                            letterSpacing: '-0.2px',
                          }}
                        >
                          {app.name}
                        </Typography>
                        
                        {/* Status Badges - Priority to error state */}
                        {hasAppError && (
                          <Chip 
                            label="Error" 
                            size="small"
                            sx={{
                              height: 16,
                              fontSize: 9,
                              fontWeight: 700,
                              bgcolor: 'rgba(239, 68, 68, 0.1)',
                              color: '#ef4444',
                              '& .MuiChip-label': { px: 0.75 },
                            }}
                          />
                        )}
                      </Box>
                      
                      {/* Job info (installation/removal en cours) - Priority over date */}
                      {(() => {
                        const jobInfo = getJobInfo(app.name);
                        
                        if (jobInfo) {
                          return (
                            <Typography
                              sx={{
                                fontSize: 9,
                                color: jobInfo.type === 'remove' ? '#ef4444' : '#FF9500',
                                fontWeight: 500,
                                fontFamily: 'monospace',
                                letterSpacing: '0.2px',
                              }}
                            >
                              {jobInfo.type === 'remove' ? 'Removing...' : 'Installing...'}
                            </Typography>
                          );
                        }
                        // Show author if no job is running
                        const author = app.extra?.id?.split('/')?.[0] || app.extra?.author || null;
                        if (author) {
                          return (
                            <Typography
                              sx={{
                                fontSize: 9,
                                fontWeight: 500,
                                color: darkMode ? '#666' : '#999',
                                fontFamily: 'monospace',
                                letterSpacing: '0.2px',
                              }}
                            >
                              {author}
                            </Typography>
                          );
                        }
                        return null;
                      })()}
                    </Box>
                  </Box>
                  
                  {/* Actions */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {/* Play/Stop button */}
                    {isCurrentlyRunning ? (
                      <Button
                        size="small"
                        disabled={isBusy && !isCurrentlyRunning}
                        onClick={(e) => {
                          e.stopPropagation();
                          stopCurrentApp();
                        }}
                        endIcon={<StopCircleOutlinedIcon sx={{ fontSize: 13 }} />}
                        sx={{
                          minWidth: 'auto',
                          px: 1.75,
                          py: 0.75,
                          fontSize: 11,
                          fontWeight: 600,
                          textTransform: 'none',
                          borderRadius: '8px',
                          flexShrink: 0,
                          bgcolor: 'transparent',
                          color: '#ef4444',
                          border: '1px solid #ef4444',
                          transition: 'all 0.2s ease',
                          '&:hover': {
                            bgcolor: 'rgba(239, 68, 68, 0.08)',
                            borderColor: '#ef4444',
                          },
                          '&:disabled': {
                            bgcolor: darkMode ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)',
                            color: darkMode ? '#555' : '#999',
                            borderColor: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.12)',
                          },
                        }}
                      >
                        Stop
                      </Button>
                    ) : (
                      <Button
                        size="small"
                        disabled={isStarting || isBusy || isRemoving}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartApp(app.name);
                        }}
                        endIcon={isStarting ? <CircularProgress size={12} sx={{ color: '#FF9500' }} /> : <PlayArrowOutlinedIcon sx={{ fontSize: 13 }} />}
                        sx={{
                          minWidth: 'auto',
                          px: 1.75,
                          py: 0.75,
                          fontSize: 11,
                          fontWeight: 600,
                          textTransform: 'none',
                          borderRadius: '8px',
                          flexShrink: 0,
                          bgcolor: 'transparent',
                          color: '#FF9500',
                          border: '1px solid #FF9500',
                          transition: 'all 0.2s ease',
                          '&:hover': {
                            bgcolor: 'rgba(255, 149, 0, 0.08)',
                            borderColor: '#FF9500',
                          },
                          '&:disabled': {
                            bgcolor: darkMode ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)',
                            color: darkMode ? '#555' : '#999',
                            borderColor: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.12)',
                          },
                        }}
                      >
                        {isStarting ? 'Starting...' : 'Play'}
                      </Button>
                    )}
                  </Box>
                </Box>

                {/* Expanded Content - Description, Settings, and Uninstall */}
                <Collapse in={isExpanded}>
                  <Box
                    sx={{
                      px: 2,
                      pb: 2,
                      pt: 2,
                      borderTop: `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)'}`,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2,
                    }}
                  >
                    {/* Description */}
                    <Typography
                      sx={{
                        fontSize: 11,
                        color: darkMode ? '#aaa' : '#666',
                        lineHeight: 1.5,
                      }}
                    >
                      {app.description || 'No description available'}
                    </Typography>

                    {/* App Logs - Now centralized in LogConsole (see ActiveRobotView) */}
                    {/* Logs from running apps are automatically displayed in the main LogConsole */}

                    {/* Settings Section */}
                    <Box
                      sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 1.5,
                        pt: 1,
                        borderTop: `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)'}`,
                      }}
                    >
                      {/* Uninstall button */}
                      <Button
                        fullWidth
                        size="small"
                        disabled={isRemoving || isCurrentlyRunning}
                        startIcon={isRemoving ? <CircularProgress size={14} /> : <DeleteOutlineIcon sx={{ fontSize: 14 }} />}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleUninstall(app.name);
                        }}
                        sx={{
                          py: 1,
                          fontSize: 12,
                          fontWeight: 600,
                          textTransform: 'none',
                          color: '#ef4444',
                          borderColor: 'rgba(239, 68, 68, 0.3)',
                          '&:hover': {
                            bgcolor: 'rgba(239, 68, 68, 0.08)',
                            borderColor: '#ef4444',
                          },
                          '&:disabled': {
                            bgcolor: darkMode ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)',
                            color: darkMode ? '#555' : '#999',
                            borderColor: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.12)',
                          },
                        }}
                        variant="outlined"
                      >
                        {isRemoving ? 'Uninstalling...' : 'Uninstall'}
                      </Button>
                    </Box>
                  </Box>
                </Collapse>
              </Box>
            );
          })}

          {/* Compact version: Discover apps / Build your own */}
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1.5,
              px: 2,
              py: 1.5,
              borderRadius: '12px',
              bgcolor: 'transparent',
              border: darkMode 
                ? '1px dashed rgba(255, 255, 255, 0.2)' 
                : '1px dashed rgba(0, 0, 0, 0.2)',
              mt: 1,
            }}
          >
            {/* Discover apps button */}
            <DiscoverAppsButton onClick={onOpenDiscover} darkMode={darkMode} />
            
            {/* Build your own link */}
            <Typography
              component="button"
              onClick={onOpenCreateTutorial}
              sx={{
                fontSize: 11,
                fontWeight: 500,
                color: darkMode ? '#666' : '#999',
                textDecoration: 'underline',
                textDecorationColor: darkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)',
                textUnderlineOffset: '2px',
                cursor: 'pointer',
                bgcolor: 'transparent',
                border: 'none',
                p: 0,
                transition: 'color 0.2s ease, textDecorationColor 0.2s ease',
                '&:hover': {
                  color: darkMode ? '#888' : '#777',
                  textDecorationColor: darkMode ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.3)',
                },
              }}
            >
              or build your own
            </Typography>
          </Box>
          </Box>
        </>
      )}

    </Box>
  );
}

