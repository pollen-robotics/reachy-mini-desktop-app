import React, { useState } from 'react';
import { Box, Typography, Button, Chip, IconButton, Collapse, Switch, Slider, CircularProgress, Tooltip } from '@mui/material';
import PlayArrowOutlinedIcon from '@mui/icons-material/PlayArrowOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import StopCircleOutlinedIcon from '@mui/icons-material/StopCircleOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import StoreOutlinedIcon from '@mui/icons-material/StoreOutlined';
import CodeOutlinedIcon from '@mui/icons-material/CodeOutlined';
import BuildOutlinedIcon from '@mui/icons-material/BuildOutlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import CloseIcon from '@mui/icons-material/Close';
import ReachyBox from '../../../assets/reachy-update-box.svg';
import DiscoverAppsButton from './DiscoverAppsButton';
import ReachiesCarousel from '../../../components/ReachiesCarousel';
import FullscreenOverlay from '../../../components/FullscreenOverlay';

/**
 * Section displaying installed apps with call-to-actions for discovery and creation
 */
export default function InstalledAppsSection({
  installedApps,
  darkMode,
  expandedApp,
  setExpandedApp,
  appSettings,
  updateAppSetting,
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
  const [settingsAppName, setSettingsAppName] = useState(null);

  const handleOpenSettings = (appName, e) => {
    if (e) e.stopPropagation();
    setSettingsAppName(appName);
  };

  const handleCloseSettings = () => {
    setSettingsAppName(null);
  };

  const settingsApp = installedApps.find(app => app.name === settingsAppName);
  const settings = settingsApp ? (appSettings[settingsAppName] || {}) : {};
  
  // Handle all current app states for settings modal
  const isThisAppCurrent = settingsApp && currentApp && currentApp.info && currentApp.info.name === settingsAppName;
  const appState = isThisAppCurrent && currentApp.state ? currentApp.state : null;
  const isCurrentlyRunning = appState === 'running';
  const isRemoving = settingsApp ? isJobRunning(settingsAppName, 'remove') : false;

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
          }}
        >
          {/* Reachies Carousel - Images qui défilent */}
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
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2.5 }}>
          {installedApps.map(app => {
            const isExpanded = expandedApp === app.name;
            const settings = appSettings[app.name] || {};
            const isRemoving = isJobRunning(app.name, 'remove');
            
            // Handle all current app states (with protections)
            const isThisAppCurrent = currentApp && currentApp.info && currentApp.info.name === app.name;
            const appState = isThisAppCurrent && currentApp.state ? currentApp.state : null;
            const isCurrentlyRunning = appState === 'running';
            const isAppStarting = appState === 'starting';
            const hasAppError = isThisAppCurrent && currentApp.error;
            
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
                    {/* Settings cog - outlined gris - Ouvre la modale */}
                    <IconButton
                      size="small"
                      onClick={(e) => handleOpenSettings(app.name, e)}
                      sx={{
                        width: 32,
                        height: 32,
                        bgcolor: 'transparent',
                        color: darkMode ? '#aaa' : '#666',
                        border: darkMode ? '1px solid rgba(255, 255, 255, 0.2)' : '1px solid rgba(0, 0, 0, 0.2)',
                        borderRadius: '8px',
                        transition: 'all 0.2s ease',
                        '&:hover': {
                          bgcolor: darkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
                          borderColor: darkMode ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.3)',
                        },
                      }}
                    >
                      <SettingsOutlinedIcon 
                        sx={{ 
                          fontSize: 16,
                        }} 
                      />
                    </IconButton>
                    
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

                {/* Expanded Content - Description seulement */}
                <Collapse in={isExpanded}>
                  <Box
                    sx={{
                      px: 2,
                      pb: 2,
                      pt: 2,
                      borderTop: `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)'}`,
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
                  </Box>
                </Collapse>
              </Box>
            );
          })}
        </Box>
      )}

      {/* Settings Modal */}
      <FullscreenOverlay
        open={settingsAppName !== null}
        onClose={handleCloseSettings}
        darkMode={darkMode}
        zIndex={10003} // Above discover modal
      >
        {settingsApp && (
          <Box
            sx={{
              position: 'relative',
              width: '90%',
              maxWidth: '500px',
              display: 'flex',
              flexDirection: 'column',
              mt: 8,
              mb: 4,
            }}
          >
            {/* Close button - top right */}
            <IconButton
              onClick={handleCloseSettings}
              sx={{
                position: 'absolute',
                top: 0,
                right: 0,
                color: '#FF9500',
                bgcolor: darkMode ? 'rgba(255, 255, 255, 0.08)' : '#ffffff',
                border: '1px solid #FF9500',
                opacity: 0.7,
                '&:hover': {
                  opacity: 1,
                  bgcolor: darkMode ? 'rgba(255, 255, 255, 0.12)' : '#ffffff',
                },
                zIndex: 1,
              }}
            >
              <CloseIcon sx={{ fontSize: 20 }} />
            </IconButton>

            {/* Header */}
            <Box sx={{ mb: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
                <Box
                  sx={{
                    fontSize: 32,
                    width: 64,
                    height: 64,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '14px',
                    bgcolor: darkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
                    border: `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'}`,
                    flexShrink: 0,
                  }}
                >
                  {settingsApp.extra?.cardData?.emoji || settingsApp.icon || '📦'}
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Typography
                    sx={{
                      fontSize: 24,
                      fontWeight: 700,
                      color: darkMode ? '#f5f5f5' : '#333',
                      letterSpacing: '-0.3px',
                      mb: 0.5,
                    }}
                  >
                    {settingsApp.name}
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: 12,
                      color: darkMode ? '#888' : '#999',
                    }}
                  >
                    Settings
                  </Typography>
                </Box>
              </Box>
            </Box>

            {/* Settings Content */}
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
              }}
            >
              {/* Auto-start toggle */}
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  p: 2,
                  borderRadius: '12px',
                  bgcolor: darkMode ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
                  border: darkMode ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid rgba(0, 0, 0, 0.06)',
                }}
              >
                <Box>
                  <Typography
                    sx={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: darkMode ? '#f5f5f5' : '#333',
                      mb: 0.5,
                    }}
                  >
                    Auto-start on boot
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: 11,
                      color: darkMode ? '#888' : '#999',
                    }}
                  >
                    Launch automatically when robot starts
                  </Typography>
                </Box>
                <Switch
                  checked={settings.autoStart || false}
                  onChange={(e) => updateAppSetting(settingsAppName, 'autoStart', e.target.checked)}
                  disabled={isCurrentlyRunning}
                  sx={{
                    '& .MuiSwitch-switchBase.Mui-checked': {
                      color: '#FF9500',
                    },
                    '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                      backgroundColor: '#FF9500',
                    },
                  }}
                />
              </Box>

              {/* Uninstall button */}
              <Button
                fullWidth
                size="medium"
                disabled={isRemoving || isCurrentlyRunning}
                startIcon={isRemoving ? <CircularProgress size={16} /> : <DeleteOutlineIcon sx={{ fontSize: 16 }} />}
                onClick={() => {
                  handleUninstall(settingsAppName);
                  handleCloseSettings();
                }}
                sx={{
                  mt: 1,
                  py: 1.25,
                  fontSize: 13,
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
                Uninstall
              </Button>
            </Box>
          </Box>
        )}
      </FullscreenOverlay>
    </Box>
  );
}

