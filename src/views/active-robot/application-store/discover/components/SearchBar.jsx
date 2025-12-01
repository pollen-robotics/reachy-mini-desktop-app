import React, { useState, useEffect, useRef } from 'react';
import { Box, Typography, InputBase, Tooltip, IconButton, Checkbox, FormControlLabel } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';

/**
 * Search bar component for Discover Modal
 */
export default function SearchBar({
  darkMode,
  searchQuery,
  setSearchQuery,
  officialOnly,
  setOfficialOnly,
  isLoading,
  filteredApps,
  totalAppsCount,
  isFiltered,
}) {
  const [isSticky, setIsSticky] = useState(false);
  const containerRef = useRef(null);
  const sentinelRef = useRef(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const container = containerRef.current;
    if (!sentinel || !container) return;

    const checkSticky = () => {
      const sentinelRect = sentinel.getBoundingClientRect();
      // When sentinel's top is above viewport (top < 0), container is sticky
      const shouldBeSticky = sentinelRect.top < 0;
      setIsSticky(shouldBeSticky);
    };

    // Check immediately
    checkSticky();

    // Find the scrollable container (FullscreenOverlay)
    let scrollContainer = container;
    while (scrollContainer && scrollContainer !== document.body) {
      const style = window.getComputedStyle(scrollContainer);
      if (style.position === 'fixed' && (style.overflow === 'auto' || style.overflowY === 'auto')) {
        // Found the FullscreenOverlay
        scrollContainer.addEventListener('scroll', checkSticky, { passive: true });
        break;
      }
      scrollContainer = scrollContainer.parentElement;
    }

    // Also use IntersectionObserver as backup
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        setIsSticky(!entry.isIntersecting);
      },
      {
        root: null,
        rootMargin: '0px',
        threshold: 0,
      }
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
      if (scrollContainer && scrollContainer !== document.body) {
        scrollContainer.removeEventListener('scroll', checkSticky);
      }
    };
  }, []);

  return (
    <>
      {/* Sentinel to detect when searchbar becomes sticky */}
      <Box
        ref={sentinelRef}
        sx={{
          position: 'relative',
          height: '1px',
          width: '100%',
          pointerEvents: 'none',
          visibility: 'hidden',
        }}
      />
      <Box
        ref={containerRef}
        sx={{
          position: 'sticky',
          top: 0,
          pt: 1,
          pb: 0,
          mb: 2,
          zIndex: 10,
          // Background wrapper to cover scrolling content
          // Transparent when not sticky, opaque exactly when sticky
          bgcolor: isSticky 
            ? (darkMode ? 'rgba(18, 18, 18, 0.92)' : 'rgba(255, 255, 255, 0.95)')
            : 'transparent',
          backdropFilter: isSticky ? 'blur(10px)' : 'none',
          WebkitBackdropFilter: isSticky ? 'blur(10px)' : 'none',
          transition: 'background-color 0.2s ease, backdrop-filter 0.2s ease',
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
        
        {/* Clear search button - Icon cross, leftmost in right block */}
        {searchQuery && (
          <>
            <Box sx={{ width: '1px', height: '18px', bgcolor: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)' }} />
            <IconButton
              onClick={() => setSearchQuery('')}
              size="small"
              sx={{
                p: 0.5,
                color: darkMode ? '#888' : '#999',
                '&:hover': {
                  color: darkMode ? '#aaa' : '#666',
                  bgcolor: darkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
                },
              }}
              title="Clear search"
            >
              <CloseIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </>
        )}
        
        {/* Apps count */}
        <Tooltip title={`${filteredApps.length} ${filteredApps.length === 1 ? 'app' : 'apps'} ${searchQuery ? 'found' : 'available'}`} arrow placement="top">
          <Typography
            sx={{
              fontSize: 11,
              fontWeight: 700,
              color: isFiltered 
                ? '#FF9500'  // ✅ Highlighted when filtered
                : (darkMode ? '#666' : '#999'),
              letterSpacing: '0.2px',
              cursor: 'help',
              px: 1.5,
              py: 0.5,
              borderRadius: '6px',
              bgcolor: isFiltered
                ? (darkMode ? 'rgba(255, 149, 0, 0.15)' : 'rgba(255, 149, 0, 0.08)')  // ✅ More visible background when filtered
                : (darkMode ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)'),
              border: isFiltered 
                ? `1px solid ${darkMode ? 'rgba(255, 149, 0, 0.3)' : 'rgba(255, 149, 0, 0.2)'}`  // ✅ Border when filtered
                : 'none',
            }}
          >
            {isFiltered 
              ? `${filteredApps.length}/${totalAppsCount}`  // ✅ Show "filtered/total" when filtered
              : filteredApps.length  // ✅ Show just number when no filter or at max
            }
          </Typography>
        </Tooltip>
        
        {/* Info icon for non-official mode - All the way to the right, left of Official */}
        {!officialOnly && (
          <>
            <Box sx={{ width: '1px', height: '18px', bgcolor: darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)' }} />
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
          </>
        )}
        
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
      </Box>
      </Box>
    </>
  );
}
