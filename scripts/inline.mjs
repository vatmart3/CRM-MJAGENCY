// Bundles dist-artifact/ into one self-contained HTML fragment (no html/head/body tags) for hosting as a single page.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
const dir = 'dist-artifact/assets'
const js = readdirSync(dir).find((f) => f.endsWith('.js'))
const css = readdirSync(dir).find((f) => f.endsWith('.css'))
const out = process.argv[2]
const html = `<title>MJAGENCY Cockpit</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap">
<style>${readFileSync(`${dir}/${css}`, 'utf8')}</style>
<div id="root"></div>
<script type="module">${readFileSync(`${dir}/${js}`, 'utf8').replace(/<\/script/g, '<\\/script')}</script>
`
writeFileSync(out, html)
console.log('written', out, (html.length / 1024).toFixed(0) + ' KB')
