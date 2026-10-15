// test_artifact_binding.mjs — banc du contrat des artefacts.
//
// Il charge `artifact_binding.js` tel qu'il est servi, et exerce les cas que le vérificateur
// rencontre réellement. Ce qu'il protège n'est pas une mise en page : c'est la différence
// entre « ce fichier n'est pas celui-là » et « je n'ai pas de quoi le dire ». Confondre les
// deux revient à accuser un destinataire d'un défaut qui n'existe pas.
//
// Aucune dépendance, aucun réseau, aucune donnée utilisateur.
//
//   node test_artifact_binding.mjs [kit.zip]
//
// Avec un kit réel en argument, il ajoute le contrôle de bout en bout : le PDF que le kit
// livre doit ressortir en MATCH_PUBLISHED. C'est le cas qui échouait avant ce patch. Le kit
// n'est ni modifié ni copié, et aucune donnée utilisateur n'entre dans ce dépôt.
//
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";

const RACINE = path.dirname(new URL(import.meta.url).pathname);
const faux = {};
new Function("window", fs.readFileSync(path.join(RACINE, "artifact_binding.js"), "utf8"))(faux);
const AB = faux.HO_ARTIFACT_BINDING;

let p = 0, f = 0;
const ck = (n, c, d = "") => { c ? p++ : f++; console.log(`  ${c ? "✓" : "✗"} ${n}${d ? "  → " + d : ""}`); };
const titre = (s) => console.log("\n── " + s + " ──");

const H = (c) => c.repeat(64);          // une empreinte de test, lisible d'un coup d'œil
const AAA = H("a"), BBB = H("b"), CCC = H("c");

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const v1 = (doc, pub) => {
  const payload = { document: doc };
  if (pub) payload.publication = { output: pub };
  return { format: "humanorigin-hojson", version: "1.0", payload, signatures: [{}] };
};
const legacy = (doc) => ({ ho: { version: "0.9" }, document: doc, signing: {} });

const m = (doc, fichier, extra) => AB.matchProvidedArtifact(
  Object.assign({ doc, sha256: fichier.sha256, filename: fichier.filename, mime: fichier.mime,
                  signatureOk: true }, extra || {}));

titre("T1 — V1, le document source lui-même");
{
  const doc = v1({ sha256: AAA, filename: "note.docx", mime: DOCX });
  const r = m(doc, { sha256: AAA, filename: "note.docx", mime: DOCX });
  ck("T1 · MATCH_SOURCE", r.status === "MATCH_SOURCE", r.status + " · " + r.reason);
  ck("T1 · le rôle reconnu est nommé", r.matchedRole === "bound_source_document", r.matchedRole);
  ck("T1 · la correspondance vaut attestation", r.attested === true);
}

titre("T2 — V1, la copie publiée du kit");
{
  const doc = v1({ sha256: AAA, filename: "note.docx", mime: DOCX },
                 { sha256: BBB, filename: "HumanOrigin_PUBLISHED.pdf", mime: "application/pdf",
                   role: "published_circulation_copy" });
  const r = m(doc, { sha256: BBB, filename: "note — HumanOrigin.pdf", mime: "application/pdf" },
              { roleHint: "published_circulation_copy" });
  ck("T2 · MATCH_PUBLISHED", r.status === "MATCH_PUBLISHED", r.status + " · " + r.reason);
  ck("T2 · et surtout jamais NO_MATCH", r.status !== "NO_MATCH");
  ck("T2 · le nom déclaré par la preuve est rapporté",
    r.matchedArtifact && r.matchedArtifact.filename === "HumanOrigin_PUBLISHED.pdf",
    r.matchedArtifact && r.matchedArtifact.filename);
}

titre("T3 — V1, un fichier qui n'est ni l'un ni l'autre");
{
  const doc = v1({ sha256: AAA, filename: "note.docx", mime: DOCX },
                 { sha256: BBB, filename: "pub.pdf", mime: "application/pdf" });
  const r = m(doc, { sha256: CCC, filename: "autre.pdf", mime: "application/pdf" });
  ck("T3 · NO_MATCH", r.status === "NO_MATCH", r.status + " · " + r.reason);
  ck("T3 · aucun rôle n'est attribué", r.matchedRole === null);
}

titre("T4 — schéma ancien, source DOCX, copie PDF dérivée");
{
  const doc = v1({ sha256: AAA, filename: "note.docx", mime: DOCX });   // pas de publication
  const r = m(doc, { sha256: BBB, filename: "note.pdf", mime: "application/pdf" });
  ck("T4 · NOT_VERIFIABLE, pas un mismatch", r.status === "NOT_VERIFIABLE", r.status + " · " + r.reason);
  ck("T4 · la raison nomme l'empreinte manquante",
    r.reason === "derived_copy_without_published_fingerprint", r.reason);
}

titre("T5 — schéma ancien, source DOCX, un autre DOCX");
{
  const doc = v1({ sha256: AAA, filename: "note.docx", mime: DOCX });
  const r = m(doc, { sha256: CCC, filename: "autre.docx", mime: DOCX });
  ck("T5 · NO_MATCH", r.status === "NO_MATCH", r.status + " · " + r.reason);
  ck("T5 · parce que c'est la même nature de fichier",
    r.reason === "same_kind_as_bound_artifact", r.reason);
}

titre("T6 — format historique, correspondance exacte");
{
  const doc = legacy({ sha256: AAA, filename: "vieux.pdf", mime: "application/pdf" });
  const r = m(doc, { sha256: AAA, filename: "vieux.pdf", mime: "application/pdf" });
  ck("T6 · MATCH_LEGACY", r.status === "MATCH_LEGACY", r.status + " · " + r.reason);
  ck("T6 · aucun rôle que le schéma ne permet pas d'établir",
    r.matchedRole === "legacy_document", r.matchedRole);
}

titre("T7 — une preuve qui ne porte aucune empreinte exploitable");
{
  const r1 = m(v1({ filename: "note.docx" }), { sha256: AAA, filename: "note.docx", mime: DOCX });
  ck("T7 · NOT_VERIFIABLE", r1.status === "NOT_VERIFIABLE", r1.status + " · " + r1.reason);
  ck("T7 · la raison le dit", r1.reason === "proof_carries_no_fingerprint", r1.reason);
  const r2 = m(v1({ sha256: "pas-une-empreinte" }), { sha256: AAA, filename: "n.docx", mime: DOCX });
  ck("T7 · une empreinte malformée n'est pas une empreinte", r2.status === "NOT_VERIFIABLE", r2.reason);
  const r3 = m(v1({ sha256: AAA }), { sha256: null, filename: "n.docx", mime: DOCX });
  ck("T7 · aucun fichier fourni : rien n'est conclu", r3.status === "NOT_VERIFIABLE", r3.reason);
}

titre("T8 — priorité à la copie publiée");
{
  // Le cas pathologique : les deux artefacts portent la MÊME empreinte. Le résultat doit
  // rester « copie publiée », parce que c'est l'artefact que le destinataire tient.
  const doc = v1({ sha256: BBB, filename: "note.docx", mime: DOCX },
                 { sha256: BBB, filename: "pub.pdf", mime: "application/pdf" });
  const r = m(doc, { sha256: BBB, filename: "pub.pdf", mime: "application/pdf" });
  ck("T8 · MATCH_PUBLISHED l'emporte", r.status === "MATCH_PUBLISHED", r.status);
  ck("T8 · jamais un mismatch sur la source", r.status !== "NO_MATCH");
}

titre("garde-fou : une signature invalide retire la valeur d'attestation");
{
  const doc = v1({ sha256: AAA, filename: "note.docx", mime: DOCX },
                 { sha256: BBB, filename: "pub.pdf", mime: "application/pdf" });
  const bon = m(doc, { sha256: BBB, filename: "pub.pdf", mime: "application/pdf" },
                { signatureOk: false });
  ck("l'état reste factuel", bon.status === "MATCH_PUBLISHED", bon.status);
  ck("mais il ne vaut pas attestation", bon.attested === false);
  const ok = m(doc, { sha256: BBB, filename: "pub.pdf", mime: "application/pdf" });
  ck("signature vérifiée : l'attestation revient", ok.attested === true);
  const sans = m(doc, { sha256: CCC, filename: "x.pdf", mime: "application/pdf" });
  ck("un non-match n'est jamais « attesté »", sans.attested === false);
}

titre("aucune empreinte n'est inventée");
{
  const doc = v1({ sha256: AAA, filename: "note.docx", mime: DOCX },
                 { sha256: BBB, filename: "pub.pdf", mime: "application/pdf" });
  const arts = AB.getExpectedArtifacts(doc);
  ck("exactement les deux artefacts déclarés", arts.length === 2,
    arts.map(a => a.role).join(", "));
  ck("et leurs empreintes sont celles du payload",
    arts[0].sha256 === AAA && arts[1].sha256 === BBB);
  ck("un payload sans publication ne produit qu'un artefact",
    AB.getExpectedArtifacts(v1({ sha256: AAA })).length === 1);
  ck("un payload vide n'en produit aucun",
    AB.getExpectedArtifacts({}).length === 0);
  // Une empreinte reconstruite serait une inférence : le module ne doit contenir aucun calcul.
  const src = fs.readFileSync(path.join(RACINE, "artifact_binding.js"), "utf8");
  ck("le module ne calcule aucune empreinte",
    !/createHash|crypto\.subtle|digest\s*\(/.test(src));
  ck("le module ne sort pas sur le réseau",
    !/fetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket/.test(src));
}

titre("le module et la page lisent le format de la même façon");
{
  // `isHoJsonV1` vit dans index.html pour le chemin cryptographique, qui ne doit pas bouger.
  // Deux lectures divergentes du même format donneraient deux contrats d'artefacts.
  const page = fs.readFileSync(path.join(RACINE, "index.html"), "utf8");
  const bloc = /function isHoJsonV1\([^)]*\)\{[^}]*\}/.exec(page);
  ck("isHoJsonV1 est toujours là, intact", !!bloc);
  if (bloc) {
    const isHoJsonV1 = new Function("return " + bloc[0] + "; ")() ||
      new Function(bloc[0] + "\nreturn isHoJsonV1;")();
    const cas = [
      v1({ sha256: AAA }), legacy({ sha256: AAA }), {}, { format: "humanorigin-hojson" },
      { format: "humanorigin-hojson", version: "1.0", payload: {}, signatures: [] },
      { format: "humanorigin-hojson", version: "2.0", payload: {}, signatures: [{}] },
    ];
    const divergents = cas.filter(d => !!isHoJsonV1(d) !== AB.estV1(d));
    ck("les deux prédicats s'accordent sur tous les cas", divergents.length === 0,
      String(divergents.length) + " divergence(s)");
  }
}

titre("nature d'un fichier : « je ne sais pas » est une réponse");
{
  ck("extension du nom", AB.natureDe("a.PDF", null) === "pdf");
  ck("type MIME quand le nom ne dit rien", AB.natureDe("sans-extension", DOCX) === "docx");
  ck("rien des deux : indéterminé", AB.natureDe(null, null) === null);
  ck("et l'indétermination ne produit pas un mismatch",
    m(v1({ sha256: AAA }), { sha256: CCC, filename: null, mime: null }).status === "NOT_VERIFIABLE");
}

// ---------------------------------------------------------------- kit réel, en option
// Lecture ZIP minimale, sans dépendance : répertoire central puis dégonflage des entrées.
function entreesZip(buf) {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error("ZIP illisible");
  const n = buf.readUInt16LE(eocd + 8); let pos = buf.readUInt32LE(eocd + 16);
  const out = [];
  for (let i = 0; i < n; i++) {
    if (buf.readUInt32LE(pos) !== 0x02014b50) break;
    const methode = buf.readUInt16LE(pos + 10), taille = buf.readUInt32LE(pos + 20);
    const lNom = buf.readUInt16LE(pos + 28), lExtra = buf.readUInt16LE(pos + 30),
          lCom = buf.readUInt16LE(pos + 32), local = buf.readUInt32LE(pos + 42);
    const nom = buf.subarray(pos + 46, pos + 46 + lNom).toString("utf8");
    if (!nom.endsWith("/")) out.push({ nom, methode, taille, local });
    pos += 46 + lNom + lExtra + lCom;
  }
  return out;
}
function lireEntree(buf, e) {
  const nl = buf.readUInt16LE(e.local + 26), el = buf.readUInt16LE(e.local + 28);
  const d = buf.subarray(e.local + 30 + nl + el, e.local + 30 + nl + el + e.taille);
  return e.methode === 0 ? d : zlib.inflateRawSync(d);
}

const KIT = process.argv[2];
if (KIT) {
  titre("kit réel — le parcours nominal du destinataire");
  const buf = fs.readFileSync(KIT);
  const entrees = entreesZip(buf);
  const ePreuve = entrees.find(e => e.nom.endsWith(".ho.json"));
  const ePdf = entrees.find(e => /\.pdf$/i.test(e.nom));
  ck("le kit contient une preuve", !!ePreuve);
  // Certains kits ne livrent que la preuve et son README — pas de PDF publié, et pas de
  // bloc `publication` dans le payload. C'est une forme légitime, pas un échec du contrat.
  if (ePreuve && !ePdf) console.log("    kit sans PDF publié : cas non applicable");
  if (ePreuve && ePdf) {
    const doc = JSON.parse(lireEntree(buf, ePreuve).toString("utf8"));
    const pdf = lireEntree(buf, ePdf);
    const sha = crypto.createHash("sha256").update(pdf).digest("hex");
    const arts = AB.getExpectedArtifacts(doc);
    const src = arts.find(a => a.role === "bound_source_document");
    const pub = arts.find(a => a.role === "published_circulation_copy");
    const r = AB.matchProvidedArtifact({ doc, sha256: sha, filename: "copie.pdf",
      mime: "application/pdf", roleHint: "published_circulation_copy", signatureOk: true });
    const c = (x) => x ? x.slice(0, 12) + "…" : "—";
    console.log(`    source_sha256        ${c(src && src.sha256)}`);
    console.log(`    published_sha256     ${c(pub && pub.sha256)}`);
    console.log(`    provided_pdf_sha256  ${c(sha)}`);
    console.log(`    match_status         ${r.status}`);
    ck("le PDF livré est bien celui que la preuve publie", pub && sha === pub.sha256);
    ck("MATCH_PUBLISHED", r.status === "MATCH_PUBLISHED", r.status);
    ck("et jamais NO_MATCH, qui était le résultat avant ce patch", r.status !== "NO_MATCH");
  }
}

console.log(`\n  ${p} réussis · ${f} échoués\n`);
process.exit(f ? 1 : 0);
