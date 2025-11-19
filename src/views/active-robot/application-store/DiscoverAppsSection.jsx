import React, { useState } from 'react';
import { Box, Typography, Button, InputBase, CircularProgress, Tooltip } from '@mui/material';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import SearchIcon from '@mui/icons-material/Search';
import StarOutlineIcon from '@mui/icons-material/StarOutline';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ReachyBox from '../../../assets/reachy-update-box.svg';
import { open } from '@tauri-apps/plugin-shell';
import hfLogo from '../../../assets/hf-logo.svg';

/**
 * Section displaying available apps (Discover from Hugging Face)
 */
export default function DiscoverAppsSection({
  filteredApps,
  darkMode,
  isBusy,
  activeJobs,
  isJobRunning,
  handleInstall,
  getJobInfo,
  searchQuery,
  setSearchQuery,
  onOpenCreateTutorial, // Callback to open Create App Tutorial modal
}) {
  return (
    <Box sx={{ px: 3, pb: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 1.5 }}>
        {/* Left: DISCOVER + counter */}
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Typography
            sx={{
              fontSize: 11,
              fontWeight: 700,
              color: darkMode ? '#aaa' : '#666',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Discover
          </Typography>
            <Tooltip 
              title="Browse and install new apps from Hugging Face Spaces. Search for apps that extend Reachy's capabilities." 
              arrow 
              placement="top"
            >
              <InfoOutlinedIcon sx={{ fontSize: 12, color: darkMode ? '#666' : '#999', opacity: 0.6, cursor: 'help' }} />
            </Tooltip>
          </Box>
          <Typography
            sx={{
              fontSize: 11,
              fontWeight: 700,
              color: darkMode ? '#666' : '#999',
            }}
          >
            {filteredApps.length}
          </Typography>
        </Box>
        
        {/* Right: from Hugging Face Logo */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Typography
            sx={{
              fontSize: 10,
              color: darkMode ? '#888' : '#999',
              fontWeight: 500,
            }}
          >
            from
          </Typography>
          <Box
            component="img"
            src={hfLogo}
            alt="Hugging Face"
            sx={{
              height: 14,
              width: 'auto',
              opacity: 1,
            }}
          />
        <Typography
          sx={{
            fontSize: 10,
            color: darkMode ? '#888' : '#999',
            fontWeight: 500,
          }}
        >
            Hugging Face
        </Typography>
        </Box>
      </Box>

      {/* Search Bar */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1.5,
          py: 0.75,
          mb: 2,
          borderRadius: '10px',
          bgcolor: darkMode ? '#262626' : 'white',
          border: darkMode ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.12)',
          // ✅ No transition on bgcolor/border to avoid animation on dark mode change
          transition: 'box-shadow 0.2s ease',
          '&:focus-within': {
            borderColor: '#FF9500',
            boxShadow: '0 0 0 3px rgba(255, 149, 0, 0.08)',
          },
        }}
      >
        <SearchIcon sx={{ fontSize: 16, color: darkMode ? '#666' : '#999' }} />
        <InputBase
          placeholder="Search apps..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          sx={{
            flex: 1,
            fontSize: 12,
            fontWeight: 500,
            color: darkMode ? '#f5f5f5' : '#333',
            '& input::placeholder': {
              color: darkMode ? '#666' : '#999',
              opacity: 1,
            },
          }}
        />
        
        {/* Filtered apps counter (right) */}
        <Typography
          sx={{
            fontSize: 11,
            fontWeight: 700,
            color: darkMode ? '#666' : '#999',
            letterSpacing: '0.2px',
          }}
        >
          {filteredApps.length}
        </Typography>
        
        {searchQuery && (
          <>
            <Box sx={{ width: '1px', height: '14px', bgcolor: 'rgba(0, 0, 0, 0.1)' }} />
            <Typography
              onClick={() => setSearchQuery('')}
              sx={{
                fontSize: 11,
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
      
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {filteredApps.length === 0 ? (
          <Box
            sx={{
              py: 4,
              textAlign: 'center',
            }}
          >
            <Typography sx={{ fontSize: 12, color: darkMode ? '#666' : '#999' }}>
              No apps found for "{searchQuery}"
            </Typography>
          </Box>
        ) : (
          filteredApps.map((app) => {
          // Note: filteredApps only contains NOT installed apps
          const installJob = getJobInfo(app.name, 'install');
          const isInstalling = isJobRunning(app.name, 'install');
          const installFailed = installJob && installJob.status === 'failed';
          const installProgress = installJob && installJob.logs ? installJob.logs.length : 0;
          
          return (
            <Box
              key={app.name}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                p: 2.5,
                borderRadius: '14px',
                bgcolor: installFailed ? (darkMode ? 'rgba(239, 68, 68, 0.04)' : 'rgba(239, 68, 68, 0.02)') : 
                         isInstalling ? (darkMode ? 'rgba(255, 149, 0, 0.04)' : 'rgba(255, 149, 0, 0.02)') : 
                         (darkMode ? 'rgba(255, 255, 255, 0.02)' : 'white'),
                border: installFailed ? '1.5px solid #ef4444' :
                        isInstalling ? `1.5px solid rgba(255, 149, 0, 0.3)` :
                        `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'}`,
                // ✅ No transition on bgcolor/border to avoid animation on dark mode change
                position: 'relative',
                overflow: 'hidden',
                boxShadow: 'none',
                // Pulsing animation during installation
                ...(isInstalling && {
                  animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                  '@keyframes pulse': {
                    '0%, 100%': {
                      opacity: 1,
                      borderColor: 'rgba(255, 149, 0, 0.3)',
                    },
                    '50%': {
                      opacity: 0.95,
                      borderColor: 'rgba(255, 149, 0, 0.5)',
                    },
                  },
                }),
              }}
            >
              {/* Redesigned card */}
              <Box sx={{ display: 'flex', gap: 2 }}>
                {/* Icon: Simple space emoji */}
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
                
                {/* Content */}
                <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                  {/* Header: Title + Install button */}
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 0.5 }}>
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
                      
                      {/* Last modification date */}
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
                          Updated {new Date(app.extra.lastModified).toLocaleDateString('en-US', { 
                            day: 'numeric', 
                            month: 'short',
                            year: 'numeric'
                          })}
                        </Typography>
                      )}
                    </Box>
                    
                    {/* Install Button */}
                    <Button
                      size="small"
                      disabled={isBusy}
                      onClick={() => handleInstall(app)}
                      endIcon={isInstalling ? <CircularProgress size={12} sx={{ color: '#FF9500' }} /> : <DownloadOutlinedIcon sx={{ fontSize: 13 }} />}
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
                      {isInstalling ? 'Installing...' : 'Install'}
                    </Button>
                  </Box>
                  
                  {/* Description */}
                  <Typography
                    sx={{
                      fontSize: 11,
                      color: darkMode ? '#999' : '#666',
                      lineHeight: 1.6,
                      mb: 1.5,
                    }}
                  >
                    {app.description || 'No description'}
                  </Typography>
                  
                  {/* Footer: Stars + Space badge + Link */}
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                    {/* Stars in a chip - icon on the right */}
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
                            fontSize: 13,
                            color: darkMode ? '#fbbf24' : '#f59e0b',
                          }} 
                        />
                      </Box>
                    )}
                    
                    {/* HF Space badge (just the icon) */}
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 22,
                        height: 22,
                        borderRadius: '11px',
                        bgcolor: darkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
                        border: `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'}`,
                      }}
                    >
                      <svg 
                        width="12" 
                        height="12" 
                        viewBox="0 0 25 25"
                        xmlns="http://www.w3.org/2000/svg"
                        aria-hidden="true"
                        focusable="false"
                        role="img"
                        style={{ color: darkMode ? '#888' : '#666' }}
                      >
                        <path opacity=".5" d="M6.016 14.674v4.31h4.31v-4.31h-4.31ZM14.674 14.674v4.31h4.31v-4.31h-4.31ZM6.016 6.016v4.31h4.31v-4.31h-4.31Z" fill="currentColor"></path>
                        <path opacity=".75" fillRule="evenodd" clipRule="evenodd" d="M3 4.914C3 3.857 3.857 3 4.914 3h6.514c.884 0 1.628.6 1.848 1.414a5.171 5.171 0 0 1 7.31 7.31c.815.22 1.414.964 1.414 1.848v6.514A1.914 1.914 0 0 1 20.086 22H4.914A1.914 1.914 0 0 1 3 20.086V4.914Zm3.016 1.102v4.31h4.31v-4.31h-4.31Zm0 12.968v-4.31h4.31v4.31h-4.31Zm8.658 0v-4.31h4.31v4.31h-4.31Zm0-10.813a2.155 2.155 0 1 1 4.31 0 2.155 2.155 0 0 1-4.31 0Z" fill="currentColor"></path>
                        <path opacity=".25" d="M16.829 6.016a2.155 2.155 0 1 0 0 4.31 2.155 2.155 0 0 0 0-4.31Z" fill="currentColor"></path>
                      </svg>
                    </Box>
                    
                    {/* Spacer */}
                    <Box sx={{ flex: 1 }} />
                    
                    {/* Link to space */}
                    {app.url && (
                      <Typography
                        onClick={async () => {
                          try {
                            await open(app.url);
                          } catch (err) {
                            console.error('Failed to open space URL:', err);
                          }
                        }}
                        sx={{
                          fontSize: 10,
                          fontWeight: 500,
                          color: darkMode ? '#888' : '#999',
                          textDecoration: 'none',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0.3,
                          '&:hover': {
                            color: '#FF9500',
                          },
                        }}
                      >
                        View Space →
                      </Typography>
                    )}
                  </Box>
                </Box>
              </Box>
              
              {/* Installation progress is now shown in fullscreen overlay (InstallOverlay.jsx) */}
            </Box>
          );
        })
        )}
        
        {/* Ghost item: Build your own */}
        <Box
          component="button"
          onClick={onOpenCreateTutorial}
          sx={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 2,
            p: 2.5,
            borderRadius: '14px',
            bgcolor: 'transparent',
            border: `1px dashed ${darkMode ? 'rgba(255, 149, 0, 0.4)' : 'rgba(255, 149, 0, 0.5)'}`,
            cursor: 'pointer',
            transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
            position: 'relative',
            overflow: 'hidden',
            '&:hover': {
              borderColor: darkMode ? 'rgba(255, 149, 0, 0.6)' : 'rgba(255, 149, 0, 0.7)',
              bgcolor: darkMode 
                ? 'rgba(255, 149, 0, 0.05)' 
                : 'rgba(255, 149, 0, 0.03)',
              transform: 'translateY(-1px)',
              boxShadow: (theme) => darkMode 
                ? `0 4px 12px rgba(255, 149, 0, 0.15)` 
                : `0 4px 12px rgba(255, 149, 0, 0.1)`,
              '& > :last-child': {
                transform: 'translateX(2px)',
              },
            },
            '&:active': {
              transform: 'translateY(0)',
            },
          }}
        >
          {/* Icon container */}
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: '12px',
              bgcolor: (theme) => darkMode 
                ? 'rgba(255, 149, 0, 0.08)' 
                : 'rgba(255, 149, 0, 0.05)',
              border: (theme) => `1px solid ${theme.palette.primary.main}40`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              transition: 'all 0.25s ease',
            }}
          >
            <Box
              component="img"
              src={ReachyBox}
              alt="Reachy Box"
              sx={{
                width: 24,
                height: 24,
                opacity: darkMode ? 0.6 : 0.7,
            }}
            />
          </Box>
          
          {/* Text content */}
          <Box sx={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
            <Typography
              sx={{
                fontSize: 13,
                fontWeight: 700,
                color: darkMode ? 'rgba(255, 149, 0, 0.6)' : 'rgba(255, 149, 0, 0.7)',
                mb: 0.3,
                letterSpacing: '-0.2px',
                textAlign: 'left',
              }}
            >
              Build your own
            </Typography>
            <Typography
              sx={{
                fontSize: 10,
                color: darkMode ? '#666' : '#888',
                lineHeight: 1.4,
                textAlign: 'left',
              }}
            >
              Create and share your Reachy Mini app on Hugging Face Spaces
            </Typography>
          </Box>
          
          {/* Arrow icon */}
          <Box
            sx={{
              color: 'primary.main',
              fontSize: 18,
              flexShrink: 0,
              transition: 'transform 0.25s ease',
            }}
          >
            →
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

