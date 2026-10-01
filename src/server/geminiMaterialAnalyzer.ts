import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { GoogleGenAI, Type, GenerateContentResponse } from '@google/genai';
import {
  DifficultyLevel,
  ExtractedMaterialPage,
  GeminiAnalyzedDefinition,
  GeminiAnalyzedProcedure,
  GeminiProvenanceOrigin,
  GeminiStructuredMaterialAnalysis,
  GeminiSuggestedActivity,
  GeminiSuggestedEvaluation,
  GeminiTraceableItem,
} from '../types/lms.ts';
import {
  extractStructuredPagesFromPdfBuffer,
  isCleanHumanReadableLine,
  parseDataUrlToBuffer,
} from './materialExtractor.ts';

export type GeminiAnalysisErrorCode =
  | 'TIMEOUT'
  | 'API_ERROR'
  | 'INVALID_FILE'
  | 'INVALID_JSON'
  | 'EMPTY_CONTENT';

export class GeminiMaterialAnalysisError extends Error {
  public readonly code: GeminiAnalysisErrorCode;
  public readonly statusCode: number;

  constructor(
    code: GeminiAnalysisErrorCode,
    message: string,
    statusCode = 400
  ) {
    super(message);
    this.name = 'GeminiMaterialAnalysisError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

const TRACEABLE_ITEM_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: {
      type: Type.STRING,
      description: 'Título o nombre corto del elemento identificado.',
    },
    description: {
      type: Type.STRING,
      description: 'Descripción detallada del elemento.',
    },
    origin: {
      type: Type.STRING,
      description:
        'Debe ser exactamente "DOCUMENTO" si proviene explícitamente del archivo, o "GENERADO_IA" si fue inferido o propuesto por Gemini.',
    },
    page: {
      type: Type.INTEGER,
      description: 'Número de página o diapositiva de origen en el documento (si aplica).',
    },
    section: {
      type: Type.STRING,
      description: 'Nombre de la sección o título de la diapositiva de origen.',
    },
    sourceExcerpt: {
      type: Type.STRING,
      description: 'Fragmento textual literal del documento que respalda este punto.',
    },
  },
  required: ['title', 'description', 'origin'],
};

const GEMINI_MATERIAL_ANALYSIS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    documentTitle: {
      type: Type.STRING,
      description: 'Título sugerido para la capacitación basado en el documento.',
    },
    summary: {
      type: Type.STRING,
      description: 'Resumen ejecutivo y pedagógico completo del material analizado.',
    },
    difficulty: {
      type: Type.STRING,
      description: 'Nivel de dificultad: "Básico", "Intermedio" o "Avanzado".',
    },
    topics: {
      type: Type.ARRAY,
      description: 'Temas principales identificados en el documento.',
      items: TRACEABLE_ITEM_SCHEMA,
    },
    subtopics: {
      type: Type.ARRAY,
      description: 'Subtemas específicos desglosados del documento.',
      items: TRACEABLE_ITEM_SCHEMA,
    },
    keyConcepts: {
      type: Type.ARRAY,
      description: 'Conceptos clave técnicos o normativos presentes en el material.',
      items: TRACEABLE_ITEM_SCHEMA,
    },
    definitions: {
      type: Type.ARRAY,
      description: 'Definiciones formales de términos, siglas, códigos o equipos.',
      items: {
        type: Type.OBJECT,
        properties: {
          term: {
            type: Type.STRING,
            description: 'Término, sigla, componente o código.',
          },
          definition: {
            type: Type.STRING,
            description: 'Definición precisa según el documento.',
          },
          origin: {
            type: Type.STRING,
            description: '"DOCUMENTO" o "GENERADO_IA".',
          },
          page: {
            type: Type.INTEGER,
            description: 'Página de origen.',
          },
          section: {
            type: Type.STRING,
            description: 'Sección de origen.',
          },
          sourceExcerpt: {
            type: Type.STRING,
            description: 'Fragmento literal del documento.',
          },
        },
        required: ['term', 'definition', 'origin'],
      },
    },
    procedures: {
      type: Type.ARRAY,
      description: 'Procedimientos operativos o técnicos con sus pasos secuenciales.',
      items: {
        type: Type.OBJECT,
        properties: {
          title: {
            type: Type.STRING,
            description: 'Nombre del procedimiento.',
          },
          description: {
            type: Type.STRING,
            description: 'Propósito o alcance del procedimiento.',
          },
          steps: {
            type: Type.ARRAY,
            description: 'Pasos ordenados para ejecutar el procedimiento.',
            items: { type: Type.STRING },
          },
          origin: {
            type: Type.STRING,
            description: '"DOCUMENTO" o "GENERADO_IA".',
          },
          page: {
            type: Type.INTEGER,
            description: 'Página donde se describe el procedimiento.',
          },
          section: {
            type: Type.STRING,
            description: 'Sección del documento.',
          },
          sourceExcerpt: {
            type: Type.STRING,
            description: 'Fragmento de origen en el documento.',
          },
        },
        required: ['title', 'description', 'steps', 'origin'],
      },
    },
    steps: {
      type: Type.ARRAY,
      description: 'Lista consolidada de pasos técnicos clave identificados en el documento.',
      items: { type: Type.STRING },
    },
    examples: {
      type: Type.ARRAY,
      description: 'Ejemplos, casos prácticos o configuraciones reales mencionadas o propuestas.',
      items: TRACEABLE_ITEM_SCHEMA,
    },
    bestPractices: {
      type: Type.ARRAY,
      description: 'Buenas prácticas y recomendaciones operativas.',
      items: TRACEABLE_ITEM_SCHEMA,
    },
    commonMistakes: {
      type: Type.ARRAY,
      description: 'Errores frecuentes, prohibiciones o advertencias críticas a evitar.',
      items: TRACEABLE_ITEM_SCHEMA,
    },
    learningObjectives: {
      type: Type.ARRAY,
      description: 'Objetivos de aprendizaje medibles para los participantes.',
      items: TRACEABLE_ITEM_SCHEMA,
    },
    suggestedActivities: {
      type: Type.ARRAY,
      description: 'Posibles actividades formativas e interactivas sugeridas para el curso.',
      items: {
        type: Type.OBJECT,
        properties: {
          title: {
            type: Type.STRING,
            description: 'Título de la actividad.',
          },
          type: {
            type: Type.STRING,
            description: 'Tipo de actividad (Práctica guiada, Simulación de caso, Clasificación, Checklist, etc.).',
          },
          description: {
            type: Type.STRING,
            description: 'Dinámica detallada de la actividad.',
          },
          origin: {
            type: Type.STRING,
            description: '"DOCUMENTO" si está en el archivo o "GENERADO_IA" si es propuesta por Gemini.',
          },
          relatedTopic: {
            type: Type.STRING,
            description: 'Tema del documento que refuerza esta actividad.',
          },
          page: {
            type: Type.INTEGER,
            description: 'Página de referencia en el documento.',
          },
          section: {
            type: Type.STRING,
            description: 'Sección de referencia.',
          },
          sourceExcerpt: {
            type: Type.STRING,
            description: 'Fragmento del documento en el que se basa la actividad.',
          },
        },
        required: ['title', 'type', 'description', 'origin'],
      },
    },
    suggestedEvaluations: {
      type: Type.ARRAY,
      description: 'Posibles preguntas o evaluaciones para medir el dominio del material.',
      items: {
        type: Type.OBJECT,
        properties: {
          questionPrompt: {
            type: Type.STRING,
            description: 'Enunciado de la pregunta o reto evaluativo.',
          },
          evaluationType: {
            type: Type.STRING,
            description: 'Tipo de evaluación (Selección única, Selección múltiple, Caso práctico, Ordenar pasos, Verdadero/Falso).',
          },
          expectedAnswerSummary: {
            type: Type.STRING,
            description: 'Respuesta correcta esperada y justificación técnica.',
          },
          origin: {
            type: Type.STRING,
            description: '"DOCUMENTO" si la pregunta viene en el documento o "GENERADO_IA" si fue creada por Gemini basándose en el material.',
          },
          page: {
            type: Type.INTEGER,
            description: 'Página del documento donde se fundamenta la respuesta.',
          },
          section: {
            type: Type.STRING,
            description: 'Sección del documento.',
          },
          sourceExcerpt: {
            type: Type.STRING,
            description: 'Fragmento literal del documento que respalda la respuesta correcta.',
          },
        },
        required: ['questionPrompt', 'evaluationType', 'expectedAnswerSummary', 'origin'],
      },
    },
  },
  required: [
    'documentTitle',
    'summary',
    'difficulty',
    'topics',
    'subtopics',
    'keyConcepts',
    'definitions',
    'procedures',
    'steps',
    'examples',
    'bestPractices',
    'commonMistakes',
    'learningObjectives',
    'suggestedActivities',
    'suggestedEvaluations',
  ],
};

function normalizeOrigin(val: unknown, defaultOrigin: GeminiProvenanceOrigin = 'DOCUMENTO'): GeminiProvenanceOrigin {
  const str = String(val || '').toUpperCase().trim();
  if (str.includes('IA') || str.includes('GEMINI') || str.includes('GENERAD') || str.includes('SUGERID')) {
    return 'GENERADO_IA';
  }
  if (str.includes('DOC') || str.includes('ARCHIVO') || str.includes('ORIGINAL')) {
    return 'DOCUMENTO';
  }
  return defaultOrigin;
}

function normalizeDifficulty(val: unknown): DifficultyLevel {
  const str = String(val || '').toLowerCase().trim();
  if (str.includes('avanz')) return 'Avanzado';
  if (str.includes('inter')) return 'Intermedio';
  return 'Básico';
}

function normalizeTraceableList(
  rawList: unknown,
  defaultOrigin: GeminiProvenanceOrigin = 'DOCUMENTO'
): GeminiTraceableItem[] {
  if (!Array.isArray(rawList)) return [];
  const result: GeminiTraceableItem[] = [];

  for (const item of rawList) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const title = String(obj.title || obj.name || '').trim();
    const description = String(obj.description || obj.detail || obj.summary || title).trim();
    if (!title && !description) continue;

    result.push({
      id: crypto.randomUUID(),
      title: title || description.slice(0, 70),
      description: description || title,
      origin: normalizeOrigin(obj.origin, defaultOrigin),
      page:
        typeof obj.page === 'number' && Number.isFinite(obj.page) && obj.page > 0
          ? Math.round(obj.page)
          : undefined,
      section: typeof obj.section === 'string' && obj.section.trim() ? obj.section.trim() : undefined,
      sourceExcerpt:
        typeof obj.sourceExcerpt === 'string' && obj.sourceExcerpt.trim()
          ? obj.sourceExcerpt.trim()
          : undefined,
    });
  }
  return result;
}

/**
 * Validates and normalizes the raw JSON string returned by Gemini into a strict
 * GeminiStructuredMaterialAnalysis object. Throws INVALID_JSON if malformed or incomplete.
 */
export function validateAndNormalizeGeminiAnalysis(
  rawJsonText: string,
  fileName: string,
  modelUsed: string
): GeminiStructuredMaterialAnalysis {
  if (!rawJsonText || typeof rawJsonText !== 'string' || !rawJsonText.trim()) {
    throw new GeminiMaterialAnalysisError(
      'INVALID_JSON',
      'Gemini devolvió una respuesta vacía al analizar el material.',
      502
    );
  }

  // Strip accidental markdown code fences if present
  const cleanedJson = rawJsonText
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  let parsed: any;
  try {
    parsed = JSON.parse(cleanedJson);
  } catch {
    throw new GeminiMaterialAnalysisError(
      'INVALID_JSON',
      'La respuesta devuelta por Gemini no es un JSON válido. Por favor pulsa "Volver a analizar".',
      502
    );
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new GeminiMaterialAnalysisError(
      'INVALID_JSON',
      'La estructura JSON devuelta por Gemini no corresponde al esquema esperado.',
      502
    );
  }

  const documentTitle = String(parsed.documentTitle || '').trim();
  const summary = String(parsed.summary || '').trim();

  if (!documentTitle || !summary || summary.length < 15) {
    throw new GeminiMaterialAnalysisError(
      'INVALID_JSON',
      'El análisis devuelto por Gemini está incompleto (faltan el título sugerido o el resumen).',
      502
    );
  }

  const topics = normalizeTraceableList(parsed.topics, 'DOCUMENTO');
  const subtopics = normalizeTraceableList(parsed.subtopics, 'DOCUMENTO');
  const keyConcepts = normalizeTraceableList(parsed.keyConcepts, 'DOCUMENTO');

  const definitions: GeminiAnalyzedDefinition[] = Array.isArray(parsed.definitions)
    ? parsed.definitions
        .filter((d: any) => d && typeof d === 'object' && (d.term || d.definition))
        .map((d: any) => ({
          id: crypto.randomUUID(),
          term: String(d.term || 'Término técnico').trim(),
          definition: String(d.definition || '').trim(),
          origin: normalizeOrigin(d.origin, 'DOCUMENTO'),
          page:
            typeof d.page === 'number' && Number.isFinite(d.page) && d.page > 0
              ? Math.round(d.page)
              : undefined,
          section: typeof d.section === 'string' && d.section.trim() ? d.section.trim() : undefined,
          sourceExcerpt:
            typeof d.sourceExcerpt === 'string' && d.sourceExcerpt.trim()
              ? d.sourceExcerpt.trim()
              : undefined,
        }))
    : [];

  const procedures: GeminiAnalyzedProcedure[] = Array.isArray(parsed.procedures)
    ? parsed.procedures
        .filter((p: any) => p && typeof p === 'object' && (p.title || p.description))
        .map((p: any) => ({
          id: crypto.randomUUID(),
          title: String(p.title || 'Procedimiento técnico').trim(),
          description: String(p.description || '').trim(),
          steps: Array.isArray(p.steps)
            ? p.steps.map((s: any) => String(s || '').trim()).filter(Boolean)
            : [],
          origin: normalizeOrigin(p.origin, 'DOCUMENTO'),
          page:
            typeof p.page === 'number' && Number.isFinite(p.page) && p.page > 0
              ? Math.round(p.page)
              : undefined,
          section: typeof p.section === 'string' && p.section.trim() ? p.section.trim() : undefined,
          sourceExcerpt:
            typeof p.sourceExcerpt === 'string' && p.sourceExcerpt.trim()
              ? p.sourceExcerpt.trim()
              : undefined,
        }))
    : [];

  const rawSteps = Array.isArray(parsed.steps)
    ? parsed.steps.map((s: any) => String(s || '').trim()).filter(Boolean)
    : [];
  const consolidatedSteps =
    rawSteps.length > 0
      ? rawSteps
      : procedures.flatMap((p) => p.steps).slice(0, 15);

  const examples = normalizeTraceableList(parsed.examples, 'DOCUMENTO');
  const bestPractices = normalizeTraceableList(parsed.bestPractices, 'DOCUMENTO');
  const commonMistakes = normalizeTraceableList(parsed.commonMistakes, 'DOCUMENTO');
  const learningObjectives = normalizeTraceableList(parsed.learningObjectives, 'GENERADO_IA');

  const suggestedActivities: GeminiSuggestedActivity[] = Array.isArray(parsed.suggestedActivities)
    ? parsed.suggestedActivities
        .filter((a: any) => a && typeof a === 'object' && (a.title || a.description))
        .map((a: any) => ({
          id: crypto.randomUUID(),
          title: String(a.title || 'Actividad formativa').trim(),
          type: String(a.type || 'Actividad Interactiva').trim(),
          description: String(a.description || '').trim(),
          origin: normalizeOrigin(a.origin, 'GENERADO_IA'),
          relatedTopic:
            typeof a.relatedTopic === 'string' && a.relatedTopic.trim()
              ? a.relatedTopic.trim()
              : undefined,
          page:
            typeof a.page === 'number' && Number.isFinite(a.page) && a.page > 0
              ? Math.round(a.page)
              : undefined,
          section: typeof a.section === 'string' && a.section.trim() ? a.section.trim() : undefined,
          sourceExcerpt:
            typeof a.sourceExcerpt === 'string' && a.sourceExcerpt.trim()
              ? a.sourceExcerpt.trim()
              : undefined,
        }))
    : [];

  const suggestedEvaluations: GeminiSuggestedEvaluation[] = Array.isArray(
    parsed.suggestedEvaluations
  )
    ? parsed.suggestedEvaluations
        .filter((e: any) => e && typeof e === 'object' && e.questionPrompt)
        .map((e: any) => ({
          id: crypto.randomUUID(),
          questionPrompt: String(e.questionPrompt || '').trim(),
          evaluationType: String(e.evaluationType || 'Selección única').trim(),
          expectedAnswerSummary: String(e.expectedAnswerSummary || '').trim(),
          origin: normalizeOrigin(e.origin, 'GENERADO_IA'),
          page:
            typeof e.page === 'number' && Number.isFinite(e.page) && e.page > 0
              ? Math.round(e.page)
              : undefined,
          section: typeof e.section === 'string' && e.section.trim() ? e.section.trim() : undefined,
          sourceExcerpt:
            typeof e.sourceExcerpt === 'string' && e.sourceExcerpt.trim()
              ? e.sourceExcerpt.trim()
              : undefined,
        }))
    : [];

  if (topics.length === 0 && keyConcepts.length === 0) {
    throw new GeminiMaterialAnalysisError(
      'INVALID_JSON',
      'Gemini no devolvió temas ni conceptos clave válidos para el documento.',
      502
    );
  }

  return {
    documentTitle,
    summary,
    topics,
    subtopics,
    keyConcepts,
    definitions,
    procedures,
    steps: consolidatedSteps,
    examples,
    bestPractices,
    commonMistakes,
    learningObjectives,
    difficulty: normalizeDifficulty(parsed.difficulty),
    suggestedActivities,
    suggestedEvaluations,
    sourceFileName: fileName,
    modelUsed,
    analyzedAt: new Date().toISOString(),
    approvedByTrainer: false,
  };
}

export interface AnalyzeMaterialWithGeminiInput {
  fileName: string;
  mimeType?: string;
  mediaDataUrl?: string;
  storagePath?: string;
  extractedText?: string;
  extractedPages?: ExtractedMaterialPage[];
  courseTitle?: string;
  courseCategory?: string;
  timeoutMs?: number;
}

export async function analyzeMaterialWithGemini(
  input: AnalyzeMaterialWithGeminiInput
): Promise<GeminiStructuredMaterialAnalysis> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new GeminiMaterialAnalysisError(
      'API_ERROR',
      'La clave GEMINI_API_KEY no está configurada en el entorno del servidor.',
      500
    );
  }

  const fileName = String(input.fileName || '').trim();
  if (!fileName) {
    throw new GeminiMaterialAnalysisError(
      'INVALID_FILE',
      'El archivo indicado es inválido o no tiene nombre de documento.',
      400
    );
  }

  // Try to obtain binary buffer either from mediaDataUrl or from saved disk storagePath
  let fileBuffer: Buffer | null = null;
  let detectedMimeType = (input.mimeType || '').trim();

  const parsedData = parseDataUrlToBuffer(input.mediaDataUrl);
  if (parsedData && parsedData.buffer.length > 0) {
    fileBuffer = parsedData.buffer;
    if (!detectedMimeType || detectedMimeType === 'application/octet-stream') {
      detectedMimeType = parsedData.mimeType;
    }
  } else if (input.storagePath) {
    try {
      const candidatePath = path.isAbsolute(input.storagePath)
        ? input.storagePath
        : path.join(process.cwd(), input.storagePath);
      if (fs.existsSync(candidatePath)) {
        fileBuffer = fs.readFileSync(candidatePath);
      }
    } catch {
      // ignore disk read error if extracted text is available
    }
  }

  const isPdf =
    /\.pdf$/i.test(fileName) || detectedMimeType.toLowerCase().includes('pdf');

  // Validate PDF header if buffer is provided for a PDF file
  if (isPdf && fileBuffer && fileBuffer.length > 0) {
    const header = fileBuffer.subarray(0, 8).toString('latin1');
    if (!header.includes('%PDF')) {
      throw new GeminiMaterialAnalysisError(
        'INVALID_FILE',
        `El archivo "${fileName}" no tiene una estructura PDF válida o está corrupto.`,
        400
      );
    }
  }

  // Build structured page text if not already provided
  let pages: ExtractedMaterialPage[] = Array.isArray(input.extractedPages)
    ? input.extractedPages
    : [];
  let textContent = String(input.extractedText || '').trim();

  if (isPdf && fileBuffer && pages.length === 0) {
    try {
      const extracted = extractStructuredPagesFromPdfBuffer(fileBuffer);
      pages = extracted.pages;
      if (!textContent) {
        textContent = extracted.text;
      }
    } catch {
      // fallback to direct PDF multimodal part
    }
  }

  const formattedPagesContext =
    pages.length > 0
      ? pages
          .map(
            (p) =>
              `[PÁGINA ${p.page_number} | SECCIÓN: ${p.title}]\n` +
              (p.bullets || []).map((b) => `- ${b}`).join('\n')
          )
          .join('\n\n')
      : textContent;

  const cleanCharCount = (formattedPagesContext || '')
    .replace(/\s+/g, ' ')
    .trim().length;

  // Check for absence of content (neither readable text nor binary PDF/image)
  if (
    cleanCharCount < 20 &&
    (!fileBuffer || fileBuffer.length < 100)
  ) {
    throw new GeminiMaterialAnalysisError(
      'EMPTY_CONTENT',
      `El documento "${fileName}" no contiene texto legible ni contenido analizable.`,
      400
    );
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const parts: any[] = [];

  // Send the actual PDF or Image binary to Gemini if within inline size limit (< 18 MB)
  if (fileBuffer && fileBuffer.length > 100 && fileBuffer.length < 18 * 1024 * 1024) {
    const mime = isPdf
      ? 'application/pdf'
      : detectedMimeType.startsWith('image/')
      ? detectedMimeType
      : undefined;
    if (mime) {
      parts.push({
        inlineData: {
          mimeType: mime,
          data: fileBuffer.toString('base64'),
        },
      });
    }
  }

  const promptText = `Analiza exhaustivamente el documento adjunto "${fileName}"${
    input.courseTitle ? ` para la capacitación "${input.courseTitle}"` : ''
  }${input.courseCategory ? ` (Categoría: ${input.courseCategory})` : ''}.

REGLA FUNDAMENTAL DE TRAZABILIDAD Y VERACIDAD:
1. Debes distinguir estrictamente la información encontrada explícitamente en el documento ("origin": "DOCUMENTO") de la información o propuestas pedagógicas sugeridas por ti ("origin": "GENERADO_IA").
2. NUNCA inventes datos técnicos, normas, medidas ni códigos como si procedieran del documento.
3. Para cada tema, subtema, concepto clave, definición, procedimiento, ejemplo, buena práctica o error frecuente extraído del documento:
   - Marca "origin": "DOCUMENTO".
   - Conserva el número de página ("page"), el título de la sección/diapositiva ("section") y un fragmento textual literal de origen ("sourceExcerpt").
4. Para objetivos de aprendizaje, actividades sugeridas o evaluaciones sugeridas que tú propongas pedagógicamente a partir del contenido del documento:
   - Marca "origin": "GENERADO_IA" (a menos que la actividad o pregunta ya exista literalmente en el documento, en cuyo caso usa "DOCUMENTO").
   - Indica en "page", "section" y "sourceExcerpt" qué parte del documento fundamenta esa propuesta.

TRANSCRIPCIÓN ESTRUCTURADA POR PÁGINA Y SECCIÓN DEL DOCUMENTO PARA TRAZABILIDAD EXACTA:
${formattedPagesContext.slice(0, 65000)}`;

  parts.push({ text: promptText });

  const timeoutMs = input.timeoutMs || 55000;
  const modelName = 'gemini-3.8-flash';

  const executeCall = async (modelToUse: string): Promise<GenerateContentResponse> => {
    let timeoutHandle: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(
          new GeminiMaterialAnalysisError(
            'TIMEOUT',
            `La solicitud a Gemini superó el tiempo máximo de espera (${Math.round(
              timeoutMs / 1000
            )}s). Por favor intenta "Volver a analizar".`,
            504
          )
        );
      }, timeoutMs);
    });

    try {
      const response = await Promise.race([
        ai.models.generateContent({
          model: modelToUse,
          contents: { parts },
          config: {
            systemInstruction:
              'Eres un ingeniero pedagogo e instructor técnico experto en diseño instruccional corporativo. Analizas documentos técnicos (PDFs, manuales, presentaciones) y devuelves exclusivamente un JSON estructurado conforme al esquema solicitado, distinguiendo con total rigor qué información proviene literalmente del documento ("DOCUMENTO", con página, sección y fragmento textual) y qué elementos son propuestas pedagógicas generadas por IA ("GENERADO_IA").',
            temperature: 0.2,
            responseMimeType: 'application/json',
            responseSchema: GEMINI_MATERIAL_ANALYSIS_SCHEMA,
          },
        }),
        timeoutPromise,
      ]);
      return response;
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
    }
  };

  let response: GenerateContentResponse;
  let finalModelUsed = modelName;

  try {
    response = await executeCall(modelName);
  } catch (err: any) {
    if (err instanceof GeminiMaterialAnalysisError) {
      throw err;
    }
    // Fallback to gemini-flash-latest if the primary alias is unavailable in the region
    try {
      finalModelUsed = 'gemini-flash-latest';
      response = await executeCall(finalModelUsed);
    } catch (fallbackErr: any) {
      if (fallbackErr instanceof GeminiMaterialAnalysisError) {
        throw fallbackErr;
      }
      throw new GeminiMaterialAnalysisError(
        'API_ERROR',
        `Error al comunicarse con la API de Gemini: ${
          fallbackErr?.message || err?.message || 'Error desconocido del servicio IA.'
        }`,
        502
      );
    }
  }

  const rawText = response.text || '';
  return validateAndNormalizeGeminiAnalysis(rawText, fileName, finalModelUsed);
}
