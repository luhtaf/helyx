import type { Request, Response } from 'express';
import { config } from '../config.js';

export const SESSION_COOKIE = 'helyx_session';
export const CSRF_COOKIE = 'helyx_csrf_token';
export const REFRESH_COOKIE = 'helyx_refresh'; // narrow path /graphql, used by Task 16

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function setSessionCookie(res: Response, jwt: string): void {
  res.cookie(SESSION_COOKIE, jwt, {
    httpOnly: true,
    secure: config.COOKIE_SECURE,
    sameSite: 'strict',
    path: '/',
    maxAge: SEVEN_DAYS_MS,
  });
}

export function setCsrfCookie(res: Response, token: string): void {
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false, // intentionally readable by JS for double-submit pattern
    secure: config.COOKIE_SECURE,
    sameSite: 'strict',
    path: '/',
    maxAge: SEVEN_DAYS_MS,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.clearCookie(CSRF_COOKIE, { path: '/' });
  res.clearCookie(REFRESH_COOKIE, { path: '/graphql' });
}

export function readSessionCookie(req: Request): string | null {
  const c = (req as Request & { cookies?: Record<string, string> }).cookies;
  return c?.[SESSION_COOKIE] ?? null;
}

export function readCsrfCookie(req: Request): string | null {
  const c = (req as Request & { cookies?: Record<string, string> }).cookies;
  return c?.[CSRF_COOKIE] ?? null;
}
