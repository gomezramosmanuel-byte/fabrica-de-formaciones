import crypto from 'crypto';
import {
  ClassifiedMaterialImage,
  Competency,
  ContentItem,
  Course,
  CourseAiAnalysisSummary,
  CourseModule,
  DifficultyLevel,
  ExtractedMaterialPage,
  GeminiStructuredMaterialAnalysis,
  ModuleStudyCard,
  QuestionOption,
  TrainingMaterial,
} from '../types/lms.ts';
import {
  buildClassifiedImagesFromPages,
  ensureMaterialsExtracted,
  extractSemanticKeywords,
  isCleanHumanReadableLine,
} from './materialExtractor.ts';

export interface DidacticSchematicOptions {
  title: string;
  subtitle?: string;
  objective?: string;
  bullets?: string[];
  steps?: Array<{ step_number?: number; title: string; description: string }>;
  technicalSpecs?: Array<{ label: string; value: string }>;
  highlightNote?: string;
  sourceFileName?: string;
  accentColor?: string;
}

function wrapSvgText(text: string, maxCharsPerLine: number, maxLines = 3): string[] {
  const clean = (text || '')
    .replace(/[<>&"']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return [];
  const words = clean.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const w of words) {
    if (!current) {
      current = w;
    } else if ((current + ' ' + w).length <= maxCharsPerLine) {
      current += ' ' + w;
    } else {
      lines.push(current);
      current = w;
      if (lines.length >= maxLines) break;
    }
  }
  if (current && lines.length < maxLines) {
    lines.push(current);
  }
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    lines[maxLines - 1] = lines[maxLines - 1].slice(0, Math.max(0, maxCharsPerLine - 3)) + '...';
  }
  return lines;
}

/**
 * Generates an automatic didactic technical schematic SVG based exclusively on the slide's
 * own content, steps, technical parameters, and reference material (Priority 4).
 */
export function generateThematicSvgDataUri(
  titleOrOptions: string | DidacticSchematicOptions,
  subtitle = 'ESQUEMA DIDÁCTICO AUTOMÁTICO · MATERIAL DE REFERENCIA',
  accentColor = '#DA291C'
): string {
  const opts: DidacticSchematicOptions =
    typeof titleOrOptions === 'string'
      ? { title: titleOrOptions, subtitle, accentColor }
      : titleOrOptions;

  const primaryColor = opts.accentColor || accentColor || '#DA291C';
  const cleanTitle = (opts.title || 'Esquema Didáctico del Slide')
    .replace(/[<>&"']/g, '')
    .slice(0, 68);
  const cleanSub = (
    opts.subtitle ||
    subtitle ||
    'ESQUEMA DIDÁCTICO GENERADO DESDE EL CONTENIDO DEL SLIDE'
  )
    .replace(/[<>&"']/g, '')
    .slice(0, 78);

  // Build 3 concrete didactic cards exclusively from the slide's steps, technicalSpecs, or bullets
  const cards: Array<{ header: string; lines: string[]; color: string }> = [];
  const palette = [primaryColor, '#38BDF8', '#10B981'];

  if (Array.isArray(opts.steps) && opts.steps.length > 0) {
    opts.steps.slice(0, 3).forEach((st, idx) => {
      cards.push({
        header: `PASO 0${st.step_number || idx + 1}: ${(st.title || '').replace(/[<>&"']/g, '').slice(0, 20).toUpperCase()}`,
        lines: wrapSvgText(st.description || st.title, 26, 3),
        color: palette[idx % palette.length],
      });
    });
  } else if (Array.isArray(opts.technicalSpecs) && opts.technicalSpecs.length >= 2) {
    opts.technicalSpecs.slice(0, 3).forEach((spec, idx) => {
      cards.push({
        header: `0${idx + 1}. ${(spec.label || 'PARÁMETRO').replace(/[<>&"']/g, '').slice(0, 22).toUpperCase()}`,
        lines: wrapSvgText(spec.value, 26, 3),
        color: palette[idx % palette.length],
      });
    });
  } else if (Array.isArray(opts.bullets) && opts.bullets.length > 0) {
    opts.bullets.slice(0, 3).forEach((b, idx) => {
      const colonIdx = b.indexOf(':');
      const headerTxt =
        colonIdx > 2 && colonIdx < 28
          ? b.slice(0, colonIdx)
          : `CONCEPTO CLAVE 0${idx + 1}`;
      const bodyTxt = colonIdx > 2 && colonIdx < 28 ? b.slice(colonIdx + 1).trim() : b;
      cards.push({
        header: `0${idx + 1}. ${headerTxt.replace(/[<>&"']/g, '').slice(0, 22).toUpperCase()}`,
        lines: wrapSvgText(bodyTxt, 26, 3),
        color: palette[idx % palette.length],
      });
    });
  }

  // Fill up to 3 cards using title/subtitle/highlightNote if slide had fewer than 3 bullets
  while (cards.length < 3) {
    const idx = cards.length;
    const fallbackText =
      idx === 0
        ? opts.title
        : idx === 1
        ? opts.highlightNote || opts.objective || opts.subtitle || opts.title
        : opts.sourceFileName
        ? `Referencia técnica: ${opts.sourceFileName}`
        : 'Aplicación de criterio técnico según material de referencia';
    cards.push({
      header:
        idx === 0
          ? '01. CONCEPTO CENTRAL'
          : idx === 1
          ? '02. CRITERIO TÉCNICO'
          : '03. VERIFICACIÓN EN CAMPO',
      lines: wrapSvgText(fallbackText, 26, 3),
      color: palette[idx % palette.length],
    });
  }

  const footerNote = (
    opts.highlightNote ||
    opts.objective ||
    (opts.sourceFileName
      ? `ESQUEMA DIDÁCTICO BASADO EN: ${opts.sourceFileName.toUpperCase()}`
      : 'ESQUEMA DIDÁCTICO GENERADO AUTOMÁTICAMENTE DEL CONTENIDO DEL SLIDE')
  )
    .replace(/[<>&"']/g, '')
    .slice(0, 88);

  const cardNodesSvg = cards
    .map((c, idx) => {
      const x = idx * 230;
      const lineNodes = c.lines
        .map(
          (ln, lIdx) =>
            `<text x="${x + 14}" y="${54 + lIdx * 20}" fill="#E2E8F0" font-family="sans-serif" font-size="11.5">${ln}</text>`
        )
        .join('');
      const connector =
        idx < 2
          ? `<line x1="${x + 200}" y1="62" x2="${x + 230}" y2="62" stroke="${c.color}" stroke-width="2.5" stroke-dasharray="4 2"/>`
          : '';
      return `
        <rect x="${x}" y="0" width="200" height="124" rx="10" fill="#1E293B" stroke="${c.color}" stroke-width="2"/>
        <text x="${x + 14}" y="28" fill="${c.color}" font-family="monospace" font-size="11" font-weight="bold">${c.header}</text>
        ${lineNodes}
        ${connector}
      `;
    })
    .join('\n');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 420" width="100%" height="100%">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#0F172A"/>
        <stop offset="100%" stop-color="#1E293B"/>
      </linearGradient>
    </defs>
    <rect width="800" height="420" fill="url(#bg)"/>
    <rect x="0" y="0" width="800" height="10" fill="${primaryColor}"/>
    <g stroke="#334155" stroke-width="1" opacity="0.4">
      <line x1="0" y1="80" x2="800" y2="80"/>
      <line x1="0" y1="160" x2="800" y2="160"/>
      <line x1="0" y1="240" x2="800" y2="240"/>
      <line x1="0" y1="320" x2="800" y2="320"/>
      <line x1="160" y1="0" x2="160" y2="420"/>
      <line x1="320" y1="0" x2="320" y2="420"/>
      <line x1="480" y1="0" x2="480" y2="420"/>
      <line x1="640" y1="0" x2="640" y2="420"/>
    </g>
    <rect x="34" y="34" width="732" height="352" rx="16" fill="#0F172A" fill-opacity="0.9" stroke="#475569" stroke-width="1.5"/>
    <circle cx="72" cy="76" r="12" fill="${primaryColor}"/>
    <text x="94" y="81" fill="#F8FAFC" font-family="monospace" font-size="12" font-weight="bold">${cleanSub}</text>
    <text x="60" y="132" fill="#FFFFFF" font-family="sans-serif" font-size="19" font-weight="bold">${cleanTitle}</text>
    <g transform="translate(68, 162)">
      ${cardNodesSvg}
    </g>
    <rect x="60" y="316" width="680" height="42" rx="8" fill="#1E293B" stroke="#334155" stroke-width="1"/>
    <text x="76" y="342" fill="#94A3B8" font-family="monospace" font-size="11.5">${footerNote}</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Intelligent Semantic Assignment (Sections 1 & 5):
 * Analyzes slide title, objective, main concept, body, procedure, competency, and keywords
 * to select the most semantically relevant image from the SAME training's reference materials.
 * Never assigns random images or discarded/decorative logos.
 */
export function findBestMaterialImageForSlide(params: {
  slideTitle: string;
  slideSubtitle?: string;
  slideObjective?: string;
  mainConcept?: string;
  slideBody?: string;
  isProcedural?: boolean;
  competencyName?: string;
  pageNumber?: number;
  pageImageUrl?: string;
  classifiedImages: ClassifiedMaterialImage[];
  usedImageCounts?: Map<string, number>;
}): ClassifiedMaterialImage | null {
  const validImages = (params.classifiedImages || []).filter(
    (img) => img && img.image_url && !img.is_discarded && img.category !== 'LOGO'
  );
  if (validImages.length === 0) return null;

  // 1. If the slide comes directly from a specific page that has a valid non-discarded image, check it first
  if (params.pageImageUrl) {
    const exactByUrl = validImages.find((img) => img.image_url === params.pageImageUrl);
    if (exactByUrl) return exactByUrl;
  }
  if (params.pageNumber !== undefined) {
    const exactByPage = validImages.find((img) => img.page_number === params.pageNumber);
    if (exactByPage) return exactByPage;
  }

  // 2. Semantic scoring across all valid images from the same training material
  const slideText = [
    params.slideTitle,
    params.slideSubtitle || '',
    params.slideObjective || '',
    params.mainConcept || '',
    params.slideBody || '',
    params.competencyName || '',
  ]
    .join(' ')
    .toLowerCase();

  const slideKeywords = new Set(extractSemanticKeywords(slideText, 18));
  if (slideKeywords.size === 0) return null;

  const wantsDiagram =
    Boolean(params.isProcedural) ||
    /(?:procedimiento|paso|secuencia|flujo|enrutamiento|arquitectura|estructura|transici[oó]n|preparaci[oó]n|esquema|diagrama)/i.test(
      slideText
    );
  const wantsTable =
    /(?:tabla|sap|maestra|longitud|dimensiones|capacidad|rango|par[aá]metro|c[oó]digo)/i.test(
      slideText
    );
  const wantsPhoto =
    /(?:conector|cable|cierre|domo|bandeja|holder|herramienta|fosc|cto|nap|equipo|fusi[oó]n)/i.test(
      slideText
    );

  let bestMatch: ClassifiedMaterialImage | null = null;
  let bestScore = 0;

  for (const img of validImages) {
    let score = 0;
    const imgText = [
      img.title || '',
      img.related_topic || '',
      img.caption || '',
      img.description || '',
      ...(img.keywords || []),
      ...(img.associated_concepts || []),
    ]
      .join(' ')
      .toLowerCase();

    const imgKeywords = new Set([
      ...(img.keywords || []),
      ...extractSemanticKeywords(imgText, 16),
    ]);

    let sharedCount = 0;
    for (const kw of slideKeywords) {
      if (imgKeywords.has(kw) || imgText.includes(kw)) {
        sharedCount++;
        score += kw.length >= 6 ? 12 : 8;
      }
    }

    if (sharedCount === 0) continue;

    // Boost when visual category matches pedagogical intent of the slide (Section 5)
    if (wantsDiagram && (img.category === 'DIAGRAMA' || img.category === 'ESQUEMA')) {
      score += 14;
    }
    if (wantsTable && (img.category === 'TABLA' || img.category === 'GRÁFICO')) {
      score += 14;
    }
    if (wantsPhoto && (img.category === 'FOTOGRAFÍA' || img.category === 'ILUSTRACIÓN')) {
      score += 10;
    }

    // Slight penalty for already over-used images so distinct slides pick their most specific figure
    const usedCount = params.usedImageCounts?.get(img.image_url) || 0;
    score -= usedCount * 6;

    if (score > bestScore) {
      bestScore = score;
      bestMatch = img;
    }
  }

  // Require a meaningful semantic match (Section 5: "NO asignar imágenes aleatorias simplemente porque provienen del mismo documento")
  return bestScore >= 14 ? bestMatch : null;
}

/**
 * Expert Fiber Optics & Telecommunications Knowledge Enricher:
 * Expands every slide ("ficha formativa") with deep study material, technical specifications,
 * and engineering notes while preserving 100% of the slide's original extracted content.
 */
function enrichSlideWithTelecomExpertise(page: ExtractedMaterialPage): {
  title: string;
  subtitle: string;
  bullets: string[];
  highlightNote: string;
  steps?: Array<{
    step_number: number;
    title: string;
    description: string;
    critical_note?: string;
  }>;
  technicalSpecs?: Array<{ label: string; value: string }>;
  studyNotes?: string[];
  isStepsSlide: boolean;
} {
  const rawTitle = (page.title || '').trim();
  const rawBullets = (page.bullets || [])
    .map((b) => b.replace(/^[•\-*]\s*/, '').trim())
    .filter((b) => isCleanHumanReadableLine(b));

  const combinedLower = `${rawTitle} ${rawBullets.join(' ')}`.toLowerCase();

  let title = rawTitle;
  let subtitle = `Ficha de Estudio · Diapositiva ${page.page_number} · Ingeniería de Fibra Óptica y Planta Externa`;
  const bullets = [...rawBullets];
  let highlightNote = '';
  let isStepsSlide = false;
  let steps:
    | Array<{
        step_number: number;
        title: string;
        description: string;
        critical_note?: string;
      }>
    | undefined;
  let technicalSpecs: Array<{ label: string; value: string }> = [];
  let studyNotes: string[] = [];

  // Enrich specific telecommunications & FOSC Ribbon topics based on exact slide content
  if (/rollable-ribbon|432|1728|3,456|g\.657\.a1|gr-320-core/i.test(combinedLower)) {
    title = rawTitle.includes('Ribbon')
      ? rawTitle
      : `Arquitectura de Fibra Óptica Rollable-Ribbon (${rawTitle})`;
    subtitle = `Ficha ${page.page_number} · Estándares ITU-T G.657.A1 / Telcordia GR-320-CORE Issue 4`;
    bullets.push(
      'Diseño de Matriz Flexible (Rollable-Ribbon): A diferencia de la cinta plana rígida tradicional (Flat Ribbon), las 12 fibras de 250 µm están unidas intermitentemente en puntos alternados, permitiendo enrollar la cinta como un haz compacto sin inducir tensión diferencial.',
      'Alta Densidad en Ductos Existentes: Permite fabricar cables desde 432 y 1,728 hasta 3,456 fibras ópticas en un diámetro exterior de apenas 1.38 pulgadas (35 mm), reduciendo el peso lineal en un 30% y maximizando la ocupación de subconductos en planta externa.',
      'Desempeño Óptico Monomodo Dual (ITU-T G.652.D / G.657.A1): Combina compatibilidad total con la planta instalada G.652.D y baja sensibilidad a macrocurvaturas (G.657.A1, radio mínimo de curvatura de 10 mm en fibra y 30 mm en bandeja de empalme).',
      'Cumplimiento Normativo: Certificado bajo Telcordia GR-320-CORE Issue 4 (requisitos genéricos para fibra y cintas ópticas) y ANSI/ICEA S-87-640 (cables ópticos para planta externa).'
    );
    technicalSpecs = [
      { label: 'Estándar de Fibra Óptica', value: 'ITU-T G.652.D y G.657.A1 (Baja pérdida por curvatura)' },
      { label: 'Normas de Calificación', value: 'Telcordia GR-320-CORE Issue 4 · ANSI/ICEA S-87-640' },
      { label: 'Capacidad y Diámetro Máx.', value: 'Hasta 3,456 FO en 1.38" (35 mm) · 30% menor peso' },
      { label: 'Configuración de Cinta', value: '12 fibras (12F) parcialmente unidas (Rollable Matrix)' },
    ];
    studyNotes = [
      'En empalmería masiva, una cinta de 12 fibras Rollable-Ribbon se despliega como cinta plana al insertarse en el Holder de la fusionadora de masa, reduciendo en un 80% el tiempo de fusión frente a fibra a fibra.',
      'El código de colores de las 12 fibras dentro de cada cinta sigue rigurosamente la norma TIA/EIA-598: 1-Azul, 2-Naranja, 3-Verde, 4-Marrón, 5-Gris, 6-Blanco, 7-Rojo, 8-Negro, 9-Amarillo, 10-Violeta, 11-Rosa, 12-Aguamarina.',
    ];
    highlightNote =
      'Las fibras Rollable-Ribbon están parcialmente unidas en puntos determinados, logrando hasta 3,456 FO en 1.38" (35 mm) y reducción de peso del 30% bajo norma GR-320-CORE Issue 4 y ANSI/ICEA S-87-640.';
  } else if (/4057055|d-288-ca-rr|central core|unitubo al centro/i.test(combinedLower) && !/en caso de/i.test(combinedLower)) {
    title = 'Estructura de Cable Fibra Óptica Ribbon: Dieléctrico vs Armado (Central Core)';
    subtitle = `Ficha ${page.page_number} · Especificación de Cable OSP 288F Rollable-Ribbon (SAP 4057055)`;
    bullets.push(
      'Arquitectura Central Core (Unitubo al Centro): Todas las cintas Rollable-Ribbon se alojan dentro de un único tubo central seco (Dry Central Tube) rodeado de elementos de bloqueo de agua en seco (Arid-Core / cintas hidroexpansivas), eliminando el uso de geles derivados del petróleo.',
      'Variante con Armadura Corrugada (Código SAP 4057055): Incorpora coraza de acero recubierto de copolímero (CSP) para protección contra roedores y aplastamiento mecánico en canalizaciones o tendido directo enterrado, además de dos miembros de fuerza longitudinales embebidos en la chaqueta PE.',
      'Variante Totalmente Dieléctrica (All-Dielectric): Utiliza miembros de fuerza no metálicos (FRP - Plástico Reforzado con Fibra de Vidrio), ideal para tendidos adyacentes a líneas de media/alta tensión sin requerir puesta a tierra.',
      'Organización Interna del Cable 288F: Contiene 24 cintas de 12 fibras cada una (24 × 12 = 288 FO), agrupadas en sub-unidades identificadas para facilitar la separación en sangrados (Midspan) o puntas.'
    );
    technicalSpecs = [
      { label: 'Código SAP Claro', value: 'SAP 4057055 (Part Number 810010013/DB)' },
      { label: 'Referencia de Ingeniería', value: 'D-288-CA-RR-F12NS/8W/99A (288 Fibras · 24 Cintas × 12F)' },
      { label: 'Construcción del Núcleo', value: 'Armored · Arid-Core · Dry Central Tube · Gel-Free' },
      { label: 'Tipo de Fibra y Cubierta', value: 'Singlemode G.652.D / G.657.A1 · Chaqueta PE Negra UV' },
    ];
    studyNotes = [
      'Al ser un cable Gel-Free (libre de gel), no requiere solventes desengrasantes durante la preparación del cable, acelerando la limpieza previa a la fusión.',
      'En cables armados (SAP 4057055), es obligatorio instalar el kit de continuidad y aterrizaje sobre la coraza metálica dentro del cierre de empalme.',
    ];
    highlightNote =
      'Código SAP 4057055 (Part Number 810010013/DB | D-288-CA-RR-F12NS/8W/99A): Cable OSP Armado Arid-Core, tubo central seco Rollable-Ribbon de 288 fibras monomodo G.652.D y G.657.A1 libre de gel.';
  } else if (/tipos de cajas|tipos de sellado|mec[aá]nicos \(gel\)|termocontr[aá]ctil/i.test(combinedLower)) {
    title = 'Clasificación de Cierres de Empalme y Tecnologías de Sellado (Gel vs Termocontráctil)';
    subtitle = `Ficha ${page.page_number} · Selección de Cubiertas FOSC 450 C6 y FOSC 400 C5`;
    bullets.push(
      'Tecnología de Sellado Mecánico por Gel (FOSC 450 C6): Emplea bloques de gel viscoelástico presurizado mediante un mecanismo de cierre rápido (trinquete/tornillo), permitiendo múltiples reingresos y adición de cables en frío sin necesidad de pistola de calor ni flama.',
      'Tecnología de Sellado Termocontráctil (FOSC 400 C5): Utiliza mangas termocontráctiles con revestimiento interno de adhesivo termofusible (Hot-Melt) que al calentarse se contrae y sella herméticamente la base y los puertos de cable.',
      'Hermeticidad IP-68 (Telcordia GR-771-CORE): Ambas tecnologías garantizan protección total contra inmersión prolongada en cámaras subterráneas inundadas, polvo, variaciones térmicas y vibración.',
      'Criterio de Selección en Campo: La FOSC 450 C6 es ideal en cámaras con presencia de gases o donde se prohibe el uso de calor/llama abierta y en nodos de frecuente reingreso; la FOSC 400 C5 ofrece una fijación termomecánica robusta para troncales permanentes.'
    );
    technicalSpecs = [
      { label: 'Cierre FOSC 450 C6', value: 'Sellado Mecánico por Bloques de Gel (Reingreso en frío)' },
      { label: 'Cierre FOSC 400 C5', value: 'Sellado Termocontráctil (Mangas con adhesivo termofusible)' },
      { label: 'Grado de Protección', value: 'IP-68 · Norma Telcordia GR-771-CORE para Planta Externa' },
      { label: 'Diámetro de Cable Admitido', value: '9 mm a 25 mm máximo en ambas tecnologías' },
    ];
    studyNotes = [
      'En cierres FOSC 400 C5 se debe aplicar calor uniforme hasta que el adhesivo termofusible asome por el borde de la manga y cambie el indicador térmico.',
      'En cierres FOSC 450 C6 nunca se debe aplicar silicona ni grasa adicional sobre los bloques de gel originales de fábrica.',
    ];
    highlightNote =
      'Estándar Claro-CommScope: FOSC 450 C6 opera con sellado mecánico en Gel; FOSC 400 C5 opera con sellado termocontráctil.';
  } else if (/1051544|1051547|1059717|1051546|fosc 450 c6/i.test(combinedLower)) {
    title = 'Tecnología Mecánica FOSC 450 C6 y Códigos en Maestra de Materiales SAP';
    subtitle = `Ficha ${page.page_number} · Identificación SAP y Diámetro de Cable (9 a 25 mm)`;
    bullets.push(
      'Configuración Base FOSC 450 C6: Cierre tipo domo de 6 puertos redondos concéntricos con sistema de sellado mecánico en Gel y canasta (basket) de almacenamiento para cintas Ribbon o tubos holgados.',
      'Código SAP 1051544 (Cierre 576 Fibras): Configuración para troncales de hasta 576 FO (equipada con 3 bandejas de 216 fibras o según diseño de ruta).',
      'Código SAP 1051547 (Cierre 864 Fibras): Configuración de alta capacidad para cables de hasta 864 FO utilizando 4 bandejas de 216 fibras cada una (4 × 216 = 864 FO).',
      'Bandejas y Protectores Asociados en SAP: Bandeja adicional FOSC-ACC-C-TRAY-RIBN-18 (Código SAP 1059717, capacidad 216 fusiones) y Protector de Fusión Masiva Ribbon x 12F de 42 mm (Código SAP 1051546).'
    );
    technicalSpecs = [
      { label: 'SAP 1051544', value: 'Caja de Empalme FOSC 450 C6 para 576 Fibras (Gel)' },
      { label: 'SAP 1051547', value: 'Caja de Empalme FOSC 450 C6 para 864 Fibras (Gel)' },
      { label: 'SAP 1059717', value: 'Bandeja Adicional Ribbon para 216 Fusiones (18 cintas × 12F)' },
      { label: 'SAP 1051546', value: 'Protector de Fusión Ribbon × 12 Fibras (Longitud 42 mm)' },
    ];
    studyNotes = [
      'Asegúrese de solicitar en almacén los protectores SAP 1051546 de 42 mm específicos para cinta Ribbon; los protectores estándar de 60 mm para fibra individual NO encajan en el Holder Ribbon.',
      'Verifique siempre que el diámetro exterior de los cables a ingresar en los 6 puertos de la FOSC 450 C6 esté entre 9 mm y 25 mm.',
    ];
    highlightNote =
      'Códigos SAP FOSC 450 C6: SAP 1051544 (Cierre 576 Fibras) · SAP 1051547 (Cierre 864 Fibras) · SAP 1059717 (Bandeja Ribbon 216 Fusiones) · SAP 1051546 (Protector de Fusión Ribbon x 12F, 42 mm). Diámetro de cable admisible: 9 a 25 mm máx.';
  } else if (/fosc 400 c5/i.test(combinedLower) && /maestra de materiales|co09/i.test(combinedLower)) {
    title = 'Tecnología Termocontráctil FOSC 400 C5 en Maestra de Materiales';
    subtitle = `Ficha ${page.page_number} · Referencias de Cierres y Bandejas Ribbon FOSC 400 C5`;
    bullets.push(
      'Arquitectura de Puertos FOSC 400 C5: Dispone de 1 puerto oval para entrada de cable en sangrado (Midspan, 2 cables de 10 a 25 mm) más 4 puertos circulares para cables en derivación o punta.',
      'Variantes según Cantidad de Bandejas Ribbon Preinstaladas: FOSC400-C5-R3-4-NGV-A-CO09 (con 4 bandejas para 864 FO), R3-3 (con 3 bandejas para 648 FO) y R3-2 (con 2 bandejas para 432 FO).',
      'Nomenclatura Técnica CommScope: "R3" identifica la configuración con bandejas Ribbon para cintas de 12F, "NGV" indica sin válvula o con válvula según sufijo CO09 para Claro Colombia.',
      'Escalabilidad Modular: Permite adquirir el cierre con 2 bandejas e instalar posteriormente bandejas adicionales FOSC-ACC-C-TRAY-RIBN-18 a medida que crece la demanda de fusiones.'
    );
    technicalSpecs = [
      { label: 'Modelo 4 Bandejas (864F)', value: 'FOSC400-C5-R3-4-NGV-A-CO09' },
      { label: 'Modelo 3 Bandejas (648F)', value: 'FOSC400-C5-R3-3-NGV-A-CO09' },
      { label: 'Modelo 2 Bandejas (432F)', value: 'FOSC400-C5-R3-2-NGV-A-CO09' },
      { label: 'Bandeja Ribbon Tipo C', value: 'FOSC-ACC-C-TRAY-RIBN-18 (MID 398955-000)' },
    ];
    studyNotes = [
      'En el puerto oval de la FOSC 400 C5 es obligatorio instalar el clip metálico de bifurcación (Branching Clip) para separar y sellar correctamente los dos lados del bucle de sangrado.',
    ];
    highlightNote =
      'Referencias FOSC 400 C5 Ribbon: FOSC400-C5-R3-4-NGV-A-CO09 (4 bandejas), R3-3 (3 bandejas), R3-2 (2 bandejas) y Bandeja adicional FOSC-ACC-C-TRAY-RIBN-18.';
  } else if (/1059714|1l991h-000|contenido de caja de empalme 864/i.test(combinedLower)) {
    title = 'Contenido del Kit de Caja de Empalme FOSC 400 C5 para 864 Fibras (SAP 1059714)';
    subtitle = `Ficha ${page.page_number} · Desglose de Componentes y Hermeticidad Telcordia GR-771 IP-68`;
    bullets.push(
      'Identificación del Kit Completo (SAP 1059714 / P/N 1L991H-000): Solución integral lista para instalación en campo de hasta 864 fibras en cintas de 12 hilos.',
      'Dotación de Bandejas (4 Unidades): Incluye 2 bandejas instaladas de fábrica dentro del cierre más 2 bandejas adicionales referencia 398955-000 (FOSC-ACC-C-TRAY-RIBN-18), sumando 4 × 216 = 864 fibras.',
      'Dotación de Protectores de Fusión (72 Unidades): Incluye 72 protectores termocontráctiles SMOUV-1120-R2/12-02 para cinta Ribbon de 12 fibras (72 × 12 = 864 fibras protegidas).',
      'Accesorios de Retención, Sellado y Montaje: Kit de sellado termocontráctil, retención para 4 cables (2 en puerto oval + 4 derivaciones), tubos en espiral para transporte de cintas, válvula de prueba de presión (5 psi máx.) y herraje de soporte para poste o pared.'
    );
    technicalSpecs = [
      { label: 'Código SAP / Part Number', value: 'SAP 1059714 · CommScope P/N 1L991H-000' },
      { label: 'Capacidad Total del Kit', value: '864 Fibras (4 Bandejas × 216 FO = 72 Fusiones Masivas 12F)' },
      { label: 'Protectores Incluidos', value: '72 uds. SMOUV-1120-R2/12-02 (42 mm para cinta 12F)' },
      { label: 'Prueba de Presión (Válvula)', value: 'Válvula de test integrada (Presión máxima: 5 psi / 35 kPa)' },
    ];
    studyNotes = [
      'Durante la prueba de hermeticidad por presurización a través de la válvula de test, nunca supere los 5 psi (35 kPa) para evitar deformar el domo o desplazar los sellos.',
    ];
    highlightNote =
      'Kit SAP 1059714 (P/N 1L991H-000): Cierre tipo Domo hermético GR-771 IP-68 para 864 fibras. Incluye 4 bandejas, 72 protectores SMOUV-1120-R2/12-02, retención para 4 cables, cintas espirales, válvula de test y soporte poste/pared.';
  } else if (/rango de uso|9 a 25 mm/i.test(combinedLower)) {
    title = 'Rango Operativo de Diámetro de Cable (9 a 25 mm) en FOSC 450 C6 y FOSC 400 C5/D5';
    subtitle = `Ficha ${page.page_number} · Verificación Previa de Compatibilidad de Cubierta Exterior`;
    bullets.push(
      'Rango de Diámetro Exterior Admisible: Desde 9 mm mínimo hasta 25 mm máximo de diámetro sobre la chaqueta exterior del cable.',
      'Compatibilidad Transversal: Este rango de 9 a 25 mm aplica tanto para cierres FOSC 450 C6 (Tecnología Mecánica en Gel) como para cierres FOSC 400 C5 y D5 (Tecnología Termocontráctil).',
      'Medición Previa con Pie de Rey (Calibrador): Antes de seleccionar el puerto o cortar la manga/módulo de gel, el técnico debe medir el diámetro real del cable para evitar fugas de hermeticidad.',
      'Consecuencias de Incumplimiento: Un cable menor a 9 mm sin adaptador de engrosamiento no alcanzará la compresión de gel requerida; un cable mayor a 25 mm forzará el puerto de entrada.'
    );
    technicalSpecs = [
      { label: 'Diámetro Mínimo Admitido', value: '9 mm (0.35 pulgadas)' },
      { label: 'Diámetro Máximo Admitido', value: '25 mm (0.98 pulgadas)' },
      { label: 'Modelos Aplicables', value: 'FOSC 450 C6 (Gel) · FOSC 400 C5 / D5 (Termocontráctil)' },
      { label: 'Instrumento de Verificación', value: 'Calibrador / Pie de rey en campo antes de desforrar' },
    ];
    studyNotes = [
      'Prepare siempre la chaqueta exterior del cable con lija de grano medio (en termocontráctil) o alcohol isopropílico (en gel) dentro de la zona de contacto del sello.',
    ];
    highlightNote =
      'Parámetro crítico de instalación: Compruebe siempre que el diámetro exterior del cable de fibra óptica se encuentre entre 9 mm y 25 mm máximo.';
  } else if (/alternativas|709972-000|398955-000/i.test(combinedLower)) {
    title = 'Familia FOSC 450 (A4, BS/B6, C6, D6) y Selección de Bandejas para Fibra Ribbon';
    subtitle = `Ficha ${page.page_number} · Compatibilidad de Bandejas FOSC-ACC-TRAY para Cintas de 12 Fibras`;
    bullets.push(
      'Versatilidad de la Plataforma FOSC 450: Todos los tamaños de cierres FOSC 450 (A4, B6, C6 y D6) pueden adaptarse para operar con cables de fibra óptica Ribbon instalando la bandeja porta-fusiones correspondiente.',
      'Bandeja para Cierres Compactos A y B (MID 709972-000): Referencia FOSC-ACC-A/B-TRAY-12-RBN, diseñada para alojar cintas Ribbon en domos tipo A4 y B6.',
      'Bandeja para Cierre Mediano/Alto C6 (MID 398955-000): Referencia FOSC-ACC-C-TRAY-RIBN-18 (SAP 1059717), con capacidad para 18 fusiones masivas (216 fibras).',
      'Bandeja para Cierre Gran Capacidad D6: Referencia FOSC-ACC-D-TRAY-RIBN-24, diseñada para troncales de ultra-alta densidad en domos tipo D6.'
    );
    technicalSpecs = [
      { label: 'Bandeja Domos A4 / B6', value: 'MID 709972-000 · FOSC-ACC-A/B-TRAY-12-RBN' },
      { label: 'Bandeja Domo C6', value: 'MID 398955-000 · FOSC-ACC-C-TRAY-RIBN-18 (216 FO)' },
      { label: 'Bandeja Domo D6', value: 'FOSC-ACC-D-TRAY-RIBN-24 (288 FO por bandeja)' },
    ];
    studyNotes = [
      'Las bandejas Ribbon tipo C incorporan pestañas elevadas y Holders profundos para alojar hasta 6 protectores SMOUV-1120-R2/12-02 por cada Holder.',
    ];
    highlightNote =
      'Todos los cierres FOSC 450 pueden utilizarse con fibra Ribbon instalando la bandeja correspondiente: MID 709972-000 (A/B) o MID 398955-000 (C6).';
  } else if (/tama[ñn]os|dimensiones y capacidades/i.test(combinedLower)) {
    title =
      rawTitle.length < 15
        ? 'Comparativa de Tamaños y Geometría de Domos FOSC (A, B, C, D)'
        : 'Dimensiones Físicas y Capacidades de Empalme de la Familia FOSC 450';
    subtitle = `Ficha ${page.page_number} · Capacidad de Puertos de Entrada, Dimensiones y Número de Fusiones`;
    bullets.push(
      'Escalabilidad Geométrica (Modelos A4, B6, C6 y D6): La familia FOSC 450 incrementa progresivamente el diámetro del domo y la longitud útil de la torre de bandejas para adaptarse a cámaras de paso, cámaras principales o posteadura.',
      'Capacidad en Fibra Estándar vs Fibra Ribbon: Gracias a la fusión en masa de cintas de 12F, un cierre FOSC 450 C6 duplica su densidad efectiva alcanzando hasta 864 fibras en 4 bandejas tipo C.',
      'Configuración de Puertos Redondos: Los modelos B6, C6 y D6 disponen de 6 puertos de entrada concéntricos sellados por bloque de gel, permitiendo ingresar hasta 6 cables independientes entre 9 y 25 mm.',
      'Criterio de Espacio en Cámara o Poste: Antes de definir el modelo (C6 vs D6), verifique el radio de giro disponible dentro de la cámara subterránea o el herraje de fijación en poste.'
    );
    technicalSpecs = [
      { label: 'FOSC 450 A4', value: '4 puertos de entrada · Diseño compacto de distribución' },
      { label: 'FOSC 450 B6', value: '6 puertos de entrada · Capacidad intermedia' },
      { label: 'FOSC 450 C6', value: '6 puertos (9–25 mm) · Hasta 864 FO Ribbon (4 bandejas × 216F)' },
      { label: 'FOSC 450 D6', value: '6 puertos · Máxima capacidad troncal y longitud de torre' },
    ];
    studyNotes = [
      'Respete siempre el número máximo de bandejas apilables en la torre abatible para que el domo cierre libremente sobre el O-ring sin aplastar los tubos espirales.',
    ];
    highlightNote =
      'Respete siempre la capacidad nominal de bandejas y puertos de entrada de cada modelo FOSC 450 para evitar radios de curvatura inferiores al mínimo permitido.';
  } else if (/caracter[ií]sticas de bandeja|tres holder|216 fibras|no exceda la capacidad/i.test(combinedLower)) {
    title = 'Características y Capacidad de la Bandeja de Empalme Ribbon (216 Fibras)';
    subtitle = `Ficha ${page.page_number} · Configuración de 3 Holders × 6 Fusiones Masivas`;
    bullets.push(
      'Arquitectura de Tres Holders (Porta-Fusiones): Cada bandeja FOSC-ACC-C-TRAY-RIBN-18 cuenta con 3 Holders modulares extraíbles ubicados en la zona central.',
      'Capacidad por Holder (72 Fibras): Cada Holder tiene ranuras precisas para alojar 6 fusiones de cinta Ribbon de 12 fibras (6 × 12 = 72 fibras por Holder).',
      'Capacidad Total por Bandeja (216 Fibras): Con sus 3 Holders completos (3 × 72 FO), la bandeja aloja exactamente 18 fusiones masivas equivalentes a 216 fibras ópticas.',
      'Restricción Crítica de Ingeniería ("No exceda la capacidad"): Está estrictamente prohibido forzar una séptima fusión en el Holder o dejar fusiones sueltas fuera del Holder, ya que genera microcurvaturas y rotura de cintas.'
    );
    technicalSpecs = [
      { label: 'Holders por Bandeja', value: '3 Holders extraíbles (Porta-fusiones Ribbon)' },
      { label: 'Fusiones por Holder', value: '6 fusiones de cinta 12F (72 fibras por Holder)' },
      { label: 'Capacidad Total Bandeja', value: '18 fusiones Ribbon = 216 fibras máximas (No exceder)' },
      { label: 'Protector Compatible', value: 'SMOUV-1120-R2/12-02 de 42 mm (SAP 1051546)' },
    ];
    studyNotes = [
      'Los Holders están diseñados para retirarse temporalmente hacia el borde exterior de la bandeja durante la fusión y luego girar 360° antes de encajarse en su base.',
    ];
    highlightNote =
      'Capacidad exacta por bandeja FOSC-ACC-C-TRAY-RIBN-18: 3 Holders × 6 fusiones Ribbon (12F) = 18 fusiones masivas = 216 fibras máximas.';
  } else if (/herramientas\s*necesarias/i.test(combinedLower)) {
    title = 'Herramientas y Equipos Requeridos para Preparación y Fusión de Fibra Ribbon';
    subtitle = `Ficha ${page.page_number} · Kit de Herramientas de Planta Externa y Empalmería Masiva`;
    bullets.push(
      'Herramientas de Desforre y Apertura de Cubierta: Cortadora longitudinal y circunferencial de chaqueta PE, cortadora de coraza de acero corrugado (Kabifix / rotativa) y tijeras para kevlar/aramida.',
      'Equipamiento de Fusión Masiva (Mass Fusion Splicer): Fusionadora de alineación para cintas de hasta 12 fibras con chucks (holders magnéticos) para cinta 12F, peladora térmica (Thermal Stripper) y cortadora de precisión (Cleaver) calibrada para 12 hilos.',
      'Herramientas de Cierre y Sellado: Llave de torque / dado de ajuste para cierres mecánicos FOSC 450 C6, o pistola de calor / antorcha regulada para mangas termocontráctiles en FOSC 400 C5.',
      'Kit de Limpieza, Medición y Seguridad: Alcohol isopropílico grado óptico (99.9%), paños libres de pelusa (Kimwipes), calibrador de diámetro (9–25 mm), contenedor de residuos de fibra y gafas de seguridad.'
    );
    technicalSpecs = [
      { label: 'Pelado de Cintas 12F', value: 'Peladora Térmica (Thermal Stripper) a ~100 °C' },
      { label: 'Corte de Precisión', value: 'Cortadora (Cleaver) con carro porta-cinta de 12 fibras' },
      { label: 'Longitud de Corte (Cleave)', value: '10 mm para protector SMOUV de 42 mm' },
      { label: 'Limpieza Óptica', value: 'Alcohol Isopropílico 99.9% + Paños libres de pelusa' },
    ];
    studyNotes = [
      'Nunca utilice peladora mecánica de un solo hilo para pelar una cinta Ribbon de 12 fibras; la peladora térmica garantiza el retiro uniforme del recubrimiento sin fisurar el vidrio.',
    ];
    highlightNote =
      'El uso de peladora térmica (Thermal Stripper) y cortadora de precisión calibrada para 12 hilos es indispensable para lograr bajas pérdidas de inserción en fusiones Ribbon.';
  } else if (/longitud de cable|longitud de miembro tensil|table 1/i.test(combinedLower)) {
    title = 'Tabla de Longitudes de Preparación de Cable y Miembro Tensil (FOSC 450 C6 / D6)';
    subtitle = `Ficha ${page.page_number} · Dimensiones de Corte para Sangrado (Midspan) y Punta (End)`;
    bullets.push(
      'Longitud de Corte del Miembro Tensil (Strength Member): En FOSC 450 C6 y D6, corte el miembro central de fuerza a 2 pulgadas (50 mm) cuando utilice el Bracket Corto, o a 2.5 pulgadas (63 mm) cuando utilice el Bracket Largo.',
      'Preparación en Cable Loose Buffer Tube (LBT): Una longitud de desforre de 52" (132 cm) permite llevar el tubo directamente a la bandeja; para corte en sangrado (Midspan) se requieren 90" (228 cm) formando un bucle en la canasta y ~22" dentro de la bandeja.',
      'Preparación en Cable Fibra Ribbon (FOSC 450 C6): Para formar un pequeño bucle en la canasta frente a la torre y subir a la bandeja se requieren 60" (152 cm); para un bucle completo hasta el final de la canasta y hacia la bandeja se requieren 86" (218 cm).',
      'Preparación en FOSC 450 D6: En domos D6 la longitud para bucle pequeño frente a la torre es de 68" y para bucle hasta el final de la canasta es de 92".'
    );
    technicalSpecs = [
      { label: 'Miembro Tensil (Bracket Corto)', value: '2 pulgadas (50 mm)' },
      { label: 'Miembro Tensil (Bracket Largo)', value: '2.5 pulgadas (63 mm)' },
      { label: 'Cable LBT en FOSC 450 C6', value: '52" directo a bandeja · 90" en sangrado (bucle + ~22" en bandeja)' },
      { label: 'Cable Ribbon en FOSC 450 C6', value: '60" bucle frente a torre · 86" bucle hasta final de canasta' },
    ];
    studyNotes = [
      'Respetar estrictamente las 60" u 86" de la Tabla 1 permite extraer la bandeja de la torre para trabajar cómodamente en la mesa de empalme sin tensar las cintas.',
    ];
    highlightNote =
      'Longitudes clave en FOSC 450 C6: Miembro tensil 2" (Bracket corto) o 2.5" (Bracket largo). Cable LBT: 52" directo a bandeja o 90" en corte central. Cable Ribbon: bucle de 60" frente a la torre o 86" hasta el final de la canasta.';
  } else if (/preparaci[oó]n del cable/i.test(combinedLower)) {
    title = 'Procedimiento de Preparación del Cable e Instalación del Miembro de Fuerza';
    subtitle = `Ficha ${page.page_number} · Desforre de Chaqueta, Corte de Armadura y Fijación de Miembro Central`;
    isStepsSlide = true;
    steps = [
      {
        step_number: 1,
        title: 'Medición y desforre de cubierta exterior',
        description:
          'Mida y retire la chaqueta exterior del cable según la Tabla 1 de longitudes (60" a 86" para Ribbon en FOSC 450 C6), utilizando el hilo de rasgado (ripcord) para no dañar las cintas.',
        critical_note: 'Verifique previamente que el diámetro del cable esté entre 9 y 25 mm.',
      },
      {
        step_number: 2,
        title: 'Corte y aseguramiento del miembro tensil (FRP / Acero)',
        description:
          'Corte el miembro central de fuerza a 2" (50 mm) para bracket corto o 2.5" (63 mm) para bracket largo y asegúrelo firmemente en la mordaza de retención.',
      },
      {
        step_number: 3,
        title: 'Aterrizaje de armadura y colocación de cinta espiral',
        description:
          'En cables armados, fije el conector de continuidad/tierra a la coraza metálica y proteja las cintas de fibra con el tubo espiral desde la salida de la chaqueta.',
      },
    ];
    bullets.push(
      'Realice el corte circunferencial de la cubierta exterior respetando las cotas de almacenamiento en canasta (60" a 86" en FOSC 450 C6).',
      'Retire las cintas hidroexpansivas de bloqueo de agua y agrupe las cintas Rollable-Ribbon por sub-unidades sin perder su identificación.',
      'Asegure el miembro central de fuerza (FRP) a 2" o 2.5" según el bracket y garantice la sujeción mecánica de la chaqueta mediante la abrazadera.'
    );
    technicalSpecs = [
      { label: 'Cota Miembro Tensil', value: '2" (Bracket corto) / 2.5" (Bracket largo)' },
      { label: 'Desforre Cubierta Ribbon C6', value: '60" (152 cm) a 86" (218 cm)' },
      { label: 'Protección de Transición', value: 'Tubo espiral desde la boca del cable hasta la bandeja' },
    ];
    studyNotes = [
      'Si el miembro de fuerza queda suelto o mal cortado, la dilatación térmica del cable empujará el núcleo hacia las bandejas provocando atenuación óptica.',
    ];
    highlightNote =
      'Una correcta preparación del miembro tensil (2" a 2.5") evita que las tensiones mecánicas externas de la red se transmitan a las bandejas de fusión.';
  } else if (/retencion del cable|retenci[oó]n del cable/i.test(combinedLower)) {
    title = 'Sistema de Retención Mecánica del Cable: FOSC 400 C5 vs FOSC 450 C6';
    subtitle = `Ficha ${page.page_number} · Montaje de Abrazaderas, Herrajes de Sujeción y Sellado de Base`;
    bullets.push(
      'Retención en FOSC 400 C5 (Termocontráctil): El cable se fija al soporte interno mediante abrazaderas metálicas sinfín sobre una banda de espuma protectora, el miembro central se asegura en el poste de anclaje y luego se contrae la manga termocontráctil con el clip en el puerto oval.',
      'Retención en FOSC 450 C6 (Gel Mecánico): El cable se asienta sobre el módulo de retención segmentado, se aprieta la abrazadera sobre la chaqueta, se bloquea el miembro tensil (2" o 2.5") y el bloque de gel se comprime al accionar la palanca central.',
      'Continuidad Eléctrica (Bonding & Grounding): En cables con armadura metálica (como SAP 4057055), se conecta el cable de puenteo desde el escudo de la armadura hasta la barra de tierra de la base del cierre.',
      'Prueba de Tracción Manual: Verifique siempre que el cable no gire ni se deslice axialmente antes de pasar las fibras a la canasta.'
    );
    technicalSpecs = [
      { label: 'Fijación FOSC 400 C5', value: 'Abrazadera metálica + Clip oval + Manga termocontráctil' },
      { label: 'Fijación FOSC 450 C6', value: 'Módulo de retención + Bloque de Gel comprimido mecánicamente' },
      { label: 'Puesta a Tierra', value: 'Escudo de armadura conectado a borna de tierra del cierre' },
    ];
    studyNotes = [
      'Nunca apriete la abrazadera directamente sobre el tubo central desnudo; la sujeción mecánica debe realizarse siempre sobre la chaqueta exterior negra de polietileno.',
    ];
    highlightNote =
      'Asegure firmemente la chaqueta y el miembro tensil en el soporte de retención antes de iniciar el enrutamiento de las cintas Ribbon hacia la canasta.';
  } else if (/asignando buffer en bandejas|bandeja de transici[oó]n/i.test(combinedLower)) {
    title = 'Asignación de Buffer y Enrutamiento en Bandeja de Transición';
    subtitle = `Ficha ${page.page_number} · Uso de Tubos Espirales y Derivación Ordenada entre Bandejas`;
    isStepsSlide = true;
    steps = [
      {
        step_number: 1,
        title: 'Ingreso a la bandeja de transición',
        description:
          'Ingrese las cintas de fibra Ribbon a la bandeja de transición inferior y, a partir de esta, derive ordenadamente cada grupo de cintas hacia la bandeja de empalme asignada.',
      },
      {
        step_number: 2,
        title: 'Protección con tubos espirales del kit',
        description:
          'Instale los tubos espirales y protecciones incluidos en el kit del cierre para preservar la integridad mecánica de la cinta Ribbon en el paso articulado entre bandejas.',
        critical_note:
          'Verifique que el tubo espiral no quede pellizcado al abatir las bandejas.',
      },
    ];
    bullets.push(
      'Ingrese las fibras a la bandeja de transición y a partir de esta derive a cada bandeja de fusión según la carta de empalme.',
      'Utilice obligatoriamente los tubos espirales y protecciones que vienen en el kit para agrupar y guiar las cintas.',
      'Asegure los extremos del tubo espiral con las cintas de velcro o amarres plásticos en la entrada de cada bandeja sin estrangular las fibras.'
    );
    technicalSpecs = [
      { label: 'Elemento de Enrutamiento', value: 'Bandeja de transición + Tubo espiral flexible del kit' },
      { label: 'Función Mecánica', value: 'Proteger las cintas al abatir las bandejas en la torre' },
    ];
    studyNotes = [
      'Comprobar el movimiento bisagra de todas las bandejas antes de fusionar garantiza que el tubo espiral tenga la holgura exacta.',
    ];
    highlightNote =
      'Utilice siempre los tubos espirales de protección incluidos en el kit para evitar torsiones o daños en las cintas Ribbon al pasar de la transición a cada bandeja.';
  } else if (/en caso de fibras central core|bandeja de aluminio/i.test(combinedLower)) {
    title = 'Manejo de Cables Central Core: Almacenamiento en Bandeja de Aluminio';
    subtitle = `Ficha ${page.page_number} · Gestión de Cintas en Paso Directo (Sangrado) y Cintas en Derivación`;
    bullets.push(
      'Regla Específica para Cables Central Core (Unitubo al Centro): Proceda a almacenar todas las cintas de fibra NO intervenidas (que continúan en paso directo por el sangrado) dentro de la bandeja inferior de aluminio (canasta/basket).',
      'Derivación Selectiva hacia Bandejas de Fusión: Suba únicamente la(s) cinta(s) que van a ser cortadas y fusionadas hacia la bandeja de empalme superior utilizando el tubo espiral de protección.',
      'Protección de Cintas en Paso Directo: Al mantener las cintas de paso en la bandeja de aluminio inferior, se evita saturar las bandejas de fusión y se elimina el riesgo de dañar fibras activas en futuras intervenciones.',
      'Aplicación Directa al Cable SAP 4057055 (288F Central Core): Si en un nodo solo se derivan 2 cintas (24 FO), las 22 cintas restantes (264 FO) quedan resguardadas en la canasta de aluminio.'
    );
    technicalSpecs = [
      { label: 'Cintas NO Intervenidas (Paso)', value: 'Se almacenan en la Bandeja de Aluminio inferior (Basket)' },
      { label: 'Cintas Intervenidas (Fusión)', value: 'Ascienden protegidas con Tubo Espiral a la bandeja de fusión' },
      { label: 'Tipo de Cable Aplicable', value: 'Central Core / Unitubo al centro (Ej. SAP 4057055 - 288F)' },
    ];
    studyNotes = [
      'Subir cintas no intervenidas a las bandejas de fusión es un error grave de auditoría que satura la bandeja e impide alojar las 216 fibras nominales.',
    ];
    highlightNote =
      'En sangrado de cables Central Core, las cintas no intervenidas permanecen protegidas en la bandeja de aluminio y solo ascienden por el espiral las cintas a fusionar.';
  } else if (/calcule y presente la fibra|causara saturaci[oó]n/i.test(combinedLower)) {
    title = 'Cálculo de Recorrido, Presentación en Holder y Corte de Excedentes';
    subtitle = `Ficha ${page.page_number} · Prevención de Saturación en Bandeja de Empalme Ribbon`;
    isStepsSlide = true;
    steps = [
      {
        step_number: 1,
        title: 'Organización de la reserva en la base de la bandeja',
        description:
          'Proceda a organizar las vueltas de reserva de la cinta de fibra en la parte inferior de la bandeja siguiendo las pistas perimetrales.',
      },
      {
        step_number: 2,
        title: 'Presentación en el Holder, marcación y corte de excedente',
        description:
          'Presente las cintas enfrentadas sobre el Holder porta-fusiones, marque con marcador indeleble el punto exacto de empalme y corte el excedente antes de pelar y fusionar.',
        critical_note:
          'Evite usar longitudes extra ya que causará saturación en la bandeja.',
      },
    ];
    bullets.push(
      'Proceda a organizar la reserva en la parte inferior de la bandeja describiendo curvas suaves sin torsión.',
      'Presente en el Holder, marque el punto medio del porta-fusiones y corte todo el excedente de fibra sobrante.',
      'Evite usar longitudes extra de cinta: debido al espesor conjunto de las 12 fibras, unos pocos centímetros de exceso provocan saturación inmediata y desbordamiento en la bandeja.'
    );
    technicalSpecs = [
      { label: 'Ubicación de Reserva', value: 'Parte inferior perimetral de la bandeja de empalme' },
      { label: 'Control de Longitud', value: 'Presentar en Holder → Marcar → Cortar excedente' },
      { label: 'Riesgo por Exceso de Fibra', value: 'Saturación de bandeja, fibras pisadas y atenuación óptica' },
    ];
    studyNotes = [
      'En fibra Ribbon todas las 12 fibras comparten la misma cinta; por ello la presentación previa y el corte exacto antes de fusionar son obligatorios.',
    ];
    highlightNote =
      'Regla crítica de calidad: Presente la cinta en el Holder, marque y corte el excedente. Evite usar longitudes extra ya que causarán saturación en la bandeja.';
  } else if (/organice la fibra en la bandeja|360\s*grados/i.test(combinedLower)) {
    title = 'Organización de Fusiones en Bandeja y Giro de 360° del Holder Porta-Fusiones';
    subtitle = `Ficha ${page.page_number} · Maniobra Técnica de Asentamiento de Protectores SMOUV Ribbon`;
    isStepsSlide = true;
    steps = [
      {
        step_number: 1,
        title: 'Colocación de fusiones en el Holder externo',
        description:
          'Coloque temporalmente el Holder en el borde externo de la bandeja y, a medida que ejecuta las fusiones masivas con protectores de 42 mm, aloje cada fusión en las ranuras del Holder.',
      },
      {
        step_number: 2,
        title: 'Giro de 360 grados del Holder sobre su propio eje',
        description:
          'Una vez colocadas todas las fusiones en el porta-fusiones, gire el Holder 360 grados en su propio eje como se muestra en la figura antes de colocarlo en la bandeja.',
        critical_note:
          'El giro de 360° en su propio eje distribuye la curvatura de las cintas sin estrangularlas.',
      },
      {
        step_number: 3,
        title: 'Encaje final del Holder y cierre de bandeja',
        description:
          'Fije el Holder en su cavidad central dentro de la bandeja y verifique que las 18 fusiones (máx. 216 fibras) queden perfectamente peinadas bajo las pestañas.',
      },
    ];
    bullets.push(
      'Una vez colocadas todas las fusiones en el porta-fusiones, gire el Holder 360 grados en su propio eje como se muestra en la figura antes de colocarlo en la bandeja.',
      'Esta maniobra de giro de 360° permite recoger de forma simétrica los lazos de entrada y salida de las 6 cintas del Holder.',
      'Verifique que cada protector termocontráctil de 42 mm (SMOUV-1120-R2/12-02) quede completamente asentado en su ranura.'
    );
    technicalSpecs = [
      { label: 'Maniobra del Holder', value: 'Giro de 360° sobre su propio eje antes de encajar en bandeja' },
      { label: 'Posición durante Fusión', value: 'Montado en el borde externo de la bandeja' },
      { label: 'Capacidad por Holder', value: '6 fusiones Ribbon × 12F = 72 fibras por Holder' },
    ];
    studyNotes = [
      'Omitir el giro de 360° del Holder provoca que las cintas entren forzadas o con bucle invertido al asentar el porta-fusiones en la bandeja.',
    ];
    highlightNote =
      'Maniobra obligatoria: Una vez colocadas todas las fusiones en el porta-fusiones, gire el Holder 360° sobre su propio eje antes de fijarlo en la bandeja.';
  } else if (/ejemplos|evite excesos de fibra|acomodando las reservas/i.test(combinedLower)) {
    title =
      /acomodando/i.test(combinedLower)
        ? 'Acomodación Correcta de Reservas de Cintas Ribbon en Canasta y Bandejas'
        : 'Control de Calidad Visual en Bandeja: Buenas Prácticas vs Excesos de Fibra';
    subtitle = `Ficha ${page.page_number} · Estándar de Inspección y Auditoría de Empalmería Claro`;
    bullets.push(
      'Inspección Comparativa en Bandeja: Las fotografías de referencia contrastan una bandeja saturada por exceso de longitud contra una bandeja correctamente peinada tras presentar, cortar excedentes y girar el Holder 360°.',
      'Prevención de Atenuación por Macrocurvatura: Evite excesos de fibra que obliguen a doblar las cintas con radios menores a 30 mm o que queden presionadas por la tapa acrílica superior.',
      'Acomodación en Canasta (Basket): Las reservas de cintas en la canasta inferior deben describir óvalos amplios y uniformes, sujetando los tubos espirales en los puntos de anclaje laterales.',
      'Criterio de Aprobación en Auditoría Claro: Ordenamiento limpio por código de colores, protectores de 42 mm alineados en los 3 Holders y abatimiento libre de todas las bandejas.'
    );
    technicalSpecs = [
      { label: 'Radio Mínimo en Bandeja', value: '≥ 30 mm (Sin bucles cerrados ni torsiones de cinta)' },
      { label: 'Estándar Visual en Holder', value: 'Protectores de 42 mm alineados · Cero cruces sobre el Holder' },
      { label: 'Estado de Tapa Superior', value: 'Cierre libre sin presionar ni pellizcar fibras' },
    ];
    studyNotes = [
      'Una sola cinta pisada por la tapa de la bandeja produce incrementos de atenuación superiores a 0.5 dB en 1550 nm y 1625 nm detectables en la traza OTDR.',
    ];
    highlightNote =
      'Estándar de auditoría en campo: Cero cruces de cintas, cero fibras por fuera de las pestañas de retención y tapas abatibles cerrando sin presión.';
  } else if (/ribonizando fibra|prizm|14316|8040/i.test(combinedLower)) {
    title = `Ribonización de Fibra Suelta y Conectores Multifibra MT / PRIZM® MT (Diapositiva ${page.page_number})`;
    subtitle = `Ficha ${page.page_number} · Transición de Fibra Suelta (250 µm) a Cinta de 12 Hilos y Terminación MT`;
    bullets.push(
      'Técnica de Ribonización en Campo (Ribbonizing): Consiste en ordenar 12 fibras individuales de 250 µm (provenientes de un cable Loose Buffer Tube convencional) según el código de colores TIA-598 y unirlas mediante un organizador/pegamento temporal para formar una cinta plana de 12 hilos.',
      'Empalme Híbrido Cable Convencional vs Cable Ribbon: Gracias a la ribonización, el empalmador puede fusionar en un solo arco masivo las 12 fibras de un cable tradicional contra una cinta Rollable-Ribbon.',
      'Secuencia de Colores TIA/EIA-598-D (12 Hilos): 1-Azul, 2-Naranja, 3-Verde, 4-Marrón, 5-Gris, 6-Blanco, 7-Rojo, 8-Negro, 9-Amarillo, 10-Violeta, 11-Rosa, 12-Aguamarina.',
      'Férulas y Conectores Multifibra MT / PRIZM® MT (Refs. 14316 y 8040): Tecnologías de terminación óptica multifibra de alta densidad empleadas en interconexión de nodos y cabeceras.'
    );
    technicalSpecs = [
      { label: 'Proceso de Ribonización', value: 'Agrupación de 12 fibras sueltas (250 µm) en matriz de cinta 12F' },
      { label: 'Norma Código de Colores', value: 'TIA/EIA-598-D (Azul, Naranja, Verde, Marrón, Gris, Blanco...)' },
      { label: 'Aplicación Principal', value: 'Transición de cable LBT convencional a cable Rollable-Ribbon' },
      { label: 'Conectividad Multifibra', value: 'Férulas MT y PRIZM® MT (Referencias 14316 / 8040)' },
    ];
    studyNotes = [
      'Al ribonizar fibra suelta contra una cinta Rollable-Ribbon, verifique dos veces el orden de colores (1-Azul a 12-Aguamarina) antes de colocar el conjunto en el chuck de la peladora térmica.',
    ];
    highlightNote =
      'La ribonización en campo permite empalmar cables convencionales de fibra suelta contra cables Ribbon de 288, 576 u 864 fibras mediante fusión en masa de 12 hilos.';
  } else if (/links videos|dressing ribbon fiber/i.test(combinedLower)) {
    title = 'Guías Audiovisuales de Instalación: Dressing Ribbon Fiber into FOSC & Splice Tray';
    subtitle = `Ficha ${page.page_number} · Referencias Oficiales de Entrenamiento Práctico CommScope-Claro`;
    bullets.push(
      'Procedimiento Oficial "Dressing ribbon fiber into FOSC and splice tray": Documenta visualmente el flujo completo desde la preparación del cable hasta el cierre del domo.',
      'Puntos de Control en Video: 1) Fijación del miembro tensil (2" / 2.5"), 2) Enrutamiento en canasta (60" / 86"), 3) Uso de tubos espirales y bandeja de aluminio en Central Core, y 4) Giro de 360° del Holder en bandeja de 216 fibras.',
      'Verificación Final de Calidad: Comprobación de ausencia de excesos de fibra, abatimiento de bandejas y sellado hermético IP-68.'
    );
    technicalSpecs = [
      { label: 'Guía Oficial CommScope', value: 'Dressing ribbon fiber into FOSC and splice tray' },
      { label: 'Alcance Operativo', value: 'Preparación, retención, transición, fusión masiva y giro 360°' },
    ];
    studyNotes = [
      'Repase siempre la secuencia completa de preparación, transición, presentación/corte y giro de 360° antes de responder la evaluación del módulo.',
    ];
    highlightNote =
      'Procedimiento estándar "Dressing ribbon fiber into FOSC and splice tray": verificación de preparación de cable, enrutamiento en canasta y organización en bandeja.';
  } else {
    // Generic slide enrichment so even introductory/agenda slides have rich study material
    if (bullets.length < 4) {
      bullets.push(
        'Aplicación rigurosa de los lineamientos del Programa de Capacitación Técnica Claro-CommScope para redes de fibra óptica de alta densidad.',
        'Cumplimiento de estándares internacionales de planta externa (ITU-T G.652.D / G.657.A1, Telcordia GR-320-CORE y GR-771-CORE IP-68).',
        'Control de calidad en cada etapa: verificación de materiales SAP, preparación dimensional del cable, organización libre de saturación y certificación óptica.'
      );
    }
    technicalSpecs = [
      { label: 'Programa Técnico', value: 'Capacitación Oficial Claro - CommScope (Planta Externa FO)' },
      { label: 'Tecnologías Cubiertas', value: 'Fibra Rollable-Ribbon · Cierres FOSC 450 C6 (Gel) y FOSC 400 C5 (Termo)' },
    ];
    studyNotes = [
      'Estudie detenidamente cada esquema visual y parámetro técnico del módulo antes de avanzar a las preguntas evaluativas.',
    ];
  }

  if (!highlightNote) {
    highlightNote =
      bullets[0] ||
      `Cumpla estrictamente los parámetros técnicos indicados en la diapositiva ${page.page_number} (${title}).`;
  }

  return {
    title,
    subtitle,
    bullets: bullets.length > 0 ? bullets : [title],
    highlightNote,
    steps,
    technicalSpecs,
    studyNotes,
    isStepsSlide,
  };
}

/**
 * Builds purposeful interactive elements (selectable cards, accordions, hotspots, comparisons)
 * for each slide so modules feel like an interactive training experience rather than static slides.
 */
function buildInteractiveElementsForSlide(
  page: ExtractedMaterialPage,
  enrichedTitle: string,
  enrichedBullets: string[],
  technicalSpecs: Array<{ label: string; value: string }>,
  studyNotes: string[],
  slideIdxInModule: number
): Pick<
  ContentItem,
  | 'interaction_type'
  | 'selectable_cards'
  | 'accordion_items'
  | 'hotspots'
  | 'comparison_headers'
  | 'comparison_rows'
  | 'objective'
> {
  const objective = `Objetivo formativo: Dominar y aplicar en campo los criterios técnicos de "${enrichedTitle.slice(0, 75)}" según el material oficial.`;

  // Rotate interactive modalities across slides in the module for rich pedagogical engagement
  const mode = slideIdxInModule % 4;

  if (mode === 0) {
    // Selectable Discovery Cards
    const cards = (enrichedBullets.slice(0, 3).length >= 2
      ? enrichedBullets.slice(0, 3)
      : [
          `Criterio técnico principal de ${enrichedTitle}`,
          'Verificación de parámetros normativos e inspección visual en sitio',
          'Buenas prácticas operativas y prevención de retrabajos en red',
        ]
    ).map((b, i) => ({
      id: `card-${page.page_number}-${i + 1}`,
      title:
        i === 0
          ? '1. Fundamento Técnico'
          : i === 1
          ? '2. Parámetro de Control'
          : '3. Criterio de Aceptación',
      badge: `Punto Clave #${i + 1}`,
      detail: b,
    }));

    return {
      objective,
      interaction_type: 'selectable_cards',
      selectable_cards: cards,
    };
  }

  if (mode === 1) {
    // Expandable Technical Accordion
    const items = [
      {
        id: `acc-${page.page_number}-1`,
        title: '¿Qué debemos verificar antes de ejecutar este paso?',
        content:
          studyNotes[0] ||
          enrichedBullets[0] ||
          'Confirmar herramientas calibradas, limpieza de elementos ópticos y correspondencia con el diseño de ingeniería.',
        critical: false,
      },
      {
        id: `acc-${page.page_number}-2`,
        title: 'Especificación y tolerancia crítica del material',
        content:
          technicalSpecs.length > 0
            ? technicalSpecs.map((s) => `${s.label}: ${s.value}`).join(' · ')
            : enrichedBullets[1] ||
              'Respetar estrictamente las dimensiones, radios de curvatura y capacidades máximas indicadas en el manual.',
        critical: true,
      },
      {
        id: `acc-${page.page_number}-3`,
        title: 'Error frecuente a evitar en campo',
        content:
          studyNotes[1] ||
          enrichedBullets[2] ||
          'No omitir la marcación ni dejar longitudes excesivas que generen saturación o atenuación por macrocurvatura.',
        critical: true,
      },
    ];

    return {
      objective,
      interaction_type: 'accordion',
      accordion_items: items,
    };
  }

  if (mode === 2 && page.image_data_url) {
    // Visual Inspection Hotspots over the technical diagram / photo
    return {
      objective,
      interaction_type: 'hotspots',
      hotspots: [
        {
          id: `hs-${page.page_number}-1`,
          label: 'Zona 1: Punto de Inspección Principal',
          x_pct: 28,
          y_pct: 35,
          description:
            enrichedBullets[0] ||
            `Identificación visual del componente principal en ${enrichedTitle}.`,
        },
        {
          id: `hs-${page.page_number}-2`,
          label: 'Zona 2: Ajuste y Enrutamiento',
          x_pct: 62,
          y_pct: 48,
          description:
            enrichedBullets[1] ||
            studyNotes[0] ||
            'Verificación de sujeción mecánica, radio de curvatura y ordenamiento libre de tensión.',
        },
        {
          id: `hs-${page.page_number}-3`,
          label: 'Zona 3: Control de Calidad Final',
          x_pct: 48,
          y_pct: 74,
          description:
            studyNotes[1] ||
            enrichedBullets[2] ||
            'Confirmación de sellado, limpieza e identificación normativa antes de cerrar.',
        },
      ],
    };
  }

  // Technical Comparison Table
  const rows =
    technicalSpecs.length >= 2
      ? technicalSpecs.slice(0, 4).map((sp) => ({
          criterion: sp.label,
          option_a: sp.value,
          option_b: 'Cumplimiento obligatorio según estándar del material',
        }))
      : [
          {
            criterion: 'Ejecución según procedimiento del material',
            option_a: enrichedBullets[0] || 'Aplicación secuencial verificada',
            option_b: 'Garantiza 0 dB de pérdida adicional y máxima confiabilidad',
          },
          {
            criterion: 'Práctica incorrecta / Desviación en sitio',
            option_a: 'Omitir mediciones o exceder capacidades de bandeja',
            option_b: 'Provoca saturación, microcurvaturas y falla prematura',
          },
        ];

  return {
    objective,
    interaction_type: 'comparison',
    comparison_headers: ['Parámetro / Criterio', 'Especificación del Material', 'Impacto Operativo'],
    comparison_rows: rows,
  };
}

/**
 * Builds 4 expanded Study Cards (Fichas de Estudio Ampliadas) per module
 * so participants have comprehensive study material per module.
 */
export function buildModuleStudyCards(
  moduleIndex: number,
  moduleTitle: string,
  modulePages: ExtractedMaterialPage[],
  defaultImageUrl?: string
): ModuleStudyCard[] {
  const combinedText = modulePages
    .map((p) => `${p.title} ${p.bullets.join(' ')}`)
    .join(' ');
  const moduleImg =
    modulePages.find((p) => Boolean(p.image_data_url))?.image_data_url ||
    defaultImageUrl;

  const allEnriched = modulePages.map((p) => enrichSlideWithTelecomExpertise(p));
  const allBullets = allEnriched.flatMap((e) => e.bullets);
  const allSpecs = allEnriched.flatMap((e) => e.technicalSpecs || []);
  const allNotes = allEnriched.flatMap((e) => e.studyNotes || []);

  const isRibbonFosc = /ribbon|fosc|4057055|1051544|bandeja|holder|empalme/i.test(
    combinedText
  );

  return [
    {
      id: `sc-m${moduleIndex}-1`,
      card_number: `FICHA ${moduleIndex}.1`,
      category_tag: 'FUNDAMENTOS Y CONCEPTOS CLAVE',
      title: `Conceptos Esenciales y Arquitectura: ${moduleTitle.replace(/^Módulo\s*\d+:\s*/i, '')}`,
      summary:
        allNotes[0] ||
        `Síntesis conceptual estructurada a partir de las diapositivas ${
          modulePages[0]?.page_number || 1
        } a ${
          modulePages[modulePages.length - 1]?.page_number || modulePages.length
        } del material de referencia.`,
      key_points:
        allBullets.slice(0, 4).length >= 3
          ? allBullets.slice(0, 4)
          : [
              `Dominio de la arquitectura y componentes principales tratados en ${moduleTitle}.`,
              'Identificación precisa de tipos de cable, fibras y elementos de protección.',
              'Cumplimiento de estándares internacionales (ITU-T / Telcordia / ANSI) aplicables.',
              'Relación directa entre el diseño del elemento y su desempeño óptico en planta externa.',
            ],
      technical_parameters:
        allSpecs.slice(0, 3).length > 0
          ? allSpecs.slice(0, 3)
          : [
              { label: 'Módulo Formativo', value: `Módulo ${moduleIndex}` },
              {
                label: 'Páginas Fuente',
                value: `Diapositivas ${modulePages[0]?.page_number || 1}–${
                  modulePages[modulePages.length - 1]?.page_number || 1
                }`,
              },
            ],
      field_tip:
        'Antes de iniciar cualquier intervención física, verifica que el modelo del componente y la referencia del cable coincidan exactamente con la ingeniería aprobada.',
      image_url: moduleImg,
    },
    {
      id: `sc-m${moduleIndex}-2`,
      card_number: `FICHA ${moduleIndex}.2`,
      category_tag: 'ESPECIFICACIONES Y PARÁMETROS',
      title: isRibbonFosc
        ? 'Parámetros Dimensionales, Capacidades y Maestra SAP'
        : 'Parámetros Técnicos, Dimensiones y Criterios de Medición',
      summary:
        allNotes[1] ||
        'Valores nominales, tolerancias, códigos de material y capacidades máximas extraídas directamente de la documentación técnica.',
      key_points:
        allBullets.slice(2, 6).length >= 3
          ? allBullets.slice(2, 6)
          : [
              'Verificación de rangos de diámetro de cable (9 a 25 mm en cierres FOSC) y cotas de preparación.',
              'Control estricto de capacidad máxima por bandeja (216 fibras = 3 Holders × 6 fusiones de 12F).',
              'Correspondencia exacta de códigos SAP para cierres, kits, bandejas y protectores de fusión de 42 mm.',
              'Respeto riguroso de las cotas de corte (52", 60", 86", 90") y miembro tensil (2" o 2.5").',
            ],
      technical_parameters:
        allSpecs.slice(2, 6).length > 0
          ? allSpecs.slice(2, 6)
          : [
              { label: 'Control Dimensional', value: 'Verificación con cinta métrica en sitio' },
              { label: 'Tolerancia Operativa', value: 'Estricta según tabla del fabricante' },
            ],
      field_tip:
        'Nunca excedas la capacidad nominal de las bandejas ni utilices protectores de fusión de longitud distinta a la especificada para el Holder.',
      image_url:
        modulePages.find((p, i) => i >= 1 && Boolean(p.image_data_url))?.image_data_url ||
        moduleImg,
    },
    {
      id: `sc-m${moduleIndex}-3`,
      card_number: `FICHA ${moduleIndex}.3`,
      category_tag: 'PROCEDIMIENTO PASO A PASO',
      title: 'Secuencia Operativa Estandarizada de Ejecución en Campo',
      summary:
        allNotes[2] ||
        'Metodología secuencial para ejecutar la actividad técnica garantizando ordenamiento limpio, radio de curvatura seguro y cero atenuación inducida.',
      key_points:
        allBullets.slice(4, 8).length >= 3
          ? allBullets.slice(4, 8)
          : [
              'Paso 1: Inspección, limpieza, medición y preparación de cubierta y miembro central de tracción.',
              'Paso 2: Enrutamiento mediante tubos espirales en bandeja de transición o almacenamiento en bandeja de aluminio (Central Core).',
              'Paso 3: Presentación de la cinta en el Holder, marcación del punto exacto y corte del excedente para evitar saturación.',
              'Paso 4: Fusión por arco en masa, colocación en el Holder externo y giro de 360° sobre su propio eje antes de encajarlo.',
            ],
      technical_parameters: [
        { label: 'Secuencia de Trabajo', value: 'Orden cronológico obligatorio' },
        { label: 'Maniobra Clave en Holder', value: 'Giro de 360° sobre su propio eje' },
      ],
      field_tip:
        'Presenta siempre la fibra en el Holder antes de fusionar para marcar y cortar el excedente; dejar longitud extra causará saturación en la bandeja.',
      image_url:
        modulePages.find((p, i) => i >= 2 && Boolean(p.image_data_url))?.image_data_url ||
        moduleImg,
    },
    {
      id: `sc-m${moduleIndex}-4`,
      card_number: `FICHA ${moduleIndex}.4`,
      category_tag: 'BUENAS PRÁCTICAS Y PREVENCIÓN DE FALLAS',
      title: 'Control de Calidad, Seguridad y Prevención de Errores Frecuentes',
      summary:
        'Guía de verificación final y diagnóstico preventivo para asegurar una instalación certificable al primer intento.',
      key_points: [
        'Evitar el cruce de cintas o tubos espirales en la entrada de la canasta (basket) y bandeja de transición.',
        'Garantizar que las fibras no intervenidas en cables Central Core queden protegidas en la bandeja de aluminio inferior.',
        'Inspeccionar el asentamiento de los protectores SMOUV de 42 mm y la ausencia de pellizcos al abatir las bandejas.',
        'Verificar hermeticidad del cierre (Gel en FOSC 450 C6 o Termocontráctil en FOSC 400 C5) antes de finalizar la orden.',
      ],
      technical_parameters: [
        { label: 'Hermeticidad', value: 'Estándar Telcordia GR-771 (IP-68)' },
        { label: 'Criterio de Cierre', value: '0 fibras tensionadas o con sobre-longitud' },
      ],
      field_tip:
        'Realiza una inspección visual de 360° a todas las bandejas abatibles antes de colocar el domo para confirmar que ninguna cinta sobresalga del perímetro.',
      image_url: moduleImg,
    },
  ];
}

/**
 * Generates a MINIMUM OF 5 EVALUATIVE QUESTIONS + 1 PRACTICAL CASE STUDY per module
 * combining diverse question types (single_choice, true_false, multiple_choice, image_choice, order_steps, case_study),
 * strictly grounded in the reference material and providing complete immediate feedback ("si respondió bien o mal y por qué").
 */
function buildModuleQuestionsAndCaseFromPages(
  moduleIndex: number,
  moduleTitle: string,
  modulePages: ExtractedMaterialPage[],
  firstSlideId: string,
  comp: Competency,
  fallbackImageUrl: string
): ContentItem[] {
  const items: ContentItem[] = [];
  const moduleText = modulePages
    .map((p) => `${p.title} ${p.bullets.join(' ')}`)
    .join(' ')
    .toLowerCase();
  const moduleImage =
    modulePages.find((p) => Boolean(p.image_data_url))?.image_data_url ||
    fallbackImageUrl;
  const secondImage =
    modulePages.filter((p) => Boolean(p.image_data_url))[1]?.image_data_url ||
    moduleImage;

  const pageTitles = modulePages.map((p) => p.title).filter(Boolean);
  const allBullets = modulePages
    .flatMap((p) => p.bullets)
    .map((b) => b.trim())
    .filter((b) => b.length > 12);

  // ============================================================================
  // PREGUNTA 1 (Tipo A: Selección Múltiple Única Respuesta) - Concepto y Estándar
  // ============================================================================
  const q1Id = crypto.randomUUID();
  let q1Prompt = '';
  let q1Explanation = '';
  let q1Concept = '';
  let q1Recommendation = '';
  let q1Options: QuestionOption[] = [];

  if (/rollable-ribbon|4057055|g\.657\.a1|3,456|gr-320/i.test(moduleText)) {
    q1Prompt =
      'Según el material técnico suministrado sobre Fibra Óptica Rollable-Ribbon y el cable unitubo central (Código SAP 4057055), ¿cuáles son sus características técnicas y normativas correctas?';
    q1Explanation =
      'En la tecnología Rollable-Ribbon las fibras están parcialmente unidas en puntos determinados (permitiendo enrollarse y doblarse como fibras individuales), alcanzando hasta 3,456 fibras en 1.38" (35 mm), 30% menos peso y operando con fibras monomodo G.652.D / G.657.A1 bajo norma GR-320-CORE Issue 4 y ANSI/ICEA S-87-640.';
    q1Concept =
      'Fibra Rollable-Ribbon: cintas de 12 fibras parcialmente unidas en puntos determinados, alta densidad (hasta 3,456 FO en 35 mm) y estándar G.652.D / G.657.A1.';
    q1Recommendation =
      'Repasa las diapositivas de introducción a Fibra Óptica Ribbon y especificaciones del cable SAP 4057055.';
    q1Options = [
      {
        id: crypto.randomUUID(),
        question_id: q1Id,
        label: 'A',
        text: 'Fibras parcialmente unidas en puntos determinados, hasta 3,456 FO en 1.38" (35 mm), reducción de peso del 30%, fibra G.652.D/G.657.A1 bajo estándar GR-320-CORE Issue 4.',
        rationale:
          'CORRECTO: Coincide exactamente con los parámetros técnicos y normativos del material suministrado para cables Rollable-Ribbon.',
        is_correct: true,
      },
      {
        id: crypto.randomUUID(),
        question_id: q1Id,
        label: 'B',
        text: 'Fibras multimodo OM3 encapsuladas en gel húmedo con capacidad máxima de 96 fibras y diámetro mínimo de 50 mm.',
        rationale:
          'INCORRECTO: El cable estudiado es monomodo G.652.D/G.657.A1 libre de gel (Gel-free) y alcanza hasta 3,456 fibras en 35 mm.',
        is_correct: false,
      },
      {
        id: crypto.randomUUID(),
        question_id: q1Id,
        label: 'C',
        text: 'Cintas rígidas pegadas en toda su longitud que solo pueden instalarse en interiores y no admiten cables armados.',
        rationale:
          'INCORRECTO: Rollable-Ribbon une las fibras solo en puntos determinados (no de forma rígida continua) y el cable SAP 4057055 es de planta externa (OSP) con armadura.',
        is_correct: false,
      },
      {
        id: crypto.randomUUID(),
        question_id: q1Id,
        label: 'D',
        text: 'Cables coaxiales híbridos diseñados exclusivamente para acometidas domiciliarias de 2 hilos.',
        rationale:
          'INCORRECTO: El material corresponde a cables troncales ópticos de alta densidad Rollable-Ribbon.',
        is_correct: false,
      },
    ];
  } else if (/1051544|1051547|1059714|fosc 450 c6|fosc 400 c5|9 a 25 mm/i.test(moduleText)) {
    q1Prompt =
      'De acuerdo con el material de capacitación Claro-CommScope, ¿cuál es el tipo de sellado de las cajas FOSC 450 C6 y FOSC 400 C5 respectivamente, y cuál es el rango de diámetro de cable admitido?';
    q1Explanation =
      'El material establece explícitamente que la caja FOSC 450 C6 utiliza tecnología de sellado Mecánico en GEL, mientras que la FOSC 400 C5 emplea sellado Termocontráctil, admitiendo ambas un rango de uso de diámetro de cable de 9 a 25 mm máximo bajo hermeticidad Telcordia GR-771 (IP-68).';
    q1Concept =
      'FOSC 450 C6 = Sellado Mecánico (GEL) | FOSC 400 C5 = Sellado Termocontráctil | Diámetro de cable: 9 a 25 mm máximo.';
    q1Recommendation =
      'Revisa las diapositivas comparativas de Cajas de Empalme FOSC 450 C6, FOSC 400 C5 y Dimensiones.';
    q1Options = [
      {
        id: crypto.randomUUID(),
        question_id: q1Id,
        label: 'A',
        text: 'FOSC 450 C6: Sellado Mecánico (GEL) | FOSC 400 C5: Sellado Termocontráctil | Rango de diámetro de cable: 9 a 25 mm máximo.',
        rationale:
          'CORRECTO: Refleja con exactitud la tecnología de sellado de cada modelo FOSC y el rango dimensional de 9 a 25 mm del documento.',
        is_correct: true,
      },
      {
        id: crypto.randomUUID(),
        question_id: q1Id,
        label: 'B',
        text: 'FOSC 450 C6: Sellado con resina epóxica | FOSC 400 C5: Sellado por presión de aire | Rango de diámetro: 2 a 8 mm.',
        rationale:
          'INCORRECTO: Ninguna de las cajas usa resina epóxica y el rango admitido es de 9 a 25 mm.',
        is_correct: false,
      },
      {
        id: crypto.randomUUID(),
        question_id: q1Id,
        label: 'C',
        text: 'Ambas cajas utilizan únicamente cinta aislante convencional y admiten cables de hasta 60 mm de diámetro.',
        rationale:
          'INCORRECTO: El límite máximo de diámetro de cable es 25 mm y el sellado es por bloque de Gel o manga Termocontráctil.',
        is_correct: false,
      },
      {
        id: crypto.randomUUID(),
        question_id: q1Id,
        label: 'D',
        text: 'FOSC 450 C6 es termocontráctil y FOSC 400 C5 es de gel mecánico, sin límite de diámetro de cable.',
        rationale:
          'INCORRECTO: Se invirtieron las tecnologías de sellado; la serie 450 es de Gel y la serie 400 es Termocontráctil.',
        is_correct: false,
      },
    ];
  } else if (/216 fibras|tres holder|longitud de cable|52"|60"|86"/i.test(moduleText)) {
    q1Prompt =
      'Según la diapositiva de Características de Bandeja y la Tabla 1 de Longitud de Cable en FOSC 450 C6, ¿cuál es la configuración y capacidad máxima por bandeja Ribbon y las longitudes del miembro tensil?';
    q1Explanation =
      'Cada bandeja Ribbon dispone de 3 Holders; cada Holder aloja 6 fusiones de cinta de 12 fibras (3 × 6 × 12 = 216 fibras máximas por bandeja). Además, la Tabla 1 indica cortar el miembro tensil a 2" para bracket corto o 2.5" para bracket largo.';
    q1Concept =
      'Capacidad máxima por bandeja = 216 fibras (3 Holders × 6 fusiones Ribbon 12F). Miembro tensil = 2" (bracket corto) o 2.5" (bracket largo).';
    q1Recommendation =
      'Consulta las diapositivas de Características de Bandeja y Tabla 1 de Preparación de Cable.';
    q1Options = [
      {
        id: crypto.randomUUID(),
        question_id: q1Id,
        label: 'A',
        text: '3 Holders por bandeja × 6 fusiones por Holder = 216 fibras de capacidad máxima por bandeja (no exceder); longitud de miembro tensil de 2" (bracket corto) o 2.5" (bracket largo).',
        rationale:
          'CORRECTO: Cumple exactamente con la capacidad de 216 fibras por bandeja y las medidas de 2" y 2.5" del miembro tensil.',
        is_correct: true,
      },
      {
        id: crypto.randomUUID(),
        question_id: q1Id,
        label: 'B',
        text: '10 Holders por bandeja para 500 fibras por bandeja y miembro tensil de 15 pulgadas.',
        rationale:
          'INCORRECTO: La bandeja solo tiene 3 Holders con capacidad máxima estricta de 216 fibras.',
        is_correct: false,
      },
      {
        id: crypto.randomUUID(),
        question_id: q1Id,
        label: 'C',
        text: '1 solo Holder para 12 fibras en total y sin retención de miembro tensil.',
        rationale:
          'INCORRECTO: Cada bandeja cuenta con 3 Holders y la fijación del miembro tensil es obligatoria.',
        is_correct: false,
      },
      {
        id: crypto.randomUUID(),
        question_id: q1Id,
        label: 'D',
        text: 'Se permite apilar fusiones sueltas sin Holder hasta llenar el domo por completo.',
        rationale:
          'INCORRECTO: El material advierte expresamente: "No exceda la capacidad de la bandeja (216 fibras)".',
        is_correct: false,
      },
    ];
  } else {
    const primaryFact =
      allBullets[0] ||
      `Ejecutar el procedimiento de ${moduleTitle} verificando parámetros, organización en bandeja y giro de 360° del Holder.`;
    q1Prompt = `Según lo estudiado en ${moduleTitle}, ¿cuál es el criterio técnico correcto establecido en el material de referencia?`;
    q1Explanation = `El material de referencia especifica: "${primaryFact}". Cumplir esta directriz evita daños ópticos, saturación en bandeja y pérdidas por macrocurvatura.`;
    q1Concept = primaryFact;
    q1Recommendation = `Revisa detenidamente las diapositivas y fichas de estudio de ${moduleTitle}.`;
    q1Options = [
      {
        id: crypto.randomUUID(),
        question_id: q1Id,
        label: 'A',
        text: primaryFact,
        rationale:
          'CORRECTO: Es el lineamiento técnico textual establecido en el material de este módulo.',
        is_correct: true,
      },
      {
        id: crypto.randomUUID(),
        question_id: q1Id,
        label: 'B',
        text: 'Omitir la presentación previa de la fibra y dejar longitudes sobrantes sin control dentro de la bandeja.',
        rationale:
          'INCORRECTO: El material prohíbe dejar longitudes extra porque causan saturación y daños al cerrar la bandeja.',
        is_correct: false,
      },
      {
        id: crypto.randomUUID(),
        question_id: q1Id,
        label: 'C',
        text: 'Realizar el procedimiento sin utilizar tubos espirales ni fijar el elemento central de tracción.',
        rationale:
          'INCORRECTO: El uso de tubos espirales y la fijación del miembro tensil son pasos obligatorios del estándar.',
        is_correct: false,
      },
      {
        id: crypto.randomUUID(),
        question_id: q1Id,
        label: 'D',
        text: 'Forzar el radio de curvatura de las cintas en ángulos de 90° sin girar el Holder.',
        rationale:
          'INCORRECTO: El Holder debe girarse 360° sobre su propio eje manteniendo radios de curvatura amplios y seguros.',
        is_correct: false,
      },
    ];
  }

  items.push({
    id: crypto.randomUUID(),
    type: 'question',
    content_type: 'question',
    title: `Pregunta Evaluativa ${moduleIndex}.1 (Selección Múltiple): Fundamentos y Estándar del Material`,
    subtitle: 'Verificación de comprensión técnica basada en el material suministrado',
    body: '',
    estimated_seconds: 60,
    question: {
      id: q1Id,
      course_id: '',
      module_id: '',
      related_content_id: firstSlideId,
      related_item_id: firstSlideId,
      competency_id: comp.id,
      competency_name: comp.name,
      prompt: q1Prompt,
      question_type: 'single_choice',
      difficulty: 'Intermedio',
      points: 15,
      max_attempts: 2,
      explanation: q1Explanation,
      explanation_correct: `¡Respuesta Correcta! ${q1Explanation}`,
      explanation_incorrect: `Respuesta Incorrecta. ${q1Explanation}`,
      correct_concept: q1Concept,
      recommendation: q1Recommendation,
      order_index: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      options: q1Options,
    },
  });

  // ============================================================================
  // PREGUNTA 2 (Tipo B: Verdadero / Falso) - Regla Crítica / Advertencia
  // ============================================================================
  const q2Id = crypto.randomUUID();
  const q2Statement = /216|holder|bandeja|saturaci|360/i.test(moduleText)
    ? 'En las bandejas de empalme para fibra Ribbon, la capacidad máxima es de 216 fibras (3 Holders × 6 fusiones de 12F), se debe evitar usar longitudes extra porque causarán saturación, y una vez colocadas las fusiones se debe girar el Holder 360° en su propio eje antes de fijarlo en la bandeja.'
    : /1051544|1051547|450 c6|400 c5|9 a 25/i.test(moduleText)
    ? 'Las cajas de empalme FOSC 450 C6 (Gel) y FOSC 400 C5 (Termocontráctil) admiten un rango de diámetro de cable de 9 a 25 mm máximo y garantizan hermeticidad IP-68 bajo norma Telcordia GR-771.'
    : `De acuerdo con el material formativo de ${moduleTitle}, es obligatorio verificar las especificaciones técnicas, utilizar las herramientas de precisión recomendadas y respetar la secuencia operativa paso a paso sin exceder las capacidades nominales.`;

  const q2Explanation =
    'La afirmación es VERDADERA porque recoge fielmente las reglas operativas, cotas y advertencias técnicas explícitas en el material suministrado para prevenir daños ópticos y asegurar calidad de red.';

  items.push({
    id: crypto.randomUUID(),
    type: 'question',
    content_type: 'question',
    title: `Pregunta Evaluativa ${moduleIndex}.2 (Verdadero / Falso): Verificación de Norma Crítica`,
    subtitle: 'Validación de regla técnica y prevención de errores operativos',
    body: '',
    estimated_seconds: 45,
    question: {
      id: q2Id,
      course_id: '',
      module_id: '',
      related_content_id: firstSlideId,
      related_item_id: firstSlideId,
      competency_id: comp.id,
      competency_name: comp.name,
      prompt: `Indica si el siguiente enunciado técnico es VERDADERO o FALSO según el material de estudio: "${q2Statement}"`,
      question_type: 'true_false',
      difficulty: 'Básico',
      points: 15,
      max_attempts: 2,
      explanation: q2Explanation,
      explanation_correct: `¡Correcto! Has identificado con precisión que el enunciado es VERDADERO según el estándar técnico del material. ${q2Explanation}`,
      explanation_incorrect: `Incorrecto. El enunciado es VERDADERO porque corresponde exactamente a las especificaciones y advertencias del material estudiado en este módulo.`,
      correct_concept: q2Statement,
      recommendation: `Verifica las notas destacadas y advertencias en las fichas de estudio de ${moduleTitle}.`,
      order_index: 2,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      options: [
        {
          id: crypto.randomUUID(),
          question_id: q2Id,
          label: 'V',
          text: 'Verdadero — Cumple exactamente con los parámetros y reglas operativas del material suministrado.',
          rationale:
            'CORRECTO: Todos los datos técnicos y restricciones mencionados forman parte literal del material oficial.',
          is_correct: true,
        },
        {
          id: crypto.randomUUID(),
          question_id: q2Id,
          label: 'F',
          text: 'Falso — El material permite omitir estas restricciones durante instalaciones de campo.',
          rationale:
            'INCORRECTO: Ninguno de estos parámetros es opcional; omitirlos produce saturación o fallas de hermeticidad.',
          is_correct: false,
        },
      ],
    },
  });

  // ============================================================================
  // PREGUNTA 3 (Tipo C: Selección Múltiple con Varias Respuestas)
  // ============================================================================
  const q3Id = crypto.randomUUID();
  const cBullet1 =
    allBullets[0] ||
    'Comprobar que el diámetro del cable se encuentre dentro del rango de 9 a 25 mm y asegurar el miembro tensil.';
  const cBullet2 =
    allBullets[1] ||
    'Enrutar las cintas con tubos espirales y presentar/cortar el excedente en el Holder para evitar saturación.';
  const q3Explanation = `Para aprobar esta verificación de respuesta múltiple debes seleccionar simultáneamente las dos condiciones verdaderas del material: (A) "${cBullet1}" y (B) "${cBullet2}". Las opciones C y D describen malas prácticas prohibidas.`;

  items.push({
    id: crypto.randomUUID(),
    type: 'question',
    content_type: 'question',
    title: `Pregunta Evaluativa ${moduleIndex}.3 (Múltiple Respuesta): Requisitos Técnicos Simultáneos`,
    subtitle: 'Selecciona TODAS las opciones que sean correctas según el material (2 respuestas correctas)',
    body: '',
    estimated_seconds: 65,
    question: {
      id: q3Id,
      course_id: '',
      module_id: '',
      related_content_id: firstSlideId,
      related_item_id: firstSlideId,
      competency_id: comp.id,
      competency_name: comp.name,
      prompt: `Selecciona las DOS (2) directrices técnicas que son CORRECTAS y obligatorias de acuerdo con el contenido estudiado en ${moduleTitle}:`,
      question_type: 'multiple_choice',
      difficulty: 'Intermedio',
      points: 20,
      max_attempts: 2,
      explanation: q3Explanation,
      explanation_correct: `¡Excelente! Seleccionaste ambas directrices técnicas verdaderas del material: "${cBullet1}" y "${cBullet2}".`,
      explanation_incorrect: `Respuesta incompleta o incorrecta. Debías marcar exactamente las opciones A y B, que corresponden a los lineamientos reales del material: "${cBullet1}" y "${cBullet2}".`,
      correct_concept: `${cBullet1} | ${cBullet2}`,
      recommendation: `Revisa los puntos clave en las Fichas de Estudio ${moduleIndex}.1 y ${moduleIndex}.2 de este módulo.`,
      order_index: 3,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      options: [
        {
          id: crypto.randomUUID(),
          question_id: q3Id,
          label: 'A',
          text: cBullet1,
          rationale:
            'CORRECTA: Es un lineamiento técnico verificado directamente en las diapositivas del módulo.',
          is_correct: true,
        },
        {
          id: crypto.randomUUID(),
          question_id: q3Id,
          label: 'B',
          text: cBullet2,
          rationale:
            'CORRECTA: Es el segundo requisito técnico establecido en el material de este bloque.',
          is_correct: true,
        },
        {
          id: crypto.randomUUID(),
          question_id: q3Id,
          label: 'C',
          text: 'Superar el límite de 216 fibras por bandeja y omitir el uso de protectores de fusión SMOUV de 42 mm.',
          rationale:
            'INCORRECTA: El material prohíbe exceder las 216 fibras por bandeja y exige protectores Ribbon de 42 mm (SAP 1051546).',
          is_correct: false,
        },
        {
          id: crypto.randomUUID(),
          question_id: q3Id,
          label: 'D',
          text: 'Dejar las fibras no intervenidas sin bandeja de aluminio ni espiral de protección.',
          rationale:
            'INCORRECTA: En cables Central Core o con tubos de transición es obligatorio proteger y almacenar ordenadamente las fibras.',
          is_correct: false,
        },
      ],
    },
  });

  // ============================================================================
  // PREGUNTA 4 (Tipo E/F: Identificación Visual con Imagen del Material)
  // ============================================================================
  const q4Id = crypto.randomUUID();
  const visualPage =
    modulePages.find((p) => Boolean(p.image_data_url)) || modulePages[0];
  const visualTitle = visualPage?.title || moduleTitle;
  const visualBullet =
    visualPage?.bullets?.[0] ||
    'Inspección técnica de componentes, enrutamiento y organización interna según el esquema original.';
  const q4Explanation = `La imagen técnica extraída del material corresponde a "${visualTitle}", donde se ilustra: ${visualBullet}.`;

  items.push({
    id: crypto.randomUUID(),
    type: 'question',
    content_type: 'question',
    title: `Pregunta Evaluativa ${moduleIndex}.4 (Identificación Visual): Análisis de Esquema / Fotografía del Material`,
    subtitle: 'Relaciona la evidencia visual del material con su procedimiento o especificación correcta',
    body: '',
    media_url: moduleImage,
    estimated_seconds: 60,
    question: {
      id: q4Id,
      course_id: '',
      module_id: '',
      related_content_id: firstSlideId,
      related_item_id: firstSlideId,
      competency_id: comp.id,
      competency_name: comp.name,
      case_study_image_url: moduleImage,
      prompt: `Observa la imagen técnica extraída de la diapositiva "${visualTitle}" y selecciona la opción que identifica correctamente el elemento o procedimiento representado:`,
      question_type: 'image_choice',
      difficulty: 'Intermedio',
      points: 20,
      max_attempts: 2,
      explanation: q4Explanation,
      explanation_correct: `¡Identificación visual correcta! ${q4Explanation}`,
      explanation_incorrect: `Identificación incorrecta. ${q4Explanation}`,
      correct_concept: `${visualTitle}: ${visualBullet}`,
      recommendation: `Observa los esquemas y fotografías originales en la diapositiva "${visualTitle}" de este módulo.`,
      order_index: 4,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      options: [
        {
          id: crypto.randomUUID(),
          question_id: q4Id,
          label: 'A',
          text: `${visualTitle}: ${visualBullet.slice(0, 145)}`,
          image_url: moduleImage,
          rationale:
            'CORRECTO: La imagen y su descripción corresponden exactamente a la diapositiva técnica del material.',
          is_correct: true,
        },
        {
          id: crypto.randomUUID(),
          question_id: q4Id,
          label: 'B',
          text: 'Instalación de antena microondas en torre autosoportada sin relación con fibra óptica ni cierres de empalme.',
          image_url: secondImage,
          rationale:
            'INCORRECTO: El esquema pertenece al procedimiento de fibra óptica / cierres de empalme del material.',
          is_correct: false,
        },
      ],
    },
  });

  // ============================================================================
  // PREGUNTA 5 (Tipo D: Ordenamiento de Pasos del Módulo)
  // ============================================================================
  const q5Id = crypto.randomUUID();
  const orderedStepsText =
    pageTitles.length >= 4
      ? pageTitles.slice(0, 4).map((t, idx) => `Etapa ${idx + 1}: ${t}`)
      : [
          '1. Verificación dimensional del cable (9 a 25 mm), desforre según Tabla 1 y sujeción del miembro tensil (2" o 2.5").',
          '2. Enrutamiento de cintas en bandeja de transición con tubos espirales o almacenamiento en bandeja de aluminio (Central Core).',
          '3. Organización de reserva inferior, presentación de cintas en el Holder, marcación y corte de excedente.',
          '4. Colocación de fusiones con protector de 42 mm en el Holder externo, giro de 360° en su propio eje y fijación en bandeja.',
        ];
  const q5Explanation = `La secuencia correcta establecida en el material es: ${orderedStepsText.join(' → ')}. Respetar este orden garantiza que no existan cruces de cintas ni exceso de longitud antes de fijar el Holder.`;

  items.push({
    id: crypto.randomUUID(),
    type: 'question',
    content_type: 'evaluation',
    title: `Pregunta Evaluativa ${moduleIndex}.5 (Ordenamiento de Pasos): Secuencia Operativa del Módulo`,
    subtitle: 'Ordena cronológicamente los pasos del procedimiento estudiado en este módulo',
    body: '',
    estimated_seconds: 75,
    question: {
      id: q5Id,
      course_id: '',
      module_id: '',
      related_content_id: firstSlideId,
      related_item_id: firstSlideId,
      competency_id: comp.id,
      competency_name: comp.name,
      prompt: `Ordena del primero (1) al último (${orderedStepsText.length}) la secuencia lógica y técnica de las etapas estudiadas en ${moduleTitle}:`,
      question_type: 'order_steps',
      difficulty: 'Avanzado',
      points: 20,
      max_attempts: 2,
      explanation: q5Explanation,
      explanation_correct: `¡Secuencia perfecta! Has ordenado correctamente todos los pasos del procedimiento: ${orderedStepsText.join(' → ')}.`,
      explanation_incorrect: `El orden seleccionado no coincide con la secuencia del material. El orden correcto es: ${orderedStepsText.join(' → ')}.`,
      correct_concept: orderedStepsText.join(' | '),
      recommendation: `Repasa el orden secuencial de las diapositivas de ${moduleTitle} y la Ficha de Estudio ${moduleIndex}.3.`,
      order_index: 5,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      options: orderedStepsText.map((st, idx) => ({
        id: crypto.randomUUID(),
        question_id: q5Id,
        label: String(idx + 1),
        text: st,
        step_order: idx + 1,
        rationale: `Posición correcta en la secuencia: Paso #${idx + 1}.`,
        is_correct: true,
      })),
    },
  });

  // ============================================================================
  // PREGUNTA 6 (Tipo G/H/I: Caso Práctico Real / Situacional de Campo)
  // ============================================================================
  const caseId = crypto.randomUUID();
  let caseSituation = '';
  let caseDescription = '';
  let casePrompt = '';
  let caseExplanation = '';
  let caseConcept = '';
  let caseOptions: QuestionOption[] = [];

  if (/rollable-ribbon|4057055|g\.657\.a1/i.test(moduleText)) {
    caseSituation =
      'Durante el despliegue de un anillo troncal de alta capacidad en Claro Colombia, la cuadrilla recibe un carrete identificado con el Código SAP 4057055 (Part Number 810010013/DB | D-288-CA-RR-F12NS/8W/99A). El supervisor solicita confirmar la estructura del cable antes de iniciar el tendido y la preparación del cierre.';
    caseDescription =
      'Datos de placa del carrete: Fiber OSP cable, Armored, Arid-Core, Dry Central Tube Rollable Ribbon, 288 fiber, Singlemode G.652.D and G.657.A1, Gel-free, Black jacket.';
    casePrompt =
      'Con base en la especificación del material suministrado para el Código SAP 4057055, ¿qué configuración de cable tiene la cuadrilla en sitio y cómo debe prepararse?';
    caseExplanation =
      'El código SAP 4057055 corresponde a un cable de planta externa (OSP) con armadura, unitubo central seco (Dry Central Tube / Central Core) libre de gel, con 288 fibras Rollable-Ribbon en cintas de 12 hilos monomodo G.652.D y G.657.A1.';
    caseConcept =
      'SAP 4057055 = Cable OSP Armado, Unitubo al Centro (Central Core) seco libre de gel, 288 FO Rollable-Ribbon (12F) G.652.D / G.657.A1.';
    caseOptions = [
      {
        id: crypto.randomUUID(),
        question_id: caseId,
        label: 'A',
        text: 'Cable OSP con armadura y unitubo al centro (Central Core) seco libre de gel, con 288 fibras Rollable-Ribbon (cintas de 12F) monomodo G.652.D y G.657.A1.',
        rationale:
          'CORRECTO: Interpreta fielmente la ficha técnica del cable SAP 4057055 del material.',
        is_correct: true,
      },
      {
        id: crypto.randomUUID(),
        question_id: caseId,
        label: 'B',
        text: 'Cable aéreo figura-8 totalmente dieléctrico de 48 fibras sueltas sumergidas en gel derivado del petróleo.',
        rationale:
          'INCORRECTO: El cable SAP 4057055 es armado, de 288 fibras Rollable-Ribbon y libre de gel (Gel-free).',
        is_correct: false,
      },
      {
        id: crypto.randomUUID(),
        question_id: caseId,
        label: 'C',
        text: 'Cable de parcheo interior (Indoor Simplex) sin protección mecánica ni resistencia a la humedad.',
        rationale:
          'INCORRECTO: Es un cable OSP (Outside Plant) armado para planta externa.',
        is_correct: false,
      },
      {
        id: crypto.randomUUID(),
        question_id: caseId,
        label: 'D',
        text: 'Cable submarino de 12 fibras multimodo OM4 con tubos holgados rellenos de grasa.',
        rationale:
          'INCORRECTO: Es fibra monomodo G.652.D / G.657.A1 en estructura Rollable-Ribbon seca.',
        is_correct: false,
      },
    ];
  } else if (/1051544|1051547|1059714|fosc 450 c6|fosc 400 c5/i.test(moduleText)) {
    caseSituation =
      'El ingeniero residente debe retirar del almacén de Claro los materiales para construir un nodo de empalme Ribbon de 864 fibras con tecnología mecánica en Gel (FOSC 450 C6) y además verificar el contenido de un kit termocontráctil FOSC 400 C5 de 864 fibras (SAP 1059714).';
    caseDescription =
      'Maestra SAP del documento: SAP 1051544 (FOSC450-C6 576F), SAP 1051547 (FOSC450-C6 864F), SAP 1059717 (Bandeja Ribbon 216 fusiones), SAP 1051546 (Protector de fusión Ribbon x 12F, 42 mm), SAP 1059714 (Kit FOSC400-C5 864F con 4 bandejas y 72 protectores SMOUV).';
    casePrompt =
      '¿Qué combinación de códigos SAP y especificaciones corresponde exactamente a lo establecido en la Maestra de Materiales del documento?';
    caseExplanation =
      'Para 864 fibras en FOSC 450 C6 se utiliza el SAP 1051547, bandeja SAP 1059717 (216 fusiones) y protector SAP 1051546 (Ribbon x 12F, 42 mm); mientras que el kit SAP 1059714 (FOSC 400 C5 864F) incluye 4 bandejas, 72 protectores Ribbon 12F y accesorios para 4 cables.';
    caseConcept =
      'SAP 1051547 (FOSC 450 C6 864F), SAP 1059717 (Bandeja 216F), SAP 1051546 (Protector 12F 42 mm), SAP 1059714 (Kit FOSC 400 C5 864F).';
    caseOptions = [
      {
        id: crypto.randomUUID(),
        question_id: caseId,
        label: 'A',
        text: 'SAP 1051547 para caja FOSC 450 C6 (864F), SAP 1059717 para bandeja de 216 fusiones, SAP 1051546 para protector Ribbon 12F (42 mm), y SAP 1059714 para el kit FOSC 400 C5 (864F con 4 bandejas y 72 protectores).',
        rationale:
          'CORRECTO: Todos los códigos SAP coinciden exactamente con las tablas de las diapositivas 8 y 10 del material.',
        is_correct: true,
      },
      {
        id: crypto.randomUUID(),
        question_id: caseId,
        label: 'B',
        text: 'SAP 1051544 para 1728 fibras y protectores individuales de 60 mm sin bandejas.',
        rationale:
          'INCORRECTO: El código SAP 1051544 es para 576 fibras y los protectores Ribbon son de 42 mm.',
        is_correct: false,
      },
      {
        id: crypto.randomUUID(),
        question_id: caseId,
        label: 'C',
        text: 'Cualquier cierre FOSC sin importar la bandeja, ya que no existen códigos SAP específicos para bandejas Ribbon.',
        rationale:
          'INCORRECTO: La bandeja Ribbon de 216 fusiones tiene el código específico SAP 1059717.',
        is_correct: false,
      },
      {
        id: crypto.randomUUID(),
        question_id: caseId,
        label: 'D',
        text: 'Kit SAP 1059714 con una sola bandeja para 24 fibras y sin válvulas de test.',
        rationale:
          'INCORRECTO: El Kit SAP 1059714 es para 864 fibras (4 bandejas de 216F), incluye 72 protectores y válvula de test.',
        is_correct: false,
      },
    ];
  } else {
    caseSituation =
      'En un empalme de sangrado sobre un cable Central Core Ribbon de 288 fibras, únicamente se van a derivar 2 cintas (24 fibras) hacia un nodo secundario, mientras que las 22 cintas restantes continúan en paso directo. En una inspección previa de otro cierre se encontraron fibras pisadas por exceso de longitud en la bandeja.';
    caseDescription =
      'Lineamientos del material: 1) En cables con tubos/transición, ingresar cintas a la bandeja de transición y derivar con espirales. 2) En cables Central Core, almacenar las fibras no intervenidas en la bandeja de aluminio y subir solo la(s) cinta(s) intervenida(s) usando el espiral. 3) Presentar en el Holder, marcar y cortar excedentes para evitar saturación, y girar el Holder 360° antes de colocarlo en la bandeja.';
    casePrompt =
      '¿Cuál es el procedimiento correcto que debe ejecutar el técnico especialista según la secuencia del material formativo?';
    caseExplanation =
      'En cables Central Core las cintas no intervenidas se almacenan ordenadamente en la bandeja de aluminio inferior, se suben únicamente las cintas a intervenir protegidas con tubo espiral, se presenta la fibra en el Holder marcando y cortando el excedente para evitar saturación, y se gira el Holder 360° antes de asentarlo.';
    caseConcept =
      'Central Core: fibras en paso directo a bandeja de aluminio + cintas intervenidas con tubo espiral + corte de excedente en Holder + giro 360° del Holder.';
    caseOptions = [
      {
        id: crypto.randomUUID(),
        question_id: caseId,
        label: 'A',
        text: 'Almacenar las cintas no intervenidas en la bandeja de aluminio, subir a la bandeja de fusión solo las 2 cintas a derivar usando el tubo espiral, presentar y cortar el excedente en el Holder, y girar el Holder 360° sobre su propio eje al finalizar.',
        rationale:
          'CORRECTO: Aplica íntegramente el procedimiento de sangrado Central Core, control de longitud y giro 360° del Holder.',
        is_correct: true,
      },
      {
        id: crypto.randomUUID(),
        question_id: caseId,
        label: 'B',
        text: 'Cortar las 24 cintas del cable Central Core y subir todas las 288 fibras a una sola bandeja de 216 fibras sin usar tubos espirales.',
        rationale:
          'INCORRECTO: Interrumpiría el tráfico de las 22 cintas en paso directo y superaría la capacidad máxima de 216 fibras por bandeja.',
        is_correct: false,
      },
      {
        id: crypto.randomUUID(),
        question_id: caseId,
        label: 'C',
        text: 'Dejar 2 metros adicionales de cinta sobrante dentro de la bandeja de empalme para futuras reparaciones.',
        rationale:
          'INCORRECTO: El material advierte expresamente evitar longitudes extra en la bandeja porque causan saturación.',
        is_correct: false,
      },
      {
        id: crypto.randomUUID(),
        question_id: caseId,
        label: 'D',
        text: 'Omitir el uso de los protectores de fusión de 42 mm y pegar las cintas directamente con cinta adhesiva.',
        rationale:
          'INCORRECTO: Es obligatorio usar los protectores de fusión para Ribbon x 12F de 42 mm alojados en el Holder.',
        is_correct: false,
      },
    ];
  }

  items.push({
    id: crypto.randomUUID(),
    type: 'case_question',
    content_type: 'case_study',
    title: `Caso Práctico Real Mód. ${moduleIndex}: Toma de Decisión Operativa en Campo`,
    subtitle: 'Escenario situacional basado en las especificaciones reales del material',
    body: caseSituation,
    estimated_seconds: 90,
    question: {
      id: caseId,
      course_id: '',
      module_id: '',
      related_content_id: firstSlideId,
      related_item_id: firstSlideId,
      competency_id: comp.id,
      competency_name: comp.name,
      case_study_situation: caseSituation,
      case_study_description: caseDescription,
      case_study_image_url: moduleImage,
      prompt: casePrompt,
      question_type: 'single_choice',
      difficulty: 'Avanzado',
      points: 25,
      max_attempts: 2,
      explanation: caseExplanation,
      explanation_correct: `¡Excelente resolución del caso práctico! ${caseExplanation}`,
      explanation_incorrect: `Decisión operativa incorrecta. ${caseExplanation}`,
      correct_concept: caseConcept,
      recommendation: `Revisa las diapositivas de procedimiento y la Ficha de Estudio ${moduleIndex}.3 de este módulo.`,
      order_index: 6,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      options: caseOptions,
    },
  });

  return items;
}

/**
 * Builds a complete, sequential, material-faithful interactive course directly from the extracted pages
 * and classified real images of the uploaded material.
 */
function buildSequentialCourseFromExtractedPages(params: {
  courseId: string;
  title: string;
  description: string;
  category: string;
  level: DifficultyLevel;
  pages: ExtractedMaterialPage[];
  classifiedImages: ClassifiedMaterialImage[];
  competencies: Competency[];
  sourceFiles: string[];
}): {
  modules: CourseModule[];
  suggestedCoverUrl: string;
  suggestedCoverImages: ClassifiedMaterialImage[];
  analysisSummary: CourseAiAnalysisSummary;
} {
  const {
    courseId,
    title,
    category,
    pages,
    classifiedImages,
    competencies,
    sourceFiles,
  } = params;

  const fallbackCompetencies: Competency[] =
    competencies.length > 0
      ? competencies
      : [
          {
            id: '10000000-0000-4000-8000-000000000001',
            code: 'FO-RIBBON-01',
            name: 'Ingeniería de Fibra Óptica Ribbon y Cierres FOSC',
            category: category || 'Fibra Óptica',
            description:
              'Dominio técnico de cables Rollable-Ribbon, cierres FOSC 400 C5 / 450 C6 y empalmería masiva.',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ];

  // Filter out pure "Thank you / Encuesta / Contact" closing slides while keeping all technical slides in strict sequence
  const instructionalPages = pages.filter((p) => {
    const t = `${p.title} ${p.bullets.join(' ')}`.toLowerCase();
    if (/^(?:encuesta|thank you)/i.test(p.title.trim())) return false;
    if (/juancarlos\.gama@|thank you/i.test(t) && p.page_number > 25) return false;
    return true;
  });

  const effectivePages =
    instructionalPages.length > 0 ? instructionalPages : pages;

  // Select cover candidates from classified images (prioritizing FOTOGRAFÍA, DIAGRAMA, ILUSTRACIÓN)
  const coverCandidates = classifiedImages
    .filter((img) => img.is_cover_candidate && img.category !== 'LOGO')
    .slice(0, 8);

  const firstImagePage =
    effectivePages.find((p) => p.page_number >= 2 && Boolean(p.image_data_url)) ||
    effectivePages.find((p) => Boolean(p.image_data_url));

  const suggestedCoverUrl =
    coverCandidates[0]?.image_url ||
    firstImagePage?.image_data_url ||
    generateThematicSvgDataUri(
      title,
      `CURSO OFICIAL · ${(category || 'TELECOMUNICACIONES').toUpperCase()}`
    );

  // Group pages sequentially into logical modules depending on actual material density (Section 5)
  const slidesPerModule =
    effectivePages.length > 20
      ? 6
      : effectivePages.length > 10
      ? 5
      : Math.max(3, effectivePages.length);

  const pageGroups: ExtractedMaterialPage[][] = [];
  for (let i = 0; i < effectivePages.length; i += slidesPerModule) {
    pageGroups.push(effectivePages.slice(i, i + slidesPerModule));
  }

  const modules: CourseModule[] = [];
  let totalTheorySlides = 0;
  let totalEvaluativeQuestions = 0;
  let totalPracticalCases = 0;
  const extractedTopics: string[] = [];
  const keyFactsAndNorms: string[] = [];
  const identifiedProcedures: string[] = [];

  pageGroups.forEach((group, gIdx) => {
    const modId = crypto.randomUUID();
    const modNumber = gIdx + 1;
    const comp = fallbackCompetencies[gIdx % fallbackCompetencies.length];

    const groupText = group.map((p) => `${p.title} ${p.bullets.join(' ')}`).join(' ');
    let modTitle = `Módulo ${modNumber}: ${group[0]?.title || 'Contenido Técnico'}`;
    if (/rollable-ribbon|432|4057055/i.test(groupText) && modNumber === 1) {
      modTitle =
        'Módulo 1: Fundamentos de Fibra Óptica Rollable-Ribbon y Cables Central Core / LBT';
    } else if (/1051544|1051547|1059714|fosc 400 c5|fosc 450 c6/i.test(groupText)) {
      modTitle = `Módulo ${modNumber}: Cierres FOSC 450 C6 (Gel) y FOSC 400 C5 (Termocontráctil) · Maestra SAP`;
    } else if (/216 fibras|tres holder|dimensiones|longitud de cable/i.test(groupText)) {
      modTitle = `Módulo ${modNumber}: Dimensiones, Bandejas de 216 Fibras, Herramientas y Longitudes de Cable`;
    } else if (/preparaci[oó]n del cable|retenci[oó]n|bandeja de transici[oó]n|central core/i.test(groupText)) {
      modTitle = `Módulo ${modNumber}: Preparación, Retención de Cable y Enrutamiento en Bandejas`;
    } else if (/calcule y presente|360|acomodando|ribonizando|prizm/i.test(groupText)) {
      modTitle = `Módulo ${modNumber}: Organización en Holder (Giro 360°), Control de Reservas y Ribonización MT`;
    }

    extractedTopics.push(modTitle);

    const theorySlides: ContentItem[] = [];
    const usedImageCounts = new Map<string, number>();
    let lastValidImage =
      group.find((p) => Boolean(p.image_data_url))?.image_data_url ||
      suggestedCoverUrl;

    group.forEach((page, pIdx) => {
      const enriched = enrichSlideWithTelecomExpertise(page);
      if (page.image_data_url) {
        lastValidImage = page.image_data_url;
      }
      if (enriched.highlightNote && keyFactsAndNorms.length < 12) {
        keyFactsAndNorms.push(enriched.highlightNote);
      }
      if (enriched.isStepsSlide && identifiedProcedures.length < 10) {
        identifiedProcedures.push(enriched.title);
      }

      // Section 1 & 5: Priority 1 — Semantically match a visual resource from the course's reference material.
      // Priority 4 — If no relevant visual resource exists for this slide, generate an automatic didactic schematic based exclusively on the slide's content.
      const matchedImage = findBestMaterialImageForSlide({
        slideTitle: enriched.title,
        slideSubtitle: enriched.subtitle,
        slideObjective: `Dominar ${enriched.title}`,
        mainConcept: enriched.highlightNote,
        slideBody: enriched.bullets.join('\n'),
        isProcedural: enriched.isStepsSlide,
        competencyName: comp.name,
        pageNumber: page.page_number,
        pageImageUrl: page.image_data_url,
        classifiedImages,
        usedImageCounts,
      });

      let slideMediaUrl: string;
      let mediaSourceType: 'material_reference' | 'auto_schematic';
      let mediaSourceFile: string | undefined;
      let mediaSourcePage: number | undefined;
      let mediaSourceSection: string | undefined;
      let mediaClassification: ClassifiedMaterialImage['category'];
      let mediaKeywords: string[] | undefined;

      if (matchedImage) {
        slideMediaUrl = matchedImage.image_url;
        mediaSourceType = 'material_reference';
        mediaSourceFile = matchedImage.source_file_name || sourceFiles[0];
        mediaSourcePage = matchedImage.page_number || page.page_number;
        mediaSourceSection = matchedImage.source_section || matchedImage.related_topic;
        mediaClassification = matchedImage.category;
        mediaKeywords = matchedImage.keywords;
        usedImageCounts.set(
          matchedImage.image_url,
          (usedImageCounts.get(matchedImage.image_url) || 0) + 1
        );
      } else {
        slideMediaUrl = generateThematicSvgDataUri({
          title: enriched.title,
          subtitle: enriched.subtitle,
          bullets: enriched.bullets,
          steps: enriched.steps,
          technicalSpecs: enriched.technicalSpecs,
          highlightNote: enriched.highlightNote,
          sourceFileName: sourceFiles[0],
        });
        mediaSourceType = 'auto_schematic';
        mediaSourceFile = sourceFiles[0];
        mediaSourcePage = page.page_number;
        mediaSourceSection = page.title;
        mediaClassification = 'ESQUEMA';
        mediaKeywords = extractSemanticKeywords(
          `${enriched.title} ${enriched.bullets.join(' ')}`,
          10
        );
      }

      const interactiveProps = buildInteractiveElementsForSlide(
        page,
        enriched.title,
        enriched.bullets,
        enriched.technicalSpecs || [],
        enriched.studyNotes || [],
        pIdx
      );

      theorySlides.push({
        id: crypto.randomUUID(),
        course_id: courseId,
        module_id: modId,
        type: 'slide',
        content_type: enriched.isStepsSlide
          ? 'steps'
          : pIdx === 0
          ? 'title'
          : matchedImage
          ? 'image'
          : 'highlight',
        title: enriched.title,
        subtitle: enriched.subtitle,
        body: enriched.bullets.join('\n'),
        media_url: slideMediaUrl,
        media_caption:
          matchedImage?.caption ||
          page.image_caption ||
          `Esquema didáctico de la diapositiva ${page.page_number}: ${enriched.title}`,
        media_classification: mediaClassification,
        image_category: mediaClassification,
        media_source_type: mediaSourceType,
        media_source_file: mediaSourceFile,
        media_source_page: mediaSourcePage,
        media_source_section: mediaSourceSection,
        media_keywords: mediaKeywords,
        highlight_note: enriched.highlightNote,
        steps: enriched.steps,
        technical_specs: enriched.technicalSpecs,
        study_notes: enriched.studyNotes,
        ...interactiveProps,
        estimated_seconds: 55,
      });
      totalTheorySlides++;
    });

    const firstSlideId = theorySlides[0]?.id || crypto.randomUUID();

    // Generate the 4 expanded ModuleStudyCards for this module
    const studyCards = buildModuleStudyCards(
      modNumber,
      modTitle,
      group,
      lastValidImage
    );

    const synthesisMatchedImg = findBestMaterialImageForSlide({
      slideTitle: modTitle,
      slideBody: studyCards.map((sc) => `${sc.title} ${sc.summary}`).join(' '),
      isProcedural: false,
      competencyName: comp.name,
      classifiedImages,
      usedImageCounts,
    });

    const synthesisMediaUrl =
      synthesisMatchedImg?.image_url ||
      generateThematicSvgDataUri({
        title: `Síntesis Técnica · ${modTitle}`,
        subtitle: `FICHAS DE ESTUDIO Y PARÁMETROS DEL MÓDULO ${modNumber}`,
        bullets: studyCards.map((sc) => `${sc.title}: ${sc.summary}`),
        technicalSpecs: studyCards.flatMap((sc) => sc.technical_parameters || []).slice(0, 3),
        highlightNote: studyCards[0]?.field_tip,
        sourceFileName: sourceFiles[0],
      });

    // Also add a dedicated Study Synthesis Slide inside the module flow
    const synthesisSlide: ContentItem = {
      id: crypto.randomUUID(),
      course_id: courseId,
      module_id: modId,
      type: 'slide',
      content_type: 'highlight',
      title: `Fichas de Estudio y Profundización Técnica · Módulo ${modNumber}`,
      subtitle: 'Resumen de especificaciones, parámetros críticos y buenas prácticas antes de la evaluación del módulo',
      objective: `Consolidar los conceptos, tablas y procedimientos clave del Módulo ${modNumber} antes de completar la evaluación obligatoria.`,
      body: studyCards
        .map((sc) => `${sc.card_number} (${sc.category_tag}): ${sc.title} — ${sc.summary}`)
        .join('\n'),
      media_url: synthesisMediaUrl,
      media_caption: `Síntesis técnica del Módulo ${modNumber} (${studyCards.length} fichas de estudio ampliadas disponibles)`,
      media_classification: synthesisMatchedImg?.category || 'ESQUEMA',
      image_category: synthesisMatchedImg?.category || 'ESQUEMA',
      media_source_type: synthesisMatchedImg ? 'material_reference' : 'auto_schematic',
      media_source_file: synthesisMatchedImg?.source_file_name || sourceFiles[0],
      media_source_page: synthesisMatchedImg?.page_number,
      media_source_section: synthesisMatchedImg?.source_section,
      media_keywords: synthesisMatchedImg?.keywords,
      highlight_note:
        studyCards[0]?.field_tip ||
        'Completa las preguntas evaluativas del módulo para desbloquear el avance al siguiente bloque formativo.',
      technical_specs: studyCards.flatMap((sc) => sc.technical_parameters || []).slice(0, 6),
      study_notes: studyCards.flatMap((sc) => sc.key_points).slice(0, 6),
      interaction_type: 'selectable_cards',
      selectable_cards: studyCards.map((sc) => ({
        id: sc.id,
        title: `${sc.card_number}: ${sc.title}`,
        badge: sc.category_tag,
        detail: `${sc.summary} | Puntos clave: ${sc.key_points.join(' · ')}`,
      })),
      estimated_seconds: 60,
    };
    totalTheorySlides++;

    // Build the 6 evaluative items (5 questions + 1 practical case) for this module
    const evalAndCaseItems = buildModuleQuestionsAndCaseFromPages(
      modNumber,
      modTitle,
      group,
      firstSlideId,
      comp,
      lastValidImage
    );

    for (const qItem of evalAndCaseItems) {
      qItem.course_id = courseId;
      qItem.module_id = modId;
      if (qItem.question) {
        qItem.question.course_id = courseId;
        qItem.question.module_id = modId;
      }
      if (qItem.type === 'case_question' || qItem.content_type === 'case_study') {
        totalPracticalCases++;
      } else {
        totalEvaluativeQuestions++;
      }
    }

    // Intercalate Q1 and Q2 inside the theory slides (Requirement 11: "Intercalar preguntas dentro de la experiencia")
    // and place Q3, Q4, Q5, Q6 as the module evaluation gate before advancing to the next module!
    const items: ContentItem[] = [];
    const midPoint = Math.max(1, Math.floor(theorySlides.length / 2));

    theorySlides.forEach((sl, idx) => {
      items.push(sl);
      if (idx === 0 && evalAndCaseItems[0] && theorySlides.length >= 2) {
        items.push(evalAndCaseItems[0]); // Q1 intercalated after Slide 1
      }
      if (idx === midPoint && evalAndCaseItems[1] && theorySlides.length >= 3) {
        items.push(evalAndCaseItems[1]); // Q2 intercalated at midpoint
      }
    });

    items.push(synthesisSlide);

    // Append any questions not yet intercalated + the module evaluation block
    evalAndCaseItems.forEach((qItem, qIdx) => {
      if (qIdx === 0 && theorySlides.length >= 2) return;
      if (qIdx === 1 && theorySlides.length >= 3) return;
      items.push(qItem);
    });

    items.forEach((it, idx) => {
      it.order_index = idx + 1;
    });

    modules.push({
      id: modId,
      course_id: courseId,
      module_number: modNumber,
      title: modTitle,
      description: `Secuencia formativa interactiva basada en las diapositivas ${group[0]?.page_number} a ${
        group[group.length - 1]?.page_number
      } del material suministrado, con ${studyCards.length} fichas de estudio ampliadas, imágenes clasificadas y evaluación mínima de 5 preguntas + caso práctico.`,
      learning_objective: `Dominar los conceptos, procedimientos paso a paso y criterios de calidad de ${modTitle} verificando el aprendizaje mediante evaluación interactiva.`,
      order_index: modNumber,
      study_cards: studyCards,
      items,
    });
  });

  const validClassifiedCount = classifiedImages.filter((i) => !i.is_discarded).length;
  const discardedCount = classifiedImages.filter((i) => i.is_discarded).length;

  const execSummary = `Experiencia formativa interactiva generada en estado BORRADOR a partir de ${effectivePages.length} diapositivas/secciones y ${validClassifiedCount} imágenes pedagógicas extraídas y clasificadas de (${sourceFiles.join(
    ', '
  )}). Organizada en ${modules.length} módulos con ${totalTheorySlides} slides interactivos, ${
    modules.length * 4
  } fichas de estudio ampliadas, ${totalEvaluativeQuestions} preguntas evaluativas (mínimo 5 por módulo) y ${totalPracticalCases} casos prácticos reales de campo.`;

  const analysisSummary: CourseAiAnalysisSummary = {
    document_summary: execSummary,
    executive_summary: execSummary,
    extracted_topics: extractedTopics,
    key_facts_and_norms: keyFactsAndNorms.slice(0, 12),
    learning_objectives: modules.map(
      (m) => m.learning_objective || `Dominar ${m.title}`
    ),
    identified_competencies: fallbackCompetencies.map((c) => c.name),
    identified_procedures:
      identifiedProcedures.length > 0
        ? identifiedProcedures
        : extractedTopics.map((t) => `Procedimiento operativo: ${t}`),
    classified_images: classifiedImages,
    discarded_images_count: discardedCount,
    cover_candidates: coverCandidates,
    total_theory_slides: totalTheorySlides,
    total_evaluative_questions: totalEvaluativeQuestions,
    total_practical_cases: totalPracticalCases,
    generated_at: new Date().toISOString(),
    source_files: sourceFiles,
  };

  return {
    modules,
    suggestedCoverUrl,
    suggestedCoverImages: coverCandidates,
    analysisSummary,
  };
}

export async function generateStructuredCourseFromMaterials(params: {
  courseId: string;
  title: string;
  description: string;
  category: string;
  level: DifficultyLevel;
  estimatedMinutes: number;
  materials: TrainingMaterial[];
  competencies: Competency[];
  geminiAnalysis?: GeminiStructuredMaterialAnalysis;
}): Promise<{
  modules: CourseModule[];
  suggestedCoverUrl: string;
  suggestedCoverImages: ClassifiedMaterialImage[];
  enrichedMaterials: TrainingMaterial[];
  analysisSummary: CourseAiAnalysisSummary;
  suggestedTitle?: string;
  suggestedDescription?: string;
}> {
  const { courseId, title, description, category, level, geminiAnalysis } = params;

  // 1. Ensure all uploaded materials have clean decoded text, sequential pages, and classified real images
  const enrichedMaterials = await ensureMaterialsExtracted(
    params.materials || [],
    title,
    category
  );

  const effectiveGeminiAnalysis =
    geminiAnalysis ||
    enrichedMaterials.find((m) => m.gemini_analysis)?.gemini_analysis;

  // Collect all sequential pages and classified images across uploaded materials
  const allPages: ExtractedMaterialPage[] = [];
  const allClassifiedImages: ClassifiedMaterialImage[] = [];
  const sourceFiles: string[] = [];

  for (const mat of enrichedMaterials) {
    sourceFiles.push(mat.file_name || mat.title);
    const matImages =
      mat.classified_images && mat.classified_images.length > 0
        ? mat.classified_images
        : mat.extracted_images || [];
    if (matImages.length > 0) {
      allClassifiedImages.push(...matImages);
    }
    if (mat.extracted_pages && mat.extracted_pages.length > 0) {
      allPages.push(...mat.extracted_pages);
    } else if (mat.extracted_text && mat.extracted_text.trim().length > 0) {
      const cleanLines = mat.extracted_text
        .split(/\n+/)
        .map((l) => l.replace(/^[•\-*]\s*/, '').trim())
        .filter((l) => isCleanHumanReadableLine(l));

      for (let i = 0; i < cleanLines.length; i += 5) {
        const chunk = cleanLines.slice(i, i + 5);
        if (chunk.length > 0) {
          allPages.push({
            page_number: allPages.length + 1,
            title: chunk[0],
            bullets: chunk.slice(1).length > 0 ? chunk.slice(1) : [chunk[0]],
            raw_text: chunk.join('\n'),
            image_data_url:
              mat.file_type === 'image' ? mat.media_data_url : undefined,
          });
        }
      }
    }
  }

  // If approved Gemini analysis exists and allPages has few pages, enrich or append pages from Gemini's structured analysis
  if (effectiveGeminiAnalysis && allPages.length < 3) {
    effectiveGeminiAnalysis.topics.forEach((topic, idx) => {
      const relatedConcepts = effectiveGeminiAnalysis.keyConcepts
        .slice(idx * 2, idx * 2 + 2)
        .map((c) => `${c.title}: ${c.description}`);
      const relatedProcs = effectiveGeminiAnalysis.procedures[idx];
      const bullets = [
        topic.description,
        ...relatedConcepts,
        ...(relatedProcs ? relatedProcs.steps.slice(0, 3) : []),
      ].filter((b) => Boolean(b && b.trim().length > 4));

      allPages.push({
        page_number: topic.page || allPages.length + 1,
        title: topic.title,
        bullets: bullets.length > 0 ? bullets : [topic.description],
        raw_text: [topic.title, ...bullets].join('\n'),
      });
    });
  }

  if (allPages.length === 0) {
    const descLines = (description || title)
      .split(/\n+|\.\s+/)
      .map((l) => l.trim())
      .filter((l) => l.length > 5);

    allPages.push({
      page_number: 1,
      title: `Fundamentos y Estándares Técnicos: ${title}`,
      bullets:
        descLines.length > 0
          ? descLines
          : [
              `Lineamientos técnicos y operativos para ${title} en redes de telecomunicaciones y fibra óptica.`,
              'Verificación de herramientas, equipos de medición y parámetros de calidad antes de intervenir la red.',
            ],
      raw_text: description || title,
    });
  }

  if (allClassifiedImages.length === 0) {
    allClassifiedImages.push(
      ...buildClassifiedImagesFromPages(allPages, sourceFiles[0] || title)
    );
  }

  const resolvedTitle =
    effectiveGeminiAnalysis?.documentTitle || title;
  const resolvedDesc =
    effectiveGeminiAnalysis?.summary || description;
  const resolvedLevel: DifficultyLevel =
    effectiveGeminiAnalysis?.difficulty || level;

  const built = buildSequentialCourseFromExtractedPages({
    courseId,
    title: resolvedTitle,
    description: resolvedDesc,
    category,
    level: resolvedLevel,
    pages: allPages,
    classifiedImages: allClassifiedImages,
    competencies: params.competencies,
    sourceFiles: sourceFiles.length > 0 ? sourceFiles : [resolvedTitle],
  });

  if (effectiveGeminiAnalysis) {
    built.analysisSummary.document_summary = effectiveGeminiAnalysis.summary;
    if (effectiveGeminiAnalysis.topics.length > 0) {
      built.analysisSummary.extracted_topics = effectiveGeminiAnalysis.topics.map(
        (t) => t.title
      );
    }
    if (effectiveGeminiAnalysis.learningObjectives.length > 0) {
      built.analysisSummary.learning_objectives =
        effectiveGeminiAnalysis.learningObjectives.map(
          (o) => `${o.title}: ${o.description}`
        );
    }
    if (effectiveGeminiAnalysis.procedures.length > 0) {
      built.analysisSummary.identified_procedures =
        effectiveGeminiAnalysis.procedures.map(
          (p) => `${p.title}: ${p.steps.join(' → ')}`
        );
    }
    if (effectiveGeminiAnalysis.keyConcepts.length > 0) {
      built.analysisSummary.key_facts_and_norms =
        effectiveGeminiAnalysis.keyConcepts.map(
          (c) => `${c.title}: ${c.description}`
        );
    }

    // Also enrich module learning objectives and append Gemini-evaluated questions if available
    built.modules.forEach((mod, mIdx) => {
      const geminiObj = effectiveGeminiAnalysis.learningObjectives[mIdx];
      if (geminiObj) {
        mod.learning_objective = `${geminiObj.title}: ${geminiObj.description}`;
      }
    });
  }

  return {
    ...built,
    enrichedMaterials,
    suggestedTitle: effectiveGeminiAnalysis?.documentTitle,
    suggestedDescription: effectiveGeminiAnalysis?.summary,
  };
}

/**
 * Upgrades any existing courses in the database so that:
 * 1) Every module has 4 expanded study_cards
 * 2) Every module has at least 5 evaluative questions with complete feedback fields (explanation, correct_concept, recommendation, rationale)
 * 3) Every slide has interactive elements, study notes, and complete visual provenance & classified material images
 */
export function upgradeExistingCoursesWithStudyCardsAndFeedback(
  courses: Course[],
  competencies: Competency[]
): boolean {
  let modified = false;
  const defaultComp: Competency = competencies[0] || {
    id: '10000000-0000-4000-8000-000000000001',
    code: 'FO-RIBBON-01',
    name: 'Ingeniería de Fibra Óptica y Telecomunicaciones',
    category: 'Fibra Óptica',
    description: 'Dominio de procedimientos técnicos y estándares de red.',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  for (const course of courses) {
    if (!Array.isArray(course.modules)) continue;

    const primaryMaterialFile =
      course.materials?.[0]?.file_name ||
      course.materials?.[0]?.title ||
      `${course.slug || 'manual_referencia'}.pdf`;

    const courseClassifiedImages: ClassifiedMaterialImage[] = [];
    const seenUrls = new Set<string>();
    let globalPageCounter = 1;

    course.modules.forEach((mod, mIdx) => {
      const modNumber = mod.module_number || mIdx + 1;
      const syntheticPages: ExtractedMaterialPage[] = (mod.items || [])
        .filter((it) => !it.question)
        .map((it, sIdx) => ({
          page_number: sIdx + 1,
          title: it.title,
          bullets: (it.body || '')
            .split(/\n+/)
            .map((l) => l.replace(/^[•\-*]\s*/, '').trim())
            .filter(Boolean),
          raw_text: it.body || it.title,
          image_data_url: it.media_url,
          image_caption: it.media_caption,
        }));

      if (!mod.study_cards || mod.study_cards.length < 4) {
        mod.study_cards = buildModuleStudyCards(
          modNumber,
          mod.title,
          syntheticPages.length > 0
            ? syntheticPages
            : [
                {
                  page_number: 1,
                  title: mod.title,
                  bullets: [mod.description || mod.title],
                  raw_text: mod.description || mod.title,
                  image_data_url: course.cover_image_url,
                },
              ],
          course.cover_image_url
        );
        modified = true;
      }

      // Enrich theory slides with interactive elements, study notes & visual resource provenance
      (mod.items || []).forEach((it, sIdx) => {
        if (!it.question) {
          const currentPageNum = it.media_source_page || globalPageCounter++;
          const pageObj: ExtractedMaterialPage = {
            page_number: currentPageNum,
            title: it.title,
            bullets: (it.body || '')
              .split(/\n+/)
              .map((l) => l.replace(/^[•\-*]\s*/, '').trim())
              .filter(Boolean),
            raw_text: it.body || it.title,
            image_data_url: it.media_url,
          };
          const enriched = enrichSlideWithTelecomExpertise(pageObj);
          if (!it.study_notes || it.study_notes.length === 0) {
            it.study_notes = enriched.studyNotes;
            modified = true;
          }
          if (!it.technical_specs || it.technical_specs.length === 0) {
            it.technical_specs = enriched.technicalSpecs;
            modified = true;
          }
          if (!it.interaction_type) {
            const inter = buildInteractiveElementsForSlide(
              pageObj,
              it.title,
              enriched.bullets,
              it.technical_specs || [],
              it.study_notes || [],
              sIdx
            );
            Object.assign(it, inter);
            modified = true;
          }

          // Populate visual provenance & classified image catalog for the slide editor (Sections 2-8)
          if (it.media_url) {
            const isAutoSvg = it.media_url.startsWith('data:image/svg+xml');
            if (!it.media_source_type) {
              it.media_source_type = isAutoSvg ? 'auto_schematic' : 'material_reference';
              modified = true;
            }
            if (!it.media_source_file) {
              it.media_source_file = primaryMaterialFile;
              modified = true;
            }
            if (!it.media_source_page) {
              const subtitleMatch = (it.subtitle || '').match(/Diapositiva\s+(\d+)|Ficha\s+(\d+)/i);
              it.media_source_page = subtitleMatch
                ? Number(subtitleMatch[1] || subtitleMatch[2])
                : currentPageNum;
              modified = true;
            }
            if (!it.image_category) {
              it.image_category =
                it.media_classification || (isAutoSvg ? 'ESQUEMA' : 'DIAGRAMA');
              modified = true;
            }
            if (!it.media_keywords || it.media_keywords.length === 0) {
              it.media_keywords = extractSemanticKeywords(
                `${it.title} ${it.body || ''} ${it.highlight_note || ''}`,
                10
              );
              modified = true;
            }

            if (!isAutoSvg && !seenUrls.has(it.media_url)) {
              seenUrls.add(it.media_url);
              const builtImgs = buildClassifiedImagesFromPages(
                [
                  {
                    page_number: it.media_source_page || currentPageNum,
                    title: it.title,
                    bullets: pageObj.bullets,
                    raw_text: pageObj.raw_text,
                    image_data_url: it.media_url,
                  },
                ],
                it.media_source_file || primaryMaterialFile,
                course.materials?.[0]?.id || course.id
              );
              if (builtImgs[0]) {
                builtImgs[0].related_module = mod.title;
                courseClassifiedImages.push(builtImgs[0]);
              }
            }
          }
        } else {
          // Ensure every existing question has complete feedback fields & option rationales
          const q = it.question;
          if (!q.explanation || q.explanation.trim().length < 5) {
            q.explanation =
              q.explanation_correct ||
              'La respuesta correcta está fundamentada en las especificaciones y procedimientos técnicos del material oficial de este módulo.';
            modified = true;
          }
          if (!q.explanation_correct) {
            q.explanation_correct = `¡Respuesta Correcta! ${q.explanation}`;
            modified = true;
          }
          if (!q.explanation_incorrect) {
            q.explanation_incorrect = `Respuesta Incorrecta. ${q.explanation}`;
            modified = true;
          }
          if (!q.correct_concept || q.correct_concept.trim().length < 5) {
            const rightOpt = q.options.find((o) => o.is_correct);
            q.correct_concept = rightOpt
              ? `Estándar técnico verificado: ${rightOpt.text}`
              : `Cumplimiento de las especificaciones de ${mod.title}.`;
            modified = true;
          }
          if (!q.recommendation || q.recommendation.trim().length < 5) {
            q.recommendation = `Repasa las diapositivas y las 4 Fichas de Estudio Ampliadas de ${mod.title}.`;
            modified = true;
          }
          if (!q.related_content_id && q.related_item_id) {
            q.related_content_id = q.related_item_id;
            modified = true;
          }
          q.options.forEach((opt) => {
            if (!opt.rationale) {
              opt.rationale = opt.is_correct
                ? `CORRECTA: Cumple con la especificación técnica establecida en ${mod.title}.`
                : 'INCORRECTA: No corresponde al parámetro o procedimiento indicado en el material de referencia.';
              modified = true;
            }
          });
        }
      });

      // Ensure MINIMUM 5 evaluative questions per module (Requirement 11)
      const existingQuestions = (mod.items || []).filter((it) => Boolean(it.question));
      if (existingQuestions.length < 5) {
        const firstSlideId =
          mod.items.find((it) => !it.question)?.id || crypto.randomUUID();
        const generatedItems = buildModuleQuestionsAndCaseFromPages(
          modNumber,
          mod.title,
          syntheticPages.length > 0
            ? syntheticPages
            : [
                {
                  page_number: 1,
                  title: mod.title,
                  bullets: [mod.description || mod.title],
                  raw_text: mod.description || mod.title,
                  image_data_url: course.cover_image_url,
                },
              ],
          firstSlideId,
          defaultComp,
          course.cover_image_url
        );

        const neededCount = 6 - existingQuestions.length;
        const toAdd = generatedItems.slice(0, neededCount);
        for (const newItem of toAdd) {
          newItem.course_id = course.id;
          newItem.module_id = mod.id;
          if (newItem.question) {
            newItem.question.course_id = course.id;
            newItem.question.module_id = mod.id;
          }
          mod.items.push(newItem);
        }
        mod.items.forEach((it, idx) => {
          it.order_index = idx + 1;
        });
        modified = true;
      }
    });

    if (courseClassifiedImages.length > 0) {
      if (
        !course.ai_analysis_summary?.classified_images ||
        course.ai_analysis_summary.classified_images.length === 0
      ) {
        course.ai_analysis_summary = {
          ...(course.ai_analysis_summary || {
            document_summary: course.description,
            extracted_topics: course.modules.map((m) => m.title),
            key_facts_and_norms: [],
            total_theory_slides: globalPageCounter - 1,
            total_evaluative_questions: course.modules.length * 5,
            total_practical_cases: course.modules.length,
            generated_at: new Date().toISOString(),
            source_files: [primaryMaterialFile],
          }),
          classified_images: courseClassifiedImages,
        };
        modified = true;
      }
      if (course.materials && course.materials[0]) {
        if (
          !course.materials[0].classified_images ||
          course.materials[0].classified_images.length === 0
        ) {
          course.materials[0].classified_images = courseClassifiedImages;
          course.materials[0].extracted_images = courseClassifiedImages;
          modified = true;
        }
      }
    }
  }

  return modified;
}
