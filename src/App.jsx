import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

// ===== Utility helpers =====
const clamp = (v, min=0, max=1) => Math.min(max, Math.max(min, v));
const pad = (n) => n.toString(16).padStart(2, "0");

function hslToRgb(h, s, l) {
  // h: 0..360, s/l: 0..1
  h = (h % 360 + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r,g,b] = [c,x,0];
  else if (h < 120) [r,g,b] = [x,c,0];
  else if (h < 180) [r,g,b] = [0,c,x];
  else if (h < 240) [r,g,b] = [0,x,c];
  else if (h < 300) [r,g,b] = [x,0,c];
  else [r,g,b] = [c,0,x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function rgbToHex([r,g,b]) { return `#${pad(r)}${pad(g)}${pad(b)}`; }
function hexToRgb(hex) {
  const m = hex.replace('#','').match(/.{1,2}/g);
  if (!m) return [0,0,0];
  return m.map(x => parseInt(x, 16));
}

function relativeLuminance([r,g,b]) {
  const srgb = [r,g,b].map(v => v/255).map(v => (v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4)));
  return 0.2126*srgb[0] + 0.7152*srgb[1] + 0.0722*srgb[2];
}
function contrastRatio(hex1, hex2) {
  const L1 = relativeLuminance(hexToRgb(hex1));
  const L2 = relativeLuminance(hexToRgb(hex2));
  const lighter = Math.max(L1, L2), darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

function randomBetween(min, max) { return min + Math.random() * (max - min); }

// Generate 5-color palette by scheme
function generatePalette({ baseHue = Math.floor(Math.random()*360), scheme = 'random' }) {
  const s = 0.5 + Math.random()*0.4; // 0.5..0.9
  const l = 0.45 + Math.random()*0.2; // 0.45..0.65

  const hues = (() => {
    switch (scheme) {
      case 'complementary':
        return [baseHue, (baseHue+180)%360, (baseHue+30)%360, (baseHue+210)%360, (baseHue+350)%360];
      case 'triadic':
        return [baseHue, (baseHue+120)%360, (baseHue+240)%360, (baseHue+60)%360, (baseHue+300)%360];
      case 'analogous':
        return [baseHue-30, baseHue-10, baseHue, baseHue+10, baseHue+30].map(h=> (h%360+360)%360);
      case 'monochrome': {
        const base = baseHue;
        return [base, base, base, base, base];
      }
      default: // random
        return new Array(5).fill(0).map(()=>Math.floor(Math.random()*360));
    }
  })();

  // lightness/ saturation variations for diversity
  const ls = scheme === 'monochrome' ? [0.25,0.4,0.55,0.7,0.85] : [l-0.15,l-0.05,l,l+0.08,l+0.16].map(x=>clamp(x,0.15,0.9));
  const ss = scheme === 'monochrome' ? [0.15,0.3,0.45,0.6,0.75] : new Array(5).fill(s);

  return hues.map((h, i) => {
    const rgb = hslToRgb(h, clamp(ss[i],0,1), clamp(ls[i],0,1));
    return rgbToHex(rgb);
  });
}

function download(filename, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function toCssVars(palette) {
  return `:root{\n${palette.map((hex, i)=>`  --color-${i+1}: ${hex};`).join('\n')}\n}`;
}

function toJson(palette) {
  return JSON.stringify({ colors: palette }, null, 2);
}

function useLocalStorage(key, initial) {
  const [v, setV] = useState(() => {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : initial; } catch { return initial; }
  });
  useEffect(()=>{ try { localStorage.setItem(key, JSON.stringify(v)); } catch {} }, [key, v]);
  return [v, setV];
}

export default function PaletteGenerator() {
  const [scheme, setScheme] = useLocalStorage('scheme', 'random');
  const [baseHue, setBaseHue] = useLocalStorage('baseHue', Math.floor(Math.random()*360));
  const [palette, setPalette] = useLocalStorage('palette', generatePalette({ baseHue, scheme }));
  const [locks, setLocks] = useLocalStorage('locks', [false,false,false,false,false]);
  const [angle, setAngle] = useLocalStorage('angle', 45);
  const [fgIndex, setFgIndex] = useLocalStorage('fg', 1);
  const [bgIndex, setBgIndex] = useLocalStorage('bg', 5);

  const canvasRef = useRef(null);

  const regenerate = useCallback(() => {
    const base = Math.floor(baseHue);
    const fresh = generatePalette({ baseHue: base, scheme });
    setPalette(p => p.map((c,i)=> locks[i] ? c : fresh[i]));
  }, [baseHue, scheme, locks, setPalette]);

  useEffect(()=>{ regenerate(); // eslint-disable-next-line
  }, [scheme]);

  useEffect(()=>{ // draw gradient on canvas
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0,0,w,h);
    const rad = angle * Math.PI / 180;
    const x = Math.cos(rad), y = Math.sin(rad);
    const cx = w/2, cy = h/2; // center
    const len = Math.max(w,h);
    const x0 = cx - x * len, y0 = cy - y * len;
    const x1 = cx + x * len, y1 = cy + y * len;
    const grad = ctx.createLinearGradient(x0,y0,x1,y1);
    const stops = palette.length;
    palette.forEach((hex, i) => grad.addColorStop(i/(stops-1), hex));
    ctx.fillStyle = grad; ctx.fillRect(0,0,w,h);
  }, [palette, angle]);

  const fg = palette[fgIndex-1] ?? palette[0];
  const bg = palette[bgIndex-1] ?? palette[palette.length-1];
  const contrast = useMemo(()=> contrastRatio(fg, bg), [fg, bg]);
  const wcag = contrast >= 7 ? 'AAA' : contrast >= 4.5 ? 'AA' : contrast >= 3 ? 'AA Large' : 'Fail';

  const updateColor = (i, hex) => {
    setPalette(p => p.map((c,idx)=> idx===i ? hex : c));
  };

  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); alert('Скопировано'); } catch {}
  };

  const shuffleUnlocked = () => regenerate();

  const randomizeBaseHue = () => setBaseHue(Math.floor(Math.random()*360));

  return (
    <div className="min-h-screen w-full bg-slate-950 text-slate-100 px-4 py-6 flex flex-col items-center">
      <div className="max-w-5xl w-full">
        <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-5">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Генератор цветовых палитр</h1>
            <p className="text-slate-400">React + Tailwind + Canvas API. Генерируй гармоничные палитры, проверяй контраст, экспортируй CSS/JSON.</p>
          </div>
          <div className="flex items-center gap-2">
            <select value={scheme} onChange={e=>setScheme(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2">
              <option value="random">Random</option>
              <option value="complementary">Complementary</option>
              <option value="triadic">Triadic</option>
              <option value="analogous">Analogous</option>
              <option value="monochrome">Monochrome</option>
            </select>
            <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2">
              <label className="text-slate-400 text-sm">Base hue</label>
              <input type="range" min={0} max={360} value={baseHue} onChange={e=>setBaseHue(parseInt(e.target.value))} />
              <button onClick={randomizeBaseHue} className="text-xs bg-slate-700 rounded-lg px-2 py-1">🎲</button>
            </div>
            <button onClick={shuffleUnlocked} className="bg-indigo-500 hover:bg-indigo-400 text-slate-950 font-medium rounded-xl px-4 py-2">Сгенерировать</button>
          </div>
        </header>

        {/* Palette */}
        <section className="grid grid-cols-1 sm:grid-cols-5 gap-3 mb-6">
          {palette.map((hex, i) => (
            <div key={i} className="rounded-2xl overflow-hidden border border-slate-800">
              <div className="h-28" style={{ background: hex }} />
              <div className="p-3 flex flex-col gap-2 bg-slate-900">
                <input
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 font-mono"
                  value={hex}
                  onChange={e=>updateColor(i, e.target.value.startsWith('#')? e.target.value : `#${e.target.value}`)}
                />
                <div className="flex items-center justify-between gap-2 text-sm">
                  <button onClick={()=>copy(hex)} className="bg-slate-800 px-2 py-1 rounded-lg border border-slate-700">HEX</button>
                  <button onClick={()=>copy(hexToRgb(hex).join(', '))} className="bg-slate-800 px-2 py-1 rounded-lg border border-slate-700">RGB</button>
                  <button onClick={()=> setLocks(ls => ls.map((v,idx)=> idx===i ? !v : v))} className={`px-2 py-1 rounded-lg border ${locks[i] ? 'bg-emerald-600 border-emerald-500' : 'bg-slate-800 border-slate-700'}`}>{locks[i] ? '🔒' : '🔓'}</button>
                </div>
              </div>
            </div>
          ))}
        </section>

        {/* Gradient Preview */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start mb-8">
          <div className="md:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-3">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-semibold">Градиент предпросмотр</h2>
              <div className="flex items-center gap-3 text-sm">
                <label className="text-slate-400">Угол: {angle}°</label>
                <input type="range" min={0} max={360} value={angle} onChange={e=>setAngle(parseInt(e.target.value))} />
              </div>
            </div>
            <div className="aspect-[16/9] w-full overflow-hidden rounded-xl border border-slate-800">
              <canvas ref={canvasRef} width={1200} height={675} className="w-full h-full" />
            </div>
          </div>

          {/* Contrast checker */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3">
            <h2 className="font-semibold mb-2">Проверка контраста (WCAG)</h2>
            <div className="flex items-center gap-2 text-sm mb-2">
              <label>Текст</label>
              <select value={fgIndex} onChange={e=>setFgIndex(parseInt(e.target.value))} className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1">
                {palette.map((_,i)=> <option key={i} value={i+1}>{i+1}</option>)}
              </select>
              <label>Фон</label>
              <select value={bgIndex} onChange={e=>setBgIndex(parseInt(e.target.value))} className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1">
                {palette.map((_,i)=> <option key={i} value={i+1}>{i+1}</option>)}
              </select>
            </div>
            <div className="rounded-lg border border-slate-800 overflow-hidden" style={{ background: bg, color: fg }}>
              <div className="p-3 font-medium">Контраст: {contrast.toFixed(2)} — {wcag}</div>
              <div className="p-3 text-lg">Пример текста Aa 123 %</div>
            </div>
          </div>
        </section>

        {/* Export */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4 mb-8">
          <h2 className="font-semibold mb-3">Экспорт</h2>
          <div className="flex flex-wrap gap-2">
            <button onClick={()=> download('palette.css', toCssVars(palette))} className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2">CSS Variables</button>
            <button onClick={()=> download('palette.json', toJson(palette))} className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2">JSON</button>
            <button onClick={()=> copy(palette.join(', '))} className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2">Скопировать все HEX</button>
          </div>
        </section>

        {/* About / mini spec */}
        <details className="bg-slate-900 border border-slate-800 rounded-2xl p-4" open>
          <summary className="cursor-pointer font-semibold">Что реализовано и что можно добавить</summary>
          <ul className="list-disc pl-6 text-slate-300 mt-2 space-y-1">
            <li>Схемы: Random, Complementary, Triadic, Analogous, Monochrome.</li>
            <li>Лок: можно фиксировать отдельные цвета и перегенерировать остальные.</li>
            <li>Контраст по WCAG с автоматическим расчётом AAA/AA/Fail.</li>
            <li>Превью градиента через Canvas API с настраиваемым углом.</li>
            <li>Экспорт: CSS-переменные, JSON, копирование HEX/RGB.</li>
          </ul>
          <p className="mt-3 text-slate-400">Идеи для апгрейда:</p>
          <ul className="list-disc pl-6 text-slate-300 mt-1 space-y-1">
            <li>Подбор по имени (Pantone-like), генерация из изображения (avg/median cut), драг-н-дроп.</li>
            <li>Подбор по бренд-цвету (вставь HEX → построить совместимые акценты).</li>
            <li>Сохранение и шаринг палитры по URL (query string или hash).</li>
            <li>Экспорт в .ase / .aco / SVG gradient, генерация CSS classes/variables, Tailwind config.</li>
            <li>Подбор доступных комбинаций (только сочетания c AA/AAA).</li>
          </ul>
        </details>
      </div>
    </div>
  );
}
