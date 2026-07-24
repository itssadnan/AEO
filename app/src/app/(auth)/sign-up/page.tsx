import { signInWithGoogleAction, signUpAction } from "../actions";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="flex w-full max-w-sm flex-col gap-6 px-4">
      <h1 className="text-xl font-semibold">Create your account</h1>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <form action={signUpAction} className="flex flex-col gap-3">
        <input
          name="workspaceName"
          type="text"
          placeholder="Workspace name (e.g. your company)"
          required
          className="rounded border px-3 py-2"
        />
        <input
          name="email"
          type="email"
          placeholder="Email"
          required
          className="rounded border px-3 py-2"
        />
        <input
          name="password"
          type="password"
          placeholder="Password (min 8 characters)"
          required
          minLength={8}
          className="rounded border px-3 py-2"
        />
        <button type="submit" className="rounded bg-black px-3 py-2 text-white">
          Sign up
        </button>
      </form>
      <form action={signInWithGoogleAction}>
        <button type="submit" className="w-full rounded border px-3 py-2">
          Continue with Google
        </button>
      </form>
      <p className="text-sm text-zinc-600">
        Already have an account?{" "}
        <a href="/sign-in" className="underline">
          Sign in
        </a>
      </p>
    </div>
  );
}
