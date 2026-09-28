// Assemble dist-artifact/ en un seul fragment HTML autonome (sans balises html/head/body).
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
const dir = 'dist-artifact/assets'
const js = readdirSync(dir).find((f) => f.endsWith('.js'))
const css = readdirSync(dir).find((f) => f.endsWith('.css'))
const out = process.argv[2] ?? 'dist-artifact/flux.html'
const html = `<title>FLUX MJAGENCY</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap">
<script>try{document.documentElement.dataset.theme=localStorage.getItem('flux-theme')||'nuit'}catch(e){document.documentElement.dataset.theme='nuit'}</script>
<style>${readFileSync(`${dir}/${css}`, 'utf8')}</style>
<div id="root"></div>
<script type="module">${readFileSync(`${dir}/${js}`, 'utf8').replace(/<\/script/g, '<\\/script')}</script>
`
writeFileSync(out, html)
console.log('écrit', out, (html.length / 1024 / 1024).toFixed(2) + ' Mo')
