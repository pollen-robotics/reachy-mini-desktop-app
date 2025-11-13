import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  LinearProgress,
  Box,
  Alert,
  Chip,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import CloseIcon from '@mui/icons-material/Close';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

/**
 * Dialog component to display and manage available updates
 */
export default function UpdateDialog({
  open,
  update,
  isDownloading,
  downloadProgress,
  error,
  onInstall,
  onDismiss,
}) {
  if (!update) return null;

  const formatDate = (dateString) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return dateString;
    }
  };

  return (
    <Dialog
      open={open}
      onClose={isDownloading ? undefined : onDismiss}
      maxWidth="sm"
      fullWidth
      disableEscapeKeyDown={isDownloading}
    >
      <DialogTitle>
        <Box display="flex" alignItems="center" gap={1}>
          <DownloadIcon color="primary" />
          <Typography variant="h6">Update available</Typography>
          <Chip
            label={`v${update.version}`}
            color="primary"
            size="small"
            sx={{ ml: 'auto' }}
          />
        </Box>
      </DialogTitle>

      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Typography variant="body2" color="text.secondary" gutterBottom>
          Published on {formatDate(update.date)}
        </Typography>

        {update.body && (
          <Box sx={{ mt: 2, mb: 2 }}>
            <Typography variant="subtitle2" gutterBottom>
              Release notes:
            </Typography>
            <Typography
              variant="body2"
              sx={{
                whiteSpace: 'pre-wrap',
                maxHeight: '200px',
                overflowY: 'auto',
                p: 1,
                bgcolor: 'rgba(0, 0, 0, 0.02)',
                borderRadius: 1,
              }}
            >
              {update.body}
            </Typography>
          </Box>
        )}

        {isDownloading && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Downloading...
            </Typography>
            <LinearProgress
              variant="determinate"
              value={downloadProgress}
              sx={{ mt: 1 }}
            />
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
              {downloadProgress}%
            </Typography>
          </Box>
        )}

        {!isDownloading && !error && (
          <Alert severity="info" sx={{ mt: 2 }}>
            The application will restart automatically after installation.
          </Alert>
        )}

        {error && error.includes('network') && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            Network error detected. The system will retry automatically.
          </Alert>
        )}
      </DialogContent>

      <DialogActions>
        {!isDownloading && (
          <Button onClick={onDismiss} startIcon={<CloseIcon />}>
            Later
          </Button>
        )}
        <Button
          onClick={onInstall}
          variant="contained"
          disabled={isDownloading || !!error}
          startIcon={isDownloading ? <DownloadIcon /> : <CheckCircleIcon />}
        >
          {isDownloading ? 'Installing...' : 'Install now'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

