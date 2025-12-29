# Theming Refactor Plan

> **Status:** Planned  
> **Created:** 2024-12-28  
> **Priority:** Medium (quality of life / maintainability)

## Executive Summary

The tauri-app codebase has accumulated significant CSS/theming debt with inline styles scattered across 60+ files. This document outlines a structured refactoring plan to improve maintainability and enable faster iteration for AI-assisted development.

---

## Current State Analysis

### Metrics

| Metric | Count | Problem |
|--------|-------|---------|
| `sx={...}` inline | **810** in 60 files | Massive duplication |
| `color:` | **676** matches | Hardcoded colors everywhere |
| `rgba(...)` | **505** matches | Opacity values reinvented each time |
| `fontSize:` | **302** matches | No typography scale |
| `fontWeight:` | **200** matches | Same values repeated |
| `borderRadius:` | **144** matches | Inconsistent (6px, 8px, 10px, 12px, 14px...) |
| `#FF9500` hardcoded | **136** matches | Primary color copy-pasted |
| `transition:` | **74** matches | Inconsistent animation timings |
| `boxShadow:` | **56** matches | Shadows reinvented |
| `theme.palette.*` | **16** matches | MUI theme underutilized |

### Key Issues

1. **Theme is almost empty** - Only basic palette defined in `main.jsx`
2. **Dark mode prop drilling** - `darkMode` passed to every component with ternary operators everywhere
3. **Monster files** - `InstalledAppsSection.jsx` (969 lines), `FirstTimeWifiSetupView.jsx` (951 lines), `SettingsOverlay.jsx` (818 lines)
4. **`!important` in theme** - Sign of CSS architecture fighting against itself
5. **Inconsistent design tokens** - No standardized spacing, radii, shadows, or typography

### Anti-pattern Example

This pattern appears in almost every component:

```javascript
// Colors defined locally in each component
const textPrimary = darkMode ? '#f5f5f5' : '#333';
const textSecondary = darkMode ? '#888' : '#666';
const bgCard = darkMode ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)';
const borderColor = darkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)';
```

---

## Refactor Plan

### Phase 1: Design Tokens (2-3h) 🟢 Low Risk

Create a proper theme file with all design tokens.

#### 1.1 Create `src/theme/theme.js`

```javascript
import { createTheme } from '@mui/material';

// ════════════════════════════════════════════════════════════════
// DESIGN TOKENS
// ════════════════════════════════════════════════════════════════

const colors = {
  primary: '#FF9500',
  primaryLight: '#FFB340',
  primaryDark: '#E08500',
  success: '#22c55e',
  error: '#ef4444',
  
  textLight: { primary: '#333', secondary: '#666', muted: '#999' },
  textDark: { primary: '#f5f5f5', secondary: '#aaa', muted: '#666' },
  
  surface: {
    light: { bg: 'rgba(0, 0, 0, 0.02)', border: 'rgba(0, 0, 0, 0.08)', hover: 'rgba(0, 0, 0, 0.05)' },
    dark: { bg: 'rgba(255, 255, 255, 0.03)', border: 'rgba(255, 255, 255, 0.08)', hover: 'rgba(255, 255, 255, 0.05)' },
  },
};

const typography = {
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  sizes: { xs: 9, sm: 10, md: 11, base: 12, lg: 13, xl: 14, '2xl': 16, '3xl': 18 },
  weights: { normal: 400, medium: 500, semibold: 600, bold: 700 },
};

const radii = { sm: 6, md: 8, lg: 10, xl: 12, '2xl': 14, full: '50%' };

const shadows = {
  sm: '0 1px 3px rgba(0, 0, 0, 0.1)',
  md: '0 4px 12px rgba(0, 0, 0, 0.15)',
  glow: (color) => `0 0 0 1px ${color}20`,
};

const transitions = {
  fast: 'all 0.15s ease',
  normal: 'all 0.2s ease',
  smooth: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
};

// ════════════════════════════════════════════════════════════════
// THEME FACTORY
// ════════════════════════════════════════════════════════════════

export const createAppTheme = (mode) => {
  const isDark = mode === 'dark';
  const text = isDark ? colors.textDark : colors.textLight;
  const surface = isDark ? colors.surface.dark : colors.surface.light;

  return createTheme({
    palette: {
      mode,
      primary: { main: colors.primary, light: colors.primaryLight, dark: colors.primaryDark },
      success: { main: colors.success },
      error: { main: colors.error },
      text: { primary: text.primary, secondary: text.secondary },
      divider: surface.border,
      background: { default: isDark ? '#1a1a1a' : '#ffffff', paper: surface.bg },
      action: {
        hover: surface.hover,
        selected: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
        disabled: isDark ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.26)',
        disabledBackground: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)',
      },
    },
    
    typography: {
      fontFamily: typography.fontFamily,
      caption: { fontSize: typography.sizes.sm, fontWeight: typography.weights.medium },
      body2: { fontSize: typography.sizes.md, fontWeight: typography.weights.medium },
      body1: { fontSize: typography.sizes.base, fontWeight: typography.weights.medium },
      subtitle2: { fontSize: typography.sizes.lg, fontWeight: typography.weights.semibold },
      subtitle1: { fontSize: typography.sizes.xl, fontWeight: typography.weights.semibold },
      h6: { fontSize: typography.sizes['2xl'], fontWeight: typography.weights.bold },
      h5: { fontSize: typography.sizes['3xl'], fontWeight: typography.weights.bold },
    },
    
    shape: { borderRadius: radii.md },
    
    custom: { colors, radii, shadows, transitions, surface },
    
    components: {
      // See Phase 1.2
    },
  });
};

export { colors, typography, radii, shadows, transitions };
```

#### 1.2 Component Variants

```javascript
components: {
  MuiButton: {
    styleOverrides: {
      root: {
        textTransform: 'none',
        fontWeight: 600,
        borderRadius: radii.lg,
        transition: transitions.smooth,
      },
      sizeSmall: {
        fontSize: 11,
        padding: '6px 12px',
      },
    },
  },
  
  MuiIconButton: {
    styleOverrides: {
      root: {
        transition: transitions.normal,
        borderRadius: radii.md,
      },
      sizeSmall: {
        width: 32,
        height: 32,
      },
    },
  },
  
  MuiChip: {
    styleOverrides: {
      sizeSmall: {
        height: 16,
        fontSize: 9,
        fontWeight: 700,
        '& .MuiChip-label': { px: 0.75 },
      },
    },
  },
  
  // ... existing tooltip, accordion, etc.
}
```

#### 1.3 Helper Hook

```javascript
// src/theme/helpers.js
import { useTheme } from '@mui/material';

export const useDesignTokens = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  
  return {
    isDark,
    colors: theme.custom.colors,
    radii: theme.custom.radii,
    shadows: theme.custom.shadows,
    surface: theme.custom.surface,
    transitions: theme.custom.transitions,
    
    text: (level = 'primary') => theme.palette.text[level],
    bg: (level = 'paper') => theme.palette.background[level],
    border: () => theme.palette.divider,
  };
};
```

---

### Phase 2: Atomic UI Components (3-4h) 🟢 Low Risk

Create reusable components that encapsulate common patterns.

#### Target Structure

```
src/components/ui/
├── index.js           # Re-exports
├── ActionButton.jsx   # Start/Stop/Open variants
├── SectionCard.jsx    # Container with border
├── StatusChip.jsx     # Running/Error/Starting chips
├── AppIcon.jsx        # Emoji container 52x52
└── TextLink.jsx       # "or build your own" style links
```

#### 2.1 ActionButton.jsx

```javascript
import { Button, CircularProgress, Tooltip } from '@mui/material';
import PlayArrowOutlinedIcon from '@mui/icons-material/PlayArrowOutlined';
import StopCircleOutlinedIcon from '@mui/icons-material/StopCircleOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';

const VARIANTS = {
  start: { label: 'Start', icon: PlayArrowOutlinedIcon, color: 'primary' },
  stop: { label: 'Stop', icon: StopCircleOutlinedIcon, color: 'error' },
  open: { label: 'Open', icon: OpenInNewIcon, color: 'primary' },
};

export function ActionButton({ 
  type = 'start', 
  loading = false, 
  disabled = false, 
  tooltip,
  onClick,
  ...props 
}) {
  const config = VARIANTS[type];
  const Icon = config.icon;
  
  const button = (
    <Button
      size="small"
      variant="outlined"
      color={config.color}
      disabled={disabled || loading}
      onClick={onClick}
      endIcon={loading ? <CircularProgress size={12} /> : <Icon sx={{ fontSize: 13 }} />}
      {...props}
    >
      {config.label}
    </Button>
  );
  
  return tooltip ? (
    <Tooltip title={tooltip} arrow placement="top">
      <span>{button}</span>
    </Tooltip>
  ) : button;
}
```

#### 2.2 SectionCard.jsx

```javascript
import { Box } from '@mui/material';
import { useDesignTokens } from '../../theme/helpers';

export function SectionCard({ 
  children, 
  variant = 'default', // 'default' | 'dashed' | 'active'
  sx = {},
  ...props 
}) {
  const { isDark, radii, surface } = useDesignTokens();
  
  const styles = {
    default: {
      border: `1px solid ${surface.border}`,
      bgcolor: surface.bg,
    },
    dashed: {
      border: `1px dashed ${isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'}`,
      bgcolor: 'transparent',
    },
    active: {
      border: '1px solid #22c55e',
      bgcolor: isDark ? 'rgba(34, 197, 94, 0.05)' : 'rgba(34, 197, 94, 0.03)',
      boxShadow: '0 0 0 1px rgba(34, 197, 94, 0.2)',
    },
  };
  
  return (
    <Box
      sx={{
        borderRadius: `${radii.xl}px`,
        p: 2,
        ...styles[variant],
        ...sx,
      }}
      {...props}
    >
      {children}
    </Box>
  );
}
```

---

### Phase 3: Progressive Migration (4-6h) 🟡 Medium Risk

Migrate heavy files one by one.

| File | Current Lines | Target Lines | Priority |
|------|--------------|--------------|----------|
| `InstalledAppsSection.jsx` | 969 | ~400 | High |
| `FirstTimeWifiSetupView.jsx` | 951 | ~500 | Medium |
| `SettingsOverlay.jsx` | 818 | ~400 | Medium |

#### Migration Example

**Before:**
```jsx
<Button
  size="small"
  disabled={isBusy || isRemoving}
  onClick={(e) => { e.stopPropagation(); handleStartApp(app.name); }}
  endIcon={<PlayArrowOutlinedIcon sx={{ fontSize: 13 }} />}
  sx={{
    minWidth: 'auto', px: 1.5, py: 0.75, fontSize: 11, fontWeight: 600,
    textTransform: 'none', borderRadius: '8px', flexShrink: 0,
    bgcolor: 'transparent', color: '#FF9500', border: '1px solid #FF9500',
    transition: 'all 0.2s ease',
    '&:hover': { bgcolor: 'rgba(255, 149, 0, 0.08)', borderColor: '#FF9500' },
    '&:disabled': { bgcolor: darkMode ? 'rgba(255, 255, 255, 0.02)' : '...', ... },
  }}
>
  Start
</Button>
```

**After:**
```jsx
<ActionButton 
  type="start" 
  disabled={isBusy || isRemoving} 
  onClick={() => handleStartApp(app.name)} 
/>
```

**Gain:** 15 lines → 1 line (×15 buttons = ~200 lines saved)

---

### Phase 4: Global Cleanup (2-3h) 🟡 Medium Risk

#### 4.1 Remove darkMode Prop Drilling

**Before:**
```jsx
// Parent
<InstalledAppsSection darkMode={darkMode} ... />

// Child
export default function InstalledAppsSection({ darkMode, ... }) {
  const textColor = darkMode ? '#f5f5f5' : '#333';
```

**After:**
```jsx
// Parent
<InstalledAppsSection ... />

// Child
export default function InstalledAppsSection({ ... }) {
  const { isDark, text } = useDesignTokens();
  // Or simply: color: 'text.primary' (MUI resolves automatically)
```

#### 4.2 Search & Replace Patterns

| Pattern to find | Replace with |
|-----------------|--------------|
| `'#FF9500'` | `'primary.main'` or token |
| `darkMode ? '#f5f5f5' : '#333'` | `'text.primary'` |
| `darkMode ? '#888' : '#666'` | `'text.secondary'` |
| `rgba(255, 255, 255, 0.08)` | `theme.palette.divider` |
| `borderRadius: '8px'` | `borderRadius: 1` |

---

## Quick Wins (Can be done immediately)

These additions to the theme have immediate impact without changing any component:

### 1. Typography Scale

```javascript
typography: {
  caption: { fontSize: 10, fontWeight: 500 },
  body2: { fontSize: 11, fontWeight: 500 },
  body1: { fontSize: 12, fontWeight: 500 },
  subtitle2: { fontSize: 13, fontWeight: 600 },
  subtitle1: { fontSize: 14, fontWeight: 600 },
  h6: { fontSize: 16, fontWeight: 700 },
  h5: { fontSize: 18, fontWeight: 700 },
},
```

### 2. Background & Text Colors

```javascript
background: {
  default: darkMode ? '#1a1a1a' : '#f5f5f5',
  paper: darkMode ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
},
text: {
  primary: darkMode ? '#f5f5f5' : '#333',
  secondary: darkMode ? '#aaa' : '#666',
  disabled: darkMode ? '#555' : '#999',
},
```

### 3. IconButton & Chip Styles

See Phase 1.2 above.

---

## Timeline Suggestion

| Session | Tasks | Duration |
|---------|-------|----------|
| **1** | Phase 1 complete (theme.js + helpers) | 2-3h |
| **2** | Phase 2 (UI components) + visual tests | 3-4h |
| **3** | Phase 3.1 (InstalledAppsSection) | 2h |
| **4** | Phase 3.2-3.3 (other heavy files) | 2-3h |
| **5** | Phase 4 (global cleanup) | 2h |

**Total estimated: 11-16h** (spread across multiple sessions)

---

## Benefits

1. **AI-assisted development** - Smaller, focused files are easier for LLMs to understand and modify
2. **Faster iteration** - Change a token once, see it everywhere
3. **Consistency** - No more "which borderRadius was it again?"
4. **Onboarding** - New developers understand the system faster
5. **Dark mode** - Already handled at theme level, no more ternaries

---

## Risks & Mitigation

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Visual regression | Medium | Test each file after migration |
| Breaking changes | Low | Theme additions are additive |
| Time investment | High | Incremental approach, prioritize quick wins |

---

## References

- [MUI Theming Documentation](https://mui.com/material-ui/customization/theming/)
- [MUI Component Variants](https://mui.com/material-ui/customization/theme-components/#creating-new-component-variants)
- Current theme: `src/main.jsx` lines 57-201

