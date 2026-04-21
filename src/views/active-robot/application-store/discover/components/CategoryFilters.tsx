import React from 'react';
import { Box, Typography, Chip } from '@mui/material';

interface Category {
  name: string;
  count: number;
}

interface CategoryFiltersProps {
  darkMode: boolean;
  categories: Category[];
  selectedCategory: string | null;
  setSelectedCategory: (category: string | null) => void;
  totalAppsCount: number;
}

export default function CategoryFilters({
  darkMode,
  categories,
  selectedCategory,
  setSelectedCategory,
  totalAppsCount,
}: CategoryFiltersProps): React.ReactElement {
  return (
    <Box
      sx={{
        mt: 0,
        mb: 6,
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 1.5,
        flexWrap: 'wrap',
      }}
    >
      <Typography
        sx={{
          fontSize: 12,
          fontWeight: 600,
          color: darkMode ? '#aaa' : '#666',
        }}
      >
        Tags
      </Typography>
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 1,
          alignItems: 'center',
        }}
      >
        <Chip
          label={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <span>All</span>
              <Typography
                sx={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: selectedCategory === null ? '#FF9500' : darkMode ? '#888' : '#999',
                  opacity: 0.8,
                }}
              >
                ({totalAppsCount})
              </Typography>
            </Box>
          }
          onClick={() => setSelectedCategory(null)}
          size="small"
          sx={{
            height: 28,
            fontSize: 12,
            fontWeight: selectedCategory === null ? 700 : 500,
            bgcolor:
              selectedCategory === null
                ? darkMode
                  ? 'rgba(255, 149, 0, 0.2)'
                  : 'rgba(255, 149, 0, 0.15)'
                : darkMode
                  ? 'rgba(255, 255, 255, 0.08)'
                  : 'rgba(0, 0, 0, 0.05)',
            color: selectedCategory === null ? '#FF9500' : darkMode ? '#aaa' : '#666',
            border:
              selectedCategory === null
                ? '1px solid #FF9500'
                : `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'}`,
            cursor: 'pointer',
            '&:hover': {
              bgcolor:
                selectedCategory === null
                  ? darkMode
                    ? 'rgba(255, 149, 0, 0.25)'
                    : 'rgba(255, 149, 0, 0.2)'
                  : darkMode
                    ? 'rgba(255, 255, 255, 0.12)'
                    : 'rgba(0, 0, 0, 0.08)',
            },
            '& .MuiChip-label': { px: 1.5 },
          }}
        />
        {categories.length > 0 &&
          categories.map(category => {
            const displayName = category.name.startsWith('sdk:')
              ? category.name.replace('sdk:', '').charAt(0).toUpperCase() +
                category.name.replace('sdk:', '').slice(1).toLowerCase()
              : category.name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            const isSelected = selectedCategory === category.name;

            return (
              <Chip
                key={category.name}
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <span>{displayName}</span>
                    <Typography
                      sx={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: isSelected ? '#FF9500' : darkMode ? '#888' : '#999',
                        opacity: 0.8,
                      }}
                    >
                      ({category.count})
                    </Typography>
                  </Box>
                }
                onClick={() => setSelectedCategory(isSelected ? null : category.name)}
                size="small"
                sx={{
                  height: 28,
                  fontSize: 12,
                  fontWeight: isSelected ? 700 : 500,
                  bgcolor: isSelected
                    ? darkMode
                      ? 'rgba(255, 149, 0, 0.2)'
                      : 'rgba(255, 149, 0, 0.15)'
                    : darkMode
                      ? 'rgba(255, 255, 255, 0.08)'
                      : 'rgba(0, 0, 0, 0.05)',
                  color: isSelected ? '#FF9500' : darkMode ? '#aaa' : '#666',
                  border: isSelected
                    ? '1px solid #FF9500'
                    : `1px solid ${darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'}`,
                  cursor: 'pointer',
                  '&:hover': {
                    bgcolor: isSelected
                      ? darkMode
                        ? 'rgba(255, 149, 0, 0.25)'
                        : 'rgba(255, 149, 0, 0.2)'
                      : darkMode
                        ? 'rgba(255, 255, 255, 0.12)'
                        : 'rgba(0, 0, 0, 0.08)',
                  },
                  '& .MuiChip-label': { px: 1.5 },
                }}
              />
            );
          })}
      </Box>
    </Box>
  );
}
