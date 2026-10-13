"use client";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import {
  ArrowUpRight,
  Compass,
  FileText,
  Heart,
  MessagesSquare,
  Palette,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import type { PreviewMode } from "@/domain/PreviewContracts";
import { DiscoveryView } from "./DiscoveryView";
import { ContentView } from "./ContentView";
import { JourneyView } from "./JourneyView";
import { ServiceView } from "./ServiceView";
import styles from "./Preview.module.css";

const NAV = [
  {
    id: "discover",
    label: "Discover",
    description: "A more personal choice",
    icon: Compass,
  },
  {
    id: "journey",
    label: "Customer journeys",
    description: "A reason to return",
    icon: Heart,
  },
  {
    id: "content",
    label: "Content studio",
    description: "Your voice, more often",
    icon: Palette,
  },
  {
    id: "service",
    label: "Service moments",
    description: "A thoughtful handoff",
    icon: MessagesSquare,
  },
] as const;

export function PreviewApp({ agentAvailable }: { agentAvailable: boolean }) {
  const [mode, setMode] = useState<PreviewMode>("discover");
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [resetId, setResetId] = useState(0);
  function selectMode(next: PreviewMode) {
    setMode(next);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function toggleSaved(id: string) {
    setSaved((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  return (
    <div className={styles.app}>
      <a href="#main" className={styles.skipLink}>
        Skip to experience
      </a>
      <aside className={styles.sidebar}>
        <Link
          className={styles.brand}
          href="/"
          aria-label="Steward preview home"
          onClick={() => selectMode("discover")}
        >
          <Image src="/decionis.png" width={43} height={43} alt="Decionis" />
          <div>
            <strong>
              Steward<span>by Decionis</span>
            </strong>
          </div>
        </Link>
        <div className={styles.sidebarLabel}>Everyday, made better</div>
        <nav className={styles.navigation} aria-label="Preview experiences">
          {NAV.map((item) => (
            <button
              key={item.id}
              className={mode === item.id ? styles.navActive : ""}
              onClick={() => selectMode(item.id)}
              aria-current={mode === item.id ? "page" : undefined}
            >
              <item.icon size={19} />
              <span>
                <strong>{item.label}</strong>
                <small>{item.description}</small>
              </span>
            </button>
          ))}
        </nav>
        <div className={styles.sidebarBottom}>
          <div className={styles.conceptCard}>
            <Sparkles size={18} />
            <strong>
              From a visit
              <br />
              to a relationship.
            </strong>
            <p>
              Four connected ideas for merchant growth and better experiences.
            </p>
          </div>
          <a
            href="https://decionis.com/contact#contact-form"
            target="_blank"
            rel="noreferrer"
          >
            Let’s build this together
            <ArrowUpRight size={15} />
          </a>
        </div>
      </aside>
      <div className={styles.mainShell}>
        <header className={styles.topbar}>
          <div className={styles.projectName}>
            <span className={styles.purpleDot} />
            Ruian Offices<span className={styles.topbarDivider}>/</span>
            <span>Experience concept</span>
          </div>
          <div className={styles.topbarActions}>
            <span className={styles.previewBadge}>Interactive preview</span>
            <a href="/proposal.pdf" target="_blank" rel="noreferrer">
              <FileText size={15} />
              <span>Read proposal</span>
              <ArrowUpRight size={13} />
            </a>
          </div>
        </header>
        <main id="main" className={styles.main} key={resetId}>
          <div className={styles.contextBar}>
            <span>Fictional merchants. Real possibilities.</span>
            <button
              onClick={() => {
                setSaved(new Set());
                setResetId((value) => value + 1);
                window.scrollTo({ top: 0, behavior: "instant" });
              }}
            >
              <RefreshCw size={12} />
              Reset demo
            </button>
          </div>
          {!agentAvailable && (
            <div className={styles.notice}>
              The live assistant is temporarily paused. Explore the sample
              catalogue while it is being prepared.
            </div>
          )}
          {mode === "discover" && (
            <DiscoveryView
              available={agentAvailable}
              saved={saved}
              toggleSaved={toggleSaved}
            />
          )}
          {mode === "content" && <ContentView available={agentAvailable} />}
          {mode === "journey" && <JourneyView available={agentAvailable} />}
          {mode === "service" && <ServiceView available={agentAvailable} />}
          <footer className={styles.footer}>
            <span>Decionis Steward · A concept prepared for Ruian Offices</span>
            <p>
              Sample data only. No real purchase, booking, enrollment or message
              is made. AI drafts need review.
            </p>
            <p>
              Use sample details. Questions and briefs are sent to an AI
              service.
            </p>
          </footer>
        </main>
      </div>
    </div>
  );
}
