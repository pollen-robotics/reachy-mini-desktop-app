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
 * Composant de dialogue pour afficher et gérer les mises à jour disponibles
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
      return date.toLocaleDateString('fr-FR', {
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
          <Typography variant="h6">Mise à jour disponible</Typography>
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
          Publiée le {formatDate(update.date)}
        </Typography>

        {update.body && (
          <Box sx={{ mt: 2, mb: 2 }}>
            <Typography variant="subtitle2" gutterBottom>
              Notes de version:
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
              Téléchargement en cours...
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
            L'application sera redémarrée automatiquement après l'installation.
          </Alert>
        )}

        {error && error.includes('réseau') && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            Erreur réseau détectée. Le système réessayera automatiquement.
          </Alert>
        )}
      </DialogContent>

      <DialogActions>
        {!isDownloading && (
          <Button onClick={onDismiss} startIcon={<CloseIcon />}>
            Plus tard
          </Button>
        )}
        <Button
          onClick={onInstall}
          variant="contained"
          disabled={isDownloading || !!error}
          startIcon={isDownloading ? <DownloadIcon /> : <CheckCircleIcon />}
        >
          {isDownloading ? 'Installation...' : 'Installer maintenant'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

