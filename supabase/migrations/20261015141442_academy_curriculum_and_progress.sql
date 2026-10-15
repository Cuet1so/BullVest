begin;

-- Mantener los IDs existentes y las relaciones de progreso del esquema V1.
insert into public.academy_levels(level_number, title, book_reference) values
  (1, 'Análisis de Estados Financieros', 'John J. Wild — Análisis de estados financieros'),
  (2, 'Screening Cuantitativo', 'Joel Greenblatt — El pequeño libro que bate al mercado'),
  (3, 'Análisis Cualitativo y Moats', 'Philip Fisher — Acciones ordinarias y beneficios extraordinarios'),
  (4, 'Análisis Técnico y Tendencias', 'John J. Murphy — Análisis técnico de los mercados financieros'),
  (5, 'Timing de Mercado y Gestión de Riesgo', 'Stan Weinstein — Secretos para ganar en los mercados alcistas y bajistas')
on conflict(level_number) do update set title = excluded.title, book_reference = excluded.book_reference;

drop policy academy_levels_pro_read on public.academy_levels;
create policy academy_levels_read_accessible on public.academy_levels
for select to authenticated using (
  level_number = 1 or exists(select 1 from public.profiles where id = (select auth.uid()) and role = 'pro')
);
drop policy academy_lessons_pro_read on public.academy_lessons;
create policy academy_lessons_read_accessible on public.academy_lessons
for select to authenticated using (
  exists(select 1 from public.academy_levels l where l.id = level_id)
);
drop policy academy_progress_pro_read_own on public.user_academy_progress;
create policy academy_progress_read_own on public.user_academy_progress
for select to authenticated using (user_id = (select auth.uid()));

-- Alias compatible con el nombre lessons; RLS sigue aplicándose en la tabla V1.
create view public.lessons with (security_invoker = true) as
select id, level_id, title, order_index, content_json, created_at, updated_at
from public.academy_lessons;
revoke all on public.lessons from public, anon, authenticated;
grant select on public.lessons to authenticated;
grant select on public.lessons to service_role;

create table public.quizzes (
  lesson_id uuid primary key references public.academy_lessons(id) on delete cascade,
  questions jsonb not null check (jsonb_typeof(questions) = 'array' and jsonb_array_length(questions) between 1 and 20),
  passing_score integer not null default 70 check (passing_score between 1 and 100)
);
alter table public.quizzes enable row level security;
create policy quizzes_read_accessible on public.quizzes for select to authenticated
using (exists(select 1 from public.academy_lessons l where l.id = lesson_id));
revoke all on public.quizzes from public, anon, authenticated;
grant select on public.quizzes to authenticated;
grant all on public.quizzes to service_role;

create schema if not exists academy_private;
revoke all on schema academy_private from public, anon, authenticated;
create table academy_private.quiz_answers (
  lesson_id uuid primary key references public.quizzes(lesson_id) on delete cascade,
  correct_answers integer[] not null check (cardinality(correct_answers) between 1 and 20)
);
alter table academy_private.quiz_answers enable row level security;
revoke all on academy_private.quiz_answers from public, anon, authenticated;

-- La nota procede de la corrección del servidor; nunca se acepta una nota del cliente.
create function public.submit_academy_quiz(p_lesson_id uuid, p_answers integer[])
returns table(score integer, passed boolean, correct_count integer, question_count integer)
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_role text;
  v_level integer;
  v_quiz public.quizzes%rowtype;
  v_key integer[];
  v_correct integer := 0;
  v_count integer;
  v_score integer;
  i integer;
begin
  if v_user is null then raise exception 'UNAUTHORIZED'; end if;
  select role into v_role from public.profiles where id = v_user for share;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;
  select lv.level_number into v_level from public.academy_lessons l
  join public.academy_levels lv on lv.id = l.level_id where l.id = p_lesson_id;
  if not found then raise exception 'LESSON_NOT_FOUND'; end if;
  if v_level > 1 and v_role <> 'pro' then raise exception 'ACADEMY_REQUIRES_PRO'; end if;
  select * into v_quiz from public.quizzes where lesson_id = p_lesson_id;
  select correct_answers into v_key from academy_private.quiz_answers where lesson_id = p_lesson_id;
  if v_key is null then raise exception 'QUIZ_NOT_FOUND'; end if;
  v_count := jsonb_array_length(v_quiz.questions);
  if p_answers is null or cardinality(p_answers) <> v_count
     or array_ndims(p_answers) <> 1 or array_lower(p_answers, 1) <> 1 then
    raise exception 'INVALID_QUIZ_ANSWERS';
  end if;
  for i in 1..v_count loop
    if p_answers[i] is null or p_answers[i] < 0
       or p_answers[i] >= jsonb_array_length(v_quiz.questions->(i-1)->'options') then
      raise exception 'INVALID_QUIZ_ANSWERS';
    end if;
    if p_answers[i] = v_key[i] then v_correct := v_correct + 1; end if;
  end loop;
  v_score := round(100.0 * v_correct / v_count)::integer;
  insert into public.user_academy_progress(user_id, lesson_id, score)
  values(v_user, p_lesson_id, v_score)
  on conflict(user_id, lesson_id) do update
  set score = greatest(public.user_academy_progress.score, excluded.score), updated_at = now();
  return query select v_score, v_score >= v_quiz.passing_score, v_correct, v_count;
end;
$$;
revoke all on function public.submit_academy_quiz(uuid, integer[]) from public, anon, authenticated;
grant execute on function public.submit_academy_quiz(uuid, integer[]) to authenticated;

create function public.complete_academy_lesson(p_lesson_id uuid)
returns setof public.user_academy_progress
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_role text;
  v_level integer;
  v_threshold integer;
  v_progress public.user_academy_progress%rowtype;
begin
  if v_user is null then raise exception 'UNAUTHORIZED'; end if;
  select role into v_role from public.profiles where id = v_user for share;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;
  select lv.level_number, q.passing_score into v_level, v_threshold
  from public.academy_lessons l join public.academy_levels lv on lv.id = l.level_id
  join public.quizzes q on q.lesson_id = l.id where l.id = p_lesson_id;
  if not found then raise exception 'LESSON_NOT_FOUND'; end if;
  if v_level > 1 and v_role <> 'pro' then raise exception 'ACADEMY_REQUIRES_PRO'; end if;
  update public.user_academy_progress
  set completed = true, completed_at = coalesce(completed_at, now()), updated_at = now()
  where user_id = v_user and lesson_id = p_lesson_id and score >= v_threshold
  returning * into v_progress;
  if not found then raise exception 'QUIZ_PASS_REQUIRED'; end if;
  return next v_progress;
end;
$$;
revoke all on function public.complete_academy_lesson(uuid) from public, anon, authenticated;
grant execute on function public.complete_academy_lesson(uuid) to authenticated;

-- Material didáctico original de BullVest, no extractos de los libros citados.
do $seed$
declare
  item jsonb;
  v_level uuid;
  v_lesson uuid;
begin
  for item in select value from jsonb_array_elements($curriculum$
[
  {"level":1,"order":1,"title":"El balance: una fotografía del negocio","content":{"introduction":"Aprende a separar lo que una empresa posee de cómo lo financia. El balance se refiere a una fecha concreta; no mide las ventas de todo un año.","sections":[{"title":"La ecuación contable","text":"Activo = Pasivo + Patrimonio neto. Los activos son recursos, como efectivo, existencias o maquinaria. Los pasivos son obligaciones. El patrimonio neto es el interés residual de los propietarios, no el dinero disponible en la caja."},{"title":"Liquidez y vencimientos","text":"Distingue partidas corrientes de las de largo plazo. Un gran inventario puede inflar el activo corriente sin convertirse rápidamente en efectivo. Compara vencimientos de deuda, cobros y pagos antes de interpretar un ratio de liquidez."}],"example":"Una empresa tiene activos por 120 y pasivos por 75. Su patrimonio neto es 45. Si obtiene un préstamo de 20, suben efectivo y deuda en 20: el patrimonio sigue siendo 45.","takeaway":"Un balance sólido exige entender la calidad de los activos y cuándo vencen las obligaciones.","source":{"title":"SEC: guía de estados financieros","url":"https://www.sec.gov/investor/pubs/begfinstmtguide.htm"}},"questions":[{"prompt":"¿Qué describe el balance?","options":["La situación patrimonial en una fecha","Solo las ventas del año","La cotización futura"]},{"prompt":"Activos de 120 menos pasivos de 75: ¿patrimonio neto?","options":["195","45","75"]},{"prompt":"Al recibir un préstamo de 20 en efectivo, ¿qué ocurre inicialmente?","options":["Aumenta el beneficio en 20","Desaparece el pasivo","Aumentan activo y pasivo en 20"]}],"answers":[0,1,2]},
  {"level":1,"order":2,"title":"Resultados: de las ventas al beneficio","content":{"introduction":"La cuenta de resultados explica la actividad durante un periodo. Aprende a distinguir crecimiento, rentabilidad operativa y beneficio final.","sections":[{"title":"Leer por capas","text":"De los ingresos se descuentan costes y gastos. El resultado operativo mide la actividad antes de intereses e impuestos; el beneficio neto incorpora esas partidas. Una venta reconocida contablemente puede cobrarse más adelante."},{"title":"Comparar márgenes","text":"El margen operativo divide resultado operativo entre ingresos. Compara varios periodos y empresas semejantes. Una venta extraordinaria de activos puede mejorar el beneficio de un año sin mejorar la actividad habitual."}],"example":"Con ingresos de 200 y resultado operativo de 30, el margen operativo es 15 %. Si el año siguiente los ingresos crecen a 250 pero el resultado sigue en 30, el margen baja al 12 %.","takeaway":"Crecer en ventas no implica mejorar el margen ni generar efectivo de inmediato.","source":{"title":"SEC: cómo leer un informe 10-K","url":"https://www.sec.gov/answers/reada10k.htm"}},"questions":[{"prompt":"¿Qué margen operativo corresponde a 30 de resultado y 200 de ingresos?","options":["30 %","15 %","200 %"]},{"prompt":"Una venta a crédito puede generar…","options":["Ingresos antes del cobro","Efectivo necesariamente ese mismo día","Una reducción automática de deuda"]},{"prompt":"Si el beneficio aumenta por vender una fábrica, conviene…","options":["Suponer que se repetirá cada año","Ignorar la actividad operativa","Separar la partida extraordinaria del negocio habitual"]}],"answers":[1,0,2]},
  {"level":1,"order":3,"title":"Flujo de caja: seguir el efectivo","content":{"introduction":"Los beneficios no pagan facturas si no se convierten en efectivo. Este estado ayuda a explicar cómo cambia la caja durante un periodo.","sections":[{"title":"Tres fuentes de movimiento","text":"Los flujos operativos proceden de la actividad, los de inversión incluyen compras o ventas de activos duraderos y los de financiación incluyen deuda y aportaciones o distribuciones de capital. Su clasificación concreta debe revisarse según las normas contables aplicables."},{"title":"Conectar los estados","text":"Parte de la caja inicial y suma los movimientos netos para obtener la final. Como aproximación didáctica, el flujo de caja libre es el flujo operativo menos la inversión en activos fijos. No confundas financiarse con generar efectivo en el negocio."}],"example":"Caja inicial: 10. Flujo operativo: +35; inversión: −20; financiación: −5. La caja final es 20. Si los 20 de inversión son capex, el flujo libre aproximado es 15.","takeaway":"Revisa si la actividad financia la inversión o depende de aportaciones continuas de deuda.","source":{"title":"SEC: estado de flujos de efectivo","url":"https://www.sec.gov/files/cash-flow-statement-bblocks.pdf"}},"questions":[{"prompt":"Con caja inicial 10 y flujos +35, −20 y −5, la caja final es…","options":["10","35","20"]},{"prompt":"Emitir nueva deuda pertenece normalmente al flujo de…","options":["Financiación","Ventas","Amortización contable"]},{"prompt":"Flujo operativo de 35 menos capex de 20 da un flujo libre aproximado de…","options":["55","15","−15"]}],"answers":[2,0,1]},
  {"level":2,"order":1,"title":"Screening: ordenar antes de investigar","content":{"introduction":"Un screener reduce un universo amplio a candidatos investigables. La Fórmula Mágica de Greenblatt combina precio y calidad del negocio, pero no reemplaza el análisis.","sections":[{"title":"Dos clasificaciones","text":"La idea es ordenar compañías por un rendimiento del beneficio y por una medida de retorno sobre capital, y combinar sus posiciones. Un ranking favorable señala una candidatura, no una compra obligatoria."},{"title":"Datos comparables","text":"Usa el mismo periodo y criterios homogéneos. Revisa datos ausentes, beneficios extraordinarios y sectores para los que las métricas no sean comparables. Evita construir una prueba histórica con empresas o información que solo conoces hoy."}],"example":"A tiene rango 2 en precio y 7 en calidad: suma 9. B tiene rangos 4 y 3: suma 7. Si un rango menor es mejor, B queda delante. Todavía faltan deuda, riesgos y valoración cualitativa.","takeaway":"El screening es una lista de trabajo disciplinada, no una promesa de rentabilidad.","source":{"title":"Magic Formula Investing: método de Greenblatt","url":"https://www.magicformulainvesting.com/"}},"questions":[{"prompt":"¿Para qué sirve principalmente un screener?","options":["Garantizar ganancias","Seleccionar candidatos para investigar","Eliminar todo riesgo"]},{"prompt":"Si se suman rangos y menor es mejor, ¿qué suma gana entre 9 y 7?","options":["9","Son idénticas","7"]},{"prompt":"Usar en un backtest información publicada después de la fecha de inversión provoca…","options":["Sesgo de anticipación","Mejor liquidez real","Una garantía adicional"]}],"answers":[1,2,0]},
  {"level":2,"order":2,"title":"Earnings Yield: beneficio frente al precio","content":{"introduction":"El rendimiento del beneficio relaciona una medida de resultado con el precio que se paga por obtenerla. Hay distintas definiciones: siempre identifica numerador y denominador.","sections":[{"title":"Una medida coherente","text":"En la versión empresarial usada en la Fórmula Mágica, el earnings yield se expresa como EBIT dividido entre enterprise value. Una aproximación sencilla de enterprise value suma capitalización y deuda financiera y resta efectivo; puede necesitar ajustes adicionales."},{"title":"Evitar falsos baratos","text":"Un porcentaje alto puede deberse a un precio bajo o a beneficios temporalmente excepcionales. Contrasta el ciclo y las obligaciones. No mezcles EBIT con capitalización como si fuera la misma medida que EBIT/EV; los intereses económicos que representan son distintos."}],"example":"Si el EBIT normalizado es 12 y el EV es 100, el rendimiento es 12 %. Con EBIT constante y EV de 150, baja al 8 %. Son relaciones de valoración, no intereses garantizados que cobre el accionista.","takeaway":"Antes de comparar rendimientos, normaliza beneficios y utiliza una definición consistente de EV.","source":{"title":"Magic Formula Investing","url":"https://www.magicformulainvesting.com/"}},"questions":[{"prompt":"EBIT de 12 y EV de 100 producen un earnings yield de…","options":["12 %","100 %","8 %"]},{"prompt":"En el ejemplo, si el EV aumenta y el EBIT no cambia, el rendimiento…","options":["Aumenta","Disminuye","Es siempre cero"]},{"prompt":"Un earnings yield alto implica…","options":["Un dividendo garantizado","Ausencia de deuda","Una señal que requiere investigar la calidad del beneficio"]}],"answers":[0,1,2]},
  {"level":2,"order":3,"title":"ROCE y eficiencia del capital","content":{"introduction":"Una empresa puede ganar mucho porque utiliza enormes recursos. Los retornos sobre capital ayudan a relacionar el resultado con la inversión necesaria para producirlo.","sections":[{"title":"Qué capital estamos midiendo","text":"ROCE suele expresarse como EBIT/capital empleado, cuya definición debe declararse. En el enfoque de Greenblatt, el retorno usa EBIT sobre capital circulante neto más activos fijos netos. Son medidas relacionadas, pero no intercambiables sin revisar sus componentes."},{"title":"Interpretar con contexto","text":"Compara compañías semejantes y varios años. Un denominador muy pequeño o negativo puede producir ratios poco útiles. La edad de los activos y las prácticas contables también influyen. Examina si nuevos proyectos mantienen el retorno, no solo el negocio histórico."}],"example":"Negocio A: EBIT 20 y capital empleado 100, ROCE 20 %. Negocio B: EBIT 30 y capital 300, ROCE 10 %. B gana más en valor absoluto, pero A obtiene más resultado por unidad de capital bajo esa definición.","takeaway":"La calidad del negocio incluye cuánto capital necesita y qué retorno obtiene al reinvertir.","source":{"title":"Magic Formula Investing","url":"https://www.magicformulainvesting.com/"}},"questions":[{"prompt":"20 de EBIT dividido entre 100 de capital es…","options":["5 %","20 %","100 %"]},{"prompt":"¿Qué negocio del ejemplo tiene mayor retorno por unidad de capital?","options":["B porque su EBIT es mayor","Ambos necesariamente","A"]},{"prompt":"Antes de comparar ROCE y retorno de Greenblatt debes…","options":["Revisar la definición de capital","Ignorar los denominadores","Usar solo el precio bursátil"]}],"answers":[1,2,0]},
  {"level":3,"order":1,"title":"Moats: ventajas que pueden durar","content":{"introduction":"El análisis cualitativo pregunta por qué un negocio podría defender sus beneficios. Esta unidad toma a Fisher como referencia para investigar la calidad empresarial, con ejemplos originales.","sections":[{"title":"Identificar el mecanismo","text":"Una ventaja puede proceder de costes bajos, hábitos de consumo, costes de cambio o efectos de red. Describe el mecanismo concreto: decir que una marca es conocida no demuestra por sí solo que pueda mantener precios o clientes."},{"title":"Buscar pruebas y amenazas","text":"Observa retención, márgenes, cuota y comportamiento de competidores. Contrasta la explicación con clientes y fuentes públicas. Una innovación o regulación puede debilitar una ventaja que parecía estable. Las señales deben ser consistentes a lo largo del tiempo."}],"example":"Un software requiere meses de integración y formación. Cambiarlo implica costes para el cliente. Eso puede favorecer retención, pero una alternativa mucho mejor aún podría desplazarlo.","takeaway":"Un moat es una hipótesis que necesita pruebas y revisión, no una etiqueta permanente.","source":{"title":"Wiley: Common Stocks and Uncommon Profits","url":"https://www.wiley-vch.de/en/areas-interest/finance-economics-law/common-stocks-and-uncommon-profits-and-other-writings-978-0-471-44550-0"}},"questions":[{"prompt":"¿Cuál es un ejemplo de coste de cambio?","options":["El color del logotipo","Un precio que subió ayer","Meses necesarios para migrar un sistema"]},{"prompt":"Para defender la existencia de un moat conviene…","options":["Contrastar evidencia de clientes y resultados","Usar solo la popularidad","Ignorar competidores"]},{"prompt":"Una ventaja competitiva…","options":["Es eterna por definición","Puede deteriorarse","Garantiza cualquier precio de compra"]}],"answers":[2,0,1]},
  {"level":3,"order":2,"title":"Directiva y asignación de capital","content":{"introduction":"Analiza qué hace la dirección con el dinero de la empresa y cómo trata a sus accionistas. La calidad de una presentación comercial no demuestra la calidad de sus decisiones.","sections":[{"title":"Decisiones observables","text":"La dirección puede reinvertir, adquirir empresas, reducir deuda, pagar dividendos o recomprar acciones. Evalúa las alternativas y los resultados posteriores. Una recompra a precio excesivo puede destruir valor aunque reduzca el número de acciones."},{"title":"Incentivos y comunicación","text":"Revisa qué métricas determinan la remuneración, la dilución y las operaciones con partes vinculadas. Compara promesas anteriores con resultados y valora explicaciones claras de los errores. Busca evidencia pública y evita convertir impresiones personales en hechos."}],"example":"Dos proyectos requieren 10. Uno mejora una actividad conocida; otro compra un negocio ajeno sin explicar sinergias. Antes de elegir, compara retornos esperados, riesgos y capacidad de ejecución.","takeaway":"Juzga la asignación de capital con evidencia, incentivos y alternativas, no con carisma.","source":{"title":"SEC: lectura del informe anual","url":"https://www.sec.gov/answers/reada10k.htm"}},"questions":[{"prompt":"Una recompra de acciones…","options":["Siempre crea valor","Depende del precio y las alternativas","Elimina el riesgo del negocio"]},{"prompt":"¿Qué ayuda a evaluar a la directiva?","options":["Comparar promesas anteriores con resultados","Solo su popularidad","El tamaño del logotipo"]},{"prompt":"La remuneración variable importa porque…","options":["Predice exactamente la bolsa","Sustituye los estados financieros","Puede orientar los incentivos de la dirección"]}],"answers":[1,0,2]},
  {"level":3,"order":3,"title":"Calidad, valoración y margen de seguridad","content":{"introduction":"Una buena empresa puede ser una mala inversión si el precio pagado exige expectativas imposibles. Completamos el análisis cualitativo con el margen de seguridad, concepto asociado a Benjamin Graham.","sections":[{"title":"Trabajar con escenarios","text":"Estimar valor exige hipótesis de ventas, márgenes, reinversión y riesgo. Usa escenarios prudente, central y favorable. Una cifra con muchos decimales no convierte la estimación en un hecho. Investiga qué condiciones justifican cada escenario."},{"title":"Dejar espacio al error","text":"El margen de seguridad compara precio con una estimación razonada de valor. Un descuento no protege si la estimación está equivocada. Relaciona la incertidumbre del negocio con la exigencia de precio y con el tamaño de la posición."}],"example":"Si estimas un valor de 100 y estudias un precio de 75, el descuento frente al valor es (100−75)/100 = 25 %. Si al revisar hipótesis el valor baja a 70, aquel margen desaparece.","takeaway":"Calidad y precio deben analizarse juntos; una estimación de valor nunca es una garantía.","source":{"title":"Investor.gov: herramientas y educación para invertir","url":"https://www.investor.gov/introduction-investing"}},"questions":[{"prompt":"Valor estimado 100 y precio 75: ¿descuento respecto al valor?","options":["25 %","75 %","33,3 %"]},{"prompt":"Si el valor revisado baja a 70 y el precio sigue en 75…","options":["El descuento aumenta","Ya no hay descuento frente a ese valor","La inversión queda garantizada"]},{"prompt":"¿Cómo se trata la incertidumbre de la valoración?","options":["Añadiendo decimales","Ignorando escenarios negativos","Revisando hipótesis y escenarios"]}],"answers":[0,1,2]},
  {"level":4,"order":1,"title":"Tendencias, soportes y resistencias","content":{"introduction":"El análisis técnico estudia el comportamiento del precio y del volumen. En el enfoque introductorio asociado a Murphy, el primer paso es describir la tendencia y el marco temporal.","sections":[{"title":"Describir antes de predecir","text":"Una secuencia de máximos y mínimos crecientes describe una tendencia alcista; decrecientes, una bajista. En un rango no aparece una dirección clara. Un gráfico diario y otro semanal pueden mostrar contextos distintos sin contradecirse."},{"title":"Zonas de reacción","text":"Un soporte es una zona donde antes apareció demanda; una resistencia, donde apareció oferta. Son zonas observadas, no barreras garantizadas. Una ruptura puede fallar: define qué evidencia confirmaría o invalidaría tu interpretación."}],"example":"Un activo marca mínimos en 40, 43 y 46, y máximos en 45, 48 y 52. La estructura es ascendente. Si pierde 46, revisa el contexto; ese hecho aislado no determina por sí solo todo el futuro.","takeaway":"Describe estructura, zona y horizonte antes de decidir cómo interpretar una señal.","source":{"title":"Editorial: Technical Analysis of the Financial Markets","url":"https://www.penguinrandomhouse.com/books/350647/technical-analysis-of-the-financial-markets-by-john-j-murphy/"}},"questions":[{"prompt":"Máximos y mínimos crecientes describen…","options":["Una tendencia alcista","Una caída garantizada","Ausencia de precios"]},{"prompt":"Un soporte es…","options":["Una garantía contractual","Una zona de demanda observada","El beneficio contable"]},{"prompt":"Al analizar una tendencia debes indicar…","options":["Solo el nombre del activo","Solo el dividendo","El marco temporal"]}],"answers":[0,1,2]},
  {"level":4,"order":2,"title":"Medias móviles y señales con retraso","content":{"introduction":"Una media móvil suaviza las oscilaciones del precio. Permite observar contexto, pero se calcula con información pasada y no anticipa necesariamente el siguiente movimiento.","sections":[{"title":"Calcular una media simple","text":"Suma los cierres del periodo elegido y divide por el número de observaciones. Al llegar un nuevo cierre, sale el más antiguo. Una media corta reacciona antes y también es más sensible al ruido; una larga suele reaccionar más despacio."},{"title":"Evitar señales automáticas","text":"Cruces de medias o de precio y media pueden ayudar a definir reglas. En mercados laterales pueden producir entradas y salidas repetidas con pérdidas y costes. Evalúa reglas completas, datos fuera de muestra y gastos antes de extrapolar resultados."}],"example":"Cierres 10, 12 y 14: media simple de tres periodos = 12. Entra un cierre de 16 y sale el de 10; la nueva media es 14. El suavizado describe cambios ya observados.","takeaway":"Una media es una herramienta de contexto con retraso, no una predicción infalible.","source":{"title":"Editorial: obra de John J. Murphy","url":"https://www.penguinrandomhouse.com/books/350647/technical-analysis-of-the-financial-markets-by-john-j-murphy/"}},"questions":[{"prompt":"Media simple de 10, 12 y 14:","options":["36","14","12"]},{"prompt":"Una media más corta suele…","options":["Reaccionar antes y captar más ruido","Eliminar toda señal falsa","Usar datos del futuro"]},{"prompt":"Los cruces en un mercado lateral pueden…","options":["Garantizar una tendencia","Generar señales falsas repetidas","Evitar comisiones"]}],"answers":[2,0,1]},
  {"level":4,"order":3,"title":"Patrones y confirmación","content":{"introduction":"Rangos, triángulos y dobles techos son formas de describir estructuras de precio. Identificar una figura no determina de forma segura su desenlace.","sections":[{"title":"Convertir la figura en hipótesis","text":"Define los puntos que forman el patrón, su duración y el nivel de invalidación. Sin reglas claras es fácil reconocer figuras solo después de conocer el resultado. El volumen puede aportar contexto, pero tampoco garantiza la ruptura."},{"title":"Probar sin mirar el futuro","text":"Distingue observación, confirmación y ejecución. Una ruptura intradía puede terminar dentro del rango. Decide de antemano si tu regla utiliza cierres y cómo trata deslizamiento y costes. Conserva los casos fallidos en tu registro."}],"example":"Un rango está entre 20 y 24. El precio llega a 24,5 y cierra en 23,8. Una regla que exige cierre por encima de 24 no confirma la ruptura, aunque durante la sesión el precio haya superado ese nivel.","takeaway":"Una figura útil necesita reglas observables y un criterio explícito de invalidación.","source":{"title":"Editorial: análisis técnico de Murphy","url":"https://www.penguinrandomhouse.com/books/350647/technical-analysis-of-the-financial-markets-by-john-j-murphy/"}},"questions":[{"prompt":"Si la regla exige cierre superior a 24 y cierra en 23,8…","options":["Hay confirmación segura","No se confirma esa regla","Se garantiza una subida mañana"]},{"prompt":"Reconocer solo los patrones que funcionaron introduce…","options":["Sesgo en la evaluación","Menor riesgo automáticamente","Más información disponible entonces"]},{"prompt":"Un patrón debe acompañarse de…","options":["Una promesa de rentabilidad","La exclusión de los fallos","Reglas de confirmación e invalidación"]}],"answers":[1,0,2]},
  {"level":5,"order":1,"title":"Las cuatro fases del mercado","content":{"introduction":"El marco de Weinstein organiza la observación del precio en cuatro etapas: base, avance, techo y descenso. Es una descripción de contexto, no un reloj que marque los cambios con certeza.","sections":[{"title":"Relacionar estructura y tendencia","text":"En una base el precio se estabiliza; en el avance aparece tendencia ascendente; en el techo pierde dirección; en el descenso predomina la tendencia bajista. Una media semanal de largo plazo puede ayudar a describir pendiente y posición relativa del precio."},{"title":"Aceptar las transiciones ambiguas","text":"Una consolidación puede preceder tanto a una continuación como a un giro. Compara mercado, sector y activo, y formula criterios de cambio de escenario. Las etapas solo se reconocen con incertidumbre y pueden aparecer falsas rupturas."}],"example":"Un precio deja de caer, pasa meses en un rango y después rompe al alza con una media que empieza a subir. Es un candidato a transición de base a avance, sujeto a confirmación y posible fallo.","takeaway":"Usa las fases como contexto para un plan, nunca como garantía del siguiente movimiento.","source":{"title":"Referencia: Stan Weinstein, Secrets for Profiting in Bull and Bear Markets","url":"https://www.investor.gov/introduction-investing"}},"questions":[{"prompt":"La etapa posterior a una base, si comienza una tendencia ascendente, es…","options":["Descenso","Techo garantizado","Avance"]},{"prompt":"Una consolidación lateral…","options":["Puede acabar en continuación o giro","Siempre inicia un descenso","Elimina la incertidumbre"]},{"prompt":"El marco de fases sirve para…","options":["Predecir fechas exactas","Organizar el contexto del mercado","Garantizar entradas perfectas"]}],"answers":[2,0,1]},
  {"level":5,"order":2,"title":"Stop-loss: invalidación y ejecución","content":{"introduction":"Una regla de salida define cuándo una hipótesis deja de ser válida. El stop-loss es una herramienta operativa de riesgo, no un seguro contra cualquier pérdida.","sections":[{"title":"Planificar antes de entrar","text":"Determina la condición que invalida tu idea y el riesgo que estás dispuesto a modelizar. Alejar el stop solo para evitar reconocer una pérdida cambia el riesgo inicial. Revisa las decisiones con criterios previamente definidos."},{"title":"Entender la orden","text":"Una orden stop de mercado se activa al alcanzarse el disparador y puede ejecutarse a otro precio. Los huecos de apertura y la liquidez afectan al resultado. Una stop limitada controla el precio límite, pero puede quedar sin ejecutar."}],"example":"Entrada hipotética a 50 y stop a 47: distancia prevista de 3 por acción. Si el mercado abre a 44, la pérdida efectiva puede superar esos 3. El escenario de salto debe formar parte del análisis.","takeaway":"Distingue riesgo previsto, precio de activación y precio real de ejecución.","source":{"title":"Investor.gov: tipos de órdenes","url":"https://www.investor.gov/introduction-investing/investing-basics/how-stock-markets-work/types-orders"}},"questions":[{"prompt":"Entrada a 50 y stop previsto a 47: distancia de riesgo por acción:","options":["3","47","97"]},{"prompt":"Una orden stop de mercado garantiza…","options":["El precio exacto del stop","Que nunca habrá pérdidas","No garantiza el precio de ejecución"]},{"prompt":"Una stop limitada puede…","options":["Eliminar los huecos","Quedar sin ejecutar","Convertirse en un dividendo"]}],"answers":[0,2,1]},
  {"level":5,"order":3,"title":"Tamaño de posición y riesgo agregado","content":{"introduction":"El tamaño de una posición conecta una idea con su impacto en la cuenta. Trabaja con escenarios de pérdida y no solo con el importe que quieres ganar.","sections":[{"title":"Un cálculo didáctico","text":"En un modelo simple, unidades = presupuesto de riesgo / distancia entre entrada y salida prevista. Después comprueba capital disponible, costes, liquidez y posibles huecos. El resultado es una referencia bajo hipótesis, no una recomendación de tamaño para todas las personas."},{"title":"Mirar la cartera completa","text":"Varias posiciones del mismo sector pueden caer juntas. Sumar riesgos por operación no describe todas las correlaciones ni eventos extremos. Lleva un diario de hipótesis, resultados y desviaciones para evaluar el proceso sin cambiar reglas tras cada operación."}],"example":"Cuenta ficticia de 10.000, presupuesto ilustrativo de pérdida de 100 y distancia prevista de 5 por acción: 20 acciones. Con entrada a 50, el importe invertido sería 1.000, diferente del riesgo previsto de 100.","takeaway":"Importe invertido y riesgo previsto son magnitudes diferentes; revisa también el riesgo conjunto.","source":{"title":"Investor.gov: diversificación","url":"https://www.investor.gov/introduction-investing/investing-basics/glossary/diversification"}},"questions":[{"prompt":"Presupuesto de riesgo 100 y distancia de 5 por acción: ¿unidades teóricas?","options":["500","20","5"]},{"prompt":"20 acciones a 50 representan una inversión de…","options":["100","20","1.000"]},{"prompt":"Varias posiciones correlacionadas pueden…","options":["Perder valor al mismo tiempo","Eliminar el riesgo agregado","Garantizar una compensación perfecta"]}],"answers":[1,2,0]}
]
$curriculum$::jsonb) loop
    select id into strict v_level from public.academy_levels where level_number = (item->>'level')::integer;
    insert into public.academy_lessons(level_id, order_index, title, content_json)
    values(v_level, (item->>'order')::integer, item->>'title', item->'content')
    on conflict(level_id, order_index) do update set title = excluded.title, content_json = excluded.content_json
    returning id into v_lesson;
    insert into public.quizzes(lesson_id, questions, passing_score)
    values(v_lesson, item->'questions', 70)
    on conflict(lesson_id) do update set questions = excluded.questions, passing_score = excluded.passing_score;
    insert into academy_private.quiz_answers(lesson_id, correct_answers)
    values(v_lesson, array(select value::integer from jsonb_array_elements_text(item->'answers')))
    on conflict(lesson_id) do update set correct_answers = excluded.correct_answers;
  end loop;
end;
$seed$;

commit;
