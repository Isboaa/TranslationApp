'use client';

import { useState, useRef } from 'react';

interface Translation {
  norwegian: string;
  italian: string;
}

interface Result {
  translations: Translation[];
  italianText: string;
  audioBase64: string;
}

const CHUNK_SIZE = 20;

function mergeWavs(buffers: ArrayBuffer[]): Blob {
  if (buffers.length === 1) return new Blob([buffers[0]], { type: 'audio/wav' });
  const totalPcm = buffers.reduce((sum, b) => sum + b.byteLength - 44, 0);
  const out = new Uint8Array(44 + totalPcm);
  // Copy WAV header from first chunk
  out.set(new Uint8Array(buffers[0].slice(0, 44)));
  // Fix RIFF chunk size and data chunk size to reflect merged length
  const view = new DataView(out.buffer);
  view.setUint32(4, 36 + totalPcm, true);
  view.setUint32(40, totalPcm, true);
  // Append raw PCM (skip 44-byte header) from each chunk
  let offset = 44;
  for (const buf of buffers) {
    out.set(new Uint8Array(buf.slice(44)), offset);
    offset += buf.byteLength - 44;
  }
  return new Blob([out], { type: 'audio/wav' });
}

export default function Home() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const audioRef = useRef<string | null>(null);

  const sentenceCount = input
    .split('\n')
    .filter((l) => l.trim().length > 0).length;

  async function handleGenerate() {
    const sentences = input
      .split('\n')
      .map((s) => s.trim())
      .map((s) => s.replace(/^[•\-\*•‣◦⁃]+\s*/, '').replace(/^\d+[\.\)]\s*/, '').trim())
      .filter((s) => s.length > 0);

    if (sentences.length === 0) {
      setError('Lim inn minst én setning');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    if (audioRef.current) {
      URL.revokeObjectURL(audioRef.current);
      audioRef.current = null;
    }

    // Split into chunks so each request stays within Vercel's 60s timeout
    const chunks: string[][] = [];
    for (let i = 0; i < sentences.length; i += CHUNK_SIZE) {
      chunks.push(sentences.slice(i, i + CHUNK_SIZE));
    }

    const allTranslations: Translation[] = [];
    const wavBuffers: ArrayBuffer[] = [];

    try {
      for (let i = 0; i < chunks.length; i++) {
        setStatus(
          chunks.length === 1
            ? 'Oversetter og lager audio…'
            : `Del ${i + 1} av ${chunks.length} – lager audio…`
        );

        const res = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sentences: chunks[i] }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Serverfeil');
        }

        const data: Result = await res.json();
        allTranslations.push(...data.translations);

        const bytes = Uint8Array.from(atob(data.audioBase64), (c) => c.charCodeAt(0));
        wavBuffers.push(bytes.buffer);
      }

      if (chunks.length > 1) setStatus('Slår sammen audio…');
      const audioBlob = mergeWavs(wavBuffers);
      audioRef.current = URL.createObjectURL(audioBlob);

      const italianText = allTranslations
        .map((t) => `${t.norwegian}\n${t.italian}`)
        .join('\n\n');

      setResult({ translations: allTranslations, italianText, audioBase64: '' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Noe gikk galt');
    } finally {
      setLoading(false);
      setStatus('');
    }
  }

  function getAudioUrl(): string {
    return audioRef.current ?? '';
  }

  function downloadText() {
    if (!result) return;
    const blob = new Blob([result.italianText], { type: 'text/plain;charset=utf-8' });
    triggerDownload(URL.createObjectURL(blob), 'italiensk.txt');
  }

  function downloadAudio() {
    if (!audioRef.current) return;
    triggerDownload(audioRef.current, 'italiano.wav');
  }

  function triggerDownload(url: string, filename: string) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="max-w-lg mx-auto px-5 py-10">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Norsk → Italiensk</h1>
          <p className="text-gray-500 mt-1 text-sm">
            Lim inn setninger fra Notes-appen, én per linje
          </p>
        </div>

        {/* Textarea */}
        <div className="relative">
          <textarea
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setError('');
            }}
            placeholder={'Hei, hvordan går det?\nJeg vil lære italiensk\nHvor er togstasjonen?'}
            rows={7}
            disabled={loading}
            className="w-full bg-gray-900 border border-gray-800 rounded-2xl px-4 py-4
                       text-white placeholder-gray-700 resize-none
                       focus:outline-none focus:border-gray-600
                       disabled:opacity-50 text-base leading-relaxed"
          />
          {sentenceCount > 0 && (
            <span className="absolute bottom-3 right-4 text-xs text-gray-600">
              {sentenceCount} {sentenceCount === 1 ? 'setning' : 'setninger'}
            </span>
          )}
        </div>

        {/* Error */}
        {error && (
          <p className="mt-3 text-red-400 text-sm px-1">{error}</p>
        )}

        {/* Generate button */}
        <button
          onClick={handleGenerate}
          disabled={loading || sentenceCount === 0}
          className="mt-4 w-full py-4 rounded-2xl font-semibold text-base
                     bg-white text-black
                     disabled:opacity-30
                     active:scale-95 transition-transform duration-100"
        >
          {loading ? 'Genererer…' : 'Generate'}
        </button>

        {/* Loading */}
        {loading && (
          <div className="mt-5 flex items-center gap-3 text-gray-400">
            <span className="inline-block w-4 h-4 border-2 border-gray-600 border-t-gray-300 rounded-full animate-spin" />
            <span className="text-sm">{status || 'Vennligst vent…'}</span>
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="mt-10">

            {/* Translations preview */}
            <h2 className="text-xs font-semibold text-gray-500 tracking-widest mb-3">
              OVERSETTELSER ({result.translations.length} setninger)
            </h2>
            <div className="space-y-2 mb-8 max-h-96 overflow-y-auto pr-1">
              {result.translations.map((t, i) => (
                <div
                  key={i}
                  className="bg-gray-900 rounded-xl px-4 py-3 border border-gray-800"
                >
                  <p className="text-gray-500 text-sm">{t.norwegian}</p>
                  <p className="text-white mt-0.5">{t.italian}</p>
                </div>
              ))}
            </div>

            {/* Audio player */}
            <h2 className="text-xs font-semibold text-gray-500 tracking-widest mb-3">
              AUDIO
            </h2>
            <audio
              src={getAudioUrl()}
              controls
              className="w-full mb-5 rounded-xl"
              style={{ colorScheme: 'dark' }}
            />

            {/* Download buttons */}
            <div className="space-y-3">
              <button
                onClick={downloadAudio}
                className="w-full py-4 rounded-2xl font-medium text-base
                           bg-gray-900 border border-gray-700 text-white
                           active:scale-95 transition-transform duration-100"
              >
                Last ned audio · italiano.wav
              </button>
              <button
                onClick={downloadText}
                className="w-full py-4 rounded-2xl font-medium text-base
                           bg-gray-900 border border-gray-700 text-white
                           active:scale-95 transition-transform duration-100"
              >
                Last ned tekstfil · italiensk.txt
              </button>
            </div>

            <p className="text-center text-gray-700 text-xs mt-5">
              På iPhone: trykk og hold på knappen → &quot;Last ned koblet fil&quot;
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
