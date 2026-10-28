import type { Auth } from '#lib/server/auth.ts';
import type { Db } from '#lib/server/db/index.ts';
import type { Email } from '#lib/server/email.ts';

declare global {
  namespace App {
    interface Locals {
      auth: () => Auth;
      db: () => Db;
      mail: (email: Email) => Promise<void>;
    }
  }
}

export {};
