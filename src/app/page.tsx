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
      // Strip bullet points and list markers from Notes-appen: •, -, *, 1. 2. osv.
      .map((s) => s.replace(/^[•\-\*•‣◦⁃]+\s*/, '').replace(/^\d+[\.\)]\s*/, '').trim())
      .filter((s) => s.length > 0);

    if (sentences.length === 0) {
      setError('Lim inn minst én setning');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);
    setStatus('Oversetter til italiensk…');

    // Revoke previous audio URL to free memory
    if (audioRef.current) {
      URL.revokeObjectURL(audioRef.current);
      audioRef.current = null;
    }

    try {
      // Give the user some status feedback while waiting
      const statusTimer = setTimeout(() => setStatus('Lager audio…'), 3000);

      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sentences }),
      });

      clearTimeout(statusTimer);

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Serverfeil');
      }

      const data: Result = await res.json();
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Noe gikk galt');
    } finally {
      setLoading(false);
      setStatus('');
    }
  }

  function getAudioUrl(base64: string): string {
    if (audioRef.current) return audioRef.current;
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    audioRef.current = url;
    return url;
  }

  function downloadText() {
    if (!result) return;
    const blob = new Blob([result.italianText], { type: 'text/plain;charset=utf-8' });
    triggerDownload(URL.createObjectURL(blob), 'italiensk.txt');
  }

  function downloadAudio() {
    if (!result) return;
    triggerDownload(getAudioUrl(result.audioBase64), 'italiano.wav');
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
              OVERSETTELSER
            </h2>
            <div className="space-y-2 mb-8">
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
              src={getAudioUrl(result.audioBase64)}
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
