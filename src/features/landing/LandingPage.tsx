import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, ChartNoAxesCombined, Check, ChevronRight, GraduationCap, Heart, ShieldCheck, TrendingUp } from 'lucide-react';
import { Logo } from '../../components/common/Logo';
import { useAuth } from '../auth/context/AuthContext';
import { GoogleSignInButton } from '../auth/components/GoogleSignInButton';

const focus = 'focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-400';
const primary = `inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-400 px-6 py-3.5 text-sm font-bold text-zinc-950 transition-colors hover:bg-emerald-300 ${focus}`;
const curriculum = [
  { author: 'John J. Wild', title: 'Entiende el negocio', detail: 'Balance, resultados y flujo de caja.', tag: '01 / ESTADOS FINANCIEROS' },
  { author: 'Joel Greenblatt', title: 'Encuentra oportunidades', detail: 'Fórmula Mágica, earnings yield y ROCE.', tag: '02 / SCREENING CUANTITATIVO' },
  { author: 'Philip Fisher', title: 'Reconoce la calidad', detail: 'Ventajas competitivas, directiva y margen de seguridad.', tag: '03 / ANÁLISIS CUALITATIVO' },
  { author: 'John J. Murphy', title: 'Lee las tendencias', detail: 'Soportes, resistencias y medias móviles.', tag: '04 / ANÁLISIS TÉCNICO' },
  { author: 'Stan Weinstein', title: 'Gestiona el riesgo', detail: 'Fases de mercado, stop-loss y tamaño de posición.', tag: '05 / TIMING Y RIESGO' },
];
const comparison = [
  ['Nivel 1 · Fundamentos', 'Incluido', 'Incluido'],
  ['Niveles 2–5 · Metodología completa', 'No incluido', 'Incluidos'],
  ['Simulador · 14 filtros de mercado', 'Incluido', 'Incluido'],
  ['Vidas para recargar el saldo', '3 vidas', 'Ilimitadas'],
  ['Capital inicial de práctica', '10.000 $ ficticios', '10.000 $ ficticios'],
];

function Preview() {
  return <div className="relative mx-auto w-full max-w-lg lg:rotate-2">
    <div aria-hidden="true" className="absolute inset-0 rounded-full bg-emerald-500/10 blur-3xl lg:-inset-6" />
    <div className="relative overflow-hidden rounded-3xl border border-zinc-700 bg-zinc-900 shadow-2xl shadow-black/40">
      <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
        <span className="flex items-center gap-2 text-sm font-semibold"><TrendingUp aria-hidden="true" className="size-4 text-emerald-400" /> Tu próxima versión</span>
        <span className="rounded-full bg-emerald-400/10 px-2.5 py-1 text-[10px] font-semibold tracking-widest text-emerald-300">VISTA DEMO</span>
      </div>
      <div className="p-6 sm:p-8">
        <p className="text-xs font-medium tracking-widest text-zinc-400">CAPITAL PARA APRENDER</p>
        <p className="mt-2 text-4xl font-semibold tracking-tight sm:text-5xl">10.000 <span className="text-2xl text-zinc-500">$</span></p>
        <p className="mt-2 text-sm text-emerald-300">Dinero ficticio. Experiencia práctica.</p>
        <svg viewBox="0 0 400 150" aria-hidden="true" className="mt-6 w-full text-emerald-400">
          <defs><linearGradient id="landing-chart-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="currentColor" stopOpacity="0.2" /><stop offset="100%" stopColor="currentColor" stopOpacity="0" /></linearGradient></defs>
          {[30, 75, 120].map((y) => <path key={y} d={`M0 ${y}H400`} stroke="#27272a" strokeDasharray="4 6" />)}
          <path d="M0 130L35 112L60 120L95 85L120 98L155 60L185 75L220 43L250 57L290 22L325 37L365 12L400 20V150H0Z" fill="url(#landing-chart-fill)" />
          <path d="M0 130L35 112L60 120L95 85L120 98L155 60L185 75L220 43L250 57L290 22L325 37L365 12L400 20" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
        </svg>
        <p className="text-right text-[11px] text-zinc-500">Ilustración, no rentabilidad real</p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4"><BookOpen aria-hidden="true" className="mb-3 size-5 text-emerald-400" /><p className="text-sm font-medium">Aprende el porqué</p><p className="mt-1 text-xs text-zinc-400">5 niveles de formación</p></div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4"><div aria-label="3 vidas" className="mb-3 flex gap-1">{[1, 2, 3].map((life) => <Heart key={life} aria-hidden="true" className="size-5 fill-rose-400/20 text-rose-400" />)}</div><p className="text-sm font-medium">Practica el cómo</p><p className="mt-1 text-xs text-zinc-400">Decide, mide y mejora</p></div>
        </div>
      </div>
    </div>
  </div>;
}

export function LandingPage() {
  const { signInWithGoogle } = useAuth();
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const googlePending = useRef(false);
  async function continueWithGoogle() {
    if (googlePending.current) return;
    googlePending.current = true;
    setGoogleLoading(true);
    setError(null);
    try { await signInWithGoogle(); }
    catch {
      setError('No se pudo conectar con Google. Inténtalo de nuevo o crea tu cuenta con correo.');
      googlePending.current = false;
      setGoogleLoading(false);
    }
  }

  return <div className="min-h-screen bg-zinc-950 text-zinc-100 selection:bg-emerald-400/30">
    <a href="#contenido" className={`sr-only z-50 rounded-lg bg-emerald-400 p-3 font-semibold text-zinc-950 focus:not-sr-only focus:fixed focus:left-4 focus:top-4 ${focus}`}>Saltar al contenido</a>
    <header className="border-b border-zinc-800/80">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-5 px-5 py-5 sm:px-8">
        <div className="flex items-center gap-3"><Logo size="sm" /><span className="hidden text-xs text-zinc-400 sm:inline">Aprende. Practica. Evoluciona.</span></div>
        <nav aria-label="Navegación pública" className="flex flex-wrap items-center gap-5 text-sm">
          <a href="#metodologia" className={`hidden rounded text-zinc-400 hover:text-white sm:block ${focus}`}>Metodología</a>
          <a href="#planes" className={`rounded text-zinc-300 hover:text-white ${focus}`}>Planes</a>
          <Link to="/login" className={`rounded-lg border border-zinc-700 px-4 py-2 font-medium hover:border-emerald-400 ${focus}`}>Entrar</Link>
        </nav>
      </div>
    </header>

    <main id="contenido" tabIndex={-1}>
      <section aria-labelledby="hero-title" className="relative mx-auto grid max-w-7xl items-center gap-14 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-2 lg:gap-20 lg:py-28">
        <div>
          <p className="mb-6 flex items-center gap-2 text-xs font-semibold tracking-[0.18em] text-emerald-300"><span aria-hidden="true" className="size-2 rounded-full bg-emerald-400" /> EDTECH + WEALTHTECH</p>
          <h1 id="hero-title" className="max-w-xl text-5xl leading-[1.08] font-semibold tracking-tight sm:text-6xl lg:text-7xl">Tu mejor inversión.<br /><span className="text-emerald-400">Aprender a invertir.</span></h1>
          <p className="mt-6 max-w-lg text-base leading-relaxed text-zinc-400 sm:text-lg">Convierte la teoría financiera en decisiones. Fórmate con una metodología de 5 niveles y ponla a prueba en tu propia cartera de inversión ficticia.</p>
          <div className="mt-8 max-w-sm">
            <Link to="/login?mode=signup" className={`${primary} w-full`}>Empezar Gratis <ArrowRight aria-hidden="true" className="size-4" /></Link>
            <GoogleSignInButton disabled={googleLoading} loading={googleLoading} showDivider={false} onClick={() => void continueWithGoogle()} />
            {error && <p role="alert" className="mt-4 rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">{error}</p>}
          </div>
          <p className="mt-5 flex items-center gap-2 text-xs text-zinc-400"><ShieldCheck aria-hidden="true" className="size-4 text-emerald-400" /> Empieza sin tarjeta. Practica con dinero ficticio.</p>
        </div>
        <div className="space-y-8"><div className="text-center"><Logo size="lg" /></div><Preview /></div>
      </section>

      <section aria-labelledby="features-title" className="border-y border-zinc-800 bg-zinc-900/30">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8">
          <h2 id="features-title" className="text-3xl font-semibold tracking-tight">Del primer concepto a tu primera estrategia.</h2>
          <div className="mt-10 grid gap-8 md:grid-cols-3">
            {[
              { Icon: GraduationCap, title: 'Academia de 5 niveles', text: 'Lecciones y cuestionarios para construir criterio, desde los estados financieros hasta la gestión del riesgo.', label: '01 / APRENDE' },
              { Icon: ChartNoAxesCombined, title: 'Simulador con 14 filtros', text: 'Explora acciones, cripto, índices y más. Practica con cotizaciones simuladas que se actualizan mientras operas.', label: '02 / EXPERIMENTA' },
              { Icon: Heart, title: 'Sistema de 3 vidas', text: 'Empieza con 10.000 $ ficticios. Cada recarga Free consume una vida: revisa tus decisiones y vuelve con una estrategia.', label: '03 / EVOLUCIONA' },
            ].map(({ Icon, title, text, label }) => <article key={title} className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-7"><div className="flex items-center justify-between"><Icon aria-hidden="true" className="size-7 text-emerald-400" /><span className="text-[10px] tracking-widest text-zinc-500">{label}</span></div><h3 className="mt-7 text-lg font-semibold">{title}</h3><p className="mt-3 text-sm leading-6 text-zinc-400">{text}</p></article>)}
          </div>
        </div>
      </section>

      <section id="metodologia" aria-labelledby="method-title" className="mx-auto max-w-7xl scroll-mt-6 px-5 py-20 sm:px-8">
        <p className="text-xs font-semibold tracking-widest text-emerald-400">UN CAMINO, CINCO PERSPECTIVAS</p>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-5"><h2 id="method-title" className="max-w-xl text-3xl font-semibold tracking-tight sm:text-4xl">Primero el criterio.<br />Después, la operación.</h2><p className="max-w-sm text-sm leading-6 text-zinc-400">Un recorrido educativo con estos autores como referencias. Empieza por los fundamentos y amplía tu visión paso a paso.</p></div>
        <ol className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {curriculum.map((level, index) => <li key={level.author} className="flex flex-col rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5"><div className="mb-8 flex items-center justify-between"><span className="text-3xl font-light text-zinc-600">0{index + 1}</span><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${index === 0 ? 'bg-emerald-400/10 text-emerald-300' : 'bg-zinc-800 text-zinc-400'}`}>{index === 0 ? 'GRATIS' : 'PRO'}</span></div><p className="text-[10px] leading-5 tracking-wider text-zinc-500">{level.tag}</p><h3 className="mt-2 text-base font-semibold">{level.title}</h3><p className="mt-2 text-sm text-emerald-300">{level.author}</p><p className="mt-4 text-sm leading-6 text-zinc-400">{level.detail}</p></li>)}
        </ol>
      </section>

      <section id="planes" aria-labelledby="plans-title" className="border-y border-zinc-800 bg-zinc-900/30 px-5 py-20 sm:px-8">
        <div className="mx-auto max-w-4xl">
          <p className="text-center text-xs font-semibold tracking-widest text-emerald-400">INVIERTE EN TU FORMACIÓN</p>
          <h2 id="plans-title" className="mt-4 text-center text-3xl font-semibold tracking-tight sm:text-4xl">Empieza Free. Crece con Pro.</h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            <article className="rounded-2xl border border-zinc-700 bg-zinc-950 p-7"><h3 className="text-xl font-semibold">Free</h3><p className="mt-5 text-4xl font-semibold">Gratis</p><p className="mt-2 text-sm text-zinc-400">Tu primer paso, sin tarjeta.</p><p className="mt-6 flex items-center gap-2 text-sm"><Check aria-hidden="true" className="size-4 text-emerald-400" /> Nivel 1 + 3 vidas</p><Link to="/login?mode=signup" className={`mt-7 flex justify-center rounded-xl border border-zinc-600 px-4 py-3 text-sm font-semibold hover:bg-zinc-800 ${focus}`}>Crear cuenta Free</Link></article>
            <article className="rounded-2xl border border-emerald-400/60 bg-emerald-400/5 p-7"><div className="flex items-center justify-between"><h3 className="text-xl font-semibold text-emerald-300">Pro</h3><span className="text-[10px] font-semibold tracking-widest text-emerald-300">RUTA COMPLETA</span></div><p className="mt-5 text-3xl font-semibold">A tu siguiente nivel</p><p className="mt-2 text-sm text-zinc-400">Suscripción de pago mediante Stripe.</p><p className="mt-6 flex items-center gap-2 text-sm"><Check aria-hidden="true" className="size-4 text-emerald-400" /> Niveles 1–5 + vidas ilimitadas</p><Link to="/dashboard" className={`${primary} mt-7 w-full`}>Ver Pro en mi cuenta <ChevronRight aria-hidden="true" className="size-4" /></Link><p className="mt-3 text-xs leading-5 text-zinc-400">Inicia sesión o crea tu cuenta. Consulta el precio y la periodicidad en Stripe antes de confirmar.</p></article>
          </div>
          <div className="mt-8 overflow-hidden rounded-2xl border border-zinc-800">
            <table className="w-full table-fixed text-left text-xs sm:text-sm"><caption className="border-b border-zinc-800 bg-zinc-900 p-4 text-left font-medium text-zinc-300">Compara lo que incluye cada plan</caption><thead className="bg-zinc-900/60"><tr><th scope="col" className="w-[44%] p-3 sm:p-5">Funcionalidad</th><th scope="col" className="p-3 sm:p-5">Free</th><th scope="col" className="p-3 text-emerald-300 sm:p-5">Pro</th></tr></thead><tbody>{comparison.map(([feature, free, pro]) => <tr key={feature} className="border-t border-zinc-800"><th scope="row" className="p-3 font-normal text-zinc-300 sm:p-5">{feature}</th><td className="p-3 text-zinc-400 sm:p-5">{free}</td><td className="p-3 text-emerald-200 sm:p-5">{pro}</td></tr>)}</tbody></table>
          </div>
        </div>
      </section>

      <section aria-labelledby="final-title" className="mx-auto max-w-3xl px-5 py-20 text-center sm:py-24">
        <h2 id="final-title" className="text-3xl font-semibold tracking-tight sm:text-5xl">Tu primera decisión:<br /><span className="text-emerald-400">empezar a aprender.</span></h2>
        <p className="mx-auto mt-5 max-w-md text-zinc-400">Una cuenta. Tu primera lección. Una cartera para poner tus conocimientos a prueba.</p>
        <Link to="/login?mode=signup" className={`${primary} mt-8`}>Empezar Gratis <ArrowRight aria-hidden="true" className="size-4" /></Link>
      </section>
    </main>

    <footer className="border-t border-zinc-800 px-5 py-8 sm:px-8"><div className="mx-auto flex max-w-7xl flex-wrap items-start justify-between gap-7"><div><Logo size="md" /><p className="mt-2 max-w-md text-xs leading-6 text-zinc-400">Educación financiera y simulación de inversiones.<br />Las operaciones utilizan dinero ficticio.</p><p className="mt-3 text-xs text-zinc-500">© {new Date().getFullYear()} BullVest</p></div><nav aria-label="Enlaces del pie de página" className="flex flex-wrap gap-6 text-sm text-zinc-400"><a href="#metodologia" className={`rounded hover:text-white ${focus}`}>Metodología</a><a href="#planes" className={`rounded hover:text-white ${focus}`}>Planes</a><Link to="/login" className={`rounded hover:text-white ${focus}`}>Iniciar sesión</Link></nav></div></footer>
  </div>;
}
