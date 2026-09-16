import { FormEvent, useState } from "react";
import { Navigate } from "react-router-dom";
import { Button } from "@/components/Button";
import { useAuthStore } from "@/stores/auth";

export function LoginPage() {
  const token = useAuthStore((s) => s.token);
  const login = useAuthStore((s) => s.login);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (token) return <Navigate to="/trips" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const err = await login(password);
    setLoading(false);
    if (err) setError(err);
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col justify-center px-4">
      <h1 className="text-xl font-semibold text-ink">行迹</h1>
      <p className="mt-2 text-sm text-ink-muted">个人旅行规划工具</p>
      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="访问密码"
          className="h-11 w-full rounded-full bg-surface-2 px-4 text-sm outline-none placeholder:text-ink-muted"
          autoFocus
        />
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button type="submit" className="w-full" disabled={loading || !password}>
          {loading ? "登录中…" : "进入"}
        </Button>
      </form>
    </div>
  );
}
