import React, { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  CheckCircle2,
  Copy,
  Eye,
  FileText,
  Image as ImageIcon,
  Music,
  Video,
  FileSpreadsheet,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  Share2,
  RefreshCw,
} from 'lucide-react';
import {
  CatalogItem,
  Competency,
  ContentItem,
  ContentType,
  Course,
  CourseModule,
  DifficultyLevel,
  GeminiProvenanceOrigin,
  GeminiStructuredMaterialAnalysis,
  QuestionOption,
  QuestionType,
  ReferenceMaterialFormat,
  RetryPolicy,
  TrainingMaterial,
} from '../../types/lms.ts';
import { CourseQrCodeSvg, ResilientImage } from '../common/ResilientImage.tsx';
import {
  IMG_CONNECTOR,
  IMG_FTTH,
  IMG_R1,
  IMG_SAFETY,
} from '../../server/seedCourses.ts';
import { syncCourseSummaryToFirestore } from '../../firebase.ts';

interface CourseBuilderWizardProps {
  initialCourse?: Course | null;
  competencies: Competency[];
  catalogs: CatalogItem[];
  adminToken: string;
  onSaveCourse: (saved: Course) => void;
  onPreviewCourse: (slug: string) => void;
  onCancel: () => void;
}

const PRESET_COVERS = [
  { label: 'Certificación FTTH y OPM', url: IMG_FTTH },
  { label: 'Normalización Red Exterior R1', url: IMG_R1 },
  { label: 'Seguridad en Campo y Alturas', url: IMG_SAFETY },
  { label: 'Inspección de Conectores SC/APC', url: IMG_CONNECTOR },
];

const SCALABLE_TOPIC_SUGGESTIONS = [
  'Normalización de Red',
  'FTTH',
  'Instalación',
  'Diagnóstico',
  'Seguridad',
  'Trabajo en alturas',
  'Uso de herramientas',
  'Apertura de cámaras',
  'Mediciones',
  'Procedimientos',
];

function detectMaterialFormat(file: File): ReferenceMaterialFormat {
  const name = file.name.toLowerCase();
  const mime = (file.type || '').toLowerCase();
  if (
    mime.startsWith('image/') ||
    /\.(jpg|jpeg|png|webp|gif|svg|bmp|tiff)$/.test(name)
  ) {
    return 'image';
  }
  if (
    mime.startsWith('audio/') ||
    /\.(mp3|wav|ogg|m4a|aac|flac|opus)$/.test(name)
  ) {
    return 'audio';
  }
  if (
    mime.startsWith('video/') ||
    /\.(mp4|webm|mov|avi|mkv|m4v)$/.test(name)
  ) {
    return 'video';
  }
  if (mime.includes('pdf') || name.endsWith('.pdf')) {
    return 'pdf';
  }
  if (
    mime.includes('spreadsheet') ||
    mime.includes('excel') ||
    mime.includes('csv') ||
    /\.(xlsx|xls|csv|ods|tsv)$/.test(name)
  ) {
    return 'spreadsheet';
  }
  if (
    mime.includes('presentation') ||
    mime.includes('powerpoint') ||
    /\.(ppt|pptx|odp|key)$/.test(name)
  ) {
    return 'presentation';
  }
  if (
    /\.(txt|md|markdown|json|xml|html|htm|yaml|yml|log|sql)$/.test(name) ||
    mime.startsWith('text/')
  ) {
    return 'text';
  }
  return 'document';
}

export const CourseBuilderWizard: React.FC<CourseBuilderWizardProps> = ({
  initialCourse,
  competencies,
  catalogs,
  adminToken,
  onSaveCourse,
  onPreviewCourse,
  onCancel,
}) => {
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [saving, setSaving] = useState(false);
  const [extractingFiles, setExtractingFiles] = useState(false);
  const [generatingAi, setGeneratingAi] = useState(false);
  const [aiPipelineStage, setAiPipelineStage] = useState<number>(0);
  const [autoGenerateOnUpload, setAutoGenerateOnUpload] = useState(false);
  const [expandedMaterialId, setExpandedMaterialId] = useState<string | null>(null);
  const [step3Filter, setStep3Filter] = useState<
    'all' | 'formative' | 'questions' | 'cases' | 'study_cards'
  >('all');
  const [aiStatusMsg, setAiStatusMsg] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(Boolean(initialCourse));

  // Smart Material Image Gallery state ("Seleccionar del material")
  const [showMaterialImagePicker, setShowMaterialImagePicker] = useState(false);
  const [galleryFileFilter, setGalleryFileFilter] = useState<string>('ALL');
  const [galleryCategoryFilter, setGalleryCategoryFilter] = useState<string>('ALL');
  const [gallerySearchQuery, setGallerySearchQuery] = useState<string>('');
  const [selectedGalleryImageUrl, setSelectedGalleryImageUrl] = useState<string | null>(null);
  const [showDiscardedInGallery, setShowDiscardedInGallery] = useState(false);

  // Real Gemini Structured Material Analysis state ("Análisis del material")
  const [analyzingWithGemini, setAnalyzingWithGemini] = useState(false);
  const [geminiAnalysisError, setGeminiAnalysisError] = useState<{
    message: string;
    code?: string;
  } | null>(null);
  const [geminiAnalysis, setGeminiAnalysis] =
    useState<GeminiStructuredMaterialAnalysis | null>(() => {
      if (initialCourse?.gemini_analysis) return initialCourse.gemini_analysis;
      const matWithGemini = initialCourse?.materials?.find((m) => m.gemini_analysis);
      return matWithGemini?.gemini_analysis || null;
    });
  const [isEditingGeminiAnalysis, setIsEditingGeminiAnalysis] = useState(false);
  const [geminiOriginFilter, setGeminiOriginFilter] = useState<
    'ALL' | GeminiProvenanceOrigin
  >('ALL');
  const [showGeminiAnalysisScreen, setShowGeminiAnalysisScreen] = useState<boolean>(
    Boolean(
      initialCourse?.gemini_analysis ||
        initialCourse?.materials?.some((m) => m.gemini_analysis)
    )
  );

  const [course, setCourse] = useState<Course>(() => {
    if (initialCourse) return structuredClone(initialCourse);
    const id = crypto.randomUUID();
    const modId = crypto.randomUUID();
    const now = new Date().toISOString();
    return {
      id,
      slug: '',
      title: '',
      description: '',
      category:
        catalogs.find((c) => c.type === 'category' && c.active)?.name ||
        'FTTH',
      estimated_minutes: 25,
      level: 'Básico',
      cover_image_url: IMG_FTTH,
      passing_score: 80,
      retry_policy: 'continue',
      status: 'draft',
      modules: [
        {
          id: modId,
          course_id: id,
          title: 'Módulo 1: Fundamentos y Procedimiento Operativo',
          description: 'Conceptos esenciales, estándares y verificación en campo.',
          order_index: 1,
          created_at: now,
          updated_at: now,
          items: [],
          study_cards: [],
        },
      ],
      materials: [],
      created_at: now,
      updated_at: now,
    };
  });

  // Step 2: Manual / Additional Reference Material state
  const [matTitle, setMatTitle] = useState('');
  const [matType, setMatType] = useState<ReferenceMaterialFormat>('pdf');
  const [matText, setMatText] = useState('');

  // Step 3: Active module & item editor
  const [activeModIdx, setActiveModIdx] = useState(0);
  const [editingItemIdx, setEditingItemIdx] = useState<number | null>(null);

  const handleTitleChange = (val: string) => {
    const autoSlug = val
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    setCourse((prev) => ({
      ...prev,
      title: val,
      slug: slugManuallyEdited ? prev.slug : autoSlug,
    }));
  };

  // Universal Multi-Format File Uploader & Content Analyzer (PDF, Word, Excel, PowerPoint, Text, CSV, JSON, HTML, Images, Audio, Video)
  const handleFilesSelected = async (
    fileList: FileList | File[],
    forceGenerateNow?: boolean
  ) => {
    const filesArray = Array.from(fileList);
    if (filesArray.length === 0) return;

    setExtractingFiles(true);
    setSaveError(null);
    setAiStatusMsg(
      `Conservando archivos originales y extrayendo información de ${filesArray.length} archivo(s) cargado(s)...`
    );

    // 1. Add immediate PENDIENTE / PROCESANDO records so admin sees real-time status per file
    const pendingEntries: TrainingMaterial[] = filesArray.map((file) => {
      const detectedFormat = detectMaterialFormat(file);
      const sizeKb = Math.max(1, Math.round(file.size / 1024));
      const cleanBaseTitle = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
      return {
        id: crypto.randomUUID(),
        course_id: course.id,
        title: cleanBaseTitle || file.name,
        file_type: detectedFormat,
        file_name: file.name,
        file_size_kb: sizeKb,
        mime_type: file.type || undefined,
        storage_path: `uploads/materials/${course.id}/${file.name}`,
        extracted_text: 'Procesando contenido del archivo...',
        processing_status: 'PROCESANDO',
        uploaded_by_admin: 'Administrador U Claro Tecnología',
        uploaded_at: new Date().toISOString(),
      };
    });

    setCourse((prev) => ({
      ...prev,
      materials: [...prev.materials, ...pendingEntries],
    }));

    const processedMaterials: TrainingMaterial[] = [];

    for (let i = 0; i < filesArray.length; i++) {
      const file = filesArray[i];
      const pendingMat = pendingEntries[i];
      const detectedFormat = pendingMat.file_type;

      // Read Data URL (for binary parsing & permanent storage of PDF, DOCX, PPTX, XLSX, Images, Audio, Video)
      const mediaDataUrl = await new Promise<string | undefined>((resolve) => {
        if (file.size > 38 * 1024 * 1024) {
          resolve(undefined);
          return;
        }
        const reader = new FileReader();
        reader.onload = () =>
          resolve(typeof reader.result === 'string' ? reader.result : undefined);
        reader.onerror = () => resolve(undefined);
        reader.readAsDataURL(file);
      });

      // Also read raw text if text/csv/md/json/xml/html
      let clientRawText = '';
      if (
        detectedFormat === 'text' ||
        /\.(txt|md|markdown|csv|tsv|json|xml|html|htm|rtf|log|sql)$/i.test(file.name)
      ) {
        clientRawText = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () =>
            resolve(typeof reader.result === 'string' ? reader.result : '');
          reader.onerror = () => resolve('');
          reader.readAsText(file);
        });
      }

      // Call server-side Universal Material Extractor (/api/admin/ai/extract-material)
      let extractedText = clientRawText;
      let extractedPages = undefined;
      let analysisSummary = undefined;
      let classifiedImages = undefined;
      let storagePath = pendingMat.storage_path;
      let persistentFileUrl = undefined;
      let resolvedFormat: ReferenceMaterialFormat = detectedFormat;
      let status: 'PROCESADO' | 'ERROR' = 'PROCESADO';
      let errorMsg: string | undefined = undefined;

      try {
        const res = await fetch('/api/admin/ai/extract-material', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            material_id: pendingMat.id,
            course_id: course.id,
            uploaded_by_admin: 'Administrador U Claro Tecnología',
            file_name: file.name,
            file_type: detectedFormat,
            mime_type: file.type || '',
            media_data_url: mediaDataUrl,
            raw_text: clientRawText,
            course_title: course.title,
            course_category: course.category,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.extracted_text) extractedText = data.extracted_text;
          if (Array.isArray(data.extracted_pages)) {
            extractedPages = data.extracted_pages;
          }
          if (data.analysis_summary) analysisSummary = data.analysis_summary;
          if (Array.isArray(data.classified_images)) {
            classifiedImages = data.classified_images;
          }
          if (data.storage_path) storagePath = data.storage_path;
          if (data.persistent_file_url) persistentFileUrl = data.persistent_file_url;
          if (data.file_type) resolvedFormat = data.file_type;
          if (data.processing_status) status = data.processing_status;
        } else {
          status = 'ERROR';
          errorMsg = 'No fue posible completar la extracción remota; se conservó el archivo original.';
        }
      } catch (err: any) {
        console.warn('Error calling extract-material endpoint:', err);
        status = extractedText ? 'PROCESADO' : 'ERROR';
        errorMsg = err?.message;
      }

      const finalMat: TrainingMaterial = {
        ...pendingMat,
        file_type: resolvedFormat,
        media_data_url:
          extractedPages && extractedPages.length > 0 && resolvedFormat !== 'image'
            ? undefined
            : persistentFileUrl || mediaDataUrl,
        storage_path: storagePath,
        persistent_file_url: persistentFileUrl,
        processing_status: status,
        processing_error: errorMsg,
        extracted_text:
          extractedText ||
          `Contenido extraído de ${file.name} (${resolvedFormat.toUpperCase()}).`,
        extracted_pages: extractedPages,
        classified_images: classifiedImages,
        analysis_summary: analysisSummary,
      };

      processedMaterials.push(finalMat);

      // Update this material's status in real time
      setCourse((prev) => ({
        ...prev,
        materials: prev.materials.map((m) => (m.id === finalMat.id ? finalMat : m)),
      }));
    }

    const existingWithoutPending = course.materials.filter(
      (m) => !pendingEntries.some((p) => p.id === m.id)
    );
    const updatedMaterials = [...existingWithoutPending, ...processedMaterials];
    const firstSummary = processedMaterials.find((m) => m.analysis_summary)?.analysis_summary;
    const firstUploadedImage = processedMaterials.find(
      (m) =>
        (m.file_type === 'image' && (m.persistent_file_url || m.media_data_url)) ||
        (m.classified_images && m.classified_images.some((img) => img.is_cover_candidate))
    );
    const bestCandidateCoverUrl =
      firstUploadedImage?.classified_images?.find((img) => img.is_cover_candidate)?.image_url ||
      (firstUploadedImage?.file_type === 'image'
        ? firstUploadedImage.persistent_file_url || firstUploadedImage.media_data_url
        : undefined);

    const nextTitle =
      course.title.trim() ||
      firstSummary?.detected_title ||
      processedMaterials[0]?.title ||
      course.title;
    const nextDesc =
      course.description.trim() ||
      firstSummary?.document_summary ||
      course.description;
    const nextCategory =
      course.category === 'FTTH' && firstSummary?.detected_category
        ? firstSummary.detected_category
        : course.category;
    const nextSlug =
      course.slug.trim() ||
      nextTitle
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

    setCourse((prev) => ({
      ...prev,
      title: nextTitle,
      slug: slugManuallyEdited && prev.slug ? prev.slug : nextSlug,
      description: nextDesc,
      category: nextCategory,
      cover_image_url:
        bestCandidateCoverUrl && prev.cover_image_url === IMG_FTTH
          ? bestCandidateCoverUrl
          : prev.cover_image_url,
      materials: updatedMaterials,
    }));

    if (processedMaterials[0]) {
      setExpandedMaterialId(processedMaterials[0].id);
    }

    setExtractingFiles(false);

    const shouldAutoGen =
      forceGenerateNow !== undefined ? forceGenerateNow : autoGenerateOnUpload;

    if (shouldAutoGen) {
      await handleGenerateStructureFromMaterials(
        updatedMaterials,
        nextTitle,
        nextDesc,
        nextCategory
      );
    } else {
      setAiStatusMsg(
        `✓ ${processedMaterials.length} archivo(s) conservado(s) y procesado(s). Presiona "✨ ANALIZAR Y CREAR FORMACIÓN CON IA" para transformar el material en módulos, slides interactivos, fichas de estudio y evaluaciones.`
      );
    }
  };

  const handleAddManualMaterial = async () => {
    if (!matTitle.trim() && !matText.trim()) return;
    const extMap: Record<ReferenceMaterialFormat, string> = {
      pdf: 'pdf',
      document: 'docx',
      presentation: 'pptx',
      spreadsheet: 'xlsx',
      text: 'txt',
      image: 'png',
      audio: 'mp3',
      video: 'mp4',
    };
    const cleanTitle = matTitle.trim() || 'Especificación Técnica de Referencia';
    const fileName = `${cleanTitle.replace(/\s+/g, '_')}.${extMap[matType] || 'txt'}`;
    const rawContent =
      matText.trim() ||
      `Lineamientos operativos para ${course.title || course.category}.`;
    const matId = crypto.randomUUID();

    let analysisSummary = undefined;
    let classifiedImages = undefined;
    let storagePath = `uploads/materials/${course.id}/${fileName}`;
    let persistentFileUrl = undefined;
    try {
      const res = await fetch('/api/admin/ai/extract-material', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          material_id: matId,
          course_id: course.id,
          uploaded_by_admin: 'Administrador U Claro Tecnología',
          file_name: fileName,
          file_type: matType,
          raw_text: rawContent,
          course_title: course.title,
          course_category: course.category,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        analysisSummary = data.analysis_summary;
        classifiedImages = data.classified_images;
        if (data.storage_path) storagePath = data.storage_path;
        if (data.persistent_file_url) persistentFileUrl = data.persistent_file_url;
      }
    } catch {
      // ignore
    }

    const newMat: TrainingMaterial = {
      id: matId,
      course_id: course.id,
      title: cleanTitle,
      file_type: matType,
      file_name: fileName,
      file_size_kb: Math.max(4, Math.round((rawContent.length || 500) / 8)),
      storage_path: storagePath,
      persistent_file_url: persistentFileUrl,
      processing_status: 'PROCESADO',
      uploaded_by_admin: 'Administrador U Claro Tecnología',
      extracted_text: rawContent,
      classified_images: classifiedImages,
      analysis_summary: analysisSummary,
      uploaded_at: new Date().toISOString(),
    };
    const nextMaterials = [...course.materials, newMat];
    setCourse((prev) => ({
      ...prev,
      materials: nextMaterials,
    }));
    setExpandedMaterialId(newMat.id);
    setMatTitle('');
    setMatText('');
  };

  // Real Gemini Material Analysis Handler ("Analizar material")
  const handleAnalyzeMaterialWithGemini = async (
    targetMaterial?: TrainingMaterial,
    materialsListOverride?: TrainingMaterial[]
  ) => {
    const matsToAnalyze = targetMaterial
      ? [targetMaterial]
      : materialsListOverride || course.materials;

    if (!matsToAnalyze || matsToAnalyze.length === 0) {
      setGeminiAnalysisError({
        code: 'EMPTY_CONTENT',
        message:
          'Ausencia de contenido: Primero carga un PDF o documento en “MATERIAL DE REFERENCIA” antes de pulsar “Analizar material”.',
      });
      return;
    }

    const primaryMat =
      matsToAnalyze.find((m) => m.file_type === 'pdf') || matsToAnalyze[0];

    // Client-side validation for invalid file / empty content
    if (
      primaryMat &&
      (!primaryMat.extracted_text || primaryMat.extracted_text.trim().length < 5) &&
      (!primaryMat.extracted_pages || primaryMat.extracted_pages.length === 0) &&
      !primaryMat.media_data_url &&
      !primaryMat.storage_path
    ) {
      setGeminiAnalysisError({
        code: 'EMPTY_CONTENT',
        message: `El archivo "${primaryMat.file_name || primaryMat.title}" no contiene texto ni páginas legibles para enviar a Gemini.`,
      });
      return;
    }

    setAnalyzingWithGemini(true);
    setGeminiAnalysisError(null);
    setSaveError(null);
    setAiStatusMsg(
      `Enviando "${primaryMat.file_name || primaryMat.title}" a Gemini para obtener análisis estructurado con trazabilidad de páginas y fragmentos...`
    );

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      controller.abort();
    }, 55000);

    try {
      const res = await fetch('/api/admin/ai/analyze-material', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          materials: matsToAnalyze,
          file_name: primaryMat.file_name || primaryMat.title,
          mime_type:
            primaryMat.file_type === 'pdf' ? 'application/pdf' : undefined,
          media_data_url: primaryMat.media_data_url,
          storage_path: primaryMat.storage_path,
          extracted_text: primaryMat.extracted_text,
          extracted_pages: primaryMat.extracted_pages,
          course_title: course.title,
          course_category: course.category,
          timeout_ms: 48000,
        }),
      });

      window.clearTimeout(timeoutId);

      let data: any = null;
      try {
        data = await res.json();
      } catch {
        throw {
          code: 'INVALID_JSON',
          message:
            'Respuesta JSON inválida del servidor al analizar el material con Gemini.',
        };
      }

      if (!res.ok) {
        throw {
          code: data?.error_code || 'API_ERROR',
          message:
            data?.error ||
            'Error de API al comunicarse con Gemini para analizar el documento.',
        };
      }

      const analysis = data?.analysis as GeminiStructuredMaterialAnalysis | undefined;
      if (
        !analysis ||
        typeof analysis !== 'object' ||
        typeof analysis.documentTitle !== 'string' ||
        typeof analysis.summary !== 'string' ||
        !Array.isArray(analysis.topics) ||
        !Array.isArray(analysis.keyConcepts) ||
        !Array.isArray(analysis.procedures) ||
        !Array.isArray(analysis.learningObjectives)
      ) {
        throw {
          code: 'INVALID_JSON',
          message:
            'Gemini devolvió una estructura JSON incompleta o inválida. Pulsa “Volver a analizar” para reintentar.',
        };
      }

      setGeminiAnalysis(analysis);
      setShowGeminiAnalysisScreen(true);
      setIsEditingGeminiAnalysis(false);

      setCourse((prev) => ({
        ...prev,
        gemini_analysis: analysis,
        materials: prev.materials.map((m) =>
          targetMaterial
            ? m.id === targetMaterial.id
              ? { ...m, gemini_analysis: analysis }
              : m
            : { ...m, gemini_analysis: analysis }
        ),
      }));

      setAiStatusMsg(
        `✓ Análisis del material completado con Gemini (${analysis.topics.length} temas, ${analysis.keyConcepts.length} conceptos clave, ${analysis.procedures.length} procedimientos y ${analysis.learningObjectives.length} objetivos). Revisa y pulsa “Aprobar análisis”.`
      );
    } catch (err: any) {
      window.clearTimeout(timeoutId);
      if (err?.name === 'AbortError') {
        setGeminiAnalysisError({
          code: 'TIMEOUT',
          message:
            'Tiempo de espera agotado (Timeout) al analizar el documento con Gemini. Verifica tu conexión o intenta nuevamente.',
        });
      } else {
        setGeminiAnalysisError({
          code: err?.code || 'API_ERROR',
          message:
            err?.message ||
            'Error al analizar el documento con Gemini. Intenta nuevamente.',
        });
      }
    } finally {
      setAnalyzingWithGemini(false);
    }
  };

  const handleApproveGeminiAnalysis = async (andGenerateCourse = false) => {
    if (!geminiAnalysis) return;
    const approved: GeminiStructuredMaterialAnalysis = {
      ...geminiAnalysis,
      approvedByTrainer: true,
      approvedAt: new Date().toISOString(),
    };
    setGeminiAnalysis(approved);
    setIsEditingGeminiAnalysis(false);

    const nextTitle =
      course.title.trim() || approved.documentTitle || course.title;
    const nextDesc =
      course.description.trim() || approved.summary || course.description;
    const nextLevel: DifficultyLevel = approved.difficulty || course.level;
    const nextSlug =
      course.slug.trim() ||
      nextTitle
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

    const updatedMaterials = course.materials.map((m) => ({
      ...m,
      gemini_analysis: approved,
    }));

    setCourse((prev) => ({
      ...prev,
      title: nextTitle,
      slug: slugManuallyEdited && prev.slug ? prev.slug : nextSlug,
      description: nextDesc,
      level: nextLevel,
      gemini_analysis: approved,
      materials: updatedMaterials,
    }));

    setAiStatusMsg(
      `✓ Análisis del material APROBADO (“${approved.documentTitle}” · Nivel ${approved.difficulty}).`
    );

    if (andGenerateCourse) {
      await handleGenerateStructureFromMaterials(
        updatedMaterials,
        nextTitle,
        nextDesc,
        course.category,
        approved
      );
    }
  };

  // Intelligent Processing of Reference Materials -> Modules, Formative Material, Evaluative Questions & Real Practical Cases
  const handleGenerateStructureFromMaterials = async (
    materialsOverride?: TrainingMaterial[],
    titleOverride?: string,
    descOverride?: string,
    categoryOverride?: string,
    geminiAnalysisOverride?: GeminiStructuredMaterialAnalysis
  ) => {
    const matsToUse = materialsOverride || course.materials;
    const activeGemini =
      geminiAnalysisOverride || geminiAnalysis || course.gemini_analysis;
    const titleToUse =
      (titleOverride !== undefined ? titleOverride : course.title) ||
      activeGemini?.documentTitle ||
      matsToUse[0]?.analysis_summary?.detected_title ||
      matsToUse[0]?.title ||
      `Capacitación en ${course.category}`;
    const descToUse =
      (descOverride !== undefined ? descOverride : course.description) ||
      activeGemini?.summary ||
      matsToUse[0]?.analysis_summary?.document_summary ||
      '';
    const catToUse =
      (categoryOverride !== undefined ? categoryOverride : course.category) ||
      matsToUse[0]?.analysis_summary?.detected_category ||
      'Operaciones Técnicas';

    setGeneratingAi(true);
    setAiPipelineStage(1);
    setAiStatusMsg('Analizando material de referencia y estructurando experiencia formativa...');
    setSaveError(null);

    // Visual progressive stages so the administrator sees each step completed
    const stageInterval = window.setInterval(() => {
      setAiPipelineStage((prev) => (prev < 8 ? prev + 1 : prev));
    }, 280);

    try {
      const res = await fetch('/api/admin/ai/generate-course', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          course_id: course.id,
          title: titleToUse,
          description: descToUse,
          category: catToUse,
          level: activeGemini?.difficulty || course.level,
          estimated_minutes: course.estimated_minutes,
          materials: matsToUse,
          gemini_analysis: activeGemini,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'No fue posible estructurar el material.');
      }

      window.clearInterval(stageInterval);
      setAiPipelineStage(9);

      const finalTitle =
        course.title.trim() || data.suggestedTitle || titleToUse;
      const finalDesc =
        course.description.trim() || data.suggestedDescription || descToUse;
      const finalCat =
        course.category.trim() || data.suggestedCategory || catToUse;

      setCourse((prev) => ({
        ...prev,
        title: finalTitle,
        description: finalDesc,
        category: finalCat,
        level: activeGemini?.difficulty || prev.level,
        slug:
          prev.slug.trim() ||
          finalTitle
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, ''),
        status: 'draft',
        ai_generated_draft: true,
        ai_analysis_summary: data.aiAnalysisSummary || prev.ai_analysis_summary,
        gemini_analysis: activeGemini || prev.gemini_analysis,
        cover_image_url: data.suggestedCoverUrl || prev.cover_image_url,
        materials: Array.isArray(data.enrichedMaterials)
          ? data.enrichedMaterials
          : matsToUse,
        modules: data.modules,
      }));

      setActiveModIdx(0);
      setEditingItemIdx(0);
      setStep3Filter('all');
      const summary = data.aiAnalysisSummary;
      setAiStatusMsg(
        summary
          ? `¡Formación creada en BORRADOR! Se organizaron ${data.modules?.length || 0} módulos con ${summary.total_theory_slides} slides interactivos, ${(data.modules || []).reduce((acc: number, m: any) => acc + (m.study_cards?.length || 0), 0)} fichas de estudio, ${summary.total_evaluative_questions} preguntas evaluativas (mín. 5 por módulo) y ${summary.total_practical_cases} casos prácticos.`
          : 'Experiencia formativa interactiva generada en BORRADOR a partir de tus archivos.'
      );
      setStep(3);
    } catch (err: any) {
      window.clearInterval(stageInterval);
      setSaveError(err.message || 'Error al procesar el material.');
    } finally {
      setGeneratingAi(false);
    }
  };

  const handleRequestThematicIllustration = async (
    target: 'cover' | 'slide',
    slideTitle?: string
  ) => {
    try {
      const currentSlide =
        target === 'slide' && editingItemIdx !== null && course.modules[activeModIdx]
          ? course.modules[activeModIdx].items[editingItemIdx]
          : undefined;
      const primarySourceFile =
        currentSlide?.media_source_file ||
        course.materials[0]?.file_name ||
        course.materials[0]?.title ||
        undefined;

      const res = await fetch('/api/admin/ai/generate-illustration', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          course_title: course.title || course.category,
          slide_title:
            slideTitle || currentSlide?.title || course.title || 'Estándar Operativo',
          slide_subtitle: currentSlide?.subtitle,
          slide_objective:
            currentSlide?.objective || course.modules[activeModIdx]?.learning_objective,
          slide_body: currentSlide?.body,
          slide_steps: currentSlide?.steps,
          technical_specs: currentSlide?.technical_specs,
          highlight_note: currentSlide?.highlight_note,
          source_file_name: primarySourceFile,
          category: course.category,
          variant: Math.floor(Math.random() * 9) + 1,
        }),
      });
      const data = await res.json();
      if (data.image_url) {
        if (target === 'cover') {
          setCourse((prev) => ({ ...prev, cover_image_url: data.image_url }));
        } else {
          updateEditingItem((it) => ({
            ...it,
            media_url: data.image_url,
            image_category: 'ESQUEMA',
            media_classification: 'ESQUEMA',
            media_source_type: 'auto_schematic',
            media_source_file: primarySourceFile,
            media_caption: `Esquema didáctico automático generado a partir del contenido de: ${it.title}`,
          }));
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Module Management
  const addModule = () => {
    const now = new Date().toISOString();
    const newMod: CourseModule = {
      id: crypto.randomUUID(),
      course_id: course.id,
      title: `Módulo ${course.modules.length + 1}: Nuevo Módulo`,
      description: 'Descripción de los temas de este módulo.',
      order_index: course.modules.length + 1,
      items: [],
      created_at: now,
      updated_at: now,
    };
    setCourse((prev) => ({
      ...prev,
      modules: [...prev.modules, newMod],
    }));
    setActiveModIdx(course.modules.length);
  };

  const moveModule = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= course.modules.length) return;
    const mods = [...course.modules];
    const temp = mods[idx];
    mods[idx] = mods[target];
    mods[target] = temp;
    mods.forEach((m, i) => (m.order_index = i + 1));
    setCourse((prev) => ({ ...prev, modules: mods }));
    setActiveModIdx(target);
  };

  const deleteModule = (idx: number) => {
    if (course.modules.length <= 1) return;
    const mods = course.modules.filter((_, i) => i !== idx);
    mods.forEach((m, i) => (m.order_index = i + 1));
    setCourse((prev) => ({ ...prev, modules: mods }));
    setActiveModIdx(0);
  };

  // Slide / ContentItem Management
  const addSlideToModule = (type: ContentType) => {
    const activeMod = course.modules[activeModIdx];
    if (!activeMod) return;

    const itemId = crypto.randomUUID();
    const qId = crypto.randomUUID();
    const isQuestionType =
      type === 'question' || type === 'case_study' || type === 'evaluation';
    const defaultComp = competencies[0] || {
      id: crypto.randomUUID(),
      name: 'Procedimiento técnico',
    };

    const newItem: ContentItem = {
      id: itemId,
      course_id: course.id,
      module_id: activeMod.id,
      content_type: type,
      title:
        type === 'question'
          ? 'Pregunta Interactiva de Verificación'
          : type === 'case_study'
          ? 'Caso Práctico de Campo'
          : type === 'evaluation'
          ? 'Evaluación Final del Módulo'
          : type === 'steps'
          ? 'Procedimiento Paso a Paso'
          : 'Nueva Pantalla Formativa',
      subtitle: 'Subtítulo o contexto técnico de la pantalla',
      body: isQuestionType
        ? ''
        : 'Punto clave 1 del procedimiento técnico.\nPunto clave 2 para verificar calidad en sitio.\nPunto clave 3 de cumplimiento normativo.',
      media_url: type === 'image' || type === 'title' ? course.cover_image_url : undefined,
      highlight_note:
        type === 'highlight' || type === 'instructions'
          ? 'REGLA OPERATIVA CLARO: Verificar parámetros antes de cerrar la orden.'
          : undefined,
      steps:
        type === 'steps'
          ? [
              {
                step_number: 1,
                title: 'Inspección y preparación de herramienta',
                description: 'Verificar calibración del equipo antes de intervenir.',
              },
              {
                step_number: 2,
                title: 'Ejecución y certificación de parámetros',
                description: 'Validar que la lectura se encuentre dentro del umbral.',
              },
            ]
          : undefined,
      order_index: activeMod.items.length + 1,
      estimated_seconds: 60,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      question_id: isQuestionType ? qId : undefined,
      question: isQuestionType
        ? {
            id: qId,
            course_id: course.id,
            module_id: activeMod.id,
            competency_id: defaultComp.id,
            competency_name: defaultComp.name,
            question_type: 'single_choice',
            case_study_situation:
              type === 'case_study'
                ? 'Un especialista llega al sitio y detecta una desviación técnica respecto al estándar operativo...'
                : undefined,
            case_study_description:
              type === 'case_study'
                ? 'Analiza la condición encontrada y selecciona la decisión técnica correcta:'
                : undefined,
            case_study_image_url: type === 'case_study' ? IMG_CONNECTOR : undefined,
            prompt: '¿Qué acción técnica debe realizar el especialista según el estándar?',
            explanation:
              'Esta decisión garantiza la calidad del servicio y cumple la norma operativa vigente.',
            correct_concept: 'Verificación instrumental y aplicación rigurosa del protocolo.',
            recommendation: 'Repasa los lineamientos técnicos del módulo.',
            related_content_id: activeMod.items[0]?.id,
            difficulty: course.level,
            points: 25,
            max_attempts: 2,
            order_index: activeMod.items.length + 1,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            options: [
              {
                id: crypto.randomUUID(),
                question_id: qId,
                label: 'A',
                text: 'Aplicar el procedimiento estándar y certificar parámetros antes de finalizar.',
                step_order: 1,
                is_correct: true,
              },
              {
                id: crypto.randomUUID(),
                question_id: qId,
                label: 'B',
                text: 'Omitir la verificación y cerrar la actividad sin medir.',
                step_order: 2,
                is_correct: false,
              },
            ],
          }
        : undefined,
    };

    const mods = [...course.modules];
    mods[activeModIdx] = {
      ...activeMod,
      items: [...activeMod.items, newItem],
    };
    setCourse((prev) => ({ ...prev, modules: mods }));
    setEditingItemIdx(mods[activeModIdx].items.length - 1);
  };

  const moveSlide = (itemIdx: number, dir: -1 | 1) => {
    const activeMod = course.modules[activeModIdx];
    if (!activeMod) return;
    const target = itemIdx + dir;
    if (target < 0 || target >= activeMod.items.length) return;
    const items = [...activeMod.items];
    const temp = items[itemIdx];
    items[itemIdx] = items[target];
    items[target] = temp;
    items.forEach((it, i) => (it.order_index = i + 1));

    const mods = [...course.modules];
    mods[activeModIdx] = { ...activeMod, items };
    setCourse((prev) => ({ ...prev, modules: mods }));
    setEditingItemIdx(target);
  };

  const deleteSlide = (itemIdx: number) => {
    const activeMod = course.modules[activeModIdx];
    if (!activeMod) return;
    const items = activeMod.items.filter((_, i) => i !== itemIdx);
    items.forEach((it, i) => (it.order_index = i + 1));
    const mods = [...course.modules];
    mods[activeModIdx] = { ...activeMod, items };
    setCourse((prev) => ({ ...prev, modules: mods }));
    setEditingItemIdx(null);
  };

  const updateEditingItem = (updater: (item: ContentItem) => ContentItem) => {
    if (editingItemIdx === null) return;
    const activeMod = course.modules[activeModIdx];
    if (!activeMod || !activeMod.items[editingItemIdx]) return;

    const updatedItem = updater(structuredClone(activeMod.items[editingItemIdx]));
    const items = [...activeMod.items];
    items[editingItemIdx] = updatedItem;

    const mods = [...course.modules];
    mods[activeModIdx] = { ...activeMod, items };
    setCourse((prev) => ({ ...prev, modules: mods }));
  };

  const handlePersistCourse = async (targetStatus: 'draft' | 'published' | 'archived') => {
    setSaving(true);
    setSaveError(null);
    try {
      const payload: Course = {
        ...course,
        title: course.title.trim() || `Capacitación ${course.category}`,
        status: targetStatus,
        published_at:
          targetStatus === 'published'
            ? new Date().toISOString()
            : course.published_at,
      };

      const res = await fetch('/api/admin/courses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify(payload),
      });
      const saved = await res.json();
      if (!res.ok) {
        throw new Error(saved.error || 'Error al guardar la capacitación.');
      }
      await syncCourseSummaryToFirestore(saved).catch(() => {});
      setCourse(saved);
      onSaveCourse(saved);
    } catch (err: any) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const activeModule = course.modules[activeModIdx];
  const activeItem =
    editingItemIdx !== null && activeModule
      ? activeModule.items[editingItemIdx]
      : null;

  const publicUrl = `${window.location.origin}/formacion/${course.slug || 'nueva-capacitacion'}`;

  const renderMaterialIcon = (type: ReferenceMaterialFormat) => {
    switch (type) {
      case 'image':
        return <ImageIcon className="w-4 h-4 text-[#DA291C] shrink-0" />;
      case 'audio':
        return <Music className="w-4 h-4 text-amber-600 shrink-0" />;
      case 'video':
        return <Video className="w-4 h-4 text-purple-600 shrink-0" />;
      case 'presentation':
        return <FileSpreadsheet className="w-4 h-4 text-orange-600 shrink-0" />;
      case 'spreadsheet':
        return <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />;
      default:
        return <FileText className="w-4 h-4 text-[#DA291C] shrink-0" />;
    }
  };

  const totalFormativeCount = course.modules.reduce(
    (sum, m) =>
      sum +
      (m.items || []).filter(
        (it) =>
          it.content_type !== 'question' &&
          it.content_type !== 'case_study' &&
          it.content_type !== 'evaluation' &&
          !it.question
      ).length,
    0
  );
  const totalQuestionsCount = course.modules.reduce(
    (sum, m) =>
      sum +
      (m.items || []).filter(
        (it) =>
          it.content_type === 'question' || it.content_type === 'evaluation'
      ).length,
    0
  );
  const totalCasesCount = course.modules.reduce(
    (sum, m) =>
      sum + (m.items || []).filter((it) => it.content_type === 'case_study').length,
    0
  );
  const totalStudyCardsCount = course.modules.reduce(
    (sum, m) => sum + (m.study_cards || []).length,
    0
  );

  // Collect all classified images from AI summary, materials, extracted pages, and module slides
  const allExtractedRawImages = React.useMemo(() => {
    const map = new Map<string, any>();
    const defaultFileName =
      course.materials?.[0]?.file_name ||
      course.materials?.[0]?.title ||
      `${course.slug || 'material_referencia'}.pdf`;

    const registerImg = (rawImg: any, fallbackFile: string) => {
      if (!rawImg?.image_url) return;
      if (rawImg.image_url.startsWith('data:image/svg+xml')) return;
      if (map.has(rawImg.image_url)) return;

      const titleTxt =
        rawImg.title ||
        rawImg.related_topic ||
        rawImg.caption ||
        `Recurso visual Pág. ${rawImg.page_number || 1}`;
      const descTxt =
        rawImg.description ||
        rawImg.caption ||
        `Recurso visual extraído de ${rawImg.source_file_name || fallbackFile}`;

      const combinedLower = `${titleTxt} ${descTxt} ${rawImg.category || ''}`.toLowerCase();
      const autoKeywords =
        Array.isArray(rawImg.keywords) && rawImg.keywords.length > 0
          ? rawImg.keywords
          : combinedLower
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .replace(/[^a-z0-9.\-/\s]/g, ' ')
              .split(/\s+/)
              .filter((w: string) => w.length >= 4)
              .slice(0, 12);

      map.set(rawImg.image_url, {
        ...rawImg,
        id: rawImg.id || `img-${map.size + 1}`,
        image_url: rawImg.image_url,
        source_file_name: rawImg.source_file_name || fallbackFile,
        page_number: rawImg.page_number,
        source_section:
          rawImg.source_section ||
          (rawImg.page_number ? `Página ${rawImg.page_number}: ${titleTxt}` : titleTxt),
        category: rawImg.category || 'DIAGRAMA',
        title: titleTxt,
        caption: rawImg.caption || descTxt,
        description: descTxt,
        related_topic: rawImg.related_topic || titleTxt,
        related_module: rawImg.related_module || 'Contenido Técnico del Material',
        keywords: autoKeywords,
        associated_concepts:
          Array.isArray(rawImg.associated_concepts) && rawImg.associated_concepts.length > 0
            ? rawImg.associated_concepts
            : [titleTxt],
        is_cover_candidate:
          rawImg.is_cover_candidate !== undefined ? rawImg.is_cover_candidate : true,
        is_primary_pedagogical:
          rawImg.is_primary_pedagogical !== undefined ? rawImg.is_primary_pedagogical : true,
        is_educational_priority:
          rawImg.is_educational_priority !== undefined
            ? rawImg.is_educational_priority
            : true,
        is_discarded: Boolean(rawImg.is_discarded || rawImg.category === 'LOGO'),
        discard_reason:
          rawImg.discard_reason ||
          (rawImg.category === 'LOGO'
            ? 'Logo o elemento institucional sin valor pedagógico directo'
            : undefined),
      });
    };

    for (const img of course.ai_analysis_summary?.classified_images || []) {
      registerImg(img, defaultFileName);
    }

    for (const mat of course.materials || []) {
      const matFile = mat.file_name || mat.title || defaultFileName;
      for (const img of mat.classified_images || mat.extracted_images || []) {
        registerImg(img, matFile);
      }
      for (const p of mat.extracted_pages || []) {
        if (p.image_data_url) {
          registerImg(
            {
              id: `mat-${mat.id}-p${p.page_number}`,
              image_url: p.image_data_url,
              source_file_name: matFile,
              page_number: p.page_number,
              category: p.image_category || 'DIAGRAMA',
              title: p.title,
              caption: p.image_caption || p.title,
              description: (p.bullets || []).slice(0, 2).join(' · ') || p.title,
              related_topic: p.title,
              keywords: p.keywords,
            },
            matFile
          );
        }
      }
      if (mat.file_type === 'image' && (mat.persistent_file_url || mat.media_data_url)) {
        const url = (mat.persistent_file_url || mat.media_data_url)!;
        registerImg(
          {
            id: mat.id,
            image_url: url,
            source_file_name: matFile,
            page_number: 1,
            category: 'FOTOGRAFÍA',
            title: mat.title || matFile,
            caption: `Imagen cargada en material de referencia (${matFile})`,
            description: `Recurso visual cargado directamente (${matFile})`,
            related_topic: course.title || course.category,
            is_educational_priority: true,
            is_cover_candidate: true,
          },
          matFile
        );
      }
    }

    // Also include any real extracted images already assigned to module slides
    (course.modules || []).forEach((mod, mIdx) => {
      (mod.items || []).forEach((it, sIdx) => {
        if (it.media_url && !it.media_url.startsWith('data:image/svg+xml')) {
          const subPageMatch = (it.subtitle || '').match(/Diapositiva\s+(\d+)|Ficha\s+(\d+)/i);
          const inferredPage =
            it.media_source_page ||
            (subPageMatch ? Number(subPageMatch[1] || subPageMatch[2]) : sIdx + 1);
          registerImg(
            {
              id: `slide-img-${mod.id}-${it.id}`,
              image_url: it.media_url,
              source_file_name: it.media_source_file || defaultFileName,
              page_number: inferredPage,
              category: it.image_category || it.media_classification || 'DIAGRAMA',
              title: it.title,
              caption: it.media_caption || it.title,
              description: (it.body || '').split('\n').slice(0, 2).join(' · ') || it.title,
              related_topic: it.title,
              related_module: mod.title || `Módulo ${mIdx + 1}`,
              keywords: it.media_keywords,
            },
            it.media_source_file || defaultFileName
          );
        }
      });
    });

    return Array.from(map.values());
  }, [
    course.ai_analysis_summary,
    course.materials,
    course.modules,
    course.title,
    course.category,
    course.slug,
  ]);

  // Valid pedagogical images (filtering out discarded logos, headers, footers, tiny icons, duplicates - Section 3)
  const allClassifiedImages = React.useMemo(
    () => allExtractedRawImages.filter((img) => !img.is_discarded && img.category !== 'LOGO'),
    [allExtractedRawImages]
  );

  const discardedMaterialImages = React.useMemo(
    () => allExtractedRawImages.filter((img) => img.is_discarded || img.category === 'LOGO'),
    [allExtractedRawImages]
  );

  const availableMaterialFiles = React.useMemo(() => {
    const files = new Set<string>();
    for (const mat of course.materials || []) {
      if (mat.file_name) files.add(mat.file_name);
    }
    for (const img of allExtractedRawImages) {
      if (img.source_file_name) files.add(img.source_file_name);
    }
    return Array.from(files);
  }, [course.materials, allExtractedRawImages]);

  // Section 5 & Section 8: Compute "Recomendadas para este slide" based on semantic compatibility with activeItem
  const recommendedImagesForActiveSlide = React.useMemo(() => {
    if (!activeItem || allClassifiedImages.length === 0) return [];

    const slideText = [
      activeItem.title || '',
      activeItem.subtitle || '',
      activeItem.objective || '',
      activeItem.highlight_note || '',
      activeItem.body || '',
      (activeItem.steps || []).map((s) => `${s.title} ${s.description}`).join(' '),
      (activeItem.technical_specs || []).map((t) => `${t.label} ${t.value}`).join(' '),
      activeModule?.title || '',
    ]
      .join(' ')
      .toLowerCase();

    const cleanTokens = slideText
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9.\-/\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3);
    const slideTokenSet = new Set(cleanTokens);

    const subPageMatch = (activeItem.subtitle || '').match(/Diapositiva\s+(\d+)|Ficha\s+(\d+)/i);
    const slidePageNum =
      activeItem.media_source_page ||
      (subPageMatch ? Number(subPageMatch[1] || subPageMatch[2]) : undefined);

    const isProcedural =
      activeItem.content_type === 'steps' ||
      (Array.isArray(activeItem.steps) && activeItem.steps.length > 0) ||
      /(?:procedimiento|paso|secuencia|preparaci[oó]n|enrutamiento|transici[oó]n|calcule|gire|360|instalaci[oó]n)/i.test(
        slideText
      );
    const isTabular =
      /(?:tabla|sap|maestra|longitud|dimensiones|capacidad|rango|par[aá]metro|c[oó]digo)/i.test(
        slideText
      );
    const isHardware =
      /(?:conector|cable|cierre|domo|bandeja|holder|herramienta|fosc|cto|nap|equipo|fusi[oó]n|fibra)/i.test(
        slideText
      );

    const scored = allClassifiedImages.map((img) => {
      let score = 0;
      const reasons: string[] = [];

      if (slidePageNum && img.page_number === slidePageNum) {
        score += 45;
        reasons.push(`Corresponde a la página ${img.page_number} del material`);
      }

      const imgText = [
        img.title || '',
        img.related_topic || '',
        img.caption || '',
        img.description || '',
        ...(img.keywords || []),
        ...(img.associated_concepts || []),
      ]
        .join(' ')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

      const matchedWords: string[] = [];
      for (const tok of slideTokenSet) {
        if (tok.length >= 4 && imgText.includes(tok)) {
          matchedWords.push(tok);
          score += tok.length >= 6 ? 10 : 6;
        }
      }

      if (matchedWords.length > 0) {
        reasons.push(`Conceptos: ${matchedWords.slice(0, 4).join(', ')}`);
      }

      if (isProcedural && (img.category === 'DIAGRAMA' || img.category === 'ESQUEMA')) {
        score += 18;
        reasons.push(`${img.category} ideal para procedimiento`);
      } else if (isTabular && (img.category === 'TABLA' || img.category === 'GRÁFICO')) {
        score += 18;
        reasons.push(`${img.category} de especificaciones/parámetros`);
      } else if (isHardware && (img.category === 'FOTOGRAFÍA' || img.category === 'ILUSTRACIÓN')) {
        score += 14;
        reasons.push(`${img.category} técnica de componente`);
      }

      const affinityPct = Math.min(99, Math.max(40, 52 + Math.round(score * 0.75)));
      return {
        ...img,
        compatibilityScore: score,
        affinityPct,
        compatibilityReason:
          reasons.join(' · ') || `Relacionada con ${img.related_topic || img.category}`,
      };
    });

    return scored
      .filter((item) => item.compatibilityScore >= 12)
      .sort((a, b) => b.compatibilityScore - a.compatibilityScore)
      .slice(0, 6);
  }, [activeItem, activeModule, allClassifiedImages]);

  // Provenance metadata for the currently assigned image on activeItem (Section 6)
  const activeSlideImageProvenance = React.useMemo(() => {
    if (!activeItem?.media_url) return null;
    const isSvgSchematic =
      activeItem.media_source_type === 'auto_schematic' ||
      activeItem.media_url.startsWith('data:image/svg+xml');
    const isManualUpload = activeItem.media_source_type === 'manual_upload';

    const matchedFromCatalog = allExtractedRawImages.find(
      (img) => img.image_url === activeItem.media_url
    );

    const subPageMatch = (activeItem.subtitle || '').match(/Diapositiva\s+(\d+)|Ficha\s+(\d+)/i);
    const resolvedPage =
      activeItem.media_source_page ||
      matchedFromCatalog?.page_number ||
      (subPageMatch ? Number(subPageMatch[1] || subPageMatch[2]) : undefined);

    const resolvedFile =
      activeItem.media_source_file ||
      matchedFromCatalog?.source_file_name ||
      course.materials?.[0]?.file_name ||
      course.materials?.[0]?.title ||
      'Material de referencia del curso';

    const resolvedCategory =
      activeItem.image_category ||
      activeItem.media_classification ||
      matchedFromCatalog?.category ||
      (isSvgSchematic ? 'ESQUEMA' : 'DIAGRAMA');

    const resolvedKeywords =
      activeItem.media_keywords ||
      matchedFromCatalog?.keywords ||
      [];

    return {
      sourceType: isSvgSchematic
        ? ('auto_schematic' as const)
        : isManualUpload
        ? ('manual_upload' as const)
        : ('material_reference' as const),
      fileName: resolvedFile,
      pageNumber: resolvedPage,
      category: resolvedCategory,
      sectionTitle:
        activeItem.media_source_section ||
        matchedFromCatalog?.source_section ||
        matchedFromCatalog?.related_topic,
      keywords: resolvedKeywords,
    };
  }, [activeItem, allExtractedRawImages, course.materials]);

  const filteredGalleryImages = React.useMemo(() => {
    const sourcePool = showDiscardedInGallery
      ? discardedMaterialImages
      : allClassifiedImages;

    return sourcePool.filter((img) => {
      if (galleryFileFilter !== 'ALL' && img.source_file_name !== galleryFileFilter) {
        return false;
      }
      if (galleryCategoryFilter !== 'ALL' && img.category !== galleryCategoryFilter) {
        return false;
      }
      if (gallerySearchQuery.trim()) {
        const q = gallerySearchQuery.toLowerCase().trim();
        const hay = [
          img.title || '',
          img.caption || '',
          img.description || '',
          img.source_file_name || '',
          img.category || '',
          img.page_number ? `pagina ${img.page_number} pág ${img.page_number}` : '',
          ...(img.keywords || []),
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    showDiscardedInGallery,
    discardedMaterialImages,
    allClassifiedImages,
    galleryFileFilter,
    galleryCategoryFilter,
    gallerySearchQuery,
  ]);

  const coverImageCandidates = React.useMemo(() => {
    const priority = allClassifiedImages.filter((img) => img.is_cover_candidate);
    return priority.length > 0 ? priority : allClassifiedImages;
  }, [allClassifiedImages]);

  const aiProcessSteps = [
    { id: 1, label: 'Archivos procesados' },
    { id: 2, label: 'Contenido identificado' },
    { id: 3, label: 'Imágenes identificadas' },
    { id: 4, label: 'Conceptos identificados' },
    { id: 5, label: 'Procedimientos identificados' },
    { id: 6, label: 'Competencias identificadas' },
    { id: 7, label: 'Módulos propuestos' },
    { id: 8, label: 'Slides creados' },
    { id: 9, label: 'Evaluaciones creadas' },
  ];

  return (
    <div className="space-y-6">
      {/* Top Wizard Header & Stepper */}
      <div className="bg-white border-2 border-slate-200 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4 shadow-sm">
        <div>
          <div className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-[#DA291C]">
            <span className="w-2 h-2 rounded-full bg-[#DA291C]" />
            <span>MOTOR INTELIGENTE DE CREACIÓN DE CAPACITACIONES CON IA</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-0.5">
            <h2 className="text-lg font-extrabold text-slate-900">
              {course.title || 'Nueva Capacitación Interactiva'}
            </h2>
            <span
              className={`px-2 py-0.5 text-[10px] font-mono font-extrabold rounded border ${
                course.status === 'published'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                  : 'bg-amber-50 text-amber-800 border-amber-300'
              }`}
            >
              {course.status === 'published' ? 'PUBLICADO' : 'BORRADOR (En revisión)'}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-lg">
          {[
            { n: 1, label: 'Paso 1: Información y Card' },
            { n: 2, label: 'Paso 2: Material de Referencia' },
            { n: 3, label: 'Paso 3: Módulos, Slides y Evaluaciones' },
            { n: 4, label: 'Paso 4: Previsualización' },
            { n: 5, label: 'Paso 5: Publicar Capacitación' },
          ].map((s) => (
            <button
              key={s.n}
              type="button"
              onClick={() => setStep(s.n as any)}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors whitespace-nowrap ${
                step === s.n
                  ? 'bg-[#DA291C] text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg"
          >
            Volver a Capacitaciones
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => handlePersistCourse('draft')}
            className="px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg"
          >
            {saving ? 'Guardando...' : 'Guardar en BORRADOR'}
          </button>
        </div>
      </div>

      {saveError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-xs font-semibold text-red-700">
          {saveError}
        </div>
      )}

      {/* Non-blocking Visual AI Analysis & Generation Progress Panel */}
      {(extractingFiles || generatingAi || aiPipelineStage === 9) && (
        <div className="p-5 bg-white border-2 border-[#DA291C] rounded-xl space-y-3 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <Sparkles
                className={`w-5 h-5 text-[#DA291C] shrink-0 ${
                  extractingFiles || generatingAi ? 'animate-spin' : ''
                }`}
              />
              <div>
                <div className="text-xs font-extrabold uppercase tracking-wider text-[#DA291C]">
                  {extractingFiles || generatingAi
                    ? 'Analizando material...'
                    : '✓ Análisis de IA y estructuración formativa completados (Estado: BORRADOR)'}
                </div>
                <div className="text-xs text-slate-700 font-medium">
                  {aiStatusMsg ||
                    'Transformando material de referencia en una experiencia formativa interactiva...'}
                </div>
              </div>
            </div>
            {!extractingFiles && !generatingAi && (
              <button
                type="button"
                onClick={() => setAiPipelineStage(0)}
                className="text-[11px] font-bold text-slate-500 hover:text-slate-800"
              >
                Cerrar panel de progreso
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-9 gap-2 pt-1">
            {aiProcessSteps.map((st) => {
              const isDone = aiPipelineStage >= st.id;
              const isCurrent =
                (extractingFiles && st.id <= 3) ||
                (generatingAi && aiPipelineStage === st.id);
              return (
                <div
                  key={st.id}
                  className={`p-2 rounded-lg border text-[11px] font-bold flex items-center gap-1.5 transition-colors ${
                    isDone
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                      : isCurrent
                      ? 'bg-red-50 border-[#DA291C] text-[#DA291C]'
                      : 'bg-slate-50 border-slate-200 text-slate-400'
                  }`}
                >
                  <span className="font-mono text-xs shrink-0">
                    {isDone ? '✓' : isCurrent ? '⋯' : '○'}
                  </span>
                  <span className="leading-tight">{st.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {aiStatusMsg && !extractingFiles && !generatingAi && aiPipelineStage !== 9 && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-semibold text-emerald-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{aiStatusMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setAiStatusMsg(null)}
            className="text-emerald-700 hover:underline text-[11px]"
          >
            Ocultar
          </button>
        </div>
      )}

      {/* ============================================================================ */}
      {/* PASO 1: INFORMACIÓN GENERAL + CARD VISUAL AUTOMÁTICA + PORTADA SUGERIDA */}
      {/* ============================================================================ */}
      {step === 1 && (
        <div className="bg-white border-2 border-slate-200 rounded-xl p-6 lg:p-8 space-y-6">
          {/* Direct Multi-Format Upload & Auto-Generation Banner right in Step 1 */}
          <div className="p-5 bg-red-50/50 border-2 border-dashed border-[#DA291C] rounded-xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 text-xs font-extrabold text-[#DA291C] uppercase tracking-wide">
                <Sparkles className="w-4 h-4" />
                <span>Motor Inteligente: Transformar Material de Referencia en Experiencia Formativa Interactiva</span>
              </div>
              <p className="text-xs text-slate-700 leading-relaxed max-w-3xl">
                Carga múltiples archivos del mismo tema (PDF, Word, PowerPoint, TXT, Excel, JPG, JPEG, PNG, Audio o Video). El motor conserva los archivos originales, extrae y clasifica las imágenes, organiza módulos pedagógicos, crea slides interactivos, fichas de estudio y evaluaciones (mínimo 5 preguntas por módulo) manteniendo todo como <strong>BORRADOR</strong> hasta tu publicación.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <label className="cursor-pointer px-4 py-2.5 text-xs font-extrabold text-white bg-[#DA291C] hover:bg-[#B91C1C] rounded-xl inline-flex items-center gap-2 shadow-sm transition-colors">
                <Upload className="w-4 h-4" />
                <span>✨ Cargar Material y Crear Formación con IA</span>
                <input
                  type="file"
                  multiple
                  accept="*/*"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      handleFilesSelected(e.target.files, true);
                    }
                  }}
                  className="hidden"
                />
              </label>
              <button
                type="button"
                onClick={() => setStep(2)}
                className="px-3.5 py-2.5 text-xs font-bold text-slate-800 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl"
              >
                Ir a “MATERIAL DE REFERENCIA” (Paso 2)
              </button>
            </div>
          </div>

          <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
            <div>
              <h3 className="text-base font-extrabold text-slate-900">
                Paso 1: Información General y Card Visual de la Capacitación
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Define los datos generales y selecciona la imagen de portada para la CARD visual que verán los participantes.
              </p>
            </div>
            <span className="px-2.5 py-1 text-[11px] font-mono font-bold rounded bg-amber-50 text-amber-800 border border-amber-200">
              Estado actual: {course.status === 'published' ? 'PUBLICADO' : 'BORRADOR'}
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Nombre de capacitación *
                </label>
                <input
                  type="text"
                  value={course.title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  placeholder="Ej. Instalación FTTH, Apertura Segura de Cámaras, Mediciones con OTDR..."
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#DA291C]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Enlace público compartible *
                </label>
                <div className="flex items-center">
                  <span className="px-3 py-2 text-xs font-mono bg-slate-100 border border-r-0 border-slate-300 rounded-l-lg text-slate-600">
                    /formacion/
                  </span>
                  <input
                    type="text"
                    value={course.slug}
                    onChange={(e) => {
                      setSlugManuallyEdited(true);
                      setCourse((prev) => ({ ...prev, slug: e.target.value }));
                    }}
                    placeholder="nombre-del-tema"
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-r-lg focus:outline-none focus:border-[#DA291C]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Descripción breve *
                </label>
                <textarea
                  rows={3}
                  value={course.description}
                  onChange={(e) =>
                    setCourse((prev) => ({ ...prev, description: e.target.value }))
                  }
                  placeholder="Describe brevemente el objetivo y alcance de esta capacitación..."
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#DA291C]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Categoría / Tema Formativo (Escalable a cualquier tema nuevo) *
                </label>
                <input
                  type="text"
                  value={course.category}
                  onChange={(e) =>
                    setCourse((prev) => ({ ...prev, category: e.target.value }))
                  }
                  placeholder="Escribe cualquier categoría o selecciona una sugerencia abajo..."
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#DA291C]"
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {SCALABLE_TOPIC_SUGGESTIONS.map((topic) => (
                    <button
                      key={topic}
                      type="button"
                      onClick={() => setCourse((prev) => ({ ...prev, category: topic }))}
                      className={`px-2.5 py-1 text-[11px] font-semibold rounded border transition-colors ${
                        course.category === topic
                          ? 'bg-[#DA291C] text-white border-[#DA291C]'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-[#DA291C]'
                      }`}
                    >
                      {topic}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    Nivel *
                  </label>
                  <select
                    value={course.level}
                    onChange={(e) =>
                      setCourse((prev) => ({
                        ...prev,
                        level: e.target.value as DifficultyLevel,
                      }))
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="Básico">Básico</option>
                    <option value="Intermedio">Intermedio</option>
                    <option value="Avanzado">Avanzado</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    Duración estimada (min) *
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={240}
                    value={course.estimated_minutes}
                    onChange={(e) =>
                      setCourse((prev) => ({
                        ...prev,
                        estimated_minutes: Number(e.target.value) || 25,
                      }))
                    }
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    Nota mínima aprobación (%) *
                  </label>
                  <input
                    type="number"
                    min={50}
                    max={100}
                    value={course.passing_score}
                    onChange={(e) =>
                      setCourse((prev) => ({
                        ...prev,
                        passing_score: Number(e.target.value) || 80,
                      }))
                    }
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Política ante múltiples intentos con la misma Cédula
                </label>
                <select
                  value={course.retry_policy}
                  onChange={(e) =>
                    setCourse((prev) => ({
                      ...prev,
                      retry_policy: e.target.value as RetryPolicy,
                    }))
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value="continue">Continuar progreso guardado o permitir nuevo intento</option>
                  <option value="new_attempt">Iniciar siempre nuevo intento</option>
                  <option value="single_attempt">Único intento estricto tras finalizar</option>
                </select>
              </div>
            </div>

            <div className="space-y-4">
              {/* Imágenes sugeridas para portada */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-extrabold text-slate-900">
                      Imágenes sugeridas para portada
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Selecciona una imagen extraída del material o sube manualmente una portada para la CARD.
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <label className="cursor-pointer px-2.5 py-1.5 text-[11px] font-bold bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-lg inline-flex items-center gap-1">
                      <Upload className="w-3 h-3 text-[#DA291C]" />
                      <span>Subir portada manual</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = () => {
                            if (typeof reader.result === 'string') {
                              setCourse((prev) => ({
                                ...prev,
                                cover_image_url: reader.result as string,
                              }));
                            }
                          };
                          reader.readAsDataURL(file);
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => handleRequestThematicIllustration('cover')}
                      className="px-2.5 py-1.5 text-[11px] font-bold bg-red-50 hover:bg-red-100 text-[#DA291C] border border-red-200 rounded-lg inline-flex items-center gap-1"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Ilustración IA</span>
                    </button>
                  </div>
                </div>

                {coverImageCandidates.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {coverImageCandidates.slice(0, 6).map((cand) => {
                      const isSelected = course.cover_image_url === cand.image_url;
                      return (
                        <div
                          key={cand.id || cand.image_url}
                          className={`rounded-lg border-2 overflow-hidden bg-white flex flex-col justify-between ${
                            isSelected ? 'border-[#DA291C]' : 'border-slate-200'
                          }`}
                        >
                          <div className="h-20 bg-slate-900 relative">
                            <ResilientImage
                              src={cand.image_url}
                              alt={cand.title}
                              className="w-full h-full object-cover"
                            />
                            <span className="absolute top-1 left-1 px-1.5 py-0.5 text-[9px] font-mono font-bold bg-slate-900/80 text-white rounded">
                              {cand.category || 'FOTOGRAFÍA'}
                            </span>
                          </div>
                          <div className="p-2 space-y-1.5">
                            <div className="text-[10px] font-bold text-slate-800 truncate">
                              {cand.title}
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                setCourse((prev) => ({
                                  ...prev,
                                  cover_image_url: cand.image_url,
                                }))
                              }
                              className={`w-full py-1 px-2 text-[10px] font-extrabold rounded transition-colors ${
                                isSelected
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-[#DA291C] hover:bg-[#B91C1C] text-white'
                              }`}
                            >
                              {isSelected ? '✓ PORTADA ACTIVA' : 'USAR COMO PORTADA'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-1.5">
                  {PRESET_COVERS.map((preset) => (
                    <button
                      key={preset.url}
                      type="button"
                      onClick={() =>
                        setCourse((prev) => ({ ...prev, cover_image_url: preset.url }))
                      }
                      className={`p-2 text-left text-[11px] rounded-lg border transition-colors ${
                        course.cover_image_url === preset.url
                          ? 'border-[#DA291C] bg-red-50 font-bold text-[#DA291C]'
                          : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Vista previa automática de la CARD visual de la nueva capacitación */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-slate-800">
                    Vista Previa Automática de la CARD Visual de la Capacitación
                  </span>
                  <span className="text-[10px] font-mono font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                    {course.status === 'published' ? 'PUBLICADA' : 'BORRADOR'}
                  </span>
                </div>
                <div className="border-2 border-slate-200 rounded-2xl overflow-hidden bg-white shadow-xs">
                  <div className="h-36 w-full bg-slate-900 relative">
                    <ResilientImage
                      src={course.cover_image_url}
                      alt={course.title || 'Portada'}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex flex-col justify-end p-3.5">
                      <div className="text-[11px] font-bold text-white flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-[#DA291C]" />
                        <span>{course.category || 'FTTH'}</span>
                        <span>·</span>
                        <span>Nivel {course.level}</span>
                      </div>
                    </div>
                  </div>
                  <div className="p-4 space-y-2">
                    <h4 className="text-sm font-extrabold text-slate-900 line-clamp-1">
                      {course.title || 'Título de la Nueva Capacitación'}
                    </h4>
                    <p className="text-xs text-slate-600 line-clamp-2">
                      {course.description ||
                        'Experiencia formativa interactiva con slides técnicos, fichas de estudio y evaluaciones por módulo.'}
                    </p>
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] font-mono text-slate-600">
                      <span>
                        {course.modules.length} módulos · {totalFormativeCount} slides ·{' '}
                        {totalQuestionsCount} preguntas
                      </span>
                      <span className="font-bold text-[#DA291C]">
                        {course.estimated_minutes} min
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="px-6 py-3 text-xs font-extrabold text-white bg-[#DA291C] hover:bg-[#B91C1C] rounded-lg inline-flex items-center gap-2 shadow-sm"
            >
              <span>Continuar al Paso 2: “MATERIAL DE REFERENCIA”</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ============================================================================ */}
      {/* PASO 2: COMPONENTE “MATERIAL DE REFERENCIA” Y ANÁLISIS IA */}
      {/* ============================================================================ */}
      {step === 2 && (
        <div className="bg-white border-2 border-slate-200 rounded-xl p-6 lg:p-8 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <div className="text-[11px] font-mono font-bold text-[#DA291C] uppercase tracking-wider">
                FUENTE DE CONOCIMIENTO MULTIFORMATO CONSERVADA
              </div>
              <h3 className="text-base font-extrabold text-slate-900">
                MATERIAL DE REFERENCIA
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Carga múltiples archivos correspondientes al mismo tema (PDF, Word, PowerPoint, TXT, Excel, JPG, JPEG, PNG, Audio, Video). Todos los archivos originales se conservan permanentemente con su metadata.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 bg-slate-100 px-3 py-2 rounded-lg cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoGenerateOnUpload}
                  onChange={(e) => setAutoGenerateOnUpload(e.target.checked)}
                  className="w-4 h-4 accent-[#DA291C]"
                />
                <span>Analizar automáticamente al subir</span>
              </label>

              <button
                type="button"
                disabled={analyzingWithGemini || extractingFiles}
                onClick={() => handleAnalyzeMaterialWithGemini()}
                className="px-4 py-3 text-xs font-extrabold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-xl inline-flex items-center gap-2 shadow-sm transition-colors"
              >
                <Sparkles
                  className={`w-4 h-4 text-amber-400 ${
                    analyzingWithGemini ? 'animate-spin' : ''
                  }`}
                />
                <span>
                  {analyzingWithGemini
                    ? 'Analizando con Gemini...'
                    : 'Analizar material'}
                </span>
              </button>

              <button
                type="button"
                disabled={generatingAi || extractingFiles || analyzingWithGemini}
                onClick={() => handleGenerateStructureFromMaterials()}
                className="px-5 py-3 text-xs font-extrabold text-white bg-[#DA291C] hover:bg-[#B91C1C] disabled:opacity-60 rounded-xl inline-flex items-center gap-2 shadow-sm"
              >
                <Sparkles className="w-4 h-4" />
                <span>
                  {generatingAi
                    ? 'Estructurando formación con IA...'
                    : '✨ ANALIZAR Y CREAR FORMACIÓN CON IA'}
                </span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Drag & Drop Multi-Format Zone */}
            <div className="lg:col-span-5 space-y-4">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingFiles(true);
                }}
                onDragLeave={() => setIsDraggingFiles(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDraggingFiles(false);
                  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    handleFilesSelected(e.dataTransfer.files);
                  }
                }}
                className={`p-6 rounded-xl border-2 border-dashed transition-colors text-center space-y-3 ${
                  isDraggingFiles
                    ? 'border-[#DA291C] bg-red-50/60'
                    : 'border-slate-300 bg-slate-50 hover:border-[#DA291C]'
                }`}
              >
                <div className="w-12 h-12 rounded-full bg-red-50 border border-red-200 flex items-center justify-center mx-auto">
                  <Upload className="w-6 h-6 text-[#DA291C]" />
                </div>
                <div>
                  <div className="text-sm font-extrabold text-slate-900">
                    Cargar múltiples archivos para “{course.title || course.category}”
                  </div>
                  <p className="text-xs text-slate-600 mt-1">
                    Soporta <strong>PDF (.pdf)</strong>, <strong>Word (.docx, .doc)</strong>, <strong>PowerPoint (.pptx, .ppt)</strong>, <strong>TXT / Documentos de texto</strong>, <strong>Imágenes (.jpg, .jpeg, .png, .webp)</strong>, <strong>Audio (.mp3, .wav)</strong>, <strong>Video (.mp4, .webm)</strong> y <strong>Tablas (.xlsx, .csv)</strong>.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <label className="cursor-pointer px-4 py-2.5 text-xs font-extrabold text-white bg-[#DA291C] hover:bg-[#B91C1C] rounded-lg inline-flex items-center gap-2 shadow-2xs">
                    <Plus className="w-4 h-4" />
                    <span>Agregar archivos al Material de Referencia</span>
                    <input
                      type="file"
                      multiple
                      accept="*/*"
                      onChange={(e) => {
                        if (e.target.files) {
                          handleFilesSelected(e.target.files);
                        }
                      }}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {/* Manual / Direct Extract Input */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <h4 className="text-xs font-extrabold text-slate-800">
                  O agregar especificación / documento técnico en texto directo
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <input
                      type="text"
                      value={matTitle}
                      onChange={(e) => setMatTitle(e.target.value)}
                      placeholder="Título del documento, manual o procedimiento..."
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <select
                      value={matType}
                      onChange={(e) =>
                        setMatType(e.target.value as ReferenceMaterialFormat)
                      }
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                    >
                      <option value="pdf">PDF</option>
                      <option value="document">Word (DOCX)</option>
                      <option value="presentation">PowerPoint (PPTX)</option>
                      <option value="spreadsheet">Tabla / Excel</option>
                      <option value="text">TXT / Texto</option>
                      <option value="image">Imagen JPG / PNG</option>
                      <option value="audio">Audio</option>
                      <option value="video">Video</option>
                    </select>
                  </div>
                </div>
                <textarea
                  rows={4}
                  value={matText}
                  onChange={(e) => setMatText(e.target.value)}
                  placeholder="Pega aquí procedimientos, normas técnicas, pasos operativos, casos reales o parámetros del documento de referencia..."
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg font-mono"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleAddManualMaterial}
                    className="px-4 py-2 text-xs font-bold text-slate-900 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5 text-[#DA291C]" />
                    <span>Conservar y Adjuntar al Material</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Uploaded Materials List & Permanent Metadata Inspector */}
            <div className="lg:col-span-7 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-extrabold text-slate-900">
                  Archivos Originales Conservados en Almacenamiento ({course.materials.length})
                </h4>
                <span className="text-[11px] font-mono text-emerald-700 font-semibold">
                  Almacenamiento permanente activo
                </span>
              </div>

              {course.materials.length === 0 ? (
                <div className="p-10 border border-dashed border-slate-300 rounded-xl text-center text-xs text-slate-500 space-y-2">
                  <p className="font-semibold text-slate-700">
                    Aún no has cargado archivos en “MATERIAL DE REFERENCIA”.
                  </p>
                  <p>
                    Sube uno o varios archivos (ej. Manual FTTH.pdf, Procedimiento.docx, Presentación.pptx, Conectores.jpg, CTO.png, Procedimiento.mp4) y luego presiona <strong>“✨ ANALIZAR Y CREAR FORMACIÓN CON IA”</strong>.
                  </p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[580px] overflow-y-auto pr-1">
                  {course.materials.map((m) => {
                    const isExpanded = expandedMaterialId === m.id;
                    const procStatus = m.processing_status || 'PROCESADO';
                    const statusBadgeClass =
                      procStatus === 'PROCESADO'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                        : procStatus === 'PROCESANDO'
                        ? 'bg-amber-50 text-amber-800 border-amber-300'
                        : procStatus === 'ERROR'
                        ? 'bg-red-50 text-red-700 border-red-300'
                        : 'bg-slate-100 text-slate-700 border-slate-300';

                    return (
                      <div
                        key={m.id}
                        className="p-4 bg-white border-2 border-slate-200 rounded-xl space-y-2.5 shadow-2xs"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="flex items-start gap-2.5">
                            {renderMaterialIcon(m.file_type)}
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs font-bold text-slate-900">
                                  {m.file_name || m.title}
                                </span>
                                <span
                                  className={`px-2 py-0.5 text-[10px] font-mono font-extrabold rounded border ${statusBadgeClass}`}
                                >
                                  {procStatus}
                                </span>
                              </div>
                              <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                                ID: <span className="text-slate-700">{m.id.slice(0, 12)}</span> · Formato:{' '}
                                <span className="text-slate-700 uppercase">{m.file_type}</span> · Tamaño:{' '}
                                <span className="text-slate-700">{m.file_size_kb} KB</span> · Fecha:{' '}
                                <span className="text-slate-700">
                                  {new Date(m.uploaded_at).toLocaleString('es-CO')}
                                </span>
                              </div>
                              <div className="text-[11px] font-mono text-slate-500">
                                Capacitación: <span className="text-slate-700">{course.title || course.id.slice(0, 8)}</span> · Cargado por:{' '}
                                <span className="text-slate-700">
                                  {m.uploaded_by_admin || 'Administrador Claro'}
                                </span>
                                {m.persistent_file_url && (
                                  <>
                                    {' '}
                                    ·{' '}
                                    <a
                                      href={m.persistent_file_url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-[#DA291C] font-bold hover:underline"
                                    >
                                      Archivo original conservado ↗
                                    </a>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              disabled={analyzingWithGemini || extractingFiles}
                              onClick={() => handleAnalyzeMaterialWithGemini(m)}
                              className="px-2.5 py-1 text-[11px] font-extrabold text-white bg-slate-900 hover:bg-[#DA291C] disabled:opacity-60 rounded inline-flex items-center gap-1 transition-colors"
                              title="Enviar este documento a Gemini para obtener análisis estructurado"
                            >
                              <Sparkles className="w-3 h-3" />
                              <span>
                                {analyzingWithGemini ? 'Analizando...' : 'Analizar material'}
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedMaterialId(isExpanded ? null : m.id)
                              }
                              className="px-2 py-1 text-[11px] font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded"
                            >
                              {isExpanded ? 'Ocultar detalle' : 'Ver extracción e imágenes'}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setCourse((prev) => ({
                                  ...prev,
                                  materials: prev.materials.filter(
                                    (x) => x.id !== m.id
                                  ),
                                }))
                              }
                              className="text-slate-400 hover:text-red-600 p-1"
                              title="Quitar archivo"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {m.file_type === 'image' && (m.persistent_file_url || m.media_data_url) && (
                          <div className="h-24 rounded-lg overflow-hidden border border-slate-200 bg-slate-100 flex items-center justify-between p-2">
                            <img
                              src={m.persistent_file_url || m.media_data_url}
                              alt={m.title}
                              className="h-full w-auto object-contain rounded"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setCourse((prev) => ({
                                  ...prev,
                                  cover_image_url: (m.persistent_file_url || m.media_data_url)!,
                                }))
                              }
                              className="px-3 py-1.5 text-[11px] font-extrabold text-white bg-[#DA291C] hover:bg-[#B91C1C] rounded-lg"
                            >
                              USAR COMO PORTADA
                            </button>
                          </div>
                        )}

                        {m.file_type === 'audio' && (m.persistent_file_url || m.media_data_url) && (
                          <audio
                            controls
                            src={m.persistent_file_url || m.media_data_url}
                            className="w-full h-8"
                          />
                        )}

                        {m.file_type === 'video' && (m.persistent_file_url || m.media_data_url) && (
                          <video
                            controls
                            src={m.persistent_file_url || m.media_data_url}
                            className="w-full max-h-32 rounded bg-slate-900"
                          />
                        )}

                        {m.classified_images && m.classified_images.length > 0 && (
                          <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                            <div className="text-[11px] font-bold text-slate-800">
                              Imágenes extraídas y clasificadas de este archivo ({m.classified_images.length}):
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                              {m.classified_images.slice(0, 6).map((img) => (
                                <div
                                  key={img.id}
                                  className="p-1.5 bg-white border border-slate-200 rounded flex flex-col justify-between gap-1"
                                >
                                  <div className="h-16 bg-slate-900 rounded overflow-hidden relative">
                                    <ResilientImage
                                      src={img.image_url}
                                      alt={img.title}
                                      className="w-full h-full object-cover"
                                    />
                                    <span className="absolute top-1 left-1 px-1 py-0.5 text-[9px] font-mono font-bold bg-black/75 text-white rounded">
                                      {img.category}
                                    </span>
                                  </div>
                                  <div className="text-[10px] font-semibold text-slate-700 truncate">
                                    {img.title}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setCourse((prev) => ({
                                        ...prev,
                                        cover_image_url: img.image_url,
                                      }))
                                    }
                                    className="w-full py-0.5 text-[9px] font-extrabold text-[#DA291C] bg-red-50 hover:bg-red-100 border border-red-200 rounded"
                                  >
                                    USAR COMO PORTADA
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {m.analysis_summary && (
                          <div className="p-2.5 bg-emerald-50/70 border border-emerald-200 rounded-lg space-y-1.5 text-[11px]">
                            <div className="font-bold text-emerald-950">
                              Resumen detectado: {m.analysis_summary.document_summary}
                            </div>
                            {m.analysis_summary.key_concepts?.length > 0 && (
                              <div className="text-slate-700">
                                <strong className="text-emerald-900">
                                  Conceptos principales ({m.analysis_summary.key_concepts.length}):
                                </strong>{' '}
                                {m.analysis_summary.key_concepts.slice(0, 3).join(' · ')}
                              </div>
                            )}
                            {m.analysis_summary.recommended_steps?.length > 0 && (
                              <div className="text-slate-700">
                                <strong className="text-slate-900">
                                  Procedimientos identificados ({m.analysis_summary.recommended_steps.length}):
                                </strong>{' '}
                                {m.analysis_summary.recommended_steps.slice(0, 2).join(' · ')}
                              </div>
                            )}
                            {m.analysis_summary.identified_competencies &&
                              m.analysis_summary.identified_competencies.length > 0 && (
                                <div className="text-slate-700">
                                  <strong className="text-[#DA291C]">
                                    Competencias identificadas:
                                  </strong>{' '}
                                  {m.analysis_summary.identified_competencies.join(' · ')}
                                </div>
                              )}
                          </div>
                        )}

                        {isExpanded ? (
                          <div className="space-y-1.5 pt-1">
                            <label className="block text-[11px] font-bold text-slate-700">
                              Información extraída del archivo (Puedes revisarla o ampliarla antes de generar):
                            </label>
                            <textarea
                              rows={6}
                              value={m.extracted_text}
                              onChange={(e) => {
                                const val = e.target.value;
                                setCourse((prev) => ({
                                  ...prev,
                                  materials: prev.materials.map((item) =>
                                    item.id === m.id
                                      ? { ...item, extracted_text: val }
                                      : item
                                  ),
                                }));
                              }}
                              className="w-full p-2.5 text-[11px] font-mono bg-slate-50 border border-slate-300 rounded-lg text-slate-800"
                            />
                          </div>
                        ) : (
                          <p className="text-[11px] text-slate-600 bg-slate-50 p-2 rounded border border-slate-100 line-clamp-2 font-mono">
                            {m.extracted_text}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Error Alert for Gemini Analysis (Timeout, API Error, Invalid File, Invalid JSON, Empty Content) */}
          {geminiAnalysisError && (
            <div className="p-4 bg-red-50 border-2 border-red-300 rounded-xl flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 text-[10px] font-mono font-extrabold bg-red-200 text-red-900 rounded">
                    {geminiAnalysisError.code || 'ERROR_ANALISIS'}
                  </span>
                  <span className="text-xs font-extrabold text-red-900">
                    No se pudo completar el análisis del material con Gemini
                  </span>
                </div>
                <p className="text-xs text-red-800">{geminiAnalysisError.message}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={analyzingWithGemini}
                  onClick={() => handleAnalyzeMaterialWithGemini()}
                  className="px-3.5 py-2 text-xs font-extrabold text-white bg-[#DA291C] hover:bg-[#B91C1C] rounded-lg inline-flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Volver a analizar</span>
                </button>
                <button
                  type="button"
                  onClick={() => setGeminiAnalysisError(null)}
                  className="px-2.5 py-2 text-xs font-bold text-red-700 hover:bg-red-100 rounded-lg"
                >
                  Cerrar
                </button>
              </div>
            </div>
          )}

          {/* ============================================================================ */}
          {/* PANTALLA: ANÁLISIS DEL MATERIAL (GEMINI ESTRUCTURADO CON TRAZABILIDAD)       */}
          {/* ============================================================================ */}
          {geminiAnalysis && showGeminiAnalysisScreen && (
            <div className="border-2 border-slate-900 rounded-2xl overflow-hidden bg-white shadow-md space-y-0">
              {/* Top Header Bar */}
              <div className="bg-slate-900 text-white p-5 flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2.5 py-0.5 text-[10px] font-mono font-extrabold bg-[#DA291C] text-white rounded">
                      GEMINI IA · JSON ESTRUCTURADO
                    </span>
                    <span
                      className={`px-2.5 py-0.5 text-[10px] font-mono font-extrabold rounded border ${
                        geminiAnalysis.approvedByTrainer
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/50'
                          : 'bg-amber-500/20 text-amber-300 border-amber-400/50'
                      }`}
                    >
                      {geminiAnalysis.approvedByTrainer
                        ? '✓ ANÁLISIS APROBADO POR EL FORMADOR'
                        : 'PENDIENTE DE APROBACIÓN'}
                    </span>
                    {geminiAnalysis.sourceFileName && (
                      <span className="text-[11px] font-mono text-slate-300">
                        Archivo: {geminiAnalysis.sourceFileName}
                      </span>
                    )}
                  </div>
                  <h3 className="text-lg font-extrabold tracking-tight">
                    Análisis del material
                  </h3>
                  <p className="text-xs text-slate-300">
                    Revisa la información extraída directamente del documento (con página, sección y fragmento de origen) y las sugerencias pedagógicas generadas por Gemini.
                  </p>
                </div>

                {/* Required Action Buttons: Aprobar análisis | Volver a analizar | Editar */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleApproveGeminiAnalysis(false)}
                    className="px-4 py-2.5 text-xs font-extrabold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl inline-flex items-center gap-1.5 shadow-sm transition-colors"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Aprobar análisis</span>
                  </button>

                  <button
                    type="button"
                    disabled={analyzingWithGemini}
                    onClick={() => handleAnalyzeMaterialWithGemini()}
                    className="px-4 py-2.5 text-xs font-extrabold text-white bg-slate-800 hover:bg-slate-700 border border-slate-600 disabled:opacity-60 rounded-xl inline-flex items-center gap-1.5 transition-colors"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${
                        analyzingWithGemini ? 'animate-spin' : ''
                      }`}
                    />
                    <span>Volver a analizar</span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setIsEditingGeminiAnalysis((prev) => !prev)
                    }
                    className={`px-4 py-2.5 text-xs font-extrabold rounded-xl border transition-colors ${
                      isEditingGeminiAnalysis
                        ? 'bg-amber-400 text-slate-950 border-amber-300'
                        : 'bg-white text-slate-900 hover:bg-slate-100 border-white'
                    }`}
                  >
                    {isEditingGeminiAnalysis ? '✓ Finalizar edición' : 'Editar'}
                  </button>
                </div>
              </div>

              {/* Regla Fundamental: Provenance Legend & Filter Bar */}
              <div className="bg-slate-50 border-b border-slate-200 px-5 py-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3 text-[11px]">
                  <span className="font-extrabold text-slate-800 uppercase tracking-wider">
                    Trazabilidad de Origen:
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-900 border border-emerald-300 font-bold">
                    <span className="w-2 h-2 rounded-full bg-emerald-600" />
                    <span>DOCUMENTO: Extraído del documento original (con Página / Sección / Fragmento)</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-50 text-amber-900 border border-amber-300 font-bold">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    <span>GENERADO POR GEMINI: Propuesta pedagógica de IA (No extraída literalmente)</span>
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  {(
                    [
                      { id: 'ALL', label: 'Ver Todo' },
                      { id: 'DOCUMENTO', label: 'Solo del Documento' },
                      { id: 'GENERADO_IA', label: 'Solo Sugerido por Gemini' },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setGeminiOriginFilter(f.id)}
                      className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border transition-colors ${
                        geminiOriginFilter === f.id
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-6 space-y-6">
                {/* 1. Título sugerido, Nivel de dificultad y Resumen */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 p-4 bg-slate-50 border border-slate-200 rounded-xl">
                  <div className="lg:col-span-8 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[11px] font-mono font-extrabold text-[#DA291C] uppercase">
                        Título sugerido por Gemini
                      </span>
                      <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-emerald-50 text-emerald-800 border border-emerald-300 rounded">
                        Nivel de dificultad detectado: {geminiAnalysis.difficulty}
                      </span>
                    </div>
                    {isEditingGeminiAnalysis ? (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="sm:col-span-2">
                          <input
                            type="text"
                            value={geminiAnalysis.documentTitle}
                            onChange={(e) =>
                              setGeminiAnalysis((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      documentTitle: e.target.value,
                                      approvedByTrainer: false,
                                    }
                                  : prev
                              )
                            }
                            className="w-full px-3 py-2 text-sm font-bold bg-white border border-slate-300 rounded-lg"
                          />
                        </div>
                        <div>
                          <select
                            value={geminiAnalysis.difficulty}
                            onChange={(e) =>
                              setGeminiAnalysis((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      difficulty: e.target.value as DifficultyLevel,
                                      approvedByTrainer: false,
                                    }
                                  : prev
                              )
                            }
                            className="w-full px-3 py-2 text-sm font-bold bg-white border border-slate-300 rounded-lg"
                          >
                            <option value="Básico">Básico</option>
                            <option value="Intermedio">Intermedio</option>
                            <option value="Avanzado">Avanzado</option>
                          </select>
                        </div>
                      </div>
                    ) : (
                      <h4 className="text-base font-extrabold text-slate-900">
                        {geminiAnalysis.documentTitle}
                      </h4>
                    )}

                    <div className="pt-1">
                      <div className="text-[11px] font-mono font-extrabold text-slate-700 uppercase mb-1">
                        Resumen
                      </div>
                      {isEditingGeminiAnalysis ? (
                        <textarea
                          rows={3}
                          value={geminiAnalysis.summary}
                          onChange={(e) =>
                            setGeminiAnalysis((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    summary: e.target.value,
                                    approvedByTrainer: false,
                                  }
                                : prev
                            )
                          }
                          className="w-full p-2.5 text-xs bg-white border border-slate-300 rounded-lg"
                        />
                      ) : (
                        <p className="text-xs text-slate-700 leading-relaxed">
                          {geminiAnalysis.summary}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-3.5 flex flex-col justify-between space-y-3">
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-extrabold text-slate-900 uppercase">
                        Síntesis Estructural Detectada
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div className="p-2 bg-slate-50 rounded border border-slate-200">
                          <span className="font-mono font-extrabold text-slate-900">
                            {geminiAnalysis.topics.length}
                          </span>{' '}
                          Temas y{' '}
                          <span className="font-mono font-extrabold text-slate-900">
                            {geminiAnalysis.subtopics.length}
                          </span>{' '}
                          Subtemas
                        </div>
                        <div className="p-2 bg-slate-50 rounded border border-slate-200">
                          <span className="font-mono font-extrabold text-slate-900">
                            {geminiAnalysis.keyConcepts.length}
                          </span>{' '}
                          Conceptos y{' '}
                          <span className="font-mono font-extrabold text-slate-900">
                            {geminiAnalysis.definitions.length}
                          </span>{' '}
                          Definiciones
                        </div>
                        <div className="p-2 bg-slate-50 rounded border border-slate-200">
                          <span className="font-mono font-extrabold text-slate-900">
                            {geminiAnalysis.procedures.length}
                          </span>{' '}
                          Procedimientos
                        </div>
                        <div className="p-2 bg-slate-50 rounded border border-slate-200">
                          <span className="font-mono font-extrabold text-slate-900">
                            {geminiAnalysis.learningObjectives.length}
                          </span>{' '}
                          Objetivos
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={generatingAi}
                      onClick={() => handleApproveGeminiAnalysis(true)}
                      className="w-full py-2.5 px-3 text-xs font-extrabold text-white bg-[#DA291C] hover:bg-[#B91C1C] rounded-lg inline-flex items-center justify-center gap-1.5 shadow-xs transition-colors"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>Aprobar y Generar Módulos/Slides</span>
                    </button>
                  </div>
                </div>

                {/* 2. Temas detectados y Subtemas */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <div className="p-4 border border-slate-200 rounded-xl space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <h5 className="text-xs font-extrabold text-slate-900 uppercase tracking-wide">
                        Temas detectados ({geminiAnalysis.topics.length})
                      </h5>
                      <span className="text-[10px] font-mono text-slate-500">
                        Subtemas: {geminiAnalysis.subtopics.length}
                      </span>
                    </div>
                    <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                      {geminiAnalysis.topics
                        .filter(
                          (item) =>
                            geminiOriginFilter === 'ALL' ||
                            item.origin === geminiOriginFilter
                        )
                        .map((item, idx) => (
                          <div
                            key={item.id || idx}
                            className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5 text-xs"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-1.5">
                              {isEditingGeminiAnalysis ? (
                                <input
                                  type="text"
                                  value={item.title}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setGeminiAnalysis((prev) =>
                                      prev
                                        ? {
                                            ...prev,
                                            topics: prev.topics.map((t, i) =>
                                              i === idx ? { ...t, title: val } : t
                                            ),
                                          }
                                        : prev
                                    );
                                  }}
                                  className="flex-1 px-2 py-1 text-xs font-bold bg-white border border-slate-300 rounded"
                                />
                              ) : (
                                <span className="font-extrabold text-slate-900">
                                  {item.title}
                                </span>
                              )}
                              <span
                                className={`px-2 py-0.5 text-[9px] font-mono font-extrabold rounded border ${
                                  item.origin === 'DOCUMENTO'
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                    : 'bg-amber-50 text-amber-800 border-amber-300'
                                }`}
                              >
                                {item.origin === 'DOCUMENTO'
                                  ? 'DOCUMENTO'
                                  : 'GENERADO POR GEMINI'}
                              </span>
                            </div>
                            {isEditingGeminiAnalysis ? (
                              <textarea
                                rows={2}
                                value={item.description}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setGeminiAnalysis((prev) =>
                                    prev
                                      ? {
                                          ...prev,
                                          topics: prev.topics.map((t, i) =>
                                            i === idx
                                              ? { ...t, description: val }
                                              : t
                                          ),
                                        }
                                      : prev
                                  );
                                }}
                                className="w-full p-1.5 text-[11px] bg-white border border-slate-300 rounded"
                              />
                            ) : (
                              <p className="text-[11px] text-slate-700">
                                {item.description}
                              </p>
                            )}
                            {(item.page || item.section || item.sourceExcerpt) && (
                              <div className="pt-1 border-t border-slate-200/80 text-[10px] font-mono text-slate-500 space-y-0.5">
                                <div>
                                  {item.page ? `Página: ${item.page}` : ''}
                                  {item.page && item.section ? ' · ' : ''}
                                  {item.section ? `Sección: ${item.section}` : ''}
                                </div>
                                {item.sourceExcerpt && (
                                  <div className="italic text-slate-600 bg-white px-2 py-1 rounded border border-slate-200">
                                    Fragmento de origen: “{item.sourceExcerpt}”
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ))}

                      {geminiAnalysis.subtopics.length > 0 && (
                        <div className="pt-2 space-y-1.5">
                          <div className="text-[11px] font-extrabold text-slate-700 uppercase">
                            Subtemas detectados:
                          </div>
                          {geminiAnalysis.subtopics
                            .filter(
                              (st) =>
                                geminiOriginFilter === 'ALL' ||
                                st.origin === geminiOriginFilter
                            )
                            .map((st, sIdx) => (
                              <div
                                key={st.id || sIdx}
                                className="p-2 bg-white border border-slate-200 rounded text-[11px] flex flex-wrap items-center justify-between gap-2"
                              >
                                <div>
                                  <span className="font-bold text-slate-800">
                                    {st.title}:
                                  </span>{' '}
                                  <span className="text-slate-600">
                                    {st.description}
                                  </span>
                                  {st.page && (
                                    <span className="ml-1.5 font-mono text-[10px] text-emerald-700">
                                      (Pág. {st.page})
                                    </span>
                                  )}
                                </div>
                                <span
                                  className={`px-1.5 py-0.5 text-[9px] font-mono font-bold rounded ${
                                    st.origin === 'DOCUMENTO'
                                      ? 'bg-emerald-50 text-emerald-800'
                                      : 'bg-amber-50 text-amber-800'
                                  }`}
                                >
                                  {st.origin === 'DOCUMENTO' ? 'DOC' : 'IA'}
                                </span>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 3. Conceptos clave y Definiciones */}
                  <div className="p-4 border border-slate-200 rounded-xl space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <h5 className="text-xs font-extrabold text-slate-900 uppercase tracking-wide">
                        Conceptos ({geminiAnalysis.keyConcepts.length}) y Definiciones ({geminiAnalysis.definitions.length})
                      </h5>
                    </div>
                    <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                      {geminiAnalysis.keyConcepts
                        .filter(
                          (c) =>
                            geminiOriginFilter === 'ALL' ||
                            c.origin === geminiOriginFilter
                        )
                        .map((concept, idx) => (
                          <div
                            key={concept.id || idx}
                            className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5 text-xs"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-1.5">
                              {isEditingGeminiAnalysis ? (
                                <input
                                  type="text"
                                  value={concept.title}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setGeminiAnalysis((prev) =>
                                      prev
                                        ? {
                                            ...prev,
                                            keyConcepts: prev.keyConcepts.map(
                                              (c, i) =>
                                                i === idx
                                                  ? { ...c, title: val }
                                                  : c
                                            ),
                                          }
                                        : prev
                                    );
                                  }}
                                  className="flex-1 px-2 py-1 text-xs font-bold bg-white border border-slate-300 rounded"
                                />
                              ) : (
                                <span className="font-extrabold text-slate-900">
                                  {concept.title}
                                </span>
                              )}
                              <span
                                className={`px-2 py-0.5 text-[9px] font-mono font-extrabold rounded border ${
                                  concept.origin === 'DOCUMENTO'
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                    : 'bg-amber-50 text-amber-800 border-amber-300'
                                }`}
                              >
                                {concept.origin === 'DOCUMENTO'
                                  ? 'DOCUMENTO'
                                  : 'GENERADO POR GEMINI'}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-700">
                              {concept.description}
                            </p>
                            {(concept.page ||
                              concept.section ||
                              concept.sourceExcerpt) && (
                              <div className="pt-1 border-t border-slate-200/80 text-[10px] font-mono text-slate-500 space-y-0.5">
                                <div>
                                  {concept.page ? `Página: ${concept.page}` : ''}
                                  {concept.page && concept.section ? ' · ' : ''}
                                  {concept.section
                                    ? `Sección: ${concept.section}`
                                    : ''}
                                </div>
                                {concept.sourceExcerpt && (
                                  <div className="italic text-slate-600 bg-white px-2 py-1 rounded border border-slate-200">
                                    Fragmento de origen: “{concept.sourceExcerpt}”
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ))}

                      {geminiAnalysis.definitions.length > 0 && (
                        <div className="pt-2 space-y-1.5">
                          <div className="text-[11px] font-extrabold text-slate-700 uppercase">
                            Definiciones del glosario técnico:
                          </div>
                          {geminiAnalysis.definitions
                            .filter(
                              (d) =>
                                geminiOriginFilter === 'ALL' ||
                                d.origin === geminiOriginFilter
                            )
                            .map((def, dIdx) => (
                              <div
                                key={def.id || dIdx}
                                className="p-2.5 bg-white border border-slate-200 rounded-lg text-[11px] space-y-1"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-extrabold text-slate-900">
                                    {def.term}
                                  </span>
                                  <span
                                    className={`px-1.5 py-0.5 text-[9px] font-mono font-bold rounded ${
                                      def.origin === 'DOCUMENTO'
                                        ? 'bg-emerald-50 text-emerald-800'
                                        : 'bg-amber-50 text-amber-800'
                                    }`}
                                  >
                                    {def.origin === 'DOCUMENTO'
                                      ? `DOCUMENTO${def.page ? ` · Pág. ${def.page}` : ''}`
                                      : 'GENERADO POR GEMINI'}
                                  </span>
                                </div>
                                <p className="text-slate-600">{def.definition}</p>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* 4. Objetivos de aprendizaje y Procedimientos (con Pasos, Ejemplos, Buenas prácticas, Errores frecuentes) */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {/* Objetivos */}
                  <div className="p-4 border border-slate-200 rounded-xl space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <h5 className="text-xs font-extrabold text-slate-900 uppercase tracking-wide">
                        Objetivos ({geminiAnalysis.learningObjectives.length})
                      </h5>
                    </div>
                    <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                      {geminiAnalysis.learningObjectives
                        .filter(
                          (o) =>
                            geminiOriginFilter === 'ALL' ||
                            o.origin === geminiOriginFilter
                        )
                        .map((obj, idx) => (
                          <div
                            key={obj.id || idx}
                            className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5 text-xs"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-extrabold text-slate-900">
                                {obj.title}
                              </span>
                              <span
                                className={`px-2 py-0.5 text-[9px] font-mono font-extrabold rounded border ${
                                  obj.origin === 'DOCUMENTO'
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                    : 'bg-amber-50 text-amber-800 border-amber-300'
                                }`}
                              >
                                {obj.origin === 'DOCUMENTO'
                                  ? 'DOCUMENTO'
                                  : 'GENERADO POR GEMINI'}
                              </span>
                            </div>
                            {isEditingGeminiAnalysis ? (
                              <textarea
                                rows={2}
                                value={obj.description}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setGeminiAnalysis((prev) =>
                                    prev
                                      ? {
                                          ...prev,
                                          learningObjectives:
                                            prev.learningObjectives.map((o, i) =>
                                              i === idx
                                                ? { ...o, description: val }
                                                : o
                                            ),
                                        }
                                      : prev
                                  );
                                }}
                                className="w-full p-1.5 text-[11px] bg-white border border-slate-300 rounded"
                              />
                            ) : (
                              <p className="text-[11px] text-slate-700">
                                {obj.description}
                              </p>
                            )}
                            {(obj.page || obj.section || obj.sourceExcerpt) && (
                              <div className="text-[10px] font-mono text-slate-500">
                                {obj.page ? `Página: ${obj.page}` : ''}
                                {obj.section ? ` · Sección: ${obj.section}` : ''}
                              </div>
                            )}
                          </div>
                        ))}

                      {/* Buenas prácticas y Errores frecuentes */}
                      {geminiAnalysis.bestPractices.length > 0 && (
                        <div className="pt-2 space-y-1.5">
                          <div className="text-[11px] font-extrabold text-emerald-800 uppercase">
                            Buenas prácticas identificadas ({geminiAnalysis.bestPractices.length}):
                          </div>
                          {geminiAnalysis.bestPractices.slice(0, 4).map((bp, bIdx) => (
                            <div
                              key={bp.id || bIdx}
                              className="p-2 bg-emerald-50/60 border border-emerald-200 rounded text-[11px] text-slate-800"
                            >
                              <strong>{bp.title}:</strong> {bp.description}{' '}
                              <span className="font-mono text-[9px] text-emerald-800">
                                [{bp.origin === 'DOCUMENTO' ? `DOC${bp.page ? ` Pág.${bp.page}` : ''}` : 'IA'}]
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {geminiAnalysis.commonErrors.length > 0 && (
                        <div className="pt-2 space-y-1.5">
                          <div className="text-[11px] font-extrabold text-[#DA291C] uppercase">
                            Errores frecuentes y precauciones ({geminiAnalysis.commonErrors.length}):
                          </div>
                          {geminiAnalysis.commonErrors.slice(0, 4).map((ce, cIdx) => (
                            <div
                              key={ce.id || cIdx}
                              className="p-2 bg-red-50/60 border border-red-200 rounded text-[11px] text-slate-800"
                            >
                              <strong>{ce.title}:</strong> {ce.description}{' '}
                              <span className="font-mono text-[9px] text-red-800">
                                [{ce.origin === 'DOCUMENTO' ? `DOC${ce.page ? ` Pág.${ce.page}` : ''}` : 'IA'}]
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Procedimientos, Pasos y Ejemplos */}
                  <div className="p-4 border border-slate-200 rounded-xl space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <h5 className="text-xs font-extrabold text-slate-900 uppercase tracking-wide">
                        Procedimientos ({geminiAnalysis.procedures.length}) y Pasos
                      </h5>
                      <span className="text-[10px] font-mono text-slate-500">
                        Ejemplos: {geminiAnalysis.examples.length}
                      </span>
                    </div>
                    <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                      {geminiAnalysis.procedures
                        .filter(
                          (p) =>
                            geminiOriginFilter === 'ALL' ||
                            p.origin === geminiOriginFilter
                        )
                        .map((proc, idx) => (
                          <div
                            key={proc.id || idx}
                            className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2 text-xs"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-1.5">
                              <span className="font-extrabold text-slate-900">
                                {proc.title}
                              </span>
                              <span
                                className={`px-2 py-0.5 text-[9px] font-mono font-extrabold rounded border ${
                                  proc.origin === 'DOCUMENTO'
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                    : 'bg-amber-50 text-amber-800 border-amber-300'
                                }`}
                              >
                                {proc.origin === 'DOCUMENTO'
                                  ? `DOCUMENTO${proc.page ? ` · Pág. ${proc.page}` : ''}`
                                  : 'GENERADO POR GEMINI'}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-700">
                              {proc.description}
                            </p>
                            {proc.steps && proc.steps.length > 0 && (
                              <ol className="list-decimal list-inside space-y-1 bg-white p-2.5 rounded border border-slate-200 text-[11px] text-slate-800">
                                {proc.steps.map((st, sIdx) => (
                                  <li key={sIdx} className="leading-snug">
                                    {st}
                                  </li>
                                ))}
                              </ol>
                            )}
                            {proc.sourceExcerpt && (
                              <div className="text-[10px] font-mono italic text-slate-600 bg-white px-2 py-1 rounded border border-slate-200">
                                Fragmento de origen: “{proc.sourceExcerpt}”
                              </div>
                            )}
                          </div>
                        ))}

                      {geminiAnalysis.examples.length > 0 && (
                        <div className="pt-2 space-y-1.5">
                          <div className="text-[11px] font-extrabold text-slate-700 uppercase">
                            Ejemplos detectados / propuestos ({geminiAnalysis.examples.length}):
                          </div>
                          {geminiAnalysis.examples.map((ex, eIdx) => (
                            <div
                              key={ex.id || eIdx}
                              className="p-2.5 bg-white border border-slate-200 rounded text-[11px] space-y-0.5"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-slate-900">
                                  {ex.title}
                                </span>
                                <span className="font-mono text-[9px] text-slate-500">
                                  {ex.origin === 'DOCUMENTO'
                                    ? `DOCUMENTO${ex.page ? ` · Pág. ${ex.page}` : ''}`
                                    : 'GENERADO POR GEMINI'}
                                </span>
                              </div>
                              <p className="text-slate-600">{ex.description}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* 5. Actividades sugeridas y Posibles evaluaciones */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <div className="p-4 border border-slate-200 rounded-xl space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <h5 className="text-xs font-extrabold text-slate-900 uppercase tracking-wide">
                        Actividades sugeridas ({geminiAnalysis.suggestedActivities.length})
                      </h5>
                    </div>
                    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                      {geminiAnalysis.suggestedActivities
                        .filter(
                          (a) =>
                            geminiOriginFilter === 'ALL' ||
                            a.origin === geminiOriginFilter
                        )
                        .map((act, idx) => (
                          <div
                            key={act.id || idx}
                            className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1 text-xs"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-extrabold text-slate-900">
                                {act.title}{' '}
                                <span className="text-[10px] font-mono text-[#DA291C]">
                                  ({act.type})
                                </span>
                              </span>
                              <span
                                className={`px-2 py-0.5 text-[9px] font-mono font-extrabold rounded border ${
                                  act.origin === 'DOCUMENTO'
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                    : 'bg-amber-50 text-amber-800 border-amber-300'
                                }`}
                              >
                                {act.origin === 'DOCUMENTO'
                                  ? 'DOCUMENTO'
                                  : 'GENERADO POR GEMINI'}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-700">
                              {act.description}
                            </p>
                          </div>
                        ))}
                    </div>
                  </div>

                  <div className="p-4 border border-slate-200 rounded-xl space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <h5 className="text-xs font-extrabold text-slate-900 uppercase tracking-wide">
                        Posibles evaluaciones ({geminiAnalysis.possibleEvaluations.length})
                      </h5>
                    </div>
                    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                      {geminiAnalysis.possibleEvaluations
                        .filter(
                          (ev) =>
                            geminiOriginFilter === 'ALL' ||
                            ev.origin === geminiOriginFilter
                        )
                        .map((ev, idx) => (
                          <div
                            key={ev.id || idx}
                            className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1 text-xs"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-extrabold text-slate-900">
                                {ev.questionPrompt}
                              </span>
                              <span
                                className={`px-2 py-0.5 text-[9px] font-mono font-extrabold rounded border shrink-0 ${
                                  ev.origin === 'DOCUMENTO'
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                    : 'bg-amber-50 text-amber-800 border-amber-300'
                                }`}
                              >
                                {ev.origin === 'DOCUMENTO'
                                  ? `DOC${ev.page ? ` Pág.${ev.page}` : ''}`
                                  : 'GENERADO IA'}
                              </span>
                            </div>
                            <p className="text-[11px] text-emerald-900 font-semibold">
                              Respuesta esperada: {ev.correctAnswerSummary}
                            </p>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 inline-flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Anterior</span>
            </button>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={analyzingWithGemini || extractingFiles}
                onClick={() => handleAnalyzeMaterialWithGemini()}
                className="px-4 py-2.5 text-xs font-extrabold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-lg inline-flex items-center gap-2 shadow-sm"
              >
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>
                  {analyzingWithGemini ? 'Analizando con Gemini...' : 'Analizar material'}
                </span>
              </button>
              <button
                type="button"
                disabled={generatingAi || extractingFiles || analyzingWithGemini}
                onClick={() => handleGenerateStructureFromMaterials()}
                className="px-5 py-2.5 text-xs font-extrabold text-white bg-[#DA291C] hover:bg-[#B91C1C] rounded-lg inline-flex items-center gap-2 shadow-sm"
              >
                <Sparkles className="w-4 h-4" />
                <span>✨ ANALIZAR Y CREAR FORMACIÓN CON IA</span>
              </button>
              <button
                type="button"
                onClick={() => setStep(3)}
                className="px-5 py-2.5 text-xs font-extrabold text-white bg-slate-900 hover:bg-slate-800 rounded-lg inline-flex items-center gap-2"
              >
                <span>Ir al Paso 3: Módulos, Slides y Evaluaciones</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================================ */}
      {/* PASO 3: REVISIÓN Y EDICIÓN DE MÓDULOS, SLIDES INTERACTIVOS, FICHAS Y EVALUACIONES */}
      {/* ============================================================================ */}
      {step === 3 && (
        <div className="space-y-5">
          {/* AI Analysis & Generated Content Breakdown Banner */}
          <div className="bg-white border-2 border-slate-200 rounded-xl p-5 space-y-4 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-[11px] font-mono font-bold text-[#DA291C] uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>EXPERIENCIA FORMATIVA GENERADA EN BORRADOR (LISTA PARA REVISIÓN)</span>
                </div>
                <h3 className="text-base font-extrabold text-slate-900 mt-0.5">
                  Módulos Pedagógicos, Slides Interactivos, Fichas de Estudio y Evaluaciones (Mín. 5 por Módulo)
                </h3>
                {course.ai_analysis_summary?.document_summary && (
                  <p className="text-xs text-slate-600 mt-1 max-w-4xl">
                    {course.ai_analysis_summary.document_summary}
                  </p>
                )}
              </div>

              <button
                type="button"
                disabled={generatingAi}
                onClick={() => handleGenerateStructureFromMaterials()}
                className="px-4 py-2 text-xs font-extrabold text-[#DA291C] bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg inline-flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>✨ Re-analizar Material con IA</span>
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <button
                type="button"
                onClick={() => setStep3Filter('all')}
                className={`p-3 rounded-xl border text-left transition-colors ${
                  step3Filter === 'all'
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-slate-50 text-slate-800 border-slate-200 hover:border-slate-400'
                }`}
              >
                <div className="text-[11px] font-mono opacity-80">TOTAL BLOQUES</div>
                <div className="text-lg font-extrabold font-mono mt-0.5">
                  {totalFormativeCount + totalQuestionsCount + totalCasesCount} Bloques
                </div>
                <div className="text-[11px] opacity-80">
                  En {course.modules.length} módulos
                </div>
              </button>

              <button
                type="button"
                onClick={() => setStep3Filter('formative')}
                className={`p-3 rounded-xl border text-left transition-colors ${
                  step3Filter === 'formative'
                    ? 'bg-[#DA291C] text-white border-[#DA291C]'
                    : 'bg-white text-slate-800 border-slate-200 hover:border-[#DA291C]'
                }`}
              >
                <div className="text-[11px] font-mono opacity-80">
                  1. SLIDES INTERACTIVOS
                </div>
                <div className="text-lg font-extrabold font-mono mt-0.5">
                  {totalFormativeCount} Slides
                </div>
                <div className="text-[11px] opacity-80">
                  Tarjetas, acordeones, hotspots
                </div>
              </button>

              <button
                type="button"
                onClick={() => setStep3Filter('questions')}
                className={`p-3 rounded-xl border text-left transition-colors ${
                  step3Filter === 'questions'
                    ? 'bg-[#DA291C] text-white border-[#DA291C]'
                    : 'bg-white text-slate-800 border-slate-200 hover:border-[#DA291C]'
                }`}
              >
                <div className="text-[11px] font-mono opacity-80">
                  2. EVALUACIONES
                </div>
                <div className="text-lg font-extrabold font-mono mt-0.5">
                  {totalQuestionsCount} Preguntas
                </div>
                <div className="text-[11px] opacity-80">
                  Mín. 5 por módulo + feedback
                </div>
              </button>

              <button
                type="button"
                onClick={() => setStep3Filter('cases')}
                className={`p-3 rounded-xl border text-left transition-colors ${
                  step3Filter === 'cases'
                    ? 'bg-[#DA291C] text-white border-[#DA291C]'
                    : 'bg-white text-slate-800 border-slate-200 hover:border-[#DA291C]'
                }`}
              >
                <div className="text-[11px] font-mono opacity-80">
                  3. CASOS PRÁCTICOS
                </div>
                <div className="text-lg font-extrabold font-mono mt-0.5">
                  {totalCasesCount} Casos Reales
                </div>
                <div className="text-[11px] opacity-80">
                  Escenarios reales de decisión
                </div>
              </button>

              <button
                type="button"
                onClick={() => setStep3Filter('study_cards')}
                className={`p-3 rounded-xl border text-left transition-colors ${
                  step3Filter === 'study_cards'
                    ? 'bg-[#DA291C] text-white border-[#DA291C]'
                    : 'bg-white text-slate-800 border-slate-200 hover:border-[#DA291C]'
                }`}
              >
                <div className="text-[11px] font-mono opacity-80">
                  4. FICHAS DE ESTUDIO
                </div>
                <div className="text-lg font-extrabold font-mono mt-0.5">
                  {totalStudyCardsCount} Fichas
                </div>
                <div className="text-[11px] opacity-80">
                  Material ampliado por módulo
                </div>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: Modules & Slides Tree (5 cols) */}
            <div className="lg:col-span-5 bg-white border-2 border-slate-200 rounded-xl p-5 space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-sm font-extrabold text-slate-900">
                  Módulos ({course.modules.length})
                </h3>
                <button
                  type="button"
                  onClick={addModule}
                  className="px-2.5 py-1.5 text-xs font-bold text-[#DA291C] bg-red-50 hover:bg-red-100 border border-red-200 rounded-md inline-flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Nuevo módulo</span>
                </button>
              </div>

              <div className="space-y-2">
                {course.modules.map((mod, mIdx) => (
                  <div
                    key={mod.id}
                    className={`p-3 rounded-lg border transition-colors ${
                      activeModIdx === mIdx
                        ? 'bg-red-50/60 border-[#DA291C]'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveModIdx(mIdx);
                          setEditingItemIdx(0);
                        }}
                        className="text-left text-xs font-bold text-slate-900 flex-1 truncate"
                      >
                        {mIdx + 1}. {mod.title} ({mod.items.length} bloques)
                      </button>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => moveModule(mIdx, -1)}
                          className="p-1 text-slate-500 hover:text-slate-900"
                          title="Subir módulo"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveModule(mIdx, 1)}
                          className="p-1 text-slate-500 hover:text-slate-900"
                          title="Bajar módulo"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteModule(mIdx)}
                          className="p-1 text-slate-400 hover:text-red-600"
                          title="Eliminar módulo"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {activeModule && (
                <div className="pt-4 border-t border-slate-200 space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Título del módulo activo
                    </label>
                    <input
                      type="text"
                      value={activeModule.title}
                      onChange={(e) => {
                        const mods = [...course.modules];
                        mods[activeModIdx] = {
                          ...activeModule,
                          title: e.target.value,
                        };
                        setCourse((prev) => ({ ...prev, modules: mods }));
                      }}
                      className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-md"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs font-extrabold text-slate-800">
                      Bloques del módulo ({activeModule.items.length})
                    </span>
                    {step3Filter !== 'all' && (
                      <button
                        type="button"
                        onClick={() => setStep3Filter('all')}
                        className="text-[11px] font-bold text-[#DA291C] hover:underline"
                      >
                        Mostrar todos
                      </button>
                    )}
                  </div>

                  <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
                    {activeModule.items.map((it, idx) => {
                      if (
                        step3Filter === 'formative' &&
                        (it.content_type === 'question' ||
                          it.content_type === 'case_study' ||
                          it.content_type === 'evaluation')
                      ) {
                        return null;
                      }
                      if (
                        step3Filter === 'questions' &&
                        it.content_type !== 'question' &&
                        it.content_type !== 'evaluation'
                      ) {
                        return null;
                      }
                      if (
                        step3Filter === 'cases' &&
                        it.content_type !== 'case_study'
                      ) {
                        return null;
                      }

                      const badgeLabel =
                        it.content_type === 'case_study'
                          ? 'CASO PRÁCTICO'
                          : it.content_type === 'question'
                          ? 'PREGUNTA'
                          : it.content_type === 'evaluation'
                          ? 'EVALUACIÓN'
                          : 'FORMATIVO';

                      return (
                        <div
                          key={it.id}
                          className={`p-2.5 rounded-md border flex items-center justify-between gap-2 ${
                            editingItemIdx === idx
                              ? 'bg-slate-900 text-white border-slate-900'
                              : 'bg-white border-slate-200 text-slate-800'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => setEditingItemIdx(idx)}
                            className="text-left text-xs flex-1 truncate"
                          >
                            <span className="font-mono opacity-75 mr-1.5 text-[10px]">
                              #{idx + 1} [{badgeLabel}]
                            </span>
                            <span className="font-semibold">{it.title}</span>
                          </button>
                          <div className="flex items-center gap-0.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => moveSlide(idx, -1)}
                              className="p-1 opacity-75 hover:opacity-100"
                            >
                              <ArrowUp className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveSlide(idx, 1)}
                              className="p-1 opacity-75 hover:opacity-100"
                            >
                              <ArrowDown className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteSlide(idx)}
                              className="p-1 opacity-75 hover:text-red-400"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Add Slide / Question / Case Study Buttons */}
                  <div className="pt-2">
                    <div className="text-[11px] font-bold text-slate-600 mb-1.5">
                      Agregar manualmente otro bloque al módulo:
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {(
                        [
                          { type: 'title', label: '+ Portada' },
                          { type: 'text', label: '+ Material Teórico' },
                          { type: 'steps', label: '+ Procedimiento Paso a Paso' },
                          { type: 'highlight', label: '+ Regla / Concepto Clave' },
                          { type: 'question', label: '+ Pregunta Evaluativa' },
                          { type: 'case_study', label: '+ Caso Práctico Real' },
                          { type: 'evaluation', label: '+ Evaluación Final' },
                        ] as Array<{ type: ContentType; label: string }>
                      ).map((btn) => (
                        <button
                          key={btn.type}
                          type="button"
                          onClick={() => addSlideToModule(btn.type)}
                          className="px-2.5 py-1 text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 rounded transition-colors"
                        >
                          {btn.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right Column: Active Slide / Question / Practical Case / Study Cards Editor (7 cols) */}
            <div className="lg:col-span-7 bg-white border-2 border-slate-200 rounded-xl p-6 space-y-5">
              {step3Filter === 'study_cards' && activeModule ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                    <div>
                      <div className="text-[11px] font-mono font-bold text-[#DA291C] uppercase">
                        MATERIAL AMPLIADO DE ESTUDIO POR MÓDULO
                      </div>
                      <h3 className="text-sm font-extrabold text-slate-900">
                        Fichas de Estudio de {activeModule.title} ({(activeModule.study_cards || []).length})
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const mods = [...course.modules];
                        const existingCards = activeModule.study_cards || [];
                        mods[activeModIdx] = {
                          ...activeModule,
                          study_cards: [
                            ...existingCards,
                            {
                              id: crypto.randomUUID(),
                              title: `Ficha Técnica #${existingCards.length + 1}: ${activeModule.title}`,
                              category: 'Especificación Técnica',
                              summary:
                                'Resumen técnico detallado y parámetros operativos para estudio del módulo.',
                              key_points: [
                                'Criterio normativo principal de verificación en campo.',
                                'Procedimiento de aseguramiento de calidad antes del cierre.',
                              ],
                              warning_note:
                                'Cumplir estrictamente con el estándar operativo de red.',
                            },
                          ],
                        };
                        setCourse((prev) => ({ ...prev, modules: mods }));
                      }}
                      className="px-3 py-1.5 text-xs font-bold text-white bg-[#DA291C] hover:bg-[#B91C1C] rounded-lg inline-flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Agregar Ficha de Estudio</span>
                    </button>
                  </div>

                  {(activeModule.study_cards || []).length === 0 ? (
                    <div className="p-8 bg-slate-50 border border-dashed border-slate-300 rounded-xl text-center text-xs text-slate-500">
                      Este módulo aún no tiene fichas de estudio adicionales. Presiona "Agregar Ficha de Estudio" o "Re-analizar Material con IA".
                    </div>
                  ) : (
                    <div className="space-y-4 max-h-[620px] overflow-y-auto pr-1">
                      {(activeModule.study_cards || []).map((card, cIdx) => (
                        <div
                          key={card.id || cIdx}
                          className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="px-2 py-0.5 text-[10px] font-mono font-extrabold bg-red-50 text-[#DA291C] border border-red-200 rounded">
                              FICHA #{cIdx + 1} · {card.category}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                const mods = [...course.modules];
                                mods[activeModIdx] = {
                                  ...activeModule,
                                  study_cards: (activeModule.study_cards || []).filter(
                                    (_, i) => i !== cIdx
                                  ),
                                };
                                setCourse((prev) => ({ ...prev, modules: mods }));
                              }}
                              className="text-slate-400 hover:text-red-600 p-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <input
                            type="text"
                            value={card.title}
                            onChange={(e) => {
                              const mods = [...course.modules];
                              const cards = [...(activeModule.study_cards || [])];
                              cards[cIdx] = { ...cards[cIdx], title: e.target.value };
                              mods[activeModIdx] = { ...activeModule, study_cards: cards };
                              setCourse((prev) => ({ ...prev, modules: mods }));
                            }}
                            className="w-full px-3 py-1.5 text-xs font-bold bg-white border border-slate-300 rounded-lg"
                          />
                          <textarea
                            rows={2}
                            value={card.summary}
                            onChange={(e) => {
                              const mods = [...course.modules];
                              const cards = [...(activeModule.study_cards || [])];
                              cards[cIdx] = { ...cards[cIdx], summary: e.target.value };
                              mods[activeModIdx] = { ...activeModule, study_cards: cards };
                              setCourse((prev) => ({ ...prev, modules: mods }));
                            }}
                            className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                          />
                          <div>
                            <label className="block text-[11px] font-bold text-slate-700 mb-1">
                              Puntos clave de estudio (1 por línea):
                            </label>
                            <textarea
                              rows={4}
                              value={(card.key_points || []).join('\n')}
                              onChange={(e) => {
                                const mods = [...course.modules];
                                const cards = [...(activeModule.study_cards || [])];
                                cards[cIdx] = {
                                  ...cards[cIdx],
                                  key_points: e.target.value
                                    .split('\n')
                                    .map((s) => s.trim())
                                    .filter(Boolean),
                                };
                                mods[activeModIdx] = { ...activeModule, study_cards: cards };
                                setCourse((prev) => ({ ...prev, modules: mods }));
                              }}
                              className="w-full px-3 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded-lg"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : !activeItem ? (
                <div className="py-16 text-center text-xs text-slate-500">
                  Selecciona un bloque de la lista izquierda o agrega una pantalla formativa, pregunta evaluativa o caso práctico real para editarlo.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <h3 className="text-sm font-extrabold text-slate-900">
                      Editando Bloque #{editingItemIdx! + 1} ({activeItem.content_type})
                    </h3>
                    <select
                      value={activeItem.content_type}
                      onChange={(e) =>
                        updateEditingItem((it) => ({
                          ...it,
                          content_type: e.target.value as ContentType,
                        }))
                      }
                      className="px-2.5 py-1 text-xs border border-slate-300 rounded bg-white"
                    >
                      <option value="title">Título / Portada</option>
                      <option value="text">Material Formativo (Viñetas)</option>
                      <option value="image">Imagen / Esquema Técnico</option>
                      <option value="video">Video</option>
                      <option value="highlight">Concepto Destacado</option>
                      <option value="instructions">Instrucciones</option>
                      <option value="steps">Procedimiento Paso a Paso</option>
                      <option value="question">Pregunta Evaluativa</option>
                      <option value="case_study">Caso Práctico Real</option>
                      <option value="evaluation">Evaluación Certificadora</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Título de la pantalla
                      </label>
                      <input
                        type="text"
                        value={activeItem.title}
                        onChange={(e) =>
                          updateEditingItem((it) => ({
                            ...it,
                            title: e.target.value,
                          }))
                        }
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Subtítulo
                      </label>
                      <input
                        type="text"
                        value={activeItem.subtitle || ''}
                        onChange={(e) =>
                          updateEditingItem((it) => ({
                            ...it,
                            subtitle: e.target.value,
                          }))
                        }
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                      />
                    </div>
                  </div>

                  {!activeItem.question ? (
                    <>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Contenido Formativo Extraído (Cada línea se presenta con viñeta corporativa roja)
                        </label>
                        <textarea
                          rows={5}
                          value={activeItem.body || ''}
                          onChange={(e) =>
                            updateEditingItem((it) => ({
                              ...it,
                              body: e.target.value,
                            }))
                          }
                          className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                        />
                      </div>

                      {Array.isArray(activeItem.steps) &&
                        activeItem.steps.length > 0 && (
                          <div className="space-y-2 p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                            <div className="text-xs font-bold text-slate-800">
                              Secuencia Paso a Paso Extraída del Material ({activeItem.steps.length} pasos)
                            </div>
                            {activeItem.steps.map((st, sIdx) => (
                              <div
                                key={sIdx}
                                className="p-2.5 bg-white border border-slate-200 rounded-lg space-y-1.5"
                              >
                                <div className="text-[11px] font-bold text-[#DA291C]">
                                  Paso {st.step_number || sIdx + 1}
                                </div>
                                <input
                                  type="text"
                                  value={st.title}
                                  onChange={(e) =>
                                    updateEditingItem((it) => {
                                      const nextSteps = [...(it.steps || [])];
                                      nextSteps[sIdx] = {
                                        ...nextSteps[sIdx],
                                        title: e.target.value,
                                      };
                                      return { ...it, steps: nextSteps };
                                    })
                                  }
                                  className="w-full px-2.5 py-1 text-xs font-semibold border border-slate-300 rounded"
                                />
                                <textarea
                                  rows={2}
                                  value={st.description}
                                  onChange={(e) =>
                                    updateEditingItem((it) => {
                                      const nextSteps = [...(it.steps || [])];
                                      nextSteps[sIdx] = {
                                        ...nextSteps[sIdx],
                                        description: e.target.value,
                                      };
                                      return { ...it, steps: nextSteps };
                                    })
                                  }
                                  className="w-full px-2.5 py-1 text-xs border border-slate-300 rounded"
                                />
                              </div>
                            ))}
                          </div>
                        )}

                      {/* Visual Resource / Image Manager for this Slide */}
                      <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-800">
                              Imagen o Esquema Didáctico del Slide
                            </span>
                            {(activeSlideImageProvenance?.category || activeItem.image_category) && (
                              <span className="px-2 py-0.5 text-[10px] font-mono font-extrabold bg-slate-900 text-white rounded">
                                {activeSlideImageProvenance?.category || activeItem.image_category}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setShowMaterialImagePicker((prev) => !prev);
                                setSelectedGalleryImageUrl(activeItem.media_url || null);
                              }}
                              className={`px-2.5 py-1 text-[11px] font-bold rounded border inline-flex items-center gap-1 transition-colors ${
                                showMaterialImagePicker
                                  ? 'bg-slate-900 text-white border-slate-900'
                                  : 'bg-white hover:bg-slate-100 text-slate-800 border-slate-300'
                              }`}
                            >
                              <ImageIcon className="w-3 h-3 text-[#DA291C]" />
                              <span>Seleccionar del material ({allClassifiedImages.length})</span>
                            </button>

                            <label className="cursor-pointer px-2.5 py-1 text-[11px] font-bold bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded inline-flex items-center gap-1">
                              <Upload className="w-3 h-3" />
                              <span>Subir / Reemplazar imagen</span>
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  const reader = new FileReader();
                                  reader.onload = () => {
                                    if (typeof reader.result === 'string') {
                                      updateEditingItem((it) => ({
                                        ...it,
                                        media_url: reader.result as string,
                                        media_source_type: 'manual_upload',
                                        media_source_file: file.name,
                                        media_source_page: undefined,
                                        image_category: 'FOTOGRAFÍA',
                                        media_classification: 'FOTOGRAFÍA',
                                        media_caption: `Imagen cargada manualmente: ${file.name}`,
                                      }));
                                    }
                                  };
                                  reader.readAsDataURL(file);
                                }}
                              />
                            </label>

                            <button
                              type="button"
                              onClick={() =>
                                handleRequestThematicIllustration(
                                  'slide',
                                  activeItem.title
                                )
                              }
                              className="px-2.5 py-1 text-[11px] font-bold bg-red-50 hover:bg-red-100 text-[#DA291C] border border-red-200 rounded inline-flex items-center gap-1"
                            >
                              <RefreshCw className="w-3 h-3" />
                              <span>Generar esquema automático</span>
                            </button>
                          </div>
                        </div>

                        {activeItem.media_url && (
                          <div className="space-y-2">
                            <div className="h-44 rounded-lg overflow-hidden border border-slate-200 bg-white relative">
                              <ResilientImage
                                src={activeItem.media_url}
                                alt={activeItem.title}
                                className="w-full h-full object-contain"
                              />
                            </div>

                            {/* Section 6: Mostrar Procedencia discretamente al administrador */}
                            {activeSlideImageProvenance && (
                              <div className="px-3 py-2 bg-white border border-slate-200 rounded-lg flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                                  <div>
                                    <span className="font-semibold text-slate-500">
                                      Origen de imagen:{' '}
                                    </span>
                                    <span className="font-mono font-bold text-slate-800">
                                      {activeSlideImageProvenance.fileName}
                                    </span>
                                  </div>
                                  {activeSlideImageProvenance.pageNumber !== undefined && (
                                    <div>
                                      <span className="font-semibold text-slate-500">
                                        Página:{' '}
                                      </span>
                                      <span className="font-mono font-bold text-slate-800">
                                        {activeSlideImageProvenance.pageNumber}
                                      </span>
                                    </div>
                                  )}
                                </div>

                                <div className="flex items-center gap-1.5">
                                  {activeSlideImageProvenance.sourceType === 'material_reference' ? (
                                    <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 rounded">
                                      Imagen tomada del material de referencia
                                    </span>
                                  ) : activeSlideImageProvenance.sourceType === 'manual_upload' ? (
                                    <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-blue-50 text-blue-800 border border-blue-200 rounded">
                                      Imagen cargada manualmente
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-amber-50 text-amber-800 border border-amber-200 rounded">
                                      Esquema didáctico automático del slide
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Sections 7 & 8: Galería Inteligente "Seleccionar del material" */}
                        {showMaterialImagePicker && (
                          <div className="mt-2 p-4 bg-white border-2 border-slate-800 rounded-xl space-y-4 shadow-sm">
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
                              <div>
                                <div className="text-[10px] font-mono font-extrabold text-[#DA291C] uppercase">
                                  GALERÍA INTELIGENTE DE RECURSOS VISUALES DEL MATERIAL
                                </div>
                                <div className="text-xs font-extrabold text-slate-900">
                                  Seleccionar imagen o diagrama extraído para: "{activeItem.title}"
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => setShowMaterialImagePicker(false)}
                                className="px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded"
                              >
                                Cerrar galería
                              </button>
                            </div>

                            {/* Section 8: "Recomendadas para este slide" */}
                            {!showDiscardedInGallery && recommendedImagesForActiveSlide.length > 0 && (
                              <div className="p-3 bg-red-50/60 border border-red-200 rounded-xl space-y-2.5">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="inline-flex items-center gap-1.5 text-xs font-extrabold text-[#DA291C]">
                                    <Sparkles className="w-3.5 h-3.5" />
                                    <span>
                                      Recomendadas para este slide ({recommendedImagesForActiveSlide.length})
                                    </span>
                                  </div>
                                  <span className="text-[10px] font-mono text-slate-600">
                                    Seleccionadas por afinidad semántica con el título, concepto y procedimiento
                                  </span>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                                  {recommendedImagesForActiveSlide.map((recImg) => {
                                    const isCurrent = activeItem.media_url === recImg.image_url;
                                    return (
                                      <div
                                        key={`rec-${recImg.id || recImg.image_url}`}
                                        className={`p-2 rounded-lg border bg-white flex flex-col justify-between gap-2 transition-all ${
                                          isCurrent
                                            ? 'border-2 border-[#DA291C] ring-2 ring-red-100'
                                            : 'border-slate-200 hover:border-slate-400'
                                        }`}
                                      >
                                        <div className="space-y-1.5">
                                          <div className="h-24 bg-slate-900 rounded overflow-hidden relative">
                                            <ResilientImage
                                              src={recImg.image_url}
                                              alt={recImg.title}
                                              className="w-full h-full object-contain"
                                            />
                                            <span className="absolute top-1 left-1 px-1.5 py-0.5 text-[9px] font-mono font-bold bg-black/80 text-white rounded">
                                              {recImg.category}
                                            </span>
                                            <span className="absolute top-1 right-1 px-1.5 py-0.5 text-[9px] font-mono font-bold bg-[#DA291C] text-white rounded">
                                              {recImg.affinityPct}% compatible
                                            </span>
                                          </div>
                                          <div className="text-[11px] font-bold text-slate-900 line-clamp-1">
                                            {recImg.title}
                                          </div>
                                          <div className="text-[10px] text-slate-600 space-y-0.5 font-mono">
                                            <div className="truncate">
                                              Origen: <span className="font-semibold text-slate-800">{recImg.source_file_name}</span>
                                            </div>
                                            {recImg.page_number !== undefined && (
                                              <div>
                                                Página: <span className="font-semibold text-slate-800">{recImg.page_number}</span>
                                              </div>
                                            )}
                                          </div>
                                          <div className="text-[10px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5 line-clamp-1">
                                            {recImg.compatibilityReason}
                                          </div>
                                        </div>

                                        <button
                                          type="button"
                                          onClick={() => {
                                            updateEditingItem((it) => ({
                                              ...it,
                                              media_url: recImg.image_url,
                                              image_category: recImg.category,
                                              media_classification: recImg.category,
                                              media_caption: recImg.caption || recImg.description,
                                              media_source_type: 'material_reference',
                                              media_source_file: recImg.source_file_name,
                                              media_source_page: recImg.page_number,
                                              media_source_section: recImg.source_section,
                                              media_keywords: recImg.keywords,
                                            }));
                                            setSelectedGalleryImageUrl(recImg.image_url);
                                          }}
                                          className={`w-full py-1.5 px-2 text-[10px] font-mono font-extrabold rounded transition-colors ${
                                            isCurrent
                                              ? 'bg-emerald-700 text-white'
                                              : 'bg-[#DA291C] hover:bg-[#B91C1C] text-white'
                                          }`}
                                        >
                                          {isCurrent ? '✓ EN USO EN ESTE SLIDE' : 'USAR EN ESTE SLIDE'}
                                        </button>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* Filter Controls: By Source File, By Category, and Search */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                              <div>
                                <label className="block text-[10px] font-mono font-bold text-slate-600 mb-1">
                                  FILTRAR POR ARCHIVO DE ORIGEN
                                </label>
                                <select
                                  value={galleryFileFilter}
                                  onChange={(e) => setGalleryFileFilter(e.target.value)}
                                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                                >
                                  <option value="ALL">
                                    Todos los archivos ({availableMaterialFiles.length})
                                  </option>
                                  {availableMaterialFiles.map((fName) => (
                                    <option key={fName} value={fName}>
                                      {fName}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label className="block text-[10px] font-mono font-bold text-slate-600 mb-1">
                                  CLASIFICACIÓN DEL RECURSO
                                </label>
                                <select
                                  value={galleryCategoryFilter}
                                  onChange={(e) => setGalleryCategoryFilter(e.target.value)}
                                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                                >
                                  <option value="ALL">Todas las categorías</option>
                                  <option value="FOTOGRAFÍA">FOTOGRAFÍA</option>
                                  <option value="DIAGRAMA">DIAGRAMA</option>
                                  <option value="ESQUEMA">ESQUEMA</option>
                                  <option value="ILUSTRACIÓN">ILUSTRACIÓN</option>
                                  <option value="TABLA">TABLA</option>
                                  <option value="GRÁFICO">GRÁFICO</option>
                                  <option value="CAPTURA">CAPTURA</option>
                                  <option value="OTRO">OTRO</option>
                                </select>
                              </div>

                              <div>
                                <label className="block text-[10px] font-mono font-bold text-slate-600 mb-1">
                                  BUSCAR POR CONCEPTO O PÁGINA
                                </label>
                                <input
                                  type="text"
                                  value={gallerySearchQuery}
                                  onChange={(e) => setGallerySearchQuery(e.target.value)}
                                  placeholder="Ej: conector, bandeja, 450, pág 5..."
                                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                                />
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
                              <span className="font-bold text-slate-800">
                                {showDiscardedInGallery
                                  ? `Recursos descartados automáticamente por bajo valor pedagógico (${filteredGalleryImages.length})`
                                  : `Todas las imágenes válidas del material (${filteredGalleryImages.length})`}
                              </span>
                              {discardedMaterialImages.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setShowDiscardedInGallery((prev) => !prev)}
                                  className="text-[10px] font-mono font-semibold text-slate-500 hover:text-slate-800 underline"
                                >
                                  {showDiscardedInGallery
                                    ? 'Volver a imágenes pedagógicas válidas'
                                    : `Ver recursos descartados (logos/duplicados: ${discardedMaterialImages.length})`}
                                </button>
                              )}
                            </div>

                            {filteredGalleryImages.length === 0 ? (
                              <div className="p-6 text-center bg-slate-50 border border-dashed border-slate-300 rounded-lg text-xs text-slate-500">
                                No se encontraron imágenes con los filtros seleccionados. Puedes usar "Generar esquema automático" o "Subir / Reemplazar imagen".
                              </div>
                            ) : (
                              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 max-h-72 overflow-y-auto pr-1">
                                {filteredGalleryImages.map((img) => {
                                  const isSelected =
                                    (selectedGalleryImageUrl || activeItem.media_url) ===
                                    img.image_url;
                                  const isCurrentSlideImg =
                                    activeItem.media_url === img.image_url;

                                  return (
                                    <div
                                      key={img.id || img.image_url}
                                      onClick={() => setSelectedGalleryImageUrl(img.image_url)}
                                      className={`cursor-pointer p-2 rounded-lg border text-left flex flex-col justify-between gap-1.5 transition-all ${
                                        isSelected
                                          ? 'border-2 border-[#DA291C] bg-red-50/40'
                                          : 'border-slate-200 bg-white hover:border-slate-400'
                                      }`}
                                    >
                                      <div>
                                        <div className="h-20 bg-slate-900 rounded overflow-hidden relative">
                                          <ResilientImage
                                            src={img.image_url}
                                            alt={img.title}
                                            className="w-full h-full object-contain"
                                          />
                                          <span className="absolute bottom-1 left-1 px-1.5 py-0.5 text-[8px] font-mono font-bold bg-black/80 text-white rounded">
                                            {img.category}
                                          </span>
                                          {img.page_number !== undefined && (
                                            <span className="absolute top-1 right-1 px-1.5 py-0.5 text-[8px] font-mono font-bold bg-slate-800/90 text-white rounded">
                                              Pág. {img.page_number}
                                            </span>
                                          )}
                                        </div>
                                        <div className="text-[10px] font-bold text-slate-800 truncate mt-1">
                                          {img.title}
                                        </div>
                                        <div className="text-[9px] font-mono text-slate-500 truncate">
                                          {img.source_file_name}
                                        </div>
                                      </div>

                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          updateEditingItem((it) => ({
                                            ...it,
                                            media_url: img.image_url,
                                            image_category: img.category,
                                            media_classification: img.category,
                                            media_caption: img.caption || img.description,
                                            media_source_type: 'material_reference',
                                            media_source_file: img.source_file_name,
                                            media_source_page: img.page_number,
                                            media_source_section: img.source_section,
                                            media_keywords: img.keywords,
                                          }));
                                          setSelectedGalleryImageUrl(img.image_url);
                                        }}
                                        className={`w-full py-1 px-2 text-[9px] font-mono font-extrabold rounded transition-colors ${
                                          isCurrentSlideImg
                                            ? 'bg-emerald-700 text-white'
                                            : 'bg-slate-900 hover:bg-[#DA291C] text-white'
                                        }`}
                                      >
                                        {isCurrentSlideImg ? '✓ EN ESTE SLIDE' : 'USAR EN ESTE SLIDE'}
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Concepto destacado / Regla de oro del material (Opcional)
                        </label>
                        <input
                          type="text"
                          value={activeItem.highlight_note || ''}
                          onChange={(e) =>
                            updateEditingItem((it) => ({
                              ...it,
                              highlight_note: e.target.value,
                            }))
                          }
                          className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                        />
                      </div>
                    </>
                  ) : (
                    /* QUESTION / CASE STUDY EDITOR */
                    <div className="space-y-4 pt-2 border-t border-slate-100">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            Tipo de pregunta evaluativa
                          </label>
                          <select
                            value={activeItem.question.question_type}
                            onChange={(e) =>
                              updateEditingItem((it) => ({
                                ...it,
                                question: {
                                  ...it.question!,
                                  question_type: e.target.value as QuestionType,
                                },
                              }))
                            }
                            className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                          >
                            <option value="single_choice">Selección única</option>
                            <option value="multiple_choice">Selección múltiple</option>
                            <option value="true_false">Verdadero / Falso</option>
                            <option value="image_choice">Selección con imagen</option>
                            <option value="order_steps">Ordenar pasos</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            Competencia evaluada *
                          </label>
                          <select
                            value={activeItem.question.competency_id}
                            onChange={(e) => {
                              const comp = competencies.find(
                                (c) => c.id === e.target.value
                              );
                              updateEditingItem((it) => ({
                                ...it,
                                question: {
                                  ...it.question!,
                                  competency_id: e.target.value,
                                  competency_name: comp?.name || 'Técnica',
                                },
                              }));
                            }}
                            className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                          >
                            {competencies.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">
                              Puntos
                            </label>
                            <input
                              type="number"
                              value={activeItem.question.points}
                              onChange={(e) =>
                                updateEditingItem((it) => ({
                                  ...it,
                                  question: {
                                    ...it.question!,
                                    points: Number(e.target.value) || 10,
                                  },
                                }))
                              }
                              className="w-full px-2.5 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">
                              Intentos
                            </label>
                            <input
                              type="number"
                              min={1}
                              max={5}
                              value={activeItem.question.max_attempts}
                              onChange={(e) =>
                                updateEditingItem((it) => ({
                                  ...it,
                                  question: {
                                    ...it.question!,
                                    max_attempts: Number(e.target.value) || 2,
                                  },
                                }))
                              }
                              className="w-full px-2.5 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                            />
                          </div>
                        </div>
                      </div>

                      {(activeItem.content_type === 'case_study' ||
                        Boolean(activeItem.question.case_study_situation)) && (
                        <div className="p-3.5 bg-red-50/50 border border-red-200 rounded-xl space-y-3">
                          <div>
                            <label className="block text-xs font-extrabold text-[#DA291C] mb-1">
                              Situación Real de Trabajo (Escenario del Caso Práctico Real) *
                            </label>
                            <textarea
                              rows={3}
                              value={activeItem.question.case_study_situation || ''}
                              onChange={(e) =>
                                updateEditingItem((it) => ({
                                  ...it,
                                  question: {
                                    ...it.question!,
                                    case_study_situation: e.target.value,
                                  },
                                }))
                              }
                              className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">
                              Datos Técnicos y Contexto Adicional del Caso
                            </label>
                            <textarea
                              rows={2}
                              value={
                                activeItem.question.case_study_description || ''
                              }
                              onChange={(e) =>
                                updateEditingItem((it) => ({
                                  ...it,
                                  question: {
                                    ...it.question!,
                                    case_study_description: e.target.value,
                                  },
                                }))
                              }
                              className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                            />
                          </div>
                        </div>
                      )}

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Enunciado de la pregunta evaluativa / Decisión del caso *
                        </label>
                        <textarea
                          rows={2}
                          value={activeItem.question.prompt}
                          onChange={(e) =>
                            updateEditingItem((it) => ({
                              ...it,
                              question: {
                                ...it.question!,
                                prompt: e.target.value,
                              },
                            }))
                          }
                          className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                        />
                      </div>

                      {/* Options Editor */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-700">
                            Opciones de respuesta
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              updateEditingItem((it) => {
                                const opts = it.question!.options;
                                const nextLabel = String.fromCharCode(
                                  65 + opts.length
                                );
                                const newOpt: QuestionOption = {
                                  id: crypto.randomUUID(),
                                  question_id: it.question!.id,
                                  label: nextLabel,
                                  text: 'Nueva opción de respuesta',
                                  step_order: opts.length + 1,
                                  is_correct: false,
                                };
                                return {
                                  ...it,
                                  question: {
                                    ...it.question!,
                                    options: [...opts, newOpt],
                                  },
                                };
                              })
                            }
                            className="text-xs font-bold text-[#DA291C] hover:underline"
                          >
                            + Agregar opción
                          </button>
                        </div>

                        {activeItem.question.options.map((opt, oIdx) => (
                          <div
                            key={opt.id}
                            className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200"
                          >
                            <input
                              type="checkbox"
                              checked={Boolean(opt.is_correct)}
                              onChange={(e) =>
                                updateEditingItem((it) => {
                                  const opts = it.question!.options.map(
                                    (o, idx) => {
                                      if (
                                        it.question!.question_type ===
                                          'single_choice' ||
                                        it.question!.question_type ===
                                          'true_false'
                                      ) {
                                        return { ...o, is_correct: idx === oIdx };
                                      }
                                      return idx === oIdx
                                        ? { ...o, is_correct: e.target.checked }
                                        : o;
                                    }
                                  );
                                  return {
                                    ...it,
                                    question: { ...it.question!, options: opts },
                                  };
                                })
                              }
                              title="Marcar como respuesta correcta"
                              className="w-4 h-4 text-emerald-600"
                            />
                            <span className="text-xs font-mono font-bold text-slate-600 w-5">
                              {opt.label}
                            </span>
                            <input
                              type="text"
                              value={opt.text}
                              onChange={(e) =>
                                updateEditingItem((it) => {
                                  const opts = [...it.question!.options];
                                  opts[oIdx] = {
                                    ...opts[oIdx],
                                    text: e.target.value,
                                  };
                                  return {
                                    ...it,
                                    question: { ...it.question!, options: opts },
                                  };
                                })
                              }
                              className="flex-1 px-2.5 py-1 text-xs bg-white border border-slate-300 rounded"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                updateEditingItem((it) => ({
                                  ...it,
                                  question: {
                                    ...it.question!,
                                    options: it.question!.options.filter(
                                      (_, idx) => idx !== oIdx
                                    ),
                                  },
                                }))
                              }
                              className="p-1 text-slate-400 hover:text-red-600"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>

                      {/* Pedagogical Feedback Configuration */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            Explicación inmediata (Basada en el material)
                          </label>
                          <textarea
                            rows={2}
                            value={activeItem.question.explanation}
                            onChange={(e) =>
                              updateEditingItem((it) => ({
                                ...it,
                                question: {
                                  ...it.question!,
                                  explanation: e.target.value,
                                },
                              }))
                            }
                            className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            Concepto clave y Recomendación
                          </label>
                          <textarea
                            rows={2}
                            value={activeItem.question.correct_concept}
                            onChange={(e) =>
                              updateEditingItem((it) => ({
                                ...it,
                                question: {
                                  ...it.question!,
                                  correct_concept: e.target.value,
                                },
                              }))
                            }
                            className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================================ */}
      {/* PASO 4: PREVISUALIZACIÓN INTERACTIVA */}
      {/* ============================================================================ */}
      {step === 4 && (
        <div className="bg-white border-2 border-slate-200 rounded-xl p-8 text-center space-y-4">
          <Eye className="w-10 h-10 text-[#DA291C] mx-auto" />
          <h3 className="text-lg font-extrabold text-slate-900">
            Paso 4: Previsualización en el Reproductor Interactivo
          </h3>
          <p className="text-xs text-slate-600 max-w-lg mx-auto leading-relaxed">
            Guarda los cambios actuales y prueba la capacitación exactamente como la verá el participante desde su celular, tablet o computador.
          </p>
          <div className="pt-2 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={async () => {
                await handlePersistCourse(course.status);
                onPreviewCourse(course.slug);
              }}
              className="px-6 py-3 text-xs font-extrabold text-white bg-[#DA291C] hover:bg-[#B91C1C] rounded-lg inline-flex items-center gap-2 shadow-sm"
            >
              <Eye className="w-4 h-4" />
              <span>Guardar y Ejecutar Previsualización Interactiva</span>
            </button>
          </div>
        </div>
      )}

      {/* ============================================================================ */}
      {/* PASO 5: PUBLICACIÓN Y GENERACIÓN AUTOMÁTICA DE CARD Y ENLACE (SECCIÓN 15) */}
      {/* ============================================================================ */}
      {step === 5 && (
        <div className="bg-white border-2 border-slate-200 rounded-xl p-6 lg:p-8 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-base font-extrabold text-slate-900">
                Paso 5: Publicación en la Biblioteca de Capacitaciones
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Al publicar, la capacitación cambia a estado Publicado, genera su CARD en la biblioteca "Capacitaciones" y habilita el enlace público compartible.
              </p>
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={() => handlePersistCourse('published')}
              className="px-6 py-3.5 text-xs font-extrabold text-white bg-[#DA291C] hover:bg-[#B91C1C] rounded-xl inline-flex items-center gap-2 shadow-md"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>PUBLICAR CAPACITACIÓN</span>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            <div className="lg:col-span-8 space-y-4">
              <div>
                <div className="text-xs font-bold text-slate-800 mb-1">
                  Enlace público compartible para participantes (Celular, Tablet o Computador):
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={publicUrl}
                    className="flex-1 px-3.5 py-2.5 text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg text-slate-800"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(publicUrl);
                      setCopiedLink(true);
                      setTimeout(() => setCopiedLink(false), 2500);
                    }}
                    className="px-4 py-2.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>{copiedLink ? '¡Enlace copiado!' : 'Copiar enlace'}</span>
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    const msg = `Hola equipo, ingresa a la capacitación "${course.title}" aquí: ${publicUrl}`;
                    navigator.clipboard.writeText(msg);
                    setCopiedLink(true);
                  }}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg inline-flex items-center gap-1.5"
                >
                  <Share2 className="w-3.5 h-3.5 text-[#DA291C]" />
                  <span>Copiar invitación para WhatsApp / Teams</span>
                </button>
                <button
                  type="button"
                  onClick={() => onPreviewCourse(course.slug)}
                  className="px-3.5 py-2 text-xs font-bold text-[#DA291C] bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg inline-flex items-center gap-1.5"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Abrir Portal del Participante</span>
                </button>
              </div>
            </div>

            <div className="lg:col-span-4 flex flex-col items-center justify-center p-4 bg-slate-50 border border-slate-200 rounded-xl">
              <CourseQrCodeSvg value={publicUrl} size={140} />
              <span className="text-[11px] font-mono text-slate-500 mt-2">
                QR directo a /formacion/{course.slug || 'tema'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
