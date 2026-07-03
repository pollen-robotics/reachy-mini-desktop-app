import React, { useState, useMemo, useEffect, useRef } from 'react';
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
import type { ToastSeverity } from '../../../../types/store';
import { DURATION, EASING, whiteAlpha, blackAlpha } from '@styles/tokens';
import { FONT_WEIGHT, TYPO, transition, useAppPalette } from '@styles';

export interface HfUserInfo {
  username: string;
  avatarUrl?: string | null;
}

export interface ApplicationsSectionProps {
  showToast?: (message: string, severity?: ToastSeverity) => void;
  onLoadingChange?: (loading: boolean) => void;
  hasQuickActions?: boolean | unknown;
  isActive?: boolean;
  isBusy?: boolean;
  /** @deprecated Theme is now read from `useAppPalette()`. Prop kept for back-compat but ignored. */
  darkMode?: boolean;
  hfUser?: HfUserInfo | null;
  onLogout?: (() => void) | null;
}

/**
 * Applications Section - Displays installed and available apps from Hugging Face
 * Uses ActiveRobotContext for decoupling from global stores
 */
export default function ApplicationsSection({
  showToast,
  onLoadingChange,
  hasQuickActions = false,
  isActive,
  isBusy,
  hfUser = null,
  onLogout = null,
}: ApplicationsSectionProps): React.ReactElement {
  const palette = useAppPalette();
  const { robotState, actions } = useActiveRobotContext();

  const {
    isActive: contextIsActive,
    installingAppName,
    installJobType,
    installResult,
    installStartTime,
  } = robotState;

  const effectiveIsActive = isActive !== undefined ? isActive : contextIsActive;
  const effectiveIsBusy = isBusy !== undefined ? isBusy : actions.isBusy();
  // Downstream components that still accept a `darkMode` prop live outside this
  // migration scope. Mirror `palette.isDark` to them until they are migrated.
  const downstreamDarkMode = palette.isDark;

  // State
  const [officialOnly, setOfficialOnly] = useState<boolean>(false);
  const [privateOnly, setPrivateOnly] = useState<boolean>(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const previousHfUsernameRef = useRef<string | null>(hfUser?.username || null);

  // ✅ Modal stack hook - declared BEFORE useAppInstallation to avoid stale closure
  const { openModal, closeModal, discoverModalOpen, createAppTutorialModalOpen } = useModalStack();

  // Apps data hook
  // TODO(ts): `useApps` returns several fields typed as `unknown`/`Map<string, unknown>` from
  // outside this agent's migration scope; narrow locally to preserve runtime behavior.
  const appsHook = useApps(effectiveIsActive, officialOnly) as unknown as {
    availableApps: Array<{
      name?: string;
      id?: string;
      description?: string;
      url?: string | null;
      source_kind?: string;
      isInstalled?: boolean;
      extra?: Record<string, unknown>;
      [key: string]: unknown;
    }>;
    installedApps: Array<{ name?: string; [key: string]: unknown }>;
    currentApp: {
      state?: string;
      info?: { name?: string };
      error?: string;
      [key: string]: unknown;
    } | null;
    activeJobs: Map<string, { appName?: string; [key: string]: unknown }>;
    installApp: (appInfo: { name?: string; [key: string]: unknown }) => Promise<unknown>;
    removeApp: (appName: string) => Promise<unknown>;
    startApp: (appName: string) => Promise<unknown>;
    stopCurrentApp: () => Promise<unknown>;
    fetchAvailableApps: (force?: boolean) => Promise<unknown>;
    applyStartupApp: (appName: string | null) => Promise<void>;
    startupAppName: string | null;
    isLoading: boolean;
    isStoppingApp: boolean;
    error: string | null;
    hasUpdate: boolean;
    triggerUpdate: (appName: string) => Promise<unknown>;
    isCheckingUpdates: boolean;
    hasCheckedOnce: boolean;
  };
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
    applyStartupApp,
    startupAppName,
    isLoading,
    isStoppingApp,
    error: appsError,
    hasUpdate,
    triggerUpdate,
    isCheckingUpdates,
    hasCheckedOnce,
  } = appsHook;

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
  const lastCrashToastRef = useRef<string | null>(null);
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
    handleToggleStartupApp,
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
    applyStartupApp,
    startupAppName,
    showToast,
  });

  const installingApp = useMemo(() => {
    if (!installingAppName) return null;
    const found = availableApps.find((app: { name?: string }) => app.name === installingAppName);
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
    ? activeJobsArray.find((job: { appName?: string }) => job.appName === installingAppName)
    : null;

  // ✅ Filter & sort apps client-side (data is cached for 1 day)
  const { categories, filteredApps } = useAppFiltering(
    availableApps,
    searchQuery,
    selectedCategory,
    officialOnly,
    privateOnly
  );

  // TODO(style-migration): avatar fallback bg and user badge shades don't have dedicated palette tokens yet.
  const avatarFallbackBg = palette.isDark ? '#444' : '#ddd';
  const userBadgeBg = palette.isDark ? whiteAlpha(0.04) : blackAlpha(0.03);
  const userBadgeBgHover = palette.isDark ? whiteAlpha(0.07) : blackAlpha(0.05);
  const userBadgeBorder = palette.isDark ? whiteAlpha(0.06) : blackAlpha(0.06);
  const logoutHoverBg = palette.isDark ? whiteAlpha(0.08) : blackAlpha(0.06);

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
                  fontSize: TYPO.xxl,
                  fontWeight: FONT_WEIGHT.bold,
                  color: palette.textPrimary,
                  letterSpacing: '-0.3px',
                }}
              >
                Applications
              </Typography>
              {installedApps.length > 0 && (
                <Typography
                  sx={{
                    fontSize: TYPO.xs,
                    fontWeight: FONT_WEIGHT.bold,
                    color: palette.textMuted,
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
                    fontSize: TYPO.md,
                    color: palette.textMuted,
                    opacity: 0.6,
                    cursor: 'help',
                  }}
                />
              </Tooltip>

              {/* HF User Badge - pushed to the right */}
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
                    bgcolor: userBadgeBg,
                    border: `1px solid ${userBadgeBorder}`,
                    transition: transition('background', DURATION.fast, EASING.standard),
                    '&:hover': {
                      bgcolor: userBadgeBgHover,
                    },
                  }}
                >
                  <Avatar
                    src={hfUser.avatarUrl || undefined}
                    alt={hfUser.username}
                    sx={{
                      width: 20,
                      height: 20,
                      fontSize: TYPO.xs,
                      bgcolor: avatarFallbackBg,
                    }}
                  >
                    {hfUser.username?.[0]?.toUpperCase() || '?'}
                  </Avatar>
                  <Typography
                    sx={{
                      fontSize: TYPO.xs,
                      fontWeight: FONT_WEIGHT.semibold,
                      color: palette.textSecondary,
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
                          color: palette.textMuted,
                          '&:hover': {
                            color: palette.textSecondary,
                            bgcolor: logoutHoverBg,
                          },
                        }}
                      >
                        <LogoutIcon sx={{ fontSize: TYPO.body }} />
                      </IconButton>
                    </Tooltip>
                  )}
                </Box>
              )}
            </Box>
            <Typography
              sx={{
                fontSize: TYPO.sm,
                color: palette.textMuted,
                fontWeight: FONT_WEIGHT.medium,
              }}
            >
              Extend Reachy&apos;s capabilities
            </Typography>
          </Box>
        </Box>
        <Box sx={{ px: 0, mb: 0, bgcolor: 'transparent', position: 'relative' }}>
          <InstalledAppsSection
            /* TODO(ts): `InstalledAppsSection` (outside scope) expects canonical `InstalledApp[]`; local shape is broader. */
            installedApps={installedApps as never}
            darkMode={downstreamDarkMode}
            expandedApp={expandedApp}
            setExpandedApp={setExpandedApp}
            startingApp={startingApp}
            currentApp={currentApp}
            isBusy={effectiveIsBusy}
            /* TODO(ts): `isJobRunning` and `hasUpdate` signatures differ in `InstalledAppsSection` (outside scope). */
            isJobRunning={isJobRunning as never}
            isStoppingApp={isStoppingApp}
            handleStartApp={handleStartApp}
            handleUninstall={handleUninstall}
            handleUpdate={handleUpdate}
            handleToggleStartupApp={handleToggleStartupApp}
            startupAppName={startupAppName}
            hasUpdate={hasUpdate as never}
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
        /* TODO(ts): `DiscoverModal` and `useAppFiltering` re-define `AppLike` with incompatible shapes outside this agent's scope. */
        filteredApps={filteredApps as never}
        darkMode={downstreamDarkMode}
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
        /* TODO(ts): `DiscoverModal` lives in a `.jsx` file outside this agent's scope; relax prop types locally. */
        installedApps={installedApps as never[]}
        onOpenCreateTutorial={() => openModal('createTutorial')}
      />

      <CreateAppTutorialModal
        open={createAppTutorialModalOpen}
        onClose={closeModal}
        darkMode={downstreamDarkMode}
      />

      {installingAppName && installingApp && (
        <InstallOverlay
          /* TODO(ts): `AppInfo` is defined outside this agent's scope; cast locally to match runtime shape. */
          appInfo={installingApp as never}
          jobInfo={
            installingJob || { type: installJobType || 'install', status: 'starting', logs: [] }
          }
          darkMode={downstreamDarkMode}
          jobType={installJobType || 'install'}
          /* TODO(ts): `installResult` uses `'error' | 'success' | null` in `types/store.ts` while `InstallOverlay` (outside scope) expects `'failed' | 'success'`. */
          resultState={
            installResult === 'error'
              ? ('failed' as const)
              : (installResult as 'success' | null | undefined)
          }
          installStartTime={installStartTime}
        />
      )}
    </>
  );
}
