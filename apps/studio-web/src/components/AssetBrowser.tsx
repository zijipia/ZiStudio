import React, { useState, useMemo } from 'react';
import type { Asset } from '../model';
import { inferMediaKind, type MediaKind } from '../media';

interface AssetBrowserProps {
  assets: Asset[];
  onImportClick: () => void;
  onAddAssetToComposition: (asset: Asset) => void;
  onDeleteAsset?: (assetId: string) => void;
}

export const AssetBrowser: React.FC<AssetBrowserProps> = ({
  assets,
  onImportClick,
  onAddAssetToComposition,
  onDeleteAsset,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedKind, setSelectedKind] = useState<'all' | MediaKind>('all');
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);

  const filteredAssets = useMemo(() => {
    return assets.filter((asset) => {
      const matchesSearch = asset.name.toLowerCase().includes(searchQuery.toLowerCase());
      const kind = asset.type || inferMediaKind(asset.url);
      const matchesKind = selectedKind === 'all' || kind === selectedKind;
      return matchesSearch && matchesKind;
    });
  }, [assets, searchQuery, selectedKind]);

  const selectedAsset = assets.find((a) => a.id === selectedAssetId);

  return (
    <div className="asset-browser-container">
      {/* Top Filter Bar */}
      <div className="asset-browser-header">
        <div className="asset-search-wrap">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            className="asset-search-input"
            placeholder="Search assets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="clear-btn" onClick={() => setSearchQuery('')}>
              ✕
            </button>
          )}
        </div>

        <div className="asset-view-toggle">
          <button
            className={`view-mode-btn ${viewMode === 'grid' ? 'active' : ''}`}
            onClick={() => setViewMode('grid')}
            title="Grid View"
          >
            ▦
          </button>
          <button
            className={`view-mode-btn ${viewMode === 'list' ? 'active' : ''}`}
            onClick={() => setViewMode('list')}
            title="List View"
          >
            ≡
          </button>
        </div>
      </div>

      {/* Media Type Tabs & Action Bar */}
      <div className="asset-type-bar">
        {(['all', 'video', 'image', 'audio'] as const).map((kind) => (
          <button
            key={kind}
            className={`type-chip ${selectedKind === kind ? 'active' : ''}`}
            onClick={() => setSelectedKind(kind)}
          >
            {kind.toUpperCase()}
          </button>
        ))}

        <button className="btn-import-asset" onClick={onImportClick} title="Import media file">
          ＋ Import
        </button>
      </div>

      {/* Content Area */}
      <div className="asset-content-scroll">
        {filteredAssets.length === 0 ? (
          <div className="asset-empty-state">
            <span className="empty-icon">📁</span>
            <p>No assets found</p>
            <button className="btn-secondary" onClick={onImportClick}>
              Import Video, Audio, or Image
            </button>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="asset-grid">
            {filteredAssets.map((asset) => {
              const isSelected = asset.id === selectedAssetId;
              const kind = asset.type || inferMediaKind(asset.url);
              return (
                <div
                  key={asset.id}
                  className={`asset-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => setSelectedAssetId(asset.id)}
                  onDoubleClick={() => onAddAssetToComposition(asset)}
                  title={`${asset.name} - Double-click to add to composition`}
                >
                  <div className="asset-thumbnail">
                    {kind === 'image' && asset.url ? (
                      <img src={asset.url} alt={asset.name} />
                    ) : kind === 'video' ? (
                      <div className="asset-thumb-icon video">🎬</div>
                    ) : (
                      <div className="asset-thumb-icon audio">🎵</div>
                    )}
                    <span className={`asset-kind-badge ${kind}`}>{kind}</span>
                  </div>
                  <div className="asset-info">
                    <span className="asset-name" title={asset.name}>
                      {asset.name}
                    </span>
                    <div className="asset-meta">
                      {asset.width && asset.height && (
                        <span>
                          {asset.width}×{asset.height}
                        </span>
                      )}
                      {asset.duration && <span>{asset.duration.toFixed(1)}s</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="asset-list">
            <div className="asset-list-header">
              <span>Name</span>
              <span>Type</span>
              <span>Dimensions</span>
              <span>Duration</span>
            </div>
            {filteredAssets.map((asset) => {
              const isSelected = asset.id === selectedAssetId;
              const kind = asset.type || inferMediaKind(asset.url);
              return (
                <div
                  key={asset.id}
                  className={`asset-list-row ${isSelected ? 'selected' : ''}`}
                  onClick={() => setSelectedAssetId(asset.id)}
                  onDoubleClick={() => onAddAssetToComposition(asset)}
                >
                  <span className="row-name">
                    {kind === 'video' ? '🎬' : kind === 'image' ? '🖼️' : '🎵'} {asset.name}
                  </span>
                  <span className="row-type">{kind}</span>
                  <span className="row-dim">
                    {asset.width && asset.height ? `${asset.width}×${asset.height}` : '—'}
                  </span>
                  <span className="row-dur">
                    {asset.duration ? `${asset.duration.toFixed(2)}s` : '—'}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Selected Asset Actions footer */}
      {selectedAsset && (
        <div className="asset-footer-action">
          <div className="asset-footer-name">
            <strong>{selectedAsset.name}</strong>
          </div>
          <button
            className="btn-add-layer"
            onClick={() => onAddAssetToComposition(selectedAsset)}
            title="Create layer from asset"
          >
            ＋ Add to Composition
          </button>
          {onDeleteAsset && (
            <button
              className="btn-delete-asset"
              onClick={() => onDeleteAsset(selectedAsset.id)}
              title="Remove asset"
            >
              🗑
            </button>
          )}
        </div>
      )}
    </div>
  );
};
