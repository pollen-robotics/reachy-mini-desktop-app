import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-plugin-prettier';
import prettierConfig from 'eslint-config-prettier';

// React Three Fiber uses custom JSX props that ESLint doesn't recognize
const r3fProps = [
  'position',
  'rotation',
  'scale',
  'args',
  'attach',
  'intensity',
  'castShadow',
  'receiveShadow',
  'shadow-mapSize-width',
  'shadow-mapSize-height',
  'shadow-bias',
  'dispose',
  'object',
  'geometry',
  'material',
  'skeleton',
  'morphTargetInfluences',
  'morphTargetDictionary',
  'visible',
  'frustumCulled',
  'renderOrder',
  'color',
  'fog',
  'near',
  'far',
  'fov',
  'aspect',
  'target',
  'decay',
  'distance',
  'angle',
  'penumbra',
  'groundColor',
  'wireframe',
  'transparent',
  'opacity',
  'side',
  'depthTest',
  'depthWrite',
  'flatShading',
  'metalness',
  'roughness',
  'emissive',
  'emissiveIntensity',
  'envMapIntensity',
  'map',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'aoMap',
  'aoMapIntensity',
  'displacementMap',
  'displacementScale',
  'envMap',
  'skinning',
  'vertexColors',
  'toneMapped',
];

export default [
  // Ignore patterns
  {
    ignores: [
      'dist/**',
      'dist-web/**',
      'node_modules/**',
      'src-tauri/**',
      'scripts/**',
      '*.config.js',
      'src/utils/*.wasm',
    ],
  },

  // Base JS config
  js.configs.recommended,

  // Prettier config (disables conflicting rules)
  prettierConfig,

  // TypeScript recommended rules (for .ts/.tsx files)
  ...tseslint.configs.recommended.map(config => ({
    ...config,
    files: ['src/**/*.{ts,tsx}'],
  })),

  // Main config for React/JSX/TSX files
  {
    files: ['src/**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      parser: tseslint.parser,
      globals: {
        ...globals.browser,
        ...globals.es2024,
        // Node.js globals used in some files
        process: 'readonly',
        require: 'readonly',
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      prettier,
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      // React rules
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      'react/prop-types': 'off', // We don't use PropTypes
      'react/no-unescaped-entities': 'warn',
      'react/jsx-no-target-blank': 'warn',
      'react/display-name': 'off',
      // Allow React Three Fiber props
      'react/no-unknown-property': ['error', { ignore: r3fProps }],

      // React Hooks rules - use only the classic rules, not the new React Compiler rules
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // Disable React Compiler rules (too strict for existing codebase, enable later)
      // These are new in react-hooks v7 and require significant refactoring
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/static-components': 'off',
      'react-hooks/immutability': 'off',

      // React Refresh (for Vite HMR)
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // Prettier
      'prettier/prettier': 'warn',

      // General JS rules
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'no-console': 'off', // We use console for logging
      'no-debugger': 'warn',
      'prefer-const': 'warn',
      'no-var': 'error',
      eqeqeq: ['warn', 'smart'],
      'no-empty': 'off', // Allow empty blocks (often intentional in event handlers)
    },
  },

  // TypeScript-specific overrides (swap base rules for TS-aware ones)
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/ban-ts-comment': [
        'warn',
        { 'ts-expect-error': 'allow-with-description', 'ts-ignore': true },
      ],
    },
  },
];
