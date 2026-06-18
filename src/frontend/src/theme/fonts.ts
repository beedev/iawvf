/**
 * Self-hosted typography via @fontsource. Importing this module registers the @font-face rules.
 *
 * Fraunces  — display / headings / brand (a characterful optical serif).
 * Public Sans — body & UI (clinical-grade legibility; used by the US Web Design System).
 * JetBrains Mono — structured rule JSON, decision traces, and code.
 *
 * We pull only the weights actually used to keep the bundle lean.
 */

// Fraunces (display serif) — semibold for headings, bold for the wordmark.
import '@fontsource/fraunces/400.css';
import '@fontsource/fraunces/500.css';
import '@fontsource/fraunces/600.css';
import '@fontsource/fraunces/700.css';

// Public Sans (UI sans).
import '@fontsource/public-sans/400.css';
import '@fontsource/public-sans/500.css';
import '@fontsource/public-sans/600.css';
import '@fontsource/public-sans/700.css';

// JetBrains Mono (code / JSON).
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
