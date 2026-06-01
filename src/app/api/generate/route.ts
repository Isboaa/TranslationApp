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

async function tts(text: string, voice: 'nova' | 'alloy'): Promise<Buffer> {
  const response = await openai.audio.speech.create({
    model: 'tts-1-hd',
    voice,
    input: text,
    response_format: 'pcm',
  });
  const buf = Buffer.from(await response.arrayBuffer());
  // 16-bit PCM must be even-length; an odd byte would misalign every sample that follows
  return buf.length % 2 === 1 ? Buffer.concat([buf, Buffer.alloc(1)]) : buf;
}

// Run TTS requests with bounded concurrency to avoid rate-limiting from OpenAI.
// Too many simultaneous requests cause partial/corrupted PCM buffers → garbled audio.
async function ttsAll(texts: string[], voice: 'nova' | 'alloy', concurrency = 5): Promise<Buffer[]> {
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
