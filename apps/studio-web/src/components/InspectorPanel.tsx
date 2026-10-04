import React, { useState } from 'react';
import { evaluateProperty } from '../animation';
import type { Effect, EffectType, Keyframe, Layer, Property } from '../model';

interface InspectorPanelProps {
  layer: Layer | null;
  currentTime: number;
  onNumericPropertyChange: (
    propertyPath: 'position' | 'scale' | 'rotation' | 'opacity',
    axisIndex: number | null,
    val: number
  ) => void;
  onToggleKeyframe: (propertyPath: 'position' | 'scale' | 'rotation' | 'opacity') => void;
  onNavigateKeyframe: (
    propertyPath: 'position' | 'scale' | 'rotation' | 'opacity',
    direction: -1 | 1
  ) => void;
  onUpdateContent: (contentUpdate: Partial<Layer['content']>) => void;
  onUpdateBlendMode: (blendMode: Layer['blendMode']) => void;
  onAddEffect: (effectType: EffectType) => void;
  onToggleEffect: (effectId: string, enabled: boolean) => void;
  onDeleteEffect: (effectId: string) => void;
  onUpdateEffectProp: (effectId: string, propKey: string, val: number) => void;
}

export const InspectorPanel: React.FC<InspectorPanelProps> = ({
  layer,
  currentTime,
  onNumericPropertyChange,
  onToggleKeyframe,
  onNavigateKeyframe,
  onUpdateContent,
  onUpdateBlendMode,
  onAddEffect,
  onToggleEffect,
  onDeleteEffect,
  onUpdateEffectProp,
}) => {
  const [activeTab, setActiveTab] = useState<'transform' | 'content' | 'effects'>('transform');

  if (!layer) {
    return (
      <div className="inspector-empty-state">
        <span className="empty-icon">🎯</span>
        <p>No layer selected</p>
        <span className="empty-sub">
          Select a layer from the timeline, layer list, or viewer to inspect and animate properties.
        </span>
      </div>
    );
  }

  // Keyframe status helper
  const hasKeyframeAtCurrent = (prop: Property<any>) => {
    return prop.keyframes.some((k) => Math.abs(k.time - currentTime) < 0.04);
  };

  return (
    <div className="inspector-panel-container">
      {/* Header Info */}
      <div className="inspector-header">
        <div className="inspector-title-row">
          <span className={`inspector-type-pill ${layer.type}`}>{layer.type}</span>
          <span className="inspector-layer-name">{layer.name}</span>
        </div>
        <div className="inspector-meta-row">
          <span>In: {layer.start.toFixed(2)}s</span>
          <span>Out: {(layer.start + layer.duration).toFixed(2)}s</span>
          <span>Dur: {layer.duration.toFixed(2)}s</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="inspector-tabs">
        <button
          className={`inspector-tab ${activeTab === 'transform' ? 'active' : ''}`}
          onClick={() => setActiveTab('transform')}
        >
          Transform
        </button>
        <button
          className={`inspector-tab ${activeTab === 'content' ? 'active' : ''}`}
          onClick={() => setActiveTab('content')}
        >
          Content
        </button>
        <button
          className={`inspector-tab ${activeTab === 'effects' ? 'active' : ''}`}
          onClick={() => setActiveTab('effects')}
        >
          Effects ({layer.effects.length})
        </button>
      </div>

      <div className="inspector-scroll-area">
        {activeTab === 'transform' && (
          <div className="inspector-section">
            {/* Position */}
            <div className="prop-row">
              <div className="prop-label-col">
                <div className="kf-nav-group">
                  <button
                    className="kf-nav-btn"
                    onClick={() => onNavigateKeyframe('position', -1)}
                    disabled={layer.transform.position.keyframes.length === 0}
                    title="Previous Keyframe"
                  >
                    ◂
                  </button>
                  <button
                    className={`kf-toggle-diamond ${
                      hasKeyframeAtCurrent(layer.transform.position)
                        ? 'has-current'
                        : layer.transform.position.keyframes.length > 0
                        ? 'has-keyframes'
                        : ''
                    }`}
                    onClick={() => onToggleKeyframe('position')}
                    title="Toggle Keyframe at Playhead"
                  >
                    ◇
                  </button>
                  <button
                    className="kf-nav-btn"
                    onClick={() => onNavigateKeyframe('position', 1)}
                    disabled={layer.transform.position.keyframes.length === 0}
                    title="Next Keyframe"
                  >
                    ▸
                  </button>
                </div>
                <span className="prop-name">Position</span>
              </div>
              <div className="prop-inputs-col">
                {['X', 'Y'].map((axis, i) => {
                  const cur = evaluateProperty(layer.transform.position, currentTime);
                  const val = Array.isArray(cur) ? Math.round(cur[i] ?? 0) : 0;
                  return (
                    <div key={axis} className="prop-num-box">
                      <span className="axis-label">{axis}</span>
                      <input
                        type="number"
                        className="prop-number-input"
                        value={val}
                        onChange={(e) =>
                          onNumericPropertyChange('position', i, Number(e.target.value))
                        }
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Scale */}
            <div className="prop-row">
              <div className="prop-label-col">
                <div className="kf-nav-group">
                  <button
                    className="kf-nav-btn"
                    onClick={() => onNavigateKeyframe('scale', -1)}
                    disabled={layer.transform.scale.keyframes.length === 0}
                    title="Previous Keyframe"
                  >
                    ◂
                  </button>
                  <button
                    className={`kf-toggle-diamond ${
                      hasKeyframeAtCurrent(layer.transform.scale)
                        ? 'has-current'
                        : layer.transform.scale.keyframes.length > 0
                        ? 'has-keyframes'
                        : ''
                    }`}
                    onClick={() => onToggleKeyframe('scale')}
                    title="Toggle Keyframe at Playhead"
                  >
                    ◇
                  </button>
                  <button
                    className="kf-nav-btn"
                    onClick={() => onNavigateKeyframe('scale', 1)}
                    disabled={layer.transform.scale.keyframes.length === 0}
                    title="Next Keyframe"
                  >
                    ▸
                  </button>
                </div>
                <span className="prop-name">Scale</span>
              </div>
              <div className="prop-inputs-col">
                {['X', 'Y'].map((axis, i) => {
                  const cur = evaluateProperty(layer.transform.scale, currentTime);
                  const val = Array.isArray(cur) ? Math.round(cur[i] ?? 100) : 100;
                  return (
                    <div key={axis} className="prop-num-box">
                      <span className="axis-label">{axis}</span>
                      <input
                        type="number"
                        className="prop-number-input"
                        value={val}
                        onChange={(e) =>
                          onNumericPropertyChange('scale', i, Number(e.target.value))
                        }
                      />
                      <span className="unit-label">%</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Rotation */}
            <div className="prop-row">
              <div className="prop-label-col">
                <div className="kf-nav-group">
                  <button
                    className="kf-nav-btn"
                    onClick={() => onNavigateKeyframe('rotation', -1)}
                    disabled={layer.transform.rotation.keyframes.length === 0}
                    title="Previous Keyframe"
                  >
                    ◂
                  </button>
                  <button
                    className={`kf-toggle-diamond ${
                      hasKeyframeAtCurrent(layer.transform.rotation)
                        ? 'has-current'
                        : layer.transform.rotation.keyframes.length > 0
                        ? 'has-keyframes'
                        : ''
                    }`}
                    onClick={() => onToggleKeyframe('rotation')}
                    title="Toggle Keyframe at Playhead"
                  >
                    ◇
                  </button>
                  <button
                    className="kf-nav-btn"
                    onClick={() => onNavigateKeyframe('rotation', 1)}
                    disabled={layer.transform.rotation.keyframes.length === 0}
                    title="Next Keyframe"
                  >
                    ▸
                  </button>
                </div>
                <span className="prop-name">Rotation</span>
              </div>
              <div className="prop-inputs-col">
                {(() => {
                  const cur = evaluateProperty(layer.transform.rotation, currentTime);
                  const val = Array.isArray(cur) ? Math.round(cur[0] ?? 0) : 0;
                  return (
                    <div className="prop-num-box">
                      <input
                        type="number"
                        className="prop-number-input"
                        value={val}
                        onChange={(e) =>
                          onNumericPropertyChange('rotation', 0, Number(e.target.value))
                        }
                      />
                      <span className="unit-label">°</span>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Opacity */}
            <div className="prop-row">
              <div className="prop-label-col">
                <div className="kf-nav-group">
                  <button
                    className="kf-nav-btn"
                    onClick={() => onNavigateKeyframe('opacity', -1)}
                    disabled={layer.transform.opacity.keyframes.length === 0}
                    title="Previous Keyframe"
                  >
                    ◂
                  </button>
                  <button
                    className={`kf-toggle-diamond ${
                      hasKeyframeAtCurrent(layer.transform.opacity)
                        ? 'has-current'
                        : layer.transform.opacity.keyframes.length > 0
                        ? 'has-keyframes'
                        : ''
                    }`}
                    onClick={() => onToggleKeyframe('opacity')}
                    title="Toggle Keyframe at Playhead"
                  >
                    ◇
                  </button>
                  <button
                    className="kf-nav-btn"
                    onClick={() => onNavigateKeyframe('opacity', 1)}
                    disabled={layer.transform.opacity.keyframes.length === 0}
                    title="Next Keyframe"
                  >
                    ▸
                  </button>
                </div>
                <span className="prop-name">Opacity</span>
              </div>
              <div className="prop-inputs-col full-slider">
                {(() => {
                  const cur = evaluateProperty(layer.transform.opacity, currentTime);
                  const val = Math.round(typeof cur === 'number' ? cur : 100);
                  return (
                    <>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        className="prop-slider"
                        value={val}
                        onChange={(e) =>
                          onNumericPropertyChange('opacity', null, Number(e.target.value))
                        }
                      />
                      <span className="slider-val">{val}%</span>
                    </>
                  );
                })()}
              </div>
            </div>

            {/* Blend Mode */}
            <div className="prop-row" style={{ marginTop: '12px' }}>
              <div className="prop-label-col">
                <span className="prop-name" style={{ marginLeft: '48px' }}>
                  Blend Mode
                </span>
              </div>
              <div className="prop-inputs-col">
                <select
                  className="inspector-select"
                  value={layer.blendMode}
                  onChange={(e) => onUpdateBlendMode(e.target.value as any)}
                >
                  <option value="source-over">Normal</option>
                  <option value="multiply">Multiply</option>
                  <option value="screen">Screen</option>
                  <option value="overlay">Overlay</option>
                  <option value="lighter">Add (Linear Dodge)</option>
                  <option value="difference">Difference</option>
                  <option value="exclusion">Exclusion</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'content' && (
          <div className="inspector-section">
            {layer.type === 'text' && (
              <>
                <div className="content-prop-block">
                  <label>Text Content</label>
                  <textarea
                    className="content-textarea"
                    value={layer.content.text || ''}
                    rows={3}
                    onChange={(e) => onUpdateContent({ text: e.target.value })}
                  />
                </div>
                <div className="content-prop-row">
                  <label>Font Size</label>
                  <input
                    type="number"
                    className="prop-number-input"
                    value={layer.content.fontSize || 48}
                    onChange={(e) => onUpdateContent({ fontSize: Number(e.target.value) })}
                  />
                </div>
                <div className="content-prop-row">
                  <label>Font Color</label>
                  <input
                    type="color"
                    className="prop-color-picker"
                    value={layer.content.fontColor || '#ffffff'}
                    onChange={(e) => onUpdateContent({ fontColor: e.target.value })}
                  />
                </div>
              </>
            )}

            {(layer.type === 'solid' || layer.type === 'shape') && (
              <>
                <div className="content-prop-row">
                  <label>Fill Color</label>
                  <input
                    type="color"
                    className="prop-color-picker"
                    value={layer.content.color || '#3b82f6'}
                    onChange={(e) => onUpdateContent({ color: e.target.value })}
                  />
                </div>
                {layer.type === 'shape' && (
                  <>
                    <div className="content-prop-row">
                      <label>Shape Type</label>
                      <select
                        className="inspector-select"
                        value={layer.content.shapeType || 'circle'}
                        onChange={(e) => onUpdateContent({ shapeType: e.target.value as any })}
                      >
                        <option value="circle">Circle</option>
                        <option value="rect">Rectangle</option>
                        <option value="star">Star</option>
                      </select>
                    </div>
                    <div className="content-prop-row">
                      <label>Stroke Color</label>
                      <input
                        type="color"
                        className="prop-color-picker"
                        value={layer.content.strokeColor || '#60a5fa'}
                        onChange={(e) => onUpdateContent({ strokeColor: e.target.value })}
                      />
                    </div>
                    <div className="content-prop-row">
                      <label>Stroke Width</label>
                      <input
                        type="number"
                        className="prop-number-input"
                        value={layer.content.strokeWidth || 4}
                        onChange={(e) => onUpdateContent({ strokeWidth: Number(e.target.value) })}
                      />
                    </div>
                  </>
                )}
              </>
            )}

            {layer.type === 'audio' && (
              <div className="content-prop-row">
                <label>Oscillator Freq (Hz)</label>
                <input
                  type="number"
                  className="prop-number-input"
                  value={layer.content.audioFreq || 440}
                  step={10}
                  onChange={(e) => onUpdateContent({ audioFreq: Number(e.target.value) })}
                />
              </div>
            )}

            {(layer.type === 'video' || layer.type === 'image') && (
              <div className="content-prop-block">
                <label>Media Stream</label>
                <code className="media-url-display">
                  {layer.content.mediaUrl || 'Default Composition Stream'}
                </code>
              </div>
            )}
          </div>
        )}

        {activeTab === 'effects' && (
          <div className="inspector-section">
            <div className="effects-add-row">
              <select
                className="inspector-select"
                onChange={(e) => {
                  if (e.target.value) {
                    onAddEffect(e.target.value as EffectType);
                    e.target.value = '';
                  }
                }}
              >
                <option value="">+ Add VFX Effect...</option>
                <option value="blur">Gaussian Blur</option>
                <option value="brightness-contrast">Brightness & Contrast</option>
                <option value="hue-saturation">Hue & Saturation</option>
                <option value="glow">Glow Effect</option>
                <option value="vignette">Vignette</option>
                <option value="invert">Color Invert</option>
              </select>
            </div>

            {layer.effects.length === 0 ? (
              <div className="effects-none-note">No effects applied to this layer.</div>
            ) : (
              layer.effects.map((effect) => (
                <div key={effect.id} className="effect-card">
                  <div className="effect-card-header">
                    <input
                      type="checkbox"
                      checked={effect.enabled}
                      onChange={(e) => onToggleEffect(effect.id, e.target.checked)}
                      title="Enable/Disable Effect"
                    />
                    <strong className="effect-title">{effect.name}</strong>
                    <button
                      className="btn-delete-effect"
                      onClick={() => onDeleteEffect(effect.id)}
                      title="Delete Effect"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="effect-props-list">
                    {Object.entries(effect.properties).map(([propKey, prop]) => {
                      const curVal = evaluateProperty(prop, currentTime);
                      const numVal = typeof curVal === 'number' ? curVal : 0;
                      return (
                        <div key={propKey} className="effect-prop-item">
                          <span className="effect-prop-name">{prop.name}</span>
                          <input
                            type="range"
                            min={prop.min ?? 0}
                            max={prop.max ?? 100}
                            value={numVal}
                            className="prop-slider"
                            onChange={(e) =>
                              onUpdateEffectProp(effect.id, propKey, Number(e.target.value))
                            }
                          />
                          <span className="slider-val">
                            {Math.round(numVal)}
                            {prop.unit || ''}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};
