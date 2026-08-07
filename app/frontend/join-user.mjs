import { chromium } from 'playwright';
const OUT = '/tmp/claude-0/-home-user-JeuCouple/eb09893d-5ae4-5f61-a4f9-15b8de81fb56/scratchpad';
const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--ignore-certificate-errors'],   // le proxy sandbox MITM le TLS sortant
});
const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, ignoreHTTPSErrors: true })).newPage();
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

await p.goto('https://cpl.yoan-lureault.com/', { waitUntil: 'networkidle', timeout: 45000 });
await p.waitForTimeout(2500);
await p.getByText('Rejoindre').first().click();
await p.waitForTimeout(600);
await p.locator('input').first().fill('Claude 🤖');
await p.getByText('Homme').first().click();
await p.locator('input').nth(1).fill('311456');
await p.getByRole('button', { name: /rejoindre/i }).last().click();
try {
  await p.waitForURL('**/salon/**', { timeout: 15000 });
  log('SALON REJOINT');
} catch {
  log('ECHEC JOIN:', (await p.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 180));
  await p.screenshot({ path: `${OUT}/join-fail.png` });
  process.exit(1);
}
await p.waitForTimeout(1200);
await p.screenshot({ path: `${OUT}/live-1-salon.png` });
// Accord des reglages si l'ecran le propose (build recent)
await p.getByText('Ça me va').first().click().catch(() => {});
log('en attente du lancement par toi…');

// Boucle de jeu : ~8 minutes, je reponds a chaque manche
const t0 = Date.now(); let shot = 2; let chatted = false;
while (Date.now() - t0 < 8 * 60 * 1000) {
  await p.waitForTimeout(1500);
  // Petit mot dans le chat, une fois en partie
  if (!chatted) {
    const chat = p.locator('input[placeholder*="crire un message"]');
    if (await chat.count()) {
      await chat.fill('Coucou, c\'est Claude 🤖 — on joue !').catch(() => {});
      await p.keyboard.press('Enter').catch(() => {});
      chatted = true;
      log('message envoye dans le chat');
    }
  }
  // Repondre : d'abord une vraie option, sinon Valider (curseur), sinon Passer
  const answer = p.locator('[class*="btn-answer"]').first();
  const valider = p.getByRole('button', { name: /^✓?\s*Valider/i }).first();
  const passer = p.getByText('Passer cette question').first();
  if (await answer.isVisible().catch(() => false)) {
    const label = (await answer.innerText().catch(() => '')).slice(0, 40).replace(/\n/g, ' ');
    await answer.click().catch(() => {});
    log('reponse cliquee:', label);
    await p.screenshot({ path: `${OUT}/live-${shot++}.png` }).catch(() => {});
    await p.waitForTimeout(4000);
  } else if (await valider.isVisible().catch(() => false)) {
    await valider.click().catch(() => {});
    log('curseur valide');
    await p.waitForTimeout(4000);
  } else if (await passer.isVisible().catch(() => false)) {
    await passer.click().catch(() => {});
    log('passe');
    await p.waitForTimeout(4000);
  }
  // Feuilles eventuelles (palier, theme, proposition) : je dis oui / je choisis
  await p.getByRole('button', { name: /On monte|On y va/i }).first().click().catch(() => {});
  const themeOpt = p.locator('[role="dialog"] button').first();
  if (await p.getByText('choisir le thème').count().catch(() => 0)) {
    await themeOpt.click().catch(() => {});
    log('theme choisi');
  }
}
await p.screenshot({ path: `${OUT}/live-fin.png` });
log('fin de ma session de jeu');
await b.close();
