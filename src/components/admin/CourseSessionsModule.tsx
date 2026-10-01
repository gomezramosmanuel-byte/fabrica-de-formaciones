import React, { useState, useMemo } from 'react';
import {
  ArrowRight,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  Copy,
  Edit3,
  ExternalLink,
  Eye,
  FileText,
  Layers,
  Play,
  Plus,
  QrCode,
  Search,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react';
import {
  CatalogItem,
  Course,
  CourseSessionCohort,
  ParticipantSession,
} from '../../types/lms.ts';
import { CourseQrCodeSvg, ResilientImage } from '../common/ResilientImage.tsx';

interface CourseSessionsModuleProps {
  courses: Course[];
  sessions: ParticipantSession[];
  catalogs: CatalogItem[];
  adminToken: string | null;
  onCreateNewCourse: () => void;
  onEditCourse: (course: Course) => void;
  onLaunchCourseSession: (slug: string, preview: boolean) => void;
  onShowQr: (slug: string) => void;
  onRefresh: () => void;
}

interface GeneratedCourseSession extends CourseSessionCohort {
  session_code: string;
  target_area: string;
  target_role: string;
  course_title: string;
}

export const CourseSessionsModule: React.FC<CourseSessionsModuleProps> = ({
  courses,
  sessions,
  catalogs,
  adminToken,
  onCreateNewCourse,
  onEditCourse,
  onLaunchCourseSession,
  onShowQr,
  onRefresh,
}) => {
  const [selectedCourseId, setSelectedCourseId] = useState<string>(
    () => courses[0]?.id || ''
  );
  const [cohortName, setCohortName] = useState<string>('');
  const [targetArea, setTargetArea] = useState<string>('Todas las áreas');
  const [targetRole, setTargetRole] = useState<string>('Todos los cargos');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'published' | 'draft'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Local list of generated course sessions (persisted in localStorage so admin sees all generated sessions)
  const [generatedSessions, setGeneratedSessions] = useState<GeneratedCourseSession[]>(
    () => {
      try {
        const raw = localStorage.getItem('claro_generated_course_sessions');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch {
        // ignore
      }
      // Initialize default active sessions for published courses
      const now = new Date().toISOString();
      return courses
        .filter((c) => c.status === 'published')
        .map((c, idx) => ({
          id: `cs-${c.id}`,
          course_id: c.id,
          course_title: c.title,
          cohort_name: `Sesión Activa #0${idx + 1} — ${c.title}`,
          session_code: `SES-2026-0${idx + 1}`,
          public_slug: c.slug,
          target_area: 'Todas las áreas',
          target_role: 'Todos los cargos',
          active: true,
          starts_at: now,
          created_at: now,
          updated_at: now,
        }));
    }
  );

  const [activeGeneratedSession, setActiveGeneratedSession] =
    useState<GeneratedCourseSession | null>(null);

  const areaOptions = useMemo(
    () => catalogs.filter((c) => c.type === 'area' && c.active).map((c) => c.name),
    [catalogs]
  );
  const roleOptions = useMemo(
    () => catalogs.filter((c) => c.type === 'role' && c.active).map((c) => c.name),
    [catalogs]
  );

  const saveGeneratedSessions = (next: GeneratedCourseSession[]) => {
    setGeneratedSessions(next);
    try {
      localStorage.setItem('claro_generated_course_sessions', JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const handleGenerateSession = (e: React.FormEvent) => {
    e.preventDefault();
    const targetCourse =
      courses.find((c) => c.id === selectedCourseId) || courses[0];
    if (!targetCourse) return;

    const now = new Date().toISOString();
    const codeSuffix = Math.floor(1000 + Math.random() * 9000);
    const sessionCode = `SES-${new Date().getFullYear()}-${codeSuffix}`;
    const cleanCohortName =
      cohortName.trim() ||
      `Sesión ${targetCourse.title} (${new Date().toLocaleDateString('es-CO')})`;

    const newCourseSession: GeneratedCourseSession = {
      id: `cs-${Date.now()}`,
      course_id: targetCourse.id,
      course_title: targetCourse.title,
      cohort_name: cleanCohortName,
      session_code: sessionCode,
      public_slug: targetCourse.slug,
      target_area: targetArea,
      target_role: targetRole,
      active: true,
      starts_at: now,
      created_at: now,
      updated_at: now,
    };

    const updated = [newCourseSession, ...generatedSessions];
    saveGeneratedSessions(updated);
    setActiveGeneratedSession(newCourseSession);
    setCohortName('');
  };

  const handleQuickGenerateForCourse = (course: Course) => {
    const now = new Date().toISOString();
    const codeSuffix = Math.floor(1000 + Math.random() * 9000);
    const sessionCode = `SES-${new Date().getFullYear()}-${codeSuffix}`;
    const newCourseSession: GeneratedCourseSession = {
      id: `cs-${Date.now()}`,
      course_id: course.id,
      course_title: course.title,
      cohort_name: `Sesión Operativa — ${course.title}`,
      session_code: sessionCode,
      public_slug: course.slug,
      target_area: 'Todas las áreas',
      target_role: 'Todos los cargos',
      active: true,
      starts_at: now,
      created_at: now,
      updated_at: now,
    };
    const updated = [newCourseSession, ...generatedSessions];
    saveGeneratedSessions(updated);
    setActiveGeneratedSession(newCourseSession);
  };

  const handleToggleCourseStatus = async (course: Course) => {
    if (!adminToken) return;
    const nextStatus = course.status === 'published' ? 'draft' : 'published';
    await fetch('/api/admin/courses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        ...course,
        status: nextStatus,
      }),
    });
    onRefresh();
  };

  const handleDeleteCourse = async (courseId: string) => {
    if (!adminToken) return;
    await fetch(`/api/admin/courses/${courseId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    onRefresh();
  };

  const filteredCourses = useMemo(() => {
    return courses.filter((c) => {
      if (statusFilter !== 'ALL' && c.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          c.title.toLowerCase().includes(q) ||
          c.category.toLowerCase().includes(q) ||
          c.slug.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [courses, statusFilter, searchQuery]);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2200);
  };

  return (
    <div className="space-y-8">
      {/* ============================================================================ */}
      {/* 1. CABECERA PRINCIPAL DE LA SECCIÓN CURSO Y GENERADOR DE SESIONES */}
      {/* ============================================================================ */}
      <div className="bg-white border-2 border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
        <div className="h-2 w-full bg-[#DA291C]" />
        <div className="p-6 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div>
            <div className="text-xs font-extrabold uppercase tracking-wider text-[#DA291C] flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#DA291C]" />
              <span>SECCIÓN CURSO · GESTIÓN INTEGRAL Y SESIONES DE FORMACIÓN</span>
            </div>
            <h1 className="text-2xl font-extrabold text-slate-900 mt-1">
              Cursos, Capacitaciones y Generador de Sesiones
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 mt-1 max-w-3xl">
              Administra el catálogo de cursos técnicos, crea nuevas capacitaciones a partir de materiales con IA y genera sesiones de curso activas con enlace público (<span className="font-mono text-[#DA291C]">/formacion/tema</span>) y código QR para el personal.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={onCreateNewCourse}
              className="px-4 py-2.5 text-xs font-extrabold uppercase tracking-wide text-white bg-[#DA291C] hover:bg-[#B91C1C] rounded-xl inline-flex items-center gap-2 shadow-2xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>+ Crear Nuevo Curso (Asistente IA)</span>
            </button>
          </div>
        </div>
      </div>

      {/* ============================================================================ */}
      {/* 2. GENERADOR RÁPIDO DE SESIÓN DE CURSO (CONVOCATORIA / LINK / QR) */}
      {/* ============================================================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 bg-white border-2 border-slate-200 rounded-2xl p-6 space-y-5">
          <div className="border-b border-slate-100 pb-3">
            <div className="text-[11px] font-mono font-bold uppercase text-[#DA291C] flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#DA291C]" />
              <span>CONVOCATORIA Y DESPLIEGUE EN CAMPO</span>
            </div>
            <h2 className="text-base font-extrabold text-slate-900 mt-0.5">
              Generar Nueva Sesión de Curso
            </h2>
            <p className="text-xs text-slate-500">
              Selecciona el curso, define el grupo o cohorte y genera inmediatamente la sesión activa con su enlace y código QR para compartir con los participantes.
            </p>
          </div>

          <form onSubmit={handleGenerateSession} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  1. Seleccionar Curso / Capacitación *
                </label>
                <select
                  value={selectedCourseId}
                  onChange={(e) => setSelectedCourseId(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs font-semibold bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-[#DA291C]"
                >
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title} ({c.category} · {c.estimated_minutes} min ·{' '}
                      {c.status === 'published' ? 'Publicado' : 'Borrador'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  2. Nombre de la Sesión / Grupo (Opcional)
                </label>
                <input
                  type="text"
                  value={cohortName}
                  onChange={(e) => setCohortName(e.target.value)}
                  placeholder="Ej. Sesión Certificación FTTH - Cuadrillas Regional Centro"
                  className="w-full px-3.5 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-[#DA291C]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  3. Área Objetivo
                </label>
                <select
                  value={targetArea}
                  onChange={(e) => setTargetArea(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl"
                >
                  <option value="Todas las áreas">Todas las áreas</option>
                  {areaOptions.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  4. Cargo Objetivo
                </label>
                <select
                  value={targetRole}
                  onChange={(e) => setTargetRole(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-xl"
                >
                  <option value="Todos los cargos">Todos los cargos de la organización</option>
                  {roleOptions.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
              <span className="text-[11px] text-slate-500">
                Los participantes ingresarán con su Nombre, Cédula, Área y Cargo.
              </span>
              <button
                type="submit"
                className="px-5 py-2.5 text-xs font-extrabold uppercase tracking-wide text-white bg-[#DA291C] hover:bg-[#B91C1C] rounded-xl inline-flex items-center gap-2 shadow-2xs transition-colors"
              >
                <Sparkles className="w-4 h-4" />
                <span>Generar Sesión de Curso</span>
              </button>
            </div>
          </form>
        </div>

        {/* Right 5 Cols: Active Generated Session Card or Latest Session */}
        <div className="lg:col-span-5 bg-white border-2 border-[#DA291C] rounded-2xl overflow-hidden shadow-xs">
          <div className="bg-[#DA291C] px-5 py-3 text-white flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wider">
              {activeGeneratedSession
                ? 'Sesión de Curso Generada y Lista'
                : 'Acceso Rápido a Sesión de Curso'}
            </span>
            <span className="text-[11px] font-mono bg-white/20 px-2 py-0.5 rounded">
              {activeGeneratedSession?.session_code ||
                generatedSessions[0]?.session_code ||
                'SES-ACTIVA'}
            </span>
          </div>

          {(() => {
            const featured = activeGeneratedSession || generatedSessions[0];
            const fallbackCourse = courses[0];
            const slug = featured?.public_slug || fallbackCourse?.slug || 'ftth';
            const title =
              featured?.cohort_name ||
              fallbackCourse?.title ||
              'Sesión de Capacitación';
            const shareUrl = `${window.location.origin}/formacion/${slug}`;

            return (
              <div className="p-5 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="text-xs font-bold text-[#DA291C]">
                      {featured?.course_title || fallbackCourse?.title}
                    </div>
                    <h3 className="text-base font-extrabold text-slate-900 leading-snug">
                      {title}
                    </h3>
                    <div className="text-[11px] text-slate-600">
                      Dirigido a: <strong>{featured?.target_area || 'Todas las áreas'}</strong> ·{' '}
                      <strong>{featured?.target_role || 'Todos los cargos'}</strong>
                    </div>
                  </div>
                  <div className="shrink-0">
                    <CourseQrCodeSvg value={shareUrl} size={92} />
                  </div>
                </div>

                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-2 text-xs font-mono text-slate-700">
                  <span className="truncate">{shareUrl}</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(shareUrl, 'featured-session')}
                    className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-sans font-bold text-slate-800 hover:border-[#DA291C] hover:text-[#DA291C] shrink-0"
                  >
                    {copiedKey === 'featured-session' ? '¡Copiado!' : 'Copiar link'}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => onLaunchCourseSession(slug, false)}
                    className="py-2.5 px-3 text-xs font-extrabold uppercase tracking-wide text-white bg-[#DA291C] hover:bg-[#B91C1C] rounded-xl inline-flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Iniciar Sesión Curso</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onShowQr(slug)}
                    className="py-2.5 px-3 text-xs font-bold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl inline-flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <QrCode className="w-3.5 h-3.5 text-[#DA291C]" />
                    <span>Ampliar QR</span>
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* ============================================================================ */}
      {/* 3. TABLA DE SESIONES DE CURSO GENERADAS (CONVOCATORIAS ACTIVAS) */}
      {/* ============================================================================ */}
      {generatedSessions.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#DA291C]" />
              <span>Sesiones de Curso Activas ({generatedSessions.length})</span>
            </h2>
            <span className="text-xs text-slate-500">
              Comparte el enlace con el personal o haz clic en &ldquo;Iniciar Sesión&rdquo; para abrir la experiencia formativa
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600">
                  <th className="py-2.5 px-4">Código</th>
                  <th className="py-2.5 px-4">Sesión / Convocatoria</th>
                  <th className="py-2.5 px-4">Curso Base</th>
                  <th className="py-2.5 px-4">Área / Cargo</th>
                  <th className="py-2.5 px-4">Enlace Público</th>
                  <th className="py-2.5 px-4 text-right">Participaciones Reales</th>
                  <th className="py-2.5 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {generatedSessions.map((gs) => {
                  const countReal = sessions.filter(
                    (s) => s.course_id === gs.course_id
                  ).length;
                  const url = `${window.location.origin}/formacion/${gs.public_slug}`;
                  return (
                    <tr key={gs.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-mono font-bold text-[#DA291C]">
                        {gs.session_code}
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-900">
                        {gs.cohort_name}
                      </td>
                      <td className="py-3 px-4 text-slate-700">{gs.course_title}</td>
                      <td className="py-3 px-4 text-slate-600">
                        <div>{gs.target_area}</div>
                        <div className="text-[11px] text-slate-400">{gs.target_role}</div>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600">
                        /formacion/{gs.public_slug}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                        {countReal}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => copyToClipboard(url, gs.id)}
                            className="px-2.5 py-1 text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg"
                          >
                            {copiedKey === gs.id ? 'Copiado' : 'Copiar link'}
                          </button>
                          <button
                            type="button"
                            onClick={() => onLaunchCourseSession(gs.public_slug, false)}
                            className="px-2.5 py-1 text-[11px] font-bold text-white bg-[#DA291C] hover:bg-[#B91C1C] rounded-lg inline-flex items-center gap-1"
                          >
                            <Play className="w-3 h-3" />
                            <span>Iniciar Sesión</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================================ */}
      {/* 4. CATÁLOGO Y ADMINISTRACIÓN DE CURSOS (PUBLICADOS Y BORRADORES) */}
      {/* ============================================================================ */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-extrabold text-slate-900 mr-2 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#DA291C]" />
              <span>Cursos Configurados ({courses.length}):</span>
            </span>
            {[
              { id: 'ALL', label: `Todos (${courses.length})` },
              {
                id: 'published',
                label: `Publicados (${courses.filter((c) => c.status === 'published').length})`,
              },
              {
                id: 'draft',
                label: `Borradores (${courses.filter((c) => c.status === 'draft').length})`,
              },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  statusFilter === tab.id
                    ? 'bg-[#DA291C] text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar curso por nombre o categoría..."
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-[#DA291C]"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {filteredCourses.map((c) => {
            const cMods = Array.isArray(c.modules) ? c.modules : [];
            const totalSlides = cMods.reduce(
              (acc, m) => acc + (m.items || []).length,
              0
            );
            const totalQuestions = cMods.reduce(
              (acc, m) =>
                acc + (m.items || []).filter((it) => Boolean(it.question)).length,
              0
            );
            const shareUrl = `${window.location.origin}/formacion/${c.slug}`;
            const courseSessionsCount = sessions.filter(
              (s) => s.course_id === c.id
            ).length;

            return (
              <div
                key={c.id}
                className="bg-white border-2 border-slate-200 hover:border-slate-300 rounded-2xl p-5 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-5 shadow-2xs transition-colors"
              >
                <div className="flex items-start gap-4 max-w-3xl">
                  <div className="w-36 h-24 rounded-xl overflow-hidden border border-slate-200 shrink-0 hidden sm:block bg-slate-900">
                    <ResilientImage
                      src={c.cover_image_url}
                      alt={c.title}
                      category={c.category}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => handleToggleCourseStatus(c)}
                        className={`font-bold px-2 py-0.5 rounded border ${
                          c.status === 'published'
                            ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                            : 'text-amber-700 bg-amber-50 border-amber-200'
                        }`}
                        title="Haz clic para cambiar entre Publicado y Borrador"
                      >
                        {c.status === 'published' ? '● PUBLICADO' : '▲ BORRADOR'}
                      </button>
                      <span className="font-semibold text-[#DA291C]">{c.category}</span>
                      <span>·</span>
                      <span className="text-slate-600">Nivel {c.level}</span>
                      <span>·</span>
                      <span className="font-mono text-slate-500">
                        /formacion/{c.slug}
                      </span>
                    </div>

                    <h3 className="text-base font-extrabold text-slate-900">
                      {c.title}
                    </h3>
                    <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                      {c.description}
                    </p>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 font-mono pt-1">
                      <span>{cMods.length} módulos</span>
                      <span>·</span>
                      <span>{totalSlides} pantallas</span>
                      <span>·</span>
                      <span>{totalQuestions} preguntas</span>
                      <span>·</span>
                      <span>{c.estimated_minutes} min</span>
                      <span>·</span>
                      <span>Aprobación: {c.passing_score}%</span>
                      <span>·</span>
                      <span className="text-[#DA291C] font-bold">
                        {courseSessionsCount} participantes registrados
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleQuickGenerateForCourse(c)}
                    className="px-3 py-2 text-xs font-bold text-[#DA291C] bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl inline-flex items-center gap-1.5 transition-colors"
                    title="Generar nueva sesión para este curso"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Generar Sesión</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onLaunchCourseSession(c.slug, false)}
                    className="px-3.5 py-2 text-xs font-extrabold text-white bg-[#DA291C] hover:bg-[#B91C1C] rounded-xl inline-flex items-center gap-1.5 transition-colors"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Iniciar Curso</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => copyToClipboard(shareUrl, c.id)}
                    className="px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl inline-flex items-center gap-1.5"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>{copiedKey === c.id ? 'Copiado' : 'Link'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onShowQr(c.slug)}
                    className="p-2 text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl"
                    title="Código QR"
                  >
                    <QrCode className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => onEditCourse(c)}
                    className="px-3 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl inline-flex items-center gap-1.5"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Editar Curso</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDeleteCourse(c.id)}
                    className="p-2 text-slate-400 hover:text-red-600 rounded-xl border border-slate-200"
                    title="Eliminar curso"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
