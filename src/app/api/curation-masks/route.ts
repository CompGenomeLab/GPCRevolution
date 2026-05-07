import { promises as fs } from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';

const OUTPUT_PATH = path.join(process.cwd(), 'public', 'manual_curation.json');

export async function GET() {
  try {
    const raw = await fs.readFile(OUTPUT_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return NextResponse.json({ exists: true, data: parsed });
  } catch {
    return NextResponse.json({ exists: false, data: null });
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();

    if (!payload || typeof payload !== 'object') {
      return NextResponse.json({ ok: false, error: 'Invalid JSON payload.' }, { status: 400 });
    }

    await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
    await fs.writeFile(OUTPUT_PATH, JSON.stringify(payload, null, 2), 'utf8');

    return NextResponse.json({
      ok: true,
      outputPath: 'public/manual_curation.json',
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to write curation masks JSON.',
      },
      { status: 500 }
    );
  }
}
