import React, { useEffect, useRef, useState } from 'react';
import { Box, Typography, CircularProgress } from '@mui/material';
import CameraFeed from '../views/active-robot/camera/CameraFeed';
import { buildApiUrl } from '../config/daemon';

/**
 * WebRTCVideo Component
 * Connects to the WebRTC daemon to display live camera feed
 * Falls back to CameraFeed placeholder on errors
 */
export default function WebRTCVideo({ width = 640, height = 480, isLarge = false }) {
  const videoRef = useRef(null);
  const [error, setError] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(true);
  const [connectionAttempts, setConnectionAttempts] = useState(0);

  const MAX_CONNECTION_ATTEMPTS = 3;
  const RECONNECT_DELAY = 5000; // 5 seconds

  const checkCameraStatus = async () => {
    try {
      console.log('[WebRTCVideo] Checking camera status...');
      const response = await fetch(buildApiUrl('/api/camera/status'));

      if (!response.ok) {
        // Handle 404 - endpoint doesn't exist yet
        if (response.status === 404) {
          console.log('[WebRTCVideo] Camera API not found - feature not implemented');
          throw new Error('Camera feature not implemented in backend');
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const status = await response.json();
      console.log('[WebRTCVideo] Camera status:', status);

      if (!status.available) {
        throw new Error(status.backend === 'NO_MEDIA' ? 'Camera backend not enabled' : 'Camera not available');
      }

      return status;
    } catch (error) {
      console.error('[WebRTCVideo] Camera status check failed:', error.message);

      // Provide more specific error messages
      if (error.message.includes('Failed to fetch')) {
        throw new Error('Camera service unavailable');
      } else if (error.message.includes('string did not match the expected pattern')) {
        throw new Error('Camera API response format error');
      }

      throw error;
    }
  };

  const initializeWebRTC = async () => {
    try {
      console.log('[WebRTCVideo] Initializing WebRTC connection...');

      // Check if WebRTC is supported
      if (!window.RTCPeerConnection) {
        throw new Error('WebRTC not supported in this browser');
      }

      // Check camera status first
      const cameraStatus = await checkCameraStatus();

      // Create peer connection
      const configuration = {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          // Add TURN server if available for better reliability
          ...(process.env.REACT_APP_TURN_SERVER ? [
            {
              urls: process.env.REACT_APP_TURN_SERVER,
              username: process.env.REACT_APP_TURN_USERNAME,
              credential: process.env.REACT_APP_TURN_CREDENTIAL
            }
          ] : [])
        ]
      };

      const pc = new RTCPeerConnection(configuration);

      // Set up event handlers
      pc.oniceconnectionstatechange = () => {
        console.log('[WebRTCVideo] ICE connection state:', pc.iceConnectionState);

        if (pc.iceConnectionState === 'connected') {
          setIsConnected(true);
          setIsConnecting(false);
          console.log('[WebRTCVideo] WebRTC connection established');
        } else if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') {
          if (pc.iceConnectionState === 'failed') {
            setError('WebRTC connection failed');
          }
          setIsConnected(false);
          setIsConnecting(false);
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log('[WebRTCVideo] New ICE candidate:', event.candidate);
          // Send candidate to server
          sendIceCandidate(event.candidate);
        }
      };

      pc.ontrack = (event) => {
        console.log('[WebRTCVideo] Received track:', event.track.kind);
        if (event.track.kind === 'video' && videoRef.current) {
          const stream = new MediaStream([event.track]);
          videoRef.current.srcObject = stream;
          console.log('[WebRTCVideo] Video stream set on video element');
        }
      };

      // Create and send offer
      const offer = await pc.createOffer({
        offerToReceiveVideo: true,
        offerToReceiveAudio: false
      });

      await pc.setLocalDescription(offer);
      console.log('[WebRTCVideo] Created offer:', offer);

      // Send offer to server
      const response = await fetch(buildApiUrl('/api/webrtc/offer'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sdp: offer.sdp,
          type: offer.type
        })
      });

      if (!response.ok) {
        throw new Error(`Offer failed: HTTP ${response.status}`);
      }

      const answerData = await response.json();
      console.log('[WebRTCVideo] Received answer:', answerData);

      // Set remote description
      await pc.setRemoteDescription({
        type: answerData.answer.type,
        sdp: answerData.answer.sdp
      });

      // Add ICE candidates from server
      if (answerData.ice_candidates && answerData.ice_candidates.length > 0) {
        for (const candidate of answerData.ice_candidates) {
          try {
            await pc.addIceCandidate(candidate);
            console.log('[WebRTCVideo] Added ICE candidate from server');
          } catch (iceError) {
            console.warn('[WebRTCVideo] Failed to add ICE candidate:', iceError);
          }
        }
      }

      // Store peer connection for cleanup
      window.currentPeerConnection = pc;

    } catch (error) {
      console.error('[WebRTCVideo] WebRTC initialization failed:', error);
      setError(`WebRTC error: ${error.message}`);
      setIsConnecting(false);
    }
  };

  const sendIceCandidate = async (candidate) => {
    try {
      const response = await fetch(buildApiUrl('/api/webrtc/ice'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(candidate)
      });

      if (!response.ok) {
        console.warn('[WebRTCVideo] Failed to send ICE candidate');
      }
    } catch (error) {
      console.error('[WebRTCVideo] Error sending ICE candidate:', error);
    }
  };

  const cleanupWebRTC = () => {
    console.log('[WebRTCVideo] Cleaning up WebRTC resources');

    // Close peer connection
    if (window.currentPeerConnection) {
      try {
        window.currentPeerConnection.close();
      } catch (error) {
        console.error('[WebRTCVideo] Error closing peer connection:', error);
      }
      delete window.currentPeerConnection;
    }

    // Stop video tracks
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(track => {
        try {
          track.stop();
        } catch (error) {
          console.error('[WebRTCVideo] Error stopping track:', error);
        }
      });
      videoRef.current.srcObject = null;
    }
  };

  // Initialize WebRTC connection
  useEffect(() => {
    let reconnectTimeout;

    const attemptConnection = () => {
      if (connectionAttempts >= MAX_CONNECTION_ATTEMPTS) {
        setError('Failed to connect after multiple attempts');
        setIsConnecting(false);
        return;
      }

      setIsConnecting(true);
      initializeWebRTC();
    };

    attemptConnection();

    return () => {
      cleanupWebRTC();
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
    };
  }, [connectionAttempts]);

  // Automatic reconnection
  useEffect(() => {
    if (!isConnected && !isConnecting && !error && connectionAttempts < MAX_CONNECTION_ATTEMPTS) {
      const timeout = setTimeout(() => {
        console.log('[WebRTCVideo] Attempting to reconnect...');
        setConnectionAttempts(prev => prev + 1);
      }, RECONNECT_DELAY);

      return () => clearTimeout(timeout);
    }
  }, [isConnected, isConnecting, error, connectionAttempts]);

  // Error handling
  if (error) {
    console.log('[WebRTCVideo] Rendering error state:', error);
    return (
      <Box
        sx={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          bgcolor: '#000000',
          borderRadius: isLarge ? '16px' : '12px',
          border: isLarge ? 'none' : '1px solid rgba(0, 0, 0, 0.08)'
        }}
      >
        <CameraFeed width={width} height={height} isLarge={isLarge} message={error} />
        <Typography
          variant="caption"
          sx={{
            color: 'rgba(255, 255, 255, 0.6)',
            textAlign: 'center',
            px: 2,
            fontFamily: 'SF Mono, Monaco, Menlo, monospace'
          }}
        >
          {error}
        </Typography>
        <Typography
          variant="caption"
          sx={{
            color: 'rgba(255, 255, 255, 0.4)',
            textAlign: 'center',
            fontFamily: 'SF Mono, Monaco, Menlo, monospace'
          }}
        >
          Will retry in {RECONNECT_DELAY / 1000} seconds...
        </Typography>
      </Box>
    );
  }

  // Connecting state
  if (isConnecting && !isConnected) {
    console.log('[WebRTCVideo] Rendering connecting state');
    return (
      <Box
        sx={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          bgcolor: '#000000',
          borderRadius: isLarge ? '16px' : '12px',
          border: isLarge ? 'none' : '1px solid rgba(0, 0, 0, 0.08)'
        }}
      >
        <CircularProgress size={isLarge ? 48 : 32} sx={{ color: 'white' }} />
        <Typography
          variant="body2"
          sx={{
            color: 'rgba(255, 255, 255, 0.8)',
            textAlign: 'center',
            fontFamily: 'SF Mono, Monaco, Menlo, monospace'
          }}
        >
          CONNECTING TO CAMERA
        </Typography>
        <Typography
          variant="caption"
          sx={{
            color: 'rgba(255, 255, 255, 0.5)',
            textAlign: 'center',
            fontFamily: 'SF Mono, Monaco, Menlo, monospace'
          }}
        >
          Attempt {connectionAttempts + 1} of {MAX_CONNECTION_ATTEMPTS}
        </Typography>
      </Box>
    );
  }

  // Connected state
  console.log('[WebRTCVideo] Rendering connected state');
  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      style={{
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        borderRadius: isLarge ? '16px' : '12px',
        backgroundColor: '#000000'
      }}
      onError={(e) => {
        console.error('[WebRTCVideo] Video element error:', e);
        setError('Video playback error');
      }}
    />
  );
}