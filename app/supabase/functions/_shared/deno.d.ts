// Deno type declarations for Supabase Edge Functions
declare namespace Deno {
  export const env: {
    get(key: string): string | undefined;
    set(key: string, value: string): void;
    delete(key: string): void;
    toObject(): Record<string, string>;
  };
  export function serve(handler: (req: Request) => Response | Promise<Response>): void;
}

// crypto is already available globally in Deno/Edge runtime
