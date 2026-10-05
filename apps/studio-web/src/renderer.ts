import { evaluateProperty, evaluateTransform } from './animation';
import type { Composition, Layer } from './model';
import type { FrameProvider } from './runtime/frame-provider';

export interface RenderOptions {
  showGuides?: boolean;
  showSafeAreas?: boolean;
  showGrid?: boolean;
  showCheckerboard?: boolean;
  selectedLayerId?: string | null;
  interactiveGizmo?: boolean;
  resolution?: number;
  channelMode?: 'rgb' | 'red' | 'green' | 'blue' | 'alpha';
  /** Render only the composition at 1:1 (no editor background, checkerboard, border, guides or gizmo). */
  exportMode?: boolean;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class CompositionRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private offscreenCanvas: HTMLCanvasElement;
  private offscreenCtx: CanvasRenderingContext2D;
  private imageCache = new Map<string, HTMLImageElement>();
  private readonly frames: FrameProvider | null;

  constructor(canvas: HTMLCanvasElement, frames: FrameProvider | null = null) {
    this.canvas = canvas;
    this.frames = frames;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Could not get 2D rendering context');
    this.ctx = ctx;

    this.offscreenCanvas = document.createElement('canvas');
    const offCtx = this.offscreenCanvas.getContext('2d', { willReadFrequently: true });
    if (!offCtx) throw new Error('Could not get offscreen 2D context');
    this.offscreenCtx = offCtx;
  }

  render(
    composition: Composition,
    time: number,
    zoom = 1,
    pan: [number, number] = [0, 0],
    options: RenderOptions = {}
  ): Map<string, BoundingBox> {
    const { ctx, canvas } = this;
    const { width: compWidth, height: compHeight } = composition;

    // Set offscreen canvas to match composition size
    if (this.offscreenCanvas.width !== compWidth || this.offscreenCanvas.height !== compHeight) {
      this.offscreenCanvas.width = compWidth;
      this.offscreenCanvas.height = compHeight;
    }

    const oCtx = this.offscreenCtx;

    // Clear main canvas
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const exporting = options.exportMode === true;

    // Fill background with editor dark neutral (export: opaque black, composition only)
    ctx.fillStyle = exporting ? '#000000' : '#090b0e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Calculate composition transform in viewport
    const centerX = exporting ? compWidth / 2 : canvas.width / 2 + pan[0];
    const centerY = exporting ? compHeight / 2 : canvas.height / 2 + pan[1];
    if (exporting) zoom = 1;

    ctx.translate(centerX, centerY);
    ctx.scale(zoom, zoom);
    ctx.translate(-compWidth / 2, -compHeight / 2);

    // Draw checkerboard behind composition area
    if (!exporting) this.drawCheckerboard(ctx, compWidth, compHeight);

    // Clear composition offscreen buffer
    oCtx.clearRect(0, 0, compWidth, compHeight);

    // Render layers back-to-front
    // Reverse layer list because top layers are first in composition.layers
    const reversedLayers = [...composition.layers].reverse();
    const layerBoundsMap = new Map<string, BoundingBox>();

    for (const layer of reversedLayers) {
      if (!layer.visible) continue;
      if (time < layer.start || time > layer.start + layer.duration) continue;

      this.renderLayer(layer, time, compWidth, compHeight, oCtx, layerBoundsMap);
    }

    // Draw composition buffer to viewport canvas
    ctx.drawImage(this.offscreenCanvas, 0, 0);

    if (exporting) {
      ctx.restore();
      return layerBoundsMap;
    }

    // Draw composition outer border
    ctx.strokeStyle = '#384252';
    ctx.lineWidth = 1.5 / zoom;
    ctx.strokeRect(0, 0, compWidth, compHeight);

    // Draw safe-area guides if enabled
    if (options.showGuides) {
      this.drawGuides(ctx, compWidth, compHeight, zoom);
    }

    // Draw rule-of-thirds grid if enabled
    if (options.showGrid) {
      this.drawGrid(ctx, compWidth, compHeight, zoom);
    }

    // Draw selection gizmo on selected layer
    if (options.selectedLayerId && options.interactiveGizmo !== false) {
      const selectedLayer = composition.layers.find(l => l.id === options.selectedLayerId);
      if (selectedLayer && selectedLayer.visible && time >= selectedLayer.start && time <= selectedLayer.start + selectedLayer.duration) {
        this.drawLayerGizmo(ctx, selectedLayer, time, compWidth, compHeight, zoom);
      }
    }

    ctx.restore();
    return layerBoundsMap;
  }

  private renderLayer(
    layer: Layer,
    time: number,
    compWidth: number,
    compHeight: number,
    ctx: CanvasRenderingContext2D,
    boundsMap: Map<string, BoundingBox>
  ) {
    const transform = evaluateTransform(layer.transform, time);
    if (transform.opacity <= 0) return;

    ctx.save();

    // Position is relative to composition center
    const posX = compWidth / 2 + transform.position[0];
    const posY = compHeight / 2 + transform.position[1];
    const scaleX = transform.scale[0] / 100;
    const scaleY = transform.scale[1] / 100;
    const rotRad = (transform.rotation[0] * Math.PI) / 180;

    ctx.translate(posX, posY);
    ctx.rotate(rotRad);
    ctx.scale(scaleX, scaleY);
    ctx.globalAlpha = transform.opacity / 100;

    // Apply blend mode
    ctx.globalCompositeOperation = (layer.blendMode || 'source-over') as GlobalCompositeOperation;

    // Apply CSS filters / VFX effects
    let filterString = '';
    let glowEffect = null;
    let vignetteEffect = null;

    for (const effect of layer.effects) {
      if (!effect.enabled) continue;
      if (effect.type === 'blur') {
        const radius = evaluateProperty(effect.properties.radius, time) || 0;
        filterString += ` blur(${radius}px)`;
      } else if (effect.type === 'brightness-contrast') {
        const b = evaluateProperty(effect.properties.brightness, time) || 0;
        const c = evaluateProperty(effect.properties.contrast, time) || 0;
        filterString += ` brightness(${100 + b}%) contrast(${100 + c}%)`;
      } else if (effect.type === 'hue-saturation') {
        const h = evaluateProperty(effect.properties.hue, time) || 0;
        const s = evaluateProperty(effect.properties.saturation, time) || 0;
        filterString += ` hue-rotate(${h}deg) saturate(${100 + s}%)`;
      } else if (effect.type === 'invert') {
        filterString += ' invert(100%)';
      } else if (effect.type === 'glow') {
        glowEffect = effect;
      } else if (effect.type === 'vignette') {
        vignetteEffect = effect;
      }
    }

    ctx.filter = filterString.trim() || 'none';

    // Apply glow if active
    if (glowEffect) {
      const radius = evaluateProperty(glowEffect.properties.radius, time) || 12;
      ctx.shadowColor = '#60a5fa';
      ctx.shadowBlur = radius * 1.5;
    }

    // Render by type
    let w = 200;
    let h = 200;

    switch (layer.type) {
      case 'solid': {
        w = compWidth;
        h = compHeight;
        ctx.fillStyle = layer.content.color || '#3b82f6';
        ctx.fillRect(-w / 2, -h / 2, w, h);
        break;
      }

      case 'text': {
        const text = layer.content.text || layer.name;
        const fontSize = layer.content.fontSize || 48;
        const fontColor = layer.content.fontColor || '#ffffff';
        ctx.font = `600 ${fontSize}px "Inter", system-ui, -apple-system, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const metrics = ctx.measureText(text);
        w = metrics.width + 20;
        h = fontSize * 1.4;

        // Text subtle shadow for readability
        ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
        ctx.shadowBlur = 6;
        ctx.fillStyle = fontColor;
        ctx.fillText(text, 0, 0);
        break;
      }

      case 'shape': {
        w = 320;
        h = 320;
        const color = layer.content.color || '#3b82f6';
        const strokeColor = layer.content.strokeColor;
        const strokeWidth = layer.content.strokeWidth || 0;

        ctx.fillStyle = color;
        if (strokeColor && strokeWidth > 0) {
          ctx.strokeStyle = strokeColor;
          ctx.lineWidth = strokeWidth;
        }

        const shape = layer.content.shapeType || 'circle';
        if (shape === 'circle') {
          ctx.beginPath();
          ctx.arc(0, 0, w / 2, 0, Math.PI * 2);
          ctx.fill();
          if (strokeColor && strokeWidth > 0) ctx.stroke();
        } else if (shape === 'rect') {
          ctx.fillRect(-w / 2, -h / 2, w, h);
          if (strokeColor && strokeWidth > 0) ctx.strokeRect(-w / 2, -h / 2, w, h);
        } else if (shape === 'star') {
          this.drawStar(ctx, 0, 0, 5, w / 2, w / 4);
          ctx.fill();
          if (strokeColor && strokeWidth > 0) ctx.stroke();
        }
        break;
      }

      case 'video':
      case 'image': {
        w = 960;
        h = 540;
        let drawn = false;
        let status: string = 'none';

        if (this.frames) {
          // Real media path: frames come from the MediaController (decoded asynchronously).
          const resolved = this.frames.resolve(layer, time);
          status = resolved.status;
          if (resolved.frame) {
            w = resolved.frame.width;
            h = resolved.frame.height;
            ctx.drawImage(resolved.frame.source as CanvasImageSource, -w / 2, -h / 2, w, h);
            drawn = true;
          } else {
            const dims = this.frames.getDimensions(layer);
            if (dims) {
              w = dims.width;
              h = dims.height;
            }
          }
        } else {
          // Legacy fallback (no provider): still images only.
          const mediaUrl = layer.content.mediaUrl;
          if (mediaUrl && layer.type === 'image') {
            let img = this.imageCache.get(mediaUrl);
            if (!img) {
              img = new Image();
              img.src = mediaUrl;
              this.imageCache.set(mediaUrl, img);
            }
            if (img.complete && img.naturalWidth > 0) {
              w = img.naturalWidth;
              h = img.naturalHeight;
              ctx.drawImage(img, -w / 2, -h / 2, w, h);
              drawn = true;
            }
          }
        }

        if (!drawn) this.drawMediaPlaceholder(ctx, w, h, layer.name, status);
        break;
      }

      case 'audio': {
        // Visual oscilloscope waveform for audio layer
        w = compWidth * 0.7;
        h = 90;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.fillRect(-w / 2, -h / 2, w, h);
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 2;
        ctx.beginPath();
        const segments = 64;
        for (let i = 0; i <= segments; i++) {
          const x = -w / 2 + (i / segments) * w;
          const freq = (layer.content.audioFreq || 440) * 0.05;
          const amp = Math.sin(time * 12 + i * freq) * Math.cos(i * 0.1) * 32;
          if (i === 0) ctx.moveTo(x, amp);
          else ctx.lineTo(x, amp);
        }
        ctx.stroke();

        ctx.fillStyle = '#4ade80';
        ctx.font = '12px Inter, sans-serif';
        ctx.fillText(`AUDIO: ${layer.name} (${layer.content.audioFreq || 440}Hz)`, -w / 2 + 15, -h / 2 + 18);
        break;
      }

      case 'adjustment': {
        // Overlay vignette or color grading
        w = compWidth;
        h = compHeight;
        break;
      }
    }

    // Apply vignette overlay if active
    if (vignetteEffect) {
      const amount = (evaluateProperty(vignetteEffect.properties.amount, time) || 50) / 100;
      const rad = Math.max(w, h) * 0.7;
      const vigGrad = ctx.createRadialGradient(0, 0, rad * 0.2, 0, 0, rad);
      vigGrad.addColorStop(0, 'rgba(0,0,0,0)');
      vigGrad.addColorStop(1, `rgba(0,0,0,${amount})`);
      ctx.fillStyle = vigGrad;
      ctx.fillRect(-w / 2, -h / 2, w, h);
    }

    boundsMap.set(layer.id, {
      x: posX - (w * scaleX) / 2,
      y: posY - (h * scaleY) / 2,
      width: w * scaleX,
      height: h * scaleY,
    });

    ctx.restore();
  }

  private drawMediaPlaceholder(ctx: CanvasRenderingContext2D, w: number, h: number, name: string, status: string) {
    const offline = status === 'error';
    const grad = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
    if (offline) {
      grad.addColorStop(0, '#3f1d1d');
      grad.addColorStop(1, '#7f1d1d');
    } else {
      grad.addColorStop(0, '#1e293b');
      grad.addColorStop(0.5, '#0ea5e9');
      grad.addColorStop(1, '#6366f1');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.strokeRect(-w / 2, -h / 2, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.font = '500 24px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = offline ? 'MEDIA OFFLINE' : status === 'loading' ? 'LOADING MEDIA…' : 'MEDIA';
    ctx.fillText(`[${label}: ${name}]`, 0, 0);
  }

  private drawLayerGizmo(
    ctx: CanvasRenderingContext2D,
    layer: Layer,
    time: number,
    compWidth: number,
    compHeight: number,
    zoom: number
  ) {
    const transform = evaluateTransform(layer.transform, time);
    const posX = compWidth / 2 + transform.position[0];
    const posY = compHeight / 2 + transform.position[1];
    const scaleX = transform.scale[0] / 100;
    const scaleY = transform.scale[1] / 100;
    const rotRad = (transform.rotation[0] * Math.PI) / 180;

    let w = 240;
    let h = 240;
    if (layer.type === 'solid' || layer.type === 'adjustment') {
      w = compWidth;
      h = compHeight;
    } else if (layer.type === 'shape') {
      w = 320;
      h = 320;
    } else if (layer.type === 'video' || layer.type === 'image') {
      const dims = this.frames?.getDimensions(layer);
      w = dims?.width ?? 960;
      h = dims?.height ?? 540;
    } else if (layer.type === 'text') {
      w = (layer.content.text?.length || 10) * 32;
      h = (layer.content.fontSize || 48) * 1.5;
    }

    ctx.save();
    ctx.translate(posX, posY);
    ctx.rotate(rotRad);

    const halfW = (w * scaleX) / 2;
    const halfH = (h * scaleY) / 2;

    // Selection box outline
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5 / zoom;
    ctx.strokeRect(-halfW, -halfH, halfW * 2, halfH * 2);

    // Center crosshair / anchor point
    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 1.5 / zoom;
    ctx.beginPath();
    ctx.arc(0, 0, 5 / zoom, 0, Math.PI * 2);
    ctx.moveTo(-9 / zoom, 0);
    ctx.lineTo(9 / zoom, 0);
    ctx.moveTo(0, -9 / zoom);
    ctx.lineTo(0, 9 / zoom);
    ctx.stroke();

    // Corner handles
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#0284c7';
    const handleSize = 6 / zoom;
    const corners = [
      [-halfW, -halfH],
      [halfW, -halfH],
      [halfW, halfH],
      [-halfW, halfH],
      [0, -halfH],
      [halfW, 0],
      [0, halfH],
      [-halfW, 0],
    ];

    for (const [cx, cy] of corners) {
      ctx.fillRect(cx - handleSize / 2, cy - handleSize / 2, handleSize, handleSize);
      ctx.strokeRect(cx - handleSize / 2, cy - handleSize / 2, handleSize, handleSize);
    }

    ctx.restore();
  }

  private drawGuides(ctx: CanvasRenderingContext2D, width: number, height: number, zoom: number) {
    ctx.save();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
    ctx.lineWidth = 1 / zoom;
    ctx.setLineDash([4 / zoom, 4 / zoom]);

    // Center cross
    ctx.beginPath();
    ctx.moveTo(width / 2, 0);
    ctx.lineTo(width / 2, height);
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    // Action Safe (93%)
    const asMarginX = width * 0.035;
    const asMarginY = height * 0.035;
    ctx.strokeRect(asMarginX, asMarginY, width - asMarginX * 2, height - asMarginY * 2);

    // Title Safe (90%)
    const tsMarginX = width * 0.05;
    const tsMarginY = height * 0.05;
    ctx.strokeRect(tsMarginX, tsMarginY, width - tsMarginX * 2, height - tsMarginY * 2);

    ctx.restore();
  }

  private drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number, zoom: number) {
    ctx.save();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
    ctx.lineWidth = 1 / zoom;
    ctx.setLineDash([2 / zoom, 3 / zoom]);

    // Rule of thirds lines
    ctx.beginPath();
    ctx.moveTo(width / 3, 0);
    ctx.lineTo(width / 3, height);
    ctx.moveTo((width * 2) / 3, 0);
    ctx.lineTo((width * 2) / 3, height);

    ctx.moveTo(0, height / 3);
    ctx.lineTo(width, height / 3);
    ctx.moveTo(0, (height * 2) / 3);
    ctx.lineTo(width, (height * 2) / 3);
    ctx.stroke();

    ctx.restore();
  }

  private drawCheckerboard(ctx: CanvasRenderingContext2D, width: number, height: number) {
    const size = 16;
    for (let x = 0; x < width; x += size) {
      for (let y = 0; y < height; y += size) {
        ctx.fillStyle = (Math.floor(x / size) + Math.floor(y / size)) % 2 === 0 ? '#14181f' : '#1c222b';
        ctx.fillRect(x, y, Math.min(size, width - x), Math.min(size, height - y));
      }
    }
  }

  private drawStar(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    spikes: number,
    outerRadius: number,
    innerRadius: number
  ) {
    let rot = (Math.PI / 2) * 3;
    let x = cx;
    let y = cy;
    const step = Math.PI / spikes;

    ctx.beginPath();
    ctx.moveTo(cx, cy - outerRadius);
    for (let i = 0; i < spikes; i++) {
      x = cx + Math.cos(rot) * outerRadius;
      y = cy + Math.sin(rot) * outerRadius;
      ctx.lineTo(x, y);
      rot += step;

      x = cx + Math.cos(rot) * innerRadius;
      y = cy + Math.sin(rot) * innerRadius;
      ctx.lineTo(x, y);
      rot += step;
    }
    ctx.lineTo(cx, cy - outerRadius);
    ctx.closePath();
  }
}
