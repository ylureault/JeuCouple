#!/usr/bin/env node
/**
 * Claude joue avec toi, dans ton Google Chrome.
 *
 * Le sandbox de développement de Claude n'a pas le droit de sortir vers le
 * web (proxy en liste blanche, CONNECT 403) : ce script est donc le joueur
 * Claude, exécuté depuis TA machine, où le réseau est libre.
 *
 * Usage, depuis app/frontend :
 *   npm install                       (une fois — Playwright est en devDeps)
 *   node scripts/claude-player.mjs https://cpl.yoan-lureault.com 311456
 *
 * Une fenêtre Chrome s'ouvre, "Claude 🤖" rejoint ton salon, accepte tes
 * réglages, puis répond à chaque manche pendant 30 minutes : vraies options
 * au hasard, curseurs validés, petites réponses libres, et il dit oui aux
 * montées de palier comme aux changements de jeu que tu proposes.
 */
import { chromium } from 'playwright';

const [, , URL_ARG, CODE_ARG, NAME_ARG] = process.argv;
if (!URL_ARG || !/^\d{4,6}$/.test(CODE_ARG || '')) {
  console.error('Usage : node scripts/claude-player.mjs <url-du-jeu> <code-salon> [prenom]');
  console.error('Ex.   : node scripts/claude-player.mjs https://cpl.yoan-lureault.com 311456');
  process.exit(1);
}
const NAME = NAME_ARG || 'Claude 🤖';
const DUREE_MIN = 30;
const log = (...a) => console.log(new Date().toTimeString().slice(0, 8), '·', ...a);

// Ton Google Chrome si présent, sinon le Chromium de Playwright.
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: false });
  log('Google Chrome ouvert');
} catch {
  browser = await chromium.launch({ headless: false });
  log('Chrome introuvable — Chromium Playwright ouvert à la place');
}

const page = await (await browser.newContext({
  viewport: { width: 420, height: 860 },
})).newPage();

log(`Je rejoins le salon ${CODE_ARG} sur ${URL_ARG} …`);
await page.goto(URL_ARG, { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(1500);
await page.getByRole('button', { name: /Rejoindre/ }).first().click();
await page.waitForTimeout(500);
await page.locator('input').first().fill(NAME);
// Le genre ne change rien au jeu pour un robot : au hasard, comme le reste.
await page.getByRole('button', { name: Math.random() < 0.5 ? /Femme/ : /Homme/ }).click();
await page.locator('input').nth(1).fill(CODE_ARG);
await page.getByRole('button', { name: /^Rejoindre/ }).last().click();

try {
  await page.waitForURL('**/salon/**', { timeout: 15000 });
} catch {
  const etat = (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 200);
  console.error('Impossible de rejoindre — écran actuel :', etat);
  console.error('Vérifie que le salon est bien en attente et le code exact.');
  await browser.close();
  process.exit(1);
}
log('Salon rejoint ! J\'accepte tes réglages…');
await page.waitForTimeout(1000);
await page.getByRole('button', { name: /me va/ }).click().catch(() => {});

let chatted = false;
const t0 = Date.now();
while (Date.now() - t0 < DUREE_MIN * 60_000) {
  await page.waitForTimeout(1200 + Math.random() * 800);

  // Un bonjour dans le chat, une seule fois, dès qu'il existe.
  if (!chatted) {
    const chat = page.locator('input[placeholder*="crire un message"]');
    if (await chat.count()) {
      await chat.fill('Coucou, c\'est Claude 🤖 — bonne partie !').catch(() => {});
      await page.keyboard.press('Enter').catch(() => {});
      chatted = true;
      log('petit mot envoyé dans le chat');
    }
  }

  // Feuilles à trancher : montée de palier, proposition de changer de jeu.
  await page.getByRole('button', { name: /On monte|On y va/ }).first().click()
    .then(() => log('proposition acceptée'))
    .catch(() => {});

  // Choix de thème (duel / mix) : je prends au hasard.
  const dialog = page.locator('[role="dialog"] button, [role="alertdialog"] button');
  if (await page.getByText(/choisir le thème/i).count().catch(() => 0)) {
    const n = await dialog.count();
    if (n > 0) {
      await dialog.nth(Math.floor(Math.random() * n)).click().catch(() => {});
      log('thème choisi');
      continue;
    }
  }

  // Réponse libre (type C) : une vraie petite phrase, puis Valider.
  const textarea = page.locator('textarea').first();
  if (await textarea.isVisible().catch(() => false)) {
    await textarea.fill('Réponse de Claude 🤖 : ce que je préfère, c\'est jouer avec toi.').catch(() => {});
    await page.getByRole('button', { name: /Valider/ }).first().click().catch(() => {});
    log('réponse libre envoyée');
    await page.waitForTimeout(3500);
    continue;
  }

  // Options classiques : une au hasard parmi les visibles.
  const answers = page.locator('[class*="btn-answer"]:visible');
  const count = await answers.count().catch(() => 0);
  if (count > 0) {
    const pick = Math.floor(Math.random() * count);
    const label = (await answers.nth(pick).innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 42);
    await answers.nth(pick).click().catch(() => {});
    log('je réponds :', label || '(option)');
    await page.waitForTimeout(3500);
    continue;
  }

  // Curseur 1-10 : Valider tel quel.
  const valider = page.getByRole('button', { name: /Valider/ }).first();
  if (await valider.isVisible().catch(() => false)) {
    await valider.click().catch(() => {});
    log('curseur validé');
    await page.waitForTimeout(3500);
  }
}

log(`${DUREE_MIN} minutes de jeu — je te laisse la main. Merci pour la partie !`);
await browser.close();
