import React, { useEffect, useMemo, useCallback } from 'react';
import { Box } from '@mui/material';
import { RobotNotDetectedView, StartingView, ReadyToStartView, TransitionView, ActiveRobotView, ClosingView } from './views';
import useAppStore from '../store/useAppStore';
import { useDaemon } from '../hooks/useDaemon';
import { useDaemonHealthCheck } from '../hooks/useDaemonHealthCheck';
import { useUsbDetection } from '../hooks/useUsbDetection';
import { useRobotCommands } from '../hooks/useRobotCommands';
import { useLogs } from '../hooks/useLogs';
import { useWindowResize } from '../hooks/useWindowResize';
import { useUpdater } from '../hooks/useUpdater';
import { DAEMON_CONFIG, setAppStoreInstance } from '../config/daemon';

function App() {
  // Initialiser le store dans daemon.js pour le logging centralisé
  useEffect(() => {
    setAppStoreInstance(useAppStore);
  }, []);
  const { daemonVersion, hardwareError, isTransitioning, setIsTransitioning, setHardwareError } = useAppStore();
  const { isActive, isStarting, isStopping, startupError, checkStatus, startDaemon, stopDaemon, fetchDaemonVersion } = useDaemon();
  const { isUsbConnected, usbPortName, checkUsbRobot } = useUsbDetection();
  const { sendCommand, playRecordedMove, isCommandRunning } = useRobotCommands();
  const { logs, fetchLogs } = useLogs();
  
  // 🔄 Système de mise à jour automatique
  const {
    updateAvailable,
    isChecking,
    isDownloading,
    downloadProgress,
    error: updateError,
    checkForUpdates,
    installUpdate,
    dismissUpdate,
  } = useUpdater({
    autoCheck: true,
    checkInterval: 3600000, // Vérifier toutes les heures
    silent: false,
  });
  
  // 🏥 Health check centralisé (UN SEUL endroit pour crash detection)
  useDaemonHealthCheck();
  
  // 🤖 Debug : Afficher les transitions de state machine
  const robotStatus = useAppStore(state => state.robotStatus);
  const busyReason = useAppStore(state => state.busyReason);
  useEffect(() => {
    const label = useAppStore.getState().getRobotStatusLabel();
    console.log(`🤖 [STATE MACHINE] Status: ${robotStatus}${busyReason ? ` (${busyReason})` : ''} → "${label}"`);
  }, [robotStatus, busyReason]);
  
  // ⚡ Cleanup est géré côté Rust dans lib.rs :
  // - Signal handler (SIGTERM/SIGINT) → cleanup_system_daemons()
  // - on_window_event(CloseRequested) → kill_daemon()
  // - on_window_event(Destroyed) → cleanup_system_daemons()
  // → Pas besoin de handler JS (évite la redondance)

  // Déterminer la vue actuelle pour le resize automatique
  const currentView = useMemo(() => {
    // Vue compact : ClosingView (en train de s'arrêter)
    if (isStopping) {
      console.log('📐 App - Switching to COMPACT view (stopping daemon)');
      return 'compact';
    }
    
    // ⚡ Vue expanded : daemon actif OU en transition (mais JAMAIS pendant StartingView)
    // BLOQUE le resize tant que isStarting = true (scan en cours)
    if (!isStarting && (isActive || isTransitioning) && !hardwareError) {
      console.log('📐 App - Switching to EXPANDED view (isActive or TransitionView visible)');
      return 'expanded';
    }
    
    // Vue compact : toutes les autres (RobotNotDetected, Starting, ReadyToStart)
    console.log(`📐 App - COMPACT view (isActive=${isActive}, isTransitioning=${isTransitioning}, isStarting=${isStarting})`);
    return 'compact';
  }, [isActive, hardwareError, isStopping, isTransitioning, isStarting]);

  // Hook pour redimensionner automatiquement la fenêtre
  useWindowResize(currentView);

  useEffect(() => {
    checkStatus();
    fetchLogs();
    checkUsbRobot();
    fetchDaemonVersion();
    const statusInterval = setInterval(checkStatus, DAEMON_CONFIG.INTERVALS.STATUS_CHECK);
    const logsInterval = setInterval(fetchLogs, DAEMON_CONFIG.INTERVALS.LOGS_FETCH);
    const usbInterval = setInterval(checkUsbRobot, DAEMON_CONFIG.INTERVALS.USB_CHECK);
    const versionInterval = setInterval(fetchDaemonVersion, DAEMON_CONFIG.INTERVALS.VERSION_FETCH);
    return () => {
      clearInterval(statusInterval);
      clearInterval(logsInterval);
      clearInterval(usbInterval);
      clearInterval(versionInterval);
    };
  }, [checkStatus, fetchLogs, checkUsbRobot, fetchDaemonVersion]);

  // Stop daemon automatically if robot gets disconnected
  useEffect(() => {
    if (!isUsbConnected && isActive) {
      console.log('⚠️ Robot disconnected during use - stopping daemon');
      stopDaemon();
    }
  }, [isUsbConnected, isActive, stopDaemon]);

  // ✅ Callback pour fermer TransitionView quand les apps sont chargées
  // ⚠️ IMPORTANT : Tous les hooks doivent être appelés avant les retours conditionnels
  const handleAppsReady = useCallback(() => {
    if (isTransitioning) {
      console.log('✅ Apps loaded, closing TransitionView');
      setIsTransitioning(false);
    }
  }, [isTransitioning, setIsTransitioning]);

  // Vue conditionnelle : Robot non connecté
  if (!isUsbConnected) {
    return <RobotNotDetectedView />;
  }

  // ⚡ PRIORITÉ : Starting daemon (scan visuel)
  // Doit rester visible même si isTransitioning devient true
  if (isStarting) {
    return <StartingView startupError={startupError} />;
  }

  // Intermediate view: Transition après scan - simple spinner pendant resize
  // ✅ Rendre ActiveRobotView en arrière-plan pour charger les apps, mais afficher TransitionView par-dessus
  if (isTransitioning) {
    return (
      <>
        {/* ActiveRobotView caché pour charger les apps en arrière-plan */}
        <Box sx={{ position: 'absolute', opacity: 0, pointerEvents: 'none', zIndex: -1 }}>
          <ActiveRobotView 
            isActive={isActive}
            isStarting={isStarting}
            isStopping={isStopping}
            stopDaemon={stopDaemon}
            sendCommand={sendCommand}
            playRecordedMove={playRecordedMove}
            isCommandRunning={isCommandRunning}
            logs={logs}
            daemonVersion={daemonVersion}
            usbPortName={usbPortName}
            onAppsReady={handleAppsReady}
          />
        </Box>
        {/* TransitionView visible par-dessus */}
        <TransitionView />
      </>
    );
  }

  // Intermediate view: Stopping daemon - show spinner
  if (isStopping) {
    return <ClosingView />;
  }

  // Main view: Robot connected but daemon not active - show start screen
  if (isUsbConnected && !isActive && !isStarting) {
    // Reset hardware error si on revient à cette vue
    if (hardwareError) {
      setHardwareError(null);
    }
    return (
      <ReadyToStartView 
        startDaemon={startDaemon} 
        isStarting={isStarting} 
        usbPortName={usbPortName}
        updateAvailable={updateAvailable}
        isChecking={isChecking}
        isDownloading={isDownloading}
        downloadProgress={downloadProgress}
        updateError={updateError}
        onInstallUpdate={installUpdate}
        onDismissUpdate={dismissUpdate}
        onCheckUpdates={checkForUpdates}
      />
    );
  }

  // ⚠️ Si erreur hardware détectée, rester bloqué sur StartingView
  if (hardwareError) {
    return <StartingView startupError={hardwareError} />;
  }

  // Full control view: Robot connected and daemon active
  return (
    <>
      <ActiveRobotView 
        isActive={isActive}
        isStarting={isStarting}
        isStopping={isStopping}
        stopDaemon={stopDaemon}
        sendCommand={sendCommand}
        playRecordedMove={playRecordedMove}
        isCommandRunning={isCommandRunning}
        logs={logs}
        daemonVersion={daemonVersion}
        usbPortName={usbPortName}
        onAppsReady={handleAppsReady}
      />
    </>
  );
}

export default App;

