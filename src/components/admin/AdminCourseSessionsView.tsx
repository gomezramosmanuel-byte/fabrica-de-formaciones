import React, { useState, useMemo } from 'react';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  Edit3,
  ExternalLink,
  Eye,
  FileText,
  Layers,
  Play,
  Plus,
  QrCode,
  Search,
  Share2,
  Sparkles,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import {
  CatalogItem,
  Competency,
  Course,
  CourseResult,
  DifficultyLevel,
  Participant,
  ParticipantAnswer,
  ParticipantSession,
  ReferenceMaterialFormat,
  TrainingMaterial,
} from '../../types/lms.ts';
import { CourseQrCodeSvg, ResilientImage } from '../common/ResilientImage.tsx';
import { exportCompleteWorkbookToExcel } from '../../utils/excelExport.ts';
import {
  deleteCourseFromFirestore,
  syncCourseToFirestore,
} from '../../firebase.ts';
import { IMG_FTTH } from '../../server/seedCourses.ts';

function detectQuickMaterialFormat(file: File): ReferenceMaterialFormat {
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

function readQuickFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    reader.readAsDataURL(file);
  });
}

function readQuickFileAsText(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => resolve('');
    reader.readAsText(file);
  });
}

interface AdminCourseSessionsViewProps {
  courses: Course[];
  participants: Participant[];
  sessions: ParticipantSession[];
  answers: ParticipantAnswer[];
  results: CourseResult[];
  competencies: Competency[];
  catalogs: CatalogItem[];
  adminToken: string;
  onOpenWizard: (courseToEdit?: Course | null) => void;
  onPreviewCourseSession: (slug: string, isPreview: boolean) => void;
  onSelectParticipantProfile: (participantId: string) => void;
  onShowQrModal: (slug: string) => void;
  onRefreshState: () => Promise<void>;
}

export const AdminCourseSessionsView: React.FC<AdminCourseSessionsViewProps> = ({
  courses,
  participants,
  sessions,
  answers,
  results,
  competencies,
  catalogs,
  adminToken,
  onOpenWizard,
  onPreviewCourseSession,
  onSelectParticipantProfile,
  onShowQrModal,
  onRefreshState,
}) => {
  const [selectedCourseId, setSelectedCourseId] = useState<string>(() => {
    return courses[0]?.id || '';
  });
  const [searchCourse, setSearchCourse] = useState('');
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<
    'sessions' | 'syllabus' | 'share'
  >('sessions');

  // Quick Course Session Generator modal/panel state
  const [showQuickGenerator, setShowQuickGenerator] = useState(true);
  const [quickTitle, setQuickTitle] = useState('');
  const [quickCategory, setQuickCategory] = useState(
    catalogs.find((c) => c.type === 'category' && c.active)?.name ||
      'Fibra Óptica y Acceso'
  );
  const [quickLevel, setQuickLevel] = useState<DifficultyLevel>('Intermedio');
  const [quickMinutes, setQuickMinutes] = useState<number>(25);
  const [quickPassingScore, setQuickPassingScore] = useState<number>(80);
  const [quickNotes, setQuickNotes] = useState('');
  const [quickMaterials, setQuickMaterials] = useState<TrainingMaterial[]>([]);
  const [extractingQuickFiles, setExtractingQuickFiles] = useState(false);
  const [quickPublishImmediately, setQuickPublishImmediately] = useState(true);
  const [generatingQuickCourse, setGeneratingQuickCourse] = useState(false);
  const [quickError, setQuickError] = useState<string | null>(null);

  const filteredCourses = useMemo(() => {
    if (!searchCourse.trim()) return courses;
    const q = searchCourse.toLowerCase();
    return courses.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q) ||
        c.slug.toLowerCase().includes(q)
    );
  }, [courses, searchCourse]);

  const selectedCourse = useMemo(
    () =>
      courses.find((c) => c.id === selectedCourseId) ||
      filteredCourses[0] ||
      courses[0] ||
      null,
    [courses, filteredCourses, selectedCourseId]
  );

  const selectedCourseSessions = useMemo(() => {
    if (!selectedCourse) return [];
    return sessions.filter((s) => s.course_id === selectedCourse.id);
  }, [sessions, selectedCourse]);

  const handleQuickFilesUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setExtractingQuickFiles(true);
    setQuickError(null);
    try {
      const files = Array.from(fileList);
      const uploadedList: TrainingMaterial[] = [];
      let detectedTitle = '';
      let detectedCat = '';

      for (const file of files) {
        const format = detectQuickMaterialFormat(file);
        const sizeKb = Math.max(1, Math.round(file.size / 1024));
        const cleanTitle = file.name.replace(/\.[^/.]+$/, '');
        let mediaDataUrl: string | undefined;
        let rawText = '';

        try {
          if (file.size <= 28 * 1024 * 1024) {
            mediaDataUrl = await readQuickFileAsDataUrl(file);
          }
          if (format === 'text' || format === 'spreadsheet') {
            rawText = await readQuickFileAsText(file);
          }
        } catch {
          // continue
        }

        let extractedText = rawText;
        let extractedPages = undefined;
        let analysisSummary = undefined;

        try {
          const res = await fetch('/api/admin/ai/extract-material', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${adminToken}`,
            },
            body: JSON.stringify({
              file_name: file.name,
              file_type: format,
              mime_type: file.type || '',
              media_data_url: mediaDataUrl,
              raw_text: rawText,
              course_title: quickTitle,
              course_category: quickCategory,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.extracted_text) extractedText = data.extracted_text;
            if (Array.isArray(data.extracted_pages)) {
              extractedPages = data.extracted_pages;
            }
            if (data.analysis_summary) {
              analysisSummary = data.analysis_summary;
              if (!detectedTitle && data.analysis_summary.detected_title) {
                detectedTitle = data.analysis_summary.detected_title;
              }
              if (!detectedCat && data.analysis_summary.detected_category) {
                detectedCat = data.analysis_summary.detected_category;
              }
            }
          }
        } catch {
          // fallback
        }

        const keepMediaUrl =
          format === 'image' ||
          ((format === 'audio' || format === 'video') &&
            file.size <= 4 * 1024 * 1024)
            ? mediaDataUrl
            : undefined;

        uploadedList.push({
          id: crypto.randomUUID(),
          course_id: 'pending',
          title: cleanTitle,
          file_type: format,
          file_name: file.name,
          file_size_kb: sizeKb,
          mime_type: file.type || undefined,
          storage_path: `claro-storage://materials/quick/${Date.now()}-${file.name}`,
          extracted_text:
            extractedText || `Archivo cargado: ${file.name} (${format})`,
          extracted_pages: extractedPages,
          media_data_url: keepMediaUrl,
          analysis_summary: analysisSummary,
          uploaded_at: new Date().toISOString(),
        });
      }

      const nextMaterials = [...quickMaterials, ...uploadedList];
      setQuickMaterials(nextMaterials);
      const nextTitle =
        quickTitle.trim() || detectedTitle || uploadedList[0]?.title || '';
      const nextCat = detectedCat || quickCategory;
      if (!quickTitle.trim() && nextTitle) {
        setQuickTitle(nextTitle);
      }
      if (detectedCat) {
        setQuickCategory(detectedCat);
      }
    } catch (err: any) {
      setQuickError(
        err.message || 'Error al analizar los archivos cargados.'
      );
    } finally {
      setExtractingQuickFiles(false);
    }
  };

  const handleQuickGenerateCourseSession = async (e: React.FormEvent) => {
    e.preventDefault();
    const effectiveTitle =
      quickTitle.trim() ||
      quickMaterials[0]?.analysis_summary?.detected_title ||
      quickMaterials[0]?.title ||
      '';
    if (!effectiveTitle) {
      setQuickError(
        'Ingresa el nombre del curso o carga un archivo para generar el material formativo.'
      );
      return;
    }
    setGeneratingQuickCourse(true);
    setQuickError(null);
    try {
      const courseId = crypto.randomUUID();
      const now = new Date().toISOString();
      const autoSlug = effectiveTitle
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

      const combinedMaterials: TrainingMaterial[] = [
        ...quickMaterials.map((m) => ({ ...m, course_id: courseId })),
        ...(quickNotes.trim()
          ? [
              {
                id: crypto.randomUUID(),
                course_id: courseId,
                title: `Lineamientos Técnicos: ${effectiveTitle}`,
                file_type: 'text' as const,
                file_name: `${autoSlug || 'lineamientos'}.txt`,
                file_size_kb: Math.max(4, Math.round(quickNotes.length / 8)),
                storage_path: `claro-storage://materials/${autoSlug}/${Date.now()}.txt`,
                extracted_text: quickNotes.trim(),
                uploaded_at: now,
              },
            ]
          : []),
      ];

      // 1. Generate modules, visual slides, practical case & questions
      const genRes = await fetch('/api/admin/ai/generate-course', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          course_id: courseId,
          title: effectiveTitle,
          description:
            quickNotes.trim() ||
            quickMaterials[0]?.analysis_summary?.summary ||
            `Sesión formativa interactiva sobre ${effectiveTitle} (${quickCategory}).`,
          category: quickCategory.trim() || 'Operaciones Técnicas',
          level: quickLevel,
          estimated_minutes: quickMinutes,
          materials: combinedMaterials,
        }),
      });
      const genData = await genRes.json();
      if (!genRes.ok) {
        throw new Error(
          genData.error || 'No fue posible generar la sesión del curso.'
        );
      }

      // 2. Persist course
      const newCoursePayload: Course = {
        id: courseId,
        slug: autoSlug || `curso-${Date.now()}`,
        title: effectiveTitle,
        description:
          quickNotes.trim() ||
          genData.analysisSummary?.executive_summary ||
          `Capacitación técnico-operativa sobre ${effectiveTitle} con módulos interactivos, casos prácticos y evaluación certificadora.`,
        category: quickCategory.trim() || 'Operaciones Técnicas',
        estimated_minutes: Number(quickMinutes) || 25,
        level: quickLevel,
        cover_image_url: genData.suggestedCoverUrl || IMG_FTTH,
        passing_score: Number(quickPassingScore) || 80,
        retry_policy: 'continue',
        status: quickPublishImmediately ? 'published' : 'draft',
        ai_generated_draft: true,
        ai_analysis_summary: genData.analysisSummary || undefined,
        published_at: quickPublishImmediately ? now : undefined,
        modules: genData.modules || [],
        materials: combinedMaterials,
        created_at: now,
        updated_at: now,
      };

      const saveRes = await fetch('/api/admin/courses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify(newCoursePayload),
      });
      const savedCourse = await saveRes.json();
      if (!saveRes.ok) {
        throw new Error(savedCourse.error || 'Error al guardar el curso.');
      }

      await syncCourseToFirestore(savedCourse).catch(() => {});
      await onRefreshState();
      setSelectedCourseId(savedCourse.id);
      setShowQuickGenerator(false);
      setQuickTitle('');
      setQuickNotes('');
      setQuickMaterials([]);
    } catch (err: any) {
      setQuickError(err.message || 'Error al generar el curso.');
    } finally {
      setGeneratingQuickCourse(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ============================================================================ */}
      {/* CABECERA DE LA SECCIÓN CURSO Y SESIONES */}
      {/* ============================================================================ */}
      <div className="bg-white border-2 border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
        <div className="h-2 w-full bg-[#DA291C]" />
        <div className="p-5 sm:p-6 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-mono font-bold text-[#DA291C] uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#DA291C]" />
              <span>GESTIÓN INTEGRAL DE CURSO · SESIONES, MÓDULOS Y ENLACES</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 mt-0.5">
              Sección Curso y Sesiones Activas ({courses.length})
            </h1>
            <p className="text-xs text-slate-600 mt-0.5">
              Carga material en cualquier formato (PDF, Word, Excel, PowerPoint, CSV, TXT, Imagen, Audio o Video) para que la app analice la información y genere automáticamente el material formativo, las preguntas evaluativas y los casos prácticos reales.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setShowQuickGenerator((prev) => !prev)}
              className="px-4 py-2.5 text-xs font-extrabold uppercase tracking-wide text-[#DA291C] bg-red-50 hover:bg-red-100 border-2 border-[#DA291C] rounded-xl inline-flex items-center gap-1.5 transition-colors"
            >
              <Sparkles className="w-4 h-4" />
              <span>Generar Curso Rápido / Cargar Archivo</span>
            </button>

            <button
              type="button"
              onClick={() => onOpenWizard(null)}
              className="px-4 py-2.5 text-xs font-extrabold uppercase tracking-wide text-white bg-[#DA291C] hover:bg-[#B91C1C] rounded-xl inline-flex items-center gap-1.5 shadow-2xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>+ Asistente Completo (Archivos / IA)</span>
            </button>
          </div>
        </div>

        {/* Generador Rápido de Sesión de Curso (Desplegable) */}
        {showQuickGenerator && (
          <form
            onSubmit={handleQuickGenerateCourseSession}
            className="p-6 bg-slate-50 border-t border-slate-200 space-y-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#DA291C]" />
                <h2 className="text-sm font-extrabold text-slate-900">
                  Generador Instantáneo desde Material en Cualquier Formato (Material Formativo + Preguntas Evaluativas + Casos Prácticos Reales)
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowQuickGenerator(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {quickError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs font-semibold text-[#DA291C]">
                {quickError}
              </div>
            )}

            {/* Zona de Carga de Material en Cualquier Formato */}
            <div className="p-4 bg-white border-2 border-dashed border-red-300 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-[#DA291C]" />
                  <span>
                    1. Carga tu material en cualquier formato (PDF, Word, Excel, PowerPoint, CSV, TXT, Imagen, Audio o Video)
                  </span>
                </div>
                <p className="text-[11px] text-slate-600">
                  La aplicación extraerá y analizará el contenido completo de tus archivos para construir las diapositivas formativas, las preguntas evaluativas y los casos prácticos reales.
                </p>
              </div>
              <label className="px-4 py-2 text-xs font-extrabold uppercase tracking-wider bg-[#DA291C] hover:bg-[#B91C1C] text-white rounded-xl cursor-pointer inline-flex items-center gap-2 shrink-0 shadow-2xs">
                <Upload className="w-3.5 h-3.5" />
                <span>
                  {extractingQuickFiles
                    ? 'Analizando archivo...'
                    : 'Seleccionar Archivos'}
                </span>
                <input
                  type="file"
                  multiple
                  accept="*/*"
                  disabled={extractingQuickFiles || generatingQuickCourse}
                  onChange={(e) => handleQuickFilesUpload(e.target.files)}
                  className="hidden"
                />
              </label>
            </div>

            {quickMaterials.length > 0 && (
              <div className="space-y-2">
                <div className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">
                  Archivos analizados listos para generar el curso ({quickMaterials.length}):
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {quickMaterials.map((m) => (
                    <div
                      key={m.id}
                      className="p-2.5 bg-white border border-emerald-200 rounded-lg flex items-start justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 truncate">
                          {m.file_name} ({m.file_type.toUpperCase()})
                        </div>
                        <div className="text-[11px] text-slate-600 line-clamp-2 mt-0.5">
                          {m.analysis_summary?.summary ||
                            `${(m.extracted_text || '').length} caracteres extraídos del documento.`}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setQuickMaterials((prev) =>
                            prev.filter((item) => item.id !== m.id)
                          )
                        }
                        className="text-slate-400 hover:text-[#DA291C] p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              <div className="md:col-span-5">
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Nombre del Curso / Sesión *
                </label>
                <input
                  type="text"
                  required={quickMaterials.length === 0}
                  value={quickTitle}
                  onChange={(e) => setQuickTitle(e.target.value)}
                  placeholder="Se autocompleta al subir archivo o escríbelo aquí..."
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#DA291C]"
                />
              </div>

              <div className="md:col-span-3">
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Categoría / Tema *
                </label>
                <input
                  type="text"
                  required
                  value={quickCategory}
                  onChange={(e) => setQuickCategory(e.target.value)}
                  placeholder="Ej. Fibra Óptica, Seguridad..."
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#DA291C]"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Nivel
                </label>
                <select
                  value={quickLevel}
                  onChange={(e) =>
                    setQuickLevel(e.target.value as DifficultyLevel)
                  }
                  className="w-full px-2.5 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                >
                  <option value="Básico">Básico</option>
                  <option value="Intermedio">Intermedio</option>
                  <option value="Avanzado">Avanzado</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Duración (min)
                </label>
                <input
                  type="number"
                  min={5}
                  max={180}
                  value={quickMinutes}
                  onChange={(e) => setQuickMinutes(Number(e.target.value) || 25)}
                  className="w-full px-2.5 py-2 text-xs font-mono bg-white border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">
                Notas adicionales, protocolos o instrucciones específicas (Opcional)
              </label>
              <textarea
                rows={2}
                value={quickNotes}
                onChange={(e) => setQuickNotes(e.target.value)}
                placeholder="Puedes pegar texto adicional o instrucciones específicas para complementar los archivos cargados..."
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={quickPublishImmediately}
                  onChange={(e) =>
                    setQuickPublishImmediately(e.target.checked)
                  }
                  className="w-4 h-4 accent-[#DA291C]"
                />
                <span>
                  Publicar inmediatamente y habilitar enlace /formacion/ para los participantes
                </span>
              </label>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowQuickGenerator(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={generatingQuickCourse || extractingQuickFiles}
                  className="px-5 py-2.5 text-xs font-extrabold uppercase tracking-wider text-white bg-[#DA291C] hover:bg-[#B91C1C] disabled:opacity-50 rounded-xl inline-flex items-center gap-2"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>
                    {generatingQuickCourse
                      ? 'Analizando material y generando curso...'
                      : 'Generar Material Formativo, Preguntas y Casos'}
                  </span>
                </button>
              </div>
            </div>
          </form>
        )}
      </div>

      {/* ============================================================================ */}
      {/* LAYOUT DE 2 COLUMNAS: LISTA DE CURSOS (IZQ) + CENTRO DE SESIÓN DEL CURSO (DER) */}
      {/* ============================================================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Columna Izquierda: Catálogo de Cursos (5 cols) */}
        <div className="lg:col-span-5 space-y-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchCourse}
              onChange={(e) => setSearchCourse(e.target.value)}
              placeholder="Buscar curso por nombre, tema o enlace..."
              className="w-full pl-8 pr-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-[#DA291C]"
            />
          </div>

          <div className="space-y-2.5">
            {filteredCourses.map((c) => {
              const isSelected = selectedCourse?.id === c.id;
              const cSessions = sessions.filter((s) => s.course_id === c.id);
              const cModules = Array.isArray(c.modules) ? c.modules : [];
              const totalSlides = cModules.reduce(
                (acc, m) => acc + (m.items || []).length,
                0
              );
              const totalQuestions = cModules.reduce(
                (acc, m) =>
                  acc + (m.items || []).filter((it) => Boolean(it.question)).length,
                0
              );

              return (
                <div
                  key={c.id}
                  onClick={() => setSelectedCourseId(c.id)}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    isSelected
                      ? 'border-[#DA291C] bg-red-50/20 shadow-xs'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start gap-3.5">
                    <div className="w-20 h-16 rounded-lg overflow-hidden border border-slate-200 shrink-0 bg-slate-900">
                      <ResilientImage
                        src={c.cover_image_url}
                        alt={c.title}
                        category={c.category}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-1 text-[11px]">
                        <span
                          className={`font-bold ${
                            c.status === 'published'
                              ? 'text-emerald-700'
                              : 'text-amber-700'
                          }`}
                        >
                          {c.status === 'published'
                            ? '● PUBLICADO'
                            : '▲ BORRADOR'}
                        </span>
                        <span className="font-mono text-slate-500">
                          {cSessions.length} sesiones
                        </span>
                      </div>
                      <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 line-clamp-1">
                        {c.title}
                      </h3>
                      <div className="text-[11px] font-mono text-slate-500">
                        {cModules.length} mód · {totalSlides} pantallas ·{' '}
                        {totalQuestions} preguntas
                      </div>
                    </div>
                  </div>

                  <div
                    className="flex flex-wrap items-center justify-between gap-2 mt-3 pt-2.5 border-t border-slate-100"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => onPreviewCourseSession(c.slug, false)}
                      className="px-2.5 py-1 text-[11px] font-bold text-white bg-[#DA291C] hover:bg-[#B91C1C] rounded-md inline-flex items-center gap-1"
                    >
                      <Play className="w-3 h-3 fill-current" />
                      <span>Iniciar Sesión</span>
                    </button>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          const url = `${window.location.origin}/formacion/${c.slug}`;
                          navigator.clipboard.writeText(url);
                          setCopiedSlug(c.slug);
                          setTimeout(() => setCopiedSlug(null), 2000);
                        }}
                        className="px-2 py-1 text-[11px] font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded inline-flex items-center gap-1"
                      >
                        <Copy className="w-3 h-3" />
                        <span>
                          {copiedSlug === c.slug ? 'Copiado' : 'Link'}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onShowQrModal(c.slug)}
                        className="p-1 text-slate-700 bg-slate-100 hover:bg-slate-200 rounded"
                        title="Código QR"
                      >
                        <QrCode className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => onOpenWizard(c)}
                        className="px-2 py-1 text-[11px] font-semibold text-slate-900 bg-slate-100 hover:bg-slate-200 rounded inline-flex items-center gap-1"
                      >
                        <Edit3 className="w-3 h-3" />
                        <span>Editar</span>
                      </button>

                      <button
                        type="button"
                        onClick={async () => {
                          await fetch(`/api/admin/courses/${c.id}`, {
                            method: 'DELETE',
                            headers: { Authorization: `Bearer ${adminToken}` },
                          });
                          await deleteCourseFromFirestore(c.id).catch(() => {});
                          await onRefreshState();
                        }}
                        className="p-1 text-slate-400 hover:text-red-600 rounded"
                        title="Eliminar curso"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Columna Derecha: Centro de Control de la Sesión del Curso Seleccionado (7 cols) */}
        <div className="lg:col-span-7">
          {!selectedCourse ? (
            <div className="p-12 bg-white border border-slate-200 rounded-2xl text-center text-xs text-slate-500">
              Selecciona un curso de la izquierda o genera uno nuevo para administrar su sesión.
            </div>
          ) : (
            <div className="bg-white border-2 border-slate-200 rounded-2xl overflow-hidden shadow-xs space-y-6 p-6">
              {/* Encabezado del Curso Activo */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                <div>
                  <div className="flex items-center gap-2 text-xs font-mono text-[#DA291C] font-bold">
                    <span>CURSO SELECCIONADO</span>
                    <span>·</span>
                    <span>/formacion/{selectedCourse.slug}</span>
                  </div>
                  <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 mt-0.5">
                    {selectedCourse.title}
                  </h2>
                  <p className="text-xs text-slate-600 mt-1">
                    {selectedCourse.description}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      onPreviewCourseSession(selectedCourse.slug, false)
                    }
                    className="px-4 py-2.5 text-xs font-extrabold uppercase tracking-wider text-white bg-[#DA291C] hover:bg-[#B91C1C] rounded-xl inline-flex items-center gap-1.5 shadow-2xs"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Ejecutar Sesión del Curso</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenWizard(selectedCourse)}
                    className="px-3.5 py-2.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl inline-flex items-center gap-1.5"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Editar Módulos</span>
                  </button>
                </div>
              </div>

              {/* KPIs de la Sesión de este Curso */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                  <div className="text-[11px] text-slate-500">
                    Sesiones Iniciadas
                  </div>
                  <div className="text-xl font-extrabold font-mono tabular-nums text-slate-900 mt-0.5">
                    {selectedCourseSessions.length}
                  </div>
                </div>
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                  <div className="text-[11px] text-slate-500">En Progreso</div>
                  <div className="text-xl font-extrabold font-mono tabular-nums text-amber-700 mt-0.5">
                    {
                      selectedCourseSessions.filter(
                        (s) => s.status === 'En progreso'
                      ).length
                    }
                  </div>
                </div>
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                  <div className="text-[11px] text-slate-500">Aprobados</div>
                  <div className="text-xl font-extrabold font-mono tabular-nums text-emerald-700 mt-0.5">
                    {
                      selectedCourseSessions.filter(
                        (s) => s.status === 'Aprobado'
                      ).length
                    }
                  </div>
                </div>
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                  <div className="text-[11px] text-slate-500">
                    Requiere Refuerzo
                  </div>
                  <div className="text-xl font-extrabold font-mono tabular-nums text-[#DA291C] mt-0.5">
                    {
                      selectedCourseSessions.filter(
                        (s) => s.status === 'Requiere refuerzo'
                      ).length
                    }
                  </div>
                </div>
              </div>

              {/* Sub-pestañas del Curso: Sesiones en Vivo | Estructura de Módulos | Convocatoria y QR */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setActiveDetailTab('sessions')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${
                      activeDetailTab === 'sessions'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Sesiones de Participantes ({selectedCourseSessions.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveDetailTab('syllabus')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${
                      activeDetailTab === 'syllabus'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Módulos y Pantallas ({(selectedCourse.modules || []).length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveDetailTab('share')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${
                      activeDetailTab === 'share'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Enlace y QR de Sesión
                  </button>
                </div>

                {selectedCourseSessions.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      exportCompleteWorkbookToExcel({
                        sessions: selectedCourseSessions,
                        participants,
                        courses: [selectedCourse],
                        results,
                        answers,
                        competencies,
                        filterLabel: selectedCourse.slug,
                      });
                    }}
                    className="px-3 py-1.5 text-xs font-bold text-white bg-[#DA291C] hover:bg-[#B91C1C] rounded-lg inline-flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Exportar Sesiones del Curso (.xlsx)</span>
                  </button>
                )}
              </div>

              {/* TAB 1: SESIONES DE PARTICIPANTES DE ESTE CURSO */}
              {activeDetailTab === 'sessions' && (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600">
                        <th className="py-2.5 px-3.5">Participante / Cédula</th>
                        <th className="py-2.5 px-3.5">Área / Cargo</th>
                        <th className="py-2.5 px-3.5 text-right">Avance</th>
                        <th className="py-2.5 px-3.5 text-right">Puntaje</th>
                        <th className="py-2.5 px-3.5">Estado</th>
                        <th className="py-2.5 px-3.5 text-right">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {selectedCourseSessions.length === 0 ? (
                        <tr>
                          <td
                            colSpan={6}
                            className="py-8 px-4 text-center text-slate-500 space-y-2"
                          >
                            <div className="font-semibold text-slate-700">
                              Esta sesión de curso está lista y en blanco para recibir al personal.
                            </div>
                            <div>
                              Comparte el enlace{' '}
                              <span className="font-mono text-[#DA291C]">
                                {`${window.location.origin}/formacion/${selectedCourse.slug}`}
                              </span>{' '}
                              para que los participantes registren su Nombre completo, Cédula, Área y Cargo.
                            </div>
                          </td>
                        </tr>
                      ) : (
                        selectedCourseSessions.map((sess) => {
                          const part = participants.find(
                            (p) => p.id === sess.participant_id
                          );
                          return (
                            <tr key={sess.id} className="hover:bg-slate-50">
                              <td className="py-2.5 px-3.5">
                                <div className="font-semibold text-slate-900">
                                  {part?.full_name || 'Participante'}
                                </div>
                                <div className="text-[11px] font-mono text-slate-500">
                                  Cédula: {part?.identification_number} ·{' '}
                                  {sess.session_code}
                                </div>
                              </td>
                              <td className="py-2.5 px-3.5">
                                <div className="font-medium text-slate-800">
                                  {part?.area}
                                </div>
                                <div className="text-[11px] text-slate-500">
                                  {part?.role}
                                </div>
                              </td>
                              <td className="py-2.5 px-3.5 text-right font-mono tabular-nums">
                                {sess.progress_percentage}%
                              </td>
                              <td className="py-2.5 px-3.5 text-right font-mono font-bold tabular-nums">
                                {sess.score_percentage}%
                              </td>
                              <td className="py-2.5 px-3.5">
                                <span
                                  className={`font-semibold ${
                                    sess.status === 'Aprobado'
                                      ? 'text-emerald-700'
                                      : sess.status === 'Requiere refuerzo'
                                      ? 'text-[#DA291C]'
                                      : 'text-amber-700'
                                  }`}
                                >
                                  {sess.status}
                                </span>
                              </td>
                              <td className="py-2.5 px-3.5 text-right">
                                {part && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onSelectParticipantProfile(part.id)
                                    }
                                    className="text-xs font-bold text-[#DA291C] hover:underline"
                                  >
                                    Ver perfil
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* TAB 2: ESTRUCTURA DE MÓDULOS Y PANTALLAS DE LA SESIÓN */}
              {activeDetailTab === 'syllabus' && (
                <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
                  {(selectedCourse.modules || []).map((mod, mIdx) => (
                    <div
                      key={mod.id}
                      className="border border-slate-200 rounded-xl overflow-hidden"
                    >
                      <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                        <div className="text-xs font-extrabold text-slate-900">
                          {mIdx + 1}. {mod.title}
                        </div>
                        <span className="text-[11px] font-mono text-slate-500">
                          {(mod.items || []).length} pantallas
                        </span>
                      </div>
                      <div className="divide-y divide-slate-100 text-xs">
                        {(mod.items || []).map((item, idx) => (
                          <div
                            key={item.id}
                            className="px-4 py-2.5 flex items-center justify-between gap-2"
                          >
                            <div className="truncate">
                              <span className="font-mono text-slate-400 mr-2">
                                {mIdx + 1}.{idx + 1}
                              </span>
                              <span className="font-semibold text-slate-800">
                                {item.title}
                              </span>
                            </div>
                            <span
                              className={`text-[11px] font-mono shrink-0 ${
                                item.question
                                  ? 'text-[#DA291C] font-bold'
                                  : 'text-slate-500'
                              }`}
                            >
                              {item.question
                                ? `Evaluación (${item.question.points} pts)`
                                : item.content_type}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* TAB 3: CONVOCATORIA, LINK Y QR DE LA SESIÓN DEL CURSO */}
              {activeDetailTab === 'share' && (
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-6 items-center bg-slate-50 p-5 rounded-xl border border-slate-200">
                  <div className="sm:col-span-7 space-y-3">
                    <div className="text-xs font-extrabold text-slate-900">
                      Enlace directo a la Sesión del Curso:
                    </div>
                    <div className="p-2.5 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-800 break-all">
                      {`${window.location.origin}/formacion/${selectedCourse.slug}`}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const url = `${window.location.origin}/formacion/${selectedCourse.slug}`;
                          navigator.clipboard.writeText(url);
                          setCopiedSlug(selectedCourse.slug);
                          setTimeout(() => setCopiedSlug(null), 2000);
                        }}
                        className="px-3.5 py-2 text-xs font-bold text-white bg-[#DA291C] hover:bg-[#B91C1C] rounded-lg inline-flex items-center gap-1.5"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>
                          {copiedSlug === selectedCourse.slug
                            ? 'Enlace copiado'
                            : 'Copiar enlace'}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const url = `${window.location.origin}/formacion/${selectedCourse.slug}`;
                          const msg = `U Claro Tecnología — Te invitamos a ingresar a la sesión del curso "${selectedCourse.title}". Registra tu Nombre completo, Cédula, Área y Cargo aquí: ${url}`;
                          navigator.clipboard.writeText(msg);
                          setCopiedInviteId(selectedCourse.id);
                          setTimeout(() => setCopiedInviteId(null), 2000);
                        }}
                        className="px-3.5 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg inline-flex items-center gap-1.5"
                      >
                        <Share2 className="w-3.5 h-3.5 text-[#DA291C]" />
                        <span>
                          {copiedInviteId === selectedCourse.id
                            ? 'Invitación copiada'
                            : 'Copiar invitación WhatsApp / Teams'}
                        </span>
                      </button>
                    </div>
                  </div>

                  <div className="sm:col-span-5 flex flex-col items-center justify-center bg-white p-4 rounded-xl border border-slate-200">
                    <CourseQrCodeSvg
                      value={`${window.location.origin}/formacion/${selectedCourse.slug}`}
                      size={135}
                    />
                    <span className="text-[11px] font-mono text-slate-500 mt-2">
                      Escanea para abrir la sesión
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
