import React, { useState, useMemo, useEffect } from 'react';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock,
  Copy,
  FileText,
  HelpCircle,
  Layers,
  Play,
  QrCode,
  Search,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { Course, Participant, ParticipantSession } from '../../types/lms.ts';
import { CourseQrCodeSvg, ResilientImage } from '../common/ResilientImage.tsx';
import {
  CLARO_TECHNICIAN_IMAGE_URL,
  UClaroTecnologiaLogo,
} from '../common/ClaroBrandAssets.tsx';

interface CourseSessionHubViewProps {
  courses: Course[];
  initialSelectedSlug?: string | null;
  onStartCourseSession: (slug: string, resumeSessionId?: string) => void;
}

interface LookupSessionItem {
  session: ParticipantSession;
  course_title: string;
  course_slug: string;
  course_category: string;
}

export const CourseSessionHubView: React.FC<CourseSessionHubViewProps> = ({
  courses,
  initialSelectedSlug,
  onStartCourseSession,
}) => {
  const publishedCourses = useMemo(
    () => courses.filter((c) => c.status === 'published'),
    [courses]
  );

  const [selectedSlug, setSelectedSlug] = useState<string>(() => {
    if (
      initialSelectedSlug &&
      publishedCourses.some((c) => c.slug === initialSelectedSlug)
    ) {
      return initialSelectedSlug;
    }
    return publishedCourses[0]?.slug || '';
  });

  useEffect(() => {
    if (
      initialSelectedSlug &&
      publishedCourses.some((c) => c.slug === initialSelectedSlug)
    ) {
      setSelectedSlug(initialSelectedSlug);
    } else if (
      !selectedSlug &&
      publishedCourses.length > 0
    ) {
      setSelectedSlug(publishedCourses[0].slug);
    }
  }, [initialSelectedSlug, publishedCourses, selectedSlug]);

  const selectedCourse = useMemo(
    () =>
      publishedCourses.find((c) => c.slug === selectedSlug) ||
      publishedCourses[0] ||
      null,
    [publishedCourses, selectedSlug]
  );

  // Quick lookup of active/past sessions by Cédula
  const [lookupCedula, setLookupCedula] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupSearched, setLookupSearched] = useState(false);
  const [foundParticipant, setFoundParticipant] = useState<Participant | null>(null);
  const [foundSessions, setFoundSessions] = useState<LookupSessionItem[]>([]);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [showQrModal, setShowQrModal] = useState(false);

  const handleLookupByCedula = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = lookupCedula.replace(/\s+/g, '').trim();
    if (!clean) return;
    setLookupLoading(true);
    setLookupSearched(true);
    try {
      const res = await fetch(
        `/api/public/participant-sessions?cedula=${encodeURIComponent(clean)}`
      );
      if (res.ok) {
        const data = await res.json();
        setFoundParticipant(data.participant || null);
        setFoundSessions(data.sessions || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLookupLoading(false);
    }
  };

  if (!selectedCourse) {
    return (
      <div className="p-10 bg-white border border-slate-200 rounded-2xl text-center space-y-2">
        <p className="text-sm font-bold text-slate-800">
          No hay cursos publicados actualmente en la biblioteca.
        </p>
        <p className="text-xs text-slate-500">
          El administrador puede publicar nuevos cursos desde el Panel Administrador.
        </p>
      </div>
    );
  }

  const selectedModules = Array.isArray(selectedCourse.modules)
    ? selectedCourse.modules
    : [];
  const selectedMaterials = Array.isArray(selectedCourse.materials)
    ? selectedCourse.materials
    : [];

  const totalSlides = selectedModules.reduce(
    (acc, m) => acc + (m.items || []).length,
    0
  );
  const totalQuestions = selectedModules.reduce(
    (acc, m) =>
      acc + (m.items || []).filter((it) => Boolean(it.question)).length,
    0
  );
  const totalPoints = selectedModules.reduce(
    (acc, m) =>
      acc +
      (m.items || []).reduce(
        (qAcc, it) => qAcc + (it.question ? it.question.points : 0),
        0
      ),
    0
  );
  const shareUrl = `${window.location.origin}/formacion/${selectedCourse.slug}`;

  return (
    <div className="space-y-8 bg-white">
      {/* ============================================================================ */}
      {/* BLOQUE 1: BUSCADOR / REANUDACIÓN DE SESIÓN DE CURSO POR CÉDULA */}
      {/* ============================================================================ */}
      <div className="bg-white border-2 border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
        <div className="h-2 w-full bg-[#DA291C]" />
        <div className="p-5 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          <div className="lg:col-span-6 space-y-1.5">
            <div className="text-xs font-extrabold tracking-wider uppercase text-[#DA291C] flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#DA291C]" />
              <span>SESIÓN DE CURSO · ACCESO Y CONTINUIDAD POR CÉDULA</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900">
              Centro de Sesión del Curso e Inicio Rápido
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              Consulta el temario completo de cada curso, inicia una nueva sesión formativa o ingresa tu <strong>Cédula</strong> para retomar una sesión en progreso.
            </p>
          </div>

          <div className="lg:col-span-6">
            <form
              onSubmit={handleLookupByCedula}
              className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3"
            >
              <label className="block text-xs font-bold text-slate-800">
                ¿Ya iniciaste una sesión de curso? Consulta o retoma con tu Cédula:
              </label>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={lookupCedula}
                    onChange={(e) =>
                      setLookupCedula(e.target.value.replace(/\s+/g, ''))
                    }
                    placeholder="Ingresa tu número de Cédula..."
                    className="w-full pl-9 pr-3 py-2 text-xs font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#DA291C]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={lookupLoading || !lookupCedula.trim()}
                  className="px-4 py-2 text-xs font-extrabold uppercase tracking-wider text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-40 rounded-lg transition-colors whitespace-nowrap"
                >
                  {lookupLoading ? 'Consultando...' : 'Buscar mi sesión'}
                </button>
              </div>

              {lookupSearched && !lookupLoading && (
                <div className="pt-2 border-t border-slate-200">
                  {!foundParticipant || foundSessions.length === 0 ? (
                    <div className="text-xs text-slate-600 flex items-center justify-between gap-2">
                      <span>
                        No se encontraron sesiones previas para la cédula{' '}
                        <strong className="font-mono">{lookupCedula}</strong>. Puedes iniciar tu curso abajo registrando tus datos reales.
                      </span>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <UserCheck className="w-4 h-4 text-[#DA291C]" />
                        <span>
                          {foundParticipant.full_name} ({foundParticipant.area} ·{' '}
                          {foundParticipant.role})
                        </span>
                      </div>
                      <div className="space-y-1.5 max-h-40 overflow-y-auto">
                        {foundSessions.map((item) => (
                          <div
                            key={item.session.id}
                            className="p-2.5 bg-white border border-slate-200 rounded-lg flex flex-wrap items-center justify-between gap-2 text-xs"
                          >
                            <div>
                              <div className="font-bold text-slate-900">
                                {item.course_title}
                              </div>
                              <div className="text-[11px] font-mono text-slate-500">
                                {item.session.session_code} · Avance:{' '}
                                {item.session.progress_percentage}% · Puntaje:{' '}
                                {item.session.score_percentage}% · Estado:{' '}
                                <strong className="text-slate-800">
                                  {item.session.status}
                                </strong>
                              </div>
                            </div>
                            {item.course_slug && (
                              <button
                                type="button"
                                onClick={() => {
                                  sessionStorage.setItem(
                                    `fif_active_session_${item.course_slug}`,
                                    item.session.id
                                  );
                                  onStartCourseSession(
                                    item.course_slug,
                                    item.session.id
                                  );
                                }}
                                className="px-3 py-1.5 text-xs font-bold text-white bg-[#DA291C] hover:bg-[#B91C1C] rounded-lg inline-flex items-center gap-1"
                              >
                                <Play className="w-3 h-3" />
                                <span>
                                  {item.session.status === 'En progreso'
                                    ? 'Retomar sesión'
                                    : 'Ver resultado / Nuevo intento'}
                                </span>
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </form>
          </div>
        </div>
      </div>

      {/* ============================================================================ */}
      {/* BLOQUE 2: SELECTOR DE CURSO ACTIVO */}
      {/* ============================================================================ */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#DA291C]" />
            <span>Selecciona el Curso para ver su Sesión, Módulos y Actividades ({publishedCourses.length})</span>
          </div>
          <span className="text-xs font-mono text-slate-500">
            Enlace activo: /formacion/{selectedCourse.slug}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {publishedCourses.map((c) => {
            const isSelected = c.slug === selectedCourse.slug;
            const cMods = Array.isArray(c.modules) ? c.modules : [];
            const modCount = cMods.length;
            const slideCount = cMods.reduce(
              (s, m) => s + (m.items || []).length,
              0
            );
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedSlug(c.slug)}
                className={`p-4 rounded-xl border-2 text-left transition-all flex items-start gap-3.5 ${
                  isSelected
                    ? 'border-[#DA291C] bg-red-50/30 shadow-2xs'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="w-16 h-14 rounded-lg overflow-hidden border border-slate-200 shrink-0 bg-slate-900">
                  <ResilientImage
                    src={c.cover_image_url}
                    alt={c.title}
                    category={c.category}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-bold text-[#DA291C] truncate">
                    {c.category}
                  </div>
                  <div className="text-xs font-extrabold text-slate-900 line-clamp-2 mt-0.5">
                    {c.title}
                  </div>
                  <div className="text-[11px] font-mono text-slate-500 mt-1">
                    {modCount} mód · {slideCount} pantallas · {c.estimated_minutes} min
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ============================================================================ */}
      {/* BLOQUE 3: FICHA INTEGRAL Y TEMARIO DE LA SESIÓN DEL CURSO SELECCIONADO */}
      {/* ============================================================================ */}
      <div className="bg-white border-2 border-slate-200 rounded-2xl overflow-hidden shadow-xs">
        <div className="h-2 w-full bg-[#DA291C]" />

        {/* Cabecera del Curso Seleccionado */}
        <div className="p-6 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center border-b border-slate-200">
          <div className="lg:col-span-5">
            <div className="aspect-video w-full rounded-xl overflow-hidden border border-slate-200 bg-slate-900 relative">
              <ResilientImage
                src={selectedCourse.cover_image_url}
                alt={selectedCourse.title}
                category={selectedCourse.category}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent flex flex-col justify-end p-4">
                <div className="text-xs font-bold text-white flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#DA291C]" />
                  <span>{selectedCourse.category}</span>
                  <span>·</span>
                  <span>Nivel {selectedCourse.level}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-7 space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-slate-500">
              <span className="font-bold text-[#DA291C]">SESIÓN DE CURSO</span>
              <span>·</span>
              <span>/formacion/{selectedCourse.slug}</span>
            </div>

            <h2 className="text-2xl font-extrabold text-slate-900 leading-snug">
              {selectedCourse.title}
            </h2>

            <p className="text-sm text-slate-700 leading-relaxed">
              {selectedCourse.description}
            </p>

            {/* Métricas de la Sesión del Curso */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="text-[11px] text-slate-500">Módulos</div>
                <div className="text-base font-extrabold font-mono text-slate-900 mt-0.5">
                  {selectedModules.length} módulos
                </div>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="text-[11px] text-slate-500">Pantallas / Slides</div>
                <div className="text-base font-extrabold font-mono text-slate-900 mt-0.5">
                  {totalSlides} pantallas
                </div>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="text-[11px] text-slate-500">Evaluaciones</div>
                <div className="text-base font-extrabold font-mono text-[#DA291C] mt-0.5">
                  {totalQuestions} retos ({totalPoints} pts)
                </div>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="text-[11px] text-slate-500">Duración / Mínimo</div>
                <div className="text-base font-extrabold font-mono text-slate-900 mt-0.5">
                  {selectedCourse.estimated_minutes}m · {selectedCourse.passing_score}%
                </div>
              </div>
            </div>

            {/* Botones de Acción de la Sesión */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => onStartCourseSession(selectedCourse.slug)}
                className="px-6 py-3.5 text-xs sm:text-sm font-extrabold uppercase tracking-wider text-white bg-[#DA291C] hover:bg-[#B91C1C] rounded-xl transition-colors inline-flex items-center gap-2 shadow-sm"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>INICIAR SESIÓN DEL CURSO</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(shareUrl);
                  setCopiedSlug(selectedCourse.slug);
                  setTimeout(() => setCopiedSlug(null), 2000);
                }}
                className="px-4 py-3 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl inline-flex items-center gap-1.5"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>
                  {copiedSlug === selectedCourse.slug
                    ? 'Enlace copiado'
                    : 'Copiar link de la sesión'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setShowQrModal(true)}
                className="px-4 py-3 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl inline-flex items-center gap-1.5"
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>Código QR</span>
              </button>
            </div>
          </div>
        </div>

        {/* Desglose de Módulos y Diapositivas de la Sesión del Curso */}
        <div className="p-6 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 bg-white">
          <div className="lg:col-span-8 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-[#DA291C]" />
                  <span>Estructura Interactiva de la Sesión del Curso</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Recorrido secuencial por módulos con diapositivas técnicas, procedimientos paso a paso y preguntas intercaladas.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {selectedModules.map((mod, mIdx) => {
                const modItems = Array.isArray(mod.items) ? mod.items : [];
                const modStudyCards = Array.isArray(mod.study_cards)
                  ? mod.study_cards
                  : [];
                return (
                  <div
                    key={mod.id}
                    className="border border-slate-200 rounded-xl overflow-hidden bg-white"
                  >
                    <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span className="w-6 h-6 rounded-full bg-[#DA291C] text-white font-mono text-xs font-bold flex items-center justify-center">
                          {mIdx + 1}
                        </span>
                        <div>
                          <h4 className="text-xs sm:text-sm font-extrabold text-slate-900">
                            {mod.title}
                          </h4>
                          {mod.description && (
                            <p className="text-[11px] text-slate-500">
                              {mod.description}
                            </p>
                          )}
                        </div>
                      </div>
                      <span className="text-[11px] font-mono text-slate-600">
                        {modItems.length} pantallas · {modStudyCards.length} fichas de estudio
                      </span>
                    </div>

                    {modStudyCards.length > 0 && (
                      <div className="p-4 bg-red-50/25 border-b border-slate-100 space-y-2.5">
                        <div className="text-[11px] font-mono font-extrabold text-[#DA291C] uppercase tracking-wider flex items-center gap-1.5">
                          <BookOpen className="w-3.5 h-3.5" />
                          <span>Fichas de Estudio Ampliadas del Módulo ({modStudyCards.length})</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                          {modStudyCards.map((sc, scIdx) => (
                            <div
                              key={sc.id || scIdx}
                              className="p-3 bg-white border border-slate-200 rounded-xl space-y-1.5 shadow-2xs"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-red-50 text-[#DA291C] border border-red-200 rounded">
                                  {sc.category}
                                </span>
                                <span className="text-[10px] font-mono text-slate-400">
                                  Ficha #{scIdx + 1}
                                </span>
                              </div>
                              <div className="text-xs font-extrabold text-slate-900">
                                {sc.title}
                              </div>
                              <p className="text-[11px] text-slate-600 leading-relaxed">
                                {sc.summary}
                              </p>
                              {Array.isArray(sc.key_points) && sc.key_points.length > 0 && (
                                <ul className="space-y-1 pt-1 border-t border-slate-100">
                                  {sc.key_points.slice(0, 3).map((kp, kIdx) => (
                                    <li
                                      key={kIdx}
                                      className="flex items-start gap-1.5 text-[11px] text-slate-700"
                                    >
                                      <span className="w-1.5 h-1.5 rounded-full bg-[#DA291C] mt-1.5 shrink-0" />
                                      <span>{kp}</span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="divide-y divide-slate-100">
                      {modItems.map((item, idx) => {
                        const isQuestion = Boolean(item.question);
                        return (
                          <div
                            key={item.id}
                            className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-slate-50/80 transition-colors"
                          >
                            <div className="flex items-start gap-3 min-w-0">
                              <span className="text-xs font-mono text-slate-400 mt-0.5 shrink-0">
                                {mIdx + 1}.{idx + 1}
                              </span>
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-xs font-bold text-slate-900">
                                    {item.title}
                                  </span>
                                  <span
                                    className={`text-[10px] font-mono font-bold uppercase ${
                                      isQuestion ? 'text-[#DA291C]' : 'text-slate-500'
                                    }`}
                                  >
                                    ·{' '}
                                    {item.content_type === 'title' && 'Introducción'}
                                    {item.content_type === 'text' && 'Estándar Técnico'}
                                    {item.content_type === 'image' && 'Esquema Visual'}
                                    {item.content_type === 'highlight' && 'Parámetro Clave'}
                                    {item.content_type === 'steps' && 'Paso a Paso'}
                                    {item.content_type === 'question' &&
                                      `Pregunta (${item.question?.points || 10} pts)`}
                                    {item.content_type === 'case_study' &&
                                      `Caso Práctico (${item.question?.points || 20} pts)`}
                                    {item.content_type === 'evaluation' &&
                                      `Evaluación (${item.question?.points || 25} pts)`}
                                  </span>
                                </div>
                                {item.subtitle && (
                                  <p className="text-[11px] text-slate-500 truncate mt-0.5">
                                    {item.subtitle}
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0 text-[11px] font-mono text-slate-500">
                              <Clock className="w-3 h-3 text-[#DA291C]" />
                              <span>~{item.estimated_seconds}s</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Columna Derecha: Materiales de Referencia y Estándar Claro */}
          <div className="lg:col-span-4 space-y-5">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-2.5 border-b border-slate-200 pb-3">
                <FileText className="w-4 h-4 text-[#DA291C]" />
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-900">
                  Material de Referencia del Curso ({selectedMaterials.length})
                </h3>
              </div>

              {selectedMaterials.length === 0 ? (
                <p className="text-xs text-slate-500">
                  Todo el contenido técnico se encuentra integrado directamente en las diapositivas interactivas de la sesión.
                </p>
              ) : (
                <div className="space-y-3">
                  {selectedMaterials.map((mat) => (
                    <div
                      key={mat.id}
                      className="p-3 bg-white border border-slate-200 rounded-lg space-y-1.5"
                    >
                      <div className="text-xs font-bold text-slate-900">
                        {mat.title}
                      </div>
                      <div className="text-[11px] font-mono text-slate-500">
                        [{(mat.file_type || 'doc').toUpperCase()}] {mat.file_name}
                      </div>
                      {mat.extracted_text && (
                        <p className="text-[11px] text-slate-600 line-clamp-4 font-mono bg-slate-50 p-2 rounded border border-slate-100">
                          {mat.extracted_text}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => onStartCourseSession(selectedCourse.slug)}
                  className="w-full py-3 px-4 text-xs font-extrabold uppercase tracking-wider text-white bg-[#DA291C] hover:bg-[#B91C1C] rounded-xl transition-colors inline-flex items-center justify-center gap-2"
                >
                  <span>Comenzar Sesión Ahora</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Tarjeta Institucional U Claro Tecnología */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <UClaroTecnologiaLogo className="w-11 h-11 shrink-0" />
                <div className="text-right">
                  <div className="text-xs font-extrabold text-[#DA291C] uppercase">
                    U Claro Tecnología
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Sesión Certificadora
                  </div>
                </div>
              </div>
              <div className="h-44 w-full bg-white flex items-end justify-center overflow-hidden">
                <img
                  src={CLARO_TECHNICIAN_IMAGE_URL}
                  alt="Modelo Técnico Claro"
                  referrerPolicy="no-referrer"
                  className="h-full w-auto object-contain"
                />
              </div>
              <ul className="space-y-1.5 text-xs text-slate-700 border-t border-slate-100 pt-3">
                <li className="flex items-start gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#DA291C] mt-1 shrink-0" />
                  <span>
                    Los datos se registran en blanco a medida que el personal ingresa al enlace del curso.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#DA291C] mt-1 shrink-0" />
                  <span>
                    Diagnóstico inmediato de fortalezas y puntos de mejora al finalizar la sesión.
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Modal QR */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4 text-center">
            <div className="text-xs font-mono font-bold text-[#DA291C]">
              ACCESO DIRECTO A LA SESIÓN DEL CURSO
            </div>
            <h3 className="text-base font-bold text-slate-900">
              {selectedCourse.title}
            </h3>
            <div className="flex justify-center">
              <CourseQrCodeSvg value={shareUrl} size={180} />
            </div>
            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-700 break-all">
              {shareUrl}
            </div>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setShowQrModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowQrModal(false);
                  onStartCourseSession(selectedCourse.slug);
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-[#DA291C] hover:bg-[#B91C1C] rounded-lg"
              >
                Iniciar Sesión
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
