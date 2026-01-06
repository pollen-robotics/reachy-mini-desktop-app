import React, { useEffect } from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';
import FullscreenOverlay from '@components/FullscreenOverlay';
import Header from './discover/components/Header';
import SearchBar from './discover/components/SearchBar';
import CategoryFilters from './discover/components/CategoryFilters';
import AppCard from './discover/components/AppCard';
import EmptyState from './discover/components/EmptyState';
import Footer from './discover/components/Footer';

/**
 * Modal overlay for discovering and installing apps from Hugging Face
 */
export default function DiscoverModal({
  open: isOpen,
  hidden = false,
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
  installedApps = [],
  onOpenCreateTutorial, // Callback to open Create App Tutorial modal
}) {
  // ✅ Debug: Log filteredApps changes
  useEffect(() => {
    
      count: filteredApps.length,
      selectedCategory,
      searchQuery,
      firstAppNames: filteredApps.slice(0, 3).map(a => a.name),
    });
  }, [filteredApps, selectedCategory, searchQuery]);
  
  // ✅ Determine if filters are active
  const hasActiveFilter = selectedCategory !== null || (searchQuery && searchQuery.trim());
  const isFiltered = hasActiveFilter && filteredApps.length < totalAppsCount;
  
  return (
    <FullscreenOverlay
      open={isOpen}
      hidden={hidden}
      onClose={onClose}
      darkMode={darkMode}
      zIndex={10002} // Above settings overlay
      centeredX={true} // Center horizontally
      centeredY={false} // Don't center vertically
      debugName="DiscoverModal"
      showCloseButton={true}
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
        {/* Header */}
        <Header darkMode={darkMode} />

        {/* Search Bar */}
        <SearchBar
          darkMode={darkMode}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          officialOnly={officialOnly}
          setOfficialOnly={setOfficialOnly}
          isLoading={isLoading}
          filteredApps={filteredApps}
          totalAppsCount={totalAppsCount}
          isFiltered={isFiltered}
        />

        {/* Category Filters */}
        <CategoryFilters
          darkMode={darkMode}
          categories={categories}
          selectedCategory={selectedCategory}
          setSelectedCategory={setSelectedCategory}
          totalAppsCount={totalAppsCount}
        />

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
                <EmptyState
                  darkMode={darkMode}
                  searchQuery={searchQuery}
                  setSearchQuery={setSearchQuery}
                />
              ) : (
                <>
                  {filteredApps.map((app, index) => {
                    const installJob = getJobInfo(app.name, 'install');
                    const isInstalling = isJobRunning(app.name, 'install');
                    const installFailed = installJob && installJob.status === 'failed';
                    const isInstalled = app.isInstalled || false;
                    
                    return (
                      <AppCard
                        key={`${app.name}-${selectedCategory || 'all'}-${searchQuery || ''}-${index}`}
                        app={app}
                        darkMode={darkMode}
                        isBusy={isBusy}
                        isInstalling={isInstalling}
                        installFailed={installFailed}
                        isInstalled={isInstalled}
                        handleInstall={handleInstall}
                        selectedCategory={selectedCategory}
                        searchQuery={searchQuery}
                        index={index}
                      />
                    );
                  })}
                  
                  {/* Footer */}
                  {filteredApps.length > 0 && (
                    <Footer
                      darkMode={darkMode}
                      onOpenCreateTutorial={onOpenCreateTutorial}
                    />
                  )}
                </>
              )}
            </Box>
          )}
        </Box>
      </Box>
    </FullscreenOverlay>
  );
}