import { useEffect, useState, type ButtonHTMLAttributes, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  Activity, ArrowUpRight, Bell, CalendarDays, Check, ChevronRight, CircleHelp,
  Clock3, Command, Compass, FileText, Globe2, LayoutDashboard, Menu, Plus, RefreshCw,
  Send, Settings2, ShieldCheck, Sparkles, Target, Users, X, Zap,
} from 'lucide-react';
import {
  getGetProjectQueryKey, getListCompetitorsQueryKey,
  getListPostsQueryKey, getListProjectsQueryKey, getListScheduleQueryKey,
  getListChannelsQueryKey,
  useAnalyzeProject, useCreateCompetitor, useCreateProject, useGeneratePost,
  useGetDashboard, useGetProject, useListCompetitors, useListPosts, useListProjects,
  useListSchedule, useListChannels, useCreateChannel, useDeleteChannel,
  usePublishPost, useRegeneratePost, useSchedulePost, useSyncCompetitors, useTestChannel,
  useUpdatePost, useUpdateProject, useUpdateSchedule,
} from '@workspace/api-client-react';
import type { Competitor, Post, Project, ScheduleItem, SocialChannel } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Link, Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import { Toaster as SonnerToaster, toast } from 'sonner';

const queryClient = new QueryClient();

const navItems = [
  { href: '/app', label: 'Обзор', icon: LayoutDashboard },
  { href: '/projects', label: 'Проекты', icon: Target },
  { href: '/content', label: 'Контент', icon: FileText },
  { href: '/radar', label: 'Радар', icon: Compass },
  { href: '/calendar', label: 'Календарь', icon: CalendarDays },
];

function cn(...parts: Array<string | false | null | undefined>) { return parts.filter(Boolean).join(' '); }
function errorText(error: unknown, fallback = 'Что-то пошло не так') {
  return error instanceof Error && error.message ? error.message.replace(/^HTTP \d+ [^:]*:\s*/, '') : fallback;
}
function fmtDate(value?: string) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(new Date(value));
}
function fmtDateTime(value?: string) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}
function statusLabel(status?: string) {
  const map: Record<string, string> = { draft: 'Черновик', approved: 'Одобрено', scheduled: 'Запланировано', published: 'Опубликовано', analyzing: 'Анализируем' };
  return map[status ?? ''] ?? status ?? 'Новый';
}
function platformLabel(platform: string) {
  return ({ vk: 'VK', ok: 'OK', max: 'MAX', telegram: 'Telegram', zen: 'Дзен' } as Record<string, string>)[platform] ?? platform;
}

function Button({ children, className, variant = 'primary', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'quiet' | 'outline' | 'danger' }) {
  return <button {...props} className={cn(
    'inline-flex items-center justify-center gap-2 rounded-md px-3.5 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50',
    variant === 'primary' && 'bg-primary text-primary-foreground shadow-sm hover:brightness-95',
    variant === 'quiet' && 'text-muted-foreground hover:bg-muted hover:text-foreground',
    variant === 'outline' && 'border border-border bg-card text-foreground hover:border-primary/50 hover:bg-muted',
    variant === 'danger' && 'border border-destructive/25 bg-destructive/10 text-destructive hover:bg-destructive/15',
    className,
  )} />;
}

function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'orange' | 'teal' | 'dark' }) {
  return <span className={cn(
    'inline-flex items-center rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[.11em]',
    tone === 'neutral' && 'bg-muted text-muted-foreground',
    tone === 'orange' && 'bg-primary/12 text-primary',
    tone === 'teal' && 'bg-accent/12 text-accent',
    tone === 'dark' && 'bg-sidebar/10 text-sidebar',
  )}>{children}</span>;
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={cn('animate-pulse rounded bg-muted', className)} />;
}

function EmptyState({ icon: Icon, title, text, action }: { icon: typeof Sparkles; title: string; text: string; action?: ReactNode }) {
  return <div className="flex min-h-52 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/60 px-6 text-center">
    <div className="mb-3 rounded-full bg-secondary p-3 text-accent"><Icon size={19} /></div>
    <h3 className="font-bold text-foreground">{title}</h3>
    <p className="mt-1 max-w-sm text-sm text-muted-foreground">{text}</p>
    {action && <div className="mt-4">{action}</div>}
  </div>;
}

function BrandMark() {
  return <span className="relative grid size-10 place-items-center rounded-md bg-primary text-sidebar"><Zap size={19} strokeWidth={2.8} /></span>;
}

function LandingPage() {
  return <div className="landing-page min-h-[100dvh] overflow-hidden bg-background text-foreground">
    <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-5 py-5 md:px-9">
      <Link href="/" className="flex items-center gap-3" data-testid="link-landing-brand">
        <BrandMark />
        <span><span className="block text-[15px] font-extrabold tracking-tight">AI Контент</span><span className="font-mono text-[10px] uppercase tracking-[.16em] text-muted-foreground">завод / 01</span></span>
      </Link>
      <Link href="/login" className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2.5 text-sm font-bold transition hover:border-primary/50 hover:text-primary" data-testid="link-landing-login">Войти по почте <ArrowUpRight size={15} /></Link>
    </header>
    <main className="relative mx-auto max-w-7xl px-5 pb-16 pt-8 md:px-9 md:pt-14">
      <div className="pointer-events-none absolute -right-40 top-0 size-[520px] rounded-full bg-primary/10 blur-3xl" />
      <section className="grid items-center gap-10 lg:grid-cols-[.9fr_1.1fr] lg:gap-16">
        <div className="relative z-10 max-w-xl animate-in">
          <div className="inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent/8 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[.16em] text-accent"><span className="size-1.5 rounded-full bg-accent" />Контентная система для бизнеса</div>
          <h1 className="mt-7 text-5xl font-extrabold leading-[.98] tracking-[-.065em] md:text-7xl">Контент, который звучит <span className="text-primary">как ваш бренд.</span></h1>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-muted-foreground">AI‑Контент‑Завод изучает ваш бизнес, собирает ДНК бренда и превращает её в готовые публикации, идеи и контент‑план.</p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/login" className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-extrabold text-primary-foreground shadow-lg shadow-primary/20 transition hover:-translate-y-0.5 hover:brightness-95" data-testid="link-landing-start">Начать по почте <ArrowUpRight size={16} /></Link>
            <span className="flex items-center gap-2 px-2 text-xs text-muted-foreground"><ShieldCheck size={15} className="text-accent" />Регистрация по почте</span>
          </div>
          <div className="mt-10 grid max-w-md grid-cols-3 gap-5 border-t border-border pt-5">
            <div><div className="text-2xl font-extrabold tracking-[-.05em]">1</div><div className="mt-1 text-xs leading-snug text-muted-foreground">единая ДНК бренда</div></div>
            <div><div className="text-2xl font-extrabold tracking-[-.05em]">3–5</div><div className="mt-1 text-xs leading-snug text-muted-foreground">вариантов на идею</div></div>
            <div><div className="text-2xl font-extrabold tracking-[-.05em]">24/7</div><div className="mt-1 text-xs leading-snug text-muted-foreground">контентный ритм</div></div>
          </div>
        </div>
        <div className="relative animate-in delay-1">
          <div className="cover-art relative min-h-[500px] overflow-hidden rounded-2xl border border-sidebar-border bg-sidebar p-5 text-sidebar-foreground shadow-2xl shadow-sidebar/20 md:min-h-[620px] md:p-8">
            <div className="absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(255,255,255,.12)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.12)_1px,transparent_1px)] [background-size:32px_32px]" />
            <div className="relative flex items-center justify-between"><div className="font-mono text-[10px] uppercase tracking-[.2em] text-sidebar-foreground/45">Контентный цех / live</div><span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.14em] text-accent"><span className="size-1.5 rounded-full bg-accent" />Система активна</span></div>
            <div className="relative mt-14 grid gap-5 md:mt-20 md:grid-cols-[1fr_.72fr]">
              <div className="rounded-xl border border-sidebar-border bg-sidebar-accent/80 p-5 backdrop-blur md:p-6"><div className="font-mono text-[10px] uppercase tracking-[.18em] text-primary">Brand DNA / 01</div><h2 className="mt-5 text-3xl font-extrabold leading-tight tracking-[-.05em] md:text-4xl">Сложное становится понятным.</h2><p className="mt-4 max-w-xs text-sm leading-relaxed text-sidebar-foreground/60">Система держит в фокусе аудиторию, голос и ценность бренда в каждой публикации.</p><div className="mt-8 flex flex-wrap gap-2"><span className="rounded border border-accent/25 bg-accent/10 px-2 py-1 text-[10px] font-bold text-accent">ясность</span><span className="rounded border border-accent/25 bg-accent/10 px-2 py-1 text-[10px] font-bold text-accent">доверие</span><span className="rounded border border-accent/25 bg-accent/10 px-2 py-1 text-[10px] font-bold text-accent">ритм</span></div></div>
              <div className="space-y-5"><div className="rounded-xl border border-sidebar-border bg-primary p-5 text-sidebar shadow-lg shadow-primary/20"><div className="flex items-center justify-between"><span className="font-mono text-[10px] uppercase tracking-[.18em] opacity-70">Новый материал</span><Sparkles size={17} /></div><div className="mt-8 text-lg font-extrabold leading-tight">Как бренду говорить проще</div><div className="mt-4 h-1 rounded-full bg-sidebar/20"><div className="h-1 w-4/5 rounded-full bg-sidebar" /></div><div className="mt-3 text-[10px] font-bold uppercase tracking-[.12em] opacity-70">готово к редактуре</div></div><div className="rounded-xl border border-sidebar-border bg-sidebar-accent/70 p-5"><div className="font-mono text-[10px] uppercase tracking-[.18em] text-sidebar-foreground/45">Radar / 03</div><div className="mt-4 flex items-end justify-between"><span className="text-4xl font-extrabold tracking-[-.07em]">12</span><span className="mb-1 text-right text-xs leading-snug text-sidebar-foreground/50">свежих<br />направлений</span></div><div className="mt-5 flex gap-1"><span className="h-1.5 flex-1 rounded-full bg-accent" /><span className="h-1.5 flex-1 rounded-full bg-accent/60" /><span className="h-1.5 flex-1 rounded-full bg-accent/30" /><span className="h-1.5 flex-1 rounded-full bg-sidebar-border" /></div></div></div>
            </div>
            <div className="relative mt-10 flex items-center justify-between border-t border-sidebar-border pt-5 md:mt-16"><span className="font-mono text-[10px] uppercase tracking-[.16em] text-sidebar-foreground/40">Сгенерировано для Northline</span><span className="text-xs font-bold text-primary">AI / 01</span></div>
          </div>
        </div>
      </section>
      <section className="relative mt-24 border-t border-border pt-10 md:mt-32">
        <div className="max-w-xl"><div className="font-mono text-[10px] uppercase tracking-[.2em] text-primary">Почему это работает</div><h2 className="mt-3 text-3xl font-extrabold tracking-[-.05em] md:text-5xl">Меньше рутины. Больше узнаваемости.</h2></div>
        <div className="mt-10 grid gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-3">
          {[
            ['Понимает бизнес', 'Анализирует сайт или сообщество и собирает контекст, который обычно приходится объяснять SMM-команде вручную.'],
            ['Пишет в вашем голосе', 'Каждый текст строится вокруг одной Brand DNA: аудитории, преимуществ, ценностей и Tone of Voice.'],
            ['Доводит до публикации', 'От первой идеи до редактора и календаря — контент не теряется в заметках и чатах.'],
          ].map(([title, text], index) => <article key={title} className="bg-card p-6 md:p-8"><div className="font-mono text-[10px] text-primary">0{index + 1}</div><h3 className="mt-10 text-xl font-extrabold tracking-[-.03em]">{title}</h3><p className="mt-3 text-sm leading-relaxed text-muted-foreground">{text}</p></article>)}
        </div>
      </section>
      <section className="relative mt-16 flex flex-col items-start justify-between gap-6 rounded-xl bg-secondary p-6 md:flex-row md:items-center md:p-8"><div><div className="font-mono text-[10px] uppercase tracking-[.18em] text-accent">Ваш следующий шаг</div><h2 className="mt-2 text-2xl font-extrabold tracking-[-.04em]">Запустите свой первый контентный поток.</h2></div><Link href="/login" className="inline-flex shrink-0 items-center gap-2 rounded-md bg-sidebar px-4 py-3 text-sm font-bold text-sidebar-foreground transition hover:bg-sidebar/90" data-testid="link-landing-bottom-login">Войти по почте <ArrowUpRight size={15} /></Link></section>
    </main>
    <footer className="mx-auto flex max-w-7xl items-center justify-between border-t border-border px-5 py-5 text-xs text-muted-foreground md:px-9"><span>AI Контент Завод</span><span className="font-mono uppercase tracking-[.14em]">content / with intent</span></footer>
  </div>;
}

function LoginPage() {
  const [, setLocation] = useLocation(); const [mode, setMode] = useState<'login' | 'register'>('login'); const [form, setForm] = useState({ email: '', password: '', name: '' }); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setError(''); try { const response = await fetch(`/api/auth/${mode}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) }); const payload = await response.json().catch(() => ({})) as { error?: string }; if (!response.ok) throw new Error(payload.error ?? 'Не удалось выполнить вход'); setLocation('/app'); } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось выполнить вход'); } finally { setBusy(false); } };
  const set = (key: keyof typeof form, value: string) => setForm((prev) => ({ ...prev, [key]: value }));
  return <div className="flex min-h-[100dvh] items-center justify-center bg-sidebar px-5 py-8 text-sidebar-foreground">
    <div className="w-full max-w-md animate-in">
      <Link href="/" className="mx-auto flex w-fit items-center gap-3" data-testid="link-login-brand"><BrandMark /><span><span className="block text-[15px] font-extrabold tracking-tight">AI Контент</span><span className="font-mono text-[10px] uppercase tracking-[.16em] text-sidebar-foreground/45">завод / 01</span></span></Link>
      <div className="mt-10 rounded-xl border border-sidebar-border bg-sidebar-accent/75 p-6 shadow-2xl md:p-8">
        <div className="font-mono text-[10px] uppercase tracking-[.2em] text-primary">{mode === 'login' ? 'Вход в цех' : 'Регистрация в цехе'}</div>
        <h1 className="mt-3 text-3xl font-extrabold tracking-[-.05em]">{mode === 'login' ? 'Продолжить работу с брендом' : 'Создайте рабочее пространство'}</h1>
        <p className="mt-3 text-sm leading-relaxed text-sidebar-foreground/60">Почта нужна только для входа и сохранения вашего рабочего пространства.</p>
        {error && <div className="mt-5 rounded-md border border-primary/30 bg-primary/10 px-3 py-2.5 text-xs leading-relaxed text-primary">{error}</div>}
        <form onSubmit={submit} className="mt-7 space-y-4" data-testid="form-email-auth">
          {mode === 'register' && <Field label="Имя" value={form.name} onChange={(v) => set('name', v)} placeholder="Как к вам обращаться" required testId="input-auth-name" />}
          <Field label="Почта" value={form.email} onChange={(v) => set('email', v)} placeholder="you@example.com" required testId="input-auth-email" />
          <Field label="Пароль" value={form.password} onChange={(v) => set('password', v)} placeholder="Минимум 8 символов" required testId="input-auth-password" />
          <Button type="submit" disabled={busy} className="mt-2 w-full" data-testid="button-submit-auth">{busy ? <RefreshCw size={15} className="animate-spin" /> : <ArrowUpRight size={16} />}{mode === 'login' ? 'Войти' : 'Зарегистрироваться'}</Button>
        </form>
        <button onClick={() => { setMode((value) => value === 'login' ? 'register' : 'login'); setError(''); }} className="mt-5 w-full text-center text-xs font-bold text-primary hover:underline" data-testid="button-toggle-auth">{mode === 'login' ? 'Нет аккаунта? Зарегистрироваться' : 'Уже есть аккаунт? Войти'}</button>
        <div className="mt-5 flex items-center justify-center gap-2 text-center font-mono text-[10px] uppercase tracking-[.12em] text-sidebar-foreground/35"><ShieldCheck size={13} className="text-accent" />Данные защищены</div>
      </div>
      <Link href="/" className="mt-6 block text-center text-xs font-semibold text-sidebar-foreground/45 transition hover:text-sidebar-foreground" data-testid="link-login-back">Вернуться на обложку</Link>
    </div>
  </div>;
}

function ProtectedShell({ children }: { children: ReactNode }) {
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<'checking' | 'authenticated'>('checking');
  useEffect(() => {
    let active = true;
    fetch('/api/auth/session')
      .then((response) => response.json() as Promise<{ authenticated?: boolean }>)
      .then((session) => {
        if (!active) return;
        if (session.authenticated) setStatus('authenticated');
        else setLocation('/login');
      })
      .catch(() => {
        if (active) setLocation('/login?error=session');
      });
    return () => { active = false; };
  }, [setLocation]);
  if (status === 'checking') return <div className="flex min-h-[100dvh] items-center justify-center bg-background"><div className="flex items-center gap-3 text-sm font-semibold text-muted-foreground"><span className="size-2 animate-pulse rounded-full bg-primary" />Проверяем доступ…</div></div>;
  return <Shell>{children}</Shell>;
}

function Shell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const active = navItems.find((item) => item.href === location)?.label ?? 'Настройки';
  return <div className="noise min-h-[100dvh] bg-background text-foreground">
    <aside className={cn(
      'fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col bg-sidebar px-4 py-5 text-sidebar-foreground transition-transform md:translate-x-0',
      mobileOpen ? 'translate-x-0' : '-translate-x-full',
    )}>
      <div className="flex items-center justify-between px-2">
        <Link href="/app" className="flex items-center gap-3" data-testid="link-brand">
          <span className="relative grid size-9 place-items-center rounded-md bg-primary text-sidebar"><Zap size={18} strokeWidth={2.8} /></span>
          <span><span className="block text-[15px] font-extrabold tracking-tight">AI Контент</span><span className="font-mono text-[10px] uppercase tracking-[.16em] text-sidebar-foreground/50">завод / 01</span></span>
        </Link>
        <button onClick={() => setMobileOpen(false)} className="rounded p-1 text-sidebar-foreground/60 hover:bg-sidebar-accent md:hidden" data-testid="button-close-menu"><X size={18} /></button>
      </div>
      <div className="mt-10 px-2 font-mono text-[10px] uppercase tracking-[.16em] text-sidebar-foreground/40">Рабочее пространство</div>
      <nav className="mt-3 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setMobileOpen(false)} data-testid={`link-nav-${label.toLowerCase()}`} className={cn(
          'group flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold',
          location === href ? 'bg-sidebar-accent text-sidebar-foreground' : 'text-sidebar-foreground/62 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground',
        )}><Icon size={17} className={cn(location === href ? 'text-primary' : 'text-sidebar-foreground/45', 'transition-transform group-hover:translate-x-0.5')} /><span>{label}</span>{location === href && <span className="ml-auto size-1.5 rounded-full bg-primary" />}</Link>)}
      </nav>
      <div className="mt-8 px-2 font-mono text-[10px] uppercase tracking-[.16em] text-sidebar-foreground/40">Система</div>
      <nav className="mt-3 space-y-1">
        <Link href="/settings" data-testid="link-nav-settings" className={cn('flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold', location === '/settings' ? 'bg-sidebar-accent text-sidebar-foreground' : 'text-sidebar-foreground/62 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground')}><Settings2 size={17} className={location === '/settings' ? 'text-primary' : 'text-sidebar-foreground/45'} />Настройки</Link>
      </nav>
      <div className="mt-auto rounded-lg border border-sidebar-border bg-sidebar-accent/40 p-3">
        <div className="flex items-center justify-between"><span className="font-mono text-[10px] uppercase tracking-[.15em] text-sidebar-foreground/45">План</span><Badge tone="orange">Studio</Badge></div>
        <p className="mt-3 text-xs leading-relaxed text-sidebar-foreground/70">Контент-поток синхронизирован. 18 генераций осталось.</p>
        <div className="mt-3 h-1 rounded-full bg-sidebar-border"><div className="h-1 w-[62%] rounded-full bg-primary" /></div>
      </div>
      <div className="mt-4 flex items-center gap-2 border-t border-sidebar-border pt-4 px-2"><div className="grid size-7 place-items-center rounded-full bg-accent text-xs font-bold text-sidebar">АК</div><div className="min-w-0"><p className="truncate text-xs font-semibold">Анна Крылова</p><p className="truncate text-[10px] text-sidebar-foreground/45">редактор бренда</p></div><button className="ml-auto text-sidebar-foreground/50 hover:text-sidebar-foreground" data-testid="button-profile-menu"><CircleHelp size={16} /></button></div>
    </aside>
    {mobileOpen && <button className="fixed inset-0 z-30 bg-sidebar/40 md:hidden" onClick={() => setMobileOpen(false)} aria-label="Закрыть меню" data-testid="button-overlay" />}
    <main className="min-h-[100dvh] md:pl-[248px]">
      <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between border-b border-border/70 bg-background/90 px-5 backdrop-blur md:px-9">
        <div className="flex items-center gap-3"><button onClick={() => setMobileOpen(true)} className="rounded-md p-2 hover:bg-muted md:hidden" data-testid="button-open-menu"><Menu size={20} /></button><div><div className="font-mono text-[10px] uppercase tracking-[.17em] text-muted-foreground">Контентный цех / {active}</div><h1 className="mt-0.5 text-sm font-extrabold tracking-tight md:text-base">{active}</h1></div></div>
        <div className="flex items-center gap-2"><button className="hidden items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground hover:border-primary/50 sm:flex" data-testid="button-command-search"><Command size={14} />Быстрый поиск <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">⌘ K</kbd></button><button className="relative rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground" data-testid="button-notifications"><Bell size={18} /><span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-primary" /></button></div>
      </header>
      <div className="mx-auto max-w-[1440px] px-5 py-7 md:px-9 md:py-9">{children}</div>
    </main>
  </div>;
}

function PageIntro({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end"><div className="animate-in"><div className="font-mono text-[10px] uppercase tracking-[.2em] text-primary">{eyebrow}</div><h2 className="mt-2 text-3xl font-extrabold tracking-[-.04em] text-foreground md:text-4xl">{title}</h2>{description && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>}</div>{action && <div className="animate-in delay-1">{action}</div>}</div>;
}

function DashboardPage() {
  const dashboard = useGetDashboard();
  const data = dashboard.data;
  if (dashboard.isLoading) return <DashboardSkeleton />;
  if (dashboard.isError || !data) return <EmptyState icon={Activity} title="Не удалось загрузить обзор" text="Проверьте подключение и попробуйте обновить рабочее пространство." action={<Button onClick={() => dashboard.refetch()} data-testid="button-retry-dashboard"><RefreshCw size={15} />Повторить</Button>} />;
  const project = data.project;
  return <div className="workspace-grid -mx-5 -my-7 min-h-[calc(100dvh-68px)] px-5 py-7 md:-mx-9 md:-my-9 md:px-9 md:py-9">
    <PageIntro eyebrow="Сегодня / 09:41" title={`Доброе утро, Анна`} description="Ваш контентный поток собран в одном месте. Вот что требует внимания сейчас." action={<Link href="/content" className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-sm hover:brightness-95" data-testid="link-generate-content"><Sparkles size={16} />Создать контент<ArrowUpRight size={15} /></Link>} />
    <div className="grid gap-4 md:grid-cols-4">
      <Metric label="Всего материалов" value={data.totalPosts} note="за всё время" icon={FileText} tone="orange" />
      <Metric label="Одобрено" value={data.approvedPosts} note="готовы к выходу" icon={Check} tone="teal" />
      <Metric label="В расписании" value={data.scheduledPosts} note="ближайшие 14 дней" icon={CalendarDays} tone="ink" />
      <Metric label="Идей с радара" value={data.radarIdeas} note="для новых постов" icon={Compass} tone="yellow" />
    </div>
    <div className="mt-7 grid gap-5 lg:grid-cols-[1.45fr_.8fr]">
      <section className="animate-in delay-1 overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-4"><div><div className="font-mono text-[10px] uppercase tracking-[.17em] text-muted-foreground">Активный проект</div><h3 className="mt-1 text-lg font-extrabold">{project.name}</h3></div><Link href="/projects" className="text-xs font-bold text-primary hover:underline" data-testid="link-edit-project">Открыть проект <ChevronRight className="inline" size={14} /></Link></div>
        <div className="grid gap-6 p-5 md:grid-cols-[1fr_1.2fr]"><div><div className="flex items-center gap-2"><span className="size-2 rounded-full bg-accent" /><span className="font-mono text-[10px] uppercase tracking-[.14em] text-accent">{statusLabel(project.status)}</span></div><p className="mt-4 text-2xl font-extrabold leading-tight tracking-[-.035em]">{project.usp || 'Добавьте ценностное предложение бренда'}</p><div className="mt-5 flex flex-wrap gap-2"><Badge tone="dark">{project.industry || 'Индустрия не указана'}</Badge><Badge>{project.tone || 'Тон не задан'}</Badge></div></div><div className="rounded-md bg-secondary/70 p-4"><div className="flex items-center justify-between"><span className="font-mono text-[10px] uppercase tracking-[.17em] text-accent">Brand DNA</span><span className="text-xs font-semibold text-accent">готово</span></div><p className="mt-3 text-sm leading-relaxed text-secondary-foreground">{project.audience || 'Аудитория появится после анализа источника.'}</p><div className="mt-4 flex gap-1">{(project.values?.length ? project.values : ['ясность', 'доверие', 'ритм']).slice(0, 3).map((v) => <span key={v} className="rounded border border-accent/20 bg-card/50 px-2 py-1 text-[10px] font-semibold text-accent">{v}</span>)}</div></div></div>
      </section>
      <section className="animate-in delay-2 rounded-lg border border-border bg-sidebar p-5 text-sidebar-foreground"><div className="flex items-start justify-between"><div><div className="font-mono text-[10px] uppercase tracking-[.17em] text-sidebar-foreground/45">Следующий шаг</div><h3 className="mt-2 text-lg font-extrabold">Подготовить неделю</h3></div><span className="grid size-9 place-items-center rounded-full bg-primary text-sidebar"><CalendarDays size={17} /></span></div><p className="mt-8 max-w-[230px] text-sm leading-relaxed text-sidebar-foreground/65">У вас есть одобренные идеи. Разложите их по календарю, чтобы не возвращаться к этому завтра.</p><Link href="/calendar" className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-primary hover:underline" data-testid="link-next-calendar">Открыть календарь <ArrowUpRight size={15} /></Link><div className="mt-7 border-t border-sidebar-border pt-4 font-mono text-[10px] uppercase tracking-[.13em] text-sidebar-foreground/40">Рекомендация AI / 02</div></section>
    </div>
    <section className="mt-5 animate-in delay-3 rounded-lg border border-border bg-card"><div className="flex items-center justify-between border-b border-border px-5 py-4"><div><div className="font-mono text-[10px] uppercase tracking-[.17em] text-muted-foreground">Последние материалы</div><h3 className="mt-1 text-lg font-extrabold">Что вышло из цеха</h3></div><Link href="/content" className="text-xs font-bold text-primary hover:underline" data-testid="link-all-content">Весь контент <ChevronRight className="inline" size={14} /></Link></div>{data.recentPosts?.length ? <div className="divide-y divide-border">{data.recentPosts.slice(0, 4).map((post, index) => <PostRow key={post.id} post={post} index={index} />)}</div> : <div className="p-5"><EmptyState icon={FileText} title="Пока тихо" text="Сгенерируйте первый материал — он появится здесь." action={<Link href="/content" className="text-sm font-bold text-primary" data-testid="link-empty-content">Перейти к генератору</Link>} /></div>}</section>
  </div>;
}

function DashboardSkeleton() { return <div><div className="mb-8"><Skeleton className="h-3 w-24" /><Skeleton className="mt-3 h-10 w-80" /><Skeleton className="mt-3 h-4 w-96" /></div><div className="grid gap-4 md:grid-cols-4">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28" />)}</div><div className="mt-7 grid gap-5 lg:grid-cols-[1.45fr_.8fr]"><Skeleton className="h-72" /><Skeleton className="h-72" /></div></div>; }
function Metric({ label, value, note, icon: Icon, tone }: { label: string; value: number; note: string; icon: typeof FileText; tone: string }) { return <div className="animate-in rounded-lg border border-border bg-card p-4"><div className="flex items-center justify-between"><span className="text-xs font-semibold text-muted-foreground">{label}</span><Icon size={16} className={cn(tone === 'orange' && 'text-primary', tone === 'teal' && 'text-accent', tone === 'ink' && 'text-sidebar', tone === 'yellow' && 'text-chart-4')} /></div><div className="mt-3 text-3xl font-extrabold tracking-[-.05em]">{value}</div><div className="mt-1 font-mono text-[10px] uppercase tracking-[.12em] text-muted-foreground">{note}</div></div>; }
function PostRow({ post, index = 0, onEdit }: { post: Post; index?: number; onEdit?: (post: Post) => void }) { return <div className={cn('group flex items-center gap-4 px-5 py-4 animate-in', `delay-${Math.min(index + 1, 4)}`)} data-testid={`row-post-${post.id}`}><div className="grid size-10 shrink-0 place-items-center rounded-md bg-secondary text-accent"><FileText size={17} /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h4 className="truncate text-sm font-bold">{post.title}</h4><Badge tone={post.status === 'approved' ? 'teal' : post.status === 'scheduled' ? 'orange' : 'neutral'}>{statusLabel(post.status)}</Badge></div><p className="mt-1 truncate text-xs text-muted-foreground">{post.goal} · {post.format} · {fmtDate(post.createdAt)}</p></div>{onEdit && <Button variant="quiet" onClick={() => onEdit(post)} className="opacity-0 group-hover:opacity-100" data-testid={`button-edit-post-${post.id}`}>Открыть</Button>}</div>; }

function ProjectForm({ project, onClose }: { project?: Project; onClose: () => void }) {
  const queryClient = useQueryClient();
  const create = useCreateProject(); const update = useUpdateProject(); const analyze = useAnalyzeProject();
  useGetProject(project?.id ?? 0, { query: { enabled: Boolean(project?.id), queryKey: getGetProjectQueryKey(project?.id ?? 0) } });
  const [form, setForm] = useState({ name: project?.name ?? '', sourceUrl: project?.sourceUrl ?? '', industry: project?.industry ?? '', audience: project?.audience ?? '', tone: project?.tone ?? '', usp: project?.usp ?? '', values: project?.values?.join(', ') ?? '' });
  const editing = Boolean(project);
  const busy = create.isPending || update.isPending || analyze.isPending;
  const set = (key: keyof typeof form, value: string) => setForm((prev) => ({ ...prev, [key]: value }));
  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!form.name.trim() || !form.sourceUrl.trim()) {
      toast.error('Заполните название и ссылку на источник');
      return;
    }
    const values = form.values.split(',').map((v) => v.trim()).filter(Boolean);
    if (editing && project) {
      update.mutate(
        { id: project.id, data: { name: form.name, industry: form.industry, audience: form.audience, tone: form.tone, usp: form.usp, values } },
        {
          onSuccess: () => {
            toast.success('Brand DNA обновлена');
            queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
            queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(project.id) });
            onClose();
          },
          onError: (error) => toast.error(errorText(error, 'Не удалось сохранить проект')),
        },
      );
    } else {
      create.mutate(
        { data: { name: form.name, sourceUrl: form.sourceUrl } },
        {
          onSuccess: (created) => {
            queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
            if (created?.id) {
              analyze.mutate(
                { id: created.id, data: { sourceUrl: form.sourceUrl } },
                {
                  onSuccess: () => {
                    toast.success('Проект создан, Brand DNA готова');
                    queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
                  },
                  onError: (error) => toast.error(errorText(error, 'Проект создан, но анализ не завершился')),
                },
              );
            }
            onClose();
          },
          onError: (error) => toast.error(errorText(error, 'Не удалось создать проект')),
        },
      );
    }
  };
  return <div className="fixed inset-0 z-50 flex justify-end bg-sidebar/40" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><form onSubmit={save} className="h-full w-full max-w-xl overflow-y-auto bg-card p-6 shadow-2xl md:p-9" data-testid="form-project"><div className="flex items-start justify-between"><div><div className="font-mono text-[10px] uppercase tracking-[.2em] text-primary">{editing ? 'Редактор проекта' : 'Новый проект'}</div><h2 className="mt-2 text-2xl font-extrabold tracking-[-.04em]">{editing ? 'Обновить Brand DNA' : 'Запустить проект'}</h2><p className="mt-2 text-sm text-muted-foreground">{editing ? 'Уточните характер бренда вручную.' : 'Источник поможет заводу понять ваш бренд с первого запуска.'}</p></div><button type="button" onClick={onClose} className="rounded p-2 text-muted-foreground hover:bg-muted" data-testid="button-close-project"><X size={20} /></button></div><div className="mt-8 space-y-5"><Field label="Название проекта" value={form.name} onChange={(v) => set('name', v)} placeholder="Например, Northline Studio" required testId="input-project-name" /><Field label="Сайт или источник" value={form.sourceUrl} onChange={(v) => set('sourceUrl', v)} placeholder="https://yourbrand.ru" required disabled={editing} testId="input-project-url" /><div className="grid gap-5 sm:grid-cols-2"><Field label="Индустрия" value={form.industry} onChange={(v) => set('industry', v)} placeholder="Ритейл, SaaS, услуги" testId="input-project-industry" /><Field label="Тон коммуникации" value={form.tone} onChange={(v) => set('tone', v)} placeholder="Уверенный, живой" testId="input-project-tone" /></div><Field label="Кому вы говорите" value={form.audience} onChange={(v) => set('audience', v)} placeholder="Ключевая аудитория и её контекст" testId="input-project-audience" textarea /><Field label="Ценностное предложение" value={form.usp} onChange={(v) => set('usp', v)} placeholder="В чём ваша сильная сторона?" testId="input-project-usp" textarea /><Field label="Ценности через запятую" value={form.values} onChange={(v) => set('values', v)} placeholder="ясность, скорость, забота" testId="input-project-values" /></div><div className="mt-8 flex items-center justify-between gap-3 border-t border-border pt-5"><span className="text-xs text-muted-foreground">{busy ? 'Цех обрабатывает данные…' : 'Все изменения сохраняются сразу'}</span><div className="flex gap-2"><Button type="button" variant="quiet" onClick={onClose} data-testid="button-cancel-project">Отмена</Button><Button type="submit" disabled={busy} data-testid="button-save-project">{busy ? <RefreshCw size={15} className="animate-spin" /> : <Check size={15} />}{editing ? 'Сохранить' : 'Создать и проанализировать'}</Button></div></div></form></div>;
}

function Field({ label, value, onChange, placeholder, required, disabled, textarea, testId }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; required?: boolean; disabled?: boolean; textarea?: boolean; testId: string }) { return <label className="block"><span className="mb-2 block text-xs font-bold text-foreground">{label}{required && <span className="ml-1 text-primary">*</span>}</span>{textarea ? <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} required={required} disabled={disabled} rows={3} data-testid={testId} className="w-full resize-none rounded-md border border-input bg-background px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground/65 focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-50" /> : <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} required={required} disabled={disabled} data-testid={testId} className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground/65 focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-50" />}</label>; }

function ProjectsPage() {
  const projects = useListProjects(); const [editing, setEditing] = useState<Project | undefined>(); const [open, setOpen] = useState(false);
  const list = projects.data ?? [];
  return <><PageIntro eyebrow="01 / Brand DNA" title="Проекты" description="Каждый проект — отдельная система координат для генерации. Сначала понимаем бренд, потом пишем за него." action={<Button onClick={() => { setEditing(undefined); setOpen(true); }} data-testid="button-new-project"><Plus size={16} />Новый проект</Button>} />{projects.isLoading ? <div className="grid gap-4 md:grid-cols-2">{[1, 2].map((i) => <Skeleton key={i} className="h-64" />)}</div> : projects.isError ? <EmptyState icon={Activity} title="Проекты не загрузились" text="Попробуйте обновить список." action={<Button onClick={() => projects.refetch()} data-testid="button-retry-projects">Обновить</Button>} /> : list.length === 0 ? <EmptyState icon={Target} title="Создайте первый проект" text="Добавьте сайт — AI соберёт Brand DNA и подготовит контентный контекст." action={<Button onClick={() => setOpen(true)} data-testid="button-empty-project"><Plus size={15} />Создать проект</Button>} /> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{list.map((project, index) => <article key={project.id} className={cn('group animate-in rounded-lg border border-border bg-card p-5 hover:border-primary/40', `delay-${Math.min(index + 1, 4)}`)} data-testid={`card-project-${project.id}`}><div className="flex items-start justify-between"><div className="grid size-10 place-items-center rounded-md bg-secondary text-accent"><Target size={18} /></div><Badge tone={project.status === 'ready' ? 'teal' : 'orange'}>{statusLabel(project.status)}</Badge></div><h3 className="mt-5 text-xl font-extrabold tracking-[-.03em]">{project.name}</h3><p className="mt-1 truncate text-xs text-muted-foreground">{project.sourceUrl}</p><div className="mt-5 grid grid-cols-2 gap-2 text-xs"><div className="rounded-md bg-muted/70 p-3"><span className="block font-mono text-[9px] uppercase tracking-[.12em] text-muted-foreground">Индустрия</span><span className="mt-1 block font-semibold">{project.industry || 'Не указана'}</span></div><div className="rounded-md bg-muted/70 p-3"><span className="block font-mono text-[9px] uppercase tracking-[.12em] text-muted-foreground">Тон</span><span className="mt-1 block font-semibold">{project.tone || 'Не задан'}</span></div></div><div className="mt-5 flex items-center justify-between border-t border-border pt-4"><span className="font-mono text-[10px] uppercase tracking-[.1em] text-muted-foreground">Создан {fmtDate(project.createdAt)}</span><Button variant="quiet" onClick={() => { setEditing(project); setOpen(true); }} data-testid={`button-edit-project-${project.id}`}>Настроить <ArrowUpRight size={14} /></Button></div></article>)}</div>}{open && <ProjectForm project={editing} onClose={() => setOpen(false)} />}</>;
}

function ContentPage() {
  const projects = useListProjects(); const [projectId, setProjectId] = useState<number | undefined>(); const [selected, setSelected] = useState<Post | undefined>(); const [filter, setFilter] = useState('all');
  useEffect(() => { if (!projectId && projects.data?.[0]?.id) setProjectId(projects.data[0].id); }, [projectId, projects.data]);
  const posts = useListPosts({ projectId: projectId ?? null, status: filter === 'all' ? null : filter }); const generate = useGeneratePost(); const queryClient = useQueryClient();
  const [brief, setBrief] = useState({ topic: '', goal: 'Вовлечение', format: 'Пост' });
  const update = useUpdatePost(); const regenerate = useRegeneratePost();
  const generateNow = (event: FormEvent) => {
    event.preventDefault();
    if (!projectId) {
      toast.error('Сначала создайте проект');
      return;
    }
    if (!brief.topic.trim()) {
      toast.error('Опишите тему или мысль');
      return;
    }
    generate.mutate(
      { data: { projectId, topic: brief.topic, goal: brief.goal, format: brief.format } },
      {
        onSuccess: (post) => {
          setBrief((p) => ({ ...p, topic: '' }));
          queryClient.invalidateQueries({ queryKey: getListPostsQueryKey({ projectId, status: null }) });
          toast.success(`Готово: «${post.title}»`);
          setSelected(post);
        },
        onError: (error) => toast.error(errorText(error, 'Не удалось сгенерировать материал')),
      },
    );
  };
  const visible = posts.data ?? [];
  const savePost = (data: { title?: string; goal?: string; format?: string; text?: string; status?: string }, options?: { close?: boolean; onSuccess?: () => void }) => update.mutate(
    { id: selected?.id ?? 0, data },
    {
      onSuccess: () => {
        if (selected) queryClient.invalidateQueries({ queryKey: getListPostsQueryKey({ projectId: selected.projectId, status: null }) });
        toast.success(data.status === 'approved' ? 'Материал одобрен' : 'Черновик сохранён');
         options?.onSuccess?.();
         if (options?.close !== false) setSelected(undefined);
      },
      onError: (error) => toast.error(errorText(error, 'Не удалось сохранить материал')),
    },
  );
  return <><PageIntro eyebrow="02 / Content engine" title="Контент" description="От брифа до одобрения — все варианты в одном потоке. Выберите проект и задайте следующую тему." action={<div className="flex items-center gap-2"><select value={projectId ?? ''} onChange={(e) => setProjectId(Number(e.target.value))} className="rounded-md border border-input bg-card px-3 py-2.5 text-sm font-semibold outline-none focus:border-primary" data-testid="select-content-project">{projects.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>} /><div className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]"><form onSubmit={generateNow} className="animate-in rounded-lg border border-border bg-sidebar p-5 text-sidebar-foreground lg:sticky lg:top-24 lg:h-fit" data-testid="form-generate-post"><div className="flex items-start justify-between"><div><div className="font-mono text-[10px] uppercase tracking-[.17em] text-primary">Новый запуск</div><h3 className="mt-2 text-xl font-extrabold">Что создаём?</h3></div><Sparkles size={20} className="text-primary" /></div><label className="mt-7 block"><span className="mb-2 block text-xs font-bold text-sidebar-foreground/70">Тема или мысль</span><textarea value={brief.topic} onChange={(e) => setBrief((p) => ({ ...p, topic: e.target.value }))} rows={5} placeholder="Например: почему хороший сервис начинается до покупки" className="w-full resize-none rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-3 text-sm outline-none placeholder:text-sidebar-foreground/35 focus:border-primary" data-testid="input-post-topic" /></label><div className="mt-5 grid gap-4 sm:grid-cols-2"><label><span className="mb-2 block text-xs font-bold text-sidebar-foreground/70">Цель</span><select value={brief.goal} onChange={(e) => setBrief((p) => ({ ...p, goal: e.target.value }))} className="w-full rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2.5 text-sm outline-none" data-testid="select-post-goal"><option>Вовлечение</option><option>Продажа</option><option>Доверие</option><option>Охват</option></select></label><label><span className="mb-2 block text-xs font-bold text-sidebar-foreground/70">Формат</span><select value={brief.format} onChange={(e) => setBrief((p) => ({ ...p, format: e.target.value }))} className="w-full rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2.5 text-sm outline-none" data-testid="select-post-format"><option>Пост</option><option>Карусель</option><option>Короткое видео</option><option>История</option></select></label></div><Button type="submit" disabled={generate.isPending || !projectId} className="mt-6 w-full" data-testid="button-generate-post">{generate.isPending ? <RefreshCw size={15} className="animate-spin" /> : <Sparkles size={15} />}Создать вариант</Button><div className="mt-4 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.12em] text-sidebar-foreground/40"><Activity size={12} className="text-accent" />AI готов к работе</div></form><section className="animate-in delay-1 rounded-lg border border-border bg-card"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4"><div><div className="font-mono text-[10px] uppercase tracking-[.17em] text-muted-foreground">Рабочая лента</div><h3 className="mt-1 text-lg font-extrabold">{visible.length} материалов</h3></div><div className="flex gap-1 rounded-md bg-muted p-1">{['all', 'draft', 'approved'].map((item) => <button key={item} onClick={() => setFilter(item)} className={cn('rounded px-2.5 py-1.5 text-xs font-bold', filter === item ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground')} data-testid={`button-filter-${item}`}>{item === 'all' ? 'Все' : statusLabel(item)}</button>)}</div></div>{posts.isLoading ? <div className="space-y-3 p-5">{[1, 2, 3].map((i) => <Skeleton className="h-16" key={i} />)}</div> : posts.isError ? <div className="p-5"><EmptyState icon={Activity} title="Лента недоступна" text="Проверьте проект и повторите попытку." action={<Button onClick={() => posts.refetch()} data-testid="button-retry-posts">Повторить</Button>} /></div> : visible.length === 0 ? <div className="p-5"><EmptyState icon={FileText} title="Пустая лента" text="Слева можно запустить первый материал. Обычно хороший бриф — это одна ясная мысль." /></div> : <div className="divide-y divide-border">{visible.map((post, index) => <PostRow key={post.id} post={post} index={index} onEdit={setSelected} />)}</div>}</section></div>{selected && <PostEditor post={selected} onClose={() => setSelected(undefined)} onUpdate={savePost} onRegenerate={() => regenerate.mutate({ id: selected.id }, { onSuccess: (post) => { setSelected(post); queryClient.invalidateQueries({ queryKey: getListPostsQueryKey({ projectId: selected.projectId, status: null }) }); toast.success('Новый вариант готов'); }, onError: (error) => toast.error(errorText(error, 'Не удалось перегенерировать')) })} busy={update.isPending || regenerate.isPending} />}</>;
}

function PostEditor({ post, onClose, onUpdate, onRegenerate, busy }: { post: Post; onClose: () => void; onUpdate: (data: { title?: string; goal?: string; format?: string; text?: string; status?: string }, options?: { close?: boolean; onSuccess?: () => void }) => void; onRegenerate: () => void; busy: boolean }) {
  const [title, setTitle] = useState(post.title);
  const [goal, setGoal] = useState(post.goal);
  const [format, setFormat] = useState(post.format);
  const [text, setText] = useState(post.text);
  const [preview, setPreview] = useState(false);
  const channels = useListChannels();
  const publish = usePublishPost();
  const [selectedChannels, setSelectedChannels] = useState<number[]>([]);
  const formData = { title, goal, format, text };
  const save = (status?: string, options?: { close?: boolean; onSuccess?: () => void }) => onUpdate({ ...formData, ...(status ? { status } : {}) }, options);
  const publishNow = () => {
    if (!selectedChannels.length) {
      toast.error('Выберите хотя бы одну площадку');
      return;
    }
    save(undefined, {
      close: false,
      onSuccess: () => publish.mutate(
        { data: { postId: post.id, channelIds: selectedChannels } },
        {
          onSuccess: (result) => {
            const failed = result.results?.filter((item) => item.status === 'failed') ?? [];
            if (failed.length) toast.error(`Не удалось опубликовать на ${failed.length} площадках`);
            else {
              toast.success('Материал опубликован');
              onClose();
            }
          },
          onError: (error) => toast.error(errorText(error, 'Публикация не выполнена')),
        },
      ),
    });
  };
  const editorContent = <div className="space-y-5">
    <div className="grid gap-4 sm:grid-cols-[1.5fr_1fr]">
      <Field label="Заголовок" value={title} onChange={setTitle} placeholder="Заголовок публикации" required testId="input-edit-post-title" />
      <label>
        <span className="mb-2 block text-xs font-bold">Цель публикации</span>
        <select value={goal} onChange={(e) => setGoal(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" data-testid="select-edit-post-goal">
          <option>Вовлечение</option><option>Продажа</option><option>Доверие</option><option>Охват</option>
        </select>
      </label>
    </div>
    <label>
      <span className="mb-2 block text-xs font-bold">Формат</span>
      <select value={format} onChange={(e) => setFormat(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary" data-testid="select-edit-post-format">
        <option>Пост</option><option>Карусель</option><option>Короткое видео</option><option>История</option>
      </select>
    </label>
    <label className="block">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-xs font-bold">Текст публикации</span>
        <span className={cn('font-mono text-[10px] uppercase tracking-[.12em]', text.length > 4000 ? 'text-destructive' : 'text-muted-foreground')}>{text.length.toLocaleString('ru-RU')} знаков</span>
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Напишите текст публикации…" rows={16} className="w-full resize-y rounded-md border border-input bg-background px-4 py-3 text-sm leading-relaxed outline-none placeholder:text-muted-foreground/65 focus:border-primary focus:ring-2 focus:ring-primary/15" data-testid="textarea-edit-post-text" />
      <p className="mt-2 text-xs text-muted-foreground">Редактор сохраняет переносы строк и отправляет в публикацию именно эту версию текста.</p>
    </label>
    <div className="flex items-center justify-between rounded-md bg-muted px-4 py-3">
      <div><span className="font-mono text-[10px] uppercase tracking-[.15em] text-muted-foreground">Параметры</span><p className="mt-1 text-xs text-muted-foreground">Вариант {post.variant} · создан {fmtDateTime(post.createdAt)}</p></div>
      <Badge>{format}</Badge>
    </div>
  </div>;
  return <div className="fixed inset-0 z-50 flex justify-end bg-sidebar/40" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="flex h-full w-full max-w-3xl flex-col bg-card shadow-2xl">
      <div className="flex items-start justify-between border-b border-border px-6 py-5 md:px-9">
        <div><div className="font-mono text-[10px] uppercase tracking-[.2em] text-primary">Редактор / вариант {post.variant}</div><h2 className="mt-2 text-2xl font-extrabold tracking-[-.04em]">Редактировать публикацию</h2><p className="mt-1 text-sm text-muted-foreground">Подготовьте финальную версию перед одобрением или выходом в канал.</p></div>
        <button onClick={onClose} className="rounded p-2 text-muted-foreground hover:bg-muted" data-testid="button-close-editor"><X size={20} /></button>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-6 md:px-9">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div><span className="text-sm font-bold">{preview ? 'Предпросмотр' : 'Рабочая версия'}</span><p className="mt-1 text-xs text-muted-foreground">{preview ? 'Так текст будет выглядеть в публикации.' : 'Изменения можно сохранить в любой момент.'}</p></div>
          <Button type="button" variant="outline" onClick={() => setPreview((value) => !value)} data-testid="button-toggle-post-preview">{preview ? 'Вернуться к редактору' : 'Предпросмотр'}</Button>
        </div>
        {preview ? <article className="rounded-xl border border-border bg-background p-6 shadow-sm md:p-8"><div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="grid size-7 place-items-center rounded-full bg-primary text-primary-foreground"><FileText size={14} /></span><span>{format} · {goal}</span></div><h3 className="mt-6 text-2xl font-extrabold leading-tight tracking-[-.03em]">{title || 'Без заголовка'}</h3><div className="mt-5 whitespace-pre-wrap text-sm leading-7 text-foreground/85">{text || 'Текст публикации пока пуст.'}</div></article> : editorContent}
        {!preview && (channels.data?.length ? <div className="mt-7 rounded-md border border-border p-4"><div className="flex items-center justify-between"><div><div className="text-sm font-bold">Каналы публикации</div><p className="mt-1 text-xs text-muted-foreground">Выберите площадки для кнопки «Опубликовать».</p></div><Send size={17} className="text-accent" /></div><div className="mt-3 grid gap-2 sm:grid-cols-2">{channels.data.map((channel) => <label key={channel.id} className="flex cursor-pointer items-center gap-2 rounded border border-border px-3 py-2 text-xs font-semibold hover:border-primary/50"><input type="checkbox" checked={selectedChannels.includes(channel.id)} onChange={(e) => setSelectedChannels((items) => e.target.checked ? [...items, channel.id] : items.filter((id) => id !== channel.id))} />{platformLabel(channel.platform)} · {channel.name}</label>)}</div></div> : <div className="mt-7 rounded-md bg-muted p-4 text-xs text-muted-foreground">Подключите каналы в настройках, чтобы публиковать без ручного копирования.</div>)}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-border bg-card px-6 py-4 md:px-9">
        <Button onClick={() => save()} disabled={busy} data-testid="button-save-post"><FileText size={15} />Сохранить</Button>
        <Button variant="outline" onClick={() => save('approved')} disabled={busy} data-testid="button-approve-post"><Check size={15} />Одобрить</Button>
        <Button variant="outline" onClick={publishNow} disabled={busy || publish.isPending || !selectedChannels.length} data-testid="button-publish-post"><Send size={15} />{publish.isPending ? 'Публикуем…' : 'Опубликовать'}</Button>
        <Button variant="quiet" onClick={onRegenerate} disabled={busy} className="ml-auto" data-testid="button-regenerate-post"><RefreshCw size={15} />Перегенерировать</Button>
      </div>
    </div>
  </div>;
}

function RadarPage() {
  const projects = useListProjects(); const [projectId, setProjectId] = useState<number | undefined>(); const [addOpen, setAddOpen] = useState(false); const [form, setForm] = useState({ name: '', url: '' }); const queryClient = useQueryClient();
  useEffect(() => { if (!projectId && projects.data?.[0]?.id) setProjectId(projects.data[0].id); }, [projectId, projects.data]);
  const competitors = useListCompetitors({ projectId: projectId ?? 0 }, { query: { enabled: Boolean(projectId), queryKey: getListCompetitorsQueryKey({ projectId: projectId ?? 0 }) } }); const create = useCreateCompetitor(); const sync = useSyncCompetitors();
  const items = competitors.data ?? []; const add = (e: FormEvent) => { e.preventDefault(); if (!projectId || !form.name || !form.url) return; create.mutate({ data: { projectId, name: form.name, url: form.url } }, { onSuccess: () => { setForm({ name: '', url: '' }); setAddOpen(false); queryClient.invalidateQueries({ queryKey: getListCompetitorsQueryKey({ projectId }) }); } }); };
  return <><PageIntro eyebrow="03 / Signal intelligence" title="Радар" description="Смотрите, какие темы уже работают в вашей нише. Забирайте не чужие посты, а хорошие направления." action={<div className="flex gap-2"><select value={projectId ?? ''} onChange={(e) => setProjectId(Number(e.target.value))} className="rounded-md border border-input bg-card px-3 py-2.5 text-sm font-semibold" data-testid="select-radar-project">{projects.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select><Button onClick={() => setAddOpen(true)} disabled={items.length >= 3} data-testid="button-add-competitor"><Plus size={15} />Добавить</Button></div>} /><div className="mb-5 flex items-center justify-between rounded-lg border border-border bg-card px-5 py-4"><div className="flex items-center gap-3"><span className="grid size-8 place-items-center rounded-full bg-secondary text-accent"><Activity size={16} /></span><div><span className="block text-sm font-bold">Мониторинг активен</span><span className="text-xs text-muted-foreground">{items.length} из 3 источников · обновление по запросу</span></div></div><Button variant="outline" onClick={() => projectId && sync.mutate({ data: { projectId } }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListCompetitorsQueryKey({ projectId }) }); } })} disabled={sync.isPending || !projectId || !items.length} data-testid="button-sync-radar"><RefreshCw size={14} className={sync.isPending ? 'animate-spin' : ''} />Синхронизировать</Button></div>{competitors.isLoading ? <div className="grid gap-4 md:grid-cols-2">{[1, 2].map((i) => <Skeleton key={i} className="h-64" />)}</div> : !items.length ? <EmptyState icon={Compass} title="Радар пока пуст" text="Добавьте до трёх конкурентов, чтобы видеть свежие идеи и понимать ритм рынка." action={<Button onClick={() => setAddOpen(true)} data-testid="button-empty-radar"><Plus size={15} />Добавить источник</Button>} /> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{items.map((competitor, index) => <CompetitorCard key={competitor.id} competitor={competitor} index={index} />)}</div>}{addOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-sidebar/40 p-5"><form onSubmit={add} className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-2xl" data-testid="form-competitor"><div className="flex justify-between"><div><div className="font-mono text-[10px] uppercase tracking-[.2em] text-primary">Новый источник</div><h2 className="mt-2 text-xl font-extrabold">Добавить конкурента</h2></div><button type="button" onClick={() => setAddOpen(false)} data-testid="button-close-competitor"><X size={18} /></button></div><div className="mt-6 space-y-4"><Field label="Название" value={form.name} onChange={(v) => setForm((p) => ({ ...p, name: v }))} placeholder="Название бренда" required testId="input-competitor-name" /><Field label="Сайт" value={form.url} onChange={(v) => setForm((p) => ({ ...p, url: v }))} placeholder="https://..." required testId="input-competitor-url" /></div><div className="mt-6 flex justify-end gap-2"><Button type="button" variant="quiet" onClick={() => setAddOpen(false)} data-testid="button-cancel-competitor">Отмена</Button><Button type="submit" disabled={create.isPending} data-testid="button-save-competitor"><Plus size={15} />Добавить</Button></div></form></div>}</>;
}
function CompetitorCard({ competitor, index }: { competitor: Competitor; index: number }) { return <article className={cn('animate-in rounded-lg border border-border bg-card', `delay-${Math.min(index + 1, 4)}`)} data-testid={`card-competitor-${competitor.id}`}><div className="flex items-start justify-between border-b border-border p-5"><div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-md bg-muted font-bold text-foreground">{competitor.name.slice(0, 1).toUpperCase()}</div><div><h3 className="text-sm font-extrabold">{competitor.name}</h3><p className="mt-0.5 max-w-[150px] truncate text-xs text-muted-foreground">{competitor.url}</p></div></div><Badge tone="teal">Синхронно</Badge></div><div className="p-5"><div className="mb-4 flex justify-between"><span className="font-mono text-[10px] uppercase tracking-[.14em] text-muted-foreground">Свежие сигналы</span><span className="text-xs text-muted-foreground">{fmtDate(competitor.lastSync)}</span></div>{competitor.posts?.length ? <div className="space-y-4">{competitor.posts.slice(0, 3).map((post) => <div key={post.id} className="border-l-2 border-primary/40 pl-3"><p className="line-clamp-2 text-sm leading-relaxed">{post.text}</p><div className="mt-2 flex items-center justify-between gap-2"><span className="font-mono text-[10px] text-muted-foreground">{fmtDate(post.postedAt)}</span><span className="truncate text-[10px] font-bold text-accent">{post.idea}</span></div></div>)}</div> : <p className="text-sm text-muted-foreground">Посты появятся после синхронизации.</p>}</div></article>; }

function CalendarPage() {
  const projects = useListProjects(); const [projectId, setProjectId] = useState<number | undefined>(); const queryClient = useQueryClient();
  useEffect(() => { if (!projectId && projects.data?.[0]?.id) setProjectId(projects.data[0].id); }, [projectId, projects.data]);
  const schedule = useListSchedule({ projectId: projectId ?? 0 }, { query: { enabled: Boolean(projectId), queryKey: getListScheduleQueryKey({ projectId: projectId ?? 0 }) } }); const posts = useListPosts({ projectId: projectId ?? null, status: 'approved' }); const channels = useListChannels(); const schedulePost = useSchedulePost(); const update = useUpdateSchedule(); const [selectedPost, setSelectedPost] = useState(''); const [date, setDate] = useState(new Date().toISOString().slice(0, 10)); const [time, setTime] = useState('10:00'); const [selectedChannels, setSelectedChannels] = useState<number[]>([]);
  const items = schedule.data ?? [];
  const plan = (e: FormEvent) => {
    e.preventDefault();
    if (!projectId || !selectedPost) {
      toast.error('Выберите материал для планирования');
      return;
    }
    schedulePost.mutate(
      { data: { projectId, postId: Number(selectedPost), date, time, channelIds: selectedChannels } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListScheduleQueryKey({ projectId }) });
          setSelectedPost('');
          setSelectedChannels([]);
          toast.success(selectedChannels.length ? 'Публикация запланирована и попадёт в очередь' : 'Запись добавлена в календарь');
        },
        onError: (error) => toast.error(errorText(error, 'Не удалось запланировать публикацию')),
      },
    );
  };
  const days = Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return d.toISOString().slice(0, 10); });
  const publishScheduled = (id: number) => update.mutate(
    { id, data: { status: 'published' } },
    {
      onSuccess: () => {
        if (projectId) queryClient.invalidateQueries({ queryKey: getListScheduleQueryKey({ projectId }) });
        toast.success('Публикация отправлена');
      },
      onError: (error) => toast.error(errorText(error, 'Публикация не выполнена — проверьте подключённые каналы')),
    },
  );
  return <><PageIntro eyebrow="04 / Publishing system" title="Календарь" description="Разложите одобренные материалы по ритму бренда. Выберите площадки — сервер опубликует пост автоматически в назначенное время." action={<select value={projectId ?? ''} onChange={(e) => setProjectId(Number(e.target.value))} className="rounded-md border border-input bg-card px-3 py-2.5 text-sm font-semibold" data-testid="select-calendar-project">{projects.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>} /><div className="grid gap-5 lg:grid-cols-[1.3fr_.7fr]"><section className="animate-in rounded-lg border border-border bg-card"><div className="flex items-center justify-between border-b border-border px-5 py-4"><div><div className="font-mono text-[10px] uppercase tracking-[.17em] text-muted-foreground">Ближайшие 14 дней</div><h3 className="mt-1 text-lg font-extrabold">{items.length} в плане</h3></div><Badge tone="teal">Автопубликация</Badge></div><div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-7">{days.map((day) => <DayCell key={day} day={day} items={items.filter((item) => item.date === day)} onPublish={publishScheduled} />)}</div></section><form onSubmit={plan} className="animate-in delay-1 h-fit rounded-lg border border-border bg-sidebar p-5 text-sidebar-foreground" data-testid="form-schedule-post"><div className="font-mono text-[10px] uppercase tracking-[.17em] text-primary">Добавить в план</div><h3 className="mt-2 text-xl font-extrabold">Следующая публикация</h3><label className="mt-6 block"><span className="mb-2 block text-xs font-bold text-sidebar-foreground/70">Одобренный материал</span><select value={selectedPost} onChange={(e) => setSelectedPost(e.target.value)} className="w-full rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2.5 text-sm outline-none" data-testid="select-schedule-post"><option value="">Выберите материал</option>{(posts.data ?? []).map((post) => <option key={post.id} value={post.id}>{post.title}</option>)}</select></label><div className="mt-4 grid grid-cols-2 gap-3"><label><span className="mb-2 block text-xs font-bold text-sidebar-foreground/70">Дата</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2.5 text-sm" data-testid="input-schedule-date" /></label><label><span className="mb-2 block text-xs font-bold text-sidebar-foreground/70">Время</span><input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-full rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2.5 text-sm" data-testid="input-schedule-time" /></label></div>{channels.data?.length ? <div className="mt-4"><span className="mb-2 block text-xs font-bold text-sidebar-foreground/70">Площадки</span><div className="space-y-2">{channels.data.map((channel) => <label key={channel.id} className="flex items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={selectedChannels.includes(channel.id)} onChange={(e) => setSelectedChannels((items) => e.target.checked ? [...items, channel.id] : items.filter((id) => id !== channel.id))} />{platformLabel(channel.platform)} · {channel.name}</label>)}</div></div> : <p className="mt-4 text-xs text-sidebar-foreground/55">Подключите площадки в настройках, иначе запись останется только в календаре.</p>}<Button type="submit" disabled={schedulePost.isPending || !selectedPost} className="mt-6 w-full" data-testid="button-schedule-post"><Send size={15} />Запланировать</Button></form></div></>;
}
function DayCell({ day, items, onPublish }: { day: string; items: ScheduleItem[]; onPublish: (id: number) => void }) { const date = new Date(`${day}T12:00:00`); const today = new Date().toISOString().slice(0, 10) === day; return <div className={cn('min-h-[160px] bg-card p-3', today && 'bg-primary/[.045]')} data-testid={`day-cell-${day}`}><div className="flex items-center justify-between"><span className={cn('font-mono text-[10px] uppercase tracking-[.1em]', today ? 'text-primary' : 'text-muted-foreground')}>{new Intl.DateTimeFormat('ru-RU', { weekday: 'short' }).format(date)}</span><span className={cn('text-sm font-extrabold', today && 'text-primary')}>{date.getDate()}</span></div><div className="mt-3 space-y-2">{items.map((item) => <div key={item.id} className="rounded border border-primary/20 bg-primary/8 p-2"><div className="flex items-center gap-1 font-mono text-[9px] text-primary"><Clock3 size={10} />{item.time}</div><p className="mt-1 line-clamp-2 text-[11px] font-bold leading-snug">{item.post.title}</p>{item.status !== 'published' && <button onClick={() => onPublish(item.id)} className="mt-2 text-[10px] font-bold text-accent hover:underline" data-testid={`button-publish-${item.id}`}>Опубликовать</button>}</div>)}</div></div>; }

function SettingsPage() {
  const [, setLocation] = useLocation(); const [saved, setSaved] = useState(false);
  const channels = useListChannels(); const create = useCreateChannel(); const remove = useDeleteChannel(); const test = useTestChannel(); const queryClient = useQueryClient();
  const [profile, setProfile] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('content-factory-profile') ?? '{"name":"Northline / маркетинг","timezone":"Europe / Moscow (UTC+3)","language":"Русский"}') as { name: string; timezone: string; language: string };
    } catch {
      return { name: 'Northline / маркетинг', timezone: 'Europe / Moscow (UTC+3)', language: 'Русский' };
    }
  });
  const [form, setForm] = useState({ platform: 'vk', name: '', target: '', token: '', applicationKey: '', applicationSecret: '', sessionSecret: '' });
  const logout = async () => { await fetch('/api/auth/logout', { method: 'POST' }); setLocation('/'); };
  const connect = (event: FormEvent) => {
    event.preventDefault();
    if (!form.name.trim() || !form.target.trim() || !form.token.trim()) {
      toast.error('Заполните название, адрес и токен канала');
      return;
    }
    create.mutate(
      { data: { ...form, platform: form.platform as 'vk' | 'ok' | 'max' | 'telegram' | 'zen' } },
      {
        onSuccess: () => {
          setForm((p) => ({ ...p, name: '', target: '', token: '', applicationKey: '', applicationSecret: '', sessionSecret: '' }));
          queryClient.invalidateQueries({ queryKey: getListChannelsQueryKey() });
          toast.success('Канал подключён');
        },
        onError: (error) => toast.error(errorText(error, 'Не удалось подключить канал')),
      },
    );
  };
  const testChannel = (id: number) => test.mutate(
    { id },
    {
      onSuccess: (result) => toast.success(result.message || 'Подключение проверено'),
      onError: (error) => toast.error(errorText(error, 'Проверка канала не пройдена')),
    },
  );
  const set = (key: keyof typeof form, value: string) => setForm((prev) => ({ ...prev, [key]: value }));
  const setProfileValue = (key: keyof typeof profile, value: string) => {
    setSaved(false);
    setProfile((prev) => ({ ...prev, [key]: value }));
  };
  const platformHelp: Record<string, string> = { vk: 'ID сообщества, обычно отрицательное число, например -123456', ok: 'ID группы OK', max: 'ID чата или канала MAX', telegram: 'ID чата или канала, например -1001234567890', zen: 'HTTPS webhook-мост публикации' };
  return <><PageIntro eyebrow="05 / Workspace" title="Настройки" description="Профиль рабочего пространства и точки, через которые контент выйдет к вашей аудитории." /><div className="grid gap-5 lg:grid-cols-[1fr_.95fr]"><section className="rounded-lg border border-border bg-card p-6"><div className="flex items-start justify-between"><div><div className="font-mono text-[10px] uppercase tracking-[.17em] text-muted-foreground">Профиль</div><h3 className="mt-1 text-lg font-extrabold">Рабочее пространство</h3></div><div className="grid size-10 place-items-center rounded-md bg-secondary text-accent"><Users size={18} /></div></div><div className="mt-7 space-y-5"><Field label="Название пространства" value={profile.name} onChange={(value) => setProfileValue('name', value)} testId="input-workspace-name" /><Field label="Часовой пояс" value={profile.timezone} onChange={(value) => setProfileValue('timezone', value)} testId="input-workspace-timezone" /><Field label="Рабочий язык" value={profile.language} onChange={(value) => setProfileValue('language', value)} testId="input-workspace-language" /></div><div className="mt-7 flex items-center justify-between border-t border-border pt-5"><span className="text-xs text-muted-foreground">{saved ? 'Изменения сохранены' : 'Изменения сохраняются по кнопке'}</span><Button onClick={() => { localStorage.setItem('content-factory-profile', JSON.stringify(profile)); setSaved(true); toast.success('Настройки сохранены'); }} data-testid="button-save-settings"><Check size={15} />Сохранить</Button></div></section><section className="rounded-lg border border-border bg-card p-6"><div className="font-mono text-[10px] uppercase tracking-[.17em] text-muted-foreground">Публикация</div><h3 className="mt-1 text-lg font-extrabold">Каналы</h3><p className="mt-2 text-xs leading-relaxed text-muted-foreground">Токены шифруются на сервере и не возвращаются в браузер.</p>{channels.data?.length ? <div className="mt-5 space-y-2">{channels.data.map((channel) => <div key={channel.id} className="flex items-center gap-3 rounded-md border border-border p-3"><div className="grid size-8 place-items-center rounded bg-secondary text-xs font-extrabold text-accent">{platformLabel(channel.platform).slice(0, 2)}</div><div className="min-w-0 flex-1"><div className="truncate text-sm font-bold">{channel.name}</div><div className="truncate text-[11px] text-muted-foreground">{platformLabel(channel.platform)} · {channel.target}</div></div><Badge tone={channel.status === 'connected' ? 'teal' : 'orange'}>{channel.status === 'connected' ? 'Подключён' : 'Ошибка'}</Badge><Button variant="quiet" onClick={() => testChannel(channel.id)} disabled={test.isPending} className="px-2 py-1 text-[11px]" data-testid={`button-test-channel-${channel.id}`}>Проверить</Button><button onClick={() => remove.mutate({ id: channel.id }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListChannelsQueryKey() }); toast.success('Канал отключён'); }, onError: (error) => toast.error(errorText(error, 'Не удалось отключить канал')) })} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive" aria-label={`Отключить ${channel.name}`}><X size={15} /></button></div>)}</div> : <div className="mt-5 rounded-md bg-muted p-4 text-sm text-muted-foreground">Каналы ещё не подключены.</div>}<form onSubmit={connect} className="mt-5 space-y-3 border-t border-border pt-5"><div className="text-sm font-bold">Подключить канал</div><div className="grid gap-3 sm:grid-cols-2"><label><span className="mb-2 block text-xs font-bold">Площадка</span><select value={form.platform} onChange={(e) => set('platform', e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm" data-testid="select-channel-platform"><option value="vk">VK</option><option value="ok">Одноклассники</option><option value="max">MAX</option><option value="telegram">Telegram</option><option value="zen">Дзен</option></select></label><Field label="Название" value={form.name} onChange={(v) => set('name', v)} placeholder="Основной канал" required testId="input-channel-name" /></div><Field label={form.platform === 'zen' ? 'Webhook URL' : 'ID группы / чата'} value={form.target} onChange={(v) => set('target', v)} placeholder={platformHelp[form.platform]} required testId="input-channel-target" /><Field label={form.platform === 'zen' ? 'Webhook token / URL' : 'Токен доступа'} value={form.token} onChange={(v) => set('token', v)} placeholder={form.platform === 'telegram' ? 'Токен бота' : 'Секретный токен'} required testId="input-channel-token" />{form.platform === 'ok' && <div className="grid gap-3 sm:grid-cols-3"><Field label="Application key" value={form.applicationKey} onChange={(v) => set('applicationKey', v)} required testId="input-channel-app-key" /><Field label="Application secret" value={form.applicationSecret} onChange={(v) => set('applicationSecret', v)} required testId="input-channel-app-secret" /><Field label="Session secret" value={form.sessionSecret} onChange={(v) => set('sessionSecret', v)} testId="input-channel-session-secret" /></div>}<Button type="submit" disabled={create.isPending} className="w-full" data-testid="button-connect-channel"><Plus size={15} />{create.isPending ? 'Подключаем…' : 'Подключить канал'}</Button></form><div className="mt-5 flex items-start gap-2 rounded-md bg-muted p-3 text-xs leading-relaxed text-muted-foreground"><Globe2 size={15} className="mt-0.5 shrink-0 text-accent" /><span>VK, OK, Telegram и MAX публикуются через официальные API. Для Дзен используется HTTPS webhook-мост, потому что универсального публичного API публикации в текущем контуре нет.</span></div><button onClick={logout} className="mt-6 w-full rounded-md border border-border px-3 py-2.5 text-sm font-bold text-muted-foreground transition hover:border-primary/50 hover:text-primary" data-testid="button-logout">Выйти из аккаунта</button></section></div></>;
}

function Router() { const [location] = useLocation(); return <ErrorBoundary resetKey={location}><Switch><Route path="/" component={LandingPage} /><Route path="/login" component={LoginPage} /><Route path="/app"><ProtectedShell><DashboardPage /></ProtectedShell></Route><Route path="/projects"><ProtectedShell><ProjectsPage /></ProtectedShell></Route><Route path="/content"><ProtectedShell><ContentPage /></ProtectedShell></Route><Route path="/radar"><ProtectedShell><RadarPage /></ProtectedShell></Route><Route path="/calendar"><ProtectedShell><CalendarPage /></ProtectedShell></Route><Route path="/settings"><ProtectedShell><SettingsPage /></ProtectedShell></Route><Route component={NotFound} /></Switch></ErrorBoundary>; }
function App() { return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /><SonnerToaster position="bottom-right" richColors /></TooltipProvider></QueryClientProvider>; }
export default App;