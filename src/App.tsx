import React, { useState, useEffect } from 'react';
import { Header, NavSection } from './components/Header';
import { MobileNav } from './components/MobileNav';
import { UploadDropzone } from './components/UploadDropzone';
import { PublishPanel } from './components/PublishPanel';
import { MultiPublishPanel } from './components/MultiPublishPanel';
import { DocumentViewer } from './components/DocumentViewer';
import { MyDocumentsPage } from './components/MyDocumentsPage';
import { DevicesPage } from './components/DevicesPage';
import { IncomingTransferModal } from './components/IncomingTransferModal';
import { SignInPage } from './components/SignInPage';
import { useAuth } from './context/AuthContext';
import { startServerKeepAlive } from './lib/api';
import { navigateToDevices } from './lib/nav';
import { Logo } from './components/Logo';
import { ErrorBoundary } from './components/ErrorBoundary';
import { UploadResponse } from './types';
import { Zap, Lock, Eye, Smartphone, ArrowRight } from 'lucide-react';
import { uploadFile, uploadBundle, uploadMultipleSeparate } from './lib/api';

export default function App() {
  const [currentSlug, setCurrentSlug] = useState<string | null>(null);
  const [activeUpload, setActiveUpload] = useState<UploadResponse | null>(null);
  const [multiUploads, setMultiUploads] = useState<UploadResponse[] | null>(null);
  const [isDocumentsRoute, setIsDocumentsRoute] = useState(false);
  const [isDevicesRoute, setIsDevicesRoute] = useState(false);
  const [sampleLoading, setSampleLoading] = useState(false);
  const [isSignInRoute, setIsSignInRoute] = useState(false);
  const { user, isGuest, loading: authLoading } = useAuth();

  // Wake the (free-tier) server right away and poll it every 14 minutes while the site is open
  useEffect(() => startServerKeepAlive(), []);

  // Parse path on initial load or popstate
  useEffect(() => {
    const parseUrl = () => {
      const path = window.location.pathname;
      const searchParams = new URLSearchParams(window.location.search);
      const querySlug = searchParams.get('d');

      if (path === '/signin') {
        setIsSignInRoute(true);
        setIsDocumentsRoute(false);
        setIsDevicesRoute(false);
        setCurrentSlug(null);
        setActiveUpload(null);
        setMultiUploads(null);
        return;
      }
      setIsSignInRoute(false);

      if (path === '/documents') {
        setIsDocumentsRoute(true);
        setIsDevicesRoute(false);
        setCurrentSlug(null);
        setActiveUpload(null);
        setMultiUploads(null);
        return;
      }
      setIsDocumentsRoute(false);

      if (path === '/devices') {
        setIsDevicesRoute(true);
        setCurrentSlug(null);
        setActiveUpload(null);
        setMultiUploads(null);
        return;
      }
      setIsDevicesRoute(false);

      if (querySlug) {
        setCurrentSlug(querySlug);
        setActiveUpload(null);
        setMultiUploads(null);
        return;
      }

      if (path.startsWith('/d/')) {
        const slug = path.replace(/^\/d\//, '').split('?')[0];
        if (slug) {
          setCurrentSlug(decodeURIComponent(slug));
          setActiveUpload(null);
          setMultiUploads(null);
          return;
        }
      }

      // Default home
      setCurrentSlug(null);
    };

    parseUrl();
    window.addEventListener('popstate', parseUrl);
    return () => window.removeEventListener('popstate', parseUrl);
  }, []);

  const navigateToDocuments = () => {
    setIsSignInRoute(false);
    setIsDevicesRoute(false);
    setIsDocumentsRoute(true);
    setCurrentSlug(null);
    setActiveUpload(null);
    setMultiUploads(null);
    window.history.pushState({}, '', '/documents');
    window.scrollTo({ top: 0 });
  };

  const navigateToSlug = (slug: string) => {
    setIsSignInRoute(false);
    setIsDocumentsRoute(false);
    setIsDevicesRoute(false);
    setCurrentSlug(slug);
    setActiveUpload(null);
    setMultiUploads(null);
    window.history.pushState({}, '', `/d/${slug}`);
  };

  const navigateHome = () => {
    setIsSignInRoute(false);
    setIsDocumentsRoute(false);
    setIsDevicesRoute(false);
    setCurrentSlug(null);
    setActiveUpload(null);
    setMultiUploads(null);
    window.history.pushState({}, '', '/');
  };

  const handleUploadSuccess = (res: UploadResponse) => {
    setIsDocumentsRoute(false);
    setIsDevicesRoute(false);
    setActiveUpload(res);
    setMultiUploads(null);
    setCurrentSlug(null);
  };

  const handleMultiUploadSuccess = (responses: UploadResponse[]) => {
    if (responses.length === 1) {
      setActiveUpload(responses[0]);
      setMultiUploads(null);
    } else {
      setMultiUploads(responses);
      setActiveUpload(null);
    }
    setCurrentSlug(null);
  };

  // Quick helper to upload a sample document or folder for instant testing
  const handleUploadSample = async (type: 'markdown' | 'txt' | 'csv' | 'folder' | 'multiple') => {
    setSampleLoading(true);

    if (type === 'multiple') {
      const docA = new File(
        [`# Marketing Strategy 2026\n\nQuarterly goals, customer segments, and growth funnels.\n`],
        'Marketing-Strategy.md',
        { type: 'text/markdown' }
      );
      const docB = new File(
        [`Metric,Value\nVisitors,45000\nSignups,3200\nConversionRate,7.1%\n`],
        'Analytics-Metrics.csv',
        { type: 'text/csv' }
      );
      const docC = new File(
        [JSON.stringify({ project: 'MakeTransfer', mode: 'multi-link', active: true }, null, 2)],
        'api-config.json',
        { type: 'application/json' }
      );

      try {
        const results = await uploadMultipleSeparate([docA, docB, docC]);
        handleMultiUploadSuccess(results);
      } catch (e: any) {
        alert(e.message || 'Multi upload failed');
      } finally {
        setSampleLoading(false);
      }
      return;
    }

    if (type === 'folder') {
      const readme = new File(
        [
          `# 🚀 NextGen Analytics Engine\n\nA full-stack toolkit for real-time document indexing, edge caching, and collaborative sharing.\n\n## 📦 Directory Structure\n- \`src/index.ts\`: Core entry point and Express router\n- \`src/config.json\`: Environment configs\n- \`docs/architecture.md\`: High-level system overview\n- \`data/sample-metrics.csv\`: Metric benchmarks\n`
        ],
        'README.md',
        { type: 'text/markdown' }
      );

      const codeFile = new File(
        [
          `import express from 'express';\n\nconst app = express();\nconst PORT = process.env.PORT || 8080;\n\napp.get('/api/health', (req, res) => {\n  res.json({ status: 'ok', uptime: process.uptime() });\n});\n\napp.listen(PORT, () => {\n  console.log(\`Engine listening on port \${PORT}\`);\n});\n`
        ],
        'index.ts',
        { type: 'text/plain' }
      );

      const configFile = new File(
        [
          JSON.stringify(
            {
              environment: 'production',
              version: '2.4.0',
              compression: 'gzip',
              maxConcurrency: 16,
            },
            null,
            2
          )
        ],
        'config.json',
        { type: 'application/json' }
      );

      const docsFile = new File(
        [
          `# Architecture Overview\n\nMakeTransfer architecture ensures zero friction document previews with on-the-fly streaming and zip bundling.\n`
        ],
        'architecture.md',
        { type: 'text/markdown' }
      );

      const metricsFile = new File(
        [
          `Metric,Target,Observed,Status\nLatency,12ms,9ms,OPTIMAL\nThroughput,5000rps,6200rps,OPTIMAL\nMemory,256MB,180MB,OPTIMAL\nErrorRate,0.01%,0.002%,OPTIMAL\n`
        ],
        'sample-metrics.csv',
        { type: 'text/csv' }
      );

      const files = [readme, codeFile, configFile, docsFile, metricsFile];
      const paths = [
        'README.md',
        'src/index.ts',
        'src/config.json',
        'docs/architecture.md',
        'data/sample-metrics.csv'
      ];

      try {
        const res = await uploadBundle(files, paths, 'nextgen-analytics-engine');
        setActiveUpload(res);
        setMultiUploads(null);
        setCurrentSlug(null);
      } catch (e: any) {
        alert(e.message || 'Folder upload failed');
      } finally {
        setSampleLoading(false);
      }
      return;
    }

    let sampleBlob: Blob;
    let filename: string;

    if (type === 'markdown') {
      filename = 'MakeTransfer-Release-Notes.md';
      const mdText = `# 📄 Welcome to MakeTransfer\n\nMakeTransfer enables frictionless document sharing with in-browser previews and collision-safe public links.\n\n## ⚡ Core Capabilities\n- **In-Browser Previews**: Render PDFs, Word documents, Spreadsheets, Markdown, and Images instantly.\n- **Zero-Friction Access**: Anyone with the link can view and download with no login required.\n- **Security Controls**: Optional passkeys, link expiration (24h to 30d), and download limits.\n- **Real-time Analytics**: Keep track of view counts and download statistics.\n\n| Format | In-Browser Preview | Direct Download |\n| :--- | :---: | :---: |\n| PDF | ✅ | ✅ |\n| DOCX / Word | ✅ | ✅ |\n| XLSX / CSV | ✅ | ✅ |\n| Markdown / Code | ✅ | ✅ |\n| Images | ✅ | ✅ |\n\n> "Simple, clean, and instant document sharing for modern teams."\n`;
      sampleBlob = new Blob([mdText], { type: 'text/markdown' });
    } else if (type === 'csv') {
      filename = 'financial-q3-summary.csv';
      const csvText = `Quarter,Category,Budget,Actual,Variance\nQ1,Engineering,150000,142000,+8000\nQ1,Marketing,80000,85000,-5000\nQ2,Engineering,160000,158000,+2000\nQ2,Marketing,90000,89000,+1000\nQ3,Engineering,175000,171000,+4000\nQ3,Marketing,95000,92000,+3000\nTotal,All Operations,750000,737000,+13000`;
      sampleBlob = new Blob([csvText], { type: 'text/csv' });
    } else {
      filename = 'server-config-sample.json';
      const jsonText = JSON.stringify(
        {
          appName: 'MakeTransfer',
          version: '1.0.0',
          features: {
            pdfPreview: true,
            docxConversion: true,
            spreadsheetEngine: true,
            passwordProtection: true,
            expirationManager: true,
          },
          storage: 'Local File Engine & Postgres Metadata',
          securityScan: 'clean',
        },
        null,
        2
      );
      sampleBlob = new Blob([jsonText], { type: 'application/json' });
    }

    const file = new File([sampleBlob], filename, { type: sampleBlob.type });
    try {
      const res = await uploadFile(file);
      setActiveUpload(res);
      setMultiUploads(null);
      setCurrentSlug(null);
    } catch (e: any) {
      alert(e.message || 'Sample upload failed');
    } finally {
      setSampleLoading(false);
    }
  };

  // Already signed in: leave the sign-in page.
  useEffect(() => {
    if (user && isSignInRoute) navigateHome();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isSignInRoute]);

  // Sign-in page: shown at /signin, and on the home page for first-time visitors.
  // Shared document links (/d/...) are always viewable without signing in.
  const needsSignIn = !authLoading && !user && !isGuest && !currentSlug;
  // Blank splash while Firebase works out whether someone is already signed in (avoids a flash).
  if (authLoading && !isGuest && !currentSlug) {
    return <div className="min-h-screen bg-stone-50" />;
  }
  if (isSignInRoute || needsSignIn) {
    // On the /signin page go home afterwards; as a first-visit gate just continue to the page that was opened (e.g. /devices?to=ID)
    return <SignInPage onDone={isSignInRoute ? navigateHome : () => {}} />;
  }

  const activeSection: NavSection = isDevicesRoute
    ? 'devices'
    : isDocumentsRoute
    ? 'documents'
    : currentSlug
    ? null
    : 'home';

  return (
    <div className="min-h-screen flex flex-col bg-stone-50 text-stone-900 selection:bg-indigo-500 selection:text-white pb-20 md:pb-0">
      {/* Incoming direct transfers (prompts + progress) */}
      <IncomingTransferModal />

      {/* Top Navigation */}
      <Header
        onGoHome={navigateHome}
        onOpenMyDocuments={navigateToDocuments}
        onNavigateToSlug={navigateToSlug}
        currentSlug={currentSlug}
        active={activeSection}
      />

      {/* Main Content Area */}
      <main className={`flex-1 flex flex-col ${isDocumentsRoute || isDevicesRoute ? '' : 'justify-center py-8 sm:py-12'}`}>
        <ErrorBoundary>
          {isDevicesRoute ? (
            <DevicesPage onBack={navigateHome} />
          ) : isDocumentsRoute ? (
            <MyDocumentsPage onOpenDocument={navigateToSlug} onNewUpload={navigateHome} />
          ) : currentSlug ? (
            /* 1. Public Viewer View */
            <DocumentViewer slug={currentSlug} onGoHome={navigateHome} />
          ) : multiUploads ? (
            /* 2. Multiple Links Post-Upload Hub */
            <div className="max-w-4xl mx-auto px-4 w-full">
              <MultiPublishPanel
                uploadResponses={multiUploads}
                onOpenViewer={navigateToSlug}
                onCancel={navigateHome}
              />
            </div>
          ) : activeUpload ? (
            /* 3. Single / Bundle Post-Upload Publish Flow */
            <div className="max-w-4xl mx-auto px-4 w-full">
              <PublishPanel
                uploadData={activeUpload}
                onOpenViewer={navigateToSlug}
                onCancel={navigateHome}
              />
            </div>
          ) : (
            /* 4. Upload & Landing View */
            <div className="max-w-4xl mx-auto px-4 sm:px-6 w-full space-y-8 sm:space-y-10">
              {/* Hero */}
              <div className="text-center space-y-4 pt-2">
                <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 bg-white border border-stone-200 rounded-full text-xs font-semibold text-stone-700 shadow-2xs">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span>Free to use · recipients never need an account</span>
                </div>
                <h1 className="text-[2rem] leading-[1.1] sm:text-5xl font-extrabold text-stone-900 tracking-tight max-w-2xl mx-auto">
                  Share any file with{' '}
                  <span className="bg-gradient-to-r from-indigo-600 via-violet-600 to-pink-600 bg-clip-text text-transparent">one simple link</span>
                </h1>
                <p className="text-[15px] sm:text-base text-stone-600 max-w-xl mx-auto leading-relaxed">
                  Upload PDFs, Word and Excel files, images, code or whole folders. People open them right in their browser.
                </p>
              </div>

              {/* Upload zone */}
              <UploadDropzone
                onUploadSuccess={handleUploadSuccess}
                onMultiUploadSuccess={handleMultiUploadSuccess}
              />

              {/* Send to a device */}
              <button
                type="button"
                onClick={() => navigateToDevices()}
                className="group w-full text-left bg-white border border-stone-200 hover:border-indigo-300 hover:shadow-md rounded-2xl p-4 sm:p-5 flex items-center gap-4 transition-all cursor-pointer"
              >
                <span className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-600 via-violet-600 to-pink-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-indigo-500/20">
                  <Smartphone className="w-6 h-6" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm sm:text-base font-bold text-stone-900">Sending to another phone or PC?</span>
                  <span className="block text-xs sm:text-sm text-stone-500 mt-0.5">Use a device ID to send files directly, with no link to share.</span>
                </span>
                <ArrowRight className="w-5 h-5 text-stone-400 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-all shrink-0" />
              </button>

              {/* Samples */}
              <div className="space-y-2">
                <p className="text-center text-xs font-semibold text-stone-400">Just exploring? Try a sample</p>
                <div className="flex sm:flex-wrap sm:justify-center gap-2 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-1 [scrollbar-width:none]">
                  {[
                    { k: 'multiple', label: '🔗 3 files, separate links', cls: 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200 text-emerald-900' },
                    { k: 'folder', label: '📁 Project folder', cls: 'bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-900' },
                    { k: 'markdown', label: '📝 Markdown', cls: 'bg-white hover:bg-stone-100 border-stone-200 text-stone-700' },
                    { k: 'csv', label: '📊 Spreadsheet', cls: 'bg-white hover:bg-stone-100 border-stone-200 text-stone-700' },
                  ].map((s) => (
                    <button
                      key={s.k}
                      disabled={sampleLoading}
                      onClick={() => handleUploadSample(s.k as any)}
                      className={`shrink-0 whitespace-nowrap px-3.5 py-2 border rounded-full text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 ${s.cls}`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Highlights */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-5 pt-2">
                {[
                  { icon: Eye, tint: 'from-indigo-500 to-indigo-600', title: 'Preview in the browser', text: 'PDF, Word, Excel, Markdown, code and images open without any extra software.' },
                  { icon: Lock, tint: 'from-violet-500 to-violet-600', title: 'Passwords and expiry', text: 'Protect files with a password, an expiry date or a download limit.' },
                  { icon: Zap, tint: 'from-pink-500 to-pink-600', title: 'Short links and QR codes', text: 'Clean links, instant QR codes and view and download counts for every file.' },
                ].map(({ icon: Icon, tint, title, text }) => (
                  <div key={title} className="bg-white p-5 rounded-2xl border border-stone-200/80 shadow-2xs flex sm:block items-start gap-4">
                    <span className={`w-10 h-10 shrink-0 rounded-xl bg-gradient-to-br ${tint} text-white flex items-center justify-center sm:mb-3 shadow-sm`}>
                      <Icon className="w-5 h-5" />
                    </span>
                    <span className="block">
                      <h3 className="font-bold text-sm text-stone-900">{title}</h3>
                      <p className="text-xs text-stone-500 leading-relaxed mt-1">{text}</p>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </ErrorBoundary>
      </main>

      {/* Footer */}
      <footer className="border-t border-stone-200/80 bg-white/70 py-6 text-xs text-stone-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
          <div className="flex items-center space-x-2">
            <span className="w-6 h-6 rounded-md bg-gradient-to-br from-indigo-600 via-violet-600 to-pink-600 flex items-center justify-center text-white p-1 shadow-2xs">
              <Logo className="w-full h-full text-white" />
            </span>
            <span className="font-semibold text-stone-700">MakeTransfer</span>
            <span className="text-stone-400">· Simple, private file sharing</span>
          </div>
          <p className="text-stone-400">Single link, bundle or direct to a device</p>
        </div>
      </footer>

      {/* Bottom tab bar (phones) */}
      <MobileNav
        active={activeSection}
        onHome={navigateHome}
        onDocuments={navigateToDocuments}
        onDevices={() => navigateToDevices()}
      />
    </div>
  );
}

