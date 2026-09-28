import { type RefObject, useEffect, useId, useRef, useState } from 'react'
import {
  Camera,
  Mesh,
  NoBlending,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three'

/* ── Sphère de verre dépoli remplie de liquide ───────────────────────────────
   Un seul quad plein cadre, un seul draw call : le fragment shader lance un
   rayon par pixel, l'intersecte avec la coque de verre (réfraction légère),
   puis avec un liquide borné par la sphère intérieure et une surface ondulée
   (champ de hauteur animé). Tout le rendu (verre, liquide, ménisque, bulles,
   ombre portée) est analytique : aucune texture, aucun asset externe. */

type Props = {
  /** Niveau de remplissage, 0..1 (borné). */
  level: number
  className?: string
  /** Libellé accessible ; par défaut « Trésorerie disponible : NN % ». */
  label?: string
}

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0)

/** Rayon intérieur de la coque (le rayon extérieur vaut 1). */
const RI = 0.95
/** Niveau 0..1 → hauteur de la surface dans l'espace de la sphère. */
const levelToY = (l: number) => -RI - 0.03 + l * (2 * RI + 0.06)

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)'

/** Sonde WebGL2 unique par page : évite à three.js de journaliser des erreurs
 *  (et de créer un contexte pour rien) quand le navigateur n'en a pas. */
let webgl2Support: boolean | null = null
function hasWebGL2() {
  if (webgl2Support !== null) return webgl2Support
  try {
    const gl = document.createElement('canvas').getContext('webgl2')
    webgl2Support = !!gl
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
  } catch {
    webgl2Support = false
  }
  return webgl2Support
}

function readTriplet(style: CSSStyleDeclaration, name: string, fallback: [number, number, number]) {
  const parts = style
    .getPropertyValue(name)
    .trim()
    .split(/[\s,/]+/)
    .filter(Boolean)
    .slice(0, 3)
    .map(Number)
  if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) {
    return parts.map((n) => Math.min(255, Math.max(0, n)) / 255) as [number, number, number]
  }
  return fallback.map((n) => n / 255) as [number, number, number]
}

function readTheme() {
  const style = getComputedStyle(document.documentElement)
  const accent = readTriplet(style, '--accent', [196, 242, 106])
  const deep = readTriplet(style, '--accent-deep', [94, 158, 47])
  const bg = readTriplet(style, '--card', [29, 30, 33])
  const lum = 0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2]
  return { accent, deep, light: lum > 0.5 ? 1 : 0 }
}

// ── Shaders ───────────────────────────────────────────────────────────────────

const VERT = /* glsl */ `
varying vec2 vP;
void main() {
  vP = position.xy;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const FRAG = /* glsl */ `
varying vec2 vP;
uniform float uTime;
uniform float uLevel;
uniform float uWave;
uniform vec2  uTilt;
uniform vec3  uAccent;
uniform vec3  uDeep;
uniform float uLight;
uniform float uPx;

const float R = 1.0;
const float RI = ${RI.toFixed(3)};
const float CAM_D = 4.0;
const float K = 0.29;

vec2 hitSphere(vec3 ro, vec3 rd, float r) {
  float b = dot(ro, rd);
  float c = dot(ro, ro) - r * r;
  float h = b * b - c;
  if (h < 0.0) return vec2(-1.0);
  h = sqrt(h);
  return vec2(-b - h, -b + h);
}

float surf(vec2 xz) {
  float t = uTime;
  float w = sin(xz.x * 3.3 + t * 1.25) * 0.5
          + sin(xz.y * 2.6 - t * 0.95 + 1.7) * 0.35
          + sin((xz.x * 0.8 - xz.y) * 6.1 + t * 1.8) * 0.15;
  return uLevel + dot(uTilt, xz) + w * uWave;
}

float hash1(float n) { return fract(sin(n * 127.1) * 43758.5453); }

vec4 over(vec4 top, vec4 base) { return top + base * (1.0 - top.a); }

void main() {
  vec3 L = normalize(vec3(-0.55, 0.75, 0.5));
  vec3 ro = CAM_D * normalize(vec3(0.0, 0.15, 1.0));
  vec3 fw = normalize(-ro);
  vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(rt, fw);
  vec3 rd = normalize(fw + (vP.x * rt + vP.y * up) * K);

  float b = dot(ro, rd);
  float dist = length(ro - b * rd);
  float aa = max(fwidth(dist), 1e-4);
  float cover = 1.0 - smoothstep(R - aa, R + aa * 0.5, dist);

  // ── Ombre portée + halo, sous la sphère ──
  vec2 sp = (vP - vec2(0.0, -0.9)) / vec2(0.5, 0.075);
  float shadow = exp(-dot(sp, sp)) * mix(0.42, 0.14, uLight);
  vec4 col = vec4(0.0, 0.0, 0.0, shadow);
  float fillAmt = smoothstep(-RI, 0.2, uLevel);
  float halo = exp(-max(dist - R, 0.0) * 18.0) * smoothstep(0.3, -0.9, vP.y) * (1.0 - uLight) * 0.10 * fillAmt;
  col = over(vec4(uAccent * halo, halo), col);

  if (dist < R + aa) {
    float dc = min(dist, R - 1e-4);
    float hh = sqrt(R * R - dc * dc);
    vec3 P0 = ro + rd * (-b - hh);
    vec3 N0 = normalize(P0);
    vec3 P1 = ro + rd * (-b + hh);
    vec3 N1 = normalize(P1);
    float ndv = clamp(dot(N0, -rd), 0.0, 1.0);

    vec3 rd2 = refract(rd, N0, 1.0 / 1.06);
    vec2 ti = hitSphere(P0, rd2, RI);
    float shell = ti.x > 0.0 ? ti.x : 0.6;

    // ── Paroi du fond, vue de l'intérieur ──
    float backF = pow(1.0 - clamp(dot(N1, rd), 0.0, 1.0), 3.0);
    vec3 backC = mix(vec3(1.0), vec3(0.40, 0.44, 0.52), uLight);
    vec4 layer = vec4(backC, 1.0) * (mix(0.035, 0.02, uLight) + backF * mix(0.16, 0.12, uLight));
    float caust = pow(max(dot(N1, normalize(vec3(0.5, -0.62, -0.6))), 0.0), 10.0);
    float bounce = exp(-max(P1.y - uLevel, 0.0) * 5.0) * step(-RI, uLevel) * 0.10;
    layer.rgb += vec3(1.0) * caust * mix(0.10, 0.0, uLight) + uAccent * bounce;
    layer.a = clamp(layer.a + caust * mix(0.10, 0.0, uLight) + bounce, 0.0, 1.0);

    // ── Liquide ──
    if (ti.y > 0.0 && uLevel > -RI - 0.02) {
      float tA = ti.x;
      float tB = ti.y;
      vec3 qA = P0 + rd2 * tA;
      vec3 qB = P0 + rd2 * tB;
      float hMax = uLevel + length(uTilt) + uWave * 1.1;
      float tl = -1.0;
      bool top = false;
      if (min(qA.y, qB.y) < hMax) {
        if (qA.y < surf(qA.xz)) {
          tl = tA;
        } else {
          float st = (tB - tA) / 18.0;
          float tp = tA;
          for (int i = 1; i <= 18; i++) {
            float tc = tA + st * float(i);
            vec3 qc = P0 + rd2 * tc;
            if (qc.y < surf(qc.xz)) {
              float lo = tp;
              float hi = tc;
              for (int j = 0; j < 5; j++) {
                float m = 0.5 * (lo + hi);
                vec3 qm = P0 + rd2 * m;
                if (qm.y < surf(qm.xz)) hi = m; else lo = m;
              }
              tl = hi;
              top = true;
              break;
            }
            tp = tc;
          }
        }
      }

      if (tl > 0.0) {
        vec3 q = P0 + rd2 * tl;
        float sH = surf(q.xz);
        float fillH = max(sH + RI, 0.7);
        float depth = clamp((sH - q.y) / fillH, 0.0, 1.0);
        float thick = clamp((tB - tl) / (2.0 * RI), 0.0, 1.0);

        vec3 c = mix(uAccent, uDeep, pow(depth, 0.7));
        c = mix(c, uDeep * 0.85, thick * 0.15);
        vec3 nq = normalize(q);
        c *= mix(0.78, 1.06, dot(nq, L) * 0.5 + 0.5);
        c += uAccent * 0.10 * exp(-(sH - q.y) / 0.18);
        float glow = pow(max(dot(normalize(q), normalize(vec3(0.55, -0.55, 0.35))), 0.0), 3.0);
        c += uAccent * glow * 0.16;

        if (top) {
          float e = 0.01;
          float dhx = (surf(q.xz + vec2(e, 0.0)) - surf(q.xz - vec2(e, 0.0))) / (2.0 * e);
          float dhz = (surf(q.xz + vec2(0.0, e)) - surf(q.xz - vec2(0.0, e))) / (2.0 * e);
          vec3 ns = normalize(vec3(-dhx, 1.0, -dhz));
          float fr = pow(1.0 - max(dot(ns, -rd2), 0.0), 4.0);
          vec3 sc = mix(uAccent, vec3(1.0), 0.10);
          sc = mix(sc, mix(uAccent, uDeep, 0.45), 0.35 * (1.0 - fr));
          sc += vec3(1.0) * fr * 0.22;
          float gl = pow(max(dot(reflect(rd2, ns), L), 0.0), 40.0);
          sc += vec3(gl * 0.45);
          float rr = sqrt(max(RI * RI - sH * sH, 0.0));
          float edge = rr - length(q.xz);
          float men = exp(-max(edge, 0.0) / 0.03);
          sc = mix(sc, mix(uAccent, vec3(1.0), 0.65), men * 0.8);
          c = sc;
        } else {
          float foam = exp(-(sH - q.y) / 0.022);
          c = mix(c, mix(uAccent, vec3(1.0), 0.6), foam * 0.85);
        }

        // Bulles : quelques petites sphères qui montent lentement.
        float pw = uPx * K * CAM_D;
        float yTop = uLevel - 0.05;
        float yBot = -RI * 0.82;
        if (yTop > yBot + 0.1) {
          for (int i = 0; i < 7; i++) {
            float fi = float(i);
            float h1 = hash1(fi + 1.3);
            float h2 = hash1(fi * 3.7 + 2.1);
            float h3 = hash1(fi * 7.1 + 5.3);
            float prog = fract(uTime * (0.07 + 0.06 * h1) + h2);
            float yb = mix(yBot, yTop, prog);
            float rad = 0.010 + 0.012 * h3;
            float ang = h1 * 6.2832 + prog * 1.2;
            float rr = sqrt(max(RI * RI - yb * yb, 0.0)) * (0.2 + 0.5 * h3);
            vec3 cb = vec3(cos(ang) * rr + 0.015 * sin(uTime * 2.0 + fi * 1.7), yb, sin(ang) * rr);
            float tc = dot(cb - P0, rd2);
            if (tc < tl) continue;
            float d = length(P0 + rd2 * tc - cb);
            float disk = 1.0 - smoothstep(rad - pw, rad + pw, d);
            float ring = disk * smoothstep(rad * 0.3, rad, d);
            float fade = smoothstep(0.0, 0.12, prog) * (1.0 - smoothstep(0.82, 1.0, prog));
            fade *= exp(-(tc - tl) * 1.6);
            c = mix(c, mix(uAccent, vec3(1.0), 0.8), (ring * 0.55 + disk * 0.12) * fade);
          }
        }

        // Bord du liquide contre la paroi : adouci (verre dépoli, et anticrénelage).
        float dIn = length(P0 - dot(P0, rd2) * rd2);
        float soft = 1.0 - smoothstep(RI - 0.008 - pw * 1.5, RI, dIn);
        float la = (0.9 + 0.08 * smoothstep(0.0, 0.4, thick)) * soft;
        layer = over(vec4(c * la, la), layer);
      }
    }

    // ── Coque avant : voile dépoli, liseré, reflets ──
    float rim = pow(1.0 - ndv, 2.4);
    float milk = smoothstep(0.05, 0.55, shell);
    float veilA = mix(0.03, 0.05, uLight) + milk * mix(0.14, 0.20, uLight);
    vec3 veilC = mix(vec3(1.0), vec3(0.97, 0.98, 1.0), uLight);
    // Le verre dépoli diffuse la couleur du liquide qu'il recouvre.
    float wet = smoothstep(0.03, -0.03, P0.y - surf(P0.xz)) * step(-RI - 0.02, uLevel);
    veilC = mix(veilC, mix(uAccent, vec3(1.0), 0.35), wet * milk * 0.7);
    layer = over(vec4(veilC, 1.0) * veilA, layer);
    float rimA = rim * mix(0.34, 0.30, uLight);
    vec3 rimC = mix(vec3(1.0), vec3(0.36, 0.40, 0.48), uLight);
    layer = over(vec4(rimC, 1.0) * rimA, layer);
    float inner = exp(-pow((ndv - 0.18) / 0.07, 2.0)) * mix(0.10, 0.30, uLight);
    layer = over(vec4(1.0) * inner, layer);

    vec3 rf = reflect(rd, N0);
    // Reflet d'une « fenêtre » : un arc doux qui suit le bord, en haut à gauche.
    vec2 dir = normalize(vec2(-0.62, 0.78));
    vec2 nxy = N0.xy / max(length(N0.xy), 1e-3);
    float ang = dot(nxy, dir);
    float arc = smoothstep(0.55, 0.98, ang) * smoothstep(0.08, 0.2, ndv) * (1.0 - smoothstep(0.22, 0.45, ndv));
    float sheen = smoothstep(0.9, 0.99, dot(rf, L));
    float spot = pow(max(dot(rf, L), 0.0), 900.0);
    float low = smoothstep(0.6, 0.96, dot(rf, normalize(vec3(0.35, -0.8, 0.45)))) * rim;
    float hl = arc * 0.15 + sheen * 0.10 + spot * 0.7 + low * 0.16;
    layer.rgb += vec3(hl);
    layer.a = clamp(layer.a + hl, 0.0, 1.0);
    layer.rgb = min(layer.rgb, vec3(layer.a));

    col = over(layer * cover, col);
  }

  gl_FragColor = col;
}
`

// ── Rendu WebGL ───────────────────────────────────────────────────────────────

type SphereApi = {
  setLevel: (v: number) => void
  resize: (px: number) => void
}

function useSquareSize(ref: RefObject<HTMLDivElement>) {
  const [size, setSize] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      setSize(Math.max(0, Math.floor(Math.min(w, h > 0 ? h : w))))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return size
}

export default function LiquidSphere({ level, className, label }: Props) {
  const target = clamp01(level)
  const wrapRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const apiRef = useRef<SphereApi | null>(null)
  const targetRef = useRef(target)
  targetRef.current = target
  const size = useSquareSize(wrapRef)
  const sizeRef = useRef(size)
  sizeRef.current = size
  const [failed, setFailed] = useState(() => typeof document === 'undefined' || !hasWebGL2())

  useEffect(() => {
    if (failed) return
    const stage = stageRef.current
    if (!stage) return

    let renderer: WebGLRenderer
    try {
      renderer = new WebGLRenderer({ alpha: true, antialias: false, premultipliedAlpha: true, powerPreference: 'low-power' })
    } catch {
      setFailed(true)
      return
    }
    renderer.setClearColor(0x000000, 0)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    const canvas = renderer.domElement
    canvas.style.display = 'block'
    canvas.setAttribute('aria-hidden', 'true')
    stage.appendChild(canvas)

    const onLost = (e: Event) => {
      e.preventDefault()
      setFailed(true)
    }
    canvas.addEventListener('webglcontextlost', onLost)

    const uniforms = {
      uTime: { value: 1.7 },
      uLevel: { value: levelToY(0) },
      uWave: { value: 0.014 },
      uTilt: { value: new Vector2() },
      uAccent: { value: new Vector3() },
      uDeep: { value: new Vector3() },
      uLight: { value: 0 },
      uPx: { value: 0.01 },
    }
    const geometry = new PlaneGeometry(2, 2)
    const material = new ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms,
      blending: NoBlending,
      depthTest: false,
      depthWrite: false,
    })
    const mesh = new Mesh(geometry, material)
    mesh.frustumCulled = false
    const scene = new Scene()
    scene.add(mesh)
    const camera = new Camera()

    const media = window.matchMedia(REDUCED_QUERY)
    let reduced = media.matches
    let onScreen = true
    let pageVisible = document.visibilityState !== 'hidden'

    // État physique : niveau affiché (ressort) + ballottement (oscillateur amorti).
    let pos = reduced ? targetRef.current : 0
    let vel = 0
    let slosh = 0
    let sloshV = 0
    let time = 1.7
    let raf = 0
    let running = false
    let last = 0
    let px = 0

    const applyTheme = () => {
      const t = readTheme()
      uniforms.uAccent.value.set(...t.accent)
      uniforms.uDeep.value.set(...t.deep)
      uniforms.uLight.value = t.light
    }

    const draw = () => {
      if (px <= 0) return
      const tiltIdle = reduced ? 0 : 0.006 * Math.sin(time * 0.8)
      uniforms.uTime.value = time
      uniforms.uLevel.value = levelToY(pos)
      uniforms.uTilt.value.set(slosh + tiltIdle, slosh * 0.3)
      uniforms.uWave.value = Math.min(0.05, 0.014 + Math.abs(slosh) * 0.3 + Math.abs(sloshV) * 0.012)
      renderer.render(scene, camera)
    }

    const step = (dt: number) => {
      time += dt
      const goal = targetRef.current
      // Ressort légèrement sous-amorti : ≈1,2 s pour se poser.
      const w = 4.4
      const z = 0.9
      const acc = -w * w * (pos - goal) - 2 * z * w * vel
      vel += acc * dt
      pos += vel * dt
      if (Math.abs(pos - goal) < 1e-4 && Math.abs(vel) < 1e-4) {
        pos = goal
        vel = 0
      }
      // Le ballottement est excité par l'accélération du niveau, puis s'amortit.
      const sw = 6.0
      const sz = 0.3
      const sAcc = -sw * sw * slosh - 2 * sz * sw * sloshV + acc * 0.55
      sloshV += sAcc * dt
      slosh = Math.max(-0.12, Math.min(0.12, slosh + sloshV * dt))
    }

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60
      last = now
      step(dt)
      draw()
    }

    const shouldRun = () => !reduced && onScreen && pageVisible && px > 0
    const sync = () => {
      if (shouldRun()) {
        if (!running) {
          running = true
          last = 0
          raf = requestAnimationFrame(frame)
        }
      } else {
        if (running) {
          running = false
          cancelAnimationFrame(raf)
        }
        draw()
      }
    }

    const resize = (next: number) => {
      if (next <= 0 || next === px) return
      px = next
      renderer.setSize(px, px)
      uniforms.uPx.value = 2 / (px * renderer.getPixelRatio())
      if (!running) draw()
      sync()
    }

    apiRef.current = {
      setLevel: (v) => {
        if (reduced) {
          pos = v
          vel = 0
          slosh = 0
          sloshV = 0
          draw()
        }
        // Sinon la boucle rejoint la cible d'elle-même (y compris à la reprise).
      },
      resize,
    }

    applyTheme()
    resize(sizeRef.current)
    sync()

    const onMotion = () => {
      reduced = media.matches
      if (reduced) {
        pos = targetRef.current
        vel = slosh = sloshV = 0
      }
      sync()
    }
    media.addEventListener('change', onMotion)

    const onVisibility = () => {
      pageVisible = document.visibilityState !== 'hidden'
      sync()
    }
    document.addEventListener('visibilitychange', onVisibility)

    const io = new IntersectionObserver((entries) => {
      onScreen = entries.some((e) => e.isIntersecting)
      sync()
    })
    io.observe(stage)

    const mo = new MutationObserver(() => {
      applyTheme()
      if (!running) draw()
    })
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

    return () => {
      running = false
      cancelAnimationFrame(raf)
      apiRef.current = null
      io.disconnect()
      mo.disconnect()
      media.removeEventListener('change', onMotion)
      document.removeEventListener('visibilitychange', onVisibility)
      canvas.removeEventListener('webglcontextlost', onLost)
      scene.remove(mesh)
      geometry.dispose()
      material.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      canvas.remove()
    }
  }, [failed])

  useEffect(() => {
    apiRef.current?.setLevel(target)
  }, [target])

  useEffect(() => {
    apiRef.current?.resize(size)
  }, [size])

  return (
    <div
      ref={wrapRef}
      className={className}
      role="img"
      aria-label={label ?? `Trésorerie disponible : ${Math.round(target * 100)} %`}
      style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 0, minHeight: 0 }}
    >
      {failed ? (
        <FallbackSphere level={target} size={size} />
      ) : (
        <div ref={stageRef} aria-hidden="true" style={{ width: size || '100%', height: size || '100%', flex: 'none' }} />
      )}
    </div>
  )
}

// ── Repli sans WebGL : SVG + CSS ──────────────────────────────────────────────

function FallbackSphere({ level, size }: { level: number; size: number }) {
  const id = useId().replace(/:/g, '')
  // Le cercle va de y=6 à y=94 (r=44) ; la vague a une amplitude de ±2.
  const top = 94 - level * 88
  const wave =
    'M -50 0 ' +
    Array.from({ length: 8 }, (_, i) => `Q ${-50 + i * 25 + 12.5} ${i % 2 ? 2.4 : -2.4} ${-25 + i * 25} 0`).join(' ') +
    ' L 150 120 L -50 120 Z'
  return (
    <svg
      viewBox="0 0 100 100"
      width={size || '100%'}
      height={size || '100%'}
      aria-hidden="true"
      style={{ display: 'block', flex: 'none', overflow: 'visible' }}
    >
      <style>{`
        @keyframes ls-wave-${id} { from { transform: translateX(0) } to { transform: translateX(-50px) } }
        .ls-wave-${id} { animation: ls-wave-${id} 7s linear infinite; }
        .ls-wave2-${id} { animation: ls-wave-${id} 11s linear infinite reverse; }
        .ls-level-${id} { transition: transform 1.2s cubic-bezier(.22,1,.36,1); }
        @media (prefers-reduced-motion: reduce) {
          .ls-wave-${id}, .ls-wave2-${id} { animation: none; }
          .ls-level-${id} { transition: none; }
        }
      `}</style>
      <defs>
        <clipPath id={`c-${id}`}>
          <circle cx="50" cy="50" r="43.2" />
        </clipPath>
        <linearGradient id={`l-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'rgb(var(--accent))' }} />
          <stop offset="1" style={{ stopColor: 'rgb(var(--accent-deep))' }} />
        </linearGradient>
        <radialGradient id={`g-${id}`} cx="0.5" cy="0.45" r="0.55">
          <stop offset="0.6" stopColor="#fff" stopOpacity="0.03" />
          <stop offset="1" stopColor="#fff" stopOpacity="0.16" />
        </radialGradient>
        <radialGradient id={`h-${id}`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`s-${id}`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#000" stopOpacity="0.3" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="50" cy="97" rx="26" ry="3.5" fill={`url(#s-${id})`} />
      <circle cx="50" cy="50" r="44" style={{ fill: 'rgb(var(--txt) / 0.03)' }} />
      <g clipPath={`url(#c-${id})`}>
        <g className={`ls-level-${id}`} style={{ transform: `translateY(${top}px)` }}>
          <path className={`ls-wave2-${id}`} d={wave} style={{ fill: 'rgb(var(--accent))', opacity: 0.35 }} />
          <path className={`ls-wave-${id}`} d={wave} fill={`url(#l-${id})`} style={{ opacity: 0.95 }} />
        </g>
      </g>
      <circle cx="50" cy="50" r="44" fill={`url(#g-${id})`} />
      <circle cx="50" cy="50" r="43.6" fill="none" strokeWidth="0.8" style={{ stroke: 'rgb(var(--txt) / 0.16)' }} />
      <ellipse cx="36" cy="24" rx="13" ry="7" fill={`url(#h-${id})`} transform="rotate(-35 36 24)" />
    </svg>
  )
}
