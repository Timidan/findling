/**
 * Assemble the 10 generated logo-motion samples into one self-contained HTML
 * gallery using the REAL Findling mark + brand colors.
 *   node scripts/build-logo-gallery.mjs <workflow-output.json> [out.html]
 */
import { readFileSync, writeFileSync } from "node:fs";

const SRC = process.argv[2];
const OUT = process.argv[3] ?? "docs/logo-samples.html";

let raw = readFileSync(SRC, "utf8");
let data;
try {
  data = JSON.parse(raw);
} catch {
  const m = raw.match(/\{[\s\S]*\}/);
  data = JSON.parse(m[0]);
}
const result = data.result
  ? typeof data.result === "string"
    ? JSON.parse(data.result)
    : data.result
  : data;
const samples = (result.samples || []).slice().sort((a, b) => a.n - b.n);
if (samples.length === 0) throw new Error("no samples found in " + SRC);

const MARK_SVG = `<svg class="mark-svg" viewBox="0 0 32 32" aria-hidden="true">
          <path class="mark-bracket" d="M11 5 H5 V11"></path>
          <path class="mark-bracket" d="M21 27 H27 V21"></path>
          <path class="mark-play" d="M13 11 L23 16 L13 21 Z"></path>
        </svg>`;

const tiles = samples
  .map(
    (s) => `      <figure class="tile">
        <div class="stage">
          <span class="s${s.n} mark-lockup">
            ${MARK_SVG}
            <span class="word">Findling</span>
          </span>
        </div>
        <figcaption class="label"><span class="n">${String(s.n).padStart(2, "0")}</span> · <span class="name">${esc(s.name)}</span><span class="one">${esc(s.oneLiner)}</span></figcaption>
      </figure>`,
  )
  .join("\n");

const sampleCss = samples.map((s) => `/* ${s.n} — ${s.name} */\n${s.css}`).join("\n\n");

function esc(t) {
  return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Findling — logo motion (10 samples)</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,400;9..144,500&family=Inter+Tight:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root{
    --ink:#0b0c0e; --card:#14130f; --sage:#8a967b; --cream:#f4f1ea;
    --muted:#a8a39a; --border:rgba(255,255,255,.14);
  }
  *{box-sizing:border-box}
  html,body{margin:0}
  body{
    background:
      radial-gradient(60rem 40rem at 70% -10%, rgba(138,150,123,.10), transparent 60%),
      var(--ink);
    color:var(--cream);
    font-family:'Inter Tight',ui-sans-serif,system-ui,sans-serif;
    -webkit-font-smoothing:antialiased;
  }
  header{padding:48px 36px 6px;max-width:1440px;margin:0 auto}
  h1{font-family:'Fraunces',serif;font-weight:400;font-size:2.4rem;letter-spacing:-.01em;margin:0}
  .sub{color:var(--muted);margin-top:8px;font-size:.92rem}
  .grid{
    display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));
    gap:18px;padding:26px 36px 72px;max-width:1440px;margin:0 auto;
  }
  .tile{
    margin:0;border:1px solid var(--border);border-radius:22px;background:var(--card);
    padding:30px 22px 20px;display:flex;flex-direction:column;align-items:center;gap:16px;min-height:248px;
    transition:border-color .3s ease, transform .3s ease;
  }
  .tile:hover{border-color:rgba(138,150,123,.4);transform:translateY(-2px)}
  .stage{flex:1;display:grid;place-items:center;width:100%}
  .mark-lockup{display:inline-flex;align-items:center;gap:13px;color:var(--sage);cursor:default}
  .mark-svg{width:86px;height:86px;display:block}
  .mark-bracket{fill:none;stroke:currentColor;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round;transform-box:view-box;transform-origin:16px 16px}
  .mark-play{fill:currentColor;stroke:currentColor;stroke-width:2;stroke-linejoin:round;transform-box:view-box;transform-origin:16px 16px}
  .word{font-family:'Fraunces',serif;font-weight:400;font-size:2rem;letter-spacing:-.01em;color:var(--cream);line-height:1}
  .label{text-align:center;display:flex;flex-direction:column;gap:3px}
  .label .n{color:var(--sage);font-weight:600;font-variant-numeric:tabular-nums}
  .label .name{font-weight:500}
  .label .one{color:var(--muted);font-size:.78rem;line-height:1.4;max-width:34ch;margin-top:2px}
  footer{color:var(--muted);font-size:.8rem;text-align:center;padding:0 36px 48px}

  /* ============ per-sample animations (generated, scoped to .sN) ============ */
${sampleCss}
</style>
</head>
<body>
  <header>
    <h1>Findling — logo motion</h1>
    <div class="sub">10 samples of the brand mark animating · hover a tile to see its hover state · tell me the number(s) you want and I'll ship it on the real logo.</div>
  </header>
  <section class="grid">
${tiles}
  </section>
  <footer>The mark + wordmark shown are the real Findling lockup. Each animation is pure CSS — the winner ports straight to the shipped logo.</footer>
</body>
</html>
`;

writeFileSync(OUT, html);
console.log(`wrote ${OUT} with ${samples.length} samples:`);
for (const s of samples) console.log(`  ${String(s.n).padStart(2, "0")} ${s.name}`);
