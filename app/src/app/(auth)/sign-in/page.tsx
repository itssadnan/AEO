import { signInAction, signInWithGoogleAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";

// Restyled onto the shared design system (Module 5.6) 2026-09-01 — was raw
// <input>/<button> markup predating that system. Logic/actions unchanged.
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-text-primary">Sign in</h1>
      <FieldError>{error}</FieldError>
      <form action={signInAction} className="flex flex-col gap-3">
        <Label>
          Email
          <Input name="email" type="email" placeholder="you@company.com" required />
        </Label>
        <Label>
          Password
          <Input name="password" type="password" placeholder="••••••••" required />
        </Label>
        <Button type="submit" size="lg" className="mt-1 w-full">
          Sign in
        </Button>
      </form>
      <form action={signInWithGoogleAction}>
        <Button type="submit" variant="outline" size="lg" className="w-full">
          Continue with Google
        </Button>
      </form>
      <p className="text-sm text-text-secondary">
        No account?{" "}
        <a href="/sign-up" className="text-accent hover:text-accent-hover underline">
          Sign up
        </a>
      </p>
    </div>
  );
}
