import React, { useState } from 'react';
import type { Composition, Layer } from '../model';

interface AudioMixerPanelProps {
  composition: Composition;
  isPlaying: boolean;
  onUpdateFrequency?: (layerId: string, freq: number) => void;
}

export const AudioMixerPanel: React.FC<AudioMixerPanelProps> = ({
  composition,
  isPlaying,
  onUpdateFrequency,
}) => {
  const [masterVolume, setMasterVolume] = useState(80);
  const [trackVolumes, setTrackVolumes] = useState<Record<string, number>>({});
  const [trackMutes, setTrackMutes] = useState<Record<string, boolean>>({});

  const audioLayers = composition.layers.filter((l) => l.type === 'audio');

  const getVol = (id: string) => trackVolumes[id] ?? 80;
  const isMuted = (id: string) => trackMutes[id] ?? false;

  const toggleMute = (id: string) => {
    setTrackMutes((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const setVol = (id: string, val: number) => {
    setTrackVolumes((prev) => ({ ...prev, [id]: val }));
  };

  return (
    <div className="audio-mixer-container">
      <div className="audio-mixer-header">
        <strong>Audio Console Mixer</strong>
        <span>
          {audioLayers.length} Active Tracks · 48.0 kHz 24-bit Stereo Pipeline
        </span>
      </div>

      <div className="mixer-strips-scroll">
        {/* Track Strips */}
        {audioLayers.length === 0 ? (
          <div className="mixer-empty-note">
            No audio tracks in composition. Add an Audio layer from the top bar.
          </div>
        ) : (
          audioLayers.map((layer, index) => {
            const vol = getVol(layer.id);
            const muted = isMuted(layer.id);
            const freq = layer.content.audioFreq || 440;

            // Simulated meter heights based on playback and volume
            const meterHeight = isPlaying && !muted ? Math.min(100, (vol / 100) * (70 + (index % 3) * 10)) : 0;

            return (
              <div key={layer.id} className="mixer-channel-strip">
                <div className="strip-title" title={layer.name}>
                  {layer.name}
                </div>

                {/* Tone freq control */}
                <div className="strip-freq-control">
                  <span>{freq} Hz</span>
                  {onUpdateFrequency && (
                    <input
                      type="range"
                      min="100"
                      max="1200"
                      step="20"
                      value={freq}
                      className="mixer-freq-slider"
                      onChange={(e) => onUpdateFrequency(layer.id, Number(e.target.value))}
                    />
                  )}
                </div>

                {/* VU Meter and Fader */}
                <div className="strip-fader-row">
                  {/* Stereo VU Meter */}
                  <div className="vu-meter">
                    <div
                      className="vu-fill"
                      style={{ height: `${meterHeight}%` }}
                    />
                  </div>

                  {/* Volume Slider */}
                  <div className="fader-track">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={muted ? 0 : vol}
                      className="vertical-fader"
                      onChange={(e) => setVol(layer.id, Number(e.target.value))}
                    />
                  </div>
                </div>

                <div className="strip-db-readout">
                  {muted ? '-INF' : `${Math.round((vol - 80) * 0.5)} dB`}
                </div>

                {/* Mute and Solo buttons */}
                <div className="strip-buttons">
                  <button
                    className={`strip-btn mute ${muted ? 'active' : ''}`}
                    onClick={() => toggleMute(layer.id)}
                  >
                    M
                  </button>
                  <button className="strip-btn solo">S</button>
                </div>
              </div>
            );
          })
        )}

        {/* Master Output Channel */}
        <div className="mixer-channel-strip master-strip">
          <div className="strip-title master">MASTER</div>
          <div className="strip-freq-control">
            <span>Stereo Mix</span>
          </div>

          <div className="strip-fader-row">
            <div className="vu-meter stereo">
              <div
                className="vu-fill master"
                style={{ height: `${isPlaying ? (masterVolume / 100) * 85 : 0}%` }}
              />
            </div>
            <div className="fader-track">
              <input
                type="range"
                min="0"
                max="100"
                value={masterVolume}
                className="vertical-fader"
                onChange={(e) => setMasterVolume(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="strip-db-readout">
            {masterVolume === 0 ? '-INF' : `${Math.round((masterVolume - 80) * 0.5)} dB`}
          </div>

          <div className="strip-buttons">
            <button className="strip-btn mute">M</button>
            <button className="strip-btn limiter" title="Peak Limiter Active">
              LIM
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
