import { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  LayoutDashboard, 
  PlusCircle, 
  Settings, 
  Eye, 
  Edit3, 
  Calendar, 
  CheckCircle2, 
  AlertCircle,
  Loader2,
  RefreshCw,
  Image as ImageIcon,
  Save,
  Rocket,
  Trash2,
  X
} from 'lucide-react';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';

// --- Types ---
interface Draft {
  id: string;
  brand: string;
  title: string;
  slug: string;
  content: string;
  status: 'drafting' | 'generated' | 'scheduled' | 'published' | 'failed';
  imageUrl: string;
  scheduledAt: string;
  frontMatter: any;
  autoPublish: boolean;
  seoScore: {
    wordCount: number;
    readingTime: number;
  };
}

const API_BASE = '/blog/api';

export default function App() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDraft, setSelectedDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState<'editor' | 'preview'>('editor');

  const [settingsOpen, setSettingsOpen] = useState(false);

  // Load drafts
  const fetchDrafts = async () => {
    try {
      const res = await axios.get(`${API_BASE}/blog/drafts`);
      setDrafts(res.data.drafts);
      // Auto-select first one if none selected
      if (res.data.drafts.length > 0 && !selectedId) {
        setSelectedId(res.data.drafts[0].id);
      } else if (res.data.drafts.length === 0) {
        setSelectedId(null);
        setSelectedDraft(null);
      }
    } catch (err) {
      console.error('Failed to fetch drafts', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedDraft) return;
    const targetTitle = selectedDraft.title || selectedDraft.slug;
    if (!window.confirm(`Discard "${targetTitle}"? If it is already published, the live blog file will be archived and removed from the site.`)) return;
    try {
      await axios.delete(`${API_BASE}/blog/draft/${selectedDraft.id}`);
      const remainingDrafts = drafts.filter(draft => draft.id !== selectedDraft.id);
      setDrafts(remainingDrafts);
      setSelectedId(remainingDrafts[0]?.id ?? null);
      setSelectedDraft(null);
      await fetchDrafts();
    } catch (err) {
      alert('Discard failed');
    }
  };

  useEffect(() => {
    fetchDrafts();
  }, []);

  // Load single draft detail
  useEffect(() => {
    if (selectedId) {
      const draft = drafts.find(d => d.id === selectedId);
      if (draft) setSelectedDraft({ ...draft });
    }
  }, [selectedId, drafts]);

  const handleSave = async () => {
    if (!selectedDraft) return;
    try {
      await axios.put(`${API_BASE}/blog/draft/${selectedDraft.id}`, {
        content: selectedDraft.content,
        frontMatter: selectedDraft.frontMatter
      });
      alert('Saved successfully');
      fetchDrafts();
    } catch (err) {
      alert('Save failed');
    }
  };

  const handlePublish = async () => {
    if (!selectedDraft) return;
    if (!window.confirm('Are you sure you want to publish this blog live?')) return;
    try {
      await axios.post(`${API_BASE}/blog/draft/${selectedDraft.id}/publish`);
      alert('Published successfully!');
      fetchDrafts();
    } catch (err) {
      alert('Publishing failed');
    }
  };

  const triggerGenerate = async (brand?: string) => {
    setGenerating(true);
    try {
      await axios.post(`${API_BASE}/blog/generate`, { brand });
      alert('Generation triggered! It will take a few minutes.');
    } catch (err) {
      alert('Failed to trigger generation');
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <Loader2 className="animate-spin" />
        <p>Loading Blog Engine...</p>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* --- Sidebar Header --- */}
      <header className="main-header glass">
        <div className="brand-logo">
          <LayoutDashboard size={20} className="gold-text" />
          <h1>Supreme Blog Engine</h1>
        </div>
        <div className="header-actions">
          <button 
            type="button"
            className="premium-btn flex items-center gap-2" 
            onClick={() => triggerGenerate()}
            disabled={generating}
          >
            {generating ? <Loader2 className="animate-spin" size={14} /> : <PlusCircle size={14} />}
            Generate Blog
          </button>
          <button 
            type="button"
            className={`secondary-btn ${settingsOpen ? 'active' : ''}`}
            onClick={() => setSettingsOpen(open => !open)}
            aria-label="Open engine settings"
            title="Engine settings"
          >
            <Settings size={18} />
          </button>
        </div>
      </header>

      {settingsOpen && (
        <div className="settings-overlay" onClick={() => setSettingsOpen(false)}>
          <div className="settings-content" onClick={(event) => event.stopPropagation()}>
            <div className="settings-title-row">
              <h3>Engine Settings</h3>
              <button type="button" className="icon-btn" onClick={() => setSettingsOpen(false)} aria-label="Close settings">
                <X size={16} />
              </button>
            </div>
            <div className="setting-item">
              <label>Brand Rotation</label>
              <span>Saraf ↔ Casemate (Auto)</span>
            </div>
            <div className="setting-item">
              <label>Word Count</label>
              <span>1000-2500 words</span>
            </div>
            <div className="setting-item">
              <label>API Status</label>
              <span className="success-text">Active</span>
            </div>
          </div>
        </div>
      )}

      <main className="dashboard-grid">
        {/* --- Column 1: Queue Sidebar --- */}
        <aside className="queue-sidebar glass">
          <div className="sidebar-title">
            <h2>Queue</h2>
            <RefreshCw size={14} className="refresh-icon" onClick={fetchDrafts} />
          </div>
          <div className="draft-list">
            {drafts.map(draft => (
              <motion.div 
                key={draft.id}
                layoutId={draft.id}
                className={`draft-card ${selectedId === draft.id ? 'active' : ''}`}
                onClick={() => setSelectedId(draft.id)}
              >
                <div className="draft-info">
                  <span className={`brand-tag ${draft.brand}`}>{draft.brand}</span>
                  <span className="draft-date">{new Date(draft.scheduledAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                </div>
                <h3 className="draft-title">{draft.title}</h3>
                <div className="draft-status">
                  <span className={`status-badge ${draft.status}`}>
                    {draft.status === 'published' && <CheckCircle2 size={10} />}
                    {draft.status === 'generated' && <Calendar size={10} />}
                    {draft.status === 'failed' && <AlertCircle size={10} />}
                    {draft.status}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        </aside>

        {/* --- Column 2: Editor/Preview --- */}
        <section className="editor-section glass">
          {selectedDraft ? (
            <div className="editor-container">
              <div className="header-preview-area">
                <img src={selectedDraft.imageUrl} alt="Header Preview" className="header-img-preview" />
                <div className="img-actions">
                  <label className="secondary-btn flex items-center gap-2 cursor-pointer">
                    <ImageIcon size={14} /> Replace
                    <input 
                      type="file" 
                      className="hidden" 
                      accept="image/*"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const formData = new FormData();
                        formData.append('image', file);
                        try {
                          const res = await axios.post(`${API_BASE}/blog/draft/${selectedDraft.id}/replace-image`, formData);
                          setSelectedDraft({ ...selectedDraft, imageUrl: res.data.imageUrl });
                          fetchDrafts();
                        } catch (err) {
                          alert('Failed to upload image');
                        }
                      }}
                    />
                  </label>
                  <button 
                    className="secondary-btn flex items-center gap-2"
                    onClick={async () => {
                      if (!window.confirm('Regenerate header image using AI?')) return;
                      try {
                        const res = await axios.post(`${API_BASE}/blog/draft/${selectedDraft.id}/regenerate-image`);
                        setSelectedDraft({ ...selectedDraft, imageUrl: res.data.imageUrl });
                        fetchDrafts();
                      } catch (err) {
                        alert('Regeneration failed');
                      }
                    }}
                  >
                    <RefreshCw size={14} /> Regenerate
                  </button>
                </div>
              </div>

              <div className="tabs-bar">
                <button 
                  className={`tab ${activeTab === 'editor' ? 'active' : ''}`}
                  onClick={() => setActiveTab('editor')}
                >
                  <Edit3 size={14} /> Editor
                </button>
                <button 
                  className={`tab ${activeTab === 'preview' ? 'active' : ''}`}
                  onClick={() => setActiveTab('preview')}
                >
                  <Eye size={14} /> Preview
                </button>
              </div>

              <div className="content-area">
                {activeTab === 'editor' ? (
                  <textarea 
                    value={selectedDraft.content}
                    onChange={(e) => setSelectedDraft({...selectedDraft, content: e.target.value})}
                    className="markdown-editor"
                  />
                ) : (
                  <div className="markdown-preview">
                    <ReactMarkdown>{selectedDraft.content}</ReactMarkdown>
                  </div>
                )}
              </div>

              <div className="editor-footer">
                <button type="button" className="secondary-btn danger-hover flex items-center gap-2" onClick={handleDelete}>
                  <Trash2 size={14} /> Discard
                </button>
                <div className="footer-right">
                  <button className="secondary-btn flex items-center gap-2" onClick={handleSave}>
                    <Save size={14} /> Save Draft
                  </button>
                  <button className="premium-btn flex items-center gap-2" onClick={handlePublish}>
                    <Rocket size={14} /> Publish Now
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <LayoutDashboard size={48} className="muted-text" />
              <p>Select a blog from the queue to start editing</p>
            </div>
          )}
        </section>

        {/* --- Column 3: SEO Panel --- */}
        <aside className="seo-panel glass">
          {selectedDraft ? (
            <div className="seo-container">
              <div className="sidebar-title">
                <h2>SEO Scoreboard</h2>
              </div>
              
              <div className="seo-card">
                <div className="score-header">
                  <span>Reading Time</span>
                  <span className="score-val">{selectedDraft.seoScore.readingTime} min</span>
                </div>
                <div className="progress-bg">
                  <div className="progress-bar" style={{ width: '80%' }}></div>
                </div>
              </div>

              <div className="seo-card">
                <div className="score-header">
                  <span>Word Count</span>
                  <span className="score-val">{selectedDraft.seoScore.wordCount}</span>
                </div>
                <p className="seo-hint">Target: 1000 - 2500 words</p>
              </div>

              <div className="seo-card">
                <div className="score-header">
                  <span>Meta Description</span>
                  <span className="score-val">{selectedDraft.frontMatter.description.length}/160</span>
                </div>
                <textarea 
                  value={selectedDraft.frontMatter.description}
                  onChange={(e) => setSelectedDraft({
                    ...selectedDraft, 
                    frontMatter: {...selectedDraft.frontMatter, description: e.target.value}
                  })}
                  className="seo-input"
                />
              </div>

              <div className="seo-card">
                <div className="score-header">
                  <span>Tags</span>
                </div>
                <div className="tag-list">
                  {selectedDraft.frontMatter.tags.map((tag: string) => (
                    <span key={tag} className="seo-tag">{tag}</span>
                  ))}
                </div>
              </div>

              <div className="publish-settings">
                <h3>Settings</h3>
                <div className="setting-row">
                  <span>Auto-Publish</span>
                  <button 
                    className={`toggle ${selectedDraft.autoPublish ? 'on' : 'off'}`}
                    onClick={() => {
                      const newVal = !selectedDraft.autoPublish;
                      setSelectedDraft({...selectedDraft, autoPublish: newVal});
                      axios.put(`${API_BASE}/blog/draft/${selectedDraft.id}/auto-publish`, { autoPublish: newVal });
                    }}
                  >
                    <div className="toggle-handle"></div>
                  </button>
                </div>
                <div className="setting-row">
                  <span>Publish Date</span>
                  <input 
                    type="date" 
                    value={new Date(selectedDraft.scheduledAt).toISOString().split('T')[0]}
                    onChange={(e) => {
                      const newDate = e.target.value;
                      setSelectedDraft({...selectedDraft, scheduledAt: newDate});
                      axios.put(`${API_BASE}/blog/draft/${selectedDraft.id}/reschedule`, { scheduledAt: newDate });
                    }}
                    className="date-picker"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <Eye size={32} className="muted-text" />
              <p>SEO analysis appears here</p>
            </div>
          )}
        </aside>
      </main>

      <style>{`
        .app-container {
          height: 100vh;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .main-header {
          height: 64px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 24px;
          border-bottom: 1px solid var(--border-color);
          z-index: 100;
        }

        .brand-logo {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .brand-logo h1 {
          font-size: 1.25rem;
          letter-spacing: 1px;
          text-transform: uppercase;
        }

        .header-actions {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .dashboard-grid {
          flex: 1;
          display: grid;
          grid-template-columns: 320px 1fr 340px;
          gap: 1px;
          background: var(--border-color);
          overflow: hidden;
        }

        .queue-sidebar, .editor-section, .seo-panel {
          background: var(--bg-primary);
          overflow-y: auto;
          display: flex;
          flex-direction: column;
        }

        .sidebar-title {
          padding: 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .sidebar-title h2 {
          font-size: 0.875rem;
          text-transform: uppercase;
          letter-spacing: 2px;
          color: var(--text-muted);
        }

        .draft-list {
          padding: 0 12px 24px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .draft-card {
          padding: 16px;
          border: 1px solid transparent;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .draft-card:hover {
          background: var(--bg-secondary);
        }

        .draft-card.active {
          background: var(--bg-tertiary);
          border-color: var(--accent-gold);
        }

        .draft-info {
          display: flex;
          justify-content: space-between;
          margin-bottom: 8px;
        }

        .brand-tag {
          font-size: 0.625rem;
          text-transform: uppercase;
          font-weight: 700;
          letter-spacing: 1px;
          padding: 2px 6px;
        }

        .brand-tag.saraf { color: var(--accent-gold); border: 1px solid var(--accent-gold); }
        .brand-tag.casemate { color: #60a5fa; border: 1px solid #60a5fa; }

        .draft-date {
          font-size: 0.75rem;
          color: var(--text-muted);
        }

        .draft-title {
          font-size: 0.9375rem;
          line-height: 1.4;
          margin-bottom: 12px;
          color: var(--text-primary);
        }

        .status-badge {
          font-size: 0.625rem;
          text-transform: uppercase;
          font-weight: 600;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 2px 8px;
          background: var(--bg-tertiary);
          border-radius: 99px;
        }

        .status-badge.published { color: var(--success); }
        .status-badge.generated { color: var(--warning); }
        .status-badge.failed { color: var(--error); }

        .editor-container {
          display: flex;
          flex-direction: column;
          height: 100%;
        }

        .header-preview-area {
          position: relative;
          height: 240px;
          flex-shrink: 0;
          background: var(--bg-secondary);
        }

        .header-img-preview {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .img-actions {
          position: absolute;
          bottom: 16px;
          right: 16px;
          display: flex;
          gap: 8px;
        }

        .tabs-bar {
          display: flex;
          border-bottom: 1px solid var(--border-color);
          background: var(--bg-secondary);
        }

        .tab {
          padding: 12px 24px;
          font-size: 0.75rem;
          text-transform: uppercase;
          font-weight: 600;
          letter-spacing: 1px;
          color: var(--text-muted);
          display: flex;
          align-items: center;
          gap: 8px;
          border-bottom: 2px solid transparent;
        }

        .tab.active {
          color: var(--accent-gold);
          border-bottom-color: var(--accent-gold);
          background: var(--bg-primary);
        }

        .content-area {
          flex: 1;
          overflow: hidden;
        }

        .markdown-editor {
          width: 100%;
          height: 100%;
          padding: 40px;
          resize: none;
          background: var(--bg-primary);
          border: none;
          font-size: 1rem;
          line-height: 1.6;
          color: var(--text-primary);
        }

        .markdown-preview {
          padding: 40px;
          overflow-y: auto;
          height: 100%;
          line-height: 1.8;
          color: var(--text-secondary);
        }

        .markdown-preview h1 { font-size: 2.5rem; margin-bottom: 2rem; color: var(--text-primary); }
        .markdown-preview h2 { font-size: 1.75rem; margin: 2rem 0 1rem; color: var(--text-primary); }
        .markdown-preview p { margin-bottom: 1.5rem; }

        .editor-footer {
          padding: 16px 24px;
          border-top: 1px solid var(--border-color);
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: var(--bg-secondary);
        }

        .footer-right {
          display: flex;
          gap: 12px;
        }

        .seo-container {
          padding-bottom: 40px;
        }

        .seo-card {
          padding: 24px;
          border-bottom: 1px solid var(--border-color);
        }

        .score-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          color: var(--text-secondary);
        }

        .score-val {
          color: var(--accent-gold);
        }

        .progress-bg {
          height: 4px;
          background: var(--bg-tertiary);
          border-radius: 2px;
        }

        .progress-bar {
          height: 100%;
          background: var(--accent-gold);
          border-radius: 2px;
        }

        .seo-hint {
          font-size: 0.75rem;
          color: var(--text-muted);
        }

        .seo-input {
          width: 100%;
          height: 80px;
          font-size: 0.8125rem;
          line-height: 1.4;
          padding: 8px;
        }

        .tag-list {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .seo-tag {
          font-size: 0.625rem;
          background: var(--bg-tertiary);
          padding: 4px 10px;
          border: 1px solid var(--border-color);
          color: var(--text-secondary);
        }

        .publish-settings {
          padding: 24px;
        }

        .publish-settings h3 {
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 2px;
          margin-bottom: 20px;
          color: var(--text-muted);
        }

        .setting-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
          font-size: 0.875rem;
        }

        .toggle {
          width: 44px;
          height: 24px;
          border-radius: 12px;
          position: relative;
          transition: all 0.3s ease;
        }

        .toggle.on { background: var(--success); }
        .toggle.off { background: var(--bg-tertiary); }

        .toggle-handle {
          width: 20px;
          height: 20px;
          background: white;
          border-radius: 50%;
          position: absolute;
          top: 2px;
          left: 2px;
          transition: all 0.3s ease;
        }

        .toggle.on .toggle-handle { left: 22px; }

        .date-picker {
          background: var(--bg-tertiary);
          border: 1px solid var(--border-color);
          color: white;
          padding: 4px 8px;
          font-size: 0.75rem;
        }

        .empty-state {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 16px;
          color: var(--text-muted);
        }

        .gold-text { color: var(--accent-gold); }
        .danger-hover:hover { color: #ef4444; border-color: #ef4444; }
        .success-text { color: var(--success); font-weight: 600; }
        
        .settings-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.5);
          z-index: 1000;
          display: flex;
          align-items: flex-start;
          justify-content: flex-end;
          padding: 82px 24px 24px;
          backdrop-filter: blur(6px);
        }

        .settings-content {
          background: var(--bg-secondary);
          padding: 24px;
          border: 1px solid var(--accent-gold);
          width: min(420px, calc(100vw - 48px));
          display: flex;
          flex-direction: column;
          gap: 18px;
          box-shadow: 0 24px 80px rgba(0, 0, 0, 0.45);
        }

        .settings-content h3 {
          text-transform: uppercase;
          letter-spacing: 2px;
          font-size: 1rem;
          margin: 0;
        }

        .settings-title-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }

        .icon-btn {
          width: 36px;
          height: 36px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid var(--border-color);
          background: var(--bg-tertiary);
          color: var(--text-primary);
          cursor: pointer;
        }

        .setting-item {
          display: flex;
          justify-content: space-between;
          font-size: 0.875rem;
          padding-bottom: 12px;
          border-bottom: 1px solid var(--border-color);
        }

        .setting-item label { color: var(--text-muted); }

        .loading-screen {
          height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 16px;
          background: var(--bg-primary);
        }

        .animate-spin {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
