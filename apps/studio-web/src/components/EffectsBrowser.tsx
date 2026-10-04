import React, { useState, useMemo } from 'react';
import { EffectType, createEffect } from '../model';

export interface EffectDefinition {
  type: EffectType;
  name: string;
  category: 'Blur' | 'Color' | 'Stylize' | 'Distortion';
  description: string;
  icon: string;
}

const EFFECT_LIBRARY: EffectDefinition[] = [
  {
    type: 'blur',
    name: 'Gaussian Blur',
    category: 'Blur',
    description: 'Smooths and hazes edges using standard Gaussian distribution.',
    icon: '💧',
  },
  {
    type: 'glow',
    name: 'Glow Effect',
    category: 'Stylize',
    description: 'Creates a luminous halo and neon aura around bright pixels.',
    icon: '✨',
  },
  {
    type: 'vignette',
    name: 'Vignette',
    category: 'Distortion',
    description: 'Gradually darkens the peripheral borders to focus viewer attention.',
    icon: '🔘',
  },
  {
    type: 'brightness-contrast',
    name: 'Brightness & Contrast',
    category: 'Color',
    description: 'Adjusts tonal range luminance and dynamic separation.',
    icon: '☀️',
  },
  {
    type: 'hue-saturation',
    name: 'Hue & Saturation',
    category: 'Color',
    description: 'Shifts color spectrum hue angles and intensifies color vibrancy.',
    icon: '🎨',
  },
  {
    type: 'invert',
    name: 'Color Invert',
    category: 'Color',
    description: 'Inverts all RGB chromatic values to their photographic negative.',
    icon: '🔄',
  },
];

interface EffectsBrowserProps {
  selectedLayerName?: string | null;
  onApplyEffect: (effectType: EffectType) => void;
}

export const EffectsBrowser: React.FC<EffectsBrowserProps> = ({
  selectedLayerName,
  onApplyEffect,
}) => {
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  const categories = ['All', 'Blur', 'Color', 'Stylize', 'Distortion'];

  const filteredEffects = useMemo(() => {
    return EFFECT_LIBRARY.filter((effect) => {
      const matchesSearch =
        effect.name.toLowerCase().includes(query.toLowerCase()) ||
        effect.description.toLowerCase().includes(query.toLowerCase());
      const matchesCat = selectedCategory === 'All' || effect.category === selectedCategory;
      return matchesSearch && matchesCat;
    });
  }, [query, selectedCategory]);

  return (
    <div className="effects-browser-container">
      {/* Search Header */}
      <div className="effects-search-header">
        <input
          type="text"
          className="effects-search-input"
          placeholder="Search VFX effects..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button className="clear-btn" onClick={() => setQuery('')}>
            ✕
          </button>
        )}
      </div>

      {/* Category Pills */}
      <div className="effects-category-bar">
        {categories.map((cat) => (
          <button
            key={cat}
            className={`category-pill ${selectedCategory === cat ? 'active' : ''}`}
            onClick={() => setSelectedCategory(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Target Layer Indicator */}
      <div className="effects-target-indicator">
        {selectedLayerName ? (
          <span>Target: <strong>{selectedLayerName}</strong></span>
        ) : (
          <span className="no-target">Select a layer to apply effects</span>
        )}
      </div>

      {/* Effects List */}
      <div className="effects-list-scroll">
        {filteredEffects.map((item) => (
          <div key={item.type} className="effect-catalog-card">
            <div className="effect-card-top">
              <span className="effect-icon">{item.icon}</span>
              <div className="effect-card-info">
                <span className="effect-name">{item.name}</span>
                <span className="effect-cat-tag">{item.category}</span>
              </div>
              <button
                className="btn-apply-effect"
                disabled={!selectedLayerName}
                onClick={() => onApplyEffect(item.type)}
                title={
                  selectedLayerName
                    ? `Apply ${item.name} to ${selectedLayerName}`
                    : 'Select a layer first'
                }
              >
                ＋ Apply
              </button>
            </div>
            <p className="effect-desc">{item.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
};
