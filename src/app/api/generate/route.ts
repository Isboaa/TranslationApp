import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

// Allow up to 60s on Vercel Pro, 10s on Hobby
export const maxDuration = 60;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function translateSentences(sentences: string[]): Promise<string[]> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content:
          'Du er en profesjonell oversetter. Oversett norsk til naturlig, idiomatisk italiensk. Returner KUN et JSON-objekt.',
      },
      {
        role: 'user',
        content: `Oversett disse norske setningene til italiensk.\n\nReturner KUN dette JSON-formatet:\n{"translations": ["italiensk1", "italiensk2", ...]}\n\nNorske setninger:\n${sentences
          .map((s, i) => `${i + 1}. ${s}`)
          .join('\n')}`,
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2,
  });

  const parsed = JSON.parse(response.choices[0].message.content!);
  const result = parsed.translations;

  if (!Array.isArray(result) || result.length !== sentences.length) {
    throw new Error('Oversettelse returnerte feil format');
  }

  return result as string[];
}

// Parse WAV byte stream to locate and extract the raw PCM 'data' chunk.
// Handles non-standard WAV files where extra chunks (e.g. LIST) precede data.
function extractPcmFromWav(wav: Buffer): Buffer {
  if (wav.length < 12 || wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error(`Not a valid WAV file (header: ${wav.slice(0, 12).toString('hex')})`);
  }
  let offset = 12;
  while (offset + 8 <= wav.length) {
    const id = wav.toString('ascii', offset, offset + 4);
    const size = wav.readUInt32LE(offset + 4);
    if (id === 'data') {
      // 0xFFFFFFFF means "unknown size" (streaming WAV) — clamp to end of buffer
      const actualSize = (size === 0xFFFFFFFF || offset + 8 + size > wav.length)
        ? wav.length - offset - 8
        : size;
      // Force a true copy so the extracted PCM doesn't share memory with the WAV buffer
      const pcm = Buffer.from(new Uint8Array(wav.buffer, wav.byteOffset + offset + 8, actualSize));
      return pcm.length % 2 === 1 ? Buffer.concat([pcm, Buffer.alloc(1)]) : pcm;
    }
    // 0xFFFFFFFF on a non-data chunk means unknown size — can't skip safely, stop scanning
    if (size === 0xFFFFFFFF) break;
    offset += 8 + size + (size % 2); // WAV chunks are word-aligned
  }
  throw new Error('No data chunk found in WAV response');
}

async function tts(text: string, voice: 'nova' | 'alloy'): Promise<Buffer> {
  // Empty/whitespace input is a reliable babble trigger — emit a short silence instead.
  const clean = text.trim();
  if (clean.length === 0) return silence(300);

  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await openai.audio.speech.create({
        // gpt-4o-mini-tts is far less prone to the "babble"/garbled-speech failures
        // that tts-1 / tts-1-hd intermittently produce on certain inputs.
        model: 'gpt-4o-mini-tts',
        voice,
        input: clean,
        response_format: 'wav',
      });
      // Buffer.from(arrayBuffer) shares memory — force a true copy via Uint8Array
      const wav = Buffer.from(new Uint8Array(await response.arrayBuffer()));

      if (wav.length < 44 || wav.toString('ascii', 0, 4) !== 'RIFF') {
        throw new Error(`Invalid WAV response (${wav.length} bytes): ${wav.slice(0, 20).toString('hex')}`);
      }

      const pcm = extractPcmFromWav(wav);

      if (pcm.length < 2400) {
        throw new Error(`PCM too small (${pcm.length} bytes) — likely truncated`);
      }

      return pcm;
    } catch (err) {
      lastError = err;
      console.warn(`[tts] attempt ${attempt}/3 for "${text.slice(0, 40)}":`, err instanceof Error ? err.message : err);
      if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 1000));
    }
  }
  throw lastError;
}

// Run TTS requests with bounded concurrency to avoid rate-limiting from OpenAI.
async function ttsAll(texts: string[], voice: 'nova' | 'alloy', concurrency = 3): Promise<Buffer[]> {
  const results: Buffer[] = new Array(texts.length);
  let next = 0;
  async function worker() {
    while (next < texts.length) {
      const i = next++;
      results[i] = await tts(texts[i], voice);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, texts.length) }, worker));
  return results;
}

function silence(ms: number): Buffer {
  // 24000 samples/s × 2 bytes/sample (16-bit) × duration
  return Buffer.alloc(Math.floor(24000 * ms / 1000) * 2);
}

function toWav(pcm: Buffer): Buffer {
  const sampleRate = 24000;
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);         // PCM format
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([header, pcm]);
}

export async function POST(req: NextRequest) {
  try {
    const { sentences } = (await req.json()) as { sentences: string[] };

    if (!Array.isArray(sentences) || sentences.length === 0) {
      return NextResponse.json({ error: 'Ingen setninger oppgitt' }, { status: 400 });
    }
    // Step 1 — translate all sentences with one API call
    const italian = await translateSentences(sentences);

    // Step 2 — generate TTS with bounded concurrency (max 3 at a time) to avoid
    // OpenAI rate-limiting, which causes corrupted PCM → garbled audio.
    // Italian first, then Norwegian sequentially to keep total load low.
    const itSegments = await ttsAll(italian, 'nova');
    const noSegments = await ttsAll(sentences, 'alloy');

    // Step 3 — interleave segments with silences and build WAV
    // Reuse the same Italian buffer for both repetitions → identical audio guaranteed
    const shortPause = silence(450);
    const longPause = silence(950);
    const chunks: Buffer[] = [];

    for (let i = 0; i < sentences.length; i++) {
      chunks.push(
        itSegments[i],  // IT
        shortPause,
        noSegments[i],  // NO
        shortPause,
        itSegments[i],  // IT again — same buffer, identical pronunciation
        longPause,
      );
    }

    const wav = toWav(Buffer.concat(chunks));

    return NextResponse.json({
      translations: sentences.map((no, i) => ({ norwegian: no, italian: italian[i] })),
      italianText: sentences.map((no, i) => `${no}\n${italian[i]}`).join('\n\n'),
      audioBase64: wav.toString('base64'),
    });
  } catch (err) {
    console.error('[generate]', err);
    const message = err instanceof Error ? err.message : 'Noe gikk galt';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
