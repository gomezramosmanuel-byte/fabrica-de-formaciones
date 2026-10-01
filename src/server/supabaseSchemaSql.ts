export const SUPABASE_POSTGRES_SCHEMA_SQL = `-- ============================================================================
-- FÁBRICA INTELIGENTE DE FORMACIÓN
-- Esquema Relacional PostgreSQL Normalizado (UUID) + Row Level Security (Supabase)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. USUARIOS ADMINISTRADORES
CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. CATÁLOGOS ADMINISTRATIVOS CONFIGURABLES (Áreas, Cargos, Categorías)
CREATE TABLE IF NOT EXISTS catalog_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('area', 'role', 'category')),
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. COMPETENCIAS / TEMAS EVALUABLES
CREATE TABLE IF NOT EXISTS competencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. CURSOS / EXPERIENCIAS FORMATIVAS
CREATE TABLE IF NOT EXISTS courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  estimated_minutes INTEGER NOT NULL DEFAULT 25,
  level TEXT NOT NULL CHECK (level IN ('Básico', 'Intermedio', 'Avanzado')),
  cover_image_url TEXT NOT NULL,
  passing_score NUMERIC(5,2) NOT NULL DEFAULT 80.00,
  retry_policy TEXT NOT NULL DEFAULT 'continue' CHECK (retry_policy IN ('continue', 'new_attempt', 'single_attempt')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  approved_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. SESIONES / CONVOCATORIAS DE CURSO
CREATE TABLE IF NOT EXISTS course_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  cohort_name TEXT NOT NULL,
  public_slug TEXT NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. MATERIALES DE REFERENCIA (Supabase Storage)
CREATE TABLE IF NOT EXISTS training_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('pdf', 'document', 'presentation', 'image')),
  file_name TEXT NOT NULL,
  file_size_kb INTEGER NOT NULL DEFAULT 0,
  storage_path TEXT NOT NULL,
  extracted_text TEXT NOT NULL DEFAULT '',
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. MÓDULOS DEL CURSO
CREATE TABLE IF NOT EXISTS modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  order_index INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. PREGUNTAS INTERACTIVAS Y CASOS PRÁCTICOS
CREATE TABLE IF NOT EXISTS questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  module_id UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  competency_id UUID NOT NULL REFERENCES competencies(id) ON DELETE RESTRICT,
  question_type TEXT NOT NULL CHECK (question_type IN ('single_choice', 'multiple_choice', 'true_false', 'image_choice', 'order_steps')),
  prompt TEXT NOT NULL,
  case_study_situation TEXT,
  case_study_description TEXT,
  case_study_image_url TEXT,
  explanation TEXT NOT NULL,
  correct_concept TEXT NOT NULL,
  recommendation TEXT NOT NULL,
  related_content_id UUID,
  difficulty TEXT NOT NULL DEFAULT 'Intermedio' CHECK (difficulty IN ('Básico', 'Intermedio', 'Avanzado')),
  points INTEGER NOT NULL DEFAULT 10,
  max_attempts INTEGER NOT NULL DEFAULT 2,
  order_index INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. OPCIONES DE RESPUESTA (Protegidas por RLS para jamás exponer is_correct en cliente)
CREATE TABLE IF NOT EXISTS question_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  text TEXT NOT NULL,
  image_url TEXT,
  step_order INTEGER,
  is_correct BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. RELACIÓN PREGUNTAS - COMPETENCIAS (M:N)
CREATE TABLE IF NOT EXISTS question_competencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  competency_id UUID NOT NULL REFERENCES competencies(id) ON DELETE CASCADE,
  weight NUMERIC(4,2) NOT NULL DEFAULT 1.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (question_id, competency_id)
);

-- 11. CONTENIDOS / PANTALLAS INTERACTIVAS (SLIDES)
CREATE TABLE IF NOT EXISTS content_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  module_id UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL CHECK (content_type IN ('title', 'text', 'image', 'video', 'highlight', 'instructions', 'steps', 'question', 'case_study', 'evaluation')),
  title TEXT NOT NULL,
  subtitle TEXT,
  body TEXT,
  media_url TEXT,
  media_caption TEXT,
  highlight_note TEXT,
  steps_json JSONB DEFAULT '[]'::jsonb,
  question_id UUID REFERENCES questions(id) ON DELETE SET NULL,
  order_index INTEGER NOT NULL DEFAULT 1,
  estimated_seconds INTEGER NOT NULL DEFAULT 60,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. PARTICIPANTES (Nombre completo, Cédula, Área, Cargo, Fecha de registro)
CREATE TABLE IF NOT EXISTS participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  identification_number TEXT NOT NULL UNIQUE,
  area TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. SESIONES DE PARTICIPACIÓN EN ACTIVIDADES
CREATE TABLE IF NOT EXISTS participant_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_code TEXT NOT NULL UNIQUE,
  participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  current_slide_index INTEGER NOT NULL DEFAULT 0,
  total_slides INTEGER NOT NULL DEFAULT 1,
  progress_percentage NUMERIC(5,2) NOT NULL DEFAULT 0,
  score_obtained NUMERIC(6,2) NOT NULL DEFAULT 0,
  max_possible_score NUMERIC(6,2) NOT NULL DEFAULT 100,
  score_percentage NUMERIC(5,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Registrado' CHECK (status IN ('Registrado', 'En progreso', 'Finalizado', 'Aprobado', 'Requiere refuerzo', 'Abandonado')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  total_duration_seconds INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 14. REGISTRO DETALLADO DE RESPUESTAS POR INTERACCIÓN
CREATE TABLE IF NOT EXISTS participant_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES participant_sessions(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  module_id UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  competency_id UUID NOT NULL REFERENCES competencies(id) ON DELETE RESTRICT,
  selected_option_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  selected_answer_text TEXT NOT NULL,
  correct_answer_text TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  points_obtained NUMERIC(5,2) NOT NULL DEFAULT 0,
  max_points NUMERIC(5,2) NOT NULL DEFAULT 10,
  response_duration_seconds INTEGER NOT NULL DEFAULT 0,
  answered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 15. RESULTADOS CONSOLIDADOS DE FORMACIÓN
CREATE TABLE IF NOT EXISTS course_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL UNIQUE REFERENCES participant_sessions(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  final_percentage NUMERIC(5,2) NOT NULL,
  passed BOOLEAN NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Aprobado', 'Requiere refuerzo', 'Finalizado')),
  top_strength_competency TEXT,
  top_gap_competency TEXT,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) COMPLETO EN LAS 15 TABLAS
-- ============================================================================

ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE competencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_competencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE participant_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE participant_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_results ENABLE ROW LEVEL SECURITY;

-- 1. Políticas de lectura pública para actividades publicadas (Rol anon)
CREATE POLICY "Public read active catalogs" ON catalog_items
  FOR SELECT USING (active = true);

CREATE POLICY "Public read competencies" ON competencies
  FOR SELECT USING (true);

CREATE POLICY "Public read published courses" ON courses
  FOR SELECT USING (status = 'published');

CREATE POLICY "Public read active course_sessions" ON course_sessions
  FOR SELECT USING (active = true);

CREATE POLICY "Public read published modules" ON modules
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM courses WHERE courses.id = modules.course_id AND courses.status = 'published')
  );

CREATE POLICY "Public read published content_items" ON content_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM courses WHERE courses.id = content_items.course_id AND courses.status = 'published')
  );

CREATE POLICY "Public read published questions" ON questions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM courses WHERE courses.id = questions.course_id AND courses.status = 'published')
  );

-- IMPORTANTE: question_options, participants, participant_sessions, participant_answers y course_results
-- NO permiten SELECT directo al rol público anónimo para impedir que un participante consulte:
-- (a) is_correct antes de responder, o (b) datos/respuestas de otros participantes.
-- Toda validación de respuesta se ejecuta en el backend con service_role.

-- 2. Políticas de control total para Administradores autenticados / Service Role
CREATE POLICY "Admin full access admin_users" ON admin_users FOR ALL USING (auth.role() IN ('authenticated', 'service_role'));
CREATE POLICY "Admin full access catalog_items" ON catalog_items FOR ALL USING (auth.role() IN ('authenticated', 'service_role'));
CREATE POLICY "Admin full access competencies" ON competencies FOR ALL USING (auth.role() IN ('authenticated', 'service_role'));
CREATE POLICY "Admin full access courses" ON courses FOR ALL USING (auth.role() IN ('authenticated', 'service_role'));
CREATE POLICY "Admin full access course_sessions" ON course_sessions FOR ALL USING (auth.role() IN ('authenticated', 'service_role'));
CREATE POLICY "Admin full access training_materials" ON training_materials FOR ALL USING (auth.role() IN ('authenticated', 'service_role'));
CREATE POLICY "Admin full access modules" ON modules FOR ALL USING (auth.role() IN ('authenticated', 'service_role'));
CREATE POLICY "Admin full access questions" ON questions FOR ALL USING (auth.role() IN ('authenticated', 'service_role'));
CREATE POLICY "Admin full access question_options" ON question_options FOR ALL USING (auth.role() IN ('authenticated', 'service_role'));
CREATE POLICY "Admin full access question_competencies" ON question_competencies FOR ALL USING (auth.role() IN ('authenticated', 'service_role'));
CREATE POLICY "Admin full access content_items" ON content_items FOR ALL USING (auth.role() IN ('authenticated', 'service_role'));
CREATE POLICY "Admin full access participants" ON participants FOR ALL USING (auth.role() IN ('authenticated', 'service_role'));
CREATE POLICY "Admin full access participant_sessions" ON participant_sessions FOR ALL USING (auth.role() IN ('authenticated', 'service_role'));
CREATE POLICY "Admin full access participant_answers" ON participant_answers FOR ALL USING (auth.role() IN ('authenticated', 'service_role'));
CREATE POLICY "Admin full access course_results" ON course_results FOR ALL USING (auth.role() IN ('authenticated', 'service_role'));
`;
