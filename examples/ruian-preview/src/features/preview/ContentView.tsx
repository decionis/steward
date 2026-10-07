"use client";
import { useState } from "react";
import Image from "next/image";
import { Check, Copy, Download, Palette, Sparkles } from "lucide-react";
import { PreviewCatalog, type MerchantId } from "@/domain/PreviewCatalog";
import { PreviewExport } from "@/domain/PreviewExport";
import { useAgent } from "./UseAgent";
import { AgentStatus } from "./AgentPanel";
import { MerchantSelector } from "./MerchantSelector";
import styles from "./Preview.module.css";

export function ContentView({ available }: { available: boolean }) {
  const [merchantId, setMerchant] = useState<MerchantId>("juniper");
  const [brief, setBrief] = useState(
    "Invite nearby office workers to take a thoughtful lunch break. Feature the garden lunch bowl. No discounts.",
  );
  const [portrait, setPortrait] = useState(false);
  const [approved, setApproved] = useState(false);
  const [copied, setCopied] = useState("");
  const agent = useAgent();
  const merchant = PreviewCatalog.merchant(merchantId);
  async function generate() {
    setApproved(false);
    setCopied("");
    await agent.run({ mode: "content", prompt: brief, merchantId });
  }
  const graphic = agent.result
    ? PreviewExport.graphic(agent.result, merchant, portrait)
    : null;
  return (
    <>
      <div className={styles.intro}>
        <span className={styles.eyebrow}>03 / Content studio</span>
        <h1>
          Your brand.
          <br />A little more momentum<span>.</span>
        </h1>
        <p>
          One brief becomes a graphic, a caption and a short-video script.
          <br className={styles.desktopBreak} /> Keep the voice. Skip the blank
          page.
        </p>
      </div>
      <div className={styles.workspaceGrid}>
        <section className={styles.editorCard}>
          <div className={styles.cardHeading}>
            <Palette size={19} />
            <h2>Start with a simple brief</h2>
          </div>
          <MerchantSelector
            id="content-merchant"
            value={merchantId}
            onChange={(value) => {
              setMerchant(value);
              agent.reset();
              setApproved(false);
              setBrief(
                value === "juniper"
                  ? "Invite nearby office workers to take a thoughtful lunch break. Feature the garden lunch bowl. No discounts."
                  : "Introduce the everyday notebook as a thoughtful small gift for a colleague. No discounts.",
              );
            }}
          />
          <div className={styles.brandNote}>
            <strong>Brand voice</strong>
            <p>{merchant.voice}</p>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void generate();
            }}
          >
            <div className={styles.field}>
              <label htmlFor="content-brief">
                What would you like to share?
              </label>
              <textarea
                id="content-brief"
                rows={5}
                value={brief}
                maxLength={700}
                minLength={3}
                required
                onChange={(event) => {
                  setBrief(event.target.value);
                  agent.reset();
                  setApproved(false);
                }}
              />
            </div>
            <button
              className={styles.primaryButton}
              disabled={!available || agent.loading || brief.trim().length < 3}
            >
              <Sparkles size={16} />
              {agent.loading ? "Creating your pack…" : "Create content pack"}
            </button>
          </form>
          <p className={styles.formNote}>
            AI copy + a branded graphic layout. Review before use. No social
            account is connected.
          </p>
          <AgentStatus loading={agent.loading} error={agent.error} />
        </section>
        <section className={styles.graphicCard} aria-label="Graphic preview">
          <div className={styles.graphicHeader}>
            <strong>Graphic preview</strong>
            <div className={styles.segmentControl}>
              <button
                onClick={() => setPortrait(false)}
                className={!portrait ? styles.segmentActive : ""}
                aria-pressed={!portrait}
              >
                1:1
              </button>
              <button
                onClick={() => setPortrait(true)}
                className={portrait ? styles.segmentActive : ""}
                aria-pressed={portrait}
              >
                4:5
              </button>
            </div>
          </div>
          {graphic ? (
            <Image
              className={styles.draftGraphic}
              width={480}
              height={portrait ? 600 : 480}
              unoptimized
              src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(graphic)}`}
              alt={`Draft branded graphic: ${agent.result!.headline}`}
            />
          ) : (
            <div className={styles.graphicPlaceholder}>
              <Palette size={34} />
              <h3>Something worth sharing.</h3>
              <p>Your AI copy and brand layout will appear here.</p>
              <span>{merchant.name}</span>
            </div>
          )}
          {agent.result && (
            <a
              className={styles.secondaryButton}
              href={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(graphic!)}`}
              download={`${merchantId}-${portrait ? "portrait" : "square"}-concept.svg`}
            >
              <Download size={15} />
              Download graphic
            </a>
          )}
        </section>
      </div>
      {agent.result && (
        <section
          className={styles.contentOutput}
          aria-label="Generated content pack"
        >
          <div className={styles.sectionHeader}>
            <div>
              <span className={styles.eyebrow}>Prepared by Steward</span>
              <h2>Your content pack</h2>
            </div>
            <span className={styles.draftBadge}>
              {approved ? "Approved in preview" : "Draft for review"}
            </span>
          </div>
          <div className={styles.contentColumns}>
            <div>
              <h3>Social caption</h3>
              <p className={styles.caption}>{agent.result.caption}</p>
              <p className={styles.ctaText}>{agent.result.callToAction}</p>
              <button
                className={styles.smallButton}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(agent.result!.caption);
                    setCopied("Copied");
                  } catch {
                    setCopied("Select the caption to copy");
                  }
                }}
              >
                <Copy size={14} />
                {copied || "Copy caption"}
              </button>
            </div>
            <div>
              <h3>Short-video script</h3>
              {agent.result.sections.map((section, index) => (
                <div className={styles.scriptBeat} key={section.title}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <strong>{section.title}</strong>
                    <p>{section.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className={styles.outputActions}>
            <button
              className={styles.primaryButton}
              onClick={() => setApproved(true)}
              disabled={approved}
            >
              <Check size={16} />
              {approved ? "Approved in this preview" : "Approve in preview"}
            </button>
            <a
              className={styles.secondaryButton}
              href={`data:text/plain;charset=utf-8,${encodeURIComponent(PreviewExport.contentPack(agent.result!, merchant))}`}
              download={`${merchantId}-content-pack.txt`}
            >
              <Download size={15} />
              Download copy & script
            </a>
            <small>
              {approved
                ? "Only marked approved in this browser. Nothing was published."
                : "Check facts, language and brand fit before approving."}
            </small>
          </div>
          <div className={styles.sourceRow}>
            <span>
              <Sparkles size={12} /> Live AI · sample data
            </span>
            {agent.result.sources.map((source) => (
              <span key={source}>
                <Check size={12} />
                {source}
              </span>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
