/**
 * Firestore Security Rules Test Specification (Dirty Dozen Verification)
 * Verifies that all 12 adversarial payloads defined in security_spec.md
 * are strictly rejected with PERMISSION_DENIED by firestore.rules.
 */

export interface DirtyDozenScenario {
  id: number;
  name: string;
  collectionPath: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  authContext: {
    uid?: string;
    email?: string;
    email_verified?: boolean;
  } | null;
  payload?: Record<string, unknown>;
  expectedOutcome: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_TEST_SUITE: DirtyDozenScenario[] = [
  {
    id: 1,
    name: 'Unauthenticated Course Creation',
    collectionPath: '/courses/course-1',
    operation: 'create',
    authContext: null,
    payload: { id: 'course-1', title: 'Unauthorized Course', status: 'published' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Draft Course Scraping by Public Participant',
    collectionPath: '/courses/draft-course-1',
    operation: 'get',
    authContext: null,
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Shadow Field Injection on Course',
    collectionPath: '/courses/course-1',
    operation: 'create',
    authContext: {
      uid: 'admin-1',
      email: 'gomezramosmanuel@gmail.com',
      email_verified: true,
    },
    payload: {
      id: 'course-1',
      slug: 'ftth',
      title: 'FTTH',
      isSuperSecret: true, // Undeclared ghost field blocked by hasOnly()
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Unverified Admin Email Spoofing',
    collectionPath: '/courses/course-1',
    operation: 'delete',
    authContext: {
      uid: 'spoof-uid',
      email: 'gomezramosmanuel@gmail.com',
      email_verified: false, // Blocked by isVerifiedUser()
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Participant PII Scraping by Public User',
    collectionPath: '/participants/part-1',
    operation: 'get',
    authContext: null,
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Session Results Scraping by Public User',
    collectionPath: '/participant_sessions',
    operation: 'list',
    authContext: null,
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Self-Assigned Admin Escalation',
    collectionPath: '/admins/attacker-uid',
    operation: 'create',
    authContext: {
      uid: 'attacker-uid',
      email: 'attacker@example.com',
      email_verified: true,
    },
    payload: {
      uid: 'attacker-uid',
      email: 'attacker@example.com',
      fullName: 'Attacker',
      role: 'super_admin',
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'ID Poisoning Attack',
    collectionPath: '/courses/invalid id with spaces!',
    operation: 'create',
    authContext: {
      uid: 'admin-1',
      email: 'gomezramosmanuel@gmail.com',
      email_verified: true,
    },
    payload: { id: 'invalid id with spaces!' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Value Poisoning on Update',
    collectionPath: '/courses/course-1',
    operation: 'update',
    authContext: {
      uid: 'admin-1',
      email: 'gomezramosmanuel@gmail.com',
      email_verified: true,
    },
    payload: { passingScore: 'high' }, // Invalid type blocked by isValidPublishedCourseSummary
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Immutable Field Mutation (authorUid)',
    collectionPath: '/courses/course-1',
    operation: 'update',
    authContext: {
      uid: 'admin-1',
      email: 'gomezramosmanuel@gmail.com',
      email_verified: true,
    },
    payload: { authorUid: 'different-uid' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Timestamp Forgery on Creation',
    collectionPath: '/courses/course-1',
    operation: 'create',
    authContext: {
      uid: 'admin-1',
      email: 'gomezramosmanuel@gmail.com',
      email_verified: true,
    },
    payload: { createdAt: '1999-01-01T00:00:00Z' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Orphaned Session Creation',
    collectionPath: '/participant_sessions/sess-orphan',
    operation: 'create',
    authContext: {
      uid: 'admin-1',
      email: 'gomezramosmanuel@gmail.com',
      email_verified: true,
    },
    payload: {
      id: 'sess-orphan',
      participantId: 'non-existent-participant',
      courseId: 'non-existent-course',
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
];
