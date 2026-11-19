import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { db } from '@/lib/mongodb/db-client';
import { isAllowed } from '@/lib/permissions/defaults';
import { checkPermission } from '@/lib/permissions/server';

/** A to-do-later list is its owner's; people who edit users may open any. */
const forbidden = () =>
  NextResponse.json(
    { success: false, error: 'You can only open your own list.' },
    { status: 403 },
  );

export async function GET(request: NextRequest) {
  const { response, user } = await checkPermission('worklogs:read');
  if (response) return response;

  try {
    const userId = request.nextUrl.searchParams.get('userId') as string;
    const logType = request.nextUrl.searchParams.get('logType') as string;

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'userId is required' },
        { status: 400 },
      );
    }

    if (user && user.id !== userId && !isAllowed(user, 'users:edit'))
      return forbidden();

    const docId = `${userId}-todoLater`;

    const docMarkdown = await db.docMarkdown.findUnique({
      where: {
        docId: docId,
        ...(logType && { logType }),
      },
    });

    if (!docMarkdown) {
      return NextResponse.json(
        { success: false, error: 'Document not found' },
        { status: 404 },
      );
    }

    return NextResponse.json(
      { success: true, data: docMarkdown },
      { status: 200 },
    );
  } catch (e) {
    return new NextResponse(JSON.stringify(e), {
      status: 404,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
}

export async function PUT(request: NextRequest) {
  const { response, user } = await checkPermission('worklogs:edit');
  if (response) return response;

  try {
    const body = await request.json();
    const { userId, logType, markdown } = body;

    if (!userId || !logType || !markdown) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 },
      );
    }

    if (user && user.id !== userId && !isAllowed(user, 'users:edit'))
      return forbidden();

    const docId = `${userId}-todoLater`;

    const newDocMarkdown = await db.docMarkdown.upsert({
      where: {
        docId: docId,
      },
      update: {
        markdown: markdown,
        updatedAt: new Date(),
      },
      create: {
        docId: docId,
        logType: logType,
        userId: userId,
        markdown: markdown,
      },
    });

    return NextResponse.json(
      { success: true, data: newDocMarkdown },
      { status: 201 },
    );
  } catch (e) {
    return new NextResponse(JSON.stringify(e), {
      status: 404,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
}
