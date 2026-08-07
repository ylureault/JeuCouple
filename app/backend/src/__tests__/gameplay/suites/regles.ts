/**
 * Regles propres a chaque mode : ce qui distingue reellement un jeu de l'autre.
 * Chaque session joue de vraies manches et observe la mecanique annoncee.
 */
import type { Session } from '../harness/runner.js';
import { accord, desaccord, playRound } from '../harness/client.js';

// Themes disposant tous de questions de type E : le choix du gagnant peut donc
// etre honore sans repli sur un autre theme.
const THEMES_BINAIRES = ['couple', 'coquin', 'sexy', 'fantasmes'];

// ───────────────────────────────────────────────────────────── duel ─────────
const duel: Session = {
  id: 'regles/duel',
  group: 'mode duel',
  expected: 5,
  timeoutMs: 200_000,
  async run(t) {
    const party = await t.party({
      gameMode: 'duel',
      questionTypes: ['E'],
      categories: THEMES_BINAIRES,
      auto: false,
    });
    await party.accept();
    await party.start();

    // Desaccord : 0 point chacun, c'est donc le plus rapide qui l'emporte.
    const r1 = await playRound(party, { a1: accord, a2: desaccord, first: 1, gapMs: 80 });

    const choix = await party.host.wait('duel:choose-theme', { timeout: 15000, what: 'main rendue au gagnant' });
    t.ok(
      '[duel] le gagnant de la manche recoit la main pour choisir le theme',
      Array.isArray(choix.data.options) && choix.data.options.length > 0 && choix.data.timeoutSeconds > 0,
      `gagnant annonce=${r1.reveal.points1 > r1.reveal.points2 ? 1 : 2}, options=${JSON.stringify(choix.data.options?.map((o: any) => o.code))}`
    );

    const attente = await party.guest.wait('duel:awaiting-theme', { timeout: 8000 });
    t.ok(
      "[duel] l'autre joueur est informe qu'il attend le choix du gagnant",
      attente.data.chooserPlayerId === 1 && typeof attente.data.chooserName === 'string' && attente.data.chooserName.length > 0,
      `chooserPlayerId=${attente.data.chooserPlayerId}, chooserName="${attente.data.chooserName}"`
    );

    // Le joueur qui n'a PAS la main tente de choisir : le serveur doit l'ignorer.
    const vole = choix.data.options[0].code;
    party.guest.emit('duel:choose-theme', { category: vole });
    const silence = await party.host.silence('duel:theme-selected', 2500);
    t.ok(
      "[duel] un joueur qui n'a pas la main ne peut pas choisir le theme",
      silence,
      `le serveur a accepte un choix venant du joueur 2 (theme "${vole}")`
    );

    // Le gagnant choisit reellement.
    const vise = (choix.data.options.find((o: any) => o.code !== vole) ?? choix.data.options[0]).code;
    party.host.emit('duel:choose-theme', { category: vise });
    const selected = await party.host.wait('duel:theme-selected', { timeout: 8000 });
    const q2 = await party.host.wait('game:question', { timeout: 15000, what: 'manche du theme choisi' });
    t.ok(
      '[duel] la manche suivante provient bien du theme choisi par le gagnant',
      selected.data.category === vise && selected.data.autoPicked === false &&
        selected.data.chooserPlayerId === 1 && q2.data.question.category === vise,
      `theme choisi="${vise}", annonce="${selected.data.category}" (auto=${selected.data.autoPicked}), ` +
        `theme de la question suivante="${q2.data.question.category}"`
    );

    // Mode sans fin : deux manches de plus, toujours pas de resultat final.
    party.setAuto(true);
    const finQ2 = await party.host.answer(accord(q2.data.question));
    await party.guest.answer(accord(q2.data.question));
    await party.host.wait('game:reveal', { timeout: 15000 });
    await playRound(party, { a1: accord, a2: accord });
    const pasDeFin = await party.host.silence('game:finished', 1000);
    t.ok(
      '[duel] le duel ne se termine jamais de lui-meme (mode sans fin)',
      pasDeFin && finQ2.accepted === true,
      'un evenement game:finished est arrive alors que le duel est annonce sans limite'
    );
  },
};

// ────────────────────────────────────────────────────────── escalade ────────
const escalade: Session = {
  id: 'regles/escalade',
  group: 'mode escalade',
  expected: 5,
  timeoutMs: 220_000,
  async run(t) {
    const party = await t.party({ gameMode: 'escalade', questionTypes: ['E'], auto: false });
    await party.accept();
    await party.start();

    await playRound(party, { a1: accord, a2: accord });

    const pHost = await party.host.wait('escalade:palier', { timeout: 15000, what: 'proposition de palier' });
    const pGuest = await party.guest.wait('escalade:palier', { timeout: 8000 });
    t.ok(
      '[escalade] la montee de palier est proposee aux DEUX joueurs',
      pHost.data.palier === 1 && pGuest.data.palier === 1 &&
        pHost.data.category?.code === 'souvenirs' && pGuest.data.category?.code === 'souvenirs',
      `hote : palier ${pHost.data.palier} vers "${pHost.data.category?.code}", ` +
        `invite : palier ${pGuest.data.palier} vers "${pGuest.data.category?.code}"`
    );

    // Un seul refus suffit a rester ou l'on est.
    party.host.emit('escalade:palier-respond', { accept: false });
    const res1 = await party.host.wait('escalade:palier-result', { timeout: 8000 });
    t.ok(
      '[escalade] le refus d\'un seul joueur annule la montee',
      res1.data.accepted === false,
      `resultat annonce : ${JSON.stringify(res1.data)}`
    );

    const q2 = await party.host.wait('game:question', { timeout: 15000, what: 'manche apres refus' });
    t.ok(
      '[escalade] apres un refus, la manche suivante reste sur le theme du palier acquis',
      q2.data.question.category === 'couple',
      `theme servi : "${q2.data.question.category}" (attendu "couple", premier barreau de l'echelle)`
    );

    await party.host.answer(accord(q2.data.question));
    await party.guest.answer(accord(q2.data.question));
    await party.host.wait('game:reveal', { timeout: 15000 });

    // Nouvelle proposition : cette fois un seul joueur accepte.
    await party.host.wait('escalade:palier', { timeout: 15000, what: 'seconde proposition de palier' });
    await party.guest.wait('escalade:palier', { timeout: 5000 });
    party.guest.emit('escalade:palier-respond', { accept: true });
    const seul = await party.host.silence('escalade:palier-result', 3000);
    t.ok(
      "[escalade] l'accord d'un seul joueur ne suffit pas a monter d'un palier",
      seul,
      'le serveur a tranche la montee alors qu\'un seul joueur avait accepte'
    );

    party.host.emit('escalade:palier-respond', { accept: true });
    const res2 = await party.host.wait('escalade:palier-result', { timeout: 8000 });
    const q3 = await party.host.wait('game:question', { timeout: 15000, what: 'manche du palier suivant' });
    t.ok(
      "[escalade] l'accord des DEUX joueurs fait monter d'un palier et impose son theme",
      res2.data.accepted === true && q3.data.question.category === 'souvenirs',
      `accepte=${res2.data.accepted}, theme servi="${q3.data.question.category}" (attendu "souvenirs")`
    );
  },
};

// ───────────────────────────────────────────────────────── complices ────────
const complices: Session = {
  id: 'regles/complices',
  group: 'mode complices',
  expected: 3,
  timeoutMs: 200_000,
  async run(t) {
    const party = await t.party({ gameMode: 'complices', questionTypes: ['E'] });
    await party.accept();
    await party.start();

    const r1 = await playRound(party, { a1: accord, a2: accord });
    const r2 = await playRound(party, { a1: accord, a2: accord });
    t.ok(
      '[complices] chaque accord prolonge la serie',
      r1.reveal.correct === true && r1.reveal.streak1 === 1 &&
        r2.reveal.correct === true && r2.reveal.streak1 === 2,
      `manche 1 : accord=${r1.reveal.correct} serie=${r1.reveal.streak1} ; ` +
        `manche 2 : accord=${r2.reveal.correct} serie=${r2.reveal.streak1}`
    );

    const r3 = await playRound(party, { a1: accord, a2: desaccord });
    t.ok(
      '[complices] un desaccord casse la serie',
      r3.reveal.correct === false && r3.reveal.streak1 === 0 && r3.reveal.streak2 === 0,
      `accord=${r3.reveal.correct}, series=${r3.reveal.streak1}/${r3.reveal.streak2} (attendu 0/0)`
    );

    const r4 = await playRound(party, { a1: accord, a2: accord });
    t.ok(
      '[complices] la serie repart de zero apres le desaccord',
      r4.reveal.correct === true && r4.reveal.streak1 === 1,
      `serie apres reprise : ${r4.reveal.streak1} (attendu 1)`
    );
  },
};

const complicesFin: Session = {
  id: 'regles/complices-fin',
  group: 'mode complices',
  expected: 2,
  timeoutMs: 260_000,
  async run(t) {
    const party = await t.party({ gameMode: 'complices', questionTypes: ['E'] });
    await party.accept();
    await party.start();

    let dernier = 0;
    for (let i = 0; i < 10; i++) {
      const r = await playRound(party, { a1: accord, a2: accord });
      dernier = r.reveal.streak1;
    }
    const finHost = await party.host.wait('game:finished', { timeout: 20000, what: 'fin sur serie de 10' });
    const finGuest = await party.guest.wait('game:finished', { timeout: 5000 });

    t.ok(
      "[complices] dix accords d'affilee terminent la partie",
      dernier === 10 && !!finHost.data,
      `serie atteinte : ${dernier} (attendu 10)`
    );
    t.ok(
      '[complices] les deux joueurs recoivent le meme resultat final',
      finGuest.data.score1 === finHost.data.score1 &&
        finGuest.data.score2 === finHost.data.score2 &&
        Array.isArray(finHost.data.questionHistory) && finHost.data.questionHistory.length === 10,
      `hote=${finHost.data.score1}/${finHost.data.score2}, invite=${finGuest.data.score1}/${finGuest.data.score2}, ` +
        `historique=${finHost.data.questionHistory?.length} manches`
    );
  },
};

// ─────────────────────────────────────────────────────── mort subite ────────
const suddenDeath: Session = {
  id: 'regles/sudden_death',
  group: 'mode sudden_death',
  expected: 4,
  timeoutMs: 240_000,
  async run(t) {
    const party = await t.party({ gameMode: 'sudden_death', questionTypes: ['E'] });
    await party.accept();
    await party.start();

    // Manche 1 : desaccord => 0 point chacun, le plus rapide l'emporte.
    const r1 = await playRound(party, { a1: accord, a2: desaccord, first: 1, gapMs: 80 });
    t.ok(
      '[mort subite] a egalite de points, le plus rapide remporte la manche',
      r1.reveal.basePoints === 0 && r1.reveal.points1 > r1.reveal.points2,
      `base=${r1.reveal.basePoints}, points=${r1.reveal.points1}/${r1.reveal.points2}`
    );

    // Manche 2 : personne ne repond => manche nulle, aucune vie perdue.
    const r2 = await playRound(party, { a1: null, a2: null });
    t.ok(
      '[mort subite] une manche sans aucune reponse penalise les deux joueurs de 50 points',
      r2.reveal.points1 === -50 && r2.reveal.points2 === -50,
      `points : ${r2.reveal.points1}/${r2.reveal.points2} (attendu -50/-50)`
    );

    // Manche 3 : deuxieme victoire de l'hote. Si la manche nulle avait coute
    // une vie, la partie serait deja finie ici.
    await playRound(party, { a1: accord, a2: desaccord, first: 1, gapMs: 80 });
    let quatrieme = true;
    let r4: Awaited<ReturnType<typeof playRound>> | null = null;
    try {
      r4 = await playRound(party, { a1: accord, a2: desaccord, first: 1, gapMs: 80 });
    } catch {
      quatrieme = false;
    }
    t.ok(
      '[mort subite] une manche nulle ne coute aucune vie (la partie continue)',
      quatrieme,
      'la partie s\'est arretee apres 2 defaites et une manche nulle : la nulle a coute une vie'
    );

    const fin = await party.host.wait('game:finished', { timeout: 20000, what: 'fin sur 3 defaites' });
    t.ok(
      '[mort subite] la troisieme manche perdue termine la partie',
      !!r4 && !!fin.data && typeof fin.data.winner !== 'undefined',
      `resultat final : ${JSON.stringify({ score1: fin.data?.score1, score2: fin.data?.score2, winner: fin.data?.winner })}`
    );
  },
};

// ──────────────────────────────────────────────────────── a l'envers ────────
const inverse: Session = {
  id: 'regles/inverse',
  group: 'mode inverse',
  expected: 6,
  timeoutMs: 220_000,
  async run(t) {
    const party = await t.party({ gameMode: 'inverse', questionTypes: ['A', 'B'] });
    await party.accept();
    await party.start();

    await playRound(party, { a1: accord, a2: accord });

    const q2 = await party.host.wait('game:question', { timeout: 20000, what: 'manche inversee' });
    const inv = q2.data.question;
    t.ok(
      "[a l'envers] la manche affiche une reponse et demande de retrouver la question",
      inv.type === 'H' && /De quelle question cette réponse vient-elle/.test(inv.text),
      `type=${inv.type}, enonce="${String(inv.text).replace(/\n/g, ' ').slice(0, 90)}"`
    );
    t.ok(
      "[a l'envers] la manche propose 4 intitules de questions distincts",
      Array.isArray(inv.options) && inv.options.length === 4 && new Set(inv.options).size === 4,
      `options=${JSON.stringify(inv.options)}`
    );

    const r2 = await playRound(party, { a1: inv.options[0], a2: inv.options[0] });
    t.ok(
      "[a l'envers] la bonne reponse figure bien parmi les options proposees",
      typeof r2.reveal.correctAnswer === 'string' && inv.options.includes(r2.reveal.correctAnswer),
      `bonne reponse annoncee="${r2.reveal.correctAnswer}" ; options=${JSON.stringify(inv.options)}`
    );

    const q3 = await party.host.wait('game:question', { timeout: 20000, what: 'seconde manche inversee' });
    const inv3 = q3.data.question;
    const bonne = inv3.correct_answer;
    const mauvaise = (inv3.options as string[]).find((o) => o !== bonne)!;
    await party.host.answer(bonne);
    await party.guest.answer(mauvaise);
    const rev3 = await party.host.wait('game:reveal', { timeout: 15000 });
    t.ok(
      "[a l'envers] retrouver la bonne question rapporte 100 points de base",
      rev3.data.basePoints === 100 && rev3.data.points1 >= 100,
      `base=${rev3.data.basePoints}, points du joueur qui a trouve=${rev3.data.points1}`
    );
    t.ok(
      "[a l'envers] se tromper de question ne rapporte rien",
      rev3.data.points2 === 0,
      `points du joueur qui s'est trompe : ${rev3.data.points2} (attendu 0)`
    );

    // Fuite : la question porte deja sa bonne reponse quand elle est envoyee.
    t.bug(
      "[a l'envers] la bonne reponse n'est pas envoyee avec la question",
      typeof inv3.correct_answer !== 'string',
      "gameService.ts:1302 (sendQuestion) diffuse l'objet Question complet : le champ correct_answer " +
        "des questions de type H part vers les deux clients avant la reponse, la bonne reponse est lisible " +
        'dans la trame socket',
      `correct_answer recu = "${String(inv3.correct_answer).slice(0, 60)}"`
    );
  },
};

// ─────────────────────────────────────────────────────── envies express ─────
const envies: Session = {
  id: 'regles/envies',
  group: 'mode envies',
  expected: 4,
  timeoutMs: 200_000,
  async run(t) {
    const party = await t.party({ gameMode: 'envies', questionTypes: ['S'] });
    await party.accept();
    await party.start();

    await playRound(party, { a1: 'daccord', a2: 'daccord' });
    const r2 = await playRound(party, { a1: 'daccord', a2: 'pasdaccord' });
    t.ok(
      '[envies express] les manches proviennent du theme « Envies express »',
      r2.question.category === 'swipe' && r2.question.type === 'S',
      `theme="${r2.question.category}", type=${r2.question.type}`
    );
    t.ok(
      '[envies express] les deux glissements sont reveles et compares',
      r2.reveal.answer1 === 'daccord' && r2.reveal.answer2 === 'pasdaccord' && r2.reveal.correct === false,
      `reponses revelees : ${r2.reveal.answer1} / ${r2.reveal.answer2}, accord=${r2.reveal.correct}`
    );

    const r3 = await playRound(party, { a1: 'daccord', a2: 'daccord' });
    t.bug(
      '[envies express] aucun point n\'est compte dans ce mode sans score',
      r3.score.score1 === 0 && r3.score.score2 === 0,
      "le mode annonce « Aucun point, on compare juste vos envies » (gameModes.ts:250) mais le moteur " +
        'score les questions de type S comme un accord ordinaire (gameService.ts:2041) : le score monte',
      `score apres 3 manches : ${r3.score.score1}/${r3.score.score2}`
    );

    const pasDeFin = await party.host.silence('game:finished', 1000);
    t.ok(
      "[envies express] la partie ne s'arrete pas d'elle-meme apres quelques manches",
      pasDeFin,
      'la partie s\'est terminee avant les 200 manches annoncees'
    );
  },
};

// ───────────────────────────────────────────────────────── petits noms ──────
const petitsNoms: Session = {
  id: 'regles/petits_noms',
  group: 'mode petits_noms',
  expected: 3,
  timeoutMs: 220_000,
  async run(t) {
    const party = await t.party({ gameMode: 'petits_noms', questionTypes: ['C'] });
    await party.accept();
    await party.start();

    await playRound(party, { a1: accord, a2: accord });
    const r2 = await playRound(party, {
      a1: 'Mon petit ourson grognon du dimanche matin',
      a2: 'Ma boule de poils adorable et bavarde',
    });

    t.ok(
      '[petits noms] les manches proviennent du theme « Petits noms »',
      r2.question.category === 'petits_noms' && r2.question.type === 'C',
      `theme="${r2.question.category}", type=${r2.question.type}`
    );
    t.ok(
      '[petits noms] les deux surnoms sont reveles simultanement',
      r2.reveal.answer1 === 'Mon petit ourson grognon du dimanche matin' &&
        r2.reveal.answer2 === 'Ma boule de poils adorable et bavarde',
      `reveles : "${r2.reveal.answer1}" / "${r2.reveal.answer2}"`
    );
    t.bug(
      "[petits noms] aucun point n'est compte dans ce mode sans score",
      r2.score.score1 === 0 && r2.score.score2 === 0,
      "le mode annonce « Sans points : le seul enjeu est de faire rire l'autre » (gameModes.ts:265) mais " +
        'le moteur applique le bonus de reponse reflechie des questions de type C (gameService.ts:1508)',
      `score apres 2 manches : ${r2.score.score1}/${r2.score.score2}`
    );
  },
};

// ────────────────────────────────────────────────────────── mix total ───────
const mix: Session = {
  id: 'regles/mix',
  group: 'mode mix',
  expected: 3,
  timeoutMs: 220_000,
  async run(t) {
    const party = await t.party({
      gameMode: 'mix',
      questionTypes: ['E'],
      categories: ['couple'],   // doit etre efface par le mode
      auto: false,
    });

    const reglages = await party.guest.wait('room:settings', { timeout: 8000 });
    t.ok(
      '[mix total] la restriction de themes est effacee au profit de tous les themes',
      Array.isArray(reglages.data.categories) && reglages.data.categories.length === 0,
      `themes annonces au salon : ${JSON.stringify(reglages.data.categories)}`
    );

    await party.accept();
    await party.start();

    const duelEvents = () =>
      [...party.host.log, ...party.guest.log]
        .filter((e) => e.ev === 'duel:choose-theme' || e.ev === 'duel:awaiting-theme').length;

    for (let i = 0; i < t.mixDuelPeriod - 1; i++) {
      await playRound(party, { a1: accord, a2: desaccord, first: 1, gapMs: 60 });
    }
    // La manche suivante doit encore arriver sans passer par un choix de theme.
    await party.host.wait('game:question', { timeout: 20000, what: 'manche intermediaire' });
    t.ok(
      '[mix total] entre deux duels, les manches s\'enchainent sans choix de theme',
      duelEvents() === 0,
      `${duelEvents()} evenement(s) de duel recus avant la manche ${t.mixDuelPeriod}`
    );

    await playRound(party, { a1: accord, a2: desaccord, first: 1, gapMs: 60 });
    const main = await party.host.wait('duel:choose-theme', { timeout: 15000, what: 'declenchement du duel' })
      .then(() => true)
      .catch(async () => party.guest.log.some((e) => e.ev === 'duel:choose-theme'));
    t.ok(
      `[mix total] la mecanique du duel se declenche toutes les ${t.mixDuelPeriod} manches`,
      main && duelEvents() >= 1,
      `${duelEvents()} evenement(s) de duel apres ${t.mixDuelPeriod} manches jouees`
    );
  },
};

// ──────────────────────────────────────────────────────── partie classique ──
const classique: Session = {
  id: 'regles/classic',
  group: 'mode classic',
  expected: 3,
  timeoutMs: 220_000,
  async run(t) {
    const NB = 5;
    const party = await t.party({ gameMode: 'classic', questionTypes: ['E'], questionCount: NB });
    await party.accept();
    await party.start();

    let somme1 = 0;
    let somme2 = 0;
    for (let i = 0; i < NB; i++) {
      const r = await playRound(party, { a1: accord, a2: i % 2 === 0 ? accord : desaccord });
      somme1 += r.reveal.points1;
      somme2 += r.reveal.points2;
    }

    const fin = await party.host.wait('game:finished', { timeout: 20000, what: 'resultat final' });
    t.ok(
      '[classique] la partie s\'arrete apres le nombre de questions demande',
      fin.data.totalQuestions === NB,
      `totalQuestions=${fin.data.totalQuestions} (attendu ${NB})`
    );
    t.ok(
      '[classique] le resultat final annonce scores, vainqueur et historique complet',
      Array.isArray(fin.data.questionHistory) && fin.data.questionHistory.length === NB &&
        [1, 2, 'tie'].includes(fin.data.winner) &&
        Array.isArray(fin.data.categoryScores) && fin.data.categoryScores.length > 0 &&
        typeof fin.data.maxStreak1 === 'number' && typeof fin.data.perfectMatches === 'number',
      `historique=${fin.data.questionHistory?.length}, vainqueur=${fin.data.winner}, ` +
        `themes notes=${fin.data.categoryScores?.length}, serie max=${fin.data.maxStreak1}/${fin.data.maxStreak2}`
    );
    t.ok(
      '[classique] le score final est la somme des points de chaque manche',
      fin.data.score1 === somme1 && fin.data.score2 === somme2,
      `final=${fin.data.score1}/${fin.data.score2}, somme des manches=${somme1}/${somme2}`
    );
  },
};

// ─────────────────────────────────────────────────────── quiz express ───────
const QUIZ_ANSWER_SECONDS = 12;

const quizExpress: Session = {
  id: 'regles/quiz_express',
  group: 'mode quiz_express',
  expected: 4,
  timeoutMs: 200_000,
  async run(t) {
    const NB = 5;
    // On demande volontairement un perimetre absurde : le mode doit l'ecraser.
    const party = await t.party({
      gameMode: 'quiz_express',
      categories: ['petits_noms'],
      questionTypes: ['C'],
      questionCount: NB,
    });
    const reglages = await party.guest.wait('room:settings', { timeout: 8000 });
    await party.accept();
    await party.start();

    const r1 = await playRound(party, { a1: accord, a2: accord });
    t.ok(
      '[Quiz Express] le mode impose la culture generale en QCM, quels que soient les reglages demandes',
      r1.question.category === 'culture' && r1.question.type === 'H' &&
        reglages.data.categories.length === 1 && reglages.data.categories[0].code === 'culture',
      `question servie : theme="${r1.question.category}", type=${r1.question.type} ; ` +
        `themes annonces au salon : ${JSON.stringify(reglages.data.categories.map((c: any) => c.code))}`
    );
    t.ok(
      `[Quiz Express] le temps de reponse est plafonne a ${QUIZ_ANSWER_SECONDS} s`,
      r1.question.timer <= QUIZ_ANSWER_SECONDS,
      `chrono annonce : ${r1.question.timer} s`
    );

    // Chacun marque ses propres points : bonne reponse d'un cote, erreur de l'autre.
    const r2 = await playRound(party, { a1: accord, a2: desaccord });
    t.ok(
      '[Quiz Express] chacun marque ses propres points',
      r2.reveal.points1 >= 100 && r2.reveal.points2 === 0 &&
        r2.reveal.correctAnswer === r2.question.correct_answer,
      `points=${r2.reveal.points1}/${r2.reveal.points2}, bonne reponse annoncee="${r2.reveal.correctAnswer}"`
    );

    for (let i = 2; i < NB; i++) await playRound(party, { a1: accord, a2: accord });
    const fin = await party.host.wait('game:finished', { timeout: 20000, what: 'fin du quiz' });
    t.ok(
      '[Quiz Express] la partie s\'arrete au bout du quiz',
      fin.data.totalQuestions === NB && Array.isArray(fin.data.questionHistory) &&
        fin.data.questionHistory.length === NB,
      `totalQuestions=${fin.data.totalQuestions} (attendu ${NB}), historique=${fin.data.questionHistory?.length}`
    );
  },
};

export const reglesSessions: Session[] = [
  duel, escalade, complices, complicesFin, suddenDeath, inverse, envies, petitsNoms, mix, classique, quizExpress,
];
