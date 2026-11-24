import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from '../firebase';
import {
  ActiveView,
  LanguageCode,
  PriceWatchItem,
  RoomConfiguration,
  SavedConfiguration,
  UnitSystem,
} from '../types/projector';
import { CartItem, CommerceItemType } from '../commerce/commerceTypes';
import { getTranslations, TranslationStrings } from '../i18n/translations';
import { getProjectorById } from '../data/projectorsIndia';
import { getLowestListing } from '../utils/optics';

const LS_KEYS = {
  config: 'pgi_active_config_v1',
  savedConfigs: 'pgi_saved_configs_v1',
  priceWatches: 'pgi_price_watches_v1',
  cartItems: 'pgi_cart_items_v1',
  lang: 'pgi_language_v1',
  unit: 'pgi_unit_v1',
  compareIds: 'pgi_compare_ids_v1',
};

export const DEFAULT_ROOM_CONFIG: RoomConfiguration = {
  name: 'Living Room 110" Home Theater',
  clientName: '',
  projectLocation: 'Bengaluru, Karnataka',
  throwRatio: 1.28,
  screenWidthMeters: 2.44, // ~110 inch diagonal 16:9
  throwDistanceMeters: 3.12,
  aspectRatio: '16:9',
  lightIntensity: 'semi_lit',
  ambientLighting: 'curtains',
  surfaceFinish: 'alr_clr',
  purpose: 'all',
  indiaHeat: 'moderate_fan',
  indiaHumidity: 'moderate',
  indiaPower: 'inverter_backup',
  mountingType: 'ceiling',
  lensPresetId: 'standard-home',
  notes: '',
};

const SEED_LOCAL_WATCHES: PriceWatchItem[] = [
  {
    id: 'watch-benq-tk700sti',
    userId: 'local',
    modelId: 'benq-tk700sti',
    targetPriceInr: 148000,
    alertEnabled: true,
    notes: 'Watch for Great Indian Festival & Ooberpad dealer offers',
    createdAtIso: '2026-10-15T10:00:00.000Z',
    updatedAtIso: '2026-11-10T10:00:00.000Z',
  },
  {
    id: 'watch-epson-eh-tw6250',
    userId: 'local',
    modelId: 'epson-eh-tw6250',
    targetPriceInr: 110000,
    alertEnabled: true,
    notes: 'Living room 3LCD option',
    createdAtIso: '2026-10-20T10:00:00.000Z',
    updatedAtIso: '2026-11-12T10:00:00.000Z',
  },
  {
    id: 'watch-optoma-gt2000hdr',
    userId: 'local',
    modelId: 'optoma-gt2000hdr',
    targetPriceInr: 108000,
    alertEnabled: true,
    notes: 'IP6X sealed laser for dusty apartment room',
    createdAtIso: '2026-10-25T10:00:00.000Z',
    updatedAtIso: '2026-11-15T10:00:00.000Z',
  },
];

function sanitizeId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 120);
  return cleaned.length > 0 ? cleaned : `id-${Date.now()}`;
}

function clampString(val: string, maxLen: number): string {
  return (val || '').trim().slice(0, maxLen);
}

function clampNum(val: number, min: number, max: number): number {
  if (!Number.isFinite(val)) return min;
  return Math.max(min, Math.min(max, val));
}

function toIso(val: unknown): string {
  if (val instanceof Timestamp) {
    return val.toDate().toISOString();
  }
  if (typeof val === 'string') return val;
  return new Date().toISOString();
}

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

interface ToastMessage {
  id: string;
  text: string;
  tone: 'info' | 'success' | 'warning';
}

interface AppContextValue {
  user: User | null;
  authReady: boolean;
  authLoading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;

  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;
  selectedModelId: string;
  openProductPage: (modelId: string) => void;

  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => void;
  t: TranslationStrings;

  unit: UnitSystem;
  setUnit: (unit: UnitSystem) => void;

  config: RoomConfiguration;
  updateConfig: (patch: Partial<RoomConfiguration>) => void;
  resetConfig: () => void;

  savedConfigs: SavedConfiguration[];
  saveCurrentConfig: (customName?: string) => Promise<void>;
  loadSavedConfig: (saved: SavedConfiguration) => void;
  deleteSavedConfig: (configId: string) => Promise<void>;

  compareIds: string[];
  toggleCompareModel: (modelId: string) => void;
  clearCompare: () => void;

  priceWatches: PriceWatchItem[];
  addOrUpdatePriceWatch: (modelId: string, targetPriceInr: number, notes?: string) => Promise<void>;
  togglePriceWatchAlert: (watchId: string) => Promise<void>;
  removePriceWatch: (watchId: string) => Promise<void>;

  cartItems: CartItem[];
  cartOpen: boolean;
  setCartOpen: (open: boolean) => void;
  addToCart: (item: {
    skuId: string;
    itemType: CommerceItemType;
    title: string;
    unitPriceInr: number;
    preferredRetailer: string;
  }) => Promise<void>;
  updateCartQuantity: (itemId: string, delta: number) => Promise<void>;
  removeCartItem: (itemId: string) => Promise<void>;

  newsletterMarked: boolean;
  markNewsletterSubscribed: () => Promise<void>;

  toast: ToastMessage | null;
  showToast: (text: string, tone?: ToastMessage['tone']) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);

  const [activeView, setActiveView] = useState<ActiveView>('calculator');
  const [selectedModelId, setSelectedModelId] = useState<string>('benq-x3100i');

  const [language, setLanguageState] = useState<LanguageCode>(() =>
    loadJson<LanguageCode>(LS_KEYS.lang, 'en')
  );
  const [unit, setUnitState] = useState<UnitSystem>(() => loadJson<UnitSystem>(LS_KEYS.unit, 'ft'));

  const [config, setConfig] = useState<RoomConfiguration>(() =>
    loadJson<RoomConfiguration>(LS_KEYS.config, DEFAULT_ROOM_CONFIG)
  );
  const [savedConfigs, setSavedConfigs] = useState<SavedConfiguration[]>(() =>
    loadJson<SavedConfiguration[]>(LS_KEYS.savedConfigs, [])
  );
  const [compareIds, setCompareIds] = useState<string[]>(() =>
    loadJson<string[]>(LS_KEYS.compareIds, ['benq-x3100i', 'epson-eh-tw6250', 'optoma-uhz66'])
  );
  const [priceWatches, setPriceWatches] = useState<PriceWatchItem[]>(() =>
    loadJson<PriceWatchItem[]>(LS_KEYS.priceWatches, SEED_LOCAL_WATCHES)
  );
  const [cartItems, setCartItems] = useState<CartItem[]>(() =>
    loadJson<CartItem[]>(LS_KEYS.cartItems, [])
  );
  const [cartOpen, setCartOpen] = useState(false);
  const [newsletterMarked, setNewsletterMarked] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const showToast = useCallback((text: string, tone: ToastMessage['tone'] = 'info') => {
    const id = String(Date.now());
    setToast({ id, text, tone });
    window.setTimeout(() => {
      setToast((prev) => (prev?.id === id ? null : prev));
    }, 3400);
  }, []);

  // Persist local preferences & active calculator state offline
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEYS.config, JSON.stringify(config));
    } catch {
      // Ignore storage quota errors
    }
  }, [config]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEYS.compareIds, JSON.stringify(compareIds));
    } catch {
      // Ignore
    }
  }, [compareIds]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEYS.lang, JSON.stringify(language));
    } catch {
      // Ignore
    }
  }, [language]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEYS.unit, JSON.stringify(unit));
    } catch {
      // Ignore
    }
  }, [unit]);

  // Persist local collections when signed out
  useEffect(() => {
    if (!user) {
      try {
        localStorage.setItem(LS_KEYS.savedConfigs, JSON.stringify(savedConfigs));
        localStorage.setItem(LS_KEYS.priceWatches, JSON.stringify(priceWatches));
        localStorage.setItem(LS_KEYS.cartItems, JSON.stringify(cartItems));
      } catch {
        // Ignore
      }
    }
  }, [user, savedConfigs, priceWatches, cartItems]);

  const ensureUserProfile = useCallback(
    async (firebaseUser: User) => {
      const profilePath = `users/${firebaseUser.uid}`;
      const profileRef = doc(db, 'users', firebaseUser.uid);
      try {
        const snap = await getDoc(profileRef);
        if (!snap.exists()) {
          await setDoc(profileRef, {
            uid: firebaseUser.uid,
            displayName: clampString(firebaseUser.displayName || 'Installer User', 100) || 'User',
            email: clampString(firebaseUser.email || 'user@example.com', 200),
            preferredLanguage: language,
            preferredUnit: unit,
            newsletterSubscribed: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else {
          const data = snap.data();
          if (data.preferredLanguage) setLanguageState(data.preferredLanguage as LanguageCode);
          if (data.preferredUnit) setUnitState(data.preferredUnit as UnitSystem);
          if (typeof data.newsletterSubscribed === 'boolean') {
            setNewsletterMarked(data.newsletterSubscribed);
          }
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, profilePath);
      }
    },
    [language, unit]
  );

  // Firebase Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setAuthReady(true);
      if (firebaseUser && firebaseUser.emailVerified) {
        try {
          await ensureUserProfile(firebaseUser);
        } catch (err) {
          console.error('Profile bootstrap failed:', err);
        }
      }
    });
    return () => unsub();
  }, [ensureUserProfile]);

  // Attach cloud listeners only when authenticated & verified
  useEffect(() => {
    if (!authReady || !user || !user.emailVerified) {
      return;
    }

    const configsPath = `users/${user.uid}/configurations`;
    const watchesPath = `users/${user.uid}/priceWatches`;
    const cartPath = `users/${user.uid}/cartItems`;

    const unsubConfigs = onSnapshot(
      query(collection(db, configsPath), where('userId', '==', user.uid)),
      (snapshot) => {
        const list: SavedConfiguration[] = snapshot.docs
          .map((d) => {
            const data = d.data();
            return {
              id: d.id,
              userId: String(data.userId || user.uid),
              name: String(data.name || 'Saved Setup'),
              clientName: String(data.clientName || ''),
              projectLocation: String(data.projectLocation || ''),
              throwRatio: Number(data.throwRatio || 1.28),
              screenWidthMeters: Number(data.screenWidthMeters || 2.44),
              throwDistanceMeters: Number(data.throwDistanceMeters || 3.12),
              aspectRatio: data.aspectRatio || '16:9',
              lightIntensity: data.lightIntensity || 'semi_lit',
              ambientLighting: data.ambientLighting || 'curtains',
              surfaceFinish: data.surfaceFinish || 'alr_clr',
              purpose: data.purpose || 'all',
              indiaHeat: data.indiaHeat || 'moderate_fan',
              indiaHumidity: data.indiaHumidity || 'moderate',
              indiaPower: data.indiaPower || 'inverter_backup',
              mountingType: data.mountingType || 'ceiling',
              lensPresetId: String(data.lensPresetId || 'standard-home'),
              notes: String(data.notes || ''),
              createdAtIso: toIso(data.createdAt),
              updatedAtIso: toIso(data.updatedAt),
            };
          })
          .sort((a, b) => b.updatedAtIso.localeCompare(a.updatedAtIso));
        setSavedConfigs(list);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, configsPath);
      }
    );

    const unsubWatches = onSnapshot(
      query(collection(db, watchesPath), where('userId', '==', user.uid)),
      (snapshot) => {
        const list: PriceWatchItem[] = snapshot.docs
          .map((d) => {
            const data = d.data();
            return {
              id: d.id,
              userId: String(data.userId || user.uid),
              modelId: String(data.modelId || ''),
              targetPriceInr: Number(data.targetPriceInr || 100000),
              alertEnabled: Boolean(data.alertEnabled),
              notes: String(data.notes || ''),
              createdAtIso: toIso(data.createdAt),
              updatedAtIso: toIso(data.updatedAt),
            };
          })
          .sort((a, b) => b.updatedAtIso.localeCompare(a.updatedAtIso));
        setPriceWatches(list);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, watchesPath);
      }
    );

    const unsubCart = onSnapshot(
      query(collection(db, cartPath), where('userId', '==', user.uid)),
      (snapshot) => {
        const list: CartItem[] = snapshot.docs
          .map((d) => {
            const data = d.data();
            return {
              id: d.id,
              userId: String(data.userId || user.uid),
              skuId: String(data.skuId || ''),
              itemType: (data.itemType as CommerceItemType) || 'projector',
              title: String(data.title || ''),
              unitPriceInr: Number(data.unitPriceInr || 0),
              quantity: Number(data.quantity || 1),
              preferredRetailer: String(data.preferredRetailer || 'Amazon.in'),
              createdAtIso: toIso(data.createdAt),
              updatedAtIso: toIso(data.updatedAt),
            };
          })
          .sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso));
        setCartItems(list);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, cartPath);
      }
    );

    return () => {
      unsubConfigs();
      unsubWatches();
      unsubCart();
    };
  }, [authReady, user]);

  const signInWithGoogle = useCallback(async () => {
    setAuthLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      if (result.user) {
        await ensureUserProfile(result.user);
        showToast('Signed in and connected to cloud sync.', 'success');
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Sign-in cancelled';
      if (!msg.includes('popup-closed-by-user')) {
        showToast('Could not complete Google sign-in. Offline mode remains active.', 'warning');
      }
    } finally {
      setAuthLoading(false);
    }
  }, [ensureUserProfile, showToast]);

  const signOutUser = useCallback(async () => {
    await signOut(auth);
    setSavedConfigs(loadJson<SavedConfiguration[]>(LS_KEYS.savedConfigs, []));
    setPriceWatches(loadJson<PriceWatchItem[]>(LS_KEYS.priceWatches, SEED_LOCAL_WATCHES));
    setCartItems(loadJson<CartItem[]>(LS_KEYS.cartItems, []));
    showToast('Signed out. Local offline storage is active.', 'info');
  }, [showToast]);

  const setLanguage = useCallback(
    (lang: LanguageCode) => {
      setLanguageState(lang);
      if (user && user.emailVerified) {
        const path = `users/${user.uid}`;
        updateDoc(doc(db, 'users', user.uid), {
          preferredLanguage: lang,
          updatedAt: serverTimestamp(),
        }).catch((err) => handleFirestoreError(err, OperationType.UPDATE, path));
      }
    },
    [user]
  );

  const setUnit = useCallback(
    (newUnit: UnitSystem) => {
      setUnitState(newUnit);
      if (user && user.emailVerified) {
        const path = `users/${user.uid}`;
        updateDoc(doc(db, 'users', user.uid), {
          preferredUnit: newUnit,
          updatedAt: serverTimestamp(),
        }).catch((err) => handleFirestoreError(err, OperationType.UPDATE, path));
      }
    },
    [user]
  );

  const updateConfig = useCallback((patch: Partial<RoomConfiguration>) => {
    setConfig((prev) => {
      const next = { ...prev, ...patch };
      // Maintain exact mathematical synchronization between screenWidth, throwRatio, throwDistance
      if (patch.throwRatio !== undefined || patch.screenWidthMeters !== undefined) {
        next.throwDistanceMeters = Number((next.screenWidthMeters * next.throwRatio).toFixed(3));
      } else if (patch.throwDistanceMeters !== undefined) {
        next.throwRatio = Number(
          clampNum(next.throwDistanceMeters / Math.max(0.5, next.screenWidthMeters), 0.16, 4.0).toFixed(3)
        );
      }
      return next;
    });
  }, []);

  const resetConfig = useCallback(() => {
    setConfig(DEFAULT_ROOM_CONFIG);
    showToast('Room calibration reset to default 110" living room preset.', 'info');
  }, [showToast]);

  const openProductPage = useCallback((modelId: string) => {
    setSelectedModelId(modelId);
    setActiveView('product');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const saveCurrentConfig = useCallback(
    async (customName?: string) => {
      const id = sanitizeId(`cfg-${Date.now()}`);
      const safeName = clampString(customName || config.name || 'Project Setup', 120) || 'Project Setup';
      const nowIso = new Date().toISOString();

      if (user && user.emailVerified) {
        const docPath = `users/${user.uid}/configurations/${id}`;
        try {
          await ensureUserProfile(user);
          await setDoc(doc(db, 'users', user.uid, 'configurations', id), {
            id,
            userId: user.uid,
            name: safeName,
            clientName: clampString(config.clientName, 120),
            projectLocation: clampString(config.projectLocation, 120),
            throwRatio: clampNum(config.throwRatio, 0.15, 5.0),
            screenWidthMeters: clampNum(config.screenWidthMeters, 0.5, 12.0),
            throwDistanceMeters: clampNum(config.throwDistanceMeters, 0.1, 30.0),
            aspectRatio: config.aspectRatio,
            lightIntensity: config.lightIntensity,
            ambientLighting: config.ambientLighting,
            surfaceFinish: config.surfaceFinish,
            purpose: config.purpose,
            indiaHeat: config.indiaHeat,
            indiaHumidity: config.indiaHumidity,
            indiaPower: config.indiaPower,
            mountingType: config.mountingType,
            lensPresetId: clampString(config.lensPresetId, 64),
            notes: clampString(config.notes, 1000),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          showToast(`Saved "${safeName}" to your cloud profile.`, 'success');
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, docPath);
        }
      } else {
        const localSaved: SavedConfiguration = {
          ...config,
          id,
          userId: 'local',
          name: safeName,
          createdAtIso: nowIso,
          updatedAtIso: nowIso,
        };
        setSavedConfigs((prev) => [localSaved, ...prev]);
        showToast(`Saved "${safeName}" locally (sign in to cloud sync).`, 'success');
      }
    },
    [config, user, ensureUserProfile, showToast]
  );

  const loadSavedConfig = useCallback(
    (saved: SavedConfiguration) => {
      setConfig({
        name: saved.name,
        clientName: saved.clientName,
        projectLocation: saved.projectLocation,
        throwRatio: saved.throwRatio,
        screenWidthMeters: saved.screenWidthMeters,
        throwDistanceMeters: saved.throwDistanceMeters,
        aspectRatio: saved.aspectRatio,
        lightIntensity: saved.lightIntensity,
        ambientLighting: saved.ambientLighting,
        surfaceFinish: saved.surfaceFinish,
        purpose: saved.purpose,
        indiaHeat: saved.indiaHeat,
        indiaHumidity: saved.indiaHumidity,
        indiaPower: saved.indiaPower,
        mountingType: saved.mountingType,
        lensPresetId: saved.lensPresetId,
        notes: saved.notes,
      });
      setActiveView('calculator');
      showToast(`Loaded "${saved.name}".`, 'info');
    },
    [showToast]
  );

  const deleteSavedConfig = useCallback(
    async (configId: string) => {
      if (user && user.emailVerified) {
        const docPath = `users/${user.uid}/configurations/${configId}`;
        try {
          await deleteDoc(doc(db, 'users', user.uid, 'configurations', configId));
          showToast('Configuration removed from cloud.', 'info');
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, docPath);
        }
      } else {
        setSavedConfigs((prev) => prev.filter((c) => c.id !== configId));
        showToast('Configuration removed.', 'info');
      }
    },
    [user, showToast]
  );

  const toggleCompareModel = useCallback(
    (modelId: string) => {
      setCompareIds((prev) => {
        if (prev.includes(modelId)) {
          return prev.filter((id) => id !== modelId);
        }
        if (prev.length >= 4) {
          showToast('You can compare up to 4 projector models side by side.', 'warning');
          return prev;
        }
        const m = getProjectorById(modelId);
        showToast(`Added ${m ? `${m.brand} ${m.model}` : 'model'} to comparison.`, 'success');
        return [...prev, modelId];
      });
    },
    [showToast]
  );

  const clearCompare = useCallback(() => {
    setCompareIds([]);
  }, []);

  const addOrUpdatePriceWatch = useCallback(
    async (modelId: string, targetPriceInr: number, notes = '') => {
      const safeModelId = sanitizeId(modelId);
      const watchId = sanitizeId(`watch-${safeModelId}`);
      const safePrice = clampNum(Math.round(targetPriceInr), 5000, 5000000);
      const safeNotes = clampString(notes, 300);
      const existing = priceWatches.find((w) => w.modelId === safeModelId);
      const model = getProjectorById(safeModelId);

      if (user && user.emailVerified) {
        const docPath = `users/${user.uid}/priceWatches/${watchId}`;
        try {
          await ensureUserProfile(user);
          if (existing) {
            await updateDoc(doc(db, 'users', user.uid, 'priceWatches', existing.id), {
              targetPriceInr: safePrice,
              alertEnabled: true,
              notes: safeNotes,
              updatedAt: serverTimestamp(),
            });
          } else {
            await setDoc(doc(db, 'users', user.uid, 'priceWatches', watchId), {
              id: watchId,
              userId: user.uid,
              modelId: safeModelId,
              targetPriceInr: safePrice,
              alertEnabled: true,
              notes: safeNotes,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }
          showToast(
            `Tracking ${model ? `${model.brand} ${model.model}` : 'projector'} in cloud watchlist.`,
            'success'
          );
        } catch (err) {
          handleFirestoreError(err, existing ? OperationType.UPDATE : OperationType.CREATE, docPath);
        }
      } else {
        const nowIso = new Date().toISOString();
        setPriceWatches((prev) => {
          const filtered = prev.filter((w) => w.modelId !== safeModelId);
          return [
            {
              id: existing?.id || watchId,
              userId: 'local',
              modelId: safeModelId,
              targetPriceInr: safePrice,
              alertEnabled: true,
              notes: safeNotes,
              createdAtIso: existing?.createdAtIso || nowIso,
              updatedAtIso: nowIso,
            },
            ...filtered,
          ];
        });
        showToast(
          `Added ${model ? `${model.brand} ${model.model}` : 'projector'} to Price-Drop Tracker.`,
          'success'
        );
      }
    },
    [priceWatches, user, ensureUserProfile, showToast]
  );

  const togglePriceWatchAlert = useCallback(
    async (watchId: string) => {
      const target = priceWatches.find((w) => w.id === watchId);
      if (!target) return;

      if (user && user.emailVerified) {
        const docPath = `users/${user.uid}/priceWatches/${watchId}`;
        try {
          await updateDoc(doc(db, 'users', user.uid, 'priceWatches', watchId), {
            alertEnabled: !target.alertEnabled,
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, docPath);
        }
      } else {
        setPriceWatches((prev) =>
          prev.map((w) =>
            w.id === watchId
              ? { ...w, alertEnabled: !w.alertEnabled, updatedAtIso: new Date().toISOString() }
              : w
          )
        );
      }
    },
    [priceWatches, user]
  );

  const removePriceWatch = useCallback(
    async (watchId: string) => {
      if (user && user.emailVerified) {
        const docPath = `users/${user.uid}/priceWatches/${watchId}`;
        try {
          await deleteDoc(doc(db, 'users', user.uid, 'priceWatches', watchId));
          showToast('Removed from price tracker.', 'info');
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, docPath);
        }
      } else {
        setPriceWatches((prev) => prev.filter((w) => w.id !== watchId));
        showToast('Removed from price tracker.', 'info');
      }
    },
    [user, showToast]
  );

  const addToCart = useCallback(
    async (item: {
      skuId: string;
      itemType: CommerceItemType;
      title: string;
      unitPriceInr: number;
      preferredRetailer: string;
    }) => {
      const safeSku = sanitizeId(item.skuId);
      const itemId = sanitizeId(`bag-${safeSku}`);
      const existing = cartItems.find((c) => c.skuId === safeSku);
      const safePrice = clampNum(Math.round(item.unitPriceInr), 500, 5000000);
      const safeTitle = clampString(item.title, 140) || 'Projector Item';
      const safeRetailer = clampString(item.preferredRetailer, 80) || 'Amazon.in';

      if (user && user.emailVerified) {
        const docPath = `users/${user.uid}/cartItems/${existing?.id || itemId}`;
        try {
          await ensureUserProfile(user);
          if (existing) {
            await updateDoc(doc(db, 'users', user.uid, 'cartItems', existing.id), {
              quantity: clampNum(existing.quantity + 1, 1, 25),
              unitPriceInr: safePrice,
              preferredRetailer: safeRetailer,
              updatedAt: serverTimestamp(),
            });
          } else {
            await setDoc(doc(db, 'users', user.uid, 'cartItems', itemId), {
              id: itemId,
              userId: user.uid,
              skuId: safeSku,
              itemType: item.itemType,
              title: safeTitle,
              unitPriceInr: safePrice,
              quantity: 1,
              preferredRetailer: safeRetailer,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }
          showToast(`Added "${safeTitle}" to Quote Bag.`, 'success');
        } catch (err) {
          handleFirestoreError(err, existing ? OperationType.UPDATE : OperationType.CREATE, docPath);
        }
      } else {
        const nowIso = new Date().toISOString();
        setCartItems((prev) => {
          if (existing) {
            return prev.map((c) =>
              c.id === existing.id
                ? { ...c, quantity: clampNum(c.quantity + 1, 1, 25), updatedAtIso: nowIso }
                : c
            );
          }
          return [
            {
              id: itemId,
              userId: 'local',
              skuId: safeSku,
              itemType: item.itemType,
              title: safeTitle,
              unitPriceInr: safePrice,
              quantity: 1,
              preferredRetailer: safeRetailer,
              createdAtIso: nowIso,
              updatedAtIso: nowIso,
            },
            ...prev,
          ];
        });
        showToast(`Added "${safeTitle}" to Quote Bag.`, 'success');
      }
    },
    [cartItems, user, ensureUserProfile, showToast]
  );

  const updateCartQuantity = useCallback(
    async (itemId: string, delta: number) => {
      const target = cartItems.find((c) => c.id === itemId);
      if (!target) return;
      const nextQty = target.quantity + delta;
      if (nextQty <= 0) {
        if (user && user.emailVerified) {
          const docPath = `users/${user.uid}/cartItems/${itemId}`;
          try {
            await deleteDoc(doc(db, 'users', user.uid, 'cartItems', itemId));
          } catch (err) {
            handleFirestoreError(err, OperationType.DELETE, docPath);
          }
        } else {
          setCartItems((prev) => prev.filter((c) => c.id !== itemId));
        }
        return;
      }

      const clamped = clampNum(nextQty, 1, 25);
      if (user && user.emailVerified) {
        const docPath = `users/${user.uid}/cartItems/${itemId}`;
        try {
          await updateDoc(doc(db, 'users', user.uid, 'cartItems', itemId), {
            quantity: clamped,
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, docPath);
        }
      } else {
        setCartItems((prev) =>
          prev.map((c) =>
            c.id === itemId ? { ...c, quantity: clamped, updatedAtIso: new Date().toISOString() } : c
          )
        );
      }
    },
    [cartItems, user]
  );

  const removeCartItem = useCallback(
    async (itemId: string) => {
      if (user && user.emailVerified) {
        const docPath = `users/${user.uid}/cartItems/${itemId}`;
        try {
          await deleteDoc(doc(db, 'users', user.uid, 'cartItems', itemId));
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, docPath);
        }
      } else {
        setCartItems((prev) => prev.filter((c) => c.id !== itemId));
      }
    },
    [user]
  );

  const markNewsletterSubscribed = useCallback(async () => {
    setNewsletterMarked(true);
    if (user && user.emailVerified) {
      const path = `users/${user.uid}`;
      try {
        await updateDoc(doc(db, 'users', user.uid), {
          newsletterSubscribed: true,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, path);
      }
    }
    showToast('Newsletter preference saved. Complete signup on Substack.', 'success');
  }, [user, showToast]);

  const t = useMemo(() => getTranslations(language), [language]);

  const value = useMemo<AppContextValue>(
    () => ({
      user,
      authReady,
      authLoading,
      signInWithGoogle,
      signOutUser,
      activeView,
      setActiveView,
      selectedModelId,
      openProductPage,
      language,
      setLanguage,
      t,
      unit,
      setUnit,
      config,
      updateConfig,
      resetConfig,
      savedConfigs,
      saveCurrentConfig,
      loadSavedConfig,
      deleteSavedConfig,
      compareIds,
      toggleCompareModel,
      clearCompare,
      priceWatches,
      addOrUpdatePriceWatch,
      togglePriceWatchAlert,
      removePriceWatch,
      cartItems,
      cartOpen,
      setCartOpen,
      addToCart,
      updateCartQuantity,
      removeCartItem,
      newsletterMarked,
      markNewsletterSubscribed,
      toast,
      showToast,
    }),
    [
      user,
      authReady,
      authLoading,
      signInWithGoogle,
      signOutUser,
      activeView,
      selectedModelId,
      openProductPage,
      language,
      setLanguage,
      t,
      unit,
      setUnit,
      config,
      updateConfig,
      resetConfig,
      savedConfigs,
      saveCurrentConfig,
      loadSavedConfig,
      deleteSavedConfig,
      compareIds,
      toggleCompareModel,
      clearCompare,
      priceWatches,
      addOrUpdatePriceWatch,
      togglePriceWatchAlert,
      removePriceWatch,
      cartItems,
      cartOpen,
      addToCart,
      updateCartQuantity,
      removeCartItem,
      newsletterMarked,
      markNewsletterSubscribed,
      toast,
      showToast,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}

export function getSuggestedTargetPrice(modelId: string): number {
  const m = getProjectorById(modelId);
  if (!m) return 100000;
  const lowest = getLowestListing(m).priceInr;
  return Math.round((lowest * 0.95) / 500) * 500;
}
