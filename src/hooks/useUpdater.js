import { useState, useEffect, useCallback, useRef } from 'react';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

/**
 * Hook pour gérer les mises à jour automatiques de l'application
 * Version améliorée avec retry logic et gestion d'erreurs robuste
 * 
 * @param {object} options - Options de configuration
 * @param {boolean} options.autoCheck - Vérifier automatiquement au démarrage (défaut: true)
 * @param {number} options.checkInterval - Intervalle de vérification en ms (défaut: 3600000 = 1h)
 * @param {boolean} options.silent - Mode silencieux (pas de notification si pas de mise à jour)
 * @param {number} options.maxRetries - Nombre max de tentatives en cas d'erreur (défaut: 3)
 * @param {number} options.retryDelay - Délai initial entre les tentatives en ms (défaut: 1000)
 * @returns {object} État et fonctions de mise à jour
 */
export const useUpdater = ({
  autoCheck = true,
  checkInterval = 3600000, // 1 heure par défaut
  silent = false,
  maxRetries = 3,
  retryDelay = 1000,
} = {}) => {
  const [updateAvailable, setUpdateAvailable] = useState(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [error, setError] = useState(null);
  const retryCountRef = useRef(0);
  const lastCheckTimeRef = useRef(null);

  /**
   * Détecte si une erreur est récupérable (réseau, timeout)
   */
  const isRecoverableError = useCallback((err) => {
    if (!err) return false;
    const errorMsg = err.message?.toLowerCase() || '';
    const errorName = err.name?.toLowerCase() || '';
    
    // Erreurs récupérables : réseau, timeout, connexion
    const recoverablePatterns = [
      'network',
      'timeout',
      'connection',
      'fetch',
      'econnrefused',
      'enotfound',
      'etimedout',
    ];
    
    return recoverablePatterns.some(pattern => 
      errorMsg.includes(pattern) || errorName.includes(pattern)
    );
  }, []);

  /**
   * Retry avec exponential backoff
   */
  const sleep = useCallback((ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
  }, []);

  /**
   * Vérifie si une mise à jour est disponible avec retry automatique
   */
  const checkForUpdates = useCallback(async (retryCount = 0) => {
    setIsChecking(true);
    setError(null);

    try {
      console.log('🔍 Checking for updates...');
      const update = await check();
      console.log('🔍 Update check result:', update);
      
      // Reset retry count on success
      retryCountRef.current = 0;
      lastCheckTimeRef.current = Date.now();
      
      if (update) {
        console.log(`📦 Update available: ${update.version} (${update.date})`);
        setUpdateAvailable(update);
        return update;
      } else {
        if (!silent) {
          console.log('✅ Application is up to date');
        }
        setUpdateAvailable(null);
        return null;
      }
    } catch (err) {
      console.error(`❌ Error checking for updates (attempt ${retryCount + 1}/${maxRetries}):`, err);
      console.error('❌ Error details:', err.message, err.stack);
      
      // Retry automatique pour erreurs récupérables
      if (isRecoverableError(err) && retryCount < maxRetries) {
        const delay = retryDelay * Math.pow(2, retryCount); // Exponential backoff
        console.log(`🔄 Retrying in ${delay}ms...`);
        
        await sleep(delay);
        retryCountRef.current = retryCount + 1;
        return checkForUpdates(retryCount + 1);
      }
      
      // Erreur non récupérable ou max retries atteint
      const errorMessage = isRecoverableError(err)
        ? `Network error while checking for updates (${retryCount + 1}/${maxRetries} attempts)`
        : err.message || 'Error checking for updates';
      
      setError(errorMessage);
      return null;
    } finally {
      setIsChecking(false);
    }
  }, [silent, maxRetries, retryDelay, isRecoverableError, sleep]);

  /**
   * Télécharge et installe la mise à jour avec gestion d'erreurs robuste
   */
  const downloadAndInstall = useCallback(async (update, retryCount = 0) => {
    if (!update) {
      console.warn('⚠️ Aucune mise à jour disponible');
      return;
    }

    setIsDownloading(true);
    setDownloadProgress(0);
    setError(null);

    try {
      let lastProgress = 0;
      let lastUpdateTime = Date.now();
      let progressTimeout = null;
      let animationFrameId = null;
      let targetProgress = 0;
      let currentDisplayProgress = 0;

      // Animation function pour interpolation fluide
      const animateProgress = () => {
        if (currentDisplayProgress < targetProgress) {
          // Interpolation linéaire pour animation fluide
          const increment = Math.max(0.5, (targetProgress - currentDisplayProgress) * 0.1);
          currentDisplayProgress = Math.min(targetProgress, currentDisplayProgress + increment);
          setDownloadProgress(Math.round(currentDisplayProgress));
          animationFrameId = requestAnimationFrame(animateProgress);
        } else {
          animationFrameId = null;
        }
      };

      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            console.log(`📥 Download started: ${event.data.contentLength} bytes`);
            setDownloadProgress(0);
            lastProgress = 0;
            targetProgress = 0;
            // Safety timeout: if no progress for 30s, consider as error
            progressTimeout = setTimeout(() => {
              console.warn('⚠️ Download stalled, timeout...');
            }, 30000);
            break;
          
          case 'Progress':
            const { chunkLength, contentLength } = event.data;
            const progress = contentLength > 0 
              ? Math.round((chunkLength / contentLength) * 100)
              : 0;
            
            // Toujours mettre à jour la cible, même pour de petits changements
            targetProgress = progress;
            
            // Mettre à jour immédiatement si changement significatif ou si c'est la première fois
            const timeSinceLastUpdate = Date.now() - lastUpdateTime;
            if (Math.abs(progress - lastProgress) >= 0.5 || timeSinceLastUpdate > 100 || progress === 100) {
              // Arrêter l'animation si on a atteint la cible
              if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
                animationFrameId = null;
              }
              currentDisplayProgress = progress;
              setDownloadProgress(progress);
              lastProgress = progress;
              lastUpdateTime = Date.now();
            } else {
              // Démarrer l'animation pour interpolation fluide
              if (!animationFrameId) {
                animationFrameId = requestAnimationFrame(animateProgress);
              }
            }
            
            // Reset timeout if progress detected
            if (progressTimeout) {
              clearTimeout(progressTimeout);
              progressTimeout = setTimeout(() => {
                console.warn('⚠️ Download stalled, timeout...');
              }, 30000);
            }
            
            // Log seulement pour les changements significatifs
            if (Math.abs(progress - lastProgress) >= 5 || progress === 100) {
              console.log(`📥 Download: ${progress}%`);
            }
            break;
          
          case 'Finished':
            console.log('✅ Download finished');
            // Arrêter l'animation
            if (animationFrameId) {
              cancelAnimationFrame(animationFrameId);
              animationFrameId = null;
            }
            setDownloadProgress(100);
            targetProgress = 100;
            if (progressTimeout) {
              clearTimeout(progressTimeout);
            }
            break;
          
          default:
            break;
        }
      });

      console.log('✅ Update installed successfully');
      
      // downloadAndInstall should handle restart automatically,
      // but we call relaunch() explicitly to ensure restart happens
      // Note: In dev mode, relaunch might not work correctly
      try {
        console.log('🔄 Restarting application...');
        // Small delay to ensure installation is complete before restarting
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Attempt to relaunch
        await relaunch();
        
        // If we reach here, relaunch didn't work (shouldn't happen)
        console.warn('⚠️ Relaunch returned without error, but app should have restarted');
      } catch (relaunchError) {
        console.error('❌ Error during relaunch:', relaunchError);
        // In dev mode, relaunch might fail - this is expected
        // The app should still restart automatically via Tauri's updater mechanism
        // Don't throw here, as the update was successful
        console.log('ℹ️ Relaunch error (may be normal in dev mode), app should restart automatically');
      }
    } catch (err) {
      console.error(`❌ Error installing update (attempt ${retryCount + 1}/${maxRetries}):`, err);
      
      // Extract error message and clean it
      let errorMessage = err.message || err.toString() || 'Error installing update';
      // Remove backticks and extra formatting
      errorMessage = errorMessage.replace(/`/g, '').trim();
      
      // Handle specific error cases
      if (errorMessage.includes('404') || errorMessage.includes('Not Found')) {
        errorMessage = 'Update file not found on server. The update may not be available yet.';
      } else if (errorMessage.includes('403') || errorMessage.includes('Forbidden')) {
        errorMessage = 'Access denied. Please check your update server configuration.';
      } else if (errorMessage.includes('500') || errorMessage.includes('Internal Server Error')) {
        errorMessage = 'Server error. Please try again later.';
      }
      
      // Retry automatique pour erreurs récupérables pendant le téléchargement
      if (isRecoverableError(err) && retryCount < maxRetries) {
        const delay = retryDelay * Math.pow(2, retryCount);
        console.log(`🔄 Retrying download in ${delay}ms...`);
        
        await sleep(delay);
        return downloadAndInstall(update, retryCount + 1);
      }
      
      // Erreur non récupérable ou max retries atteint
      if (isRecoverableError(err)) {
        errorMessage = `Network error while downloading update (${retryCount + 1}/${maxRetries} attempts). Please try again later.`;
      }
      
          setError(errorMessage);
          setIsDownloading(false);
          setDownloadProgress(0);
          // Nettoyer l'animation en cas d'erreur
          if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
          }
        }
      }, [maxRetries, retryDelay, isRecoverableError, sleep]);

  /**
   * Installe la mise à jour disponible
   */
  const installUpdate = useCallback(async () => {
    if (updateAvailable) {
      await downloadAndInstall(updateAvailable);
    }
  }, [updateAvailable, downloadAndInstall]);

  /**
   * Ignore la mise à jour disponible
   */
  const dismissUpdate = useCallback(() => {
    setUpdateAvailable(null);
  }, []);

  // Vérification automatique au démarrage (avec délai pour éviter de bloquer le démarrage)
  useEffect(() => {
    if (autoCheck) {
      // Attendre que l'app soit complètement chargée avant de vérifier
      const timeout = setTimeout(() => {
        checkForUpdates();
      }, 2000); // 2 secondes après le démarrage
      
      return () => clearTimeout(timeout);
    }
  }, [autoCheck, checkForUpdates]);

  // Vérification périodique (seulement si pas de check récent)
  useEffect(() => {
    if (!autoCheck || checkInterval <= 0) return;

    const interval = setInterval(() => {
      // Ne pas vérifier si un check a été fait récemment (< 5 min)
      const timeSinceLastCheck = lastCheckTimeRef.current 
        ? Date.now() - lastCheckTimeRef.current 
        : Infinity;
      
      if (timeSinceLastCheck > 5 * 60 * 1000) { // 5 minutes
        checkForUpdates();
      }
    }, checkInterval);

    return () => clearInterval(interval);
  }, [autoCheck, checkInterval, checkForUpdates]);

  return {
    updateAvailable,
    isChecking,
    isDownloading,
    downloadProgress,
    error,
    checkForUpdates,
    installUpdate,
    dismissUpdate,
  };
};

