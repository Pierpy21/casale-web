import type { Metadata } from "next";
import Image from "next/image";
import { Montserrat } from "next/font/google";
import { LoginForm } from "@/components/auth/LoginForm";

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Accesso · Agenda",
};

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-ink-deep px-5 py-12">
      <Image
        src="/logo.svg"
        alt="Il Casale del Notaio"
        width={675}
        height={225}
        priority
        unoptimized
        className="h-auto w-56 sm:w-64"
      />
      <p className="mt-6 text-[12px] font-medium uppercase tracking-[0.14em] text-sand">
        Area riservata
      </p>

      <section
        aria-labelledby="login-title"
        className="mt-8 w-full max-w-sm rounded-[2px] bg-paper p-7 shadow-2xl shadow-black/30 sm:p-9"
      >
        <h1 id="login-title" className="text-2xl">
          Accedi all&rsquo;agenda
        </h1>
        <p className="mt-2 text-[14px] text-slate">
          Inserisci le credenziali fornite dall&rsquo;amministrazione.
        </p>
        <div className="mt-7">
          <LoginForm />
        </div>
      </section>

      <p className="mt-10 text-center text-[12px] text-sand/80">
        Il Casale del Notaio · Via Nicolosi 67, Belpasso (CT)
      </p>

      <a
        href="https://cpinsai.it/"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Powered by C.PINSAI"
        className="group mt-4 inline-flex items-baseline gap-2 rounded-[2px] px-2 py-1 transition-colors duration-300 hover:bg-white/5 focus-visible:outline-sand"
      >
        <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-sand/70">Powered by</span>
        <span className={`${montserrat.className} text-[15px] tracking-[0.04em] text-logo-cream`}>
          C<span className="text-[#E5488A]">.</span>PINSAI
        </span>
      </a>
    </main>
  );
}
