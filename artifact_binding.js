// artifact_binding.js — QUEL ARTEFACT L'UTILISATEUR VIENT-IL DE FOURNIR ?
//
// Jusqu'ici le vérificateur ne connaissait qu'une seule empreinte attendue,
// `payload.document.sha256`, qui engage le DOCUMENT SOURCE lié. Or le kit destinataire
// `HumanOrigin_SEND.zip` contient le PDF de circulation, dont l'empreinte est engagée
// séparément par `payload.publication.output.sha256` après re-signature de la preuve.
// Déposer le kit tel qu'il est livré produisait donc « le document ne correspond pas » :
// un faux négatif sur le parcours nominal.
//
// Ce module remplace « une empreinte attendue » par « la liste des artefacts que la preuve
// engage réellement », et une seule logique de comparaison en fait autorité.
//
// Règles non négociables :
//   — aucune empreinte n'est reconstruite, déduite ni recalculée : seules celles présentes
//     dans le payload signé comptent ;
//   — l'absence d'une empreinte ne devient JAMAIS une accusation. Ne pas pouvoir vérifier
//     une copie dérivée est un manque d'information, pas un défaut du fichier ;
//   — une signature invalide retire toute valeur d'attestation à une correspondance :
//     le payload n'est plus une source de vérité, donc ses empreintes non plus.
//
// Pur, sans DOM, sans réseau, sans dépendance : le banc `test_artifact_binding.mjs`
// l'exécute tel quel.
"use strict";
(function (racine) {

// Les cinq états. Ils décrivent la RELATION entre le fichier fourni et la preuve, jamais
// une qualité du fichier.
//   MATCH_PUBLISHED  le fichier est la copie publiée engagée par la preuve
//   MATCH_SOURCE     le fichier est le document source lié
//   MATCH_LEGACY     le fichier correspond à la seule empreinte d'un schéma ancien
//   NO_MATCH         la preuve permettait de comparer, et rien ne correspond
//   NOT_VERIFIABLE   la preuve ne porte pas l'empreinte qui permettrait de se prononcer
var ETATS = ["MATCH_PUBLISHED", "MATCH_SOURCE", "MATCH_LEGACY", "NO_MATCH", "NOT_VERIFIABLE"];

var ROLE_SOURCE = "bound_source_document";
var ROLE_PUBLIE = "published_circulation_copy";
var ROLE_LEGACY = "legacy_document";

function hex64(x) {
  if (typeof x !== "string") return null;
  var s = x.trim().toLowerCase();
  return /^[0-9a-f]{64}$/.test(s) ? s : null;
}
function texte(x) { return typeof x === "string" && x.trim() ? x.trim() : null; }

// Même prédicat que `isHoJsonV1` dans index.html. Le banc contrôle qu'ils ne divergent pas :
// deux lectures différentes du même format produiraient deux contrats d'artefacts.
function estV1(doc) {
  return !!(doc && doc.format === "humanorigin-hojson" && doc.version === "1.0"
    && doc.payload && Array.isArray(doc.signatures));
}

/**
 * Les artefacts que la preuve ENGAGE réellement, dans l'ordre où ils sont déclarés.
 * Un artefact n'entre dans la liste que s'il porte une empreinte sha256 exploitable.
 */
function getExpectedArtifacts(doc) {
  var out = [];
  if (estV1(doc)) {
    var pay = doc.payload || {};
    var d = pay.document || {};
    var sSource = hex64(d.sha256);
    if (sSource) out.push({ role: ROLE_SOURCE, filename: texte(d.filename),
      mime: texte(d.mime), declaredRole: null, sha256: sSource });
    // La copie publiée est engagée par la preuve re-signée après génération du PDF.
    // Elle n'existe que sur les preuves qui ont effectivement publié.
    var pub = (pay.publication && pay.publication.output) || {};
    var sPub = hex64(pub.sha256);
    if (sPub) out.push({ role: ROLE_PUBLIE, filename: texte(pub.filename),
      mime: texte(pub.mime), declaredRole: texte(pub.role), sha256: sPub });
    return out;
  }
  // Schéma ancien : une seule empreinte, et aucun moyen de savoir ce qu'elle couvre au-delà
  // du fichier lui-même. On ne lui prête donc pas le rôle « source » du schéma récent.
  var ld = (doc && doc.document) || {};
  var sLeg = hex64(ld.sha256);
  if (sLeg) out.push({ role: ROLE_LEGACY, filename: texte(ld.filename),
    mime: texte(ld.mime), declaredRole: null, sha256: sLeg });
  return out;
}

// Nature d'un fichier, telle qu'on peut l'établir sans l'ouvrir : extension du nom, sinon
// type MIME. « Je ne sais pas » est une réponse valide, et c'est elle qui protège.
var MIME_VERS_EXT = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/msword": "doc",
  "text/plain": "txt",
  "application/rtf": "rtf",
  "application/vnd.oasis.opendocument.text": "odt",
};
function natureDe(filename, mime) {
  var n = texte(filename);
  if (n) {
    var m = /\.([A-Za-z0-9]{1,8})$/.exec(n);
    if (m) return m[1].toLowerCase();
  }
  var t = texte(mime);
  if (t) {
    var base = t.toLowerCase().split(";")[0].trim();
    if (MIME_VERS_EXT[base]) return MIME_VERS_EXT[base];
  }
  return null;
}

/**
 * La comparaison. Une seule, et c'est elle qui fait autorité : le rendu ne recalcule plus
 * « empreinte === l'empreinte attendue » de son côté.
 *
 * @param o.doc           la preuve lue
 * @param o.sha256        l'empreinte RÉELLEMENT calculée du fichier fourni
 * @param o.filename      son nom, si connu
 * @param o.mime          son type, si connu
 * @param o.roleHint      contexte, jamais une preuve : voir plus bas
 * @param o.signatureOk   true si la signature de la preuve a été vérifiée
 */
function matchProvidedArtifact(o) {
  var opts = o || {};
  var sha = hex64(opts.sha256);
  var artefacts = getExpectedArtifacts(opts.doc);
  var sigOk = opts.signatureOk;
  var res = function (status, art, reason) {
    return {
      status: status,
      sha256: sha,
      matchedRole: art ? art.role : null,
      matchedArtifact: art || null,
      reason: reason,
      // Une correspondance ne vaut attestation que si la preuve qui porte l'empreinte est
      // elle-même intègre. Signature invalide : le payload n'engage plus rien.
      attested: status.indexOf("MATCH_") === 0 && sigOk !== false,
      artifacts: artefacts,
    };
  };

  if (!sha) return res("NOT_VERIFIABLE", null, "no_file_hash");
  if (!artefacts.length) return res("NOT_VERIFIABLE", null, "proof_carries_no_fingerprint");

  // 1. Correspondance exacte. La copie publiée est examinée d'abord : c'est l'artefact que
  //    le destinataire tient en main, et un kit dont le PDF correspond ne doit jamais
  //    ressortir en « ne correspond pas au document source ».
  var ordre = [ROLE_PUBLIE, ROLE_SOURCE, ROLE_LEGACY];
  for (var i = 0; i < ordre.length; i++) {
    for (var j = 0; j < artefacts.length; j++) {
      if (artefacts[j].role === ordre[i] && artefacts[j].sha256 === sha) {
        var etat = ordre[i] === ROLE_PUBLIE ? "MATCH_PUBLISHED"
                 : ordre[i] === ROLE_SOURCE ? "MATCH_SOURCE" : "MATCH_LEGACY";
        return res(etat, artefacts[j], "exact_sha256_match");
      }
    }
  }

  // 2. Aucune correspondance. Reste à savoir si la preuve PERMETTAIT de se prononcer.
  var publie = null, source = null;
  for (var k = 0; k < artefacts.length; k++) {
    if (artefacts[k].role === ROLE_PUBLIE) publie = artefacts[k];
    else source = artefacts[k];   // source récente ou document legacy
  }

  // La preuve engage une copie publiée : les deux artefacts circulants sont couverts, donc
  // un fichier qui ne correspond à aucun des deux n'est aucun des deux.
  if (publie) return res("NO_MATCH", null, "no_committed_artifact_matches");

  var natureFournie = natureDe(opts.filename, opts.mime);
  var natureSource = source ? natureDe(source.filename, source.mime) : null;

  // Le contexte dit que ce fichier est une copie de circulation — venu du kit, par exemple.
  // Ce contexte ne prouve rien ; il empêche seulement d'exiger d'une copie dérivée qu'elle
  // porte l'empreinte du document source, ce qu'elle ne peut pas faire.
  if (opts.roleHint === ROLE_PUBLIE)
    return res("NOT_VERIFIABLE", null, "derived_copy_without_published_fingerprint");

  // Même nature que le document engagé, et pourtant différent : là, on peut le dire.
  if (natureFournie && natureSource && natureFournie === natureSource)
    return res("NO_MATCH", null, "same_kind_as_bound_artifact");

  // Nature différente — typiquement un PDF dérivé d'un DOCX source — et aucune empreinte de
  // publication dans cette preuve. On ne sait pas. On le dit, et on n'accuse pas.
  if (natureFournie && natureSource)
    return res("NOT_VERIFIABLE", null, "derived_copy_without_published_fingerprint");

  // Nature indéterminable d'un côté au moins : l'absence d'information ne tranche pas.
  return res("NOT_VERIFIABLE", null, "kind_undetermined");
}

racine.HO_ARTIFACT_BINDING = {
  getExpectedArtifacts: getExpectedArtifacts,
  matchProvidedArtifact: matchProvidedArtifact,
  natureDe: natureDe,
  estV1: estV1,
  ETATS: ETATS,
  ROLE_SOURCE: ROLE_SOURCE, ROLE_PUBLIE: ROLE_PUBLIE, ROLE_LEGACY: ROLE_LEGACY,
};

})(typeof window !== "undefined" ? window : globalThis);
