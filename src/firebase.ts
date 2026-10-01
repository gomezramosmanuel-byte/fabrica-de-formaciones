import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDocFromServer,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import firebaseConfig from './firebase-applet-config.json';
import { Course } from './types/lms.ts';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

testConnection();

export async function signInAdminWithGoogle(): Promise<{
  user: User;
  idToken: string;
}> {
  const credential = await signInWithPopup(auth, googleProvider);
  const idToken = await credential.user.getIdToken();
  return { user: credential.user, idToken };
}

export const signInWithGoogleAdmin = signInAdminWithGoogle;

export async function signOutFirebaseAdmin(): Promise<void> {
  await firebaseSignOut(auth);
}

export const signOutAdmin = signOutFirebaseAdmin;

export { onAuthStateChanged };
export type { User };

/**
 * Synchronizes a course summary to Firestore `/courses/{courseId}` when an administrator
 * is authenticated via Firebase Auth, adhering strictly to `firebase-blueprint.json` bounds.
 */
export async function syncCourseSummaryToFirestore(course: Course): Promise<void> {
  if (!auth.currentUser) return;
  const safeId = course.id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);
  const safeSlug = (course.slug || 'capacitacion')
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .slice(0, 128);
  const rawCover = course.cover_image_url || 'https://claro.com.co/portada.svg';
  const safeCoverUrl =
    rawCover.startsWith('data:') && rawCover.length > 50000
      ? 'https://claro.com.co/portada.svg'
      : rawCover.slice(0, 190000);
  try {
    await setDoc(doc(db, 'courses', safeId), {
      id: safeId,
      slug: safeSlug,
      title: (course.title || 'Capacitación Técnica').slice(0, 200),
      description: (course.description || 'Experiencia formativa').slice(0, 2000),
      category: (course.category || 'General').slice(0, 120),
      level: ['Básico', 'Intermedio', 'Avanzado'].includes(course.level)
        ? course.level
        : 'Intermedio',
      estimatedMinutes: Math.max(1, Math.min(600, Number(course.estimated_minutes) || 25)),
      totalModules: Math.max(1, Math.min(100, course.modules?.length || 1)),
      passingScore: Math.max(0, Math.min(100, Number(course.passing_score) || 80)),
      status: ['draft', 'published', 'archived'].includes(course.status)
        ? course.status
        : 'draft',
      coverImageUrl: safeCoverUrl,
      authorUid: auth.currentUser.uid.slice(0, 128),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.warn('Firestore course summary sync skipped:', error);
  }
}

export const syncCourseToFirestore = syncCourseSummaryToFirestore;

export async function removeCourseSummaryFromFirestore(courseId: string): Promise<void> {
  if (!auth.currentUser) return;
  const safeId = courseId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);
  try {
    await deleteDoc(doc(db, 'courses', safeId));
  } catch (error) {
    console.warn('Firestore course summary delete skipped:', error);
  }
}

export const deleteCourseFromFirestore = removeCourseSummaryFromFirestore;
