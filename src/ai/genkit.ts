import 'server-only';

let _ai: ReturnType<typeof import('genkit')['genkit']> | null = null;

export async function getAi() {
  if (!_ai) {
    const { genkit } = await import('genkit');
    const { googleAI } = await import('@genkit-ai/google-genai');
    _ai = genkit({
      plugins: [googleAI()],
      model: 'googleai/gemini-2.5-flash',
    });
  }
  return _ai;
}
