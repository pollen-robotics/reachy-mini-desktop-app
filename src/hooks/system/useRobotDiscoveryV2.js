/**
 * 🤖 Robot Discovery Hook V2 - Robust WiFi/VPN Support
 *
 * This hook uses the new mdns-sd based discovery system with:
 * - Automatic mDNS discovery (fast, works on LAN)
 * - Manual IP connection (fallback for VPN scenarios)
 * - VPN detection with user warnings
 * - Smart caching for instant reconnection
 *
 * Replaces the old system command-based WiFi scanning.
 */

import { useCallback, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import useAppStore from '../../store/useAppStore';

/**
 * Main robot discovery hook
 */
export function useRobotDiscoveryV2() {
  // Network context (VPN detection)
  const [networkContext, setNetworkContext] = useState(null);
  const [loadingNetwork, setLoadingNetwork] = useState(true);

  // Discovery state
  const [robots, setRobots] = useState([]);
  const [isScanning, setIsScanning] = useState(false);

  // Manual connection state
  const [manualIp, setManualIp] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);

  // Static peers (saved IPs)
  const [staticPeers, setStaticPeers] = useState([]);

  // Toast notifications
  const showToast = useAppStore(state => state.showToast);

  /**
   * Detect VPN on mount
   */
  useEffect(() => {
    const detectNetwork = async () => {
      try {
        const context = await invoke('detect_vpn');
        setNetworkContext(context);

        // Warn user if VPN detected
        if (context.is_vpn_detected) {
          showToast(
            `⚠️ VPN d'entreprise détecté (${context.interface_name}) - La découverte automatique peut échouer`,
            'warning',
            {
              duration: 8000,
            }
          );
        }
      } catch (error) {
        console.error('Failed to detect VPN:', error);
      } finally {
        setLoadingNetwork(false);
      }
    };

    detectNetwork();
  }, [showToast]);

  /**
   * Load static peers on mount
   */
  useEffect(() => {
    const loadPeers = async () => {
      try {
        const peers = await invoke('get_static_peers');
        setStaticPeers(peers);
      } catch (error) {
        console.error('Failed to load static peers:', error);
      }
    };

    loadPeers();
  }, []);

  /**
   * Discover robots using automatic methods (cache + mDNS + static peers)
   */
  const discover = useCallback(async () => {
    setIsScanning(true);
    setRobots([]);

    try {
      const foundRobots = await invoke('discover_robots');
      setRobots(foundRobots);

      if (foundRobots.length === 0) {
        showToast('📭 Aucun robot trouvé automatiquement - Essayez la connexion manuelle', 'info', {
          duration: 5000,
        });
      } else {
        showToast(`✅ ${foundRobots.length} robot(s) trouvé(s) !`, 'success');
      }

      return foundRobots;
    } catch (error) {
      console.error('Discovery error:', error);
      showToast(`❌ Erreur de découverte : ${error}`, 'error');
      return [];
    } finally {
      setIsScanning(false);
    }
  }, [showToast]);

  /**
   * Connect to robot at specific IP (manual mode)
   */
  const connectToIp = useCallback(
    async ip => {
      if (!ip || !ip.trim()) {
        showToast('⚠️ Veuillez saisir une adresse IP', 'warning');
        return null;
      }

      setIsConnecting(true);

      try {
        const robot = await invoke('connect_to_ip', { ip: ip.trim() });
        showToast(`✅ Connecté à ${ip} !`, 'success');

        // Add to robots list
        setRobots([robot]);

        // Reload static peers (IP was auto-added)
        const peers = await invoke('get_static_peers');
        setStaticPeers(peers);

        return robot;
      } catch (error) {
        console.error('Manual connection error:', error);
        showToast(`❌ Impossible de se connecter à ${ip} : ${error}`, 'error');
        return null;
      } finally {
        setIsConnecting(false);
      }
    },
    [showToast]
  );

  /**
   * Add a static peer IP (for power users)
   */
  const addStaticPeer = useCallback(
    async ip => {
      try {
        await invoke('add_static_peer', { ip });
        const peers = await invoke('get_static_peers');
        setStaticPeers(peers);
        showToast(`✅ IP ${ip} ajoutée aux favoris`, 'success');
      } catch (error) {
        console.error('Failed to add static peer:', error);
        showToast(`❌ ${error}`, 'error');
      }
    },
    [showToast]
  );

  /**
   * Remove a static peer IP
   */
  const removeStaticPeer = useCallback(
    async ip => {
      try {
        await invoke('remove_static_peer', { ip });
        const peers = await invoke('get_static_peers');
        setStaticPeers(peers);
        showToast(`✅ IP ${ip} retirée des favoris`, 'success');
      } catch (error) {
        console.error('Failed to remove static peer:', error);
        showToast(`❌ ${error}`, 'error');
      }
    },
    [showToast]
  );

  /**
   * Clear discovery cache (for troubleshooting)
   */
  const clearCache = useCallback(async () => {
    try {
      await invoke('clear_discovery_cache');
      showToast('🧹 Cache effacé', 'info');
    } catch (error) {
      console.error('Failed to clear cache:', error);
    }
  }, [showToast]);

  return {
    // Network context
    networkContext,
    loadingNetwork,
    isVpnDetected: networkContext?.is_vpn_detected || false,

    // Discovery
    robots,
    isScanning,
    discover,

    // Manual connection
    manualIp,
    setManualIp,
    isConnecting,
    connectToIp,

    // Static peers
    staticPeers,
    addStaticPeer,
    removeStaticPeer,

    // Utils
    clearCache,
    hasRobots: robots.length > 0,
  };
}

export default useRobotDiscoveryV2;
