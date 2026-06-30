import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body?.photoDataUri) {
      return NextResponse.json({ error: 'photoDataUri is required' }, { status: 400 });
    }
    // Dynamic import prevents genkit from being evaluated at build time
    const { scanPlate } = await import('@/ai/flows/scan-plate-flow');
    const result = await scanPlate({ photoDataUri: body.photoDataUri });
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message ?? 'Scan failed' }, { status: 500 });
  }
}
