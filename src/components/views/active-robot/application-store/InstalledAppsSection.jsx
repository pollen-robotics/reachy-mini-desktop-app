import React from 'react';
import { Box, Typography, Button, Chip, IconButton, Collapse, Switch, Slider, CircularProgress } from '@mui/material';
import PlayArrowOutlinedIcon from '@mui/icons-material/PlayArrowOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import StopCircleOutlinedIcon from '@mui/icons-material/StopCircleOutlined';
import { open } from '@tauri-apps/plugin-shell';

/**
 * Section displaying installed apps
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
}) {
  return (
    <Box sx={{ px: 3, mb: 3 }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 1.5,
          mb: 1.5,
        }}
      >
        <Typography
          sx={{
            fontSize: 11,
            fontWeight: 700,
            color: darkMode ? '#aaa' : '#666',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          Installed Apps
        </Typography>
        <Typography
          sx={{
            fontSize: 11,
            fontWeight: 700,
            color: darkMode ? '#666' : '#999',
          }}
        >
          {installedApps.length}
        </Typography>
      </Box>
      
      {installedApps.length === 0 ? (
        <Box
          sx={{
            py: 3,
            px: 2,
            textAlign: 'center',
            borderRadius: '12px',
            bgcolor: darkMode ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)',
            border: darkMode 
              ? '1px dashed rgba(255, 255, 255, 0.25)' 
              : '1px dashed rgba(0, 0, 0, 0.2)',
          }}
        >
          <Typography
            sx={{
              fontSize: 12,
              color: darkMode ? '#666' : '#999',
              fontWeight: 500,
            }}
          >
            No apps installed yet
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
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
                  transition: 'transform 0.25s ease, box-shadow 0.25s ease, opacity 0.25s ease, filter 0.25s ease',
                  overflow: 'hidden',
                  boxShadow: isExpanded ? (darkMode ? '0 4px 12px rgba(0, 0, 0, 0.3)' : '0 4px 12px rgba(0, 0, 0, 0.08)') : 'none',
                  opacity: isRemoving ? 0.5 : (isBusy && !isCurrentlyRunning ? 0.4 : 1),
                  filter: (isBusy && !isCurrentlyRunning) ? 'grayscale(50%)' : 'none',
                  '&:hover': !isExpanded ? {
                    borderColor: darkMode ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.15)',
                    transform: (isBusy && !isCurrentlyRunning) ? 'none' : 'translateY(-1px)',
                    boxShadow: darkMode ? '0 4px 12px rgba(0, 0, 0, 0.25)' : '0 4px 12px rgba(0, 0, 0, 0.08)',
                  } : {},
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
                    // ✅ No transition on bgcolor to avoid animation on dark mode change
                    transition: 'box-shadow 0.25s ease',
                    '&:hover': {
                      bgcolor: isExpanded
                        ? (darkMode ? 'rgba(255, 149, 0, 0.08)' : 'rgba(255, 149, 0, 0.05)')
                        : (darkMode ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)'),
                    },
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
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.25 }}>
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
                        
                        {/* Status Badges - Priority to error/running states */}
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
                        {!hasAppError && isCurrentlyRunning && (
                          <Chip 
                            label="Running" 
                            size="small"
                            sx={{
                              height: 16,
                              fontSize: 9,
                              fontWeight: 700,
                              bgcolor: 'rgba(34, 197, 94, 0.1)',
                              color: '#22c55e',
                              '& .MuiChip-label': { px: 0.75 },
                            }}
                          />
                        )}
                      </Box>
                      
                      {/* Job info (installation/removal en cours) */}
                      {(() => {
                        const jobInfo = getJobInfo(app.name);
                        if (jobInfo) {
                          return (
                            <Typography
                              sx={{
                                fontSize: 10,
                                color: jobInfo.type === 'remove' ? '#ef4444' : '#FF9500',
                                fontWeight: 500,
                              }}
                            >
                              {jobInfo.type === 'remove' ? 'Removing...' : 'Installing...'}
                            </Typography>
                          );
                        }
                        return (
                          <Typography
                            sx={{
                              fontSize: 10,
                              color: darkMode ? '#888' : '#999',
                              fontWeight: 500,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {app.description || 'No description'}
                          </Typography>
                        );
                      })()}
                    </Box>
                  </Box>
                  
                  {/* Actions */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {/* Settings cog - avant le bouton play */}
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedApp(isExpanded ? null : app.name);
                      }}
                      sx={{
                        width: 32,
                        height: 32,
                        transition: 'transform 0.3s ease',
                        transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                      }}
                    >
                      <SettingsOutlinedIcon sx={{ fontSize: 16, color: darkMode ? '#aaa' : '#666' }} />
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
                        startIcon={<StopCircleOutlinedIcon sx={{ fontSize: 13 }} />}
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
                        startIcon={isStarting ? <CircularProgress size={12} sx={{ color: '#FF9500' }} /> : <PlayArrowOutlinedIcon sx={{ fontSize: 13 }} />}
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

                {/* Expanded Content */}
                <Collapse in={isExpanded}>
                  <Box
                    sx={{
                      px: 2,
                      pb: 2,
                      borderTop: `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)'}`,
                    }}
                  >
                    {/* Description */}
                    <Typography
                      sx={{
                        fontSize: 11,
                        color: darkMode ? '#aaa' : '#666',
                        lineHeight: 1.5,
                        mb: 2,
                        mt: 2,
                      }}
                    >
                      {app.description || 'No description available'}
                    </Typography>

                    {/* Settings Section */}
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        mb: 1.5,
                        pt: 1.5,
                        borderTop: `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)'}`,
                      }}
                    >
                      <SettingsOutlinedIcon sx={{ fontSize: 13, color: darkMode ? '#888' : '#999' }} />
                      <Typography
                        sx={{
                          fontSize: 10,
                          fontWeight: 600,
                          color: darkMode ? '#aaa' : '#666',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                        }}
                      >
                        Settings
                      </Typography>
                    </Box>

                    {/* Auto-start toggle */}
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        py: 1,
                        px: 1.5,
                        borderRadius: '8px',
                        bgcolor: darkMode ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)',
                        mb: 1.5,
                      }}
                    >
                      <Box>
                        <Typography
                          sx={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: darkMode ? '#f5f5f5' : '#333',
                            mb: 0.25,
                          }}
                        >
                          Auto-start on boot
                        </Typography>
                        <Typography
                          sx={{
                            fontSize: 9,
                            color: darkMode ? '#888' : '#999',
                          }}
                        >
                          Launch automatically when robot starts
                        </Typography>
                      </Box>
                      <Switch
                        size="small"
                        checked={settings.autoStart || false}
                        onChange={(e) => updateAppSetting(app.name, 'autoStart', e.target.checked)}
                        disabled={isCurrentlyRunning}
                      />
                    </Box>

                    {/* Volume slider */}
                    <Box
                      sx={{
                        py: 1,
                        px: 1.5,
                        borderRadius: '8px',
                        bgcolor: darkMode ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)',
                      }}
                    >
                      <Typography
                        sx={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: darkMode ? '#f5f5f5' : '#333',
                          mb: 1,
                        }}
                      >
                        Volume
                      </Typography>
                      <Slider
                        size="small"
                        value={settings.volume || 50}
                        onChange={(e, val) => updateAppSetting(app.name, 'volume', val)}
                        disabled={isCurrentlyRunning}
                        sx={{
                          '& .MuiSlider-thumb': {
                            width: 14,
                            height: 14,
                          },
                        }}
                      />
                    </Box>

                    {/* Actions */}
                    <Button
                      fullWidth
                      size="small"
                      disabled={isRemoving || isCurrentlyRunning}
                      startIcon={isRemoving ? <CircularProgress size={14} /> : <DeleteOutlineIcon sx={{ fontSize: 14 }} />}
                      onClick={() => handleUninstall(app.name)}
                      sx={{
                        mt: 2,
                        py: 0.75,
                        fontSize: 11,
                        fontWeight: 600,
                        textTransform: 'none',
                        color: '#ef4444',
                        borderColor: 'rgba(239, 68, 68, 0.2)',
                        '&:hover': {
                          bgcolor: 'rgba(239, 68, 68, 0.04)',
                          borderColor: '#ef4444',
                        },
                      }}
                      variant="outlined"
                    >
                      Uninstall
                    </Button>
                  </Box>
                </Collapse>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}

