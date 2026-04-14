import { useState, useMemo, useEffect, useRef } from 'react';
import { Box, Typography, Tooltip, IconButton, Avatar } from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import LogoutIcon from '@mui/icons-material/Logout';
import { useActiveRobotContext } from '../../context';
import {
  useApps,
  useAppHandlers,
  useAppInstallation,
  useAppFiltering,
  useModalStack,
} from '../../application-store/hooks';
import { InstalledAppsSection } from '../../application-store/installed';
import { Modal as DiscoverModal } from '../../application-store/discover';
import { CreateAppTutorial as CreateAppTutorialModal } from '../../application-store/modals';
import { Overlay as InstallOverlay } from '../../application-store/installation';

/**
 * Applications Section - Displays installed and available apps from Hugging Face
 * Uses ActiveRobotContext for decoupling from global stores
 */
export default function ApplicationsSection({
  showToast,
  onLoadingChange,
  hasQuickActions = false, // To adjust padding-top of AccordionSummary
  isActive = false,
  isBusy = false,
  darkMode = false,
  hfUser = null, // { username, avatarUrl }
  onLogout = null,
}) {
  const { robotState, actions } = useActiveRobotContext();

  // Get values from context with prop fallbacks
  const {
    darkMode: contextDarkMode,
    isActive: contextIsActive,
    installingAppName,
    installJobType,
    installResult,
    installStartTime,
  } = robotState;

  const effectiveDarkMode = darkMode !== undefined ? darkMode : contextDarkMode;
  const effectiveIsActive = isActive !== undefined ? isActive : contextIsActive;
  const effectiveIsBusy = isBusy !== undefined ? isBusy : actions.isBusy();

  // State
  const [officialOnly, setOfficialOnly] = useState(false);
  const [privateOnly, setPrivateOnly] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const previousHfUsernameRef = useRef(hfUser?.username || null);

  // ✅ Modal stack hook - declared BEFORE useAppInstallation to avoid stale closure
  const { openModal, closeModal, discoverModalOpen, createAppTutorialModalOpen } = useModalStack();

  // Apps data hook
  const {
    availableApps,
    installedApps,
    currentApp,
    activeJobs,
    installApp,
    removeApp,
    startApp,
    stopCurrentApp,
    fetchAvailableApps,
    isLoading,
    isStoppingApp,
    error: appsError,
    hasUpdate,
    triggerUpdate,
    isCheckingUpdates,
    hasCheckedOnce,
  } = useApps(effectiveIsActive, officialOnly);

  // Notify parent when loading status changes
  useEffect(() => {
    if (onLoadingChange) {
      onLoadingChange(isLoading);
    }
  }, [isLoading, onLoadingChange]);

  // Refresh the catalog when HF auth state changes so private spaces appear/disappear promptly.
  useEffect(() => {
    const currentUsername = hfUser?.username || null;
    if (previousHfUsernameRef.current === currentUsername) {
      return;
    }

    previousHfUsernameRef.current = currentUsername;
    fetchAvailableApps(true);
  }, [hfUser?.username, fetchAvailableApps]);

  // Reset category when switching between official/non-official
  useEffect(() => {
    setSelectedCategory(null);
  }, [officialOnly]);

  // Show toast when an app crashes
  const lastCrashToastRef = useRef(null);
  useEffect(() => {
    if (
      currentApp?.state === 'error' &&
      currentApp?.info?.name &&
      showToast &&
      lastCrashToastRef.current !== currentApp.info.name
    ) {
      lastCrashToastRef.current = currentApp.info.name;
      const firstLine = currentApp.error?.split('\n')[0] || 'unknown error';
      showToast(
        `${currentApp.info.name} crashed: ${firstLine}. Make sure your app is up-to-date.`,
        'error'
      );
    } else if (!currentApp || currentApp.state !== 'error') {
      lastCrashToastRef.current = null;
    }
  }, [currentApp, showToast]);

  // Installation lifecycle hook
  useAppInstallation({
    activeJobs,
    installedApps,
    showToast,
    refreshApps: fetchAvailableApps,
    isLoading,
    onInstallSuccess: () => {
      if (discoverModalOpen) {
        closeModal();
      }
    },
  });

  // App action handlers
  const {
    expandedApp,
    setExpandedApp,
    startingApp,
    handleInstall,
    handleUninstall,
    handleUpdate,
    handleStartApp,
    isJobRunning,
    getJobInfo,
  } = useAppHandlers({
    currentApp,
    activeJobs,
    installApp,
    removeApp,
    startApp,
    stopCurrentApp,
    triggerUpdate,
    showToast,
  });

  const installingApp = useMemo(() => {
    if (!installingAppName) return null;
    const found = availableApps.find(app => app.name === installingAppName);
    if (found) return found;
    return {
      name: installingAppName,
      id: installingAppName,
      description: '',
      url: null,
      source_kind: 'local',
      isInstalled: false,
      extra: {},
    };
  }, [installingAppName, availableApps]);

  const activeJobsArray = Array.from(activeJobs.values());
  const installingJob = installingAppName
    ? activeJobsArray.find(job => job.appName === installingAppName)
    : null;

  // ✅ Filter & sort apps client-side (data is cached for 1 day)
  const { categories, filteredApps } = useAppFiltering(
    availableApps,
    searchQuery,
    selectedCategory,
    officialOnly,
    privateOnly
  );

  return (
    <>
      <Box>
        <Box
          sx={{
            px: 3,
            py: 1,
            pt: hasQuickActions ? 1 : 0,
            bgcolor: 'transparent',
          }}
        >
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
              <Typography
                sx={{
                  fontSize: 20,
                  fontWeight: 700,
                  color: effectiveDarkMode ? '#f5f5f5' : '#333',
                  letterSpacing: '-0.3px',
                }}
              >
                Applications
              </Typography>
              {installedApps.length > 0 && (
                <Typography
                  sx={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: effectiveDarkMode ? '#666' : '#999',
                  }}
                >
                  {installedApps.length}
                </Typography>
              )}
              <Tooltip
                title="Apps that are currently installed on your robot. You can start, stop, configure, or uninstall them from here."
                arrow
                placement="top"
              >
                <InfoOutlinedIcon
                  sx={{
                    fontSize: 14,
                    color: effectiveDarkMode ? '#666' : '#999',
                    opacity: 0.6,
                    cursor: 'help',
                  }}
                />
              </Tooltip>

              {/* HF User Badge — pushed to the right */}
              {hfUser && (
                <Box
                  sx={{
                    ml: 'auto',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.75,
                    py: 0.25,
                    pl: 0.75,
                    pr: 0.25,
                    borderRadius: '20px',
                    bgcolor: effectiveDarkMode
                      ? 'rgba(255, 255, 255, 0.04)'
                      : 'rgba(0, 0, 0, 0.03)',
                    border: `1px solid ${effectiveDarkMode ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)'}`,
                    transition: 'background 0.15s ease',
                    '&:hover': {
                      bgcolor: effectiveDarkMode
                        ? 'rgba(255, 255, 255, 0.07)'
                        : 'rgba(0, 0, 0, 0.05)',
                    },
                  }}
                >
                  <Avatar
                    src={hfUser.avatarUrl}
                    alt={hfUser.username}
                    sx={{
                      width: 20,
                      height: 20,
                      fontSize: 11,
                      bgcolor: effectiveDarkMode ? '#444' : '#ddd',
                    }}
                  >
                    {hfUser.username?.[0]?.toUpperCase() || '?'}
                  </Avatar>
                  <Typography
                    sx={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: effectiveDarkMode ? '#ccc' : '#555',
                      maxWidth: 90,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {hfUser.username}
                  </Typography>
                  {onLogout && (
                    <Tooltip title="Sign out" arrow placement="top">
                      <IconButton
                        size="small"
                        onClick={onLogout}
                        sx={{
                          width: 20,
                          height: 20,
                          color: effectiveDarkMode ? '#666' : '#aaa',
                          '&:hover': {
                            color: effectiveDarkMode ? '#bbb' : '#666',
                            bgcolor: effectiveDarkMode
                              ? 'rgba(255, 255, 255, 0.08)'
                              : 'rgba(0, 0, 0, 0.06)',
                          },
                        }}
                      >
                        <LogoutIcon sx={{ fontSize: 13 }} />
                      </IconButton>
                    </Tooltip>
                  )}
                </Box>
              )}
            </Box>
            <Typography
              sx={{
                fontSize: 12,
                color: effectiveDarkMode ? '#888' : '#999',
                fontWeight: 500,
              }}
            >
              Extend Reachy&apos;s capabilities
            </Typography>
          </Box>
        </Box>
        <Box sx={{ px: 0, mb: 0, bgcolor: 'transparent', position: 'relative' }}>
          <InstalledAppsSection
            installedApps={installedApps}
            darkMode={effectiveDarkMode}
            expandedApp={expandedApp}
            setExpandedApp={setExpandedApp}
            startingApp={startingApp}
            currentApp={currentApp}
            isBusy={effectiveIsBusy}
            isJobRunning={isJobRunning}
            isStoppingApp={isStoppingApp}
            handleStartApp={handleStartApp}
            handleUninstall={handleUninstall}
            handleUpdate={handleUpdate}
            hasUpdate={hasUpdate}
            isCheckingUpdates={isCheckingUpdates}
            hasCheckedOnce={hasCheckedOnce}
            getJobInfo={getJobInfo}
            stopCurrentApp={stopCurrentApp}
            onOpenDiscover={() => openModal('discover')}
            onOpenCreateTutorial={() => openModal('createTutorial')}
          />
        </Box>
      </Box>

      <DiscoverModal
        open={discoverModalOpen}
        onClose={closeModal}
        hidden={!!(installingAppName && installingApp)}
        filteredApps={filteredApps}
        darkMode={effectiveDarkMode}
        isBusy={effectiveIsBusy}
        isLoading={isLoading}
        error={appsError}
        activeJobs={activeJobs}
        isJobRunning={isJobRunning}
        handleInstall={handleInstall}
        getJobInfo={getJobInfo}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        officialOnly={officialOnly}
        setOfficialOnly={setOfficialOnly}
        privateOnly={privateOnly}
        setPrivateOnly={setPrivateOnly}
        categories={categories}
        selectedCategory={selectedCategory}
        setSelectedCategory={setSelectedCategory}
        totalAppsCount={availableApps.length}
        installedApps={installedApps}
        onOpenCreateTutorial={() => openModal('createTutorial')}
      />

      <CreateAppTutorialModal
        open={createAppTutorialModalOpen}
        onClose={closeModal}
        darkMode={effectiveDarkMode}
      />

      {installingAppName && installingApp && (
        <InstallOverlay
          appInfo={installingApp}
          jobInfo={
            installingJob || { type: installJobType || 'install', status: 'starting', logs: [] }
          }
          darkMode={effectiveDarkMode}
          jobType={installJobType || 'install'}
          resultState={installResult}
          installStartTime={installStartTime}
        />
      )}
    </>
  );
}
