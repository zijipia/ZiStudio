import React, { useState } from 'react';
import type { BlendMode, Layer } from '../model';

interface LayerPanelProps {
  layers: Layer[];
  selectedLayerId: string | null;
  onSelectLayer: (layerId: string) => void;
  onToggleVisibility: (layerId: string) => void;
  onToggleLock: (layerId: string) => void;
  onToggleSolo: (layerId: string) => void;
  onToggle3D: (layerId: string) => void;
  onChangeBlendMode: (layerId: string, mode: BlendMode) => void;
  onChangeParent: (layerId: string, parentId: string | null) => void;
  onRenameLayer: (layerId: string, newName: string) => void;
  onReorderLayer: (fromIndex: number, toIndex: number) => void;
  onDuplicateLayer: (layerId: string) => void;
  onSplitLayer: (layerId: string) => void;
  onDeleteLayer: (layerId: string) => void;
  onContextMenu: (e: React.MouseEvent, layer: Layer) => void;
}

function calculateTargetIndex(
  dragIndex: number,
  hoverIndex: number,
  position: 'above' | 'below'
): number {
  if (dragIndex === hoverIndex) return dragIndex;
  if (dragIndex < hoverIndex) {
    return position === 'below' ? hoverIndex : hoverIndex - 1;
  } else {
    return position === 'above' ? hoverIndex : hoverIndex + 1;
  }
}

export const LayerPanel: React.FC<LayerPanelProps> = ({
  layers,
  selectedLayerId,
  onSelectLayer,
  onToggleVisibility,
  onToggleLock,
  onToggleSolo,
  onToggle3D,
  onChangeBlendMode,
  onChangeParent,
  onRenameLayer,
  onReorderLayer,
  onDuplicateLayer,
  onSplitLayer,
  onDeleteLayer,
  onContextMenu,
}) => {
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Drag-and-drop state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [dropPosition, setDropPosition] = useState<'above' | 'below' | null>(null);

  const startRename = (layer: Layer) => {
    setEditingLayerId(layer.id);
    setRenameValue(layer.name);
  };

  const commitRename = (layerId: string) => {
    if (renameValue.trim()) {
      onRenameLayer(layerId, renameValue.trim());
    }
    setEditingLayerId(null);
  };

  // Drag handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.setData('text/plain', String(index));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedIndex === null) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const isBelow = offsetY > rect.height / 2;
    const position = isBelow ? 'below' : 'above';

    if (dragOverIndex !== index || dropPosition !== position) {
      setDragOverIndex(index);
      setDropPosition(position);
    }
  };

  const handleDragLeave = (e: React.DragEvent, index: number) => {
    // Only clear if leaving to outside the row
    const rect = e.currentTarget.getBoundingClientRect();
    if (
      e.clientX < rect.left ||
      e.clientX > rect.right ||
      e.clientY < rect.top ||
      e.clientY > rect.bottom
    ) {
      if (dragOverIndex === index) {
        setDragOverIndex(null);
        setDropPosition(null);
      }
    }
  };

  const handleDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const isBelow = offsetY > rect.height / 2;
    const position = isBelow ? 'below' : 'above';

    const targetIndex = calculateTargetIndex(draggedIndex, index, position);
    if (targetIndex !== draggedIndex && targetIndex >= 0 && targetIndex < layers.length) {
      onReorderLayer(draggedIndex, targetIndex);
    }

    setDraggedIndex(null);
    setDragOverIndex(null);
    setDropPosition(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
    setDropPosition(null);
  };

  return (
    <div className="layer-panel-container">
      {/* Table Header */}
      <div className="layer-panel-header">
        <span className="col-drag" title="Drag to reorder layers">⠿</span>
        <span className="col-idx">#</span>
        <span className="col-icons">Modes</span>
        <span className="col-name">Layer Name</span>
        <span className="col-blend">Blend</span>
        <span className="col-parent">Parent</span>
        <span className="col-actions">Order</span>
      </div>

      {/* Layers List */}
      <div className="layer-panel-list" onDragOver={(e) => e.preventDefault()}>
        {layers.length === 0 ? (
          <div className="layer-empty-note">No layers in active composition.</div>
        ) : (
          layers.map((layer, index) => {
            const isSelected = layer.id === selectedLayerId;
            const otherLayers = layers.filter((l) => l.id !== layer.id);
            const isDragging = draggedIndex === index;
            const isDropAbove = dragOverIndex === index && dropPosition === 'above';
            const isDropBelow = dragOverIndex === index && dropPosition === 'below';

            return (
              <div
                key={layer.id}
                className={`layer-row ${isSelected ? 'selected' : ''} ${
                  layer.locked ? 'locked' : ''
                } ${isDragging ? 'is-dragging' : ''} ${
                  isDropAbove ? 'drop-target-above' : ''
                } ${isDropBelow ? 'drop-target-below' : ''}`}
                draggable={editingLayerId !== layer.id}
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragLeave={(e) => handleDragLeave(e, index)}
                onDrop={(e) => handleDrop(e, index)}
                onDragEnd={handleDragEnd}
                onClick={() => onSelectLayer(layer.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  onSelectLayer(layer.id);
                  onContextMenu(e, layer);
                }}
              >
                {/* Drag Handle */}
                <span
                  className="col-drag drag-handle"
                  title="Drag to reorder layer in composition stack"
                >
                  ⠿
                </span>

                {/* Index & Type badge */}
                <span className="col-idx">
                  <span className={`layer-type-dot ${layer.type}`}>{index + 1}</span>
                </span>

                {/* Toggles: Vis, Lock, Solo, 3D */}
                <div className="col-icons" onMouseDown={(e) => e.stopPropagation()}>
                  <button
                    className={`layer-btn-icon ${layer.visible ? 'active' : 'inactive'}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleVisibility(layer.id);
                    }}
                    title={layer.visible ? 'Hide Layer' : 'Show Layer'}
                  >
                    {layer.visible ? '👁' : '─'}
                  </button>

                  <button
                    className={`layer-btn-icon ${layer.locked ? 'active-lock' : 'inactive'}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleLock(layer.id);
                    }}
                    title={layer.locked ? 'Unlock Layer' : 'Lock Layer'}
                  >
                    {layer.locked ? '🔒' : '🔓'}
                  </button>

                  <button
                    className={`layer-btn-icon ${layer.solo ? 'active-solo' : 'inactive'}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleSolo(layer.id);
                    }}
                    title={layer.solo ? 'Solo Active' : 'Solo Layer'}
                  >
                    ★
                  </button>

                  <button
                    className={`layer-btn-icon ${layer.is3D ? 'active-3d' : 'inactive'}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggle3D(layer.id);
                    }}
                    title={layer.is3D ? '3D Layer Active' : 'Switch to 3D Layer'}
                  >
                    🧊
                  </button>
                </div>

                {/* Layer Name with inline rename */}
                <div
                  className="col-name"
                  onDoubleClick={() => startRename(layer)}
                  onMouseDown={(e) => editingLayerId === layer.id && e.stopPropagation()}
                >
                  {editingLayerId === layer.id ? (
                    <input
                      type="text"
                      className="layer-rename-input"
                      value={renameValue}
                      autoFocus
                      draggable={false}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => commitRename(layer.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename(layer.id);
                        else if (e.key === 'Escape') setEditingLayerId(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span className="layer-name-text" title={layer.name}>
                      {layer.name}
                    </span>
                  )}
                </div>

                {/* Blend Mode selector */}
                <div
                  className="col-blend"
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <select
                    className="layer-select"
                    value={layer.blendMode || 'source-over'}
                    onChange={(e) => onChangeBlendMode(layer.id, e.target.value as BlendMode)}
                  >
                    <option value="source-over">Normal</option>
                    <option value="multiply">Multiply</option>
                    <option value="screen">Screen</option>
                    <option value="overlay">Overlay</option>
                    <option value="lighter">Add</option>
                    <option value="difference">Difference</option>
                    <option value="exclusion">Exclusion</option>
                  </select>
                </div>

                {/* Parent layer selector */}
                <div
                  className="col-parent"
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <select
                    className="layer-select"
                    value={layer.parentId || ''}
                    onChange={(e) => onChangeParent(layer.id, e.target.value || null)}
                  >
                    <option value="">None</option>
                    {otherLayers.map((ol) => (
                      <option key={ol.id} value={ol.id}>
                        {ol.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Reorder buttons */}
                <div
                  className="col-actions"
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <button
                    className="reorder-btn"
                    disabled={index === 0}
                    onClick={() => onReorderLayer(index, index - 1)}
                    title="Move Layer Up"
                  >
                    ▲
                  </button>
                  <button
                    className="reorder-btn"
                    disabled={index === layers.length - 1}
                    onClick={() => onReorderLayer(index, index + 1)}
                    title="Move Layer Down"
                  >
                    ▼
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
