import React, { useState, useRef, useEffect } from 'react';

interface TopMenuBarProps {
  timecode: string;
  currentFrame: number;
  totalFrames: number;
  fps: number;
  isPlaying: boolean;
  isLooping: boolean;
  isMuted: boolean;
  canUndo: boolean;
  canRedo: boolean;
  showGuides: boolean;
  showGrid: boolean;
  workspace: string;
  onPlayPause: () => void;
  onStepFrame: (delta: number) => void;
  onJumpToStart: () => void;
  onJumpToEnd: () => void;
  onToggleLoop: () => void;
  onToggleMute: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onToggleGuides: () => void;
  onToggleGrid: () => void;
  onFitZoom: () => void;
  onResetPan: () => void;
  onSaveProject: () => void;
  onOpenProject: () => void;
  onImportMedia: () => void;
  onExportPNG: () => void;
  onExportVideo: () => void;
  onAddLayer: (type: 'text' | 'solid' | 'shape' | 'audio' | 'adjustment') => void;
  onAddEffect: (type: 'blur' | 'brightness-contrast' | 'hue-saturation' | 'glow' | 'vignette' | 'invert') => void;
  onOpenCommandPalette: () => void;
}

export const TopMenuBar: React.FC<TopMenuBarProps> = ({
  timecode,
  currentFrame,
  totalFrames,
  isPlaying,
  isLooping,
  isMuted,
  canUndo,
  canRedo,
  showGuides,
  showGrid,
  onPlayPause,
  onStepFrame,
  onJumpToStart,
  onJumpToEnd,
  onToggleLoop,
  onToggleMute,
  onUndo,
  onRedo,
  onToggleGuides,
  onToggleGrid,
  onFitZoom,
  onResetPan,
  onSaveProject,
  onOpenProject,
  onImportMedia,
  onExportPNG,
  onExportVideo,
  onAddLayer,
  onAddEffect,
  onOpenCommandPalette,
}) => {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setActiveMenu(null);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleMenu = (name: string) => {
    setActiveMenu((prev) => (prev === name ? null : name));
  };

  const closeMenu = () => setActiveMenu(null);

  return (
    <header className="topbar" ref={barRef}>
      {/* Brand */}
      <div className="brand" title="ZiStudio Professional Media Studio">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
        <span>ZiStudio</span>
        <span className="brand-version">PRO</span>
      </div>

      {/* Menus */}
      <nav className="menu-group">
        {/* File Menu */}
        <div className="menu-dropdown-wrapper">
          <button
            className={`menu-btn ${activeMenu === 'file' ? 'active' : ''}`}
            onClick={() => toggleMenu('file')}
          >
            File ▾
          </button>
          {activeMenu === 'file' && (
            <div className="menu-dropdown">
              <button
                className="dropdown-item"
                onClick={() => {
                  onSaveProject();
                  closeMenu();
                }}
              >
                <span>Save Project (.zproj)</span>
                <kbd>Ctrl+S</kbd>
              </button>
              <button
                className="dropdown-item"
                onClick={() => {
                  onOpenProject();
                  closeMenu();
                }}
              >
                <span>Open Project (.zproj)</span>
                <kbd>Ctrl+O</kbd>
              </button>
              <div className="dropdown-divider" />
              <button
                className="dropdown-item"
                onClick={() => {
                  onImportMedia();
                  closeMenu();
                }}
              >
                <span>Import Media Asset...</span>
                <kbd>Ctrl+I</kbd>
              </button>
              <div className="dropdown-divider" />
              <button
                className="dropdown-item"
                onClick={() => {
                  onExportPNG();
                  closeMenu();
                }}
              >
                <span>Export Frame as PNG</span>
              </button>
              <button
                className="dropdown-item"
                onClick={() => {
                  onExportVideo();
                  closeMenu();
                }}
              >
                <span>Render Video (WebM)...</span>
                <kbd>Ctrl+M</kbd>
              </button>
            </div>
          )}
        </div>

        {/* Edit Menu */}
        <div className="menu-dropdown-wrapper">
          <button
            className={`menu-btn ${activeMenu === 'edit' ? 'active' : ''}`}
            onClick={() => toggleMenu('edit')}
          >
            Edit ▾
          </button>
          {activeMenu === 'edit' && (
            <div className="menu-dropdown">
              <button
                className="dropdown-item"
                disabled={!canUndo}
                onClick={() => {
                  onUndo();
                  closeMenu();
                }}
              >
                <span>Undo</span>
                <kbd>Ctrl+Z</kbd>
              </button>
              <button
                className="dropdown-item"
                disabled={!canRedo}
                onClick={() => {
                  onRedo();
                  closeMenu();
                }}
              >
                <span>Redo</span>
                <kbd>Ctrl+Y</kbd>
              </button>
              <div className="dropdown-divider" />
              <button
                className="dropdown-item"
                onClick={() => {
                  onOpenCommandPalette();
                  closeMenu();
                }}
              >
                <span>Command Palette...</span>
                <kbd>Ctrl+K</kbd>
              </button>
            </div>
          )}
        </div>

        {/* Layer Menu */}
        <div className="menu-dropdown-wrapper">
          <button
            className={`menu-btn ${activeMenu === 'layer' ? 'active' : ''}`}
            onClick={() => toggleMenu('layer')}
          >
            Layer ▾
          </button>
          {activeMenu === 'layer' && (
            <div className="menu-dropdown">
              <button
                className="dropdown-item"
                onClick={() => {
                  onAddLayer('text');
                  closeMenu();
                }}
              >
                <span>New Text Layer</span>
              </button>
              <button
                className="dropdown-item"
                onClick={() => {
                  onAddLayer('solid');
                  closeMenu();
                }}
              >
                <span>New Solid Layer</span>
              </button>
              <button
                className="dropdown-item"
                onClick={() => {
                  onAddLayer('shape');
                  closeMenu();
                }}
              >
                <span>New Shape Layer</span>
              </button>
              <button
                className="dropdown-item"
                onClick={() => {
                  onAddLayer('audio');
                  closeMenu();
                }}
              >
                <span>New Audio Track</span>
              </button>
              <button
                className="dropdown-item"
                onClick={() => {
                  onAddLayer('adjustment');
                  closeMenu();
                }}
              >
                <span>New Adjustment Layer</span>
              </button>
            </div>
          )}
        </div>

        {/* Effects Menu */}
        <div className="menu-dropdown-wrapper">
          <button
            className={`menu-btn ${activeMenu === 'effects' ? 'active' : ''}`}
            onClick={() => toggleMenu('effects')}
          >
            Effects ▾
          </button>
          {activeMenu === 'effects' && (
            <div className="menu-dropdown">
              <button
                className="dropdown-item"
                onClick={() => {
                  onAddEffect('blur');
                  closeMenu();
                }}
              >
                <span>Gaussian Blur</span>
              </button>
              <button
                className="dropdown-item"
                onClick={() => {
                  onAddEffect('glow');
                  closeMenu();
                }}
              >
                <span>Glow Effect</span>
              </button>
              <button
                className="dropdown-item"
                onClick={() => {
                  onAddEffect('vignette');
                  closeMenu();
                }}
              >
                <span>Vignette</span>
              </button>
              <button
                className="dropdown-item"
                onClick={() => {
                  onAddEffect('brightness-contrast');
                  closeMenu();
                }}
              >
                <span>Brightness & Contrast</span>
              </button>
              <button
                className="dropdown-item"
                onClick={() => {
                  onAddEffect('hue-saturation');
                  closeMenu();
                }}
              >
                <span>Hue & Saturation</span>
              </button>
              <button
                className="dropdown-item"
                onClick={() => {
                  onAddEffect('invert');
                  closeMenu();
                }}
              >
                <span>Color Invert</span>
              </button>
            </div>
          )}
        </div>

        {/* View Menu */}
        <div className="menu-dropdown-wrapper">
          <button
            className={`menu-btn ${activeMenu === 'view' ? 'active' : ''}`}
            onClick={() => toggleMenu('view')}
          >
            View ▾
          </button>
          {activeMenu === 'view' && (
            <div className="menu-dropdown">
              <button
                className="dropdown-item"
                onClick={() => {
                  onFitZoom();
                  closeMenu();
                }}
              >
                <span>Fit Viewer</span>
                <kbd>F</kbd>
              </button>
              <button
                className="dropdown-item"
                onClick={() => {
                  onResetPan();
                  closeMenu();
                }}
              >
                <span>Reset Pan</span>
              </button>
              <div className="dropdown-divider" />
              <button
                className="dropdown-item"
                onClick={() => {
                  onToggleGuides();
                  closeMenu();
                }}
              >
                <span>{showGuides ? '✓ Safe Guides' : 'Safe Guides'}</span>
              </button>
              <button
                className="dropdown-item"
                onClick={() => {
                  onToggleGrid();
                  closeMenu();
                }}
              >
                <span>{showGrid ? '✓ Composition Grid' : 'Composition Grid'}</span>
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* Quick Search / Command Palette Pill */}
      <button
        className="cmd-trigger-btn"
        onClick={onOpenCommandPalette}
        title="Open Command Palette (Ctrl+K or Cmd+K)"
      >
        <span style={{ opacity: 0.6 }}>🔍 Search commands...</span>
        <kbd>⌘K</kbd>
      </button>

      {/* Transport Controls */}
      <div className="transport">
        <button onClick={onJumpToStart} title="Jump to Start (Home)">
          ⏮
        </button>
        <button onClick={() => onStepFrame(-1)} title="Step -1 Frame (←)">
          ◀
        </button>
        <button
          className={`play-btn ${isPlaying ? 'active' : ''}`}
          onClick={onPlayPause}
          title="Play / Pause (Space)"
        >
          {isPlaying ? '❚❚' : '▶'}
        </button>
        <button onClick={() => onStepFrame(1)} title="Step +1 Frame (→)">
          ▶
        </button>
        <button onClick={onJumpToEnd} title="Jump to End (End)">
          ⏭
        </button>

        <button
          className={isLooping ? 'active' : ''}
          onClick={onToggleLoop}
          title={isLooping ? 'Looping Enabled' : 'Looping Disabled'}
        >
          🔁
        </button>

        <button
          onClick={onToggleMute}
          title={isMuted ? 'Unmute Audio' : 'Mute Audio'}
          style={{ color: isMuted ? '#f43f5e' : undefined }}
        >
          {isMuted ? '🔇' : '🔊'}
        </button>

        {/* Timecode and Frame Display */}
        <div className="timecode-display" title="SMPTE Timecode (HH:MM:SS:FF)">
          <span className="timecode-clock">{timecode}</span>
          <span className="timecode-frames">
            F {currentFrame}/{totalFrames}
          </span>
        </div>
      </div>
    </header>
  );
};
