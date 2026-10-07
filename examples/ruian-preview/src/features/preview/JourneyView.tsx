"use client";
import { useState } from "react";
import { Check, Heart, Sparkles, UserRound } from "lucide-react";
import { PreviewCatalog, type MerchantId } from "@/domain/PreviewCatalog";
import { useAgent } from "./UseAgent";
import { AgentPanel, AgentStatus } from "./AgentPanel";
import { MerchantSelector } from "./MerchantSelector";
import styles from "./Preview.module.css";

export function JourneyView({ available }: { available: boolean }) {
  const [merchantId, setMerchant] = useState<MerchantId>("juniper");
  const [goal, setGoal] = useState(
    "A helpful follow-up after a first visit, followed by a relevant return invitation.",
  );
  const [consent, setConsent] = useState(false);
  const [approved, setApproved] = useState(false);
  const agent = useAgent();
  const merchant = PreviewCatalog.merchant(merchantId);
  return (
    <>
      <div className={styles.intro}>
        <span className={styles.eyebrow}>02 / Customer journeys</span>
        <h1>
          A first visit.
          <br />
          The start of a relationship<span>.</span>
        </h1>
        <p>
          Make the next message helpful, timely and welcome.
          <br className={styles.desktopBreak} /> Build a sample journey with
          consent at its heart.
        </p>
      </div>
      <div className={styles.workspaceGrid}>
        <section className={styles.editorCard}>
          <div className={styles.cardHeading}>
            <Heart size={19} />
            <h2>Give them a reason to return</h2>
          </div>
          <MerchantSelector
            id="journey-merchant"
            value={merchantId}
            onChange={(value) => {
              setMerchant(value);
              agent.reset();
              setApproved(false);
            }}
          />
          <div className={styles.field}>
            <label htmlFor="journey-goal">Journey goal</label>
            <select
              id="journey-goal"
              value={goal}
              onChange={(event) => {
                setGoal(event.target.value);
                agent.reset();
                setApproved(false);
              }}
            >
              <option>
                A helpful follow-up after a first visit, followed by a relevant
                return invitation.
              </option>
              <option>
                Invite an interested customer to the merchant’s sample community
                event.
              </option>
              <option>
                Offer practical post-visit support before suggesting another
                visit.
              </option>
            </select>
          </div>
          <div className={styles.consentBox}>
            <label>
              <input
                type="checkbox"
                checked={consent}
                onChange={(event) => {
                  setConsent(event.target.checked);
                  agent.reset();
                  setApproved(false);
                }}
              />
              <span>
                The sample customer has opted in to this merchant’s messages.
              </span>
            </label>
            <small>
              This toggles fictional consent only. No real person is enrolled.
            </small>
          </div>
          <button
            className={styles.primaryButton}
            disabled={!available || agent.loading || !consent}
            onClick={() => {
              setApproved(false);
              void agent.run({
                mode: "journey",
                merchantId,
                consent,
                prompt: `Create a three-step draft journey for fictional customer Alex, who visited once and is interested in useful workday breaks and thoughtful everyday items. Goal: ${goal} Include sensible timing and an opt-out.`,
              });
            }}
          >
            <Sparkles size={16} />
            {agent.loading ? "Drafting the journey…" : "Draft customer journey"}
          </button>
          <AgentStatus loading={agent.loading} error={agent.error} />
        </section>
        <aside className={styles.profileCard}>
          <span className={styles.eyebrow}>A fictional customer</span>
          <div className={styles.customerAvatar}>
            <UserRound size={31} />
          </div>
          <h2>Meet Alex</h2>
          <p>
            One visit. A few everyday interests.
            <br />A relationship that deserves care.
          </p>
          <div className={styles.profileTags}>
            <span>Workday breaks</span>
            <span>Thoughtful finds</span>
            <span>First visit</span>
          </div>
          <div className={styles.profileDetail}>
            <strong>Membership context</strong>
            <p>{merchant.membership}</p>
          </div>
          <div className={styles.consentState}>
            <span className={consent ? styles.greenDot : styles.grayDot} />
            {consent ? "Sample opt-in recorded" : "Waiting for sample opt-in"}
          </div>
        </aside>
      </div>
      {agent.result && (
        <AgentPanel result={agent.result}>
          <div className={styles.journeySteps}>
            {agent.result.sections.map((section, index) => (
              <article key={section.title}>
                <span className={styles.stepNumber}>
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className={styles.draftBadge}>Message draft</span>
                <h4>{section.title}</h4>
                <p>{section.body}</p>
              </article>
            ))}
          </div>
          <div className={styles.outputActions}>
            <button
              className={styles.primaryButton}
              disabled={approved || !consent}
              onClick={() => setApproved(true)}
            >
              <Check size={16} />
              {approved ? "Approved in preview" : "Approve sample journey"}
            </button>
            <small>
              {approved
                ? "Marked approved in this browser. No message has been sent."
                : "Merchant review comes before any real campaign."}
            </small>
          </div>
        </AgentPanel>
      )}
    </>
  );
}
