import type { Auth } from '#lib/server/auth.ts';

declare global {
  namespace App {
    interface Locals {
      auth: () => Auth;
    }
  }
}

export {};
