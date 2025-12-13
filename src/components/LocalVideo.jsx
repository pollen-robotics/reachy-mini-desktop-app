import React, { useEffect, useRef, useState } from 'react';
import { Box, Typography } from '@mui/material';
import CameraFeed from '../views/active-robot/camera/CameraFeed';

export default function LocalVideo({ width = 640, height = 480, isLarge = false }) {
    const videoRef = useRef(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        let stream = null;

        const startCamera = async () => {
            try {
                console.log('[LocalVideo] Requesting local camera access...');
                stream = await navigator.mediaDevices.getUserMedia({
                    video: { width, height },
                    audio: false
                });

                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                }
            } catch (err) {
                console.error('[LocalVideo] Failed to access local camera:', err);
                setError('Local Camera Access Denied or Unavailable');
            }
        };

        startCamera();

        return () => {
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }
        };
    }, [width, height]);

    if (error) {
        return <CameraFeed width={width} height={height} isLarge={isLarge} message={error} />;
    }

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
                backgroundColor: '#000000',
                transform: 'scaleX(-1)' // Mirror effect for local cam
            }}
        />
    );
}
