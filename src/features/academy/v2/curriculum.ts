// Índice original BullVest Academy V2. El contenido publicado vive en Supabase.
export type CourseModule = { level: 1 | 2 | 3 | 4 | 5; slug: string; title: string; author: string; lessons: ReadonlyArray<{slug: string; title: string}> };

export const ACADEMY_V2_CATALOG: ReadonlyArray<CourseModule> = [
  {
    "level": 1,
    "slug": "fundamentos-contables",
    "title": "Fundamentos de contabilidad y estados financieros",
    "author": "John J. Wild",
    "lessons": [
      {
        "slug": "el-balance-de-situacion-y-la-ecuacion-patrimonial",
        "title": "El balance de situación y la ecuación patrimonial"
      },
      {
        "slug": "la-cuenta-de-resultados-y-sus-margenes",
        "title": "La cuenta de resultados y sus márgenes"
      },
      {
        "slug": "el-estado-de-flujos-de-efectivo",
        "title": "El estado de flujos de efectivo"
      },
      {
        "slug": "relaciones-entre-los-tres-estados-financieros",
        "title": "Relaciones entre los tres estados financieros"
      }
    ]
  },
  {
    "level": 1,
    "slug": "diagnostico-financiero",
    "title": "Diagnóstico de la salud empresarial",
    "author": "John J. Wild",
    "lessons": [
      {
        "slug": "liquidez-solvencia-y-estructura-de-capital",
        "title": "Liquidez, solvencia y estructura de capital"
      },
      {
        "slug": "rentabilidad-roe-roa-y-roic",
        "title": "Rentabilidad: ROE, ROA y ROIC"
      },
      {
        "slug": "calidad-del-beneficio-y-devengo-contable",
        "title": "Calidad del beneficio y devengo contable"
      },
      {
        "slug": "capital-circulante-deuda-y-flujo-de-caja-libre",
        "title": "Capital circulante, deuda y flujo de caja libre"
      },
      {
        "slug": "caso-integrado-diagnostico-de-una-empresa-ficticia",
        "title": "Caso integrado: diagnóstico de una empresa ficticia"
      }
    ]
  },
  {
    "level": 2,
    "slug": "valoracion-fundamental",
    "title": "Precio, valor y retorno del capital",
    "author": "Joel Greenblatt",
    "lessons": [
      {
        "slug": "precio-de-mercado-frente-a-valor-economico",
        "title": "Precio de mercado frente a valor económico"
      },
      {
        "slug": "capital-invertido-y-rentabilidad-operativa",
        "title": "Capital invertido y rentabilidad operativa"
      },
      {
        "slug": "per-ev-ebit-ev-ebitda-y-sus-limitaciones",
        "title": "PER, EV/EBIT, EV/EBITDA y sus limitaciones"
      },
      {
        "slug": "valor-intrinseco-y-margen-de-seguridad",
        "title": "Valor intrínseco y margen de seguridad"
      }
    ]
  },
  {
    "level": 2,
    "slug": "formula-cuantitativa",
    "title": "Selección cuantitativa y fórmula de Greenblatt",
    "author": "Joel Greenblatt",
    "lessons": [
      {
        "slug": "rentabilidad-sobre-capital-y-rendimiento-de-beneficios",
        "title": "Rentabilidad sobre capital y rendimiento de beneficios"
      },
      {
        "slug": "clasificacion-y-comparacion-de-companias",
        "title": "Clasificación y comparación de compañías"
      },
      {
        "slug": "sesgos-exclusiones-sectoriales-y-errores-de-screening",
        "title": "Sesgos, exclusiones sectoriales y errores de screening"
      },
      {
        "slug": "caso-practico-ranking-de-acciones",
        "title": "Caso práctico: ranking de acciones"
      }
    ]
  },
  {
    "level": 3,
    "slug": "investigacion-empresarial",
    "title": "Investigación profunda de empresas",
    "author": "Philip Fisher",
    "lessons": [
      {
        "slug": "investigacion-cualitativa-y-metodo-scuttlebutt",
        "title": "Investigación cualitativa y método scuttlebutt"
      },
      {
        "slug": "productos-mercados-y-crecimiento-sostenible",
        "title": "Productos, mercados y crecimiento sostenible"
      },
      {
        "slug": "direccion-cultura-corporativa-y-asignacion-de-capital",
        "title": "Dirección, cultura corporativa y asignación de capital"
      },
      {
        "slug": "innovacion-investigacion-y-desarrollo",
        "title": "Innovación, investigación y desarrollo"
      },
      {
        "slug": "clientes-competidores-y-evidencias-externas",
        "title": "Clientes, competidores y evidencias externas"
      }
    ]
  },
  {
    "level": 3,
    "slug": "tesis-de-inversion",
    "title": "Construcción de una tesis de inversión",
    "author": "Philip Fisher",
    "lessons": [
      {
        "slug": "ventajas-competitivas-y-barreras-de-entrada",
        "title": "Ventajas competitivas y barreras de entrada"
      },
      {
        "slug": "calidad-del-crecimiento-y-reinversion",
        "title": "Calidad del crecimiento y reinversión"
      },
      {
        "slug": "riesgos-de-deterioro-y-senales-de-alerta",
        "title": "Riesgos de deterioro y señales de alerta"
      },
      {
        "slug": "caso-practico-tesis-de-inversion-contrastable",
        "title": "Caso práctico: tesis de inversión contrastable"
      }
    ]
  },
  {
    "level": 4,
    "slug": "lectura-del-precio",
    "title": "Estructura y lectura del precio",
    "author": "John J. Murphy",
    "lessons": [
      {
        "slug": "naturaleza-del-analisis-tecnico-y-sus-supuestos",
        "title": "Naturaleza del análisis técnico y sus supuestos"
      },
      {
        "slug": "graficos-de-lineas-barras-y-velas-japonesas",
        "title": "Gráficos de líneas, barras y velas japonesas"
      },
      {
        "slug": "tendencias-soportes-y-resistencias",
        "title": "Tendencias, soportes y resistencias"
      },
      {
        "slug": "volumen-rupturas-y-figuras-chartistas",
        "title": "Volumen, rupturas y figuras chartistas"
      },
      {
        "slug": "temporalidades-gaps-y-confirmacion-de-senales",
        "title": "Temporalidades, gaps y confirmación de señales"
      }
    ]
  },
  {
    "level": 4,
    "slug": "indicadores-tecnicos",
    "title": "Indicadores y sistemas técnicos",
    "author": "John J. Murphy",
    "lessons": [
      {
        "slug": "medias-moviles-y-senales-de-tendencia",
        "title": "Medias móviles y señales de tendencia"
      },
      {
        "slug": "rsi-macd-y-osciladores",
        "title": "RSI, MACD y osciladores"
      },
      {
        "slug": "volatilidad-atr-y-bandas-de-bollinger",
        "title": "Volatilidad, ATR y bandas de Bollinger"
      },
      {
        "slug": "divergencias-senales-falsas-y-pruebas-historicas",
        "title": "Divergencias, señales falsas y pruebas históricas"
      }
    ]
  },
  {
    "level": 4,
    "slug": "cuatro-etapas",
    "title": "Método de las cuatro etapas",
    "author": "Stan Weinstein",
    "lessons": [
      {
        "slug": "etapa-i-formacion-de-bases",
        "title": "Etapa I: formación de bases"
      },
      {
        "slug": "etapa-ii-tendencia-alcista",
        "title": "Etapa II: tendencia alcista"
      },
      {
        "slug": "etapa-iii-distribucion-y-agotamiento",
        "title": "Etapa III: distribución y agotamiento"
      },
      {
        "slug": "etapa-iv-tendencia-bajista",
        "title": "Etapa IV: tendencia bajista"
      }
    ]
  },
  {
    "level": 4,
    "slug": "timing-mercado",
    "title": "Timing, fuerza relativa y control de entrada",
    "author": "Stan Weinstein",
    "lessons": [
      {
        "slug": "fuerza-relativa-y-seleccion-de-candidatos",
        "title": "Fuerza relativa y selección de candidatos"
      },
      {
        "slug": "rupturas-volumen-y-puntos-de-entrada",
        "title": "Rupturas, volumen y puntos de entrada"
      },
      {
        "slug": "medias-de-largo-plazo-y-condiciones-de-mercado",
        "title": "Medias de largo plazo y condiciones de mercado"
      },
      {
        "slug": "caso-practico-clasificar-graficos-y-justificar-operaciones",
        "title": "Caso práctico: clasificar gráficos y justificar operaciones"
      }
    ]
  },
  {
    "level": 5,
    "slug": "sistema-de-trading",
    "title": "Diseño de un sistema de trading",
    "author": "Van K. Tharp",
    "lessons": [
      {
        "slug": "objetivos-creencias-y-psicologia-del-operador",
        "title": "Objetivos, creencias y psicología del operador"
      },
      {
        "slug": "ventaja-estadistica-y-reglas-del-sistema",
        "title": "Ventaja estadística y reglas del sistema"
      },
      {
        "slug": "definicion-de-entradas-salidas-y-stops",
        "title": "Definición de entradas, salidas y stops"
      },
      {
        "slug": "diario-de-operaciones-y-evaluacion-disciplinada",
        "title": "Diario de operaciones y evaluación disciplinada"
      }
    ]
  },
  {
    "level": 5,
    "slug": "gestion-monetaria",
    "title": "Matemáticas y gestión monetaria",
    "author": "Van K. Tharp",
    "lessons": [
      {
        "slug": "riesgo-inicial-y-multiplos-r",
        "title": "Riesgo inicial y múltiplos R"
      },
      {
        "slug": "tamano-de-posicion-y-exposicion-agregada",
        "title": "Tamaño de posición y exposición agregada"
      },
      {
        "slug": "expectativa-matematica-y-distribucion-de-resultados",
        "title": "Expectativa matemática y distribución de resultados"
      },
      {
        "slug": "drawdown-riesgo-de-ruina-y-simulacion-monte-carlo",
        "title": "Drawdown, riesgo de ruina y simulación Monte Carlo"
      },
      {
        "slug": "backtesting-sobreajuste-y-validacion-fuera-de-muestra",
        "title": "Backtesting, sobreajuste y validación fuera de muestra"
      }
    ]
  },
  {
    "level": 5,
    "slug": "laboratorio-bullvest",
    "title": "Laboratorio profesional BullVest",
    "author": "Síntesis de los seis autores",
    "lessons": [
      {
        "slug": "construccion-de-una-cartera-diversificada",
        "title": "Construcción de una cartera diversificada"
      },
      {
        "slug": "integracion-del-analisis-fundamental-y-tecnico",
        "title": "Integración del análisis fundamental y técnico"
      },
      {
        "slug": "plan-de-trading-con-limites-de-riesgo",
        "title": "Plan de trading con límites de riesgo"
      },
      {
        "slug": "revision-del-rendimiento-y-atribucion-de-resultados",
        "title": "Revisión del rendimiento y atribución de resultados"
      },
      {
        "slug": "proyecto-final-comite-de-inversion-simulado",
        "title": "Proyecto final: comité de inversión simulado"
      }
    ]
  }
];
