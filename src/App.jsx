import React, { useState, useEffect, useRef, useCallback, useMemo, createContext, useContext } from 'react';
import { initializeApp } from 'firebase/app';
import { getAnalytics } from "firebase/analytics";
import {
  getAuth, onAuthStateChanged, signInWithCustomToken, signInAnonymously,
  GoogleAuthProvider, signInWithPopup, signOut
} from 'firebase/auth';
import {
  getFirestore, collection, doc, setDoc, onSnapshot, deleteDoc,
  serverTimestamp, query, where
} from 'firebase/firestore';
import {
  Search, Plus, Trash2, Network, Edit3, BookOpen, Sparkles, X, Menu,
  Loader2, Save, Hash, Tag, Zap, AlertTriangle, User, LogOut, ChevronDown,
  Focus, Globe, Link2, BrainCircuit, HelpCircle, Info, Lightbulb, Compass,
  Play, ArrowRight, ArrowLeft, CheckCircle2, GripVertical, Type, Heading1,
  Heading2, List as ListIcon, CheckSquare, Code, Minus
} from 'lucide-react';

// ==========================================
// 1. FIREBASE INITIALIZATION
// ==========================================
let firebaseConfig;
const isLocalEnvironment = typeof __firebase_config === 'undefined';

if (!isLocalEnvironment) {
  firebaseConfig = JSON.parse(__firebase_config);
} else {
  firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
  };
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let analytics = null;
try { analytics = getAnalytics(app); } catch (e) { console.warn("Analytics skipped:", e); }

const activeAppId = typeof __app_id !== 'undefined' ? __app_id : "second-brain-6b47e";

import Sidebar from './components/Sidebar';
import Editor from './components/Editor';
import GraphView from './components/GraphView';
import AskAIModal from './components/AskAIModal';
import { 
  aiCache, sleep, safeParseJSONArray, normalizeResults, callNvidiaAPI, 
  generateId, extractLinks, blocksToMarkdown, markdownToBlocks, parseMarkdown 
} from './utils';

// ==========================================
// 3. CUSTOM HOOKS (Clean Code Architecture)
// ==========================================

function useAuth() {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    const initAuth = async () => {
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token && !isLocalEnvironment) {
        try { await signInWithCustomToken(auth, __initial_auth_token); }
        catch (err) { setAuthError(err.message); }
      }
      // Auto anonymous sign in removed to force LoginScreen
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (u) {
        setUser(u);
        setAuthError(null);
      } else {
        setUser(null);
      }
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const loginWithGoogle = async () => {
    setAuthError(null);
    try { await signInWithPopup(auth, new GoogleAuthProvider()); }
    catch (err) { setAuthError(err.message); }
  };

  const loginAnonymously = async () => {
    setAuthError(null);
    try { await signInAnonymously(auth); }
    catch (err) { setAuthError(err.message); }
  };

  const handleLogout = async () => {
    try { await signOut(auth); }
    catch (err) { console.error("Logout failed", err); }
  };

  return { user, isLoading, authError, setAuthError, loginWithGoogle, loginAnonymously, handleLogout };
}

function useNotes(user, setDbError) {
  const [notes, setNotes] = useState([]);

  useEffect(() => {
    if (!user) {
      setNotes([]);
      return;
    }
    const notesRef = collection(db, 'artifacts', activeAppId, 'users', user.uid, 'notes');
    const q = query(notesRef);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedNotes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      fetchedNotes.sort((a, b) => {
        const timeA = a.updatedAt?.toMillis?.() || 0;
        const timeB = b.updatedAt?.toMillis?.() || 0;
        return timeB - timeA;
      });

      setNotes(fetchedNotes);
    }, (error) => {
      console.error("Error fetching notes:", error);
      if (setDbError) setDbError(error.message);
    });

    return () => unsubscribe();
  }, [user, setDbError]);

  const createNote = useCallback(async () => {
    if (!user) return null;
    const newId = generateId();
    const newNote = {
      title: 'Untitled Note',
      content: '',
      blocks: [{ id: generateId(), type: 'p', content: '' }],
      tags: [],
      links: [],
      userId: user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    try {
      await setDoc(doc(db, 'artifacts', activeAppId, 'users', user.uid, 'notes', newId), newNote);
      return newId;
    } catch (e) {
      console.error("Error creating note:", e);
      if (setDbError) setDbError(e.message);
      return null;
    }
  }, [user, setDbError]);

  const updateNote = useCallback(async (id, data) => {
    if (!user || !id) return;
    try {
      const noteRef = doc(db, 'artifacts', activeAppId, 'users', user.uid, 'notes', id);
      await setDoc(noteRef, { ...data, updatedAt: serverTimestamp() }, { merge: true });
    } catch (e) {
      console.error("Error updating note:", e);
      if (setDbError) setDbError(e.message);
    }
  }, [user, setDbError]);

  const deleteNote = useCallback(async (id) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'artifacts', activeAppId, 'users', user.uid, 'notes', id));
    } catch (e) {
      console.error("Error deleting note:", e);
      if (setDbError) setDbError(e.message);
    }
  }, [user, setDbError]);

  return { notes, createNote, updateNote, deleteNote };
}

function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}


// ==========================================
// 4. INTERACTIVE TUTORIAL SYSTEM
// ==========================================

const TutorialContext = createContext();

const TOUR_STEPS = [
  { id: 'center', title: 'Welcome to Second Brain 🚀', content: 'Your AI-powered personal knowledge base. Let\'s take a quick 1-minute tour to supercharge your workflow!', placement: 'center' },
  { id: 'tour-new-note', title: 'Create Notes', content: 'Click here to create a new note. Everything auto-saves securely to the cloud.', placement: 'right' },
  { id: 'tour-editor', title: 'The Block Editor', content: 'We upgraded to a Notion-style Block Editor! Type / to open the command menu, use Arrow keys to navigate, and drag the 6-dot grip to reorder blocks.', placement: 'left' },
  { id: 'tour-ai-toolbar', title: 'AI Magic Toolbar', content: 'Use AI to instantly Auto-Link, Summarize, Auto-Tag, and Expand your thoughts.', placement: 'bottom' },
  { id: 'tour-search', title: 'Semantic Search', content: 'Toggle the AI Brain icon to search by meaning instead of just keywords (e.g., "fast vehicles").', placement: 'right' },
  { id: 'tour-graph-toggle', title: 'Knowledge Graph', content: 'Click here to visually explore the connections between all your notes in real-time.', placement: 'right' },
  { id: 'tour-profile', title: 'Floating Profile', content: 'Grab and drag this profile widget anywhere on your screen. Your preferences are saved automatically.', placement: 'left' },
  { id: 'center', title: 'You\'re ready! 🎉', content: 'Dive in and start building your second brain. You can restart this tour anytime from the sidebar.', placement: 'center' }
];

function TutorialProvider({ children }) {
  const [isActive, setIsActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    const completed = localStorage.getItem('tutorialCompleted');
    if (!completed) {
      const timer = setTimeout(() => setIsActive(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const startTutorial = useCallback(() => {
    setStepIndex(0);
    setIsActive(true);
  }, []);

  const stopTutorial = useCallback(() => {
    setIsActive(false);
    localStorage.setItem('tutorialCompleted', 'true');
  }, []);

  const nextStep = useCallback(() => {
    setStepIndex(prev => {
      if (prev < TOUR_STEPS.length - 1) return prev + 1;
      stopTutorial();
      return prev;
    });
  }, [stopTutorial]);

  const prevStep = useCallback(() => {
    setStepIndex(prev => prev > 0 ? prev - 1 : prev);
  }, []);

  const contextValue = useMemo(() => ({
    isActive, stepIndex, startTutorial, stopTutorial, nextStep, prevStep, steps: TOUR_STEPS
  }), [isActive, stepIndex, startTutorial, stopTutorial, nextStep, prevStep]);

  return (
    <TutorialContext.Provider value={contextValue}>
      {children}
      <TutorialOverlay />
    </TutorialContext.Provider>
  );
}

function useTutorial() {
  return useContext(TutorialContext);
}

function TutorialOverlay() {
  const { isActive, stepIndex, stopTutorial, nextStep, prevStep, steps } = useTutorial();
  const [targetRect, setTargetRect] = useState(null);
  const step = steps[stepIndex];

  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape' && isActive) stopTutorial(); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isActive, stopTutorial]);

  useEffect(() => {
    if (!isActive) return;
    const updateRect = () => {
      if (!step || step.id === 'center') {
        setTargetRect(null);
        return;
      }
      const el = document.getElementById(step.id);
      if (el) {
        const rect = el.getBoundingClientRect();
        setTargetRect(prev => {
          if (!prev || Math.abs(prev.x - rect.left) > 2 || Math.abs(prev.y - rect.top) > 2) {
            return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
          }
          return prev;
        });
      } else {
        setTargetRect(null);
      }
    };
    updateRect();
    window.addEventListener('resize', updateRect);
    const interval = setInterval(updateRect, 100);
    return () => {
      window.removeEventListener('resize', updateRect);
      clearInterval(interval);
    };
  }, [isActive, step, stepIndex]);

  if (!isActive) return null;

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  let tooltipStyle = {};
  let placementClass = "flex-col items-center justify-center inset-0";

  if (targetRect && step.id !== 'center') {
    if (isMobile) {
      placementClass = "absolute bottom-6 left-0 right-0 justify-center px-4";
      tooltipStyle = {};
    } else {
      const padding = 20;
      const tooltipW = 340;
      let left = 20;
      let top = targetRect.y;

      if (step.placement === 'right') {
        left = targetRect.x + targetRect.width + padding;
      } else if (step.placement === 'left') {
        left = targetRect.x - tooltipW - padding;
      } else if (step.placement === 'bottom') {
        left = targetRect.x + (targetRect.width / 2) - (tooltipW / 2);
        top = targetRect.y + targetRect.height + padding;
      }

      left = Math.max(16, Math.min(left, window.innerWidth - tooltipW - 16));
      top = Math.max(16, Math.min(top, window.innerHeight - 220));

      tooltipStyle = { top, left };
      placementClass = "absolute";
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] pointer-events-auto">
      <svg className="absolute inset-0 w-full h-full pointer-events-none transition-all duration-300">
        <defs>
          <mask id="tour-spotlight">
            <rect width="100%" height="100%" fill="white" />
            {targetRect && (
              <rect
                x={targetRect.x - 8} y={targetRect.y - 8}
                width={targetRect.width + 16} height={targetRect.height + 16}
                rx="12" fill="black"
                className="transition-all duration-300 ease-out"
              />
            )}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(2, 6, 23, 0.75)" mask="url(#tour-spotlight)" className="backdrop-blur-sm" />
      </svg>

      <div className="absolute inset-0" onClick={(e) => e.stopPropagation()}></div>

      <div
        className={`flex ${placementClass} transition-all duration-500 ease-out`}
        style={targetRect && step.id !== 'center' && !isMobile ? tooltipStyle : {}}
      >
        <div className="w-full max-w-[340px] bg-[#151515]/95 backdrop-blur-xl border border-indigo-500/30 shadow-[0_0_40px_rgba(99,102,241,0.2)] rounded-2xl overflow-hidden">
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold tracking-wider text-indigo-400 uppercase bg-indigo-500/10 px-2.5 py-1 rounded-md">
                Step {stepIndex + 1} of {steps.length}
              </span>
              <button onClick={stopTutorial} className="text-[#808080] hover:text-white transition-colors p-1 rounded hover:bg-[#252525]">
                <X className="w-4 h-4" />
              </button>
            </div>

            <h3 className="text-lg font-bold text-white mb-2">{step.title}</h3>
            <p className="text-sm text-[#a0a0a0] leading-relaxed">{step.content}</p>
          </div>

          <div className="p-4 border-t border-[#2f2f2f] bg-[#1a1a1a]/50 flex items-center justify-between">
            <button onClick={stopTutorial} className="text-xs font-medium text-[#606060] hover:text-[#d4d4d4] transition-colors px-2 py-1">Skip Tour</button>
            <div className="flex gap-2">
              {stepIndex > 0 && (
                <button onClick={prevStep} className="p-2 rounded-lg bg-[#252525] text-[#a0a0a0] hover:bg-[#303030] transition-colors hover:text-white">
                  <ArrowLeft className="w-4 h-4" />
                </button>
              )}
              <button onClick={nextStep} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-all shadow-lg shadow-indigo-500/20 active:scale-[0.98]">
                {stepIndex === steps.length - 1 ? 'Finish' : 'Next'}
                {stepIndex === steps.length - 1 ? <CheckCircle2 className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


// ==========================================
// 5. APP COMPONENTS
// ==========================================

function LoginScreen({ loginWithGoogle, loginAnonymously, authError, setAuthError }) {
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isGuestLoading, setIsGuestLoading] = useState(false);

  const handleGoogle = async () => {
    setIsGoogleLoading(true);
    await loginWithGoogle();
    setIsGoogleLoading(false);
  };

  const handleGuest = async () => {
    setIsGuestLoading(true);
    await loginAnonymously();
    setIsGuestLoading(false);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#191919] text-[#EBEBEB] p-4 sm:p-6 font-sans relative overflow-hidden">
      <div className="max-w-sm w-full bg-[#202020] border border-[#2f2f2f] rounded-xl p-8 shadow-2xl flex flex-col items-center z-10 mx-4">
        <div className="w-16 h-16 bg-[#2a2a2a] rounded-xl border border-[#3a3a3a] flex items-center justify-center mb-6 shadow-inner">
          <Zap className="w-8 h-8 text-neutral-300" />
        </div>

        <h2 className="text-2xl font-bold text-center mb-2 text-white tracking-tight">Second Brain</h2>
        <p className="text-[#a0a0a0] text-center mb-8 text-sm">Your AI-powered knowledge space.</p>

        <button
          onClick={handleGoogle}
          disabled={isGoogleLoading || isGuestLoading}
          className="w-full flex items-center justify-center gap-3 bg-white hover:bg-neutral-200 text-black px-4 py-3 rounded-lg font-medium transition-colors disabled:opacity-70"
        >
          {isGoogleLoading ? <Loader2 className="w-5 h-5 animate-spin text-neutral-600" /> : (
            <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" /><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" /><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" /><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg>
          )}
          Continue with Google
        </button>

        <div className="w-full flex items-center gap-4 my-5">
          <div className="h-px bg-[#2f2f2f] flex-1"></div>
          <span className="text-[10px] text-[#808080] uppercase tracking-wider font-semibold">Or</span>
          <div className="h-px bg-[#2f2f2f] flex-1"></div>
        </div>

        <button
          onClick={handleGuest}
          disabled={isGoogleLoading || isGuestLoading}
          className="w-full flex items-center justify-center gap-3 bg-[#2a2a2a] hover:bg-[#333333] text-white px-4 py-3 rounded-lg font-medium transition-colors border border-[#3a3a3a] disabled:opacity-70"
        >
          {isGuestLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <User className="w-5 h-5 text-neutral-400" />}
          Continue as Guest
        </button>

        <p className="mt-5 text-[11px] text-[#606060] text-center max-w-[260px]">No account required. Notes will be securely saved to the cloud for this guest session.</p>

        {authError && (
          <div className="mt-5 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-xs text-center w-full flex items-center justify-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" /> <span>{authError}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// Floating Profile Widget
function ProfileMenu({ user, onLogout }) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);

  const [position, setPosition] = useState({ x: window.innerWidth - 180, y: 16 });
  const [isDragging, setIsDragging] = useState(false);
  const dragInfo = useRef({ isDragging: false, startX: 0, startY: 0, offsetX: 0, offsetY: 0 });
  const didDragRef = useRef(false);

  useEffect(() => {
    const saved = localStorage.getItem('profileMenuPos');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const safeX = Math.max(16, Math.min(parsed.x, window.innerWidth - 180));
        const safeY = Math.max(16, Math.min(parsed.y, window.innerHeight - 80));
        setPosition({ x: safeX, y: safeY });
      } catch (e) { }
    } else {
      setPosition({ x: window.innerWidth - 180, y: 16 });
    }

    const handleResize = () => {
      setPosition(prev => ({
        x: Math.max(16, Math.min(prev.x, window.innerWidth - 180)),
        y: Math.max(16, Math.min(prev.y, window.innerHeight - 80))
      }));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handlePointerDown = (e) => {
    if (e.target.closest('.dropdown-menu')) return;
    didDragRef.current = false;
    const rect = menuRef.current.getBoundingClientRect();
    dragInfo.current = { isDragging: false, startX: e.clientX, startY: e.clientY, offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top };
    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
  };

  const handlePointerMove = (e) => {
    if (!dragInfo.current) return;
    const dx = Math.abs(e.clientX - dragInfo.current.startX);
    const dy = Math.abs(e.clientY - dragInfo.current.startY);

    if (!dragInfo.current.isDragging && (dx > 5 || dy > 5)) {
      dragInfo.current.isDragging = true;
      didDragRef.current = true;
      setIsDragging(true);
      setIsOpen(false);
    }

    if (dragInfo.current.isDragging) {
      let newX = e.clientX - dragInfo.current.offsetX;
      let newY = e.clientY - dragInfo.current.offsetY;
      const menuWidth = menuRef.current.offsetWidth || 150;
      const menuHeight = menuRef.current.offsetHeight || 44;
      newX = Math.max(16, Math.min(newX, window.innerWidth - menuWidth - 16));
      newY = Math.max(16, Math.min(newY, window.innerHeight - menuHeight - 16));
      setPosition({ x: newX, y: newY });
    }
  };

  const handlePointerUp = (e) => {
    if (dragInfo.current?.isDragging) {
      localStorage.setItem('profileMenuPos', JSON.stringify(position));
      setTimeout(() => { didDragRef.current = false; }, 50);
    }
    setIsDragging(false);
    dragInfo.current = null;
    document.removeEventListener('pointermove', handlePointerMove);
    document.removeEventListener('pointerup', handlePointerUp);
  };

  const toggleMenu = (e) => { if (!didDragRef.current) setIsOpen(!isOpen); };

  const isGuest = user.isAnonymous;
  const displayName = user.displayName || (isGuest ? 'Guest User' : user.email?.split('@')[0]) || 'User';
  const displayEmail = user.email || (isGuest ? 'Temporary Session' : '');
  const initial = displayName.charAt(0).toUpperCase();
  const isRightSide = position.x > window.innerWidth / 2;

  return (
    <div
      ref={menuRef} id="tour-profile"
      style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
      className={`fixed top-0 left-0 z-50 flex flex-col ${isDragging ? 'cursor-grabbing' : 'cursor-grab'} touch-none`}
      onPointerDown={handlePointerDown}
    >
      <button
        onClick={toggleMenu}
        className={`flex items-center gap-2 p-1.5 pr-3 rounded-full bg-slate-900/60 backdrop-blur-xl border border-slate-700/50 shadow-2xl transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500/50 hover:bg-slate-800/80 ${isDragging ? 'scale-105 shadow-indigo-500/20' : ''}`}
      >
        {user.photoURL && !isGuest ? (
          <img src={user.photoURL} alt="Profile" className="w-8 h-8 rounded-full bg-slate-700 pointer-events-none select-none" draggable="false" />
        ) : (
          <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-sm font-bold text-white shadow-inner pointer-events-none select-none">{initial}</div>
        )}
        <span className="text-sm font-medium text-slate-200 hidden sm:block max-w-[120px] truncate pointer-events-none select-none">{displayName}</span>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform pointer-events-none select-none ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <div className={`dropdown-menu absolute top-full mt-3 w-56 bg-slate-900/95 backdrop-blur-2xl border border-slate-700/80 rounded-xl shadow-2xl overflow-hidden transition-all ${isRightSide ? 'origin-top-right right-0' : 'origin-top-left left-0'} ${isOpen ? 'opacity-100 scale-100 visible' : 'opacity-0 scale-95 invisible'}`}>
        <div className="p-4 border-b border-slate-800/80 bg-slate-800/30">
          <p className="text-sm font-medium text-white truncate">{displayName}</p>
          <p className="text-xs text-slate-400 truncate mt-0.5">{displayEmail}</p>
        </div>

        <div className="p-1.5">
          <button onClick={onLogout} className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-red-400 hover:bg-red-500/15 hover:text-red-300 rounded-lg transition-colors text-left">
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      </div>
    </div>
  );
}


// Editor & BlockItem extracted to components/

function AboutTutorialModal({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('about');

  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
    if (isOpen) window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-[#0a0a0a]/80 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200" onClick={onClose}>
      <div
        className="bg-[#151515] border border-[#2f2f2f] rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-[0_20px_60px_-15px_rgba(0,0,0,0.7)] overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-[#2f2f2f] bg-[#1a1a1a]">
          <div className="flex space-x-1">
            <button
              onClick={() => setActiveTab('about')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'about' ? 'bg-[#252525] text-white' : 'text-[#808080] hover:text-[#EBEBEB] hover:bg-[#202020]'}`}
            >
              <Info className="w-4 h-4 inline-block mr-2 mb-0.5" /> About
            </button>
            <button
              onClick={() => setActiveTab('tutorial')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'tutorial' ? 'bg-[#252525] text-white' : 'text-[#808080] hover:text-[#EBEBEB] hover:bg-[#202020]'}`}
            >
              <Compass className="w-4 h-4 inline-block mr-2 mb-0.5" /> Tutorial
            </button>
            <button
              onClick={() => setActiveTab('developer')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'developer' ? 'bg-[#252525] text-white' : 'text-[#808080] hover:text-[#EBEBEB] hover:bg-[#202020]'}`}
            >
              <User className="w-4 h-4 inline-block mr-2 mb-0.5" /> Developer
            </button>
          </div>
          <button onClick={onClose} className="p-2 text-[#808080] hover:text-white hover:bg-[#252525] rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {activeTab === 'about' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="text-center space-y-4">
                <div className="w-20 h-20 mx-auto bg-indigo-500/10 rounded-2xl border border-indigo-500/20 flex items-center justify-center shadow-inner">
                  <Zap className="w-10 h-10 text-indigo-400" />
                </div>
                <h2 className="text-3xl font-extrabold text-white tracking-tight">Second Brain</h2>
                <p className="text-lg text-[#a0a0a0] max-w-lg mx-auto leading-relaxed">
                  Your personal thinking system — like Notion + Obsidian + AI combined.
                </p>
                <p className="text-sm text-[#606060] max-w-xl mx-auto">
                  A modern, AI-powered knowledge management system where users can store, connect, and intelligently explore their ideas in real-time.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
                <div className="bg-[#1f1f1f] border border-[#2f2f2f] rounded-xl p-4 flex items-start gap-4 hover:border-[#3a3a3a] transition-colors">
                  <Edit3 className="w-6 h-6 text-indigo-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-[#EBEBEB] font-semibold text-sm mb-1">Block Editor</h4>
                    <p className="text-[#808080] text-xs leading-relaxed">A modern Notion-style block editor. Type / for commands and drag to reorder.</p>
                  </div>
                </div>
                <div className="bg-[#1f1f1f] border border-[#2f2f2f] rounded-xl p-4 flex items-start gap-4 hover:border-[#3a3a3a] transition-colors">
                  <Link2 className="w-6 h-6 text-blue-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-[#EBEBEB] font-semibold text-sm mb-1">Bidirectional Links</h4>
                    <p className="text-[#808080] text-xs leading-relaxed">Connect thoughts using [[note]] syntax. View backlinks dynamically.</p>
                  </div>
                </div>
                <div className="bg-[#1f1f1f] border border-[#2f2f2f] rounded-xl p-4 flex items-start gap-4 hover:border-[#3a3a3a] transition-colors">
                  <Sparkles className="w-6 h-6 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-[#EBEBEB] font-semibold text-sm mb-1">AI Magic</h4>
                    <p className="text-[#808080] text-xs leading-relaxed">Auto-summarize, auto-tag, and expand your thoughts with AI.</p>
                  </div>
                </div>
                <div className="bg-[#1f1f1f] border border-[#2f2f2f] rounded-xl p-4 flex items-start gap-4 hover:border-[#3a3a3a] transition-colors">
                  <BrainCircuit className="w-6 h-6 text-purple-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-[#EBEBEB] font-semibold text-sm mb-1">Semantic Search</h4>
                    <p className="text-[#808080] text-xs leading-relaxed">Search by meaning, not just keywords. Find related ideas automatically.</p>
                  </div>
                </div>
                <div className="bg-[#1f1f1f] border border-[#2f2f2f] rounded-xl p-4 flex items-start gap-4 hover:border-[#3a3a3a] transition-colors">
                  <Network className="w-6 h-6 text-emerald-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-[#EBEBEB] font-semibold text-sm mb-1">Knowledge Graph</h4>
                    <p className="text-[#808080] text-xs leading-relaxed">Explore interactive visual clusters of your entire second brain.</p>
                  </div>
                </div>
                <div className="bg-[#1f1f1f] border border-[#2f2f2f] rounded-xl p-4 flex items-start gap-4 hover:border-[#3a3a3a] transition-colors">
                  <User className="w-6 h-6 text-rose-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-[#EBEBEB] font-semibold text-sm mb-1">Secure Auth</h4>
                    <p className="text-[#808080] text-xs leading-relaxed">Sign in with Google or as a Guest. Your data is isolated and real-time synced.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'tutorial' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">

              <div className="space-y-4 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-[#333] before:to-transparent">
                <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-[#151515] bg-indigo-500 text-white font-bold shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow">1</div>
                  <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border border-[#2f2f2f] bg-[#1f1f1f] shadow-sm">
                    <div className="flex items-center gap-2 mb-2">
                      <Edit3 className="w-4 h-4 text-indigo-400" />
                      <h4 className="font-bold text-white text-sm">Create Notes</h4>
                    </div>
                    <p className="text-xs text-[#a0a0a0] leading-relaxed">Click <b>"New Note"</b> in the sidebar. Add a title at the top and start writing in blocks.</p>
                  </div>
                </div>
                <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-[#151515] bg-blue-500 text-white font-bold shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow">2</div>
                  <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border border-[#2f2f2f] bg-[#1f1f1f] shadow-sm">
                    <div className="flex items-center gap-2 mb-2">
                      <Type className="w-4 h-4 text-blue-400" />
                      <h4 className="font-bold text-white text-sm">Block Editor Commands</h4>
                    </div>
                    <p className="text-xs text-[#a0a0a0] leading-relaxed">Type <code className="text-indigo-300">/</code> in any block to instantly convert it to a Heading, Bullet List, Checkbox, or Code Block.</p>
                  </div>
                </div>
                <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-[#151515] bg-amber-500 text-white font-bold shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow">3</div>
                  <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border border-[#2f2f2f] bg-[#1f1f1f] shadow-sm">
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles className="w-4 h-4 text-amber-400" />
                      <h4 className="font-bold text-white text-sm">Use AI Features</h4>
                    </div>
                    <p className="text-xs text-[#a0a0a0] leading-relaxed">Use the top toolbar to auto-summarize, auto-tag, auto-link, or expand your content.</p>
                  </div>
                </div>
                <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-[#151515] bg-purple-500 text-white font-bold shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow">4</div>
                  <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border border-[#2f2f2f] bg-[#1f1f1f] shadow-sm">
                    <div className="flex items-center gap-2 mb-2">
                      <BrainCircuit className="w-4 h-4 text-purple-400" />
                      <h4 className="font-bold text-white text-sm">Search Smartly</h4>
                    </div>
                    <p className="text-xs text-[#a0a0a0] leading-relaxed">Toggle the <b>AI Brain icon</b> in the search bar to find notes by meaning (e.g. "fast vehicles").</p>
                  </div>
                </div>
              </div>

              <div className="mt-8 bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-5 shadow-inner">
                <div className="flex items-center gap-2 mb-2">
                  <Lightbulb className="w-5 h-5 text-indigo-400" />
                  <h4 className="font-bold text-indigo-300 text-sm uppercase tracking-wider">Pro Tips</h4>
                </div>
                <ul className="text-sm text-indigo-200/80 space-y-2 list-disc list-inside ml-2">
                  <li>Hover over the left side of any block to <b>drag and drop</b> it.</li>
                  <li>Press <b>Backspace</b> on an empty block to delete it instantly.</li>
                  <li>Use the arrow keys (<kbd className="bg-[#2a2a2a] px-1 py-0.5 rounded text-xs border border-[#333]">↑</kbd> <kbd className="bg-[#2a2a2a] px-1 py-0.5 rounded text-xs border border-[#333]">↓</kbd>) to navigate smoothly between blocks.</li>
                </ul>
              </div>

            </div>
          )}

          {activeTab === 'developer' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="bg-[#1a1a1a] border border-[#2f2f2f] rounded-xl p-6 shadow-inner">
                <div className="flex items-center gap-4 mb-6 pb-6 border-b border-[#2f2f2f]">
                  <div className="w-16 h-16 rounded-full flex items-center justify-center border-2 border-[#404040] shadow-sm overflow-hidden">
                    <img src="https://res.cloudinary.com/dpjdnoqii/image/upload/v1765538072/20251116_122306_1_svilxg.jpg" alt="Rahul Uniyal" className="w-full h-full object-cover" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-white tracking-tight">Rahul Uniyal</h3>
                    <p className="text-indigo-400 text-sm font-medium">Full Stack Developer | MCA Student</p>
                  </div>
                </div>
                
                <div className="space-y-4 text-[#d4d4d4] text-[15px] leading-relaxed">
                  <p>Hi, I'm Rahul Uniyal, a passionate developer currently pursuing my MCA. I enjoy building practical and user-focused applications that solve real-world problems.</p>
                  <p>I have experience working with C, Python, and JavaScript, along with web technologies like HTML, CSS, and modern frameworks. I'm particularly interested in creating responsive and intuitive user interfaces combined with efficient backend logic.</p>
                  <p>Through my projects, I have developed strong problem-solving, debugging, and logical thinking skills. I'm always eager to learn new technologies and improve my development skills, especially in areas like AI integration and full-stack development.</p>
                  <p>As a developer, my goal is to create impactful and scalable solutions that are both efficient and easy to use.</p>
                </div>
                
                <div className="mt-8 pt-6 border-t border-[#2f2f2f] flex flex-col sm:flex-row gap-4">
                  <a href="mailto:gdg.arcade.rahul.290901@gmail.com?subject=Enquiry%20Regarding%20Second%20Brain&body=Hi%20Rahul,%0A%0AI%20came%20across%20your%20Second%20Brain%20project%20and%20wanted%20to%20connect%20with%20you.%0A%0A" className="flex items-center justify-center gap-2 bg-[#2a2a2a] hover:bg-[#333] border border-[#3a3a3a] text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors w-full sm:w-auto">
                    <svg className="w-4 h-4 text-[#a0a0a0]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                    Contact via Email
                  </a>
                  <a href="https://rup-nu.vercel.app/" target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 bg-[#6366f1] hover:bg-[#5255d4] text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-indigo-500/20 w-full sm:w-auto">
                    <Globe className="w-4 h-4" />
                    Visit My Portfolio
                  </a>
                </div>
                <div className="mt-4 text-xs text-[#606060] text-center sm:text-left">
                  For any complaints or enquiries: <span className="text-[#808080] select-all">gdg.arcade.rahul.290901@gmail.com</span>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

function MainApp() {
  const [dbError, setDbError] = useState(null);
  const { user, isLoading, authError, setAuthError, loginWithGoogle, loginAnonymously, handleLogout } = useAuth();
  const { notes, createNote, updateNote, deleteNote } = useNotes(user, setDbError);

  const [activeNoteId, setActiveNoteId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebounce(searchQuery, 400);
  const [isSemanticSearch, setIsSemanticSearch] = useState(false);
  const [semanticResults, setSemanticResults] = useState([]);
  const [isSearchingAI, setIsSearchingAI] = useState(false);

  const [view, setView] = useState('editor');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [isAskAIOpen, setIsAskAIOpen] = useState(false);

  const { startTutorial } = useTutorial();

  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setIsAskAIOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  useEffect(() => {
    if (!activeNoteId && notes.length > 0 && view === 'editor') {
      setActiveNoteId(notes[0].id);
    }
  }, [notes, activeNoteId, view]);

  useEffect(() => {
    const runSemanticSearch = async () => {
      if (!isSemanticSearch || !debouncedSearchQuery.trim()) {
        setSemanticResults([]); return;
      }
      setIsSearchingAI(true);
      const queryStr = debouncedSearchQuery.toLowerCase().trim();
      const cacheKey = `search_${queryStr}`;

      if (aiCache.has(cacheKey)) {
        setSemanticResults(aiCache.get(cacheKey));
        setIsSearchingAI(false); return;
      }

      try {
        const payload = notes.map(n => ({ id: n.id, title: n.title, content: (n.content || '').substring(0, 300) }));
        const prompt = `
You are an AI-powered semantic search engine inside a note-taking app.

Your job is to return the MOST RELEVANT note IDs based on meaning.

---

User Query:
"${queryStr}"

---

Available Notes:
${JSON.stringify(payload)}

Each note contains:
- id (IMPORTANT: must return this exact id)
- title
- content (short snippet)

---

Rules:

1. ONLY return valid note IDs from the input
2. NEVER return titles or text — ONLY IDs
3. Match based on MEANING, not exact words
   Example:
   - "fast vehicles" → cars, bikes, BMW, motorcycles
   - "money saving" → finance, budgeting
4. Even partial or indirect matches are allowed
5. If unsure → return best possible guesses
6. DO NOT return empty array unless NOTHING is relevant

---

STRICT OUTPUT FORMAT:

Return ONLY a JSON array:
["id1","id2","id3"]

NO explanation
NO markdown
NO extra text
ONLY JSON
`;

        const result = await callNvidiaAPI(prompt);
        const ids = safeParseJSONArray(result);
        const validIds = normalizeResults(ids, notes);

        if (validIds.length > 0) {
          aiCache.set(cacheKey, validIds);
          setSemanticResults(validIds);
        } else {
          setSemanticResults([]);
        }
      } catch (err) {
        setSemanticResults([]);
      } finally {
        setIsSearchingAI(false);
      }
    };
    runSemanticSearch();
  }, [debouncedSearchQuery, isSemanticSearch, notes]);

  const handleCreateNote = async () => {
    const newId = await createNote();
    if (newId) {
      setActiveNoteId(newId);
      setView('editor');
      if (window.innerWidth < 768) setIsSidebarOpen(false);
    }
  };

  const handleNoteSelect = (id) => {
    setActiveNoteId(id);
    setView('editor');
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  const handlePreviewClick = async (e) => {
    if (e.target.classList.contains('internal-link')) {
      e.preventDefault(); e.stopPropagation();
      const targetTitle = e.target.getAttribute('data-target');
      const existingNote = notes.find(n => n.title.toLowerCase() === targetTitle.toLowerCase());
      if (existingNote) handleNoteSelect(existingNote.id);
      else {
        const newId = await createNote();
        await updateNote(newId, { title: targetTitle });
        setActiveNoteId(newId);
      }
    }
  };

  const filteredNotes = useMemo(() => {
    if (!searchQuery) return notes;
    const lowerQ = searchQuery.toLowerCase();
    if (isSemanticSearch) {
      if (semanticResults.length > 0) {
        const mapped = semanticResults.map(id => notes.find(n => n.id === id)).filter(Boolean);
        if (mapped.length > 0) return mapped;
      }
      return notes.filter(n => n.title?.toLowerCase().includes(lowerQ) || n.content?.toLowerCase().includes(lowerQ) || n.tags?.some(t => t.toLowerCase().includes(lowerQ)));
    }
    return notes.filter(n => n.title?.toLowerCase().includes(lowerQ) || n.content?.toLowerCase().includes(lowerQ) || n.tags?.some(t => t.toLowerCase().includes(lowerQ)));
  }, [notes, searchQuery, isSemanticSearch, semanticResults]);

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-screen bg-slate-950 text-white"><Loader2 className="w-10 h-10 animate-spin text-indigo-500" /></div>;
  }

  if (!user) {
    return <LoginScreen loginWithGoogle={loginWithGoogle} loginAnonymously={loginAnonymously} authError={authError} setAuthError={setAuthError} />;
  }

  const activeNote = notes.find(n => n.id === activeNoteId);

  return (
    <div className="flex h-screen bg-slate-950 text-slate-200 overflow-hidden font-sans selection:bg-indigo-500/30 relative">
      <AboutTutorialModal isOpen={isHelpModalOpen} onClose={() => setIsHelpModalOpen(false)} />
      <AskAIModal isOpen={isAskAIOpen} onClose={() => setIsAskAIOpen(false)} notes={notes} />

      {dbError && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[100] max-w-lg w-full bg-red-600 border-2 border-red-400 text-white px-5 py-4 rounded-xl text-sm flex items-start gap-3 shadow-[0_0_40px_rgba(220,38,38,0.4)] backdrop-blur-xl">
          <AlertTriangle className="w-6 h-6 flex-shrink-0 mt-0.5 text-red-200" />
          <div className="flex-1">
            <h4 className="font-bold text-lg mb-1">Database Permission Error</h4>
            <p className="font-medium leading-relaxed break-words text-red-100 mb-3">{dbError}</p>
            <div className="bg-red-950/50 p-3 rounded-lg border border-red-500/50">
              <p className="font-bold text-sm mb-1">How to fix this right now:</p>
              <ol className="list-decimal ml-4 space-y-1 text-xs text-red-200">
                <li>Go to your Firebase Console.</li>
                <li>Click <strong>Firestore Database</strong> on the left.</li>
                <li>Click the <strong>Rules</strong> tab at the top.</li>
                <li>Change the rules to: <code className="bg-black/50 px-1 py-0.5 rounded font-mono text-white">allow read, write: if request.auth != null;</code></li>
                <li>Click <strong>Publish</strong> and refresh this page.</li>
              </ol>
            </div>
          </div>
          <button onClick={() => setDbError(null)} className="p-1.5 hover:bg-red-900/50 rounded-lg transition-colors flex-shrink-0 bg-red-800/40"><X className="w-4 h-4" /></button>
        </div>
      )}

      <ProfileMenu user={user} onLogout={handleLogout} />

      {!isSidebarOpen && (
        <div 
          onClick={() => setIsSidebarOpen(true)} 
          className="md:hidden fixed top-3 left-3 z-[60] flex items-center gap-2 cursor-pointer group px-2.5 py-1.5 bg-[#1a1a1a]/90 backdrop-blur-md rounded-lg border border-[#3a3a3a] shadow-xl hover:border-[#4f4f4f] transition-all animate-in fade-in zoom-in-95 duration-300"
          title="Open Sidebar"
        >
          <div className="w-6 h-6 bg-indigo-500 rounded flex items-center justify-center shadow-md">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold text-[14px] tracking-tight text-[#EBEBEB] group-hover:text-white">Second Brain</span>
        </div>
      )}

      <Sidebar
        isSidebarOpen={isSidebarOpen}
        setIsSidebarOpen={setIsSidebarOpen}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        isSemanticSearch={isSemanticSearch}
        setIsSemanticSearch={setIsSemanticSearch}
        isSearchingAI={isSearchingAI}
        filteredNotes={filteredNotes}
        activeNoteId={activeNoteId}
        handleCreateNote={handleCreateNote}
        handleNoteSelect={handleNoteSelect}
        deleteNote={deleteNote}
        view={view}
        setView={setView}
        startTutorial={startTutorial}
        setIsHelpModalOpen={setIsHelpModalOpen}
        setIsAskAIOpen={setIsAskAIOpen}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#191919] text-[#EBEBEB] relative selection:bg-[rgba(45,170,219,0.3)]">
        {view === 'graph' ? (
          <GraphView
            notes={notes}
            activeNoteId={activeNoteId}
            onNodeClick={handleNoteSelect}
            searchQuery={searchQuery}
            isSemanticSearch={isSemanticSearch}
            semanticResults={semanticResults}
          />
        ) : activeNote ? (
          <Editor note={activeNote} notes={notes} updateNote={updateNote} handlePreviewClick={handlePreviewClick} handleNoteSelect={handleNoteSelect} />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500 p-8 text-center animate-in fade-in duration-500">
            <div className="w-24 h-24 mb-6 rounded-full bg-slate-800/50 flex items-center justify-center border border-slate-700/50 shadow-2xl relative">
              <div className="absolute inset-0 bg-indigo-500/20 rounded-full blur-xl animate-pulse"></div>
              <Zap className="w-10 h-10 text-indigo-400 relative z-10" />
            </div>
            <h2 className="text-2xl font-bold text-slate-200 mb-2 tracking-tight">Your Second Brain</h2>
            <p className="max-w-md text-slate-400 mb-8 leading-relaxed">
              Create a new note, use <code className="bg-slate-800/80 text-indigo-300 px-1.5 py-0.5 rounded border border-slate-700/50 mx-1">[[links]]</code> to connect ideas, and explore the knowledge graph.
            </p>
            <button onClick={handleCreateNote} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-3.5 rounded-xl font-semibold transition-all shadow-lg hover:shadow-indigo-500/25 active:scale-[0.98]">
              <Plus className="w-5 h-5" /> Start Writing
            </button>
          </div>
        )}
      </div>

      {/* Global Styles */}
      <style dangerouslySetInnerHTML={{
        __html: `
        html, body { scroll-behavior: smooth; }
        .custom-scrollbar { scroll-behavior: smooth; }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; transition: background 0.3s; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #475569; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; scroll-behavior: smooth; }
        
        .block-anim { animation: blockFadeIn 0.3s ease-out forwards; }
        @keyframes blockFadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}} />
    </div>
  );
}

export default function Root() {
  return (
    <TutorialProvider>
      <MainApp />
    </TutorialProvider>
  );
}

// GraphView extracted to src/components/GraphView.jsx