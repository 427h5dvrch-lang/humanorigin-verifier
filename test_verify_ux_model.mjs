// test_verify_ux_model.mjs — banc du modèle destinataire.
//
// Il charge `verify_ux_model.js` tel qu'il est servi et exerce les états que le vérificateur
// rencontre. Ce qu'il protège n'est pas une maquette : c'est l'ordre de lecture, et la règle
// qu'une signature invalide retire au payload sa qualité de fait.
//
// Il contrôle aussi que chaque clé produite par le modèle existe dans les DEUX catalogues
// d'index.html — une clé manquante rendrait une ligne vide à l'écran, sans erreur visible.
//
// Aucune dépendance, aucun réseau.
//
//   node test_verify_ux_model.mjs
//
import fs from "node:fs";
import path from "node:path";

const RACINE = path.dirname(new URL(import.meta.url).pathname);
const faux = {};
new Function("window", fs.readFileSync(path.join(RACINE, "verify_ux_model.js"), "utf8"))(faux);
new Function("window", fs.readFileSync(path.join(RACINE, "artifact_binding.js"), "utf8"))(faux);
const M = faux.HO_UX_MODEL, AB = faux.HO_ARTIFACT_BINDING;

// Les deux catalogues, extraits de la page servie. On ne les recopie pas : on les lit.
const PAGE = fs.readFileSync(path.join(RACINE, "index.html"), "utf8");
function catalogue(langue) {
  const i = PAGE.indexOf(langue + ":{title:");
  const j = PAGE.indexOf("ux:{", i);
  const k = PAGE.indexOf("\n        context:{", j);
  const bloc = PAGE.slice(j, k).replace(/,\s*$/, "");
  return new Function("return {" + bloc + "}")().ux;
}
const UX_FR = catalogue("fr"), UX_EN = catalogue("en");

let p = 0, f = 0;
const ck = (n, c, d = "") => { c ? p++ : f++; console.log(`  ${c ? "✓" : "✗"} ${n}${d ? "  → " + d : ""}`); };
const titre = (s) => console.log("\n── " + s + " ──");

const H = (c) => c.repeat(64);
const AAA = H("a"), BBB = H("b"), CCC = H("c");
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// Une preuve V1 réaliste, paramétrable. Les valeurs par défaut décrivent une observation
// ordinaire : rien de court, rien de collé, document modifié pendant l'observation.
function preuve(sur) {
  const base = {
    format: "humanorigin-hojson", version: "1.0", signatures: [{}],
    payload: {
      document: { sha256: AAA, filename: "note.docx", mime: DOCX,
        delta_significant: true, document_contribution_attested: true,
        object_delta: { changed_during_observed_sessions: true },
        process_object_link: { level: "strong" } },
      process_summary: { verdict: "COHERENT", active_ms: 840000, valid_sessions_count: 3,
        evidence_level: "sustained_observed_activity",
        paste_summary: { total_paste_events: 0, paste_dominant_sessions: 0, paste_heavy_sessions: 0 } },
      label_eligibility: { visible_verdict: "COHERENT", paste_cap_applied: false, caps_applied: [] },
      issuer: { key_trust: "local_unregistered_key" },
      observed_process: { limitations: ["no_screen_content_capture", "no_text_content_storage"] },
    },
  };
  const d = JSON.parse(JSON.stringify(base));
  if (sur) sur(d);
  return d;
}
const legacy = (sur) => { const d = { ho: { version: "0.9" }, document: { sha256: AAA },
  score: { verdict: "COHERENT" }, signing: {},
  evidence: { sessions: [{ metrics: { active_seconds: 300, keystrokes: 900, mouse_moves: 40, pastes: 0 } }] } };
  if (sur) sur(d); return d; };

const check = (statut, role) => ({ status: statut, matchedRole: role || null,
  matchedArtifact: null, reason: "", attested: statut.indexOf("MATCH_") === 0, sha256: BBB });

const modele = (o) => M.buildRecipientModel(Object.assign({ proofOk: true, doc: preuve(),
  artifactCheck: null, serverAttestation: null, registryStatus: null }, o));

// Toutes les clés qu'un modèle produit, à plat.
function clesDe(m) {
  const out = [];
  const add = (x) => { if (x && x.key) out.push(x.key); };
  add(m.headline); add(m.explanation); add(m.guard); add(m.documentStatus);
  add(m.trustStatus); add(m.registry);
  if (m.documentStatus && m.documentStatus.detailKey) out.push(m.documentStatus.detailKey);
  if (m.trustStatus && m.trustStatus.detailKey) out.push(m.trustStatus.detailKey);
  if (m.primaryAction) out.push(m.primaryAction.key);
  (m.observedFacts || []).forEach(add); (m.establishedFacts || []).forEach(add);
  (m.limitations || []).forEach(add);
  return out;
}
const TOUS = [];
const enregistre = (nom, m) => { TOUS.push([nom, m]); return m; };

titre("U1 — signature invalide, payload flatteur");
{
  const m = enregistre("U1", modele({ proofOk: false }));
  ck("U1 · le titre dit que la preuve ne peut pas être vérifiée",
    m.headline.key === "ux.hero.invalid", m.headline.key);
  ck("U1 · gravité critique", m.severity === "critical", m.severity);
  ck("U1 · le payload n'est plus une source de faits", m.payloadTrustworthy === false);
  ck("U1 · aucun fait observé n'est présenté", m.observedFacts.length === 0);
  ck("U1 · aucun fait établi n'est présenté", m.establishedFacts.length === 0);
  ck("U1 · le statut du fichier n'est pas évalué",
    m.documentStatus.key === "ux.doc.notAssessed", m.documentStatus.key);
  ck("U1 · les limites restent énoncées", m.limitations.length >= 4);
}

titre("U2 — preuve valide, fichier différent");
{
  const m = enregistre("U2", modele({ artifactCheck: check("NO_MATCH") }));
  ck("U2 · le mismatch domine", m.headline.key === "ux.hero.noMatch", m.headline.key);
  ck("U2 · gravité critique", m.severity === "critical");
  ck("U2 · une porte de sortie est offerte",
    m.primaryAction && m.primaryAction.key === "ux.act.otherFile", m.primaryAction && m.primaryAction.key);
  ck("U2 · aucune accusation dans la formulation",
    !/falsifi|fraud|faux|manipul|tamper/i.test(UX_FR[m.headline.key.slice(3)] + UX_FR[m.explanation.key.slice(3)]));
}

titre("U3 — preuve valide, copie non vérifiable sur ce schéma");
{
  const m = enregistre("U3", modele({ artifactCheck: check("NOT_VERIFIABLE") }));
  ck("U3 · titre neutre", m.headline.key === "ux.hero.notVerifiable", m.headline.key);
  ck("U3 · jamais rouge", m.severity === "neutral", m.severity);
  ck("U3 · ni faux succès, ni faux échec",
    m.documentStatus.tone === "neutral", m.documentStatus.tone);
}

titre("U4 — preuve valide, aucun fichier fourni");
{
  const m = enregistre("U4", modele({}));
  ck("U4 · le titre vient du processus", m.headline.key.indexOf("ux.proc.") === 0, m.headline.key);
  ck("U4 · la ligne fichier dit qu'il n'est pas vérifié",
    m.documentStatus.key === "ux.doc.none", m.documentStatus.key);
  ck("U4 · une seule action, « Vérifier le document »",
    m.primaryAction && m.primaryAction.key === "ux.act.checkDocument", m.primaryAction && m.primaryAction.key);
  ck("U4 · et elle vise l'entrée fichier existante",
    m.primaryAction.action === "pick-file", m.primaryAction.action);
}

titre("U5 — copie publiée vérifiée");
{
  const m = enregistre("U5", modele({ artifactCheck: check("MATCH_PUBLISHED", "published_circulation_copy") }));
  ck("U5 · ligne fichier « Copie publiée vérifiée »",
    m.documentStatus.key === "ux.doc.published", m.documentStatus.key);
  ck("U5 · ton positif", m.documentStatus.tone === "positive");
  ck("U5 · aucune action imposée après la réponse", m.primaryAction === null);
  ck("U5 · le titre reste celui du processus", m.headline.key.indexOf("ux.proc.") === 0, m.headline.key);
}

titre("U6 — document source vérifié");
{
  const m = enregistre("U6", modele({ artifactCheck: check("MATCH_SOURCE", "bound_source_document") }));
  ck("U6 · ligne fichier « Document source vérifié »",
    m.documentStatus.key === "ux.doc.source", m.documentStatus.key);
  ck("U6 · le lien au document est dit quand le moteur l'établit",
    m.headline.key === "ux.proc.linked", m.headline.key);
}

titre("U7 — preuve locale");
{
  const m = enregistre("U7", modele({}));
  ck("U7 · « Preuve signée localement »", m.trustStatus.key === "ux.trust.local", m.trustStatus.key);
  const t = UX_FR["trust.local"] + " " + UX_FR["trust.local.d"];
  ck("U7 · aucune formulation « officielle »", !/officiel|official|certifi/i.test(t), t.slice(0, 60));
  ck("U7 · ton neutre, pas positif", m.trustStatus.tone === "neutral", m.trustStatus.tone);
}

titre("U8 — contre-signature serveur valide");
{
  const m = enregistre("U8", modele({ serverAttestation: { present: true, status: "valid" } }));
  ck("U8 · confiance renforcée", m.trustStatus.key === "ux.trust.countersigned", m.trustStatus.key);
  ck("U8 · elle entre dans ce que la preuve établit",
    m.establishedFacts.some(x => x.key === "ux.est.countersigned"));
  // La portée des faits ne change pas : les limites de doctrine restent les mêmes.
  const sans = modele({});
  ck("U8 · la portée des faits est inchangée",
    m.limitations.length === sans.limitations.length && m.observedFacts.length === sans.observedFacts.length);
}

titre("U9 — insertion externe signalée par le moteur");
{
  const m = enregistre("U9", modele({ doc: preuve(d => {
    d.payload.label_eligibility.paste_cap_applied = true;
    d.payload.process_summary.paste_summary.paste_heavy_sessions = 2; }) }));
  ck("U9 · le titre décrit l'insertion", m.headline.key === "ux.proc.paste", m.headline.key);
  ck("U9 · une garde dit que l'origine n'est pas déterminée",
    m.guard && m.guard.key === "ux.hero.paste.guard");
  ck("U9 · elle figure aussi dans les faits observés",
    m.observedFacts.some(x => x.key === "ux.fact.paste"));
  const t = [m.headline, m.explanation, m.guard].map(x => UX_FR[x.key.slice(3)]).join(" ");
  ck("U9 · jamais « IA », « généré », « suspect », « effort »",
    !/\bia\b|intelligence artificielle|génér|suspect|effort|copier-coller/i.test(t), t.slice(0, 80));
}

titre("U10 — observation courte déclarée par le moteur");
{
  const m = enregistre("U10", modele({ doc: preuve(d => {
    d.payload.process_summary.evidence_level = "short_observed_activity";
    d.payload.label_eligibility.short_evidence = true; }) }));
  ck("U10 · « Observation limitée du processus »", m.headline.key === "ux.proc.short", m.headline.key);
  ck("U10 · gravité neutre, pas un échec", m.severity === "neutral", m.severity);
}

titre("U11 — schéma ancien sans key_trust");
{
  const m = enregistre("U11", modele({ doc: legacy() }));
  ck("U11 · aucune valeur de confiance inventée",
    m.trustStatus.key === "ux.trust.unknown", m.trustStatus.key);
  ck("U11 · aucun « non enregistrée » fabriqué",
    !/non enregistr/i.test(UX_FR[m.trustStatus.key.slice(3)]));
  const facts = m.observedFacts.map(x => x.key);
  ck("U11 · ni frappes ni souris à l'écran",
    !facts.some(k => /keystroke|mouse|frappe|souris/i.test(k + UX_FR[k.slice(3)])), facts.join(", "));
  ck("U11 · aucun zéro inventé", !facts.some(k => k === "ux.fact.pasteLegacy"), facts.join(", "));
  const vide = modele({ doc: legacy(d => { d.evidence.sessions = []; }) });
  ck("U11 · sans métrique, aucun fait n'est affirmé", vide.observedFacts.length === 0);
}

titre("U12 — verdict historique INCOMPLETE");
{
  const m = enregistre("U12", modele({ doc: legacy(d => { d.score.verdict = "INCOMPLETE"; }) }));
  ck("U12 · « Preuve incomplète »", m.headline.key === "ux.proc.incomplete", m.headline.key);
  ck("U12 · état neutre", m.severity === "neutral", m.severity);
  const t = UX_FR["proc.incomplete"] + " " + UX_FR["proc.incomplete.p"];
  ck("U12 · ni suspect, ni invalide, ni IA, ni non humain",
    !/suspect|invalide|\bia\b|non humain|not human/i.test(t), t.slice(0, 70));
}

titre("U13 — preuve révoquée au registre");
{
  const m = enregistre("U13", modele({ registryStatus: { status: "revoked", revocation_reason: "key_compromise" },
    artifactCheck: check("MATCH_PUBLISHED") }));
  ck("U13 · la révocation domine", m.headline.key === "ux.hero.revoked", m.headline.key);
  ck("U13 · gravité critique", m.severity === "critical", m.severity);
  ck("U13 · elle n'est pas reléguée au technique", m.registry && m.registry.tone === "critical");
  ck("U13 · le statut du fichier reste dit, axe distinct",
    m.documentStatus.key === "ux.doc.published", m.documentStatus.key);
}

titre("U14 — registre injoignable");
{
  const m = enregistre("U14", modele({ registryStatus: { status: "offline" },
    artifactCheck: check("MATCH_PUBLISHED") }));
  ck("U14 · une preuve correcte ne devient pas invalide",
    m.severity !== "critical" && m.headline.key.indexOf("ux.proc.") === 0, m.severity + " · " + m.headline.key);
  ck("U14 · le registre est mentionné sans alarme", m.registry && m.registry.tone === "neutral");
  ck("U14 · et il n'entre pas dans ce que la preuve établit",
    !m.establishedFacts.some(x => x.key === "ux.est.registered"));
}

titre("toutes les clés produites existent, en français et en anglais");
{
  const manquent = [];
  for (const [nom, m] of TOUS)
    for (const k of clesDe(m)) {
      const c = k.replace(/^ux\./, "");
      if (UX_FR[c] == null) manquent.push(nom + " fr:" + k);
      if (UX_EN[c] == null) manquent.push(nom + " en:" + k);
    }
  ck("aucune clé sans formulation", manquent.length === 0, manquent.slice(0, 6).join(", "));
  ck("les deux catalogues ont la même taille",
    Object.keys(UX_FR).length === Object.keys(UX_EN).length,
    Object.keys(UX_FR).length + " / " + Object.keys(UX_EN).length);
  const sansEn = Object.keys(UX_FR).filter(k => UX_EN[k] == null);
  ck("et les mêmes clés", sansEn.length === 0, sansEn.slice(0, 5).join(", "));
}

titre("doctrine : ce que HumanOrigin ne dit jamais");
{
  const INTERDITS = [/\b100\s*%/i, /enti[èe]rement humain/i, /\bfully human\b/i,
    /activité humaine/i, /human activity/i, /processus humain/i, /human process/i,
    /probablement humain/i, /probably human/i, /\bsans ia\b/i, /\bno ai\b/i,
    /score d'humanité/i, /humanity score/i, /\bauthentique\b/i, /\bauthentic\b/i,
    /\bcertifi/i, /\bguarantee/i];
  const fautes = [];
  for (const [lang, cat] of [["fr", UX_FR], ["en", UX_EN]])
    for (const k in cat)
      for (const re of INTERDITS)
        if (re.test(cat[k])) fautes.push(`${lang}:${k} ${re}`);
  ck("aucune formulation interdite dans les catalogues", fautes.length === 0, fautes.join(" | "));
  // « suspect » et « atypique » ne doivent plus apparaître dans la surface destinataire.
  const juge = Object.keys(UX_FR).filter(k => /suspect|atypique/i.test(UX_FR[k]));
  ck("ni « suspect » ni « atypique » comme jugement", juge.length === 0, juge.join(", "));
}

titre("H1 → H4 — la confiance ne peut pas être déclarée par le payload");
{
  // `key_trust` vit DANS le payload. Sur une preuve locale auto-signée, il est signé par la
  // clé locale : la preuve se décernerait son propre niveau de confiance.
  const spoof = (v) => preuve(d => { d.payload.issuer.key_trust = v; });
  for (const v of ["server_countersigned", "official_server_key", "registered_humanorigin_key"]) {
    const m = enregistre("H:" + v, modele({ doc: spoof(v), serverAttestation: null }));
    ck(`H1/H2 · key_trust="${v}" → preuve signée localement`,
      m.trustStatus.key === "ux.trust.local", m.trustStatus.key);
    ck(`H1/H2 · et jamais « contre-signée »`, m.trustStatus.key !== "ux.trust.countersigned");
    ck(`H1/H2 · ni dans ce que la preuve établit`,
      !m.establishedFacts.some(x => x.key === "ux.est.countersigned"));
    ck(`H1/H2 · ton jamais positif`, m.trustStatus.tone !== "positive", m.trustStatus.tone);
  }
  const h3 = enregistre("H3", modele({ doc: spoof("local_unregistered_key"),
    serverAttestation: { present: true, status: "valid" } }));
  ck("H3 · attestation serveur vérifiée → contre-signée",
    h3.trustStatus.key === "ux.trust.countersigned" && h3.trustStatus.tone === "positive");
  ck("H3 · et elle entre dans ce que la preuve établit",
    h3.establishedFacts.some(x => x.key === "ux.est.countersigned"));
  for (const st of ["invalid_signature", "hash_mismatch", "local_sig_mismatch",
                    "local_key_mismatch", "unknown_key", "error"]) {
    const m = enregistre("H4:" + st, modele({ doc: spoof("server_countersigned"),
      serverAttestation: { present: true, status: st } }));
    ck(`H4 · attestation « ${st} » → avertissement, sans repli sur key_trust`,
      m.trustStatus.key === "ux.trust.attestationProblem" && m.trustStatus.tone === "warning",
      m.trustStatus.key);
    ck(`H4 · aucune contre-signature établie`,
      !m.establishedFacts.some(x => x.key === "ux.est.countersigned"));
  }
}

titre("H5 / H6 — le registre n'est interrogé que derrière une attestation vérifiée");
{
  // La condition est LUE dans la page, pas recopiée : elle ne peut donc pas diverger.
  const ligne = /const _proofId=([^;]+);/.exec(PAGE);
  ck("la condition de gating existe dans index.html", !!ligne);
  if (ligne) {
    const gate = new Function("_attResult", "_att", "return " + ligne[1] + ";");
    const att = { proof_id: "p-123" };
    ck("H5 · attestation invalide + proof_id → aucun lookup",
      gate({ present: true, status: "invalid_signature" }, att) === null);
    ck("H5 · clé serveur inconnue + proof_id → aucun lookup",
      gate({ present: true, status: "unknown_key" }, att) === null);
    ck("H5 · aucune attestation + proof_id → aucun lookup",
      gate({ present: false, status: "absent" }, att) === null);
    ck("H5 · attestation nulle → aucun lookup", gate(null, att) === null);
    ck("H6 · attestation vérifiée + proof_id → lookup autorisé",
      gate({ present: true, status: "valid" }, att) === "p-123");
    ck("H6 · attestation vérifiée sans proof_id → aucun lookup",
      gate({ present: true, status: "valid" }, {}) === null);
  }
}

titre("H7 — preuve invalide : rien du payload, rien du registre");
{
  const m = enregistre("H7", modele({ proofOk: false,
    doc: preuve(d => { d.payload.issuer.key_trust = "server_countersigned"; }),
    serverAttestation: { present: true, status: "valid" },
    registryStatus: { status: "active" } }));
  ck("H7 · aucun fait observé", m.observedFacts.length === 0);
  ck("H7 · aucun fait établi", m.establishedFacts.length === 0);
  ck("H7 · la confiance est celle de l'intégrité, pas celle du payload",
    m.trustStatus.key === "ux.trust.invalid", m.trustStatus.key);
  ck("H7 · le payload n'est pas une source de faits", m.payloadTrustworthy === false);
}

titre("D1 → D5 — aucune conclusion générique ajoutée après coup");
{
  // La phrase « HumanOrigin atteste un travail observé relié à ce document » était vraie au
  // plus dans un état sur cinq. Elle a été supprimée, pas déplacée.
  for (const [nom, re] of [["fr", /atteste un travail observé relié/], ["en", /attests observed work linked/]])
    ck(`le disclaimer générique n'existe plus dans la page (${nom})`, !re.test(PAGE));
  ck("aucun appelant de disclaimerHtml", !/disclaimerHtml/.test(PAGE));
  // Et la conclusion vient bien, dans chaque état, du modèle.
  const etats = {
    "D1 aucun fichier": modele({}),
    "D2 NO_MATCH": modele({ artifactCheck: check("NO_MATCH") }),
    "D3 NOT_VERIFIABLE": modele({ artifactCheck: check("NOT_VERIFIABLE") }),
    "D4 observation limitée": modele({ doc: preuve(d => {
      d.payload.process_summary.evidence_level = "short_observed_activity"; }) }),
    "D5 match nominal": modele({ artifactCheck: check("MATCH_PUBLISHED") }),
  };
  for (const [nom, m] of Object.entries(etats))
    ck(nom + " · la conclusion vient d'un état nommé",
      !!m.headline.key && !!m.explanation.key && m.headline.key !== m.documentStatus.key,
      m.headline.key);
}

titre("l'ancienne interprétation n'est plus rendue");
{
  ck("proofTierMeta n'a plus d'appelant", (PAGE.match(/[^n] proofTierMeta\(/g) || []).length === 0);
  ck("buildTrustMetaHtml n'a plus d'appelant", (PAGE.match(/[^n] buildTrustMetaHtml\(/g) || []).length === 0);
  ck("tierHtml n'est plus construit", !/const tierHtml=/.test(PAGE));
  ck("_trustMetaHtml n'est plus construit", !/const _trustMetaHtml=/.test(PAGE));
  // Les données restent auditables : le verdict brut et les champs de confiance sont
  // toujours imprimés dans « Données brutes de la preuve ».
  ck("visible_verdict reste dans les données brutes", /visible_verdict:/.test(PAGE));
  ck("raw_engine_verdict aussi", /raw_engine_verdict:/.test(PAGE));
  ck("key_trust aussi", /key_trust: <b>/.test(PAGE));
  ck("proof_trust_level aussi", /proof_trust_level: <b>/.test(PAGE));
}

titre("doctrine : la page entière, replis ouverts compris");
{
  // On contrôle le TEXTE de la page servie, pas seulement le catalogue du modèle : les
  // anciennes surfaces vivent encore dans le fichier et ne doivent plus rien interpréter.
  const RENDU = PAGE.replace(/^\s*\/\/.*$/gm, "");
  const INTERDITS = [
    [/activité humaine/i, "activité humaine"], [/human activity/i, "human activity"],
    [/processus humain/i, "processus humain"], [/human process/i, "human process"],
    [/100\s*%\s*humain/i, "100 % humain"], [/100%\s*human/i, "100% human"],
    [/probablement humain/i, "probablement humain"], [/probably human/i, "probably human"],
    [/\bsans IA\b/i, "sans IA"], [/\bAI-free\b/i, "AI-free"],
    [/contribution humaine/i, "contribution humaine"], [/human contribution/i, "human contribution"],
  ];
  const trouves = INTERDITS.filter(([re]) => re.test(RENDU)).map(([, n]) => n);
  ck("aucune formulation interprétative interdite dans la page", trouves.length === 0,
    trouves.join(", "));
  // « IA » reste permis dans une LIMITE, qui dit ce que le produit ne prouve pas.
  ck("la limite sur l'IA est bien présente",
    /absence totale d'utilisation d'une intelligence artificielle/.test(PAGE));
}

titre("le modèle ne touche à rien d'autre");
{
  const src = fs.readFileSync(path.join(RACINE, "verify_ux_model.js"), "utf8");
  ck("aucun accès au DOM", !/document\.|window\.(?!HO_UX_MODEL)|querySelector|innerHTML/.test(src));
  ck("aucune sortie réseau", !/fetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket/.test(src));
  ck("aucun calcul d'empreinte", !/createHash|crypto\.subtle|nacl\./.test(src));
  ck("aucune phrase en dur : uniquement des clés",
    !/"[A-ZÉÈ][a-zéèêàù'’ ]{14,}"/.test(src.replace(/^\s*\/\/.*$/gm, "")));
}

console.log(`\n  ${p} réussis · ${f} échoués\n`);
process.exit(f ? 1 : 0);
