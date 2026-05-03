import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const base = `${url.protocol}//${url.host}`;
  return NextResponse.redirect(new URL('/login', base));
}
