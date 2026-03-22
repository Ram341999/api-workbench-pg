import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { toast } from "sonner";

const Spinner = () => (
  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
  </svg>
);

export default function LoginPage() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // mode: "login" | "signup"
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loadingEmail, setLoadingEmail] = useState(false);
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [loadingDemo, setLoadingDemo] = useState(false);

  useEffect(() => {
    const error = searchParams.get("error");
    if (error) {
      const msgs = {
        oauth_failed: "Google sign-in was cancelled or failed.",
        token_exchange_failed: "Failed to exchange token. Please try again.",
        server_error: "Server error during sign-in. Please try again.",
      };
      toast.error(msgs[error] || "Sign-in failed.");
    }
  }, [searchParams]);

  useEffect(() => {
    if (user) navigate("/");
  }, [user, navigate]);

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) { toast.error("Please fill in all fields"); return; }
    if (mode === "signup" && !name) { toast.error("Please enter your name"); return; }
    if (password.length < 6) { toast.error("Password must be at least 6 characters"); return; }

    setLoadingEmail(true);
    try {
      if (mode === "signup") {
        await api.registerEmail({ email, password, name });
        toast.success("Account created! Signing you in…");
      }
      await api.loginEmail({ email, password });
      const me = await api.getMe();
      if (me.authenticated) {
        setUser(me.user);
        navigate("/");
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || (mode === "signup" ? "Sign up failed" : "Invalid email or password"));
    } finally {
      setLoadingEmail(false);
    }
  };

  const handleGoogleLogin = () => {
    setLoadingGoogle(true);
    api.loginWithGoogle();
  };

  const handleDemoLogin = async () => {
    setLoadingDemo(true);
    try {
      await api.loginDemo();
      const me = await api.getMe();
      if (me.authenticated) { setUser(me.user); navigate("/"); }
    } catch { toast.error("Demo login failed"); }
    finally { setLoadingDemo(false); }
  };

  const anyLoading = loadingEmail || loadingGoogle || loadingDemo;

  return (
    <div className="min-h-screen bg-[#09090b] flex items-center justify-center p-4">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 mb-4 shadow-lg shadow-blue-500/20">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <path d="M4 8h20M4 14h14M4 20h8" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
              <circle cx="22" cy="20" r="4" stroke="white" strokeWidth="2"/>
              <path d="M25 23l2 2" stroke="white" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-zinc-100 tracking-tight">API Workbench</h1>
          <p className="text-sm text-zinc-500 mt-1">Your personal API testing workspace</p>
        </div>

        {/* Card */}
        <div className="bg-zinc-900/80 backdrop-blur border border-zinc-800 rounded-2xl p-6 shadow-xl">

          {/* Mode toggle */}
          <div className="flex bg-zinc-800/60 rounded-lg p-1 mb-5">
            <button
              onClick={() => setMode("login")}
              className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${mode === "login" ? "bg-zinc-700 text-zinc-100 shadow-sm" : "text-zinc-500 hover:text-zinc-300"}`}
            >
              Sign in
            </button>
            <button
              onClick={() => setMode("signup")}
              className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${mode === "signup" ? "bg-zinc-700 text-zinc-100 shadow-sm" : "text-zinc-500 hover:text-zinc-300"}`}
            >
              Create account
            </button>
          </div>

          {/* Email/password form */}
          <form onSubmit={handleEmailSubmit} className="space-y-3 mb-4">
            {mode === "signup" && (
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Your name"
                  disabled={anyLoading}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500 disabled:opacity-50 transition-colors"
                />
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                disabled={anyLoading}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500 disabled:opacity-50 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={mode === "signup" ? "At least 6 characters" : "Your password"}
                  disabled={anyLoading}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 pr-9 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500 disabled:opacity-50 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  ) : (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={anyLoading}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm py-2.5 px-4 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loadingEmail ? <><Spinner /> {mode === "signup" ? "Creating account…" : "Signing in…"}</> : (mode === "signup" ? "Create account" : "Sign in")}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-zinc-800" />
            <span className="text-xs text-zinc-600">or continue with</span>
            <div className="flex-1 h-px bg-zinc-800" />
          </div>

          {/* Google */}
          <button
            onClick={handleGoogleLogin}
            disabled={anyLoading}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-zinc-100 text-zinc-900 font-medium text-sm py-2.5 px-4 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed mb-2 shadow-sm"
          >
            {loadingGoogle ? <Spinner /> : (
              <svg width="17" height="17" viewBox="0 0 18 18">
                <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
                <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
                <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
              </svg>
            )}
            {loadingGoogle ? "Redirecting…" : "Google"}
          </button>

          {/* Demo */}
          <button
            onClick={handleDemoLogin}
            disabled={anyLoading}
            className="w-full flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100 text-sm py-2 px-4 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed border border-zinc-700/50"
          >
            {loadingDemo ? <Spinner /> : null}
            {loadingDemo ? "Signing in…" : "Try Demo — no account needed"}
          </button>
        </div>

        <p className="text-center text-xs text-zinc-700 mt-5">API Workbench · Built for developers</p>
      </div>
    </div>
  );
}
