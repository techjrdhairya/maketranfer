import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { UploadDropzone } from './components/UploadDropzone';
import { PublishPanel } from './components/PublishPanel';
import { MultiPublishPanel } from './components/MultiPublishPanel';
import { DocumentViewer } from './components/DocumentViewer';
import { MyDocumentsDrawer } from './components/MyDocumentsDrawer';
import { SignInPage } from './components/SignInPage';
import { useAuth } from './context/AuthContext';
import { Logo } from './components/Logo';
import { ErrorBoundary } from './components/ErrorBoundary';
import { UploadResponse } from './types';
import {
  FileText,
  Shield,
  Zap,
  Globe,
  Clock,
  Lock,
  Eye,
  CheckCircle2,
  Sparkles,
  Link as LinkIcon,
  Files,
} from 'lucide-react';
import { uploadFile, uploadBundle, uploadMultipleSeparate } from './lib/api';

export default function App() {
  const [currentSlug, setCurrentSlug] = useState<string | null>(null);
  const [activeUpload, setActiveUpload] = useState<UploadResponse | null>(null);
  const [multiUploads, setMultiUploads] = useState<UploadResponse[] | null>(null);
  const [isMyDocsOpen, setIsMyDocsOpen] = useState(false);
  const [sampleLoading, setSampleLoading] = useState(false);
  const [isSignInRoute, setIsSignInRoute] = useState(false);
  const { user, isGuest, loading: authLoading } = useAuth();

  // Parse path on initial load or popstate
  useEffect(() => {
    const parseUrl = () => {
      const path = window.location.pathname;
      const searchParams = new URLSearchParams(window.location.search);
      const querySlug = searchParams.get('d');

      if (path === '/signin') {
        setIsSignInRoute(true);
        setCurrentSlug(null);
        setActiveUpload(null);
        setMultiUploads(null);
        return;
      }
      setIsSignInRoute(false);

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

  const navigateToSlug = (slug: string) => {
    setIsSignInRoute(false);
    setCurrentSlug(slug);
    setActiveUpload(null);
    setMultiUploads(null);
    window.history.pushState({}, '', `/d/${slug}`);
  };

  const navigateHome = () => {
    setIsSignInRoute(false);
    setCurrentSlug(null);
    setActiveUpload(null);
    setMultiUploads(null);
    window.history.pushState({}, '', '/');
  };

  const handleUploadSuccess = (res: UploadResponse) => {
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
    return <SignInPage onDone={navigateHome} />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-stone-50 text-stone-900 selection:bg-indigo-500 selection:text-white">
      {/* Top Navigation */}
      <Header
        onGoHome={navigateHome}
        onOpenMyDocuments={() => setIsMyDocsOpen(true)}
        onNavigateToSlug={navigateToSlug}
        currentSlug={currentSlug}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col justify-center py-8 sm:py-12">
        <ErrorBoundary>
          {currentSlug ? (
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
            <div className="max-w-4xl mx-auto px-4 sm:px-6 w-full space-y-12">
              {/* Hero Heading */}
              <div className="text-center space-y-3">
                <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 bg-stone-200/80 border border-stone-300/90 rounded-full text-xs font-semibold text-stone-800 shadow-2xs">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span>MakeTransfer Platform</span>
                </div>
                <h1 className="text-3xl sm:text-5xl font-extrabold text-stone-900 tracking-tight max-w-2xl mx-auto leading-tight">
                  Share any document in seconds with a unique link
                </h1>
                <p className="text-sm sm:text-base text-stone-600 max-w-xl mx-auto leading-relaxed">
                  Upload PDFs, Word documents, Spreadsheets, Images, Code, or Archives.
                  Recipients view documents directly in their browser without signing up.
                </p>
              </div>

            {/* Drag & Drop Upload Zone */}
            <UploadDropzone
              onUploadSuccess={handleUploadSuccess}
              onMultiUploadSuccess={handleMultiUploadSuccess}
            />

            {/* Quick Demo Sample Files */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-2 text-xs text-stone-500">
              <span className="text-stone-400">Or try with an instant sample:</span>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  disabled={sampleLoading}
                  onClick={() => handleUploadSample('multiple')}
                  className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-900 rounded-lg font-semibold transition-colors cursor-pointer"
                  title="Upload 3 files with separate links"
                >
                  🔗 3 Files (Different Links)
                </button>
                <button
                  disabled={sampleLoading}
                  onClick={() => handleUploadSample('folder')}
                  className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 rounded-lg font-semibold transition-colors cursor-pointer"
                >
                  📁 Project Folder (1 Bundle Link)
                </button>
                <button
                  disabled={sampleLoading}
                  onClick={() => handleUploadSample('markdown')}
                  className="px-2.5 py-1 bg-white hover:bg-stone-100 border border-stone-300 rounded-lg text-stone-700 font-medium transition-colors cursor-pointer"
                >
                  📝 Markdown Doc
                </button>
                <button
                  disabled={sampleLoading}
                  onClick={() => handleUploadSample('csv')}
                  className="px-2.5 py-1 bg-white hover:bg-stone-100 border border-stone-300 rounded-lg text-stone-700 font-medium transition-colors cursor-pointer"
                >
                  📊 Spreadsheet (.csv)
                </button>
              </div>
            </div>

            {/* Feature Highlights Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-6 border-t border-stone-200/80">
              <div className="bg-white p-6 rounded-2xl border border-stone-200/80 shadow-2xs space-y-2">
                <div className="w-10 h-10 rounded-xl bg-stone-100 flex items-center justify-center text-stone-800 mb-3">
                  <Eye className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-sm text-stone-900">Rich In-Browser Previews</h3>
                <p className="text-xs text-stone-500 leading-relaxed">
                  Interactive viewers for PDFs, Word DOCX, Excel spreadsheets, Markdown tables, code, and images without external software.
                </p>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-stone-200/80 shadow-2xs space-y-2">
                <div className="w-10 h-10 rounded-xl bg-stone-100 flex items-center justify-center text-stone-800 mb-3">
                  <Lock className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-sm text-stone-900">Passkeys & Expiration</h3>
                <p className="text-xs text-stone-500 leading-relaxed">
                  Lock sensitive files with optional passwords, self-destructing links, and maximum download caps.
                </p>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-stone-200/80 shadow-2xs space-y-2">
                <div className="w-10 h-10 rounded-xl bg-stone-100 flex items-center justify-center text-stone-800 mb-3">
                  <Zap className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-sm text-stone-900">Collision-Safe Links</h3>
                <p className="text-xs text-stone-500 leading-relaxed">
                  Clean short URLs, QR Code generation, and real-time view and download analytics for every link.
                </p>
              </div>
            </div>
          </div>
        )}
        </ErrorBoundary>
      </main>

      {/* "My Documents" Management Drawer */}
      <MyDocumentsDrawer
        isOpen={isMyDocsOpen}
        onClose={() => setIsMyDocsOpen(false)}
        onOpenDocument={navigateToSlug}
      />

      {/* Footer */}
      <footer className="border-t border-stone-200/80 bg-white/80 py-6 text-center text-xs text-stone-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex flex-col sm:flex-row items-center gap-2.5">
            <div className="flex items-center space-x-2">
              <div className="w-5 h-5 rounded-md bg-gradient-to-br from-indigo-600 via-violet-600 to-pink-600 flex items-center justify-center text-white p-0.5 shadow-2xs">
                <Logo className="w-full h-full text-white" />
              </div>
              <p className="font-semibold text-stone-800">
                MakeTransfer — Frictionless, Open Document Sharing
              </p>
            </div>
          </div>
          <p className="text-stone-400">
            Files stored securely • Single bundle or individual links
          </p>
        </div>
      </footer>
    </div>
  );
}

