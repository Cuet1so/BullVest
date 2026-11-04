-- BullVest Academia V2 — esquema aditivo, sin alterar Academia V1.
-- Diseñado para PostgreSQL 17 y Supabase. Ejecutar en SQL Editor tras revisión.
begin;

-- Se aprovechan academy_levels (1..5) y profiles ya existentes.
create table public.academy_modules (
  id uuid primary key default gen_random_uuid(),
  level_number smallint not null references public.academy_levels(level_number),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null check (char_length(trim(title)) between 1 and 160),
  description text not null default '',
  order_index integer not null check (order_index > 0),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  unique (level_number, order_index)
);

-- Nombre V2 deliberado: academy_lessons y su progreso V1 siguen operativos.
create table public.academy_lessons_v2 (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.academy_modules(id) on delete restrict,
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null check (char_length(trim(title)) between 1 and 160),
  learning_objectives text[] not null default '{}',
  body_markdown text not null default '',
  estimated_minutes smallint not null default 30
    check (estimated_minutes between 1 and 240),
  content_version integer not null default 1 check (content_version > 0),
  order_index integer not null check (order_index > 0),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (module_id, slug),
  unique (module_id, order_index)
);

-- payload contiene SOLO material público: opciones, datos de balances,
-- OHLC sintético, unidades, enunciados. NO soluciones ni respuestas.
create table public.academy_exercises_v2 (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.academy_lessons_v2(id) on delete restrict,
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  kind text not null check (kind in ('multiple_choice', 'numeric', 'chart_analysis')),
  prompt_markdown text not null check (char_length(trim(prompt_markdown)) > 0),
  payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(payload) = 'object'),
  points integer not null default 1 check (points between 1 and 100),
  required boolean not null default true,
  order_index integer not null check (order_index > 0),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  unique (lesson_id, slug),
  unique (lesson_id, order_index)
);

-- La clave de corrección se almacena fuera del esquema expuesto public.
create schema if not exists academy_private;
revoke all on schema academy_private from public, anon, authenticated;

create table academy_private.exercise_keys_v2 (
  exercise_id uuid primary key references public.academy_exercises_v2(id) on delete cascade,
  correct_answer text not null check (char_length(btrim(correct_answer)) between 1 and 200),
  absolute_tolerance numeric(18, 8) not null default 0
    check (absolute_tolerance >= 0),
  explanation_markdown text not null default ''
);

create table public.academy_exercise_attempts_v2 (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  exercise_id uuid not null references public.academy_exercises_v2(id) on delete restrict,
  lesson_version integer not null check (lesson_version > 0),
  submitted_answer text not null,
  is_correct boolean not null,
  score smallint not null check (score in (0, 100)),
  created_at timestamptz not null default now()
);

create table public.academy_user_progress_v2 (
  user_id uuid not null references public.profiles(id) on delete cascade,
  lesson_id uuid not null references public.academy_lessons_v2(id) on delete restrict,
  lesson_version integer not null check (lesson_version > 0),
  status text not null default 'in_progress'
    check (status in ('in_progress', 'completed')),
  best_score smallint not null default 0 check (best_score between 0 and 100),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_id),
  constraint academy_v2_progress_completion_check check (
    (status = 'completed' and completed_at is not null) or
    (status = 'in_progress' and completed_at is null)
  )
);

create index academy_v2_lessons_module_idx
  on public.academy_lessons_v2(module_id, order_index);
create index academy_v2_exercises_lesson_idx
  on public.academy_exercises_v2(lesson_id, order_index);
create index academy_v2_attempts_user_exercise_version_idx
  on public.academy_exercise_attempts_v2(user_id, exercise_id, lesson_version, created_at desc);
create index academy_v2_progress_user_idx
  on public.academy_user_progress_v2(user_id, status);

alter table public.academy_modules enable row level security;
alter table public.academy_lessons_v2 enable row level security;
alter table public.academy_exercises_v2 enable row level security;
alter table public.academy_exercise_attempts_v2 enable row level security;
alter table public.academy_user_progress_v2 enable row level security;
alter table academy_private.exercise_keys_v2 enable row level security;

-- El catálogo muestra títulos de módulos Pro bloqueados sin filtrar contenido.
create policy academy_v2_modules_catalog on public.academy_modules
  for select to authenticated using (published);

-- Solo nivel 1 para Free. Niveles 2-5 para Pro y administradores.
create policy academy_v2_lessons_read on public.academy_lessons_v2
  for select to authenticated using (
    published and exists (
      select 1 from public.academy_modules m
      where m.id = module_id and m.published
        and (m.level_number = 1 or exists (
          select 1 from public.profiles p
          where p.id = (select auth.uid()) and p.role in ('pro', 'admin')
        ))
    )
  );

create policy academy_v2_exercises_read on public.academy_exercises_v2
  for select to authenticated using (
    published and exists (
      select 1 from public.academy_lessons_v2 l where l.id = lesson_id
    )
  );

create policy academy_v2_attempts_own on public.academy_exercise_attempts_v2
  for select to authenticated using (user_id = (select auth.uid()));
create policy academy_v2_progress_own on public.academy_user_progress_v2
  for select to authenticated using (user_id = (select auth.uid()));

-- Nadie escribe puntuaciones, ejercicios o progreso directamente desde React.
revoke all on public.academy_modules,
  public.academy_lessons_v2,
  public.academy_exercises_v2,
  public.academy_exercise_attempts_v2,
  public.academy_user_progress_v2
from public, anon, authenticated;

grant select on public.academy_modules,
  public.academy_lessons_v2,
  public.academy_exercises_v2,
  public.academy_exercise_attempts_v2,
  public.academy_user_progress_v2
 to authenticated;

grant all on public.academy_modules,
  public.academy_lessons_v2,
  public.academy_exercises_v2,
  public.academy_exercise_attempts_v2,
  public.academy_user_progress_v2 to service_role;

revoke all on academy_private.exercise_keys_v2 from public, anon, authenticated;
grant usage on schema academy_private to service_role;
grant all on academy_private.exercise_keys_v2 to service_role;

-- RPC que corrige en PostgreSQL: no acepta user_id, nota ni solución.
create or replace function public.submit_academy_exercise_v2(
  p_exercise_id uuid,
  p_answer text
)
returns table (
  correct boolean,
  exercise_score integer,
  lesson_completed boolean,
  lesson_score integer,
  explanation_markdown text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_role text;
  v_lesson uuid;
  v_version integer;
  v_level smallint;
  v_kind text;
  v_expected text;
  v_tolerance numeric;
  v_explanation text;
  v_answer text;
  v_correct boolean;
  v_required integer;
  v_passed integer;
  v_complete boolean;
  v_lesson_score integer;
begin
  if v_user is null then raise exception 'UNAUTHORIZED'; end if;
  v_answer := btrim(p_answer);
  if v_answer is null or char_length(v_answer) not between 1 and 200 then
    raise exception 'INVALID_ANSWER';
  end if;

  select p.role into v_role
  from public.profiles p where p.id = v_user;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;

  select e.kind, l.id, l.content_version, m.level_number
  into v_kind, v_lesson, v_version, v_level
  from public.academy_exercises_v2 e
  join public.academy_lessons_v2 l on l.id = e.lesson_id
  join public.academy_modules m on m.id = l.module_id
  where e.id = p_exercise_id and e.published and l.published and m.published;
  if not found then raise exception 'EXERCISE_NOT_FOUND'; end if;
  if v_level > 1 and v_role not in ('pro', 'admin') then
    raise exception 'ACADEMY_REQUIRES_PRO';
  end if;

  select k.correct_answer, k.absolute_tolerance, k.explanation_markdown
  into v_expected, v_tolerance, v_explanation
  from academy_private.exercise_keys_v2 k
  where k.exercise_id = p_exercise_id;
  if not found then raise exception 'EXERCISE_NOT_READY'; end if;

  if v_kind = 'numeric' then
    if v_answer !~ '^[+-]?([0-9]+(\.[0-9]+)?|\.[0-9]+)$' then
      raise exception 'INVALID_NUMERIC_ANSWER';
    end if;
    v_correct := abs(v_answer::numeric - v_expected::numeric) <= v_tolerance;
  else
    -- multiple_choice y chart_analysis responden con un ID de opción.
    v_correct := v_answer = v_expected;
  end if;

  insert into public.academy_exercise_attempts_v2
    (user_id, exercise_id, lesson_version, submitted_answer, is_correct, score)
  values (v_user, p_exercise_id, v_version, v_answer, v_correct,
          case when v_correct then 100 else 0 end);

  select count(*)::integer,
         count(*) filter (where exists (
           select 1 from public.academy_exercise_attempts_v2 a
           where a.user_id = v_user and a.exercise_id = e.id
             and a.lesson_version = v_version and a.is_correct
         ))::integer
  into v_required, v_passed
  from public.academy_exercises_v2 e
  where e.lesson_id = v_lesson and e.required and e.published;

  v_complete := v_required > 0 and v_passed = v_required;
  v_lesson_score := case when v_required > 0
    then round(100.0 * v_passed / v_required)::integer else 0 end;

  insert into public.academy_user_progress_v2
    (user_id, lesson_id, lesson_version, status, best_score, completed_at)
  values (v_user, v_lesson, v_version,
          case when v_complete then 'completed' else 'in_progress' end,
          v_lesson_score,
          case when v_complete then now() else null end)
  on conflict (user_id, lesson_id) do update set
    lesson_version = excluded.lesson_version,
    status = case
      when public.academy_user_progress_v2.lesson_version = excluded.lesson_version
           and public.academy_user_progress_v2.status = 'completed'
      then 'completed' else excluded.status end,
    best_score = case
      when public.academy_user_progress_v2.lesson_version = excluded.lesson_version
      then greatest(public.academy_user_progress_v2.best_score, excluded.best_score)
      else excluded.best_score end,
    completed_at = case
      when public.academy_user_progress_v2.lesson_version = excluded.lesson_version
           and public.academy_user_progress_v2.completed_at is not null
      then public.academy_user_progress_v2.completed_at
      else excluded.completed_at end,
    updated_at = now();

  return query select v_correct, case when v_correct then 100 else 0 end,
    v_complete, v_lesson_score, v_explanation;
end;
$$;

revoke all on function public.submit_academy_exercise_v2(uuid, text)
from public, anon, authenticated;
grant execute on function public.submit_academy_exercise_v2(uuid, text)
to authenticated;



-- Catálogo V2: 13 módulos y 57 títulos, sin publicar contenidos pendientes.
insert into public.academy_modules(level_number, slug, title, description, order_index, published)
values
(1,'fundamentos-contables','Fundamentos de contabilidad y estados financieros','Referencia didáctica: John J. Wild',1,true),
(1,'diagnostico-financiero','Diagnóstico de la salud empresarial','Referencia didáctica: John J. Wild',2,true),
(2,'valoracion-fundamental','Precio, valor y retorno del capital','Referencia didáctica: Joel Greenblatt',1,true),
(2,'formula-cuantitativa','Selección cuantitativa y fórmula de Greenblatt','Referencia didáctica: Joel Greenblatt',2,true),
(3,'investigacion-empresarial','Investigación profunda de empresas','Referencia didáctica: Philip Fisher',1,true),
(3,'tesis-de-inversion','Construcción de una tesis de inversión','Referencia didáctica: Philip Fisher',2,true),
(4,'lectura-del-precio','Estructura y lectura del precio','Referencia didáctica: John J. Murphy',1,true),
(4,'indicadores-tecnicos','Indicadores y sistemas técnicos','Referencia didáctica: John J. Murphy',2,true),
(4,'cuatro-etapas','Método de las cuatro etapas','Referencia didáctica: Stan Weinstein',3,true),
(4,'timing-mercado','Timing, fuerza relativa y control de entrada','Referencia didáctica: Stan Weinstein',4,true),
(5,'sistema-de-trading','Diseño de un sistema de trading','Referencia didáctica: Van K. Tharp',1,true),
(5,'gestion-monetaria','Matemáticas y gestión monetaria','Referencia didáctica: Van K. Tharp',2,true),
(5,'laboratorio-bullvest','Laboratorio profesional BullVest','Referencia didáctica: Síntesis de los seis autores',3,true)
on conflict(slug) do nothing;

insert into public.academy_lessons_v2(module_id,slug,title,order_index,published)
select x.module_id,x.slug,x.title,x.order_index,x.published
from (values
('fundamentos-contables','el-balance-de-situacion-y-la-ecuacion-patrimonial','El balance de situación y la ecuación patrimonial',1,true),
('fundamentos-contables','la-cuenta-de-resultados-y-sus-margenes','La cuenta de resultados y sus márgenes',2,false),
('fundamentos-contables','el-estado-de-flujos-de-efectivo','El estado de flujos de efectivo',3,false),
('fundamentos-contables','relaciones-entre-los-tres-estados-financieros','Relaciones entre los tres estados financieros',4,false),
('diagnostico-financiero','liquidez-solvencia-y-estructura-de-capital','Liquidez, solvencia y estructura de capital',1,false),
('diagnostico-financiero','rentabilidad-roe-roa-y-roic','Rentabilidad: ROE, ROA y ROIC',2,false),
('diagnostico-financiero','calidad-del-beneficio-y-devengo-contable','Calidad del beneficio y devengo contable',3,false),
('diagnostico-financiero','capital-circulante-deuda-y-flujo-de-caja-libre','Capital circulante, deuda y flujo de caja libre',4,false),
('diagnostico-financiero','caso-integrado-diagnostico-de-una-empresa-ficticia','Caso integrado: diagnóstico de una empresa ficticia',5,false),
('valoracion-fundamental','precio-de-mercado-frente-a-valor-economico','Precio de mercado frente a valor económico',1,false),
('valoracion-fundamental','capital-invertido-y-rentabilidad-operativa','Capital invertido y rentabilidad operativa',2,false),
('valoracion-fundamental','per-ev-ebit-ev-ebitda-y-sus-limitaciones','PER, EV/EBIT, EV/EBITDA y sus limitaciones',3,false),
('valoracion-fundamental','valor-intrinseco-y-margen-de-seguridad','Valor intrínseco y margen de seguridad',4,false),
('formula-cuantitativa','rentabilidad-sobre-capital-y-rendimiento-de-beneficios','Rentabilidad sobre capital y rendimiento de beneficios',1,false),
('formula-cuantitativa','clasificacion-y-comparacion-de-companias','Clasificación y comparación de compañías',2,false),
('formula-cuantitativa','sesgos-exclusiones-sectoriales-y-errores-de-screening','Sesgos, exclusiones sectoriales y errores de screening',3,false),
('formula-cuantitativa','caso-practico-ranking-de-acciones','Caso práctico: ranking de acciones',4,false),
('investigacion-empresarial','investigacion-cualitativa-y-metodo-scuttlebutt','Investigación cualitativa y método scuttlebutt',1,false),
('investigacion-empresarial','productos-mercados-y-crecimiento-sostenible','Productos, mercados y crecimiento sostenible',2,false),
('investigacion-empresarial','direccion-cultura-corporativa-y-asignacion-de-capital','Dirección, cultura corporativa y asignación de capital',3,false),
('investigacion-empresarial','innovacion-investigacion-y-desarrollo','Innovación, investigación y desarrollo',4,false),
('investigacion-empresarial','clientes-competidores-y-evidencias-externas','Clientes, competidores y evidencias externas',5,false),
('tesis-de-inversion','ventajas-competitivas-y-barreras-de-entrada','Ventajas competitivas y barreras de entrada',1,false),
('tesis-de-inversion','calidad-del-crecimiento-y-reinversion','Calidad del crecimiento y reinversión',2,false),
('tesis-de-inversion','riesgos-de-deterioro-y-senales-de-alerta','Riesgos de deterioro y señales de alerta',3,false),
('tesis-de-inversion','caso-practico-tesis-de-inversion-contrastable','Caso práctico: tesis de inversión contrastable',4,false),
('lectura-del-precio','naturaleza-del-analisis-tecnico-y-sus-supuestos','Naturaleza del análisis técnico y sus supuestos',1,false),
('lectura-del-precio','graficos-de-lineas-barras-y-velas-japonesas','Gráficos de líneas, barras y velas japonesas',2,false),
('lectura-del-precio','tendencias-soportes-y-resistencias','Tendencias, soportes y resistencias',3,false),
('lectura-del-precio','volumen-rupturas-y-figuras-chartistas','Volumen, rupturas y figuras chartistas',4,false),
('lectura-del-precio','temporalidades-gaps-y-confirmacion-de-senales','Temporalidades, gaps y confirmación de señales',5,false),
('indicadores-tecnicos','medias-moviles-y-senales-de-tendencia','Medias móviles y señales de tendencia',1,false),
('indicadores-tecnicos','rsi-macd-y-osciladores','RSI, MACD y osciladores',2,false),
('indicadores-tecnicos','volatilidad-atr-y-bandas-de-bollinger','Volatilidad, ATR y bandas de Bollinger',3,false),
('indicadores-tecnicos','divergencias-senales-falsas-y-pruebas-historicas','Divergencias, señales falsas y pruebas históricas',4,false),
('cuatro-etapas','etapa-i-formacion-de-bases','Etapa I: formación de bases',1,false),
('cuatro-etapas','etapa-ii-tendencia-alcista','Etapa II: tendencia alcista',2,false),
('cuatro-etapas','etapa-iii-distribucion-y-agotamiento','Etapa III: distribución y agotamiento',3,false),
('cuatro-etapas','etapa-iv-tendencia-bajista','Etapa IV: tendencia bajista',4,false),
('timing-mercado','fuerza-relativa-y-seleccion-de-candidatos','Fuerza relativa y selección de candidatos',1,false),
('timing-mercado','rupturas-volumen-y-puntos-de-entrada','Rupturas, volumen y puntos de entrada',2,false),
('timing-mercado','medias-de-largo-plazo-y-condiciones-de-mercado','Medias de largo plazo y condiciones de mercado',3,false),
('timing-mercado','caso-practico-clasificar-graficos-y-justificar-operaciones','Caso práctico: clasificar gráficos y justificar operaciones',4,false),
('sistema-de-trading','objetivos-creencias-y-psicologia-del-operador','Objetivos, creencias y psicología del operador',1,false),
('sistema-de-trading','ventaja-estadistica-y-reglas-del-sistema','Ventaja estadística y reglas del sistema',2,false),
('sistema-de-trading','definicion-de-entradas-salidas-y-stops','Definición de entradas, salidas y stops',3,false),
('sistema-de-trading','diario-de-operaciones-y-evaluacion-disciplinada','Diario de operaciones y evaluación disciplinada',4,false),
('gestion-monetaria','riesgo-inicial-y-multiplos-r','Riesgo inicial y múltiplos R',1,false),
('gestion-monetaria','tamano-de-posicion-y-exposicion-agregada','Tamaño de posición y exposición agregada',2,false),
('gestion-monetaria','expectativa-matematica-y-distribucion-de-resultados','Expectativa matemática y distribución de resultados',3,false),
('gestion-monetaria','drawdown-riesgo-de-ruina-y-simulacion-monte-carlo','Drawdown, riesgo de ruina y simulación Monte Carlo',4,false),
('gestion-monetaria','backtesting-sobreajuste-y-validacion-fuera-de-muestra','Backtesting, sobreajuste y validación fuera de muestra',5,false),
('laboratorio-bullvest','construccion-de-una-cartera-diversificada','Construcción de una cartera diversificada',1,false),
('laboratorio-bullvest','integracion-del-analisis-fundamental-y-tecnico','Integración del análisis fundamental y técnico',2,false),
('laboratorio-bullvest','plan-de-trading-con-limites-de-riesgo','Plan de trading con límites de riesgo',3,false),
('laboratorio-bullvest','revision-del-rendimiento-y-atribucion-de-resultados','Revisión del rendimiento y atribución de resultados',4,false),
('laboratorio-bullvest','proyecto-final-comite-de-inversion-simulado','Proyecto final: comité de inversión simulado',5,false)
) as x(module_slug,slug,title,order_index,published)
join public.academy_modules m on m.slug=x.module_slug
on conflict(module_id,slug) do nothing;

update public.academy_lessons_v2 l
set body_markdown='# El balance de situación y la ecuación patrimonial

Un balance representa la situación financiera de una organización en una **fecha concreta**. No refleja por sí solo el beneficio de un ejercicio completo: esa información corresponde a la cuenta de resultados.

## Objetivos de aprendizaje

- Distinguir **activo**, **pasivo** y **patrimonio neto**.

- Identificar partidas corrientes y no corrientes.

- Resolver la ecuación patrimonial y comprobar que un balance cuadra.

- Interpretar la liquidez sin confundirla con la rentabilidad.

## 1. Activos: recursos controlados

Los activos comprenden efectivo, derechos de cobro, existencias y recursos productivos como maquinaria. Su clasificación depende, entre otros factores, del plazo previsto de realización o utilización. Un inventario registrado como activo no equivale a tener efectivo disponible de inmediato.

## 2. Pasivos: obligaciones pendientes

Los pasivos representan obligaciones con terceros. Los **corrientes** suelen exigirse a corto plazo; los **no corrientes** tienen vencimientos más lejanos. Es importante contrastar las fechas de pago con la capacidad de la empresa para generar caja.

## 3. Patrimonio neto: financiación de los propietarios

La identidad contable fundamental es:

$$Activo = Pasivo + Patrimonio\ neto$$

Por tanto, **patrimonio neto = activo − pasivo**. El patrimonio no representa necesariamente dinero líquido, sino el interés residual en los activos después de deducir las obligaciones.

## 4. Ejemplo resuelto

| Concepto | Miles de USD |

| --- | ---: |

| Efectivo | 25 |

| Clientes por cobrar | 35 |

| Existencias | 15 |

| Inmovilizado | 45 |

| **Total activo** | **120** |

| Deudas y proveedores | 75 |

| **Patrimonio neto** | **45** |

La suma de pasivo y patrimonio (75 + 45) coincide con el activo total (120). Si la empresa obtiene un préstamo de 20 y lo recibe en efectivo, su activo sube a 140 y su pasivo a 95; **el patrimonio permanece en 45** en ese instante.

## 5. Ratios básicos y precauciones

El **ratio corriente** compara activo corriente con pasivo corriente: `Activo corriente / Pasivo corriente`. Un valor superior a 1 puede indicar cobertura contable de las obligaciones a corto plazo, pero no garantiza liquidez: hay que analizar la calidad y velocidad de cobro de cada partida.

## Caso práctico

Una empresa ficticia presenta activo corriente de 75.000 USD y pasivo corriente de 30.000 USD. Calcula su ratio corriente y evalúa qué información adicional necesitarías para decidir si su liquidez es sólida.

**Nota:** este material es original de BullVest y utiliza cifras inventadas. No constituye asesoramiento de inversión.',
    learning_objectives=array[
      'Comprender el balance en una fecha concreta',
      'Calcular patrimonio neto y ratio corriente',
      'Distinguir liquidez, activos y pasivos'
    ],
    estimated_minutes=20,
    published=true
from public.academy_modules m
where l.module_id=m.id and m.slug='fundamentos-contables'
and l.slug='el-balance-de-situacion-y-la-ecuacion-patrimonial';

insert into public.academy_exercises_v2
(lesson_id,slug,kind,prompt_markdown,payload,points,required,order_index,published)
select l.id, x.slug, x.kind, x.prompt, x.payload::jsonb, x.points, true, x.position, true
from (values
('balance-principio', 'multiple_choice', '¿Qué representa el balance de situación?', '{"options":[{"id":"a","label":"Ventas acumuladas durante el ejercicio"},{"id":"b","label":"Situación patrimonial en una fecha concreta"},{"id":"c","label":"Predicción del precio futuro de las acciones"}]}',1,1),
('patrimonio-neto', 'numeric', 'Si el activo total es **120.000 USD** y el pasivo total es **75.000 USD**, calcula el patrimonio neto en USD.', '{"unit":"USD","decimals":2}',2,2),
('ratio-corriente', 'numeric', 'Si el activo corriente asciende a **75.000 USD** y el pasivo corriente a **30.000 USD**, calcula el ratio corriente.', '{"unit":"ratio","decimals":2}',2,3)
) as x(slug,kind,prompt,payload,points,position)
join public.academy_lessons_v2 l on l.slug='el-balance-de-situacion-y-la-ecuacion-patrimonial'
join public.academy_modules m on m.id=l.module_id and m.slug='fundamentos-contables'
on conflict(lesson_id,slug) do nothing;

insert into academy_private.exercise_keys_v2
(exercise_id,correct_answer,absolute_tolerance,explanation_markdown)
select e.id,x.answer,x.tolerance,x.explanation
from (values
('balance-principio','b',0::numeric,'El balance informa sobre activos, pasivos y patrimonio en una fecha concreta.'),
('patrimonio-neto','45000',0.01::numeric,'Patrimonio neto = 120.000 − 75.000 = 45.000 USD.'),
('ratio-corriente','2.5',0.01::numeric,'Ratio corriente = 75.000 / 30.000 = 2,50.')
) as x(slug,answer,tolerance,explanation)
join public.academy_exercises_v2 e on e.slug=x.slug
join public.academy_lessons_v2 l on l.id=e.lesson_id and l.slug='el-balance-de-situacion-y-la-ecuacion-patrimonial'
join public.academy_modules m on m.id=l.module_id and m.slug='fundamentos-contables'
on conflict(exercise_id) do nothing;

commit;
