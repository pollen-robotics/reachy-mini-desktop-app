import React from 'react';
import { Box, Typography, Button, Chip, IconButton, Collapse, Switch, Slider, CircularProgress, Tooltip } from '@mui/material';
import PlayArrowOutlinedIcon from '@mui/icons-material/PlayArrowOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import StopCircleOutlinedIcon from '@mui/icons-material/StopCircleOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import StoreOutlinedIcon from '@mui/icons-material/StoreOutlined';
import CodeOutlinedIcon from '@mui/icons-material/CodeOutlined';
import { open } from '@tauri-apps/plugin-shell';
import HandwrittenArrows from './HandwrittenArrows';

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
}) {
  return (
    <Box sx={{ px: 3, mb: 3 }}>
      
      {installedApps.length === 0 ? (
        <Box
          sx={{
            py: 4,
            px: 3,
            borderRadius: '14px',
            bgcolor: darkMode ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)',
            border: darkMode 
              ? '1px dashed rgba(255, 255, 255, 0.15)' 
              : '1px dashed rgba(0, 0, 0, 0.15)',
            display: 'flex',
            flexDirection: 'column',
            gap: 2.5,
          }}
        >
          {/* Empty state message */}
          <Box sx={{ textAlign: 'center' }}>
            <Typography
              sx={{
                fontSize: 14,
                color: darkMode ? '#888' : '#666',
                fontWeight: 600,
                mb: 1,
          }}
        >
              No apps installed yet
            </Typography>
          <Typography
            sx={{
              fontSize: 12,
              color: darkMode ? '#666' : '#999',
                fontWeight: 400,
              }}
            >
              Extend Reachy's capabilities with apps from the community
            </Typography>
          </Box>

          {/* Call-to-action cards - 50/50 layout */}
          <Box sx={{ display: 'flex', flexDirection: 'row', gap: 1.5 }}>
            {/* Discover Card */}
            <Box
              component="button"
              onClick={onOpenDiscover}
              sx={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 1.5,
                p: 2.5,
                borderRadius: '14px',
                bgcolor: darkMode ? 'rgba(255, 149, 0, 0.05)' : 'rgba(255, 149, 0, 0.03)',
                border: `1px solid ${darkMode ? 'rgba(255, 149, 0, 0.2)' : 'rgba(255, 149, 0, 0.3)'}`,
                cursor: 'pointer',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                position: 'relative',
                overflow: 'hidden',
                textAlign: 'center',
                '&:hover': {
                  bgcolor: darkMode ? 'rgba(255, 149, 0, 0.08)' : 'rgba(255, 149, 0, 0.05)',
                  borderColor: '#FF9500',
                  transform: 'translateY(-1px)',
                  boxShadow: darkMode 
                    ? `0 4px 12px rgba(255, 149, 0, 0.2)` 
                    : `0 4px 12px rgba(255, 149, 0, 0.15)`,
                },
                '&:active': {
                  transform: 'translateY(0)',
                },
            }}
          >
              <Box
                sx={{
                  position: 'relative',
                  fontSize: 40,
                  lineHeight: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {/* Handwritten arrows pointing to icon */}
                <HandwrittenArrows color="#FF9500" size={80} />
                <Box sx={{ position: 'relative', zIndex: 1 }}>
                  📦
                </Box>
              </Box>
              
              <Box sx={{ width: '100%' }}>
                <Typography
                  sx={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: '#FF9500',
                    mb: 0.5,
                    letterSpacing: '-0.2px',
                    textAlign: 'center',
                  }}
                >
                  Discover Apps
                </Typography>
                <Typography
                  sx={{
                    fontSize: 10,
                    color: darkMode ? '#888' : '#999',
                    lineHeight: 1.4,
                    textAlign: 'center',
                  }}
                >
                  Browse and install apps from Hugging Face Spaces
                </Typography>
              </Box>
            </Box>

            {/* Create Card */}
            <Box
              component="button"
              onClick={async () => {
                try {
                  await open('https://huggingface.co/new-space');
                } catch (err) {
                  console.error('Failed to open Hugging Face URL:', err);
                }
              }}
              sx={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 1.5,
                p: 2.5,
                borderRadius: '14px',
                bgcolor: 'transparent',
                border: `1px dashed ${darkMode ? 'rgba(255, 149, 0, 0.4)' : 'rgba(255, 149, 0, 0.5)'}`,
                cursor: 'pointer',
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                position: 'relative',
                overflow: 'hidden',
                textAlign: 'center',
                '&:hover': {
                  borderColor: '#FF9500',
                  bgcolor: darkMode ? 'rgba(255, 149, 0, 0.05)' : 'rgba(255, 149, 0, 0.03)',
                  transform: 'translateY(-1px)',
                  boxShadow: darkMode 
                    ? `0 4px 12px rgba(255, 149, 0, 0.15)` 
                    : `0 4px 12px rgba(255, 149, 0, 0.1)`,
                },
                '&:active': {
                  transform: 'translateY(0)',
                },
              }}
            >
              <Box
                sx={{
                  fontSize: 40,
                  lineHeight: 1,
                }}
              >
                🛠️
              </Box>
              
              <Box sx={{ width: '100%' }}>
                <Typography
                  sx={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: '#FF9500',
                    mb: 0.5,
                    letterSpacing: '-0.2px',
                    textAlign: 'center',
                  }}
                >
                  Build your own app
                </Typography>
                <Typography
                  sx={{
                    fontSize: 10,
                    color: darkMode ? '#888' : '#999',
                    lineHeight: 1.4,
                    textAlign: 'center',
                  }}
                >
                  Create and share your Reachy Mini app on Hugging Face Spaces
          </Typography>
              </Box>
            </Box>
          </Box>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {installedApps.map(app => {
            const isExpanded = expandedApp === app.name;
            const settings = appSettings[app.name] || {};
            const isRemoving = isJobRunning(app.name, 'remove');
            
            // Debug: Log app data
            console.log(`📅 [InstalledApps] App: ${app.name}`, {
              hasExtra: !!app.extra,
              hasLastModified: !!app.extra?.lastModified,
              lastModified: app.extra?.lastModified,
              extraKeys: app.extra ? Object.keys(app.extra) : [],
            });
            
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
                        console.log(`📅 [InstalledApps] Rendering date for ${app.name}:`, {
                          hasJobInfo: !!jobInfo,
                          hasLastModified: !!app.extra?.lastModified,
                          lastModified: app.extra?.lastModified,
                        });
                        
                        if (jobInfo) {
                          console.log(`📅 [InstalledApps] Showing job info instead of date for ${app.name}`);
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
                        // Show date if no job is running
                        if (app.extra?.lastModified) {
                          const formattedDate = new Date(app.extra.lastModified).toLocaleDateString('en-US', { 
                            day: 'numeric', 
                            month: 'short',
                            year: 'numeric'
                          });
                          console.log(`📅 [InstalledApps] Showing date for ${app.name}:`, formattedDate);
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
                              Updated {formattedDate}
                          </Typography>
                        );
                        }
                        console.log(`📅 [InstalledApps] No date to show for ${app.name}`);
                        return null;
                      })()}
                    </Box>
                  </Box>
                  
                  {/* Actions */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {/* Settings cog - outlined gris */}
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedApp(isExpanded ? null : app.name);
                      }}
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
                          transition: 'transform 0.3s ease',
                          transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
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

