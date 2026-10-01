export type RetryPolicy = 'continue' | 'new_attempt' | 'single_attempt';

export type CourseStatus = 'draft' | 'published' | 'archived';

export type ContentType =
  | 'title'
  | 'text'
  | 'image'
  | 'video'
  | 'highlight'
  | 'instructions'
  | 'steps'
  | 'question'
  | 'case_study'
  | 'evaluation';

export type QuestionType =
  | 'single_choice'
  | 'multiple_choice'
  | 'true_false'
  | 'image_choice'
  | 'order_steps';

export type DifficultyLevel = 'Básico' | 'Intermedio' | 'Avanzado';

export type SessionStatus =
  | 'Registrado'
  | 'En progreso'
  | 'Finalizado'
  | 'Aprobado'
  | 'Requiere refuerzo'
  | 'Abandonado';

export type CatalogType = 'area' | 'role' | 'category';

export interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  role: string;
  created_at: string;
  updated_at: string;
}

export interface CatalogItem {
  id: string;
  type: CatalogType;
  name: string;
  code: string;
  active: boolean;
  created_at: string;
  updated_at?: string;
}

export interface Competency {
  id: string;
  code: string;
  name: string;
  description: string;
  category: string;
  created_at: string;
  updated_at: string;
}

export interface CourseSessionCohort {
  id: string;
  course_id: string;
  cohort_name: string;
  public_slug: string;
  active: boolean;
  starts_at: string;
  ends_at?: string;
  created_at: string;
  updated_at: string;
}

export type ReferenceMaterialFormat =
  | 'pdf'
  | 'document'
  | 'presentation'
  | 'spreadsheet'
  | 'text'
  | 'image'
  | 'audio'
  | 'video';

export type MaterialProcessingStatus =
  | 'PENDIENTE'
  | 'PROCESANDO'
  | 'PROCESADO'
  | 'ERROR';

export type ExtractedImageCategory =
  | 'FOTOGRAFÍA'
  | 'DIAGRAMA'
  | 'ESQUEMA'
  | 'ILUSTRACIÓN'
  | 'TABLA'
  | 'GRÁFICO'
  | 'CAPTURA'
  | 'LOGO'
  | 'OTRO';

export type SlideMediaSourceType =
  | 'material_reference'
  | 'manual_upload'
  | 'auto_schematic';

export interface ClassifiedMaterialImage {
  id: string;
  source_material_id?: string;
  source_file_name: string;
  page_number?: number;
  source_section?: string;
  image_url: string;
  category: ExtractedImageCategory;
  title?: string;
  caption: string;
  description?: string;
  related_topic: string;
  related_module?: string;
  keywords?: string[];
  associated_concepts?: string[];
  width?: number;
  height?: number;
  is_cover_candidate: boolean;
  is_primary_pedagogical: boolean;
  is_educational_priority?: boolean;
  is_discarded?: boolean;
  discard_reason?: string;
}

export interface ExtractedMaterialPage {
  page_number: number;
  title: string;
  bullets: string[];
  raw_text: string;
  image_data_url?: string;
  additional_images?: string[];
  image_caption?: string;
  image_category?: ExtractedImageCategory;
  image_width?: number;
  image_height?: number;
  keywords?: string[];
}

export type GeminiProvenanceOrigin = 'DOCUMENTO' | 'GENERADO_IA';

export interface GeminiTraceableItem {
  id?: string;
  title: string;
  description: string;
  origin: GeminiProvenanceOrigin;
  page?: number;
  section?: string;
  sourceExcerpt?: string;
}

export interface GeminiAnalyzedDefinition {
  id?: string;
  term: string;
  definition: string;
  origin: GeminiProvenanceOrigin;
  page?: number;
  section?: string;
  sourceExcerpt?: string;
}

export interface GeminiAnalyzedProcedure {
  id?: string;
  title: string;
  description: string;
  steps: string[];
  origin: GeminiProvenanceOrigin;
  page?: number;
  section?: string;
  sourceExcerpt?: string;
}

export interface GeminiSuggestedActivity {
  id?: string;
  title: string;
  type: string;
  description: string;
  origin: GeminiProvenanceOrigin;
  relatedTopic?: string;
  page?: number;
  section?: string;
  sourceExcerpt?: string;
}

export interface GeminiSuggestedEvaluation {
  id?: string;
  questionPrompt: string;
  evaluationType: string;
  expectedAnswerSummary: string;
  origin: GeminiProvenanceOrigin;
  page?: number;
  section?: string;
  sourceExcerpt?: string;
}

export interface GeminiStructuredMaterialAnalysis {
  documentTitle: string;
  summary: string;
  topics: GeminiTraceableItem[];
  subtopics: GeminiTraceableItem[];
  keyConcepts: GeminiTraceableItem[];
  definitions: GeminiAnalyzedDefinition[];
  procedures: GeminiAnalyzedProcedure[];
  steps: string[];
  examples: GeminiTraceableItem[];
  bestPractices: GeminiTraceableItem[];
  commonMistakes: GeminiTraceableItem[];
  learningObjectives: GeminiTraceableItem[];
  difficulty: DifficultyLevel;
  suggestedActivities: GeminiSuggestedActivity[];
  suggestedEvaluations: GeminiSuggestedEvaluation[];
  sourceFileName?: string;
  modelUsed?: string;
  analyzedAt?: string;
  approvedByTrainer?: boolean;
  approvedAt?: string;
}

export interface MaterialAnalysisSummary {
  detected_title?: string;
  detected_category?: string;
  document_summary: string;
  summary?: string;
  key_concepts: string[];
  detected_procedures: string[];
  learning_objectives?: string[];
  identified_competencies?: string[];
  warnings_and_best_practices?: string[];
  real_cases_found: string[];
  character_count: number;
  page_count?: number;
  extracted_images_count?: number;
  discarded_decorative_count?: number;
  extraction_method: string;
}

export interface CourseAiAnalysisSummary {
  document_summary: string;
  executive_summary?: string;
  extracted_topics: string[];
  key_facts_and_norms: string[];
  learning_objectives?: string[];
  identified_competencies?: string[];
  identified_procedures?: string[];
  classified_images?: ClassifiedMaterialImage[];
  discarded_images_count?: number;
  cover_candidates?: ClassifiedMaterialImage[];
  total_theory_slides: number;
  total_evaluative_questions: number;
  total_practical_cases: number;
  generated_at: string;
  source_files: string[];
}

export interface TrainingMaterial {
  id: string;
  course_id: string;
  title: string;
  file_type: ReferenceMaterialFormat;
  file_name: string;
  file_size_kb: number;
  mime_type?: string;
  media_data_url?: string;
  persistent_file_url?: string;
  storage_path: string;
  processing_status?: MaterialProcessingStatus;
  processing_error?: string;
  uploaded_by?: string;
  uploaded_by_admin?: string;
  extracted_text: string;
  extracted_pages?: ExtractedMaterialPage[];
  extracted_images?: ClassifiedMaterialImage[];
  classified_images?: ClassifiedMaterialImage[];
  analysis_summary?: MaterialAnalysisSummary;
  gemini_analysis?: GeminiStructuredMaterialAnalysis;
  uploaded_at: string;
  created_at?: string;
  updated_at?: string;
}

export interface ModuleStudyCard {
  id: string;
  card_number?: string;
  category_tag?: string;
  category?: string;
  title: string;
  summary: string;
  key_points: string[];
  technical_parameters?: Array<{ label: string; value: string }>;
  field_tip?: string;
  warning_note?: string;
  image_url?: string;
  source_file_name?: string;
  source_page_number?: number;
}

export interface QuestionOption {
  id: string;
  question_id: string;
  label: string;
  text: string;
  image_url?: string;
  step_order?: number;
  rationale?: string;
  is_correct?: boolean; // Stripped on public participant endpoints before answering
  created_at?: string;
  updated_at?: string;
}

export interface QuestionCompetencyLink {
  id: string;
  question_id: string;
  competency_id: string;
  weight: number;
  created_at: string;
}

export interface Question {
  id: string;
  course_id: string;
  module_id: string;
  competency_id: string;
  competency_name?: string;
  question_type: QuestionType;
  prompt: string;
  case_study_situation?: string;
  case_study_description?: string;
  case_study_image_url?: string;
  options: QuestionOption[];
  explanation: string;
  explanation_correct?: string;
  explanation_incorrect?: string;
  correct_concept: string;
  recommendation: string;
  related_content_id?: string;
  related_item_id?: string;
  difficulty: DifficultyLevel;
  points: number;
  max_attempts: number;
  order_index: number;
  created_at: string;
  updated_at: string;
}

export interface StepItem {
  step_number: number;
  title: string;
  description: string;
  critical_note?: string;
}

export interface InteractiveSelectableCard {
  id: string;
  title: string;
  badge?: string;
  detail: string;
  icon_hint?: string;
}

export interface InteractiveAccordionItem {
  id: string;
  title: string;
  content: string;
  critical?: boolean;
  tag?: string;
}

export interface InteractiveHotspot {
  id: string;
  label: string;
  x_pct?: number;
  y_pct?: number;
  x_percent?: number;
  y_percent?: number;
  title?: string;
  description: string;
}

export interface InteractiveComparisonRow {
  criterion: string;
  option_a: string;
  option_b: string;
}

export interface InteractiveComparisonBlock {
  left_title: string;
  right_title: string;
  left_points: string[];
  right_points: string[];
}

export interface ContentItem {
  id: string;
  course_id?: string;
  module_id?: string;
  type?: string;
  content_type: ContentType;
  title: string;
  subtitle?: string;
  objective?: string;
  body?: string;
  media_url?: string;
  media_caption?: string;
  media_classification?: ExtractedImageCategory;
  image_category?: ExtractedImageCategory;
  media_source_type?: SlideMediaSourceType;
  media_source_file?: string;
  media_source_page?: number;
  media_source_section?: string;
  media_keywords?: string[];
  highlight_note?: string;
  steps?: StepItem[];
  technical_specs?: Array<{ label: string; value: string }>;
  study_notes?: string[];
  interaction_type?:
    | 'selectable_cards'
    | 'accordion'
    | 'hotspots'
    | 'comparison'
    | 'checklist';
  selectable_cards?: InteractiveSelectableCard[];
  accordion_items?: InteractiveAccordionItem[];
  hotspots?: InteractiveHotspot[];
  comparison_headers?: [string, string, string];
  comparison_rows?: InteractiveComparisonRow[];
  comparison?: InteractiveComparisonBlock;
  question_id?: string;
  question?: Question;
  order_index?: number;
  estimated_seconds: number;
  created_at?: string;
  updated_at?: string;
}

export interface CourseModule {
  id: string;
  course_id: string;
  module_number?: number;
  title: string;
  description: string;
  learning_objective?: string;
  order_index: number;
  study_cards?: ModuleStudyCard[];
  items: ContentItem[];
  created_at?: string;
  updated_at?: string;
}

export interface Course {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  estimated_minutes: number;
  level: DifficultyLevel;
  cover_image_url: string;
  suggested_cover_images?: ClassifiedMaterialImage[];
  passing_score: number; // Percentage 0-100
  retry_policy: RetryPolicy;
  status: CourseStatus;
  ai_generated_draft?: boolean;
  ai_analysis_summary?: CourseAiAnalysisSummary;
  gemini_analysis?: GeminiStructuredMaterialAnalysis;
  approved_by?: string;
  published_at?: string;
  modules: CourseModule[];
  materials: TrainingMaterial[];
  created_at: string;
  updated_at: string;
}

export interface Participant {
  id: string;
  full_name: string;
  identification_number: string;
  area: string;
  role: string;
  created_at: string;
  updated_at: string;
}

export interface ParticipantSession {
  id: string;
  session_code: string;
  participant_id: string;
  course_id: string;
  attempt_number: number;
  current_slide_index: number;
  total_slides: number;
  progress_percentage: number;
  score_obtained: number;
  max_possible_score: number;
  score_percentage: number;
  status: SessionStatus;
  started_at: string;
  finished_at?: string;
  total_duration_seconds: number;
  created_at: string;
  updated_at: string;
}

export interface ParticipantAnswer {
  id: string;
  session_id: string;
  participant_id: string;
  course_id: string;
  module_id: string;
  question_id: string;
  competency_id: string;
  selected_option_ids: string[];
  selected_answer_text: string;
  correct_answer_text: string;
  is_correct: boolean;
  attempt_number: number;
  points_obtained: number;
  max_points: number;
  response_duration_seconds: number;
  answered_at: string;
}

export interface CourseResult {
  id: string;
  session_id: string;
  participant_id: string;
  course_id: string;
  final_percentage: number;
  passed: boolean;
  status: SessionStatus;
  top_strength_competency?: string;
  top_gap_competency?: string;
  strengths_list?: string[];
  improvements_list?: string[];
  completed_at: string;
}

export interface GapThresholdConfig {
  goodMin: number; // Default 80 (Verde >= 80%)
  warningMin: number; // Default 65 (Amarillo 65-79%, Rojo < 65%)
}

export interface AnswerSubmissionFeedback {
  is_correct: boolean;
  status_label?: string;
  attempt_number: number;
  max_attempts: number;
  attempts_remaining: number;
  points_earned: number;
  max_points: number;
  why_explanation?: string;
  explanation: string;
  correct_concept: string;
  recommendation: string;
  selected_answer_text?: string;
  correct_answer_text: string;
  correct_option_ids?: string[];
  option_rationales?: Record<string, string>;
  related_content_id?: string;
}

export interface NormalizedTablesSummary {
  admin_users: number;
  catalog_items: number;
  competencies: number;
  courses: number;
  course_sessions: number;
  training_materials: number;
  modules: number;
  content_items: number;
  questions: number;
  question_options: number;
  question_competencies: number;
  participants: number;
  participant_sessions: number;
  participant_answers: number;
  course_results: number;
}
