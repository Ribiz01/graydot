import { z } from 'zod';

const ScanPlateInputSchema = z.object({
  photoDataUri: z
    .string()
    .describe(
      "A photo of a vehicle's license plate, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type ScanPlateInput = z.infer<typeof ScanPlateInputSchema>;

const ScanPlateOutputSchema = z.object({
  licensePlate: z.string().describe('The license plate text extracted from the image. Should be uppercase without spaces or special characters.'),
});
export type ScanPlateOutput = z.infer<typeof ScanPlateOutputSchema>;

// Lazy singleton — only initialised on first call, not at module load time
let _flow: ((input: ScanPlateInput) => Promise<ScanPlateOutput>) | null = null;

async function getFlow(): Promise<(input: ScanPlateInput) => Promise<ScanPlateOutput>> {
  if (!_flow) {
    const { getAi } = await import('@/ai/genkit');
    const { z: gz } = await import('genkit');
    const ai = await getAi();

    const InputSchema = gz.object({
      photoDataUri: gz
        .string()
        .describe(
          "A photo of a vehicle's license plate, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
        ),
    });
    const OutputSchema = gz.object({
      licensePlate: gz.string().describe('The license plate text extracted from the image. Should be uppercase without spaces or special characters.'),
    });

    const prompt = ai.definePrompt({
      name: 'scanPlatePrompt',
      input: { schema: InputSchema },
      output: { schema: OutputSchema },
      prompt: `You are an expert at reading license plates from images, even if they are blurry or at an angle.

Analyze the following image and extract the license plate number.

Return only the license plate text. It should be uppercase and contain no spaces or special characters.

If you cannot determine the license plate, return an empty string for the licensePlate field.

Photo: {{media url=photoDataUri}}`,
    });

    _flow = ai.defineFlow(
      {
        name: 'scanPlateFlow',
        inputSchema: InputSchema,
        outputSchema: OutputSchema,
      },
      async (input) => {
        const { output } = await prompt(input);
        return output!;
      }
    );
  }
  return _flow;
}

export async function scanPlate(input: ScanPlateInput): Promise<ScanPlateOutput> {
  const flow = await getFlow();
  return flow(input);
}
