import React, { useState } from 'react';
import { Box, Typography, Button, InputBase, CircularProgress, Tooltip, IconButton, Chip, Avatar, Checkbox, FormControlLabel } from '@mui/material';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import SearchIcon from '@mui/icons-material/Search';
import StarOutlineIcon from '@mui/icons-material/StarOutline';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ExtensionIcon from '@mui/icons-material/Extension';
import AppsIcon from '@mui/icons-material/Apps';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CloseIcon from '@mui/icons-material/Close';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import { open } from '@tauri-apps/plugin-shell';
import FullscreenOverlay from '../../../components/FullscreenOverlay';
import hfLogo from '../../../assets/hf-logo.svg';
import Reachies from '../../../assets/reachies.svg';
import HowToCreateApp from '../../../assets/reachy-how-to-create-app.svg';
import ReachyDetective from '../../../assets/reachy-detective.svg';

/**
 * Modal overlay for discovering and installing apps from Hugging Face
 */
export default function DiscoverModal({
  open: isOpen,
  onClose,
  filteredApps,
  darkMode,
  isBusy,
  isLoading,
  activeJobs,
  isJobRunning,
  handleInstall,
  getJobInfo,
  searchQuery,
  setSearchQuery,
  officialOnly,
  setOfficialOnly,
  categories,
  selectedCategory,
  setSelectedCategory,
  totalAppsCount,
  onOpenCreateTutorial, // Callback to open Create App Tutorial modal
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
          position: 'relative',
          width: '90%',
          maxWidth: '700px',
          display: 'flex',
          flexDirection: 'column',
          mt: 8,
          mb: 4,
        }}
      >
        {/* Close button - top right */}
        <IconButton
          onClick={onClose}
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

        {/* Header - Modern design */}
        <Box sx={{ mb: 0 }}>
          {/* Main header row */}
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mb: 0 }}>
            {/* Left: Icon + Title */}
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, flex: 1 }}>
              <Box
                component="img"
                src={Reachies}
                alt="Reachies"
                sx={{
                  width: 100,
                  mr:3,
                  height: 'auto',
                  flexShrink: 0,
                  mb: 2,
                }}
              />
              
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
                  Install apps created by the <Box component="span" sx={{ fontWeight: 700 }}>community</Box>. Each app adds new <Box component="span" sx={{ fontWeight: 700 }}>behaviors, interactions, or features</Box> to your robot—from <Box component="span" sx={{ fontWeight: 700 }}>games and demos</Box> to advanced <Box component="span" sx={{ fontWeight: 700 }}>AI-powered applications</Box>.
                </Typography>
                
                {/* Powered by - Subtle inline */}
                <Typography
                  component="div"
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.5,
                    mt: 0.5,
                    fontSize: 9,
                    color: darkMode ? '#666' : '#999',
                    fontWeight: 500,
                  }}
                >
                  <Box
                    component="span"
                    sx={{
                      color: darkMode ? '#555' : '#aaa',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}
                  >
                    Powered by
                  </Box>
                  <Box
                    component="img"
                    src={hfLogo}
                    alt="Hugging Face"
                    sx={{
                      height: 22,
                      width: 'auto',
                      opacity: 1,
                      display: 'inline-block',
                      verticalAlign: 'middle',
                    }}
                  />
                  <Box component="span">Hugging Face</Box>
                </Typography>
              </Box>
            </Box>
          </Box>
        </Box>

        {/* Search Bar - Sticky with background wrapper */}
        <Box
          sx={{
            position: 'sticky',
            top: 0,
            pt: 1,
            pb: 0,
            mb: 2,
            zIndex: 10,
            // Background wrapper to cover scrolling content
            bgcolor: darkMode ? 'rgba(18, 18, 18, 0.92)' : 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              px: 1.5,
              py: 1.5,
              mt: 3,
              borderRadius: '12px',
              bgcolor: darkMode ? '#262626' : 'white',
              border: '1px solid #FF9500',
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
          
          {/* Info icon for non-official mode */}
          {!officialOnly && (
            <Tooltip 
              title="Apps are fetched from Hugging Face Spaces API filtered by 'reachy_mini' tag" 
              arrow 
              placement="bottom"
              enterDelay={300}
              leaveDelay={0}
              PopperProps={{
                style: {
                  zIndex: 10010, // Higher than search bar z-index (10) and modal z-index (10002)
                },
                container: document.body,
              }}
              slotProps={{
                tooltip: {
                  sx: {
                    zIndex: '10010 !important',
                    position: 'relative',
                  }
                }
              }}
            >
              <InfoOutlinedIcon 
                sx={{ 
                  fontSize: 16, 
                  color: darkMode ? '#888' : '#999', 
                  cursor: 'help',
                  flexShrink: 0,
                }} 
              />
            </Tooltip>
          )}
          
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
          
          {/* Official/Non-official toggle */}
          <Box sx={{ width: '1px', height: '18px', bgcolor: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)' }} />
          <FormControlLabel
            control={
              <Checkbox
                checked={officialOnly}
                onChange={(e) => setOfficialOnly(e.target.checked)}
                disabled={isLoading}
                size="small"
                sx={{
                  color: darkMode ? '#888' : '#999',
                  '&.Mui-checked': {
                    color: '#FF9500',
                  },
                  '&.Mui-disabled': {
                    color: darkMode ? '#444' : '#ccc',
                    opacity: 0.5,
                  },
                  '& .MuiSvgIcon-root': {
                    fontSize: 18,
                  },
                }}
              />
            }
            label={
              <Typography
                sx={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: darkMode ? '#888' : '#999',
                  userSelect: 'none',
                  pr: 1.5, // Padding right after text
                }}
              >
                Official
              </Typography>
            }
            sx={{
              m: 0,
              '& .MuiFormControlLabel-label': {
                ml: 0.5,
              },
            }}
          />
          
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
        </Box>

        {/* Category Filters */}
        <Box
          sx={{
            mt: 0,
            mb: 6,
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 1.5,
            flexWrap: 'wrap',
          }}
        >
        <Typography
          sx={{
            fontSize: 12,
            fontWeight: 600,
            color: darkMode ? '#aaa' : '#666',
          }}
        >
          Tags
        </Typography>
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 1,
            alignItems: 'center',
          }}
        >
          <Chip
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <span>All</span>
                <Typography
                  sx={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: selectedCategory === null 
                      ? '#FF9500'
                      : (darkMode ? '#888' : '#999'),
                    opacity: 0.8,
                  }}
                >
                  ({totalAppsCount})
                </Typography>
              </Box>
            }
            onClick={() => setSelectedCategory(null)}
            size="small"
            sx={{
              height: 28,
              fontSize: 12,
              fontWeight: selectedCategory === null ? 700 : 500,
              bgcolor: selectedCategory === null 
                ? (darkMode ? 'rgba(255, 149, 0, 0.2)' : 'rgba(255, 149, 0, 0.15)')
                : (darkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)'),
              color: selectedCategory === null 
                ? '#FF9500'
                : (darkMode ? '#aaa' : '#666'),
              border: selectedCategory === null 
                ? '1px solid #FF9500'
                : `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'}`,
              cursor: 'pointer',
              '&:hover': {
                bgcolor: selectedCategory === null
                  ? (darkMode ? 'rgba(255, 149, 0, 0.25)' : 'rgba(255, 149, 0, 0.2)')
                  : (darkMode ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)'),
              },
              '& .MuiChip-label': { px: 1.5 },
            }}
          />
          {categories.length > 0 && categories.map((category) => {
              const displayName = category.name.startsWith('sdk:') 
                ? category.name.replace('sdk:', '').charAt(0).toUpperCase() + category.name.replace('sdk:', '').slice(1).toLowerCase()
                : category.name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
              const isSelected = selectedCategory === category.name;
              
              return (
                <Chip
                  key={category.name}
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <span>{displayName}</span>
                      <Typography
                        sx={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: isSelected 
                            ? '#FF9500'
                            : (darkMode ? '#888' : '#999'),
                          opacity: 0.8,
                        }}
                      >
                        ({category.count})
                      </Typography>
                    </Box>
                  }
                  onClick={() => setSelectedCategory(isSelected ? null : category.name)}
                  size="small"
                  sx={{
                    height: 28,
                    fontSize: 12,
                    fontWeight: isSelected ? 700 : 500,
                    bgcolor: isSelected 
                      ? (darkMode ? 'rgba(255, 149, 0, 0.2)' : 'rgba(255, 149, 0, 0.15)')
                      : (darkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)'),
                    color: isSelected 
                      ? '#FF9500'
                      : (darkMode ? '#aaa' : '#666'),
                    border: isSelected 
                      ? '1px solid #FF9500'
                      : `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'}`,
                    cursor: 'pointer',
                    '&:hover': {
                      bgcolor: isSelected
                        ? (darkMode ? 'rgba(255, 149, 0, 0.25)' : 'rgba(255, 149, 0, 0.2)')
                        : (darkMode ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)'),
                    },
                    '& .MuiChip-label': { px: 1.5 },
                  }}
                />
              );
            })}
          </Box>
        </Box>

        {/* Apps List */}
        <Box
          sx={{
            position: 'relative',
          }}
        >
          {isLoading ? (
            <Box
              sx={{
                py: 10,
                textAlign: 'center',
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
              }}
            >
              <CircularProgress 
                size={40} 
                sx={{ 
                  color: darkMode ? '#666' : '#999',
                }} 
              />
              <Typography 
                sx={{ 
                  fontSize: 14, 
                  color: darkMode ? '#888' : '#999',
                  fontWeight: 500,
                }}
              >
                Loading apps...
              </Typography>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: 2.5, width: '100%', mb: 0 }}>
              {filteredApps.length === 0 ? (
              <Box
                sx={{
                  py: 10,
                  textAlign: 'center',
                  width: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 2,
                }}
              >
                {/* Illustration */}
                <Box
                  component="img"
                  src={ReachyDetective}
                  alt="Reachy Detective"
                  sx={{
                    width: 120,
                    height: 'auto',
                    opacity: darkMode ? 0.7 : 0.8,
                    mb: 1,
                  }}
                />
                
                {searchQuery ? (
                  <>
                    <Typography 
                      sx={{ 
                        fontSize: 18, 
                        fontWeight: 700,
                        color: darkMode ? '#aaa' : '#666', 
                        mb: 0.5,
                      }}
                    >
                      Can't find what you're looking for?
                    </Typography>
                    <Typography 
                      sx={{ 
                        fontSize: 14, 
                        color: darkMode ? '#888' : '#999',
                        mb: 2,
                      }}
                    >
                      No apps found for "{searchQuery}"
                    </Typography>
                    <Button
                      onClick={() => setSearchQuery('')}
                      sx={{
                        textTransform: 'none',
                        fontSize: 14,
                        fontWeight: 600,
                        px: 3,
                        py: 1,
                        borderRadius: '10px',
                        bgcolor: 'transparent',
                        color: '#FF9500',
                        border: '1px solid #FF9500',
                        '&:hover': {
                          bgcolor: darkMode ? 'rgba(255, 149, 0, 0.08)' : 'rgba(255, 149, 0, 0.05)',
                          borderColor: '#FF9500',
                        },
                      }}
                    >
                      Clear search
                    </Button>
                  </>
                ) : (
                  <Typography 
                    sx={{ 
                      fontSize: 18, 
                      fontWeight: 700,
                      color: darkMode ? '#aaa' : '#666', 
                    }}
                  >
                    No apps available
                  </Typography>
                )}
              </Box>
              ) : (
                filteredApps.map((app) => {
                  const installJob = getJobInfo(app.name, 'install');
                  const isInstalling = isJobRunning(app.name, 'install');
                  const installFailed = installJob && installJob.status === 'failed';
                
                // Extract data from HF Space API
                const cardData = app.extra?.cardData || {};
                const author = app.extra?.id?.split('/')?.[0] || app.extra?.author || null;
                const likes = app.extra?.likes || 0;
                const lastModified = app.extra?.lastModified || app.extra?.createdAt || null;
                const emoji = cardData.emoji || '📦';
                // Check if space is running - runtime.stage can be "RUNNING", "BUILDING", "STOPPED", etc.
                const isRunning = app.extra?.runtime?.stage === 'RUNNING';
                
                // Map HF Spaces color names to hex codes
                const hfColorMap = {
                  'yellow': '#fbbf24',
                  'pink': '#ec4899',
                  'blue': '#3b82f6',
                  'indigo': '#6366f1',
                  'green': '#22c55e',
                  'red': '#ef4444',
                  'orange': '#f97316',
                  'purple': '#a855f7',
                  'cyan': '#06b6d4',
                  'teal': '#14b8a6',
                  'amber': '#f59e0b',
                  'emerald': '#10b981',
                  'violet': '#8b5cf6',
                  'rose': '#f43f5e',
                  'sky': '#0ea5e9',
                  'lime': '#84cc16',
                  'fuchsia': '#d946ef',
                };
                
                // Gradient from HF Spaces API
                // HF Spaces uses color names (e.g., "yellow", "pink") not hex codes
                const colorFromName = cardData.colorFrom || null;
                const colorToName = cardData.colorTo || null;
                
                let gradient;
                if (colorFromName && colorToName) {
                  // Convert color names to hex codes
                  const colorFromHex = hfColorMap[colorFromName.toLowerCase()] || colorFromName;
                  const colorToHex = hfColorMap[colorToName.toLowerCase()] || colorToName;
                  // Build gradient from colorFrom/colorTo (HF Spaces format)
                  gradient = `linear-gradient(135deg, ${colorFromHex} 0%, ${colorToHex} 100%)`;
                } else {
                  // Fallback gradient only if no data found
                  gradient = darkMode 
                    ? 'linear-gradient(135deg, #ff6b35 0%, #22c55e 100%)'
                    : 'linear-gradient(135deg, #ff9500 0%, #16a34a 100%)';
                }
                
                // Format date
                const formattedDate = lastModified 
                  ? new Date(lastModified).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                  : null;
                
                return (
                  <Box
                    key={app.name}
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      width: 'calc((100% - 20px) / 2)', // 2 per row: (100% - gap) / 2
                      minWidth: 0,
                      flexShrink: 0,
                      borderRadius: '16px',
                      position: 'relative',
                      overflow: 'hidden',
                      bgcolor: darkMode ? '#1a1a1a' : '#ffffff',
                      border: installFailed 
                        ? '1px solid rgba(239, 68, 68, 0.4)' 
                        : isInstalling 
                        ? '1px solid rgba(255, 149, 0, 0.4)' 
                        : `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.12)'}`,
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      '&:hover': {
                        transform: 'translateY(-2px)',
                        borderColor: installFailed 
                          ? 'rgba(239, 68, 68, 0.6)' 
                          : isInstalling 
                          ? 'rgba(255, 149, 0, 0.6)' 
                          : darkMode 
                          ? 'rgba(255, 255, 255, 0.18)' 
                          : 'rgba(0, 0, 0, 0.18)',
                      },
                    }}
                    onClick={app.url ? async () => {
                      try {
                        await open(app.url);
                      } catch (err) {
                        console.error('Failed to open space URL:', err);
                      }
                    } : undefined}
                  >
                    
                    {/* Top Bar with Author (left) and Likes (right) - Full width */}
                    {(author || likes !== undefined) && (
                      <Box
                        sx={{
                          position: 'relative',
                          zIndex: 2,
                          width: '100%',
                          px: 2.5,
                          pt: 1.25,
                          pb: 0,
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        {/* Author - Left */}
                        {author && (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                            <Avatar
                              sx={{
                                width: 20,
                                height: 20,
                                bgcolor: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
                                fontSize: 10,
                                fontWeight: 600,
                                color: darkMode ? '#ffffff' : '#1a1a1a',
                              }}
                            >
                              {author.charAt(0).toUpperCase()}
                            </Avatar>
                            <Typography
                              sx={{
                                fontSize: 11,
                                fontWeight: 500,
                                color: darkMode ? '#aaaaaa' : '#666666',
                                fontFamily: 'monospace',
                              }}
                            >
                              {author}
                            </Typography>
                          </Box>
                        )}
                        
                        {/* Likes - Right - Always show, even if 0 */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <FavoriteBorderIcon sx={{ fontSize: 16, color: darkMode ? '#aaaaaa' : '#666666' }} />
                          <Typography
                            sx={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: darkMode ? '#aaaaaa' : '#666666',
                              lineHeight: 1,
                            }}
                          >
                            {likes || 0}
                          </Typography>
                        </Box>
                      </Box>
                    )}
                    
                    {/* Separator - Same style as bottom separator */}
                    {(author || likes !== undefined) && (
                      <Box
                        sx={{
                          position: 'relative',
                          zIndex: 2,
                          px: 2.5,
                          pt: 1,
                          pb: 0,
                        }}
                      >
                        <Box
                          sx={{
                            borderBottom: `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'}`,
                          }}
                        />
                      </Box>
                    )}
                    
                    {/* Content */}
                    <Box
                      sx={{
                        position: 'relative',
                        zIndex: 1,
                        px: 2.5,
                        py: 2.5,
                        display: 'flex',
                        flexDirection: 'column',
                        height: '100%',
                        justifyContent: 'center',
                      }}
                    >
                      {/* Title + Description + Date (left) + Emoji (right) - Equal top/bottom spacing */}
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                        {/* Left side: Title + Description + Date - Aligned left */}
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, flex: 1, alignItems: 'flex-start' }}>
                          {/* Title */}
                          <Typography
                            sx={{
                              fontSize: 16,
                              fontWeight: 700,
                              color: darkMode ? '#ffffff' : '#1a1a1a',
                              letterSpacing: '-0.3px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              width: '100%',
                            }}
                          >
                            {app.name}
                          </Typography>
                          
                          {/* Description */}
                          <Typography
                            sx={{
                              fontSize: 12,
                              color: darkMode ? '#aaaaaa' : '#666666',
                              lineHeight: 1.5,
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              textAlign: 'left',
                              width: '100%',
                            }}
                          >
                            {app.description || 'No description'}
                          </Typography>
                          
                          {/* Date */}
                          {formattedDate && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <AccessTimeIcon sx={{ fontSize: 12, color: darkMode ? '#aaaaaa' : '#666666' }} />
                              <Typography
                                sx={{
                                  fontSize: 10,
                                  fontWeight: 500,
                                  color: darkMode ? '#aaaaaa' : '#666666',
                                }}
                              >
                                {formattedDate}
                              </Typography>
                            </Box>
                          )}
                        </Box>
                        
                        {/* Right side: Emoji - Aligned right */}
                        <Typography
                          component="span"
                          sx={{
                            fontSize: 24,
                            lineHeight: 1,
                            flexShrink: 0,
                          }}
                        >
                          {emoji}
                        </Typography>
                      </Box>
                        
                      {/* Install Button - Gradient */}
                        <Button
                          size="small"
                          disabled={isBusy}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleInstall(app);
                        }}
                        endIcon={isInstalling ? <CircularProgress size={14} sx={{ color: '#ffffff' }} /> : <DownloadOutlinedIcon sx={{ fontSize: 14 }} />}
                          sx={{
                          mt: 2.5,
                          width: '100%',
                          py: 1,
                          fontSize: 12,
                            fontWeight: 600,
                            textTransform: 'none',
                          borderRadius: '10px',
                          background: installFailed 
                            ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.8) 0%, rgba(220, 38, 38, 0.8) 100%)'
                            : isInstalling 
                            ? 'linear-gradient(135deg, rgba(255, 149, 0, 0.8) 0%, rgba(255, 149, 0, 0.6) 100%)'
                            : gradient,
                          color: '#ffffff',
                          border: 'none',
                            transition: 'all 0.2s ease',
                            '&:hover': {
                            background: installFailed 
                              ? 'linear-gradient(135deg, rgba(239, 68, 68, 1) 0%, rgba(220, 38, 38, 1) 100%)'
                              : isInstalling 
                              ? 'linear-gradient(135deg, rgba(255, 149, 0, 1) 0%, rgba(255, 149, 0, 0.8) 100%)'
                              : gradient,
                            transform: 'scale(1.02)',
                            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
                            },
                            '&:disabled': {
                            background: darkMode ? 'rgba(0, 0, 0, 0.15)' : 'rgba(0, 0, 0, 0.1)',
                            color: darkMode ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.4)',
                            opacity: 0.5,
                            },
                          }}
                        >
                        {isInstalling ? 'Installing...' : installFailed ? 'Retry Install' : 'Install'}
                        </Button>
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
                  pb: 12,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 2.5,
                }}
              >
                {/* Illustration */}
                <Box
                  component="img"
                  src={ReachyDetective}
                  alt="Reachy Detective"
                  sx={{
                    width: 200,
                    height: 'auto',
                    opacity: darkMode ? 0.7 : 0.8,
                  }}
                />
                
                <Typography
                  sx={{
                    fontSize: 18,
                    fontWeight: 700,
                    color: darkMode ? '#aaa' : '#666',
                    textAlign: 'center',
                  }}
                >
                  Can't find what you're looking for?
                </Typography>
                <Button
                  onClick={onOpenCreateTutorial}
                  sx={{
                    textTransform: 'none',
                    fontSize: 14,
                    fontWeight: 600,
                    color: '#FF9500',
                    border: '1px solid #FF9500',
                    borderRadius: '10px',
                    px: 3,
                    py: 1,
                    bgcolor: 'transparent',
                    '&:hover': {
                      bgcolor: darkMode ? 'rgba(255, 149, 0, 0.08)' : 'rgba(255, 149, 0, 0.05)',
                      borderColor: '#FF9500',
                    },
                  }}
                >
                  Create your own app →
                </Button>
              </Box>
              )}
            </Box>
          )}
        </Box>
      </Box>
    </FullscreenOverlay>
  );
}

