import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), '..', 'test_ihs_timesheet.csv');
    const content = await fs.readFile(filePath);
    return new NextResponse(content, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="test_ihs_timesheet.csv"',
      },
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to load sample timesheet' }, { status: 500 });
  }
}
