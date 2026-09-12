/* Auto Évasion — le jeu.

   Le serveur (Flask) fournit les 90 niveaux (/api/niveaux), le garage
   (/api/voitures) et le tableau des scores (/api/scores). Ce fichier ne
   contient AUCUNE regle de difficulte : il joue ce qu'on lui envoie.

   Chaque niveau porte une graine : les obstacles en sont tires avec un
   generateur deterministe, donc le niveau 37 est le meme pour tout le monde.

   Ce qui survit a un rechargement vit dans localStorage : le niveau atteint,
   l'auto choisie, le pseudo, le son. */

(function () {
  'use strict';

  // ---------------------------------------------------------------------
  //  Constantes de jeu
  // ---------------------------------------------------------------------

  const LARGEUR = 960;
  const HAUTEUR = 540;

  // Le joueur ne bouge pas horizontalement : c'est la route qui defile.
  const JOUEUR_X = 150;
  const AUTO_L = 64;       // longueur d'une auto (le long de la route)
  const AUTO_H = 36;       // largeur d'une auto (en travers de la route)
  const CAMION_L = 150;

  const VOIE_H = 72;       // hauteur d'une voie
  const ROUTE_CENTRE = 330; // ordonnee du centre de la route

  // Physique du saut. ⚠️ Ces trois nombres decident de la jouabilite : le
  // temps passe au-dessus de SEUIL_SAUT doit couvrir la traversee d'un camion
  // a la vitesse maximale (voir tests/test_niveaux.py pour les bornes).
  const GRAVITE = 9.2;      // unites de hauteur / s²
  const IMPULSION = 3.4;    // unites de hauteur / s
  const SEUIL_SAUT = 0.32;  // hauteur a partir de laquelle on passe par-dessus

  const POINTS_OBSTACLE = 10;
  const POINTS_PIECE = 50;
  const POINTS_NIVEAU = 100;

  const CLE_SAUVEGARDE = 'auto-evasion-v1';

  // ---------------------------------------------------------------------
  //  Outils
  // ---------------------------------------------------------------------

  /** Generateur deterministe (mulberry32). Meme graine, memes obstacles. */
  function generateur(graine) {
    let a = graine >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function borner(v, min, max) { return Math.max(min, Math.min(max, v)); }

  function $(id) { return document.getElementById(id); }

  function lireSauvegarde() {
    try {
      const brut = localStorage.getItem(CLE_SAUVEGARDE);
      if (brut) return JSON.parse(brut);
    } catch (e) { /* stockage indisponible : on joue quand meme */ }
    return {};
  }

  function ecrireSauvegarde(donnees) {
    try { localStorage.setItem(CLE_SAUVEGARDE, JSON.stringify(donnees)); } catch (e) { /* idem */ }
  }

  // ---------------------------------------------------------------------
  //  Sons — synthetises, aucun fichier
  // ---------------------------------------------------------------------

  const Son = {
    ctx: null,
    muet: false,

    reveiller() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    },

    note(freq, duree, type, volume, depart) {
      if (this.muet || !this.ctx) return;
      const t0 = this.ctx.currentTime + (depart || 0);
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type || 'square';
      osc.frequency.setValueAtTime(freq, t0);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(volume || 0.15, t0 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duree);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start(t0);
      osc.stop(t0 + duree + 0.02);
    },

    saut() {
      if (this.muet || !this.ctx) return;
      const t0 = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220, t0);
      osc.frequency.exponentialRampToValueAtTime(660, t0 + 0.15);
      gain.gain.setValueAtTime(0.12, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
      osc.connect(gain).connect(this.ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.22);
    },

    piece() { this.note(1320, 0.12, 'sine', 0.12); this.note(1760, 0.18, 'sine', 0.1, 0.07); },
    bouclier() { [440, 554, 659, 880].forEach((f, i) => this.note(f, 0.25, 'triangle', 0.1, i * 0.06)); },
    niveau() { [523, 659, 784, 1047].forEach((f, i) => this.note(f, 0.3, 'square', 0.08, i * 0.1)); },

    choc() {
      if (this.muet || !this.ctx) return;
      const t0 = this.ctx.currentTime;
      const taille = Math.floor(this.ctx.sampleRate * 0.4);
      const tampon = this.ctx.createBuffer(1, taille, this.ctx.sampleRate);
      const donnees = tampon.getChannelData(0);
      for (let i = 0; i < taille; i++) donnees[i] = (Math.random() * 2 - 1) * (1 - i / taille);
      const source = this.ctx.createBufferSource();
      source.buffer = tampon;
      const filtre = this.ctx.createBiquadFilter();
      filtre.type = 'lowpass';
      filtre.frequency.setValueAtTime(1200, t0);
      filtre.frequency.exponentialRampToValueAtTime(120, t0 + 0.4);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.35, t0);
      source.connect(filtre).connect(gain).connect(this.ctx.destination);
      source.start(t0);
    },
  };

  // ---------------------------------------------------------------------
  //  Dessin des autos (vue de dessus, avant vers la droite)
  // ---------------------------------------------------------------------

  function assombrir(hex, facteur) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.round(((n >> 16) & 255) * facteur);
    const g = Math.round(((n >> 8) & 255) * facteur);
    const b = Math.round((n & 255) * facteur);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  function rectArrondi(ctx, x, y, l, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + l - r, y);
    ctx.quadraticCurveTo(x + l, y, x + l, y + r);
    ctx.lineTo(x + l, y + h - r);
    ctx.quadraticCurveTo(x + l, y + h, x + l - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  /**
   * Dessine une auto centree en (cx, cy), de longueur l et largeur h.
   * `sens` = 1 : avant a droite ; -1 : avant a gauche.
   */
  function dessinerAuto(ctx, cx, cy, l, h, couleur, accent, forme, sens) {
    ctx.save();
    ctx.translate(cx, cy);
    if (sens < 0) ctx.scale(-1, 1);

    const x = -l / 2;
    const y = -h / 2;

    // Roues (elles depassent un peu du corps)
    ctx.fillStyle = '#15171a';
    const rl = l * 0.16, rh = h * 0.22;
    [[x + l * 0.16, y - rh * 0.35], [x + l * 0.68, y - rh * 0.35],
     [x + l * 0.16, y + h - rh * 0.65], [x + l * 0.68, y + h - rh * 0.65]].forEach(function (p) {
      rectArrondi(ctx, p[0], p[1], rl, rh, 3);
      ctx.fill();
    });

    // Carrosserie
    const sombre = assombrir(couleur, 0.72);
    ctx.fillStyle = couleur;
    if (forme === 'fusee') {
      ctx.beginPath();
      ctx.moveTo(x + 6, y + 4);
      ctx.lineTo(x + l * 0.7, y);
      ctx.quadraticCurveTo(x + l + 4, y + h / 2, x + l * 0.7, y + h);
      ctx.lineTo(x + 6, y + h - 4);
      ctx.quadraticCurveTo(x, y + h / 2, x + 6, y + 4);
      ctx.closePath();
      ctx.fill();
    } else {
      rectArrondi(ctx, x, y + 2, l, h - 4, forme === 'muscle' ? 5 : 9);
      ctx.fill();
    }

    // Bande centrale (muscle) ou liseré (autres)
    if (forme === 'muscle') {
      ctx.fillStyle = accent;
      ctx.fillRect(x + 4, y + h / 2 - 3, l - 8, 6);
    }

    // Toit
    ctx.fillStyle = sombre;
    const toitX = forme === 'sport' ? x + l * 0.30 : x + l * 0.34;
    const toitL = forme === 'sport' ? l * 0.40 : l * 0.36;
    rectArrondi(ctx, toitX, y + 6, toitL, h - 12, 5);
    ctx.fill();

    // Pare-brise (avant) et lunette (arriere)
    ctx.fillStyle = '#bde0fe';
    rectArrondi(ctx, toitX + toitL - 2, y + 7, l * 0.10, h - 14, 3);
    ctx.fill();
    ctx.fillStyle = '#9ec5e8';
    rectArrondi(ctx, toitX - l * 0.08, y + 8, l * 0.08, h - 16, 3);
    ctx.fill();

    // Aileron (sport)
    if (forme === 'sport') {
      ctx.fillStyle = accent;
      ctx.fillRect(x + 3, y - 1, 5, h + 2);
    }

    // Phares et feux
    ctx.fillStyle = '#fff3b0';
    ctx.fillRect(x + l - 5, y + 5, 4, 6);
    ctx.fillRect(x + l - 5, y + h - 11, 4, 6);
    ctx.fillStyle = '#ff4d4d';
    ctx.fillRect(x + 1, y + 5, 3, 6);
    ctx.fillRect(x + 1, y + h - 11, 3, 6);

    ctx.restore();
  }

  function dessinerCamion(ctx, cx, cy, l, h, couleur, sens) {
    ctx.save();
    ctx.translate(cx, cy);
    if (sens < 0) ctx.scale(-1, 1);
    const x = -l / 2, y = -h / 2;

    ctx.fillStyle = '#15171a';
    [0.08, 0.22, 0.62, 0.84].forEach(function (f) {
      rectArrondi(ctx, x + l * f, y - 4, l * 0.09, 9, 3); ctx.fill();
      rectArrondi(ctx, x + l * f, y + h - 5, l * 0.09, 9, 3); ctx.fill();
    });

    // Remorque
    ctx.fillStyle = '#d9d9d9';
    rectArrondi(ctx, x, y + 1, l * 0.72, h - 2, 4);
    ctx.fill();
    ctx.strokeStyle = '#a9a9a9';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 6, y + 6, l * 0.72 - 12, h - 12);

    // Cabine
    ctx.fillStyle = couleur;
    rectArrondi(ctx, x + l * 0.74, y + 3, l * 0.26, h - 6, 6);
    ctx.fill();
    ctx.fillStyle = '#bde0fe';
    rectArrondi(ctx, x + l * 0.90, y + 6, l * 0.07, h - 12, 3);
    ctx.fill();
    ctx.fillStyle = '#fff3b0';
    ctx.fillRect(x + l - 5, y + 5, 4, 6);
    ctx.fillRect(x + l - 5, y + h - 11, 4, 6);

    ctx.restore();
  }

  function dessinerOmbre(ctx, cx, cy, l, h, hauteur) {
    ctx.save();
    ctx.globalAlpha = 0.28 * Math.max(0.35, 1 - hauteur * 0.5);
    ctx.fillStyle = '#000';
    ctx.beginPath();
    const f = 1 - hauteur * 0.25;
    ctx.ellipse(cx, cy + h * 0.45, (l / 2) * f, (h / 2) * 0.9 * f, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ---------------------------------------------------------------------
  //  Le jeu
  // ---------------------------------------------------------------------

  const racine = $('jeu');
  const toile = $('toile');
  const ctx = toile.getContext('2d');

  const NB_NIVEAUX = parseInt(racine.dataset.nbNiveaux, 10) || 90;

  const ui = {
    hudAuto: $('hud-auto'), hudRarete: $('hud-rarete'), hudBouclier: $('hud-bouclier'),
    hudPoints: $('hud-points'), hudNiveau: $('hud-niveau'), hudProgres: $('hud-progres'),
    accueil: $('voile-accueil'), niveau: $('voile-niveau'), fin: $('voile-fin'),
    scores: $('voile-scores'), pause: $('voile-pause'),
    garage: $('garage'), garageLegende: $('garage-legende'),
    boutonJouer: $('bouton-jouer'), boutonScores: $('bouton-scores'),
    boutonSuivant: $('bouton-suivant'), boutonGarage: $('bouton-garage'),
    boutonRejouer: $('bouton-rejouer'), boutonGarageFin: $('bouton-garage-fin'),
    boutonFermerScores: $('bouton-fermer-scores'), boutonReprendre: $('bouton-reprendre'),
    boutonAbandonner: $('bouton-abandonner'), boutonPause: $('bouton-pause'),
    niveauTitre: $('niveau-titre'), niveauMessage: $('niveau-message'),
    finMessage: $('fin-message'), scoreForm: $('score-form'), pseudo: $('pseudo'),
    scoreEtat: $('score-etat'), listeScores: $('liste-scores'),
  };

  const jeu = {
    etat: 'chargement',      // chargement | accueil | jeu | pause | niveau | fin | scores
    niveaux: [],
    voitures: [],
    raretes: {},
    sauvegarde: lireSauvegarde(),

    // Partie en cours
    niveauCourant: 1,
    niveauDef: null,
    rng: null,
    points: 0,
    pointsNiveau: 0,
    vitesse: 0,
    distance: 0,
    prochaineDistance: 0,
    obstaclesLances: 0,
    obstaclesPasses: 0,
    ligneArrivee: null,     // x de la ligne d'arrivee quand tout est lance
    obstacles: [],
    bonus: [],
    particules: [],
    dernierMur: -1,

    joueur: {
      voie: 0, cibleVoie: 0, y: ROUTE_CENTRE,
      hauteur: 0, vitesseV: 0, auSol: true,
      bouclier: false, invincible: 0,
    },

    voiture: null,
    dernierTemps: 0,
    secousse: 0,
  };

  // --- Geometrie des voies -------------------------------------------------

  function nbVoies() { return jeu.niveauDef ? jeu.niveauDef.voies : 1; }

  function yDeVoie(voie) {
    const n = nbVoies();
    return ROUTE_CENTRE + (voie - (n - 1) / 2) * VOIE_H;
  }

  function routeHaut() { return ROUTE_CENTRE - (nbVoies() * VOIE_H) / 2 - 8; }
  function routeBas() { return ROUTE_CENTRE + (nbVoies() * VOIE_H) / 2 + 8; }

  // --- Cycle de vie d'un niveau ---------------------------------------------

  function voitureChoisie() {
    const slug = jeu.sauvegarde.voiture;
    return jeu.voitures.find(function (v) { return v.slug === slug; }) || jeu.voitures[0];
  }

  function commencerNiveau(numero) {
    const def = jeu.niveaux[numero - 1];
    jeu.niveauCourant = numero;
    jeu.niveauDef = def;
    jeu.rng = generateur(def.graine);
    jeu.vitesse = def.vitesse;
    jeu.distance = 0;
    jeu.prochaineDistance = 420; // un premier obstacle pas trop tot
    jeu.obstaclesLances = 0;
    jeu.obstaclesPasses = 0;
    jeu.pointsNiveau = 0;
    jeu.ligneArrivee = null;
    jeu.obstacles = [];
    jeu.bonus = [];
    jeu.particules = [];
    jeu.dernierMur = -1;

    const j = jeu.joueur;
    j.voie = Math.floor(def.voies / 2);
    j.cibleVoie = j.voie;
    j.y = yDeVoie(j.voie);
    j.hauteur = 0;
    j.vitesseV = 0;
    j.auSol = true;
    j.invincible = 0;
    // Le bouclier survit d'un niveau a l'autre : c'est une recompense.

    jeu.voiture = voitureChoisie();
    jeu.etat = 'jeu';
    montrerVoile(null);
    ui.boutonPause.hidden = false;
    majHud();
  }

  function nouvellePartie() {
    jeu.points = 0;
    jeu.joueur.bouclier = false;
    const depart = borner(jeu.sauvegarde.niveauDepart || 1, 1, jeu.sauvegarde.niveauMax || 1);
    commencerNiveau(depart);
  }

  function terminerNiveau() {
    Son.niveau();
    jeu.points += POINTS_NIVEAU * jeu.niveauCourant;
    jeu.etat = 'niveau';
    ui.boutonPause.hidden = true;

    const suivant = jeu.niveauCourant + 1;
    const max = jeu.sauvegarde.niveauMax || 1;
    const nouvelles = [];
    if (suivant > max && suivant <= NB_NIVEAUX) {
      jeu.sauvegarde.niveauMax = suivant;
      jeu.voitures.forEach(function (v) {
        if (v.niveau_requis === suivant) nouvelles.push(v);
      });
    }
    jeu.sauvegarde.niveauDepart = Math.min(suivant, NB_NIVEAUX);
    ecrireSauvegarde(jeu.sauvegarde);

    if (jeu.niveauCourant >= NB_NIVEAUX) {
      ui.niveauTitre.textContent = 'Champion!';
      ui.niveauMessage.textContent = 'Les ' + NB_NIVEAUX + ' niveaux sont derrière toi. ' +
        jeu.points.toLocaleString('fr-CA') + ' points!';
      ui.boutonSuivant.textContent = 'Recommencer au niveau 1';
    } else {
      ui.niveauTitre.textContent = 'Niveau ' + jeu.niveauCourant + ' terminé!';
      let message = '+' + (POINTS_NIVEAU * jeu.niveauCourant) + ' points · total ' +
        jeu.points.toLocaleString('fr-CA') + '.';
      if (nouvelles.length) {
        message += ' 🎉 Nouvelle auto débloquée : ' + nouvelles.map(function (v) {
          return v.nom + ' (' + jeu.raretes[v.rarete] + ')';
        }).join(', ') + '!';
      } else if (jeu.niveaux[suivant - 1] && jeu.niveaux[suivant - 1].voies > jeu.niveauDef.voies) {
        message += ' La route s’élargit : ' + jeu.niveaux[suivant - 1].voies + ' voies!';
      }
      ui.niveauMessage.textContent = message;
      ui.boutonSuivant.textContent = 'Niveau ' + suivant;
    }
    montrerVoile(ui.niveau);
  }

  function accident() {
    Son.choc();
    jeu.secousse = 0.5;
    jeu.etat = 'fin';
    ui.boutonPause.hidden = true;
    for (let i = 0; i < 26; i++) {
      jeu.particules.push({
        x: JOUEUR_X + AUTO_L / 2, y: jeu.joueur.y,
        vx: (Math.random() - 0.3) * 420, vy: (Math.random() - 0.5) * 320,
        vie: 0.6 + Math.random() * 0.5, taille: 3 + Math.random() * 5,
        couleur: Math.random() < 0.5 ? jeu.voiture.couleur : '#333',
      });
    }
    ui.finMessage.textContent = 'Niveau ' + jeu.niveauCourant + ' · ' +
      jeu.points.toLocaleString('fr-CA') + ' points · ' +
      jeu.obstaclesPasses + ' / ' + jeu.niveauDef.obstacles + ' obstacles.';
    ui.scoreForm.hidden = false;
    ui.scoreEtat.textContent = '';
    ui.pseudo.value = jeu.sauvegarde.pseudo || '';
    // Le voile arrive apres l'explosion, pour la voir.
    setTimeout(function () { if (jeu.etat === 'fin') montrerVoile(ui.fin); }, 700);
  }

  // --- Boucle -----------------------------------------------------------------

  function sauter() {
    const j = jeu.joueur;
    if (jeu.etat !== 'jeu' || !j.auSol) return;
    j.auSol = false;
    j.vitesseV = IMPULSION;
    Son.saut();
    for (let i = 0; i < 5; i++) {
      jeu.particules.push({
        x: JOUEUR_X + 6, y: j.y + AUTO_H * 0.4, vx: -80 - Math.random() * 80, vy: (Math.random() - 0.5) * 40,
        vie: 0.35, taille: 4 + Math.random() * 3, couleur: 'rgba(255,255,255,0.7)',
      });
    }
  }

  function changerVoie(delta) {
    if (jeu.etat !== 'jeu') return;
    const j = jeu.joueur;
    j.cibleVoie = borner(j.cibleVoie + delta, 0, nbVoies() - 1);
  }

  function lancerObstacles() {
    const def = jeu.niveauDef;
    const n = def.voies;
    const x = LARGEUR + 80;
    const rng = jeu.rng;

    const mur = n > 1 && rng() < def.proba_mur && jeu.obstaclesLances - jeu.dernierMur > 2;
    if (mur) {
      jeu.dernierMur = jeu.obstaclesLances;
      for (let v = 0; v < n; v++) {
        jeu.obstacles.push(creerObstacle(x, v, rng() < def.proba_camion * 0.5));
      }
    } else {
      const voie = Math.floor(rng() * n);
      jeu.obstacles.push(creerObstacle(x, voie, rng() < def.proba_camion));
      // Un deuxieme, sur une autre voie, un peu decale : la voie libre existe
      // toujours, mais il faut la voir.
      if (n > 2 && rng() < 0.35) {
        const autre = (voie + 1 + Math.floor(rng() * (n - 1))) % n;
        jeu.obstacles.push(creerObstacle(x + 120 + rng() * 120, autre, false));
      }
    }
    jeu.obstaclesLances += 1;

    // Bonus dans le creux qui suit.
    const ecart = def.ecart * (0.85 + rng() * 0.5);
    if (rng() < def.proba_bouclier && !jeu.joueur.bouclier) {
      jeu.bonus.push({ type: 'bouclier', x: x + ecart * 0.5, voie: Math.floor(rng() * n), haut: false, pris: false });
    } else if (rng() < def.proba_piece) {
      const voie = Math.floor(rng() * n);
      const haut = rng() < 0.4;
      const nb = 1 + Math.floor(rng() * 3);
      for (let i = 0; i < nb; i++) {
        jeu.bonus.push({ type: 'piece', x: x + ecart * 0.35 + i * 34, voie: voie, haut: haut, pris: false });
      }
    }

    jeu.prochaineDistance = jeu.distance + ecart + (mur ? 60 : 0);
  }

  function creerObstacle(x, voie, camion) {
    const teintes = ['#8d99ae', '#457b9d', '#6d597a', '#b56576', '#e0e1dd', '#355070', '#3d405b'];
    return {
      x: x, voie: voie, camion: camion,
      l: camion ? CAMION_L : AUTO_L, h: camion ? AUTO_H + 6 : AUTO_H,
      couleur: teintes[Math.floor(jeu.rng() * teintes.length)],
      forme: ['berline', 'sport', 'muscle'][Math.floor(jeu.rng() * 3)],
      passe: false,
      voieY: function () { return yDeVoie(this.voie); },
    };
  }

  function majJeu(dt) {
    const j = jeu.joueur;
    const def = jeu.niveauDef;

    // Defilement
    const pas = jeu.vitesse * dt;
    jeu.distance += pas;

    // Lancements
    if (jeu.obstaclesLances < def.obstacles) {
      if (jeu.distance >= jeu.prochaineDistance) lancerObstacles();
    } else if (jeu.ligneArrivee === null) {
      const dernier = jeu.obstacles.reduce(function (m, o) { return Math.max(m, o.x + o.l); }, LARGEUR);
      jeu.ligneArrivee = dernier + 260;
    }

    // Saut
    if (!j.auSol) {
      j.vitesseV -= GRAVITE * dt;
      j.hauteur += j.vitesseV * dt;
      if (j.hauteur <= 0) {
        j.hauteur = 0;
        j.vitesseV = 0;
        j.auSol = true;
        for (let i = 0; i < 6; i++) {
          jeu.particules.push({
            x: JOUEUR_X + Math.random() * AUTO_L, y: j.y + AUTO_H * 0.45, vx: -60 - Math.random() * 60,
            vy: (Math.random() - 0.5) * 60, vie: 0.3, taille: 3 + Math.random() * 3, couleur: 'rgba(255,255,255,0.6)',
          });
        }
      }
    }

    // Changement de voie (glisse en douceur)
    const cibleY = yDeVoie(j.cibleVoie);
    const dy = cibleY - j.y;
    j.y += dy * Math.min(1, dt * 14);
    if (Math.abs(dy) < 1) { j.y = cibleY; j.voie = j.cibleVoie; }
    if (j.invincible > 0) j.invincible -= dt;

    // Obstacles
    const jx1 = JOUEUR_X + 6, jx2 = JOUEUR_X + AUTO_L - 6;
    for (let i = jeu.obstacles.length - 1; i >= 0; i--) {
      const o = jeu.obstacles[i];
      o.x -= pas;
      if (!o.passe && o.x + o.l < JOUEUR_X) {
        o.passe = true;
        jeu.obstaclesPasses += 1;
        jeu.points += POINTS_OBSTACLE;
        jeu.pointsNiveau += POINTS_OBSTACLE;
      }
      if (o.x + o.l < -200) { jeu.obstacles.splice(i, 1); continue; }

      const memeVoie = Math.abs(o.voieY() - j.y) < VOIE_H * 0.55;
      const chevauche = o.x < jx2 && o.x + o.l > jx1;
      if (memeVoie && chevauche && j.hauteur < SEUIL_SAUT && j.invincible <= 0) {
        if (j.bouclier) {
          j.bouclier = false;
          j.invincible = 1.2;
          jeu.secousse = 0.25;
          Son.note(180, 0.25, 'sawtooth', 0.15);
          jeu.obstacles.splice(i, 1);
          jeu.obstaclesPasses += 1;
          majHud();
          continue;
        }
        accident();
        return;
      }
    }

    // Bonus
    for (let i = jeu.bonus.length - 1; i >= 0; i--) {
      const b = jeu.bonus[i];
      b.x -= pas;
      if (b.x < -40) { jeu.bonus.splice(i, 1); continue; }
      const memeVoie = Math.abs(yDeVoie(b.voie) - j.y) < VOIE_H * 0.5;
      const chevauche = b.x > jx1 - 10 && b.x < jx2 + 10;
      const bonneHauteur = b.haut ? j.hauteur > SEUIL_SAUT : j.hauteur < 0.6;
      if (memeVoie && chevauche && bonneHauteur) {
        jeu.bonus.splice(i, 1);
        if (b.type === 'piece') {
          jeu.points += POINTS_PIECE;
          jeu.pointsNiveau += POINTS_PIECE;
          Son.piece();
        } else {
          j.bouclier = true;
          Son.bouclier();
        }
      }
    }

    // Ligne d'arrivee
    if (jeu.ligneArrivee !== null) {
      jeu.ligneArrivee -= pas;
      if (jeu.ligneArrivee < JOUEUR_X) { terminerNiveau(); return; }
    }

    majHud();
  }

  function majParticules(dt) {
    for (let i = jeu.particules.length - 1; i >= 0; i--) {
      const p = jeu.particules[i];
      p.vie -= dt;
      if (p.vie <= 0) { jeu.particules.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 300 * dt;
    }
    if (jeu.secousse > 0) jeu.secousse -= dt;
  }

  // --- Rendu -------------------------------------------------------------------

  function dessinerDecor() {
    // Herbe
    ctx.fillStyle = '#3f9b47';
    ctx.fillRect(0, 0, LARGEUR, HAUTEUR);
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    const decalage = -(jeu.distance % 120);
    for (let x = decalage; x < LARGEUR; x += 120) {
      ctx.fillRect(x, 0, 60, HAUTEUR);
    }

    // Quelques buissons
    ctx.fillStyle = '#2f7a37';
    const decalB = -(jeu.distance * 0.6 % 260);
    for (let x = decalB - 40; x < LARGEUR + 40; x += 260) {
      ctx.beginPath(); ctx.ellipse(x, 90, 26, 16, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x + 130, 470, 30, 18, 0, 0, Math.PI * 2); ctx.fill();
    }

    // Route
    const haut = routeHaut(), bas = routeBas();
    ctx.fillStyle = '#2b2f36';
    ctx.fillRect(0, haut, LARGEUR, bas - haut);
    ctx.fillStyle = '#f1f1f1';
    ctx.fillRect(0, haut, LARGEUR, 4);
    ctx.fillRect(0, bas - 4, LARGEUR, 4);

    // Pointilles entre les voies
    const n = nbVoies();
    ctx.fillStyle = '#e9d8a6';
    const decalP = -(jeu.distance % 60);
    for (let v = 1; v < n; v++) {
      const y = haut + 8 + v * VOIE_H - 2;
      for (let x = decalP; x < LARGEUR; x += 60) ctx.fillRect(x, y, 30, 4);
    }

    // Ligne d'arrivee (damier)
    if (jeu.ligneArrivee !== null && jeu.ligneArrivee < LARGEUR + 40) {
      const x = jeu.ligneArrivee;
      for (let yy = haut; yy < bas; yy += 12) {
        for (let c = 0; c < 2; c++) {
          ctx.fillStyle = ((yy / 12 + c) % 2 === 0) ? '#111' : '#fff';
          ctx.fillRect(x + c * 12, yy, 12, 12);
        }
      }
    }
  }

  function dessinerBonus() {
    jeu.bonus.forEach(function (b) {
      const y = yDeVoie(b.voie);
      const eleve = b.haut ? 26 : 0;
      if (b.haut) dessinerOmbre(ctx, b.x, y, 24, 24, 0.8);
      if (b.type === 'piece') {
        ctx.fillStyle = '#ffb703';
        ctx.beginPath(); ctx.arc(b.x, y - eleve, 11, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fb8500';
        ctx.beginPath(); ctx.arc(b.x, y - eleve, 7, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffe066';
        ctx.fillRect(b.x - 2, y - eleve - 5, 4, 10);
      } else {
        ctx.fillStyle = 'rgba(58,134,255,0.35)';
        ctx.beginPath(); ctx.arc(b.x, y, 18, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#3a86ff';
        ctx.beginPath();
        ctx.moveTo(b.x, y - 13); ctx.lineTo(b.x + 11, y - 8); ctx.lineTo(b.x + 9, y + 6);
        ctx.lineTo(b.x, y + 13); ctx.lineTo(b.x - 9, y + 6); ctx.lineTo(b.x - 11, y - 8);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#e0f0ff';
        ctx.fillRect(b.x - 1.5, y - 7, 3, 12);
      }
    });
  }

  function dessinerObstacles(liste) {
    liste.forEach(function (o) {
      const y = o.voieY();
      dessinerOmbre(ctx, o.x + o.l / 2, y, o.l, o.h, 0);
      if (o.camion) dessinerCamion(ctx, o.x + o.l / 2, y, o.l, o.h, o.couleur, -1);
      else dessinerAuto(ctx, o.x + o.l / 2, y, o.l, o.h, o.couleur, '#ffffff', o.forme, -1);
    });
  }

  function dessinerJoueur() {
    const j = jeu.joueur;
    if (jeu.etat === 'fin' && jeu.secousse <= 0.2) return; // l'auto est en morceaux
    const cx = JOUEUR_X + AUTO_L / 2;
    const echelle = 1 + j.hauteur * 0.42;
    const cy = j.y - j.hauteur * 46;
    dessinerOmbre(ctx, JOUEUR_X + AUTO_L / 2, j.y, AUTO_L, AUTO_H, j.hauteur);

    if (j.invincible > 0 && Math.floor(j.invincible * 12) % 2 === 0) return; // clignote

    const v = jeu.voiture;
    dessinerAuto(ctx, cx, cy, AUTO_L * echelle, AUTO_H * echelle, v.couleur, v.accent, v.forme, 1);

    if (j.bouclier) {
      ctx.save();
      ctx.strokeStyle = 'rgba(58,134,255,0.9)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(cx, cy, AUTO_L * 0.62 * echelle, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(58,134,255,0.12)';
      ctx.fill();
      ctx.restore();
    }
  }

  function dessinerParticules() {
    jeu.particules.forEach(function (p) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.vie * 2));
      ctx.fillStyle = p.couleur;
      ctx.fillRect(p.x, p.y, p.taille, p.taille);
    });
    ctx.globalAlpha = 1;
  }

  function dessiner() {
    ctx.save();
    if (jeu.secousse > 0) {
      ctx.translate((Math.random() - 0.5) * 12 * jeu.secousse, (Math.random() - 0.5) * 12 * jeu.secousse);
    }
    dessinerDecor();
    dessinerBonus();
    // Tri par ordonnee : ce qui est plus bas sur l'ecran passe devant.
    dessinerObstacles(jeu.obstacles.filter(function (o) { return o.voieY() < jeu.joueur.y; }));
    dessinerJoueur();
    dessinerObstacles(jeu.obstacles.filter(function (o) { return o.voieY() >= jeu.joueur.y; }));
    dessinerParticules();
    ctx.restore();
  }

  function boucle(temps) {
    const dt = Math.min(0.05, (temps - jeu.dernierTemps) / 1000 || 0);
    jeu.dernierTemps = temps;

    if (jeu.etat === 'jeu') majJeu(dt);
    if (jeu.etat === 'jeu' || jeu.etat === 'fin') majParticules(dt);
    if (jeu.etat !== 'chargement') dessiner();

    requestAnimationFrame(boucle);
  }

  // --- HUD et voiles --------------------------------------------------------------

  function majHud() {
    ui.hudPoints.textContent = jeu.points.toLocaleString('fr-CA');
    ui.hudNiveau.textContent = jeu.niveauCourant + ' / ' + NB_NIVEAUX;
    ui.hudProgres.textContent = jeu.niveauDef
      ? jeu.obstaclesPasses + ' / ' + jeu.niveauDef.obstacles
      : '';
    ui.hudBouclier.hidden = !jeu.joueur.bouclier;
    if (jeu.voiture) {
      ui.hudAuto.textContent = jeu.voiture.nom;
      ui.hudRarete.textContent = jeu.raretes[jeu.voiture.rarete] || jeu.voiture.rarete;
      ui.hudRarete.className = 'hud__rarete rarete--' + jeu.voiture.rarete;
    }
  }

  function montrerVoile(voile) {
    [ui.accueil, ui.niveau, ui.fin, ui.scores, ui.pause].forEach(function (v) {
      v.hidden = (v !== voile);
    });
  }

  function allerAuGarage() {
    jeu.etat = 'accueil';
    ui.boutonPause.hidden = true;
    construireGarage();
    montrerVoile(ui.accueil);
  }

  // --- Garage --------------------------------------------------------------------

  function construireGarage() {
    const max = jeu.sauvegarde.niveauMax || 1;
    const choisie = voitureChoisie();
    ui.garage.innerHTML = '';

    jeu.voitures.forEach(function (v) {
      const bouton = document.createElement('button');
      bouton.type = 'button';
      bouton.className = 'garage__auto garage__auto--rarete-' + v.rarete;
      const ouverte = v.niveau_requis <= max;
      if (!ouverte) bouton.classList.add('garage__auto--verrouillee');
      if (v.slug === choisie.slug) bouton.classList.add('garage__auto--choisie');
      bouton.title = v.nom + ' — ' + jeu.raretes[v.rarete] + (ouverte ? '' : ' — niveau ' + v.niveau_requis);

      const mini = document.createElement('canvas');
      mini.width = 68; mini.height = 68;
      const c = mini.getContext('2d');
      dessinerAuto(c, 34, 36, 54, 30, v.couleur, v.accent, v.forme, 1);
      bouton.appendChild(mini);

      bouton.addEventListener('click', function () {
        Son.reveiller();
        if (!ouverte) {
          ui.garageLegende.textContent = '🔒 ' + v.nom + ' (' + jeu.raretes[v.rarete] +
            ') se débloque au niveau ' + v.niveau_requis + '.';
          return;
        }
        jeu.sauvegarde.voiture = v.slug;
        ecrireSauvegarde(jeu.sauvegarde);
        construireGarage();
      });
      ui.garage.appendChild(bouton);
    });

    const nbOuvertes = jeu.voitures.filter(function (v) { return v.niveau_requis <= max; }).length;
    ui.garageLegende.textContent = choisie.nom + ' · ' + jeu.raretes[choisie.rarete] +
      ' — ' + nbOuvertes + ' / ' + jeu.voitures.length + ' autos · niveau atteint : ' + max;

    const depart = borner(jeu.sauvegarde.niveauDepart || 1, 1, max);
    jeu.sauvegarde.niveauDepart = depart;
    ui.boutonJouer.textContent = depart > 1 ? 'Jouer — niveau ' + depart : 'Jouer';
    construireChoixNiveau(max, depart);
  }

  function construireChoixNiveau(max, depart) {
    let boite = $('choix-niveau');
    if (max <= 1) { if (boite) boite.remove(); return; }
    if (!boite) {
      boite = document.createElement('div');
      boite.id = 'choix-niveau';
      boite.className = 'boutons';
      ui.garageLegende.insertAdjacentElement('afterend', boite);
    }
    boite.innerHTML = '';
    const moins = document.createElement('button');
    moins.type = 'button'; moins.className = 'bouton'; moins.textContent = '−';
    const plus = document.createElement('button');
    plus.type = 'button'; plus.className = 'bouton'; plus.textContent = '+';
    const etiquette = document.createElement('span');
    etiquette.className = 'bouton';
    etiquette.style.cursor = 'default';
    etiquette.textContent = 'Départ : niveau ' + depart;
    function regler(delta) {
      jeu.sauvegarde.niveauDepart = borner(jeu.sauvegarde.niveauDepart + delta, 1, max);
      ecrireSauvegarde(jeu.sauvegarde);
      construireGarage();
    }
    moins.addEventListener('click', function () { regler(-1); });
    plus.addEventListener('click', function () { regler(1); });
    boite.appendChild(moins); boite.appendChild(etiquette); boite.appendChild(plus);
  }

  // --- Scores ------------------------------------------------------------------------

  function afficherScores(scores) {
    ui.listeScores.innerHTML = '';
    if (!scores || !scores.length) {
      const li = document.createElement('li');
      li.className = 'scores__vide';
      li.textContent = 'Personne encore. Sois le premier!';
      ui.listeScores.appendChild(li);
      return;
    }
    scores.forEach(function (s) {
      const li = document.createElement('li');
      const nom = document.createElement('span');
      nom.textContent = s.pseudo;
      const detail = document.createElement('span');
      detail.textContent = 'niv. ' + s.niveau + ' · ' + s.points.toLocaleString('fr-CA');
      li.appendChild(nom); li.appendChild(detail);
      ui.listeScores.appendChild(li);
    });
  }

  function chargerScores() {
    return fetch(racine.dataset.urlScores, { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (d) { afficherScores(d.scores); })
      .catch(function () { afficherScores([]); });
  }

  function envoyerScore(evenement) {
    evenement.preventDefault();
    const pseudo = ui.pseudo.value.trim();
    if (!pseudo) { ui.scoreEtat.textContent = 'Écris un pseudo.'; return; }
    ui.scoreEtat.textContent = 'Envoi…';
    fetch(racine.dataset.urlScores, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pseudo: pseudo, niveau: jeu.niveauCourant, points: jeu.points }),
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok) { ui.scoreEtat.textContent = res.d.erreur || 'Refusé.'; return; }
        jeu.sauvegarde.pseudo = pseudo;
        ecrireSauvegarde(jeu.sauvegarde);
        ui.scoreEtat.textContent = res.d.rang && res.d.rang <= 10
          ? 'Bravo, ' + res.d.rang + 'e au tableau!'
          : 'Score envoyé.';
        ui.scoreForm.hidden = true;
        afficherScores(res.d.scores);
      })
      .catch(function () { ui.scoreEtat.textContent = 'Pas de réseau — réessaie plus tard.'; });
  }

  // --- Entrees ------------------------------------------------------------------------

  function basculerPause() {
    if (jeu.etat === 'jeu') {
      jeu.etat = 'pause';
      montrerVoile(ui.pause);
    } else if (jeu.etat === 'pause') {
      jeu.etat = 'jeu';
      montrerVoile(null);
    }
  }

  document.addEventListener('keydown', function (e) {
    if (e.target && e.target.tagName === 'INPUT') return;
    switch (e.code) {
      case 'Space': case 'ArrowUp':
        e.preventDefault(); Son.reveiller();
        if (jeu.etat === 'jeu') sauter();
        break;
      case 'KeyW': e.preventDefault(); changerVoie(-1); break;
      case 'KeyS': e.preventDefault(); changerVoie(1); break;
      case 'ArrowDown': e.preventDefault(); break;
      case 'KeyP': case 'Escape': basculerPause(); break;
      case 'KeyM':
        Son.muet = !Son.muet;
        jeu.sauvegarde.muet = Son.muet;
        ecrireSauvegarde(jeu.sauvegarde);
        break;
      default: break;
    }
  });

  // Tactile : toucher = sauter, glisser vers le haut/bas = changer de voie.
  let toucheDepart = null;
  toile.addEventListener('pointerdown', function (e) {
    Son.reveiller();
    toucheDepart = { x: e.clientX, y: e.clientY, t: performance.now(), traite: false };
    toile.setPointerCapture(e.pointerId);
  });
  toile.addEventListener('pointermove', function (e) {
    if (!toucheDepart || toucheDepart.traite) return;
    const dy = e.clientY - toucheDepart.y;
    if (Math.abs(dy) > 28) {
      toucheDepart.traite = true;
      changerVoie(dy < 0 ? -1 : 1);
    }
  });
  toile.addEventListener('pointerup', function () {
    if (!toucheDepart) return;
    if (!toucheDepart.traite) sauter();
    toucheDepart = null;
  });
  toile.addEventListener('pointercancel', function () { toucheDepart = null; });

  ui.boutonJouer.addEventListener('click', function () { Son.reveiller(); nouvellePartie(); });
  ui.boutonScores.addEventListener('click', function () {
    jeu.etat = 'scores';
    montrerVoile(ui.scores);
    chargerScores();
  });
  ui.boutonFermerScores.addEventListener('click', allerAuGarage);
  ui.boutonSuivant.addEventListener('click', function () {
    Son.reveiller();
    if (jeu.niveauCourant >= NB_NIVEAUX) { jeu.points = 0; commencerNiveau(1); return; }
    commencerNiveau(jeu.niveauCourant + 1);
  });
  ui.boutonGarage.addEventListener('click', allerAuGarage);
  ui.boutonGarageFin.addEventListener('click', allerAuGarage);
  ui.boutonRejouer.addEventListener('click', function () {
    Son.reveiller();
    jeu.points = 0;
    jeu.joueur.bouclier = false;
    commencerNiveau(jeu.niveauCourant);
  });
  ui.boutonReprendre.addEventListener('click', basculerPause);
  ui.boutonAbandonner.addEventListener('click', allerAuGarage);
  ui.boutonPause.addEventListener('click', basculerPause);
  ui.scoreForm.addEventListener('submit', envoyerScore);

  document.addEventListener('visibilitychange', function () {
    if (document.hidden && jeu.etat === 'jeu') basculerPause();
  });

  // --- Demarrage --------------------------------------------------------------------------

  function ajusterResolution() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    toile.width = LARGEUR * dpr;
    toile.height = HAUTEUR * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  ajusterResolution();
  window.addEventListener('resize', ajusterResolution);

  Son.muet = !!jeu.sauvegarde.muet;

  Promise.all([
    fetch(racine.dataset.urlNiveaux).then(function (r) { return r.json(); }),
    fetch(racine.dataset.urlVoitures).then(function (r) { return r.json(); }),
  ]).then(function (reponses) {
    jeu.niveaux = reponses[0].niveaux;
    jeu.voitures = reponses[1].voitures;
    jeu.raretes = reponses[1].raretes;
    jeu.niveauDef = jeu.niveaux[0];
    jeu.voiture = voitureChoisie();
    jeu.joueur.y = yDeVoie(0);
    majHud();
    allerAuGarage();
    requestAnimationFrame(boucle);
  }).catch(function () {
    ui.garageLegende.textContent = 'Impossible de charger le jeu. Recharge la page.';
  });
})();
