import React, { useRef, useState, useLayoutEffect } from 'react';
import { Box, CircularProgress, Typography, Button } from '@mui/material';
import WifiOffIcon from '@mui/icons-material/WifiOff';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useVirtualizer } from '@tanstack/react-virtual';
import FullscreenOverlay from '@components/FullscreenOverlay';
import Header from './components/Header';
import SearchBar from './components/SearchBar';
import CategoryFilters from './components/CategoryFilters';
import AppCard from './components/AppCard';
import EmptyState from './components/EmptyState';
import Footer from './components/Footer';

const COLUMNS = 2;
const ESTIMATED_ROW_HEIGHT = 240;
const ROW_GAP = 20;

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
  error,
  activeJobs,
  isJobRunning,
  handleInstall,
  getJobInfo,
  searchQuery,
  setSearchQuery,
  officialOnly,
  setOfficialOnly,
  privateOnly,
  setPrivateOnly,
  categories,
  selectedCategory,
  setSelectedCategory,
  totalAppsCount,
  installedApps = [],
  onOpenCreateTutorial,
  hidden = false,
}) {
  const hasActiveFilter = selectedCategory !== null || (searchQuery && searchQuery.trim());
  const isFiltered = hasActiveFilter && filteredApps.length < totalAppsCount;

  const overlayScrollRef = useRef(null);
  const gridAnchorRef = useRef(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  // Measure the offset between the scroll container top and the grid start
  useLayoutEffect(() => {
    if (!gridAnchorRef.current || !overlayScrollRef.current) return;
    const gridTop = gridAnchorRef.current.getBoundingClientRect().top;
    const scrollTop = overlayScrollRef.current.getBoundingClientRect().top;
    setScrollMargin(gridTop - scrollTop + overlayScrollRef.current.scrollTop);
  }, [isOpen, isLoading, filteredApps.length, selectedCategory, searchQuery]);

  const rowCount = Math.ceil(filteredApps.length / COLUMNS);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => overlayScrollRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT + ROW_GAP,
    overscan: 3,
    scrollMargin,
  });

  const hasApps = !isLoading && !(error && filteredApps.length === 0) && filteredApps.length > 0;

  return (
    <FullscreenOverlay
      open={isOpen}
      onClose={onClose}
      darkMode={darkMode}
      zIndex={10002}
      centeredX={true}
      debugName="DiscoverModalLegacy"
      centeredY={false}
      showCloseButton={true}
      hidden={hidden}
      backdropBlur={10}
      scrollRef={overlayScrollRef}
    >
      <Box
        sx={{
          width: '90%',
          maxWidth: '700px',
          display: 'flex',
          flexDirection: 'column',
          mt: 8,
          mb: 4,
        }}
      >
        <Header darkMode={darkMode} />

        <SearchBar
          darkMode={darkMode}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          officialOnly={officialOnly}
          setOfficialOnly={setOfficialOnly}
          privateOnly={privateOnly}
          setPrivateOnly={setPrivateOnly}
          isLoading={isLoading}
          filteredApps={filteredApps}
          totalAppsCount={totalAppsCount}
          isFiltered={isFiltered}
        />

        <CategoryFilters
          darkMode={darkMode}
          categories={categories}
          selectedCategory={selectedCategory}
          setSelectedCategory={setSelectedCategory}
          totalAppsCount={totalAppsCount}
        />

        {/* Warning banner */}
        {error && filteredApps.length > 0 && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              px: 2.5,
              py: 1.5,
              mb: 2,
              borderRadius: '10px',
              backgroundColor: darkMode ? 'rgba(255, 149, 0, 0.12)' : 'rgba(255, 149, 0, 0.08)',
              border: `1px solid ${darkMode ? 'rgba(255, 149, 0, 0.3)' : 'rgba(255, 149, 0, 0.25)'}`,
            }}
          >
            <WifiOffIcon
              sx={{ fontSize: 20, color: darkMode ? '#fbbf24' : '#f59e0b', flexShrink: 0 }}
            />
            <Typography
              sx={{
                fontSize: 13,
                color: darkMode ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.8)',
                fontWeight: 500,
                flex: 1,
              }}
            >
              {error}
            </Typography>
          </Box>
        )}

        {/* Error state */}
        {error && filteredApps.length === 0 ? (
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
            <WifiOffIcon
              sx={{ fontSize: 56, color: darkMode ? '#666' : '#999', opacity: 0.7, mb: 1 }}
            />
            <Typography
              sx={{
                fontSize: 15,
                color: darkMode ? 'rgba(255, 255, 255, 0.9)' : 'rgba(0, 0, 0, 0.87)',
                fontWeight: 600,
                mb: 0.5,
              }}
            >
              No Internet Connection
            </Typography>
            <Typography
              sx={{
                fontSize: 13,
                color: darkMode ? '#888' : '#666',
                fontWeight: 400,
                maxWidth: 320,
                lineHeight: 1.6,
                mb: 2,
              }}
            >
              {error}
            </Typography>
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={() => window.location.reload()}
              sx={{
                textTransform: 'none',
                fontSize: 13,
                fontWeight: 500,
                px: 3,
                py: 1,
                borderRadius: '8px',
                borderColor: darkMode ? '#444' : '#ddd',
                color: darkMode ? '#aaa' : '#666',
                '&:hover': {
                  borderColor: darkMode ? '#555' : '#ccc',
                  backgroundColor: darkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
                },
              }}
            >
              Retry
            </Button>
          </Box>
        ) : isLoading ? (
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
            <CircularProgress size={40} sx={{ color: darkMode ? '#666' : '#999' }} />
            <Typography sx={{ fontSize: 14, color: darkMode ? '#888' : '#999', fontWeight: 500 }}>
              Loading apps...
            </Typography>
          </Box>
        ) : filteredApps.length === 0 ? (
          <EmptyState
            darkMode={darkMode}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
          />
        ) : (
          /* Virtualized grid - scrolls with the overlay */
          <Box ref={gridAnchorRef} sx={{ position: 'relative', width: '100%' }}>
            <div
              style={{
                height: virtualizer.getTotalSize(),
                width: '100%',
                position: 'relative',
              }}
            >
              {virtualizer.getVirtualItems().map(virtualRow => {
                const startIdx = virtualRow.index * COLUMNS;
                const app1 = filteredApps[startIdx];
                const app2 = filteredApps[startIdx + 1];

                const getCardProps = (app, idx) => {
                  const installJob = getJobInfo(app.name, 'install');
                  return {
                    key: app.name,
                    app,
                    darkMode,
                    isBusy,
                    isInstalling: isJobRunning(app.name, 'install'),
                    installFailed: installJob && installJob.status === 'failed',
                    isInstalled: app.isInstalled || false,
                    handleInstall,
                    selectedCategory,
                    searchQuery,
                    index: idx,
                  };
                };

                return (
                  <div
                    key={virtualRow.key}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualRow.start - scrollMargin}px)`,
                    }}
                  >
                    <Box sx={{ display: 'flex', gap: 2.5, pb: `${ROW_GAP}px` }}>
                      <AppCard {...getCardProps(app1, startIdx)} />
                      {app2 && <AppCard {...getCardProps(app2, startIdx + 1)} />}
                    </Box>
                  </div>
                );
              })}
            </div>

            <Footer darkMode={darkMode} onOpenCreateTutorial={onOpenCreateTutorial} />
          </Box>
        )}
      </Box>
    </FullscreenOverlay>
  );
}
