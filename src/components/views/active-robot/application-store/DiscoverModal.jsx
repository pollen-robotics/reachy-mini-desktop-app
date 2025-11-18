import React, { useState } from 'react';
import { Box, Typography, Button, InputBase, CircularProgress, Tooltip } from '@mui/material';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import SearchIcon from '@mui/icons-material/Search';
import StarOutlineIcon from '@mui/icons-material/StarOutline';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ExtensionIcon from '@mui/icons-material/Extension';
import AppsIcon from '@mui/icons-material/Apps';
import { open } from '@tauri-apps/plugin-shell';
import FullscreenOverlay from '../../../FullscreenOverlay';
import hfLogo from '../../../../assets/hf-logo.svg';
import reachyBox from '../../../../assets/reachy-update-box.svg';

/**
 * Modal overlay for discovering and installing apps from Hugging Face
 */
export default function DiscoverModal({
  open: isOpen,
  onClose,
  filteredApps,
  darkMode,
  isBusy,
  activeJobs,
  isJobRunning,
  handleInstall,
  getJobInfo,
  searchQuery,
  setSearchQuery,
}) {
  return (
    <FullscreenOverlay
      open={isOpen}
      onClose={onClose}
      darkMode={darkMode}
      zIndex={10002} // Above settings overlay
      centeredX={true} // Center horizontally
      centeredY={false} // Don't center vertically
    >
      <Box
        sx={{
          width: '90%',
          maxWidth: '700px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          pt: 4,
        }}
      >
        {/* Header - Modern design */}
        <Box sx={{ mb: 1.5 }}>
          {/* Main header row */}
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mb: 0 }}>
            {/* Left: Icon + Title */}
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, flex: 1 }}>
              <Box
                sx={{
                  width: 80,
                  height: 80,
                  borderRadius: '14px',
                  bgcolor: darkMode ? 'rgba(255, 149, 0, 0.08)' : 'rgba(255, 149, 0, 0.05)',
                  border: `1px solid ${darkMode ? 'rgba(255, 149, 0, 0.2)' : 'rgba(255, 149, 0, 0.15)'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Box
                  component="img"
                  src={reachyBox}
                  alt="Reachy"
                  sx={{
                    width: 56,
                    height: 'auto',
                    filter: darkMode ? 'brightness(1.1)' : 'brightness(1)',
                  }}
                />
              </Box>
              
              <Box sx={{ flex: 1 }}>
                <Typography
                  sx={{
                    fontSize: 32,
                    fontWeight: 700,
                    color: darkMode ? '#f5f5f5' : '#333',
                    letterSpacing: '-0.5px',
                    lineHeight: 1.2,
                    mb: 0.5,
                  }}
                >
                  Discover Apps
                </Typography>
                <Typography
                  sx={{
                    fontSize: 14,
                    color: darkMode ? '#888' : '#999',
                    fontWeight: 500,
                    letterSpacing: '0.1px',
                    mb: 1,
                  }}
                >
                  Extend Reachy's capabilities
                </Typography>
                {/* Description */}
                <Typography
                  sx={{
                    fontSize: 12,
                    color: darkMode ? '#aaa' : '#666',
                    fontWeight: 400,
                    lineHeight: 1.6,
                    maxWidth: '90%',
                    mb: 1.5,
                  }}
                >
                  Install apps created by the community. Each app adds new behaviors, interactions, or features to your robot—from games and demos to advanced AI-powered applications.
                </Typography>
                
                {/* Powered by - Subtle inline */}
                <Box
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.5,
                    mt: 0.5,
                  }}
                >
                  <Typography
                    component="span"
                    sx={{
                      fontSize: 9,
                      color: darkMode ? '#555' : '#aaa',
                      fontWeight: 500,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}
                  >
                    Powered by
                  </Typography>
                  <Box
                    component="img"
                    src={hfLogo}
                    alt="Hugging Face"
                    sx={{
                      height: 10,
                      width: 'auto',
                      opacity: 0.7,
                    }}
                  />
                  <Typography
                    component="span"
                    sx={{
                      fontSize: 9,
                      color: darkMode ? '#666' : '#999',
                      fontWeight: 500,
                    }}
                  >
                    Hugging Face Spaces
                  </Typography>
                </Box>
              </Box>
            </Box>
          </Box>
        </Box>

        {/* Search Bar */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 1.5,
            py: 1,
            mb: 3,
            borderRadius: '12px',
            bgcolor: darkMode ? '#262626' : 'white',
            border: darkMode ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.12)',
            transition: 'box-shadow 0.2s ease',
            '&:focus-within': {
              borderColor: '#FF9500',
              boxShadow: '0 0 0 3px rgba(255, 149, 0, 0.08)',
            },
          }}
        >
          <Tooltip title="Search for apps by name or description" arrow placement="top">
            <SearchIcon sx={{ fontSize: 18, color: darkMode ? '#666' : '#999', cursor: 'help' }} />
          </Tooltip>
          <InputBase
            placeholder="Search apps..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            sx={{
              flex: 1,
              fontSize: 14,
              fontWeight: 500,
              color: darkMode ? '#f5f5f5' : '#333',
              '& input::placeholder': {
                color: darkMode ? '#666' : '#999',
                opacity: 1,
              },
            }}
          />
          
          {/* Apps count */}
          <Tooltip title={`${filteredApps.length} ${filteredApps.length === 1 ? 'app' : 'apps'} ${searchQuery ? 'found' : 'available'}`} arrow placement="top">
            <Typography
              sx={{
                fontSize: 11,
                fontWeight: 700,
                color: darkMode ? '#666' : '#999',
                letterSpacing: '0.2px',
                cursor: 'help',
                px: 1,
                py: 0.5,
                borderRadius: '6px',
                bgcolor: darkMode ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
              }}
            >
              {filteredApps.length}
            </Typography>
          </Tooltip>
          
          {searchQuery && (
            <>
              <Box sx={{ width: '1px', height: '18px', bgcolor: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)' }} />
              <Typography
                onClick={() => setSearchQuery('')}
                sx={{
                  fontSize: 12,
                  color: darkMode ? '#888' : '#999',
                  cursor: 'pointer',
                  fontWeight: 600,
                  '&:hover': { color: darkMode ? '#aaa' : '#666' },
                }}
              >
                Clear
              </Typography>
            </>
          )}
        </Box>

        {/* Apps List - Scrollable */}
        <Box
          sx={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
            pr: 1,
            '&::-webkit-scrollbar': {
              width: '6px',
            },
            '&::-webkit-scrollbar-track': {
              background: 'transparent',
            },
            '&::-webkit-scrollbar-thumb': {
              background: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
              borderRadius: '3px',
            },
            '&:hover::-webkit-scrollbar-thumb': {
              background: darkMode ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.15)',
            },
          }}
        >
          <Box sx={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: 2.5, width: '100%', mb: 0 }}>
            {filteredApps.length === 0 ? (
              <Box
                sx={{
                  py: 6,
                  textAlign: 'center',
                  width: '100%',
                }}
              >
                <Typography sx={{ fontSize: 14, color: darkMode ? '#666' : '#999', mb: 1 }}>
                  {searchQuery ? `No apps found for "${searchQuery}"` : 'No apps available'}
                </Typography>
                {searchQuery && (
                  <Button
                    size="small"
                    onClick={() => setSearchQuery('')}
                    sx={{
                      mt: 2,
                      textTransform: 'none',
                      fontSize: 12,
                    }}
                  >
                    Clear search
                  </Button>
                )}
              </Box>
            ) : (
              filteredApps.map((app) => {
                const installJob = getJobInfo(app.name, 'install');
                const isInstalling = isJobRunning(app.name, 'install');
                const installFailed = installJob && installJob.status === 'failed';
                
                return (
                  <Box
                    key={app.name}
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      width: 'calc((100% - 20px) / 2)', // 2 per row: (100% - gap) / 2
                      minWidth: 0, // Allow flexbox to shrink
                      flexShrink: 0,
                      p: 2,
                      borderRadius: '14px',
                      bgcolor: installFailed ? (darkMode ? 'rgba(239, 68, 68, 0.04)' : 'rgba(239, 68, 68, 0.02)') : 
                               isInstalling ? (darkMode ? 'rgba(255, 149, 0, 0.04)' : 'rgba(255, 149, 0, 0.02)') : 
                               (darkMode ? 'rgba(255, 255, 255, 0.02)' : 'white'),
                      border: installFailed ? '1.5px solid #ef4444' :
                              isInstalling ? `1.5px solid rgba(255, 149, 0, 0.3)` :
                              `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'}`,
                      position: 'relative',
                      overflow: 'hidden',
                      boxShadow: 'none',
                    }}
                  >
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
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
                          {app.extra?.cardData?.emoji || '📦'}
                        </Box>
                        
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography
                            sx={{
                              fontSize: 14,
                              fontWeight: 700,
                              color: darkMode ? '#f5f5f5' : '#333',
                              lineHeight: 1.3,
                              mb: 0.3,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {app.name}
                          </Typography>
                          
                          {app.extra?.lastModified && (
                            <Typography
                              sx={{
                                fontSize: 9,
                                fontWeight: 500,
                                color: darkMode ? '#666' : '#999',
                                fontFamily: 'monospace',
                                letterSpacing: '0.2px',
                              }}
                            >
                              {new Date(app.extra.lastModified).toLocaleDateString('en-US', { 
                                day: 'numeric', 
                                month: 'short',
                                year: 'numeric'
                              })}
                            </Typography>
                          )}
                        </Box>
                      </Box>
                      
                      <Typography
                        sx={{
                          fontSize: 11,
                          color: darkMode ? '#999' : '#666',
                          lineHeight: 1.5,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {app.description || 'No description'}
                      </Typography>
                      
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                        <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center', flexWrap: 'wrap' }}>
                          {app.extra?.likes !== undefined && (
                            <Box
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 0.5,
                                height: 22,
                                px: 1,
                                borderRadius: '11px',
                                bgcolor: darkMode ? 'rgba(251, 191, 36, 0.08)' : 'rgba(245, 158, 11, 0.08)',
                                border: `1px solid ${darkMode ? 'rgba(251, 191, 36, 0.2)' : 'rgba(245, 158, 11, 0.2)'}`,
                              }}
                            >
                              <Typography
                                sx={{
                                  fontSize: 10,
                                  fontWeight: 600,
                                  color: darkMode ? '#fbbf24' : '#f59e0b',
                                  lineHeight: 1,
                                }}
                              >
                                {app.extra.likes}
                              </Typography>
                              <StarOutlineIcon 
                                sx={{ 
                                  fontSize: 12,
                                  color: darkMode ? '#fbbf24' : '#f59e0b',
                                }} 
                              />
                            </Box>
                          )}
                        </Box>
                        
                        <Button
                          size="small"
                          disabled={isBusy}
                          onClick={() => handleInstall(app)}
                          endIcon={isInstalling ? <CircularProgress size={12} sx={{ color: '#FF9500' }} /> : <DownloadOutlinedIcon sx={{ fontSize: 12 }} />}
                          sx={{
                            minWidth: 'auto',
                            px: 1.5,
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
                          {isInstalling ? 'Installing...' : 'Install'}
                        </Button>
                      </Box>
                    </Box>
                  </Box>
                );
              })
            )}
            
            {/* Footer */}
            {filteredApps.length > 0 && (
              <Box
                sx={{
                  width: '100%',
                  mt: 4,
                  pt: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 1.5,
                }}
              >
                <Typography
                  sx={{
                    fontSize: 11,
                    color: darkMode ? '#666' : '#999',
                    fontWeight: 500,
                    textAlign: 'center',
                  }}
                >
                  Can't find what you're looking for?
                </Typography>
                <Button
                  size="small"
                  onClick={async () => {
                    try {
                      await open('https://huggingface.co/new-space');
                    } catch (err) {
                      console.error('Failed to open Hugging Face URL:', err);
                    }
                  }}
                  sx={{
                    textTransform: 'none',
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#FF9500',
                    border: '1px solid #FF9500',
                    borderRadius: '8px',
                    px: 2,
                    py: 0.75,
                    mb: 8,
                    bgcolor: 'transparent',
                    '&:hover': {
                      bgcolor: 'rgba(255, 149, 0, 0.08)',
                      borderColor: '#FF9500',
                    },
                  }}
                >
                  Create your own app →
                </Button>
              </Box>
            )}
          </Box>
        </Box>
      </Box>
    </FullscreenOverlay>
  );
}

