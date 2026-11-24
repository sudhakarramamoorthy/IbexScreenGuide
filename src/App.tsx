import React, { useState } from 'react';
import {
  Cloud,
  Compass,
  ExternalLink,
  FileText,
  Globe,
  HardDrive,
  LayoutGrid,
  LogIn,
  LogOut,
  Mail,
  Menu,
  Scale,
  ShoppingBag,
  TrendingDown,
  X,
} from 'lucide-react';
import { AppProvider, useApp } from './context/AppContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { CalculatorDashboard } from './components/CalculatorDashboard';
import { CatalogDirectory } from './components/CatalogDirectory';
import { ProductDetailView } from './components/ProductDetailView';
import { ComparisonDashboard } from './components/ComparisonDashboard';
import { PriceTrackerDashboard } from './components/PriceTrackerDashboard';
import { InstallerReportView } from './components/InstallerReportView';
import { QuoteBagDrawer } from './components/QuoteBagDrawer';
import { OfflineIndicator, PWAInstallButton } from './components/PWAControls';
import { SUPPORTED_LANGUAGES } from './i18n/translations';
import { SUBSTACK_NEWSLETTER_URL } from './data/projectorsIndia';
import { ActiveView, LanguageCode } from './types/projector';

const DashboardShell: React.FC = () => {
  const {
    user,
    authLoading,
    signInWithGoogle,
    signOutUser,
    activeView,
    setActiveView,
    language,
    setLanguage,
    t,
    compareIds,
    priceWatches,
    cartItems,
    setCartOpen,
    markNewsletterSubscribed,
    toast,
  } = useApp();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const totalBagCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  const navItems: {
    id: ActiveView;
    label: string;
    icon: React.FC<{ className?: string }>;
    count?: number;
  }[] = [
    { id: 'calculator', label: t.navCalculator, icon: Compass },
    { id: 'catalog', label: t.navCatalog, icon: LayoutGrid },
    { id: 'compare', label: t.navCompare, icon: Scale, count: compareIds.length || undefined },
    { id: 'tracker', label: t.navTracker, icon: TrendingDown, count: priceWatches.length || undefined },
    { id: 'report', label: t.navReport, icon: FileText },
  ];

  const activeBreadcrumb = (() => {
    switch (activeView) {
      case 'calculator':
        return t.navCalculator;
      case 'catalog':
        return t.navCatalog;
      case 'product':
        return `${t.navCatalog} / Product Specification`;
      case 'compare':
        return t.navCompare;
      case 'tracker':
        return t.navTracker;
      case 'report':
        return t.navReport;
    }
  })();

  const handleNavClick = (view: ActiveView) => {
    setActiveView(view);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      {/* Desktop Sidebar (248px) */}
      <aside className="no-print hidden lg:flex lg:flex-col lg:w-[248px] lg:fixed lg:inset-y-0 bg-white border-r border-slate-200 z-30">
        {/* Brand Zone: Single-line wordmark */}
        <div className="h-14 px-5 border-b border-slate-200 flex items-center">
          <button
            type="button"
            onClick={() => handleNavClick('calculator')}
            className="text-base font-bold tracking-tight text-slate-900 font-display whitespace-nowrap shrink-0"
          >
            {t.brandTitle}
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label="Primary navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              activeView === item.id || (activeView === 'product' && item.id === 'catalog');
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-800'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <Icon
                    className={`w-4 h-4 shrink-0 ${isActive ? 'text-blue-700' : 'text-slate-400'}`}
                  />
                  <span className="truncate">{item.label}</span>
                </span>
                {item.count !== undefined && (
                  <span className="text-xs font-mono tabular-nums text-slate-500">
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom Sidebar Utility Zone: Newsletter + PWA Install + Sync State */}
        <div className="p-4 border-t border-slate-200 space-y-3">
          <a
            href={SUBSTACK_NEWSLETTER_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              void markNewsletterSubscribed();
            }}
            className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 hover:bg-slate-100 transition-colors text-xs font-medium text-slate-800"
          >
            <span className="flex items-center gap-2 truncate">
              <Mail className="w-3.5 h-3.5 text-blue-700 shrink-0" />
              <span className="truncate">India Deals Newsletter</span>
            </span>
            <ExternalLink className="w-3 h-3 text-slate-400 shrink-0" />
          </a>

          <PWAInstallButton />

          <div className="flex items-center gap-2 px-1 text-xs text-slate-500">
            {user ? (
              <>
                <Cloud className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span className="truncate">{t.cloudSynced}</span>
              </>
            ) : (
              <>
                <HardDrive className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="truncate">{t.localOfflineMode}</span>
              </>
            )}
          </div>
        </div>
      </aside>

      {/* Mobile Slide-Over Menu */}
      {mobileMenuOpen && (
        <div className="no-print fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-72 max-w-[85vw] bg-white h-full border-r border-slate-200 flex flex-col z-10">
            <div className="h-14 px-4 border-b border-slate-200 flex items-center justify-between">
              <span className="text-base font-bold text-slate-900 font-display">
                {t.brandTitle}
              </span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close navigation menu"
                className="p-2 text-slate-500 hover:text-slate-900 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive =
                  activeView === item.id || (activeView === 'product' && item.id === 'catalog');
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNavClick(item.id)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium rounded-lg ${
                      isActive ? 'bg-blue-50 text-blue-800' : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <Icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </span>
                    {item.count !== undefined && (
                      <span className="text-xs font-mono tabular-nums text-slate-500">
                        {item.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
            <div className="p-4 border-t border-slate-200 space-y-3">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-slate-400 shrink-0" />
                <select
                  aria-label="Select Language"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as LanguageCode)}
                  className="flex-1 px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                >
                  {SUPPORTED_LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.native} ({l.label})
                    </option>
                  ))}
                </select>
              </div>
              <PWAInstallButton />
              <a
                href={SUBSTACK_NEWSLETTER_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  void markNewsletterSubscribed();
                }}
                className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-900 text-white text-xs font-medium"
              >
                <span>{t.subscribeSubstack}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-[248px] flex flex-col min-w-0">
        {/* Top Bar (Strict 1-row workspace header) */}
        <header className="no-print sticky top-0 z-20 h-14 bg-white/95 backdrop-blur border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4">
          {/* Left Zone: Mobile Menu Toggle + Contextual Breadcrumb */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-slate-900 rounded-lg"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="text-xs sm:text-sm font-medium text-slate-500 truncate">
              <span className="hidden sm:inline text-slate-400">Workspace / </span>
              <span className="text-slate-900 font-semibold">{activeBreadcrumb}</span>
            </div>
          </div>

          {/* Right Zone: Language Selector, Quote Bag, Auth CTA */}
          <div className="flex items-center gap-2.5 shrink-0">
            <label className="hidden sm:inline-flex items-center gap-1.5 text-xs text-slate-600">
              <Globe className="w-3.5 h-3.5 text-slate-400" />
              <select
                aria-label="Language"
                value={language}
                onChange={(e) => setLanguage(e.target.value as LanguageCode)}
                className="bg-transparent text-xs font-medium text-slate-700 focus:outline-none cursor-pointer pr-1"
              >
                {SUPPORTED_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.native}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <ShoppingBag className="w-3.5 h-3.5 text-blue-700" />
              <span className="hidden sm:inline">{t.quoteBag}</span>
              <span className="font-mono tabular-nums font-semibold text-slate-900">
                ({totalBagCount})
              </span>
            </button>

            {user ? (
              <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
                <span className="hidden md:inline text-xs font-medium text-slate-700 max-w-[120px] truncate">
                  {user.displayName || user.email}
                </span>
                <button
                  type="button"
                  onClick={signOutUser}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg whitespace-nowrap shrink-0"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{t.signOut}</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={authLoading}
                onClick={signInWithGoogle}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>{authLoading ? 'Signing in...' : t.signInGoogle}</span>
              </button>
            )}
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 w-full max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 pb-20 lg:pb-12">
          {activeView === 'calculator' && <CalculatorDashboard />}
          {activeView === 'catalog' && <CatalogDirectory />}
          {activeView === 'product' && <ProductDetailView />}
          {activeView === 'compare' && <ComparisonDashboard />}
          {activeView === 'tracker' && <PriceTrackerDashboard />}
          {activeView === 'report' && <InstallerReportView />}
        </main>

        {/* Quiet Editorial Footer (No telemetry tickers) */}
        <footer className="no-print border-t border-slate-200 bg-white px-6 py-4 text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-2 pb-16 lg:pb-4">
          <span>© {new Date().getFullYear()} Ibex Screen Guide · Offline-Ready Optical Tooling</span>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => handleNavClick('catalog')}
              className="hover:text-slate-900"
            >
              India Brands Master List
            </button>
            <a
              href={SUBSTACK_NEWSLETTER_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-slate-900 inline-flex items-center gap-1"
            >
              <span>Substack Newsletter</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </footer>
      </div>

      {/* Compact Mobile Bottom Nav (Strictly < 60px height to respect <=15% sticky budget) */}
      <nav
        aria-label="Mobile quick navigation"
        className="no-print lg:hidden fixed bottom-0 inset-x-0 z-30 h-14 bg-white border-t border-slate-200 grid grid-cols-5"
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            activeView === item.id || (activeView === 'product' && item.id === 'catalog');
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNavClick(item.id)}
              className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium ${
                isActive ? 'text-blue-700' : 'text-slate-500'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="truncate max-w-[68px]">{item.label.split(' ')[0]}</span>
            </button>
          );
        })}
      </nav>

      {/* Extensible E-Commerce Quote Bag Drawer */}
      <QuoteBagDrawer />

      {/* Offline Connectivity Banner */}
      <OfflineIndicator />

      {/* Lightweight Toast Notification */}
      {toast && (
        <div
          role="status"
          className="no-print fixed bottom-16 lg:bottom-5 right-5 z-50 max-w-sm bg-slate-900 text-white text-xs font-medium px-4 py-3 rounded-lg shadow-xl border border-slate-700"
        >
          {toast.text}
        </div>
      )}
    </div>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <DashboardShell />
      </AppProvider>
    </ErrorBoundary>
  );
}
