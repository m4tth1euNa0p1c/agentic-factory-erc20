import { expect, test } from '@playwright/test';

// Variables requises (adresses publiques seulement, compte émetteur approvisionné en TCE) :
//   E2E_FROM, E2E_TO, optionnel E2E_AMOUNT (défaut 1,5)
const FROM = process.env['E2E_FROM'];
const TO = process.env['E2E_TO'];
const AMOUNT = process.env['E2E_AMOUNT'] ?? '1,5';

const VALID = ['RECEIVED', 'PUBLISHED', 'BROADCAST', 'UNKNOWN', 'CONFIRMED', 'SETTLED'];

test.describe('Parcours transfert nominal', () => {
  test.skip(!FROM || !TO, 'E2E_FROM et E2E_TO requis');

  test('soldes -> transfert -> suivi jusqu\'à SETTLED', async ({ page }) => {
    // 1. Vue compte : soldes et fraîcheur
    await page.goto(`/?account=${FROM}`);
    await expect(page.getByTestId('balances')).toBeVisible();
    await expect(page.getByTestId('freshness')).toContainText('Dernier bloc indexé');
    const rowTce = page.locator('[data-testid=balances] tr[data-token=TCE]');
    await expect(rowTce).toBeVisible();

    // 2. Formulaire de transfert
    await page.getByRole('link', { name: 'Nouveau transfert' }).first().click();
    await page.getByLabel('Compte émetteur').fill(FROM!);
    await page.getByLabel('Compte destinataire').fill(TO!);
    await page.getByLabel('Jeton').selectOption('TCE');
    await page.getByLabel(/Montant/).fill(AMOUNT);
    await page.getByRole('button', { name: 'Envoyer le transfert' }).click();

    await expect(page.getByTestId('feedback')).toContainText('Transfert accepté');
    const detail = page.getByTestId('operation-detail');
    await expect(detail.getByTestId('operation-id')).toHaveText(/^[0-9a-f-]{36}$/);

    // 3. Suivi : statut final Réglée (polling 1 s)
    await expect(detail.getByTestId('status-label')).toHaveText('Réglée', { timeout: 90_000 });
    await expect(detail.getByTestId('tx-hash')).toContainText(/0x[0-9a-f]{64}/);

    // Chronologie : uniquement des transitions observées, finissant par SETTLED
    // (les états intermédiaires ne sont pas exigés : RECEIVED -> PUBLISHED -> SETTLED est légitime, D-14).
    const statuses = await detail.locator('[data-testid=timeline] li').evaluateAll((els) =>
      els.map((e) => e.getAttribute('data-status')),
    );
    expect(statuses.length).toBeGreaterThan(0);
    for (const s of statuses) expect(VALID).toContain(s);
    expect(statuses.at(-1)).toBe('SETTLED');

    // 4. L'opération apparaît dans la liste récente du compte
    await page.goto(`/?account=${FROM}`);
    await expect(page.getByTestId('operations')).toContainText('TCE');
    await expect(page.getByTestId('operations')).toContainText('Réglée');
  });

  test('montant à plus de 6 décimales refusé côté interface', async ({ page }) => {
    await page.goto('/transfer');
    await page.getByLabel('Compte émetteur').fill(FROM!);
    await page.getByLabel('Compte destinataire').fill(TO!);
    await page.getByLabel(/Montant/).fill('1,1234567');
    await page.getByRole('button', { name: 'Envoyer le transfert' }).click();
    await expect(page.getByText('Six décimales au maximum.')).toBeVisible();
  });
});
