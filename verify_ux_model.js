// verify_ux_model.js — CE QUE LE DESTINATAIRE DOIT COMPRENDRE, et dans quel ordre.
//
// Le destinataire d'un document ouvre Verify sans contexte, souvent une seule fois, souvent
// sur un téléphone. Il ne sait pas ce qu'est une empreinte SHA-256, Ed25519, un cap, un gate
// ou un evidence score. La page lui présentait d'abord un niveau de preuve calculé par le
// moteur — et ce niveau pouvait s'afficher en vert au-dessus d'une signature invalide.
//
// Ce module transforme des faits DÉJÀ ÉTABLIS en modèle d'affichage. Il ne touche pas au DOM,
// ne calcule aucune empreinte, ne vérifie aucune signature, ne sort pas sur le réseau. Il ne
// rend que des CLÉS de catalogue : les formulations vivent dans index.html, en français et en
// anglais, et une phrase ne peut pas être écrite ici par mégarde.
//
// Les trois règles qui gouvernent tout le reste :
//
//   1. UNE SIGNATURE INVALIDE RETIRE AU PAYLOAD SA QUALITÉ DE FAIT. Rien de ce qu'il contient
//      ne peut alors être présenté comme observé, mesuré ou établi.
//   2. LE PROCESSUS ET L'ARTEFACT SONT DEUX AXES. Un processus réellement observé n'empêche
//      pas qu'on ait fourni le mauvais fichier, et l'inverse est vrai aussi.
//   3. UNE ABSENCE N'EST PAS UN ZÉRO. Une donnée que le schéma ne porte pas ne s'affiche pas
//      comme une mesure nulle.
//
// Pur et sans dépendance : le banc `test_verify_ux_model.mjs` l'exécute tel quel.
"use strict";
(function (racine) {

// Gravité de l'écran. Elle commande la couleur ET le ton, jamais l'inverse.
var SEVERITES = ["critical", "warning", "neutral", "positive"];

function estV1(doc) {
  return !!(doc && doc.format === "humanorigin-hojson" && doc.version === "1.0"
    && doc.payload && Array.isArray(doc.signatures));
}
function nombre(x) { return typeof x === "number" && isFinite(x) ? x : null; }
function liste(x) { return Array.isArray(x) ? x : []; }

// Limites déclarées par le moteur, sous forme de clés. Celles qui n'ont pas de formulation
// sont IGNORÉES : afficher `no_media_authenticity_certification` à un destinataire serait
// pire que ne rien afficher.
var LIMITES_MOTEUR = {
  no_screen_content_capture: "ux.lim.noScreen",
  no_text_content_storage: "ux.lim.noText",
  document_mode_only: "ux.lim.documentOnly",
};

/** Durée lisible à partir de millisecondes. Rend une clé et son nombre, jamais une phrase. */
function dureeObservee(activeMs) {
  var ms = nombre(activeMs);
  if (ms === null || ms <= 0) return null;
  var s = Math.round(ms / 1000);
  if (s < 60) return { key: "ux.fact.activeSec", args: { n: s } };
  return { key: "ux.fact.activeMin", args: { n: Math.round(s / 60) } };
}

/**
 * Le moteur signale-t-il une insertion externe importante ? On ne lit QUE ses indicateurs :
 * aucun seuil n'est inventé ici, et un nombre de caractères n'en est pas un.
 */
function insertionExterneSignalee(payload) {
  var label = payload.label_eligibility || {};
  var paste = (payload.process_summary || {}).paste_summary || {};
  if (label.paste_cap_applied === true) return true;
  if (nombre(paste.paste_dominant_sessions) > 0) return true;
  if (nombre(paste.paste_heavy_sessions) > 0) return true;
  if (liste(label.caps_applied).indexOf("paste_cap") >= 0) return true;
  if (liste(label.claims_allowed).indexOf("external_text_insertion_detected") >= 0) return true;
  return false;
}

/** L'observation est-elle déclarée courte par le moteur lui-même ? */
function observationCourte(payload) {
  var ps = payload.process_summary || {}, label = payload.label_eligibility || {};
  return ps.evidence_level === "short_observed_activity"
    || label.short_evidence === true
    || liste(label.caps_applied).indexOf("short_evidence_cap") >= 0;
}

function verdictBrut(doc) {
  var pay = (doc && doc.payload) || {};
  var v = (pay.label_eligibility || {}).visible_verdict
       || (pay.process_summary || {}).verdict
       || (doc && doc.score && doc.score.verdict) || "";
  return String(v).trim().toUpperCase();
}

/** Le titre tiré du processus. Descriptif, jamais un jugement sur la personne. */
function titreProcessus(doc, artifactCheck) {
  var v = verdictBrut(doc);
  // `INCOMPLETE` existe dans d'anciennes preuves et n'était traité nulle part. Il ne veut
  // dire ni « suspect », ni « invalide » : il veut dire qu'il manque de quoi lire.
  if (v === "INCOMPLETE") return { key: "ux.proc.incomplete", severity: "neutral" };
  if (!estV1(doc)) {
    return { key: "ux.proc.observedLegacy", severity: "neutral" };
  }
  var pay = doc.payload || {};
  if (insertionExterneSignalee(pay)) return { key: "ux.proc.paste", severity: "warning" };
  if (observationCourte(pay)) return { key: "ux.proc.short", severity: "neutral" };
  if (v === "PREUVE LIMITÉE" || v === "PREUVE LIMITEE" || v === "LIMITED" || v === "SUSPECT")
    return { key: "ux.proc.insufficient", severity: "neutral" };
  // « relié à ce document » n'est dit que si le moteur établit le lien ET que le fichier
  // présenté est bien l'un des artefacts engagés. Sinon, on dit « sur ce document ».
  var lien = (pay.document || {}).process_object_link || {};
  var lieEtabli = lien.level && lien.level !== "none";
  var fichierReconnu = artifactCheck && artifactCheck.status.indexOf("MATCH_") === 0;
  if (lieEtabli && fichierReconnu) return { key: "ux.proc.linked", severity: "positive" };
  return { key: "ux.proc.observed", severity: "positive" };
}

/** Les faits d'observation, au plus trois, par ordre d'utilité pour un destinataire. */
function faitsObserves(doc) {
  var out = [];
  if (!estV1(doc)) {
    // Schéma ancien : seules les métriques réellement portées. Ni frappes ni souris à
    // l'écran — ce sont des mesures d'instrument, pas des faits lisibles.
    var m = (((doc || {}).evidence || {}).sessions || [])[0];
    var met = (m && m.metrics) || {};
    var sec = nombre(met.active_seconds);
    if (sec !== null && sec > 0) out.push(sec < 60
      ? { key: "ux.fact.activeSec", args: { n: sec } }
      : { key: "ux.fact.activeMin", args: { n: Math.round(sec / 60) } });
    if (nombre(met.pastes) > 0) out.push({ key: "ux.fact.pasteLegacy" });
    return out.slice(0, 3);
  }
  var pay = doc.payload || {}, ps = pay.process_summary || {}, d = pay.document || {};
  var delta = d.object_delta || {};

  if (insertionExterneSignalee(pay)) out.push({ key: "ux.fact.paste" });

  // Le document a-t-il changé pendant l'observation ? C'est le fait le plus parlant, et il
  // n'est affirmé que si la preuve le porte explicitement dans un sens ou dans l'autre.
  if (delta.changed_during_observed_sessions === true || d.delta_significant === true)
    out.push({ key: "ux.fact.changed" });
  else if (delta.hash_changed === false || d.document_modified === false)
    out.push({ key: "ux.fact.unchanged" });

  var duree = dureeObservee(ps.active_ms);
  if (duree) out.push(duree);

  var n = nombre(ps.valid_sessions_count);
  if (n !== null && n > 0) out.push({ key: n > 1 ? "ux.fact.sessions" : "ux.fact.session1", args: { n: n } });

  if (observationCourte(pay)) out.push({ key: "ux.fact.short" });

  if (d.document_contribution_attested === false && d.contribution_cap_reason)
    out.push({ key: "ux.fact.contribLimited" });

  return out.slice(0, 3);
}

/** Ce que la preuve établit. Court, et rien qui dépasse ce qui a été réellement contrôlé. */
function faitsEtablis(doc, artifactCheck, attestation, registre) {
  var out = [{ key: "ux.est.integrity" }];
  if (artifactCheck && artifactCheck.status === "MATCH_PUBLISHED") out.push({ key: "ux.est.published" });
  else if (artifactCheck && artifactCheck.status === "MATCH_SOURCE") out.push({ key: "ux.est.source" });
  else if (artifactCheck && artifactCheck.status === "MATCH_LEGACY") out.push({ key: "ux.est.legacy" });
  if (attestation && attestation.status === "valid") out.push({ key: "ux.est.countersigned" });
  if (registre && registre.status === "active") out.push({ key: "ux.est.registered" });
  return out.slice(0, 5);
}

/** Ce que la preuve ne permet pas d'établir. Les quatre de doctrine, puis celles du schéma. */
function limites(doc) {
  var out = [{ key: "ux.lim.identity" }, { key: "ux.lim.ai" },
             { key: "ux.lim.unobserved" }, { key: "ux.lim.truth" }];
  if (!estV1(doc)) return out;
  var pay = doc.payload || {};
  var declarees = liste((pay.observed_process || {}).limitations)
    .concat(liste(((pay.bound_objects || [])[0] || {}).limitations));
  var vues = {};
  for (var i = 0; i < declarees.length; i++) {
    var k = LIMITES_MOTEUR[declarees[i]];
    if (k && !vues[k]) { vues[k] = 1; out.push({ key: k }); }
  }
  return out;
}

/**
 * La confiance technique, dite sans jargon.
 *
 * UNE SEULE CHOSE peut faire dire « contre-signée par HumanOrigin » : une attestation
 * serveur dont la signature a été VÉRIFIÉE ici, contre une clé serveur connue.
 *
 * `payload.issuer.key_trust` ne le peut pas, et ne doit jamais le pouvoir. Ce champ vit
 * DANS le payload ; sur une preuve locale auto-signée, il est signé par la clé locale
 * embarquée. Une preuve purement locale peut donc déclarer `server_countersigned` sans
 * qu'aucun serveur n'ait rien signé. S'en servir comme source de confiance revenait à
 * laisser la preuve se décerner elle-même son propre niveau de confiance.
 *
 * `key_trust` reste lisible dans les données brutes : il est rapporté, jamais cru.
 */
function confiance(doc, attestation) {
  if (attestation && attestation.status === "valid")
    return { tone: "positive", key: "ux.trust.countersigned", detailKey: "ux.trust.countersigned.d" };
  // Attestation présente mais non vérifiable : on le dit, et on ne se rabat sur rien.
  if (attestation && attestation.present && attestation.status !== "valid")
    return { tone: "warning", key: "ux.trust.attestationProblem", detailKey: "ux.trust.attestationProblem.d" };
  var issuer = (((doc || {}).payload) || {}).issuer || {};
  var kt = issuer.key_trust || "";
  // Pas de `key_trust` du tout : ancien schéma. On ne fabrique pas « clé locale non
  // enregistrée », qui serait une information que la preuve ne porte pas.
  if (!kt) return { tone: "neutral", key: "ux.trust.unknown", detailKey: null };
  // Toute autre valeur, y compris `server_countersigned` ou `official_server_key` :
  // signature locale. Aucune élévation.
  return { tone: "neutral", key: "ux.trust.local", detailKey: "ux.trust.local.d" };
}

function registreModele(registre) {
  if (!registre || registre.status === "not_configured") return null;
  if (registre.status === "active") return { tone: "positive", key: "ux.reg.active" };
  if (registre.status === "revoked")
    return { tone: "critical", key: "ux.reg.revoked", reason: registre.revocation_reason || null };
  if (registre.status === "not_found") return { tone: "warning", key: "ux.reg.notFound" };
  if (registre.status === "offline") return { tone: "neutral", key: "ux.reg.offline" };
  return { tone: "neutral", key: "ux.reg.unknown" };
}

/** La ligne de statut du fichier. Axe distinct du processus, toujours présente. */
function statutFichier(artifactCheck, proofOk) {
  if (!artifactCheck) return { tone: "none", key: "ux.doc.none", detailKey: "ux.doc.none.d" };
  var s = artifactCheck.status;
  if (s === "MATCH_PUBLISHED")
    return { tone: proofOk ? "positive" : "warning", key: "ux.doc.published", detailKey: "ux.doc.published.d" };
  if (s === "MATCH_SOURCE")
    return { tone: proofOk ? "positive" : "warning", key: "ux.doc.source", detailKey: "ux.doc.source.d" };
  if (s === "MATCH_LEGACY")
    return { tone: proofOk ? "positive" : "warning", key: "ux.doc.legacy", detailKey: "ux.doc.legacy.d" };
  if (s === "NO_MATCH")
    return { tone: "critical", key: "ux.doc.noMatch", detailKey: "ux.doc.noMatch.d" };
  return { tone: "neutral", key: "ux.doc.notVerifiable", detailKey: "ux.doc.notVerifiable.d" };
}

/**
 * Le modèle d'affichage complet.
 *
 * @param e.proofOk            la signature de la preuve a-t-elle été vérifiée
 * @param e.doc                la preuve lue
 * @param e.artifactCheck      le résultat de `artifact_binding.js`, ou null si aucun fichier
 * @param e.serverAttestation  le résultat de `verifyServerAttestation`
 * @param e.registryStatus     le résultat de `checkRegistryStatus`
 */
function buildRecipientModel(e) {
  var o = e || {};
  var doc = o.doc, check = o.artifactCheck || null;
  var proofOk = o.proofOk === true;
  var att = o.serverAttestation || null, reg = registreModele(o.registryStatus);

  // ---- ÉTAT 1 : l'intégrité n'est pas vérifiée. Le payload cesse d'être une source de faits.
  if (!proofOk) {
    return {
      severity: "critical",
      headline: { key: "ux.hero.invalid" },
      explanation: { key: "ux.hero.invalid.p" },
      primaryAction: { key: "ux.act.otherProof", action: "pick-proof" },
      documentStatus: { tone: "none", key: "ux.doc.notAssessed", detailKey: "ux.doc.notAssessed.d" },
      observedFacts: [],
      establishedFacts: [],
      limitations: limites(null),
      trustStatus: { tone: "critical", key: "ux.trust.invalid", detailKey: null },
      registry: reg,
      payloadTrustworthy: false,
    };
  }

  var docStatus = statutFichier(check, proofOk);
  var faits = faitsObserves(doc);
  var etablis = faitsEtablis(doc, check, att, o.registryStatus);
  var lim = limites(doc);
  var tr = confiance(doc, att);

  var base = {
    documentStatus: docStatus, observedFacts: faits, establishedFacts: etablis,
    limitations: lim, trustStatus: tr, registry: reg, payloadTrustworthy: true,
  };
  var avec = function (x) { for (var k in base) if (!(k in x)) x[k] = base[k]; return x; };

  // ---- ÉTAT 2 : preuve révoquée. La signature peut être valide ; la preuve ne vaut plus.
  if (reg && reg.tone === "critical") {
    return avec({
      severity: "critical",
      headline: { key: "ux.hero.revoked" },
      explanation: { key: "ux.hero.revoked.p" },
      primaryAction: null,
    });
  }

  // ---- ÉTAT 3 : le fichier fourni n'est aucun des artefacts engagés.
  if (check && check.status === "NO_MATCH") {
    return avec({
      severity: "critical",
      headline: { key: "ux.hero.noMatch" },
      explanation: { key: "ux.hero.noMatch.p" },
      primaryAction: { key: "ux.act.otherFile", action: "pick-file" },
    });
  }

  // ---- ÉTAT 4 : un fichier a été fourni, mais ce schéma ne permet pas de le confirmer.
  if (check && check.status === "NOT_VERIFIABLE") {
    return avec({
      severity: "neutral",
      headline: { key: "ux.hero.notVerifiable" },
      explanation: { key: "ux.hero.notVerifiable.p" },
      primaryAction: null,
    });
  }

  // ---- ÉTATS 5 et 6 : le titre vient du processus ; le fichier a sa ligne, juste dessous.
  var t = titreProcessus(doc, check);
  var modele = avec({
    severity: t.severity,
    headline: { key: t.key },
    explanation: { key: t.key + ".p" },
    primaryAction: check ? null : { key: "ux.act.checkDocument", action: "pick-file" },
  });
  // L'origine d'une insertion externe n'est pas déterminée par HumanOrigin, et cela se dit
  // à côté du constat, pas dans une note de bas de page.
  if (t.key === "ux.proc.paste") modele.guard = { key: "ux.hero.paste.guard" };
  return modele;
}

racine.HO_UX_MODEL = {
  buildRecipientModel: buildRecipientModel,
  SEVERITES: SEVERITES,
  // exportés pour le banc, qui doit pouvoir les exercer isolément
  titreProcessus: titreProcessus, faitsObserves: faitsObserves, limites: limites,
  confiance: confiance, statutFichier: statutFichier, registreModele: registreModele,
  insertionExterneSignalee: insertionExterneSignalee, observationCourte: observationCourte,
};

})(typeof window !== "undefined" ? window : globalThis);
