import React, { useState } from 'react';
import { compositionAudio, defaultLayerAudio, type Composition, type LayerAudio } from '../model';

interface AudioMixerPanelProps {
  composition: Composition;
  isPlaying: boolean;
  onUpdateFrequency?: (layerId: string, freq: number) => void;
  /** Change a layer's volume and/or mute. */
  onUpdateAudio?: (layerId: string, change: Partial<LayerAudio>) => void;
}

/** Fader position (0-100, 80 = unity) <-> linear gain. The readout under a fader is in dB: (position - 80) / 2. */
export const faderToGain = (position: number): number => (position <= 0 ? 0 : 10 ** (((position - 80) * 0.5) / 20));
export const gainToFader = (gain: number): number =>
  gain <= 0 ? 0 : Math.min(100, Math.max(0, Math.round(80 + 40 * Math.log10(gain))));

export const AudioMixerPanel: React.FC<AudioMixerPanelProps> = ({
  composition,
  isPlaying,
  onUpdateFrequency,
  onUpdateAudio,
}) => {
  // The master strip is not part of the project yet: it stays a local control.
  const [masterVolume, setMasterVolume] = useState(80);

  // Audio layers, and video layers that have a file behind them (their sound is part of the mix).
  const strips = composition.layers.filter((l) => l.type === 'audio' || (l.type === 'video' && l.content.mediaUrl));
  const format = compositionAudio(composition);

  return (
    <div className="audio-mixer-container">
      <div className="audio-mixer-header">
        <strong>Audio Console Mixer</strong>
        <span>
          {strips.length} Tracks · {(format.sampleRate / 1000).toFixed(1)} kHz {format.channels === 1 ? 'Mono' : 'Stereo'}
        </span>
      </div>

      <div className="mixer-strips-scroll">
        {strips.length === 0 ? (
          <div className="mixer-empty-note">
            No audio tracks in composition. Add an Audio layer from the top bar.
          </div>
        ) : (
          strips.map((layer, index) => {
            const mix = layer.audio ?? defaultLayerAudio();
            const position = gainToFader(mix.volume);
            const muted = mix.muted;
            const isSynth = layer.type === 'audio' && !layer.content.mediaUrl;
            const freq = layer.content.audioFreq || 440;

            // Simulated meter heights based on playback and volume
            const meterHeight = isPlaying && !muted ? Math.min(100, (position / 100) * (70 + (index % 3) * 10)) : 0;

            return (
              <div key={layer.id} className="mixer-channel-strip">
                <div className="strip-title" title={layer.name}>
                  {layer.name}
                </div>

                {/* Tone freq control: only for synth tracks, imported audio has no tone */}
                <div className="strip-freq-control">
                  {isSynth ? (
                    <>
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
                    </>
                  ) : (
                    <span>{layer.type === 'video' ? 'Video audio' : 'Media'}</span>
                  )}
                </div>

                {/* VU Meter and Fader */}
                <div className="strip-fader-row">
                  <div className="vu-meter">
                    <div className="vu-fill" style={{ height: `${meterHeight}%` }} />
                  </div>

                  <div className="fader-track">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={muted ? 0 : position}
                      className="vertical-fader"
                      onChange={(e) => {
                        const next = Number(e.target.value);
                        // dragging a muted fader up un-mutes the track
                        onUpdateAudio?.(layer.id, { volume: faderToGain(next), ...(muted && next > 0 ? { muted: false } : {}) });
                      }}
                    />
                  </div>
                </div>

                <div className="strip-db-readout">{muted || position === 0 ? '-INF' : `${Math.round((position - 80) * 0.5)} dB`}</div>

                <div className="strip-buttons">
                  <button
                    className={`strip-btn mute ${muted ? 'active' : ''}`}
                    onClick={() => onUpdateAudio?.(layer.id, { muted: !muted })}
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
              <div className="vu-fill master" style={{ height: `${isPlaying ? (masterVolume / 100) * 85 : 0}%` }} />
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
