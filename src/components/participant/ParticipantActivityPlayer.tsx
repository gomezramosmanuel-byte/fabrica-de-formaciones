import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  BookOpen,
  CheckCircle2,
  AlertTriangle,
  Clock,
  MessageSquare,
  RotateCcw,
  Send,
  ShieldCheck,
  UserCheck,
  X,
  FileText,
  Award,
} from 'lucide-react';
import {
  AnswerSubmissionFeedback,
  CatalogItem,
  ContentItem,
  Course,
  CourseResult,
  ModuleStudyCard,
  Participant,
  ParticipantSession,
} from '../../types/lms.ts';
import { ResilientImage } from '../common/ResilientImage.tsx';
import {
  CLARO_TECHNICIAN_IMAGE_URL,
  UClaroTecnologiaLogo,
} from '../common/ClaroBrandAssets.tsx';

interface ParticipantActivityPlayerProps {
  slug: string;
  adminToken?: string | null;
  isPreviewMode?: boolean;
  onExit: () => void;
}

interface FlattenedSlide {
  globalIndex: number;
  moduleIndex: number;
  totalModules: number;
  moduleTitle: string;
  studyCards: ModuleStudyCard[];
  item: ContentItem;
}

export const ParticipantActivityPlayer: React.FC<ParticipantActivityPlayerProps> = ({
  slug,
  adminToken,
  isPreviewMode = false,
  onExit,
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [course, setCourse] = useState<Course | null>(null);
  const [catalogs, setCatalogs] = useState<CatalogItem[]>([]);

  // Registration state (4 mandatory fields: Nombre completo, Cédula, Área, Cargo)
  const [fullName, setFullName] = useState('');
  const [identification, setIdentification] = useState('');
  const [area, setArea] = useState('');
  const [role, setRole] = useState('');
  const [customAreaMode, setCustomAreaMode] = useState(false);
  const [customRoleMode, setCustomRoleMode] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{
    fullName?: string;
    identification?: string;
    area?: string;
    role?: string;
  }>({});
  const [regError, setRegError] = useState<string | null>(null);
  const [submittingReg, setSubmittingReg] = useState(false);
  const [blockedSingleAttemptMsg, setBlockedSingleAttemptMsg] = useState<string | null>(null);

  // Active Learning Session state
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [session, setSession] = useState<ParticipantSession | null>(null);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const [currentSlideIdx, setCurrentSlideIdx] = useState(0);
  const [returnToQuestionSlideIdx, setReturnToQuestionSlideIdx] = useState<number | null>(null);
  const [slideEnteredAt, setSlideEnteredAt] = useState<number>(Date.now());
  const [completedResult, setCompletedResult] = useState<CourseResult | null>(null);
  const [showSessionSyllabus, setShowSessionSyllabus] = useState(false);
  const [showReferenceMaterials, setShowReferenceMaterials] = useState(false);
  const [showModuleStudyCards, setShowModuleStudyCards] = useState(false);

  // Interactive slide elements state
  const [activeSelectableCardIdx, setActiveSelectableCardIdx] = useState<number>(0);
  const [openAccordionIdx, setOpenAccordionIdx] = useState<number>(0);
  const [activeHotspotIdx, setActiveHotspotIdx] = useState<number>(0);
  const [activeStudyCardIdx, setActiveStudyCardIdx] = useState<number>(0);

  // Interactive Question state per question_id
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string[]>>({});
  const [orderedStepsMap, setOrderedStepsMap] = useState<Record<string, string[]>>({});
  const [feedbackByQuestion, setFeedbackByQuestion] = useState<
    Record<string, AnswerSubmissionFeedback>
  >({});
  const [submittingAnswer, setSubmittingAnswer] = useState(false);

  const hydrateSessionAnswers = (
    existingAnswers?: Array<{ question_id: string; selected_option_ids: string[] }>,
    feedbackMap?: Record<string, AnswerSubmissionFeedback>
  ) => {
    if (feedbackMap) {
      setFeedbackByQuestion(feedbackMap);
    }
    if (existingAnswers && existingAnswers.length > 0) {
      const selMap: Record<string, string[]> = {};
      for (const ans of existingAnswers) {
        if (ans.selected_option_ids?.length) {
          selMap[ans.question_id] = ans.selected_option_ids;
        }
      }
      setSelectedOptions((prev) => ({ ...prev, ...selMap }));
    }
  };

  useEffect(() => {
    let mounted = true;
    async function loadActivity() {
      setLoading(true);
      setError(null);
      try {
        const headers: Record<string, string> = {};
        if (adminToken) {
          headers.Authorization = `Bearer ${adminToken}`;
        }
        const res = await fetch(`/api/public/activity/${encodeURIComponent(slug)}`, {
          headers,
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'No fue posible cargar la actividad.');
        }
        if (mounted) {
          setCourse(data.course);
          const cats: CatalogItem[] = data.catalogs || [];
          setCatalogs(cats);

          // Automatically restore active session if participant reloads browser
          const savedSessionId = sessionStorage.getItem(`fif_active_session_${slug}`);
          if (savedSessionId) {
            const sRes = await fetch(
              `/api/public/sessions/${encodeURIComponent(savedSessionId)}`
            );
            if (sRes.ok) {
              const sData = await sRes.json();
              if (sData.session && sData.participant) {
                setParticipant(sData.participant);
                setSession(sData.session);
                setCurrentSlideIdx(Math.max(0, sData.session.current_slide_index || 0));
                hydrateSessionAnswers(sData.existing_answers, sData.feedback_map);
                if (sData.result) {
                  setCompletedResult(sData.result);
                }
              }
            }
          }
        }
      } catch (err: any) {
        if (mounted) setError(err.message);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    loadActivity();
    return () => {
      mounted = false;
    };
  }, [slug, adminToken]);

  const slides: FlattenedSlide[] = useMemo(() => {
    if (!course) return [];
    const list: FlattenedSlide[] = [];
    const mods = Array.isArray(course.modules) ? course.modules : [];
    const totalMods = mods.length;
    mods.forEach((mod, mIdx) => {
      const studyCards = Array.isArray(mod.study_cards) ? mod.study_cards : [];
      (mod.items || []).forEach((item) => {
        list.push({
          globalIndex: list.length,
          moduleIndex: mIdx + 1,
          totalModules: totalMods,
          moduleTitle: mod.title,
          studyCards,
          item,
        });
      });
    });
    return list;
  }, [course]);

  // Initialize shuffled order for order_steps questions
  useEffect(() => {
    if (!slides.length) return;
    const initialOrder: Record<string, string[]> = {};
    slides.forEach((sl) => {
      const q = sl.item.question;
      if (q && q.question_type === 'order_steps') {
        // Reverse or rotate slightly so user actively orders them
        const ids = q.options.map((o) => o.id);
        if (ids.length > 1) {
          initialOrder[q.id] = [ids[1], ids[0], ...ids.slice(2).reverse()];
        } else {
          initialOrder[q.id] = ids;
        }
      }
    });
    setOrderedStepsMap((prev) => ({ ...initialOrder, ...prev }));
  }, [slides]);

  const fillQuickParticipantDemo = () => {
    setFullName('Andrés Felipe Vargas Quintero');
    setIdentification('1020765432');
    const firstArea =
      catalogs.find((c) => c.type === 'area')?.name || 'Operaciones de Campo';
    const firstRole =
      catalogs.find((c) => c.type === 'role')?.name || 'Técnico Instalador FTTH';
    setArea(firstArea);
    setRole(firstRole);
    setFieldErrors({});
    setRegError(null);
  };

  const validateRegistrationFields = () => {
    const nextErrors: {
      fullName?: string;
      identification?: string;
      area?: string;
      role?: string;
    } = {};

    const cleanName = fullName.replace(/\s+/g, ' ').trim();
    const cleanCedula = identification.replace(/\s+/g, '').trim();
    const cleanArea = area.replace(/\s+/g, ' ').trim();
    const cleanRole = role.replace(/\s+/g, ' ').trim();

    if (!cleanName) {
      nextErrors.fullName = 'El Nombre completo es obligatorio.';
    } else if (!/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ'’\-\s]{3,}$/.test(cleanName)) {
      nextErrors.fullName =
        'Ingresa un nombre válido (solo letras, espacios y caracteres propios de nombres).';
    }

    if (!cleanCedula) {
      nextErrors.identification = 'La Cédula es obligatoria.';
    } else if (!/^[0-9A-Za-z-]{4,20}$/.test(cleanCedula)) {
      nextErrors.identification =
        'Ingresa un número de cédula válido sin espacios innecesarios.';
    }

    if (!cleanArea) {
      nextErrors.area = 'El campo Área es obligatorio.';
    }

    if (!cleanRole) {
      nextErrors.role = 'El campo Cargo es obligatorio.';
    }

    setFieldErrors(nextErrors);
    return {
      isValid: Object.keys(nextErrors).length === 0,
      cleanName,
      cleanCedula,
      cleanArea,
      cleanRole,
    };
  };

  const handleStartActivity = async (e: React.FormEvent, forceNewAttempt = false) => {
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }
    setRegError(null);
    setBlockedSingleAttemptMsg(null);

    const { isValid, cleanName, cleanCedula, cleanArea, cleanRole } =
      validateRegistrationFields();
    if (!isValid) {
      setRegError(
        'Por favor completa correctamente los cuatro campos obligatorios antes de iniciar la actividad.'
      );
      return;
    }

    setSubmittingReg(true);
    try {
      const res = await fetch(`/api/public/activity/${encodeURIComponent(slug)}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: cleanName,
          identification_number: cleanCedula,
          area: cleanArea,
          role: cleanRole,
          force_new_attempt: forceNewAttempt,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al registrar participante.');
      }

      if (data.status === 'blocked_single_attempt') {
        setBlockedSingleAttemptMsg(data.message);
        return;
      }

      setParticipant(data.participant);
      setSession(data.session);
      setSessionNotice(data.message);
      if (data.session?.id) {
        sessionStorage.setItem(`fif_active_session_${slug}`, data.session.id);
      }
      hydrateSessionAnswers(data.existing_answers, data.feedback_map);
      const startSlide = Math.min(
        Math.max(0, data.session.current_slide_index || 0),
        Math.max(0, slides.length - 1)
      );
      setCurrentSlideIdx(startSlide);
      setSlideEnteredAt(Date.now());
    } catch (err: any) {
      setRegError(err.message);
    } finally {
      setSubmittingReg(false);
    }
  };

  const currentSlide = slides[currentSlideIdx];
  const currentQuestion = currentSlide?.item.question;
  const currentFeedback = currentQuestion ? feedbackByQuestion[currentQuestion.id] : undefined;

  // Reset interactive slide indices when changing slides
  useEffect(() => {
    setActiveSelectableCardIdx(0);
    setOpenAccordionIdx(0);
    setActiveHotspotIdx(0);
  }, [currentSlideIdx]);

  // Fundamental rule: before advancing to the next module, all questions in the current module must be answered
  const unansweredQuestionSlideInCurrentModule = useMemo(() => {
    if (!currentSlide) return null;
    const nextSlide = slides[currentSlideIdx + 1];
    const isLeavingModule =
      !nextSlide || nextSlide.moduleIndex !== currentSlide.moduleIndex;
    if (!isLeavingModule) return null;
    const pending = slides.find(
      (s) =>
        s.moduleIndex === currentSlide.moduleIndex &&
        Boolean(s.item.question) &&
        !feedbackByQuestion[s.item.question!.id]
    );
    return pending || null;
  }, [currentSlide, currentSlideIdx, slides, feedbackByQuestion]);

  const canAdvanceFromCurrentSlide = useMemo(() => {
    if (currentQuestion) {
      if (!currentFeedback) return false;
      if (!currentFeedback.is_correct && currentFeedback.attempts_remaining > 0) {
        return false;
      }
    }
    if (unansweredQuestionSlideInCurrentModule) {
      return false;
    }
    return true;
  }, [currentQuestion, currentFeedback, unansweredQuestionSlideInCurrentModule]);

  const handleToggleOption = (questionId: string, optionId: string, isMultiple: boolean) => {
    setSelectedOptions((prev) => {
      const current = prev[questionId] || [];
      if (isMultiple) {
        const exists = current.includes(optionId);
        return {
          ...prev,
          [questionId]: exists
            ? current.filter((id) => id !== optionId)
            : [...current, optionId],
        };
      }
      return {
        ...prev,
        [questionId]: [optionId],
      };
    });
  };

  const handleMoveStepOrder = (questionId: string, index: number, direction: -1 | 1) => {
    setOrderedStepsMap((prev) => {
      const list = [...(prev[questionId] || [])];
      const targetIdx = index + direction;
      if (targetIdx < 0 || targetIdx >= list.length) return prev;
      const temp = list[index];
      list[index] = list[targetIdx];
      list[targetIdx] = temp;
      return {
        ...prev,
        [questionId]: list,
      };
    });
  };

  const handleSubmitAnswer = async () => {
    if (!session || !currentQuestion) return;
    const isOrder = currentQuestion.question_type === 'order_steps';
    const chosenIds = isOrder
      ? orderedStepsMap[currentQuestion.id] || currentQuestion.options.map((o) => o.id)
      : selectedOptions[currentQuestion.id] || [];

    if (chosenIds.length === 0) return;

    setSubmittingAnswer(true);
    try {
      const durationSec = Math.max(2, Math.round((Date.now() - slideEnteredAt) / 1000));
      const res = await fetch(`/api/public/sessions/${session.id}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question_id: currentQuestion.id,
          selected_option_ids: chosenIds,
          response_duration_seconds: durationSec,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'No fue posible validar tu respuesta.');
      }
      setFeedbackByQuestion((prev) => ({
        ...prev,
        [currentQuestion.id]: data.feedback,
      }));
      setSession(data.session);
      setSlideEnteredAt(Date.now());
    } catch (err: any) {
      console.error(err);
    } finally {
      setSubmittingAnswer(false);
    }
  };

  const handleRetryQuestion = (questionId: string) => {
    setFeedbackByQuestion((prev) => {
      const copy = { ...prev };
      delete copy[questionId];
      return copy;
    });
    setSlideEnteredAt(Date.now());
  };

  const handleJumpToRelatedSlide = (relatedContentId?: string) => {
    if (!relatedContentId) return;
    const targetIdx = slides.findIndex((s) => s.item.id === relatedContentId);
    if (targetIdx >= 0) {
      setReturnToQuestionSlideIdx(currentSlideIdx);
      setCurrentSlideIdx(targetIdx);
    }
  };

  const handleNavigateSlide = async (nextIdx: number, finalize = false) => {
    if (!session) return;
    const elapsedSec = Math.max(1, Math.round((Date.now() - slideEnteredAt) / 1000));
    setSlideEnteredAt(Date.now());

    if (!finalize) {
      setCurrentSlideIdx(nextIdx);
    }

    try {
      const res = await fetch(`/api/public/sessions/${session.id}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slide_index: nextIdx,
          elapsed_seconds_delta: elapsedSec,
          finalize,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSession(data.session);
        if (finalize && data.result) {
          setCompletedResult(data.result);
        }
      }
    } catch (err) {
      console.error('Error guardando avance:', err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl p-8 text-center">
          <div className="w-10 h-10 border-2 border-sky-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm font-medium text-slate-700">
            Cargando experiencia formativa...
          </p>
        </div>
      </div>
    );
  }

  if (error || !course) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-white border border-slate-200 rounded-xl p-8">
          <div className="flex items-center gap-3 text-red-600 mb-3">
            <AlertTriangle className="w-6 h-6 shrink-0" />
            <h2 className="text-lg font-semibold text-slate-900">
              Actividad no disponible
            </h2>
          </div>
          <p className="text-sm text-slate-600 mb-6">
            {error || 'El enlace de la actividad no existe o no ha sido publicado.'}
          </p>
          <button
            onClick={onExit}
            className="px-4 py-2 text-sm font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            Volver al portal principal
          </button>
        </div>
      </div>
    );
  }

  // ============================================================================
  // PANTALLA 1: BIENVENIDA Y NUEVO FORMULARIO DE REGISTRO (4 CAMPOS + IDENTIDAD CLARO)
  // ============================================================================
  if (!session) {
    const areaCatalogs = catalogs.filter((c) => c.type === 'area' && c.active);
    const roleCatalogs = catalogs.filter((c) => c.type === 'role' && c.active);

    const retryPolicyText =
      course.retry_policy === 'continue'
        ? 'Permite retomar desde el progreso guardado con tu cédula'
        : course.retry_policy === 'new_attempt'
        ? 'Permite realizar nuevos intentos con tu cédula'
        : 'Política de único intento por cédula';

    return (
      <div className="min-h-screen bg-white text-slate-900 flex flex-col">
        {/* Top Bar with U Claro Tecnología Brand */}
        <header className="bg-white border-b-2 border-[#DA291C] px-6 py-3.5">
          <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <UClaroTecnologiaLogo className="w-11 h-11 shrink-0" />
              <div>
                <div className="text-[11px] font-bold tracking-wider uppercase text-[#DA291C]">
                  U Claro Tecnología · Formación Técnica y Operativa
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <button
                    onClick={onExit}
                    className="inline-flex items-center gap-1.5 font-semibold text-slate-700 hover:text-[#DA291C] transition-colors whitespace-nowrap"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Biblioteca de Capacitaciones</span>
                  </button>
                  <span className="text-slate-300">·</span>
                  <span className="font-mono text-slate-500">
                    /formacion/{course.slug}
                  </span>
                </div>
              </div>
            </div>
            {isPreviewMode && (
              <span className="text-xs font-semibold text-[#DA291C]">
                Modo Previsualización Administrativa
              </span>
            )}
          </div>
        </header>

        <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8 lg:py-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
            {/* Left Column: Course Presentation + Claro Technician Visual (6 cols) */}
            <div className="lg:col-span-6 bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm flex flex-col justify-between">
              <div>
                <div className="aspect-video w-full relative overflow-hidden bg-slate-900">
                  <ResilientImage
                    src={course.cover_image_url}
                    alt={course.title}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent flex flex-col justify-end p-6">
                    <div className="flex items-center gap-2 text-xs text-white font-semibold mb-1.5">
                      <span className="w-2 h-2 rounded-full bg-[#DA291C]" />
                      <span>{course.category}</span>
                      <span>·</span>
                      <span>Nivel: {course.level}</span>
                    </div>
                    <h1 className="text-xl sm:text-2xl font-bold text-white leading-snug">
                      {course.title}
                    </h1>
                  </div>
                </div>

                {/* White background with Claro Corporate Red Bullets ("fondo blanco viñetas rojas") */}
                <div className="p-6 space-y-4 bg-white">
                  <p className="text-sm text-slate-700 leading-relaxed">
                    {course.description}
                  </p>

                  <ul className="space-y-2.5 text-xs sm:text-sm text-slate-800 pt-2 border-t border-slate-100">
                    <li className="flex items-start gap-2.5">
                      <span className="w-2 h-2 rounded-full bg-[#DA291C] mt-1.5 shrink-0" />
                      <span>
                        <strong>Duración estimada:</strong>{' '}
                        <span className="font-mono font-semibold">{course.estimated_minutes} minutos</span>
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <span className="w-2 h-2 rounded-full bg-[#DA291C] mt-1.5 shrink-0" />
                      <span>
                        <strong>Número de módulos:</strong>{' '}
                        <span className="font-mono font-semibold">
                          {course.modules.length} módulos ({slides.length} pantallas interactivas)
                        </span>
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <span className="w-2 h-2 rounded-full bg-[#DA291C] mt-1.5 shrink-0" />
                      <span>
                        <strong>Nota mínima de aprobación:</strong>{' '}
                        <span className="font-mono font-bold text-[#DA291C]">
                          {course.passing_score}%
                        </span>
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <span className="w-2 h-2 rounded-full bg-[#DA291C] mt-1.5 shrink-0" />
                      <span>
                        <strong>Política de participación:</strong> {retryPolicyText}
                      </span>
                    </li>
                  </ul>
                </div>
              </div>

              {/* Claro Corporate Technician Showcase Banner on White Background */}
              <div className="px-6 py-4 bg-white border-t border-slate-100 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <UClaroTecnologiaLogo className="w-12 h-12 shrink-0" />
                  <div className="space-y-0.5">
                    <div className="text-xs font-bold text-slate-900">
                      Modelo Técnico U Claro Tecnología
                    </div>
                    <p className="text-[11px] text-slate-600 leading-snug">
                      Excelencia operativa, certificación continua y estándares de calidad en campo.
                    </p>
                  </div>
                </div>
                <div className="w-24 h-28 shrink-0 bg-white rounded-lg overflow-hidden flex items-end justify-center">
                  <img
                    src={CLARO_TECHNICIAN_IMAGE_URL}
                    alt="Modelo Técnico Claro"
                    referrerPolicy="no-referrer"
                    className="h-full w-auto object-contain"
                  />
                </div>
              </div>
            </div>

            {/* Right Column: Simplified 4-Field Registration Form (6 cols) */}
            <div className="lg:col-span-6 bg-white border border-slate-200 rounded-2xl p-6 lg:p-8 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex flex-wrap items-start justify-between gap-3 mb-6 pb-4 border-b border-slate-100">
                  <div>
                    <div className="flex items-center gap-2 text-xs font-bold text-[#DA291C] uppercase tracking-wider mb-1">
                      <span className="w-2 h-2 rounded-full bg-[#DA291C]" />
                      <span>Portal del Participante</span>
                    </div>
                    <h2 className="text-xl font-bold text-slate-900">
                      Antes de iniciar, registra tus datos
                    </h2>
                  </div>
                </div>

                {regError && (
                  <div className="mb-5 p-3.5 bg-red-50 border-l-4 border-[#DA291C] rounded-r-lg flex items-start gap-2.5 text-xs text-red-800">
                    <AlertTriangle className="w-4 h-4 text-[#DA291C] shrink-0 mt-0.5" />
                    <span className="font-medium">{regError}</span>
                  </div>
                )}

                {blockedSingleAttemptMsg && (
                  <div className="mb-5 p-4 bg-amber-50 border-l-4 border-amber-600 rounded-r-lg text-xs text-amber-950 space-y-1.5">
                    <div className="font-bold flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-700" />
                      <span>Participación ya finalizada</span>
                    </div>
                    <p>{blockedSingleAttemptMsg}</p>
                  </div>
                )}

                <form
                  onSubmit={(e) => handleStartActivity(e, false)}
                  noValidate
                  className="space-y-5"
                >
                  {/* 1. Nombre completo * */}
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-bold text-slate-800 mb-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#DA291C]" />
                      <span>Nombre completo *</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => {
                        setFullName(e.target.value);
                        if (fieldErrors.fullName) {
                          setFieldErrors((prev) => ({ ...prev, fullName: undefined }));
                        }
                      }}
                      placeholder="Ej. Juan Pérez Gómez"
                      className={`w-full px-3.5 py-2.5 text-sm bg-white border rounded-lg focus:outline-none transition-colors ${
                        fieldErrors.fullName
                          ? 'border-[#DA291C] bg-red-50/30'
                          : 'border-slate-300 focus:border-[#DA291C]'
                      }`}
                    />
                    {fieldErrors.fullName && (
                      <p className="text-xs font-medium text-[#DA291C] mt-1">
                        {fieldErrors.fullName}
                      </p>
                    )}
                  </div>

                  {/* 2. Cédula * */}
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-bold text-slate-800 mb-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#DA291C]" />
                      <span>Cédula *</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={identification}
                      onChange={(e) => {
                        const cleanVal = e.target.value.replace(/\s+/g, '');
                        setIdentification(cleanVal);
                        if (fieldErrors.identification) {
                          setFieldErrors((prev) => ({
                            ...prev,
                            identification: undefined,
                          }));
                        }
                      }}
                      placeholder="Ej. 1032458910"
                      className={`w-full px-3.5 py-2.5 text-sm font-mono bg-white border rounded-lg focus:outline-none transition-colors ${
                        fieldErrors.identification
                          ? 'border-[#DA291C] bg-red-50/30'
                          : 'border-slate-300 focus:border-[#DA291C]'
                      }`}
                    />
                    {fieldErrors.identification ? (
                      <p className="text-xs font-medium text-[#DA291C] mt-1">
                        {fieldErrors.identification}
                      </p>
                    ) : (
                      <p className="text-[11px] text-slate-500 mt-1">
                        Se utiliza únicamente para reconocer tu historial y progreso. No se muestra públicamente.
                      </p>
                    )}
                  </div>

                  {/* 3. Área * */}
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <label className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#DA291C]" />
                        <span>Área *</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setCustomAreaMode((prev) => !prev);
                        }}
                        className="text-[11px] font-semibold text-[#DA291C] hover:underline"
                      >
                        {customAreaMode
                          ? 'Seleccionar área del catálogo'
                          : '+ Ingresar otra área'}
                      </button>
                    </div>

                    {!customAreaMode && areaCatalogs.length > 0 ? (
                      <select
                        required
                        value={
                          areaCatalogs.some((c) => c.name === area) ? area : area ? '__CUSTOM__' : ''
                        }
                        onChange={(e) => {
                          if (e.target.value === '__CUSTOM__') {
                            setCustomAreaMode(true);
                            setArea('');
                          } else {
                            setArea(e.target.value);
                          }
                          if (fieldErrors.area) {
                            setFieldErrors((prev) => ({ ...prev, area: undefined }));
                          }
                        }}
                        className={`w-full px-3.5 py-2.5 text-sm bg-white border rounded-lg focus:outline-none transition-colors ${
                          fieldErrors.area
                            ? 'border-[#DA291C] bg-red-50/30'
                            : 'border-slate-300 focus:border-[#DA291C]'
                        }`}
                      >
                        <option value="">-- Selecciona tu área --</option>
                        {areaCatalogs.map((item) => (
                          <option key={item.id} value={item.name}>
                            {item.name}
                          </option>
                        ))}
                        <option value="__CUSTOM__">
                          + Otra área (Ingresar manualmente...)
                        </option>
                      </select>
                    ) : (
                      <input
                        type="text"
                        required
                        list="areas-catalog-options"
                        value={area}
                        onChange={(e) => {
                          setArea(e.target.value);
                          if (fieldErrors.area) {
                            setFieldErrors((prev) => ({ ...prev, area: undefined }));
                          }
                        }}
                        placeholder="Escribe el nombre de tu área (Ej. Operaciones de Campo, NOC, Planta Externa...)"
                        className={`w-full px-3.5 py-2.5 text-sm bg-white border rounded-lg focus:outline-none transition-colors ${
                          fieldErrors.area
                            ? 'border-[#DA291C] bg-red-50/30'
                            : 'border-slate-300 focus:border-[#DA291C]'
                        }`}
                      />
                    )}
                    <datalist id="areas-catalog-options">
                      {areaCatalogs.map((item) => (
                        <option key={item.id} value={item.name} />
                      ))}
                    </datalist>
                    {fieldErrors.area && (
                      <p className="text-xs font-medium text-[#DA291C] mt-1">
                        {fieldErrors.area}
                      </p>
                    )}
                  </div>

                  {/* 4. Cargo * */}
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <label className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#DA291C]" />
                        <span>Cargo *</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setCustomRoleMode((prev) => !prev);
                        }}
                        className="text-[11px] font-semibold text-[#DA291C] hover:underline"
                      >
                        {customRoleMode
                          ? 'Seleccionar cargo del catálogo'
                          : '+ Ingresar nuevo cargo'}
                      </button>
                    </div>

                    {!customRoleMode && roleCatalogs.length > 0 ? (
                      <select
                        required
                        value={
                          roleCatalogs.some((c) => c.name === role) ? role : role ? '__CUSTOM__' : ''
                        }
                        onChange={(e) => {
                          if (e.target.value === '__CUSTOM__') {
                            setCustomRoleMode(true);
                            setRole('');
                          } else {
                            setRole(e.target.value);
                          }
                          if (fieldErrors.role) {
                            setFieldErrors((prev) => ({ ...prev, role: undefined }));
                          }
                        }}
                        className={`w-full px-3.5 py-2.5 text-sm bg-white border rounded-lg focus:outline-none transition-colors ${
                          fieldErrors.role
                            ? 'border-[#DA291C] bg-red-50/30'
                            : 'border-slate-300 focus:border-[#DA291C]'
                        }`}
                      >
                        <option value="">-- Selecciona tu cargo --</option>
                        {roleCatalogs.map((item) => (
                          <option key={item.id} value={item.name}>
                            {item.name}
                          </option>
                        ))}
                        <option value="__CUSTOM__">
                          + Otro cargo (Ingresar de acuerdo a la organización...)
                        </option>
                      </select>
                    ) : (
                      <div className="space-y-1.5">
                        <input
                          type="text"
                          required
                          list="roles-catalog-options"
                          value={role}
                          onChange={(e) => {
                            setRole(e.target.value);
                            if (fieldErrors.role) {
                              setFieldErrors((prev) => ({ ...prev, role: undefined }));
                            }
                          }}
                          placeholder="Escribe tu cargo en la organización (Ej. Técnico Instalador FTTH, Ingeniero Residente...)"
                          className={`w-full px-3.5 py-2.5 text-sm bg-white border rounded-lg focus:outline-none transition-colors ${
                            fieldErrors.role
                              ? 'border-[#DA291C] bg-red-50/30'
                              : 'border-slate-300 focus:border-[#DA291C]'
                          }`}
                        />
                        <p className="text-[11px] text-slate-500">
                          Puedes ingresar cualquier cargo según las necesidades de tu área u organización; quedará registrado automáticamente en el catálogo.
                        </p>
                      </div>
                    )}
                    <datalist id="roles-catalog-options">
                      {roleCatalogs.map((item) => (
                        <option key={item.id} value={item.name} />
                      ))}
                    </datalist>
                    {fieldErrors.role && (
                      <p className="text-xs font-medium text-[#DA291C] mt-1">
                        {fieldErrors.role}
                      </p>
                    )}
                  </div>

                  <div className="pt-4 border-t border-slate-100">
                    <button
                      type="submit"
                      disabled={submittingReg}
                      className="w-full py-3.5 px-6 text-sm font-extrabold tracking-wide uppercase text-white bg-[#DA291C] hover:bg-[#B91C1C] rounded-xl transition-colors inline-flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
                    >
                      <span>
                        {submittingReg ? 'REGISTRANDO PARTICIPACIÓN...' : 'INICIAR CAPACITACIÓN'}
                      </span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </form>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 text-xs text-slate-500 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#DA291C] shrink-0" />
                <span>
                  Todos los campos marcados con (*) son obligatorios. Si ya habías iniciado esta capacitación, retomarás tu avance automáticamente.
                </span>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ============================================================================
  // PANTALLA 3: RESUMEN FINAL Y ANALÍTICA DE RESULTADOS DEL PARTICIPANTE (SECCIÓN 19)
  // ============================================================================
  if (completedResult) {
    const questionSlides = slides.filter((s) => Boolean(s.item.question));
    const elapsedMinutes = Math.max(
      1,
      Math.round((session?.total_duration_seconds || 120) / 60)
    );

    const strengthsList =
      completedResult.strengths_list && completedResult.strengths_list.length > 0
        ? completedResult.strengths_list
        : completedResult.top_strength_competency
        ? [`Dominio destacado en: ${completedResult.top_strength_competency}`]
        : ['Cumplimiento de la secuencia formativa y protocolos técnicos'];

    const improvementsList =
      completedResult.improvements_list && completedResult.improvements_list.length > 0
        ? completedResult.improvements_list
        : completedResult.top_gap_competency
        ? [`Reforzar competencia: ${completedResult.top_gap_competency}`]
        : ['Mantener actualización continua en estándares operativos en campo'];

    return (
      <div className="min-h-screen bg-white py-10 px-6">
        <div className="max-w-4xl mx-auto bg-white border-2 border-slate-200 rounded-2xl p-6 sm:p-8 space-y-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b-2 border-[#DA291C] pb-6">
            <div className="flex items-center gap-4">
              <UClaroTecnologiaLogo className="w-14 h-14 shrink-0" />
              <div>
                <div className="text-xs font-mono text-[#DA291C] font-bold mb-1">
                  SESIÓN {session.session_code} · CAPACITACIÓN FINALIZADA
                </div>
                <h1 className="text-2xl font-bold text-slate-900">{course.title}</h1>
                <p className="text-sm text-slate-600 mt-1">
                  Participante: <strong>{participant?.full_name}</strong> · Área:{' '}
                  <strong>{participant?.area}</strong> · Cargo: <strong>{participant?.role}</strong>
                </p>
              </div>
            </div>
            <Award
              className={`w-12 h-12 shrink-0 ${
                completedResult.passed ? 'text-emerald-600' : 'text-[#DA291C]'
              }`}
            />
          </div>

          {/* 3 Main KPI Cards: Puntaje obtenido, Estado, Tiempo empleado */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 bg-white border-2 border-slate-200 rounded-xl">
              <div className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#DA291C]" />
                <span>Puntaje obtenido</span>
              </div>
              <div className="text-3xl font-extrabold font-mono tabular-nums text-slate-900 mt-1">
                {completedResult.final_percentage}%
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                Nota mínima requerida: {course.passing_score}%
              </div>
            </div>

            <div className="p-4 bg-white border-2 border-slate-200 rounded-xl">
              <div className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#DA291C]" />
                <span>Estado</span>
              </div>
              <div
                className={`text-xl font-extrabold mt-1 flex items-center gap-1.5 ${
                  completedResult.passed ? 'text-emerald-700' : 'text-[#DA291C]'
                }`}
              >
                {completedResult.passed ? (
                  <>
                    <CheckCircle2 className="w-5 h-5" />
                    <span>Aprobado</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-5 h-5" />
                    <span>Requiere refuerzo</span>
                  </>
                )}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                Intento #{session.attempt_number}
              </div>
            </div>

            <div className="p-4 bg-white border-2 border-slate-200 rounded-xl">
              <div className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#DA291C]" />
                <span>Tiempo empleado</span>
              </div>
              <div className="text-2xl font-extrabold font-mono tabular-nums text-slate-900 mt-1">
                {elapsedMinutes} min
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                ({session.total_duration_seconds || 60} segundos registrados)
              </div>
            </div>
          </div>

          {/* Fortalezas & Puntos a mejorar (Section 19) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-5 bg-emerald-50/50 border border-emerald-200 rounded-xl space-y-2.5">
              <div className="text-xs font-extrabold uppercase tracking-wider text-emerald-900 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Fortalezas Identificadas</span>
              </div>
              <ul className="space-y-1.5 text-xs text-slate-800">
                {strengthsList.map((st, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-600 mt-1 shrink-0" />
                    <span className="font-medium">{st}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="p-5 bg-red-50/40 border border-red-200 rounded-xl space-y-2.5">
              <div className="text-xs font-extrabold uppercase tracking-wider text-[#DA291C] flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-[#DA291C]" />
                <span>Puntos a Mejorar</span>
              </div>
              <ul className="space-y-1.5 text-xs text-slate-800">
                {improvementsList.map((imp, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#DA291C] mt-1 shrink-0" />
                    <span className="font-medium">{imp}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Detalle por pregunta (Section 19) */}
          {questionSlides.length > 0 && (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-800">
                  Detalle de Desempeño por Pregunta ({questionSlides.length})
                </h3>
                <span className="text-[11px] font-mono text-slate-500">
                  Retroalimentación técnica individual
                </span>
              </div>
              <div className="divide-y divide-slate-100">
                {questionSlides.map((s, idx) => {
                  const q = s.item.question!;
                  const fb = feedbackByQuestion[q.id];
                  return (
                    <div key={q.id} className="p-4 bg-white space-y-1.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="text-xs font-bold text-slate-900">
                          {idx + 1}. {q.prompt}
                        </div>
                        {fb ? (
                          <span
                            className={`px-2 py-0.5 text-[11px] font-bold rounded shrink-0 ${
                              fb.is_correct
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-red-50 text-[#DA291C] border border-red-200'
                            }`}
                          >
                            {fb.is_correct ? 'Correcta' : 'Por reforzar'} ({fb.points_earned}/{fb.max_points} pts)
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 text-[11px] font-mono bg-slate-100 text-slate-600 rounded shrink-0">
                            Sin respuesta
                          </span>
                        )}
                      </div>
                      {fb && (
                        <div className="text-[11px] text-slate-600 space-y-1 pt-1">
                          <div>
                            <strong>Respuesta correcta:</strong> {fb.correct_answer_text}
                          </div>
                          <div>
                            <strong>Concepto clave:</strong> {fb.correct_concept}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-slate-100">
            <button
              onClick={onExit}
              className="px-5 py-2.5 text-sm font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              Ver Biblioteca de Capacitaciones
            </button>
            {course.retry_policy !== 'single_attempt' && (
              <button
                onClick={(e) => {
                  setCompletedResult(null);
                  setFeedbackByQuestion({});
                  setSelectedOptions({});
                  handleStartActivity(e as any, true);
                }}
                className="px-5 py-2.5 text-sm font-bold text-white bg-[#DA291C] hover:bg-[#B91C1C] rounded-lg transition-colors inline-flex items-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Realizar un nuevo intento</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // PANTALLA 2: PRESENTACIÓN INTERACTIVA CLARO (FONDO BLANCO, VIÑETAS ROJAS #DA291C)
  // ============================================================================
  const progressPercent = Math.round(((currentSlideIdx + 1) / Math.max(1, slides.length)) * 100);
  const filledBlocks = Math.round(progressPercent / 10);
  const asciiBar = '█'.repeat(filledBlocks) + '░'.repeat(Math.max(0, 10 - filledBlocks));

  // Split body text into bullet points so every presentation slide displays crisp red bullets ("fondo blanco viñetas rojas")
  const bodyBullets = currentSlide?.item.body
    ? currentSlide.item.body
        .split(/\n+/)
        .map((line) => line.replace(/^[•\-*]\s*/, '').trim())
        .filter(Boolean)
    : [];

  return (
    <div className="min-h-screen bg-white text-slate-900 flex flex-col">
      {/* Persistent Top Presentation Header with U Claro Tecnología Logo */}
      <header className="sticky top-0 z-20 bg-white border-b-2 border-[#DA291C] px-4 lg:px-8 py-3 shadow-xs">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={onExit}
              className="p-2 text-slate-600 hover:text-[#DA291C] rounded-lg hover:bg-red-50 transition-colors"
              title="Salir de la actividad"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <UClaroTecnologiaLogo className="w-10 h-10 shrink-0" />
            <div className="min-w-0">
              <div className="text-xs text-slate-600 flex items-center gap-2 truncate">
                <span className="font-bold text-slate-900 truncate">{course.title}</span>
                <span className="text-[#DA291C]">•</span>
                <span className="font-mono font-semibold text-[#DA291C]">
                  Módulo {currentSlide?.moduleIndex} de {currentSlide?.totalModules}
                </span>
              </div>
              <div className="text-xs font-semibold text-slate-700 truncate flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#DA291C] shrink-0" />
                <span className="truncate">{currentSlide?.moduleTitle}</span>
              </div>
            </div>
          </div>

          {/* Visual Progress Bar, Syllabus Drawer Toggle, Study Cards & Screen Counter */}
          <div className="flex items-center gap-2 sm:gap-3">
            {currentSlide && currentSlide.studyCards.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setShowModuleStudyCards((prev) => !prev);
                  setShowSessionSyllabus(false);
                  setShowReferenceMaterials(false);
                }}
                className={`px-3 py-1.5 text-xs font-extrabold rounded-lg border transition-colors inline-flex items-center gap-1.5 whitespace-nowrap ${
                  showModuleStudyCards
                    ? 'bg-[#DA291C] text-white border-[#DA291C]'
                    : 'bg-red-50 text-[#DA291C] border-red-200 hover:bg-red-100'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Fichas de Estudio ({currentSlide.studyCards.length})</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setShowSessionSyllabus((prev) => !prev);
                setShowReferenceMaterials(false);
                setShowModuleStudyCards(false);
              }}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-colors inline-flex items-center gap-1.5 whitespace-nowrap ${
                showSessionSyllabus
                  ? 'bg-[#DA291C] text-white border-[#DA291C]'
                  : 'bg-slate-50 text-slate-800 border-slate-200 hover:border-[#DA291C]'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Temario ({currentSlideIdx + 1}/{slides.length})</span>
            </button>

            {course.materials && course.materials.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setShowReferenceMaterials((prev) => !prev);
                  setShowSessionSyllabus(false);
                  setShowModuleStudyCards(false);
                }}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-colors hidden sm:inline-flex items-center gap-1.5 whitespace-nowrap ${
                  showReferenceMaterials
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-slate-50 text-slate-800 border-slate-200 hover:border-slate-400'
                }`}
              >
                <FileText className="w-3.5 h-3.5 text-[#DA291C]" />
                <span>Material Apoyo</span>
              </button>
            )}

            <div className="hidden lg:flex items-center gap-2">
              <span
                className="font-mono text-xs tracking-tighter text-[#DA291C] select-none"
                aria-hidden="true"
              >
                {asciiBar}
              </span>
              <span className="text-xs font-mono font-bold text-[#DA291C] tabular-nums">
                {progressPercent}%
              </span>
            </div>

            <div className="text-xs text-slate-600 hidden md:flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#DA291C]" />
              <strong className="text-slate-900">{participant?.full_name}</strong>
              <span className="text-slate-400">·</span>
              <span>{participant?.area}</span>
            </div>
          </div>
        </div>

        {/* Full-width Claro Red progress bar */}
        <div className="max-w-6xl mx-auto mt-2.5 h-1.5 bg-red-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#DA291C] transition-all duration-200"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Collapsible Session Syllabus (Mapa de Módulos y Pantallas de la Sesión) */}
        {showSessionSyllabus && (
          <div className="max-w-6xl mx-auto mt-3 pt-3 border-t border-slate-200 bg-white">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-900">
                Mapa de la Sesión del Curso ({course.modules.length} módulos · {slides.length} pantallas)
              </span>
              <button
                type="button"
                onClick={() => setShowSessionSyllabus(false)}
                className="text-xs font-semibold text-slate-500 hover:text-[#DA291C]"
              >
                Cerrar mapa
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-60 overflow-y-auto pb-2">
              {slides.map((sl, idx) => {
                const isCurrent = idx === currentSlideIdx;
                const isVisited = idx <= Math.max(currentSlideIdx, session.current_slide_index || 0);
                const q = sl.item.question;
                const fb = q ? feedbackByQuestion[q.id] : undefined;
                return (
                  <button
                    key={sl.item.id}
                    type="button"
                    disabled={!isVisited}
                    onClick={() => {
                      if (isVisited) {
                        handleNavigateSlide(idx, false);
                        setShowSessionSyllabus(false);
                      }
                    }}
                    className={`p-2.5 rounded-lg border text-left transition-colors flex items-center justify-between gap-2 ${
                      isCurrent
                        ? 'border-[#DA291C] bg-red-50/50 text-slate-900'
                        : isVisited
                        ? 'border-slate-200 bg-white hover:border-slate-300 text-slate-800'
                        : 'border-slate-100 bg-slate-50 text-slate-400 opacity-60 cursor-not-allowed'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-[10px] font-mono text-slate-500">
                        Mód {sl.moduleIndex} · Pantalla {idx + 1}
                      </div>
                      <div className="text-xs font-bold truncate">
                        {sl.item.title}
                      </div>
                    </div>
                    {fb ? (
                      <CheckCircle2
                        className={`w-4 h-4 shrink-0 ${
                          fb.is_correct ? 'text-emerald-600' : 'text-[#DA291C]'
                        }`}
                      />
                    ) : isCurrent ? (
                      <span className="w-2 h-2 rounded-full bg-[#DA291C] shrink-0" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Collapsible Reference Material Panel */}
        {showReferenceMaterials && course.materials && course.materials.length > 0 && (
          <div className="max-w-6xl mx-auto mt-3 pt-3 border-t border-slate-200 bg-slate-50 p-4 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-900">
                Material de Referencia del Curso
              </span>
              <button
                type="button"
                onClick={() => setShowReferenceMaterials(false)}
                className="text-xs font-semibold text-slate-500 hover:text-[#DA291C]"
              >
                Cerrar
              </button>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {course.materials.map((m) => (
                <div key={m.id} className="p-3 bg-white border border-slate-200 rounded-lg text-xs space-y-1">
                  <div className="font-bold text-slate-900">{m.title}</div>
                  {m.extracted_text && (
                    <pre className="text-[11px] font-mono text-slate-700 whitespace-pre-wrap leading-relaxed">
                      {m.extracted_text}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Collapsible Module Study Cards Drawer (Fichas Ampliadas de Estudio por Módulo) */}
        {showModuleStudyCards && currentSlide && currentSlide.studyCards.length > 0 && (
          <div className="max-w-6xl mx-auto mt-3 pt-3 border-t border-slate-200 bg-slate-50 p-4 rounded-xl space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#DA291C]" />
                <span className="text-xs font-extrabold uppercase tracking-wider text-slate-900">
                  Fichas de Estudio Ampliadas · {currentSlide.moduleTitle}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowModuleStudyCards(false)}
                className="text-xs font-bold text-slate-500 hover:text-[#DA291C]"
              >
                Cerrar fichas
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {currentSlide.studyCards.map((card, idx) => (
                <button
                  key={card.id || idx}
                  type="button"
                  onClick={() => setActiveStudyCardIdx(idx)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-colors ${
                    activeStudyCardIdx === idx
                      ? 'bg-[#DA291C] text-white border-[#DA291C]'
                      : 'bg-white text-slate-800 border-slate-200 hover:border-[#DA291C]'
                  }`}
                >
                  Ficha {idx + 1}: {card.category}
                </button>
              ))}
            </div>

            {currentSlide.studyCards[activeStudyCardIdx] && (
              <div className="p-4 bg-white border-2 border-slate-200 rounded-xl space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm font-extrabold text-slate-900">
                    {currentSlide.studyCards[activeStudyCardIdx].title}
                  </h4>
                  <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-red-50 text-[#DA291C] border border-red-200 rounded">
                    {currentSlide.studyCards[activeStudyCardIdx].category}
                  </span>
                </div>
                <p className="text-xs text-slate-700 leading-relaxed">
                  {currentSlide.studyCards[activeStudyCardIdx].summary}
                </p>
                <ul className="space-y-1.5">
                  {(currentSlide.studyCards[activeStudyCardIdx].key_points || []).map(
                    (pt, pIdx) => (
                      <li
                        key={pIdx}
                        className="flex items-start gap-2 text-xs text-slate-800"
                      >
                        <span className="w-2 h-2 rounded-full bg-[#DA291C] mt-1 shrink-0" />
                        <span>{pt}</span>
                      </li>
                    )
                  )}
                </ul>
                {currentSlide.studyCards[activeStudyCardIdx].warning_note && (
                  <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs font-semibold text-amber-950 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-[#DA291C] shrink-0" />
                    <span>{currentSlide.studyCards[activeStudyCardIdx].warning_note}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </header>

      {/* Optional Return Banner when reviewing related content after an incorrect answer */}
      {returnToQuestionSlideIdx !== null && (
        <div className="bg-red-50 border-b border-red-200 px-6 py-2.5">
          <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
            <span className="text-xs font-semibold text-red-950 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#DA291C]" />
              <span>Estás revisando el contenido de referencia relacionado con la pregunta.</span>
            </span>
            <button
              onClick={() => {
                const target = returnToQuestionSlideIdx;
                setReturnToQuestionSlideIdx(null);
                setCurrentSlideIdx(target);
              }}
              className="px-3.5 py-1.5 text-xs font-bold bg-[#DA291C] text-white rounded-lg hover:bg-[#B91C1C] transition-colors whitespace-nowrap"
            >
              Volver a la evaluación (Diapositiva {returnToQuestionSlideIdx + 1})
            </button>
          </div>
        </div>
      )}

      {sessionNotice && currentSlideIdx === 0 && (
        <div className="max-w-5xl w-full mx-auto px-6 pt-4">
          <div className="p-3 bg-white border-l-4 border-[#DA291C] shadow-xs rounded-r-lg flex items-center justify-between text-xs text-slate-800">
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-[#DA291C] shrink-0" />
              <span>
                {sessionNotice} · Participante: <strong>{participant?.full_name}</strong> ({participant?.area} - {participant?.role})
              </span>
            </div>
            <button
              onClick={() => setSessionNotice(null)}
              className="text-slate-500 hover:text-[#DA291C]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Presentation Stage — Pure White Background & Red Corporate Bullets */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 flex flex-col justify-center bg-white">
        {currentSlide && (
          <div className="bg-white border-2 border-slate-200 rounded-2xl overflow-hidden shadow-xs">
            {/* Top Corporate Red Accent Bar inside Slide */}
            <div className="h-2 w-full bg-[#DA291C]" />

            <div className="p-6 sm:p-8 space-y-6 bg-white">
              {/* Slide Kicker Metadata with Claro Red Bullet */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#DA291C] shrink-0" />
                  <span className="font-bold text-[#DA291C] uppercase tracking-wider">
                    {currentSlide.item.content_type === 'title' && 'Introducción de Módulo'}
                    {currentSlide.item.content_type === 'text' && 'Estándar Técnico Claro'}
                    {currentSlide.item.content_type === 'image' && 'Esquema e Inspección Visual'}
                    {currentSlide.item.content_type === 'video' && 'Demostración Operativa'}
                    {currentSlide.item.content_type === 'highlight' && 'Concepto Destacado'}
                    {currentSlide.item.content_type === 'instructions' && 'Instrucción Operativa y SST'}
                    {currentSlide.item.content_type === 'steps' && 'Procedimiento Paso a Paso'}
                    {currentSlide.item.content_type === 'question' && 'Evaluación Intercalada'}
                    {currentSlide.item.content_type === 'case_study' && 'Caso Práctico de Campo'}
                    {currentSlide.item.content_type === 'evaluation' && 'Evaluación Certificadora'}
                  </span>
                  {currentQuestion && (
                    <>
                      <span className="text-[#DA291C]">•</span>
                      <span className="font-semibold text-slate-800">
                        Competencia: {currentQuestion.competency_name || 'Técnica'}
                      </span>
                      <span className="text-[#DA291C]">•</span>
                      <span className="font-mono font-bold text-[#DA291C] tabular-nums">
                        {currentQuestion.points} pts
                      </span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-1.5 font-mono text-slate-500 tabular-nums">
                  <Clock className="w-3.5 h-3.5 text-[#DA291C]" />
                  <span>~{currentSlide.item.estimated_seconds}s</span>
                </div>
              </div>

              {/* Slide Title & Subtitle */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 leading-snug">
                    {currentSlide.item.title}
                  </h2>
                  {currentSlide.item.subtitle && (
                    <p className="text-sm font-semibold text-[#DA291C] mt-1 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#DA291C]" />
                      <span>{currentSlide.item.subtitle}</span>
                    </p>
                  )}
                </div>
              </div>

              {/* CONTENT RENDERING FOR NON-QUESTION SLIDES (WHITE BACKGROUND + RED BULLETS + CLARO VISUALS) */}
              {!currentQuestion && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start bg-white">
                  <div className="lg:col-span-8 space-y-6 bg-white">
                    {currentSlide.item.media_url && (
                      <div className="rounded-xl overflow-hidden border border-slate-200 bg-white shadow-2xs">
                        <div className="max-h-[380px] min-h-[220px] w-full overflow-hidden bg-slate-50 flex items-center justify-center p-2">
                          <ResilientImage
                            src={currentSlide.item.media_url}
                            alt={currentSlide.item.title}
                            className="max-h-[360px] w-full object-contain rounded-lg"
                          />
                        </div>
                        {currentSlide.item.media_caption && (
                          <div className="px-4 py-2.5 bg-white border-t border-slate-200 text-xs text-slate-700 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-[#DA291C] shrink-0" />
                            <span>{currentSlide.item.media_caption}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Presentation Bullet List with Claro Corporate Red Bullets ("fondo blanco viñetas rojas") */}
                    {bodyBullets.length > 0 && (
                      <ul className="space-y-3 bg-white">
                        {bodyBullets.map((line, bIdx) => (
                          <li
                            key={bIdx}
                            className="flex items-start gap-3 text-base text-slate-800 leading-relaxed"
                          >
                            <span className="w-2.5 h-2.5 rounded-full bg-[#DA291C] mt-2 shrink-0" />
                            <span>{line}</span>
                          </li>
                        ))}
                      </ul>
                    )}

                    {currentSlide.item.highlight_note && (
                      <div className="p-5 bg-white border-2 border-[#DA291C] rounded-xl space-y-1.5">
                        <div className="text-xs font-extrabold text-[#DA291C] uppercase tracking-wider flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-[#DA291C]" />
                          <span>PARÁMETRO TÉCNICO CLAVE CLARO</span>
                        </div>
                        <p className="text-sm font-mono font-bold text-slate-900 leading-relaxed">
                          {currentSlide.item.highlight_note}
                        </p>
                      </div>
                    )}

                    {currentSlide.item.steps && currentSlide.item.steps.length > 0 && (
                      <ul className="space-y-3 bg-white">
                        {currentSlide.item.steps.map((st) => (
                          <li
                            key={st.step_number}
                            className="p-4 bg-white border border-slate-200 rounded-xl flex items-start gap-3.5 shadow-2xs"
                          >
                            <div className="w-7 h-7 rounded-full bg-[#DA291C] text-white font-mono text-xs font-bold flex items-center justify-center shrink-0 mt-0.5 tabular-nums">
                              {st.step_number}
                            </div>
                            <div className="space-y-1">
                              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                <span>{st.title}</span>
                              </h3>
                              <p className="text-sm text-slate-700 leading-relaxed">
                                {st.description}
                              </p>
                              {st.critical_note && (
                                <p className="text-xs font-semibold text-[#DA291C] mt-1 flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-[#DA291C]" />
                                  <span>Atención: {st.critical_note}</span>
                                </p>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}

                    {/* INTERACTIVE SLIDE ELEMENTS: Selectable Cards, Accordions, Hotspots & Comparisons */}
                    {currentSlide.item.selectable_cards &&
                      currentSlide.item.selectable_cards.length > 0 && (
                        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                          <div className="text-xs font-extrabold uppercase tracking-wider text-[#DA291C] flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-[#DA291C]" />
                            <span>TARJETAS INTERACTIVAS DE DESCUBRIMIENTO (Haz clic para explorar)</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            {currentSlide.item.selectable_cards.map((card, idx) => {
                              const isSelected = activeSelectableCardIdx === idx;
                              return (
                                <button
                                  key={card.id || idx}
                                  type="button"
                                  onClick={() => setActiveSelectableCardIdx(idx)}
                                  className={`p-3.5 rounded-xl border-2 text-left transition-all space-y-1.5 ${
                                    isSelected
                                      ? 'border-[#DA291C] bg-white shadow-xs'
                                      : 'border-slate-200 bg-white/80 hover:border-red-300'
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-xs font-extrabold text-slate-900">
                                      {card.title}
                                    </span>
                                    {card.badge && (
                                      <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-red-50 text-[#DA291C] rounded">
                                        {card.badge}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs text-slate-600">{card.front_text}</p>
                                  {isSelected && (
                                    <div className="pt-2 mt-1 border-t border-red-100 text-xs font-semibold text-slate-900">
                                      {card.detail_text}
                                    </div>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                    {currentSlide.item.accordion_items &&
                      currentSlide.item.accordion_items.length > 0 && (
                        <div className="space-y-2">
                          <div className="text-xs font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-[#DA291C]" />
                            <span>DESGLOSE INTERACTIVO (Haz clic en cada bloque para ampliar)</span>
                          </div>
                          {currentSlide.item.accordion_items.map((acc, idx) => {
                            const isOpen = openAccordionIdx === idx;
                            return (
                              <div
                                key={acc.id || idx}
                                className="border border-slate-200 rounded-xl overflow-hidden bg-white"
                              >
                                <button
                                  type="button"
                                  onClick={() => setOpenAccordionIdx(isOpen ? -1 : idx)}
                                  className="w-full px-4 py-3 bg-slate-50 hover:bg-slate-100 flex items-center justify-between text-left"
                                >
                                  <span className="text-xs font-extrabold text-slate-900">
                                    {acc.title}
                                  </span>
                                  <span className="text-xs font-mono font-bold text-[#DA291C]">
                                    {isOpen ? '▲ Ocultar' : '▼ Desplegar'}
                                  </span>
                                </button>
                                {isOpen && (
                                  <div className="p-4 text-xs sm:text-sm text-slate-700 leading-relaxed border-t border-slate-200 bg-white">
                                    {acc.content}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                    {currentSlide.item.hotspots && currentSlide.item.hotspots.length > 0 && (
                      <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                        <div className="text-xs font-extrabold uppercase tracking-wider text-[#DA291C] flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-[#DA291C]" />
                          <span>PUNTOS DE INSPECCIÓN TÉCNICA (Selecciona cada punto)</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {currentSlide.item.hotspots.map((hp, idx) => (
                            <button
                              key={hp.id || idx}
                              type="button"
                              onClick={() => setActiveHotspotIdx(idx)}
                              className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-colors ${
                                activeHotspotIdx === idx
                                  ? 'bg-[#DA291C] text-white border-[#DA291C]'
                                  : 'bg-white text-slate-800 border-slate-300 hover:border-[#DA291C]'
                              }`}
                            >
                              ● {hp.label}: {hp.title}
                            </button>
                          ))}
                        </div>
                        {currentSlide.item.hotspots[activeHotspotIdx] && (
                          <div className="p-3.5 bg-white border border-slate-200 rounded-lg text-xs sm:text-sm text-slate-800">
                            <strong className="text-[#DA291C] block mb-1">
                              {currentSlide.item.hotspots[activeHotspotIdx].title}
                            </strong>
                            {currentSlide.item.hotspots[activeHotspotIdx].description}
                          </div>
                        )}
                      </div>
                    )}

                    {currentSlide.item.comparison && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="p-4 bg-emerald-50/50 border border-emerald-200 rounded-xl space-y-2">
                          <div className="text-xs font-extrabold text-emerald-900 uppercase">
                            ✓ {currentSlide.item.comparison.left_title}
                          </div>
                          <ul className="space-y-1.5 text-xs text-slate-800">
                            {currentSlide.item.comparison.left_points.map((pt, i) => (
                              <li key={i} className="flex items-start gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 mt-1.5 shrink-0" />
                                <span>{pt}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div className="p-4 bg-red-50/40 border border-red-200 rounded-xl space-y-2">
                          <div className="text-xs font-extrabold text-[#DA291C] uppercase">
                            • {currentSlide.item.comparison.right_title}
                          </div>
                          <ul className="space-y-1.5 text-xs text-slate-800">
                            {currentSlide.item.comparison.right_points.map((pt, i) => (
                              <li key={i} className="flex items-start gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#DA291C] mt-1.5 shrink-0" />
                                <span>{pt}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right 4 Cols on Content Slides: Claro Corporate Visual Card + Fichas de Estudio por Módulo */}
                  <div className="lg:col-span-4 space-y-4">
                    <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col items-center text-center space-y-4">
                      <div className="flex items-center justify-between w-full border-b border-slate-100 pb-3">
                        <UClaroTecnologiaLogo className="w-11 h-11 shrink-0" />
                        <div className="text-right">
                          <div className="text-[11px] font-extrabold text-[#DA291C] uppercase">
                            U Claro Tecnología
                          </div>
                          <div className="text-[11px] text-slate-500">
                            Modelo de Excelencia
                          </div>
                        </div>
                      </div>

                      <div className="w-full h-44 bg-white flex items-end justify-center overflow-hidden">
                        <img
                          src={CLARO_TECHNICIAN_IMAGE_URL}
                          alt="Modelo Técnico Claro"
                          referrerPolicy="no-referrer"
                          className="h-full w-auto object-contain"
                        />
                      </div>

                      <ul className="w-full text-left space-y-2 text-xs text-slate-700 border-t border-slate-100 pt-3">
                        <li className="flex items-start gap-2">
                          <span className="w-2 h-2 rounded-full bg-[#DA291C] mt-1 shrink-0" />
                          <span>Cumplimiento estricto de estándares de red Claro.</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="w-2 h-2 rounded-full bg-[#DA291C] mt-1 shrink-0" />
                          <span>Verificación de calidad y seguridad en cada intervención.</span>
                        </li>
                      </ul>
                    </div>

                    {/* Fichas de Estudio del Módulo Activo (Ampliación de material de estudio) */}
                    {currentSlide.studyCards.length > 0 && (
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-extrabold uppercase tracking-wider text-slate-900">
                            Fichas de Estudio del Módulo ({currentSlide.studyCards.length})
                          </span>
                          <button
                            type="button"
                            onClick={() => setShowModuleStudyCards(true)}
                            className="text-[11px] font-bold text-[#DA291C] hover:underline"
                          >
                            Ampliar todas
                          </button>
                        </div>
                        <div className="space-y-2">
                          {currentSlide.studyCards.slice(0, 3).map((sc, sIdx) => (
                            <button
                              key={sc.id || sIdx}
                              type="button"
                              onClick={() => {
                                setActiveStudyCardIdx(sIdx);
                                setShowModuleStudyCards(true);
                              }}
                              className="w-full p-2.5 bg-white border border-slate-200 hover:border-[#DA291C] rounded-lg text-left transition-colors space-y-1"
                            >
                              <div className="text-[10px] font-mono font-bold text-[#DA291C]">
                                {sc.category}
                              </div>
                              <div className="text-xs font-bold text-slate-900 line-clamp-1">
                                {sc.title}
                              </div>
                              <p className="text-[11px] text-slate-600 line-clamp-2">
                                {sc.summary}
                              </p>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* INTERACTIVE QUESTION & PRACTICAL CASE RENDERING (CLARO CORPORATE WHITE + RED) */}
              {currentQuestion && (
                <div className="space-y-6 bg-white">
                  {/* Practical Case Scenario Box */}
                  {(currentQuestion.case_study_situation ||
                    currentSlide.item.type === 'case_question' ||
                    currentSlide.item.content_type === 'case_study') && (
                    <div className="p-5 bg-amber-50/40 border-l-4 border-[#DA291C] border border-amber-200 rounded-r-xl space-y-3">
                      <div className="space-y-2">
                        <div className="text-xs font-extrabold text-[#DA291C] uppercase tracking-wider flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-[#DA291C]" />
                          <span>CASO PRÁCTICO REAL · SITUACIÓN OPERATIVA EN CAMPO</span>
                        </div>
                        <p className="text-sm font-semibold text-slate-900 leading-relaxed">
                          {currentQuestion.case_study_situation ||
                            currentSlide.item.body}
                        </p>
                        {currentQuestion.case_study_description && (
                          <div className="p-3 bg-white border border-amber-200 rounded-lg space-y-1">
                            <div className="text-[11px] font-mono font-bold text-amber-900 uppercase">
                              Contexto Técnico y Datos Reales del Caso:
                            </div>
                            <p className="text-xs text-slate-700 leading-relaxed">
                              {currentQuestion.case_study_description}
                            </p>
                          </div>
                        )}
                      </div>
                      {(currentQuestion.case_study_image_url ||
                        currentSlide.item.media_url) && (
                        <div className="rounded-lg overflow-hidden border border-slate-200 max-h-72 bg-slate-50 flex items-center justify-center p-2">
                          <ResilientImage
                            src={
                              currentQuestion.case_study_image_url ||
                              currentSlide.item.media_url ||
                              ''
                            }
                            alt="Evidencia del caso práctico"
                            className="w-full max-h-64 object-contain rounded"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  <div className="p-5 bg-white border-2 border-[#DA291C] rounded-xl">
                    <div className="flex items-start gap-2.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#DA291C] mt-1.5 shrink-0" />
                      <p className="text-sm sm:text-base font-bold text-slate-900 leading-relaxed">
                        {currentQuestion.prompt}
                      </p>
                    </div>
                    <div className="mt-2 pl-5 flex items-center gap-3 text-xs text-slate-600 font-mono">
                      <span>
                        Tipo:{' '}
                        {currentQuestion.question_type === 'single_choice' &&
                          'Selección múltiple (única respuesta)'}
                        {currentQuestion.question_type === 'multiple_choice' &&
                          'Selección múltiple (varias respuestas)'}
                        {currentQuestion.question_type === 'true_false' && 'Verdadero / Falso'}
                        {currentQuestion.question_type === 'image_choice' &&
                          'Selección visual'}
                        {currentQuestion.question_type === 'order_steps' &&
                          'Ordenar secuencia de pasos'}
                      </span>
                      <span className="text-[#DA291C]">•</span>
                      <span>Máx. {currentQuestion.max_attempts} intentos</span>
                    </div>
                  </div>

                  {/* Question Type: ORDER STEPS */}
                  {currentQuestion.question_type === 'order_steps' ? (
                    <div className="space-y-2.5 bg-white">
                      <p className="text-xs text-slate-600 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[#DA291C]" />
                        <span>
                          Usa los botones de flecha para ordenar los pasos del primero (1) al último ({currentQuestion.options.length}):
                        </span>
                      </p>
                      {(orderedStepsMap[currentQuestion.id] ||
                        currentQuestion.options.map((o) => o.id)
                      ).map((optId, idx, arr) => {
                        const opt = currentQuestion.options.find((o) => o.id === optId);
                        if (!opt) return null;
                        return (
                          <div
                            key={opt.id}
                            className="p-3.5 bg-white border border-slate-300 rounded-xl flex items-center justify-between gap-3"
                          >
                            <div className="flex items-center gap-3">
                              <span className="w-7 h-7 rounded-full bg-[#DA291C] text-white font-mono text-xs font-bold flex items-center justify-center tabular-nums shrink-0">
                                {idx + 1}
                              </span>
                              <span className="text-sm font-medium text-slate-900">
                                {opt.text}
                              </span>
                            </div>
                            {!currentFeedback && (
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  disabled={idx === 0}
                                  onClick={() =>
                                    handleMoveStepOrder(currentQuestion.id, idx, -1)
                                  }
                                  className="p-1.5 border border-slate-200 rounded hover:bg-red-50 disabled:opacity-30"
                                  title="Subir paso"
                                >
                                  <ArrowUp className="w-4 h-4 text-[#DA291C]" />
                                </button>
                                <button
                                  type="button"
                                  disabled={idx === arr.length - 1}
                                  onClick={() =>
                                    handleMoveStepOrder(currentQuestion.id, idx, 1)
                                  }
                                  className="p-1.5 border border-slate-200 rounded hover:bg-red-50 disabled:opacity-30"
                                  title="Bajar paso"
                                >
                                  <ArrowDown className="w-4 h-4 text-[#DA291C]" />
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    /* Question Types: single_choice, multiple_choice, true_false, image_choice */
                    <div
                      className={
                        currentQuestion.question_type === 'image_choice'
                          ? 'grid grid-cols-1 sm:grid-cols-2 gap-4 bg-white'
                          : 'space-y-2.5 bg-white'
                      }
                    >
                      {currentQuestion.options.map((opt) => {
                        const isMultiple = currentQuestion.question_type === 'multiple_choice';
                        const chosen = (selectedOptions[currentQuestion.id] || []).includes(
                          opt.id
                        );
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            disabled={Boolean(currentFeedback)}
                            onClick={() =>
                              handleToggleOption(currentQuestion.id, opt.id, isMultiple)
                            }
                            className={`w-full text-left p-4 rounded-xl border-2 transition-colors flex items-start gap-3.5 bg-white ${
                              chosen
                                ? 'border-[#DA291C] text-slate-900 shadow-xs'
                                : 'border-slate-200 hover:border-red-300 text-slate-800'
                            }`}
                          >
                            <span
                              className={`w-6 h-6 rounded-full text-xs font-mono font-bold flex items-center justify-center shrink-0 mt-0.5 ${
                                chosen
                                  ? 'bg-[#DA291C] text-white'
                                  : 'bg-red-50 text-[#DA291C] border border-red-200'
                              }`}
                            >
                              {opt.label}
                            </span>
                            <div className="flex-1 space-y-2">
                              <span className="text-sm font-medium leading-relaxed block">
                                {opt.text}
                              </span>
                              {opt.image_url && (
                                <div className="h-32 rounded overflow-hidden border border-slate-200">
                                  <ResilientImage
                                    src={opt.image_url}
                                    alt={opt.text}
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Validate Answer Button */}
                  {!currentFeedback && (
                    <div className="flex justify-end pt-2">
                      <button
                        type="button"
                        disabled={
                          submittingAnswer ||
                          (currentQuestion.question_type !== 'order_steps' &&
                            (selectedOptions[currentQuestion.id] || []).length === 0)
                        }
                        onClick={handleSubmitAnswer}
                        className="px-6 py-2.5 text-sm font-bold text-white bg-[#DA291C] hover:bg-[#B91C1C] rounded-xl transition-colors disabled:opacity-40"
                      >
                        {submittingAnswer ? 'Verificando respuesta...' : 'Validar respuesta'}
                      </button>
                    </div>
                  )}

                   {/* RICH PEDAGOGICAL FEEDBACK PANEL (BIEN / MAL + POR QUÉ + RESPUESTA CORRECTA) */}
                  {currentFeedback && (
                    <div
                      className={`p-5 rounded-xl border-2 space-y-3.5 ${
                        currentFeedback.is_correct
                          ? 'border-emerald-500 bg-emerald-50/30 text-slate-900'
                          : 'border-[#DA291C] bg-red-50/30 text-slate-900'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-200">
                        <div className="flex items-center gap-2.5 font-extrabold text-base">
                          {currentFeedback.is_correct ? (
                            <>
                              <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
                              <div>
                                <span className="text-emerald-800 block">
                                  ✓ ¡RESPUESTA CORRECTA! Contestaste BIEN.
                                </span>
                                <span className="text-xs font-semibold text-emerald-700">
                                  {currentFeedback.status_label ||
                                    'Criterio técnico verificado correctamente.'}
                                </span>
                              </div>
                            </>
                          ) : (
                            <>
                              <AlertTriangle className="w-6 h-6 text-[#DA291C] shrink-0" />
                              <div>
                                <span className="text-[#DA291C] block">
                                  ✕ RESPUESTA INCORRECTA. Contestaste MAL.
                                </span>
                                <span className="text-xs font-semibold text-slate-700">
                                  Revisa abajo por qué no es correcta y cuál es el estándar técnico.
                                </span>
                              </div>
                            </>
                          )}
                        </div>
                        <span className="px-2.5 py-1 text-xs font-mono font-bold tabular-nums bg-white border border-slate-200 rounded-lg text-slate-800">
                          Intento {currentFeedback.attempt_number} de {currentFeedback.max_attempts} · +{currentFeedback.points_earned}/{currentFeedback.max_points} pts
                        </span>
                      </div>

                      {/* Comparativa directa: Tu respuesta vs Respuesta correcta */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                        {currentFeedback.chosen_answer_text && (
                          <div
                            className={`p-3 rounded-lg border ${
                              currentFeedback.is_correct
                                ? 'bg-white border-emerald-300'
                                : 'bg-white border-red-300'
                            }`}
                          >
                            <div className="font-mono font-extrabold uppercase text-[10px] text-slate-500 mb-1">
                              Tu respuesta seleccionada:
                            </div>
                            <div className="font-bold text-slate-900">
                              {currentFeedback.chosen_answer_text}
                            </div>
                          </div>
                        )}
                        {currentFeedback.correct_answer_text && (
                          <div className="p-3 rounded-lg border bg-white border-emerald-300">
                            <div className="font-mono font-extrabold uppercase text-[10px] text-emerald-700 mb-1">
                              Respuesta correcta según el material:
                            </div>
                            <div className="font-bold text-slate-900">
                              {currentFeedback.correct_answer_text}
                            </div>
                          </div>
                        )}
                      </div>

                      <ul className="text-xs sm:text-sm space-y-2.5 pt-1">
                        <li className="flex items-start gap-2.5">
                          <span className="w-2 h-2 rounded-full bg-[#DA291C] mt-1.5 shrink-0" />
                          <div>
                            <strong className="font-extrabold text-slate-900">
                              ¿Por qué es {currentFeedback.is_correct ? 'correcta' : 'incorrecta'}?:{' '}
                            </strong>
                            <span className="text-slate-800">
                              {currentFeedback.why_explanation || currentFeedback.explanation}
                            </span>
                          </div>
                        </li>
                        <li className="flex items-start gap-2.5">
                          <span className="w-2 h-2 rounded-full bg-[#DA291C] mt-1.5 shrink-0" />
                          <div>
                            <strong className="font-extrabold text-slate-900">
                              Concepto clave y norma técnica:{' '}
                            </strong>
                            <span className="text-slate-800">
                              {currentFeedback.correct_concept}
                            </span>
                          </div>
                        </li>
                        {currentFeedback.recommendation && (
                          <li className="flex items-start gap-2.5">
                            <span className="w-2 h-2 rounded-full bg-[#DA291C] mt-1.5 shrink-0" />
                            <div>
                              <strong className="font-extrabold text-slate-900">
                                Recomendación operativa:{' '}
                              </strong>
                              <span className="text-slate-800">
                                {currentFeedback.recommendation}
                              </span>
                            </div>
                          </li>
                        )}
                      </ul>

                      {!currentFeedback.is_correct && (
                        <div className="pt-2 flex flex-wrap items-center gap-3">
                          {currentFeedback.related_content_id && (
                            <button
                              type="button"
                              onClick={() =>
                                handleJumpToRelatedSlide(currentFeedback.related_content_id)
                              }
                              className="px-3.5 py-2 text-xs font-semibold bg-white text-slate-900 border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors inline-flex items-center gap-1.5"
                            >
                              <BookOpen className="w-3.5 h-3.5 text-[#DA291C]" />
                              <span>Revisar slide formativo relacionado</span>
                            </button>
                          )}
                          {currentFeedback.attempts_remaining > 0 && (
                            <button
                              type="button"
                              onClick={() => handleRetryQuestion(currentQuestion.id)}
                              className="px-3.5 py-2 text-xs font-bold bg-[#DA291C] text-white hover:bg-[#B91C1C] rounded-lg transition-colors inline-flex items-center gap-1.5"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>
                                Intentar nuevamente ({currentFeedback.attempts_remaining}{' '}
                                disponible)
                              </span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Persistent Bottom Navigation Bar (Claro Corporate Colors) */}
      <footer className="sticky bottom-0 z-20 bg-white border-t border-slate-200 px-4 lg:px-8 py-3.5">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <button
            type="button"
            disabled={currentSlideIdx === 0}
            onClick={() => handleNavigateSlide(currentSlideIdx - 1, false)}
            className="px-4 py-2.5 text-sm font-semibold text-slate-700 bg-white border border-slate-300 hover:border-[#DA291C] hover:text-[#DA291C] rounded-xl transition-colors inline-flex items-center gap-2 disabled:opacity-40 whitespace-nowrap"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Anterior</span>
          </button>

          <div className="text-xs text-slate-700 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#DA291C]" />
            {currentQuestion && !canAdvanceFromCurrentSlide ? (
              <span className="font-semibold text-[#DA291C]">
                Completa y valida esta pregunta evaluativa antes de avanzar
              </span>
            ) : unansweredQuestionSlideInCurrentModule ? (
              <button
                type="button"
                onClick={() =>
                  handleNavigateSlide(
                    unansweredQuestionSlideInCurrentModule.globalIndex,
                    false
                  )
                }
                className="font-bold text-[#DA291C] underline"
              >
                Regla de avance: Responde la evaluación pendiente del módulo (Pantalla{' '}
                {unansweredQuestionSlideInCurrentModule.globalIndex + 1}) para pasar al siguiente módulo
              </button>
            ) : (
              <span>Puntaje acumulado: {session.score_percentage}%</span>
            )}
          </div>

          {currentSlideIdx < slides.length - 1 ? (
            <button
              type="button"
              disabled={!canAdvanceFromCurrentSlide}
              onClick={() => handleNavigateSlide(currentSlideIdx + 1, false)}
              className="px-6 py-2.5 text-sm font-bold text-white bg-[#DA291C] hover:bg-[#B91C1C] rounded-xl transition-colors inline-flex items-center gap-2 disabled:opacity-40 whitespace-nowrap"
            >
              <span>Siguiente</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              disabled={!canAdvanceFromCurrentSlide}
              onClick={() => handleNavigateSlide(currentSlideIdx, true)}
              className="px-6 py-2.5 text-sm font-bold text-white bg-[#DA291C] hover:bg-[#B91C1C] rounded-xl transition-colors inline-flex items-center gap-2 disabled:opacity-40 whitespace-nowrap"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Finalizar formación</span>
            </button>
          )}
        </div>
      </footer>
    </div>
  );
};
