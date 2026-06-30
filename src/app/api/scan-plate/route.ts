import { NextRequest, NextResponse } from 'next/server';
import { scanPlate } from '@/ai/flows/scan-plate-flow';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body?.photoDataUri) {
      return NextResponse.json({ error: 'photoDataUri is required' }, { status: 400 });
    }
    const result = await scanPlate({ photoDataUri: body.photoDataUri });
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message ?? 'Scan failed' }, { status: 500 });
  }
}
