import { defineConfig } from '@playwright/test';

// Parcours E2E contre une pile TELA déjà démarrée (aucune clé ici : les adresses viennent de l'environnement).
// UI_BASE_URL : `ng serve` (http://127.0.0.1:4200, proxy /api -> 8080) ou l'image nginx.
export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  retries: 0,
  reporter: [['list']],
  outputDir: process.env['E2E_EVIDENCE_DIR'] ?? '../evidence/005-operator-ui/playwright',
  use: {
    baseURL: process.env['UI_BASE_URL'] ?? 'http://127.0.0.1:4200',
    trace: 'on',
    screenshot: 'on',
    video: 'off',
  },
});
