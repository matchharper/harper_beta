import { simpleApplicationPage, receiveSimpleApplication } from '../../lib/simpleFixture.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = simpleApplicationPage;
export const POST = receiveSimpleApplication;
