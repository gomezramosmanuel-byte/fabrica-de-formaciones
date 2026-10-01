import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  AdminUser,
  AnswerSubmissionFeedback,
  CatalogItem,
  Competency,
  ContentItem,
  Course,
  CourseModule,
  CourseResult,
  CourseSessionCohort,
  GapThresholdConfig,
  NormalizedTablesSummary,
  Participant,
  ParticipantAnswer,
  ParticipantSession,
  Question,
  QuestionCompetencyLink,
  QuestionOption,
  TrainingMaterial,
} from '../types/lms.ts';
import { INITIAL_COURSES } from './seedCourses.ts';
import {
  INITIAL_ADMINS,
  INITIAL_ANSWERS,
  INITIAL_CATALOGS,
  INITIAL_COMPETENCIES,
  INITIAL_PARTICIPANTS,
  INITIAL_RESULTS,
  INITIAL_SESSIONS,
} from './seedTelemetry.ts';
import { upgradeExistingCoursesWithStudyCardsAndFeedback } from './aiCourseGenerator.ts';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function ensureUuid(candidate?: string): string {
  if (candidate && UUID_REGEX.test(candidate)) {
    return candidate;
  }
  return crypto.randomUUID();
}

export interface NormalizedRelationalTables {
  admin_users: AdminUser[];
  catalog_items: CatalogItem[];
  competencies: Competency[];
  courses: Array<Omit<Course, 'modules' | 'materials'>>;
  course_sessions: CourseSessionCohort[];
  training_materials: TrainingMaterial[];
  modules: Array<Omit<CourseModule, 'items'>>;
  content_items: Array<Omit<ContentItem, 'question'>>;
  questions: Array<Omit<Question, 'options'>>;
  question_options: QuestionOption[];
  question_competencies: QuestionCompetencyLink[];
  participants: Participant[];
  participant_sessions: ParticipantSession[];
  participant_answers: ParticipantAnswer[];
  course_results: CourseResult[];
}

export interface DatabaseState {
  schema_version: number;
  admins: AdminUser[];
  catalogs: CatalogItem[];
  competencies: Competency[];
  courses: Course[];
  participants: Participant[];
  sessions: ParticipantSession[];
  answers: ParticipantAnswer[];
  results: CourseResult[];
  thresholds: GapThresholdConfig;
  normalized_tables: NormalizedTablesSummary;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'fabrica_db_v3.json');

function computeNormalizedTablesFromState(
  admins: AdminUser[],
  catalogs: CatalogItem[],
  competencies: Competency[],
  courses: Course[],
  participants: Participant[],
  sessions: ParticipantSession[],
  answers: ParticipantAnswer[],
  results: CourseResult[]
): NormalizedRelationalTables {
  const courseRows: Array<Omit<Course, 'modules' | 'materials'>> = [];
  const cohortRows: CourseSessionCohort[] = [];
  const materialRows: TrainingMaterial[] = [];
  const moduleRows: Array<Omit<CourseModule, 'items'>> = [];
  const itemRows: Array<Omit<ContentItem, 'question'>> = [];
  const questionRows: Array<Omit<Question, 'options'>> = [];
  const optionRows: QuestionOption[] = [];
  const questionCompetencyRows: QuestionCompetencyLink[] = [];

  for (const c of courses) {
    const { modules, materials, ...courseMeta } = c;
    courseRows.push(courseMeta);

    cohortRows.push({
      id: ensureUuid(),
      course_id: c.id,
      cohort_name: `Convocatoria Permanente - ${c.title}`,
      public_slug: c.slug,
      active: c.status === 'published',
      starts_at: c.created_at,
      created_at: c.created_at,
      updated_at: c.updated_at,
    });

    for (const mat of materials || []) {
      materialRows.push(mat);
    }

    for (const mod of modules || []) {
      const { items, ...modMeta } = mod;
      moduleRows.push(modMeta);

      for (const it of items || []) {
        const { question, ...itemMeta } = it;
        itemRows.push(itemMeta);

        if (question) {
          const { options, ...qMeta } = question;
          questionRows.push(qMeta);
          questionCompetencyRows.push({
            id: ensureUuid(),
            question_id: question.id,
            competency_id: question.competency_id,
            weight: 1.0,
            created_at: question.created_at,
          });
          for (const opt of options || []) {
            optionRows.push(opt);
          }
        }
      }
    }
  }

  return {
    admin_users: admins,
    catalog_items: catalogs,
    competencies,
    courses: courseRows,
    course_sessions: cohortRows,
    training_materials: materialRows,
    modules: moduleRows,
    content_items: itemRows,
    questions: questionRows,
    question_options: optionRows,
    question_competencies: questionCompetencyRows,
    participants,
    participant_sessions: sessions,
    participant_answers: answers,
    course_results: results,
  };
}

function summarizeNormalizedTables(tables: NormalizedRelationalTables): NormalizedTablesSummary {
  return {
    admin_users: tables.admin_users.length,
    catalog_items: tables.catalog_items.length,
    competencies: tables.competencies.length,
    courses: tables.courses.length,
    course_sessions: tables.course_sessions.length,
    training_materials: tables.training_materials.length,
    modules: tables.modules.length,
    content_items: tables.content_items.length,
    questions: tables.questions.length,
    question_options: tables.question_options.length,
    question_competencies: tables.question_competencies.length,
    participants: tables.participants.length,
    participant_sessions: tables.participant_sessions.length,
    participant_answers: tables.participant_answers.length,
    course_results: tables.course_results.length,
  };
}

function createInitialState(): DatabaseState {
  const admins = structuredClone(INITIAL_ADMINS);
  const catalogs = structuredClone(INITIAL_CATALOGS);
  const competencies = structuredClone(INITIAL_COMPETENCIES);
  const courses = structuredClone(INITIAL_COURSES);
  const participants = structuredClone(INITIAL_PARTICIPANTS);
  const sessions = structuredClone(INITIAL_SESSIONS);
  const answers = structuredClone(INITIAL_ANSWERS);
  const results = structuredClone(INITIAL_RESULTS);

  const normalized = computeNormalizedTablesFromState(
    admins,
    catalogs,
    competencies,
    courses,
    participants,
    sessions,
    answers,
    results
  );

  return {
    schema_version: 3,
    admins,
    catalogs,
    competencies,
    courses,
    participants,
    sessions,
    answers,
    results,
    thresholds: {
      goodMin: 80,
      warningMin: 65,
    },
    normalized_tables: summarizeNormalizedTables(normalized),
  };
}

class RelationalStore {
  private state: DatabaseState;

  constructor() {
    this.state = this.load();
  }

  private load(): DatabaseState {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw) as DatabaseState;
        if (
          parsed &&
          parsed.schema_version === 3 &&
          Array.isArray(parsed.courses) &&
          parsed.courses.length > 0 &&
          UUID_REGEX.test(parsed.courses[0].id)
        ) {
          // Purge any legacy seed example participants, sessions, answers, and results
          const demoParticipantIds = new Set([
            '70000000-0000-4000-8000-000000000001',
            '70000000-0000-4000-8000-000000000002',
            '70000000-0000-4000-8000-000000000003',
            '70000000-0000-4000-8000-000000000004',
            '70000000-0000-4000-8000-000000000005',
          ]);
          const hadDemoParticipants = (parsed.participants || []).some((p) =>
            demoParticipantIds.has(p.id)
          );
          if (hadDemoParticipants) {
            parsed.participants = (parsed.participants || []).filter(
              (p) => !demoParticipantIds.has(p.id)
            );
            const removedSessionIds = new Set(
              (parsed.sessions || [])
                .filter(
                  (s) =>
                    demoParticipantIds.has(s.participant_id) ||
                    s.id.startsWith('80000000-0000-4000-8000-00000000000')
                )
                .map((s) => s.id)
            );
            parsed.sessions = (parsed.sessions || []).filter(
              (s) => !removedSessionIds.has(s.id)
            );
            parsed.answers = (parsed.answers || []).filter(
              (a) =>
                !removedSessionIds.has(a.session_id) &&
                !a.id.startsWith('90000000-0000-4000-8000-')
            );
            parsed.results = (parsed.results || []).filter(
              (r) =>
                !removedSessionIds.has(r.session_id) &&
                !demoParticipantIds.has(r.participant_id)
            );
          }
          const upgraded = upgradeExistingCoursesWithStudyCardsAndFeedback(
            parsed.courses,
            parsed.competencies || INITIAL_COMPETENCIES
          );
          if (hadDemoParticipants || upgraded) {
            this.save(parsed);
          }
          return parsed;
        }
      }
    } catch (err) {
      console.error('Error loading local persistence, initializing UUID v3 seed data:', err);
    }
    const initial = createInitialState();
    upgradeExistingCoursesWithStudyCardsAndFeedback(
      initial.courses,
      initial.competencies
    );
    this.save(initial);
    return initial;
  }

  private refreshNormalizedSummary(stateToUpdate: DatabaseState = this.state) {
    const tables = computeNormalizedTablesFromState(
      stateToUpdate.admins,
      stateToUpdate.catalogs,
      stateToUpdate.competencies,
      stateToUpdate.courses,
      stateToUpdate.participants,
      stateToUpdate.sessions,
      stateToUpdate.answers,
      stateToUpdate.results
    );
    stateToUpdate.normalized_tables = summarizeNormalizedTables(tables);
    return tables;
  }

  private save(stateToSave: DatabaseState = this.state) {
    try {
      this.refreshNormalizedSummary(stateToSave);
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(DB_FILE, JSON.stringify(stateToSave, null, 2), 'utf-8');
    } catch (err) {
      console.error('Error saving database file:', err);
    }
  }

  public getState(): DatabaseState {
    this.refreshNormalizedSummary();
    return this.state;
  }

  public getNormalizedTables(): NormalizedRelationalTables {
    return this.refreshNormalizedSummary();
  }

  public getDatabaseAuditReport() {
    const tables = this.getNormalizedTables();
    const counts = summarizeNormalizedTables(tables);

    // Verify all IDs are valid RFC 4122 UUIDs
    const allCourseUuidsValid = tables.courses.every((c) => UUID_REGEX.test(c.id));
    const allModuleUuidsValid = tables.modules.every(
      (m) => UUID_REGEX.test(m.id) && UUID_REGEX.test(m.course_id)
    );
    const allQuestionUuidsValid = tables.questions.every(
      (q) =>
        UUID_REGEX.test(q.id) &&
        UUID_REGEX.test(q.course_id) &&
        UUID_REGEX.test(q.module_id) &&
        UUID_REGEX.test(q.competency_id)
    );
    const allParticipantUuidsValid = tables.participants.every((p) => UUID_REGEX.test(p.id));
    const allSessionUuidsValid = tables.participant_sessions.every(
      (s) =>
        UUID_REGEX.test(s.id) &&
        UUID_REGEX.test(s.participant_id) &&
        UUID_REGEX.test(s.course_id)
    );

    const supabaseUrlConfigured = Boolean(
      process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    return {
      storage_mode: supabaseUrlConfigured
        ? 'Supabase PostgreSQL + Persistencia Relacional Sincronizada'
        : 'Motor Relacional Local Persistente (data/fabrica_db_v2.json) — Pendiente configurar SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env',
      supabase_connected: supabaseUrlConfigured,
      uuid_referential_integrity: {
        courses_uuid_valid: allCourseUuidsValid,
        modules_fk_valid: allModuleUuidsValid,
        questions_fk_valid: allQuestionUuidsValid,
        participants_uuid_valid: allParticipantUuidsValid,
        sessions_fk_valid: allSessionUuidsValid,
      },
      table_row_counts: counts,
      published_links: this.state.courses.map((c) => ({
        id: c.id,
        title: c.title,
        status: c.status,
        public_path: `/formacion/${c.slug}`,
      })),
    };
  }

  public updateThresholds(config: GapThresholdConfig): GapThresholdConfig {
    this.state.thresholds = {
      goodMin: Math.max(10, Math.min(99, Number(config.goodMin) || 80)),
      warningMin: Math.max(5, Math.min(95, Number(config.warningMin) || 65)),
    };
    this.save();
    return this.state.thresholds;
  }

  // Strip sensitive answer keys for public participant view (Section 20 Security)
  public sanitizeCourseForPublic(course: Course): Course {
    const clone = structuredClone(course);
    clone.modules = Array.isArray(clone.modules) ? clone.modules : [];
    clone.materials = Array.isArray(clone.materials) ? clone.materials : [];
    for (const mod of clone.modules) {
      mod.items = Array.isArray(mod.items) ? mod.items : [];
      mod.items.sort((a, b) => a.order_index - b.order_index);
      for (const item of mod.items) {
        if (item.question) {
          item.question.options = (item.question.options || []).map((opt) => ({
            id: opt.id,
            question_id: opt.question_id,
            label: opt.label,
            text: opt.text,
            image_url: opt.image_url,
            // Never expose is_correct or step_order to client before submission
          }));
        }
      }
    }
    clone.modules.sort((a, b) => a.order_index - b.order_index);
    return clone;
  }

  public getPublicPublishedCourses(): Array<
    Course & { total_modules: number; total_slides: number }
  > {
    return this.state.courses
      .filter((c) => c.status === 'published')
      .map((c) => {
        const sanitized = this.sanitizeCourseForPublic(c);
        const modules = sanitized.modules || [];
        const totalSlides = modules.reduce(
          (acc, m) => acc + (m.items || []).length,
          0
        );
        return {
          ...sanitized,
          modules,
          materials: sanitized.materials || [],
          total_modules: modules.length,
          total_slides: totalSlides,
        };
      });
  }

  private matchCourseSlug(courseSlug: string, requestedSlug: string): boolean {
    const cSlug = courseSlug.toLowerCase().trim();
    const rSlug = requestedSlug.toLowerCase().trim();
    if (cSlug === rSlug) return true;
    if (rSlug === 'ftth' && cSlug.includes('ftth')) return true;
    if (
      (rSlug === 'normalizacion-red-r1' || rSlug === 'normalizacion-r1') &&
      (cSlug.includes('normalizacion') || cSlug.includes('r1'))
    ) {
      return true;
    }
    if (
      (rSlug === 'seguridad-campo' || rSlug === 'seguridad') &&
      cSlug.includes('seguridad')
    ) {
      return true;
    }
    return false;
  }

  public getPublicCourseBySlug(slug: string, allowPreview = false): Course | null {
    const course = this.state.courses.find(
      (c) =>
        this.matchCourseSlug(c.slug, slug) &&
        (allowPreview || c.status === 'published')
    );
    if (!course) return null;
    return this.sanitizeCourseForPublic(course);
  }

  public findQuestionInCourse(course: Course, questionId: string): Question | null {
    for (const mod of course.modules || []) {
      for (const item of mod.items || []) {
        if (item.question && item.question.id === questionId) {
          return item.question;
        }
      }
    }
    return null;
  }

  public buildFeedbackForExistingAnswers(
    course: Course,
    sessionAnswers: ParticipantAnswer[]
  ): Record<string, AnswerSubmissionFeedback> {
    const feedbackMap: Record<string, AnswerSubmissionFeedback> = {};
    const byQuestion = new Map<string, ParticipantAnswer[]>();
    for (const ans of sessionAnswers) {
      const list = byQuestion.get(ans.question_id) || [];
      list.push(ans);
      byQuestion.set(ans.question_id, list);
    }

    for (const [qId, attempts] of byQuestion.entries()) {
      const q = this.findQuestionInCourse(course, qId);
      if (!q) continue;
      attempts.sort((a, b) => a.attempt_number - b.attempt_number);
      const latest = attempts[attempts.length - 1];
      const attemptsRemaining = latest.is_correct
        ? 0
        : Math.max(0, q.max_attempts - latest.attempt_number);

      const resolvedExplanation =
        (latest.is_correct
          ? q.explanation_correct || q.explanation
          : q.explanation_incorrect || q.explanation) ||
        q.explanation ||
        'La evaluación verifica la aplicación exacta de los parámetros y procedimientos del material técnico suministrado.';

      const correctOptIds = q.options.filter((o) => o.is_correct).map((o) => o.id);
      const optionRationales: Record<string, string> = {};
      for (const opt of q.options) {
        optionRationales[opt.id] =
          opt.rationale ||
          (opt.is_correct
            ? 'Opción CORRECTA: Cumple con la especificación técnica del material de referencia.'
            : 'Opción INCORRECTA: No corresponde al parámetro o procedimiento establecido en el material.');
      }

      const selectedOptRationales = (latest.selected_option_ids || [])
        .map((id) => optionRationales[id])
        .filter(Boolean)
        .join(' ');

      const whyExplanation = latest.is_correct
        ? `Respondiste BIEN porque tu elección ("${latest.selected_answer_text}") coincide exactamente con el estándar del material. ${resolvedExplanation}`
        : `Respondiste MAL porque seleccionaste "${latest.selected_answer_text}", mientras que el material especifica como correcto: "${latest.correct_answer_text}". ${selectedOptRationales} ${resolvedExplanation}`;

      feedbackMap[qId] = {
        is_correct: latest.is_correct,
        status_label: latest.is_correct
          ? '¡RESPUESTA CORRECTA!'
          : 'RESPUESTA INCORRECTA',
        attempt_number: latest.attempt_number,
        max_attempts: q.max_attempts,
        attempts_remaining: attemptsRemaining,
        points_earned: latest.points_obtained,
        max_points: latest.max_points,
        why_explanation: whyExplanation,
        explanation: resolvedExplanation,
        correct_concept:
          q.correct_concept ||
          `Estándar verificado: ${latest.correct_answer_text}`,
        recommendation:
          q.recommendation ||
          'Revisa las fichas de estudio y diapositivas técnicas del módulo para afianzar este concepto.',
        selected_answer_text: latest.selected_answer_text,
        correct_answer_text: latest.correct_answer_text,
        correct_option_ids: correctOptIds,
        option_rationales: optionRationales,
        related_content_id: q.related_content_id || q.related_item_id,
      };
    }

    return feedbackMap;
  }

  public getPublicSessionState(sessionId: string): {
    session: ParticipantSession;
    participant: Participant;
    existing_answers: ParticipantAnswer[];
    feedback_map: Record<string, AnswerSubmissionFeedback>;
    result?: CourseResult;
  } | null {
    const session = this.state.sessions.find((s) => s.id === sessionId);
    if (!session) return null;
    const participant = this.state.participants.find((p) => p.id === session.participant_id);
    const course = this.state.courses.find((c) => c.id === session.course_id);
    if (!participant || !course) return null;

    const existingAnswers = this.state.answers.filter((a) => a.session_id === session.id);
    const feedbackMap = this.buildFeedbackForExistingAnswers(course, existingAnswers);
    const result = this.state.results.find((r) => r.session_id === session.id);

    return {
      session,
      participant,
      existing_answers: existingAnswers,
      feedback_map: feedbackMap,
      result,
    };
  }

  public getPublicParticipantSessionsByCedula(identificationNumber: string): {
    participant: Participant | null;
    sessions: Array<{
      session: ParticipantSession;
      course_title: string;
      course_slug: string;
      course_category: string;
    }>;
  } {
    const cleanId = String(identificationNumber || '')
      .replace(/\s+/g, '')
      .trim()
      .toLowerCase();
    if (!cleanId) {
      return { participant: null, sessions: [] };
    }
    const participant =
      this.state.participants.find(
        (p) =>
          p.identification_number.replace(/\s+/g, '').toLowerCase() === cleanId
      ) || null;
    if (!participant) {
      return { participant: null, sessions: [] };
    }
    const participantSessions = this.state.sessions
      .filter((s) => s.participant_id === participant.id)
      .sort(
        (a, b) =>
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      )
      .map((session) => {
        const course = this.state.courses.find((c) => c.id === session.course_id);
        return {
          session,
          course_title: course?.title || 'Capacitación Técnica',
          course_slug: course?.slug || '',
          course_category: course?.category || 'General',
        };
      });
    return {
      participant,
      sessions: participantSessions,
    };
  }

  public registerOrResumeParticipant(
    slug: string,
    payload: {
      full_name: string;
      identification_number: string;
      area: string;
      role: string;
      force_new_attempt?: boolean;
    }
  ): {
    status: 'created' | 'resumed' | 'new_attempt' | 'blocked_single_attempt';
    message: string;
    participant: Participant;
    session?: ParticipantSession;
    existing_answers?: ParticipantAnswer[];
    feedback_map?: Record<string, AnswerSubmissionFeedback>;
  } {
    const course = this.state.courses.find((c) =>
      this.matchCourseSlug(c.slug, slug)
    );
    if (!course) {
      throw new Error('La actividad formativa solicitada no existe.');
    }

    const cleanId = payload.identification_number.replace(/\s+/g, '').trim();
    const cleanName = payload.full_name.replace(/\s+/g, ' ').trim();
    const cleanArea = payload.area.replace(/\s+/g, ' ').trim();
    const cleanRole = payload.role.replace(/\s+/g, ' ').trim();
    const now = new Date().toISOString();

    let participant = this.state.participants.find(
      (p) => p.identification_number.replace(/\s+/g, '').toLowerCase() === cleanId.toLowerCase()
    );

    if (!participant) {
      participant = {
        id: crypto.randomUUID(),
        full_name: cleanName,
        identification_number: cleanId,
        area: cleanArea,
        role: cleanRole,
        created_at: now,
        updated_at: now,
      };
      this.state.participants.push(participant);
    } else {
      participant.full_name = cleanName || participant.full_name;
      participant.area = cleanArea || participant.area;
      participant.role = cleanRole || participant.role;
      participant.updated_at = now;
    }

    // Automatically add any new organizational Cargo (role) or Área to the catalog if not already present
    if (cleanArea) {
      const areaExists = this.state.catalogs.some(
        (c) => c.type === 'area' && c.name.trim().toLowerCase() === cleanArea.toLowerCase()
      );
      if (!areaExists) {
        this.state.catalogs.push({
          id: crypto.randomUUID(),
          type: 'area',
          name: cleanArea,
          code: `AREA-${cleanArea.slice(0, 4).toUpperCase()}`,
          active: true,
          created_at: now,
          updated_at: now,
        });
      }
    }
    if (cleanRole) {
      const roleExists = this.state.catalogs.some(
        (c) => c.type === 'role' && c.name.trim().toLowerCase() === cleanRole.toLowerCase()
      );
      if (!roleExists) {
        this.state.catalogs.push({
          id: crypto.randomUUID(),
          type: 'role',
          name: cleanRole,
          code: `CARGO-${cleanRole.slice(0, 4).toUpperCase()}`,
          active: true,
          created_at: now,
          updated_at: now,
        });
      }
    }

    const existingSessions = this.state.sessions
      .filter((s) => s.participant_id === participant!.id && s.course_id === course.id)
      .sort((a, b) => b.attempt_number - a.attempt_number);

    const latestSession = existingSessions[0];
    const courseMods = course.modules || [];
    const totalSlides = Math.max(
      1,
      courseMods.reduce((sum, m) => sum + (m.items || []).length, 0)
    );
    const maxScore = Math.max(
      10,
      courseMods.reduce(
        (sum, m) =>
          sum +
          (m.items || []).reduce(
            (qSum, it) => qSum + (it.question ? it.question.points : 0),
            0
          ),
        0
      )
    );

    if (latestSession) {
      const isFinished =
        latestSession.status === 'Finalizado' ||
        latestSession.status === 'Aprobado' ||
        latestSession.status === 'Requiere refuerzo';

      if (!isFinished && !payload.force_new_attempt && course.retry_policy !== 'new_attempt') {
        const existingAnswers = this.state.answers.filter(
          (a) => a.session_id === latestSession.id
        );
        const feedbackMap = this.buildFeedbackForExistingAnswers(course, existingAnswers);
        this.save();
        return {
          status: 'resumed',
          message:
            'Se encontró una sesión en progreso para tu identificación. Retomando exactamente en la pantalla donde quedaste.',
          participant,
          session: latestSession,
          existing_answers: existingAnswers,
          feedback_map: feedbackMap,
        };
      }

      if (isFinished && course.retry_policy === 'single_attempt') {
        this.save();
        return {
          status: 'blocked_single_attempt',
          message:
            'Esta actividad está configurada con política de único intento y tu identificación ya registra una participación finalizada.',
          participant,
          session: latestSession,
        };
      }

      if (!isFinished && course.retry_policy === 'continue' && !payload.force_new_attempt) {
        const existingAnswers = this.state.answers.filter(
          (a) => a.session_id === latestSession.id
        );
        const feedbackMap = this.buildFeedbackForExistingAnswers(course, existingAnswers);
        this.save();
        return {
          status: 'resumed',
          message: 'Continuando tu sesión activa.',
          participant,
          session: latestSession,
          existing_answers: existingAnswers,
          feedback_map: feedbackMap,
        };
      }
    }

    const nextAttempt = latestSession ? latestSession.attempt_number + 1 : 1;
    const newSession: ParticipantSession = {
      id: crypto.randomUUID(),
      session_code: `FIF-${new Date().getFullYear()}-${crypto
        .randomBytes(2)
        .toString('hex')
        .toUpperCase()}`,
      participant_id: participant.id,
      course_id: course.id,
      attempt_number: nextAttempt,
      current_slide_index: 0,
      total_slides: totalSlides,
      progress_percentage: Math.round((1 / totalSlides) * 100),
      score_obtained: 0,
      max_possible_score: maxScore,
      score_percentage: 0,
      status: 'En progreso',
      started_at: now,
      total_duration_seconds: 0,
      created_at: now,
      updated_at: now,
    };

    this.state.sessions.push(newSession);
    this.save();

    return {
      status: nextAttempt > 1 ? 'new_attempt' : 'created',
      message:
        nextAttempt > 1
          ? `Iniciando intento #${nextAttempt} para esta actividad.`
          : 'Participación registrada exitosamente.',
      participant,
      session: newSession,
      existing_answers: [],
      feedback_map: {},
    };
  }

  public submitParticipantAnswer(
    sessionId: string,
    payload: {
      question_id: string;
      selected_option_ids: string[];
      response_duration_seconds: number;
    }
  ): {
    feedback: AnswerSubmissionFeedback;
    session: ParticipantSession;
    answer: ParticipantAnswer;
  } {
    const session = this.state.sessions.find((s) => s.id === sessionId);
    if (!session) {
      throw new Error('Sesión de participación no encontrada.');
    }

    const course = this.state.courses.find((c) => c.id === session.course_id);
    if (!course) {
      throw new Error('Curso no encontrado.');
    }

    const question = this.findQuestionInCourse(course, payload.question_id);
    if (!question) {
      throw new Error('Pregunta no encontrada en el curso.');
    }

    const previousAttempts = this.state.answers.filter(
      (a) => a.session_id === session.id && a.question_id === question.id
    );
    const attemptNumber = previousAttempts.length + 1;

    let isCorrect = false;
    let selectedText = '';
    let correctText = '';

    if (question.question_type === 'order_steps') {
      const sortedByStep = [...question.options].sort(
        (a, b) => (a.step_order || 0) - (b.step_order || 0)
      );
      const expectedIds = sortedByStep.map((o) => o.id);
      isCorrect =
        expectedIds.length === payload.selected_option_ids.length &&
        expectedIds.every((id, idx) => id === payload.selected_option_ids[idx]);

      selectedText = payload.selected_option_ids
        .map((id, idx) => {
          const opt = question.options.find((o) => o.id === id);
          return `${idx + 1}. ${opt?.text || id}`;
        })
        .join(' | ');
      correctText = sortedByStep.map((o, idx) => `${idx + 1}. ${o.text}`).join(' | ');
    } else if (question.question_type === 'multiple_choice') {
      const correctOpts = question.options.filter((o) => o.is_correct);
      const correctIds = new Set(correctOpts.map((o) => o.id));
      const selectedSet = new Set(payload.selected_option_ids);
      isCorrect =
        correctIds.size === selectedSet.size &&
        [...correctIds].every((id) => selectedSet.has(id));

      selectedText = question.options
        .filter((o) => selectedSet.has(o.id))
        .map((o) => o.text)
        .join(', ');
      correctText = correctOpts.map((o) => o.text).join(', ');
    } else {
      const correctOpt = question.options.find((o) => o.is_correct);
      const selectedOpt = question.options.find(
        (o) => o.id === payload.selected_option_ids[0]
      );
      isCorrect = Boolean(correctOpt && selectedOpt && correctOpt.id === selectedOpt.id);
      selectedText = selectedOpt ? selectedOpt.text : 'Sin selección';
      correctText = correctOpt ? correctOpt.text : '';
    }

    const pointsEarned = isCorrect ? question.points : 0;
    const now = new Date().toISOString();

    const answerRecord: ParticipantAnswer = {
      id: crypto.randomUUID(),
      session_id: session.id,
      participant_id: session.participant_id,
      course_id: course.id,
      module_id: question.module_id,
      question_id: question.id,
      competency_id: question.competency_id,
      selected_option_ids: payload.selected_option_ids,
      selected_answer_text: selectedText,
      correct_answer_text: correctText,
      is_correct: isCorrect,
      attempt_number: attemptNumber,
      points_obtained: pointsEarned,
      max_points: question.points,
      response_duration_seconds: Math.max(
        1,
        Number(payload.response_duration_seconds) || 15
      ),
      answered_at: now,
    };

    this.state.answers.push(answerRecord);

    // Recalculate session score taking the best valid attempt per question
    const allSessionAnswers = this.state.answers.filter((a) => a.session_id === session.id);
    const pointsByQuestion = new Map<string, number>();
    for (const ans of allSessionAnswers) {
      const prev = pointsByQuestion.get(ans.question_id) || 0;
      if (ans.points_obtained > prev) {
        pointsByQuestion.set(ans.question_id, ans.points_obtained);
      }
    }

    let totalPointsObtained = 0;
    for (const pts of pointsByQuestion.values()) {
      totalPointsObtained += pts;
    }

    session.score_obtained = totalPointsObtained;
    session.score_percentage = Math.min(
      100,
      Math.round((totalPointsObtained / Math.max(1, session.max_possible_score)) * 100)
    );
    session.total_duration_seconds += answerRecord.response_duration_seconds;
    session.updated_at = now;

    this.save();

    const attemptsRemaining = isCorrect
      ? 0
      : Math.max(0, question.max_attempts - attemptNumber);

    const resolvedExplanation =
      (isCorrect
        ? question.explanation_correct || question.explanation
        : question.explanation_incorrect || question.explanation) ||
      question.explanation ||
      'Esta evaluación comprueba el cumplimiento de las normas y procedimientos descritos en el material formativo.';

    const correctOptIds = question.options
      .filter((o) => o.is_correct)
      .map((o) => o.id);
    const optionRationales: Record<string, string> = {};
    for (const opt of question.options) {
      optionRationales[opt.id] =
        opt.rationale ||
        (opt.is_correct
          ? 'Opción CORRECTA: Cumple con la especificación técnica del material de referencia.'
          : 'Opción INCORRECTA: No corresponde al parámetro o procedimiento establecido en el material.');
    }

    const selectedOptRationales = (payload.selected_option_ids || [])
      .map((id) => optionRationales[id])
      .filter(Boolean)
      .join(' ');

    const whyExplanation = isCorrect
      ? `Respondiste BIEN porque tu elección ("${selectedText}") coincide exactamente con el estándar del material. ${resolvedExplanation}`
      : `Respondiste MAL porque seleccionaste "${selectedText}", mientras que el material especifica como correcto: "${correctText}". ${selectedOptRationales} ${resolvedExplanation}`;

    return {
      feedback: {
        is_correct: isCorrect,
        status_label: isCorrect
          ? '¡RESPUESTA CORRECTA!'
          : 'RESPUESTA INCORRECTA',
        attempt_number: attemptNumber,
        max_attempts: question.max_attempts,
        attempts_remaining: attemptsRemaining,
        points_earned: pointsEarned,
        max_points: question.points,
        why_explanation: whyExplanation,
        explanation: resolvedExplanation,
        correct_concept:
          question.correct_concept || `Estándar verificado: ${correctText}`,
        recommendation:
          question.recommendation ||
          'Revisa las fichas de estudio y diapositivas técnicas del módulo para reforzar este procedimiento.',
        selected_answer_text: selectedText,
        correct_answer_text: correctText,
        correct_option_ids: correctOptIds,
        option_rationales: optionRationales,
        related_content_id:
          question.related_content_id || question.related_item_id,
      },
      session,
      answer: answerRecord,
    };
  }

  public updateSessionProgress(
    sessionId: string,
    slideIndex: number,
    elapsedSecondsDelta: number,
    finalize = false
  ): { session: ParticipantSession; result?: CourseResult } {
    const session = this.state.sessions.find((s) => s.id === sessionId);
    if (!session) {
      throw new Error('Sesión no encontrada.');
    }
    const course = this.state.courses.find((c) => c.id === session.course_id);
    if (!course) {
      throw new Error('Curso no encontrado.');
    }

    const now = new Date().toISOString();
    session.current_slide_index = Math.max(0, slideIndex);
    session.progress_percentage = Math.min(
      100,
      Math.round(((slideIndex + 1) / Math.max(1, session.total_slides)) * 100)
    );
    session.total_duration_seconds += Math.max(0, Number(elapsedSecondsDelta) || 0);
    session.updated_at = now;

    let result: CourseResult | undefined;

    if (finalize) {
      session.progress_percentage = 100;
      session.finished_at = now;
      const passed = session.score_percentage >= course.passing_score;
      session.status = passed ? 'Aprobado' : 'Requiere refuerzo';

      // Deduplicate attempts per question within the session before aggregating competencies
      const sessionAnswers = this.state.answers.filter((a) => a.session_id === session.id);
      const bestAttemptPerQuestion = new Map<string, ParticipantAnswer>();
      for (const ans of sessionAnswers) {
        const prev = bestAttemptPerQuestion.get(ans.question_id);
        if (!prev || ans.points_obtained >= prev.points_obtained) {
          bestAttemptPerQuestion.set(ans.question_id, ans);
        }
      }

      const compStats = new Map<string, { earned: number; max: number }>();
      for (const ans of bestAttemptPerQuestion.values()) {
        const curr = compStats.get(ans.competency_id) || { earned: 0, max: 0 };
        curr.earned += ans.points_obtained;
        curr.max += ans.max_points;
        compStats.set(ans.competency_id, curr);
      }

      let topStrength: string | undefined;
      let topStrengthPct = -1;
      let topGap: string | undefined;
      let topGapPct = 101;
      const strengthsList: string[] = [];
      const improvementsList: string[] = [];

      for (const [compId, st] of compStats.entries()) {
        const pct = st.max > 0 ? Math.round((st.earned / st.max) * 100) : 0;
        const compName =
          this.state.competencies.find((c) => c.id === compId)?.name || compId;
        if (pct >= this.state.thresholds.goodMin) {
          strengthsList.push(`${compName} (${pct}% de dominio)`);
        } else {
          improvementsList.push(`${compName} (${pct}% — requiere refuerzo)`);
        }
        if (pct > topStrengthPct && pct >= this.state.thresholds.warningMin) {
          topStrengthPct = pct;
          topStrength = compName;
        }
        if (pct < topGapPct && pct < this.state.thresholds.goodMin) {
          topGapPct = pct;
          topGap = compName;
        }
      }

      if (strengthsList.length === 0 && topStrength) {
        strengthsList.push(`${topStrength} (${topStrengthPct}% logrado)`);
      }
      if (improvementsList.length === 0 && !passed) {
        improvementsList.push('Reforzar los conceptos clave y procedimientos paso a paso del curso.');
      }

      const existingResultIdx = this.state.results.findIndex(
        (r) => r.session_id === session.id
      );
      result = {
        id:
          existingResultIdx >= 0
            ? this.state.results[existingResultIdx].id
            : crypto.randomUUID(),
        session_id: session.id,
        participant_id: session.participant_id,
        course_id: course.id,
        final_percentage: session.score_percentage,
        passed,
        status: session.status,
        top_strength_competency: topStrength,
        top_gap_competency: topGap,
        strengths_list: strengthsList,
        improvements_list: improvementsList,
        completed_at: now,
      };

      if (existingResultIdx >= 0) {
        this.state.results[existingResultIdx] = result;
      } else {
        this.state.results.push(result);
      }
    }

    this.save();
    return { session, result };
  }

  public upsertCourse(coursePayload: Course): Course {
    const now = new Date().toISOString();
    const courseId = ensureUuid(coursePayload.id);
    const existingIdx = this.state.courses.findIndex((c) => c.id === courseId);

    let normalizedSlug = (coursePayload.slug || coursePayload.title)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    if (!normalizedSlug) {
      normalizedSlug = `actividad-${courseId.slice(0, 8)}`;
    }

    // Ensure unique slug across different courses
    const slugConflict = this.state.courses.find(
      (c) => c.slug.toLowerCase() === normalizedSlug.toLowerCase() && c.id !== courseId
    );
    if (slugConflict) {
      normalizedSlug = `${normalizedSlug}-${courseId.slice(0, 4)}`;
    }

    const adminId = this.state.admins[0]?.id || ensureUuid();

    // Normalize all nested UUIDs (modules, content_items, questions, question_options, materials)
    const normalizedMaterials: TrainingMaterial[] = (coursePayload.materials || []).map(
      (mat) => ({
        ...mat,
        id: ensureUuid(mat.id),
        course_id: courseId,
        uploaded_at: mat.uploaded_at || now,
      })
    );

    const normalizedModules: CourseModule[] = (coursePayload.modules || []).map(
      (mod, mIdx) => {
        const modId = ensureUuid(mod.id);
        const normalizedItems: ContentItem[] = (mod.items || []).map((it, iIdx) => {
          const itemId = ensureUuid(it.id);
          let normalizedQuestion: Question | undefined = undefined;
          if (it.question) {
            const qId = ensureUuid(it.question.id);
            const compId = ensureUuid(
              it.question.competency_id || this.state.competencies[0]?.id
            );
            const compObj = this.state.competencies.find((c) => c.id === compId);
            normalizedQuestion = {
              ...it.question,
              id: qId,
              course_id: courseId,
              module_id: modId,
              competency_id: compId,
              competency_name: compObj?.name || it.question.competency_name || 'General',
              order_index: iIdx + 1,
              created_at: it.question.created_at || now,
              updated_at: now,
              options: (it.question.options || []).map((opt, oIdx) => ({
                ...opt,
                id: ensureUuid(opt.id),
                question_id: qId,
                label: opt.label || String.fromCharCode(65 + oIdx),
              })),
            };
          }
          return {
            ...it,
            id: itemId,
            course_id: courseId,
            module_id: modId,
            order_index: iIdx + 1,
            question_id: normalizedQuestion?.id,
            question: normalizedQuestion,
            created_at: it.created_at || now,
            updated_at: now,
          };
        });

        return {
          ...mod,
          id: modId,
          course_id: courseId,
          order_index: mIdx + 1,
          items: normalizedItems,
          created_at: mod.created_at || now,
          updated_at: now,
        };
      }
    );

    const updatedCourse: Course = {
      ...coursePayload,
      id: courseId,
      slug: normalizedSlug,
      modules: normalizedModules,
      materials: normalizedMaterials,
      approved_by:
        coursePayload.status === 'published' ? adminId : coursePayload.approved_by,
      updated_at: now,
      created_at: coursePayload.created_at || now,
      published_at:
        coursePayload.status === 'published'
          ? coursePayload.published_at || now
          : coursePayload.published_at,
    };

    if (existingIdx >= 0) {
      this.state.courses[existingIdx] = updatedCourse;
    } else {
      this.state.courses.unshift(updatedCourse);
    }

    this.save();
    return updatedCourse;
  }

  public setCourseStatus(
    courseId: string,
    status: 'draft' | 'published' | 'archived'
  ): Course | null {
    const course = this.state.courses.find((c) => c.id === courseId);
    if (!course) return null;
    const now = new Date().toISOString();
    course.status = status;
    course.updated_at = now;
    if (status === 'published') {
      course.published_at = course.published_at || now;
      course.approved_by = this.state.admins[0]?.id;
    }
    this.save();
    return course;
  }

  public deleteCourse(courseId: string): boolean {
    const initialLen = this.state.courses.length;
    this.state.courses = this.state.courses.filter((c) => c.id !== courseId);
    this.save();
    return this.state.courses.length < initialLen;
  }

  public upsertCompetency(comp: Partial<Competency>): Competency {
    const now = new Date().toISOString();
    if (comp.id) {
      const existing = this.state.competencies.find((c) => c.id === comp.id);
      if (existing) {
        existing.code = comp.code || existing.code;
        existing.name = comp.name || existing.name;
        existing.description = comp.description ?? existing.description;
        existing.category = comp.category || existing.category;
        existing.updated_at = now;
        this.save();
        return existing;
      }
    }
    const created: Competency = {
      id: crypto.randomUUID(),
      code: comp.code || `COMP-${this.state.competencies.length + 1}`,
      name: comp.name || 'Nueva Competencia',
      description: comp.description || '',
      category: comp.category || 'General',
      created_at: now,
      updated_at: now,
    };
    this.state.competencies.push(created);
    this.save();
    return created;
  }

  public deleteCompetency(compId: string): boolean {
    const usedInQuestions = this.state.courses.some((c) =>
      c.modules.some((m) =>
        m.items.some((it) => it.question?.competency_id === compId)
      )
    );
    if (usedInQuestions) {
      throw new Error(
        'No se puede eliminar una competencia que está asociada a preguntas activas (Integridad Referencial ON DELETE RESTRICT).'
      );
    }
    const prevLen = this.state.competencies.length;
    this.state.competencies = this.state.competencies.filter((c) => c.id !== compId);
    this.save();
    return this.state.competencies.length < prevLen;
  }

  public upsertCatalogItem(item: Partial<CatalogItem>): CatalogItem {
    const now = new Date().toISOString();
    const targetType = item.type || 'area';
    const cleanName = (item.name || '').trim();
    if (item.id) {
      const existing = this.state.catalogs.find((c) => c.id === item.id);
      if (existing) {
        existing.name = cleanName || existing.name;
        existing.code = item.code ?? existing.code;
        existing.active = item.active ?? existing.active;
        existing.updated_at = now;
        this.save();
        return existing;
      }
    }
    if (cleanName) {
      const existingByName = this.state.catalogs.find(
        (c) => c.type === targetType && c.name.trim().toLowerCase() === cleanName.toLowerCase()
      );
      if (existingByName) {
        existingByName.name = cleanName;
        existingByName.code = item.code || existingByName.code;
        existingByName.active = item.active ?? true;
        existingByName.updated_at = now;
        this.save();
        return existingByName;
      }
    }
    const created: CatalogItem = {
      id: crypto.randomUUID(),
      type: targetType,
      name: cleanName || 'Nuevo Registro',
      code: item.code || `${targetType.toUpperCase()}-${this.state.catalogs.length + 1}`,
      active: item.active ?? true,
      created_at: now,
      updated_at: now,
    };
    this.state.catalogs.push(created);
    this.save();
    return created;
  }

  public deleteCatalogItem(itemId: string): boolean {
    const prevLen = this.state.catalogs.length;
    this.state.catalogs = this.state.catalogs.filter((c) => c.id !== itemId);
    this.save();
    return this.state.catalogs.length < prevLen;
  }
}

export const dbStore = new RelationalStore();
