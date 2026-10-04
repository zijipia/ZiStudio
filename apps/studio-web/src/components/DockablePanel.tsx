import React, { ReactNode } from 'react';

export interface PanelTab {
  id: string;
  label: string;
  badge?: string | number;
}

interface DockablePanelProps {
  id: string;
  tabs?: PanelTab[];
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
  title?: string;
  rightMeta?: ReactNode;
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  className?: string;
  children: ReactNode;
}

export const DockablePanel: React.FC<DockablePanelProps> = ({
  id,
  tabs,
  activeTab,
  onTabChange,
  title,
  rightMeta,
  isMaximized,
  onToggleMaximize,
  isCollapsed,
  onToggleCollapse,
  className = '',
  children,
}) => {
  return (
    <div
      className={`dockable-panel ${className} ${isMaximized ? 'panel-maximized' : ''} ${
        isCollapsed ? 'panel-collapsed' : ''
      }`}
      id={`panel-${id}`}
    >
      {/* Panel Header */}
      <div className="dockable-header">
        {tabs && tabs.length > 0 ? (
          <div className="dockable-tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={`dockable-tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => onTabChange && onTabChange(tab.id)}
              >
                <span>{tab.label}</span>
                {tab.badge !== undefined && <span className="tab-badge">{tab.badge}</span>}
              </button>
            ))}
          </div>
        ) : (
          <div className="dockable-title">
            <strong>{title}</strong>
          </div>
        )}

        {/* Right Metadata and Window Controls */}
        <div className="dockable-header-right">
          {rightMeta && <div className="dockable-meta">{rightMeta}</div>}

          {onToggleCollapse && (
            <button
              className="dockable-tool-btn"
              onClick={onToggleCollapse}
              title={isCollapsed ? 'Expand Panel' : 'Collapse Panel'}
            >
              {isCollapsed ? '▾' : '▴'}
            </button>
          )}

          {onToggleMaximize && (
            <button
              className="dockable-tool-btn"
              onClick={onToggleMaximize}
              title={isMaximized ? 'Restore Panel' : 'Maximize Panel'}
            >
              {isMaximized ? '❐' : '□'}
            </button>
          )}
        </div>
      </div>

      {/* Panel Body */}
      {!isCollapsed && <div className="dockable-content">{children}</div>}
    </div>
  );
};
